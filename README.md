# ASBK — Time vs Billing

Reconcile **MyHours** tracked time against **Xero** invoiced amounts, per client, per month.

Stack: Next.js 15 (App Router), TypeScript, Tailwind v4, Prisma + SQLite.

## Quick start

```bash
# 1. Install
npm install

# 2. Copy env template and fill it in
cp .env.example .env.local
# Then edit .env.local — see below for how to get each credential.

# 3. Create the SQLite DB
npm run db:push

# 4. Run dev server
npm run dev
# → http://localhost:3000
```

## Getting credentials

### MyHours API key

1. Sign in at https://app.myhours.com
2. Profile menu → **Integrations** → **API** → generate a personal access token
3. Paste it into `.env.local` as `MYHOURS_API_KEY`

### Xero developer app

1. Sign in at https://developer.xero.com → **My Apps** → **New app**
2. Name: `ASBK Time Reconciliation`
3. Integration type: **Web app**
4. Company URL: anything (e.g. your site)
5. Redirect URI: `http://localhost:3000/api/xero/callback` (add prod URL later)
6. After creation, copy **Client ID** and generate a **Client secret**
7. Paste both into `.env.local`

Scopes requested:
`offline_access accounting.transactions.read accounting.contacts.read`

### APP_SECRET

Used to sign the OAuth `state` parameter. Generate one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Flow

1. **Connect Xero** on the dashboard. You'll be redirected to Xero, authorise the org, and bounced back. Tokens are stored in SQLite and refreshed automatically.
2. **Reconcile** page: pick a month. Pulls MyHours logs for the period and Xero invoices dated in the period, joins them via the **Client mappings** table, displays:
   - Hours tracked, billable hours
   - Hourly rate × billable hours = **Implied $**
   - Sum of ACCREC invoices (ex tax) = **Invoiced $**
   - Variance = Invoiced − Implied
   - Status: `Matched` / `Unmapped` / `No time` / `No invoice`
3. **Client mappings**: link MyHours client IDs to Xero contact IDs and (optionally) override the per-client hourly rate.

## Notes / known gaps

- **No app-level auth yet.** Anyone who can reach the URL can see everything. Either run on `localhost` only or put a reverse proxy / Cloudflare Access / basic auth in front before exposing it.
- **MyHours endpoint paths in `src/lib/myhours.ts` are best-effort.** Confirm against the live API the first time you run with a real key — likely 1–2 lines to adjust.
- **Picker UI for mappings is missing.** For MVP you paste IDs manually. Next step: fetch lists from both APIs and turn the form into two select boxes.
- **Single Xero organisation** assumed. The callback picks the first tenant returned. Add a selector if you have multiple orgs.

## Project layout

```
src/
  app/
    page.tsx                    — dashboard / connection status
    reconcile/page.tsx          — month picker + comparison table
    mappings/page.tsx           — link MyHours client ↔ Xero contact
    mappings/actions.ts         — server actions (upsert / delete)
    api/xero/connect/route.ts   — start OAuth
    api/xero/callback/route.ts  — exchange code, store tokens
    api/xero/disconnect/route.ts
    layout.tsx, globals.css
  lib/
    db.ts          — Prisma singleton
    xero.ts        — OAuth + Accounting API
    myhours.ts     — MyHours API client
    reconcile.ts   — join logic
    state.ts       — signed OAuth state (CSRF)
prisma/schema.prisma
```
