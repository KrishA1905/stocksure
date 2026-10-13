# StockSure API Contract

Base URL: `http://localhost:5000/api` (frontend: `VITE_API_URL`)

Status: every endpoint is implemented. Auth, security and infrastructure are Person 1's; inventory, issue, return, renewal and dashboard logic is Person 2's.

**Aliases:** the backend also accepts the request field names from Person 2's samples: `items` for `lines`, `condition` for `conditionStatus`, `decision` for `status`, `tag` for `assetTag`, and `trackingMode: "ASSET"` for `INDIVIDUAL`. Responses always use the names in this document.

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

## 4. Inventory (Person 2 logic)

**Stock model.** For every item: `totalQuantity = availableQuantity + unavailableQuantity + outstandingQuantity`.
* `availableQuantity` counts units that can be issued now.
* `unavailableQuantity` counts units in stock that are DAMAGED, in MAINTENANCE or LOST, waiting for a coordinator to restore them.
* `outstandingQuantity` counts units out on loan.

For INDIVIDUAL items these counters are recomputed from the asset rows.

### ✅ `GET /api/inventory`
Any logged-in user. Query: `search, category, trackingMode (INDIVIDUAL|QUANTITY; ASSET accepted), active, available (true|false), locationId, page, pageSize`.
```json
{ "items": [
    { "id": 1, "itemCode": "DB-DEV", "name": "Development Board", "category": "Electronics",
      "trackingMode": "INDIVIDUAL", "totalQuantity": 10, "availableQuantity": 9,
      "unavailableQuantity": 0, "outstandingQuantity": 1, "availability": "IN_STOCK", "active": true,
      "location": { "id": 1, "laboratory": "Development Lab", "room": "Lab-01", "storageUnit": "Equipment Cupboard A" },
      "assets": [ { "id": 3, "assetTag": "DB-003", "conditionStatus": "USABLE", "isIssued": true,
                    "active": true, "available": false, "status": "ISSUED" } ] } ],
  "pagination": { "page": 1, "pageSize": 20, "total": 2, "totalPages": 1 },
  "categories": ["Accessories", "Electronics"] }
```
* `availability` is `IN_STOCK`, `LOW` (≤ 20% left), `OUT_OF_STOCK` or `INACTIVE`.
* `assets` is an empty array for QUANTITY items.

### ✅ `GET /api/inventory/:id`
Any logged-in user. Returns the item, all of its assets and the last 15 `stockMovements`.

### ✅ `POST /api/inventory`
Role: COORDINATOR.
```json
{ "name": "Ethernet Cable", "category": "Networking", "trackingMode": "QUANTITY", "totalQuantity": 10 }
{ "name": "Oscilloscope", "category": "Test Equipment", "trackingMode": "INDIVIDUAL",
  "assets": [ { "assetTag": "OSC-001" }, { "assetTag": "OSC-002", "conditionStatus": "DAMAGED" } ] }
```
* Optional fields: `itemCode` (auto-generated from the name if omitted), `description`, `makeModel`, `locationId`.
* Returns 201. Errors: `409` (duplicate code or tag), `422`. Audit: `ITEM_CREATED`.

### ✅ `PATCH /api/inventory/:id`
Role: COORDINATOR. Body: any of `{ name, category, description, makeModel, locationId, active }`.

### ✅ `POST /api/inventory/:id/adjust`
Role: COORDINATOR, QUANTITY items only. Body: `{ quantityDelta (≠ 0), reason, pool?: "AVAILABLE" | "UNAVAILABLE" }`.
* A positive delta is new stock.
* A negative delta is a write-off from `pool`. It returns `409` if there aren't enough units.
* Audit: `STOCK_ADJUSTED`.

### ✅ `POST /api/inventory/:id/restore`
Role: COORDINATOR, QUANTITY items only. Body: `{ quantity, reason }`. Moves repaired units from unavailable back to available.

## 5. Assets

### ✅ `GET /api/assets`
Role: COORDINATOR. Query: `itemId, conditionStatus, available, active, locationId, search, page, pageSize`.
* Each asset has `available`, `status` (AVAILABLE, ISSUED or UNAVAILABLE) and `holder`. `holder` is `{ issueId, issueLineId, dueDate, student }` while the asset is on loan, otherwise `null`.
* Issue-form asset picker: `GET /api/assets?itemId=1&available=true`.

### ✅ `POST /api/assets`
Role: COORDINATOR. Body: `{ itemId, assetTag, serialNumber?, locationId?, conditionStatus? }`. The item must be INDIVIDUAL. Returns `409` for a duplicate tag.

### ✅ `PATCH /api/assets/:id`
Role: COORDINATOR. Body: any of `{ serialNumber, locationId, conditionStatus, active, reason }`.
* Setting a DAMAGED, MAINTENANCE or LOST asset back to `USABLE` is the explicit **restore**.
* An asset on loan can't change condition or be deactivated (409).
* Audit: `ASSET_STATUS_CHANGED`.

## 6. Issues

### ✅ `POST /api/issues`
Role: COORDINATOR.
```json
{ "studentId": 1, "purpose": "Embedded lab practical",
  "lines": [ { "itemId": 1, "assetId": 3 }, { "itemId": 2, "quantity": 2 } ] }
```
* INDIVIDUAL lines need `assetId` with quantity 1; QUANTITY lines need `quantity` and no `assetId`. `purpose` is optional.
* The server sets `issueDate = now`, `dueDate = issueDate + 15 days` and `issuedBy = session user`.
* It is one transaction with row locks: if any line fails, nothing changes. Quantities for the same item are summed before the stock check.
* Errors:
  * `404`: unknown or inactive student, item or asset.
  * `409`: `Insufficient stock for "USB Cable": requested 21, available 18`, `Asset "DB-003" is already issued`, or asset not usable.
  * `422`: validation.

**Issue object** (returned by every issue endpoint):
```json
{ "id": 4, "issueDate": "...", "dueDate": "...", "issueCalendarDate": "2026-10-13", "dueCalendarDate": "2026-10-28",
  "purpose": "...", "status": "ACTIVE", "displayStatus": "ACTIVE",
  "totalQuantity": 3, "outstandingQuantity": 3, "isOverdue": false, "overdueDays": 0, "daysUntilDue": 15,
  "canRequestRenewal": true, "pendingRenewal": null,
  "student": { "id": 1, "name": "Student One", "enrollmentNo": "DFIS2026-001" },
  "issuedBy": { "id": 1, "email": "coordinator@stocksure.local" },
  "lines": [ { "id": 7, "itemId": 1, "assetId": 3, "quantity": 1, "returnedQuantity": 0, "outstandingQuantity": 1,
               "itemName": "Development Board", "assetTag": "DB-003",
               "item": { "id": 1, "name": "Development Board", "trackingMode": "INDIVIDUAL" },
               "asset": { "id": 3, "assetTag": "DB-003" }, "returns": [] } ],
  "renewals": [ { "id": 1, "status": "APPROVED", "requestedAt": "...", "oldDueDate": "...", "newDueDate": "..." } ] }
```
* `status` is `ACTIVE`, `PARTIALLY_RETURNED` or `RETURNED`. `displayStatus` additionally shows `OVERDUE`.
* **Overdue** follows the calendar-day rule in `APP_TIMEZONE` (default Asia/Kolkata): an issue becomes overdue on the day after its due date.

### ✅ `GET /api/issues`
Role: COORDINATOR. Query: `studentId, status, overdue, search, page, pageSize`. Returns paginated issue objects.

### ✅ `GET /api/issues/overdue`
Role: COORDINATOR. One row per overdue line: `{ issueId, issueLineId, studentName, enrollmentNo, itemName, assetTag, outstanding, dueDate, dueCalendarDate, overdueDays, renewalStatus }`.

### ✅ `GET /api/issues/mine`
Role: STUDENT. An array of the student's own issue objects.

### ✅ `GET /api/issues/:id`
Coordinators can read any issue. Students can read only their own; any other issue returns 404.

## 7. Returns

### ✅ `POST /api/returns`
Role: COORDINATOR. Body: `{ "issueLineId": 7, "quantity": 1, "conditionStatus": "USABLE", "remarks": "OK" }`.
* Partial returns are allowed. A quantity above the outstanding amount returns `409`.
* **USABLE** units go back to available.
* **DAMAGED, MAINTENANCE or LOST:**
  * QUANTITY items: the units move to `unavailableQuantity`.
  * INDIVIDUAL items: the asset keeps that condition until a coordinator restores it.
* When everything has been returned, the issue becomes `RETURNED` and any pending renewal is closed.
* 201: `{ return, issueLine: { id, item, asset, quantity, returnedQuantity, outstandingQuantity }, issueId, issueStatus, student }`.

## 8. Renewals

### ✅ `POST /api/renewals`
Role: STUDENT. Body: `{ issueId, remarks? }`.
* Works only for the student's own issue; another student's issue returns 404.
* Returns `409` when nothing is outstanding, the issue is already overdue, or a renewal is already pending.
* Creates a PENDING renewal with `oldDueDate` set to the current due date. **The due date does not change.**

### ✅ `GET /api/renewals`
Coordinators see all renewals; students see only their own. Query: `status, page, pageSize`.
Renewal object: `{ id, status, requestedAt, remarks, oldDueDate, newDueDate, approvedAt, currentDueDate, currentDueCalendarDate, requestedBy, approvedBy, issue: { id, dueDate, status, purpose, student, lines } }`.

### ✅ `PATCH /api/renewals/:id`
Role: COORDINATOR. Body: `{ "status": "APPROVED" | "REJECTED", "remarks"? }`.
* Only a PENDING renewal can be decided; otherwise the server returns `409`.
* **APPROVED:** `dueDate = existing dueDate + 15 days`. **Show `newDueDate` from the response**; don't calculate it in the frontend.
* **REJECTED:** the due date is unchanged.

## 9. Dashboard

### ✅ `GET /api/dashboard`
**Coordinator:**
```json
{ "role": "COORDINATOR", "totalItemTypes": 2, "totalQuantity": 30, "availableQuantity": 27,
  "outstandingQuantity": 3, "unavailableQuantity": 0, "overdueIssues": 0, "pendingRenewals": 1,
  "activeStudents": 2, "unavailableAssets": 0, "overdueList": [],
  "byCategory": [ { "category": "Electronics", "total": 10, "available": 9, "issued": 1, "unavailable": 0 } ],
  "assetStatus": [ { "status": "USABLE", "count": 10 } ], "lowStock": [],
  "trend": [ { "date": "2026-09-30", "issued": 0, "returned": 0 } ],
  "recentActivity": [ { "action": "ISSUE_CREATED", "entityType": "ISSUE", "entityId": "4", "createdAt": "...", "user": { "email": "..." } } ] }
```

**Student** (their own data only): `{ role, myOutstanding, myOverdue, myTotalIssues, activeBorrowings, overdueCount, dueSoonCount, pendingRenewals, nextDueDate, openIssues }`.

## 10. Audit

### ✅ `GET /api/audit`
Role: COORDINATOR. Query: `action, entityType, entityId, userId, page, pageSize (≤100)`.
Each item: `{ id, action, entityType, entityId, metadata, ipAddress, userAgent, createdAt, user: { id, email, role } | null }`.
The audit log is append-only. **There are no POST, PATCH or DELETE endpoints.**

Actions: `LOGIN_SUCCESS, LOGIN_FAILURE, LOGOUT, ISSUE_CREATED, RETURN_CREATED, RENEWAL_REQUESTED, RENEWAL_APPROVED, RENEWAL_REJECTED, STOCK_ADJUSTED, ASSET_STATUS_CHANGED, ITEM_CREATED, ITEM_UPDATED, ASSET_CREATED, ASSET_UPDATED`.
