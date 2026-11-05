export type FriendOfferVerificationStatus =
  | "waiting"
  | "completed"
  | null;

export function getPaidPaymentMessage(input: {
  status: string | null;
  purpose: string | null;
  friendOfferStatus: FriendOfferVerificationStatus;
  membershipName: string | null;
}): { title: string; description: string | null } | null {
  if (input.status !== "paid") return null;

  if (input.purpose !== "membership") {
    return {
      title: "تم تأكيد الدفع بنجاح",
      description: null,
    };
  }

  if (input.friendOfferStatus === "waiting") {
    return {
      title: "تم تأكيد سداد حصتك في عرض الصحاب",
      description:
        "تم تسجيل دفع حصتك، لكن اشتراك المجموعة لم يتفعل بعد. ننتظر استكمال شروط المجموعة وسداد باقي المشاركات.",
    };
  }

  if (input.friendOfferStatus === "completed") {
    return {
      title: "تم تفعيل اشتراك عرض الصحاب بنجاح",
      description:
        "اكتمل سداد المجموعة وتم تفعيل اشتراكك. يمكنك متابعة الحصص والحجوزات من حسابك.",
    };
  }

  return {
    title: input.membershipName
      ? `تم تأكيد دفع اشتراك ${input.membershipName}`
      : "تم تأكيد دفع الاشتراك",
    description:
      "يمكنك متابعة حالة العضوية والحصص والحجوزات من حسابك.",
  };
}
