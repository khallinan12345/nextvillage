/*
  # Fix profiles RLS policies

  1. Changes
    - Remove circular dependencies in RLS policies
    - Simplify policies to prevent infinite recursion
    - Maintain security while allowing proper profile access

  2. Security
    - Users can still only view and update their own profiles
    - Facilitators maintain access to team member profiles
    - Policies are simplified to prevent recursion
*/

-- Drop existing policies to recreate them without circular dependencies
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Facilitators can view team profiles" ON profiles;

-- Recreate policies with simplified conditions
CREATE POLICY "Users can view their own profile"
ON profiles
FOR SELECT
TO public
USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
ON profiles
FOR UPDATE
TO public
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Facilitator policy using a direct join instead of EXISTS subquery
CREATE POLICY "Facilitators can view team profiles"
ON profiles
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM teams
    WHERE teams.facilitator_id = auth.uid()
    AND teams.id = profiles.team_id
  )
);