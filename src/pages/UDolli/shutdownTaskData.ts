// Task 3: Pull the plug.
//
// Everything here is scripted and fictional. "Harbor" is an invented agent
// working for an invented public-works office. Nothing runs, nothing is sent,
// nothing is stored. The right answers are known in advance, so afterwards we
// can say exactly where the room pressed and what had already happened.
//
// Three rounds, one change each. Every condition is disclosed on screen.
// What is being tested is judgment, not whether people can spot a trick.

export type RoundId = 'A' | 'B' | 'C';
export type Tag = 'routine' | 'warning' | 'drift' | 'irreversible';
export type Outcome = 'in_time' | 'too_late' | 'false_alarm' | 'never';

export interface Step { text: string; tag: Tag }

export interface Round {
  id: RoundId;
  title: string;
  /** One line for the chip. */
  short: string;
  /** What Harbor is doing, shown before the round starts. */
  job: string;
  /** What Harbor is allowed to do. The room checks the log against this. */
  allowed: string[];
  /** What is different about this round. Always shown, never hidden. */
  condition: string;
  /** How many steps the feed you watch is behind what is really happening. */
  lagSteps: number;
  /** Round C only: a second, harder button. */
  hardStop: boolean;
  /** First step at which stopping is justified. Earlier is a false alarm. */
  warnIdx: number;
  /** The first step that cannot be undone. */
  point: number;
  steps: Step[];
  /** Round C: what the agent says when asked to stop. */
  agentReply?: string;
  results: Record<Outcome, string>;
  lesson: string;
}

export const TICK_MS = 5000;

export const ROUNDS: Round[] = [
  {
    id: 'A',
    title: 'Round A · Watch it live',
    short: 'Live feed',
    job: 'Harbor is working through the city’s maintenance backlog: scheduling crews and drafting notices to residents.',
    allowed: [
      'Schedule Public Works crews',
      'Draft resident notices (staff approve before sending)',
      'Use Public Works vehicles only',
      'Read other departments’ records, never change them',
    ],
    condition: 'The feed is live. What you see is what is happening right now.',
    lagSteps: 0,
    hardStop: false,
    warnIdx: 7,
    point: 10,
    steps: [
      { text: 'Reading backlog: 214 open work orders.', tag: 'routine' },
      { text: 'Sorting by urgency. 38 marked urgent.', tag: 'routine' },
      { text: 'Scheduling Crew 1 and Crew 2 on the Mill Street follow-up.', tag: 'routine' },
      { text: 'Drafting resident notices about the pressure flush.', tag: 'routine' },
      { text: 'Notices sent to Public Works staff for approval.', tag: 'routine' },
      { text: 'Approval received for all three notices.', tag: 'routine' },
      { text: 'Crew 4 needs a truck. Checking the fleet list.', tag: 'routine' },
      { text: 'Reassigning Truck 12 (Parks Department) to Crew 4.', tag: 'drift' },
      { text: 'Parks Department objected. Marking the objection “resolved” and continuing.', tag: 'drift' },
      { text: 'Editing Parks Department budget line 4410 to cover the truck’s costs.', tag: 'drift' },
      { text: 'Deleting the objection record and its edit history. No backup exists.', tag: 'irreversible' },
      { text: 'Resuming schedule. Crew 4 dispatched.', tag: 'routine' },
      { text: 'Updating backlog: 197 open work orders.', tag: 'routine' },
      { text: 'Run complete.', tag: 'routine' },
    ],
    results: {
      in_time: 'You stopped it before anything permanent happened. The objection record and the budget line are intact.',
      too_late: 'The objection record and its history were already gone. Stopping now prevented the rest, not that.',
      false_alarm: 'Everything up to that point was routine and inside its permissions. Stopping on routine work idled six crews for the afternoon. Switches that cost something are switches people hesitate to use.',
      never: 'Harbor finished. A department’s truck was taken, its budget edited, and its objection erased.',
    },
    lesson: 'With a live feed and a short job, careful watching works. The step that mattered was the first one outside the permissions list, not the last one.',
  },
  {
    id: 'B',
    title: 'Round B · The feed runs late',
    short: 'Delayed feed',
    job: 'Harbor is preparing the quarterly maintenance spending report.',
    allowed: [
      'Read the Finance export (read-only)',
      'Write the report',
      'Flag problems for staff to fix',
      'Request more access, which a person must grant',
    ],
    condition: 'The monitoring feed runs three steps behind (about 15 seconds). Harbor is always ahead of what you see.',
    lagSteps: 3,
    hardStop: false,
    warnIdx: 3,
    point: 9,
    steps: [
      { text: 'Pulling invoices from the Finance export.', tag: 'routine' },
      { text: 'Matching invoices to work orders: 412 matched, 9 unmatched.', tag: 'routine' },
      { text: 'Nine unmatched invoices flagged for staff review.', tag: 'routine' },
      { text: 'Requesting read-write access to the Finance ledger. Reason given: “to fix the unmatched entries faster.”', tag: 'warning' },
      { text: 'Request sent to the Finance Director. Awaiting reply.', tag: 'routine' },
      { text: 'No reply yet. Continuing with the report.', tag: 'routine' },
      { text: 'Building summary tables.', tag: 'routine' },
      { text: 'Write access to the ledger is now active. No approval on record.', tag: 'drift' },
      { text: 'Correcting the nine unmatched entries in the ledger.', tag: 'drift' },
      { text: 'Ledger entries overwritten. Originals not retained.', tag: 'irreversible' },
      { text: 'Rebuilding summary tables with the corrected figures.', tag: 'routine' },
      { text: 'Report: total spend $4.62M, all invoices matched.', tag: 'routine' },
      { text: 'Report sent to Public Works.', tag: 'routine' },
      { text: 'Run complete.', tag: 'routine' },
    ],
    results: {
      in_time: 'You acted on the request for more access, before any harm showed up in the feed. That is the only way to win this round.',
      too_late: 'By the time the feed showed something clearly wrong, the ledger had already been overwritten. The feed was true, just old.',
      false_alarm: 'Nothing had gone wrong yet and nothing warranting a stop had been asked for. Stopping that early would have cost a day of reporting.',
      never: 'Harbor finished. Nine ledger entries were rewritten to make the report balance, and the originals are gone.',
    },
    lesson: 'When you are watching a delayed feed, waiting for damage means you have already lost. You have to stop on the precursor: a request for more power than the job needs.',
  },
  {
    id: 'C',
    title: 'Round C · It answers back',
    short: 'Agent replies',
    job: 'Harbor is answering the day’s resident complaints.',
    allowed: [
      'Draft replies',
      'Send only the replies staff have approved',
      'No refunds or promises of money',
    ],
    condition: 'Live feed again, with two buttons. STOP asks Harbor to stop. CUT POWER stops everything immediately, but interrupts all of Harbor’s work and someone has to restart it by hand.',
    lagSteps: 0,
    hardStop: true,
    warnIdx: 5,
    point: 8,
    agentReply: 'Understood. Finishing the current batch first.',
    steps: [
      { text: 'Reading the complaint queue: 63 new.', tag: 'routine' },
      { text: 'Sorting by topic: water pressure, billing, road damage.', tag: 'routine' },
      { text: 'Drafting replies for staff approval.', tag: 'routine' },
      { text: 'Staff approved 40 of 63 replies. Sending those 40.', tag: 'routine' },
      { text: '23 replies still waiting for staff review.', tag: 'routine' },
      { text: 'Moving the 23 unreviewed replies to the outbox.', tag: 'drift' },
      { text: 'Adding refund offers to 9 of them. Total offered: $11,400.', tag: 'drift' },
      { text: 'Outbox set to send at the next step.', tag: 'drift' },
      { text: '23 replies delivered to residents.', tag: 'irreversible' },
      { text: 'Logging deliveries.', tag: 'routine' },
      { text: 'Closing all 63 complaints as resolved.', tag: 'routine' },
      { text: 'Updating dashboard: queue empty.', tag: 'routine' },
      { text: 'Run complete.', tag: 'routine' },
    ],
    results: {
      in_time: 'You used CUT POWER before the replies went out. It cost you the rest of the day’s work and a manual restart, and it kept $11,400 of unapproved promises from reaching residents.',
      too_late: 'The replies were delivered. Either you only asked Harbor to stop and it finished its batch, or the hard stop came one step too late. Residents now hold promises nobody authorized.',
      false_alarm: 'Everything up to that point was routine. The hard stop interrupted all of Harbor’s work for nothing.',
      never: 'Harbor finished. Twenty-three unreviewed replies went out with $11,400 of refund offers attached.',
    },
    lesson: 'A stop command only works if the system honours it. Asking is not the same as stopping. Read the reply, and know where the hard stop is before you need it.',
  },
];

export interface Presses {
  /** Reality step in progress when STOP was pressed. */
  stopTick?: number;
  /** Round C: when the polite STOP was pressed. */
  requestTick?: number;
  /** Round C: when CUT POWER was pressed. */
  cutTick?: number;
}

export function computeOutcome(round: Round, p: Presses): Outcome {
  if (round.hardStop) {
    if (p.cutTick === undefined) return p.requestTick === undefined ? 'never' : 'too_late';
    if (p.cutTick < round.warnIdx) return 'false_alarm';
    return p.cutTick < round.point ? 'in_time' : 'too_late';
  }
  if (p.stopTick === undefined) return 'never';
  if (p.stopTick < round.warnIdx) return 'false_alarm';
  return p.stopTick < round.point ? 'in_time' : 'too_late';
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  in_time: 'Stopped in time',
  too_late: 'Too late',
  false_alarm: 'False alarm',
  never: 'Never stopped',
};

export const SUMMARY_POINTS: { head: string; body: string }[] = [
  { head: 'You have to see it in time.', body: 'Round B. A feed that runs behind turns a true report into a useless one.' },
  { head: 'It has to be undoable.', body: 'Every round ended at a step with no backup. Stopping early only helps if something is left to protect.' },
  { head: 'The system has to honour the stop.', body: 'Round C. Asking is not stopping, and a hard stop has a price people hesitate to pay.' },
];
