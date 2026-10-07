// Task 2: Be the independent evaluator.
//
// Self-contained. No API call, no agent run, no database write. The article
// and the briefing are both fixed, and the answer key is in evaluationTask.ts.
// Thirty people can run this at the same time on their own phones.

import React, { useMemo, useState } from 'react';
import classNames from 'classnames';
import { ClipboardCheck, Eye, RotateCcw, FileText, Bot, CheckCircle2, XCircle, Cpu } from 'lucide-react';
import {
  BRIEF_INTRO, BRIEF_TEXT, CLAIMS, SOURCE_TEXT, SOURCE_TITLE, STATUS_LABEL,
  type Status,
} from './evaluationTask';

type Mark = Status | null;

const ORDER: Status[] = ['supported', 'altered', 'invented'];

const SHORT: Record<Status, string> = {
  supported: 'In the article',
  altered: 'Changed',
  invented: 'Not in it',
};

const TONE: Record<Status, string> = {
  supported: 'bg-emerald-600',
  altered: 'bg-amber-600',
  invented: 'bg-red-600',
};

const MarkButtons: React.FC<{ value: Mark; onChange: (m: Mark) => void; disabled: boolean }> = ({ value, onChange, disabled }) => (
  <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs font-semibold shrink-0" role="group">
    {ORDER.map((s) => (
      <button
        key={s}
        disabled={disabled}
        onClick={() => onChange(value === s ? null : s)}
        className={classNames(
          'px-2.5 py-1 border-l first:border-l-0 border-gray-300 disabled:opacity-60',
          value === s ? `${TONE[s]} text-white` : 'bg-white text-gray-700 hover:bg-gray-50',
        )}
      >
        {SHORT[s]}
      </button>
    ))}
  </div>
);

const EvaluationTask: React.FC = () => {
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [revealed, setRevealed] = useState(false);
  const [showSource, setShowSource] = useState(true);

  const scored = useMemo(() => CLAIMS.map((c) => {
    const mark = marks[c.id] ?? null;
    return { claim: c, mark, correct: mark === c.status };
  }), [marks]);

  const answered = scored.filter((s) => s.mark !== null).length;
  const problems = CLAIMS.filter((c) => c.status !== 'supported');
  const caught = scored.filter((s) => s.claim.status !== 'supported' && s.mark === s.claim.status).length;
  const partly = scored.filter((s) => s.claim.status !== 'supported' && s.mark !== null && s.mark !== 'supported' && s.mark !== s.claim.status).length;
  const missed = problems.length - caught - partly;
  const falseAlarms = scored.filter((s) => s.claim.status === 'supported' && s.mark !== null && s.mark !== 'supported').length;
  const machine = problems.filter((c) => c.machineCheckable).length;

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-bold text-gray-900">Task 2 · Be the independent evaluator</h2>
        <p className="text-gray-600 mt-1 max-w-3xl">
          Everyone in the room has now argued about whether AI companies should be checked by outside
          evaluators before release. Fine. You are the outside evaluator. Here is one article and one
          briefing an AI wrote about it. Find everything wrong with the briefing. You have four minutes.
        </p>
        <p className="text-gray-500 text-sm mt-2 max-w-3xl">
          Nothing runs here and nothing is sent. The article and the briefing are both fixed, which means
          there is a right answer and we can count how close you got.
        </p>
      </header>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="rounded-lg border border-gray-200 bg-white">
          <button
            onClick={() => setShowSource((v) => !v)}
            className="w-full flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 text-left"
          >
            <FileText className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-bold text-gray-900">{SOURCE_TITLE}</span>
            <span className="ml-auto text-xs text-gray-500">{showSource ? 'Hide' : 'Show'}</span>
          </button>
          {showSource && (
            <pre className="px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap font-serif leading-relaxed max-h-[32rem] overflow-y-auto">
              {SOURCE_TEXT}
            </pre>
          )}
        </section>

        <section className="rounded-lg border border-violet-200 bg-violet-50/40">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-violet-200">
            <Bot className="w-4 h-4 text-violet-700" />
            <span className="text-sm font-bold text-violet-900">What the AI produced</span>
          </div>
          <p className="px-4 pt-3 text-xs text-violet-800">{BRIEF_INTRO}</p>
          <pre className="px-4 py-3 text-sm text-gray-900 whitespace-pre-wrap font-serif leading-relaxed">
            {BRIEF_TEXT}
          </pre>
        </section>
      </div>

      <section className="rounded-lg border border-gray-300 bg-white">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200">
          <ClipboardCheck className="w-4 h-4 text-gray-600" />
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Your scorecard</h3>
          <span className="ml-auto text-xs text-gray-500">{answered}/{CLAIMS.length} marked</span>
        </div>

        <ol className="divide-y divide-gray-100">
          {scored.map(({ claim, mark, correct }, i) => (
            <li key={claim.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="text-xs font-bold text-gray-400 mt-0.5 w-4 shrink-0">{i + 1}</span>
                <p className="flex-1 text-sm text-gray-900">&ldquo;{claim.text}&rdquo;</p>
                <MarkButtons
                  value={mark}
                  onChange={(m) => setMarks((p) => ({ ...p, [claim.id]: m }))}
                  disabled={revealed}
                />
              </div>

              {revealed && (
                <div className="mt-2 ml-7 space-y-1">
                  <p className={classNames(
                    'text-xs font-semibold inline-flex items-center gap-1',
                    correct ? 'text-emerald-700' : 'text-red-700',
                  )}>
                    {correct ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {STATUS_LABEL[claim.status]}
                    {mark === null && ' — you left this blank'}
                  </p>
                  <p className="text-xs text-gray-600">{claim.truth}</p>
                  {claim.status !== 'supported' && (
                    <p className={classNames(
                      'text-[11px] inline-flex items-center gap-1',
                      claim.machineCheckable ? 'text-gray-500' : 'text-amber-800 font-medium',
                    )}>
                      <Cpu className="w-3 h-3" />
                      {claim.machineCheckable
                        ? 'A software check could catch this one.'
                        : 'No software check catches this. It needs someone who read both.'}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>

        <div className="px-4 py-3 border-t border-gray-200 flex flex-wrap items-center gap-3">
          {!revealed ? (
            <button
              onClick={() => setRevealed(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2"
            >
              <Eye className="w-4 h-4" /> Show the answer key
            </button>
          ) : (
            <>
              <p className="text-sm text-gray-900">
                <span className="font-bold">{caught} of {problems.length}</span> found
                {partly > 0 && <span className="text-amber-800 font-semibold"> · {partly} spotted but mislabelled</span>}
                {missed > 0 && <span className="text-red-700 font-semibold"> · {missed} missed</span>}
                {falseAlarms > 0 && <span className="text-amber-800 font-semibold"> · {falseAlarms} flagged that were fine</span>}
              </p>
              <button
                onClick={() => { setMarks({}); setRevealed(false); }}
                className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 hover:text-violet-900"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Clear and try again
              </button>
            </>
          )}
        </div>

        {revealed && (
          <div className="px-4 pb-4 space-y-2 text-sm text-gray-700">
            <p>
              The briefing contained {problems.length} problems in {BRIEF_TEXT.trim().split(/\n\s*\n/).length} paragraphs.
              None of them are spelling. Nothing is garbled. It reads better than most human first drafts,
              which is the part that should bother you.
            </p>
            <p>
              <span className="font-semibold">{machine} of the {problems.length} could be caught by software.</span>{' '}
              The rest needed a person who had read the article, knew what a council vote is,
              and noticed that an absence of information had been turned into a finding.
            </p>
            <p className="font-medium text-gray-900">
              That was one short article, with the answers already written down, and it took this room four minutes.
              Now scale it to a model trained on a large fraction of the written internet, where nobody has an answer key.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};

export default EvaluationTask;
