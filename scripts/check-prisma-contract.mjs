import fs from "node:fs";
import process from "node:process";
import { PrismaClient, Prisma } from "@prisma/client";

const db = new PrismaClient();

const fail = (message) => {
  console.error(`PRISMA_CONTRACT=FAIL`);
  console.error(message);
  process.exitCode = 1;
};

try {
  const schemaText = fs.readFileSync("prisma/schema.prisma", "utf8");

  const model = Prisma.dmmf.datamodel.models.find(
    (item) => item.name === "UserMembership",
  );

  if (!model) {
    fail("Runtime Prisma Client is missing UserMembership model.");
  } else {
    const runtimeFields = new Set(model.fields.map((field) => field.name));

    const sourceFields = [
      ...schemaText.matchAll(
        /^\s{2}([A-Za-z][A-Za-z0-9_]*)\s+[A-Za-z][^\n]*$/gm,
      ),
    ].map((match) => match[1]);

    const userMembershipSourceBlock = schemaText.match(
      /model UserMembership\s*\{([\s\S]*?)^\}/m,
    );

    if (!userMembershipSourceBlock) {
      fail("Source schema is missing UserMembership model.");
    } else {
      const sourceUserMembershipFields = [
        ...userMembershipSourceBlock[1].matchAll(
          /^\s+([A-Za-z][A-Za-z0-9_]*)\s+/gm,
        ),
      ].map((match) => match[1]);

      const missingRuntime = sourceUserMembershipFields.filter(
        (field) => !runtimeFields.has(field),
      );

      if (missingRuntime.length) {
        fail(
          `Generated Prisma Client is stale. Missing runtime fields: ${missingRuntime.join(
            ", ",
          )}`,
        );
      }
    }
  }

  const dbColumns = await db.$queryRawUnsafe(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'UserMembership'
  `);

  const dbFieldSet = new Set(
    dbColumns.map((row) => String(row.COLUMN_NAME)),
  );

  if (model) {
    const scalarRuntimeFields = model.fields
      .filter((field) => field.kind === "scalar")
      .map((field) => field.name);

    const missingDb = scalarRuntimeFields.filter(
      (field) => !dbFieldSet.has(field),
    );

    if (missingDb.length) {
      fail(
        `Database schema is behind Prisma Client. Missing DB columns: ${missingDb.join(
          ", ",
        )}`,
      );
    }
  }

  if (!process.exitCode) {
    console.log("PRISMA_SCHEMA_CLIENT_DB_SYNC=PASS");
  }
} catch (error) {
  fail(
    error instanceof Error
      ? error.stack || error.message
      : String(error),
  );
} finally {
  await db.$disconnect();
}
