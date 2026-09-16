import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const routePath = path.join(
  process.cwd(),
  "src/app/api/admin/class-exchanges/route.ts",
);

const source = fs.readFileSync(routePath, "utf8");

const marker = "export async function POST";

if (!source.includes(marker)) {
  throw new Error("CLASS_EXCHANGE_POST_BOUNDARY_NOT_FOUND");
}

const [getSection, postTail] = source.split(marker, 2);
const postSection = `${marker}${postTail}`;

describe("Admin class exchange authorization regression", () => {
  it("GET allows execute permission with review fallback", () => {
    expect(getSection).toContain(
      'requireAdminPermission("class_exchanges_execute")',
    );

    expect(getSection).toContain(
      'requireAdminPermission("class_exchanges_review")',
    );
  });

  it("POST requires dedicated execute permission", () => {
    expect(postSection).toContain(
      'requireAdminPermission("class_exchanges_execute")',
    );

    expect(postSection).not.toContain(
      'requireAdminPermission("bookings_create")',
    );

    expect(postSection).not.toContain(
      'authorization.role !== "admin"',
    );
  });
});
