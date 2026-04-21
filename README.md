# leanMVP Vercel full-stack (Prisma Postgres compatible)

This package keeps the Vite frontend and Vercel Functions API, but replaces the old Neon-specific database client with a standard Postgres client that works with Prisma Postgres / Vercel Postgres style `DATABASE_URL` values.

## Deploy on Vercel

1. Create a GitHub repo and upload these files.
2. Import the repo into Vercel.
3. Add the Prisma Postgres integration to the Vercel project.
4. Confirm `DATABASE_URL` is present in Project Settings → Environment Variables.
5. Add `INIT_SECRET` as another environment variable.
6. Redeploy.
7. Visit `/api/admin/init?key=YOUR_INIT_SECRET` one time if the app does not auto-seed on first load.

## Local run

You need a Postgres database reachable from `DATABASE_URL`.

```bash
npm install
npm run dev
```

## Important

- Do not commit `.env` files.
- Do not commit `node_modules` or `dist`.
- The app auto-creates tables and seeds the provided vehicle-only example data.
