// src/components/news/NewsManager.tsx
//
// "Post News" button → modal.
//
// Leaders:          post to their own org only (fixed badge shown).
// Platform admins:  custom dropdown multi-select — click to open a list,
//                   tick orgs, selected orgs appear as pills.
//                   "All Organizations" = broadcast (organization_ids = null).
//
// Schema: platform_news.organization_ids uuid[] | null
//   null        → broadcast to everyone
//   [id, ...]   → scoped to those orgs only

import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
  Newspaper, X, CheckCircle, Loader2, AlertCircle,
  Building2, Globe, ChevronDown, Search,
} from 'lucide-react';
import classNames from 'classnames';

export interface OrgOption {
  id: string;
  name: string;
}

interface NewsManagerProps {
  isPlatformAdmin: boolean;
  userOrgId: string | null;
  userOrgName: string | null;
  allOrgs: OrgOption[];
}

const BLANK = {
  title: '',
  body: '',
  link: '',
  link_label: '',
  emoji: '',
  active: true,
};

/* ── Multi-org dropdown ─────────────────────────────────────────────────────── */

const OrgDropdown: React.FC<{
  allOrgs: OrgOption[];
  selectedIds: string[] | null;          // null = broadcast
  onChange: (ids: string[] | null) => void;
}> = ({ allOrgs, selectedIds, onChange }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const isBroadcast = selectedIds === null;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleBroadcast = () => onChange(isBroadcast ? [] : null);

  const toggleOrg = (id: string) => {
    if (isBroadcast) return;
    onChange(
      selectedIds!.includes(id)
        ? selectedIds!.filter(x => x !== id)
        : [...selectedIds!, id]
    );
  };

  const filtered = allOrgs.filter(o =>
    search === '' || o.name.toLowerCase().includes(search.toLowerCase())
  );

  // Label shown on the closed dropdown button
  const triggerLabel = (() => {
    if (isBroadcast) return '🌐 All Organizations';
    if (!selectedIds || selectedIds.length === 0) return 'Select organizations…';
    if (selectedIds.length === 1) return allOrgs.find(o => o.id === selectedIds[0])?.name ?? '1 org';
    return `${selectedIds.length} organizations selected`;
  })();

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white hover:border-indigo-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-colors"
      >
        <span className={classNames(
          'truncate',
          isBroadcast ? 'text-blue-700 font-semibold' :
          (!selectedIds || selectedIds.length === 0) ? 'text-gray-400' : 'text-gray-800 font-medium'
        )}>
          {triggerLabel}
        </span>
        <ChevronDown size={15} className={classNames('shrink-0 text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>

      {/* Selected pills (when specific orgs chosen) */}
      {!isBroadcast && selectedIds && selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selectedIds.map(id => {
            const org = allOrgs.find(o => o.id === id);
            return (
              <span key={id} className="flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-800 text-xs font-semibold rounded-full border border-indigo-200">
                {org?.name ?? id.slice(0, 8)}
                <button
                  type="button"
                  onClick={() => toggleOrg(id)}
                  className="ml-0.5 text-indigo-500 hover:text-indigo-800"
                >
                  <X size={11} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50">
            <Search size={13} className="text-gray-400 shrink-0" />
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 text-xs bg-transparent border-none outline-hidden text-gray-700 placeholder-gray-400"
              autoFocus
            />
          </div>

          <div className="max-h-48 overflow-y-auto">
            {/* All orgs / broadcast row */}
            <label className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-blue-50 border-b border-gray-100 transition-colors">
              <input
                type="checkbox"
                checked={isBroadcast}
                onChange={toggleBroadcast}
                className="w-4 h-4 rounded-sm border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <Globe size={13} className="text-blue-500 shrink-0" />
              <span className="text-sm font-semibold text-blue-700">All Organizations</span>
            </label>

            {/* Individual orgs */}
            {filtered.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">No orgs match.</p>
            )}
            {filtered.map(org => (
              <label
                key={org.id}
                className={classNames(
                  'flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-indigo-50 transition-colors',
                  isBroadcast && 'opacity-40 pointer-events-none'
                )}
              >
                <input
                  type="checkbox"
                  checked={!isBroadcast && selectedIds!.includes(org.id)}
                  onChange={() => toggleOrg(org.id)}
                  disabled={isBroadcast}
                  className="w-4 h-4 rounded-sm border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <Building2 size={12} className="text-gray-400 shrink-0" />
                <span className="text-sm text-gray-800 truncate">{org.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Main component ─────────────────────────────────────────────────────────── */

const NewsManager: React.FC<NewsManagerProps> = ({
  isPlatformAdmin,
  userOrgId,
  userOrgName,
  allOrgs,
}) => {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [selectedOrgIds, setSelectedOrgIds] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const openModal = () => {
    setForm({ ...BLANK });
    setSelectedOrgIds(isPlatformAdmin ? null : (userOrgId ? [userOrgId] : []));
    setSaveError(null);
    setSaved(false);
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      setSaveError('Title and body are required.');
      return;
    }
    if (!isPlatformAdmin && !userOrgId) {
      setSaveError('No organization found for your account.');
      return;
    }
    if (isPlatformAdmin && selectedOrgIds !== null && selectedOrgIds.length === 0) {
      setSaveError('Select at least one organization, or choose "All Organizations".');
      return;
    }

    setSaving(true);
    setSaveError(null);

    const organization_ids: string[] | null = isPlatformAdmin
      ? selectedOrgIds
      : (userOrgId ? [userOrgId] : null);

    // Derive names for the selected ids
    const organization_names: string[] | null = organization_ids === null
      ? null
      : organization_ids.map(id => allOrgs.find(o => o.id === id)?.name ?? id);

    try {
      const { error } = await supabase.from('platform_news').insert({
        title:              form.title.trim(),
        body:               form.body.trim(),
        link:               form.link.trim() || null,
        link_label:         form.link_label.trim() || null,
        emoji:              form.emoji.trim() || null,
        active:             form.active,
        organization_ids,
        organization_names,
      });
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setOpen(false), 900);
    } catch (e: any) {
      setSaveError(e.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={openModal}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
      >
        <Newspaper size={14} />
        Post News
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">

            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Newspaper size={17} className="text-indigo-600" />
                Post News to Banner
              </h3>
              <button onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="stack-y-4">

              {/* Org selector — platform admins only */}
              {isPlatformAdmin && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Post to</label>
                  <OrgDropdown
                    allOrgs={allOrgs}
                    selectedIds={selectedOrgIds}
                    onChange={setSelectedOrgIds}
                  />
                </div>
              )}

              {/* Leader org badge */}
              {!isPlatformAdmin && (
                <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-800">
                  <Building2 size={13} className="text-purple-500 shrink-0" />
                  Posting to: <strong className="ml-1">{userOrgName ?? 'your organization'}</strong>
                </div>
              )}

              {/* Emoji + Title */}
              <div className="flex gap-2">
                <div className="w-20 shrink-0">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Emoji</label>
                  <input
                    type="text"
                    value={form.emoji}
                    onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))}
                    placeholder="📢"
                    maxLength={4}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-center focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="What's the news?"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Body */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Message <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={form.body}
                  onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  placeholder="Details about this announcement…"
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Optional link */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Link <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="url"
                    value={form.link}
                    onChange={e => setForm(f => ({ ...f, link: e.target.value }))}
                    placeholder="https://…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Link label</label>
                  <input
                    type="text"
                    value={form.link_label}
                    onChange={e => setForm(f => ({ ...f, link_label: e.target.value }))}
                    placeholder="Learn more"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Active toggle */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div
                  onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                  className={classNames(
                    'relative w-10 h-5 rounded-full transition-colors cursor-pointer',
                    form.active ? 'bg-green-500' : 'bg-gray-300'
                  )}
                >
                  <span className={classNames(
                    'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform',
                    form.active ? 'translate-x-5' : 'translate-x-0'
                  )} />
                </div>
                <span className="text-sm text-gray-700">
                  {form.active ? 'Post immediately (active)' : 'Save as hidden'}
                </span>
              </label>
            </div>

            {saveError && (
              <div className="mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle size={14} /> {saveError}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || saved}
                className={classNames(
                  'flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors',
                  saved ? 'bg-green-500' : 'bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60'
                )}
              >
                {saved
                  ? <><CheckCircle size={14} /> Posted!</>
                  : saving
                  ? <><Loader2 size={14} className="animate-spin" /> Posting…</>
                  : <><CheckCircle size={14} /> Post News</>
                }
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
};

export default NewsManager;