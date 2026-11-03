-- =====================================================================
-- DOOMEE — Schéma de base de données (Supabase / PostgreSQL)
-- À exécuter UNE fois dans Supabase > SQL Editor > New query > Run.
-- Toutes les permissions sont appliquées au niveau de la base (Row Level Security).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Types ----------
do $$ begin
  create type public.app_role as enum ('admin', 'direction', 'manager', 'collaborateur');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.plan_status as enum ('draft', 'submitted', 'closed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.result_status as enum ('done', 'partial', 'not_done');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.priority_level as enum ('high', 'medium', 'low');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.project_status as enum ('draft', 'active', 'on_hold', 'done');
exception when duplicate_object then null; end $$;

-- ---------- Tables ----------
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  manager_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  email text not null,
  role public.app_role not null default 'collaborateur',
  department_id uuid references public.departments (id) on delete set null,
  job_title text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  phone text,
  bio text check (bio is null or char_length(bio) <= 140),
  avatar_url text,
  avatar_color text not null default '#202124',
  language text not null default 'fr' check (language in ('fr', 'en')),
  notification_prefs jsonb not null default '{"morning": true, "evening": true, "late": true, "manager": true, "weekly": true}'::jsonb,
  hourly_cost numeric(12, 0),                       -- Phase 3 : coût horaire (FCFA), non utilisé dans le MVP
  created_at timestamptz not null default now()
);

do $$ begin
  alter table public.departments
    add constraint departments_manager_fk foreign key (manager_id) references public.profiles (id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  sort_order int not null default 0
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_name text,
  description text,
  manager_id uuid references public.profiles (id) on delete set null,
  start_date date,
  end_date date,
  status public.project_status not null default 'active',
  objectives text,
  budget numeric(14, 0),
  created_at timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (project_id, user_id)
);

create table if not exists public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_date date not null,
  status public.plan_status not null default 'draft',
  submitted_at timestamptz,          -- planning du matin soumis
  closed_at timestamptz,             -- bilan du soir soumis
  difficulties text,                 -- difficultés générales de la journée
  created_at timestamptz not null default now(),
  unique (user_id, plan_date)
);

create table if not exists public.actions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.daily_plans (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  expected_result text,
  priority public.priority_level not null default 'medium',
  deadline time,
  estimated_minutes int not null default 0 check (estimated_minutes >= 0),
  planned_budget numeric(12, 0) check (planned_budget is null or planned_budget >= 0),
  is_unplanned boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_results (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null unique references public.actions (id) on delete cascade,
  status public.result_status not null,
  actual_result text,
  quantity numeric,
  actual_minutes int check (actual_minutes is null or actual_minutes >= 0),
  budget_used numeric(12, 0) check (budget_used is null or budget_used >= 0),
  difficulty text,
  justification text,
  completed_on_time boolean not null default true,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint justification_required check (status = 'done' or coalesce(btrim(justification), '') <> '')
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.daily_results (id) on delete cascade,
  file_path text not null,
  file_name text,
  file_type text,
  kind text not null default 'proof' check (kind in ('proof', 'receipt')),
  uploaded_at timestamptz not null default now()
);

create table if not exists public.manager_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  author_name text,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  message text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  action_type text not null,
  entity_type text not null,
  entity_id uuid,
  owner_id uuid,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  timezone text not null default 'Africa/Douala',
  morning_reminder time not null default '08:00',
  evening_reminder time not null default '17:30',
  partial_weight numeric not null default 0 check (partial_weight between 0 and 1)
);
insert into public.app_settings (id) values (1) on conflict do nothing;

create index if not exists idx_plans_user_date on public.daily_plans (user_id, plan_date);
create index if not exists idx_plans_date on public.daily_plans (plan_date);
create index if not exists idx_actions_plan on public.actions (plan_id);
create index if not exists idx_actions_project on public.actions (project_id);
create index if not exists idx_notifications_user on public.notifications (user_id, created_at desc);
create index if not exists idx_observations_user on public.manager_observations (user_id, created_at desc);
create index if not exists idx_audit_owner on public.audit_logs (owner_id, created_at desc);

-- ---------- Fonctions de permission ----------
create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and status = 'active'
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

create or replace function public.is_direction() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('admin', 'direction'), false)
$$;

create or replace function public.is_staff_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('admin', 'direction', 'manager'), false)
$$;

-- Peut-on voir les données de cet utilisateur ? (soi-même, direction, ou manager du département)
create or replace function public.can_view_user(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select target = auth.uid()
      or public.is_direction()
      or (
        public.my_role() = 'manager'
        and exists (
          select 1 from public.profiles p
          join public.departments d on d.id = p.department_id
          where p.id = target and d.manager_id = auth.uid()
        )
      )
$$;

create or replace function public.plan_owner(p_plan uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select user_id from public.daily_plans where id = p_plan
$$;

create or replace function public.plan_status_of(p_plan uuid) returns public.plan_status
language sql stable security definer set search_path = public as $$
  select status from public.daily_plans where id = p_plan
$$;

create or replace function public.action_plan(p_action uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select plan_id from public.actions where id = p_action
$$;

create or replace function public.result_plan(p_result uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select a.plan_id from public.daily_results r join public.actions a on a.id = r.action_id where r.id = p_result
$$;

-- ---------- Profil créé automatiquement à l'inscription ----------
-- Le tout premier compte créé devient administrateur.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_user boolean;
begin
  select not exists (select 1 from public.profiles) into first_user;
  -- Le rôle n'est jamais lu depuis les métadonnées (sinon n'importe qui pourrait s'attribuer un rôle) :
  -- il est fixé ensuite par l'administrateur.
  insert into public.profiles (id, email, first_name, last_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    case when first_user then 'admin'::public.app_role else 'collaborateur'::public.app_role end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Un collaborateur ne peut pas modifier son rôle, son département, sa fonction ni son statut.
create or replace function public.protect_profile_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.role := old.role;
    new.department_id := old.department_id;
    new.job_title := old.job_title;
    new.status := old.status;
    new.email := old.email;
    new.hourly_cost := old.hourly_cost;
  end if;
  return new;
end $$;

drop trigger if exists protect_profile on public.profiles;
create trigger protect_profile before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- Cycle de vie d'un planning : brouillon -> soumis -> clôturé, jamais en arrière (sauf administrateur).
-- Un bilan ne peut être clôturé que si chaque action a un résultat.
create or replace function public.guard_plan_transition() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if new.user_id is distinct from old.user_id or new.plan_date is distinct from old.plan_date then
    raise exception 'Modification interdite';
  end if;
  if new.status is distinct from old.status then
    if not ((old.status = 'draft' and new.status = 'submitted') or (old.status = 'submitted' and new.status = 'closed')) then
      raise exception 'Transition de statut interdite';
    end if;
    if new.status = 'submitted' and not exists (select 1 from public.actions where plan_id = new.id) then
      raise exception 'Un planning vide ne peut pas être soumis';
    end if;
    if new.status = 'closed' and exists (
      select 1 from public.actions a
      where a.plan_id = new.id and not exists (select 1 from public.daily_results r where r.action_id = a.id)
    ) then
      raise exception 'Chaque action doit avoir un résultat avant la clôture du bilan';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_plan on public.daily_plans;
create trigger guard_plan before update on public.daily_plans
  for each row execute function public.guard_plan_transition();

-- ---------- Horodatage ----------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists results_touch on public.daily_results;
create trigger results_touch before update on public.daily_results
  for each row execute function public.touch_updated_at();

-- ---------- Historique des modifications après soumission du bilan ----------
create or replace function public.audit_after_close() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plan uuid; v_owner uuid; v_status public.plan_status;
begin
  if tg_table_name = 'daily_results' then
    v_plan := public.action_plan(coalesce(new.action_id, old.action_id));
  elsif tg_table_name = 'actions' then
    v_plan := coalesce(new.plan_id, old.plan_id);
  else
    v_plan := coalesce(new.id, old.id);
  end if;
  select user_id, status into v_owner, v_status from public.daily_plans where id = v_plan;
  if tg_table_name = 'daily_plans' then
    if old.status = 'closed' and (new.status is distinct from old.status or new.difficulties is distinct from old.difficulties) then
      insert into public.audit_logs (user_id, action_type, entity_type, entity_id, owner_id, previous_value, new_value)
      values (auth.uid(), tg_op, tg_table_name, new.id, v_owner, to_jsonb(old), to_jsonb(new));
    end if;
  elsif v_status = 'closed' then
    insert into public.audit_logs (user_id, action_type, entity_type, entity_id, owner_id, previous_value, new_value)
    values (auth.uid(), tg_op, tg_table_name, coalesce(new.id, old.id), v_owner,
            case when tg_op = 'INSERT' then null else to_jsonb(old) end,
            case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists audit_results on public.daily_results;
create trigger audit_results after insert or update or delete on public.daily_results
  for each row execute function public.audit_after_close();
drop trigger if exists audit_actions on public.actions;
create trigger audit_actions after update or delete on public.actions
  for each row execute function public.audit_after_close();
drop trigger if exists audit_plans on public.daily_plans;
create trigger audit_plans after update on public.daily_plans
  for each row execute function public.audit_after_close();

-- ---------- Notifications automatiques ----------
create or replace function public.notify(p_user uuid, p_type text, p_title text, p_message text, p_link text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, message, link)
  values (p_user, p_type, p_title, p_message, p_link);
end $$;

-- Nom de l'auteur figé dans l'observation (le collaborateur n'a pas accès au profil du manager)
create or replace function public.fill_observation_author() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.author_id := auth.uid();
  select nullif(trim(first_name || ' ' || last_name), '') into new.author_name from public.profiles where id = auth.uid();
  return new;
end $$;
drop trigger if exists observation_author on public.manager_observations;
create trigger observation_author before insert on public.manager_observations
  for each row execute function public.fill_observation_author();

-- Observation du manager -> notification au collaborateur
create or replace function public.on_observation() returns trigger
language plpgsql security definer set search_path = public as $$
declare prefs jsonb;
begin
  select notification_prefs into prefs from public.profiles where id = new.user_id;
  if coalesce((prefs ->> 'manager')::boolean, true) then
    perform public.notify(new.user_id, 'observation', 'Nouvelle observation de votre manager', left(new.body, 180), '/performance');
  end if;
  return new;
end $$;
drop trigger if exists observation_notify on public.manager_observations;
create trigger observation_notify after insert on public.manager_observations
  for each row execute function public.on_observation();

-- Bilan soumis -> notification au manager du département
create or replace function public.on_plan_closed() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_manager uuid; v_name text;
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then
    select d.manager_id, trim(p.first_name || ' ' || p.last_name) into v_manager, v_name
    from public.profiles p left join public.departments d on d.id = p.department_id
    where p.id = new.user_id;
    if v_manager is not null and v_manager <> new.user_id then
      perform public.notify(v_manager, 'report', 'Bilan disponible', v_name || ' a soumis son bilan du ' || to_char(new.plan_date, 'DD/MM/YYYY') || '.',
        '/direction/collaborateurs/' || new.user_id);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists plan_closed_notify on public.daily_plans;
create trigger plan_closed_notify after update on public.daily_plans
  for each row execute function public.on_plan_closed();

-- Relance d'un collaborateur par un manager (vérifie les droits)
create or replace function public.send_reminder(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff_manager() or not public.can_view_user(target) or target = auth.uid() then
    raise exception 'Non autorisé';
  end if;
  perform public.notify(target, 'reminder', 'Relance de votre manager', 'Merci de compléter votre planning ou votre bilan du jour.', '/accueil');
end $$;

-- ---------- Row Level Security ----------
alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.daily_plans enable row level security;
alter table public.actions enable row level security;
alter table public.daily_results enable row level security;
alter table public.attachments enable row level security;
alter table public.manager_observations enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.app_settings enable row level security;

-- Référentiels : lecture pour tous les connectés, écriture admin
drop policy if exists dep_read on public.departments;
create policy dep_read on public.departments for select to authenticated using (true);
drop policy if exists dep_admin on public.departments;
create policy dep_admin on public.departments for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists cat_read on public.categories;
create policy cat_read on public.categories for select to authenticated using (true);
drop policy if exists cat_admin on public.categories;
create policy cat_admin on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists settings_read on public.app_settings;
create policy settings_read on public.app_settings for select to authenticated using (true);
drop policy if exists settings_admin on public.app_settings;
create policy settings_admin on public.app_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Profils
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (public.can_view_user(id));
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists profiles_admin on public.profiles;
create policy profiles_admin on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Projets : lecture pour tous (pour rattacher les actions), gestion par managers et direction
drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects for select to authenticated using (true);
drop policy if exists projects_write on public.projects;
create policy projects_write on public.projects for all to authenticated using (public.is_staff_manager()) with check (public.is_staff_manager());
drop policy if exists members_read on public.project_members;
create policy members_read on public.project_members for select to authenticated using (true);
drop policy if exists members_write on public.project_members;
create policy members_write on public.project_members for all to authenticated using (public.is_staff_manager()) with check (public.is_staff_manager());

-- Plannings
drop policy if exists plans_read on public.daily_plans;
create policy plans_read on public.daily_plans for select to authenticated using (public.can_view_user(user_id));
drop policy if exists plans_insert on public.daily_plans;
create policy plans_insert on public.daily_plans for insert to authenticated with check (user_id = auth.uid());
drop policy if exists plans_update on public.daily_plans;
create policy plans_update on public.daily_plans for update to authenticated
  using ((user_id = auth.uid() and status <> 'closed') or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
drop policy if exists plans_delete on public.daily_plans;
create policy plans_delete on public.daily_plans for delete to authenticated using (user_id = auth.uid() and status = 'draft');

-- Actions
drop policy if exists actions_read on public.actions;
create policy actions_read on public.actions for select to authenticated using (public.can_view_user(public.plan_owner(plan_id)));
drop policy if exists actions_insert on public.actions;
create policy actions_insert on public.actions for insert to authenticated with check (
  public.plan_owner(plan_id) = auth.uid()
  and (public.plan_status_of(plan_id) = 'draft' or (is_unplanned and public.plan_status_of(plan_id) = 'submitted'))
);
-- Le planning est figé dès sa soumission : seul l'administrateur peut corriger (avec trace dans l'historique).
drop policy if exists actions_update on public.actions;
create policy actions_update on public.actions for update to authenticated
  using ((public.plan_owner(plan_id) = auth.uid() and public.plan_status_of(plan_id) = 'draft') or public.is_admin())
  with check ((public.plan_owner(plan_id) = auth.uid() and public.plan_status_of(plan_id) = 'draft') or public.is_admin());
drop policy if exists actions_delete on public.actions;
create policy actions_delete on public.actions for delete to authenticated using (
  public.plan_owner(plan_id) = auth.uid()
  and (public.plan_status_of(plan_id) = 'draft' or (is_unplanned and public.plan_status_of(plan_id) = 'submitted'))
);

-- Résultats du bilan
drop policy if exists results_read on public.daily_results;
create policy results_read on public.daily_results for select to authenticated
  using (public.can_view_user(public.plan_owner(public.action_plan(action_id))));
drop policy if exists results_write on public.daily_results;
create policy results_write on public.daily_results for all to authenticated
  using ((public.plan_owner(public.action_plan(action_id)) = auth.uid() and public.plan_status_of(public.action_plan(action_id)) = 'submitted') or public.is_admin())
  with check ((public.plan_owner(public.action_plan(action_id)) = auth.uid() and public.plan_status_of(public.action_plan(action_id)) = 'submitted') or public.is_admin());

-- Pièces jointes
drop policy if exists att_read on public.attachments;
create policy att_read on public.attachments for select to authenticated
  using (public.can_view_user(public.plan_owner(public.result_plan(result_id))));
drop policy if exists att_write on public.attachments;
create policy att_write on public.attachments for all to authenticated
  using ((public.plan_owner(public.result_plan(result_id)) = auth.uid() and public.plan_status_of(public.result_plan(result_id)) = 'submitted') or public.is_admin())
  with check ((public.plan_owner(public.result_plan(result_id)) = auth.uid() and public.plan_status_of(public.result_plan(result_id)) = 'submitted') or public.is_admin());

-- Observations managériales
drop policy if exists obs_read on public.manager_observations;
create policy obs_read on public.manager_observations for select to authenticated using (public.can_view_user(user_id));
drop policy if exists obs_insert on public.manager_observations;
create policy obs_insert on public.manager_observations for insert to authenticated with check (
  author_id = auth.uid() and user_id <> auth.uid() and public.is_staff_manager() and public.can_view_user(user_id)
);

-- Notifications : chacun ne voit que les siennes
drop policy if exists notif_read on public.notifications;
create policy notif_read on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Historique : direction et managers du collaborateur concerné
drop policy if exists audit_read on public.audit_logs;
create policy audit_read on public.audit_logs for select to authenticated
  using (public.is_staff_manager() and owner_id is not null and public.can_view_user(owner_id));

-- ---------- Stockage des fichiers ----------
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('justificatifs', 'justificatifs', false) on conflict (id) do nothing;

drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists avatars_write on storage.objects;
create policy avatars_write on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists proofs_write on storage.objects;
create policy proofs_write on storage.objects for insert to authenticated
  with check (bucket_id = 'justificatifs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists proofs_read on storage.objects;
create policy proofs_read on storage.objects for select to authenticated
  using (bucket_id = 'justificatifs' and public.can_view_user(((storage.foldername(name))[1])::uuid));
drop policy if exists proofs_delete on storage.objects;
create policy proofs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'justificatifs' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Données de référence (modifiables dans Paramètres) ----------
insert into public.categories (name, sort_order) values
  ('Production de contenu', 1), ('Réunion', 2), ('Prospection', 3), ('Création graphique', 4),
  ('Montage vidéo', 5), ('Gestion de projet', 6), ('Suivi client', 7), ('Administration', 8), ('Reporting', 9)
on conflict (name) do nothing;
