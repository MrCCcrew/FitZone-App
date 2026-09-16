export type HrPayrollBlockReasonInfo = {
  title: string;
  explanation: string;
  action: string;
};

const REASONS: Record<string, HrPayrollBlockReasonInfo> = {
  MISSING_PAYROLL_ELIGIBILITY_TERM: {
    title: "لم يتم تحديد استحقاق الموظف للراتب",
    explanation:
      "لا توجد فترة استحقاق راتب مسجلة لهذا الموظف تغطي الشهر المطلوب.",
    action:
      "افتح استحقاق الموظفين للراتب، وأضف فترة استحقاق صحيحة ثم أعد حساب كشف الرواتب.",
  },

  MULTIPLE_PAYROLL_ELIGIBILITY_TERMS_IN_MONTH: {
    title: "يوجد أكثر من سجل استحقاق راتب داخل نفس الشهر",
    explanation:
      "النظام وجد أكثر من فترة استحقاق راتب متداخلة للموظف خلال الشهر المحدد.",
    action: "راجع فترات استحقاق الراتب وأزل التداخل بينها قبل إعادة الحساب.",
  },

  PAYROLL_ELIGIBILITY_TERM_DOES_NOT_COVER_FULL_MONTH: {
    title: "استحقاق الراتب لا يغطي كامل الشهر",
    explanation:
      "فترة استحقاق الراتب المسجلة للموظف لا تشمل الشهر المحدد بالكامل.",
    action:
      "راجع تاريخ بداية ونهاية استحقاق الراتب، وتأكد أن الفترة تغطي الشهر بالكامل ثم أعد الحساب.",
  },

  COMPENSATION_TERM_DOES_NOT_COVER_FULL_MONTH: {
    title: "شروط الراتب لا تغطي كامل الشهر",
    explanation:
      "شروط الراتب والمستحقات المسجلة للموظف لا تغطي الشهر المحدد بالكامل.",
    action:
      "راجع تاريخ سريان شروط الراتب للموظف وأكمل الفترة المطلوبة قبل إعادة الحساب.",
  },

  PARTIAL_EMPLOYMENT_MONTH_REQUIRES_PRORATION_POLICY: {
    title: "الموظف عمل جزءًا من الشهر فقط",
    explanation:
      "تاريخ التعيين أو انتهاء الخدمة يقع داخل الشهر، والنظام لا يحسب راتبًا جزئيًا تلقائيًا بدون سياسة معتمدة.",
    action:
      "راجع حالة الموظف وتاريخ التعيين أو انتهاء الخدمة. لا تعتمد الكشف قبل تحديد سياسة احتساب الشهر الجزئي.",
  },

  MULTIPLE_CURRENCIES: {
    title: "توجد أكثر من عملة داخل كشف الرواتب",
    explanation:
      "المستحقات التي تم تجميعها في نفس الكشف ليست كلها بنفس العملة.",
    action:
      "راجع شروط الرواتب والمستحقات وتأكد من توحيد العملة المطلوبة قبل الاعتماد.",
  },

  NEGATIVE_NET_PAY_REQUIRES_POLICY: {
    title: "صافي راتب الموظف أصبح سالبًا",
    explanation: "إجمالي الخصومات أو التسويات أكبر من إجمالي مستحقات الموظف.",
    action:
      "راجع الخصومات والسلف والتسويات وحدد طريقة معالجة الرصيد السالب قبل اعتماد الكشف.",
  },

  COACH_COMPENSATION_TERM_MISSING: {
    title: "شروط مستحقات المدرب غير مسجلة",
    explanation: "لا توجد شروط مستحقات فعالة للمدرب تغطي الفترة المطلوبة.",
    action: "افتح الرواتب والمستحقات وسجل شروط المدرب بتاريخ سريان صحيح.",
  },

  PAYROLL_DISABLED: {
    title: "الموظف غير مفعّل ضمن الرواتب",
    explanation: "الموظف غير مفعّل حاليًا للمشاركة في دورة الرواتب.",
    action: "راجع إعدادات الموظف واستحقاقه للراتب قبل احتساب هذا البند.",
  },

  EMPLOYEE_PAYROLL_DISABLED: {
    title: "الموظف غير مفعّل ضمن الرواتب",
    explanation: "ملف الموظف غير مفعّل للمشاركة في دورة الرواتب.",
    action: "راجع ملف الموظف واستحقاق الراتب قبل إعادة الحساب.",
  },
};

export function getHrPayrollBlockReasonInfo(
  reason: string | null | undefined,
): HrPayrollBlockReasonInfo {
  if (!reason) {
    return {
      title: "سبب غير محدد",
      explanation: "لم يسجل النظام سببًا تفصيليًا لهذه الحالة.",
      action: "راجع بيانات الموظف والمستحقات قبل المتابعة.",
    };
  }

  if (reason.startsWith("MISSING_COMPENSATION_TERM:")) {
    return {
      title: "شروط الراتب غير مسجلة",
      explanation:
        "لا توجد شروط راتب أو مستحقات فعالة تغطي الفترة المطلوبة للموظف.",
      action:
        "افتح الرواتب والمستحقات وسجل شروطًا بتاريخ سريان صحيح ثم أعد الحساب.",
    };
  }

  return (
    REASONS[reason] ?? {
      title: "حالة تحتاج مراجعة",
      explanation:
        "وجد النظام حالة تمنع إكمال الحساب أو اعتماد المستحق تلقائيًا.",
      action: "راجع إعدادات الموظف وشروط الراتب والمستحقات ثم أعد المحاولة.",
    }
  );
}

export function hrPayrollBlockReasonText(
  reason: string | null | undefined,
): string {
  const info = getHrPayrollBlockReasonInfo(reason);

  return `${info.title} — ${info.action}`;
}
