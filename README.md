# b11a11-server-side-mdhossain-2437

Express + MongoDB backend for Car Rental System with JWT (HTTP-only cookie).

## Scripts
- `npm run start` – start server
- `npm run dev` – watch mode

## Environment
Create `.env` in server:
```
PORT=5000
MONGO_URI=your_mongo_connection_string
ACCESS_TOKEN_SECRET=your_secret_key_here
```

## Features
- CORS with credentials
- JWT cookie set/clear endpoints
- Ready for protected routes via middleware

