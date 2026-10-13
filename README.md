# StockSure

Department Inventory and Student Item Issue Management System (hackathon project).

```
stocksure/
├── client/   React + Vite frontend (Person 3)
└── server/   Express + Prisma + MySQL API (Person 1: foundation and security, Person 2: business logic)
```

| Doc | Purpose |
|-----|---------|
| [server/API_CONTRACT.md](server/API_CONTRACT.md) | Every endpoint, with request and response shapes |
| [server/BACKEND_GUIDE.md](server/BACKEND_GUIDE.md) | Setup, CSRF and session flow for the frontend, and the transaction pattern for Person 2 |
| [server/SECURITY_REVIEW.md](server/SECURITY_REVIEW.md) | Security findings and checklists |
| [HANDOFF.md](HANDOFF.md) | Message to send to the team |

## Quick start

```bash
cd server && npm install && cp .env.example .env   # edit DATABASE_URL + SESSION_SECRET
npx prisma migrate dev && npx prisma db seed
npm run dev        # http://localhost:5000/api
npm test
```

Frontend: `cd client && cp .env.example .env` (`VITE_API_URL=http://localhost:5000/api`), then run `npm run dev` (http://localhost:5173).

Demo accounts: `coordinator@stocksure.local / C0rdin4t0r#5879`, `student1@stocksure.local / Student@123`, `student2@stocksure.local / Student@123`.
