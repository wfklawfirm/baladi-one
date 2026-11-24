// KPI Registry: one definition per indicator (formula, source, owner, direction, data quality). Values are computed in the backend, never by an LLM.
export type KpiDef = {
  id: string; ar: string; en: string; definition: string; formula: string; numerator: string; denominator: string;
  source: string; period: string; target: number | null; owner: string; frequency: string; better: "up" | "down"; quality: "available" | "partial" | "missing";
  unit: string; href: string;
};

export const KPI_REGISTRY: KpiDef[] = [
  { id: "REV_COLLECTED", ar: "الإيرادات المحصلة", en: "Revenue collected", definition: "مجموع الإيصالات المسجّلة خلال الفترة، لكل عملة على حدة.", formula: "Σ مبالغ الإيصالات في الفترة (دون جمع عملات مختلفة)", numerator: "مبالغ الإيصالات", denominator: "—", source: "collection_entry (إدخال موظفي التحصيل)", period: "الفترة المختارة", target: null, owner: "مسؤول التحصيل", frequency: "لحظي", better: "up", quality: "partial", unit: "", href: "/staff/collections" },
  { id: "COLLECTION_RATE", ar: "نسبة التحصيل", en: "Collection rate", definition: "المحصَّل من المستحقات المحددة ÷ إجمالي تلك المستحقات القابلة للتحصيل.", formula: "المبالغ المحصلة المرتبطة بالمستحقات ÷ إجمالي المستحقات × 100", numerator: "المحصّل المرتبط بمستحقات", denominator: "المستحقات القابلة للتحصيل", source: "سجل المستحقات (غير مُنشأ بعد)", period: "الفترة المختارة", target: null, owner: "مسؤول التحصيل", frequency: "شهري", better: "up", quality: "missing", unit: "%", href: "/staff/collections" },
  { id: "DECISIONS_EXEC_RATE", ar: "تنفيذ القرارات المستحقة", en: "Due decisions executed", definition: "القرارات النافذة التي حلّ موعد تنفيذها وأُنجزت ÷ كل القرارات النافذة المستحقة.", formula: "قرارات مستحقة ومكتملة ÷ قرارات نافذة مستحقة × 100", numerator: "مستحقة ومكتملة", denominator: "نافذة ومستحقة", source: "municipal_decision", period: "حتى تاريخ اليوم", target: null, owner: "رئيس البلدية", frequency: "لحظي", better: "up", quality: "partial", unit: "%", href: "/staff/council/decisions" },
  { id: "COMPLAINT_RATE", ar: "معالجة الشكاوى", en: "Complaint processing rate", definition: "من الشكاوى والطلبات الواردة في الفترة، نسبة ما تمت معالجته.", formula: "الواردة في الفترة وحالتها «تمت المعالجة» ÷ كل الواردة في الفترة × 100", numerator: "واردة ومعالَجة", denominator: "كل الواردة في الفترة", source: "citizen_request", period: "الفترة المختارة", target: null, owner: "الموظف المختص", frequency: "لحظي", better: "up", quality: "available", unit: "%", href: "/staff/requests" },
  { id: "PROJECT_PROGRESS", ar: "إنجاز المشاريع", en: "Project completion", definition: "الإنجاز الفعلي المرجّح بمراحل وأوزان معتمدة.", formula: "Σ (وزن المرحلة × إنجازها) ÷ Σ الأوزان", numerator: "الإنجاز المرجّح", denominator: "مجموع الأوزان", source: "سجل المشاريع (غير مُنشأ بعد)", period: "حتى تاريخه", target: null, owner: "مسؤول المشاريع", frequency: "أسبوعي", better: "up", quality: "missing", unit: "%", href: "#" },
  { id: "BUDGET_EXEC", ar: "تنفيذ الموازنة", en: "Budget execution", definition: "النفقات المدفوعة ÷ الاعتمادات المعتمدة ذات الصلة.", formula: "النفقات المدفوعة ÷ الاعتماد الحالي × 100", numerator: "النفقات المدفوعة", denominator: "الاعتمادات المعتمدة", source: "سجل الموازنة (غير مُنشأ بعد)", period: "السنة المالية", target: null, owner: "المسؤول المالي", frequency: "شهري", better: "up", quality: "missing", unit: "%", href: "#" },
];

export type Card = { def: KpiDef; value: string | null; lines?: string[]; delta: { text: string; dir: "up" | "down" | "flat"; good: boolean | null } | null; spark: number[] | null; reason?: string };

/** Change vs the previous period, only when both values exist (never fabricate a trend). */
export function delta(now: number | null, prev: number | null, better: "up" | "down", unit: string): Card["delta"] {
  if (now === null || prev === null) return null;
  const d = now - prev;
  if (d === 0) return { text: "دون تغيير", dir: "flat", good: null };
  const dir = d > 0 ? "up" : "down";
  const text = unit === "%" ? `${Math.abs(Math.round(d))} نقطة` : prev === 0 ? "جديد" : `${Math.abs(Math.round((100 * d) / prev))}%`;
  return { text, dir, good: (better === "up") === (d > 0) };
}
