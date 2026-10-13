# StockSure API Contract

Base URL: `http://localhost:5000/api` (frontend: `VITE_API_URL`)

Status legend: ✅ implemented (Person 1) · 🟡 guards and validation are wired, but the handler returns **501** until Person 2 implements it.

---

## 0. Conventions

### Response envelope (every endpoint)

```json
{ "success": true,  "message": "Human readable message", "data": { } }
{ "success": false, "message": "Human readable error",   "data": null }
```

Only **422** responses add one more field, `errors`:

```json
{ "success": false, "message": "Validation failed", "data": null,
  "errors": [ { "field": "body.lines.0.quantity", "message": "Quantity must be greater than 0" } ] }
```

Paginated lists return `data: { items: [...], pagination: { page, pageSize, total, totalPages } }`.
Query params: `page` (default 1) and `pageSize` (default 20, max 100).

### Status codes

| Code | Meaning |
|------|---------|
| 200 / 201 | OK / Created |
| 400 | Malformed JSON |
| 401 | Not logged in, or the session expired. The frontend should go to the login page |
| 403 | Logged in but not allowed, **or a missing/invalid CSRF token** |
| 404 | Not found. This includes another student's record, so record IDs cannot be probed |
| 409 | Conflicts with the current state (insufficient stock, asset already issued, duplicate code/tag) |
| 413 | Body larger than 100 kB |
| 422 | Validation failed (see `errors`) |
| 429 | Too many login attempts |
| 500 | Generic server error. No internal details are included |
| 501 | Endpoint not implemented yet (Person 2 placeholder) |

### Auth and CSRF (applies to every request)

* Cookie session `stocksure.sid` (httpOnly, SameSite=Lax, Secure in production). The frontend must send **credentials** with every request.
* Every `POST`, `PUT`, `PATCH` and `DELETE` must send the header `X-CSRF-Token: <token>`.
  Get the token from `GET /api/csrf-token`, or from `data.csrfToken` in the login response. **The token changes at login.**
* IDs are positive integers. Unknown body fields are **rejected with 422** (strict schemas). Never send `role`, `userId`, `issuedBy`, `dueDate` or similar fields; the server derives them.
* All dates are ISO-8601 UTC strings.

---

## 1. Infrastructure

### ✅ `GET /api/health`
Public. Returns `200 { data: { database: "up" } }`, or `503` if the database is down.

### ✅ `GET /api/csrf-token`
Public. Returns `200 { data: { csrfToken: "64-hex" } }`. This call creates the (anonymous) session if none exists.

---

## 2. Auth

### ✅ `POST /api/auth/login`
* Auth: none. CSRF: **required** (fetch `/csrf-token` first).
* Body: `{ "email": "student1@stocksure.local", "password": "Student@123" }`
* 200:
```json
{ "success": true, "message": "Login successful",
  "data": { "id": 2, "email": "student1@stocksure.local", "role": "STUDENT",
            "student": { "id": 1, "name": "Student One", "enrollmentNo": "DFIS2026-001", "programme": "M.Sc. DFIS", "semester": 1 },
            "csrfToken": "<NEW token - use it from now on>" } }
```
  `student` is present only for STUDENT users.
* Errors: `401 "Invalid email or password"` (the same message for an unknown email, a wrong password or an inactive account), `422`, `429` (rate limited: 20 failed attempts per 15 minutes per IP), `403` (CSRF).
* Security: the session ID is regenerated (prevents session fixation), the CSRF token is rotated, passwords are checked with bcrypt, and LOGIN_SUCCESS / LOGIN_FAILURE are written to the audit log.

### ✅ `POST /api/auth/logout`
* CSRF required. Idempotent. 200 `data: null`. Destroys the server session, clears the cookie and logs LOGOUT.

### ✅ `GET /api/auth/me`
* Auth: any logged-in user. 200 `data: { id, email, role, student? }`. 401 if not logged in.
* Use it at app start-up to restore the auth state.

---

## 3. Students & Locations (Person 1)

### ✅ `GET /api/students/me`
Role: STUDENT. Returns the student's own profile `{ id, name, enrollmentNo, programme, semester, contactDetails, user: { id, email, active } }`.

### ✅ `GET /api/students?search=&page=&pageSize=`
Role: COORDINATOR. Paginated list for the issue-form student picker. `search` matches name, enrollment number or email.

### ✅ `GET /api/students/:id`
Role: COORDINATOR.

### ✅ `POST /api/students`
Role: COORDINATOR. Registers a student and creates a User with role STUDENT.
Body: `{ email, password (8+ chars with upper, lower and a digit), name, enrollmentNo, programme, semester (1-12), contactDetails? }`
Errors: `409` (duplicate email or enrollment number), `422`.

### ✅ `PATCH /api/students/:id`
Role: COORDINATOR. Body: any of `{ name, programme, semester, contactDetails }`.

### ✅ `GET /api/locations`
Any logged-in user. Array of `{ id, department, laboratory, room, storageUnit }`.

### ✅ `POST /api/locations`
Role: COORDINATOR. Body: `{ department, laboratory, room, storageUnit }`. `409` if the location already exists.

---

## 4. Inventory (Person 2)

### 🟡 `GET /api/inventory`
Any logged-in user. Query: `search, category, trackingMode (INDIVIDUAL|QUANTITY), active (true|false), available (true|false), locationId, page, pageSize`.
Expected item shape:
```json
{ "id": 1, "itemCode": "DB-DEV", "name": "Development Board", "category": "Electronics",
  "trackingMode": "INDIVIDUAL", "totalQuantity": 10, "availableQuantity": 10, "active": true,
  "location": { "id": 1, "laboratory": "Development Lab", "room": "Lab-01", "storageUnit": "Equipment Cupboard A" } }
```

### 🟡 `GET /api/inventory/:id`
Any logged-in user. The item plus its assets (if INDIVIDUAL).

### 🟡 `POST /api/inventory`
Role: COORDINATOR.
Body: `{ itemCode, name, category, trackingMode, totalQuantity? (QUANTITY only), description?, makeModel?, locationId? }`
Returns 201. `409` on a duplicate `itemCode`. Audit: `ITEM_CREATED`.

### 🟡 `PATCH /api/inventory/:id`
Role: COORDINATOR. Body: any of `{ name, category, description, makeModel, locationId, active }`.
`trackingMode` and quantities cannot be changed here.

### 🟡 `POST /api/inventory/:id/adjust`
Role: COORDINATOR. Body: `{ quantityDelta: int != 0, reason: string }`.
Records a StockMovement. `409` if the stock would go negative. Audit: `STOCK_ADJUSTED`.

## 5. Assets (Person 2)

### 🟡 `GET /api/assets`
Role: COORDINATOR. Query: `itemId, conditionStatus, available, active, locationId, search, page, pageSize`.
An asset is **available** when it is `USABLE`, active and not issued.
Shape: `{ id, assetTag, serialNumber, item: {id,name,itemCode}, location, conditionStatus, isIssued, active, available }`

### 🟡 `POST /api/assets`
Role: COORDINATOR. Body: `{ itemId, assetTag, serialNumber?, locationId?, conditionStatus? }`.
The item must be INDIVIDUAL. `409` on a duplicate tag.

### 🟡 `PATCH /api/assets/:id`
Role: COORDINATOR. Body: any of `{ serialNumber, locationId, conditionStatus, active, reason }`.
Changing the condition back to USABLE is the explicit coordinator **restore** step. Audit: `ASSET_STATUS_CHANGED`.

## 6. Issues (Person 2)

### 🟡 `POST /api/issues`
Role: COORDINATOR.
```json
{ "studentId": 1,
  "lines": [ { "itemId": 1, "assetId": 3 },
             { "itemId": 2, "quantity": 2 } ] }
```
* The server sets `issueDate = now`, `dueDate = issueDate + 15 days` and `issuedBy = session user`.
* 201 returns the issue with `lines`, `issueDate` and `dueDate`. **The UI displays this due date; it does not calculate its own.**
* `404`: the student or item does not exist. `409`: insufficient stock, or the asset is not available or already issued. `422`: validation errors (quantity ≤ 0, quantity > 1 for an asset, a client-supplied dueDate, duplicate assets).
* The whole issue is atomic: if any line fails, no stock changes.

### 🟡 `GET /api/issues`
Role: COORDINATOR. Query: `studentId, status (ACTIVE|PARTIALLY_RETURNED|RETURNED), overdue (true|false), page, pageSize`.
Expected shape:
```json
{ "id": 1, "issueDate": "...", "dueDate": "...", "status": "ACTIVE",
  "isOverdue": false, "overdueDays": 0,
  "student": { "id": 1, "name": "Student One", "enrollmentNo": "DFIS2026-001" },
  "lines": [ { "id": 1, "item": { "id": 1, "name": "Development Board" }, "asset": { "assetTag": "DB-003" },
               "quantity": 1, "returnedQuantity": 0, "outstandingQuantity": 1 } ] }
```

### 🟡 `GET /api/issues/mine`
Role: STUDENT. The student's own issues only, in the same shape as above.

### 🟡 `GET /api/issues/:id`
Coordinators can read any issue. Students can read only their own; another student's issue returns **404**.

## 7. Returns (Person 2)

### 🟡 `POST /api/returns`
Role: COORDINATOR.
```json
{ "issueLineId": 5, "quantity": 1, "conditionStatus": "USABLE", "remarks": "OK" }
```
* Partial returns are allowed. `quantity` must be ≤ the outstanding quantity, otherwise the server returns `409`.
* `receivedBy` is the session user and `returnDate` is now.
* Stock or the asset becomes available again only when the returned condition is `USABLE`. DAMAGED, LOST and MAINTENANCE items stay unavailable until a coordinator restores them.
* 201 returns `{ return, issueLine: { quantity, returnedQuantity, outstandingQuantity }, issueStatus }`. Audit: `RETURN_CREATED`.

## 8. Renewals (Person 2)

### 🟡 `POST /api/renewals`
Role: STUDENT. Body: `{ issueId, remarks? }`.
* The student can renew only their own active issue. Anyone else's issue returns 404. A renewal that is already PENDING returns 409.
* Creates `{ status: "PENDING", oldDueDate: <current due date>, newDueDate: null }`. **The issue's due date does not change.**

### 🟡 `GET /api/renewals`
Coordinators see all renewals; students see only their own. Query: `status, page, pageSize`.
Shape: `{ id, status, requestedAt, oldDueDate, newDueDate, remarks, issue: { id, dueDate, student, lines } }`

### 🟡 `PATCH /api/renewals/:id`
Role: COORDINATOR. Body: `{ "status": "APPROVED" | "REJECTED", "remarks"? }`.
* Works only while the renewal is PENDING, otherwise the server returns `409`.
* APPROVED: `issue.dueDate = existing dueDate + 15 days`, and `renewal.newDueDate`, `approvedBy` and `approvedAt` are set.
* REJECTED: the due date stays unchanged.
* Audit: `RENEWAL_APPROVED` / `RENEWAL_REJECTED`.

## 9. Dashboard (Person 2)

### 🟡 `GET /api/dashboard`
Coordinator:
```json
{ "totals": { "items": 2, "totalUnits": 30, "availableUnits": 30, "issuedUnits": 0,
              "overdueIssues": 0, "pendingRenewals": 0, "unavailableAssets": 0, "activeStudents": 2 },
  "byCategory": [ { "category": "Electronics", "total": 10, "available": 10 } ],
  "assetStatus": [ { "status": "USABLE", "count": 10 } ],
  "overdue": [ { "issueId": 1, "student": "...", "item": "...", "outstandingQuantity": 1, "dueDate": "...", "overdueDays": 3 } ] }
```
Student: `{ activeBorrowings, overdueCount, pendingRenewals, nextDueDate }`, covering their own data only.

## 10. Audit

### ✅ `GET /api/audit`
Role: COORDINATOR. Query: `action, entityType, entityId, userId, page, pageSize (≤100)`.
Each item: `{ id, action, entityType, entityId, metadata, ipAddress, userAgent, createdAt, user: { id, email, role } | null }`.
The audit log is append-only. **There are no POST, PATCH or DELETE endpoints.**

Actions: `LOGIN_SUCCESS, LOGIN_FAILURE, LOGOUT, ISSUE_CREATED, RETURN_CREATED, RENEWAL_REQUESTED, RENEWAL_APPROVED, RENEWAL_REJECTED, STOCK_ADJUSTED, ASSET_STATUS_CHANGED, ITEM_CREATED, ITEM_UPDATED, ASSET_CREATED, ASSET_UPDATED`.
