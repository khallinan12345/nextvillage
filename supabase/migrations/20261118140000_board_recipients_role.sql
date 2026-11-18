-- The monthly board report also goes to the vAI leaders, who are not directors. Same table, with a role.
-- (Rows are added in the database directly; this repo is public.)
ALTER TABLE public.board_directors ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'director' CHECK (role IN ('director', 'vai_leader'));
COMMENT ON TABLE public.board_directors IS 'Everyone who receives the monthly board report (Impact Mining Program News): board directors and vAI leaders. Only active rows are mailed.';
