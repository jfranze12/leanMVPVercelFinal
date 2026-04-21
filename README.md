# Stryker Vehicles Predictive Tool MVP - Vercel Edition

This version is prepared for Vercel deployment.

## What changed
- Frontend stays as a Vite + React app.
- Backend endpoints now live under `/api` as Vercel Functions.
- JSON file persistence has been replaced with a hosted Postgres database connection via `DATABASE_URL`.
- The first API request auto-initializes the schema and seeds the example vehicle-only data if the database is empty.

## Required environment variables
- `DATABASE_URL` - Postgres connection string from your Vercel Marketplace database integration.
- `INIT_SECRET` - optional secret for the admin initialization endpoint.

## Local build check
```bash
npm install
npm run build
```

## Vercel deployment overview
1. Push this folder to GitHub.
2. Import the repo into Vercel.
3. Add a Postgres database integration in Vercel Marketplace.
4. Confirm `DATABASE_URL` is present in Project Settings → Environment Variables.
5. Redeploy.
6. Open the deployed app. The first API call will initialize and seed the database automatically.

## Optional admin init endpoint
If you want to trigger initialization manually after deployment:
- `GET /api/admin/init?key=YOUR_INIT_SECRET`

## API routes
- `GET /api/bootstrap`
- `GET /api/shop-stock`
- `POST /api/predictions/run`
- `POST /api/predictions/:id/adjust`
- `POST /api/predictions/:id/update-reorder`
- `POST /api/results`
- `GET /api/metrics/summary`
- `POST /api/imports/:type`
