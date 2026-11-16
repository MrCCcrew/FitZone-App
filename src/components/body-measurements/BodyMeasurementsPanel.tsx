"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useLang } from "@/lib/language";

type FieldKey =
  | "weightKg"
  | "heightCm"
  | "chestCm"
  | "waistCm"
  | "hipsCm"
  | "armCm"
  | "thighCm";

type Measurement = {
  id: string;
  measuredAt: string;
  weightKg: number | null;
  heightCm: number | null;
  chestCm: number | null;
  waistCm: number | null;
  hipsCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  notes: string | null;
};

const fields: {
  key: FieldKey;
  ar: string;
  en: string;
  unit: string;
  min: number;
  max: number;
}[] = [
  { key: "weightKg", ar: "الوزن", en: "Weight", unit: "kg", min: 20, max: 400 },
  { key: "heightCm", ar: "الطول", en: "Height", unit: "cm", min: 80, max: 250 },
  { key: "chestCm", ar: "الصدر", en: "Chest", unit: "cm", min: 20, max: 250 },
  { key: "waistCm", ar: "الخصر", en: "Waist", unit: "cm", min: 20, max: 250 },
  { key: "hipsCm", ar: "الأرداف", en: "Hips", unit: "cm", min: 20, max: 300 },
  { key: "armCm", ar: "الذراع", en: "Arm", unit: "cm", min: 10, max: 120 },
  { key: "thighCm", ar: "الفخذ", en: "Thigh", unit: "cm", min: 10, max: 160 },
];

const blankForm = (): Record<FieldKey, string> => ({
  weightKg: "",
  heightCm: "",
  chestCm: "",
  waistCm: "",
  hipsCm: "",
  armCm: "",
  thighCm: "",
});

export default function BodyMeasurementsPanel({
  mode,
  userId,
}: {
  mode: "self" | "admin";
  userId?: string;
}) {
  const { lang } = useLang();
  const t = (ar: string, en: string) => lang === "ar" ? ar : en;

  const [records, setRecords] = useState<Measurement[]>([]);
  const [form, setForm] = useState(blankForm);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      setRecords([]);
      setError("");
      setForbidden(false);

      try {
        if (mode === "admin" && !userId) {
          setForbidden(true);
          return;
        }

        const url = mode === "self"
          ? "/api/me/body-measurements"
          : `/api/admin/body-measurements?userId=${encodeURIComponent(userId ?? "")}`;

        const response = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (response.status === 401 || response.status === 403) {
          if (!controller.signal.aborted) setForbidden(true);
          return;
        }
        if (!response.ok) throw new Error("LOAD_FAILED");

        const payload: unknown = await response.json();
        if (
          !payload ||
          typeof payload !== "object" ||
          !("measurements" in payload) ||
          !Array.isArray(payload.measurements)
        ) {
          throw new Error("INVALID_RESPONSE");
        }

        if (!controller.signal.aborted) {
          setRecords(payload.measurements as Measurement[]);
        }
      } catch {
        if (!controller.signal.aborted) {
          setError(lang === "ar"
            ? "تعذر تحميل القياسات."
            : "Could not load measurements.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void load();
    return () => controller.abort();
  }, [mode, userId, refresh, lang]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode !== "self" || saving) return;

    const data: Record<string, number | string> = {};

    for (const field of fields) {
      const raw = form[field.key].trim();
      if (raw === "") continue;

      const value = Number(raw);
      if (!Number.isFinite(value) ||
          value < field.min || value > field.max) {
        setError(`${t(field.ar, field.en)}: ${field.min}–${field.max}`);
        return;
      }
      data[field.key] = value;
    }

    if (Object.keys(data).length === 0) {
      setError(t(
        "أدخلي قياسًا واحدًا على الأقل.",
        "Enter at least one measurement.",
      ));
      return;
    }

    if (notes.length > 500) {
      setError(t("الملاحظات طويلة جدًا.", "Notes are too long."));
      return;
    }
    if (notes.trim()) data.notes = notes.trim();

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/me/body-measurements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        cache: "no-store",
      });

      if (!response.ok) throw new Error("SAVE_FAILED");

      setForm(blankForm());
      setNotes("");
      setSuccess(t("تم حفظ القياس.", "Measurement saved."));
      setRefresh((value) => value + 1);
    } catch {
      setError(t(
        "تعذر حفظ القياس.",
        "Could not save measurement.",
      ));
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (value: string) =>
    new Date(value).toLocaleString(
      lang === "ar" ? "ar-EG" : "en-GB",
      {
        timeZone: "Africa/Cairo",
        dateStyle: "medium",
        timeStyle: "short",
      },
    );

  const previousValue = (index: number, key: FieldKey) => {
    for (let i = index + 1; i < records.length; i++) {
      const value = records[i][key];
      if (typeof value === "number") return value;
    }
    return null;
  };

  if (mode === "admin" && forbidden) return null;

  return (
    <section className="rounded-2xl border border-pink-400/20 bg-black/20 p-4 sm:p-5">
      <h3 className="text-lg font-black text-white">
        {t("سجل قياسات الجسم", "Body measurements history")}
      </h3>
      <p className="mt-1 text-xs text-gray-300">
        {t(
          "كل تسجيل له تاريخ مستقل. الوزن بالكيلو وبقية القياسات بالسنتيمتر.",
          "Every entry has its own date. Weight is in kg; other measures are in cm.",
        )}
      </p>

      {mode === "self" && !forbidden && (
        <form onSubmit={(event) => void save(event)}
              className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {fields.map((field) => (
              <label key={field.key} className="block space-y-1">
                <span className="block text-xs font-bold text-gray-200">
                  {t(field.ar, field.en)} ({field.unit})
                </span>
                <input
                  type="number"
                  step="0.1"
                  min={field.min}
                  max={field.max}
                  value={form[field.key]}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-white/20 bg-gray-900 px-3 py-2 text-sm text-white"
                />
              </label>
            ))}
          </div>

          <label className="block space-y-1">
            <span className="block text-xs text-gray-200">
              {t("ملاحظات اختيارية", "Optional notes")}
            </span>
            <textarea
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="w-full rounded-xl border border-white/20 bg-gray-900 px-3 py-2 text-sm text-white"
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-pink-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving
              ? t("جارٍ الحفظ...", "Saving...")
              : t("تسجيل قياس جديد", "Save new measurement")}
          </button>
        </form>
      )}

      {success && (
        <p role="status" className="mt-3 text-sm text-green-300">
          {success}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-300">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-gray-300">
          {t("جارٍ تحميل القياسات...", "Loading measurements...")}
        </p>
      ) : records.length === 0 ? (
        !forbidden && (
          <p className="mt-4 text-sm text-gray-300">
            {t("لا توجد قياسات مسجلة.", "No measurements recorded.")}
          </p>
        )
      ) : (
        <div className="mt-4 space-y-3">
          {records.map((record, index) => (
            <div
              key={record.id}
              className="rounded-xl border border-white/10 bg-gray-900/70 p-3"
            >
              <div className="mb-3 text-sm font-bold text-amber-200">
                {formatDate(record.measuredAt)}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {fields.map((field) => {
                  const value = record[field.key];
                  if (typeof value !== "number") return null;

                  const previous = previousValue(index, field.key);
                  const delta = previous === null ? null : value - previous;

                  return (
                    <div
                      key={field.key}
                      className="rounded-lg bg-black/25 p-2"
                    >
                      <div className="text-xs text-gray-300">
                        {t(field.ar, field.en)}
                      </div>
                      <div className="text-sm font-black text-white">
                        {value} {field.unit}
                      </div>
                      {delta !== null && (
                        <div className="text-xs text-amber-200">
                          {t("التغير", "Change")}:{" "}
                          {delta > 0 ? "+" : ""}
                          {Number(delta.toFixed(2))} {field.unit}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {record.notes && (
                <p className="mt-3 whitespace-pre-wrap text-xs text-gray-300">
                  {record.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}