// PRIVATE_PARTNER_RECEIPT_API_SECURITY_V1

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { PutObjectCommand } from "@aws-sdk/client-s3";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: mocks.auth,
}));

vi.mock("@/lib/r2", () => ({
  R2_BUCKET: "fitzone-public-images-test",
  getR2Client: () => ({
    send: mocks.send,
  }),
}));

import { POST } from "@/app/api/admin/partner-receipts/route";
import { GET } from "@/app/api/admin/partner-receipts/[filename]/route";

const filename =
  "1760000000000-550e8400-e29b-41d4-a716-446655440000.jpg";

const privateBucket = "fitzone-private-receipts-test";

const jpeg = Uint8Array.from([255, 216, 255, 217]);

function upload(file?: File) {
  const form = new FormData();

  if (file) {
    form.append("file", file);
  }

  return new Request(
    "http://localhost/api/admin/partner-receipts",
    {
      method: "POST",
      body: form,
    },
  );
}

function validFile() {
  return new File([jpeg], "receipt.jpg", {
    type: "image/jpeg",
  });
}

// FITZONE_TEST_RESPONSE_DEFINED_V2
function expectRouteResponse(
  response: Response | undefined,
): Response {
  if (!response) {
    throw new Error("FAIL=ROUTE_RETURNED_UNDEFINED");
  }
  return response;
}

function view(name = filename) {
  return GET(
    new Request(
      `http://localhost/api/admin/partner-receipts/${name}`,
    ),
    {
      params: Promise.resolve({ filename: name }),
    },
  );
}

describe("Private partner receipt API security", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.stubEnv(
      "R2_PRIVATE_RECEIPTS_BUCKET_NAME",
      privateBucket,
    );

    mocks.auth.mockResolvedValue({
      role: "admin",
      session: { user: { id: "admin-test" } },
    });

    mocks.send.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("denies unauthenticated uploads", async () => {
    mocks.auth.mockResolvedValue({
      error: Response.json(
        { error: "Unauthorized" },
        { status: 401 },
      ),
    });

    const response = expectRouteResponse(await POST(upload(validFile())));

    expect(response.status).toBe(401);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("denies unauthorized staff roles", async () => {
    mocks.auth.mockResolvedValue({
      role: "customer",
    });

    const response = expectRouteResponse(await POST(upload(validFile())));

    expect(response.status).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("rejects uploads without a file", async () => {
    const response = expectRouteResponse(await POST(upload()));

    expect(response.status).toBe(400);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("rejects invalid image signatures", async () => {
    const invalid = new File(
      [Uint8Array.from([1, 2, 3, 4])],
      "receipt.jpg",
      { type: "image/jpeg" },
    );

    const response = expectRouteResponse(await POST(upload(invalid)));

    expect(response.status).toBe(400);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("never uploads to the public bucket", async () => {
    vi.stubEnv(
      "R2_PRIVATE_RECEIPTS_BUCKET_NAME",
      "fitzone-public-images-test",
    );

    const response = expectRouteResponse(await POST(upload(validFile())));

    expect(response.status).toBe(503);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("uploads valid receipts only to private storage", async () => {
    const response = expectRouteResponse(await POST(upload(validFile())));

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.url).toMatch(
      /^\/api\/admin\/partner-receipts\/\d{13}-[0-9a-f-]{36}\.jpg$/,
    );

    expect(response.headers.get("Cache-Control"))
      .toBe("no-store");

    expect(mocks.send).toHaveBeenCalledTimes(1);

    const command = mocks.send.mock.calls[0][0];

    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input.Bucket).toBe(privateBucket);

    expect(command.input.Key).toMatch(
      /^financial-partner-receipts\/\d{13}-[0-9a-f-]{36}\.jpg$/,
    );

    expect(command.input.CacheControl).toContain(
      "private",
    );
  });

  it("denies unauthenticated receipt viewing", async () => {
    mocks.auth.mockResolvedValue({
      error: Response.json(
        { error: "Unauthorized" },
        { status: 401 },
      ),
    });

    const response = expectRouteResponse(await view());

    expect(response.status).toBe(401);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("rejects invalid receipt filenames", async () => {
    const response = expectRouteResponse(await view("invalid.jpg"));

    expect(response.status).toBe(400);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("rejects public bucket configuration on reads", async () => {
    vi.stubEnv(
      "R2_PRIVATE_RECEIPTS_BUCKET_NAME",
      "fitzone-public-images-test",
    );

    const response = expectRouteResponse(await view());

    expect(response.status).toBe(503);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("serves a private receipt without public caching", async () => {
    mocks.send.mockResolvedValue({
      ContentType: "image/jpeg",
      ContentLength: jpeg.length,
      Body: {
        transformToByteArray: async () => jpeg,
      },
    });

    const response = expectRouteResponse(await view());

    expect(response.status).toBe(200);

    expect(response.headers.get("Content-Type"))
      .toContain("image/jpeg");

    expect(response.headers.get("Cache-Control"))
      .toContain("no-store");

    expect(response.headers.get("X-Content-Type-Options"))
      .toBe("nosniff");

    expect(response.headers.get("Cross-Origin-Resource-Policy"))
      .toBe("same-origin");

    expect(
      new Uint8Array(await response.arrayBuffer()),
    ).toEqual(jpeg);

    const command = mocks.send.mock.calls[0][0];

    expect(command.input.Bucket).toBe(privateBucket);

    expect(command.input.Key).toBe(
      `financial-partner-receipts/${filename}`,
    );
  });
});
