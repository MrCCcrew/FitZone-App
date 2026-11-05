import {
  readFileSync,
} from "node:fs";

import {
  join,
} from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

describe("referral identity schema contract", () => {
  it("stores only nullable keyed referral identity hashes on User", () => {
    const schema = readFileSync(
      join(
        process.cwd(),
        "prisma",
        "schema.prisma",
      ),
      "utf8",
    );

    expect(schema).toMatch(
      /^\s*referralDeviceHash\s+String\?\s+@db\.VarChar\(43\)\s*$/m,
    );

    expect(schema).toMatch(
      /^\s*referralIpHash\s+String\?\s+@db\.VarChar\(43\)\s*$/m,
    );

    expect(schema).toMatch(
      /^\s*referralUserAgentHash\s+String\?\s+@db\.VarChar\(43\)\s*$/m,
    );
  });
});
