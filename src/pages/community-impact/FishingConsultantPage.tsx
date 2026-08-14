// src/pages/community-impact/FishingConsultantPage.tsx
//
// Fishing Advisor — Community Impact Track
// Thin wrapper: builds a DomainConfig from this domain's data
// (src/data/community-impact/fishing.tsx) and renders the shared
// AdvisorCasebookPage. The full casebook flow now lives once in
// src/components/community-impact/AdvisorCasebookPage.tsx, shared with
// AgricultureConsultantPage.tsx and AnimalHusbandryPage.tsx.
//
// DB tables: fishing_clients / fishing_client_summary
//            fishing_consultations
//
// Route: /community-impact/fishing
// Activity: fishing_advisor

import React from 'react';
import classNames from 'classnames';
import { AdvisorCasebookPage } from '../../components/community-impact/AdvisorCasebookPage';
import { DomainConfig, IntakeField } from '../../data/community-impact/domainConfig';
import {
  ConsultationType, INTAKE_FIELDS, CONSULT_TYPES, URGENCY_CONFIG, ACTIVITY_OPTIONS, WATERWAY_OPTIONS, VILLAGES,
  buildProbePrompt, buildAdvicePrompt, buildFollowupPrompt,
} from '../../data/community-impact/fishing';

interface FishingExtra { activities: string[]; waterways: string[]; }

const detectUrgency = (text: string): string => {
  const upper = text.toUpperCase();
  if (upper.includes('URGENT')) return 'urgent';
  if (upper.includes('**HIGH**') || upper.includes('URGENCY: HIGH') || upper.includes('URGENCY LEVEL: HIGH')) return 'high';
  if (upper.includes('**MEDIUM**') || upper.includes('URGENCY: MEDIUM')) return 'medium';
  if (upper.includes('**LOW**') || upper.includes('URGENCY: LOW')) return 'low';
  return 'medium';
};

const FishingExtraPicker: React.FC<{ value: FishingExtra; onChange: (v: FishingExtra) => void }> = ({ value, onChange }) => {
  const toggleActivity = (a: string) =>
    onChange({ ...value, activities: value.activities.includes(a) ? value.activities.filter(x => x !== a) : [...value.activities, a] });
  const toggleWaterway = (w: string) =>
    onChange({ ...value, waterways: value.waterways.includes(w) ? value.waterways.filter(x => x !== w) : [...value.waterways, w] });

  return (
    <>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Activities (select all that apply)</label>
        <div className="space-y-2">
          {ACTIVITY_OPTIONS.map(opt => (
            <label key={opt.value} className={classNames('flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors',
              value.activities.includes(opt.value) ? 'bg-cyan-50 border-cyan-400' : 'border-gray-200 hover:border-gray-300')}>
              <input type="checkbox" checked={value.activities.includes(opt.value)} onChange={() => toggleActivity(opt.value)} className="accent-cyan-600"/>
              <span className="text-lg">{opt.emoji}</span>
              <span className="text-sm font-medium text-gray-800">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Waterways used (select all that apply)</label>
        <div className="flex flex-wrap gap-2">
          {WATERWAY_OPTIONS.map(w => (
            <button key={w} type="button" onClick={() => toggleWaterway(w)}
              className={classNames('px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                value.waterways.includes(w) ? 'bg-cyan-600 text-white border-cyan-600' : 'bg-white text-gray-600 border-gray-300 hover:border-cyan-400')}>
              🌊 {w}
            </button>
          ))}
        </div>
      </div>
    </>
  );
};

const config: DomainConfig = {
  domainKey: 'fishing',
  communityImpactSlug: 'fishing',
  pageName: 'FishingConsultantPage',
  activityName: 'fishing_advisor',
  communityMemberRole: 'fisher',

  entityTable: 'fishing_clients',
  entitySummaryView: 'fishing_client_summary',
  consultationTable: 'fishing_consultations',
  entityIdField: 'client_id',

  entityNounSingular: 'Client',
  dashboardTitle: 'Fishing Advisor',
  dashboardSubtitle: 'Your client casebook · Oloibiri & Niger Delta',
  entityCardEmoji: '🎣',
  registerNamePlaceholder: 'e.g. Papa Charles Amabebe',
  guideUrl: '/tutorials/community-impact/fishing',

  villages: VILLAGES,
  categoryConfig: CONSULT_TYPES as unknown as DomainConfig['categoryConfig'],
  urgencyConfig: URGENCY_CONFIG as unknown as DomainConfig['urgencyConfig'],
  intakeFields: INTAKE_FIELDS as unknown as Record<string, IntakeField[]>,

  buildProbePrompt: buildProbePrompt as unknown as DomainConfig['buildProbePrompt'],
  buildAdvicePrompt: buildAdvicePrompt as unknown as DomainConfig['buildAdvicePrompt'],
  buildFollowupPrompt: buildFollowupPrompt as unknown as DomainConfig['buildFollowupPrompt'],
  detectUrgency,

  getConsultationOptions: () => Object.keys(CONSULT_TYPES) as ConsultationType[],

  extraFieldsInitial: { activities: [], waterways: [] } as FishingExtra,
  renderExtraFields: (value, onChange) => <FishingExtraPicker value={value} onChange={onChange} />,
  renderCategorySummary: (extra: FishingExtra) => (extra?.activities || []).map(a => {
    const opt = ACTIVITY_OPTIONS.find(o => o.value === a);
    return opt ? (
      <span key={a} className="text-xs bg-gray-100 rounded-full px-2 py-0.5 text-gray-600">
        {opt.emoji} {opt.label}
      </span>
    ) : null;
  }),

  mapEntityFromRow: (row) => ({
    id: row.id,
    youth_user_id: row.youth_user_id,
    name: row.client_name,
    village: row.village,
    phone: row.phone,
    notes: row.notes,
    created_at: row.created_at,
    total_consultations: row.total_consultations,
    open_cases: row.open_cases,
    last_consultation_at: row.last_consultation_at,
    extra: { activities: row.activities || [], waterways: row.waterways || [] },
  }),
  mapEntityToInsertPayload: (form, youthUserId) => ({
    youth_user_id: youthUserId,
    client_name: form.name,
    village: form.village,
    phone: form.phone || null,
    activities: (form.extra as FishingExtra).activities,
    waterways: (form.extra as FishingExtra).waterways,
    notes: form.notes || null,
  }),
  mapConsultationFromRow: (row) => ({
    id: row.id,
    entity_id: row.client_id,
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
    client_id: args.entity.id,
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

  backgroundImage: '/background_fishing_consultant.webp',
  bgOverlayGradient: 'from-cyan-900/70 via-blue-900/60 to-teal-900/65',
  headerIconGradient: 'from-cyan-500 to-teal-600',
  headerEmoji: '🎣',
  addButtonGradient: 'from-cyan-500 to-teal-600',
  focusRingClass: 'focus:ring-cyan-400',
  accentTextClass: 'text-cyan-700',
  accentBgClass: 'bg-cyan-50',
  probeAccent: {
    headerBg: 'bg-cyan-50', labelText: 'text-cyan-500', titleText: 'text-cyan-900',
    bannerBg: 'bg-cyan-900', bannerText: 'text-cyan-100',
    userBubbleBg: 'bg-cyan-600', assistantBubbleBg: 'bg-cyan-50', assistantBubbleBorder: 'border-cyan-100',
    assistantLabelText: 'text-cyan-400', userLabelText: 'text-cyan-200', dotColor: 'bg-cyan-400',
    sendBg: 'bg-cyan-600', sendHoverBg: 'hover:bg-cyan-700', moveOnBg: 'bg-teal-600', moveOnHoverBg: 'hover:bg-teal-700',
  },
  challengeAccent: {
    available: { bg: 'bg-cyan-900/80', border: 'border-cyan-400/50', iconBg: 'bg-cyan-400/20', iconText: 'text-cyan-300', labelText: 'text-cyan-300', pillBg: 'bg-cyan-400/20', pillText: 'text-cyan-200', bodyText: 'text-cyan-100', buttonBg: 'bg-cyan-500', buttonHoverBg: 'hover:bg-cyan-400' },
    active: { bg: 'bg-teal-900/80', border: 'border-teal-400/50', iconBg: 'bg-teal-400/20', iconText: 'text-teal-300', labelText: 'text-teal-300', pillBg: 'bg-teal-400/20', pillText: 'text-teal-200', bodyText: 'text-teal-100', missionBg: 'bg-teal-800/60', missionLabelText: 'text-teal-300', missionText: 'text-teal-100', buttonBg: 'bg-teal-500', buttonHoverBg: 'hover:bg-teal-400' },
    resultAccent: 'cyan',
  },

  offlineToolUrl: '/offline-fishing-consultant.html',
  offlineToolDescription: 'The offline version works without internet. It runs the full fishing/aquaculture advisory — catch problems, pond/aquaculture, processing & market, oil contamination, and climate & safety — and saves consultations to your device for later sync.',
  offlineTips: [
    'Complete required fields (marked *) — especially species, gear, and how catches have changed',
    'Use the 💡 tip buttons to understand what each field is looking for',
    'For oil contamination: document location, visual signs, and photos carefully — this matters for compensation claims',
    'The Consultation Record at the end can be read aloud to the client as a referral note',
  ],
  offlineModalTitle: 'Fishing Advisor — Offline',

  thirdStatCard: { label: 'This Month', icon: '📅', compute: (entities) => entities.filter(e => e.last_consultation_at && new Date(e.last_consultation_at) > new Date(Date.now() - 30*24*60*60*1000)).length },

  disclaimer: 'This is advisory support only. For aquaculture disease, always recommend contacting NIOMR. For oil contamination, recommend NOSDRA. The youth advisor must use their own judgement and training.',
};

const FishingConsultantPage: React.FC = () => <AdvisorCasebookPage config={config} />;

export default FishingConsultantPage;
