-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  username text unique,
  name text,
  avatar_url text,
  role text check (role in ('student', 'facilitator')) default 'student',
  team_id uuid,
  created_at timestamp with time zone default now()
);

-- Teams table
create table public.teams (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  facilitator_id uuid references public.profiles(id),
  created_at timestamp with time zone default now()
);

-- Add foreign key constraint for team_id in profiles
alter table public.profiles
add constraint profiles_team_id_fkey
foreign key (team_id) references public.teams(id);

-- Projects table
create table public.projects (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  team_id uuid references public.teams(id),
  owner_id uuid references public.profiles(id) not null,
  status text check (status in ('draft', 'in_progress', 'completed', 'archived')) default 'draft',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Skills progress table
create table public.skills_progress (
  id serial primary key,
  user_id uuid references public.profiles(id) not null,
  skill text not null,
  progress integer check (progress between 0 and 100),
  updated_at timestamp with time zone default now()
);

-- Chat history table
create table public.chat_history (
  id bigint generated always as identity primary key,
  context text check (context in ('project', 'team', 'code', 'admin')) not null,
  context_id uuid not null,
  role text check (role in ('user', 'assistant')) not null,
  user_id uuid references public.profiles(id),
  message text not null,
  created_at timestamp with time zone default now()
);

-- Create indexes for better query performance
create index profiles_team_id_idx on public.profiles(team_id);
create index projects_team_id_idx on public.projects(team_id);
create index projects_owner_id_idx on public.projects(owner_id);
create index skills_progress_user_id_idx on public.skills_progress(user_id);
create index chat_history_context_id_idx on public.chat_history(context_id);
create index chat_history_user_id_idx on public.chat_history(user_id);

-- Enable Row Level Security
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.projects enable row level security;
alter table public.skills_progress enable row level security;
alter table public.chat_history enable row level security;

-- RLS Policies for profiles
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Facilitators can view team profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.teams t
      where t.facilitator_id = auth.uid()
      and t.id = profiles.team_id
    )
  );

-- RLS Policies for teams
create policy "Team members can view their team"
  on public.teams for select
  using (
    exists (
      select 1 from public.profiles p
      where p.team_id = teams.id
      and p.id = auth.uid()
    )
  );

create policy "Facilitators can manage their teams"
  on public.teams for all
  using (facilitator_id = auth.uid());

-- RLS Policies for projects
create policy "Users can view their own or team projects"
  on public.projects for select
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
      and p.team_id = projects.team_id
    )
  );

create policy "Users can manage their own projects"
  on public.projects for all
  using (owner_id = auth.uid());

create policy "Facilitators can view team projects"
  on public.projects for select
  using (
    exists (
      select 1 from public.teams t
      where t.facilitator_id = auth.uid()
      and t.id = projects.team_id
    )
  );

-- RLS Policies for skills progress
create policy "Users can view their own skills"
  on public.skills_progress for select
  using (user_id = auth.uid());

create policy "Users can update their own skills"
  on public.skills_progress for update
  using (user_id = auth.uid());

create policy "Facilitators can view team skills"
  on public.skills_progress for select
  using (
    exists (
      select 1 from public.profiles p
      join public.teams t on p.team_id = t.id
      where skills_progress.user_id = p.id
      and t.facilitator_id = auth.uid()
    )
  );

-- RLS Policies for chat history
create policy "Users can view relevant chats"
  on public.chat_history for select
  using (
    -- Personal chats
    (context = 'code' and user_id = auth.uid())
    -- Team chats
    or (context = 'team' and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
      and p.team_id::text = context_id::text
    ))
    -- Project chats
    or (context = 'project' and exists (
      select 1 from public.projects pr
      left join public.teams t on t.id = pr.team_id
      where pr.id::text = context_id::text
      and (
        pr.owner_id = auth.uid()
        or exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
          and p.team_id = t.id
        )
      )
    ))
    -- Admin chats (facilitators only)
    or (context = 'admin' and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
      and p.role = 'facilitator'
    ))
  );

create policy "Users can create chat messages"
  on public.chat_history for insert
  with check (
    user_id = auth.uid()
    and (
      -- Personal code chats
      (context = 'code')
      -- Team chats (if member)
      or (context = 'team' and exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
        and p.team_id::text = context_id::text
      ))
      -- Project chats (if owner or team member)
      or (context = 'project' and exists (
        select 1 from public.projects pr
        left join public.teams t on t.id = pr.team_id
        where pr.id::text = context_id::text
        and (
          pr.owner_id = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
            and p.team_id = t.id
          )
        )
      ))
      -- Admin chats (facilitators only)
      or (context = 'admin' and exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
        and p.role = 'facilitator'
      ))
    )
  );

-- Function to handle new user creation
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'student');
  return new;
end;
$$ language plpgsql security definer;

-- Trigger for new user creation
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Function to update timestamps
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger for updating timestamps
create trigger update_projects_updated_at
  before update on public.projects
  for each row execute function public.update_updated_at_column();