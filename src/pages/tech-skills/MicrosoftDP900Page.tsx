// src/pages/tech-skills/MicrosoftDP900Page.tsx
// Microsoft DP-900: Azure Data Fundamentals — Certification Prep
// API routes needed:
//   /api/dp900-task-instruction   (returns TaskInstruction for each topic)
//   /api/dp900-evaluate-session   (returns evaluation scores + feedback)

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Navbar from '../../components/layout/Navbar';
import { supabase } from '../../lib/supabaseClient';
import { useVoice } from '../../hooks/useVoice';
import { VoiceFallback } from '../../components/VoiceFallback';
import { PidginTooltip } from '../../components/PidginTooltip';
import {
  Database, BookOpen, Play, CheckCircle, ArrowRight, Eye,
  ChevronDown, ChevronRight, Loader2, FolderOpen,
  ArrowUpCircle, SkipForward, Lightbulb, RefreshCw, BarChart3,
  Award, X, Copy, Check, Volume2, VolumeX, AlertCircle, Star,
  Cpu, MessageSquarePlus, Zap, Shield, Table, Mic, Sparkles,
  Trash2, Plus, HelpCircle, GraduationCap, Target, TrendingUp,
  GitBranch, Server, Activity, FileText,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TopicDef {
  id: string;
  label: string;
  domain: 1 | 2 | 3 | 4;
  icon: string;
  isOnboarding?: boolean;
  weight: string;
  azureServices?: string[];
}

interface TaskInstruction {
  headline: string;
  context: string;
  subTasks: string[];
  subTaskTeaching: string[];
  examplePrompt: string;
}

interface QuizEntry {
  id: string;
  topicId: string;
  subTaskIndex: number;
  subTaskQuestion?: string;
  subTaskTeaching?: string;
  userAnswer: string;
  aiExplanation?: string;
  aiCritique?: string;
  hasSuggestions?: boolean;
  timestamp: string;
  action: 'answer' | 'iterate' | 'critique' | 'practice';
}

interface SessionRecord {
  id: number;
  dp900_session_id: string;
  dp900_session_name: string;
  dp900_prompts: any[];
  dp900_evaluation: any | null;
  updated_at?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const makeId = () => Math.random().toString(36).substring(2, 9);
const DP900_ACTIVITY = 'dp900_cert_prep';

const TOPICS: TopicDef[] = [
  // Onboarding
  { id: 'intro_dp900',       label: 'Welcome & Exam Overview',          domain: 1, icon: '🎓', isOnboarding: true, weight: '' },

  // Domain 1 — Core Data Concepts (25–30%)
  { id: 'data_types',        label: 'Types of Data & Data Formats',      domain: 1, icon: '📋', weight: '25–30%' },
  { id: 'data_roles',        label: 'Data Roles & Responsibilities',      domain: 1, icon: '👩‍💻', weight: '25–30%' },
  { id: 'relational_concepts', label: 'Relational Data Concepts',         domain: 1, icon: '🔗', weight: '25–30%' },
  { id: 'nonrelational_concepts', label: 'Non-Relational Data Concepts',  domain: 1, icon: '🗃️', weight: '25–30%' },

  // Domain 2 — Relational Data in Azure (20–25%)
  { id: 'azure_sql',         label: 'Azure Relational Database Services', domain: 2, icon: '☁️', weight: '20–25%', azureServices: ['Azure SQL Database', 'Azure SQL Managed Instance', 'Azure Database for PostgreSQL', 'Azure Database for MySQL'] },
  { id: 'query_techniques',  label: 'SQL Query Techniques',               domain: 2, icon: '🔍', weight: '20–25%', azureServices: ['Azure SQL Database'] },

  // Domain 3 — Non-Relational Data in Azure (15–20%)
  { id: 'azure_storage',     label: 'Azure Storage for Non-Relational Data', domain: 3, icon: '📦', weight: '15–20%', azureServices: ['Azure Blob Storage', 'Azure Table Storage', 'Azure Files'] },
  { id: 'azure_cosmos',      label: 'Azure Cosmos DB',                    domain: 3, icon: '🌐', weight: '15–20%', azureServices: ['Azure Cosmos DB'] },

  // Domain 4 — Analytics in Azure (25–30%)
  { id: 'analytics_concepts', label: 'Analytics Workloads & Concepts',    domain: 4, icon: '📊', weight: '25–30%' },
  { id: 'azure_synapse',     label: 'Azure Synapse Analytics',            domain: 4, icon: '⚡', weight: '25–30%', azureServices: ['Azure Synapse Analytics', 'Azure Data Factory'] },
  { id: 'azure_databricks',  label: 'Azure Databricks & HDInsight',       domain: 4, icon: '🔥', weight: '25–30%', azureServices: ['Azure Databricks', 'Azure HDInsight'] },
  { id: 'azure_powerbi',     label: 'Microsoft Power BI',                 domain: 4, icon: '📈', weight: '25–30%', azureServices: ['Microsoft Power BI'] },

  // Practice exam
  { id: 'practice_exam',     label: 'Practice Exam Simulation',           domain: 4, icon: '🎯', weight: '' },
];

const DOMAIN_META: Record<number, { label: string; shortLabel: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  1: { label: 'Domain 1: Core Data Concepts',              shortLabel: 'D1: Core Data',    color: 'text-blue-400',    bg: 'bg-blue-500/15',    border: 'border-blue-500/30',   icon: <Database size={12} /> },
  2: { label: 'Domain 2: Relational Data in Azure',        shortLabel: 'D2: Relational',   color: 'text-purple-400',  bg: 'bg-purple-500/15',  border: 'border-purple-500/30', icon: <Table size={12} /> },
  3: { label: 'Domain 3: Non-Relational Data in Azure',    shortLabel: 'D3: NoSQL',        color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30',icon: <Server size={12} /> },
  4: { label: 'Domain 4: Analytics Workloads in Azure',    shortLabel: 'D4: Analytics',    color: 'text-amber-400',   bg: 'bg-amber-500/15',   border: 'border-amber-500/30',  icon: <Activity size={12} /> },
};

// ─── Fallback seeds per topic (Oloibiri-grounded) ────────────────────────────

const FALLBACK_SEEDS: Record<string, { teaching: string; question: string }[]> = {
  data_types: [
    {
      teaching: 'Data comes in three main forms: Structured data fits neatly into rows and columns — like a spreadsheet of daily fish catches. Semi-structured data has some organisation but no fixed schema — like JSON records from a sensor. Unstructured data has no predefined format — like voice recordings, photos, or PDF documents.',
      question: 'Think about the data generated in Oloibiri each day — from fishing logs, water quality sensors, community health records, and marketplace transactions. Give one example of structured, one semi-structured, and one unstructured data from this community context.',
    },
    {
      teaching: 'OLTP (Online Transaction Processing) systems handle day-to-day operations — recording transactions as they happen, like a market sales system. OLAP (Online Analytical Processing) systems are designed for analysis — asking questions like "What were total fish sales by month for the past year?" These are fundamentally different workloads and require different database designs.',
      question: 'The Davidson AI Innovation Center records each learner\'s quiz attempt in real time. At the end of each month, a report is generated showing completion rates by topic. Which part of this system is OLTP and which is OLAP — and what makes them different?',
    },
    {
      teaching: 'Batch processing collects data over a period and processes it all at once — like running a nightly report. Streaming (real-time) processing handles data the moment it arrives — like monitoring creek water quality second by second and alerting if contamination is detected.',
      question: 'An NGO wants to monitor oil spill contamination levels in Nun River. They also want a monthly summary report for government submission. Which data processing approach (batch or streaming) fits each need — and why does the choice matter for the community?',
    },
  ],
  data_roles: [
    {
      teaching: 'The three core data roles on the DP-900 exam are: Database Administrator (keeps databases running, manages security and backups), Data Engineer (builds pipelines that move and transform data), and Data Analyst (queries data and creates reports and visualisations for decision-makers). These are distinct roles with different tools and skills.',
      question: 'The Girls AIing platform collects learner progress data in Supabase, transforms it into monthly reports, and displays dashboards. Which of the three data roles — administrator, engineer, or analyst — is primarily responsible for each part of this workflow?',
    },
    {
      teaching: 'A data pipeline is the automated series of steps that moves data from where it is generated (source) to where it is used (destination), often transforming it along the way. Without a pipeline, data sits in silos — unusable for decision-making.',
      question: 'Imagine Oloibiri fishing data is collected on paper forms each morning, then entered into a spreadsheet, then summarised weekly for the OWFA. Describe this as a data pipeline — what is the source, what are the transformation steps, and what is the destination?',
    },
    {
      teaching: 'Data governance means having rules about who can access data, how data quality is maintained, and how long data is retained. For communities like Oloibiri, governance is especially important when data is about people — health records, names, income — because misuse has real consequences.',
      question: 'The Girls AIing platform stores personality baseline data (Big Five scores) for each learner. Name two data governance decisions that should be made about this data — who can access it, how it should be protected, or how long it should be kept.',
    },
  ],
  relational_concepts: [
    {
      teaching: 'A relational database organises data into tables (relations). Each table has rows (records) and columns (attributes). Tables are linked by keys: a Primary Key uniquely identifies each row in a table. A Foreign Key in one table references the primary key in another, creating a relationship.',
      question: 'Design a simple relational structure for the Girls AIing platform: one table for learners and one for quiz_attempts. What would the primary key be in each table? What foreign key would link quiz_attempts back to learners — and why is this better than putting all the data in one table?',
    },
    {
      teaching: 'Normalisation is the process of organising a database to reduce data duplication. Instead of repeating a learner\'s name in every quiz record, you store it once in a learners table and reference it by ID. This reduces errors, saves storage, and makes updates easier.',
      question: 'A spreadsheet records each quiz attempt with columns: learner_name, learner_location, topic, score, date. The learner\'s name and location appear in hundreds of rows. What problem does this cause — and how would a normalised relational database solve it?',
    },
    {
      teaching: 'SQL (Structured Query Language) is the standard language for querying relational databases. The four most fundamental operations are: SELECT (retrieve data), INSERT (add data), UPDATE (modify data), DELETE (remove data). The DP-900 exam tests understanding of what SQL does, not how to write complex queries.',
      question: 'In plain English, describe what each SQL statement does: (1) SELECT * FROM learners WHERE location = \'Oloibiri\'. (2) INSERT INTO quiz_attempts VALUES (\'ada123\', \'relational_concepts\', 85). (3) UPDATE learners SET cohort = \'Cohort 3\' WHERE cohort IS NULL.',
    },
  ],
  nonrelational_concepts: [
    {
      teaching: 'Non-relational (NoSQL) databases do not use tables and rows. Instead, they use flexible formats suited to different data shapes. The four main types are: Key-Value stores (simple lookup by key), Document stores (JSON-like objects), Column-family stores (data grouped by column, efficient for analytics), and Graph databases (data as nodes and relationships).',
      question: 'Match each data type to its best non-relational database model: (1) A user session token that maps to session data. (2) A community profile that includes nested lists of skills and certifications. (3) Social connections between learners — who mentors whom. (4) Water quality sensor readings where you always query by measurement type across many stations.',
    },
    {
      teaching: 'Relational databases use a rigid schema — every row must match the defined columns. Non-relational databases are schema-flexible — different records can have different fields. This makes NoSQL ideal when data structures vary or evolve rapidly, like storing learner profiles where some have voice recordings and others do not.',
      question: 'The Girls AIing platform is considering storing learner portfolio items — which could include text entries, images, code files, or voice recordings — with very different metadata for each type. Should they use a relational or non-relational database for this feature, and why?',
    },
    {
      teaching: 'The CAP theorem states that distributed databases can only guarantee two of three properties at once: Consistency (all nodes see the same data), Availability (the system always responds), and Partition tolerance (the system works even when the network splits). NoSQL systems often sacrifice consistency for availability and scale.',
      question: 'The Oloibiri platform needs to record a learner\'s quiz score even when the internet connection is unreliable — it must save locally and sync later. Which part of the CAP theorem does this scenario prioritise — and what trade-off does the community accept?',
    },
  ],
  azure_sql: [
    {
      teaching: 'Azure offers three main managed relational database services: Azure SQL Database (Microsoft SQL Server, fully managed PaaS), Azure SQL Managed Instance (SQL Server with near-full compatibility for migrating existing on-premise apps), and open-source options: Azure Database for PostgreSQL and Azure Database for MySQL.',
      question: 'A Nigerian fintech startup is migrating their existing Microsoft SQL Server database to the cloud. Another startup is building a new app and wants open-source tools. Which Azure SQL service fits each scenario — and what does "managed" mean for a small team with no dedicated database administrator?',
    },
    {
      teaching: 'PaaS (Platform as a Service) means Microsoft manages the server, operating system, backups, and patching — you only manage your database and data. This is ideal for small teams like those at the Davidson AI Innovation Center who want reliability without a dedicated server administrator.',
      question: 'Compare managing a physical server on-premise versus using Azure SQL Database (PaaS). For each option, describe who is responsible for: hardware, OS updates, database backups, and scaling to handle more users. Which is more appropriate for the Girls AIing platform?',
    },
    {
      teaching: 'Provisioned compute means you pay for a fixed amount of database computing power (CPU, RAM) at all times. Serverless compute means Azure automatically scales up or down based on demand and you only pay for actual usage. For unpredictable workloads like a learning platform with peak activity during class sessions, serverless can be more cost-effective.',
      question: 'The Girls AIing platform has 20 active learners during class sessions but near-zero activity overnight. Should the platform use provisioned or serverless Azure SQL — and calculate roughly what this difference might mean for a platform with very limited funding.',
    },
  ],
  query_techniques: [
    {
      teaching: 'A VIEW is a saved SQL query that acts like a virtual table. You can query a view as if it were a regular table, but it always reflects the latest underlying data. Views are useful for simplifying complex queries and controlling which columns users can see — for example, a view that shows learner progress without exposing personal identifiers.',
      question: 'The Girls AIing platform wants to give mentors a view of learner progress that shows first name, topic scores, and completion percentage — but never the learner\'s full profile or personality data. How would a SQL VIEW help achieve this, and what would the benefit be compared to giving mentors direct table access?',
    },
    {
      teaching: 'Indexes speed up queries by creating a separate data structure that the database engine can search quickly — like the index at the back of a book. Without an index, the database reads every row to find matching records (a "full table scan"). For large datasets like millions of sensor readings, indexes are critical for performance.',
      question: 'Oloibiri water quality sensors generate 10,000 readings per day. A query retrieves all readings from a specific station over 30 days. Without an index, the database scans all 300,000 rows. Explain in plain terms what an index on station_id would do differently — and why this matters for a slow internet connection.',
    },
    {
      teaching: 'Stored procedures are pre-written SQL scripts stored on the database server that can be called by applications. They improve performance (the query plan is cached), security (apps call the procedure, not the raw tables), and code reuse. On the DP-900 exam, you need to know what stored procedures are and why they are used — not how to write them.',
      question: 'Every time a learner completes a topic, the platform needs to: update their completion record, calculate their new overall progress score, and log the event for the monthly report. Should this logic be handled by a stored procedure or by the application sending three separate SQL statements? What are the advantages of the stored procedure approach?',
    },
  ],
  azure_storage: [
    {
      teaching: 'Azure Storage offers three non-relational storage services: Azure Blob Storage (for large unstructured files — images, videos, backups), Azure Table Storage (key-value pairs — simple, fast, cheap for simple lookups), and Azure Files (managed file shares accessible like a network drive). Each is designed for a different kind of data.',
      question: 'The Girls AIing platform generates voice recordings of learner responses, PDF certificates, and a simple lookup table mapping topic IDs to topic names. Match each to the correct Azure Storage service — Blob, Table, or Files — and explain your reasoning.',
    },
    {
      teaching: 'Azure Blob Storage has three access tiers that control cost and retrieval speed: Hot (frequent access — slightly more expensive but instant), Cool (infrequent access — cheaper storage, small retrieval fee), and Archive (rarely accessed — very cheap storage, hours to retrieve). Choosing the right tier saves significant cost at scale.',
      question: 'The Girls AIing platform stores: (a) learner profile photos accessed every time someone logs in, (b) monthly backup snapshots that are almost never retrieved, (c) certificates generated 3 months ago that learners occasionally download. Assign each to Hot, Cool, or Archive tier — and explain the trade-off you are making.',
    },
    {
      teaching: 'Azure Data Lake Storage Gen2 combines the scalability of Azure Blob Storage with a hierarchical file system designed for big data analytics. It is built for storing massive datasets — like years of sensor readings or national agricultural data — that will be processed by analytics engines rather than retrieved by individual users.',
      question: 'The Nigerian government wants to store 5 years of satellite crop monitoring data across all 36 states — petabytes of image files and sensor logs — for analysis by data scientists. Should they use standard Azure Blob Storage or Azure Data Lake Storage Gen2, and what feature of ADLS Gen2 makes it better suited for analytics at this scale?',
    },
  ],
  azure_cosmos: [
    {
      teaching: 'Azure Cosmos DB is Microsoft\'s globally distributed NoSQL database service. Its key selling points are: global distribution (replicate data to multiple regions instantly), guaranteed single-digit millisecond latency, and support for multiple APIs — meaning you can use it with MongoDB-style queries, Cassandra, Gremlin (graph), or table APIs without changing your application much.',
      question: 'The Girls AIing platform is expanding from Oloibiri to Ibiade and then globally. Learners in each location need fast, reliable access to their learning data. How does Azure Cosmos DB\'s global distribution feature address this — and what would happen without it when a learner in Ibiade accesses data stored only in a server in the US?',
    },
    {
      teaching: 'Cosmos DB offers five consistency levels, from strongest to weakest: Strong, Bounded Staleness, Session, Consistent Prefix, and Eventual. Strong consistency means all reads see the latest write — but is slower. Eventual consistency means data may be briefly out of sync between regions — but is faster and cheaper. Most apps use Session consistency as a practical middle ground.',
      question: 'A learner completes a quiz in Oloibiri. Their score should appear on a mentor\'s dashboard in Lagos immediately. Is this a case where Strong or Eventual consistency matters more — and what could go wrong with Eventual consistency in this specific scenario?',
    },
    {
      teaching: 'Cosmos DB charges through Request Units (RUs) — a combined measure of CPU, memory, and IOPS consumed by each database operation. A simple read of a small document costs 1 RU. A complex query over many documents costs many more. You provision RUs in advance (or use serverless mode) and are charged whether you use them or not.',
      question: 'The Girls AIing platform occasionally has zero activity at night and bursts of 50 concurrent learners during class sessions. Would you choose provisioned throughput or serverless mode for Cosmos DB — and which DP-900 concept explains why serverless might be more cost-effective for this usage pattern?',
    },
  ],
  analytics_concepts: [
    {
      teaching: 'The analytics workflow follows a pipeline: Ingest (collect raw data from sources), Store (land it in a data lake or warehouse), Process (clean, transform, and model it), and Visualise (present it in dashboards and reports). Each stage has specific Azure services. The DP-900 exam tests whether you can match each stage to the right tool.',
      question: 'The Girls AIing platform produces learner activity logs every day. Walk through the four analytics stages for this data: Where is it ingested from? Where is it stored? What processing might happen (cleaning, aggregating)? And who visualises it — and how? Map each stage to a real part of the platform you already know.',
    },
    {
      teaching: 'A data warehouse is optimised for analytical queries — it stores pre-aggregated, historical data in a structure designed for fast reporting. Unlike a transactional database (OLTP), a warehouse uses a star schema: a central fact table (e.g. quiz_attempts) surrounded by dimension tables (e.g. learners, topics, dates). This makes queries like "Show me pass rates by topic for Cohort 2" extremely fast.',
      question: 'Design a simple star schema for the Girls AIing platform analytics. What is the central fact table, and what measure does it store? Name three dimension tables that would surround it — and give one example query that this star schema would answer quickly.',
    },
    {
      teaching: 'ETL stands for Extract, Transform, Load — the traditional pipeline for moving data into a warehouse. ELT (Extract, Load, Transform) loads raw data first, then transforms it inside the warehouse using its compute power. Modern cloud analytics platforms like Azure Synapse favour ELT because cloud storage is cheap and compute is powerful.',
      question: 'The Girls AIing platform wants to pull daily learner logs from Supabase, clean out test accounts, calculate aggregate scores per cohort, and load the results into a reporting database. Is this better described as ETL or ELT — and which step in the process is the "Transform"?',
    },
  ],
  azure_synapse: [
    {
      teaching: 'Azure Synapse Analytics is Microsoft\'s unified analytics platform — it combines a data warehouse (SQL Pools), big data processing (Spark Pools), and data integration (pipelines) in one service. Think of it as the "everything" analytics environment: you can query petabytes of data, run machine learning, and build pipelines without leaving the workspace.',
      question: 'A Nigerian agriculture ministry collects crop yield data from 10 million farms. They want to: store historical data, run complex reports across 20 years of records, and build machine learning models to predict yield failures. Why is Azure Synapse Analytics better suited for this than a standard Azure SQL Database?',
    },
    {
      teaching: 'Azure Data Factory (ADF) is Azure\'s managed data integration service — a tool for building ETL/ELT pipelines without writing much code. You visually design pipelines that copy data from sources (Supabase, CSV files, APIs) into destinations (data lakes, warehouses). ADF is the "data plumber" service on Azure.',
      question: 'Every night at midnight, the Girls AIing platform should automatically pull new learner records from Supabase, clean the data, and load it into Azure Synapse for reporting. Which Azure service would orchestrate this nightly pipeline — and what does it mean that ADF is a "low-code" tool for this kind of work?',
    },
    {
      teaching: 'Azure Synapse Link creates a real-time link between Azure Cosmos DB (operational data) and Synapse Analytics (analytical data) — without the need for a separate ETL pipeline. As data is written to Cosmos DB, it becomes automatically queryable in Synapse. This eliminates the lag between when data is created and when it appears in reports.',
      question: 'The Girls AIing platform updates learner scores in real time in Cosmos DB, but the monthly reports have always shown data that is one day old because of nightly ETL. How would Azure Synapse Link change this — and what does the elimination of this lag mean for a mentor who wants to check learner progress during a class session?',
    },
  ],
  azure_databricks: [
    {
      teaching: 'Azure Databricks is an Apache Spark-based analytics platform optimised for large-scale data processing and machine learning. While Synapse is an all-in-one warehouse platform, Databricks is favoured by data engineers and data scientists who need maximum flexibility for custom ML pipelines, feature engineering, and large-scale data transformations.',
      question: 'A research team at a Nigerian university wants to build a model that predicts which learners are at risk of dropping out, using millions of historical records and custom Python machine learning code. Would they choose Azure Synapse Analytics or Azure Databricks — and what feature of Databricks makes it better suited for this kind of work?',
    },
    {
      teaching: 'Azure HDInsight is a managed open-source analytics service supporting Hadoop, Spark, Hive, Kafka, and other frameworks. It is aimed at teams that already use these open-source tools and want to run them on Azure without managing their own cluster. Databricks is generally more modern, easier to use, and better integrated with Azure ML.',
      question: 'On the DP-900 exam, when would you choose Azure HDInsight over Azure Databricks? What type of organisation or existing technology stack suggests HDInsight — and why has Databricks become more commonly recommended for new projects?',
    },
    {
      teaching: 'Delta Lake is an open-source storage layer that brings ACID transactions (Atomicity, Consistency, Isolation, Durability) to data lakes. Without Delta Lake, a data lake is just files — if a pipeline fails midway, you can end up with corrupted partial data. Delta Lake ensures that either a write fully completes or is fully rolled back, like a database.',
      question: 'Every night, the Girls AIing platform loads quiz data into a data lake for analytics. Halfway through one night, the internet connection drops. Without Delta Lake, what could happen to the data — and how does Delta Lake solve this problem using the concept of ACID transactions?',
    },
  ],
  azure_powerbi: [
    {
      teaching: 'Microsoft Power BI is the primary data visualisation and business intelligence service in the Azure ecosystem. It connects to almost any data source, transforms data with Power Query, models it with DAX (Data Analysis Expressions), and produces interactive dashboards that non-technical users can explore without SQL knowledge.',
      question: 'The Girls AIing platform wants to give community leaders in Oloibiri a dashboard showing learner progress — but the leaders have no technical background. How does Power BI address both the technical challenge (connecting to data) and the human challenge (presenting it accessibly) — and what makes it better than giving them raw database access?',
    },
    {
      teaching: 'Power BI has three main components: Power BI Desktop (a Windows app for building reports), Power BI Service (the cloud platform for sharing and publishing), and Power BI Mobile (for viewing dashboards on phones). For community leaders viewing progress reports in Oloibiri on smartphones, Power BI Mobile is the relevant interface.',
      question: 'A data analyst at the Davidson AI Innovation Center builds a monthly progress report in Power BI Desktop, publishes it to Power BI Service, and community leaders view it on their phones. Map each of the three Power BI components to this workflow — and which component is doing the analytical heavy lifting?',
    },
    {
      teaching: 'A dataset in Power BI is a modelled collection of data. A report is a multi-page document with charts and visuals. A dashboard is a single-page view of the most important visuals pinned from one or more reports. On the DP-900 exam, you need to know which of these three things is being described in a scenario.',
      question: 'The Girls AIing monthly report has 8 pages covering different topics: completion rates, assessment scores, quiz performance by domain, and cohort comparison. A one-page executive summary shows the four most important numbers for community leaders. Which is the Power BI report and which is the dashboard — and what is the dataset they both draw from?',
    },
  ],
  practice_exam: [
    {
      teaching: 'The DP-900 exam has 40–60 questions, a 45-minute time limit, and requires 700/1000 to pass. It costs around $99 USD but Nigerian learners may access it free through the 3MTT × Microsoft partnership. Questions are scenario-based: they describe a business problem and ask which Azure data service, concept, or approach is most appropriate.',
      question: 'Before we begin the practice simulation, rate your confidence in each domain from 1 (not confident) to 5 (very confident): Domain 1 (Core Data Concepts), Domain 2 (Relational Data in Azure), Domain 3 (Non-Relational Data in Azure), Domain 4 (Analytics Workloads). Where do you want to focus most?',
    },
    {
      teaching: 'Exam tip: DP-900 scenario triggers. "Store large files like images and videos" → Azure Blob Storage. "Need global low-latency NoSQL" → Azure Cosmos DB. "Complex analytical queries across years of data" → Azure Synapse Analytics. "Visualise data for non-technical users" → Power BI. "Move data between systems automatically" → Azure Data Factory.',
      question: 'Practice question 1: A healthcare NGO in Nigeria collects patient data in a traditional SQL Server database on-premise. They want to move to Azure with minimal changes to their existing queries and applications, while letting Microsoft manage patching and backups. Which Azure service is most appropriate — Azure SQL Database, Azure SQL Managed Instance, or Azure Database for PostgreSQL?',
    },
    {
      teaching: 'Relational vs non-relational decision triggers: Choose relational when data is structured, relationships between entities are important, and you need ACID transactions (e.g. financial records). Choose non-relational when data is unstructured or variable, you need extreme scale or global distribution, or different records have different fields.',
      question: 'Practice question 2: A community monitoring system needs to store: (a) sensor readings from 500 devices that each report different fields depending on their model, (b) confirmed financial transactions that must never be partially recorded. Which type of database — relational or non-relational — fits each scenario, and which specific Azure service would you recommend for each?',
    },
  ],
};

// ─── Score badge ──────────────────────────────────────────────────────────────

const ScoreBadge: React.FC<{ score: number; max?: number }> = ({ score, max = 3 }) => {
  const pct = score / max;
  const color = pct >= 0.8 ? 'from-emerald-400 to-green-500 text-green-950'
    : pct >= 0.5 ? 'from-amber-400 to-yellow-500 text-yellow-950'
    : 'from-red-400 to-rose-500 text-rose-950';
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-gradient-to-r ${color}`}>
      <Star size={12} />{score}/{max}
    </span>
  );
};

// ─── Onboarding card ──────────────────────────────────────────────────────────

const DP900Onboarding: React.FC<{ onComplete: () => void }> = ({ onComplete }) => (
  <div className="flex-1 overflow-y-auto p-4 space-y-4">
    <div className="p-4 bg-blue-500/10 border border-blue-500/25 rounded-xl">
      <p className="text-xs font-bold text-blue-400 uppercase mb-3">🎓 Welcome to DP-900 Certification Prep</p>
      <p className="text-sm text-gray-300 leading-relaxed mb-3">
        You are preparing for the <strong className="text-white">Microsoft DP-900: Azure Data Fundamentals</strong> certification.
        This globally recognised credential validates your understanding of core data concepts and Azure data services —
        <strong className="text-white"> no coding required</strong>.
      </p>
      <p className="text-sm text-gray-300 leading-relaxed mb-4">
        Nigerian citizens may access the exam voucher <strong className="text-white">free</strong> through the
        3MTT × Microsoft Skilling Programme at{' '}
        <a href="https://aka.ms/registerngcertification" target="_blank" rel="noopener noreferrer"
          className="text-blue-400 underline">aka.ms/registerngcertification</a>.
      </p>
      <div className="mb-4">
        <PidginTooltip
          originalText="You are preparing for the Microsoft DP-900: Azure Data Fundamentals certification. This globally recognised credential validates your understanding of core data concepts and Azure data services — no coding required."
          hintText="Tap here to translate this introduction into Nigerian Pidgin."
        />
      </div>

      <p className="text-xs font-bold text-gray-400 uppercase mb-2">What the DP-900 Covers</p>
      <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs leading-relaxed space-y-1 mb-3">
        {[
          ['📋', 'D1', 'Core Data Concepts',               '25–30%', 'text-blue-300'],
          ['🔗', 'D2', 'Relational Data in Azure',         '20–25%', 'text-purple-300'],
          ['🗃️', 'D3', 'Non-Relational Data in Azure',     '15–20%', 'text-emerald-300'],
          ['📊', 'D4', 'Analytics Workloads in Azure',     '25–30%', 'text-amber-300'],
        ].map(([icon, code, name, weight, col]) => (
          <div key={code} className="flex items-center gap-2">
            <span>{icon}</span>
            <span className={`${col} font-bold w-6`}>{code}</span>
            <span className="text-gray-300 flex-1">{name}</span>
            <span className="text-gray-500 text-[10px]">{weight}</span>
          </div>
        ))}
      </div>
    </div>

    <div className="grid grid-cols-2 gap-2">
      {[
        { icon: <HelpCircle size={14}/>, title: 'No coding required', desc: '40–60 conceptual questions — understanding data, not writing pipelines', col: 'text-blue-400' },
        { icon: <Target size={14}/>,     title: 'Score 700/1000 to pass', desc: '45 minutes, standalone questions, navigate freely', col: 'text-emerald-400' },
        { icon: <GraduationCap size={14}/>, title: 'Free for Nigerians', desc: '3MTT × Microsoft voucher pathway — ages 16–35', col: 'text-amber-400' },
        { icon: <TrendingUp size={14}/>, title: 'Data career pathway', desc: 'Pairs with AI-900 and leads to Data Analyst & Engineer roles', col: 'text-purple-400' },
      ].map((item, i) => (
        <div key={i} className="p-3 bg-gray-800/60 rounded-lg border border-gray-700">
          <div className={`flex items-center gap-1.5 mb-1 ${item.col}`}>{item.icon}<span className="text-xs font-bold">{item.title}</span></div>
          <p className="text-[11px] text-gray-400">{item.desc}</p>
        </div>
      ))}
    </div>

    <div className="p-3 bg-gray-800/40 rounded-lg border border-gray-700">
      <p className="text-xs font-bold text-gray-300 mb-1.5">💡 Why DP-900 matters for Oloibiri</p>
      <p className="text-xs text-gray-400 leading-relaxed">
        Data is already being generated in your community — fish catches, water quality readings, learner progress,
        health records. The DP-900 teaches you how to <strong className="text-white">store, organise, and analyse</strong> that
        data using Azure. Every example in this course will be grounded in <strong className="text-white">real scenarios
        from Oloibiri and the Girls AIing platform</strong> — so you learn the exam concepts through things you already know.
      </p>
    </div>

    <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
      <p className="text-xs font-bold text-blue-300 mb-1.5">🔗 How DP-900 connects to AI-900</p>
      <p className="text-xs text-gray-400 leading-relaxed">
        If you've completed AI-900, you already know about Azure AI services that <em>process</em> data —
        computer vision, NLP, machine learning. DP-900 teaches you where that data <em>comes from and is stored</em>.
        Together, they form a complete picture of Azure's intelligent data ecosystem.
      </p>
    </div>

    <div className="p-3 bg-gray-800/40 rounded-lg border border-gray-700">
      <p className="text-xs font-bold text-gray-300 mb-1.5">📚 How this prep course works</p>
      <p className="text-xs text-gray-400 leading-relaxed">
        Each topic follows the <strong className="text-white">Socratic method</strong> — you explain concepts in your own words
        before AI confirms or corrects. This builds genuine understanding, not just memorisation.
        All examples connect to <strong className="text-white">Oloibiri, the Girls AIing platform, and Nigerian data contexts</strong>.
      </p>
    </div>

    <button onClick={onComplete}
      className="w-full flex items-center justify-center gap-2 py-3 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors">
      <Play size={15} /> Begin DP-900 Prep <ArrowRight size={15} />
    </button>
  </div>
);

// ─── Topic stepper ────────────────────────────────────────────────────────────

const TopicStepper: React.FC<{
  topics: TopicDef[];
  topicIndex: number;
  onJump: (idx: number) => void;
}> = ({ topics, topicIndex, onJump }) => {
  const domains = [1, 2, 3, 4] as const;
  const onboarding = topics.find(t => t.isOnboarding);

  return (
    <div className="px-3 py-3 border-b border-gray-700 space-y-2 overflow-y-auto flex-shrink-0" style={{ maxHeight: '45vh' }}>
      {/* Intro */}
      {onboarding && (() => {
        const idx = topics.findIndex(t => t.id === onboarding.id);
        const isDone = idx < topicIndex;
        const isCurrent = idx === topicIndex;
        return (
          <button key={onboarding.id} onClick={() => isDone && onJump(idx)} disabled={!isDone && !isCurrent}
            className={`w-full text-left flex items-center gap-2 px-2 py-1 rounded-lg text-xs transition-colors
              ${isCurrent ? 'bg-blue-500/15 border border-blue-500/30 font-bold text-blue-400' : ''}
              ${isDone ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 cursor-pointer' : ''}
              ${!isDone && !isCurrent ? 'text-gray-600 cursor-default' : ''}`}>
            <span className="flex-shrink-0 text-sm">{isDone ? '✅' : isCurrent ? onboarding.icon : '⬜'}</span>
            <span className="truncate">{onboarding.label}</span>
          </button>
        );
      })()}

      {/* Domain groups */}
      {domains.map(domain => {
        const dm = DOMAIN_META[domain];
        const domainTopics = topics.filter(t => t.domain === domain && !t.isOnboarding && t.id !== 'practice_exam');
        if (domainTopics.length === 0) return null;
        return (
          <div key={domain}>
            <div className={`flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider mb-1 ${dm.color}`}>
              {dm.icon}{dm.shortLabel}
              {domainTopics[0].weight && <span className="text-gray-600 font-normal normal-case tracking-normal">{domainTopics[0].weight}</span>}
            </div>
            <div className="space-y-0.5">
              {domainTopics.map(topic => {
                const globalIdx = topics.findIndex(t => t.id === topic.id);
                const isDone = globalIdx < topicIndex;
                const isCurrent = globalIdx === topicIndex;
                const isFuture = globalIdx > topicIndex;
                return (
                  <button key={topic.id} onClick={() => isDone && onJump(globalIdx)} disabled={isFuture}
                    className={`w-full text-left flex items-center gap-2 px-2 py-1 rounded-lg text-xs transition-colors
                      ${isCurrent ? `${dm.bg} ${dm.border} border font-bold ${dm.color}` : ''}
                      ${isDone ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 cursor-pointer' : ''}
                      ${isFuture ? 'text-gray-600 cursor-default' : ''}`}>
                    <span className="flex-shrink-0 text-sm">{isDone ? '✅' : isCurrent ? topic.icon : '⬜'}</span>
                    <span className="truncate">{topic.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Practice exam */}
      {(() => {
        const pe = topics.find(t => t.id === 'practice_exam');
        if (!pe) return null;
        const idx = topics.findIndex(t => t.id === 'practice_exam');
        const isDone = idx < topicIndex;
        const isCurrent = idx === topicIndex;
        const isFuture = idx > topicIndex;
        return (
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider mb-1 text-amber-400">Final Practice</p>
            <button onClick={() => isDone && onJump(idx)} disabled={isFuture}
              className={`w-full text-left flex items-center gap-2 px-2 py-1 rounded-lg text-xs transition-colors
                ${isCurrent ? 'bg-amber-500/15 border border-amber-500/30 font-bold text-amber-400' : ''}
                ${isDone ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 cursor-pointer' : ''}
                ${isFuture ? 'text-gray-600 cursor-default' : ''}`}>
              <span className="flex-shrink-0 text-sm">{isDone ? '✅' : isCurrent ? pe.icon : '⬜'}</span>
              <span className="truncate">{pe.label}</span>
            </button>
          </div>
        );
      })()}
    </div>
  );
};

// ─── Azure service reference panel ───────────────────────────────────────────

const ServiceReferencePanel: React.FC<{ topic: TopicDef }> = ({ topic }) => {
  const services: Record<string, { desc: string; domain: string }> = {
    'Azure SQL Database':              { desc: 'Fully managed PaaS SQL Server — no infrastructure management', domain: 'D2' },
    'Azure SQL Managed Instance':      { desc: 'Near-full SQL Server compatibility for migrating existing apps', domain: 'D2' },
    'Azure Database for PostgreSQL':   { desc: 'Managed open-source PostgreSQL with enterprise features', domain: 'D2' },
    'Azure Database for MySQL':        { desc: 'Managed open-source MySQL for web and app workloads', domain: 'D2' },
    'Azure Blob Storage':              { desc: 'Scalable object storage for unstructured data — files, images, videos', domain: 'D3' },
    'Azure Table Storage':             { desc: 'Simple key-value NoSQL store for fast, cheap structured lookups', domain: 'D3' },
    'Azure Files':                     { desc: 'Managed file shares accessible via SMB — like a cloud network drive', domain: 'D3' },
    'Azure Cosmos DB':                 { desc: 'Globally distributed multi-model NoSQL with guaranteed millisecond latency', domain: 'D3' },
    'Azure Synapse Analytics':         { desc: 'Unified analytics platform — data warehouse + Spark + pipelines', domain: 'D4' },
    'Azure Data Factory':              { desc: 'Low-code ETL/ELT pipeline orchestration service', domain: 'D4' },
    'Azure Databricks':                { desc: 'Apache Spark platform for large-scale ML and data engineering', domain: 'D4' },
    'Azure HDInsight':                 { desc: 'Managed open-source Hadoop/Spark/Kafka clusters on Azure', domain: 'D4' },
    'Microsoft Power BI':              { desc: 'Business intelligence and data visualisation — reports and dashboards', domain: 'D4' },
  };

  const relevantServices = topic.azureServices?.filter(s => services[s]) ?? [];
  if (relevantServices.length === 0) return null;

  return (
    <div className="p-3 bg-gray-800/40 border border-gray-700 rounded-xl space-y-2">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
        <Cpu size={11} className="text-blue-400" /> Azure Services — This Topic
      </p>
      {relevantServices.map(svc => (
        <div key={svc} className="flex gap-2">
          <span className="text-[10px] font-bold text-blue-300 whitespace-nowrap pt-0.5 min-w-[60px]">{services[svc].domain}</span>
          <div>
            <p className="text-xs font-semibold text-white">{svc}</p>
            <p className="text-[10px] text-gray-400 leading-relaxed">{services[svc].desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Exam tip card ────────────────────────────────────────────────────────────

const ExamTipCard: React.FC<{ topicId: string }> = ({ topicId }) => {
  const tips: Record<string, string> = {
    data_types:            '"Rows and columns, fixed schema" → Structured. "JSON or XML, flexible schema" → Semi-structured. "Images, audio, video, free text" → Unstructured. "Record transactions as they happen" → OLTP. "Analyse historical data" → OLAP.',
    data_roles:            '"Keeps database running, manages backups and security" → Database Administrator. "Builds pipelines to move and transform data" → Data Engineer. "Queries data, creates reports and dashboards" → Data Analyst.',
    relational_concepts:   '"Uniquely identifies each row" → Primary Key. "Links one table to another" → Foreign Key. "Reduces data duplication" → Normalisation. "Retrieve, add, modify, delete data" → SELECT, INSERT, UPDATE, DELETE.',
    nonrelational_concepts: '"Flexible schema, no fixed columns" → Non-relational/NoSQL. "Simple key-to-value lookup" → Key-Value store. "JSON-like nested records" → Document store. "Relationships between entities" → Graph database.',
    azure_sql:             '"Fully managed SQL Server on Azure" → Azure SQL Database. "Migrate existing SQL Server with minimal changes" → Azure SQL Managed Instance. "Open-source, managed" → PostgreSQL or MySQL.',
    query_techniques:      '"Saved query acting like a virtual table" → VIEW. "Speeds up search without reading all rows" → Index. "Pre-written SQL script stored on the server" → Stored Procedure.',
    azure_storage:         '"Large unstructured files — images, backups, videos" → Azure Blob. "Simple fast key-value lookup" → Azure Table Storage. "Shared file system like a network drive" → Azure Files. "Big data analytics at petabyte scale" → Azure Data Lake Storage Gen2.',
    azure_cosmos:          '"Global distribution, millisecond latency, NoSQL" → Azure Cosmos DB. "Multiple database API support" → Cosmos DB. "Flexible consistency levels" → Cosmos DB.',
    analytics_concepts:    '"Day-to-day operational transactions" → OLTP. "Historical analysis and reporting" → OLAP / Data Warehouse. "Automated data movement steps" → Pipeline. "Central fact table + dimension tables" → Star Schema.',
    azure_synapse:         '"Unified analytics — warehouse + Spark + pipelines" → Azure Synapse. "Move and transform data between systems" → Azure Data Factory. "Real-time link between Cosmos DB and analytics" → Synapse Link.',
    azure_databricks:      '"Apache Spark, large-scale ML, custom Python pipelines" → Azure Databricks. "Existing Hadoop/Kafka workloads on Azure" → Azure HDInsight. "ACID transactions for data lakes" → Delta Lake.',
    azure_powerbi:         '"Build reports on desktop" → Power BI Desktop. "Publish and share with colleagues" → Power BI Service. "View dashboards on a phone" → Power BI Mobile. "Single-page key metrics view" → Dashboard (not a report).',
    practice_exam:         'Read the scenario for trigger words: "global NoSQL millisecond" → Cosmos DB. "warehouse + Spark unified" → Synapse. "visualise for non-technical" → Power BI. "move data between systems" → Data Factory. "unstructured large files" → Blob Storage.',
  };
  const tip = tips[topicId];
  if (!tip) return null;
  return (
    <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl">
      <p className="text-[10px] font-bold text-amber-400 uppercase mb-1.5 flex items-center gap-1">
        <Zap size={10} /> Exam Tip
      </p>
      <p className="text-xs text-gray-300 leading-relaxed">{tip}</p>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════

const MicrosoftDP900Page: React.FC = () => {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id || null)); }, []);

  // ── Personality baseline ─────────────────────────────────────────────
  const [communicationStrategy, setCommunicationStrategy] = useState<any>(null);
  const [learningStrategy, setLearningStrategy]           = useState<any>(null);
  useEffect(() => {
    if (!userId) return;
    supabase.from('user_personality_baseline').select('communication_strategy, learning_strategy')
      .eq('user_id', userId).maybeSingle()
      .then(({ data }) => {
        if (data?.communication_strategy) setCommunicationStrategy(data.communication_strategy);
        if (data?.learning_strategy)       setLearningStrategy(data.learning_strategy);
      });
  }, [userId]);

  // ── Voice ────────────────────────────────────────────────────────────
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const [voiceMode, setVoiceMode]                   = useState<'english' | 'pidgin'>('english');

  useEffect(() => {
    if (!userId) return;
    supabase.from('profiles').select('continent, country').eq('id', userId).single()
      .then(({ data }) => { setVoiceMode(data?.country === 'Nigeria' ? 'pidgin' : 'english'); });
  }, [userId]);

  const {
    speak: hookSpeak,
    cancel: cancelSpeech,
    fallbackText,
    clearFallback,
  } = useVoice(voiceMode === 'pidgin');

  const speakTextRef = useRef<(text: string) => void>(() => {});
  const speakText = useCallback((text: string) => {
    if (!voiceOutputEnabled || !text.trim()) return;
    hookSpeak(text);
  }, [voiceOutputEnabled, hookSpeak]);
  useEffect(() => { speakTextRef.current = speakText; }, [speakText]);

  // ── Session ──────────────────────────────────────────────────────────
  const [sessionId, setSessionId]               = useState<string | null>(null);
  const [sessionName, setSessionName]           = useState('DP-900 Prep');
  const [sessions, setSessions]                 = useState<SessionRecord[]>([]);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // ── Topic ────────────────────────────────────────────────────────────
  const [topicIndex, setTopicIndex]                 = useState(0);
  const [taskInstruction, setTaskInstruction]       = useState<TaskInstruction | null>(null);
  const [loadingInstruction, setLoadingInstruction] = useState(false);
  const [topicHasAnswer, setTopicHasAnswer]         = useState(false);
  const [subTaskIndex, setSubTaskIndex]             = useState(0);
  const [subTaskCritique, setSubTaskCritique]       = useState<{ hasSuggestions: boolean; feedback: string } | null>(null);

  // ── Answer ───────────────────────────────────────────────────────────
  const [answer, setAnswer]                 = useState('');
  const [answerHistory, setAnswerHistory]   = useState<QuizEntry[]>([]);
  const [isSubmitting, setIsSubmitting]     = useState(false);
  const [isCritiquing, setIsCritiquing]     = useState(false);
  const [errorMsg, setErrorMsg]             = useState<string | null>(null);
  const [aiExplanation, setAiExplanation]   = useState<string | null>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);

  // ── Evaluation ───────────────────────────────────────────────────────
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [isEvaluating, setIsEvaluating]     = useState(false);
  const [evaluation, setEvaluation]         = useState<any>(null);
  const [evalError, setEvalError]           = useState<string | null>(null);

  const currentTopic  = TOPICS[topicIndex];
  const currentDomain = currentTopic?.domain ?? 1;
  const dm            = DOMAIN_META[currentDomain];

  // ── Load sessions ─────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from('dashboard')
      .select('id, dp900_session_id, dp900_session_name, dp900_prompts, dp900_evaluation, updated_at')
      .eq('user_id', userId).eq('activity', DP900_ACTIVITY)
      .not('dp900_session_id', 'is', null).order('updated_at', { ascending: false });
    if (data?.length) { setSessions(data as SessionRecord[]); if (!sessionId) setShowSessionPicker(true); }
  }, [userId, sessionId]);
  useEffect(() => { if (userId) loadSessions(); }, [userId, loadSessions]);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const sid = makeId(); sessionIdRef.current = sid; setSessionId(sid);
    if (userId) {
      await supabase.from('dashboard').insert({
        user_id: userId, activity: DP900_ACTIVITY,
        dp900_session_id: sid, dp900_session_name: sessionName,
        dp900_prompts: [], dp900_evaluation: { topicIndex: 0 },
      });
    }
    return sid;
  }, [userId, sessionName]);

  const persistSession = useCallback(async (prompts: QuizEntry[], tIdx: number) => {
    const sid = sessionIdRef.current; if (!userId || !sid) return;
    await supabase.from('dashboard').update({
      dp900_prompts: prompts,
      dp900_evaluation: { topicIndex: tIdx },
      dp900_session_name: sessionName,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId).eq('dp900_session_id', sid);
  }, [userId, sessionName]);

  const createNewSession = useCallback(async () => {
    if (!userId) return;
    const sid = makeId();
    await supabase.from('dashboard').insert({
      user_id: userId, activity: DP900_ACTIVITY,
      dp900_session_id: sid, dp900_session_name: 'DP-900 Prep',
      dp900_prompts: [], dp900_evaluation: { topicIndex: 0 },
    });
    setSessionId(sid); sessionIdRef.current = sid;
    setSessionName('DP-900 Prep'); setTopicIndex(0);
    setAnswerHistory([]); setEvaluation(null);
    setTopicHasAnswer(false); setShowSessionPicker(false);
    setTaskInstruction(null); setAnswer(''); setAiExplanation(null);
    setErrorMsg(null); setSubTaskCritique(null); setSubTaskIndex(0);
  }, [userId]);

  const loadSession = useCallback((s: SessionRecord) => {
    setSessionId(s.dp900_session_id); sessionIdRef.current = s.dp900_session_id;
    setSessionName(s.dp900_session_name);
    const ev = s.dp900_evaluation || {};
    setTopicIndex(ev.topicIndex ?? 0);
    setAnswerHistory(s.dp900_prompts || []);
    setEvaluation(ev.scores || null); setTopicHasAnswer(false);
    setShowSessionPicker(false); setTaskInstruction(null);
    setAnswer(''); setAiExplanation(null); setErrorMsg(null);
    setSubTaskCritique(null); setSubTaskIndex(0);
  }, []);

  const handleDeleteSession = useCallback(async (e: React.MouseEvent, sid: string) => {
    e.stopPropagation(); if (!userId) return;
    setDeletingSessionId(sid);
    try {
      await supabase.from('dashboard').update({
        dp900_session_id: null, dp900_session_name: null, dp900_prompts: null, dp900_evaluation: null,
      }).eq('user_id', userId).eq('dp900_session_id', sid);
      setSessions(prev => prev.filter(s => s.dp900_session_id !== sid));
    } finally { setDeletingSessionId(null); }
  }, [userId]);

  // ── Fetch task instruction ───────────────────────────────────────────
  const fetchTaskInstruction = useCallback(async (idx: number) => {
    const topic = TOPICS[idx]; if (!topic || topic.isOnboarding) return;
    setLoadingInstruction(true); setTaskInstruction(null);
    try {
      const res = await fetch('/api/dp900-task-instruction', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          topicId: topic.id, topicLabel: topic.label, domain: topic.domain,
          completedTopics: TOPICS.slice(0, idx).map(t => t.id),
          communicationStrategy, learningStrategy,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        setTaskInstruction(result as TaskInstruction);
        if (result?.subTaskTeaching?.[0]) speakTextRef.current(result.subTaskTeaching[0]);
      } else { throw new Error('API unavailable'); }
    } catch {
      const seeds = FALLBACK_SEEDS[topic.id] ?? [
        { teaching: `Let's explore ${topic.label} — a key topic in the DP-900 exam.`,
          question: `In your own words, describe what you already know about ${topic.label}. What questions do you have?` },
      ];
      setTaskInstruction({
        headline: topic.label,
        context: `Domain ${topic.domain}: ${DOMAIN_META[topic.domain].shortLabel}`,
        subTasks: seeds.map(s => s.question),
        subTaskTeaching: seeds.map(s => s.teaching),
        examplePrompt: seeds[0].question,
      });
      if (seeds[0].teaching) speakTextRef.current(seeds[0].teaching);
    } finally { setLoadingInstruction(false); }
  }, [communicationStrategy, learningStrategy]);

  useEffect(() => {
    if (topicIndex > 0) fetchTaskInstruction(topicIndex);
    setTopicHasAnswer(false); setSubTaskIndex(0);
    setSubTaskCritique(null); setAiExplanation(null); setAnswer('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicIndex]);

  // ── Submit answer ────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!answer.trim() || isSubmitting) return;
    setIsSubmitting(true); setErrorMsg(null); setAiExplanation(null); setSubTaskCritique(null);
    await ensureSession();

    const entry: QuizEntry = {
      id: makeId(), topicId: currentTopic?.id, subTaskIndex,
      subTaskQuestion: taskInstruction?.subTasks[subTaskIndex],
      subTaskTeaching: taskInstruction?.subTaskTeaching?.[subTaskIndex],
      userAnswer: answer.trim(), timestamp: new Date().toISOString(),
      action: topicHasAnswer ? 'iterate' : 'answer',
    };

    try {
      const res = await fetch('/api/dp900-task-instruction', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          mode: 'evaluate',
          topicId: currentTopic?.id, domain: currentTopic?.domain,
          subTaskQuestion: taskInstruction?.subTasks[subTaskIndex],
          subTaskTeaching: taskInstruction?.subTaskTeaching?.[subTaskIndex],
          userAnswer: answer.trim(),
          communicationStrategy, learningStrategy,
        }),
      });

      let explanation = '';
      if (res.ok) {
        const result = await res.json();
        explanation = result.explanation || result.feedback || '';
        if (result.feedback) {
          entry.aiCritique = result.feedback;
          entry.hasSuggestions = result.hasSuggestions;
          setSubTaskCritique({ hasSuggestions: !!result.hasSuggestions, feedback: result.feedback });
          if (!result.hasSuggestions) speakTextRef.current(result.feedback.substring(0, 200));
        }
        entry.aiExplanation = explanation;
        setAiExplanation(explanation || null);
      } else {
        explanation = 'Great effort! Your answer has been recorded. Keep reasoning through each concept in your own words — that is how real understanding forms. Move to the next question when you are ready.';
        setAiExplanation(explanation);
        setSubTaskCritique({ hasSuggestions: false, feedback: explanation });
      }

      const newHistory = [...answerHistory, entry];
      setAnswerHistory(newHistory); setTopicHasAnswer(true); setAnswer('');
      await persistSession(newHistory, topicIndex);
      if (voiceOutputEnabled && explanation) speakTextRef.current(explanation.substring(0, 180));

    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
    } finally { setIsSubmitting(false); }
  }, [answer, isSubmitting, currentTopic, taskInstruction, subTaskIndex, answerHistory,
      topicHasAnswer, communicationStrategy, learningStrategy, ensureSession, persistSession,
      topicIndex, voiceOutputEnabled]);

  // ── Critique (hint) ──────────────────────────────────────────────────
  const handleCritique = useCallback(async () => {
    if (!answer.trim() || isCritiquing) return;
    setIsCritiquing(true);
    try {
      const res = await fetch('/api/dp900-task-instruction', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          mode: 'hint',
          topicId: currentTopic?.id, domain: currentTopic?.domain,
          subTaskQuestion: taskInstruction?.subTasks[subTaskIndex],
          userAnswer: answer.trim(),
          communicationStrategy, learningStrategy,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d?.hint) setSubTaskCritique({ hasSuggestions: true, feedback: d.hint });
      }
    } catch { /* ignore */ }
    finally { setIsCritiquing(false); }
  }, [answer, isCritiquing, currentTopic, taskInstruction, subTaskIndex, communicationStrategy, learningStrategy]);

  // ── Navigation ───────────────────────────────────────────────────────
  const handleMoveToNextSubTask = useCallback(() => {
    const maxSub = (taskInstruction?.subTasks?.length ?? 1) - 1;
    if (subTaskIndex < maxSub) {
      setSubTaskIndex(s => s + 1);
      setSubTaskCritique(null); setAiExplanation(null); setAnswer('');
      const nextTeaching = taskInstruction?.subTaskTeaching?.[subTaskIndex + 1];
      if (nextTeaching) speakTextRef.current(nextTeaching);
    }
  }, [subTaskIndex, taskInstruction]);

  const handleCompleteTopic = useCallback(async () => {
    if (topicIndex < TOPICS.length - 1) {
      const newIdx = topicIndex + 1;
      setTopicIndex(newIdx);
      await persistSession(answerHistory, newIdx);
    }
  }, [topicIndex, answerHistory, persistSession]);

  const handleJumpToTopic = useCallback((idx: number) => {
    setTopicIndex(idx);
  }, []);

  // ── Evaluate session ─────────────────────────────────────────────────
  const handleEvaluate = useCallback(async () => {
    setShowEvaluation(true); setIsEvaluating(true); setEvalError(null);
    try {
      const res = await fetch('/api/dp900-evaluate-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          answerHistory: answerHistory.map(e => ({
            topicId: e.topicId, subTaskQuestion: e.subTaskQuestion,
            userAnswer: e.userAnswer, action: e.action,
          })),
          topicsCompleted: TOPICS.slice(0, topicIndex).map(t => t.id),
        }),
      });
      if (res.ok) setEvaluation(await res.json());
      else setEvalError('Could not generate evaluation. Your progress has still been saved.');
    } catch { setEvalError('Evaluation unavailable offline. Your answers have been saved.'); }
    finally { setIsEvaluating(false); }
  }, [answerHistory, topicIndex]);

  const handleCopyAnswer = useCallback(() => {
    if (aiExplanation) navigator.clipboard.writeText(aiExplanation);
  }, [aiExplanation]);

  // ── Derived state ────────────────────────────────────────────────────
  const isOnboarding = currentTopic?.isOnboarding && currentTopic?.id === 'intro_dp900';
  const maxSubTask   = (taskInstruction?.subTasks?.length ?? 1) - 1;
  const progressPct  = Math.round((topicIndex / (TOPICS.length - 1)) * 100);

  // ─────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden">
      <Navbar />

      {/* Voice fallback */}
      {fallbackText && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm">
          <VoiceFallback text={fallbackText} onDismiss={clearFallback} />
        </div>
      )}

      {/* Session picker */}
      {showSessionPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-800 border border-gray-600 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="px-5 py-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <FolderOpen size={18} className="text-blue-400" /> Your DP-900 Sessions
              </h2>
              <button onClick={() => setShowSessionPicker(false)} className="p-1 text-gray-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {sessions.map(s => (
                <button key={s.dp900_session_id} onClick={() => loadSession(s)}
                  className="w-full text-left p-3 bg-gray-700/40 hover:bg-gray-700 border border-gray-600 hover:border-blue-500/40 rounded-xl transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{s.dp900_session_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Topic {(s.dp900_evaluation as any)?.topicIndex ?? 0}/{TOPICS.length} · {s.updated_at ? new Date(s.updated_at).toLocaleDateString() : '—'}
                      </p>
                    </div>
                    <button onClick={e => handleDeleteSession(e, s.dp900_session_id)}
                      disabled={deletingSessionId === s.dp900_session_id}
                      className="p-1.5 text-gray-600 hover:text-red-400 rounded transition-colors flex-shrink-0">
                      {deletingSessionId === s.dp900_session_id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </button>
              ))}
            </div>
            <div className="px-5 pb-4 flex-shrink-0">
              <button onClick={createNewSession}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors">
                <Plus size={15} /> Start New Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Evaluation modal */}
      {showEvaluation && (() => {
        const scoreColor = (s: number) => s >= 2.5 ? 'text-emerald-400' : s >= 1.5 ? 'text-amber-400' : 'text-red-400';
        const skillLabel = (k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-gray-800 border border-gray-600 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
              <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <BarChart3 size={20} className="text-blue-400" /> Session Evaluation
                </h2>
                <button onClick={() => setShowEvaluation(false)} className="p-1 text-gray-400 hover:text-white"><X size={18} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {isEvaluating && (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 size={36} className="animate-spin text-blue-400 mb-3" />
                    <p className="text-gray-300 font-medium">Evaluating your DP-900 readiness…</p>
                  </div>
                )}
                {evalError && !isEvaluating && (
                  <div className="p-4 bg-red-500/15 border border-red-500/30 rounded-xl text-red-300 flex gap-2">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />{evalError}
                  </div>
                )}
                {evaluation && !isEvaluating && (
                  <>
                    {evaluation.overall_score_average !== undefined && (
                      <div className="flex items-center gap-3 p-4 bg-gray-700/60 rounded-xl border border-gray-600">
                        <Award size={28} className="text-amber-400" />
                        <div>
                          <p className="text-xs text-gray-400 uppercase font-bold">Overall Readiness Score</p>
                          <p className={`text-3xl font-black ${scoreColor(evaluation.overall_score_average)}`}>
                            {Number(evaluation.overall_score_average).toFixed(1)}<span className="text-base font-normal text-gray-500"> / 3.0</span>
                          </p>
                        </div>
                      </div>
                    )}
                    {evaluation.strengths_summary && (
                      <div className="p-4 bg-emerald-500/10 border border-emerald-500/25 rounded-xl">
                        <p className="text-[10px] font-bold text-emerald-400 uppercase mb-2">💪 Strengths</p>
                        <p className="text-xs text-gray-300 leading-relaxed">{evaluation.strengths_summary}</p>
                      </div>
                    )}
                    {evaluation.highest_leverage_improvements && (
                      <div className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-xl">
                        <p className="text-[10px] font-bold text-amber-400 uppercase mb-2">🎯 Focus Areas Before the Exam</p>
                        <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-line">{evaluation.highest_leverage_improvements}</p>
                      </div>
                    )}
                    {evaluation.exam_readiness && (
                      <div className="p-4 bg-blue-500/10 border border-blue-500/25 rounded-xl">
                        <p className="text-[10px] font-bold text-blue-400 uppercase mb-2">🎓 Exam Readiness Assessment</p>
                        <p className="text-xs text-gray-300 leading-relaxed">{evaluation.exam_readiness}</p>
                      </div>
                    )}
                    {evaluation.detailed_scores && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Domain Breakdown</p>
                        {Object.entries(evaluation.detailed_scores as Record<string, { score: number; justification: string }>).map(([skill, data]) => (
                          <details key={skill} className="group border border-gray-700 rounded-lg overflow-hidden">
                            <summary className="flex items-center gap-3 px-3 py-2 bg-gray-700/30 hover:bg-gray-700/50 cursor-pointer list-none">
                              <span className={`text-sm font-black w-5 text-right flex-shrink-0 ${scoreColor(data.score)}`}>{data.score}</span>
                              <span className="text-[11px] text-gray-300 flex-1">{skillLabel(skill)}</span>
                              <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden flex-shrink-0">
                                <div className={`h-full rounded-full ${data.score >= 2 ? 'bg-blue-500' : data.score >= 1 ? 'bg-amber-500' : 'bg-red-500'}`}
                                  style={{ width: `${(data.score / 3) * 100}%` }} />
                              </div>
                            </summary>
                            <div className="px-3 py-2 bg-gray-800/50 text-[11px] text-gray-400 leading-relaxed">{data.justification}</div>
                          </details>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ Main layout: left sidebar + right content ═══ */}
      <main className="flex flex-1 min-h-0 overflow-hidden">

        {/* ─── LEFT: Topic list + session controls ─── */}
        <div className="w-56 flex-shrink-0 bg-gray-800/60 border-r border-gray-700 flex flex-col overflow-hidden">

          {/* Header */}
          <div className="px-3 py-2.5 border-b border-gray-700 flex-shrink-0">
            <div className="flex items-center gap-2 mb-1.5">
              <Database size={14} className="text-blue-400" />
              <span className="text-xs font-bold text-white truncate">DP-900 Prep</span>
              <button onClick={() => setVoiceOutputEnabled(v => !v)} title="Toggle voice"
                className={`ml-auto p-1 rounded transition-colors ${voiceOutputEnabled ? 'text-blue-400 hover:text-blue-300' : 'text-gray-600 hover:text-gray-400'}`}>
                {voiceOutputEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
              </button>
            </div>
            {/* Progress bar */}
            <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden mb-1">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="text-[9px] text-gray-500">{progressPct}% complete · {topicIndex}/{TOPICS.length} topics</p>
          </div>

          {/* Topic stepper */}
          <div className="flex-1 overflow-hidden">
            <TopicStepper topics={TOPICS} topicIndex={topicIndex} onJump={handleJumpToTopic} />
          </div>

          {/* Session controls */}
          <div className="px-3 py-3 border-t border-gray-700 space-y-1.5 flex-shrink-0">
            <button onClick={() => setShowSessionPicker(true)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors">
              <FolderOpen size={11} /> Sessions
            </button>
            <button onClick={createNewSession}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors">
              <Plus size={11} /> New Session
            </button>
          </div>
        </div>

        {/* ─── RIGHT: Question + answer panel ─── */}
        {isOnboarding ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <DP900Onboarding onComplete={() => setTopicIndex(1)} />
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* Fixed top: topic header + teaching + service reference + exam tip */}
            <div className="flex-shrink-0 px-5 pt-4 pb-2 space-y-3 border-b border-gray-700/50">

              {/* Topic header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-0.5 ${dm.color}`}>
                    {dm.icon}{dm.shortLabel}
                    {currentTopic?.weight && <span className="text-gray-600 font-normal">{currentTopic.weight}</span>}
                  </div>
                  <h2 className="text-sm font-bold text-white leading-tight">{currentTopic?.label}</h2>
                </div>
                <button onClick={() => fetchTaskInstruction(topicIndex)}
                  title="Refresh question"
                  className="p-1.5 text-gray-600 hover:text-gray-300 transition-colors flex-shrink-0">
                  <RefreshCw size={12} />
                </button>
              </div>

              {/* Teaching text */}
              {taskInstruction?.subTaskTeaching?.[subTaskIndex] && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <p className="text-[10px] font-bold text-blue-400 uppercase mb-1.5 flex items-center gap-1">
                    <BookOpen size={10} /> Concept
                  </p>
                  <p className="text-xs text-gray-300 leading-relaxed">{taskInstruction.subTaskTeaching[subTaskIndex]}</p>
                </div>
              )}

              {/* Azure service reference */}
              {currentTopic && <ServiceReferencePanel topic={currentTopic} />}

              {/* Exam tip */}
              {currentTopic && <ExamTipCard topicId={currentTopic.id} />}

              {/* Question */}
              <div className="p-3 bg-gray-800/70 rounded-xl border border-gray-700">
                {loadingInstruction ? (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Loader2 size={12} className="animate-spin" /> Generating question…
                  </div>
                ) : taskInstruction ? (
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-2">
                      Question {subTaskIndex + 1} of {taskInstruction.subTasks.length}
                    </p>
                    <p className="text-sm text-gray-200 leading-relaxed">
                      {taskInstruction.subTasks[subTaskIndex]}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">Select a topic from the left panel to begin.</p>
                )}
              </div>
            </div>

            {/* Scrollable middle: feedback + explanation */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

              {/* AI explanation after submission */}
              {aiExplanation && (
                <div className="p-3 bg-gray-800/60 border border-gray-700 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-bold text-blue-400 uppercase flex items-center gap-1">
                      <Database size={10} /> AI Coach Response
                    </p>
                    <button onClick={handleCopyAnswer} className="text-gray-600 hover:text-gray-300 transition-colors">
                      <Copy size={11} />
                    </button>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">{aiExplanation}</p>
                </div>
              )}

              {/* Sub-task critique */}
              {subTaskCritique && !aiExplanation && (
                <div className={`p-3 rounded-xl border ${subTaskCritique.hasSuggestions ? 'bg-amber-500/10 border-amber-500/25' : 'bg-emerald-500/10 border-emerald-500/25'}`}>
                  <p className={`text-[10px] font-bold uppercase mb-1.5 ${subTaskCritique.hasSuggestions ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {subTaskCritique.hasSuggestions ? '💡 Coaching Feedback' : '✅ Strong Answer'}
                  </p>
                  <p className="text-xs text-gray-300 leading-relaxed">{subTaskCritique.feedback}</p>
                  {subTaskCritique.hasSuggestions && (
                    <p className="text-[10px] text-gray-500 italic mt-1.5">Refine your answer, or move on when ready.</p>
                  )}
                </div>
              )}

              {/* Error */}
              {errorMsg && (
                <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg flex gap-2">
                  <AlertCircle size={12} className="flex-shrink-0 text-red-400 mt-0.5" />
                  <p className="text-xs text-red-300">{errorMsg}</p>
                </div>
              )}

              {/* Answer textarea */}
              <div>
                <textarea
                  ref={answerRef} value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit(); }}
                  placeholder={taskInstruction?.subTasks[subTaskIndex]?.replace(/^[^:]+:\s*/, '').substring(0, 80) + '…' || 'Type your answer here…'}
                  style={{ minHeight: '140px' }}
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 resize-y outline-none focus:border-blue-500 transition-colors leading-relaxed"
                />
                <p className="text-[9px] text-gray-700 mt-1">Ctrl+Enter to submit</p>
              </div>
            </div>

            {/* Fixed bottom buttons */}
            <div className="flex-shrink-0 px-5 pb-5 space-y-2">
              <div className="flex gap-2">
                {/* Submit answer */}
                <button onClick={handleSubmit} disabled={isSubmitting || !answer.trim() || !taskInstruction}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors disabled:opacity-40">
                  {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <ArrowUpCircle size={18} />}
                  {isSubmitting && <span className="text-sm">Evaluating…</span>}
                </button>
                {/* Get a hint */}
                <button onClick={handleCritique} disabled={isCritiquing || !answer.trim()}
                  title="Get a hint before submitting"
                  className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition-colors disabled:opacity-40">
                  {isCritiquing ? <Loader2 size={14} className="animate-spin" /> : <Lightbulb size={14} />}
                </button>
              </div>

              {/* Move to next question within topic */}
              {topicHasAnswer && subTaskIndex < maxSubTask && (
                <button onClick={handleMoveToNextSubTask}
                  className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-xl border border-gray-600 text-gray-300 hover:border-gray-400 hover:text-white transition-all">
                  <SkipForward size={13} /> Next Question
                </button>
              )}

              {/* Complete topic and advance */}
              {topicHasAnswer && subTaskIndex >= maxSubTask && (!subTaskCritique || !subTaskCritique.hasSuggestions) && topicIndex < TOPICS.length - 1 && (
                <button onClick={handleCompleteTopic}
                  className={`w-full flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-xl border transition-all ${dm.bg} ${dm.color} ${dm.border} hover:opacity-90`}>
                  <CheckCircle size={13} /> Complete Topic & Continue <ArrowRight size={13} />
                </button>
              )}

              {/* Complete anyway (with unresolved suggestions) */}
              {topicHasAnswer && subTaskIndex >= maxSubTask && subTaskCritique?.hasSuggestions && topicIndex < TOPICS.length - 1 && (
                <button onClick={handleCompleteTopic}
                  className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-xl border border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300 transition-all">
                  <CheckCircle size={13} /> Continue anyway <ArrowRight size={13} />
                </button>
              )}

              {/* Finished all topics */}
              {topicIndex >= TOPICS.length - 1 && topicHasAnswer && (
                <button onClick={handleEvaluate}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white transition-all">
                  <Award size={15} /> Get Exam Readiness Report
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default MicrosoftDP900Page;
