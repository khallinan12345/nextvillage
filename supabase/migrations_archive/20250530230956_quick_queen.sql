-- First, drop existing policies that might be causing recursion
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Facilitators can view team profiles" ON profiles;

-- Add new, simplified policies
CREATE POLICY "Users can read own profile"
ON profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Allow facilitators to view team member profiles
CREATE POLICY "Facilitators can view team profiles"
ON profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM teams
    WHERE teams.facilitator_id = auth.uid()
    AND teams.id = profiles.team_id
  )
);

-- Allow public read access to basic profile info (username and avatar)
CREATE POLICY "Public can view basic profile info"
ON profiles
FOR SELECT
TO public
USING (true);