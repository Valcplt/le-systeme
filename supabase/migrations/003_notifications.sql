-- =========================================================
--  LE SYSTEME  ·  migration 003  ·  les rappels par notification
-- =========================================================
--  A passer APRES 001_init.sql et 002_droits.sql.
--
--  Ce script est SUR :
--    - aucun DROP, aucun TRUNCATE, aucun DELETE ;
--    - il ne touche a AUCUNE des quatre tables existantes ;
--    - il peut etre relance autant de fois qu'on veut.
--
--  Ce qu'il ajoute : de quoi envoyer un rappel sur un telephone, meme
--  quand l'application est fermee. Deux tables, et rien d'autre.
-- =========================================================


-- ---------------------------------------------------------
-- 1. Les telephones abonnes aux rappels
-- ---------------------------------------------------------
-- Quand quelqu'un accepte les notifications, son navigateur fabrique une
-- adresse de livraison (endpoint) chez Google, Apple ou Mozilla, plus deux
-- cles qui servent a chiffrer le message. Sans ces trois elements, un
-- rappel ne peut pas etre remis. C'est le navigateur qui les fournit,
-- nous ne faisons que les ranger.
--
-- Une ligne = un appareil. La meme personne sur son telephone et son PC
-- aura donc deux lignes, et recevra le rappel sur les deux.

create table if not exists public.push_subscriptions (
  user_id      uuid        not null references auth.users (id) on delete cascade,
  endpoint     text        not null,                  -- l'adresse de livraison
  p256dh       text        not null,                  -- cle publique de l'appareil
  auth         text        not null,                  -- secret d'authentification
  tz           text        not null default 'Europe/Paris',  -- pour que "21h" veuille dire 21h chez lui
  device_label text,                                  -- "Android · Chrome", pour s'y retrouver
  created_at   timestamptz not null default now(),
  last_ok_at   timestamptz,                           -- dernier envoi reussi
  fail_count   integer     not null default 0,        -- echecs consecutifs
  primary key (user_id, endpoint)
);

-- Rattrapage si la table existait deja d'un essai precedent.
alter table public.push_subscriptions
  add column if not exists p256dh       text,
  add column if not exists auth         text,
  add column if not exists tz           text        not null default 'Europe/Paris',
  add column if not exists device_label text,
  add column if not exists created_at   timestamptz not null default now(),
  add column if not exists last_ok_at   timestamptz,
  add column if not exists fail_count   integer     not null default 0;


-- ---------------------------------------------------------
-- 2. Le carnet des rappels deja envoyes
-- ---------------------------------------------------------
-- La tache planifiee repasse tous les quarts d'heure. Sans ce carnet,
-- elle renverrait le meme rappel a chaque passage : quatre notifications
-- par heure jusqu'a minuit. Une ligne ici veut dire "c'est fait, on n'y
-- revient pas aujourd'hui".
--
-- La cle primaire porte tout le travail : une seule ligne possible par
-- personne, par jour et par type de rappel. Ce n'est pas une precaution,
-- c'est la garantie.

create table if not exists public.notif_sent (
  user_id  uuid        not null references auth.users (id) on delete cascade,
  day      date        not null,                      -- le jour LOCAL de la personne
  kind     text        not null,                      -- 'tasks' | 'fill'
  sent_at  timestamptz not null default now(),
  primary key (user_id, day, kind)
);

-- Le carnet n'a pas vocation a grossir indefiniment : un index sur la
-- date permettra d'y faire le menage plus tard, sans ralentir le reste.
create index if not exists idx_notif_sent_day on public.notif_sent (day);


-- ---------------------------------------------------------
-- 3. Le verrou, comme pour les quatre autres tables
-- ---------------------------------------------------------
-- Rappel de la migration 002 : il faut DEUX autorisations distinctes.
-- La RLS dit quelles LIGNES on peut voir ; le grant dit quelle TABLE on
-- a le droit d'ouvrir. L'une sans l'autre ne sert a rien.

alter table public.push_subscriptions enable row level security;
alter table public.notif_sent         enable row level security;

do $$
declare t text;
begin
  foreach t in array array['push_subscriptions', 'notif_sent'] loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'proprietaire'
    ) then
      execute format(
        'create policy "proprietaire" on public.%I
           for all
           to authenticated
           using (auth.uid() = user_id)
           with check (auth.uid() = user_id)', t);
    end if;
  end loop;
end $$;

-- L'application a besoin de gerer les abonnements de l'appareil courant.
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Le carnet des envois, lui, n'est ecrit QUE par le serveur. L'application
-- n'a aucune raison d'y toucher : on ne lui en donne pas le droit. Un
-- droit qu'on ne donne pas est un droit qu'on n'a pas a surveiller.
-- (La fonction d'envoi passe par le role de service, qui ignore la RLS.)

-- Et surtout, rien pour "anon" : un visiteur non connecte reste dehors,
-- exactement comme sur les quatre tables d'origine.


-- =========================================================
--  Fin de la migration 003.
--  Attendu : "Success. No rows returned".
--  Verification : Table Editor > push_subscriptions et notif_sent
--  apparaissent, chacune avec le cadenas vert "RLS enabled".
-- =========================================================
