/* =========================================================
   LE SYSTEME - le guide

   Trois choses, dans un seul fichier parce qu'elles disent la meme :
     1. l'accueil guide du tout premier lancement (5 ecrans) ;
     2. la carte de premiere visite, en haut de chaque onglet ;
     3. la page "Comment ca marche", consultable a tout moment.

   OU VIT L'AVANCEMENT : dans une cle localStorage a part,
   "lesysteme.guide". Volontairement PAS dans settings, qui est
   synchronise : y ajouter un champ imposerait un SCHEMA_VERSION 3 et
   une migration pour quelque chose de purement cosmetique, avec le
   risque qu'un appareil ecrase l'autre. Un guide est propre a l'ecran
   sur lequel on apprend. Meme raisonnement que "deux portees, deux
   endroits" (CLAUDE.md, section 8 bis).

   CE FICHIER NE TOUCHE JAMAIS AUX DONNEES en direct : il passe par
   store.js, comme toutes les autres vues.

   ATTENTION, TEXTE ET REGLES : la page d'aide recopie en francais des
   regles qui vivent ailleurs (le score, section 6 de CLAUDE.md ; les
   conditions des rappels, section 8 bis). Si une regle change, elle
   change ICI AUSSI.
   ========================================================= */

App.guide = (function () {
  'use strict';

  var S = App.store;
  function U() { return App.ui; }

  var KEY = 'lesysteme.guide';
  var TOTAL = 5;

  var etat = { version: 1, done: false, seenTabs: {} };
  var etape = 0;            // 0 = pas dans le guide, 1..5 = ecran affiche
  var modeCompte = 'menu';  // menu | creer | connexion
  var msgCompte = '';       // erreur affichee sous le formulaire du compte

  // ---------------------------------------------------------
  // Memoire de l'avancement
  // ---------------------------------------------------------
  function lire() {
    try {
      var brut = localStorage.getItem(KEY);
      if (!brut) return;
      var o = JSON.parse(brut);
      if (o && typeof o === 'object') {
        etat.done = !!o.done;
        etat.seenTabs = (o.seenTabs && typeof o.seenTabs === 'object') ? o.seenTabs : {};
      }
    } catch (e) { /* stockage indisponible : le guide s'affichera, sans plus */ }
  }
  function ecrire() {
    try { localStorage.setItem(KEY, JSON.stringify(etat)); } catch (e) { }
  }

  /* Au demarrage, on decide UNE fois si le guide s'ouvre.
     Il ne s'ouvre que sur une installation reellement vierge. Quelqu'un
     qui utilise deja l'app - Valentin le premier - ne doit pas voir sa
     mise a jour se couvrir de didacticiel : on marque tout comme vu, en
     silence. La page d'aide, elle, reste accessible dans Systeme. */
  function init() {
    lire();
    if (etat.done) return;

    var vierge = !S.state.habits.length && S.isPristine();
    var appareilDejaServi = false;
    try { appareilDejaServi = !!localStorage.getItem('lesysteme.lastUserId'); } catch (e) { }

    if (!vierge || appareilDejaServi) {
      etat.done = true;
      etat.seenTabs = { today: 1, tasks: 1, progress: 1, system: 1 };
      ecrire();
      return;
    }
    etape = 1;
  }

  function actif() { return etape > 0; }

  function aller(n) {
    etape = n;
    modeCompte = 'menu'; msgCompte = '';
    window.scrollTo(0, 0);
    App.render();
  }

  function terminer() {
    etape = 0;
    etat.done = true;
    /* L'onglet Aujourd'hui vient d'etre explique par les ecrans 1 et 3 :
       enchainer sur sa carte de premiere visite serait redondant. Les
       trois autres onglets, eux, n'ont pas encore ete vus. */
    etat.seenTabs.today = 1;
    ecrire();
    App.go('today');
  }

  /* Relancer le guide depuis l'onglet Systeme. On ne touche a rien :
     les habitudes deja creees restent, et l'ecran 2 le voit. */
  function revoir() {
    etape = 1;
    modeCompte = 'menu'; msgCompte = '';
    App.go('today');
  }

  // ---------------------------------------------------------
  // Habillage commun des cinq ecrans
  // ---------------------------------------------------------
  function entete() {
    var el = U().el;
    return el('div', { class: 'guide-head' }, [
      el('button', {
        class: 'icon-btn', 'aria-label': 'Ecran precedent', text: '‹',
        disabled: etape <= 1,
        onclick: function () { if (etape > 1) aller(etape - 1); }
      }),
      el('div', { class: 'guide-steps' }, [1, 2, 3, 4, 5].map(function (n) {
        return el('span', { class: 'gs' + (n === etape ? ' on' : (n < etape ? ' past' : '')) });
      })),
      el('button', {
        class: 'guide-skip', text: 'Passer',
        onclick: function () {
          U().confirmBox('Passer le guide ?',
            'Tu peux le relancer quand tu veux depuis l’onglet Système, section « aide ».',
            'Passer', terminer);
        }
      })
    ]);
  }

  function ecran(titre, chapo, corps) {
    var el = U().el;
    return el('div', { class: 'guide' }, [
      entete(),
      el('div', { class: 'card guide-card' }, [
        el('div', { class: 'guide-num', text: 'étape ' + etape + ' sur ' + TOTAL }),
        el('h2', { class: 'guide-t', text: titre }),
        chapo ? el('p', { class: 'guide-p', text: chapo }) : null,
        corps
      ].filter(Boolean))
    ]);
  }

  function suivant(libelle, action) {
    return U().el('button', {
      class: 'btn btn-gold btn-block', style: 'margin-top:18px',
      text: libelle || 'Continuer',
      onclick: action || function () { aller(etape + 1); }
    });
  }
  function plusTard(libelle) {
    return U().el('button', {
      class: 'btn btn-sm btn-block', style: 'margin-top:8px',
      text: libelle || 'Plus tard',
      onclick: function () { aller(etape + 1); }
    });
  }
  function ligne(titre, texte) {
    var el = U().el;
    return el('div', { class: 'guide-line' }, [
      el('b', { text: titre }),
      el('span', { text: texte })
    ]);
  }

  // ---------------------------------------------------------
  // Ecran 1 - ce qu'est Le Systeme
  // ---------------------------------------------------------
  function ecran1() {
    var el = U().el;
    return ecran(
      'Bienvenue dans Le Système',
      'Un suivi d’habitudes qui tient en moins d’une minute par jour. Voilà le principe, en trois points.',
      el('div', {}, [
        el('div', { class: 'guide-lines' }, [
          ligne('Tu coches', 'Chaque jour, tu valides les habitudes que tu t’es fixées. Une case, une durée, ou une heure.'),
          ligne('L’app calcule', 'Un score du jour, en pourcentage : ce que tu as validé sur ce qui était prévu ce jour-là.'),
          ligne('Tu vois la suite', 'Une courbe, un calendrier, une série de jours tenus. C’est là que ça devient intéressant.')
        ]),
        el('div', {
          class: 'hint', style: 'margin-top:16px',
          text: 'Cinq écrans, une minute. On construit ton système ensemble, tu pourras tout modifier ensuite.'
        }),
        suivant('Commencer')
      ])
    );
  }

  // ---------------------------------------------------------
  // Ecran 2 - construire ses habitudes
  // ---------------------------------------------------------
  function listeHabitudes() {
    var el = U().el;
    var blocs = [];
    S.SECTIONS.forEach(function (sec) {
      var l = S.habitsOfSection(sec.id);
      if (!l.length) return;
      blocs.push(el('div', { class: 'guide-grp' }, [
        el('div', { class: 'guide-grp-t', text: sec.label }),
        el('div', {}, l.map(function (h) {
          return el('div', { class: 'guide-h' }, [
            el('span', { class: 'nm', text: h.name || '(sans nom)' }),
            el('span', { class: 'sub', text: U().habitSubtitle(h) })
          ]);
        }))
      ]));
    });
    return blocs;
  }

  function boutonsAjout() {
    var el = U().el;
    return el('div', { class: 'guide-add' }, S.SECTIONS.map(function (sec) {
      return el('button', {
        class: 'btn btn-ghost btn-sm', text: '+  ' + sec.label,
        onclick: function () { App.views.system.editor(null, sec.id); }
      });
    }));
  }

  function ecran2() {
    var el = U().el;
    var i = App.sync ? App.sync.info() : { status: 'off', email: null };

    /* Connecte mais pas encore synchronise : ses habitudes sont dans le
       cloud et arrivent. Ne surtout pas lui proposer d'en creer d'autres,
       il finirait avec deux listes. */
    if (!S.state.habits.length && i.email && (i.status === 'syncing' || i.status === 'ready')) {
      return ecran('Récupération de tes habitudes…',
        'Elles reviennent du cloud, ça prend quelques secondes.',
        el('div', {}, [suivant('Continuer')]));
    }

    // --- des habitudes existent deja : on les montre et on avance ---
    if (S.state.habits.length) {
      return ecran('Ton système',
        'Voilà ce que tu suivras chaque jour. Tu peux en ajouter d’autres maintenant, ou plus tard depuis l’onglet Système.',
        el('div', {}, [
          el('div', { class: 'guide-liste' }, listeHabitudes()),
          el('div', { class: 'hint', style: 'margin-top:14px', text: 'Ajouter une habitude à :' }),
          boutonsAjout(),
          suivant()
        ]));
    }

    // --- rien encore : les deux chemins ---
    return ecran('Construis ton système',
      'Une habitude, c’est quelque chose que tu veux faire régulièrement. Il en faut au moins une pour démarrer.',
      el('div', {}, [
        el('div', { class: 'guide-lines' }, [
          ligne('À faire ou pas', 'Douche froide, lecture, sport. Une case à cocher, c’est tout.'),
          ligne('Une durée à atteindre', 'Deux heures de travail concentré, huit heures de sommeil. Validée au-dessus de l’objectif.'),
          ligne('Une heure à ne pas dépasser', 'Se coucher avant 23 h. Validée en dessous.')
        ]),
        el('div', { style: 'display:flex;flex-direction:column;gap:10px;margin-top:20px' }, [
          el('button', {
            class: 'btn btn-gold btn-block', text: 'Partir d’un modèle',
            onclick: function () {
              var n = S.seedFromTemplate();
              if (n) U().toast(n + ' habitudes ajoutées. Tout est modifiable.');
            }
          }),
          el('div', {
            class: 'hint', style: 'margin:0 0 6px',
            text: '14 habitudes réparties entre matin, journée et soir, pour voir à quoi ça ressemble. Renommables et supprimables une par une.'
          }),
          el('button', {
            class: 'btn btn-block', text: 'Partir de zéro',
            onclick: function () { App.views.system.editor(null, 'morning'); }
          }),
          el('div', {
            class: 'hint', style: 'margin:0',
            text: 'Tu écris ta propre liste. On commence par une habitude du matin, tu ajouteras les suivantes juste après.'
          })
        ]),
        el('button', {
          class: 'btn btn-sm btn-block', style: 'margin-top:18px',
          text: 'J’ai déjà un compte',
          onclick: function () { aller(4); }
        }),
        el('div', {
          class: 'hint', style: 'margin-top:6px;text-align:center',
          text: 'Tes habitudes et ton historique reviendront tout seuls.'
        })
      ]));
  }

  // ---------------------------------------------------------
  // Ecran 3 - l'objectif quotidien
  // ---------------------------------------------------------
  function ecran3() {
    var el = U().el;
    var g = S.state.settings.dailyGoal;
    return ecran('Ton objectif quotidien',
      'Le score du jour, c’est le nombre d’habitudes validées divisé par le nombre d’habitudes prévues ce jour-là. L’objectif est la barre au-dessus de laquelle la journée compte comme tenue.',
      el('div', {}, [
        el('div', { class: 'card goalrow', style: 'margin-top:4px' }, [
          el('div', { class: 'lbl', text: 'Score visé chaque jour' }),
          el('div', { class: 'stepper' }, [
            el('button', { text: '−', 'aria-label': 'Diminuer', onclick: function () { S.setGoal(g - 5); } }),
            el('input', {
              type: 'number', inputmode: 'numeric', min: '0', max: '100', step: '1', value: String(g),
              'aria-label': 'Objectif en pourcentage',
              onchange: function () { S.setGoal(parseInt(this.value, 10) || 0); }
            }),
            el('button', { text: '+', 'aria-label': 'Augmenter', onclick: function () { S.setGoal(g + 5); } }),
            el('span', { class: 'u', text: '%' })
          ])
        ]),
        el('div', { class: 'guide-lines', style: 'margin-top:16px' }, [
          ligne('85 % est un bon départ', 'Assez haut pour tirer vers le haut, assez souple pour survivre à une mauvaise journée.'),
          ligne('La série', 'Le nombre de jours d’affilée passés au-dessus de cette barre. C’est elle qu’on n’a pas envie de casser.'),
          ligne('Un jour non rempli n’est pas un zéro', 'Il est simplement ignoré dans les moyennes. Oublier de cocher ne te punit pas.')
        ]),
        suivant()
      ]));
  }

  // ---------------------------------------------------------
  // Ecran 4 - le compte
  // ---------------------------------------------------------
  function champ(type, placeholder, aria, autocomplete) {
    return U().el('input', {
      class: 'field', type: type, placeholder: placeholder, 'aria-label': aria,
      autocomplete: autocomplete, inputmode: type === 'email' ? 'email' : null
    });
  }

  function formulaireCompte(creation) {
    var el = U().el;
    var mail = champ('email', 'ton@email.fr', 'Adresse email', creation ? 'email' : 'username');
    var pass = champ('password', creation ? '8 caractères minimum' : 'ton mot de passe',
      'Mot de passe', creation ? 'new-password' : 'current-password');
    pass.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') valider(); });

    function valider() {
      var e = mail.value.trim(), p = pass.value;
      if (!e || e.indexOf('@') === -1) { msgCompte = 'Il faut une adresse email.'; App.render(); return; }
      if (creation && p.length < 8) { msgCompte = 'Il faut au moins 8 caractères.'; App.render(); return; }
      if (!p) { msgCompte = 'Il faut ton mot de passe.'; App.render(); return; }
      msgCompte = '';
      U().toast(creation ? 'Création du compte…' : 'Connexion…');
      var promesse = creation ? App.sync.signUp(e, p) : App.sync.signInWithPassword(e, p);
      promesse.then(function () {
        U().toast(creation ? 'Compte créé' : 'Connecté');
      }).catch(function (err) {
        console.error(err);
        msgCompte = App.sync.friendlyError(err);
        App.render();
      });
    }

    return el('div', {}, [
      el('div', { style: 'display:flex;flex-direction:column;gap:8px' }, [
        mail, pass,
        el('button', {
          class: 'btn btn-gold btn-block',
          text: creation ? 'Créer mon compte' : 'Se connecter',
          onclick: valider
        })
      ]),
      msgCompte ? el('div', { class: 'hint', style: 'color:var(--red)', text: msgCompte }) : null,
      el('button', {
        class: 'btn btn-sm btn-block', style: 'margin-top:12px', text: 'Retour',
        onclick: function () { modeCompte = 'menu'; msgCompte = ''; App.render(); }
      })
    ].filter(Boolean));
  }

  function ecran4() {
    var el = U().el;
    var i = App.sync ? App.sync.info() : { status: 'off', email: null, configured: false };

    if (!i.configured) {
      return ecran('Tes données restent ici',
        'La synchronisation n’est pas branchée sur cette installation. Tout est enregistré dans cet appareil, et l’app fonctionne normalement.',
        el('div', {}, [suivant()]));
    }

    if (i.email) {
      return ecran('Compte connecté',
        'Tu es connecté avec ' + i.email + '. Tes habitudes, tes coches et tes tâches suivront sur tous tes appareils, automatiquement.',
        el('div', {}, [
          el('div', { class: 'guide-lines' }, [
            ligne('Chaque compte est étanche', 'Personne d’autre ne voit tes données, et tu ne vois celles de personne.'),
            ligne('Ça marche hors ligne', 'Tu coches, ça part au réseau dès qu’il revient. Rien n’attend une connexion.')
          ]),
          suivant()
        ]));
    }

    if (modeCompte === 'creer') {
      return ecran('Créer ton compte',
        'Une adresse email et un mot de passe. C’est immédiat, tu n’as aucun email à aller chercher.',
        formulaireCompte(true));
    }
    if (modeCompte === 'connexion') {
      return ecran('Te reconnecter',
        'Ton adresse et ton mot de passe. Tes habitudes et ton historique reviendront tout seuls.',
        formulaireCompte(false));
    }

    return ecran('Retrouver tes données partout',
      'Avec un compte, ton système te suit sur ton téléphone comme sur ton ordinateur, et il est à l’abri si tu changes d’appareil. Sans compte, tout reste dans ce navigateur, et disparaît avec lui.',
      el('div', {}, [
        el('button', {
          class: 'btn btn-gold btn-block', text: 'Créer mon compte',
          onclick: function () { modeCompte = 'creer'; msgCompte = ''; App.render(); }
        }),
        el('button', {
          class: 'btn btn-block', style: 'margin-top:10px', text: 'J’ai déjà un compte',
          onclick: function () { modeCompte = 'connexion'; msgCompte = ''; App.render(); }
        }),
        plusTard('Continuer sans compte'),
        el('div', {
          class: 'hint', style: 'margin-top:6px;text-align:center',
          text: 'Tu pourras le faire à tout moment depuis l’onglet Système.'
        })
      ]));
  }

  // ---------------------------------------------------------
  // Ecran 5 - les rappels
  // ---------------------------------------------------------
  function ecran5() {
    var el = U().el;
    var n = App.notif ? App.notif.info() : { status: 'unsupported', configured: false };
    var s = App.sync ? App.sync.info() : { status: 'off', email: null };

    if (n.status === 'ios-home-screen') {
      return ecran('Les rappels, sur iPhone',
        'Sur iPhone, les rappels n’existent que si l’app a été ajoutée à l’écran d’accueil. Touche le bouton Partager de Safari, puis « Sur l’écran d’accueil », et rouvre l’app depuis son icône. Tu les activeras alors dans l’onglet Système.',
        el('div', {}, [suivant('Terminer', terminer)]));
    }
    if (n.status === 'unsupported' || !n.configured) {
      return ecran('C’est prêt',
        'Ce navigateur ne sait pas afficher de rappels, mais l’app fonctionne normalement pour tout le reste.',
        el('div', {}, [suivant('Terminer', terminer)]));
    }
    if (!s.email) {
      return ecran('Les rappels, plus tard',
        'Les rappels sont rattachés à un compte, puisque c’est lui qui les reçoit sur tous tes appareils. Tu les activeras dans l’onglet Système une fois connecté.',
        el('div', {}, [suivant('Terminer', terminer)]));
    }
    if (n.status === 'on') {
      return ecran('Rappels activés',
        'Tu es prêt. Les rappels arriveront même quand l’app est fermée, et tu peux régler leurs heures dans l’onglet Système.',
        el('div', {}, [suivant('Terminer', terminer)]));
    }
    if (n.status === 'denied') {
      return ecran('Rappels bloqués par le navigateur',
        'Les notifications ont été refusées pour ce site, et le navigateur ne redemandera plus. Il faut les réautoriser à la main via le cadenas dans la barre d’adresse, puis recharger la page.',
        el('div', {}, [suivant('Terminer', terminer)]));
    }

    return ecran('Ne rien oublier',
      'Deux rappels, pas un de plus. À midi s’il te reste des tâches datées d’aujourd’hui, et le soir si rien n’a été coché dans ton bloc Soir.',
      el('div', {}, [
        el('div', { class: 'guide-lines' }, [
          ligne('Le téléphone peut être fermé', 'Le rappel part quand même. C’est justement quand tu ne regardes pas l’app qu’il sert.'),
          ligne('Les heures sont réglables', 'Midi et 21 h par défaut, modifiables dans l’onglet Système.')
        ]),
        /* La demande de permission part de CE bouton, jamais de
           l'affichage de l'ecran. Une demande qui surgit toute seule est
           refusee par reflexe, et le navigateur ne la represente plus
           jamais. Garde-fou de la section 8 bis de CLAUDE.md. */
        el('button', {
          class: 'btn btn-gold btn-block', style: 'margin-top:18px',
          text: 'Activer les rappels',
          onclick: function () {
            App.notif.enable().then(function () {
              U().toast('Rappels activés sur cet appareil');
            }).catch(function (e) {
              console.error(e);
              U().toast(e.message || 'Activation impossible');
            });
          }
        }),
        plusTard('Terminer sans les rappels')
      ]));
  }

  function vue() {
    if (etape === 1) return ecran1();
    if (etape === 2) return ecran2();
    if (etape === 3) return ecran3();
    if (etape === 4) return ecran4();
    return ecran5();
  }

  // ---------------------------------------------------------
  // Couche 2 - la carte de premiere visite d'un onglet
  // ---------------------------------------------------------
  /* Pourquoi une carte en haut de page et non un halo pose sur les
     elements : App.render() reconstruit l'onglet entier a chaque
     changement de donnees. Un halo ancre a un element devrait etre
     recalcule en permanence et se decalerait au premier re-rendu. */
  var CARTES = {
    today: ['Cet onglet, tous les jours', [
      ['Le score', 'Ce que tu as validé sur ce qui était prévu aujourd’hui. Le petit trait sur la barre, c’est ton objectif.'],
      ['Les flèches en haut', 'Pour revenir sur un jour oublié. Tu peux remplir hier, ça compte.'],
      ['Le bouton +1j', 'Sur une habitude d’heure, quand tu t’es couché après minuit. Sans lui, 00 h 30 passerait pour très en avance.']
    ]],
    tasks: ['Les tâches, en deux temps', [
      ['En vrac, puis dans la semaine', 'Tu notes tout en vrac sans y penser, tu distribues quand tu veux.'],
      ['Attrape la poignée ⠿', 'Et glisse la tâche sur un jour. Au doigt comme à la souris. Le bouton ⋯ fait la même chose sans glisser.'],
      ['Elles ne comptent pas dans le score', 'Le score ne regarde que les habitudes. Une tâche oubliée ne te pénalise pas.']
    ]],
    progress: ['Là où ça devient intéressant', [
      ['Les quatre cases', 'Ta moyenne sur la période choisie, et ta série de jours tenus au-dessus de l’objectif.'],
      ['Un jour vide n’est pas un zéro', 'Les moyennes ne portent que sur les jours renseignés. Ne rien cocher n’abaisse pas ta moyenne.'],
      ['La régularité', 'Habitude par habitude : celle que tu tiens vraiment, et celle que tu te racontes.']
    ]],
    system: ['Le poste de pilotage', [
      ['Tes habitudes', 'En ajouter, les renommer, changer leurs jours, les désactiver. Tes anciens scores ne bougent jamais.'],
      ['Ton compte et tes rappels', 'De quoi retrouver tes données ailleurs, et de quoi ne rien oublier.'],
      ['Tes données', 'Exporter une sauvegarde, la réimporter. C’est ton filet, sers-t’en avant toute grosse manipulation.']
    ]]
  };

  function tabCard(id) {
    if (etape > 0) return null;               // le guide occupe deja l'ecran
    if (!CARTES[id] || etat.seenTabs[id]) return null;
    var el = U().el;
    var c = CARTES[id];
    return el('div', { class: 'card tipcard' }, [
      el('div', { class: 'tip-t', text: c[0] }),
      el('div', { class: 'guide-lines' }, c[1].map(function (l) { return ligne(l[0], l[1]); })),
      el('button', {
        class: 'btn btn-sm btn-block', style: 'margin-top:14px', text: 'J’ai compris',
        onclick: function () { etat.seenTabs[id] = 1; ecrire(); App.render(); }
      })
    ]);
  }

  // ---------------------------------------------------------
  // Couche 3 - la page "Comment ca marche"
  // ---------------------------------------------------------
  /* RAPPEL : ces textes recopient des regles qui vivent ailleurs.
     Le score -> CLAUDE.md section 6. Les rappels -> section 8 bis.
     Si la regle change, ce texte change avec. */
  var AIDE = [
    ['Le score, exactement', [
      'Score du jour = habitudes validées ÷ habitudes qui comptent ce jour-là.',
      'Une habitude compte ce jour-là si elle est active, si le jour de la semaine est coché dans ses réglages, et si la date est postérieure à sa création. C’est ce dernier point qui empêche une habitude ajoutée aujourd’hui de faire baisser tes scores du mois dernier.',
      'Une habitude est validée si sa case est cochée, si la durée saisie atteint l’objectif, ou si l’heure saisie est en dessous de la limite.',
      'Les tâches ne comptent pas. Une journée où tu n’as rien saisi n’est pas un zéro : elle est ignorée dans les moyennes. Et une journée en cours ne casse pas ta série, elle repart d’hier tant que tu n’as pas rempli.'
    ]],
    ['Les trois types d’habitude', [
      'À faire ou pas : une case à cocher. Douche froide, lecture, appel.',
      'Une durée à atteindre : validée quand tu es au-dessus. Deux heures de travail concentré, huit heures de sommeil. Tu peux afficher en minutes ou en heures, l’app enregistre toujours des minutes.',
      'Une heure à ne pas dépasser : validée quand tu es en dessous. Se coucher avant 23 h. Si tu t’es couché après minuit, le bouton +1j le dit à l’app.',
      'Chaque habitude a ses propres jours de la semaine, et peut avoir un objectif différent le week-end.'
    ]],
    ['Les tâches', [
      'Tout ce que tu notes atterrit en vrac, sans date. Tu le distribues sur la semaine quand tu veux, en glissant la tâche par sa poignée, au doigt ou à la souris. Le bouton ⋯ fait la même chose sans glisser.',
      'Les tâches datées d’aujourd’hui apparaissent en haut de l’onglet Aujourd’hui.',
      'Elles n’entrent jamais dans le calcul du score.'
    ]],
    ['Mon compte et mes appareils', [
      'Sans compte, tout vit dans ce navigateur et disparaît avec lui. Avec un compte, tes données te suivent partout et sont à l’abri.',
      'Chaque compte est étanche : tes données sont filtrées par ton identifiant, côté serveur. Personne d’autre ne peut les lire ni les modifier.',
      'L’app fonctionne hors ligne. Tu coches, ça part dès que le réseau revient. La modification la plus récente gagne, élément par élément.',
      'Si un autre compte se connecte sur cet appareil, l’app repart d’un état vierge pour ne pas mélanger les deux. Les données précédentes sont archivées dans l’appareil, jamais envoyées ailleurs.'
    ]],
    ['Les rappels', [
      'Deux rappels, et rien d’autre. À l’heure que tu choisis (midi par défaut) s’il te reste des tâches non faites datées d’aujourd’hui. Et le soir (21 h par défaut) si rien n’a été coché dans ton bloc Soir.',
      'Le rappel du soir ne regarde que le bloc Soir : ce que tu as coché le matin ne le désarme pas.',
      'Les heures suivent ton compte, donc tous tes appareils. Être abonné ou non est propre à chaque appareil.',
      'Sur iPhone, il faut avoir ajouté l’app à l’écran d’accueil : dans un simple onglet Safari, les notifications n’existent pas.'
    ]],
    ['Mes données', [
      'Exporter range tout ton historique dans un fichier, sur ton appareil. Fais-le avant toute grosse manipulation, c’est ton filet.',
      'Importer propose deux modes. Fusionner rapatrie ce qui manque en gardant la version la plus récente de chaque élément, et ne supprime jamais rien. Tout remplacer revient à la sauvegarde après une fausse manœuvre : l’état actuel est mis de côté avant, et un bouton « Annuler la restauration » apparaît juste après.',
      'Une habitude supprimée est mise de côté, jamais effacée : c’est ce qui garde tes statistiques passées justes.'
    ]]
  ];

  function pageAide() {
    var el = U().el;
    U().openModal('Comment ça marche', function (box) {
      AIDE.forEach(function (sec) {
        var d = el('details', { class: 'aide' }, [el('summary', { text: sec[0] })]);
        sec[1].forEach(function (p) { d.appendChild(el('p', { text: p })); });
        box.appendChild(d);
      });
      box.appendChild(el('div', { class: 'acts' }, [
        el('button', { class: 'btn btn-gold btn-block', text: 'Fermer', onclick: U().closeModal })
      ]));
    }, { noFocus: true });
  }

  /* La carte "aide" de l'onglet Systeme. */
  function aideCard() {
    var el = U().el;
    return el('div', { class: 'card', style: 'padding:14px' }, [
      el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' }, [
        el('button', { class: 'btn', text: '?  Comment ça marche', onclick: pageAide }),
        el('button', { class: 'btn', text: '↻  Revoir le guide de démarrage', onclick: revoir })
      ]),
      el('div', {
        class: 'hint',
        text: 'Le guide reprend depuis le début, sans rien changer à tes habitudes ni à ton historique.'
      })
    ]);
  }

  return {
    init: init, actif: actif, vue: vue, revoir: revoir,
    tabCard: tabCard, aideCard: aideCard, pageAide: pageAide
  };
})();
