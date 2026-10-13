# Person 1 Handoff Message

Copy and paste this into the team chat:

```text
Person 1 backend foundation is ready.

Completed:
- Prisma/MySQL schema and migration (server/prisma)
- Idempotent seed/demo data (10 dev boards DB-001..DB-010, 20 USB cables, 2 students, 1 coordinator)
- Authentication (login/logout/me), secure cookie sessions stored in MySQL, session-fixation protection
- RBAC: requireAuth / requireRole / requireCoordinator / requireStudent, plus a student ownership helper
- Zod validation (strict schemas for login, student, inventory, asset, issue, return, renewal)
- CSRF (X-CSRF-Token header)
- Helmet, strict CORS, 100 kB body limit, central error handler, login rate limit
- Append-only audit log plus GET /api/audit (coordinator)
- Transaction utilities: runInTransaction, calculateDueDate (+15 days), calculateRenewedDueDate, createAuditLog
- Extra endpoints: /api/students (+ /me), /api/locations, /api/health, /api/csrf-token
- 34 passing tests (npm test)
- Docs: server/API_CONTRACT.md, server/BACKEND_GUIDE.md, server/SECURITY_REVIEW.md

Person 2:
Route files for inventory, assets, issues, returns, renewals and dashboard already have the final auth,
RBAC and validation middleware. Replace only the notImplemented(...) handler (each currently returns 501).
Use the shared utilities (require('../utils'), require('../middleware')). Do not create duplicate
auth or session logic. Use runInTransaction plus a conditional updateMany for every stock or due-date
change, and call createAuditLog(..., tx). BACKEND_GUIDE.md section 3 has a full createIssue example.

Person 3:
Use API_CONTRACT.md. Auth is cookie-based; do not store any token in localStorage.
Use withCredentials: true. Before any POST/PATCH, GET /api/csrf-token and send it in the X-CSRF-Token header.
The token rotates at login: take data.csrfToken from the login response.
BACKEND_GUIDE.md section 2 has a drop-in axios client with CSRF handling and error mapping.
Endpoints marked 🟡 return 501 until Person 2 is done, so mock them meanwhile using the shapes in the contract.

Demo accounts:
Coordinator: coordinator@stocksure.local / C0rdin4t0r#5879
Student:     student1@stocksure.local / Student@123
Student 2:   student2@stocksure.local / Student@123

Before the final demo, Person 1 will run the security and integration review (SECURITY_REVIEW.md section B).
```
