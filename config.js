/* =========================================================
   LE SYSTEME - config.js
   L'adresse de ton coffre-fort Supabase.
   ---------------------------------------------------------
   Tant que ces deux lignes sont vides, l'application fonctionne
   normalement, mais uniquement sur cet appareil (pas de synchro).
   Rien ne casse : c'est juste le mode "hors ligne".

   La cle ci-dessous est la cle PUBLIQUE (dite "anon"). Elle est
   faite pour etre visible dans le code d'une page web : seule, elle
   ne donne acces a rien, parce que chaque ligne de la base est
   verrouillee au compte connecte (voir supabase/migrations/001_init.sql).

   Ne JAMAIS mettre ici la cle "service_role" : celle-la ouvre tout.
   ========================================================= */

window.SUPABASE_CONFIG = {
  url: 'https://qttezrkjtnwigcvumokc.supabase.co',
  anonKey: 'sb_publishable_YR_GofxwR1DZUDTz_iBcCQ_PjolNI5B',

  /* La cle PUBLIQUE des rappels (dite VAPID). Comme celle du dessus,
     elle est faite pour etre lue par tout le monde : elle sert au
     telephone a verifier que le rappel vient bien de cette app, et ne
     permet a elle seule d'envoyer quoi que ce soit.
     Sa jumelle privee, elle, ne doit JAMAIS entrer dans ce fichier ni
     dans Git : elle vit dans les secrets de la fonction serveur. */
  vapidPublicKey: 'BPhMx93NEDiPneDNQyQcIk6M8glyzcqIIvSlJS9ruqPm6g1uoLuMDk2utOxTHfZ-9ZeYJdEDKSPFegiL2qDlBHU'
};
