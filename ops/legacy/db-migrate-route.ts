import { NextRequest, NextResponse } from "next/server";
import * as mariadb from "mariadb";

export const dynamic = "force-dynamic";

function normalizeDatabaseUrl(value: string) {
  let trimmed = value.trim();
  const prefixMatch = trimmed.match(/^DATABASE_URL\s*=\s*(.+)$/i);
  if (prefixMatch) trimmed = prefixMatch[1].trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))
    return trimmed.slice(1, -1);
  return trimmed;
}

const TABLES = [
  "CREATE TABLE IF NOT EXISTS `User` (id VARCHAR(191) NOT NULL, name VARCHAR(191), email VARCHAR(191), emailVerified DATETIME(3), phone VARCHAR(191), password TEXT, role VARCHAR(191) NOT NULL DEFAULT 'member', avatar VARCHAR(191), createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), PRIMARY KEY (id), UNIQUE KEY User_email_key (email)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "CREATE TABLE IF NOT EXISTS `Account` (id VARCHAR(191) NOT NULL, userId VARCHAR(191) NOT NULL, type VARCHAR(191) NOT NULL, provider VARCHAR(191) NOT NULL, providerAccountId VARCHAR(191) NOT NULL, refresh_token TEXT, access_token TEXT, expires_at INT, token_type VARCHAR(191), scope VARCHAR(191), id_token TEXT, session_state VARCHAR(191), PRIMARY KEY (id), UNIQUE KEY Account_ppa_key (provider, providerAccountId), FOREIGN KEY (userId) REFERENCES `User`(id) ON DELETE CASCADE) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "CREATE TABLE IF NOT EXISTS `Session` (id VARCHAR(191) NOT NULL, sessionToken VARCHAR(191) NOT NULL, userId VARCHAR(191) NOT NULL, expires DATETIME(3) NOT NULL, PRIMARY KEY (id), UNIQUE KEY Session_sessionToken_key (sessionToken), FOREIGN KEY (userId) REFERENCES `User`(id) ON DELETE CASCADE) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "CREATE TABLE IF NOT EXISTS `VerificationToken` (identifier VARCHAR(191) NOT NULL, token VARCHAR(191) NOT NULL, expires DATETIME(3) NOT NULL, UNIQUE KEY VerificationToken_token_key (token), UNIQUE KEY VerificationToken_it_key (identifier, token)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "CREATE TABLE IF NOT EXISTS `Membership` (id VARCHAR(191) NOT NULL, name VARCHAR(191) NOT NULL, price DOUBLE NOT NULL, duration INT NOT NULL, features TEXT NOT NULL, maxClasses INT NOT NULL DEFAULT -1, walletBonus DOUBLE NOT NULL DEFAULT 0, gift VARCHAR(191), isActive TINYINT(1) NOT NULL DEFAULT 1, PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "CREATE TABLE IF NOT EXISTS `UserMembership` (id VARCHAR(191) NOT NULL, userId VARCHAR(191) NOT NULL, membershipId VARCHAR(191) NOT NULL, startDate DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), endDate DATETIME(3) NOT NULL, status VARCHAR(191) NOT NULL DEFAULT 'active', PRIMARY KEY (id), FOREIGN KEY (userId) REFERENCES `User`(id) ON DELETE CASCADE, FOREIGN KEY (membershipId) REFERENCES `Membership`(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "CREATE TABLE IF NOT EXISTS `Trainer` (id VARCHAR(191) NOT NULL, name VARCHAR(191) NOT NULL, specialty VARCHAR(191) NOT NULL, bio TEXT, certifications TEXT, rating DOUBLE NOT NULL DEFAULT 5.0, sessionsCount INT NOT NULL DEFAULT 0, image VARCHAR(191), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "CREATE TABLE IF NOT EXISTS `Class` (id VARCHAR(191) NOT NULL, name VARCHAR(191) NOT NULL, description TEXT, trainerId VARCHAR(191) NOT NULL, type VARCHAR(191) NOT NULL, duration INT NOT NULL, intensity VARCHAR(191) NOT NULL, maxSpots INT NOT NULL DEFAULT 15, price DOUBLE NOT NULL DEFAULT 0, image VARCHAR(191), isActive TINYINT(1) NOT NULL DEFAULT 1, PRIMARY KEY (id), FOREIGN KEY (trainerId) REFERENCES `Trainer`(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "CREATE TABLE IF NOT EXISTS `Schedule` (id VARCHAR(191) NOT NULL, classId VARCHAR(191) NOT NULL, date DATETIME(3) NOT NULL, time VARCHAR(191) NOT NULL, availableSpots INT NOT NULL, isActive TINYINT(1) NOT NULL DEFAULT 1, PRIMARY KEY (id), FOREIGN KEY (classId) REFERENCES `Class`(id) ON DELETE CASCADE) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "CREATE TABLE IF NOT EXISTS `Booking` (id VARCHAR(191) NOT NULL, userId VARCHAR(191) NOT NULL, scheduleId VARCHAR(191) NOT NULL, status VARCHAR(191) NOT NULL DEFAULT 'confirmed', paidAmount DOUBLE NOT NULL DEFAULT 0, paymentMethod VARCHAR(191) NOT NULL DEFAULT 'wallet', createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id), FOREIGN KEY (userId) REFERENCES `User`(id) ON DELETE CASCADE, FOREIGN KEY (scheduleId) REFERENCES `Schedule`(id) ON DELETE CASCADE) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "CREATE TABLE IF NOT EXISTS `Product` (id VARCHAR(191) NOT NULL, name VARCHAR(191) NOT NULL, description TEXT, price DOUBLE NOT NULL, oldPrice DOUBLE, category VARCHAR(191) NOT NULL, stock INT NOT NULL DEFAULT 0, images TEXT, sizes TEXT, colors TEXT, isActive TINYINT(1) NOT NULL DEFAULT 1, PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "CREATE TABLE IF NOT EXISTS `Order` (id VARCHAR(191) NOT NULL, userId VARCHAR(191) NOT NULL, total DOUBLE NOT NULL, status VARCHAR(191) NOT NULL DEFAULT 'pending', address TEXT, paymentMethod VARCHAR(191) NOT NULL DEFAULT 'card', createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id), FOREIGN KEY (userId) REFERENCES `User`(id) ON DELETE CASCADE) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "CREATE TABLE IF NOT EXISTS `OrderItem` (id VARCHAR(191) NOT NULL, orderId VARCHAR(191) NOT NULL, productId VARCHAR(191) NOT NULL, quantity INT NOT NULL, price DOUBLE NOT NULL, size VARCHAR(191), PRIMARY KEY (id), FOREIGN KEY (orderId) REFERENCES `Order`(id) ON DELETE CASCADE, FOREIGN KEY (productId) REFERENCES `Product`(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "CREATE TABLE IF NOT EXISTS `Wallet` (id VARCHAR(191) NOT NULL, userId VARCHAR(191) NOT NULL, balance DOUBLE NOT NULL DEFAULT 0, PRIMARY KEY (id), UNIQUE KEY Wallet_userId_key (userId), FOREIGN KEY (userId) REFERENCES `User`(id) ON DELETE CASCADE) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "CREATE TABLE IF NOT EXISTS `WalletTransaction` (id VARCHAR(191) NOT NULL, walletId VARCHAR(191) NOT NULL, amount DOUBLE NOT NULL, type VARCHAR(191) NOT NULL, description TEXT, createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id), FOREIGN KEY (walletId) REFERENCES `Wallet`(id) ON DELETE CASCADE) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "CREATE TABLE IF NOT EXISTS `RewardPoints` (id VARCHAR(191) NOT NULL, userId VARCHAR(191) NOT NULL, points INT NOT NULL DEFAULT 0, tier VARCHAR(191) NOT NULL DEFAULT 'bronze', PRIMARY KEY (id), UNIQUE KEY RewardPoints_userId_key (userId), FOREIGN KEY (userId) REFERENCES `User`(id) ON DELETE CASCADE) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "CREATE TABLE IF NOT EXISTS `RewardHistory` (id VARCHAR(191) NOT NULL, rewardId VARCHAR(191) NOT NULL, points INT NOT NULL, reason VARCHAR(191) NOT NULL, createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id), FOREIGN KEY (rewardId) REFERENCES `RewardPoints`(id) ON DELETE CASCADE) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "CREATE TABLE IF NOT EXISTS `Referral` (id VARCHAR(191) NOT NULL, userId VARCHAR(191) NOT NULL, code VARCHAR(191) NOT NULL, totalEarned DOUBLE NOT NULL DEFAULT 0, PRIMARY KEY (id), UNIQUE KEY Referral_userId_key (userId), UNIQUE KEY Referral_code_key (code), FOREIGN KEY (userId) REFERENCES `User`(id) ON DELETE CASCADE) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "CREATE TABLE IF NOT EXISTS `Notification` (id VARCHAR(191) NOT NULL, userId VARCHAR(191) NOT NULL, title VARCHAR(191) NOT NULL, body TEXT NOT NULL, type VARCHAR(191) NOT NULL DEFAULT 'info', isRead TINYINT(1) NOT NULL DEFAULT 0, createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id), FOREIGN KEY (userId) REFERENCES `User`(id) ON DELETE CASCADE) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "CREATE TABLE IF NOT EXISTS `Offer` (id VARCHAR(191) NOT NULL, title VARCHAR(191) NOT NULL, discount DOUBLE NOT NULL, description TEXT, expiresAt DATETIME(3) NOT NULL, isActive TINYINT(1) NOT NULL DEFAULT 1, PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "CREATE TABLE IF NOT EXISTS `Complaint` (id VARCHAR(191) NOT NULL, userId VARCHAR(191) NOT NULL, subject VARCHAR(191) NOT NULL, message TEXT NOT NULL, status VARCHAR(191) NOT NULL DEFAULT 'open', adminNote TEXT, createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), PRIMARY KEY (id), FOREIGN KEY (userId) REFERENCES `User`(id) ON DELETE CASCADE) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "CREATE TABLE IF NOT EXISTS `ChatSession` (id VARCHAR(191) NOT NULL, visitorName VARCHAR(191), visitorPhone VARCHAR(191), status VARCHAR(191) NOT NULL DEFAULT 'open', mode VARCHAR(191) NOT NULL DEFAULT 'bot', context TEXT, assignedToId VARCHAR(191), recommendedMembershipId VARCHAR(191), lastMessageAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), PRIMARY KEY (id), FOREIGN KEY (assignedToId) REFERENCES `User`(id), FOREIGN KEY (recommendedMembershipId) REFERENCES `Membership`(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "CREATE TABLE IF NOT EXISTS `ChatMessage` (id VARCHAR(191) NOT NULL, sessionId VARCHAR(191) NOT NULL, senderType VARCHAR(191) NOT NULL, senderName VARCHAR(191), content TEXT NOT NULL, metadata TEXT, createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id), FOREIGN KEY (sessionId) REFERENCES `ChatSession`(id) ON DELETE CASCADE) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "CREATE TABLE IF NOT EXISTS `SupportPresence` (id VARCHAR(191) NOT NULL, userId VARCHAR(191) NOT NULL, isOnline TINYINT(1) NOT NULL DEFAULT 0, lastSeenAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id), UNIQUE KEY SupportPresence_userId_key (userId), FOREIGN KEY (userId) REFERENCES `User`(id) ON DELETE CASCADE) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "CREATE TABLE IF NOT EXISTS `SiteContent` (id VARCHAR(191) NOT NULL, section VARCHAR(191) NOT NULL, content LONGTEXT NOT NULL, updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), PRIMARY KEY (id), UNIQUE KEY SiteContent_section_key (section)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  "CREATE TABLE IF NOT EXISTS `ChatKnowledgeEntry` (id VARCHAR(191) NOT NULL, title VARCHAR(191) NOT NULL, category VARCHAR(191) NOT NULL DEFAULT 'general', keywords TEXT NOT NULL, answer TEXT NOT NULL, priority INT NOT NULL DEFAULT 0, isActive TINYINT(1) NOT NULL DEFAULT 1, createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
];

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== "FitZone_Migrate_2026") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let conn: mariadb.Connection | null = null;
  const results: string[] = [];
  const errors: string[] = [];

  try {
    const url = new URL(normalizeDatabaseUrl(process.env.DATABASE_URL!));
    conn = await mariadb.createConnection({
      host: url.hostname,
      port: url.port ? Number(url.port) : 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ""),
      charset: "utf8mb4",
      connectTimeout: 10000,
    });

    for (const sql of TABLES) {
      try {
        await conn.query(sql);
        const match = sql.match(/CREATE TABLE IF NOT EXISTS `(\w+)`/);
        if (match) results.push("OK: " + match[1]);
      } catch (e: unknown) {
        errors.push((e as Error).message);
      }
    }

    return NextResponse.json({ success: true, created: results, errors });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: (err as Error).message, errors }, { status: 500 });
  } finally {
    if (conn) await (conn as mariadb.Connection).end().catch(() => {});
  }
}
