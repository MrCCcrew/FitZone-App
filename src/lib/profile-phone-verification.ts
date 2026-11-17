import { normalizeGuestPhone } from "@/lib/store-guest-verify";

export function isVerifiedProfilePhone(user: {
  phone?: string | null;
  verifiedPhone?: string | null;
  phoneVerifiedAt?: Date | null;
}): boolean {
  if (!user.phoneVerifiedAt || !user.phone || !user.verifiedPhone) {
    return false;
  }

  const current = normalizeGuestPhone(user.phone);
  const verified = normalizeGuestPhone(user.verifiedPhone);

  return Boolean(current && verified && current === verified);
}

export function isCompletedVerifiedProfile(user: {
  phone?: string | null;
  verifiedPhone?: string | null;
  phoneVerifiedAt?: Date | null;
  gender?: string | null;
  birthDate?: Date | null;
  governorate?: string | null;
}): boolean {
  return Boolean(
    isVerifiedProfilePhone(user) &&
    user.gender &&
    user.birthDate &&
    user.governorate
  );
}