# Team Update: StockSure Is Integrated

Copy and paste this into the team chat:

```text
StockSure is fully integrated: backend (Person 1) + business logic (Person 2) + frontend (Person 3).

Pull main, then:
  cd server && npm install && cp .env.example .env   (edit DATABASE_URL, DATABASE_URL_TEST, SESSION_SECRET)
  npx prisma migrate dev
  npm run dev                      -> http://localhost:5000/api/health
  cd ../client && npm install && npm run dev   -> open http://localhost:5173

What changed while merging:
- Person 2's logic was ported into the shared backend (CommonJS, shared schema, real session auth).
  It keeps the FOR UPDATE row locking, the unavailableQuantity model, purpose, create-item-with-assets,
  the dashboard fields and the overdue report.
  Fixed: per-item stock summing (stock could go negative), the broken lockItems query, wrong table
  names, the 403 leak on renewals.
  Added: GET /issues, /issues/:id, /issues/overdue, GET /renewals, the /assets endpoints,
  PATCH /inventory/:id, stock adjust/restore, a max of 2 renewals per issue, separate decision remarks.
- Frontend: the mock store was replaced by a real API store (client/src/lib/store.jsx), the CSRF and
  error handling were fixed, and the Vite proxy now points to :5000. The pages and design are unchanged.
- Overdue uses calendar days in Asia/Kolkata.
- npm test (70 tests) runs on a SEPARATE test database and never touches demo data.

Demo accounts:
  Coordinator: coordinator@stocksure.local / C0rdin4t0r#5879
  Student 1:   student1@stocksure.local / Student@123
  Student 2:   student2@stocksure.local / Student@123

Demo flow: see README.md -> "Demo flow".
```
