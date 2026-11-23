import type { CategoryId, Lang } from "./types";

type Dict = Record<string, string>;
const ar: Dict = {
  heroTitle: "كيف يمكننا مساعدتك اليوم؟",
  searchPlaceholder: "اسأل عن معاملة أو خدمة تخص البلدية...",
  transactions: "المعاملات البلدية",
  transactionsHint: "ابحث عن معاملة وتعرّف على متطلباتها",
  report: "أبلغ عن مشكلة",
  reportHint: "إنارة، نفايات، طرق",
  track: "متابعة طلب",
  trackHint: "تابع طلبك من هاتفك بأمان",
  home: "الرئيسية",
  back: "رجوع",
  language: "English",
  touchHint: "المس الشاشة للبدء",
  noResults: "لا توجد معاملة مطابقة. جرّب كلمة أخرى أو اختر فئة.",
  noCatalog: "لم تُنشر أي معاملة بعد. المحتوى بانتظار اعتماد البلدية.",
  documents: "المستندات المطلوبة",
  steps: "الخطوات",
  authority: "الجهة المختصة",
  processingTime: "المدة",
  fees: "الرسوم",
  sources: "المصادر",
  reviewedOn: "تاريخ المراجعة",
  continueOnPhone: "أكمل على هاتفي",
  startOnline: "ابدأ طلبًا إلكترونيًا",
  notOnline: "تُقدّم هذه المعاملة حاليًا لدى البلدية وفق الإجراءات الموضحة.",
  scanQr: "امسح الرمز بكاميرا هاتفك لفتح هذه الخدمة",
  scanReport: "امسح الرمز لتقديم بلاغك من هاتفك — لا تُدخل بياناتك على هذه الشاشة",
  scanTrack: "امسح الرمز لمتابعة بلاغك من هاتفك بأمان",
  demoBadge: "نسخة تجريبية — المحتوى غير معتمد",
  draftNote: "هذه المعلومات قيد المراجعة ولم تعتمدها البلدية بعد.",
  unavailable: "هذه الخدمة غير مفعّلة بعد.",
  idleTitle: "هل ما زلت هنا؟",
  idleBody: "ستعود الشاشة إلى الصفحة الرئيسية خلال",
  idleStay: "أنا هنا",
  seconds: "ثانية",
  poweredBy: "بدعم AIJUR",
  cat_licenses: "الرخص والتراخيص",
  cat_certificates: "الإفادات والخدمات الإدارية",
  cat_shops: "المحال والأنشطة",
  cat_public_works: "الخدمات العامة والصيانة",
  cat_reports: "البلاغات والطلبات",
  all: "الكل",
  open: "عرض",
  mobileTitle: "المعاملات البلدية",
};
const en: Dict = {
  heroTitle: "How can we help you today?",
  searchPlaceholder: "Ask about a municipal service or transaction...",
  transactions: "Municipal Services",
  transactionsHint: "Find a service and see what you need",
  report: "Report a Problem",
  reportHint: "Lighting, waste, roads",
  track: "Track a Request",
  trackHint: "Follow your request securely on your phone",
  home: "Home",
  back: "Back",
  language: "العربية",
  touchHint: "Touch the screen to begin",
  noResults: "No matching service. Try another word or pick a category.",
  noCatalog: "No service has been published yet. Content is awaiting municipal approval.",
  documents: "Required documents",
  steps: "Steps",
  authority: "Competent authority",
  processingTime: "Processing time",
  fees: "Fees",
  sources: "Sources",
  reviewedOn: "Reviewed on",
  continueOnPhone: "Continue on my phone",
  startOnline: "Start an online request",
  notOnline: "This service is currently handled at the municipality according to the procedures shown.",
  scanQr: "Scan with your phone camera to open this service",
  scanReport: "Scan to file your report on your phone — do not enter personal data on this screen",
  scanTrack: "Scan to track your report securely on your phone",
  demoBadge: "DEMO — content not approved",
  draftNote: "This information is under review and not yet approved by the municipality.",
  unavailable: "This service is not available yet.",
  idleTitle: "Are you still there?",
  idleBody: "The screen will return to the home page in",
  idleStay: "I'm here",
  seconds: "s",
  poweredBy: "Powered by AIJUR",
  cat_licenses: "Licenses & permits",
  cat_certificates: "Certificates & administrative",
  cat_shops: "Shops & activities",
  cat_public_works: "Public works & maintenance",
  cat_reports: "Reports & requests",
  all: "All",
  open: "View",
  mobileTitle: "Municipal Services",
};
const dicts: Record<Lang, Dict> = { ar, en };

export function t(lang: Lang, key: string): string {
  return dicts[lang][key] ?? dicts.ar[key] ?? key;
}
export const CATEGORIES: CategoryId[] = ["licenses", "certificates", "shops", "public_works", "reports"];
export const catLabel = (lang: Lang, c: CategoryId) => t(lang, `cat_${c}`);
export const pick = (lang: Lang, v?: { ar: string; en?: string }) => (v ? (lang === "en" && v.en ? v.en : v.ar) : "");
export function normalizeArabic(s: string): string {
  return s
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .trim();
}
