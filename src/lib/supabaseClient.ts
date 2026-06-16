import { createClient } from '@supabase/supabase-js';

// Support both VITE_ and non-VITE_ prefixed variables (for compatibility)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 
                    import.meta.env.SUPABASE_URL || 
                    'https://wohmsbeygxrbwogrggkq.supabase.co';

const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 
                        import.meta.env.SUPABASE_ANON_KEY || 
                        '';

// Only warn, don't throw error (site was working before)
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase environment variables may be missing');
}

// Create client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export { supabase };
export type GradeLevel = 1 | 2 | 3 | 4;

if (typeof window !== 'undefined') {
  (window as any).supabase = supabase;
}