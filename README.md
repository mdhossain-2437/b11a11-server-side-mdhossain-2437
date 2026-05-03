# VelocityDrive · Server

Express + MongoDB REST API powering the **VelocityDrive** car-rental platform.
Handles authentication (JWT in HTTP-only cookies), the cars CRUD, bookings with
automatic price calculation, and a seedable demo fleet.

> Companion frontend: `b11a11-client-side-mdhossain-2437`

---

## ✨ Features

- 🔐 **JWT auth** issued in an HTTP-only cookie (`/jwt`, `/logout`)
- 🚘 **Cars CRUD** — `GET /cars`, `GET /cars/:id`, `POST /cars`, `PATCH /cars/:id`, `DELETE /cars/:id`
- 🔍 **Search & sort** — search cars by `model`, `brand`, or `location`; sort by price or post date
- 📅 **Bookings** — `POST /bookings`, `GET /my-bookings`, `PATCH /bookings/:id` (modify or cancel)
- 💰 **Automatic price calculation** — `days × dailyPrice` computed on the server
- 🛡️ **Owner-scoped writes** — users can only modify cars/bookings they own
- ❤️ **Health endpoint** — `/health` with Mongo ping for deployment monitoring
- 🌱 **Seed endpoint** — gated `/seed` route for demo data
- 🪵 **Tiny request logger** — readable logs without an extra dependency
- 🧱 **Strict CORS** — comma-separated `CORS_ORIGINS` plus `*.vercel.app` opt-in for previews

---

## 🧰 Tech Stack

| Layer    | Tools |
|----------|-------|
| Runtime  | Node.js ≥ 18, Express 5 |
| Database | MongoDB Atlas (driver v7) |
| Auth     | jsonwebtoken, cookie-parser, HTTP-only cookies |
| Config   | dotenv, environment variables only |
| Misc     | cors, crypto for dev-only secret fallback |

---

## 🚀 Getting Started

```bash
git clone https://github.com/mdhossain-2437/b11a11-server-side-mdhossain-2437.git
cd b11a11-server-side-mdhossain-2437
npm install
cp .env.example .env       # then fill the values
npm run dev                # node --watch index.js
```

Visit <http://localhost:5000/health>.

### Environment variables

| Key                   | Required | Description |
|-----------------------|----------|-------------|
| `PORT`                | no       | Defaults to `5000` |
| `NODE_ENV`            | no       | `development` (default) or `production` |
| `CORS_ORIGINS`        | yes      | Comma-separated list of allowed origins. Use the literal string `*.vercel.app` to allow any Vercel preview |
| `MONGO_URI`           | yes      | MongoDB Atlas connection string |
| `ACCESS_TOKEN_SECRET` | yes      | Long random string used to sign JWTs |
| `SEED_KEY`            | optional | When set, `POST /seed?key=<SEED_KEY>` repopulates the demo fleet |

> **Never commit your `.env`.** A `.env.example` ships with the repo.

---

## 📡 API Reference

### Auth

| Method | Path     | Body                | Description                                |
|--------|----------|---------------------|--------------------------------------------|
| POST   | `/jwt`   | `{ "email": "..." }` | Issues a 7-day JWT cookie                  |
| POST   | `/logout`| —                   | Clears the JWT cookie                      |

### Cars

| Method | Path             | Auth | Description |
|--------|------------------|------|-------------|
| GET    | `/cars`          | no   | List with optional `?search=`, `?sort=price_asc\|price_desc\|date_asc\|date_desc`, `?limit=` |
| GET    | `/cars/:id`      | no   | Single car |
| POST   | `/cars`          | yes  | Create a car (owner = current user) |
| GET    | `/my-cars`       | yes  | List cars owned by the current user |
| PATCH  | `/cars/:id`      | yes  | Update an owned car |
| DELETE | `/cars/:id`      | yes  | Delete an owned car |

### Bookings

| Method | Path               | Auth | Description |
|--------|--------------------|------|-------------|
| POST   | `/bookings`        | yes  | Create a booking. Server computes `days` and `totalPrice` and increments `car.bookingCount` |
| GET    | `/my-bookings`     | yes  | List bookings for the current user (sortable) |
| PATCH  | `/bookings/:id`    | yes  | Modify dates and/or status (`confirmed`, `cancelled`, …) |

### Maintenance

| Method | Path     | Description |
|--------|----------|-------------|
| GET    | `/`      | Welcome message |
| GET    | `/health`| Server uptime + Mongo ping |
| POST   | `/seed`  | Seeds demo cars (gated by `SEED_KEY`) |

---

## 📁 Project Structure

```
server/
├── data/
│   └── sample-cars.js          # demo fleet used by /seed
├── middleware/
│   ├── requestLogger.js        # ISO timestamp + method + path
│   └── verifyJWT.js            # reads cookie, verifies token
├── routes/
│   └── auth.routes.js          # /jwt and /logout
├── index.js                    # cars + bookings routes, CORS, error handler
├── package.json
└── .env.example
```

---

## 📦 npm Packages

`express`, `cors`, `cookie-parser`, `jsonwebtoken`, `mongodb`, `dotenv`.

---

## 🚢 Deployment Notes

- Set `NODE_ENV=production` in production so cookies are issued with `Secure; SameSite=None`.
- Set `CORS_ORIGINS` to exactly the frontend domain(s) you ship to.
- Ensure your MongoDB Atlas IP allow-list includes your hosting provider (or `0.0.0.0/0` for testing).
- The server returns JSON `{ message }` on errors — the client surfaces these via `react-hot-toast`.

---

## 📜 License

MIT © DELOWAR
