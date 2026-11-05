import path from "path";
import { Readable } from "stream";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  createReadStream: vi.fn(),
  spawn: vi.fn(),
  executeRawUnsafe: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: vi.fn(async () => ({
    user: { id: "test-admin" },
  })),
  requireAdminMasterAccess: vi.fn(async () => ({
    user: { id: "test-admin" },
  })),
}));

vi.mock("@/lib/db", () => ({
  db: {
    $executeRawUnsafe: mocks.executeRawUnsafe,
  },
}));

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");

  return {
    ...actual,
    promises: {
      ...actual.promises,
      access: mocks.access,
    },
    createReadStream: mocks.createReadStream,
  };
});

vi.mock("child_process", async () => {
  const actual =
    await vi.importActual<typeof import("child_process")>("child_process");

  return {
    ...actual,
    spawn: mocks.spawn,
  };
});

const ORIGINAL_MASTER_PASSWORD = process.env.DB_RESET_MASTER_PASSWORD;
const ORIGINAL_BACKUP_DIR = process.env.DB_BACKUP_DIR;
const ORIGINAL_APP_ENV = process.env.APP_ENV;

const MASTER_PASSWORD = "unit-test-master-password";
const BACKUP_DIR = path.join(
  process.cwd(),
  "backups",
  "restore-validation-unit",
);

const SAFE_NOT_FOUND_MESSAGE = "ملف النسخة الاحتياطية غير موجود.";

let POST: typeof import("@/app/api/admin/db-maintenance/route").POST;

function restoreRequest(
  action: "restore-products" | "restore-full",
  backupFile?: string,
) {
  return new Request(
    "http://localhost/api/admin/db-maintenance",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action,
        masterPassword: MASTER_PASSWORD,
        ...(backupFile === undefined ? {} : { backupFile }),
      }),
    },
  );
}

async function callPost(request: Request): Promise<Response> {
  const response = await POST(request);

  if (!response) {
    throw new Error(
      "DB maintenance POST unexpectedly returned undefined.",
    );
  }

  return response;
}

async function responseBody(response: Response) {
  return (await response.json()) as {
    message?: string;
  };
}

function expectNoFilesystemLeak(message: string | undefined) {
  expect(typeof message).toBe("string");
  expect(message).toBe(SAFE_NOT_FOUND_MESSAGE);
  expect(message).not.toContain(process.cwd());
  expect(message?.toLowerCase()).not.toContain("backups");
  expect(message).not.toContain(BACKUP_DIR);
}

beforeAll(async () => {
  process.env.APP_ENV = "test";
  process.env.DB_RESET_MASTER_PASSWORD = MASTER_PASSWORD;
  process.env.DB_BACKUP_DIR = BACKUP_DIR;

  const mod = await import(
    "@/app/api/admin/db-maintenance/route"
  );

  POST = mod.POST;
});

beforeEach(() => {
  vi.clearAllMocks();

  mocks.access.mockRejectedValue(
    Object.assign(new Error("ENOENT"), {
      code: "ENOENT",
    }),
  );


  mocks.spawn.mockImplementation(() => {
    throw new Error("simulated restore process failure");
  });
});

afterAll(() => {
  if (ORIGINAL_MASTER_PASSWORD === undefined) {
    delete process.env.DB_RESET_MASTER_PASSWORD;
  } else {
    process.env.DB_RESET_MASTER_PASSWORD =
      ORIGINAL_MASTER_PASSWORD;
  }

  if (ORIGINAL_BACKUP_DIR === undefined) {
    delete process.env.DB_BACKUP_DIR;
  } else {
    process.env.DB_BACKUP_DIR = ORIGINAL_BACKUP_DIR;
  }

  if (ORIGINAL_APP_ENV === undefined) {
    delete process.env.APP_ENV;
  } else {
    process.env.APP_ENV = ORIGINAL_APP_ENV;
  }
});

describe("DB maintenance restore validation", () => {
  describe("restore-products", () => {
    it("returns 400 for path traversal", async () => {
      const response = await callPost(
        restoreRequest(
          "restore-products",
          "../outside.sql.gz",
        ),
      );

      expect(response.status).toBe(400);
      expect(mocks.access).not.toHaveBeenCalled();
    });

    it("returns 400 when backupFile is missing", async () => {
      const response = await callPost(
        restoreRequest("restore-products"),
      );

      expect(response.status).toBe(400);
      expect(mocks.access).not.toHaveBeenCalled();
    });

    it("returns safe 404 for valid nonexistent backup", async () => {
      const response = await callPost(
        restoreRequest(
          "restore-products",
          "missing-products.sql.gz",
        ),
      );

      const body = await responseBody(response);

      expect(response.status).toBe(404);
      expectNoFilesystemLeak(body.message);
      expect(mocks.access).toHaveBeenCalledTimes(1);
    });

    it("keeps corrupt gzip processing failures as 500", async () => {
      mocks.access.mockResolvedValue(undefined);
      mocks.createReadStream.mockImplementationOnce(() =>
        Readable.from(
          Buffer.from("not-a-valid-gzip-stream", "utf8"),
        ),
      );

      const response = await callPost(
        restoreRequest(
          "restore-products",
          "corrupt-existing.sql.gz",
        ),
      );

      expect(response.status).toBe(500);
      expect(response.status).not.toBe(400);
      expect(mocks.access).toHaveBeenCalledTimes(2);
      expect(mocks.createReadStream).toHaveBeenCalledTimes(1);
      expect(mocks.spawn).not.toHaveBeenCalled();
    });
  });

  describe("restore-full", () => {
    it("returns 400 for path traversal", async () => {
      const response = await callPost(
        restoreRequest(
          "restore-full",
          "../outside.sql.gz",
        ),
      );

      expect(response.status).toBe(400);
      expect(mocks.access).not.toHaveBeenCalled();
    });

    it("returns 400 when backupFile is missing", async () => {
      const response = await callPost(
        restoreRequest("restore-full"),
      );

      expect(response.status).toBe(400);
      expect(mocks.access).not.toHaveBeenCalled();
    });

    it("returns safe 404 for valid nonexistent backup", async () => {
      const response = await callPost(
        restoreRequest(
          "restore-full",
          "missing-full.sql.gz",
        ),
      );

      const body = await responseBody(response);

      expect(response.status).toBe(404);
      expectNoFilesystemLeak(body.message);
      expect(mocks.access).toHaveBeenCalledTimes(1);
    });
  });
});