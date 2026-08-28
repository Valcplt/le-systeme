-- =========================================================
--  LE SYSTEME  ·  reparation ponctuelle  ·  28 aout 2026
--  Les 14 habitudes en double
-- =========================================================
--  DEJA EXECUTE le 28 aout 2026. Conserve ici comme trace de ce qui a
--  ete fait sur la base, et comme modele si un cas voisin se presentait.
--  Ce n'est PAS une migration : ne pas le rejouer.
--
--  ---------------------------------------------------------
--  CE QUI S'ETAIT PASSE
--  ---------------------------------------------------------
--  Les habitudes de depart creees avant le 28 aout portaient un
--  identifiant tire au hasard ; elles portent depuis un identifiant fixe
--  ("seed-..."). Le navigateur sur localhost avait envoye les anciennes
--  dans le cloud ; valcplt.github.io etant une autre origine, un second
--  jeu a ete fabrique avec les nouveaux identifiants. Les deux ont
--  fusionne : 28 habitudes au lieu de 14.
--
--  ---------------------------------------------------------
--  LE PIEGE QU'IL A FALLU EVITER
--  ---------------------------------------------------------
--  Le premier reflexe - supprimer les anciennes habitudes - aurait detruit
--  sa journee du 28 aout : les 7 saisies (6 validees) etaient rattachees
--  aux ANCIENS identifiants, et les nouvelles habitudes n'avaient aucune
--  donnee. Il faut donc rapatrier les saisies AVANT de retirer quoi que
--  ce soit. Verifie avant execution : 7 saisies a rapatrier, 7 habitudes
--  concernees, 0 conflit de cle, 0 saisie sans jumelle.
--
--  Etat final obtenu : 14 habitudes visibles, 14 retirees (suppression
--  douce), 7 saisies rattachees, 0 orpheline.
-- =========================================================


-- ---------------------------------------------------------
-- 0. Copie de securite, dans un schema que PostgREST n'expose pas.
-- ---------------------------------------------------------
create schema if not exists sauvegarde;
create table if not exists sauvegarde.habits_20260828  as select * from public.habits;
create table if not exists sauvegarde.entries_20260828 as select * from public.entries;
create table if not exists sauvegarde.tasks_20260828   as select * from public.tasks;


-- ---------------------------------------------------------
-- 1. Verification prealable : AUCUNE modification ici.
--    A lire avant de lancer la suite.
-- ---------------------------------------------------------
with paires as (
  select e.user_id, e.day, vieille.name as habitude, neuve.id as nouveau,
         e.day::text || '|' || neuve.id as nouvelle_cle
  from   public.entries e
  join   public.habits vieille
         on vieille.user_id = e.user_id and vieille.id = e.habit_id
        and vieille.id not like 'seed-%'
  join   public.habits neuve
         on neuve.user_id = e.user_id and neuve.id like 'seed-%'
        and neuve.name = vieille.name
)
select (select count(*) from paires) as saisies_a_rapatrier,
       (select count(*) from paires p
        where exists (select 1 from public.entries x
                      where x.user_id = p.user_id and x.id = p.nouvelle_cle)) as conflits;
-- Si "conflits" n'est pas 0, NE PAS continuer : l'etape 2 violerait la
-- cle primaire. Il faudrait alors departager saisie par saisie.


-- ---------------------------------------------------------
-- 2. Rapatrier les saisies vers les habitudes "seed-".
--    La cle primaire des saisies embarque l'identifiant de l'habitude
--    (jour|idHabitude) : il faut donc la reecrire aussi.
-- ---------------------------------------------------------
update public.entries e
set    habit_id   = neuve.id,
       id         = e.day::text || '|' || neuve.id,
       updated_at = now()
from   public.habits vieille,
       public.habits neuve
where  vieille.user_id = e.user_id
  and  vieille.id      = e.habit_id
  and  vieille.id not like 'seed-%'
  and  neuve.user_id   = e.user_id
  and  neuve.id like 'seed-%'
  and  neuve.name      = vieille.name;


-- ---------------------------------------------------------
-- 3. Retirer les anciennes habitudes.
--    Suppression DOUCE : la ligne reste en base, elle est marquee.
--    Ne touche qu'aux habitudes ayant une jumelle du meme nom cote
--    "seed-" : une habitude creee a la main n'a pas de jumelle, donc
--    elle est ignoree.
-- ---------------------------------------------------------
update public.habits h
set    deleted_at = now(),
       updated_at = now()
where  h.id not like 'seed-%'
  and  h.deleted_at is null
  and  exists (select 1 from public.habits jumelle
               where jumelle.user_id = h.user_id
                 and jumelle.id like 'seed-%'
                 and jumelle.name = h.name);


-- ---------------------------------------------------------
-- 4. Durcissement releve au passage par l'analyseur de securite
--    Supabase : sans chemin de recherche fige, quelqu'un capable de
--    creer un schema pourrait detourner ce que "now()" designe.
-- ---------------------------------------------------------
alter function public.touch_synced_at() set search_path = pg_catalog, public;


-- ---------------------------------------------------------
-- 5. Verification finale
-- ---------------------------------------------------------
select (select count(*) from public.habits  where deleted_at is null)          as habitudes_visibles,
       (select count(*) from public.habits  where deleted_at is not null)      as habitudes_retirees,
       (select count(*) from public.entries where habit_id like 'seed-%')      as saisies_rattachees,
       (select count(*) from public.entries where habit_id not like 'seed-%')  as saisies_orphelines;

-- =========================================================
--  Ensuite, dans l'app : onglet Systeme > "Synchroniser maintenant".
-- =========================================================
