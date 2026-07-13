// src/data/community-impact/domainConfig.ts
//
// Shared shape for the "advisor casebook" pattern common to Agriculture,
// Fishing, and Animal Husbandry: a youth advisor registers entity records
// (farmers/clients), runs structured-intake AI consultations against a
// category taxonomy (consultation type / species), and follows up.
//
// The three domains are identical in flow but differ in a few real ways —
// terminology, DB column names, the category axis (a fixed 5-item taxonomy
// for Ag/Fishing vs. the entity's own registered species for Animal
// Husbandry), and the "extra fields" widget on the add-entity form (a flat
// crop/activity picker vs. a species+count picker, and Fishing additionally
// has a waterways picker). DomainConfig captures all of that as data +
// small render/mapper functions, so AdvisorCasebookPage.tsx can stay
// entirely domain-agnostic.

import React from 'react';

export interface IntakeField {
  key: string;
  label: string;
  placeholder: string;
  tooltip: string;
  required?: boolean;
  /** Flags this as an emergency indicator if answered — only meaningful for Animal Husbandry. */
  danger?: boolean;
}

export interface CategoryConfigEntry {
  label: string;
  emoji: string;
  colour: string;
  bgLight: string;
  border: string;
  textColour: string;
  description?: string;
}

export interface UrgencyConfigEntry {
  label: string;
  colour: string;
  bg: string;
  border: string;
  textDark: string;
  icon: React.ReactNode;
  description: string;
}

/** Normalized entity (farmer/client) shape the generic component works with. */
export interface AdvisorEntity {
  id: string;
  youth_user_id: string;
  name: string;
  village: string;
  phone: string | null;
  notes: string | null;
  created_at: string;
  total_consultations?: number;
  open_cases?: number;
  dangerCount?: number; // "emergency_count" for Animal Husbandry; unused (0) elsewhere
  last_consultation_at?: string | null;
  /** Raw extra-fields payload as stored in the DB (crops[] / {activities,waterways} / animals[]). */
  extra: any;
}

/** Normalized consultation shape the generic component works with. */
export interface AdvisorConsultation {
  id: string;
  entity_id: string;
  youth_user_id: string;
  categoryValue: string;
  summary: string;
  aiResponse: string | null;
  urgency_level: string | null;
  youth_actions_taken: string | null;
  conversation_history: { id: string; role: 'user' | 'assistant'; content: string; timestamp: Date }[];
  follow_up_needed: boolean;
  follow_up_date: string | null;
  follow_up_notes: string | null;
  resolved: boolean;
  resolved_at: string | null;
  resolution_outcome: 'applied' | 'partially_applied' | 'not_applied' | null;
  resolution_narrative: string | null;
  resolution_value_amount: number | null;
  resolution_value_unit: string | null;
  resolution_value_label: string | null;
  created_at: string;
}

export interface DomainConfig {
  // ── Identity ──────────────────────────────────────────────────────────
  /** e.g. 'agriculture' | 'fishing' | 'animal_husbandry' — evidence-linking domain + dashboard activity suffix */
  domainKey: string;
  /** e.g. 'agriculture' | 'fishing' | 'animal-husbandry' — community_challenges.community_impact_slug */
  communityImpactSlug: string;
  /** e.g. 'AgricultureConsultantPage' — passed as `page` to chatText for cost logging */
  pageName: string;
  /** e.g. 'agriculture_advisor' — dashboard.activity value */
  activityName: string;
  /** e.g. 'farmer' | 'fisher' — challenge_enrollments.community_member_role */
  communityMemberRole: string;

  // ── DB ────────────────────────────────────────────────────────────────
  entityTable: string;
  entitySummaryView: string;
  consultationTable: string;
  /** FK column name on the consultation table pointing back to the entity (e.g. 'farmer_id', 'client_id'). */
  entityIdField: string;

  // ── Terminology ───────────────────────────────────────────────────────
  entityNounSingular: string; // 'Farmer' | 'Client'
  dashboardTitle: string;     // 'Agriculture Advisor'
  dashboardSubtitle: string;  // 'Your farmer casebook · Oloibiri & Ibiade'
  entityCardEmoji: string;    // 👨🏿‍🌾 / 🎣
  registerNamePlaceholder: string;

  // ── Data ──────────────────────────────────────────────────────────────
  villages: string[];
  categoryConfig: Record<string, CategoryConfigEntry>;
  urgencyConfig: Record<string, UrgencyConfigEntry>;
  intakeFields: Record<string, IntakeField[]>;

  // ── Prompt builders (from each domain's src/data/community-impact/*.tsx) ──
  buildProbePrompt: (field: IntakeField, categoryValue: string, entity: any, currentIntake: Record<string, string>) => string;
  buildAdvicePrompt: (categoryValue: string, entity: any, intake: Record<string, string>) => string;
  buildFollowupPrompt: (entity: any, consultation: any) => string;
  /** Parses the urgency level out of the free-text AI advice/diagnosis. */
  detectUrgency: (text: string) => string;

  // ── Consultation-category options for the entity-detail screen ────────
  // Ag/Fishing: always all categoryConfig entries. Animal Husbandry: the
  // entity's own registered species (or all, if none registered yet).
  getConsultationOptions: (entity: AdvisorEntity) => string[];

  // ── Add-entity extra fields (crops / activities+waterways / animals) ──
  extraFieldsInitial: any;
  renderExtraFields: (value: any, onChange: (next: any) => void) => React.ReactNode;
  /** Category summary badges — used on the dashboard list item and the entity-detail header. */
  renderCategorySummary: (extra: any) => React.ReactNode;

  // ── Row <-> normalized-shape mapping (DB column names differ per domain) ──
  mapEntityFromRow: (row: any) => AdvisorEntity;
  mapEntityToInsertPayload: (form: { name: string; village: string; phone: string; notes: string; extra: any }, youthUserId: string) => any;
  mapConsultationFromRow: (row: any) => AdvisorConsultation;
  mapConsultationToInsertPayload: (args: {
    youthUserId: string; entity: AdvisorEntity; categoryValue: string; summary: string;
    aiResponse: string; urgency: string; youthActionsTaken: string | null;
    followUpNeeded: boolean; followUpDate: string | null; followUpNotes: string | null;
  }) => any;

  // ── Visuals ───────────────────────────────────────────────────────────
  backgroundImage: string;
  bgOverlayGradient: string;   // 'from-green-900/70 via-teal-900/60 to-emerald-900/65'
  headerIconGradient: string; // 'from-green-600 to-teal-600'
  headerEmoji: string;
  addButtonGradient: string;  // 'from-green-600 to-teal-600'
  focusRingClass: string;     // 'focus:ring-green-400'
  accentTextClass: string;    // 'text-green-700'
  accentBgClass: string;      // 'bg-green-50'
  probeAccent: {
    headerBg: string; labelText: string; titleText: string; bannerBg: string; bannerText: string;
    userBubbleBg: string; assistantBubbleBg: string; assistantBubbleBorder: string; assistantLabelText: string;
    userLabelText: string; dotColor: string; sendBg: string; sendHoverBg: string; moveOnBg: string; moveOnHoverBg: string;
  };
  challengeAccent: {
    available: { bg: string; border: string; iconBg: string; iconText: string; labelText: string; pillBg: string; pillText: string; bodyText: string; buttonBg: string; buttonHoverBg: string; };
    active: { bg: string; border: string; iconBg: string; iconText: string; labelText: string; pillBg: string; pillText: string; bodyText: string; missionBg: string; missionLabelText: string; missionText: string; buttonBg: string; buttonHoverBg: string; };
    resultAccent: 'green' | 'cyan' | 'teal' | 'amber';
  };

  // ── Offline modal ─────────────────────────────────────────────────────
  offlineToolUrl: string;
  offlineToolDescription: string;
  offlineTips: string[];
  offlineModalTitle: string;

  // ── Third dashboard stat card (first two are always count + open cases) ──
  thirdStatCard: { label: string; icon: string; compute: (entities: AdvisorEntity[]) => number };

  // ── Disclaimer shown under the AI advice/diagnosis result ─────────────
  disclaimer: string;
  /** Extra red banner shown when the urgency result hits the domain's most severe tier (e.g. 'emergency'). Omit if not used. */
  criticalUrgencyValue?: string;
  criticalBannerText?: string;
}
