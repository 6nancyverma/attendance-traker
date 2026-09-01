# Attendance Tracking — Next.js

A self-attendance tracking app (check in / check out, stats, CSV reports) built with
**Next.js 14 (App Router)** for both the frontend and the backend. This is a port of the
original Vite + React (React Router) + Express project to a single Next.js application.

## Tech stack

- **Framework**: Next.js 14 (App Router) — React Server/Client Components
- **Language**: TypeScript
- **Styling**: Tailwind CSS 3 + shadcn/ui (Radix UI primitives)
- **API**: Next.js Route Handlers (`app/api/**/route.ts`) — replaces the Express server
- **Database**: MongoDB (`attendance_system` database)
- **Auth**: JWT (stored in `localStorage`), SHA-256 password hashing

## Project structure

```
app/
├── layout.tsx              # Root layout + providers
├── providers.tsx           # Theme / Tooltip / Toaster / Auth context providers
├── globals.css             # Tailwind theme tokens + global styles
├── page.tsx                # Landing page
├── login/page.tsx          # Login
├── signup/page.tsx         # Signup
├── dashboard/page.tsx      # Check in/out + stats (protected)
├── reports/page.tsx        # CSV report downloads (protected)
├── not-found.tsx           # 404
└── api/                    # Backend (Route Handlers)
    ├── ping/route.ts
    ├── auth/{signup,login}/route.ts
    ├── attendance/{checkin,checkout,today,history,stats}/route.ts
    └── reports/generate/route.ts

components/
├── require-auth.tsx        # Client guard for protected pages
├── require-guest.tsx       # Client guard for auth pages
└── ui/                     # shadcn/ui components

lib/
├── auth.ts                 # JWT + password hashing
├── api-auth.ts             # Bearer-token guard for route handlers
├── auth-context.tsx        # Client-side auth state (localStorage)
├── db.ts                   # Cached MongoDB connection
└── utils.ts                # cn() helper

hooks/use-toast.ts
types/api.ts                # Shared request/response types
```

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment. Copy `.env.example` to `.env.local` and fill in values
   (a `.env.local` with working defaults is already included):

   ```
   MONGODB_URI=...
   JWT_SECRET=...
   PING_MESSAGE="ping pong"
   ```

3. Run the dev server:

   ```bash
   npm run dev
   ```

   App runs at http://localhost:3000.

## Scripts

| Command            | Description                        |
| ------------------ | ---------------------------------- |
| `npm run dev`      | Start the dev server               |
| `npm run build`    | Production build                   |
| `npm run start`    | Serve the production build         |
| `npm run lint`     | ESLint                             |
| `npm run typecheck`| TypeScript check (no emit)         |

## API routes

| Method | Route                       | Auth | Description                       |
| ------ | --------------------------- | ---- | --------------------------------- |
| POST   | `/api/auth/signup`          | —    | Create account, returns JWT       |
| POST   | `/api/auth/login`           | —    | Log in, returns JWT               |
| POST   | `/api/attendance/checkin`   | ✅   | Check in for today                |
| POST   | `/api/attendance/checkout`  | ✅   | Check out for today               |
| GET    | `/api/attendance/today`     | ✅   | Today's record                    |
| GET    | `/api/attendance/history`   | ✅   | Records for a year/month          |
| GET    | `/api/attendance/stats`     | ✅   | Aggregated stats                  |
| GET    | `/api/reports/generate`     | ✅   | Download attendance as CSV        |
| GET    | `/api/ping`                 | —    | Health check                      |

Protected routes expect an `Authorization: Bearer <token>` header.

## Deployment

Required environment variables (set them in your host's dashboard or pass at
runtime — never commit real secrets):

| Variable       | Required | Description                          |
| -------------- | -------- | ------------------------------------ |
| `MONGODB_URI`  | ✅       | MongoDB connection string            |
| `JWT_SECRET`   | ✅       | Secret used to sign JWT auth tokens  |
| `PING_MESSAGE` | —        | Message returned by `/api/ping`      |

### Vercel

Next.js is auto-detected (`vercel.json` just pins the framework). Push the repo,
import it in Vercel, and add `MONGODB_URI` / `JWT_SECRET` under
**Project → Settings → Environment Variables**. No build config needed.

### Docker

The build uses Next.js standalone output (`output: "standalone"` in
`next.config.mjs`) for a small runtime image.

```bash
# Build the image
docker build -t attendance-next .

# Run it (provide secrets at runtime)
docker run -p 3000:3000 \
  -e MONGODB_URI="your-mongodb-uri" \
  -e JWT_SECRET="your-secret" \
  attendance-next
```

Or with Docker Compose (reads vars from your shell / an env file):

```bash
MONGODB_URI="..." JWT_SECRET="..." docker compose up --build
```

## Notes on the port

- The Express server + Netlify functions were replaced by Next.js Route Handlers.
  All handlers run on the Node.js runtime (required by the `mongodb`/`jsonwebtoken`
  drivers) and are marked `force-dynamic`.
- Client-side auth (token + user in `localStorage`) was moved from prop-drilling in
  `App.tsx` into an `AuthProvider` React context, with `RequireAuth` / `RequireGuest`
  guards replacing the React Router redirect logic.
- Two pre-existing bugs in the report endpoint were fixed during the port: it queried
  the wrong user-id field (`req.user.userId` → the token's `_id`), and it returned JSON
  even though the client downloads the response as CSV. It now returns a proper CSV file.
- Password hashing intentionally remains SHA-256 (matching the original) so existing
  user records keep working.
