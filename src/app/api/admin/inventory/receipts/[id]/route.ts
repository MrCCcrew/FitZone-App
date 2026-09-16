import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";

async function checkAdmin() {
  const guard = await requireAdminFeature("inventory");
  return "error" in guard ? guard.error : null;
}

/**
 * Legacy receipt mutation endpoint.
 *
 * Receipt edits/deletes are intentionally disabled.
 *
 * Canonical lifecycle:
 * - create receipt:
 *     POST /api/admin/inventory/receipts
 *
 * - void receipt safely:
 *     PATCH /api/admin/inventory/receipts
 *     action=void
 *
 * - relink a receipt after financial invoice cancellation:
 *     PATCH /api/admin/inventory/receipts
 *     action=relink_purchase_invoice
 *
 * Posted receipts must never be destructively rewritten or deleted because
 * they participate in inventory quantity/WAC history and Supplier/AP linkage.
 */

export async function PATCH(
  _req: Request,
  _context: { params: Promise<{ id: string }> },
) {
  const error = await checkAdmin();
  if (error) return error;

  return NextResponse.json(
    {
      error:
        "تعديل إيصال الاستلام مباشرةً غير مسموح. استخدم دورة الإلغاء أو تغيير الربط المعتمدة.",
    },
    { status: 405 },
  );
}

export async function DELETE(
  _req: Request,
  _context: { params: Promise<{ id: string }> },
) {
  const error = await checkAdmin();
  if (error) return error;

  return NextResponse.json(
    {
      error:
        "حذف إيصال الاستلام مباشرةً غير مسموح. استخدم PATCH action=void من مسار الإيصالات الرئيسي.",
    },
    { status: 405 },
  );
}
