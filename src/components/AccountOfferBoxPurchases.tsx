"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/language";
import { scheduleSlotInstant } from "@/lib/fitzone-time";

function useT() {
  const { lang } = useLang();
  return useCallback((ar: string, en: string) => (lang === "ar" ? ar : en), [lang]);
}

type AccountOfferBoxPurchase = {
  purchaseId: string;
  status: string;
  canRedeem: boolean;
  title: string;
  titleEn: string | null;
  sessionsCount: number | null;
  allowedClassIds: string[];
  durationDays: number | null;
  price: number;
  currency: string;
  paidAt: string | null;
  redeemedAt: string | null;
  createdAt: string;
};

type AccountOfferBoxSchedule = {
  id: string;
  classId: string;
  className: string;
  date: string;
  time: string;
  availableSpots: number;
};

function AccountOfferBoxRedeemPicker({
  purchase,
  onClose,
  onRedeemed,
}: {
  purchase: AccountOfferBoxPurchase;
  onClose: () => void;
  onRedeemed: () => void;
}) {
  const t = useT();
  const { lang } = useLang();

  const [slots, setSlots] = useState<AccountOfferBoxSchedule[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const submittingRef = useRef(false);

  const maxSelections = Math.min(
    20,
    purchase.sessionsCount != null && purchase.sessionsCount > 0
      ? purchase.sessionsCount
      : 20,
  );

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      setError("");
      setSlots([]);
      setSelectedIds([]);

      if (purchase.allowedClassIds.length === 0) {
        setError(
          t(
            "صلاحيات الحصص غير متاحة لهذا العرض.",
            "Class entitlements are unavailable for this purchase.",
          ),
        );
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(
          `/api/public?lang=${lang}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(
            t("تعذر تحميل المواعيد.", "Unable to load schedules."),
          );
        }

        const data = (await response.json()) as {
          classes?: Array<{
            id: string;
            name: string;
            schedules?: Array<{
              id: string;
              date: string;
              time: string;
              availableSpots: number;
            }>;
          }>;
        };

        if (!Array.isArray(data.classes)) {
          throw new Error(
            t("بيانات المواعيد غير صالحة.", "Invalid schedule data."),
          );
        }

        const allowed = new Set(purchase.allowedClassIds);
        const choices: AccountOfferBoxSchedule[] = [];
        const seen = new Set<string>();

        for (const gymClass of data.classes) {
          if (
            !allowed.has(gymClass.id) ||
            !Array.isArray(gymClass.schedules)
          ) {
            continue;
          }

          for (const slot of gymClass.schedules) {
            if (
              typeof slot.id !== "string" ||
              !slot.id ||
              typeof slot.time !== "string" ||
              typeof slot.date !== "string" ||
              seen.has(slot.id)
            ) {
              continue;
            }

            const date = new Date(slot.date);
            if (!Number.isFinite(date.getTime())) continue;

            // The canonical schedule helper interprets Cairo wall-clock time.
            let startsAt: Date;
            try {
              startsAt = scheduleSlotInstant(date, slot.time);
            } catch {
              // One bad slot must not hide valid sessions.
              continue;
            }
            if (!Number.isFinite(startsAt.getTime())) continue;
            if (startsAt.getTime() <= Date.now()) continue;

            const availableSpots = Number(slot.availableSpots);
            if (!Number.isFinite(availableSpots) || availableSpots <= 0) {
              continue;
            }

            seen.add(slot.id);
            choices.push({
              id: slot.id,
              classId: gymClass.id,
              className: gymClass.name,
              date: slot.date,
              time: slot.time,
              availableSpots,
            });
          }
        }

        choices.sort(
          (a, b) =>
            scheduleSlotInstant(new Date(a.date), a.time).getTime() -
            scheduleSlotInstant(new Date(b.date), b.time).getTime(),
        );

        if (!controller.signal.aborted) {
          setSlots(choices);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : t("تعذر تحميل المواعيد.", "Unable to load schedules."),
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => controller.abort();
  }, [purchase.purchaseId, purchase.allowedClassIds, lang, t]);

  const toggleSlot = (slot: AccountOfferBoxSchedule) => {
    if (submittingRef.current) return;

    setError("");

    setSelectedIds((previous) => {
      if (previous.includes(slot.id)) {
        return previous.filter((id) => id !== slot.id);
      }

      if (previous.length >= maxSelections) {
        setError(
          t(
            "وصلتِ للحد الأقصى من الحصص التي يمكن اختيارها.",
            "You have reached the selection limit.",
          ),
        );
        return previous;
      }

      const collision = previous.some((id) => {
        const existing = slots.find((item) => item.id === id);
        return (
          existing?.date === slot.date &&
          existing?.time === slot.time
        );
      });

      if (collision) {
        setError(
          t(
            "لا يمكن اختيار حصتين في نفس الموعد.",
            "You cannot select two classes at the same time.",
          ),
        );
        return previous;
      }

      return [...previous, slot.id];
    });
  };

  const redeem = async () => {
    if (
      submittingRef.current ||
      selectedIds.length === 0 ||
      !purchase.canRedeem
    ) {
      return;
    }

    if (
      !window.confirm(
        t(
          "هل تؤكدين اختيار هذه الحصص وتفعيل العرض الآن؟",
          "Confirm these classes and activate your offer now?",
        ),
      )
    ) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/offer-box/redeem", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          purchaseId: purchase.purchaseId,
          scheduleIds: selectedIds,
        }),
      });

      const result = (await response.json()) as {
        error?: string;
        success?: boolean;
      };

      if (!response.ok || result.success !== true) {
        throw new Error(
          result.error ||
            t("تعذر تفعيل العرض.", "Unable to redeem your offer."),
        );
      }

      onRedeemed();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t("حدث خطأ أثناء الاسترداد.", "Redemption failed."),
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <section
      aria-label={t("اختيار حصص العرض", "Choose offer classes")}
      style={{
        marginTop: 24,
        padding: 20,
        border: "2px solid #F9A8D4",
        borderRadius: 16,
        background: "#FFF7FB",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
        }}
      >
        <h3 style={{ fontSize: 18, fontWeight: 800 }}>
          {t("اختيار حصص", "Choose classes")}:{" "}
          {lang === "en"
            ? purchase.titleEn || purchase.title
            : purchase.title}
        </h3>

        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
        >
          {t("إغلاق", "Close")}
        </button>
      </div>

      <p style={{ marginTop: 10, color: "#64748B" }}>
        {t("الحصص المختارة", "Selected classes")}:{" "}
        {selectedIds.length} / {maxSelections}
      </p>

      {error && (
        <p
          role="alert"
          style={{ marginTop: 12, color: "#991B1B" }}
        >
          {error}
        </p>
      )}

      {loading ? (
        <p role="status" style={{ marginTop: 16 }}>
          {t("جاري تحميل المواعيد...", "Loading schedules...")}
        </p>
      ) : slots.length === 0 ? (
        <p style={{ marginTop: 16 }}>
          {t(
            "لا توجد حصص مستقبلية متاحة حاليًا لهذا العرض.",
            "No upcoming eligible classes are available.",
          )}
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 10,
            marginTop: 16,
          }}
        >
          {slots.map((slot) => {
            const selected = selectedIds.includes(slot.id);

            return (
              <button
                type="button"
                key={slot.id}
                aria-pressed={selected}
                disabled={submitting}
                onClick={() => toggleSlot(slot)}
                style={{
                  textAlign: "start",
                  padding: 12,
                  borderRadius: 10,
                  border: selected
                    ? "2px solid #DB2777"
                    : "1px solid #CBD5E1",
                  background: selected ? "#FCE7F3" : "#FFFFFF",
                  cursor: submitting ? "wait" : "pointer",
                }}
              >
                <strong>{slot.className}</strong>
                <div style={{ marginTop: 6 }}>
                  {new Date(slot.date).toLocaleDateString(
                    lang === "ar" ? "ar-EG" : "en-US",
                    {
                      timeZone: "Africa/Cairo",
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    },
                  )}
                </div>
                <div>{slot.time}</div>
                <small>
                  {t("الأماكن المتاحة", "Available spots")}:{" "}
                  {slot.availableSpots}
                </small>
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        disabled={
          loading ||
          submitting ||
          selectedIds.length === 0
        }
        onClick={() => void redeem()}
        style={{
          marginTop: 20,
          padding: "12px 20px",
          borderRadius: 10,
          background: "#DB2777",
          color: "#FFFFFF",
          fontWeight: 800,
          opacity:
            loading || submitting || selectedIds.length === 0
              ? 0.5
              : 1,
        }}
      >
        {submitting
          ? t("جاري تأكيد الحصص...", "Confirming classes...")
          : t("تأكيد الحصص وتفعيل العرض", "Confirm and activate offer")}
      </button>
    </section>
  );
}
export default function AccountOfferBoxPurchases() {
  const t = useT();
  const { lang } = useLang();
  const [items, setItems] = useState<AccountOfferBoxPurchase[]>([]);
  const [selectedPurchase, setSelectedPurchase] = useState<AccountOfferBoxPurchase | null>(null);
  const [requestedPage, setRequestedPage] = useState(0);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    setLoading(true);
    setError("");

    const load = async () => {
      try {
        const response = await fetch(
          `/api/offer-box/purchases?page=${requestedPage}`,
          {
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          },
        );

        const result = (await response.json()) as {
          items?: AccountOfferBoxPurchase[];
          nextPage?: number | null;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(
            result.error ||
              t("تعذر تحميل العروض المشتراة.", "Unable to load purchased offers."),
          );
        }

        if (!Array.isArray(result.items)) {
          throw new Error(
            t("بيانات المشتريات غير صالحة.", "Invalid purchase data."),
          );
        }

        if (!active) return;

        setItems((previous) =>
          requestedPage === 0
            ? result.items!
            : [
                ...previous,
                ...result.items!.filter(
                  (item) =>
                    !previous.some(
                      (existing) => existing.purchaseId === item.purchaseId,
                    ),
                ),
              ],
        );

        setNextPage(
          typeof result.nextPage === "number" &&
            Number.isSafeInteger(result.nextPage) &&
            result.nextPage > requestedPage
            ? result.nextPage
            : null,
        );
      } catch (cause) {
        if (!active) return;

        setError(
          cause instanceof Error
            ? cause.message
            : t("تعذر تحميل المشتريات.", "Unable to load purchases."),
        );
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
      controller.abort();
    };
  }, [requestedPage, refresh, t]);

  return (
    <section
      aria-label={t("عروضي المشتراة", "My purchased offers")}
      style={{ padding: "24px 0" }}
    >
      <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
        {t("عروضي المشتراة", "My purchased offers")}
      </h2>

      <p style={{ marginBottom: 20, color: "#64748B" }}>
        {t(
          "العروض المدفوعة محفوظة في حسابك، ويمكن استردادها عند اختيار الحصص.",
          "Your paid offers remain in your account until redeemed.",
        )}
      </p>

      {error && (
        <div role="alert" style={{ color: "#991B1B", marginBottom: 14 }}>
          {error}
          <button
            type="button"
            onClick={() => setRefresh((value) => value + 1)}
            style={{ marginInlineStart: 12, textDecoration: "underline" }}
          >
            {t("إعادة المحاولة", "Retry")}
          </button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <p style={{ color: "#64748B" }}>
          {t(
            "لا توجد عروض مشتراة في حسابك حتى الآن.",
            "You have no purchased offers yet.",
          )}
        </p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
        }}
      >
        {items.map((item) => (
          <article
            key={item.purchaseId}
            style={{
              border: "1px solid #E2E8F0",
              borderRadius: 14,
              background: "#FFFFFF",
              padding: 18,
            }}
          >
            <h3 style={{ fontWeight: 800, fontSize: 17, marginBottom: 12 }}>
              {lang === "en"
                ? item.titleEn || item.title
                : item.title}
            </h3>

            <p style={{ marginBottom: 8 }}>
              <strong>
                {new Intl.NumberFormat(
                  lang === "ar" ? "ar-EG" : "en-US",
                ).format(item.price)}
              </strong>{" "}
              {item.currency}
            </p>

            {item.sessionsCount != null && (
              <p style={{ marginBottom: 8 }}>
                {t("عدد الحصص", "Sessions")}: {item.sessionsCount}
              </p>
            )}

            {item.durationDays != null && (
              <p style={{ marginBottom: 8 }}>
                {t("مدة الاشتراك عند التفعيل", "Duration after activation")}:
                {" "}{item.durationDays} {t("يوم", "days")}
              </p>
            )}

            <p
              style={{
                fontWeight: 700,
                color: item.canRedeem ? "#047857" : "#64748B",
                marginTop: 12,
              }}
            >
              {item.canRedeem
                ? t("مدفوع — متاح لاختيار الحصص", "Paid — ready to redeem")
                : t("تم استرداد العرض", "Offer redeemed")}
            </p>

            {item.canRedeem && (
              <>
                <button
                  type="button"
                  disabled={item.allowedClassIds.length === 0}
                  onClick={() => setSelectedPurchase(item)}
                  style={{
                    marginTop: 12,
                    padding: "10px 16px",
                    borderRadius: 10,
                    border: "none",
                    background:
                      item.allowedClassIds.length > 0 ? "#DB2777" : "#CBD5E1",
                    color: "#FFFFFF",
                    fontWeight: 700,
                    cursor:
                      item.allowedClassIds.length > 0
                        ? "pointer"
                        : "not-allowed",
                  }}
                >
                  {t("اختيار الحصص", "Choose classes")}
                </button>

                {item.allowedClassIds.length === 0 && (
                  <p
                    role="status"
                    style={{ color: "#991B1B", fontSize: 12, marginTop: 8 }}
                  >
                    {t(
                      "تعذر تحديد الحصص المسموحة لهذا العرض. يرجى التواصل مع الإدارة.",
                      "This offer needs entitlement review. Please contact support.",
                    )}
                  </p>
                )}
              </>
            )}
          </article>
        ))}
      </div>

      {selectedPurchase && (
        <AccountOfferBoxRedeemPicker
          key={selectedPurchase.purchaseId}
          purchase={selectedPurchase}
          onClose={() => setSelectedPurchase(null)}
          onRedeemed={() => {
            setSelectedPurchase(null);
            setRequestedPage(0);
            setRefresh((value) => value + 1);
          }}
        />
      )}
      {loading && (
        <p role="status" style={{ marginTop: 14 }}>
          {t("جاري تحميل العروض...", "Loading offers...")}
        </p>
      )}

      {!loading && !error && nextPage !== null && (
        <button
          type="button"
          onClick={() => setRequestedPage(nextPage)}
          style={{
            marginTop: 18,
            padding: "10px 18px",
            borderRadius: 10,
            border: "1px solid #CBD5E1",
          }}
        >
          {t("عرض المزيد", "Load more")}
        </button>
      )}
    </section>
  );
}
