import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env"), override: true });

import bcryptjs from "bcryptjs";
import { db } from "../src/lib/db";

async function main() {
  const password = process.env.ADMIN_PASSWORD ?? process.env.ADMIN_PANEL_PASSWORD;
  if (!password) {
    throw new Error("ADMIN_PASSWORD or ADMIN_PANEL_PASSWORD must be set before running seed-admin.");
  }

  const hashedPassword = await bcryptjs.hash(password, 12);
  const defaultUsers = [
    { name: "FitZone Admin", email: "admin@fitzoneland.com", role: "admin" as const },
    { name: "FitZone Admin", email: "itsfitzoone@gmail.com", role: "admin" as const },
    { name: "FitZone Info", email: "info@fitzoneland.com", role: "staff" as const },
  ];

  const extraAdminEmail = process.env.ADMIN_EMAIL;
  const users = extraAdminEmail
    ? [...defaultUsers, { name: process.env.ADMIN_NAME ?? "Admin", email: extraAdminEmail, role: "admin" as const }]
    : defaultUsers;

  for (const userConfig of users) {
    const user = await db.user.upsert({
      where: { email: userConfig.email },
      update: {
        name: userConfig.name,
        password: hashedPassword,
        role: userConfig.role,
      },
      create: {
        name: userConfig.name,
        email: userConfig.email,
        password: hashedPassword,
        role: userConfig.role,
      },
    });

    await db.wallet.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, balance: 0 },
    });

    await db.rewardPoints.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, points: 0, tier: "bronze" },
    });

    console.log(`Admin user ready: ${userConfig.email} (${userConfig.role})`);
  }
}

main()
  .catch((error) => {
    console.error("[SEED_ADMIN]", error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
