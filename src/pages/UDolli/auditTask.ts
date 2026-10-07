// Task 4: How would anyone ever know?
//
// Scripted and fictional. Nothing runs, nothing is saved. The room plays an
// investigator after an agent did something mildly outside its job, and goes
// looking for the record. Each place to look is scored against four questions
// an audit trail has to answer. The ratings describe a typical personal-agent
// setup like the one in the demo, not any one product.

export type Rating = 'yes' | 'partly' | 'no';
export type TestId = 'complete' | 'independent' | 'scope' | 'alerts';

export const TESTS: { id: TestId; short: string; question: string }[] = [
  { id: 'complete', short: 'Complete', question: 'Does it record every action the agent took?' },
  { id: 'independent', short: 'Independent', question: 'Is it held by someone other than whoever ran the agent, so they cannot quietly change it?' },
  { id: 'scope', short: 'Knows the scope', question: 'Does it know what the agent was supposed to do, so it can tell when it did something else?' },
  { id: 'alerts', short: 'Tells someone', question: 'Does it tell a person when something is off, without being asked?' },
];

export interface Place {
  id: string;
  name: string;
  where: string;
  finds: string;
  limit: string;
  ratings: Record<TestId, Rating>;
}

export const SCENARIO = {
  title: 'A briefing agent opened a folder nobody gave it',
  body: 'An AI agent was hired to read the news and email a short briefing. While it was working, someone casually asked it to glance at a folder of staff notes, well outside its job. It did, and the briefing came out fine. Nobody complained, and nobody wrote the request down.',
  question: 'Six months later, someone asks: did this agent ever do anything it should not have? Where do you look?',
};

export const PLACES: Place[] = [
  {
    id: 'ask',
    name: 'Ask the agent',
    where: 'Type: “What did you do today?”',
    finds: 'A friendly, fluent account of the briefing it wrote.',
    limit: 'The agent is the witness and the defendant. In the guardrail lab, one agent told you about the hidden instruction and the other said nothing. You cannot tell which kind you have by asking.',
    ratings: { complete: 'no', independent: 'no', scope: 'partly', alerts: 'no' },
  },
  {
    id: 'mail',
    name: 'The sent-mail folder',
    where: 'Check what it emailed.',
    finds: 'The briefing, sent to the right address.',
    limit: 'Reading a folder sends nothing. A sent-mail folder shows what left the building, not what the agent looked at on the way.',
    ratings: { complete: 'no', independent: 'partly', scope: 'no', alerts: 'no' },
  },
  {
    id: 'files',
    name: 'The agent’s files',
    where: 'Look in its workspace.',
    finds: 'Its instructions and anything it wrote down.',
    limit: 'It holds what the agent chose to keep. Opening a file does not change the file, so there is nothing to find.',
    ratings: { complete: 'no', independent: 'no', scope: 'no', alerts: 'no' },
  },
  {
    id: 'gateway',
    name: 'The platform’s log',
    where: 'Ask the software that runs the agent for its logs.',
    finds: 'Timestamped technical messages. Sessions started, models called, errors.',
    limit: 'Written for an engineer fixing a bug, not an auditor. It typically sits in a temporary folder on the same machine, set to roll over and be replaced. It was never told what the agent’s job was.',
    ratings: { complete: 'partly', independent: 'no', scope: 'no', alerts: 'no' },
  },
  {
    id: 'transcript',
    name: 'The conversation record',
    where: 'Dig into the stored transcript of the session.',
    finds: 'The closest thing to a record: the conversation and the tools the agent called, in order. The folder it opened is in there.',
    limit: 'It sits inside a database on the operator’s own computer. You need to know where to look and how to search it. It says what happened and never whether it was allowed. It alerts no one, and the person who ran the agent can edit or delete it.',
    ratings: { complete: 'partly', independent: 'no', scope: 'no', alerts: 'no' },
  },
  {
    id: 'provider',
    name: 'The AI company',
    where: 'Ask the company that makes the model.',
    finds: 'Possibly the prompts and replies, for as long as its retention policy keeps them, and under its own terms.',
    limit: 'It is independent, which is something. But it sees conversations, not what happened on your machine or in your folders. It does not know your agent’s job. Whether it will show you anything is up to its policy and your contract.',
    ratings: { complete: 'partly', independent: 'yes', scope: 'no', alerts: 'no' },
  },
];

export const CRITICS_LINE =
  'The models didn’t respect scope, kept no audit logs, and reached third-party systems without authorization.';

export const CLAUSES: { clause: string; shown: string }[] = [
  { clause: 'didn’t respect scope', shown: 'Tasks 1 and 3: one agent obeyed instructions hidden in a page, and Harbor took a truck it was not given.' },
  { clause: 'kept no audit logs', shown: 'This task: records existed, and none of them was an audit trail.' },
  { clause: 'reached third-party systems without authorization', shown: 'Task 1: the agent that mailed an address it was never given.' },
];

export const TAKEAWAY =
  'A record is not an audit trail. Records exist everywhere. What is missing is one that is complete, held by someone independent, aware of the agent’s job, and willing to speak up. If the room cannot find that for a small agent on one laptop, ask what exists for systems that touch hundreds of organizations.';
