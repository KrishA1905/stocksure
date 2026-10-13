# StockSure

A system for managing a department's inventory and the items students borrow (hackathon project).

```
stocksure/
├── client/   React 19 + Vite + Tailwind frontend   (Person 3)
└── server/   Express + Prisma + MySQL API           (Person 1: auth/security/infra, Person 2: business logic)
```

| Doc | Purpose |
|-----|---------|
| [server/API_CONTRACT.md](server/API_CONTRACT.md) | Every endpoint, with request and response shapes |
| [server/BACKEND_GUIDE.md](server/BACKEND_GUIDE.md) | Session and CSRF flow, the transaction pattern, and the security design |
| [server/SECURITY_REVIEW.md](server/SECURITY_REVIEW.md) | Security findings and the review of Person 2's code |

## What you need

* **Node.js 20+** (tested on 24)
* **MySQL 8** running on `localhost:3306`

## First-time setup

```bash
# 1. Backend
cd server
npm install
cp .env.example .env          # edit DATABASE_URL, DATABASE_URL_TEST, SESSION_SECRET
npx prisma migrate dev        # creates tables + loads demo data
cd ..

# 2. Frontend
cd client
npm install
cd ..
```

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Run it (two terminals)

| Terminal | Command | URL |
|----------|---------|-----|
| 1: backend | `cd server && npm run dev` | http://localhost:5000/api/health |
| 2: frontend | `cd client && npm run dev` | **http://localhost:5173** ← open this |

The frontend dev server proxies `/api` to the backend, so the session cookie and CSRF token work with no extra setup. Use `localhost`, not `127.0.0.1`.

## Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Coordinator | coordinator@stocksure.local | C0rdin4t0r#5879 |
| Student 1 | student1@stocksure.local | Student@123 |
| Student 2 | student2@stocksure.local | Student@123 |

## Demo flow

1. Log in as the **coordinator**. Go to **Issues & Returns**, then **New issue**: give Student One board `DB-003` and 2 USB cables. The due date is today + 15 days, set by the server.
2. Open **Inventory**: boards show 9 available and cables 18.
3. Try issuing 100 cables. The server refuses with `Insufficient stock…`.
4. Log out, then log in as **student1**. Open **My Items** and request a renewal. The due date doesn't change.
5. Log in as the **coordinator** again. Go to **Renewals** and approve it. The due date moves 15 days later.
6. In **Issues & Returns**, return 1 of the 2 cables. The cables show 1 / 2 outstanding (a partial return).

## Useful commands (in `server/`)

| Command | What it does |
|---------|--------------|
| `npm test` | 70 backend tests. It resets and uses the **separate test DB** (`DATABASE_URL_TEST`), so your demo data is never touched |
| `npx prisma db seed` | Re-loads demo data (safe to repeat) |
| `npm run db:reset` | Wipes the dev DB and re-seeds it to a clean demo state |
| `npx prisma studio` | Browse the database |

Build the frontend for production: `cd client && npm run build`.
