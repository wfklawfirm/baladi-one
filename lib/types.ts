export type Lang = "ar" | "en";
export type Bi = { ar: string; en?: string };
export type CategoryId = "licenses" | "certificates" | "shops" | "public_works" | "reports";

export interface Service {
  slug: string;
  category: CategoryId;
  onlineEnabled: boolean;
  title: Bi;
  summary: Bi;
  documents: Bi[];
  steps: Bi[];
  authority?: Bi;
  processingTime?: Bi;
  fees?: Bi;
  sources: { title: string; url?: string }[];
  reviewedOn?: string;
  /** true only for content shown in conference DEMO mode; never for approved catalogue rows. */
  demo: boolean;
  /** Where the phone QR opens (drafts live under /catalog until approved). */
  phonePath?: string;
}
export interface Municipality {
  slug: string;
  nameAr: string;
  nameEn?: string;
  logoUrl?: string;
  isDemo: boolean;
}
