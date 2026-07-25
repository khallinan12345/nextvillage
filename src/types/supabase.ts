// src/types/supabase.ts
// Supabase TypeScript definitions

/////////////////////////////////////////////////////////////
// PROFILES TABLE
/////////////////////////////////////////////////////////////

/** A single row in the `profiles` table */
export interface UserProfile {
  id: string;
  email: string;
  username?: string;
  name?: string;
  avatar_url?: string;
  role: 'student' | 'teacher' | 'facilitator';
  /** 1=Grades 3–5, 2=Grades 6–8, 3=Grades 9–12, 4=Adult Learner (18+) */
  grade_level?: 1 | 2 | 3 | 4;
  continent?: string;
  country?: string;
  school_name?: string;
  team_id?: string;
  profile_completed?: boolean;
  created_at: string;
  updated_at: string;
}

/////////////////////////////////////////////////////////////
// PROJECTS TABLE
/////////////////////////////////////////////////////////////

/** A single row in the `projects` table */
export interface Project {
  id: number;
  owner_id: string;
  team_id?: string;
  title: string;
  description: string | null;
  status: 'draft' | 'in_progress' | 'completed' | 'archived';
  created_at: string;
  updated_at: string;
}

/////////////////////////////////////////////////////////////
// TEAMS TABLE
/////////////////////////////////////////////////////////////

/** A single row in the `teams` table */
export interface Team {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

/////////////////////////////////////////////////////////////
// PROFILE‐COMPLETION PAYLOAD
/////////////////////////////////////////////////////////////

/** Payload for your profile‐completion UI */
export interface ProfileCompletionData {
  name: string;
  role: 'student' | 'teacher';
  /** '1' → Grades 3–5, '2' → Grades 6–8, '3' → Grades 9–12, '4' → Adult Learner (18+) */
  grade_level: '1' | '2' | '3' | '4';
  continent: string;
  country: string;
  school_name?: string;
}

/////////////////////////////////////////////////////////////
// UTILITY TYPES
/////////////////////////////////////////////////////////////

/** Union of allowed grade_level codes */
export type GradeLevel = '1' | '2' | '3' | '4';