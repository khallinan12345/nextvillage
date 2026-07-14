/*
  # Fix profiles table RLS policies

  1. Changes
    - Remove potentially recursive policies
    - Simplify policy conditions to avoid circular references
    - Ensure proper access control while preventing infinite recursion

  2. Security
    - Maintain existing security model but with optimized policy conditions
    - Users can still view their own profile
    - Facilitators can still view team member profiles
    - Public can view basic profile info
*/

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Public can view basic profile info" ON profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Facilitators can view team profiles" ON profiles;

-- Recreate policies with optimized conditions
CREATE POLICY "Public can view basic profile info"
ON profiles FOR SELECT
TO public
USING (true);

CREATE POLICY "Users can read own profile"
ON profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Simplified facilitator policy that avoids recursion
CREATE POLICY "Facilitators can view team profiles"
ON profiles FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM teams
    WHERE teams.id = profiles.team_id
    AND teams.facilitator_id = auth.uid()
  )
);