import { db } from "@/lib/db";
import { getDefaultPaymentProvider, getPaymentProvider, listPaymentProviders } from "@/lib/payments/registry";
import type {
  PaymentCheckoutResult,
  PaymentProviderKey,
  PaymentPurpose,
  PaymentStatus,
} from "@/lib/payments/types";

type CreatePaymentTransactionInput = {
  userId: string;
  provider?: string | null;
  purpose: PaymentPurpose;
  businessUnit?: "store" | "club";
  amount: number;
  currency?: string | null;
  paymentMethod?: string | null;
  orderId?: string | null;
  membershipId?: string | null;
  offerId?: string | null;
  returnUrl?: string | null;
  cancelUrl?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  customer?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
};

function stringifyJson(value: Record<string, unknown> | null | undefined) {
  if (!value || Object.keys(value).length === 0) return null;
  return JSON.stringify(value);
}

function parseJson(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getDefaultBusinessUnit(purpose: PaymentPurpose) {
  if (purpose === "order") return "store";
  return "club";
}

export function getAvailablePaymentProviders() {
  return listPaymentProviders().map((provider) => ({
    key: provider.key,
    label: provider.label,
    enabled: provider.enabled,
    supportsCards: provider.supportsCards,
  }));
}

export async function createPaymentTransaction(input: CreatePaymentTransactionInput) {
  const provider =
    getPaymentProvider(input.provider) && getPaymentProvider(input.provider)?.enabled
      ? getPaymentProvider(input.provider)!
      : getDefaultPaymentProvider();

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("قيمة الدفع غير صحيحة.");
  }

  const transaction = await db.paymentTransaction.create({
    data: {
      userId: input.userId,
      orderId: input.orderId ?? null,
      membershipId: input.membershipId ?? null,
      offerId: input.offerId ?? null,
      purpose: input.purpose,
      businessUnit: input.businessUnit ?? getDefaultBusinessUnit(input.purpose),
      provider: provider.key,
      amount,
      currency: (input.currency || "EGP").toUpperCase(),
      paymentMethod: input.paymentMethod ?? "card",
      returnUrl: input.returnUrl ?? null,
      cancelUrl: input.cancelUrl ?? null,
      metadata: stringifyJson({
        description: input.description ?? null,
        ...(input.metadata ?? {}),
      }),
    },
  });

  const checkout = await provider.createCheckout({
    transactionId: transaction.id,
    amount: transaction.amount,
    currency: transaction.currency,
    purpose: input.purpose,
    returnUrl: input.returnUrl ?? null,
    cancelUrl: input.cancelUrl ?? null,
    customer: {
      id: input.userId,
      name: input.customer?.name ?? null,
      email: input.customer?.email ?? null,
      phone: input.customer?.phone ?? null,
    },
    context: {
      orderId: input.orderId ?? null,
      membershipId: input.membershipId ?? null,
      offerId: input.offerId ?? null,
      description: input.description ?? null,
      metadata: input.metadata ?? null,
    },
  });

  const updated = await db.paymentTransaction.update({
    where: { id: transaction.id },
    data: {
      status: checkout.status,
      checkoutUrl: checkout.checkoutUrl ?? null,
      iframeUrl: checkout.iframeUrl ?? null,
      providerReference: checkout.providerReference ?? null,
      externalReference: checkout.externalReference ?? null,
      providerPayload: stringifyJson(checkout.payload ?? null),
      expiresAt: checkout.expiresAt ?? null,
    },
  });

  return mapPaymentTransaction(updated, checkout.message);
}

export async function verifyPaymentTransaction(transactionId: string) {
  const transaction = await db.paymentTransaction.findUnique({
    where: { id: transactionId },
  });

  if (!transaction) {
    throw new Error("معاملة الدفع غير موجودة.");
  }

  const provider = getPaymentProvider(transaction.provider) ?? getDefaultPaymentProvider();
  const verification = await provider.verifyTransaction({
    id: transaction.id,
    providerReference: transaction.providerReference,
    externalReference: transaction.externalReference,
    amount: transaction.amount,
    currency: transaction.currency,
    metadata: transaction.metadata,
  });

  const updated = await db.paymentTransaction.update({
    where: { id: transaction.id },
    data: {
      status: verification.status,
      providerReference: verification.providerReference ?? transaction.providerReference,
      externalReference: verification.externalReference ?? transaction.externalReference,
      providerPayload: stringifyJson(verification.payload ?? parseJson(transaction.providerPayload)),
      paidAt: verification.status === "paid" ? new Date() : transaction.paidAt,
      failedAt: verification.status === "failed" ? new Date() : transaction.failedAt,
    },
  });

  return mapPaymentTransaction(updated, verification.message);
}

export async function updatePaymentTransactionStatus(
  transactionId: string,
  status: PaymentStatus,
  note?: string | null,
) {
  const transaction = await db.paymentTransaction.update({
    where: { id: transactionId },
    data: {
      status,
      metadata: stringifyJson({
        ...(parseJson((await db.paymentTransaction.findUnique({ where: { id: transactionId }, select: { metadata: true } }))?.metadata) ?? {}),
        adminNote: note ?? null,
      }),
      paidAt: status === "paid" ? new Date() : undefined,
      failedAt: status === "failed" ? new Date() : undefined,
    },
  });

  return mapPaymentTransaction(transaction);
}

export async function listRecentPaymentTransactions(limit = 50) {
  const rows = await db.paymentTransaction.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
    include: {
      user: { select: { name: true, email: true, phone: true } },
      order: { select: { total: true, status: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    customerName: row.user?.name ?? "عميل",
    customerEmail: row.user?.email ?? null,
    customerPhone: row.user?.phone ?? null,
    provider: row.provider,
    purpose: row.purpose,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    paymentMethod: row.paymentMethod,
    orderId: row.orderId,
    membershipId: row.membershipId,
    offerId: row.offerId,
    checkoutUrl: row.checkoutUrl,
    iframeUrl: row.iframeUrl,
    providerReference: row.providerReference,
    externalReference: row.externalReference,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    metadata: parseJson(row.metadata),
  }));
}

function mapPaymentTransaction(
  transaction: {
    id: string;
    provider: string;
    purpose: string;
    amount: number;
    currency: string;
    status: string;
    paymentMethod: string;
    orderId: string | null;
    membershipId: string | null;
    offerId: string | null;
    checkoutUrl: string | null;
    iframeUrl: string | null;
    providerReference: string | null;
    externalReference: string | null;
    returnUrl: string | null;
    cancelUrl: string | null;
    providerPayload: string | null;
    metadata: string | null;
    expiresAt: Date | null;
    paidAt?: Date | null;
    failedAt?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
  },
  message?: string,
) {
  return {
    id: transaction.id,
    provider: transaction.provider as PaymentProviderKey,
    purpose: transaction.purpose as PaymentPurpose,
    amount: transaction.amount,
    currency: transaction.currency,
    status: transaction.status as PaymentStatus,
    paymentMethod: transaction.paymentMethod,
    orderId: transaction.orderId,
    membershipId: transaction.membershipId,
    offerId: transaction.offerId,
    checkoutUrl: transaction.checkoutUrl,
    iframeUrl: transaction.iframeUrl,
    providerReference: transaction.providerReference,
    externalReference: transaction.externalReference,
    returnUrl: transaction.returnUrl,
    cancelUrl: transaction.cancelUrl,
    payload: parseJson(transaction.providerPayload),
    metadata: parseJson(transaction.metadata),
    expiresAt: transaction.expiresAt,
    paidAt: transaction.paidAt ?? null,
    failedAt: transaction.failedAt ?? null,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
    message: message ?? null,
  };
}
