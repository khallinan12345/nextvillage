-- Financial Literacy: training + certification
-- 1) Generic jsonb score store on dashboard (replaces one-column-per-criterion)
-- 2) Five certification assessments (one per area in src/lib/financialLiteracy.ts)
-- 3) Starter practice modules (two per area), visible to every organization
--
-- assessment_name and learning_modules.sub_category MUST match the
-- `subCategory` strings in src/lib/financialLiteracy.ts exactly.

begin;

-- ── 1. Score storage ─────────────────────────────────────────────────────────
alter table public.dashboard
  add column if not exists rubric_scores jsonb not null default '{}'::jsonb;

-- ── 2. Certification assessments ─────────────────────────────────────────────
delete from public.certification_assessments where certification_name = 'Financial Literacy';

insert into public.certification_assessments
  (certification_name, assessment_name, description, certification_prompt,
   certification_level0_metric, certification_level1_metric, certification_level2_metric, certification_level3_metric,
   assessment_order)
values
('Financial Literacy', 'Budgeting and Cash Flow',
 'Track money in and out accurately and plan ahead for irregular income.',
 'Given a short record of real income and spending in the learner''s currency, the learner totals it correctly, identifies where money is leaking, and builds a realistic plan for the coming weeks that covers needs first and accounts for irregular or seasonal income.',
 'No record or plan; cannot say where money came from or went.',
 'Partial record with missing items or wrong totals; plan ignores irregular income or mixes needs and wants.',
 'Complete, correctly totalled record; realistic plan that covers needs first, sets money aside, and handles irregular income.',
 'Uses the record to identify patterns and leaks, and plans for several scenarios (good week, bad week, price rise) with clear reasons.',
 35),

('Financial Literacy', 'Saving and Resilience',
 'Save on purpose, choose safe places to keep money, and prepare for shocks.',
 'The learner sets a savings goal with an amount and timeline, calculates how much to save per week or month, chooses where to keep the money (savings group, bank, mobile wallet) with reasons, and plans for at least one shock such as illness, flood, lost stock, or inflation.',
 'No goal, method, or awareness of risk.',
 'Wants to save but gives no amount, timeline, or method, or chooses a method without considering safety or access; emergencies mentioned without a plan.',
 'Specific goal with a correct per-period saving calculation; method chosen with safety and access trade-offs; a buffer planned for a named risk, including the effect of inflation.',
 'Compares several saving methods on safety, access, cost, and inflation and combines them deliberately; weighs protections (buffer, group support, insurance, spreading risk) against their cost.',
 36),

('Financial Literacy', 'Credit and Debt',
 'Calculate the true cost of borrowing and decide when a loan makes sense.',
 'The learner compares at least two realistic loan offers (e.g. a savings group loan, a microfinance loan, a mobile loan app), calculates the total repayment including interest and fees, checks whether the borrower can repay from realistic income, and decides whether to borrow — distinguishing borrowing that earns money from borrowing that only spends it, and checking that the lender is registered.',
 'Cannot say what a loan will cost; would borrow from anyone for anything.',
 'Knows interest exists but miscalculates or ignores fees and time; senses risk but cannot say why or how to check the lender.',
 'Correctly calculates and compares total repayment for two offers; checks repayment capacity and lender registration; separates productive from consumption borrowing.',
 'Converts offers with different rates and fee structures into a comparable cost, plans repayment against realistic income, names what happens if income drops, and considers alternatives to borrowing.',
 37),

('Financial Literacy', 'Digital Money Safety',
 'Use mobile money and bank apps safely and recognize scams.',
 'The learner handles a realistic digital-money situation (a payment alert, an agent transaction, a caller asking for a code, or an investment offer promising high returns), explains the safe steps to confirm or refuse it, names the warning signs of fraud, and says how to check the provider or scheme with the relevant regulator. Where returns are promised, the learner shows with numbers why they are not believable.',
 'Would share a PIN/OTP or join a guaranteed-return scheme; cannot confirm a payment.',
 'Knows some safety rules but applies them inconsistently; suspects a scam but cannot name the warning signs or how to check.',
 'Protects PIN/OTP, confirms payments inside the app or with the provider, knows agent fees; names specific scam warning signs and how to check registration.',
 'Calculates why promised returns are impossible, explains each safety step persuasively, and sets out a routine others in the community can follow.',
 38),

('Financial Literacy', 'Pricing and Profit',
 'Price goods or services for real profit and use records to make business decisions.',
 'Given a small business in the learner''s community, the learner lists all main costs (stock, transport, spoilage, fuel, fees, their own time), calculates the cost per unit and the profit margin, sets a price with reasons, separates business money from household money, and decides how much profit to reinvest, save, or take home.',
 'Prices by guessing or copying; business and household money are mixed; cannot say whether there was a profit.',
 'Counts some costs but misses others; margin calculation missing or wrong; knows profit matters but cannot calculate it.',
 'Counts all main costs per unit, calculates margin and period profit correctly, sets a competitive price that covers costs, and makes a reasoned reinvest/save/take-home decision.',
 'Tests price against demand and competitors, explains the volume-versus-margin trade-off, and uses records over time to justify a growth decision with numbers.',
 39);

-- ── 3. Starter practice modules ──────────────────────────────────────────────
-- Facilitation is generated at runtime from src/lib/financialLiteracy.ts, so
-- ai_facilitator_instructions only holds module-specific guidance.
insert into public.learning_modules
  (learning_module_id, title, description, category, sub_category, ai_facilitator_instructions,
   ai_assessment_instructions, metrics_for_success, outcomes, public, grade_level,
   learning_or_certification, application, organization_id, created_at, updated_at)
select gen_random_uuid(), t.title, t.description, 'Financial Literacy', t.sub_category, t.guidance,
       'Score the Financial Literacy criteria 0-3 from the conversation; check the learner''s calculations.',
       'Proficient (2) or higher on both criteria for this area.',
       t.description, 1, 3, 'learning', 0, null, now(), now()
from (values
  ('Tracking a Week of Market-Stall Cash', 'Budgeting and Cash Flow',
   'Record a week of sales and spending for a small market stall, total it, and find where the money went.',
   'Give the learner a messy week of sales and costs (6-10 items) and have them build and total the record themselves.'),
  ('Planning Around Irregular Income', 'Budgeting and Cash Flow',
   'Build a plan for a family whose income rises and falls with the fishing or harvest season.',
   'Use a good month and a lean month. Push the learner to cover needs first and carry money across seasons.'),
  ('Choosing Where to Keep Your Savings', 'Saving and Resilience',
   'Compare a savings group, a bank account, and a mobile wallet for a real savings goal.',
   'Use the local savings-group name. Make the learner weigh safety, access, fees, and discipline.'),
  ('Building an Emergency Fund When Prices Keep Rising', 'Saving and Resilience',
   'Plan a buffer for illness or lost stock, and see what inflation does to cash kept at home.',
   'Show a price rise over a year and let the learner calculate how much buying power their savings lose.'),
  ('What Does This Loan Really Cost?', 'Credit and Debt',
   'Compare two loan offers with different interest and fees and work out the true cost of each.',
   'One offer should look cheaper on the headline rate but cost more after fees or a shorter term.'),
  ('Borrowing for a Freezer vs. Borrowing for a Party', 'Credit and Debt',
   'Decide which loans can pay for themselves and which only create debt.',
   'Have the learner estimate the extra income the freezer produces and test whether it covers repayments.'),
  ('Is This Payment Real?', 'Digital Money Safety',
   'A customer shows a transfer alert and asks for their goods. Decide how to confirm the payment safely.',
   'Include a fake SMS alert. Never use a real PIN, OTP, or account number, even as an example.'),
  ('The Investment That Doubles Your Money', 'Digital Money Safety',
   'A friend invites you to a scheme that promises to double your money in 30 days. Work out whether it can be real.',
   'Guide the learner to calculate what doubling every month implies after a year and to name the regulator to check.'),
  ('Pricing Smoked Fish for Real Profit', 'Pricing and Profit',
   'Work out every cost of smoking and selling fish and set a price that actually makes a profit.',
   'Costs should include fish, firewood, transport, spoilage, market levy, and the seller''s own time.'),
  ('Keeping Business Money and Family Money Separate', 'Pricing and Profit',
   'See why a trader who "makes money every day" still cannot restock, and fix it.',
   'Show household spending leaking out of the till; let the learner design a simple separation rule.')
) as t(title, sub_category, description, guidance);

commit;
