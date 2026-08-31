-- =========================================================
--  LE SYSTEME  ·  migration 004  ·  les reglages des rappels
-- =========================================================
--  A passer APRES 003_notifications.sql.
--
--  Ce script est SUR :
--    - aucun DROP, aucun TRUNCATE, aucun DELETE ;
--    - il n'AJOUTE que des colonnes, avec une valeur par defaut ;
--    - les lignes deja presentes recoivent cette valeur par defaut,
--      aucune donnee existante n'est relue ni reecrite ;
--    - il peut etre relance autant de fois qu'on veut.
--
--  C'est le pendant, cote serveur, du passage du schema local en
--  version 2 (SCHEMA_VERSION dans js/store.js).
-- =========================================================


-- ---------------------------------------------------------
-- 1. Les trois reglages
-- ---------------------------------------------------------
-- Ils vivent dans "settings" et non dans "push_subscriptions", et ce
-- n'est pas un detail : ce sont des choix de la PERSONNE, pas de
-- l'appareil. Regler 21 h sur le PC doit valoir aussi pour le telephone.
-- Ce qui est propre a l'appareil (etre abonne ou non, dans quel fuseau)
-- reste dans push_subscriptions.
--
-- Les heures sont stockees en MINUTES DEPUIS MINUIT, comme les habitudes
-- de type "heure" le font deja cote application. Une seule convention
-- dans tout le projet, pas deux.

alter table public.settings
  add column if not exists notif_enabled   boolean not null default true,
  add column if not exists remind_tasks_at integer not null default 720,   -- 12:00
  add column if not exists remind_fill_at  integer not null default 1260;  -- 21:00


-- ---------------------------------------------------------
-- 2. L'index qui sert a la fonction d'envoi
-- ---------------------------------------------------------
-- La tache planifiee demande, tous les quarts d'heure : "a-t-il coche
-- quelque chose aujourd'hui ?". Sans index, cette question relirait
-- toutes les saisies de tout le monde a chaque passage.
-- (Un index sur (user_id, day) existe deja depuis la migration 001 ;
--  celui-ci ne garde que les lignes reellement renseignees, ce sont les
--  seules que la question regarde.)

create index if not exists idx_entries_renseignees
  on public.entries (user_id, day)
  where done = true or value is not null;


-- =========================================================
--  Fin de la migration 004.
--  Attendu : "Success. No rows returned".
-- =========================================================
