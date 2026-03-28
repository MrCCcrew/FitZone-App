# FitZone Final Hostinger Deploy Checklist

## What to upload

Upload the full project source as a `.zip`, then extract it on Hostinger.

Include:

- `src/`
- `prisma/`
- `public/` if it exists
- `package.json`
- `package-lock.json`
- `next.config.*` if present
- `postcss.config.*` if present
- `tailwind.config.*` if present
- `tsconfig.json`
- `components.json` if present
- any root config files used by the app

Do not upload:

- `node_modules/`
- `.next/`
- `.git/`
- `.env`
- `.env.local`
- local logs or temp files

## Required environment variables on Hostinger

```env
DATABASE_URL="mysql://DB_USER:DB_PASSWORD@HOST:3306/DATABASE_NAME"
DB_CONNECTION_LIMIT="5"
AUTH_SECRET="replace-with-a-long-random-secret"
AUTH_TRUST_HOST="true"
NODE_ENV="production"
R2_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
R2_ACCESS_KEY_ID="replace-me"
R2_SECRET_ACCESS_KEY="replace-me"
R2_BUCKET_NAME="fitzone-images"
R2_PUBLIC_URL="https://cdn.your-domain.com"
SETUP_TOKEN="replace-with-a-long-random-token"
```

Notes:

- `AUTH_SECRET` must be a strong random secret.
- `DB_CONNECTION_LIMIT="5"` is the current recommended starting point.
- `R2_*` variables are required if product image upload will be used.
- After creating the first admin, remove or rotate `SETUP_TOKEN`.

## Commands to run on Hostinger

```bash
npm install
npx prisma db push
npm run build
npm run start
```

## First admin creation

Preferred option:

```bash
npx tsx prisma/seed-admin.ts
```

Before running it, set:

```env
ADMIN_PASSWORD="A-Strong-Admin-Password!"
```

Alternative option:

Call:

```http
POST /api/setup
Content-Type: application/json

{
  "token": "YOUR_SETUP_TOKEN",
  "password": "A-Strong-Admin-Password!"
}
```

Then remove or rotate `SETUP_TOKEN`.

## Final checks before going live

- Confirm `npm run build` succeeds on Hostinger.
- Confirm `/login`, `/register`, `/admin/login`, `/account`, and `/admin` open correctly.
- Confirm database connection works without pool timeout errors.
- Confirm image upload works from admin if `R2_*` is configured.
- Confirm login/logout updates the homepage header correctly.
- Confirm product pages, classes, memberships, orders, and testimonials load correctly.

## Recommended zip contents

Create a deployment zip from the project root after removing:

- `node_modules`
- `.next`
- `.git`
- `.env`
- `.env.local`

Then upload that zip to Hostinger.
