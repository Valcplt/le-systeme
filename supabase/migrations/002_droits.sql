-- =========================================================
--  LE SYSTEME  ·  migration 002  ·  droits d'acces
-- =========================================================
--  A coller dans : Supabase > SQL Editor > New query, puis "Run".
--  A passer APRES 001_init.sql.
--
--  Pourquoi ce fichier existe :
--  Les projets Supabase recents sont "fermes par defaut" : une table
--  fraichement creee n'est accessible a PERSONNE tant qu'on ne l'a pas
--  autorise explicitement. La migration 001 a bien pose le verrou RLS
--  (quelle LIGNE chaque personne a le droit de voir), mais il manquait
--  l'autorisation d'entrer dans la piece (quelle TABLE le compte connecte
--  a le droit d'ouvrir). Ce sont deux choses differentes, et il faut
--  les deux.
--
--  Ce script est SUR : aucun DROP, aucun DELETE, aucune donnee touchee.
--  Il peut etre relance autant de fois qu'on veut.
--
--  IMPORTANT : on autorise "authenticated" (les personnes connectees)
--  et surtout PAS "anon" (les visiteurs anonymes). Un visiteur anonyme
--  reste totalement bloque, ce qui a ete verifie.
-- =========================================================

-- Le droit de traverser le couloir.
grant usage on schema public to authenticated;

-- Le droit d'ouvrir chacune des quatre portes.
-- (Le verrou RLS de 001 continue, lui, de filtrer ligne par ligne :
--  meme autorise a ouvrir la table, on ne voit que ses propres lignes.)
grant select, insert, update, delete on public.settings to authenticated;
grant select, insert, update, delete on public.habits   to authenticated;
grant select, insert, update, delete on public.entries  to authenticated;
grant select, insert, update, delete on public.tasks    to authenticated;

-- =========================================================
--  Fin de la migration 002.
--  Attendu : "Success. No rows returned".
-- =========================================================
