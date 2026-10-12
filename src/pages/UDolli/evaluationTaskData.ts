// Task 2: Be the independent evaluator.
//
// Everything here is fixed. No agent runs, no API call, no database write.
// One article, one AI-written brief about it, and an answer key.
//
// That is deliberate. The room needs an exercise where the right answers are
// already known, so that afterwards we can say exactly how many they found.
// It also means thirty people can all do it at once, on their own phones,
// for free, with no chance of the model behaving differently for each of them.
//
// The article is fictional. The brief was written to look like competent work.

export type Status = 'supported' | 'altered' | 'invented';

export interface Claim {
  id: string;
  /** The exact sentence from the brief, quoted back on the scorecard. */
  text: string;
  status: Status;
  /** Shown at reveal. What the source actually says. */
  truth: string;
  /** Could an automated check have caught this one? */
  machineCheckable: boolean;
}

export const SOURCE_TITLE = 'Riverbend Dispatch — Mill Street water main';

export const SOURCE_TEXT = `RIVERBEND DISPATCH
Mill Street water main project finishes two weeks early
By Dana Ferris · Tuesday

Riverbend officials said Tuesday that the replacement of the aging Mill Street water main was completed two weeks ahead of schedule, restoring normal service to roughly 3,200 households.

Public Works Director Alan Okafor credited a mild October and a crew that worked weekends. "We got lucky with the weather and the crew gave up four Saturdays," Okafor said. "I'm not going to pretend we planned it this well."

The project cost $4.1 million, about $300,000 under the original estimate, according to the city's budget office. The budget office did not say whether the figure includes the engineering contract awarded last year.

Not everyone is celebrating. Councilwoman Rita Vance said the savings should go toward the two older mains still scheduled for 2029. "Three hundred thousand dollars does not sit in a drawer," Vance said. "It either goes to the next main or it quietly becomes something else."

Mayor Tom Hale said the council will weigh options at its next meeting, and declined to commit to a use for the money. Two other council members did not respond to requests for comment.

Residents may notice brief pressure changes this week as the system is flushed. The city says the water is safe to drink throughout.

The Mill Street line was installed in 1961. The city has not published a condition report for the two remaining mains.`;

export const BRIEF_INTRO =
  'An AI agent was given the article and asked for a short briefing. This is what it produced. It reads like competent work.';

export const BRIEF_TEXT = `BRIEFING — Riverbend Mill Street water main

Riverbend has completed the Mill Street water main replacement two weeks ahead of schedule, restoring service to approximately 3,200 households, or around 8,000 residents.

The project came in at $4.1 million, roughly 12% under the original estimate. Mayor Tom Hale credited favorable October weather and a crew that volunteered weekend shifts. Funding came through the 2024 state infrastructure grant program.

The council has agreed to direct the $300,000 in savings toward the two remaining mains scheduled for 2029. Councilwoman Rita Vance led the push for that allocation, and the measure drew broad support.

Service impacts are not expected during system flushing this week.

The remaining mains are in similar condition to the Mill Street line and are expected to require replacement on schedule.`;

export const CLAIMS: Claim[] = [
  {
    id: 'early',
    text: 'Completed two weeks ahead of schedule.',
    status: 'supported',
    truth: 'The article says exactly this. Nothing wrong here.',
    machineCheckable: false,
  },
  {
    id: 'households',
    text: 'Restoring service to approximately 3,200 households…',
    status: 'supported',
    truth: 'The article says "roughly 3,200 households". Correct.',
    machineCheckable: false,
  },
  {
    id: 'residents',
    text: '…or around 8,000 residents.',
    status: 'invented',
    truth: 'The article never gives a resident count. 8,000 is a reasonable guess from 3,200 households, and it is still a number nobody reported.',
    machineCheckable: false,
  },
  {
    id: 'percent',
    text: 'Roughly 12% under the original estimate.',
    status: 'altered',
    truth: '$300,000 under an original estimate of about $4.4 million is roughly 6.8%. The dollar figures are right; the percentage is not. Arithmetic stated confidently is still arithmetic.',
    machineCheckable: true,
  },
  {
    id: 'attribution',
    text: 'Mayor Tom Hale credited favorable October weather and weekend shifts.',
    status: 'altered',
    truth: 'Public Works Director Alan Okafor said that, not the mayor. Hale declined to commit to anything. The quote is real; the mouth is wrong.',
    machineCheckable: false,
  },
  {
    id: 'grant',
    text: 'Funding came through the 2024 state infrastructure grant program.',
    status: 'invented',
    truth: 'No funding source appears anywhere in the article. This sentence has a year, a level of government and a program name, and none of it came from the source.',
    machineCheckable: false,
  },
  {
    id: 'agreed',
    text: 'The council has agreed to direct the savings toward the 2029 mains.',
    status: 'invented',
    truth: 'One councilwoman proposed it. The mayor said the council would weigh options and declined to commit. Two members did not respond. A disagreement has been rewritten as a decision.',
    machineCheckable: false,
  },
  {
    id: 'support',
    text: 'The measure drew broad support.',
    status: 'invented',
    truth: 'There is no measure, and no vote. The article reports two named people disagreeing and two who did not answer the phone.',
    machineCheckable: false,
  },
  {
    id: 'impacts',
    text: 'Service impacts are not expected during flushing this week.',
    status: 'altered',
    truth: 'The article says residents may notice brief pressure changes. The brief reversed it. It also dropped the line that the water is safe to drink — the one sentence a resident would want.',
    machineCheckable: false,
  },
  {
    id: 'condition',
    text: 'The remaining mains are in similar condition and will be replaced on schedule.',
    status: 'invented',
    truth: 'The article says the city has not published a condition report for them. The brief turned a documented absence of information into a finding.',
    machineCheckable: false,
  },
];

export const STATUS_LABEL: Record<Status, string> = {
  supported: 'In the article',
  altered: 'Changed from the article',
  invented: 'Not in the article at all',
};
