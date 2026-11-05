import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireAdminFeature } from "@/lib/admin-guard";
import { canAccessAdminFeature } from "@/lib/admin-permissions";

export const dynamic = "force-dynamic";

type ActionCenterItem = {
  id: string;
  type: string;
  status: "pending";
  sourceSection: string;
  sourceLabel: string;
  requesterType: string;
  requesterId: string | null;
  requesterName: string;
  title: string;
  description: string;
  createdAt: string;
  priority: "normal" | "high";
  actionSection: string;
  targetType: string;
  targetId: string;
};

function safeName(
  name?: string | null,
  email?: string | null,
  phone?: string | null,
  fallback = "غير معروف",
) {
  return name?.trim() || email?.trim() || phone?.trim() || fallback;
}

export async function GET() {
  const guard = await requireAdminFeature("approvals");

  if ("error" in guard) {
    return guard.error;
  }

  const items: ActionCenterItem[] = [];

  const role = guard.role;
  const permissions = guard.permissions;
  const currentUserId = guard.session.user.id;

  /*
   * 1. Booking reschedule requests
   *
   * Visible to administrative users who have bookings access.
   * The original BookingRescheduleRequest remains the source of truth.
   */
  if (
    canAccessAdminFeature(
      role,
      permissions,
      "bookings",
    )
  ) {
    const requests =
      await db.bookingRescheduleRequest.findMany({
        where: {
          status: "pending",
        },
        orderBy: {
          requestedAt: "desc",
        },
        take: 100,
        include: {
          booking: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                },
              },
              schedule: {
                include: {
                  class: true,
                },
              },
            },
          },
          targetSchedule: {
            include: {
              class: true,
            },
          },
        },
      });

    for (const request of requests) {
      items.push({
        id: `booking_reschedule:${request.id}`,
        type: "booking_reschedule",
        status: "pending",
        sourceSection: "bookings",
        sourceLabel: "الحجوزات",
        requesterType: "customer",
        requesterId: request.booking.user.id,
        requesterName: safeName(
          request.booking.user.name,
          request.booking.user.email,
          request.booking.user.phone,
          "عميلة",
        ),
        title:
          request.requestType === "past_absence_makeup"
            ? "طلب تعويض حصة سابقة"
            : "طلب تغيير موعد حجز",
        description:
          request.requestType === "past_absence_makeup"
            ? `${request.booking.schedule.class.name}: تعويض حصة سابقة → ${request.targetSchedule.time}. ` +
              `السبب: ${request.absenceReason || "-"}`
            : `${request.booking.schedule.class.name}: ` +
              `${request.booking.schedule.time} → ` +
              `${request.targetSchedule.time}`,
        createdAt: request.requestedAt.toISOString(),
        priority: "normal",
        actionSection: "bookings",
        targetType: "booking",
        targetId: request.booking.id,
      });
    }
  }

  /*
   * 2. Class exchange requests
   *
   * Only users who can actually review class-exchange requests
   * should receive these items in their approval badge/count.
   * ClassExchangeRequest remains the source of truth.
   */
  if (
    canAccessAdminFeature(
      role,
      permissions,
      "bookings",
    ) &&
    (
      role === "admin" ||
      permissions.includes(
        "class_exchanges_review",
      )
    )
  ) {
    const requests =
      await db.classExchangeRequest.findMany({
        where: {
          status: "pending",
          archivedAt: null,
        },
        orderBy: {
          requestedAt: "desc",
        },
        take: 100,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          userMembership: {
            include: {
              membership: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          targetSchedule: {
            include: {
              class: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

    for (const request of requests) {
      items.push({
        id: `class_exchange:${request.id}`,
        type: "class_exchange",
        status: "pending",
        sourceSection: "bookings",
        sourceLabel: "استبدال الكلاسات",
        requesterType: "customer",
        requesterId: request.user.id,
        requesterName: safeName(
          request.user.name,
          request.user.email,
          request.user.phone,
          "عميلة",
        ),
        title: "طلب استبدال كلاس",
        description:
          `${request.userMembership.membership.name}: ` +
          `طلب استبدال حصتين بكلاس ` +
          `${request.targetSchedule.class.name}` +
          (request.note
            ? ` — ${request.note.slice(0, 120)}`
            : ""),
        createdAt:
          request.requestedAt.toISOString(),
        priority: "high",
        actionSection: "bookings",
        targetType: "class_exchange_request",
        targetId: request.id,
      });
    }
  }

  /*
   * 3. Partner withdrawal requests
   *
   * The actual PATCH endpoint permits approval/rejection only
   * for admin and staff.
   */
  if (
    (role === "admin" || role === "staff") &&
    canAccessAdminFeature(
      role,
      permissions,
      "partners",
    )
  ) {
    const withdrawals =
      await db.partnerWithdrawalRequest.findMany({
        where: {
          status: "pending",
        },
        include: {
          partner: {
            select: {
              id: true,
              name: true,
              category: true,
              contactPhone: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 100,
      });

    for (const request of withdrawals) {
      items.push({
        id: `partner_withdrawal:${request.id}`,
        type: "partner_withdrawal",
        status: "pending",
        sourceSection: "partners",
        sourceLabel: "الشركاء",
        requesterType: "partner",
        requesterId: request.partner.id,
        requesterName: safeName(
          request.partner.name,
          null,
          request.partner.contactPhone,
          "شريك",
        ),
        title: "طلب سحب عمولة",
        description:
          `قيمة طلب السحب: ` +
          `${request.amount.toLocaleString("ar-EG")} ج.م`,
        createdAt: request.createdAt.toISOString(),
        priority: "high",
        actionSection: "partners",
        targetType: "partner_withdrawal",
        targetId: request.id,
      });
    }
  }

  /*
   * 4. Trainer-created customer accounts
   *
   * Existing customers API allows approval/rejection only
   * for admin and head_coach.
   */
  if (
    (role === "admin" || role === "head_coach") &&
    canAccessAdminFeature(
      role,
      permissions,
      "customers",
    )
  ) {
    const customers = await db.user.findMany({
      where: {
        role: "member",
        pendingApproval: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    });

    for (const customer of customers) {
      items.push({
        id: `customer_approval:${customer.id}`,
        type: "customer_approval",
        status: "pending",
        sourceSection: "customers",
        sourceLabel: "العملاء",
        requesterType: "customer",
        requesterId: customer.id,
        requesterName: safeName(
          customer.name,
          customer.email,
          customer.phone,
          "عميل جديد",
        ),
        title: "حساب عميل ينتظر الاعتماد",
        description:
          "حساب أنشأته مدربة ويحتاج موافقة الإدارة قبل التفعيل.",
        createdAt: customer.createdAt.toISOString(),
        priority: "normal",
        actionSection: "customers",
        targetType: "customer",
        targetId: customer.id,
      });
    }
  }

  /*
   * 5. Private / mini-private applications
   *
   * Trainers can only see applications assigned to themselves,
   * matching the existing private-session API.
   */
  if (
    canAccessAdminFeature(
      role,
      permissions,
      "trainers",
    )
  ) {
    let trainerId: string | undefined;

    if (role === "trainer") {
      const ownTrainer =
        await db.trainer.findFirst({
          where: {
            userId: currentUserId,
          },
          select: {
            id: true,
          },
        });

      trainerId = ownTrainer?.id;

      // A trainer without a linked Trainer record sees no applications.
      if (!trainerId) {
        trainerId = "__none__";
      }
    }

    const applications =
      await db.privateSessionApplication.findMany({
        where: {
          status: "pending",
          ...(trainerId
            ? { trainerId }
            : {}),
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          trainer: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 100,
      });

    for (const application of applications) {
      items.push({
        id: `private_session:${application.id}`,
        type: "private_session",
        status: "pending",
        sourceSection: "trainers",
        sourceLabel: "الجلسات الخاصة",
        requesterType: "customer",
        requesterId: application.user.id,
        requesterName: safeName(
          application.user.name,
          application.user.email,
          application.user.phone,
          "عميلة",
        ),
        title:
          application.type === "mini_private"
            ? "طلب ميني برايفيت"
            : "طلب برايفيت",
        description:
          `المدربة: ${application.trainer.name}`,
        createdAt: application.createdAt.toISOString(),
        priority: "normal",
        actionSection: "trainers",
        targetType: "private_session_application",
        targetId: application.id,
      });
    }
  }

  /*
   * 6. Testimonials awaiting review
   */
  if (
    canAccessAdminFeature(
      role,
      permissions,
      "reviews",
    )
  ) {
    const testimonials =
      await db.testimonial.findMany({
        where: {
          status: "pending",
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 100,
      });

    for (const testimonial of testimonials) {
      items.push({
        id: `testimonial:${testimonial.id}`,
        type: "testimonial",
        status: "pending",
        sourceSection: "reviews",
        sourceLabel: "آراء العملاء",
        requesterType: "customer",
        requesterId: testimonial.user.id,
        requesterName: safeName(
          testimonial.user.name,
          testimonial.user.email,
          null,
          "عميلة",
        ),
        title: "رأي جديد ينتظر المراجعة",
        description:
          `${testimonial.rating}/5 — ` +
          testimonial.content.slice(0, 120),
        createdAt: testimonial.createdAt.toISOString(),
        priority: "normal",
        actionSection: "reviews",
        targetType: "testimonial",
        targetId: testimonial.id,
      });
    }
  }

  /*
   * 7. Pending blog posts
   *
   * Approval PATCH requires site-content permission.
   * Therefore users who only possess blog submission permission
   * do not receive an approval badge for these items.
   */
  if (
    canAccessAdminFeature(
      role,
      permissions,
      "site-content",
    )
  ) {
    const posts =
      await db.blogPendingPost.findMany({
        where: {
          status: "pending",
        },
        include: {
          submitter: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 100,
      });

    for (const post of posts) {
      items.push({
        id: `blog_post:${post.id}`,
        type: "blog_post",
        status: "pending",
        sourceSection: "blog-pending",
        sourceLabel: "المدونة",
        requesterType:
          post.submitter.role === "partner"
            ? "partner"
            : post.submitter.role === "trainer"
              ? "trainer"
              : post.submitter.role === "staff"
                ? "staff"
                : "staff",
        requesterId: post.submitter.id,
        requesterName: safeName(
          post.submitter.name,
          post.submitter.email,
          null,
          "مستخدم إداري",
        ),
        title: "مقال ينتظر الموافقة على النشر",
        description: post.title,
        createdAt: post.createdAt.toISOString(),
        priority: "normal",
        actionSection: "blog-pending",
        targetType: "blog_pending_post",
        targetId: post.id,
      });
    }
  }

  items.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() -
      new Date(a.createdAt).getTime(),
  );

  return NextResponse.json(
    {
      pendingCount: items.length,
      items,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
