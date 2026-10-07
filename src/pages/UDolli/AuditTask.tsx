// Task 4: How would anyone ever know?
//
// Self-contained. Scripted and fictional. No API call, no database write.

import React, { useMemo, useState } from 'react';
import classNames from 'classnames';
import { Search, Check, Minus, X, Quote, Eye } from 'lucide-react';
import { CLAUSES, CRITICS_LINE, PLACES, SCENARIO, TAKEAWAY, TESTS, type Rating } from './auditTask';

const RATING_STYLE: Record<Rating, string> = {
  yes: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  partly: 'bg-amber-100 text-amber-800 border-amber-300',
  no: 'bg-red-100 text-red-800 border-red-300',
};
const RATING_WORD: Record<Rating, string> = { yes: 'Yes', partly: 'Partly', no: 'No' };

const RatingIcon: React.FC<{ r: Rating }> = ({ r }) =>
  r === 'yes' ? <Check className="w-3.5 h-3.5" /> : r === 'partly' ? <Minus className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />;

const AuditTask: React.FC = () => {
  const [opened, setOpened] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);

  const open = (id: string) => {
    setCurrent(id);
    setOpened((p) => (p.includes(id) ? p : [...p, id]));
  };

  const allOpened = opened.length === PLACES.length;
  const place = PLACES.find((p) => p.id === current) ?? null;

  const bestPerTest = useMemo(() => TESTS.map((t) => ({
    test: t,
    anyYes: PLACES.some((p) => p.ratings[t.id] === 'yes'),
  })), []);

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-bold text-gray-900">Task 4 &middot; How would anyone ever know?</h2>
        <p className="text-gray-600 mt-1 max-w-3xl">
          Everyone in the room has now watched AI agents step outside their jobs. Here is the question that comes after:
          if one did, how would anyone find out? You are the investigator. Go looking for the record.
        </p>
        <p className="text-gray-500 text-sm mt-2 max-w-3xl">Scripted and fictional. Nothing runs and nothing is saved.</p>
      </header>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm font-bold text-gray-900">{SCENARIO.title}</p>
        <p className="text-sm text-gray-700 mt-1">{SCENARIO.body}</p>
        <p className="text-sm font-medium text-violet-800 mt-2">{SCENARIO.question}</p>
      </section>

      <section className="rounded-lg border border-violet-200 bg-violet-50/50 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-violet-800 mb-2">Four tests for a real audit trail</p>
        <ol className="space-y-1 text-sm text-gray-800 list-decimal pl-5">
          {TESTS.map((t) => <li key={t.id}><span className="font-semibold">{t.short}.</span> {t.question}</li>)}
        </ol>
      </section>

      <div className="grid lg:grid-cols-[280px_1fr] gap-4">
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Where would you look? {opened.length}/{PLACES.length}</p>
          {PLACES.map((p) => (
            <button key={p.id} onClick={() => open(p.id)}
              className={classNames('w-full text-left rounded-lg border px-3 py-2.5 text-sm transition-colors',
                current === p.id ? 'border-violet-500 bg-violet-50' : 'border-gray-300 bg-white hover:bg-gray-50')}>
              <span className="flex items-center gap-2 font-semibold text-gray-900">
                <Search className="w-3.5 h-3.5 text-gray-400" /> {p.name}
                {opened.includes(p.id) && <Eye className="w-3.5 h-3.5 text-violet-600 ml-auto" />}
              </span>
              <span className="block text-xs text-gray-500 mt-0.5">{p.where}</span>
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-gray-300 bg-white min-h-[16rem]">
          {!place ? (
            <p className="p-6 text-sm text-gray-500">Pick a place to look. Before you open it, say out loud what you expect to find.</p>
          ) : (
            <div className="p-4 space-y-3">
              <h3 className="text-base font-bold text-gray-900">{place.name}</h3>
              <div className="text-sm"><p className="text-xs font-bold uppercase tracking-wide text-gray-500">What you find</p><p className="text-gray-800 mt-0.5">{place.finds}</p></div>
              <div className="text-sm"><p className="text-xs font-bold uppercase tracking-wide text-gray-500">Why that is not enough</p><p className="text-gray-800 mt-0.5">{place.limit}</p></div>
              <div className="grid sm:grid-cols-2 gap-2 pt-1">
                {TESTS.map((t) => {
                  const r = place.ratings[t.id];
                  return (
                    <div key={t.id} className={classNames('rounded-md border px-3 py-1.5 text-xs font-semibold flex items-center gap-2', RATING_STYLE[r])}>
                      <RatingIcon r={r} /> {t.short}: {RATING_WORD[r]}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {allOpened && (
        <>
          <section className="rounded-lg border border-gray-300 bg-white p-4 overflow-x-auto">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Everywhere you looked</p>
            <table className="w-full text-sm min-w-[32rem]">
              <thead>
                <tr className="text-left text-xs text-gray-500">
                  <th className="py-1 pr-3 font-semibold">Place</th>
                  {TESTS.map((t) => <th key={t.id} className="py-1 px-2 font-semibold text-center">{t.short}</th>)}
                </tr>
              </thead>
              <tbody>
                {PLACES.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="py-1.5 pr-3 text-gray-900">{p.name}</td>
                    {TESTS.map((t) => (
                      <td key={t.id} className="py-1.5 px-2 text-center">
                        <span className={classNames('inline-flex items-center justify-center w-6 h-6 rounded-full border', RATING_STYLE[p.ratings[t.id]])} title={RATING_WORD[p.ratings[t.id]]}>
                          <RatingIcon r={p.ratings[t.id]} />
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-sm text-gray-800 mt-3">
              {bestPerTest.filter((b) => !b.anyYes).length === 0
                ? 'Every test is passed somewhere.'
                : <>No place passes <span className="font-semibold">{bestPerTest.filter((b) => !b.anyYes).map((b) => b.test.short).join(' or ')}</span>. Nothing passes all four.</>}
            </p>
            <p className="text-sm text-gray-700 mt-2">{TAKEAWAY}</p>
          </section>

          <section className="rounded-lg border border-gray-800 bg-gray-900 text-gray-100 p-5">
            <Quote className="w-5 h-5 text-gray-500 mb-2" />
            <p className="text-lg leading-snug font-serif">{CRITICS_LINE}</p>
            <ul className="mt-4 space-y-2 text-sm text-gray-300">
              {CLAUSES.map((c) => (
                <li key={c.clause}><span className="font-semibold text-white">&ldquo;{c.clause}&rdquo;</span> &mdash; {c.shown}</li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
};

export default AuditTask;
