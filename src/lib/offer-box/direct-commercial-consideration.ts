export type DirectCommercialConsideration = {
  version: 1;
  totalMinor: number;
  externalMinor: number;
  walletMinor: number;
  pointsMinor: number;
  pointsCount: number;
  discount: null | {
    codeId: string;
    amountMinor: number;
    beforeDiscountMinor: number;
  };
};

function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("DIRECT_ECONOMICS_INVALID_OBJECT");
  return value as Record<string, any>;
}
function parse(raw: string | null): Record<string, any> {
  return object(JSON.parse(raw ?? "{}"));
}
export function directMoneyMinor(amount: number): number {
  const minor = Math.round(amount * 100);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(minor) || minor < 0 || Math.abs(amount * 100 - minor) > 0.000001) throw new Error("DIRECT_ECONOMICS_INVALID_MONEY");
  return minor;
}
function nonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
export function readDirectCommercialConsideration(snapshot: string | object, externalAmount: number): DirectCommercialConsideration | null {
  const record = typeof snapshot === "string" ? parse(snapshot) : object(snapshot);
  if (record.directConsideration == null) return null;
  const c = object(record.directConsideration);
  if (c.version !== 1 || !nonnegative(c.totalMinor) || !nonnegative(c.externalMinor) || !nonnegative(c.walletMinor) || !nonnegative(c.pointsMinor) || !nonnegative(c.pointsCount) || c.totalMinor <= 0 || c.externalMinor !== directMoneyMinor(externalAmount) || c.totalMinor !== c.externalMinor + c.walletMinor + c.pointsMinor || ((c.pointsCount > 0) !== (c.pointsMinor > 0))) throw new Error("DIRECT_ECONOMICS_INVALID_CONSIDERATION");
  if (c.discount !== null) {
    const d = object(c.discount);
    if (typeof d.codeId !== "string" || !d.codeId || !nonnegative(d.amountMinor) || d.amountMinor <= 0 || !nonnegative(d.beforeDiscountMinor) || d.beforeDiscountMinor !== c.totalMinor + d.amountMinor) throw new Error("DIRECT_ECONOMICS_INVALID_DISCOUNT");
  }
  return c as DirectCommercialConsideration;
}
