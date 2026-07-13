// src/pages/community-impact/AgricultureConsultantPage.tsx
//
// Agriculture Advisor — Community Impact Track
// Thin wrapper: builds a DomainConfig from this domain's data
// (src/data/community-impact/agriculture.tsx) and renders the shared
// AdvisorCasebookPage. The full casebook flow now lives once in
// src/components/community-impact/AdvisorCasebookPage.tsx, shared with
// FishingConsultantPage.tsx and AnimalHusbandryPage.tsx.
//
// DB tables: agriculture_farmers / agriculture_farmer_summary
//            agriculture_consultations
//
// Route: /community-impact/agriculture
// Activity: agriculture_advisor

import React from 'react';
import classNames from 'classnames';
import { AdvisorCasebookPage } from '../../components/community-impact/AdvisorCasebookPage';
import { DomainConfig, IntakeField } from '../../data/community-impact/domainConfig';
import {
  ConsultationType, INTAKE_FIELDS, CONSULT_TYPES, URGENCY_CONFIG, CROP_OPTIONS, VILLAGES,
  buildProbePrompt, buildAdvicePrompt, buildFollowupPrompt,
} from '../../data/community-impact/agriculture';

const detectUrgency = (text: string): string => {
  const upper = text.toUpperCase();
  if (upper.includes('URGENT')) return 'urgent';
  if (upper.includes('**HIGH**') || upper.includes('URGENCY: HIGH') || upper.includes('URGENCY LEVEL: HIGH')) return 'high';
  if (upper.includes('**MEDIUM**') || upper.includes('URGENCY: MEDIUM')) return 'medium';
  if (upper.includes('**LOW**') || upper.includes('URGENCY: LOW')) return 'low';
  return 'medium';
};

const CropPicker: React.FC<{ value: string[]; onChange: (v: string[]) => void }> = ({ value, onChange }) => {
  const toggleCrop = (c: string) =>
    onChange(value.includes(c) ? value.filter(x => x !== c) : [...value, c]);

  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-2">Crops grown (select all that apply)</label>
      <div className="grid grid-cols-2 gap-2">
        {CROP_OPTIONS.map(opt => (
          <label key={opt.value} className={classNames('flex items-center gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors',
            value.includes(opt.value) ? 'bg-green-50 border-green-400' : 'border-gray-200 hover:border-gray-300')}>
            <input type="checkbox" checked={value.includes(opt.value)} onChange={() => toggleCrop(opt.value)} className="accent-green-600"/>
            <span className="text-lg">{opt.emoji}</span>
            <span className="text-sm font-medium text-gray-800">{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
};

const config: DomainConfig = {
  domainKey: 'agriculture',
  communityImpactSlug: 'agriculture',
  pageName: 'AgricultureConsultantPage',
  activityName: 'agriculture_advisor',
  communityMemberRole: 'farmer',

  entityTable: 'agriculture_farmers',
  entitySummaryView: 'agriculture_farmer_summary',
  consultationTable: 'agriculture_consultations',
  entityIdField: 'farmer_id',

  entityNounSingular: 'Farmer',
  dashboardTitle: 'Agriculture Advisor',
  dashboardSubtitle: 'Your farmer casebook · Oloibiri & Ibiade',
  entityCardEmoji: '👨🏿‍🌾',
  registerNamePlaceholder: 'e.g. Mama Ebiere Okoro',

  villages: VILLAGES,
  categoryConfig: CONSULT_TYPES as unknown as DomainConfig['categoryConfig'],
  urgencyConfig: URGENCY_CONFIG as unknown as DomainConfig['urgencyConfig'],
  intakeFields: INTAKE_FIELDS as unknown as Record<string, IntakeField[]>,

  buildProbePrompt: buildProbePrompt as unknown as DomainConfig['buildProbePrompt'],
  buildAdvicePrompt: buildAdvicePrompt as unknown as DomainConfig['buildAdvicePrompt'],
  buildFollowupPrompt: buildFollowupPrompt as unknown as DomainConfig['buildFollowupPrompt'],
  detectUrgency,

  getConsultationOptions: () => Object.keys(CONSULT_TYPES) as ConsultationType[],

  extraFieldsInitial: [] as string[],
  renderExtraFields: (value, onChange) => <CropPicker value={value} onChange={onChange} />,
  renderCategorySummary: (extra: string[]) => (extra || []).map(c => {
    const opt = CROP_OPTIONS.find(o => o.value === c);
    return opt ? (
      <span key={c} className="text-xs bg-gray-100 rounded-full px-2 py-0.5 text-gray-600">
        {opt.emoji} {opt.label}
      </span>
    ) : null;
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
    last_consultation_at: row.last_consultation_at,
    extra: row.crops || [],
  }),
  mapEntityToInsertPayload: (form, youthUserId) => ({
    youth_user_id: youthUserId,
    farmer_name: form.name,
    village: form.village,
    phone: form.phone || null,
    crops: form.extra,
    notes: form.notes || null,
  }),
  mapConsultationFromRow: (row) => ({
    id: row.id,
    entity_id: row.farmer_id,
    youth_user_id: row.youth_user_id,
    categoryValue: row.consultation_type,
    summary: row.problem_summary,
    aiResponse: row.ai_advice,
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
  mapConsultationToInsertPayload: (args) => ({
    youth_user_id: args.youthUserId,
    farmer_id: args.entity.id,
    consultation_type: args.categoryValue,
    problem_summary: args.summary,
    ai_advice: args.aiResponse,
    urgency_level: args.urgency,
    youth_actions_taken: args.youthActionsTaken,
    conversation_history: [],
    follow_up_needed: args.followUpNeeded,
    follow_up_date: args.followUpDate,
    follow_up_notes: args.followUpNotes,
    resolved: false,
  }),

  backgroundImage: '/background_agriculture_consulting.png',
  bgOverlayGradient: 'from-amber-900/70 via-orange-900/60 to-yellow-900/65',
  headerIconGradient: 'from-green-600 to-emerald-600',
  headerEmoji: '🌾',
  addButtonGradient: 'from-green-600 to-emerald-600',
  focusRingClass: 'focus:ring-green-400',
  accentTextClass: 'text-green-700',
  accentBgClass: 'bg-green-50',
  probeAccent: {
    headerBg: 'bg-green-50', labelText: 'text-green-500', titleText: 'text-green-900',
    bannerBg: 'bg-green-900', bannerText: 'text-green-100',
    userBubbleBg: 'bg-green-600', assistantBubbleBg: 'bg-green-50', assistantBubbleBorder: 'border-green-100',
    assistantLabelText: 'text-green-400', userLabelText: 'text-green-200', dotColor: 'bg-green-400',
    sendBg: 'bg-green-600', sendHoverBg: 'hover:bg-green-700', moveOnBg: 'bg-orange-600', moveOnHoverBg: 'hover:bg-orange-700',
  },
  challengeAccent: {
    available: { bg: 'bg-green-900/80', border: 'border-green-400/50', iconBg: 'bg-green-400/20', iconText: 'text-green-300', labelText: 'text-green-300', pillBg: 'bg-green-400/20', pillText: 'text-green-200', bodyText: 'text-green-100', buttonBg: 'bg-green-500', buttonHoverBg: 'hover:bg-green-400' },
    active: { bg: 'bg-amber-900/80', border: 'border-amber-400/50', iconBg: 'bg-amber-400/20', iconText: 'text-amber-300', labelText: 'text-amber-300', pillBg: 'bg-amber-400/20', pillText: 'text-amber-200', bodyText: 'text-amber-100', missionBg: 'bg-amber-800/60', missionLabelText: 'text-amber-300', missionText: 'text-amber-100', buttonBg: 'bg-amber-500', buttonHoverBg: 'hover:bg-amber-400' },
    resultAccent: 'green',
  },

  offlineToolUrl: '/offline-agriculture-advisor.html',
  offlineToolDescription: 'The offline version works without internet. It runs the full agriculture advisory — crop disease, pest damage, soil & water, post-harvest, and market & inputs — and saves consultations to your device for later sync.',
  offlineTips: [
    'Complete required fields (marked *) — especially crop/stage, symptoms, and how the problem is spreading',
    'Use the 💡 tip buttons to understand what each field is looking for',
    'For suspected aflatoxin contamination: this is a food safety emergency — do not let the produce be sold or eaten',
    'The Consultation Record at the end can be read aloud to the farmer as a referral note',
  ],
  offlineModalTitle: 'Agriculture Advisor — Offline',

  thirdStatCard: { label: 'This Month', icon: '📅', compute: (entities) => entities.filter(e => e.last_consultation_at && new Date(e.last_consultation_at) > new Date(Date.now() - 30*24*60*60*1000)).length },

  disclaimer: 'This AI advice is advisory support only. For crop disease outbreaks: contact ADP and IITA. For food safety emergencies (aflatoxin): the produce must NOT be sold or consumed. The youth advisor must use their own judgement and training.',
};

const AgricultureConsultantPage: React.FC = () => <AdvisorCasebookPage config={config} />;

export default AgricultureConsultantPage;
