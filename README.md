# StockSure

Our department lends out lab equipment (dev boards, cables, adapters) on a shared spreadsheet and a lot of hope. Things go missing, nobody remembers who has board #7, and "I'll return it next week" turns into a month.

StockSure is our hackathon fix for that. A coordinator issues items to students, the system works out the due date, students can ask for more time, and everyone can see who has what. It started in a 3-hour hackathon, so it's small, but the important rules are handled on the server, not just in the UI.

## What it does

- **Two kinds of stock.** Some things are tracked one by one (dev board `DB-003` is a specific board with a serial number). Others are just counted (we have 20 USB cables, 18 on the shelf).
- **Issuing.** A coordinator picks a student and an item. The due date is always 15 days after the issue date, and the server sets it. You can't issue more than what's on the shelf, and the same board can't go to two people at once, even if two coordinators click at the same moment.
- **Returns.** These can be partial: borrow 2 cables, bring back 1. Whoever receives the item records its condition. A damaged board stays out of circulation until someone marks it as fixed.
- **Renewals.** A student can ask for more time before the due date. Asking changes nothing; only a coordinator's approval does, and that adds 15 days to the *existing* due date. A loan can be renewed at most twice.
- **Overdue tracking.** Overdue is worked out by calendar date (IST), so an item due today isn't overdue until tomorrow.
- **Audit log.** Every issue, return, renewal and login attempt is recorded, along with who did it and when.

## How it's built

```
stocksure/
├── client/   React frontend
└── server/   Express API + MySQL
```

**Frontend.** React 19 with Vite, styled with Tailwind and a few shadcn/ui components. During development, Vite forwards `/api` calls to the backend, so the browser treats it all as one site and the login cookie just works.

**Backend.** Node + Express, with Prisma talking to MySQL.
- Login uses a session cookie (httpOnly; no tokens sitting in localStorage), plus a CSRF token for anything that changes data.
- Passwords are hashed with bcrypt.
- Every request is checked with Zod before it touches the database.
- Anything that moves stock or due dates runs inside a database transaction with row locks. If one part fails, nothing changes.

**API.** Plain REST + JSON. Every response looks like `{ success, message, data }`. All the endpoints are written up in [server/API_CONTRACT.md](server/API_CONTRACT.md).

## Running it locally

You'll need **Node.js 20+** and **MySQL 8** running on `localhost:3306`.

### First time only

```bash
cd server
npm install
cp .env.example .env
```

Open `server/.env` and fill in:
- `DATABASE_URL`: your MySQL connection string
- `DATABASE_URL_TEST`: a *different* database name. The tests wipe it on every run, so don't point it at real data.
- `SESSION_SECRET`: any long random string. This makes one:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```

Then create the tables and load the demo data:

```bash
npx prisma migrate dev
```

And install the frontend:

```bash
cd ../client
npm install
```

### Every time

Two terminals:

```bash
# terminal 1
cd server
npm run dev
```

```bash
# terminal 2
cd client
npm run dev
```

Open **http://localhost:5173**. Use `localhost`, not `127.0.0.1`, or the login cookie won't stick.

## Logging in

These accounts come from the seed data:

| Who | Email | Password |
|---|---|---|
| Coordinator | coordinator@stocksure.local | C0rdin4t0r#5879 |
| Student One | student1@stocksure.local | Student@123 |
| Student Two | student2@stocksure.local | Student@123 |

## A 2-minute demo

This is the order we use when showing it to someone:

1. Log in as the coordinator and go to **Issues & Returns → New issue**. Give Student One board `DB-003`, then give them 2 USB cables. The slip shows a due date 15 days out.
2. Check **Inventory**: 9 boards and 18 cables left.
3. Try issuing 100 cables. The app refuses and says how many are actually available.
4. Log out, then log in as Student One. Under **My Items**, request a renewal on the board. The due date stays the same, and the request shows as pending.
5. Log back in as the coordinator and approve it under **Renewals**. The board's due date jumps 15 days.
6. Return 1 of the 2 cables. The cables now show 1 / 2 outstanding.

## Handy commands

Run these inside `server/`:

- `npm test`: runs the 70 backend tests against the test database
- `npm run db:reset`: wipes everything back to fresh demo data (useful right before a demo)
- `npx prisma db seed`: re-adds the demo data without wiping anything
- `npx prisma studio`: browse the tables in your browser

To build the frontend for production: `cd client && npm run build`.

## Things that tripped us up

- **Login works, then you get logged out right away.** You're probably on `127.0.0.1:5173` instead of `localhost:5173`.
- **"Port 5173 is already in use".** Another Vite app is running. Close it, or set `VITE_PORT` in `client/.env`. If you change the port, add the new address to `CLIENT_ORIGIN` in `server/.env` too.
- **Database errors on startup.** MySQL isn't running, or `DATABASE_URL` is wrong. `http://localhost:5000/api/health` tells you whether the API can reach the database.
- **"EPERM … query_engine" when running Prisma commands.** Stop `npm run dev` first. The running server locks Prisma's engine file on Windows.

## More docs

- [server/API_CONTRACT.md](server/API_CONTRACT.md): every endpoint, with example requests and responses
- [server/BACKEND_GUIDE.md](server/BACKEND_GUIDE.md): how login and CSRF work, and the transaction pattern for new features
- [server/SECURITY_REVIEW.md](server/SECURITY_REVIEW.md): what we checked, what we found, and what we fixed

## Team

Built by three of us at the coders' event:
- **Backend & security:** login, permissions, database, audit log
- **Business logic:** stock, issues, returns, renewals, overdue
- **Frontend:** the whole UI
