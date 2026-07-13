// src/pages/community-impact/AnimalHusbandryPage.tsx
//
// Animal Husbandry Advisory — Community Impact Track
// Thin wrapper: builds a DomainConfig from this domain's data
// (src/data/community-impact/animal-husbandry.tsx) and renders the shared
// AdvisorCasebookPage. The full casebook flow (dashboard, add-farmer,
// farmer-detail, new-consultation, follow-up chat, case detail, Community
// AI Challenge, evidence linking, resolution tracking) now lives once in
// src/components/community-impact/AdvisorCasebookPage.tsx, shared with
// AgricultureConsultantPage.tsx and FishingConsultantPage.tsx.
//
// DB tables: animal_husbandry_farmers / animal_husbandry_farmer_summary
//            animal_husbandry_consultations
//
// Route: /community-impact/animal-husbandry
// Activity: animal_husbandry_advisor

import React from 'react';
import { X } from 'lucide-react';
import { AdvisorCasebookPage } from '../../components/community-impact/AdvisorCasebookPage';
import { DomainConfig, IntakeField } from '../../data/community-impact/domainConfig';
import {
  Species, SPECIES_INTAKE, SPECIES_CONFIG, URGENCY_CONFIG, VILLAGES, SPECIES_OPTIONS,
  buildProbePrompt, buildDiagnosisPrompt, buildFollowupPrompt,
} from '../../data/community-impact/animal-husbandry';

interface AnimalEntry { species: Species; count: number; }

const detectUrgency = (text: string): string => {
  const lower = text.toLowerCase();
  if (lower.includes('emergency') || lower.includes('🚨')) return 'emergency';
  if (lower.includes('urgency: high') || lower.includes('**high**')) return 'high';
  if (lower.includes('urgency: medium') || lower.includes('**medium**')) return 'medium';
  if (lower.includes('urgency: low') || lower.includes('**low**')) return 'low';
  return 'medium';
};

const AnimalCountPicker: React.FC<{ value: AnimalEntry[]; onChange: (v: AnimalEntry[]) => void }> = ({ value, onChange }) => {
  const addEntry = () => {
    const used = new Set(value.map(a => a.species));
    const next = SPECIES_OPTIONS.find(s => !used.has(s.value));
    if (next) onChange([...value, { species: next.value, count: 0 }]);
  };
  const updateEntry = (idx: number, field: 'species' | 'count', v: string | number) => {
    onChange(value.map((a, i) => i === idx ? { ...a, [field]: field === 'count' ? Number(v) : v } : a));
  };
  const removeEntry = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-semibold text-gray-700">Animals</label>
        <button onClick={addEntry} disabled={value.length >= 4}
          className="text-xs text-green-700 font-semibold hover:underline disabled:opacity-40">+ Add species</button>
      </div>
      {value.length === 0 && <p className="text-sm text-gray-400 italic">No animals added yet.</p>}
      <div className="space-y-2">
        {value.map((a, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <select value={a.species} onChange={e => updateEntry(idx, 'species', e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400">
              {SPECIES_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.emoji} {s.label}</option>)}
            </select>
            <input type="number" min="0" value={a.count} onChange={e => updateEntry(idx, 'count', e.target.value)}
              className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-400" placeholder="0"/>
            <button onClick={() => removeEntry(idx)} className="text-gray-400 hover:text-red-500 p-1"><X size={16}/></button>
          </div>
        ))}
      </div>
    </div>
  );
};

const config: DomainConfig = {
  domainKey: 'animal_husbandry',
  communityImpactSlug: 'animal-husbandry',
  pageName: 'AnimalHusbandryPage',
  activityName: 'animal_husbandry_advisor',
  communityMemberRole: 'animal-keeper',

  entityTable: 'animal_husbandry_farmers',
  entitySummaryView: 'animal_husbandry_farmer_summary',
  consultationTable: 'animal_husbandry_consultations',
  entityIdField: 'farmer_id',

  entityNounSingular: 'Farmer',
  dashboardTitle: 'Animal Health Advisor',
  dashboardSubtitle: 'Your farmer casebook · Oloibiri & Ibiade',
  entityCardEmoji: '👨🏿‍🌾',
  registerNamePlaceholder: 'e.g. Mama Bello',

  villages: VILLAGES,
  categoryConfig: SPECIES_CONFIG as unknown as DomainConfig['categoryConfig'],
  urgencyConfig: URGENCY_CONFIG as unknown as DomainConfig['urgencyConfig'],
  intakeFields: SPECIES_INTAKE as unknown as Record<string, IntakeField[]>,

  buildProbePrompt: buildProbePrompt as unknown as DomainConfig['buildProbePrompt'],
  buildAdvicePrompt: buildDiagnosisPrompt as unknown as DomainConfig['buildAdvicePrompt'],
  buildFollowupPrompt: buildFollowupPrompt as unknown as DomainConfig['buildFollowupPrompt'],
  detectUrgency,

  getConsultationOptions: (entity) => {
    const animals = (entity.extra as AnimalEntry[]) || [];
    return animals.length > 0 ? animals.map(a => a.species) : SPECIES_OPTIONS.map(s => s.value);
  },

  extraFieldsInitial: [] as AnimalEntry[],
  renderExtraFields: (value, onChange) => <AnimalCountPicker value={value} onChange={onChange} />,
  renderCategorySummary: (extra: AnimalEntry[]) => (extra || []).map(a => {
    const cfg = SPECIES_CONFIG[a.species];
    return (
      <span key={a.species} className="text-xs bg-gray-100 rounded-full px-2 py-0.5 text-gray-600">
        {cfg?.emoji} {a.count} {cfg?.label}
      </span>
    );
  }),

  mapEntityFromRow: (row) => ({
    id: row.id,
    youth_user_id: row.youth_user_id,
    name: row.farmer_name,
    village: row.village,
    phone: row.phone,
    notes: row.notes,
    created_at: row.created_at,
    total_consultations: row.total_consultations,
    open_cases: row.open_cases,
    dangerCount: row.emergency_count,
    last_consultation_at: row.last_consultation_at,
    extra: row.animals || [],
  }),
  mapEntityToInsertPayload: (form, youthUserId) => ({
    youth_user_id: youthUserId,
    farmer_name: form.name,
    village: form.village,
    phone: form.phone || null,
    animals: form.extra,
    notes: form.notes || null,
  }),
  mapConsultationFromRow: (row) => ({
    id: row.id,
    entity_id: row.farmer_id,
    youth_user_id: row.youth_user_id,
    categoryValue: row.species,
    summary: row.symptom_summary,
    aiResponse: row.ai_diagnosis,
    urgency_level: row.urgency_level,
    youth_actions_taken: row.youth_actions_taken,
    conversation_history: row.conversation_history || [],
    follow_up_needed: row.follow_up_needed,
    follow_up_date: row.follow_up_date,
    follow_up_notes: row.follow_up_notes,
    resolved: row.resolved,
    resolved_at: row.resolved_at,
    resolution_outcome: row.resolution_outcome,
    resolution_narrative: row.resolution_narrative,
    resolution_value_amount: row.resolution_value_amount,
    resolution_value_unit: row.resolution_value_unit,
    resolution_value_label: row.resolution_value_label,
    created_at: row.created_at,
  }),
  mapConsultationToInsertPayload: (args) => {
    const animals = (args.entity.extra as AnimalEntry[]) || [];
    const animalCount = animals.find(a => a.species === args.categoryValue)?.count ?? null;
    return {
      youth_user_id: args.youthUserId,
      farmer_id: args.entity.id,
      species: args.categoryValue,
      symptom_summary: args.summary,
      animals_total: animalCount,
      ai_diagnosis: args.aiResponse,
      urgency_level: args.urgency,
      farmer_actions_recommended: args.aiResponse,
      youth_actions_taken: args.youthActionsTaken,
      conversation_history: [],
      follow_up_needed: args.followUpNeeded,
      follow_up_date: args.followUpDate,
      follow_up_notes: args.followUpNotes,
      resolved: false,
    };
  },

  backgroundImage: '/background_animal_husbandry.webp',
  bgOverlayGradient: 'from-green-900/70 via-teal-900/60 to-emerald-900/65',
  headerIconGradient: 'from-green-600 to-teal-600',
  headerEmoji: '🐾',
  addButtonGradient: 'from-green-600 to-teal-600',
  focusRingClass: 'focus:ring-green-400',
  accentTextClass: 'text-green-700',
  accentBgClass: 'bg-green-50',
  probeAccent: {
    headerBg: 'bg-green-50', labelText: 'text-green-500', titleText: 'text-green-900',
    bannerBg: 'bg-green-900', bannerText: 'text-green-100',
    userBubbleBg: 'bg-green-600', assistantBubbleBg: 'bg-green-50', assistantBubbleBorder: 'border-green-100',
    assistantLabelText: 'text-green-400', userLabelText: 'text-green-200', dotColor: 'bg-green-400',
    sendBg: 'bg-green-600', sendHoverBg: 'hover:bg-green-700', moveOnBg: 'bg-teal-600', moveOnHoverBg: 'hover:bg-teal-700',
  },
  challengeAccent: {
    available: { bg: 'bg-green-900/80', border: 'border-green-400/50', iconBg: 'bg-green-400/20', iconText: 'text-green-300', labelText: 'text-green-300', pillBg: 'bg-green-400/20', pillText: 'text-green-200', bodyText: 'text-green-100', buttonBg: 'bg-green-500', buttonHoverBg: 'hover:bg-green-400' },
    active: { bg: 'bg-teal-900/80', border: 'border-teal-400/50', iconBg: 'bg-teal-400/20', iconText: 'text-teal-300', labelText: 'text-teal-300', pillBg: 'bg-teal-400/20', pillText: 'text-teal-200', bodyText: 'text-teal-100', missionBg: 'bg-teal-800/60', missionLabelText: 'text-teal-300', missionText: 'text-teal-100', buttonBg: 'bg-teal-500', buttonHoverBg: 'hover:bg-teal-400' },
    resultAccent: 'teal',
  },

  offlineToolUrl: '/offline-animal-advisor.html',
  offlineToolDescription: 'The offline version works without internet. It runs the full animal health triage — poultry, goats/sheep, cattle, and pigs — and saves consultations to your device for later sync.',
  offlineTips: [
    'Complete required fields (marked *) — especially species, scale, and main symptoms',
    'Use the 💡 tip buttons to understand what each field is looking for',
    'For pigs: read the ASF warning before starting — rapid deaths in pigs are an emergency',
    'The Consultation Record at the end can be read aloud to the farmer as a referral note',
    'Emergency cases (ASF, PPR, FMD, Newcastle, CBPP) must be reported to the LGA Veterinary Officer — the advisor will tell you',
  ],
  offlineModalTitle: 'Animal Husbandry Advisor — Offline',

  thirdStatCard: { label: 'Emergencies', icon: '🚨', compute: (entities) => entities.reduce((s, e) => s + (e.dangerCount ?? 0), 0) },

  disclaimer: 'This AI diagnosis is support only. Never prescribe specific drug doses. For emergencies or reportable diseases (ASF, HPAI, FMD, PPR, CBPP), contact the nearest veterinary authority immediately.',
  criticalUrgencyValue: 'emergency',
  criticalBannerText: 'STOP all animal movement. Isolate sick animals. Report to veterinary authority immediately. Do not sell or slaughter sick animals.',
};

const AnimalHusbandryPage: React.FC = () => <AdvisorCasebookPage config={config} />;

export default AnimalHusbandryPage;
