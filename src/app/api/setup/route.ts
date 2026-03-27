import { NextResponse, NextRequest } from "next/server";
import bcryptjs from "bcryptjs";
import * as mariadb from "mariadb";

const SETUP_TOKEN = process.env.SETUP_TOKEN ?? "FitZone_Setup_2026";

function normalizeDatabaseUrl(value: string) {
  let trimmed = value.trim();
  const prefixMatch = trimmed.match(/^DATABASE_URL\s*=\s*(.+)$/i);
  if (prefixMatch) trimmed = prefixMatch[1].trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const token = searchParams.get("token");

  if (token !== SETUP_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    return NextResponse.json({ error: "DATABASE_URL not configured" }, { status: 500 });
  }

  const url = new URL(normalizeDatabaseUrl(rawUrl));
  const conn = await mariadb.createConnection({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    charset: "utf8mb4",
    connectTimeout: 5000,
  });

  try {
    const password = "Admin123!";
    const hashedPassword = await bcryptjs.hash(password, 12);
    const results: string[] = [];

    const users = [
      { name: "FitZone Admin", email: "admin@fitzoneland.com", role: "admin" },
      { name: "FitZone Admin", email: "itsfitzoone@gmail.com", role: "admin" },
      { name: "FitZone Info",  email: "info@fitzoneland.com",  role: "staff" },
    ];

    for (const u of users) {
      const rows = await conn.query(
        "SELECT id FROM `User` WHERE email = ? LIMIT 1",
        [u.email]
      ) as { id: string }[];

      let userId: string;

      if (rows.length > 0) {
        userId = rows[0].id;
        await conn.query(
          "UPDATE `User` SET name=?, password=?, role=? WHERE id=?",
          [u.name, hashedPassword, u.role, userId]
        );
        results.push(`Updated: ${u.email}`);
      } else {
        userId = generateId();
        await conn.query(
          "INSERT INTO `User` (id, name, email, password, role, emailVerified, createdAt, updatedAt) VALUES (?,?,?,?,?,NULL,NOW(),NOW())",
          [userId, u.name, u.email, hashedPassword, u.role]
        );
        results.push(`Created: ${u.email}`);
      }

      const walletRows = await conn.query("SELECT id FROM `Wallet` WHERE userId=? LIMIT 1", [userId]) as { id: string }[];
      if (walletRows.length === 0) {
        await conn.query("INSERT INTO `Wallet` (id, userId, balance) VALUES (?,?,0)", [generateId(), userId]);
      }

      const rpRows = await conn.query("SELECT id FROM `RewardPoints` WHERE userId=? LIMIT 1", [userId]) as { id: string }[];
      if (rpRows.length === 0) {
        await conn.query("INSERT INTO `RewardPoints` (id, userId, points, tier) VALUES (?,?,0,'bronze')", [generateId(), userId]);
      }
    }

    return NextResponse.json({ success: true, message: "تم إنشاء مستخدمي الأدمن بنجاح", results });
  } finally {
    await conn.end();
  }
}
