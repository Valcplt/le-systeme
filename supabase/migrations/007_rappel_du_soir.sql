-- =========================================================
--  LE SYSTEME  ·  migration 007  ·  le rappel du soir vise le SOIR
-- =========================================================
--  A passer APRES 006_tache_planifiee.sql.
--
--  Ce script est SUR : il remplace une fonction de lecture par une
--  autre. Aucune table, aucune donnee touchee.
--
--  ---------------------------------------------------------
--  POURQUOI ce changement, demande par Valentin le 31 aout 2026 :
--
--  La regle d'origine declenchait le rappel du soir si RIEN n'avait ete
--  coche de toute la journee. Elle ratait sa cible : cocher une seule
--  case le matin suffisait a desarmer le rappel, alors que la soiree
--  pouvait rester entierement vide. Or c'est precisement le moment ou
--  le rappel sert.
--
--  Nouvelle regle : le rappel part si rien n'a ete coche dans le bloc
--  SOIR. Ce qui a ete fait le matin ou dans la journee n'entre pas en
--  ligne de compte.
--  ---------------------------------------------------------
-- =========================================================

create or replace function public.rappels_a_envoyer()
returns table (
  p_user_id   uuid,
  p_kind      text,
  p_jour      date,
  p_endpoint  text,
  p_p256dh    text,
  p_auth      text,
  p_nb_taches bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with moment as (
    select distinct on (ps.user_id)
      ps.user_id,
      (now() at time zone ps.tz)::date as jour,
      (extract(hour   from (now() at time zone ps.tz))::int * 60
     + extract(minute from (now() at time zone ps.tz))::int) as minute_locale
    from push_subscriptions ps
    order by ps.user_id, ps.created_at desc
  ),
  actifs as (
    select m.user_id, m.jour, m.minute_locale,
           s.remind_tasks_at, s.remind_fill_at
    from moment m
    join settings s on s.user_id = m.user_id
    where s.notif_enabled
  ),
  du as (
    -- Rappel des taches du jour : inchange.
    select a.user_id, 'tasks'::text as kind, a.jour,
           (select count(*) from tasks t
              where t.user_id = a.user_id and t.day = a.jour
                and not t.done and t.deleted_at is null) as nb
    from actifs a
    where a.minute_locale >= a.remind_tasks_at
      and a.minute_locale <  a.remind_tasks_at + 90

    union all

    -- Rappel du soir : rien de coche dans le bloc SOIR.
    select a.user_id, 'fill'::text, a.jour, 0::bigint
    from actifs a
    where a.minute_locale >= a.remind_fill_at
      and a.minute_locale <  a.remind_fill_at + 90

      -- 1. Encore faut-il qu'une habitude du soir soit prevue ce jour-la.
      --    Sans cette condition, quelqu'un qui n'a aucune habitude du
      --    soir recevrait le rappel tous les soirs, indefiniment.
      --    On reprend ici les criteres de countsOn() (CLAUDE.md §6) :
      --    active, non supprimee, le bon jour de semaine, et pas
      --    anterieure a sa creation. C'est le SEUL endroit du serveur qui
      --    reprend une regle de l'application - si countsOn change un
      --    jour, cette fonction est a revoir avec.
      and exists (
        select 1 from habits h
        where h.user_id = a.user_id
          and h.section = 'evening'
          and h.active
          and h.deleted_at is null
          and extract(isodow from a.jour)::int = any (h.days)
          and h.created_at::date <= a.jour
      )

      -- 2. Et que rien n'y ait ete coche.
      and not exists (
        select 1 from entries e
        join habits h2
          on h2.user_id = e.user_id and h2.id = e.habit_id
        where e.user_id = a.user_id
          and e.day = a.jour
          and h2.section = 'evening'
          and (e.done or e.value is not null)
      )
  ),
  retenus as (
    select d.* from du d
    where (d.kind <> 'tasks' or d.nb > 0)
      and not exists (
        select 1 from notif_sent ns
        where ns.user_id = d.user_id and ns.day = d.jour and ns.kind = d.kind
      )
  )
  select r.user_id, r.kind, r.jour, ps.endpoint, ps.p256dh, ps.auth, r.nb
  from retenus r
  join push_subscriptions ps on ps.user_id = r.user_id;
$$;

-- Les droits sont a reposer : "create or replace" remet la fonction a
-- l'etat par defaut, c'est-a-dire executable par tout le monde.
revoke all on function public.rappels_a_envoyer() from public;
revoke all on function public.rappels_a_envoyer() from anon;
revoke all on function public.rappels_a_envoyer() from authenticated;
grant execute on function public.rappels_a_envoyer() to service_role;

-- Un index pour la nouvelle question, qui joint saisies et habitudes.
create index if not exists idx_habits_section
  on public.habits (user_id, section)
  where deleted_at is null;


-- =========================================================
--  Fin de la migration 007.
--  Attendu : "Success. No rows returned".
-- =========================================================
