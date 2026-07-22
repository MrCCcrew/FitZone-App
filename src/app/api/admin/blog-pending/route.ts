import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit-context";
import { clearPublicApiCache } from "@/lib/public-cache";

async function checkAdmin() {
  const guard = await requireAdminFeature("blog");
  return "error" in guard
    ? { error: guard.error, role: null, userId: null }
    : { error: null, role: guard.role, userId: guard.session.user.id };
}

// GET /api/admin/blog-pending — get pending blog posts
export async function GET(req: Request) {
  const { error, userId, role } = await checkAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "all";

  // If admin/staff, show all pending posts
  // If contracts_manager, show only their own posts
  const where: Record<string, unknown> = {};
  if (status !== "all") where.status = status;
  if (role === "contracts_manager") where.submittedBy = userId;

  const posts = await db.blogPendingPost.findMany({
    where,
    include: {
      submitter: { select: { id: true, name: true, email: true } },
      reviewer: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ posts });
}

// POST /api/admin/blog-pending — create/update pending blog post
export async function POST(req: Request) {
  const { error, userId, role } = await checkAdmin();
  if (error) return error;

  const body = await req.json() as {
    postId?: string; // for editing existing pending post
    title: string;
    titleEn?: string;
    category: string;
    categoryEn?: string;
    author: string;
    authorEn?: string;
    date: string;
    dateEn?: string;
    readTime: string;
    readTimeEn?: string;
    featured: boolean;
    summary: string;
    summaryEn?: string;
    content: string;
    contentEn?: string;
    coverImage: string;
    videoUrl: string;
    existingPostId?: string; // if editing published post
  };

  if (!body.title || !body.content) {
    return NextResponse.json({ error: "العنوان والمحتوى مطلوبان" }, { status: 400 });
  }

  const data = {
    submittedBy: userId!,
    status: "pending",
    title: body.title,
    titleEn: body.titleEn ?? null,
    category: body.category,
    categoryEn: body.categoryEn ?? null,
    author: body.author,
    authorEn: body.authorEn ?? null,
    date: body.date,
    dateEn: body.dateEn ?? null,
    readTime: body.readTime,
    readTimeEn: body.readTimeEn ?? null,
    featured: body.featured,
    summary: body.summary,
    summaryEn: body.summaryEn ?? null,
    content: body.content,
    contentEn: body.contentEn ?? null,
    coverImage: body.coverImage,
    videoUrl: body.videoUrl,
    existingPostId: body.existingPostId ?? null,
  };

  let post;
  if (body.postId) {
    // Update existing pending post
    // Only allow submitter to edit their own pending posts
    const existing = await db.blogPendingPost.findUnique({ where: { id: body.postId } });
    if (!existing) {
      return NextResponse.json({ error: "المقال غير موجود" }, { status: 404 });
    }
    if (existing.submittedBy !== userId && role !== "admin" && role !== "staff") {
      return NextResponse.json({ error: "غير مصرح لك بتعديل هذا المقال" }, { status: 403 });
    }

    post = await db.blogPendingPost.update({
      where: { id: body.postId },
      data,
    });
    await logAudit({
      action: "update_pending_blog_post",
      targetType: "BlogPendingPost",
      targetId: post.id,
    });
  } else {
    // Create new pending post
    post = await db.blogPendingPost.create({ data });
    await logAudit({
      action: "create_pending_blog_post",
      targetType: "BlogPendingPost",
      targetId: post.id,
    });

    // TODO: Send notification to admin
    // await sendPushNotification(adminUserId, {
    //   title: "طلب نشر مقال جديد في المدونة",
    //   body: `${submitterName} يطلب نشر مقال: ${body.title}`,
    // });
  }

  return NextResponse.json({ post });
}

// PATCH /api/admin/blog-pending — approve/reject pending post (admin only)
export async function PATCH(req: Request) {
  const guard = await requireAdminFeature("site-content"); // requires site-content permission
  if ("error" in guard) return guard.error;
  const userId = guard.session.user.id;

  const body = await req.json() as {
    postId: string;
    action: "approve" | "reject";
    rejectReason?: string;
  };

  if (!body.postId || !body.action) {
    return NextResponse.json({ error: "postId و action مطلوبان" }, { status: 400 });
  }

  const post = await db.blogPendingPost.findUnique({ where: { id: body.postId } });
  if (!post) {
    return NextResponse.json({ error: "المقال غير موجود" }, { status: 404 });
  }

  if (post.status !== "pending") {
    return NextResponse.json({ error: "هذا المقال تمت مراجعته بالفعل" }, { status: 400 });
  }

  if (body.action === "approve") {
    // Get current blog content
    const siteContent = await db.siteContent.findUnique({ where: { section: "blog" } });
    const blogData = siteContent ? JSON.parse(siteContent.content) as { posts?: unknown[] } : { posts: [] };
    const posts = Array.isArray(blogData.posts) ? blogData.posts : [];

    // Create new post object
    const newPost = {
      id: post.existingPostId || `post-${Date.now()}`,
      title: post.title,
      titleEn: post.titleEn,
      category: post.category,
      categoryEn: post.categoryEn,
      author: post.author,
      authorEn: post.authorEn,
      date: post.date,
      dateEn: post.dateEn,
      readTime: post.readTime,
      readTimeEn: post.readTimeEn,
      featured: post.featured,
      summary: post.summary,
      summaryEn: post.summaryEn,
      content: post.content,
      contentEn: post.contentEn,
      coverImage: post.coverImage,
      videoUrl: post.videoUrl,
      active: true,
    };

    // If editing existing post, replace it; otherwise add new
    const updatedPosts = post.existingPostId
      ? posts.map((p: any) => (p.id === post.existingPostId ? newPost : p))
      : [...posts, newPost];

    // Update site content
    await db.siteContent.upsert({
      where: { section: "blog" },
      update: { content: JSON.stringify({ ...blogData, posts: updatedPosts }) },
      create: { section: "blog", content: JSON.stringify({ ...blogData, posts: updatedPosts }) },
    });

    // Update pending post status
    await db.blogPendingPost.update({
      where: { id: body.postId },
      data: {
        status: "approved",
        reviewedBy: userId,
        reviewedAt: new Date(),
      },
    });

    await clearPublicApiCache();
    await logAudit({
      action: "approve_blog_post",
      targetType: "BlogPendingPost",
      targetId: body.postId,
    });

    // TODO: Send notification to submitter
    // await sendPushNotification(post.submittedBy, {
    //   title: "تمت الموافقة على مقالك",
    //   body: `تم نشر مقالك "${post.title}" في المدونة`,
    // });
  } else {
    // Reject
    await db.blogPendingPost.update({
      where: { id: body.postId },
      data: {
        status: "rejected",
        reviewedBy: userId,
        reviewedAt: new Date(),
        rejectReason: body.rejectReason ?? null,
      },
    });

    await logAudit({
      action: "reject_blog_post",
      targetType: "BlogPendingPost",
      targetId: body.postId,
      details: body.rejectReason ? { reason: body.rejectReason } : null,
    });

    // TODO: Send notification to submitter
    // await sendPushNotification(post.submittedBy, {
    //   title: "تم رفض مقالك",
    //   body: body.rejectReason ?? "يرجى التواصل مع الإدارة لمعرفة السبب",
    // });
  }

  const updated = await db.blogPendingPost.findUnique({
    where: { id: body.postId },
    include: {
      submitter: { select: { id: true, name: true, email: true } },
      reviewer: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({ post: updated });
}

// DELETE /api/admin/blog-pending — delete pending post
export async function DELETE(req: Request) {
  const { error, userId, role } = await checkAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const postId = searchParams.get("postId");

  if (!postId) {
    return NextResponse.json({ error: "postId مطلوب" }, { status: 400 });
  }

  const post = await db.blogPendingPost.findUnique({ where: { id: postId } });
  if (!post) {
    return NextResponse.json({ error: "المقال غير موجود" }, { status: 404 });
  }

  // Only submitter or admin can delete
  if (post.submittedBy !== userId && role !== "admin" && role !== "staff") {
    return NextResponse.json({ error: "غير مصرح لك بحذف هذا المقال" }, { status: 403 });
  }

  await db.blogPendingPost.delete({ where: { id: postId } });
  await logAudit({
    action: "delete_pending_blog_post",
    targetType: "BlogPendingPost",
    targetId: postId,
  });

  return NextResponse.json({ ok: true });
}
