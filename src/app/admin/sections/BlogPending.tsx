"use client";

import { useCallback, useEffect, useState } from "react";

// Allowed YouTube hostnames (strict allowlist)
const ALLOWED_YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

// Helper: Extract safe YouTube video ID from URL
function getYouTubeEmbedUrl(url: string): string | null {
  if (!url) return null;

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    // Strict hostname check - only allow trusted YouTube domains
    if (!ALLOWED_YOUTUBE_HOSTS.has(hostname)) {
      return null;
    }

    let videoId: string | null = null;

    // youtube.com/watch?v=VIDEO_ID
    if (hostname !== 'youtu.be' && urlObj.pathname === '/watch') {
      videoId = urlObj.searchParams.get('v');
    }
    // youtu.be/VIDEO_ID
    else if (hostname === 'youtu.be') {
      videoId = urlObj.pathname.slice(1); // remove leading /
    }
    // youtube.com/shorts/VIDEO_ID
    else if (hostname !== 'youtu.be' && urlObj.pathname.startsWith('/shorts/')) {
      videoId = urlObj.pathname.split('/')[2];
    }
    // youtube.com/embed/VIDEO_ID
    else if (hostname !== 'youtu.be' && urlObj.pathname.startsWith('/embed/')) {
      videoId = urlObj.pathname.split('/')[2];
    }

    // Validate video ID format (alphanumeric, underscore, hyphen only - typically 11 chars, allow 10-12)
    if (videoId && /^[a-zA-Z0-9_-]{10,12}$/.test(videoId)) {
      return `https://www.youtube.com/embed/${videoId}`;
    }
  } catch {
    return null;
  }

  return null;
}

type PendingPost = {
  id: string;
  title: string;              // NOT NULL
  titleEn: string | null;
  category: string;           // NOT NULL
  categoryEn: string | null;
  author: string;             // NOT NULL
  authorEn: string | null;
  date: string;               // NOT NULL
  dateEn: string | null;
  readTime: string;           // NOT NULL
  readTimeEn: string | null;
  summary: string;            // NOT NULL
  summaryEn: string | null;
  content: string;            // NOT NULL
  contentEn: string | null;
  coverImage: string;         // NOT NULL (from schema)
  videoUrl: string;           // NOT NULL (from schema)
  featured: boolean;
  status: string;
  existingPostId: string | null;
  createdAt: string;
  submitter: { id: string; name: string | null; email: string | null };
  reviewer: { id: string; name: string | null; email: string | null } | null;
  reviewedAt: string | null;
  rejectReason: string | null;
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "بانتظار المراجعة", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  approved: { label: "تمت الموافقة", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  rejected: { label: "مرفوض", color: "bg-red-500/20 text-red-400 border-red-500/30" },
};

export default function BlogPending() {
  const [posts, setPosts] = useState<PendingPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/blog-pending?status=${statusFilter}`);
      const data = await res.json() as { posts?: PendingPost[] };
      setPosts(data.posts ?? []);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const handleAction = async (postId: string, action: "approve" | "reject", rejectReason?: string) => {
    setActionLoading(postId);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/blog-pending", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, action, rejectReason }),
      });
      const data = await res.json() as { error?: string };
      if (res.ok) {
        setMessage({
          ok: true,
          text: action === "approve" ? "تم نشر المقال في المدونة" : "تم رفض المقال",
        });
        await load();
        setExpandedId(null);
      } else {
        setMessage({ ok: false, text: data.error ?? "حدث خطأ" });
      }
    } catch {
      setMessage({ ok: false, text: "حدث خطأ أثناء العملية" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (postId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الطلب؟")) return;
    setActionLoading(postId);
    try {
      const res = await fetch(`/api/admin/blog-pending?postId=${postId}`, { method: "DELETE" });
      if (res.ok) {
        setMessage({ ok: true, text: "تم الحذف بنجاح" });
        await load();
      } else {
        setMessage({ ok: false, text: "حدث خطأ أثناء الحذف" });
      }
    } catch {
      setMessage({ ok: false, text: "حدث خطأ أثناء الحذف" });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white">📝 طلبات نشر المقالات</h2>
          <p className="mt-1 text-sm text-gray-400">مراجعة المقالات المقدمة من مدير التعاقدات</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {["pending", "approved", "rejected", "all"].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
              statusFilter === status
                ? "bg-pink-600 text-white"
                : "bg-gray-900 text-gray-300 hover:bg-gray-800"
            }`}
          >
            {status === "all" ? "الكل" : STATUS_LABELS[status]?.label ?? status}
          </button>
        ))}
      </div>

      {message && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${message.ok ? "border-emerald-500/30 bg-emerald-950/30 text-emerald-200" : "border-red-500/30 bg-red-950/30 text-red-200"}`}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-gray-800 bg-black/20 px-4 py-10 text-center text-sm text-gray-400">
          جارٍ التحميل...
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border border-gray-800 bg-black/20 px-4 py-10 text-center text-sm text-gray-400">
          لا توجد طلبات في الوقت الحالي
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => {
            const isExpanded = expandedId === post.id;
            const statusInfo = STATUS_LABELS[post.status] ?? { label: post.status, color: "bg-gray-500/20 text-gray-400" };

            return (
              <div key={post.id} className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-base font-bold text-white">{post.title}</h3>
                      <span className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                      {post.featured && (
                        <span className="rounded-lg bg-purple-500/20 border border-purple-500/30 px-2.5 py-1 text-xs font-bold text-purple-300">
                          ⭐ مميز
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-sm text-gray-400">
                      {post.category} · {post.author} · {post.date} · {post.readTime}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      قدمه: {post.submitter.name ?? post.submitter.email} · {new Date(post.createdAt).toLocaleDateString("ar-EG")}
                    </div>
                    {post.existingPostId && (
                      <div className="mt-1 text-xs text-blue-400">
                        ✏️ تعديل على مقال موجود (ID: {post.existingPostId})
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : post.id)}
                    className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-gray-700"
                  >
                    {isExpanded ? "إخفاء" : "عرض"}
                  </button>
                </div>

                {isExpanded && (
                  <div className="mt-4 space-y-4 border-t border-gray-800 pt-4">
                    {/* معلومات أساسية */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-gray-500">التصنيف:</span> <span className="text-gray-300">{post.category}</span>
                        {post.categoryEn && <span className="text-gray-500 ml-2">({post.categoryEn})</span>}
                      </div>
                      <div>
                        <span className="text-gray-500">الكاتب:</span> <span className="text-gray-300">{post.author}</span>
                        {post.authorEn && <span className="text-gray-500 ml-2">({post.authorEn})</span>}
                      </div>
                      <div>
                        <span className="text-gray-500">التاريخ:</span> <span className="text-gray-300">{post.date}</span>
                        {post.dateEn && <span className="text-gray-500 ml-2">({post.dateEn})</span>}
                      </div>
                      <div>
                        <span className="text-gray-500">وقت القراءة:</span> <span className="text-gray-300">{post.readTime}</span>
                        {post.readTimeEn && <span className="text-gray-500 ml-2">({post.readTimeEn})</span>}
                      </div>
                    </div>

                    {/* الملخص */}
                    <div>
                      <div className="text-xs font-bold text-gray-400 mb-1">الملخص:</div>
                      <div className="text-sm text-gray-300">{post.summary}</div>
                      {post.summaryEn && (
                        <div className="mt-2 text-sm text-gray-400 italic">{post.summaryEn}</div>
                      )}
                    </div>

                    {/* المحتوى */}
                    <div>
                      <div className="text-xs font-bold text-gray-400 mb-1">المحتوى:</div>
                      <div className="max-h-60 overflow-y-auto rounded-lg bg-black/40 p-3 text-sm text-gray-300 whitespace-pre-wrap">
                        {post.content}
                      </div>
                      {post.contentEn && (
                        <div className="mt-2 max-h-60 overflow-y-auto rounded-lg bg-black/40 p-3 text-sm text-gray-400 whitespace-pre-wrap">
                          <div className="text-xs font-bold mb-2">English Content:</div>
                          {post.contentEn}
                        </div>
                      )}
                    </div>

                    {/* صورة الغلاف */}
                    {post.coverImage && (
                      <div>
                        <div className="text-xs font-bold text-gray-400 mb-2">📷 صورة الغلاف:</div>
                        <img src={post.coverImage} alt={post.title} className="max-w-full h-auto rounded-lg border border-gray-700 object-cover" />
                      </div>
                    )}

                    {/* الفيديو */}
                    {post.videoUrl && (
                      <div>
                        <div className="text-xs font-bold text-gray-400 mb-2">🎥 رابط الفيديو:</div>
                        <div className="rounded-lg bg-black/40 p-3">
                          <a
                            href={post.videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-400 hover:text-blue-300 break-all"
                          >
                            {post.videoUrl}
                          </a>
                          {(() => {
                            const embedUrl = getYouTubeEmbedUrl(post.videoUrl);
                            return embedUrl ? (
                              <div className="mt-3 aspect-video">
                                <iframe
                                  src={embedUrl}
                                  title={post.title}
                                  className="w-full h-full rounded-lg"
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  allowFullScreen
                                />
                              </div>
                            ) : null;
                          })()}
                        </div>
                      </div>
                    )}

                    {/* English Title */}
                    {post.titleEn && (
                      <div className="rounded-lg bg-gray-900/50 p-3 text-xs text-gray-400">
                        <div className="font-bold">English Title:</div>
                        <div className="text-gray-300">{post.titleEn}</div>
                      </div>
                    )}
                    {post.status === "rejected" && post.rejectReason && (
                      <div className="rounded-lg border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-300">
                        <div className="font-bold text-red-400 mb-1">سبب الرفض:</div>
                        {post.rejectReason}
                      </div>
                    )}
                    {post.reviewer && (
                      <div className="text-xs text-gray-500">
                        تمت المراجعة بواسطة: {post.reviewer.name} · {post.reviewedAt ? new Date(post.reviewedAt).toLocaleDateString("ar-EG") : "—"}
                      </div>
                    )}

                    {/* Actions */}
                    {post.status === "pending" && (
                      <div className="flex gap-3 border-t border-gray-800 pt-4">
                        <button
                          onClick={() => void handleAction(post.id, "approve")}
                          disabled={actionLoading === post.id}
                          className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                        >
                          {actionLoading === post.id ? "جارٍ..." : "✓ موافقة ونشر في المدونة"}
                        </button>
                        <button
                          onClick={() => {
                            const reason = prompt("سبب الرفض (اختياري):");
                            if (reason !== null) void handleAction(post.id, "reject", reason || undefined);
                          }}
                          disabled={actionLoading === post.id}
                          className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50"
                        >
                          ✗ رفض
                        </button>
                      </div>
                    )}

                    <button
                      onClick={() => void handleDelete(post.id)}
                      disabled={actionLoading === post.id}
                      className="w-full rounded-lg border border-gray-700 bg-gray-900/50 px-3 py-1.5 text-xs font-bold text-gray-400 hover:bg-gray-800 hover:text-red-400 disabled:opacity-50"
                    >
                      🗑 حذف الطلب
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
