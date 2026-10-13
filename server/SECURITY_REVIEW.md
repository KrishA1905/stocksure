# StockSure Backend Security Review

Reviewer: Person 1. Covers Phase 13 (the review after Person 2's work) and Phase 14 (final verification).

## A. Foundation review (Person 1 code), done

| Finding | Severity | Fix | Status |
|---------|----------|-----|--------|
| Session fixation on login | High | `session.regenerate()` after successful auth; pre-login session ID verified to be unauthenticated (test) | Fixed |
| Account enumeration through login errors or timing | Medium | Same 401 message for every failure; dummy bcrypt compare for unknown emails | Fixed |
| Login brute force | Medium | Rate limit: 20 failed attempts per 15 minutes per IP (`LOGIN_RATE_LIMIT`) | Fixed |
| CSRF on cookie-authenticated mutations | High | Synchronizer token in the `X-CSRF-Token` header on every POST, PUT, PATCH and DELETE, including login; rotated at login | Fixed |
| Stale privileges after deactivation or a role change | Medium | `requireAuth` re-reads the user from the DB on every request and destroys the session if the user is inactive | Fixed |
| Mass assignment (`role`, `dueDate`, `issuedBy`, `isIssued` sent by the client) | High | All Zod schemas are `.strict()`; server-derived fields are absent from the schemas | Fixed |
| Cross-student data access | High | Identity comes only from the session; `assertStudentOwnsOrCoordinator` returns 404 | Fixed (foundation) |
| Destructive cascades deleting history | High | Every FK uses `onDelete: Restrict` | Fixed |
| Leaking stack traces, SQL or `passwordHash` | Medium | Central error handler; `SAFE_USER_SELECT`; generic 500s in production | Fixed |
| Over-permissive CORS with credentials | Medium | Explicit origin allowlist; unknown origins get 403 | Fixed |
| Large-body DoS | Low | 100 kB JSON limit, which returns 413 | Fixed |
| Session store table outside Prisma could cause migrate drift or a reset | Low | `Session` model managed by Prisma | Fixed |
| Double-issue race on the same asset | High | `Asset.isIssued` combined with a conditional `updateMany` pattern documented for Person 2 | Pattern provided; verify in B |
| `bcrypt` native build failures on Windows / Node 24 | Low | Used `bcryptjs` (same algorithm and hash format) | Accepted |

## B. Person 2 code review checklist (run after merge)

Mark each row ✅, ❌ or N/A, and add any findings to table C.

### Issue
- [x] Only registered **and active** students can receive items
- [x] A student calling `POST /api/issues` gets 403 (guard already wired)
- [x] `availableQuantity >= qty` is checked with a conditional `updateMany` and `.count`
- [x] An INDIVIDUAL asset is claimed with `isIssued: false` in the WHERE clause; a second issue gets 409
- [x] `dueDate = calculateDueDate(issueDate)`, with nothing from the client
- [x] `runInTransaction` is used; a failure on line 2 leaves line 1's stock unchanged
- [x] `ISSUE_CREATED` is audited inside the transaction

### Return
- [x] The issue line exists and has outstanding quantity
- [x] `quantity <= quantity - returnedQuantity`, otherwise 409
- [x] Partial return updates `returnedQuantity` and the issue status
- [x] Condition is recorded; non-USABLE returns do **not** restore availability
- [x] Transaction is used and `RETURN_CREATED` is audited

### Renewal
- [x] A student can request a renewal only for an own issue that is not yet returned (others get 404)
- [x] The request does **not** change `issue.dueDate`
- [x] Only a coordinator can approve, and only a PENDING renewal (no double approval)
- [x] Approval sets `dueDate = old dueDate + 15 days` exactly
- [x] Rejection leaves `dueDate` unchanged
- [x] Transaction is used; audit records REQUESTED, APPROVED and REJECTED

### General
- [x] No `role`, `userId` or `studentId` taken from the client for authorization
- [x] `/issues/mine`, `GET /renewals` and `GET /dashboard` are filtered by `req.user.studentId` for students
- [x] No `$queryRawUnsafe` or `$executeRawUnsafe` with user input
- [x] No stock writes outside `runInTransaction`
- [x] Responses never include `passwordHash`

## C. Findings from the Person 2 review

| Finding | Severity | Fix | Status |
|---------|----------|-----|--------|
| P2 draft compared each line to stock separately, so two lines for the same item (15 + 15 cables when 20 were available) could push stock negative | High | Requested quantities are summed per item before the check, and the decrement is a guarded `updateMany` | Fixed (test) |
| P2 `lockItems` ran a malformed extra `$queryRaw` before locking | Medium | Rewrote the locking helper (`stock.helpers.lockRows`): whitelisted table names, parameterised ids, ascending order (deadlock-safe) | Fixed |
| P2 raw SQL used the table names `Item` and `Asset`, which don't exist in the shared schema (`items`, `assets`) | High | Table map in `TABLES` | Fixed |
| P2 used fake header auth (`x-dev-user-id`) | Critical | Removed; all routes use the session-based `requireAuth` / `requireCoordinator` / `requireStudent` | Fixed |
| P2 renewal on another student's issue returned 403, revealing that the id exists | Low | Returns 404 for both "missing" and "not yours" | Fixed (test) |
| P2 marked damaged assets "unavailable" but could not restore them | Medium | Coordinator restore: `PATCH /assets/:id` (USABLE) and `POST /inventory/:id/restore` | Fixed (test) |
| A student account without a profile would see **every** issue on the dashboard (`where: { studentId: undefined }`) | High | Explicit guard returns 403 | Fixed |
| Asset on loan could be marked LOST or deactivated directly, corrupting stock | Medium | Returns 409; record a return first | Fixed (test) |
| Overdue was evaluated by timestamp, not calendar day | Low | Calendar-day rule in `APP_TIMEZONE` (Asia/Kolkata) | Fixed (test) |
| Concurrent issue of the same asset | High | `SELECT … FOR UPDATE` row locks plus a guarded claim; the race test gives exactly one 201 and one 409 | Verified (test) |
| Frontend: errors read from the wrong field, wrong CSRF URL, `user.id` used as the student id | Medium | Rewrote `client/src/lib/api.js`, `auth.jsx` and `store.jsx` against the contract | Fixed (browser-tested) |

## D. Final verification (Phase 14)

| # | Check | Result |
|---|-------|--------|
| 1 | Database connects (`/api/health`) | ✅ |
| 2 | Migrations work | ✅ |
| 3 | Seed works and is idempotent | ✅ |
| 4 | Coordinator login | ✅ test |
| 5 | Student login | ✅ test |
| 6 | Logout | ✅ test |
| 7 | /me | ✅ test |
| 8 | RBAC | ✅ test |
| 9 | Student isolation (profile, issues, renewals, dashboard) | ✅ test |
| 10 | Inventory retrieval | ✅ test + browser |
| 11-22 | Issue, stock, due date, renewal, return, overdue, rollback, conflicts | ✅ test (business.test.js) + browser demo flow |
| 19 | Audit logs exist | ✅ test |
| 20 | Failed transaction rolls back (utility level) | ✅ test |
| 23 | CSRF protection | ✅ test |
| 24 | Invalid input rejected | ✅ test |
| 25 | No sensitive info exposed | ✅ test |
