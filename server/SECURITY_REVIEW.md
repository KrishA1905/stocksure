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
- [ ] Only registered **and active** students can receive items
- [ ] A student calling `POST /api/issues` gets 403 (guard already wired)
- [ ] `availableQuantity >= qty` is checked with a conditional `updateMany` and `.count`
- [ ] An INDIVIDUAL asset is claimed with `isIssued: false` in the WHERE clause; a second issue gets 409
- [ ] `dueDate = calculateDueDate(issueDate)`, with nothing from the client
- [ ] `runInTransaction` is used; a failure on line 2 leaves line 1's stock unchanged
- [ ] `ISSUE_CREATED` is audited inside the transaction

### Return
- [ ] The issue line exists and has outstanding quantity
- [ ] `quantity <= quantity - returnedQuantity`, otherwise 409
- [ ] Partial return updates `returnedQuantity` and the issue status
- [ ] Condition is recorded; non-USABLE returns do **not** restore availability
- [ ] Transaction is used and `RETURN_CREATED` is audited

### Renewal
- [ ] A student can request a renewal only for an own issue that is not yet returned (others get 404)
- [ ] The request does **not** change `issue.dueDate`
- [ ] Only a coordinator can approve, and only a PENDING renewal (no double approval)
- [ ] Approval sets `dueDate = old dueDate + 15 days` exactly
- [ ] Rejection leaves `dueDate` unchanged
- [ ] Transaction is used; audit records REQUESTED, APPROVED and REJECTED

### General
- [ ] No `role`, `userId` or `studentId` taken from the client for authorization
- [ ] `/issues/mine`, `GET /renewals` and `GET /dashboard` are filtered by `req.user.studentId` for students
- [ ] No `$queryRawUnsafe` or `$executeRawUnsafe` with user input
- [ ] No stock writes outside `runInTransaction`
- [ ] Responses never include `passwordHash`

## C. Findings from the Person 2 review

| Finding | Severity | Fix | Status |
|---------|----------|-----|--------|
| _(fill in after merge)_ | | | |

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
| 9 | Student isolation (profile) | ✅ test. Issues and renewals are pending Person 2 |
| 10 | Inventory retrieval | ⏳ Person 2 |
| 11-22 | Issue, stock, due date, renewal, return, overdue, rollback, conflicts | ⏳ Person 2 (due-date and rollback utilities are tested ✅) |
| 19 | Audit logs exist | ✅ test |
| 20 | Failed transaction rolls back (utility level) | ✅ test |
| 23 | CSRF protection | ✅ test |
| 24 | Invalid input rejected | ✅ test |
| 25 | No sensitive info exposed | ✅ test |
