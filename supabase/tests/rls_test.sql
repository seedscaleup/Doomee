-- Tests des permissions (RLS) de DOOMEE. Exécuter sur une base vide après stub_supabase.sql + schema.sql.
-- Voir supabase/tests/run.sh. Chaque vérification affiche PASS ou fait échouer le script.
\set ON_ERROR_STOP on
\set QUIET on
grant all on all tables in schema public to authenticated;
grant all on all tables in schema storage to authenticated;
grant execute on all functions in schema public to authenticated;

create or replace function public.t_expect(label text, actual bigint, expected bigint) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FAIL: % (obtenu %, attendu %)', label, actual, expected; end if;
  raise notice 'PASS: %', label;
end $$;

-- Exécute une instruction qui DOIT être refusée (erreur ou 0 ligne affectée)
create or replace function public.t_denied(label text, stmt text) returns void language plpgsql as $$
declare n bigint;
begin
  begin
    execute stmt;
    get diagnostics n = row_count;
    if n > 0 then raise exception 'FAIL: % (autorisé, % ligne(s))', label, n; end if;
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  raise notice 'PASS: %', label;
end $$;

-- Identifiants fixes
\set admin   '''00000000-0000-0000-0000-0000000000a1'''
\set direc   '''00000000-0000-0000-0000-0000000000d1'''
\set mgr     '''00000000-0000-0000-0000-0000000000b1'''
\set c1      '''00000000-0000-0000-0000-0000000000c1'''
\set c2      '''00000000-0000-0000-0000-0000000000c2'''
\set c3      '''00000000-0000-0000-0000-0000000000c3'''

insert into auth.users (id, email) values (:admin, 'admin@t.io');   -- le premier compte devient admin
insert into auth.users (id, email) values (:direc, 'dir@t.io'), (:mgr, 'mgr@t.io'), (:c1, 'c1@t.io'), (:c2, 'c2@t.io'), (:c3, 'c3@t.io');
select public.t_expect('premier compte = admin', count(*), 1) from public.profiles where id = :admin and role = 'admin';
select public.t_expect('comptes suivants = collaborateur', count(*), 5) from public.profiles where id <> :admin and role = 'collaborateur';

-- Configuration par l'admin (postgres contourne la RLS comme le service_role)
insert into public.departments (id, name) values ('10000000-0000-0000-0000-000000000001', 'Création'), ('10000000-0000-0000-0000-000000000002', 'Business');
update public.profiles set role = 'direction' where id = :direc;
update public.profiles set role = 'manager', department_id = '10000000-0000-0000-0000-000000000001' where id = :mgr;
update public.profiles set department_id = '10000000-0000-0000-0000-000000000001' where id in (:c1, :c2);
update public.profiles set department_id = '10000000-0000-0000-0000-000000000002' where id = :c3;
update public.departments set manager_id = :mgr where id = '10000000-0000-0000-0000-000000000001';

-- Plans (créés par le service pour préparer C2 et C3)
insert into public.daily_plans (id, user_id, plan_date, status) values
  ('20000000-0000-0000-0000-000000000002', :c2, current_date, 'submitted'),
  ('20000000-0000-0000-0000-000000000003', :c3, current_date, 'submitted');
insert into public.actions (id, plan_id, title) values
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Action de C2'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 'Action de C3');

-- ================= COLLABORATEUR C1 =================
select set_config('request.jwt.claim.sub', :c1, false);
set role authenticated;

select public.t_expect('C1 voit uniquement son profil', count(*), 1) from public.profiles;
select public.t_expect('C1 ne voit pas les plannings des autres', count(*), 0) from public.daily_plans;
select public.t_expect('C1 ne voit pas les actions des autres', count(*), 0) from public.actions;
select public.t_denied('C1 ne peut pas créer un planning pour C2', format($q$insert into public.daily_plans (user_id, plan_date) values (%L, current_date + 1)$q$, :c2));
update public.profiles set role = 'admin' where id = :c1;
select public.t_expect('C1 ne peut pas se promouvoir admin (trigger)', count(*), 1) from public.profiles where id = :c1 and role = 'collaborateur';
update public.profiles set bio = 'Salut', department_id = '10000000-0000-0000-0000-000000000002', job_title = 'CEO' where id = :c1;
select public.t_expect('C1 ne change ni département ni fonction (trigger)', count(*), 1) from public.profiles where id = :c1 and department_id = '10000000-0000-0000-0000-000000000001' and job_title is null and bio = 'Salut';

insert into public.daily_plans (id, user_id, plan_date, status) values ('20000000-0000-0000-0000-000000000001', :c1, current_date, 'draft');
insert into public.actions (id, plan_id, title, estimated_minutes) values
  ('30000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000001', 'A1', 60),
  ('30000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000001', 'A2', 30);
select public.t_denied('C1 ne peut pas ajouter d''action au planning de C2', $q$insert into public.actions (plan_id, title) values ('20000000-0000-0000-0000-000000000002', 'intrus')$q$);
select public.t_denied('C1 ne peut pas créer de résultat avant la soumission du planning', $q$insert into public.daily_results (action_id, status) values ('30000000-0000-0000-0000-000000000011', 'done')$q$);
update public.daily_plans set status = 'submitted', submitted_at = now() where id = '20000000-0000-0000-0000-000000000001';
select public.t_denied('C1 ne peut plus modifier une action après soumission du planning', $q$update public.actions set title = 'modifié' where id = '30000000-0000-0000-0000-000000000011'$q$);
insert into public.actions (id, plan_id, title, is_unplanned) values ('30000000-0000-0000-0000-000000000013', '20000000-0000-0000-0000-000000000001', 'Imprévue', true);
select public.t_denied('C1 ne peut pas ajouter une action non marquée imprévue après soumission', $q$insert into public.actions (plan_id, title) values ('20000000-0000-0000-0000-000000000001', 'fraude')$q$);

select public.t_denied('C1 ne peut pas rouvrir son planning soumis', $q$update public.daily_plans set status = 'draft' where id = '20000000-0000-0000-0000-000000000001'$q$);
select public.t_denied('C1 ne peut pas clôturer un bilan sans résultats complets', $q$update public.daily_plans set status = 'closed' where id = '20000000-0000-0000-0000-000000000001'$q$);

-- Justification obligatoire
select public.t_denied('Action partielle sans justification refusée (base)', $q$insert into public.daily_results (action_id, status) values ('30000000-0000-0000-0000-000000000011', 'partial')$q$);
select public.t_denied('Action non réalisée avec justification vide refusée', $q$insert into public.daily_results (action_id, status, justification) values ('30000000-0000-0000-0000-000000000011', 'not_done', '   ')$q$);
insert into public.daily_results (action_id, status, actual_minutes) values ('30000000-0000-0000-0000-000000000011', 'done', 70);
insert into public.daily_results (action_id, status, justification) values ('30000000-0000-0000-0000-000000000012', 'partial', 'Client absent');
insert into public.daily_results (action_id, status, actual_minutes) values ('30000000-0000-0000-0000-000000000013', 'done', 15);
update public.daily_plans set status = 'closed', closed_at = now() where id = '20000000-0000-0000-0000-000000000001';
select public.t_expect('Bilan clôturé : 3 résultats enregistrés', count(*), 3) from public.daily_results;
select public.t_denied('C1 ne peut plus modifier un résultat après bilan', $q$update public.daily_results set status = 'not_done', justification = 'x' where action_id = '30000000-0000-0000-0000-000000000011'$q$);
select public.t_denied('C1 ne peut plus rouvrir son bilan', $q$update public.daily_plans set status = 'submitted' where id = '20000000-0000-0000-0000-000000000001'$q$);
select public.t_denied('C1 ne peut pas supprimer un résultat clôturé', $q$delete from public.daily_results where action_id = '30000000-0000-0000-0000-000000000011'$q$);
select public.t_denied('C1 ne peut pas lire l''historique des modifications', 'select 1 from public.audit_logs where false');
select public.t_expect('C1 ne voit aucune ligne d''audit', count(*), 0) from public.audit_logs;
select public.t_denied('C1 ne peut pas écrire d''observation managériale', format($q$insert into public.manager_observations (user_id, body) values (%L, 'test')$q$, :c2));
select public.t_denied('C1 ne peut pas utiliser send_reminder', format($q$select public.send_reminder(%L)$q$, :c2));
select public.t_denied('C1 ne peut pas créer de département', $q$insert into public.departments (name) values ('Pirate')$q$);
select public.t_denied('C1 ne peut pas créer de projet', $q$insert into public.projects (name) values ('Pirate')$q$);
select public.t_denied('C1 ne peut pas changer les paramètres', $q$update public.app_settings set timezone = 'UTC'$q$);
reset role;

-- ================= MANAGER =================
select set_config('request.jwt.claim.sub', :mgr, false);
set role authenticated;
select public.t_expect('Manager voit ses collaborateurs (C1, C2) et lui-même', count(*), 3) from public.profiles;
select public.t_expect('Manager ne voit pas le département Business (C3)', count(*), 0) from public.profiles where id = :c3;
select public.t_expect('Manager voit les plannings de C1 et C2 seulement', count(*), 2) from public.daily_plans;
select public.t_expect('Manager voit les résultats de C1', count(*), 3) from public.daily_results;
insert into public.manager_observations (user_id, body) values (:c1, 'Bon travail, attention aux délais.');
select public.t_denied('Manager ne peut pas observer un collaborateur hors périmètre', format($q$insert into public.manager_observations (user_id, body) values (%L, 'hors périmètre')$q$, :c3));
select public.t_denied('Manager ne peut pas se noter lui-même', format($q$insert into public.manager_observations (user_id, body) values (%L, 'auto')$q$, :mgr));
select public.send_reminder(:c2);
select public.t_denied('Manager ne peut pas relancer hors périmètre', format($q$select public.send_reminder(%L)$q$, :c3));
select public.t_denied('Manager ne peut pas modifier un résultat', $q$update public.daily_results set status = 'done' where action_id = '30000000-0000-0000-0000-000000000012'$q$);
select public.t_denied('Manager ne peut pas changer un rôle', format($q$update public.profiles set role = 'admin' where id = %L$q$, :c1));
select public.t_expect('Manager ne lit pas les notifications d''autrui', count(*), 0) from public.notifications where user_id <> auth.uid();
reset role;

-- ================= COLLABORATEUR C1 : notifications & observations =================
select set_config('request.jwt.claim.sub', :c1, false);
set role authenticated;
select public.t_expect('C1 voit l''observation reçue', count(*), 1) from public.manager_observations;
select public.t_expect('C1 reçoit la notification d''observation', count(*), 1) from public.notifications where type = 'observation';
reset role;
select set_config('request.jwt.claim.sub', :c2, false);
set role authenticated;
select public.t_expect('C2 reçoit la relance, pas les notifications de C1', count(*), 1) from public.notifications;
select public.t_expect('C2 ne voit pas l''observation de C1', count(*), 0) from public.manager_observations;
reset role;

-- Le manager a été notifié du bilan de C1
select public.t_expect('Manager notifié du bilan soumis', count(*), 1) from public.notifications where user_id = :mgr and type = 'report';

-- ================= DIRECTION =================
select set_config('request.jwt.claim.sub', :direc, false);
set role authenticated;
select public.t_expect('Direction voit tous les profils', count(*), 6) from public.profiles;
select public.t_expect('Direction voit tous les plannings', count(*), 3) from public.daily_plans;
select public.t_denied('Direction ne peut pas modifier un profil', format($q$update public.profiles set role = 'admin' where id = %L$q$, :c1));
select public.t_denied('Direction ne peut pas modifier un résultat', $q$update public.daily_results set status = 'done' where action_id = '30000000-0000-0000-0000-000000000012'$q$);
reset role;

-- ================= ADMIN : correction après soumission + audit =================
select set_config('request.jwt.claim.sub', :admin, false);
set role authenticated;
update public.daily_results set status = 'done', justification = 'Corrigé par admin' where action_id = '30000000-0000-0000-0000-000000000012';
select public.t_expect('Admin a corrigé le résultat', count(*), 1) from public.daily_results where action_id = '30000000-0000-0000-0000-000000000012' and status = 'done';
select public.t_expect('Correction tracée dans l''historique', count(*), 1) from public.audit_logs where entity_type = 'daily_results' and owner_id = :c1 and user_id = :admin;
update public.profiles set role = 'manager' where id = :c3;
select public.t_expect('Admin peut changer un rôle', count(*), 1) from public.profiles where id = :c3 and role = 'manager';
reset role;

-- ================= Stockage =================
select set_config('request.jwt.claim.sub', :c1, false);
set role authenticated;
insert into storage.objects (bucket_id, name) values ('justificatifs', :c1 || '/preuve.png');
select public.t_denied('C1 ne peut pas déposer un fichier dans le dossier de C2', format($q$insert into storage.objects (bucket_id, name) values ('justificatifs', %L)$q$, :c2 || '/intrus.png'));
reset role;
select set_config('request.jwt.claim.sub', :c2, false);
set role authenticated;
select public.t_expect('C2 ne peut pas lire les justificatifs de C1', count(*), 0) from storage.objects where bucket_id = 'justificatifs';
reset role;
select set_config('request.jwt.claim.sub', :mgr, false);
set role authenticated;
select public.t_expect('Manager lit les justificatifs de son équipe', count(*), 1) from storage.objects where bucket_id = 'justificatifs';
reset role;
