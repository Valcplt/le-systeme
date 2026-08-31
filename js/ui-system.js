/* =========================================================
   LE SYSTEME - onglet "Systeme"
   Regler l'objectif, gerer les habitudes, sauvegarder ses donnees.
   ========================================================= */

App.views = App.views || {};

App.views.system = (function () {
  'use strict';

  var S = App.store;
  function U() { return App.ui; }

  // ---------------------------------------------------------
  // Objectif quotidien
  // ---------------------------------------------------------
  function goalCard() {
    var el = U().el;
    var g = S.state.settings.dailyGoal;
    return el('div', { class: 'card goalrow' }, [
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
    ]);
  }

  // ---------------------------------------------------------
  // Editeur d'habitude
  // ---------------------------------------------------------
  function editor(existing, section) {
    var el = U().el;
    var isNew = !existing;
    var d = existing ? {
      name: existing.name, type: existing.type, goal: existing.goal,
      goalWeekend: existing.goalWeekend, unit: existing.unit || 'min',
      step: existing.step || 5, days: existing.days.slice(), active: existing.active
    } : {
      name: '', type: 'binary', goal: null, goalWeekend: null,
      unit: 'min', step: 5, days: [1, 2, 3, 4, 5, 6, 7], active: true
    };

    U().openModal(isNew ? 'Nouvelle habitude' : 'Modifier l’habitude', function (box, api) {
      var dyn = el('div');

      // --- nom ---
      box.appendChild(el('span', { class: 'lab first', text: 'nom' }));
      var nameField = el('input', {
        class: 'field', value: d.name, placeholder: 'Ex. Douche froide',
        oninput: function () { d.name = this.value; }
      });
      box.appendChild(nameField);

      // --- type ---
      box.appendChild(el('span', { class: 'lab', text: 'type' }));
      var types = [['binary', 'À cocher'], ['duration', 'Une durée'], ['time', 'Une heure limite']];
      var typeChips = el('div', { class: 'chips' }, types.map(function (t) {
        return el('button', {
          class: 'chip', text: t[1], 'aria-pressed': String(d.type === t[0]),
          onclick: function () {
            d.type = t[0];
            if (t[0] === 'duration' && (d.goal === null || d.goal === undefined)) { d.goal = 30; d.unit = 'min'; d.step = 5; }
            if (t[0] === 'time' && (d.goal === null || d.goal === undefined)) d.goal = 23 * 60;
            if (t[0] === 'binary') { d.goal = null; d.goalWeekend = null; }
            typeChips.querySelectorAll('.chip').forEach(function (c, i) {
              c.setAttribute('aria-pressed', String(types[i][0] === d.type));
            });
            drawGoal();
          }
        });
      }));
      box.appendChild(typeChips);
      box.appendChild(dyn);

      // --- objectif (depend du type) ---
      function goalRow(label, value, onSet) {
        if (d.type === 'duration') {
          return el('div', { class: 'row' }, [
            el('input', {
              class: 'field', type: 'number', inputmode: 'decimal', min: '0',
              step: d.unit === 'h' ? '0.5' : '1', style: 'flex:1',
              value: value === null || value === undefined ? '' : String(S.toDisplay(value, d.unit)),
              onchange: function () {
                var v = this.value === '' ? null : parseFloat(this.value);
                onSet(v === null || isNaN(v) ? null : S.fromDisplay(v, d.unit));
              }
            }),
            el('div', { class: 'chips' }, [['min', 'min'], ['h', 'h']].map(function (uu) {
              return el('button', {
                class: 'chip', text: uu[1], 'aria-pressed': String(d.unit === uu[0]),
                onclick: function () {
                  d.unit = uu[0]; d.step = uu[0] === 'h' ? 0.5 : 5; drawGoal();
                }
              });
            }))
          ]);
        }
        return el('input', {
          class: 'field', type: 'time',
          value: value === null || value === undefined ? '' : S.minutesToHHMM(value),
          onchange: function () { onSet(S.hhmmToMinutes(this.value)); }
        });
      }

      function drawGoal() {
        U().clear(dyn);
        if (d.type === 'binary') return;
        dyn.appendChild(el('span', {
          class: 'lab',
          text: d.type === 'duration' ? 'objectif (au moins)' : 'heure limite (avant)'
        }));
        dyn.appendChild(goalRow('', d.goal, function (v) { d.goal = v; }));

        var hasWe = d.goalWeekend !== null && d.goalWeekend !== undefined;
        dyn.appendChild(el('span', { class: 'lab', text: 'week-end' }));
        dyn.appendChild(el('div', { class: 'chips' }, [
          el('button', {
            class: 'chip', text: hasWe ? 'Objectif différent le week-end' : 'Même objectif toute la semaine',
            'aria-pressed': String(hasWe),
            onclick: function () { d.goalWeekend = hasWe ? null : d.goal; drawGoal(); }
          })
        ]));
        if (hasWe) {
          dyn.appendChild(el('div', { style: 'margin-top:8px' }, [
            goalRow('', d.goalWeekend, function (v) { d.goalWeekend = v; })
          ]));
        }
      }
      drawGoal();

      // --- jours ---
      box.appendChild(el('span', { class: 'lab', text: 'les jours où elle compte' }));
      var dayChips = el('div', { class: 'chips' }, [1, 2, 3, 4, 5, 6, 7].map(function (w) {
        return el('button', {
          class: 'chip d', text: S.ISO_SHORT[w], 'aria-pressed': String(d.days.indexOf(w) !== -1),
          onclick: function () {
            var i = d.days.indexOf(w);
            if (i === -1) d.days.push(w); else d.days.splice(i, 1);
            this.setAttribute('aria-pressed', String(d.days.indexOf(w) !== -1));
          }
        });
      }));
      box.appendChild(dayChips);
      box.appendChild(el('div', {
        class: 'hint',
        text: 'Un jour décoché : l’habitude n’apparaît pas et ne compte pas dans le score de ce jour-là.'
      }));

      // --- active ---
      box.appendChild(el('span', { class: 'lab', text: 'état' }));
      var activeChip = el('button', {
        class: 'chip', 'aria-pressed': String(d.active),
        text: d.active ? 'Active' : 'Désactivée',
        onclick: function () {
          d.active = !d.active;
          this.textContent = d.active ? 'Active' : 'Désactivée';
          this.setAttribute('aria-pressed', String(d.active));
        }
      });
      box.appendChild(el('div', { class: 'chips' }, [activeChip]));
      box.appendChild(el('div', {
        class: 'hint',
        text: 'Désactivée, elle reste dans la liste (barrée) et tes anciens scores ne changent pas.'
      }));

      // --- actions ---
      var acts = [];
      if (!isNew) {
        acts.push(el('button', {
          class: 'btn btn-danger', text: 'Supprimer',
          onclick: function () {
            api.close();
            U().confirmBox('Supprimer « ' + existing.name + ' » ?',
              'Elle disparaît de la liste, mais tes scores passés restent exactement les mêmes. Si tu veux juste faire une pause, préfère « Désactivée ».',
              'Supprimer', function () { S.removeHabit(existing.id); U().toast('Habitude supprimée'); });
          }
        }));
      }
      acts.push(el('button', { class: 'btn', text: 'Annuler', onclick: api.close }));
      acts.push(el('button', {
        class: 'btn btn-gold', text: 'Enregistrer',
        onclick: function () {
          if (!d.name.trim()) { U().toast('Il faut un nom'); nameField.focus(); return; }
          if (!d.days.length) { U().toast('Coche au moins un jour'); return; }
          if (d.type !== 'binary' && (d.goal === null || d.goal === undefined)) {
            U().toast('Il faut un objectif'); return;
          }
          d.name = d.name.trim();
          if (isNew) {
            var h = S.addHabit(section);
            S.saveHabit(h.id, d);
          } else {
            S.saveHabit(existing.id, d);
          }
          api.close();
        }
      }));
      box.appendChild(el('div', { class: 'acts' }, acts));
    });
  }

  // ---------------------------------------------------------
  // Une ligne d'habitude
  // ---------------------------------------------------------
  function habitRow(h, index, total) {
    var el = U().el;
    return el('div', { class: 'sys-item' + (h.active ? '' : ' off') }, [
      el('div', { class: 'txt' }, [
        el('div', { class: 'nm', text: h.name || '(sans nom)' }),
        el('div', { class: 'sub', text: U().habitSubtitle(h) })
      ]),
      el('button', {
        class: 'icon-btn', text: '↑', 'aria-label': 'Monter', disabled: index === 0,
        onclick: function () { S.moveHabit(h.id, -1); }
      }),
      el('button', {
        class: 'icon-btn', text: '↓', 'aria-label': 'Descendre', disabled: index === total - 1,
        onclick: function () { S.moveHabit(h.id, 1); }
      }),
      el('button', {
        class: 'icon-btn', text: '✎', 'aria-label': 'Modifier',
        onclick: function () { editor(h, h.section); }
      })
    ]);
  }

  // ---------------------------------------------------------
  // Sauvegarde / restauration
  // ---------------------------------------------------------
  // ---------------------------------------------------------
  // Synchronisation entre appareils
  // ---------------------------------------------------------
  var mailSentTo = null;      // le temps d'un affichage, apres l'envoi du lien
  var signinMode = 'password';// 'password' | 'magic'

  /* La connexion par mot de passe est proposee EN PREMIER, et le lien
     magique relegue au second plan. Raison : le service d'emails de
     Supabase est bride a quelques envois par heure. Le mot de passe,
     lui, n'envoie rien - donc il ne peut jamais laisser dehors. */
  function passwordSignIn() {
    var el = U().el;

    var mail = el('input', {
      class: 'field', type: 'email', inputmode: 'email', autocomplete: 'username',
      placeholder: 'ton@email.fr', 'aria-label': 'Adresse email'
    });
    var pass = el('input', {
      class: 'field', type: 'password', autocomplete: 'current-password',
      placeholder: 'ton mot de passe', 'aria-label': 'Mot de passe',
      onkeydown: function (ev) { if (ev.key === 'Enter') go(); }
    });
    var msg = el('div', { class: 'hint', style: 'color:var(--red)' });

    function go() {
      var e = mail.value.trim(), p = pass.value;
      if (!e || e.indexOf('@') === -1) { msg.textContent = 'Il faut une adresse email.'; return; }
      if (!p) { msg.textContent = 'Il faut ton mot de passe.'; return; }
      msg.textContent = '';
      U().toast('Connexion…');
      App.sync.signInWithPassword(e, p).catch(function (err) {
        console.error(err);
        msg.textContent = App.sync.friendlyError(err);
        App.render();
      });
    }

    return el('div', { class: 'card', style: 'padding:14px' }, [
      el('div', { style: 'font-size:15px;font-weight:600', text: 'Retrouver mes données partout' }),
      el('div', {
        class: 'hint', style: 'margin-bottom:12px',
        text: 'Ton email et le mot de passe que tu as choisi. À faire une seule fois par appareil.'
      }),
      el('div', { style: 'display:flex;flex-direction:column;gap:8px' }, [
        mail, pass,
        el('button', { class: 'btn btn-gold btn-block', text: 'Se connecter', onclick: go })
      ]),
      msg,
      el('div', { style: 'margin-top:14px;display:flex;flex-direction:column;gap:6px' }, [
        el('button', {
          class: 'btn btn-sm', text: 'Je n’ai pas encore de mot de passe',
          onclick: function () { signinMode = 'magic'; App.render(); }
        }),
        el('div', {
          class: 'hint', style: 'margin:0',
          text: 'Tu recevras alors un lien par email. Une fois connecté, tu pourras définir ton mot de passe ici même.'
        })
      ])
    ]);
  }

  /* Definir ou changer le mot de passe du compte. Le mot de passe est tape
     ici par toi et part directement chez Supabase, qui n'en conserve qu'une
     empreinte. Il n'est ecrit nulle part dans l'app, ni dans l'appareil. */
  function passwordEditor() {
    var el = U().el;
    U().openModal('Mon mot de passe', function (box, api) {
      box.appendChild(el('div', {
        class: 'hint', style: 'margin:0 0 4px',
        text: 'C’est ce mot de passe qui te connectera sur tes autres appareils, sans passer par ta boîte mail.'
      }));

      box.appendChild(el('span', { class: 'lab', text: 'nouveau mot de passe' }));
      var p1 = el('input', {
        class: 'field', type: 'password', autocomplete: 'new-password',
        placeholder: '8 caractères minimum', 'aria-label': 'Nouveau mot de passe'
      });
      box.appendChild(p1);

      box.appendChild(el('span', { class: 'lab', text: 'le même, pour être sûr' }));
      var p2 = el('input', {
        class: 'field', type: 'password', autocomplete: 'new-password',
        'aria-label': 'Confirmation du mot de passe',
        onkeydown: function (ev) { if (ev.key === 'Enter') valider(); }
      });
      box.appendChild(p2);

      var msg = el('div', { class: 'hint', style: 'color:var(--red)' });
      box.appendChild(msg);

      function valider() {
        var a = p1.value, b = p2.value;
        if (a.length < 8) { msg.textContent = 'Il faut au moins 8 caractères.'; return; }
        if (a !== b) { msg.textContent = 'Les deux ne sont pas identiques.'; return; }
        msg.textContent = '';
        App.sync.setPassword(a).then(function () {
          api.close();
          U().toast('Mot de passe enregistré');
        }).catch(function (e) {
          console.error(e);
          msg.textContent = App.sync.friendlyError(e);
        });
      }

      box.appendChild(el('div', { class: 'acts' }, [
        el('button', { class: 'btn', text: 'Annuler', onclick: api.close }),
        el('button', { class: 'btn btn-gold', text: 'Enregistrer', onclick: valider })
      ]));
    });
  }

  function syncCard() {
    var el = U().el;
    var i = App.sync ? App.sync.info() : { status: 'off', configured: false };

    // --- pas encore configure ---
    if (!i.configured) {
      return el('div', { class: 'card', style: 'padding:14px' }, [
        el('div', { class: 'row' }, [
          el('span', { style: 'font-size:15px;font-weight:600' }, [document.createTextNode('Un seul appareil')]),
          el('span', { class: 'spacer' }),
          el('span', { class: 'mono faint', style: 'font-size:10px;letter-spacing:.1em', text: 'HORS LIGNE' })
        ]),
        el('div', {
          class: 'hint',
          text: 'Tes données sont enregistrées dans cet appareil uniquement. Pour les retrouver aussi sur ton téléphone, il reste à brancher le coffre-fort en ligne (fichier config.js).'
        })
      ]);
    }

    // --- configure mais pas connecte ---
    if (i.status === 'signedout' || i.status === 'off') {
      if (signinMode === 'password') return passwordSignIn();
      if (mailSentTo) {
        return el('div', { class: 'card', style: 'padding:14px' }, [
          el('div', { style: 'font-size:15px;font-weight:600', text: 'Regarde ta boîte mail' }),
          el('div', {
            class: 'hint',
            text: 'Un lien vient de partir vers ' + mailSentTo + '. Ouvre-le sur CET appareil : il te connectera directement, sans mot de passe. Pense à regarder dans les indésirables.'
          }),
          el('div', { class: 'row', style: 'margin-top:12px;gap:8px;flex-wrap:wrap' }, [
            el('button', {
              class: 'btn btn-sm', text: 'Utiliser une autre adresse',
              onclick: function () { mailSentTo = null; App.render(); }
            }),
            el('button', {
              class: 'btn btn-sm', text: 'Revenir au mot de passe',
              onclick: function () { mailSentTo = null; signinMode = 'password'; App.render(); }
            })
          ])
        ]);
      }

      var mail = el('input', {
        class: 'field', type: 'email', inputmode: 'email', autocomplete: 'email',
        placeholder: 'ton@email.fr', 'aria-label': 'Adresse email',
        onkeydown: function (ev) { if (ev.key === 'Enter') send(); }
      });
      function send() {
        var v = mail.value.trim();
        if (!v || v.indexOf('@') === -1) { U().toast('Il faut une adresse email'); return; }
        U().toast('Envoi du lien…');
        App.sync.sendMagicLink(v).then(function () {
          mailSentTo = v; App.render();
        }).catch(function (e) {
          console.error(e);
          U().toast(App.sync.friendlyError(e));
        });
      }

      return el('div', { class: 'card', style: 'padding:14px' }, [
        el('div', { style: 'font-size:15px;font-weight:600', text: 'Retrouver mes données partout' }),
        el('div', {
          class: 'hint', style: 'margin-bottom:12px',
          text: 'Tape ton adresse : tu recevras un lien à cliquer, sans mot de passe à retenir. À faire une seule fois par appareil.'
        }),
        el('div', { class: 'row', style: 'gap:8px' }, [
          mail,
          el('button', { class: 'btn btn-gold', text: 'Recevoir', onclick: send })
        ]),
        el('button', {
          class: 'btn btn-sm', style: 'margin-top:12px',
          text: 'Revenir au mot de passe',
          onclick: function () { signinMode = 'password'; App.render(); }
        })
      ]);
    }

    // --- connecte ---
    var libelle = {
      ready: 'À jour', syncing: 'Synchronisation…',
      offline: 'Hors ligne', error: 'Synchro en échec'
    }[i.status] || i.status;

    return el('div', { class: 'card', style: 'padding:14px' }, [
      el('div', { class: 'row' }, [
        el('span', { style: 'font-size:15px;font-weight:600', text: libelle }),
        el('span', { class: 'spacer' }),
        el('span', {
          class: 'mono', style: 'font-size:10px;letter-spacing:.1em;color:' +
            (i.status === 'error' ? 'var(--red)' : i.status === 'ready' ? 'var(--green)' : 'var(--txt-faint)'),
          text: i.status === 'ready' ? U().ago(i.lastSyncAt).toUpperCase() : ''
        })
      ]),
      el('div', { class: 'hint', style: 'margin-top:2px', text: 'Connecté avec ' + (i.email || '') }),
      i.status === 'error' ? el('div', {
        class: 'hint', style: 'color:var(--red)',
        text: 'Détail : ' + (i.error || 'inconnu') + '. Tes données restent en sécurité sur cet appareil ; elles repartiront toutes seules dès que ça remarchera.'
      }) : null,
      el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;margin-top:12px' }, [
        el('button', {
          class: 'btn btn-sm', text: 'Synchroniser maintenant',
          disabled: i.status === 'syncing',
          onclick: function () { App.sync.syncNow(); }
        }),
        el('button', {
          class: 'btn btn-sm', text: 'Tout renvoyer',
          disabled: i.status === 'syncing',
          onclick: function () {
            U().confirmBox('Tout renvoyer vers le cloud ?',
              'On réenvoie l’intégralité de cet appareil, sans se fier au repère du dernier envoi. Utile en cas de doute. Rien n’est effacé nulle part.',
              'Renvoyer', function () {
                App.sync.resendEverything();
                U().toast('Renvoi en cours…');
              });
          }
        }),
        el('button', {
          class: 'btn btn-sm', text: 'Mon mot de passe',
          onclick: passwordEditor
        }),
        el('button', {
          class: 'btn btn-sm btn-danger', text: 'Se déconnecter',
          onclick: function () {
            U().confirmBox('Se déconnecter de cet appareil ?',
              'Tes données restent dans le cloud ET sur cet appareil. Il faudra simplement redemander un lien par email pour relancer la synchro.',
              'Se déconnecter', function () {
                App.sync.signOut();
                U().toast('Déconnecté');
              });
          }
        })
      ])
    ]);
  }

  /* Deux facons d'importer, parce qu'elles ne servent pas au meme besoin :
     - fusionner : rapatrier ce qui manque (deux appareils, un oubli) ;
     - restaurer : revenir en arriere apres une fausse manoeuvre.
     La fusion garde toujours la version la plus recente, donc elle ne peut
     pas defaire une suppression : d'ou le second bouton. */
  function askImportMode(json, fileName) {
    var el = U().el;
    var preview = null;
    try {
      var p = JSON.parse(json);
      var d = p.data || p;
      preview = (d.habits || []).length + ' habitudes · ' +
        Object.keys(d.entries || {}).length + ' saisies · ' +
        (d.tasks || []).length + ' tâches';
    } catch (e) {
      U().toast('Ce fichier n’est pas une sauvegarde valide');
      return;
    }

    U().openModal('Importer « ' + fileName + ' »', function (box, api) {
      box.appendChild(el('div', { class: 'hint', style: 'margin:0 0 4px', text: 'Le fichier contient : ' + preview }));

      box.appendChild(el('span', { class: 'lab', text: 'que veux-tu faire ?' }));
      box.appendChild(el('div', { style: 'display:flex;flex-direction:column;gap:10px' }, [
        el('button', {
          class: 'btn btn-block', style: 'justify-content:flex-start', text: 'Fusionner avec mes données',
          onclick: function () {
            api.close();
            try {
              var rep = S.importData(json);
              U().toast('Fusionné : ' + rep.habits + ' habitudes, ' + rep.entries + ' journées, ' + rep.tasks + ' tâches');
            } catch (e) { console.error(e); U().toast('Import impossible'); }
          }
        }),
        el('div', { class: 'hint', style: 'margin:0 0 6px', text: 'Pour rapatrier ce qui manque. Pour chaque élément, la version la plus récente est gardée. Rien n’est supprimé.' }),
        el('button', {
          class: 'btn btn-block btn-danger', style: 'justify-content:flex-start', text: 'Tout remplacer par ce fichier',
          onclick: function () {
            api.close();
            U().confirmBox('Revenir à cette sauvegarde ?',
              'Tes données actuelles seront remplacées par le contenu du fichier. Elles sont mises de côté avant : un bouton « Annuler la restauration » apparaîtra juste après si tu changes d’avis.',
              'Restaurer', function () {
                try {
                  var rep = S.restoreData(json);
                  U().toast('Restauré : ' + rep.habits + ' habitudes, ' + rep.entries + ' saisies');
                } catch (e) { console.error(e); U().toast('Restauration impossible'); }
              });
          }
        }),
        el('div', { class: 'hint', style: 'margin:0', text: 'Pour revenir en arrière après une fausse manoeuvre. Ce que tu as fait depuis cette sauvegarde sera perdu.' })
      ]));

      box.appendChild(el('div', { class: 'acts' }, [
        el('button', { class: 'btn btn-block', text: 'Annuler', onclick: api.close })
      ]));
    }, { noFocus: true });
  }

  /* ---------- les rappels ----------
     Un seul principe tient toute cette carte : ne jamais montrer un
     bouton qui ne peut pas marcher. Chaque situation a son message et
     son geste, et la personne n'a jamais a deviner pourquoi rien ne se
     passe. */
  function notifCard() {
    var el = U().el;
    var n = App.notif ? App.notif.info() : { status: 'unsupported', configured: false };
    var s = App.sync ? App.sync.info() : { status: 'off', email: null };

    function carte(titre, texte, boutons) {
      return el('div', { class: 'card', style: 'padding:14px' }, [
        el('div', { style: 'font-size:15px;font-weight:600', text: titre }),
        el('div', { class: 'hint', style: 'margin-bottom:' + (boutons ? '12px' : '0'), text: texte }),
        boutons || null
      ]);
    }

    // --- l'appareil ne sait pas faire ---
    if (n.status === 'ios-home-screen') {
      return carte('Rappels indisponibles dans cet onglet',
        'Sur iPhone, les rappels n’existent que si l’app a été ajoutée à l’écran d’accueil. Touche le bouton Partager de Safari, puis « Sur l’écran d’accueil », et rouvre l’app depuis son icône.');
    }
    if (n.status === 'unsupported' || !n.configured) {
      return carte('Rappels indisponibles',
        'Ce navigateur ne sait pas afficher de rappels. L’application fonctionne normalement pour tout le reste.');
    }

    // --- il faut un compte : c'est lui qui recoit ---
    if (!s.email) {
      return carte('Rappels',
        'Connecte-toi d’abord, juste au-dessus : les rappels sont rattachés à ton compte, pas à cet appareil.');
    }

    // --- refuse au niveau du navigateur : on ne peut plus rien demander ---
    if (n.status === 'denied') {
      return carte('Rappels bloqués par le navigateur',
        'Les notifications ont été refusées pour ce site. Le navigateur ne redemandera plus : il faut les réautoriser à la main, via le cadenas dans la barre d’adresse, puis recharger la page.');
    }

    // --- actif ---
    if (n.status === 'on') {
      return carte('Rappels activés', 'Sur cet appareil : ' + App.notif.deviceLabel() + '.',
        el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' }, [
          el('button', {
            class: 'btn btn-sm', text: 'M’envoyer un test',
            onclick: function () {
              U().toast('Envoi…');
              App.notif.sendTest().then(function (r) {
                U().toast((r && r.sent ? r.sent : 0) + ' notification(s) envoyée(s). Ferme l’app pour la voir arriver.');
              }).catch(function (e) {
                console.error(e);
                U().toast('Envoi impossible : ' + (e.message || e));
              });
            }
          }),
          el('button', {
            class: 'btn btn-sm btn-danger', text: 'Désactiver ici',
            onclick: function () {
              U().confirmBox('Ne plus recevoir de rappels sur cet appareil ?',
                'Tes autres appareils continueront d’en recevoir. Rien n’est perdu : tu peux réactiver quand tu veux.',
                'Désactiver', function () {
                  App.notif.disable().then(function () { U().toast('Rappels désactivés ici'); });
                });
            }
          })
        ]));
    }

    // --- pret a etre active ---
    return carte('Rappels',
      'Recevoir une notification quand ta journée n’est pas cochée, ou qu’il te reste des tâches. Le téléphone peut être fermé.',
      el('button', {
        class: 'btn btn-gold btn-block', text: 'Activer sur cet appareil',
        onclick: function () {
          App.notif.enable().then(function () {
            U().toast('Rappels activés sur cet appareil');
          }).catch(function (e) {
            console.error(e);
            U().toast(e.message || 'Activation impossible');
          });
        }
      }));
  }

  function backupCard() {
    var el = U().el;

    function doExport() {
      var blob = new Blob([S.exportData()], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = el('a', {
        href: url,
        download: 'le-systeme-sauvegarde-' + S.today() + '.json'
      });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      U().toast('Sauvegarde téléchargée');
    }

    var file = el('input', {
      type: 'file', accept: '.json,application/json', style: 'display:none',
      onchange: function () {
        var f = this.files && this.files[0];
        this.value = '';
        if (!f) return;
        var r = new FileReader();
        r.onload = function () { askImportMode(String(r.result), f.name); };
        r.readAsText(f);
      }
    });

    return el('div', { class: 'card', style: 'padding:14px' }, [
      el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' }, [
        el('button', { class: 'btn', text: '↓  Exporter ma sauvegarde', onclick: doExport }),
        el('button', {
          class: 'btn', text: '↑  Importer une sauvegarde',
          onclick: function () { file.click(); }
        }),
        S.hasUndoRestore() ? el('button', {
          class: 'btn', text: '↺  Annuler la restauration',
          onclick: function () {
            U().confirmBox('Annuler la dernière restauration ?',
              'On reprend les données telles qu’elles étaient juste avant que tu importes ce fichier.',
              'Reprendre', function () {
                if (S.undoRestore()) U().toast('Données d’avant la restauration reprises');
                else U().toast('Rien à reprendre');
              });
          }
        }) : null,
        file
      ]),
      el('div', {
        class: 'hint',
        text: 'L’export range tout ton historique dans un fichier, sur ton appareil. L’import fusionne : pour chaque élément, la version la plus récente est conservée — rien n’est écrasé au hasard.'
      })
    ]);
  }

  // ---------------------------------------------------------
  // Rendu
  // ---------------------------------------------------------
  function render(root) {
    var el = U().el;
    U().clear(root);

    root.appendChild(el('div', { class: 'section-label' }, [el('span', { text: 'objectif quotidien' })]));
    root.appendChild(goalCard());

    S.SECTIONS.forEach(function (sec) {
      var list = S.habitsOfSection(sec.id);
      root.appendChild(el('div', { class: 'section-label' }, [el('span', { text: sec.label })]));
      var group = el('div', { class: 'card sys-group' });
      list.forEach(function (h, i) { group.appendChild(habitRow(h, i, list.length)); });
      group.appendChild(el('div', { class: 'addwrap' }, [
        el('button', {
          class: 'btn btn-ghost btn-sm', text: '+  Ajouter une habitude',
          onclick: function () { editor(null, sec.id); }
        })
      ]));
      root.appendChild(group);
    });

    root.appendChild(el('div', { class: 'section-label' }, [el('span', { text: 'synchronisation' })]));
    root.appendChild(syncCard());

    root.appendChild(el('div', { class: 'section-label' }, [el('span', { text: 'rappels' })]));
    root.appendChild(notifCard());

    root.appendChild(el('div', { class: 'section-label' }, [el('span', { text: 'mes données' })]));
    root.appendChild(backupCard());

    root.appendChild(el('div', {
      class: 'hint',
      style: 'text-align:center;margin:22px 0 8px',
      text: 'Le Système · version des données ' + S.SCHEMA_VERSION
    }));
  }

  return { render: render };
})();
