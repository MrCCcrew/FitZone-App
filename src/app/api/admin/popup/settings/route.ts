import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const MAIN_ID = "main";

const DEFAULTS = {
  enabled: false,
  ribbonText: "💗 PINK FRIDAY — لفترة محدودة",
  endDate: null as Date | null,
  showDelaySeconds: 2.5,
  hideHours: 24,
};

type SettingsInput = {
  enabled?: unknown;
  ribbonText?: unknown;
  endDate?: unknown;
  showDelaySeconds?: unknown;
  hideHours?: unknown;
};

async function requirePopupAdmin() {
  const session = await getAdminSession();

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  if (session.role !== "admin") {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  return null;
}

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET() {
  const denied = await requirePopupAdmin();
  if (denied) return noStore(denied);

  try {
    const settings = await db.popupSettings.findUnique({
      where: { id: MAIN_ID },
    });

    return noStore(NextResponse.json({
      settings: settings ?? {
        id: MAIN_ID,
        ...DEFAULTS,
        updatedAt: null,
      },
    }));
  } catch {
    return noStore(NextResponse.json(
      { error: "Unable to load popup settings" },
      { status: 500 },
    ));
  }
}

export async function PATCH(request: Request) {
  const denied = await requirePopupAdmin();
  if (denied) return noStore(denied);

  let input: SettingsInput;

  try {
    const body: unknown = await request.json();

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return noStore(NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      ));
    }

    input = body as SettingsInput;

    if (
      "expectedRevision" in (body as Record<string, unknown>) &&
      Number.isInteger((body as Record<string, unknown>).expectedRevision)
    ) {
      return noStore(NextResponse.json(
        { error: "Use the atomic popup save endpoint" },
        { status: 409 },
      ));
    }
  } catch {
    return noStore(NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400 },
    ));
  }

  const allowed = new Set([
    "enabled",
    "ribbonText",
    "endDate",
    "showDelaySeconds",
    "hideHours",
  ]);

  if (Object.keys(input).some((key) => !allowed.has(key))) {
    return noStore(NextResponse.json(
      { error: "Unsupported setting" },
      { status: 400 },
    ));
  }

  if (Object.keys(input).length === 0) {
    return noStore(NextResponse.json(
      { error: "No settings provided" },
      { status: 400 },
    ));
  }

  if (
    input.enabled !== undefined &&
    typeof input.enabled !== "boolean"
  ) {
    return noStore(NextResponse.json(
      { error: "enabled must be a boolean" },
      { status: 400 },
    ));
  }

  if (
    input.ribbonText !== undefined &&
    (typeof input.ribbonText !== "string" ||
      input.ribbonText.trim().length === 0 ||
      input.ribbonText.length > 191)
  ) {
    return noStore(NextResponse.json(
      { error: "Invalid ribbon text" },
      { status: 400 },
    ));
  }

  if (
    input.showDelaySeconds !== undefined &&
    (typeof input.showDelaySeconds !== "number" ||
      !Number.isFinite(input.showDelaySeconds) ||
      input.showDelaySeconds < 0 ||
      input.showDelaySeconds > 60)
  ) {
    return noStore(NextResponse.json(
      { error: "Delay must be between 0 and 60 seconds" },
      { status: 400 },
    ));
  }

  if (
    input.hideHours !== undefined &&
    (typeof input.hideHours !== "number" ||
      !Number.isInteger(input.hideHours) ||
      input.hideHours < 0 ||
      input.hideHours > 720)
  ) {
    return noStore(NextResponse.json(
      { error: "Hide duration must be between 0 and 720 hours" },
      { status: 400 },
    ));
  }

  let parsedEndDate: Date | null | undefined;

  if (input.endDate !== undefined) {
    if (input.endDate === null) {
      parsedEndDate = null;
    } else if (
      typeof input.endDate === "string" &&
      /(Z|[+-]\d{2}:\d{2})$/i.test(input.endDate)
    ) {
      const parsed = new Date(input.endDate);

      if (Number.isNaN(parsed.getTime())) {
        return noStore(NextResponse.json(
          { error: "Invalid end date" },
          { status: 400 },
        ));
      }

      parsedEndDate = parsed;
    } else {
      return noStore(NextResponse.json(
        { error: "End date must include a timezone" },
        { status: 400 },
      ));
    }
  }

  return noStore(NextResponse.json(
    { error: "Use the atomic popup save endpoint" },
    { status: 409 },
  ));
}
