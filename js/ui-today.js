/* =========================================================
   LE SYSTEME - onglet "Aujourd'hui"
   Cocher sa journee. C'est l'ecran qu'on ouvre tous les jours.
   ========================================================= */

App.views = App.views || {};

App.views.today = (function () {
  'use strict';

  var S = App.store;
  var cursor = null;      // la date affichee
  var justDone = null;    // pour la petite animation de validation

  function U() { return App.ui; }
  function date() { return cursor || (cursor = S.today()); }
  function resetToToday() { cursor = S.today(); }

  function dayLabel(d) {
    var t = S.today();
    if (d === t) return 'aujourd’hui';
    if (d === S.addDays(t, -1)) return 'hier';
    if (d === S.addDays(t, 1)) return 'demain';
    var n = S.daysBetween(d, t);
    return n > 0 ? 'il y a ' + n + ' jours' : 'dans ' + (-n) + ' jours';
  }

  // ---------- barre de navigation entre les jours ----------
  function dayNav() {
    var el = U().el;
    var d = date();
    return el('div', { class: 'daynav' }, [
      el('button', {
        class: 'icon-btn', 'aria-label': 'Jour precedent',
        onclick: function () { cursor = S.addDays(d, -1); App.render(); }
      }, [el('span', { text: '‹' })]),
      el('div', { class: 'lbl' }, [
        el('b', { text: S.longDate(d) }),
        el('small', { text: dayLabel(d) })
      ]),
      el('button', {
        class: 'icon-btn', 'aria-label': 'Jour suivant',
        disabled: d >= S.today(),
        onclick: function () { if (d < S.today()) { cursor = S.addDays(d, 1); App.render(); } }
      }, [el('span', { text: '›' })])
    ]);
  }

  // ---------- carte des taches du jour (tout en haut) ----------
  function dayTasksCard() {
    var el = U().el;
    var list = S.tasksOf(date());
    if (!list.length) return null;
    var left = list.filter(function (t) { return !t.done; }).length;

    var ul = el('ul', {}, list.map(function (t) {
      return el('li', { class: t.done ? 'done' : '' }, [
        el('button', {
          class: 'box', 'aria-label': 'Marquer faite',
          onclick: function () { S.updateTask(t.id, { done: !t.done }); }
        }, [el('span', { text: '✓' })]),
        el('span', { class: 't', text: t.text })
      ]);
    }));

    return el('div', { class: 'card daytasks' }, [
      el('div', { class: 'hd' }, [
        el('span', { text: 'à faire ce jour-là' }),
        el('span', { text: left ? left + ' restante' + (left > 1 ? 's' : '') : 'tout est fait' }),
        el('button', { class: 'go', onclick: function () { App.go('tasks'); } }, [
          el('span', { text: 'ouvrir' }), el('span', { text: '›' })
        ])
      ]),
      ul
    ]);
  }

  // ---------- carte du score ----------
  function scoreCard() {
    var el = U().el, u = U();
    var d = date();
    var st = S.dayStats(d);
    var goal = S.state.settings.dailyGoal;
    var cls = u.scoreClass(st.filled || st.done > 0 ? st.score : null, goal);
    var shown = (st.filled || st.done > 0) && st.score !== null;

    var state = !shown ? 'à remplir'
      : st.score >= goal ? 'dans les rails' : 'hors des rails';

    return el('div', { class: 'card score ' + cls }, [
      el('div', { class: 'big' }, shown
        ? [document.createTextNode(u.pct(st.score)), el('small', { text: '%' })]
        : [document.createTextNode('—')]),
      el('div', { class: 'state' }, [el('i'), el('span', { text: state })]),
      el('div', { class: 'bar' }, [
        el('div', { class: 'fill', style: 'width:' + (shown ? Math.max(0, Math.min(100, st.score)) : 0) + '%' }),
        el('div', { class: 'mark', style: 'left:' + goal + '%', title: 'Objectif ' + goal + ' %' })
      ]),
      el('div', { class: 'meta' }, [
        el('span', { text: st.done + ' / ' + st.counted + ' validées' }),
        el('span', { text: 'Objectif ' + goal + ' %' })
      ])
    ]);
  }

  // ---------- une habitude ----------
  function habitRow(h) {
    var el = U().el;
    var d = date();
    var e = S.getEntry(d, h.id);
    var ok = S.isValidated(h, e, d);
    var goal = S.goalFor(h, d);

    var cls = 'habit' + (ok ? ' is-done' : '') + (justDone === h.id ? ' just-done' : '');
    var kids = [];

    kids.push(el('button', {
      class: 'hit', 'aria-label': (ok ? 'Décocher ' : 'Valider ') + h.name,
      'aria-pressed': String(ok),
      onclick: function () {
        justDone = ok ? null : h.id;
        S.toggleHabit(d, h);
        setTimeout(function () { justDone = null; }, 400);
      }
    }, [el('span', { class: 'tick', text: '✓' })]));

    var sub = h.type === 'duration' ? 'objectif ' + S.fmtDuration(goal, h.unit || 'min')
      : h.type === 'time' ? 'avant ' + S.minutesToHHMM(goal)
        : null;
    kids.push(el('div', { class: 'txt' }, [
      el('div', { class: 'nm', text: h.name }),
      sub ? el('div', { class: 'sub', text: sub }) : null
    ]));

    if (h.type === 'duration') kids.push(durationInput(h, e, d));
    if (h.type === 'time') kids.push(timeInput(h, e, d));

    return el('div', { class: cls }, kids);
  }

  function durationInput(h, e, d) {
    var el = U().el;
    var unit = h.unit || 'min';
    var step = h.step || (unit === 'h' ? 0.5 : 5);
    var cur = (e && e.value !== null && e.value !== undefined) ? S.toDisplay(e.value, unit) : null;

    function write(displayVal) {
      if (displayVal === null || isNaN(displayVal) || displayVal <= 0) {
        S.setEntry(d, h.id, { value: null, done: false });
      } else {
        S.setEntry(d, h.id, { value: S.fromDisplay(displayVal, unit), done: true });
      }
    }

    var input = el('input', {
      type: 'number', inputmode: 'decimal', step: String(step), min: '0',
      value: cur === null ? '' : S.fmtNum(cur).replace(',', '.'),
      'aria-label': h.name + ' : valeur',
      onchange: function () { write(this.value === '' ? null : parseFloat(this.value)); }
    });

    return el('div', { class: 'stepper' }, [
      el('button', {
        'aria-label': 'Moins', text: '−',
        onclick: function () { write(Math.max(0, (cur === null ? step : cur) - step)); }
      }),
      input,
      el('button', {
        'aria-label': 'Plus', text: '+',
        onclick: function () { write((cur === null ? 0 : cur) + step); }
      }),
      el('span', { class: 'u', text: unit })
    ]);
  }

  function timeInput(h, e, d) {
    var el = U().el;
    var has = e && e.value !== null && e.value !== undefined;
    return el('div', { class: 'stepper' }, [
      el('input', {
        type: 'time', class: 'timein', value: has ? S.minutesToHHMM(e.value) : '',
        'aria-label': h.name + ' : heure',
        onchange: function () {
          var m = S.hhmmToMinutes(this.value);
          S.setEntry(d, h.id, { value: m, done: m !== null });
        }
      }),
      el('button', {
        class: 'plus1', text: '+1j', title: 'Après minuit (le lendemain)',
        'aria-pressed': String(!!(e && e.plusDay)),
        onclick: function () { S.setEntry(d, h.id, { plusDay: !(e && e.plusDay) }); }
      })
    ]);
  }

  /* ---------- le tout premier lancement ----------
     Un etat neuf n'a plus aucune habitude (voir emptyState dans
     js/store.js) : sans cet ecran, la personne qui installe l'app
     tomberait sur une page vide et croirait a une panne.

     Deux chemins seulement, et le second compte autant que le premier :
     tout le monde n'a pas envie de vivre selon les habitudes de
     quelqu'un d'autre. */
  function welcome() {
    var el = U().el;
    var i = App.sync ? App.sync.info() : { status: 'off' };

    // Connecte mais pas encore synchronise : ses habitudes sont dans le
    // cloud et arrivent. Ne surtout pas lui proposer d'en creer d'autres.
    if (i.email && (i.status === 'syncing' || i.status === 'ready')) {
      return el('div', { class: 'empty-note', style: 'margin-top:30px' }, [
        el('div', { text: 'Récupération de tes habitudes…' }),
        el('div', { class: 'hint', text: 'Elles reviennent du cloud, ça prend quelques secondes.' })
      ]);
    }

    return el('div', { class: 'card', style: 'padding:18px;margin-top:18px' }, [
      el('div', { style: 'font-size:17px;font-weight:600;margin-bottom:6px', text: 'Bienvenue dans Le Système' }),
      el('div', {
        class: 'hint', style: 'margin-bottom:18px',
        text: 'Tu coches tes habitudes chaque jour, l’app calcule ton score et te montre ta progression. Pour commencer, il faut une liste d’habitudes.'
      }),
      el('div', { style: 'display:flex;flex-direction:column;gap:10px' }, [
        el('button', {
          class: 'btn btn-gold btn-block', text: 'Partir d’un modèle',
          onclick: function () {
            var n = S.seedFromTemplate();
            U().toast(n + ' habitudes ajoutées. Modifie-les comme tu veux dans l’onglet Système.');
          }
        }),
        el('div', {
          class: 'hint', style: 'margin:0 0 6px',
          text: '14 habitudes réparties entre matin, journée et soir. Tout est modifiable, renommable et supprimable ensuite.'
        }),
        el('button', {
          class: 'btn btn-block', text: 'Partir de zéro',
          onclick: function () { App.go('system'); }
        }),
        el('div', {
          class: 'hint', style: 'margin:0',
          text: 'Tu construis ta propre liste, une habitude à la fois, depuis l’onglet Système.'
        })
      ]),
      el('div', {
        class: 'hint', style: 'margin-top:18px;padding-top:14px;border-top:1px solid var(--line-soft)',
        text: 'Tu as déjà un compte ? Connecte-toi dans l’onglet Système : tes habitudes et ton historique reviendront tout seuls.'
      })
    ]);
  }

  // ---------- rendu complet ----------
  function render(root) {
    var el = U().el;
    U().clear(root);
    var d = date();

    // Aucune habitude n'a jamais existe sur cet appareil : premier lancement.
    if (!S.state.habits.length) {
      root.appendChild(welcome());
      return;
    }

    root.appendChild(dayNav());
    var tasks = dayTasksCard();
    if (tasks) root.appendChild(tasks);
    root.appendChild(scoreCard());

    var any = false;
    S.SECTIONS.forEach(function (sec) {
      var list = S.habitsOfSection(sec.id).filter(function (h) { return S.countsOn(h, d); });
      if (!list.length) return;
      any = true;
      root.appendChild(el('div', { class: 'section-label' }, [el('span', { text: sec.label })]));
      root.appendChild(el('div', { class: 'habits' }, list.map(habitRow)));
    });

    if (!any) {
      var future = d > S.today();
      var before = S.allHabits().some(function (h) { return d < h.createdAt.slice(0, 10); });
      root.appendChild(el('div', { class: 'empty-note', style: 'margin-top:22px' }, [
        el('div', { text: 'Aucune habitude prévue ce jour-là.' }),
        el('div', {
          class: 'hint',
          text: future ? 'On verra ça le moment venu.'
            : before ? 'Ce jour est antérieur à la création de tes habitudes : il reste vierge, exprès, pour ne pas fausser tes anciennes statistiques.'
              : 'Va dans l’onglet Système pour en ajouter, ou pour cocher ce jour de la semaine.'
        })
      ]));
    }
  }

  return { render: render, resetToToday: resetToToday, goToDate: function (d) { cursor = d; } };
})();
