// api/fullstack-task-instruction.ts
// Returns one adaptive task instruction per navigation event for the Full-Stack Builder.
// Each instruction has 3 sequential sub-tasks, each paired with a
// "why this matters" teaching commentary shown before the question.

import type { VercelRequest, VercelResponse } from '@vercel/node';

const ANTHROPIC_URL   = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-sonnet-4-6';

interface SubTaskSeed { teaching: string; question: string; }
interface TaskSeed { focus: string; steps: [SubTaskSeed, SubTaskSeed, SubTaskSeed]; }

const TASK_SEEDS: Record<string, TaskSeed> = {
  intro_fullstack: {
    focus: 'understanding the full-stack architecture',
    steps: [
      {
        teaching: `Full-stack means the front end — what visitors see — and the back end — where data lives — are connected. In this workshop, the front end is the React site you already built. The back end is Supabase, which gives you a real PostgreSQL database, user authentication, and file storage in one place — without writing any server code yourself.`,
        question: `In your own words, explain the difference between your static React site and a full-stack application. What does "the back end" mean in this context, and why does your site need one?`,
      },
      {
        teaching: `Supabase works through four tools you will use throughout this project: Tables — where your data lives, like rows in a spreadsheet. Auth — built-in login and signup for your users. Storage — for files like photos and documents. And the SQL Editor — where you can write queries to inspect and modify your data directly.`,
        question: `Your site already has content and pages. Which of the four Supabase tools — Tables, Auth, Storage, or SQL Editor — will be most important for what you planned in Phase 0? Explain why.`,
      },
      {
        teaching: `The data planning you did in Phase 0 was not just an exercise — it is your blueprint. Every table you will create, every access rule you will write, and every form you will build flows directly from those decisions. Professional developers call this a "data model," and having one before writing any code is the difference between building on solid ground and building on sand.`,
        question: `Looking back at your Phase 0 plan — what were the two or three most important data needs you identified? How do they connect to what your site visitors will actually do?`,
      },
    ],
  },
  setup_supabase: {
    focus: 'setting up a Supabase project and connecting it to React',
    steps: [
      {
        teaching: `Supabase is a backend-as-a-service. It gives you a PostgreSQL database, authentication, and an API — without writing server code. Setting it up takes five minutes. The Project URL and anon key are your site's credentials — they tell your React app which database to talk to. Getting these right is critical: nothing works without them.`,
        question: `Have you created a Supabase project? Describe the app you are building and paste your Project URL and anon key — or describe where you are in the setup process.`,
      },
      {
        teaching: `The anon key is a public key — it is safe to use in a browser. But it only controls what unauthenticated visitors can access. Row Level Security policies, which you will write later, determine exactly what the anon key can and cannot read or write. Understanding this now prevents the most common full-stack security mistake: exposing data that should be private.`,
        question: `Based on your Phase 0 access plan — what data should anonymous visitors see without logging in? What should require authentication? Be specific about your site's content.`,
      },
      {
        teaching: `Environment variables keep secrets out of your code. Your Supabase URL and anon key go in a .env file that is never pushed to GitHub. The .env.example file documents which variables are needed without exposing their values. This is standard professional practice — even the anon key should not appear directly in your source code.`,
        question: `Confirm your .env file is set up correctly. What environment variable names are you using — and is your .env file listed in .gitignore?`,
      },
    ],
  },
  design_schema: {
    focus: 'designing the database schema',
    steps: [
      {
        teaching: `A schema is the blueprint of your database. Before the AI creates any tables, you need to decide: what data do you need to store, how is it organised, and how do the pieces relate? A good schema makes everything that follows easier. A bad schema creates problems that compound throughout the entire project. Your Phase 0 plan is the foundation — now we turn it into precise table definitions.`,
        question: `Describe your main content table in detail. What does each row represent — a story, a profile, a submission? List every column it needs, its data type, and why it matters.`,
      },
      {
        teaching: `Most real applications need more than one table. A profiles table extends your authentication users with public information — name, role, photo, bio. A communities table groups content by location. These tables link together through foreign keys: a story's author_id connects it to a user's profile. Designing these relationships before writing SQL prevents the need to rebuild your database halfway through.`,
        question: `Beyond your main content table, what other tables does your site need? For each one, describe its columns and how it connects to the other tables.`,
      },
      {
        teaching: `Relationships between tables enforce data integrity and enable powerful queries. A story belongs to a user — that means author_id in the stories table references the user id. When you write a Supabase query that joins stories and profiles, you get the author's name without a second database round trip. Planning these relationships now makes your React code dramatically simpler.`,
        question: `Describe the relationships between your tables. Which columns reference which other tables? What happens to related data if a user deletes their account or a post is removed?`,
      },
    ],
  },
  create_tables: {
    focus: 'creating database tables with SQL',
    steps: [
      {
        teaching: `CREATE TABLE is the SQL command that defines a table's structure. Each column has a name, a data type, and optional constraints. UUID primary keys are better than auto-increment integers for distributed systems — they are globally unique and can be generated on the client side. DEFAULT NOW() records the exact timestamp automatically every time a row is inserted.`,
        question: `Generate the SQL to create your main content table with all columns, primary key, foreign keys, and default values. Include a CHECK constraint if any column should only accept specific values — like a status field that must be "pending", "published", or "archived".`,
      },
      {
        teaching: `Indexes make queries fast. Without an index on author_id, fetching all stories by a specific user requires scanning every row in the table. With an index, the database jumps directly to matching rows. For tables that will grow large — like a stories or submissions table — indexes are not optional. They are what separate a site that stays fast from one that slows to a crawl.`,
        question: `What queries will your app run most often? Based on those, which columns should have indexes? Describe the queries first, then list the indexes they need.`,
      },
      {
        teaching: `A trigger automatically runs a function when something happens to a table. The most common use is updating an updated_at timestamp whenever a row changes. Written once, it works everywhere — you never need to remember to set updated_at in every UPDATE query. This is the kind of "set and forget" automation that separates professional database design from amateur work.`,
        question: `Create a trigger to automatically update the updated_at column whenever a row in your main table is modified. Should the same trigger apply to your other tables?`,
      },
    ],
  },
  connect_react: {
    focus: 'connecting React to Supabase',
    steps: [
      {
        teaching: `The Supabase client is a JavaScript object that knows how to talk to your database. You create it once in src/lib/supabase.js and import it anywhere you need database access. Every query, every insert, every auth call goes through this single client. This "single source of truth" pattern means if you ever need to change your database connection, you change it in one place.`,
        question: `Verify your Supabase client is configured correctly. What does the client initialisation look like — how does it read your environment variables, and how do you import it in a component?`,
      },
      {
        teaching: `A custom hook encapsulates data fetching logic. Instead of writing the same useEffect and useState pattern in every component, you write it once in a hook and call it anywhere. useStories(), useProfiles(), useCommunity() — each returns loading, error, and data states. This is one of the most important patterns in professional React development: write logic once, use it everywhere.`,
        question: `Design a custom hook for fetching your main content. What state does it manage — loading, error, data? What Supabase query does it run, and what does it return to the component that calls it?`,
      },
      {
        teaching: `A connection test component verifies the database is reachable before building the full UI. A failed test tells you immediately if credentials are wrong, if Row Level Security is blocking access, or if the table does not exist yet. Professional developers always build a simple diagnostic component first — it saves hours of debugging mysterious empty screens.`,
        question: `Build a DatabaseStatus component that tests your connection and shows how many rows are in your main table. What should it display on success, on loading, and on error?`,
      },
    ],
  },
  read_data: {
    focus: 'reading data from Supabase with SELECT queries',
    steps: [
      {
        teaching: `Reading data uses the select method. .select("*") returns all columns. Real queries filter with .eq(), sort with .order(), limit with .limit(), and join related tables by naming them in the select string. Every query is asynchronous — it returns a Promise that resolves to { data, error }. Always handle both — a query that succeeds but returns an empty array is different from one that fails with an error.`,
        question: `Build the main listing page for your site. What data does it fetch, how does it filter or sort it, and how does it display each item — including what to show while loading and on error?`,
      },
      {
        teaching: `Filtering narrows results to only what the component needs. .eq() for exact matches, .ilike() for case-insensitive partial matches, .in() for a list of values. Chained filters apply multiple conditions at once — you can filter by status AND by community AND by category in a single query. This is far more efficient than fetching everything and filtering in JavaScript.`,
        question: `Add filtering to your listing page. What filters make sense for your content — by category, by community, by status, by date? Describe the filter UI and the Supabase query each filter generates.`,
      },
      {
        teaching: `A single item page shows the full content of one record, fetched by ID from the URL. React Router's useParams() extracts the ID from the URL path. .single() returns one object instead of an array, and throws an error if zero or more than one row matches — which is exactly the behaviour you want when fetching by primary key.`,
        question: `Build the single item detail page. It should fetch one record by ID from the URL, display the full content including any joined data from related tables, and link back to the listing.`,
      },
    ],
  },
  write_data: {
    focus: 'writing data to Supabase with INSERT and UPDATE',
    steps: [
      {
        teaching: `INSERT adds a new row to a table. In Supabase, you call .insert() with an object whose keys match your column names. The author_id must come from the authenticated session — never from the form itself. Reading the user ID from supabase.auth.getUser() and attaching it to the insert means even if someone manipulates the form, they cannot submit as another user.`,
        question: `Build the submission form for your site. What fields does it have, how does it validate each field before submitting, and what happens on successful submission — what does the user see?`,
      },
      {
        teaching: `UPDATE modifies an existing row. .update() must always be chained with .eq() — without a filter condition it would update every row in the table. Always filter by the primary key. And always verify the user owns the record before updating — a double .eq("id", itemId).eq("author_id", user.id) ensures users can only modify their own content, not anyone else's.`,
        question: `Build the editing interface for your content. How does a user reach their own items, and how do you ensure the update query only modifies rows they own?`,
      },
      {
        teaching: `Optimistic updates improve perceived performance. Update the UI immediately when the user takes an action, then confirm with the database in the background. If the database call fails, roll back the UI to its previous state and show an error. For simple status changes this makes the interface feel instant — no spinner, no waiting — which matters enormously on slow connections.`,
        question: `Identify one action in your app where an optimistic update would improve the experience — like publishing a post or marking something complete. Describe how it works: what changes immediately, what happens if the database call fails?`,
      },
    ],
  },
  user_auth: {
    focus: 'adding user authentication with Supabase Auth',
    steps: [
      {
        teaching: `Supabase Auth handles email/password signup, login, and session management with no server code. The auth state is global — supabase.auth.getUser() works anywhere in your app. onAuthStateChange fires whenever someone signs in or out, which is how you update the UI instantly without requiring a page refresh. This is the same authentication pattern used by most production web applications.`,
        question: `Build the sign-up and sign-in forms. What fields do they collect, what happens after successful authentication, and how does the UI change to reflect the signed-in state?`,
      },
      {
        teaching: `Auth context makes the current user available everywhere without prop drilling. A React context wraps the entire application, listens for auth state changes, and exposes the current user and session to any component that needs it. Protected routes check this context and redirect unauthenticated users to the login page — they never see content they should not access.`,
        question: `Build an AuthContext and a ProtectedRoute component. Which pages on your site are public, and which require authentication? What happens when an unauthenticated user tries to access a protected page?`,
      },
      {
        teaching: `The navigation bar should reflect auth state without a page reload. When signed out, show the Sign In button. When signed in, show the user's name or avatar and a Sign Out option. Subscribing to auth state changes directly in the Navbar component means it updates the instant a user signs in or out — no manual refresh needed.`,
        question: `Update your Navbar to show different options based on auth state. What does the signed-in navigation look like — what links and user information does it show, and what does the Sign Out action do?`,
      },
    ],
  },
  row_level_security: {
    focus: 'securing the database with Row Level Security',
    steps: [
      {
        teaching: `Row Level Security is PostgreSQL's most powerful security feature. Without RLS, anyone with your anon key can read, write, update, and delete every row in every table. With RLS, the database enforces access at the row level — not the application level. Even if someone bypasses your React code entirely and makes direct API calls, RLS stops them. The rule is simple: enable RLS on every table, then write explicit policies for every operation you want to allow. If there is no policy, the operation is denied.`,
        question: `Enable RLS on your tables and write the first policy — the one that allows anyone to read your published content. This single policy is the difference between a site that shows content and one that shows nothing.`,
      },
      {
        teaching: `Write policies control INSERT, UPDATE, and DELETE. A user should only insert content as themselves — author_id must equal their own user ID. These policies use auth.uid() — a Supabase function that returns the ID of the currently authenticated user. This is enforced at the database level, not just the application level, which is what makes it secure.`,
        question: `Write the policies that allow authenticated users to submit and edit their own content — but not anyone else's. What does each policy check, and what does it allow or deny?`,
      },
      {
        teaching: `Some actions — like publishing content or deleting any record — should only be available to administrators. Service role policies or server-side API routes using the service role key bypass RLS when called from a trusted environment. The service role key must never be exposed to the browser. Admin-only operations should always go through a server-side route that verifies the caller's role before acting.`,
        question: `How will moderation or admin actions work on your site? Who can publish content, who can delete any record, and how does the system prevent regular users from doing those things?`,
      },
    ],
  },
  deploy_fullstack: {
    focus: 'deploying the full-stack app to Vercel',
    steps: [
      {
        teaching: `Deploying a full-stack React and Supabase app to Vercel takes under five minutes. Vercel hosts the React front end. Supabase hosts the database. The connection between them is the environment variables set in Vercel's dashboard — not your local .env file. Push to GitHub first, then import the repository in Vercel and add your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables before clicking Deploy.`,
        question: `Walk through the deployment steps. What environment variables does Vercel need, and where do you set them? What is the difference between your local .env file and the environment variables in Vercel's dashboard?`,
      },
      {
        teaching: `Supabase needs to know which URLs are allowed to make requests. After deployment, add your Vercel URL to Supabase's allowed redirect URLs and CORS origins — otherwise authentication redirects fail and some API calls are blocked. This is one of the most common post-deployment problems and the easiest to fix once you know where to look.`,
        question: `What Supabase settings need to be updated after deployment? Where in the Supabase dashboard do you add your production URL, and why does auth break without this step?`,
      },
      {
        teaching: `A production checklist prevents the most common deployment mistakes: RLS enabled on every table, no sensitive keys in source code, .env in .gitignore, user-friendly error messages rather than raw error objects, and every protected route redirecting unauthenticated users. A site that passes this checklist is ready for real users — one that does not is a security risk.`,
        question: `Walk through the production readiness checklist for your app. For each item — RLS, environment variables, error handling, protected routes — confirm it is in place and describe how you verified it.`,
      },
    ],
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    taskId, taskLabel, phase, projectFiles, sessionContext,
    completedTasks, communicationStrategy, learningStrategy, gradeLevel,
    importedSiteName, dataRoleAnswer, supabaseConnected,
  } = req.body;

  const ctx: any            = sessionContext || {};
  const files: any[]        = projectFiles   || [];
  const completed: string[] = completedTasks || [];
  const seeds               = TASK_SEEDS[taskId];

  const commStr  = communicationStrategy ? JSON.stringify(communicationStrategy) : null;
  const learnStr = learningStrategy      ? JSON.stringify(learningStrategy)      : null;
  // Grade level scale: 1=Elementary, 2=Middle School, 3=High School, 4=Adult Learner (18+)
  const gradeLine: Record<number, string> = {
    1: 'The learner is in elementary school (grades 3-5, ages 8-11). Use very simple words and short sentences. Be extra encouraging.',
    2: 'The learner is in middle school (grades 6-8, ages 11-14). Use clear, age-appropriate language.',
    3: 'The learner is in high school (grades 9-12, ages 14-18). You can use more sophisticated language.',
    4: 'The learner is an adult (18+). Use clear, professional language — treat them as a capable adult, not a classroom student.',
  };
  const gradeStr = gradeLevel && gradeLine[gradeLevel] ? gradeLine[gradeLevel] : null;
  const personalitySection = (commStr || learnStr || gradeStr)
    ? '\n\nLEARNER PERSONALITY PROFILE:\n'
      + (commStr  ? `Communication strategy: ${commStr}\n` : '')
      + (learnStr ? `Learning strategy: ${learnStr}\n`     : '')
      + (gradeStr ? `Grade level: ${gradeStr}\n`           : '')
      + 'Adapt vocabulary, analogies, and sentence length to match. Teaching commentary especially should feel personally pitched.\n'
    : '';

  const siteContext = [
    importedSiteName && `They imported this static site as their starting point: "${importedSiteName}"`,
    dataRoleAnswer   && `Their Phase 0 data planning summary:\n${dataRoleAnswer}`,
    ctx.siteName     && `Site name: "${ctx.siteName}"`,
    ctx.sitePurpose  && `Purpose: ${ctx.sitePurpose}`,
    supabaseConnected && 'Supabase is connected and credentials are verified.',
  ].filter(Boolean).join('\n');

  const fileList = files
    .filter((f: any) => (f.content || f.preview || '').length > 20)
    .slice(0, 10)
    .map((f: any) => {
      const preview = (f.preview || f.content || '').substring(0, 150).replace(/\n/g, ' ');
      return `- ${f.path}: ${preview}...`;
    })
    .join('\n');

  const seedText = seeds
    ? seeds.steps.map((s, i) =>
        `Step ${i + 1}:\n  Teaching: ${s.teaching}\n  Question: ${s.question}`
      ).join('\n\n')
    : '';

  const system = `You are an expert full-stack educator teaching React + Supabase (PostgreSQL) to first-generation digital learners.

Your goal: make database concepts concrete, not abstract. Always connect the concept to something real in their site — their stories table, their community profiles, their submission form.${personalitySection}

THE IRON RULE — TEACHING AND QUESTION MUST BE DIRECTLY COUPLED:
Each subTaskTeaching introduces a specific concept.
The subTask question for that step MUST ask the learner to apply that exact concept to THEIR site.
Never write a generic question after a specific teaching.
Before finalising output, read each pair: does subTasks[i] ask the learner to apply exactly what subTaskTeaching[i] just taught? If not — rewrite.

Each subTaskTeaching should:
- Name the professional concept clearly
- Explain why it matters in 2-4 sentences
- Use a concrete analogy from community life where helpful
- Connect to their specific site whenever possible

${siteContext ? `SITE AND DATA CONTEXT (personalise everything using this):\n${siteContext}` : ''}
${fileList ? `\nImported project files (their existing React site):\n${fileList}` : ''}
Completed tasks: ${completed.length > 0 ? completed.join(', ') : 'none yet'}

Return JSON only — no markdown fences, no extra text:
{
  "headline": "Action verb + specific outcome (max 7 words)",
  "context": "One sentence: what this task builds toward, referencing their site.",
  "subTaskTeaching": ["teaching 1", "teaching 2", "teaching 3"],
  "subTasks": ["question 1 — directly applies teaching 1", "question 2 — directly applies teaching 2", "question 3 — directly applies teaching 3"],
  "examplePrompt": "A complete example of what a learner might type for step 1 — 2-3 sentences, specific to their site."
}`;

  const user = `Task: "${taskLabel}" (ID: ${taskId}, Phase ${phase})

${seedText ? `Seed content to adapt and personalise:\n\n${seedText}` : ''}

Write the full instruction with teaching commentary for all 3 steps. Make it specific to their site.`;

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:       ANTHROPIC_MODEL,
        max_tokens:  1200,
        temperature: 0.35,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Anthropic API error (${response.status}): ${(err as any)?.error?.message || 'Unknown'}`);
    }

    const completion = await response.json();
    const raw     = completion.content?.[0]?.text || '{}';
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

    let result: any;
    try {
      result = JSON.parse(cleaned);
    } catch {
      return res.status(200).json(buildFallback(taskId, taskLabel, seeds));
    }

    if (!Array.isArray(result.subTaskTeaching) || result.subTaskTeaching.length < 3) {
      result.subTaskTeaching = seeds
        ? seeds.steps.map(s => s.teaching)
        : Array(3).fill('This step is important to full-stack development.');
    }

    return res.status(200).json({
      headline:        result.headline        || taskLabel,
      context:         result.context         || '',
      subTasks:        result.subTasks        || [],
      subTaskTeaching: result.subTaskTeaching,
      examplePrompt:   result.examplePrompt   || '',
    });

  } catch (err: any) {
    console.error('[fullstack-task-instruction]', err);
    return res.status(200).json(buildFallback(taskId, taskLabel, seeds));
  }
}

function buildFallback(taskId: string, taskLabel: string, seeds?: TaskSeed) {
  return {
    headline:        taskLabel,
    context:         `Let's work on ${taskLabel.toLowerCase()} for your full-stack app.`,
    subTasks:        seeds ? seeds.steps.map(s => s.question)  : ['Describe your goal clearly.', 'Add specific details.', 'Review and iterate.'],
    subTaskTeaching: seeds ? seeds.steps.map(s => s.teaching)  : [
      'This step is foundational to full-stack development.',
      'Understanding this helps every future decision you make.',
      'This is how experienced developers approach this stage.',
    ],
    examplePrompt: seeds ? seeds.steps[0].question : `Help me with: ${taskLabel}`,
  };
}
