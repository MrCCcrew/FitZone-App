# Hostinger Deployment

## Production environment variables

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

Replace `DB_USER`, `DB_PASSWORD`, `HOST`, and `DATABASE_NAME` with your real Hostinger MySQL credentials.
Leave `AUTH_URL` and `NEXTAUTH_URL` unset so Auth.js can honor both `fitzoneland.com` and `www.fitzoneland.com` using the incoming host with `AUTH_TRUST_HOST=true`.
`R2_*` variables are required for product image uploads in production because Hostinger local filesystem storage is not reliable across deploys/restarts.

## Commands

```bash
npm install
npx prisma db push
npm run build
npm run start
```

`prisma generate` now runs automatically in `postinstall`, so Hostinger can keep the default `npm run build` command. The Prisma client is configured to use the Rust Node-API library engine instead of the sidecar binary engine because the binary engine was crashing on Hostinger with `timer has gone away`.

Use `npx prisma db push` for the initial MySQL schema creation because this project does not currently include Prisma migration files.

## Recommended deployment flow

1. Set all production environment variables in Hostinger before the first build.
2. Run `npx prisma db push` against the production database once.
3. Run `npx tsx prisma/seed-admin.ts` if you need to create the first admin from script, or call `POST /api/setup` once with `{ "token": "YOUR_SETUP_TOKEN", "password": "A-Strong-Admin-Password!" }`.
4. Remove or rotate `SETUP_TOKEN` after initial admin creation.
5. Upload product images only after `R2_PUBLIC_URL` is working publicly.
