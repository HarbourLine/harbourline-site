from flask import Flask, render_template, request, send_file, jsonify
import pandas as pd
import unicodedata
from pathlib import Path
import os
import shutil
import zipfile
from io import BytesIO
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
app.config['UPLOAD_FOLDER'] = Path('uploads')
app.config['OUTPUT_FOLDER'] = Path('outputs')

# Create directories
app.config['UPLOAD_FOLDER'].mkdir(exist_ok=True)
app.config['OUTPUT_FOLDER'].mkdir(exist_ok=True)

# -------------------------------------------------------
# CSV Processing Logic (from your original code)
# -------------------------------------------------------

def norm_text(s: str) -> str:
    """Normalise text for reliable exact matching."""
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return ""
    s = str(s)
    s = unicodedata.normalize("NFKC", s)
    s = s.strip()
    s = " ".join(s.split())
    return s

def norm_username(s: str) -> str:
    """Normalise TikTok usernames for matching."""
    return norm_text(s).lower()

def pick_column(df: pd.DataFrame, candidates: list[str]) -> str:
    """Pick the first exact column that exists (case-insensitive)."""
    cols = {c.lower(): c for c in df.columns}
    for cand in candidates:
        if cand.lower() in cols:
            return cols[cand.lower()]
    return ""

def pick_column_contains(df: pd.DataFrame, tokens: list[str]) -> str:
    """Pick a column whose name contains any token (case-insensitive)."""
    for col in df.columns:
        c = col.lower()
        if any(t.lower() in c for t in tokens):
            return col
    return ""

def last6(s: str) -> str:
    s = norm_text(s)
    return s[-6:] if s else ""

def build_outputs_for_company(payments_path: Path, recipients: pd.DataFrame, tiktok: pd.DataFrame, out_dir: Path):
    company = "Ltd" if payments_path.name.lower().startswith("ltd") else "Inc"
    payments = pd.read_csv(payments_path, dtype=str, keep_default_na=False)

    # --- Payments columns
    pay_user_col = pick_column(payments, ["TikTok Username"]) or pick_column_contains(payments, ["tiktok", "username", "handle"])
    pay_currency_col = pick_column(payments, ["Booking Currency"]) or pick_column_contains(payments, ["booking currency", "currency"])
    pay_amount_col = pick_column(payments, ["Creator Revenue"]) or pick_column_contains(payments, ["creator revenue", "revenue", "amount", "net"])
    pay_record_id_col = pick_column(payments, ["Record ID"]) or pick_column_contains(payments, ["record id", "record"])

    if not pay_user_col:
        raise ValueError(f"{payments_path.name}: Can't find TikTok Username column. Columns: {list(payments.columns)}")
    if not pay_currency_col:
        raise ValueError(f"{payments_path.name}: Can't find Booking Currency column. Columns: {list(payments.columns)}")
    if not pay_amount_col:
        raise ValueError(f"{payments_path.name}: Can't find Creator Revenue/amount column. Columns: {list(payments.columns)}")
    if not pay_record_id_col:
        raise ValueError(f"{payments_path.name}: Can't find Record ID column. Columns: {list(payments.columns)}")

    payments["__user_norm"] = payments[pay_user_col].map(norm_username)
    payments["__currency"] = payments[pay_currency_col].map(norm_text).str.upper()
    payments["__amount_raw"] = payments[pay_amount_col].map(norm_text)
    payments["__record_id"] = payments[pay_record_id_col].map(norm_text)
    payments["__payment_reference"] = payments["__record_id"].map(last6)

    # --- TikTokker info key columns
    tiktok_user_col = pick_column(tiktok, ["Creator Username"]) or pick_column_contains(tiktok, ["creator username", "username", "handle"])
    tiktok_bankname_col = (
        pick_column(tiktok, ["Full Name as on Bank Account", "Bank Name"])
        or pick_column_contains(tiktok, ["bank", "account name", "payee"])
    )
    tiktok_fullname_col = pick_column(tiktok, ["Full Name"]) or pick_column_contains(tiktok, ["full name"])

    if not tiktok_user_col:
        raise ValueError("TikTokker info HQ-Payments View.csv: Can't find 'Creator Username' column.")
    if not tiktok_bankname_col:
        raise ValueError("TikTokker info HQ-Payments View.csv: Can't find 'Full Name as on Bank Account' (or similar) column.")
    if not tiktok_fullname_col:
        raise ValueError("TikTokker info HQ-Payments View.csv: Can't find 'Full Name' column for fallback.")

    tiktok["__user_norm"] = tiktok[tiktok_user_col].map(norm_username)

    # Prefer bank-name, fallback to full-name if bank-name is blank
    tiktok["__bankname_norm"] = tiktok[tiktok_bankname_col].map(norm_text)
    tiktok["__fullname_norm"] = tiktok[tiktok_fullname_col].map(norm_text)

    tiktok["__canonical_name_norm"] = tiktok["__bankname_norm"]
    tiktok.loc[tiktok["__canonical_name_norm"] == "", "__canonical_name_norm"] = tiktok["__fullname_norm"]

    # Map TikTok username -> canonical name (bank name preferred)
    tiktok_map = (
        tiktok.sort_values(by="__canonical_name_norm", ascending=False)
        .drop_duplicates(subset="__user_norm", keep="first")
        .set_index("__user_norm")["__canonical_name_norm"]
        .to_dict()
    )

    payments["__canonical_payee_name"] = payments["__user_norm"].map(tiktok_map).fillna("")
    payments["__canonical_norm"] = payments["__canonical_payee_name"].map(norm_text)

    # --- Recipients match (exact, after normalisation)
    rec_name_col = pick_column(recipients, ["name"])
    if not rec_name_col:
        raise ValueError("All-recipients.csv: Can't find 'name' column.")

    recipients["__name_norm"] = recipients[rec_name_col].map(norm_text)
    rec_lookup = {n: i for i, n in enumerate(recipients["__name_norm"].tolist()) if n}

    payments["__rec_index"] = payments["__canonical_norm"].map(rec_lookup)

    missing_in_tiktokker = payments[payments["__canonical_payee_name"] == ""].copy()
    matched = payments[payments["__rec_index"].notna()].copy()
    unmatched = payments[payments["__rec_index"].isna()].copy()

    def reason(row):
        if not row["__canonical_payee_name"]:
            return "Username not found in TikTokker info (no canonical name after fallback)."
        return "Canonical name found, but no exact match in All-recipients.name."

    unmatched["Reason"] = unmatched.apply(reason, axis=1)

    # --- Save audit files
    results = {
        'company': company,
        'matched_count': len(matched),
        'unmatched_count': len(unmatched),
        'missing_count': len(missing_in_tiktokker),
        'files': []
    }

    matched_audit_path = out_dir / f"{company}_Matched_Audit.csv"
    unmatched_path = out_dir / f"{company}_Unmatched.csv"
    missing_tiktokker_path = out_dir / f"{company}_MissingInTikTokker.csv"

    matched.to_csv(matched_audit_path, index=False)
    unmatched.to_csv(unmatched_path, index=False)
    missing_in_tiktokker.to_csv(missing_tiktokker_path, index=False)

    results['files'].extend([
        matched_audit_path.name,
        unmatched_path.name,
        missing_tiktokker_path.name
    ])

    # --- Build Wise uploads per currency
    outputs = []
    wise_cols = [c for c in recipients.columns if not c.startswith("__")]

    for _, row in matched.iterrows():
        rec_i = int(row["__rec_index"])
        rec_row = recipients.iloc[rec_i].copy()

        currency = row["__currency"]
        amount = row["__amount_raw"]
        payment_ref = row["__payment_reference"]

        rec_row["sourceCurrency"] = currency
        rec_row["amountCurrency"] = "source"
        rec_row["amount"] = amount
        rec_row["paymentReference"] = payment_ref

        outputs.append((currency, rec_row))

    if outputs:
        currencies = sorted({c for c, _ in outputs})
        for cur in currencies:
            rows = [r for c, r in outputs if c == cur]
            out_df = pd.DataFrame(rows)[wise_cols]

            out_file = out_dir / f"{company}_Wise_{cur}.csv"
            out_df.to_csv(out_file, index=False)
            results['files'].append(out_file.name)

    return results

def process_files(recipients_file, tiktok_file, ltd_file=None, inc_file=None):
    """Process uploaded CSV files and generate outputs."""
    upload_dir = app.config['UPLOAD_FOLDER']
    output_dir = app.config['OUTPUT_FOLDER']

    # Clear previous outputs
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(exist_ok=True)

    # Save uploaded files
    recipients_path = upload_dir / 'All-recipients.csv'
    tiktok_path = upload_dir / 'TikTokker-info.csv'

    recipients_file.save(recipients_path)
    tiktok_file.save(tiktok_path)

    # Load main CSVs
    recipients = pd.read_csv(recipients_path, dtype=str, keep_default_na=False)
    tiktok = pd.read_csv(tiktok_path, dtype=str, keep_default_na=False)

    results = []

    # Process Ltd payments if provided
    if ltd_file:
        ltd_path = upload_dir / 'LtdPayments.csv'
        ltd_file.save(ltd_path)
        result = build_outputs_for_company(ltd_path, recipients.copy(), tiktok.copy(), output_dir)
        results.append(result)

    # Process Inc payments if provided
    if inc_file:
        inc_path = upload_dir / 'IncPayments.csv'
        inc_file.save(inc_path)
        result = build_outputs_for_company(inc_path, recipients.copy(), tiktok.copy(), output_dir)
        results.append(result)

    return results

# -------------------------------------------------------
# Flask Routes
# -------------------------------------------------------

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/process', methods=['POST'])
def process():
    try:
        # Validate required files
        if 'recipients' not in request.files or 'tiktok' not in request.files:
            return jsonify({'error': 'Missing required files (All-recipients.csv and TikTokker info)'}), 400

        recipients_file = request.files['recipients']
        tiktok_file = request.files['tiktok']
        ltd_file = request.files.get('ltd')
        inc_file = request.files.get('inc')

        if not recipients_file.filename or not tiktok_file.filename:
            return jsonify({'error': 'Missing required files'}), 400

        if not ltd_file and not inc_file:
            return jsonify({'error': 'Please upload at least one payment file (Ltd or Inc)'}), 400

        # Process files
        results = process_files(recipients_file, tiktok_file, ltd_file, inc_file)

        return jsonify({
            'success': True,
            'results': results
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/download')
def download():
    """Create a zip file of all outputs and send it."""
    output_dir = app.config['OUTPUT_FOLDER']

    # Create zip in memory
    memory_file = BytesIO()
    with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
        for file_path in output_dir.glob('*.csv'):
            zf.write(file_path, file_path.name)

    memory_file.seek(0)

    return send_file(
        memory_file,
        mimetype='application/zip',
        as_attachment=True,
        download_name='wise_outputs.zip'
    )

if __name__ == '__main__':
    app.run(debug=True, port=5000)
