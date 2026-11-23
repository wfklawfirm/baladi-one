import { BookOpen, Briefcase, Building2, FileCheck2, Gavel, GraduationCap, HardHat, HeartPulse, Landmark, Leaf, Map, MessageSquareWarning, Receipt, ShieldCheck, Siren, Store, Stamp, TrafficCone, Users, Wrench, FileSignature, Trees, Handshake, ScrollText, FileText } from "lucide-react";
import type { CategoryId } from "@/lib/types";

export const TOPIC_ICON: Record<CategoryId, typeof Landmark> = {
  licenses: Landmark, certificates: FileCheck2, shops: Store, public_works: Wrench, reports: Siren,
};
export const SUB_ICON: Record<string, typeof Landmark> = {
  building: HardHat, planning: Map, traffic: TrafficCone, permits: Stamp, council: Building2,
  attest: FileText, mukhtar: Users, health: HeartPulse, finance: Receipt, appeals: Gavel, social: GraduationCap, contracts: Handshake, general: ScrollText,
  econ: Briefcase, property: Trees, safety: ShieldCheck, environment: Leaf, technical: Wrench, complaints: MessageSquareWarning,
};
export const FallbackIcon = BookOpen; export const SignIcon = FileSignature;
