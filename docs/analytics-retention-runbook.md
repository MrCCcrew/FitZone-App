# Analytics retention runbook

Retention is server-only and defaults to dry-run. It never targets `PaymentTransaction`, `User`, or `UserMembership`.

- Page views and sessions: 365 days.
- Non-business analytics events: 365 days.
- `checkout_started`, `payment_succeeded`, `payment_failed`, and `membership_activated`: 730 days.
- Visitors: only when inactive for 365 days and orphaned from sessions, page views, and events.

Run a dry-run first:

```bash
npm run analytics:retention
```

Execute only after reviewing the dry-run report:

```bash
npm run analytics:retention -- --execute --batch-size=500
```

Suggested monthly Linux cron (do not install automatically):

```cron
15 3 1 * * flock -n /var/lock/fitzone-analytics-retention.lock sh -lc 'cd /var/www/fitzone && npm run analytics:retention -- --execute --batch-size=500 >> /var/log/fitzone/analytics-retention.log 2>&1'
```

Production deployment checklist: take a database backup, review `git status`, install dependencies, run `npx prisma migrate deploy`, `npx prisma generate`, `npm run build`, then restart under the `fitzone` user with `pm2 restart fitzone --update-env && pm2 save`. Verify `/api/health`, `/admin` analytics, and collector requests; review PM2 logs. Roll back application code only if needed—both Analytics migrations are additive and should remain applied.
