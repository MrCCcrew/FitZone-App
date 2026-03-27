# Hostinger Deployment

## Production environment variables

```env
DATABASE_URL="mysql://modern-bns:Tato85%40mero84@HOST:3306/DATABASE_NAME"
AUTH_SECRET="replace-with-a-long-random-secret"
AUTH_TRUST_HOST="true"
NODE_ENV="production"
```

Replace `HOST` with your Hostinger MySQL hostname and `DATABASE_NAME` with the created database name.
Leave `AUTH_URL` and `NEXTAUTH_URL` unset so Auth.js can honor both `fitzoneland.com` and `www.fitzoneland.com` using the incoming host with `AUTH_TRUST_HOST=true`.

## Commands

```bash
npm install
npx prisma db push
npm run build
npm run start
```

`prisma generate` now runs automatically in `postinstall`, so Hostinger can keep the default `npm run build` command. The Prisma client is configured to use the Rust Node-API library engine instead of the sidecar binary engine because the binary engine was crashing on Hostinger with `timer has gone away`.

Use `npx prisma db push` for the initial MySQL schema creation because this project does not currently include Prisma migration files.
