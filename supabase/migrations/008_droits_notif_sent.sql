-- =========================================================
--  LE SYSTEME  ·  migration 008  ·  droits sur le carnet
-- =========================================================
--  A passer APRES 007_rappel_du_soir.sql.
--
--  Ce script est SUR : il n'accorde qu'un droit. Aucune table, aucune
--  donnee touchee.
--
--  ---------------------------------------------------------
--  LA MEME ERREUR QUE LA MIGRATION 002, REFAITE.
--
--  Le carnet notif_sent est ecrit par la fonction serveur, sous le role
--  "service_role". On avait suppose que ce role, qui contourne le verrou
--  RLS, pouvait donc ecrire partout. C'est faux, et c'est precisement ce
--  que la migration 002 avait deja etabli pour "authenticated" :
--
--    la RLS dit quelles LIGNES on peut voir ;
--    le grant dit quelle TABLE on a le droit d'ouvrir.
--
--  Contourner la premiere ne donne rien sur la seconde.
--
--  Consequence observee le 31 aout 2026 : l'ecriture au carnet echouait
--  en silence, le carnet restait vide, et le meme rappel repartait a
--  chaque passage de la tache planifiee. Trois appels d'affilee, trois
--  notifications. Corrige ici, et l'erreur est desormais VERIFIEE dans
--  la fonction plutot qu'ignoree : c'est ce silence, plus que le droit
--  manquant, qui rendait le defaut invisible.
--  ---------------------------------------------------------
-- =========================================================

grant select, insert, update, delete on public.notif_sent to service_role;

-- Rien pour "anon" ni pour "authenticated" : l'application n'a toujours
-- aucune raison de toucher a ce carnet.


-- =========================================================
--  Fin de la migration 008.
--  Verification :
--    select has_table_privilege('service_role','public.notif_sent','INSERT');
--  doit renvoyer true.
-- =========================================================
