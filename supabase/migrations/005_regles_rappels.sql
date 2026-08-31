-- =========================================================
--  LE SYSTEME  ·  migration 005  ·  qui doit recevoir quoi
-- =========================================================
--  A passer APRES 004_reglages_rappels.sql.
--
--  Ce script est SUR : il ne cree qu'une FONCTION DE LECTURE.
--  Elle ne fait que des "select" : elle ne peut, par construction,
--  modifier aucune donnee.
--
--  Pourquoi une fonction SQL plutot que du code dans la fonction
--  serveur : la question "qui doit recevoir un rappel maintenant ?"
--  est une question de base de donnees. La poser en SQL demande une
--  seule requete la ou du code en demanderait des dizaines, et la regle
--  se lit d'un seul tenant au lieu d'etre eparpillee.
-- =========================================================


-- ---------------------------------------------------------
--  La regle, en toutes lettres
-- ---------------------------------------------------------
--  Deux rappels, et RIEN QUE des faits verifiables. Aucun score n'est
--  calcule ici : ce serait dupliquer la regle du score de l'application
--  (CLAUDE.md §6), donc s'exposer a ce que les deux divergent un jour.
--
--   'tasks' : a l'heure choisie, s'il reste des taches non faites
--             datees d'aujourd'hui.
--   'fill'  : a l'heure choisie, si RIEN n'a ete coche de la journee.
--
--  Trois garde-fous :
--   1. l'heure est celle de la PERSONNE (fuseau de son appareil), pas
--      celle du serveur ;
--   2. une fenetre de 90 minutes : activer les rappels a 23 h ne doit
--      pas declencher d'un coup celui de midi ;
--   3. rien qui figure deja dans notif_sent pour ce jour et ce type.

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
-- search_path fige : leçon de la migration 001, get_advisors l'avait
-- signale sur touch_synced_at. Sans cela, la fonction pourrait etre
-- detournee vers d'autres tables du meme nom.
set search_path = public, pg_temp
as $$
  with moment as (
    -- Le fuseau retenu pour une personne est celui de son abonnement le
    -- plus recent : c'est l'appareil qu'elle vient de brancher, donc
    -- celui ou elle se trouve.
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
    -- Rappel des taches du jour
    select a.user_id, 'tasks'::text as kind, a.jour,
           (select count(*) from tasks t
              where t.user_id = a.user_id and t.day = a.jour
                and not t.done and t.deleted_at is null) as nb
    from actifs a
    where a.minute_locale >= a.remind_tasks_at
      and a.minute_locale <  a.remind_tasks_at + 90

    union all

    -- Rappel : la journee n'est pas cochee
    select a.user_id, 'fill'::text, a.jour, 0::bigint
    from actifs a
    where a.minute_locale >= a.remind_fill_at
      and a.minute_locale <  a.remind_fill_at + 90
      and not exists (
        select 1 from entries e
        where e.user_id = a.user_id and e.day = a.jour
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
  -- Une ligne par appareil : le rappel part sur tous ceux de la personne.
  select r.user_id, r.kind, r.jour, ps.endpoint, ps.p256dh, ps.auth, r.nb
  from retenus r
  join push_subscriptions ps on ps.user_id = r.user_id;
$$;


-- ---------------------------------------------------------
--  Qui a le droit de poser la question
-- ---------------------------------------------------------
-- Personne, sauf le serveur. Cette fonction est en "security definer" :
-- elle voit les donnees de tout le monde. La laisser ouverte au role
-- "authenticated" reviendrait a offrir a n'importe quel compte connecte
-- la liste des appareils de tous les autres.

revoke all on function public.rappels_a_envoyer() from public;
revoke all on function public.rappels_a_envoyer() from anon;
revoke all on function public.rappels_a_envoyer() from authenticated;
grant execute on function public.rappels_a_envoyer() to service_role;


-- =========================================================
--  Fin de la migration 005.
--  Attendu : "Success. No rows returned".
-- =========================================================
