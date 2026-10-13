# StockSure Backend Guide

Who it's for: **Person 2** (business logic) and **Person 3** (frontend).
Endpoint details are in [API_CONTRACT.md](API_CONTRACT.md).

## 1. Run it locally

```bash
cd server
npm install
cp .env.example .env          # then set DATABASE_URL + SESSION_SECRET
npx prisma generate
npx prisma migrate dev        # creates the DB + tables (also runs the seed)
npx prisma db seed            # safe to re-run
npm run dev                   # http://localhost:5000/api
npm test                      # 34 tests (needs migrated + seeded DB)
```

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Coordinator | coordinator@stocksure.local | C0rdin4t0r#5879 |
| Student 1 (DFIS2026-001) | student1@stocksure.local | Student@123 |
| Student 2 (DFIS2026-002) | student2@stocksure.local | Student@123 |

Seeded inventory:
* `DB-DEV` Development Board: INDIVIDUAL, 10 assets `DB-001`…`DB-010`, all USABLE.
* `USB-CABLE`: QUANTITY, 20 units.
* Location: DFIS / Development Lab / Lab-01 / Equipment Cupboard A.

---

## 2. For Person 3: authentication, sessions and CSRF

1. **There are no tokens in localStorage.** Auth is an httpOnly cookie that the browser handles automatically.
2. **Always send credentials:** use `withCredentials: true` (axios) or `credentials: 'include'` (fetch).
3. **CSRF:** every POST, PUT, PATCH and DELETE needs the header `X-CSRF-Token`.
   * On app start, call `GET /api/csrf-token` and keep `data.csrfToken` **in memory**. A JS variable or React state is fine; do not use localStorage.
   * After **login**, replace it with `data.csrfToken` from the login response, because the token rotates.
   * After **logout**, or on a `403` with message `Invalid or missing CSRF token`, re-fetch the token once and retry.
4. **App start-up:** call `GET /api/auth/me`. A `200` gives you the user and role, so route to the coordinator or student UI. A `401` means the user goes to the login page.
5. On a **401** from any call, clear the user state and redirect to login. The session may have expired; it lasts 2 hours of inactivity.

Drop-in client (`client/src/api/client.js`):

```javascript
import axios from 'axios';

let csrfToken = null;

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,   // http://localhost:5000/api
  withCredentials: true,
});

export async function refreshCsrf() {
  const { data } = await api.get('/csrf-token');
  csrfToken = data.data.csrfToken;
  return csrfToken;
}
export const setCsrfToken = (t) => { csrfToken = t; };

api.interceptors.request.use(async (config) => {
  const method = (config.method || 'get').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (!csrfToken) await refreshCsrf();
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res.data,                       // -> { success, message, data }
  async (error) => {
    const { response, config } = error;
    if (response?.status === 403 && response.data?.message === 'Invalid or missing CSRF token' && !config._retried) {
      config._retried = true;
      await refreshCsrf();
      return api(config);
    }
    // Normalised error for the UI: { status, message, errors? }
    return Promise.reject({
      status: response?.status ?? 0,
      message: response?.data?.message ?? 'Network error. Is the API running?',
      errors: response?.data?.errors,      // 422 only: [{ field, message }]
    });
  }
);

// auth.js
export const login = async (email, password) => {
  const res = await api.post('/auth/login', { email, password });
  setCsrfToken(res.data.csrfToken);        // token rotates on login
  return res.data;                          // { id, email, role, student? }
};
export const logout = async () => { await api.post('/auth/logout'); await refreshCsrf(); };
export const me = () => api.get('/auth/me').then((r) => r.data);
```

Map errors in the UI like this: 401 goes to the login page; 403 shows "You don't have permission"; 404 shows "Not found"; 409 shows `message` as a business error toast; 422 shows `errors[]` next to the form fields; 500 shows a generic error.

Role-based UI: the frontend can hide menus based on `user.role`. **The backend still enforces every check**, so a hidden button is cosmetic only.

---

## 3. For Person 2: how to plug in business logic

Route files `inventory`, `assets`, `issues`, `returns`, `renewals` and `dashboard` under `src/routes/` already have the **final auth, RBAC and validation middleware**. Replace only the `notImplemented(...)` handler with your service call. Put the services in `src/services/<name>.service.js`.

### Shared tools (do not duplicate)

```javascript
const {
  ApiError, asyncHandler, sendSuccess, sendCreated,
  calculateDueDate, calculateRenewedDueDate, daysOverdue, isOverdue,
  runInTransaction, paginate, getAuthenticatedUser, getStudentFromUser, createAuditLog,
} = require('../utils');
const { requireAuth, requireCoordinator, requireStudent, assertStudentOwnsOrCoordinator, validate } = require('../middleware');
const { AUDIT_ACTIONS, ENTITY_TYPES, LOAN_PERIOD_DAYS } = require('../config/constants');
const prisma = require('../config/prisma');
```

| Need | Use |
|------|-----|
| Current user | `req.user`, which is `{ id, email, role, studentId, student }` and is set by the guards |
| "My" student row | `req.user.studentId` or `await getStudentFromUser(req.user, tx)`. **Never** take it from the body or query |
| Validated body | `req.body` (already parsed: unknown keys rejected, numbers coerced) |
| Validated query | `req.validatedQuery` (not `req.query`) |
| Errors | `throw ApiError.conflict('USB Cable: only 18 available')` (also `.notFound()`, `.forbidden()`, `.badRequest()`) |
| Ownership | `assertStudentOwnsOrCoordinator(req.user, issue.studentId)`, which throws 404 |
| Due date | `calculateDueDate(issueDate)` and `calculateRenewedDueDate(issue.dueDate)` |
| Audit | `await createAuditLog({ action, entityType, entityId, metadata, req }, tx)` |

### Transaction pattern (required for issue, return, renewal and stock adjustment)

```javascript
router.post('/', requireCoordinator(), validate({ body: createIssueSchema }), asyncHandler(async (req, res) => {
  const issue = await issueService.createIssue(req.body, req);
  return sendCreated(res, issue, 'Items issued');
}));

// services/issue.service.js
async function createIssue({ studentId, lines }, req) {
  return runInTransaction(async (tx) => {
    // 1. read
    const student = await tx.student.findUnique({ where: { id: studentId }, include: { user: true } });
    if (!student || !student.user.active) throw ApiError.notFound('Student not found');

    const issueDate = new Date();
    const issue = await tx.issue.create({
      data: { studentId, issueDate, dueDate: calculateDueDate(issueDate), issuedById: req.user.id },
    });

    for (const line of lines) {
      const item = await tx.item.findUnique({ where: { id: line.itemId } });
      if (!item || !item.active) throw ApiError.notFound(`Item ${line.itemId} not found`);

      if (item.trackingMode === 'INDIVIDUAL') {
        if (!line.assetId) throw ApiError.validation('assetId is required for individually tracked items');
        // 2. claim the asset atomically: succeeds only if it is still free
        const claimed = await tx.asset.updateMany({
          where: { id: line.assetId, itemId: item.id, isIssued: false, active: true, conditionStatus: 'USABLE' },
          data: { isIssued: true },
        });
        if (claimed.count !== 1) throw ApiError.conflict(`Asset ${line.assetId} is not available`);
      } else if (line.assetId) {
        throw ApiError.validation('assetId is only for individually tracked items');
      }

      // 3. decrement stock atomically, never below zero
      const dec = await tx.item.updateMany({
        where: { id: item.id, availableQuantity: { gte: line.quantity } },
        data: { availableQuantity: { decrement: line.quantity } },
      });
      if (dec.count !== 1) throw ApiError.conflict(`${item.name}: not enough available stock`);

      await tx.issueLine.create({ data: { issueId: issue.id, itemId: item.id, assetId: line.assetId ?? null, quantity: line.quantity } });
      await tx.stockMovement.create({ data: { itemId: item.id, movementType: 'ISSUE', quantityDelta: -line.quantity, reason: `Issue #${issue.id}`, createdById: req.user.id } });
    }

    // 4. audit inside the same transaction
    await createAuditLog({ action: AUDIT_ACTIONS.ISSUE_CREATED, entityType: ENTITY_TYPES.ISSUE, entityId: issue.id, metadata: { studentId, lines }, req }, tx);
    return tx.issue.findUnique({ where: { id: issue.id }, include: { lines: true } });
  });
  // Any throw inside the callback rolls back everything: stock, asset claims, the issue row and the audit row.
}
```

### Rules

* **Always** use `tx`, never `prisma`, inside `runInTransaction`.
* Use conditional `updateMany` and check `.count`, rather than a read followed by a write. This prevents race conditions such as double-issuing an asset or going negative.
* `Item.availableQuantity` is the source of truth for "can be issued now":
  * Issue: `-qty`.
  * Return in `USABLE` condition: `+qty`, and set `asset.isIssued = false`.
  * Return as DAMAGED, LOST or MAINTENANCE: set `asset.isIssued = false` and `asset.conditionStatus = <condition>`, but do **not** increment. Increment only when a coordinator restores the asset to USABLE through `PATCH /api/assets/:id`.
* A renewal **request** must not touch `issue.dueDate`. **Approval**: `dueDate = calculateRenewedDueDate(issue.dueDate)`. Guard against a double approval with `updateMany({ where: { id, status: 'PENDING' } })` and a check of `.count`.
* Issue status: `RETURNED` when every line has `returnedQuantity === quantity`, `PARTIALLY_RETURNED` when only some have been returned, otherwise `ACTIVE`. **Overdue** is calculated, not stored: `status !== RETURNED && now > dueDate`.
* Deleting rows from Issue, IssueLine, ReturnRecord, Renewal, StockMovement or AuditLog is not supported. Foreign keys use `Restrict`. Deactivate records instead (`active = false`).
* Never `$queryRawUnsafe` with user input.

---

## 4. Security design summary

| Control | Implementation |
|---------|----------------|
| Passwords | bcrypt (bcryptjs, cost 10). The `passwordHash` field is never selected into responses |
| Sessions | express-session with a server-side store in MySQL (`sessions` table). The cookie is httpOnly, SameSite=Lax, Secure in production, with a rolling 120-minute expiry |
| Session fixation | `req.session.regenerate()` on login; `destroy()` on logout |
| Login enumeration | Generic 401 message, plus a dummy bcrypt compare for unknown emails |
| Brute force | `express-rate-limit`: 20 failed logins per 15 minutes per IP |
| AuthZ | `requireAuth`, `requireRole`, `requireCoordinator`, `requireStudent`. The user is re-read from the DB on every request, so deactivation takes effect immediately |
| Ownership | Identity comes from the session only; other students' records return 404 |
| CSRF | Synchronizer token in the session, sent in the `X-CSRF-Token` header and compared with `timingSafeEqual`. The token rotates at login |
| Validation | Zod `.strict()` schemas reject unknown fields such as `role`, `dueDate` or `issuedBy` (mass assignment) |
| Headers | Helmet (CSP, nosniff, frameguard, HSTS in prod), `x-powered-by` off |
| CORS | Allowlist from `CLIENT_ORIGIN`, credentials enabled, other origins get 403 |
| Body | 100 kB JSON limit, which returns 413 |
| Errors | Central handler. Prisma errors are mapped to 404, 409 or 422; in production, 500s carry no stack trace or SQL |
| Audit | Append-only `audit_logs` table with user, action, entity, IP, user agent and metadata. Coordinator-only, read-only API |
| Integrity | FKs use `onDelete: Restrict`; unique itemCode, assetTag, email and enrollmentNo; indexes on dueDate, studentId, itemId, assetId, renewal status and audit createdAt |

## 5. Local MySQL on this machine (Windows)

MySQL 8.4 is installed at `C:\Program Files\MySQL\MySQL Server 8.4`. Its data directory is `%USERPROFILE%\stocksure-mysql-data`. It is **not** a Windows service, so start it with:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe" --datadir="$env:USERPROFILE\stocksure-mysql-data" --port=3306 --bind-address=127.0.0.1 --console
```

The DB user is `stocksure`. Its password is in `server/.env` (`DATABASE_URL`), which is not committed. The root account uses the same password.
