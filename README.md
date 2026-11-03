# BorrowBox - Student-to-Student Borrowing Platform

BorrowBox helps students share useful items for temporary borrowing. Students can browse listings, post items, and submit requests; owners handle requests and return confirmations, while administrators monitor activity.

## Project information

- **Course:** Integrated Programming
- **Institution:** University of San Carlos (Talamban Campus)
- **Group:** Final Project Group 2
- **Repository:** https://github.com/Hubrisdog/IP-Project-BorrowBox-Group2
- **Group members:** Al Phillippe Abrenzosa Garado, Desiree Anne Villaruel Godinez, Jay Niño Clark Bongo Basilgo, Maverick Moses Loon Alier, Sirach Ethan Malazarte Nemenzo

## Features

- Student registration and login with hashed passwords.
- Browse and search available listings, post an item, and send borrowing requests.
- Listings include a scheduled start and return date/time.
- Account settings for changing the current password.
- Listing owners can accept or reject requests for their items.
- Borrowers can report a return; the listing owner confirms receipt before the item is marked available again.
- The read-only administrator dashboard monitors pending requests, active loans, returns awaiting confirmation, and fully returned items with borrower, owner, item, schedule, and timestamps.
- Administrators cannot post listings; any legacy administrator-owned listings and their requests are removed during startup.
- Borrowers can connect Google Calendar; when an owner accepts a request, BorrowBox adds the scheduled borrowing period to the borrower's calendar.
- MySQL database and tables created automatically when the server starts.
- Startup ensures the database contains at least five listings, adding starter entries if needed.

## Technology

- Frontend: HTML5, CSS3, and vanilla JavaScript
- Server: Node.js and Express
- Database: MySQL through XAMPP
- Authentication: Express sessions and bcrypt password hashes
- Third-party integration: Google Calendar API using Google OAuth 2.0

## Run locally

1. Install Node.js and XAMPP.
2. Open XAMPP Control Panel and start **MySQL**. Apache is not required for BorrowBox.
3. From the project folder, install dependencies once:
   ```bash
   npm install
   ```
4. To enable borrowing requests and Google Calendar, copy `.env.example` to `.env`, then set the Google OAuth values described below. Browsing and posting listings work without Calendar credentials, but borrowers cannot request items until the integration is configured and their Google account is connected.
5. Start BorrowBox:
   ```bash
   npm start
   ```
6. Visit `http://localhost:3000`. Do not open the HTML files directly; login, borrowing activity, and other features require the running server. On startup, the app creates `borrowbox_db`, its tables, the initial admin and sample accounts, and any starter listings needed to reach five items. If the three named starter listings exist and there are no requests yet, it adds sample pending, active, and returned requests to demonstrate owner/borrower actions and the admin activity view. Existing user listings and requests are preserved.

The server will not start if it cannot connect to MySQL. Check that MySQL is running in XAMPP, then review `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` if your setup differs from the defaults (`localhost:3306`, `root`, no password, `borrowbox_db`).

## Initial administrator

- **Email:** `admin@borrowbox.local`
- **Password:** `Admin123!`

Sign in and change this password from **Account settings**. The admin account is read-only for listings and borrowing requests. To configure credentials before the first database initialization, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`. A password already stored in the database is not overwritten on later starts.

### Sample accounts

The starter data includes a sample lender and borrower so you can try the two-sided return workflow:

- **Sample lender:** `sample.lender@borrowbox.local` / `BorrowBoxDemo123!`
- **Sample borrower:** `sample.borrower@borrowbox.local` / `BorrowBoxDemo123!`

These are local demonstration accounts, not production credentials. You can change their values in `.env` before the first database initialization. Existing sample account passwords are not overwritten on restart.

## Database tables

- `users` — borrower and administrator accounts
- `item` — listings, owner, and availability status (the existing project table is preserved and upgraded)
- `borrow_requests` — borrower requests and their statuses

Sessions use Express's in-memory store, suitable for this local class project. For a public production deployment, configure a persistent session store and set `SESSION_SECRET` to a private, stable value.

## Google Calendar setup

Google Calendar requires OAuth credentials and each borrower must connect their own Google account in **Account settings**. When the listing owner accepts a request, BorrowBox adds the listing's scheduled start/return period to the borrower's primary Google Calendar. Listings created before scheduled date/time fields were added must be reposted with a date range before they can be accepted.

1. In [Google Cloud Console](https://console.cloud.google.com/), create/select a project and enable the **Google Calendar API**.
2. Configure the OAuth consent screen. While the app is in testing mode, add each account that will connect as a test user.
3. Create an OAuth client ID for a **Web application**. Add `http://localhost:3000/api/calendar/callback` as an authorized redirect URI.
4. Copy `.env.example` to `.env` from the project folder:
   ```powershell
   Copy-Item .env.example .env
   ```
5. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` in `.env` to the values from your OAuth client. The redirect URI must exactly match the URI registered with Google.
6. Generate both secrets in PowerShell:
   ```bash
   node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex')); console.log('TOKEN_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
   ```
   Copy the printed `SESSION_SECRET` and `TOKEN_ENCRYPTION_KEY` values into the matching entries in `.env`. Keep both secrets private. Do not change `TOKEN_ENCRYPTION_KEY` after borrowers connect their calendars; losing it requires borrowers to reconnect.

The app requests permission to add and manage events in the connected user's primary calendar. Google credentials and encryption keys are server-side only; do not commit `.env`.
