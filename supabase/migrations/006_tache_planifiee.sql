-- =========================================================
--  LE SYSTEME  ·  migration 006  ·  le declencheur automatique
-- =========================================================
--  A passer APRES 005_regles_rappels.sql.
--
--  Ce script est SUR : il n'ajoute qu'une tache planifiee. Aucune table,
--  aucune donnee touchee. Le relancer remplace la tache par elle-meme.
--
--  ---------------------------------------------------------
--  ATTENTION, deux choses ne sont PAS dans ce fichier, et c'est
--  volontaire : ce sont des secrets, et ce depot est public.
--
--   1. Le secret partage, range dans le Vault de Supabase sous le nom
--      "cron_secret". Il a ete cree une fois, a la main :
--
--        select vault.create_secret('<le secret>', 'cron_secret',
--               'Autorise la tache planifiee a declencher send-reminders');
--
--   2. Le meme secret, cote fonction, dans Edge Functions > Secrets,
--      sous le nom CRON_SECRET.
--
--  Les deux doivent etre IDENTIQUES : c'est en les comparant que la
--  fonction reconnait un appel legitime de la tache planifiee. S'ils
--  different, ou si l'un manque, les rappels ne partent simplement pas -
--  aucun degat, mais aucun rappel non plus.
--  ---------------------------------------------------------
-- =========================================================


-- ---------------------------------------------------------
-- 1. Les deux extensions du declencheur
-- ---------------------------------------------------------
-- pg_cron donne l'horloge, pg_net la capacite d'appeler une adresse web
-- depuis la base. Aucune des deux n'etait installee avant aujourd'hui.

create extension if not exists pg_cron;
create extension if not exists pg_net;


-- ---------------------------------------------------------
-- 2. La tache
-- ---------------------------------------------------------
-- Toutes les 15 minutes, sans exception. Ce n'est pas une frequence de
-- rappel : c'est une frequence de VERIFICATION. Ce sont les heures
-- choisies par la personne, et le carnet notif_sent, qui decident si
-- quelque chose part vraiment.
--
-- Pourquoi 15 minutes tient debout :
--   - la fenetre de 90 minutes (migration 005) tolere jusqu'a cinq
--     passages manques d'affilee sans perdre le rappel du jour ;
--   - le carnet garantit qu'un rappel deja envoye ne repart pas ;
--   - cela represente environ 2 900 appels par mois, contre 500 000
--     inclus dans le plan gratuit.

select cron.schedule(
  'rappels-le-systeme',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := 'https://qttezrkjtnwigcvumokc.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $job$
);


-- =========================================================
--  Fin de la migration 006.
--
--  Pour verifier que la tache tourne :
--    select jobname, schedule, active from cron.job;
--
--  Pour voir ses derniers passages et ce qu'ils ont donne :
--    select status, start_time, return_message
--    from cron.job_run_details order by start_time desc limit 10;
--
--  Pour l'arreter, si besoin un jour :
--    select cron.unschedule('rappels-le-systeme');
-- =========================================================
