import { NextResponse } from "next/server";
import { requireAdminFeature, requireAdminMasterAccess } from "@/lib/admin-guard";
import { db } from "@/lib/db";

const MASTER_PASSWORD = process.env.DB_RESET_MASTER_PASSWORD ?? "";

function ensureMasterPassword(password: string) {
  if (!password || password !== MASTER_PASSWORD) {
    return NextResponse.json({ message: "كلمة المرور الرئيسية غير صحيحة." }, { status: 401 });
  }
  return null;
}

function buildSearchQuery(q: string) {
  if (!q) return undefined;
  return {
    contains: q,
    mode: "insensitive" as const,
  };
}

export async function GET(req: Request) {
  const guard = await requireAdminFeature("db-maintenance");
  if ("error" in guard) return guard.error;
  const masterGuard = await requireAdminMasterAccess("database");
  if ("error" in masterGuard) return masterGuard.error;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "transactions";
  const q = searchParams.get("q")?.trim() ?? "";
  const search = buildSearchQuery(q);

  try {
    if (type === "transactions") {
      const items = await db.paymentTransaction.findMany({
        where: q
          ? {
              OR: [
                { id: search },
                { user: { name: search } },
                { user: { email: search } },
                { providerReference: search },
              ],
            }
          : undefined,
        include: { user: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return NextResponse.json({
        items: items.map((tx) => ({
          id: tx.id,
          userName: tx.user?.name ?? null,
          userEmail: tx.user?.email ?? null,
          amount: tx.amount,
          status: tx.status,
          paymentMethod: tx.paymentMethod,
          createdAt: tx.createdAt.toLocaleString("ar-EG"),
        })),
      });
    }

    if (type === "orders") {
      const items = await db.order.findMany({
        where: q
          ? {
              OR: [{ id: search }, { user: { name: search } }, { user: { email: search } }],
            }
          : undefined,
        include: { user: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return NextResponse.json({
        items: items.map((order) => ({
          id: order.id,
          userName: order.user?.name ?? null,
          userEmail: order.user?.email ?? null,
          total: order.total,
          status: order.status,
          createdAt: order.createdAt.toLocaleString("ar-EG"),
        })),
      });
    }

    if (type === "memberships") {
      const items = await db.userMembership.findMany({
        where: q
          ? {
              OR: [
                { id: search },
                { user: { name: search } },
                { user: { email: search } },
                { membership: { name: search } },
              ],
            }
          : undefined,
        include: { user: true, membership: true },
        orderBy: { startDate: "desc" },
        take: 200,
      });
      return NextResponse.json({
        items: items.map((membership) => ({
          id: membership.id,
          userName: membership.user?.name ?? null,
          userEmail: membership.user?.email ?? null,
          membershipName: membership.membership?.name ?? null,
          status: membership.status,
          startDate: membership.startDate.toLocaleDateString("ar-EG"),
          endDate: membership.endDate.toLocaleDateString("ar-EG"),
        })),
      });
    }

    if (type === "plans") {
      const items = await db.membership.findMany({
        where: q
          ? {
              OR: [{ id: search }, { name: search }],
            }
          : undefined,
        orderBy: { sortOrder: "asc" },
        take: 300,
      });
      return NextResponse.json({
        items: items.map((plan) => ({
          id: plan.id,
          name: plan.name,
          kind: plan.kind,
          price: plan.price,
          priceBefore: plan.priceBefore,
          priceAfter: plan.priceAfter,
          duration: plan.duration,
          sessionsCount: plan.sessionsCount,
          isActive: plan.isActive,
        })),
      });
    }

    if (type === "offers") {
      const items = await db.offer.findMany({
        where: q
          ? {
              OR: [{ id: search }, { title: search }],
            }
          : undefined,
        orderBy: { expiresAt: "desc" },
        take: 300,
      });
      return NextResponse.json({
        items: items.map((offer) => ({
          id: offer.id,
          title: offer.title,
          type: offer.type,
          discount: offer.discount,
          isActive: offer.isActive,
          showOnHome: offer.showOnHome,
          expiresAt: offer.expiresAt.toLocaleDateString("ar-EG"),
        })),
      });
    }

    if (type === "users") {
      const items = await db.user.findMany({
        where: q
          ? {
              OR: [{ id: search }, { name: search }, { email: search }],
            }
          : undefined,
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return NextResponse.json({
        items: items.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt.toLocaleDateString("ar-EG"),
        })),
      });
    }

    if (type === "inventoryMovements") {
      const items = await db.inventoryMovement.findMany({
        where: q
          ? {
              OR: [
                { id: search },
                { product: { name: search } },
                { referenceType: search },
                { referenceId: search },
              ],
            }
          : undefined,
        include: { product: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 300,
      });
      return NextResponse.json({
        items: items.map((m) => ({
          id: m.id,
          productName: m.product?.name ?? m.productId,
          type: m.type,
          quantityChange: m.quantityChange,
          quantityBefore: m.quantityBefore,
          quantityAfter: m.quantityAfter,
          unitCost: m.unitCost,
          referenceType: m.referenceType,
          referenceId: m.referenceId,
          notes: m.notes,
          createdAt: m.createdAt.toLocaleString("ar-EG"),
        })),
      });
    }

    if (type === "partners") {
      const items = await db.partner.findMany({
        where: q ? { OR: [{ id: search }, { name: search }] } : undefined,
        include: { linkedUser: { select: { email: true } } },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return NextResponse.json({
        items: items.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          email: p.linkedUser?.email ?? null,
          commissionRate: p.commissionRate,
          commissionType: p.commissionType,
          isActive: p.isActive,
          createdAt: p.createdAt.toLocaleDateString("ar-EG"),
        })),
      });
    }

    if (type === "partnerCommissions") {
      const items = await db.partnerCommission.findMany({
        where: q
          ? { OR: [{ id: search }, { partner: { name: search } }, { user: { name: search } }, { user: { email: search } }] }
          : undefined,
        include: {
          partner: { select: { name: true } },
          user: { select: { name: true, email: true } },
          membership: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return NextResponse.json({
        items: items.map((c) => ({
          id: c.id,
          partnerName: c.partner.name,
          customerName: c.user.name ?? null,
          customerEmail: c.user.email ?? null,
          membershipName: c.membership?.name ?? null,
          amount: c.amount,
          status: c.status,
          createdAt: c.createdAt.toLocaleDateString("ar-EG"),
        })),
      });
    }

    if (type === "partnerWithdrawals") {
      const items = await db.partnerWithdrawalRequest.findMany({
        where: q ? { OR: [{ id: search }, { partner: { name: search } }] } : undefined,
        include: { partner: { select: { name: true, category: true } } },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return NextResponse.json({
        items: items.map((w) => ({
          id: w.id,
          partnerName: w.partner.name,
          partnerCategory: w.partner.category,
          amount: w.amount,
          status: w.status,
          adminNotes: w.adminNotes ?? null,
          createdAt: w.createdAt.toLocaleDateString("ar-EG"),
          processedAt: w.processedAt?.toLocaleDateString("ar-EG") ?? null,
        })),
      });
    }

    return NextResponse.json({ items: [] });
  } catch (error) {
    console.error("[DB_MAINTENANCE_RECORDS_GET]", error);
    return NextResponse.json({ items: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const guard = await requireAdminFeature("db-maintenance");
  if ("error" in guard) return guard.error;
  const masterGuard = await requireAdminMasterAccess("database");
  if ("error" in masterGuard) return masterGuard.error;

  try {
    const body = await req.json();
    const action = String(body?.action ?? "");
    const type = String(body?.type ?? "");
    const id = String(body?.id ?? "");
    const masterPassword = String(body?.masterPassword ?? "");
    const payload = body?.payload ?? {};

    const authError = ensureMasterPassword(masterPassword);
    if (authError) return authError;

    if (!id || !type) {
      return NextResponse.json({ message: "بيانات غير مكتملة." }, { status: 400 });
    }

    if (action === "delete") {
      if (type === "transactions") await db.paymentTransaction.delete({ where: { id } });
      if (type === "orders") await db.order.delete({ where: { id } });
      if (type === "memberships") await db.userMembership.delete({ where: { id } });
      if (type === "plans") await db.membership.delete({ where: { id } });
      if (type === "offers") await db.offer.delete({ where: { id } });
      if (type === "users") await db.user.delete({ where: { id } });
      if (type === "inventoryMovements") await db.inventoryMovement.delete({ where: { id } });
      if (type === "partners") await db.partner.delete({ where: { id } });
      if (type === "partnerCommissions") await db.partnerCommission.delete({ where: { id } });
      if (type === "partnerWithdrawals") await db.partnerWithdrawalRequest.delete({ where: { id } });
      return NextResponse.json({ message: "تم حذف السجل بنجاح." });
    }

    if (action === "update-status") {
      const status = String(body?.status ?? "");
      if (!status) return NextResponse.json({ message: "الحالة مطلوبة." }, { status: 400 });
      if (type === "transactions") await db.paymentTransaction.update({ where: { id }, data: { status } });
      if (type === "orders") await db.order.update({ where: { id }, data: { status } });
      if (type === "memberships") await db.userMembership.update({ where: { id }, data: { status } });
      if (type === "offers") await db.offer.update({ where: { id }, data: { isActive: status === "active" } });
      if (type === "plans") await db.membership.update({ where: { id }, data: { isActive: status === "active" } });
      return NextResponse.json({ message: "تم تحديث الحالة بنجاح." });
    }

    if (action === "update") {
      if (type === "plans") {
        await db.membership.update({
          where: { id },
          data: {
            name: typeof payload.name === "string" ? payload.name : undefined,
            kind: typeof payload.kind === "string" ? payload.kind : undefined,
            price: typeof payload.price === "number" ? payload.price : undefined,
            priceBefore: typeof payload.priceBefore === "number" ? payload.priceBefore : payload.priceBefore === null ? null : undefined,
            priceAfter: typeof payload.priceAfter === "number" ? payload.priceAfter : payload.priceAfter === null ? null : undefined,
            duration: typeof payload.duration === "number" ? payload.duration : undefined,
            sessionsCount: typeof payload.sessionsCount === "number" ? payload.sessionsCount : undefined,
            isActive: typeof payload.isActive === "boolean" ? payload.isActive : undefined,
          },
        });
      }

      if (type === "offers") {
        await db.offer.update({
          where: { id },
          data: {
            title: typeof payload.title === "string" ? payload.title : undefined,
            discount: typeof payload.discount === "number" ? payload.discount : undefined,
            type: typeof payload.type === "string" ? payload.type : undefined,
            isActive: typeof payload.isActive === "boolean" ? payload.isActive : undefined,
            showOnHome: typeof payload.showOnHome === "boolean" ? payload.showOnHome : undefined,
            expiresAt: typeof payload.expiresAt === "string" ? new Date(payload.expiresAt) : undefined,
          },
        });
      }

      if (type === "users") {
        await db.user.update({
          where: { id },
          data: {
            name: typeof payload.name === "string" ? payload.name : undefined,
            email: typeof payload.email === "string" ? payload.email : undefined,
            phone: typeof payload.phone === "string" ? payload.phone : undefined,
            role: typeof payload.role === "string" ? payload.role : undefined,
          },
        });
      }

      if (type === "transactions") {
        await db.paymentTransaction.update({
          where: { id },
          data: {
            status: typeof payload.status === "string" ? payload.status : undefined,
            paymentMethod: typeof payload.paymentMethod === "string" ? payload.paymentMethod : undefined,
            amount: typeof payload.amount === "number" ? payload.amount : undefined,
          },
        });
      }

      if (type === "orders") {
        await db.order.update({
          where: { id },
          data: {
            status: typeof payload.status === "string" ? payload.status : undefined,
            paymentMethod: typeof payload.paymentMethod === "string" ? payload.paymentMethod : undefined,
            shippingFee: typeof payload.shippingFee === "number" ? payload.shippingFee : undefined,
          },
        });
      }

      if (type === "memberships") {
        await db.userMembership.update({
          where: { id },
          data: {
            status: typeof payload.status === "string" ? payload.status : undefined,
            endDate: typeof payload.endDate === "string" ? new Date(payload.endDate) : undefined,
          },
        });
      }

      return NextResponse.json({ message: "تم تحديث السجل بنجاح." });
    }

    return NextResponse.json({ message: "طلب غير صالح." }, { status: 400 });
  } catch (error) {
    console.error("[DB_MAINTENANCE_RECORDS_POST]", error);
    return NextResponse.json({ message: "تعذر تنفيذ العملية الآن." }, { status: 500 });
  }
}
