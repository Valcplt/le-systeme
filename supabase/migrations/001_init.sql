-- =========================================================
--  LE SYSTEME  ·  migration 001  ·  creation initiale
-- =========================================================
--  A coller une seule fois dans : Supabase > SQL Editor > New query
--  puis cliquer "Run".
--
--  Ce script est SUR :
--    - il ne contient aucun DROP TABLE, aucun TRUNCATE, aucun DELETE ;
--    - il peut etre relance plusieurs fois sans rien casser
--      (tout est "create ... if not exists") ;
--    - il verrouille chaque ligne au compte qui l'a ecrite (RLS),
--      donc personne d'autre ne peut lire tes donnees.
--
--  Les migrations suivantes seront 002_..., 003_..., toujours ADDITIVES :
--  on ajoute des colonnes, on n'en enleve jamais.
-- =========================================================


-- ---------------------------------------------------------
-- 1. Les tables
-- ---------------------------------------------------------
-- Note sur les identifiants : ce sont des textes, pas des uuid.
-- Ils sont fabriques par l'application elle-meme, sur l'appareil,
-- pour qu'une habitude cochee hors ligne garde le meme identifiant
-- une fois remontee ici.

create table if not exists public.settings (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  daily_goal  integer     not null default 85,
  updated_at  timestamptz not null default now(),   -- horloge de l'appareil
  synced_at   timestamptz not null default now()    -- horloge du serveur
);

create table if not exists public.habits (
  user_id       uuid        not null references auth.users (id) on delete cascade,
  id            text        not null,
  name          text        not null default '',
  section       text        not null default 'day',   -- morning | day | evening
  type          text        not null default 'binary',-- binary | duration | time
  goal          numeric,                              -- minutes
  goal_weekend  numeric,                              -- minutes, null = pareil
  unit          text,                                 -- min | h (affichage)
  step          numeric,
  days          integer[]   not null default '{1,2,3,4,5,6,7}',
  active        boolean     not null default true,
  position      integer     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,                          -- suppression douce
  synced_at     timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.entries (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  id          text        not null,                   -- "AAAA-MM-JJ|idHabitude"
  day         date        not null,
  habit_id    text        not null,
  done        boolean     not null default false,
  value       numeric,
  plus_day    boolean     not null default false,
  updated_at  timestamptz not null default now(),
  synced_at   timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.tasks (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  id          text        not null,
  text        text        not null default '',
  day         date,                                   -- null = "en vrac"
  done        boolean     not null default false,
  position    integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,                            -- suppression douce
  synced_at   timestamptz not null default now(),
  primary key (user_id, id)
);


-- ---------------------------------------------------------
-- 1 bis. Reparation : si ces tables existaient deja (un essai precedent
-- interrompu, un copier-coller coupe en route), on complete les colonnes
-- qui manqueraient encore. "create table if not exists" ne modifie jamais
-- une table deja presente : c'est ce bloc qui rattrape le coup, sans
-- jamais rien supprimer.
-- ---------------------------------------------------------
alter table public.settings
  add column if not exists daily_goal integer     not null default 85,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists synced_at  timestamptz not null default now();

alter table public.habits
  add column if not exists name         text        not null default '',
  add column if not exists section      text        not null default 'day',
  add column if not exists type         text        not null default 'binary',
  add column if not exists goal         numeric,
  add column if not exists goal_weekend numeric,
  add column if not exists unit         text,
  add column if not exists step         numeric,
  add column if not exists days         integer[]   not null default '{1,2,3,4,5,6,7}',
  add column if not exists active       boolean     not null default true,
  add column if not exists position     integer     not null default 0,
  add column if not exists created_at   timestamptz not null default now(),
  add column if not exists updated_at   timestamptz not null default now(),
  add column if not exists deleted_at   timestamptz,
  add column if not exists synced_at    timestamptz not null default now();

alter table public.entries
  add column if not exists day        date        not null default current_date,
  add column if not exists habit_id   text        not null default '',
  add column if not exists done       boolean     not null default false,
  add column if not exists value      numeric,
  add column if not exists plus_day   boolean     not null default false,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists synced_at  timestamptz not null default now();

alter table public.tasks
  add column if not exists text       text        not null default '',
  add column if not exists day        date,
  add column if not exists done       boolean     not null default false,
  add column if not exists position   integer     not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz,
  add column if not exists synced_at  timestamptz not null default now();


-- ---------------------------------------------------------
-- 2. L'horodatage serveur
-- ---------------------------------------------------------
-- synced_at est pose par le serveur, jamais par l'appareil. C'est lui qui
-- sert de repere pour "qu'est-ce qui a change depuis ma derniere visite ?",
-- ce qui evite tout probleme si l'horloge du telephone et celle du PC ne
-- sont pas parfaitement d'accord.

create or replace function public.touch_synced_at()
returns trigger
language plpgsql
as $$
begin
  new.synced_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['settings', 'habits', 'entries', 'tasks'] loop
    if not exists (
      select 1 from pg_trigger
      where tgname = 'trg_touch_' || t
        and tgrelid = ('public.' || t)::regclass
    ) then
      execute format(
        'create trigger trg_touch_%1$s before insert or update on public.%1$s
         for each row execute function public.touch_synced_at()', t);
    end if;
  end loop;
end $$;


-- ---------------------------------------------------------
-- 3. Les index de synchronisation
-- ---------------------------------------------------------
create index if not exists idx_habits_sync  on public.habits  (user_id, synced_at);
create index if not exists idx_entries_sync on public.entries (user_id, synced_at);
create index if not exists idx_tasks_sync   on public.tasks   (user_id, synced_at);
create index if not exists idx_entries_day  on public.entries (user_id, day);


-- ---------------------------------------------------------
-- 4. Le verrou : Row Level Security
-- ---------------------------------------------------------
-- Sans ceci, la cle publique de l'application donnerait acces a tout.
-- Avec ceci, chaque requete est automatiquement limitee aux lignes dont
-- user_id est celui de la personne connectee. C'est le coeur de la
-- securite du projet : ne jamais desactiver.

alter table public.settings enable row level security;
alter table public.habits   enable row level security;
alter table public.entries  enable row level security;
alter table public.tasks    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['settings', 'habits', 'entries', 'tasks'] loop
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


-- =========================================================
--  Fin de la migration 001.
--  Pour verifier que tout s'est bien passe :
--    Table Editor > tu dois voir settings, habits, entries, tasks,
--    chacune avec le petit cadenas vert "RLS enabled".
-- =========================================================
