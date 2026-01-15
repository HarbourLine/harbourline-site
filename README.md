# Harbourline CSV to Wise Converter

A web application to convert CSV payment data into Wise-compatible upload formats.

## Features

- Upload CSV files through a clean web interface
- Process payments for Ltd and Inc companies
- Match TikTok usernames to recipients via bank account names
- Generate Wise upload CSVs per currency
- Download audit files for matched/unmatched records
- No more Google Colab needed!

## Requirements

- Python 3.8 or higher
- pip (Python package manager)

## Installation

1. **Clone or navigate to this directory**

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the application**
   ```bash
   python app.py
   ```

4. **Open your browser**
   Navigate to: `http://localhost:5000`

## Usage

### Required Files

1. **All-recipients.csv** - Your Wise recipients template (with `name` column)
2. **TikTokker info HQ-Payments View.csv** - Creator information with columns:
   - Creator Username
   - Full Name as on Bank Account (or Bank Name)
   - Full Name (fallback)

### Optional Files (at least one required)

3. **LtdPayments.csv** - Payment data for Ltd company with columns:
   - TikTok Username
   - Booking Currency
   - Creator Revenue
   - Record ID

4. **IncPayments.csv** - Payment data for Inc company (same format as Ltd)

### Steps

1. Open the app in your browser at `http://localhost:5000`
2. Upload all required CSV files
3. Upload at least one payment file (Ltd or Inc)
4. Click "Process Files"
5. Review the results summary
6. Click "Download All Files" to get a ZIP with all outputs

### Output Files

The app generates the following files:

#### Per Company (Ltd/Inc)
- `{Company}_Matched_Audit.csv` - All successfully matched payments
- `{Company}_Unmatched.csv` - Payments that couldn't be matched (with reasons)
- `{Company}_MissingInTikTokker.csv` - Usernames not found in TikTokker info
- `{Company}_Wise_{CURRENCY}.csv` - Wise upload files (one per currency)

## How It Works

1. **Username Matching**: Matches TikTok usernames from payment files to TikTokker info
2. **Name Resolution**: Uses "Full Name as on Bank Account" (or falls back to "Full Name")
3. **Recipient Lookup**: Finds exact matches in All-recipients.csv
4. **Currency Splitting**: Creates separate Wise uploads for each currency
5. **Payment Reference**: Uses last 6 characters of Record ID

## Troubleshooting

### Port Already in Use
If port 5000 is busy, edit `app.py` and change the port:
```python
app.run(debug=True, port=8000)  # Change to any available port
```

### Missing Columns Error
Ensure your CSV files have the expected column names. The app tries to find columns by:
- Exact match (case-insensitive)
- Partial match (contains keywords)

### File Upload Limit
Maximum file size is 16MB. For larger files, edit `app.py`:
```python
app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024  # 32MB
```

## Deployment

### Local Network Access
To access from other devices on your network:
```bash
python app.py
# Then use your computer's IP address: http://192.168.x.x:5000
```

### Production Deployment Options
- **PythonAnywhere**: Free tier available, great for simple apps
- **Heroku**: Easy deployment with git push
- **Railway**: Modern platform with free tier
- **DigitalOcean App Platform**: Simple and affordable
- **Your own server**: Use gunicorn with nginx

Example for production with gunicorn:
```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

## Security Notes

- This app is designed for internal/trusted use
- For production, consider adding:
  - Authentication (login system)
  - HTTPS/SSL encryption
  - File validation
  - Rate limiting
  - Session management

## Support

For issues or questions about the CSV processing logic, check the inline code comments in `app.py`.

## License

Internal use for Harbourline.
