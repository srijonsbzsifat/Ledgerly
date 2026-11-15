# Ledgerly

A simple, modern expense dashboard backed by a Google Sheet in the **Cash 2026**
format. Sign in with Google, connect your sheet, and see your balance, monthly
income vs expenses, category breakdowns — and add new entries from the dashboard.

- **No database, no analytics, no tracking.** Your data lives only in your own
  Google Sheet, accessed with your own Google account. Each signed-in visitor
  sees only their own sheet.
- **Themes:** light/dark mode plus emerald, indigo and amber accent themes,
  saved in your browser.

## Sheet format

A Google Sheet with monthly tabs named `January`–`December` (tabs may be empty
except the header; missing tabs and extra non-month tabs are tolerated). Each
tab's header row must be:

```
ID | Date | Type | Category | Description | Amount | Currency | Linked account | Link ID | Notes
```

- `Type` is `Debit` (expense) or `Credit` (income).
- `Date` is `YYYY-MM-DD`. New entries are appended to the tab for the month of
  their date, with a fresh UUID in `ID`.
- `Currency` is `BDT`.

## Setup

### 1. Create a Google Cloud project

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a
   project (or reuse an existing one).
2. Enable the **Google Sheets API** (APIs & Services → Library → search
   "Google Sheets API" → Enable).
3. Go to APIs & Services → **OAuth consent screen**, configure it (External user
   type is fine), and add the scope
   `https://www.googleapis.com/auth/spreadsheets` under "Scopes". Add yourself as a
   test user while the app is in Testing mode.
4. Go to APIs & Services → **Credentials** → Create Credentials → **OAuth
   client ID** → Application type **Web application**.
5. Add an **Authorized redirect URI**:
   - Local dev: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://<your-vercel-domain>/api/auth/callback/google`
6. Copy the **Client ID** and **Client Secret**.

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in:

```
GOOGLE_CLIENT_ID=…
GOOGLE_CLIENT_SECRET=…
NEXTAUTH_SECRET=…          # generate with: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000
```

Never commit real values — `.env*` files are gitignored.

### 3. Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000, sign in with Google, and paste your sheet link
(your Cash 2026 sheet ID is prefilled as a suggestion — paste a different link
to use another sheet).

### 4. Deploy to Vercel

1. Push this folder to a Git repository and import it in
   [Vercel](https://vercel.com/new).
2. Add the four environment variables above in the Vercel project settings
   (set `NEXTAUTH_URL` to your Vercel domain, e.g.
   `https://cash-dashboard.vercel.app`).
3. Add that domain's `/api/auth/callback/google` redirect URI to your Google
   OAuth client (step 1.5 above).
4. Deploy.

## How it works

- **Auth:** NextAuth (Google provider) with the `spreadsheets` scope and
  offline access, so a refresh token is issued and access tokens are refreshed
  automatically. Tokens live only in the encrypted server-side JWT — they are
  never sent to the browser.
- **Sheet picker:** the pasted URL/ID is validated against the Sheets API; on
  success it is remembered in an `httpOnly` cookie. Disconnect any time from
  the dashboard footer.
- **Data:** the dashboard reads all twelve monthly tabs via the Sheets REST
  API and computes everything client-side. Adding an entry appends a row in
  the exact column order above.

## Scripts

| Command         | What it does              |
| --------------- | ------------------------- |
| `npm run dev`   | Start the dev server      |
| `npm run build` | Production build          |
| `npm start`     | Serve the production build |
