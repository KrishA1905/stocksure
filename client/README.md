# StockSure client

React 19 + Vite + Tailwind 4 frontend (Person 3). It talks to the backend in `../server`.

```bash
npm install
npm run dev      # http://localhost:5173  (backend must be running on :5000)
npm run build
```

* `/api` is proxied to `http://localhost:5000` (see `vite.config.js`). To point somewhere else, set `VITE_BACKEND_URL` in `client/.env`.
* **Auth:** an httpOnly session cookie set by the backend. No tokens are kept in localStorage. The CSRF token lives in memory only (`src/lib/api.js`).
* **Data:** `src/lib/store.jsx` loads data from the API for the logged-in role, maps it into the shapes the pages use, and refetches after every change. Stock, due dates and renewal rules all come from the server.
