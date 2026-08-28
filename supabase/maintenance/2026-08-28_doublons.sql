-- =========================================================
--  LE SYSTEME  ·  reparation ponctuelle  ·  28 aout 2026
--  Les 14 habitudes en double
-- =========================================================
--  A NE LANCER QU'UNE FOIS. Ce n'est pas une migration : c'est le
--  nettoyage d'un residu de la mise en place de la synchronisation.
--
--  CE QUI S'EST PASSE
--  Les habitudes de depart creees avant le 28 aout avaient un identifiant
--  tire au hasard. Elles ont maintenant un identifiant fixe ("seed-...").
--  Le premier appareil avait envoye les anciennes dans le cloud ; le
--  second a fabrique les nouvelles : les deux jeux coexistent.
--
--  CE QUE FAIT CE SCRIPT
--  Il marque comme supprimee CHAQUE ancienne habitude qui a une jumelle
--  du meme nom cote "seed-". Rien d'autre. Concretement :
--    - il ne touche a AUCUNE habitude que tu aurais creee toi-meme
--      (elle n'a pas de jumelle, donc elle est ignoree) ;
--    - il ne touche pas aux "seed-..." ;
--    - c'est une suppression DOUCE : la ligne reste en base, elle est
--      juste marquee. Elle disparait de l'app, et rien n'est detruit.
--
--  La clause "returning" a la fin te montre exactement ce qui a ete
--  touche : tu verras la liste des 14 lignes.
-- =========================================================

update public.habits h
set    deleted_at = now(),
       updated_at = now()
where  h.id not like 'seed-%'
  and  h.deleted_at is null
  and  exists (
         select 1
         from   public.habits jumelle
         where  jumelle.user_id = h.user_id
           and  jumelle.id like 'seed-%'
           and  jumelle.name = h.name
       )
returning h.id, h.name, h.section;

-- =========================================================
--  Apres le Run : rouvre l'app et clique "Synchroniser maintenant"
--  dans l'onglet Systeme. Les doublons disparaitront de l'ecran.
-- =========================================================
