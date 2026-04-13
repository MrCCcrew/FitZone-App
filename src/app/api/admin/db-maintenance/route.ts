import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { spawn } from "child_process";
import { createWriteStream, promises as fs } from "fs";
import { createGzip } from "zlib";
import path from "path";

const MASTER_PASSWORD = process.env.DB_RESET_MASTER_PASSWORD ?? "T@mer2025!";
const BACKUP_DIR = process.env.DB_BACKUP_DIR ?? path.join(process.cwd(), "backups");

function parseDatabaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL غير مضبوط.");
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: url.port || "3306",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
  };
}

function getTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function createBackup() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const dbConfig = parseDatabaseUrl();
  const filename = `fitzone-db-${getTimestamp()}.sql.gz`;
  const filePath = path.join(BACKUP_DIR, filename);

  await new Promise<void>((resolve, reject) => {
    const dump = spawn("mysqldump", ["-h", dbConfig.host, "-P", dbConfig.port, "-u", dbConfig.user, dbConfig.database], {
      env: { ...process.env, MYSQL_PWD: dbConfig.password },
    });
    const gzip = createGzip();
    const output = createWriteStream(filePath);

    dump.stdout.pipe(gzip).pipe(output);

    let stderr = "";
    dump.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    dump.on("error", (error) => reject(error));
    output.on("error", (error) => reject(error));

    dump.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || "تعذر إنشاء النسخة الاحتياطية."));
      }
    });
  });

  const stat = await fs.stat(filePath);
  return {
    name: filename,
    size: stat.size,
    createdAt: new Date().toLocaleString("ar-EG"),
  };
}

function buildResetTables({ preserveSiteContent, resetUsers }: { preserveSiteContent: boolean; resetUsers: boolean }) {
  const baseTables = [
    "MembershipGoal",
    "GoalClassRule",
    "HealthQuestionRestriction",
    "HealthQuestion",
    "ClubGoal",
    "Membership",
    "Offer",
    "UserMembership",
    "Booking",
    "Schedule",
    "Class",
    "Trainer",
    "OrderItem",
    "Order",
    "PaymentTransaction",
    "ProductReview",
    "Product",
    "ProductCategory",
    "InventoryMovement",
    "InventoryReceiptItem",
    "InventoryReceipt",
    "DeliveryOption",
    "Notification",
    "Complaint",
    "Testimonial",
    "ChatMessage",
    "ChatSession",
    "SupportPresence",
    "ChatKnowledgeEntry",
  ];

  const userTables = [
    "WalletTransaction",
    "Wallet",
    "RewardHistory",
    "RewardPoints",
    "Referral",
    "Session",
    "Account",
    "VerificationToken",
    "User",
  ];

  const tables = [...baseTables];
  if (resetUsers) {
    tables.push(...userTables);
  } else {
    tables.push("WalletTransaction", "Wallet", "RewardHistory", "RewardPoints", "Referral");
  }

  if (!preserveSiteContent) {
    tables.push("SiteContent");
  }

  return tables;
}

async function resetDatabase(options: { preserveSiteContent: boolean; resetUsers: boolean }) {
  const tables = buildResetTables(options);

  await db.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=0;");
  for (const table of tables) {
    await db.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\`;`);
  }
  await db.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=1;");
}

export async function GET() {
  const guard = await requireAdminFeature("db-maintenance");
  if ("error" in guard) return guard.error;

  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const files = await fs.readdir(BACKUP_DIR);
    const backups = await Promise.all(
      files
        .filter((name) => name.endsWith(".sql.gz"))
        .map(async (name) => {
          const stat = await fs.stat(path.join(BACKUP_DIR, name));
          return {
            name,
            size: stat.size,
            createdAt: stat.mtime.toLocaleString("ar-EG"),
          };
        }),
    );
    backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json({ backups });
  } catch (error) {
    console.error("[DB_MAINTENANCE_GET]", error);
    return NextResponse.json({ backups: [] });
  }
}

async function clearInventoryData(target: "sales" | "purchases" | "both") {
  // ── Step 1: Adjust Product.stock BEFORE deleting movements ──────────────────

  if (target === "both") {
    // Clear everything → stock goes back to 0 for all tracked products
    await db.$executeRawUnsafe(
      "UPDATE `Product` SET `stock` = 0 WHERE `trackInventory` = 1;",
    );
  } else if (target === "sales") {
    // Restore stock by reversing sale & return movements:
    // quantityChange is negative for sales (-qty), positive for returns (+qty)
    // To undo: stock -= SUM(quantityChange) per product  →  stock += netSoldQty
    await db.$executeRawUnsafe(`
      UPDATE \`Product\` p
      INNER JOIN (
        SELECT productId, SUM(quantityChange) AS netQty
        FROM \`InventoryMovement\`
        WHERE referenceType = 'order' AND type IN ('sale', 'return')
        GROUP BY productId
      ) m ON p.id = m.productId
      SET p.stock = p.stock - m.netQty
      WHERE p.trackInventory = 1;
    `);
  } else if (target === "purchases") {
    // Reverse purchase movements: stock -= SUM(quantityChange) per product
    await db.$executeRawUnsafe(`
      UPDATE \`Product\` p
      INNER JOIN (
        SELECT productId, SUM(quantityChange) AS totalPurchased
        FROM \`InventoryMovement\`
        WHERE type = 'purchase'
        GROUP BY productId
      ) m ON p.id = m.productId
      SET p.stock = p.stock - m.totalPurchased
      WHERE p.trackInventory = 1;
    `);
  }

  // ── Step 2: Delete movement records ─────────────────────────────────────────

  await db.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=0;");

  if (target === "sales" || target === "both") {
    await db.$executeRawUnsafe(
      "DELETE FROM `InventoryMovement` WHERE `referenceType` = 'order' AND `type` IN ('sale','return');",
    );
  }

  if (target === "purchases" || target === "both") {
    await db.$executeRawUnsafe(
      "DELETE FROM `InventoryMovement` WHERE `referenceType` = 'inventory_receipt';",
    );
    await db.$executeRawUnsafe("TRUNCATE TABLE `InventoryReceiptItem`;");
    await db.$executeRawUnsafe("TRUNCATE TABLE `InventoryReceipt`;");

    // Reset average cost and last purchase cost on all products
    await db.$executeRawUnsafe(
      "UPDATE `Product` SET `averageCost` = 0, `lastPurchaseCost` = 0;",
    );
  }

  await db.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=1;");
}

export async function POST(req: Request) {
  const guard = await requireAdminFeature("db-maintenance");
  if ("error" in guard) return guard.error;

  try {
    const body = await req.json();
    const masterPassword = String(body?.masterPassword ?? "");
    const action = body?.action as "backup" | "reset" | "clear-inventory";
    const preserveSiteContent = body?.preserveSiteContent !== false;
    const resetUsers = Boolean(body?.resetUsers);
    const clearTarget = body?.clearTarget as "sales" | "purchases" | "both" | undefined;

    if (!masterPassword || masterPassword !== MASTER_PASSWORD) {
      return NextResponse.json({ message: "كلمة المرور الرئيسية غير صحيحة." }, { status: 401 });
    }

    if (action !== "backup" && action !== "reset" && action !== "clear-inventory") {
      return NextResponse.json({ message: "طلب غير صالح." }, { status: 400 });
    }

    const backup = await createBackup();

    if (action === "reset") {
      await resetDatabase({ preserveSiteContent, resetUsers });
    }

    if (action === "clear-inventory") {
      if (!clearTarget || !["sales", "purchases", "both"].includes(clearTarget)) {
        return NextResponse.json({ message: "حدد نوع البيانات المراد مسحها." }, { status: 400 });
      }
      await clearInventoryData(clearTarget);
    }

    const messages: Record<string, string> = {
      backup: "تم إنشاء النسخة الاحتياطية بنجاح.",
      reset: "تم تصفير قاعدة البيانات بنجاح.",
      "clear-inventory":
        clearTarget === "sales"
          ? "تم مسح جميع حركات البيع بنجاح."
          : clearTarget === "purchases"
            ? "تم مسح جميع فواتير الشراء وحركاتها بنجاح وإعادة ضبط متوسط التكلفة."
            : "تم مسح جميع حركات البيع والشراء بنجاح وإعادة ضبط متوسط التكلفة.",
    };

    return NextResponse.json({ message: messages[action], backup });
  } catch (error) {
    console.error("[DB_MAINTENANCE]", error);
    return NextResponse.json({ message: "تعذر إكمال العملية الآن." }, { status: 500 });
  }
}
