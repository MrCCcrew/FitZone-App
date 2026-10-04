export type ReferralAntiAbuseInput = {
  sameDevice: boolean;
  sameIp: boolean;
};

export type ReferralAntiAbuseResult = {
  rewardEligible: boolean;
  riskReasons: string[];
};

export const REFERRAL_ANTI_ABUSE_MESSAGE =
  "تعذر تطبيق مكافأة الإحالة على هذا الحساب. مكافآت الإحالة مخصصة لدعوة مستخدمين جدد مستقلين وفق شروط البرنامج. يمكنك الاستمرار في استخدام حسابك بشكل طبيعي.";

export function evaluateReferralAntiAbuse(
  input: ReferralAntiAbuseInput,
): ReferralAntiAbuseResult {
  const riskReasons: string[] = [];

  if (input.sameDevice) {
    riskReasons.push("same_device");
  }

  if (input.sameIp) {
    riskReasons.push("same_ip");
  }

  return {
    // Same device is the blocking signal.
    // Same IP alone is only a risk signal because
    // families/shared Wi-Fi may legitimately share an IP.
    rewardEligible:
      !input.sameDevice,

    riskReasons,
  };
}