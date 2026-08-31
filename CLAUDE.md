# Le Système — fiche du projet

Application personnelle de suivi d'habitudes quotidiennes. Elle remplace un
tableur Excel puis un artefact Claude. Objectif de l'utilisateur : cocher sa
journée en moins d'une minute, sur son téléphone, et voir sa progression.

---

## 1. À qui tu parles

**L'utilisateur n'est pas développeur.** C'est la contrainte la plus
importante de ce projet.

- Écris et parle **en français simple**, sans jargon. Pas de « refactor »,
  « build », « state », « commit » lâchés sans explication.
- Ne lui demande **jamais** de taper une commande sans lui dire exactement
  où cliquer et ce qui va se passer.
- Il sait très bien ce qu'il veut fonctionnellement — ses écrans viennent
  d'un système qu'il utilise depuis longtemps. Ne « simplifie » pas ses
  fonctionnalités de ta propre initiative.
- Quand tu proposes un choix, donne une recommandation, pas un catalogue.

## 2. Règles d'or — à ne jamais enfreindre

Sa demande explicite : **modifier l'app plus tard ne doit jamais effacer ses
données.** Les six garde-fous ci-dessous existent pour ça.

1. **Code et données séparés.** Le code vit dans ces fichiers. Les données
   vivent dans `localStorage` (et plus tard dans Supabase). Mettre l'app à
   jour = remplacer des fichiers de code, jamais toucher aux données.
2. **Changements de structure additifs uniquement.** Jamais de `DROP`,
   jamais de `TRUNCATE`, jamais de renommage d'un champ existant. On ajoute
   un nouveau champ avec une valeur par défaut, dans `migrate()`
   (`js/store.js`) et dans un nouveau fichier `supabase/migrations/00N_*.sql`.
3. **Suppression douce.** Une habitude ou une tâche supprimée est marquée
   `deletedAt`, jamais retirée du tableau. C'est ce qui garde les
   statistiques passées justes.
4. **Version des données.** `SCHEMA_VERSION` dans `js/store.js`.
   `migrate()` fait monter les anciennes données ; des données écrites par
   une version plus récente sont laissées intactes, jamais rétrogradées.
5. **L'export est le filet.** Onglet Système → « Exporter ma sauvegarde ».
   Avant toute modification structurelle, demande-lui d'exporter. Deux
   modes d'import existent, et ce n'est pas un hasard : « Fusionner »
   (garde la version la plus récente, ne supprime jamais) pour rapatrier
   ce qui manque, « Tout remplacer » (`restoreData()` / `undoRestore()`
   dans `js/store.js`) pour revenir en arrière après une fausse manœuvre
   — celui-ci met l'état actuel de côté avant d'écraser, avec un bouton
   « Annuler la restauration » juste après.
6. **Vider un cache ne touche jamais aux données.** `sw.js` ne met en
   cache que le code (voir étape 3, §9) — vérifié en le détruisant
   entièrement pendant que des données de test étaient en place.

**Procédure standard pour toute modification :**
> exporter la sauvegarde → modifier le code → ajouter une migration
> additive si nécessaire → tester → publier → vérifier que l'historique
> est intact.

## 3. Contraintes de la machine

Revérifié le 30 août 2026 sur son PC Windows 11 :

| Outil | État |
|---|---|
| Git | installé (2.55.0) |
| Node.js / npm | **installés** (v24.20.0 / 11.19.0). Ils étaient absents le 28 août, la fiche l'affirmait encore à tort |
| Python | **absent** (le `python.exe` trouvé est le raccourci Microsoft Store, non fonctionnel) |
| GitHub CLI (`gh`) | installé (2.98.0), **dans le `PATH`**, appelable par son nom. Compte `Valcplt` authentifié |
| ffmpeg | installé (9.0.1), utile pour l'optimisation des médias |

Conséquences, **non négociables** :

- **Aucune étape de compilation.** Pas de bundler, pas de TypeScript, pas
  de React. HTML + CSS + JavaScript ordinaires.
  Attention : cette règle ne tient plus à l'absence de Node, qui est
  désormais installé. C'est devenu un **choix de conception**, et il reste
  le bon : l'app doit pouvoir s'ouvrir en double-cliquant `index.html`,
  ce qu'une étape de build casserait. Ne pas revenir dessus sans lui en
  parler, mais ne plus invoquer « Node est absent » comme raison.
- **Pas de `<script type="module">`.** Les modules ES sont bloqués par le
  navigateur sur un fichier ouvert en `file://` : l'app doit rester
  ouvrable en double-cliquant `index.html`. Scripts classiques, un objet
  global `App`, chargés dans l'ordre défini par `index.html`.
- **Aucune dépendance externe** en dehors du client Supabase (étape 2),
  chargé depuis un CDN.
- **Pour tester en local**, un petit serveur PowerShell existe :
  `.claude/launch.json` → `preview_start` avec le nom `le-systeme`
  (port 8123). Il sert simplement les fichiers du dossier.
  Le script est `.claude/serve.ps1`. Il détermine sa racine tout seul
  (`$PSScriptRoot`), donc déplacer le dossier ne le casse pas — ne pas le
  remplacer par un chemin absolu écrit en dur, c'est ce qui l'avait cassé
  une première fois. Attention : `.claude/` est ignoré par Git (voir
  `.gitignore`), le script ne suit donc pas le dépôt. Sur une nouvelle
  machine, il est à recréer, ou n'importe quel serveur statique fait
  l'affaire.

## 4. Architecture

L'app est **locale d'abord** : cocher écrit immédiatement dans l'appareil ;
la synchro cloud viendra par-dessus, en arrière-plan.

| Fichier | Rôle |
|---|---|
| `index.html` | La coquille : barre du haut, 4 sections de vue, barre d'onglets du bas |
| `styles.css` | Toute l'apparence. Mobile d'abord, bascule PC à `min-width:768px` |
| `js/store.js` | **Le cerveau** : données, dates, calcul du score, export/import. Aucune manipulation du DOM |
| `js/ui-today.js` | Onglet Aujourd'hui |
| `js/ui-tasks.js` | Onglet Tâches (glisser-déposer souris + doigt via Pointer Events) |
| `js/ui-progress.js` | Onglet Progression (graphique SVG écrit à la main, calendrier, régularité) |
| `js/ui-system.js` | Onglet Système (objectif, éditeur d'habitude, sauvegardes) |
| `js/sync.js` | Connexion par lien magique + synchro Supabase. En `async/await`, comme `notif.js` |
| `js/notif.js` | Les rappels : permission, abonnement, désabonnement (voir §8 bis) |
| `config.js` | URL + clé publique Supabase. Vides = mode local pur, l'app marche quand même |
| `js/app.js` | Outils communs (`App.ui.el`, modale, toast), onglets, démarrage. **Chargé en dernier** |
| `sw.js` | Mode hors ligne : ne met en cache QUE le code (voir règle d'or n°6, §9) |
| `manifest.webmanifest` | Nom, icône, plein écran — pour « Ajouter à l'écran d'accueil » |
| `icons/` | `icon.svg` (source) + PNG générés (192, 512, apple-touch) |

Conventions :

- Un seul objet global : `App`. `App.store`, `App.ui`, `App.views.*`,
  `App.render()`, `App.go(onglet)`.
- Le rendu est **complet et bête** : chaque changement de données appelle
  `App.render()`, qui reconstruit l'onglet visible. Pas de rendu
  incrémental — l'app est trop petite pour que ça vaille la complexité.
- Les vues ne modifient jamais `App.store.state` directement : elles
  passent par les fonctions de `store.js`.
- Les champs de saisie écoutent `change` et non `input`, sinon le rendu
  complet couperait la frappe.

## 5. Le modèle de données

Une seule clé `localStorage` : `lesysteme.data`.

```
{
  schemaVersion: 2,
  settings: {
    dailyGoal: 85,
    notifEnabled: true,     // rappels automatiques, pour TOUS ses appareils
    remindTasksAt: 720,     // 12:00, en minutes depuis minuit
    remindFillAt: 1260,     // 21:00
    updatedAt
  },
  habits: [ {
    id, name, section: 'morning'|'day'|'evening',
    type: 'binary'|'duration'|'time',
    goal,            // durée : en MINUTES · heure : minutes depuis minuit
    goalWeekend,     // null = même objectif toute la semaine
    unit: 'min'|'h', // affichage seulement ; on stocke toujours des minutes
    step,            // pas des boutons − / +
    days: [1..7],    // 1 = lundi … 7 = dimanche (ISO)
    active, position, createdAt, updatedAt, deletedAt
  } ],
  entries: { "AAAA-MM-JJ|idHabitude": { date, habitId, done, value, plusDay, updatedAt } },
  tasks: [ { id, text, date|null, done, position, createdAt, updatedAt, deletedAt } ],
  meta: { createdAt }
}
```

`entries` est volontairement un dictionnaire à clé plate `date|habitId` :
chaque entrée correspondra à **une ligne** dans Supabase, ce qui rendra la
synchro triviale (dernière modification gagnante, ligne par ligne).

## 6. La règle du score — ne pas la changer sans lui demander

```
Score du jour = habitudes validées ÷ habitudes qui comptent ce jour-là
```

Une habitude **compte** un jour donné si, et seulement si :
- elle est `active`, et non supprimée ;
- le jour de la semaine figure dans `days` ;
- la date est **postérieure ou égale à sa création** — c'est ce qui
  empêche une habitude ajoutée aujourd'hui de faire baisser les scores
  du mois dernier.

Une habitude est **validée** :
- `binary` → `done === true`
- `duration` → `value >= goal`
- `time` → `value <= goal` (avec `+1440` si `plusDay`, c'est-à-dire couché
  après minuit)

Autres règles :
- Les **tâches ne comptent pas** dans le score.
- Une journée est **renseignée** dès qu'une saisie existe pour elle.
- Les **moyennes** ne portent que sur les jours renseignés : un jour non
  rempli n'est pas un zéro.
- La **série** compte les jours consécutifs à `>= dailyGoal` en remontant.
  Si aujourd'hui n'est pas encore rempli, on part d'hier : une journée en
  cours ne casse pas la série.

*Vérification :* avec les habitudes de départ, un jeudi, 10 habitudes
comptent ; en validant Douche froide, Sommeil, Deep Work, No FAP, Tracking
et Coucher, on obtient 6/10 = 60 %. C'est exactement ce que donnait son
ancien artefact.

## 7. Comment tester

Pas de tests automatisés (pas de Node). On teste à la main, dans cet ordre :

1. `preview_start` avec le nom `le-systeme`, puis `http://localhost:8123/`.
2. **Aujourd'hui** : cocher / décocher une habitude ; saisir une durée et
   vérifier que la pastille passe au vert au-dessus de l'objectif ; saisir
   une heure ; `+1j` ; naviguer d'un jour à l'autre ; vérifier le
   « X / Y validées ».
3. **Tâches** : ajouter à la volée ; glisser du vrac vers un jour, à la
   souris **et au doigt** ; le bouton `⋯` ; changer de semaine ; masquer
   puis supprimer les tâches faites.
4. **Progression** : les 4 cases, la série, les 4 périodes, la courbe, le
   calendrier, la régularité.
5. **Système** : régler l'objectif ; créer, modifier, monter/descendre,
   désactiver, supprimer une habitude ; exporter puis réimporter.
6. **Le test qui compte** : exporter, supprimer une habitude, réimporter
   en mode « Tout remplacer » → l'habitude doit revenir, et les scores
   passés être identiques.
7. Tester en largeur téléphone (375 px) **et** PC (≥ 1200 px).

## 8. La synchronisation (étape 2, faite)

Projet Supabase `qttezrkjtnwigcvumokc`. Quatre tables qui reprennent le
modèle local à l'identique : `settings`, `habits`, `entries`, `tasks`.

**Deux façons de se connecter, et l'ordre compte :**
1. **Email + mot de passe** — proposé en premier, c'est le chemin normal.
   N'envoie **aucun email**, donc ne peut jamais laisser dehors.
2. **Lien magique** — accessible en un clic, pour un appareil qui n'a pas
   encore de mot de passe.

Pourquoi : le SMTP par défaut de Supabase est bridé à ~2 emails/heure
(c'est un service de démonstration). Il a été bloqué dessus en connectant
son 3ᵉ appareil. Pour une app qu'on ouvre tous les matins, dépendre de sa
boîte mail est une fragilité inacceptable. Ne pas revenir en arrière
là-dessus sans lui en parler.
Si le lien magique devait redevenir central, brancher un vrai SMTP
(Resend) dans Supabase → Authentication → SMTP Settings.

`friendlyError()` dans `js/sync.js` traduit les messages de Supabase :
les laisser en anglais devant lui n'aurait aucun sens.

Principes à respecter :

- **Local d'abord.** Cocher écrit dans `localStorage` immédiatement ;
  `sync.js` repasse derrière. Réseau coupé ou `config.js` vide : l'app
  fonctionne pareil, sur un seul appareil.
- **Deux horloges, deux rôles.** `updated_at` vient de l'appareil et sert
  à départager les conflits (la modification la plus récente gagne, ligne
  par ligne). `synced_at` est posé par un *trigger* Postgres et sert de
  repère « qu'est-ce qui a changé depuis ma dernière visite ». Les deux
  horloges n'ont donc pas besoin d'être d'accord.
- **Identifiants de départ fixes** (`seed-sommeil`, `seed-coucher`…).
  Deux appareils fraîchement installés fabriquent les mêmes habitudes :
  sans ça, brancher le second créerait 14 doublons.
- **Deux verrous distincts, il faut les deux :** la RLS (migration 001)
  dit *quelles lignes* on peut voir ; les `GRANT` (migration 002) disent
  *quelles tables* on peut ouvrir. Les projets Supabase récents sont
  fermés par défaut, d'où la 002. `anon` n'a aucun droit — vérifié :
  lecture et écriture anonymes refusées sur les 4 tables.
- Le fuseau : `rowToX()` normalise les dates via `new Date(v).toISOString()`,
  sinon comparer `…+00:00` (Postgres) et `…Z` (navigateur) sous forme de
  texte donnerait un résultat faux.

Les migrations vivent dans `supabase/migrations/`, numérotées, additives.
Les réparations ponctuelles (non rejouables) vont dans
`supabase/maintenance/`, datées.

**Accès direct :** le connecteur Supabase (MCP) est branché sur le projet
`qttezrkjtnwigcvumokc` — inutile de lui faire faire des copier-coller
dans le SQL Editor. Lancer `get_advisors` après chaque changement de
structure : c'est lui qui a signalé le `search_path` non figé de
`touch_synced_at` (corrigé).

Un schéma `sauvegarde` contient des copies datées des tables, prises
avant les réparations. PostgREST n'expose que `public` : ces copies ne
sont donc atteignables par personne depuis l'app.

## 8 bis. Les rappels par notification (étape 4, en cours)

**Pourquoi une pièce serveur.** Une page web ne s'exécute que lorsqu'elle
est ouverte. Un rappel qui ne partirait que pendant qu'il regarde l'app ne
servirait à rien : c'est justement quand il ne la regarde pas qu'il faut la
lui rappeler. D'où une fonction hébergée chez Supabase, la seule partie du
projet qui ne tourne pas dans le navigateur.

La chaîne, de bout en bout :

```
pg_cron (toutes les 15 min, palier 3)
  -> pg_net appelle la fonction "send-reminders"
     -> elle signe l'envoi avec la clé VAPID privée
        -> Google / Apple / Mozilla livrent au téléphone
           -> sw.js affiche la notification
```

**Les clés VAPID.** Une paire, générée une fois. La **publique** vit dans
`config.js`, elle est faite pour être lue. La **privée** vit UNIQUEMENT
dans les secrets Supabase (Settings → Edge Functions), jamais dans le code
ni dans Git. Trois secrets sont posés : `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.

**Migration 003** : `push_subscriptions` (un appareil abonné = une ligne)
et `notif_sent` (le carnet anti-doublon, dont la clé primaire
`user_id + day + kind` porte toute la garantie). Mêmes verrous que les
quatre tables d'origine. `notif_sent` n'est volontairement PAS accessible
au rôle `authenticated` : seul le serveur y écrit.

**Les deux rappels, et rien d'autre :**

| Type | Quand | Condition |
|---|---|---|
| `tasks` | heure choisie (12:00 par défaut) | il reste des tâches non faites datées d'aujourd'hui |
| `fill` | heure choisie (21:00 par défaut) | **rien** n'a été coché de la journée |

Les heures vivent dans `settings`, donc elles suivent la personne d'un
appareil à l'autre. Ce qui est propre à l'appareil (être abonné, dans quel
fuseau) vit dans `push_subscriptions`. Deux portées, deux endroits.

**Trois garde-fous, à ne pas retirer :**

1. **L'heure est celle de la personne**, pas celle du serveur. Le fuseau
   retenu est celui de son abonnement le plus récent.
2. **Une fenêtre de 90 minutes.** Activer les rappels à 23 h ne doit pas
   déclencher d'un coup celui de midi. Elle tolère aussi cinq passages
   manqués d'affilée sans perdre le rappel du jour.
3. **Le carnet `notif_sent`.** Sa clé primaire `user_id + day + kind`
   porte toute la garantie : la tâche repassant tous les quarts d'heure,
   sans lui un rappel partirait quatre fois par heure jusqu'à minuit.
   Il n'est rempli **que si l'envoi a réussi** : sinon le passage suivant
   réessaie.

**Où vit quoi :**

- `rappels_a_envoyer()` (migration 005) répond à « qui reçoit quoi
  maintenant ». Toute la règle est là, en un seul tenant. En
  `security definer` avec `search_path` figé, exécutable par le seul
  `service_role` : elle voit les données de tout le monde.
- La fonction `send-reminders` ne fait que livrer. Elle a **deux
  portes** : le jeton d'une personne (envoi de test, vers ses appareils
  seulement) ou le secret partagé (le vrai tour). Sans l'un ni l'autre,
  401. C'est pourquoi `verify_jwt` est à `false` : elle fait
  elle-même le tri, ce qu'un contrôle unique ne saurait pas faire.
- `pg_cron` (migration 006) appelle toutes les 15 minutes, en lisant le
  secret dans le Vault.

**Le secret partagé existe en DEUX exemplaires**, qui doivent être
identiques : dans le Vault sous `cron_secret`, et dans les secrets
d'Edge Function sous `CRON_SECRET`. Ni l'un ni l'autre n'est dans Git.
S'ils diffèrent, les rappels ne partent pas, sans autre dégât.

Choix assumés, à ne pas défaire sans lui en parler :

- **Pas de score dans les rappels.** Dire « tu es hors des rails »
  obligerait à réécrire la règle du score (§6) en SQL, donc à la maintenir
  en deux endroits. Les rappels s'en tiennent à des faits simples : la
  journée est-elle cochée, reste-t-il des tâches.
- **La permission part d'un bouton**, jamais du démarrage. Une demande qui
  surgit à l'ouverture est refusée par réflexe, et le navigateur ne la
  represente plus jamais.
- **iPhone : écrit, jamais testé.** Le code Web Push est un standard,
  identique partout. Apple pose une condition de plus : l'app doit être sur
  l'écran d'accueil, sinon les notifications n'existent pas dans l'onglet.
  C'est détecté (`ios-home-screen`) pour afficher la marche à suivre.
  Faute d'iPhone sous la main, ce chemin n'a jamais été vérifié : ne pas
  l'affirmer.

**Le piège rencontré, à retenir :** un envoi peut être accepté par Google
(`last_ok_at` renseigné, `fail_count` à zéro) et pourtant ne rien
afficher, simplement parce que **Windows n'autorise pas les notifications de
Chrome**. Avant de soupçonner le code, couper la chaîne en deux avec, dans
la console : `navigator.serviceWorker.ready.then(r => r.showNotification('test'))`.
Si cette bulle n'apparaît pas, le problème est dans le système, pas dans
l'app.

## 9. Publier une mise à jour (étape 3, faite)

**En ligne à :** https://valcplt.github.io/le-systeme/
**Dépôt :** https://github.com/Valcplt/le-systeme (public, branche `main`)

`gh` est installé **et dans le `PATH`** : l'appeler simplement par `gh`.
Compte `Valcplt` authentifié, scopes `gist`, `read:org`, `repo`,
`workflow`. Le chemin complet `C:\Program Files\GitHub CLI\gh.exe` reste
un recours si une session hérite d'un environnement périmé.

**La recette, dans l'ordre :**

1. Lui faire **exporter sa sauvegarde** (onglet Système) si le changement
   touche à la structure des données.
2. Modifier le code. Migration additive dans `supabase/migrations/` si
   besoin — c'est lui qui la colle dans le SQL Editor.
3. **Incrémenter `VERSION` dans `sw.js`** (`'v1'` → `'v2'`…). Sans ça, son
   téléphone continuera de servir l'ancien code depuis son cache.
4. Tester en local (`preview_start` avec le nom `le-systeme`).
5. `git add -A && git commit && git push`.
6. GitHub Pages reconstruit en 1-2 min. Vérifier avec
   `gh api repos/Valcplt/le-systeme/pages` → `"status":"built"`.
7. **Vérifier que son historique est intact** — c'est la promesse du
   projet, elle se vérifie à chaque fois, pas une fois pour toutes.

**Réglages Supabase liés à l'adresse** (Authentication → URL
Configuration) : `Site URL` et `Redirect URLs` doivent contenir
`https://valcplt.github.io/le-systeme/`, sinon le lien magique ne sait
pas où revenir. `http://localhost:8123` y reste pour les tests.

Le code est public, les données ne le sont pas : elles vivent dans
Supabase, verrouillées ligne par ligne au compte connecté. Vérifié :
lecture et écriture anonymes refusées sur les 4 tables.

## 10. Journal

- **31 août 2026 — les rappels, et l'app rendue partageable.**
  *Rappels, les trois paliers.* Chaîne d'envoi vérifiée sur son PC **puis
  sur son Android** : migrations 003 à 006, fonction `send-reminders`,
  `js/notif.js`, écouteurs `push` et `notificationclick` dans
  `sw.js`, carte « rappels » dans l'onglet Système, tâche `pg_cron`
  toutes les 15 minutes. Service worker en `v5`. Détail complet en §8 bis.
  **Le schéma des données est passé en version 2**, premier usage réel du
  mécanisme de migration prévu à la création. La migration ne touche pas à
  `settings.updatedAt` : le faire ferait croire à la synchronisation que
  ces réglages viennent d'être choisis sur cet appareil, et ils
  écraseraient ceux d'un autre.
  *Multi-utilisateur.* Les deux défauts qui empêchaient de donner le lien à
  quelqu'un sont corrigés (voir §11). L'app n'est pas encore ouverte aux
  inconnus, c'était le choix : solidifier d'abord.
  *Fait notable :* des tests écrits en Node (jetables, hors dépôt) ont
  attrapé un défaut d'archivage avant qu'il n'atteigne l'app. Node étant
  désormais installé, l'affirmation « pas de tests automatisés » du §7 n'est
  plus une fatalité : un test jetable qui charge `store.js` dans un faux
  navigateur coûte quelques minutes et vérifie la règle du score.
- **28 août 2026 — étape 1.** Application complète en local : 4 onglets,
  calcul du score, export / import / restauration, données de départ
  reprenant ses 14 habitudes réelles. Testée à la souris et au format
  téléphone. Reste à faire : Supabase (étape 2), mise en ligne + PWA
  (étape 3), notice (étape 4).
- **28 août 2026 — étape 2.** Synchronisation en place. Migrations 001
  (tables + triggers + RLS) et 002 (`GRANT` au rôle `authenticated`, que
  les projets Supabase récents ne donnent plus tout seuls) passées.
  Connexion par lien magique vérifiée sur son PC : « À jour », email
  affiché. Identifiants des habitudes de départ figés (`seed-*`) pour
  éviter les doublons au branchement du 2ᵉ appareil. Reste à faire :
  mise en ligne + PWA (étape 3), notice (étape 4).
- **28 août 2026 — étape 3.** En ligne sur GitHub Pages, installable sur
  l'écran d'accueil, fonctionne hors ligne (17 fichiers en cache).
  Icônes PNG générées avec System.Drawing en PowerShell (pas de Node pour
  faire ça — le script est jetable, la logique tient en 60 lignes).
  **Règle d'or n°6 vérifiée pour de vrai :** cache du code entièrement
  détruit + service worker désinscrit → au rechargement, score, tâche et
  objectif intacts. Reste à faire : la notice (étape 4).
- **28 août 2026 — deux incidents après la mise en ligne.**
  1. *14 habitudes en double.* Son navigateur sur `localhost` avait
     fabriqué les habitudes de départ **avant** le passage aux
     identifiants fixes, et les avait envoyées dans le cloud.
     `valcplt.github.io` étant une autre origine, un second jeu a été
     créé avec les identifiants `seed-*` : les deux ont fusionné.
     Réparé par `supabase/maintenance/2026-08-28_doublons.sql`
     (suppression douce des seules habitudes ayant une jumelle du même
     nom côté `seed-`). Résiduel de transition : ne peut plus se
     reproduire. **Piège évité de justesse :** ses 7 saisies du 28 août
     (6 validées) étaient rattachées aux ANCIENS identifiants, les
     nouvelles habitudes n'ayant aucune donnée. Les supprimer sans
     précaution aurait effacé sa journée. Les saisies ont donc été
     rapatriées vers les jumelles `seed-` **avant** le retrait, après
     copie de sécurité dans le schéma `sauvegarde` (que PostgREST
     n'expose pas) et vérification qu'aucune clé n'entrait en conflit.
     *Réflexe à garder : avant tout nettoyage, regarder ce qui pend au
     bout de ce qu'on s'apprête à retirer.*
     Faille voisine corrigée dans la foulée : les habitudes de départ
     portent maintenant `updatedAt = 1970`, pour toujours perdre face à
     la version du cloud.
  2. *« Email rate limit exceeded »* au 3ᵉ appareil → ajout de la
     connexion par mot de passe (voir §8).
  **Leçon pour les prochaines fois :** en développement, le service
  worker sert l'ancien code depuis son cache et fait croire qu'une
  modification n'a pas pris. Avant de conclure quoi que ce soit d'un
  test, désinscrire le service worker et vider les caches.

## 11. Explicitement remis à plus tard (V2)

- L'import de son ancien fichier Excel (il a choisi de repartir de zéro).
- **Le rappel « hors des rails »**, qui supposerait de porter la règle du
  score en SQL. Écarté sciemment le 31 août 2026, voir §8 bis.
- **Le multi-utilisateur.** Décidé le 28 août 2026 : on finit l'app pour
  son usage seul, quitte à y revenir. Ce qui est **déjà bon** : côté
  cloud, chaque compte est étanche (RLS + `user_id`), un proche qui se
  connecte repart avec ses propres données, sans une ligne de code à
  changer. Ce qui **manque** avant d'ouvrir à d'autres, par ordre
  d'importance :
  1. ~~*Deux personnes sur le même appareil.*~~ **Corrigé le 31 août 2026.**
     `guardAccountChange()` dans `js/sync.js` retient le dernier
     `user.id` de l'appareil (`lesysteme.lastUserId`) ; s'il change,
     `resetForNewUser()` archive `lesysteme.data` sous
     `lesysteme.data.archive.<id>.<date>` et repart d'un état vide
     **avant** la première synchro. Sans quoi `recordsSince('')` aurait
     envoyé tout l'historique du précédent dans le compte du nouveau venu.
     *Détail qui compte :* l'archive copie l'état EN MÉMOIRE, pas
     `localStorage`. `save()` différant l'écriture de 120 ms, archiver
     le disque perdrait la dernière coche. Une première version le faisait,
     un test l'a rattrapé.
  2. ~~Les 14 habitudes de départ sont les siennes.~~ **Corrigé le 31 août
     2026.** `emptyState()` ne pose plus aucune habitude ; un écran
     d'accueil (`welcome()` dans `js/ui-today.js`) propose de partir du
     modèle (`seedFromTemplate()`) ou de zéro. Sans conséquence pour lui :
     ses habitudes reviennent du cloud à la connexion.
  3. Lui rappeler que, propriétaire du projet Supabase, il peut voir les
     données de tous depuis le tableau de bord. La RLS protège les
     utilisateurs entre eux, pas du propriétaire.
  4. Avant d'ouvrir à des inconnus : l'inscription autonome bute sur le
     service d'emails de Supabase, bridé à ~2 envois/heure. Deux voies, à
     trancher le moment venu : brancher un vrai service d'envoi (Resend),
     ou désactiver la confirmation d'email pour l'inscription par mot de
     passe. Penser aussi à activer la détection des mots de passe
     compromis, que `get_advisors` signale comme désactivée.
- **La notice.** Décidé le 28 août 2026 : pas de `NOTICE.md` séparé — ça
  n'a de sens que le jour où l'app s'ouvre à d'autres personnes (voir
  point ci-dessus). À ce moment-là, en faire un **guide intégré à
  l'app** (écran d'accueil pour un nouveau compte, ou aide contextuelle
  en cas de blocage), pas un fichier à côté que personne n'ouvre.
