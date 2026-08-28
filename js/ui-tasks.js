/* =========================================================
   LE SYSTEME - onglet "Taches"
   La boite a idees (en vrac) + la semaine.
   Deplacement : glisser (souris ET doigt) ou petit selecteur.
   ========================================================= */

App.views = App.views || {};

App.views.tasks = (function () {
  'use strict';

  var S = App.store;
  var UI_KEY = 'lesysteme.ui';
  var weekStart = null;
  var hideDone = false;

  function U() { return App.ui; }

  try {
    var saved = JSON.parse(localStorage.getItem(UI_KEY) || '{}');
    hideDone = !!saved.hideDone;
  } catch (e) { }
  function saveUi() {
    try { localStorage.setItem(UI_KEY, JSON.stringify({ hideDone: hideDone })); } catch (e) { }
  }

  function week() { return weekStart || (weekStart = S.startOfWeek(S.today())); }

  function weekLabel() {
    var a = S.parseISO(week()), b = S.parseISO(S.addDays(week(), 6));
    var MA = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
      'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    if (a.getMonth() === b.getMonth()) {
      return a.getDate() + ' – ' + b.getDate() + ' ' + MA[b.getMonth()];
    }
    return a.getDate() + ' ' + MA[a.getMonth()] + ' – ' + b.getDate() + ' ' + MA[b.getMonth()];
  }

  function visible(list) {
    return hideDone ? list.filter(function (t) { return !t.done; }) : list;
  }

  // ---------------------------------------------------------
  // Glisser-deposer, souris et doigt (Pointer Events)
  // ---------------------------------------------------------
  var drag = null;

  function startDrag(ev, task, node) {
    if (ev.button !== undefined && ev.button !== 0) return;
    ev.preventDefault();
    var ghost = U().el('div', { class: 'drag-ghost', text: task.text });
    document.body.appendChild(ghost);
    node.classList.add('dragging');
    drag = { task: task, node: node, ghost: ghost, target: null };
    moveGhost(ev);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }
  function moveGhost(ev) {
    drag.ghost.style.left = (ev.clientX + 12) + 'px';
    drag.ghost.style.top = (ev.clientY - 14) + 'px';
  }
  function onMove(ev) {
    if (!drag) return;
    moveGhost(ev);
    var under = document.elementFromPoint(ev.clientX, ev.clientY);
    var zone = under && under.closest ? under.closest('[data-drop]') : null;
    if (drag.target !== zone) {
      if (drag.target) drag.target.classList.remove('drop-on');
      drag.target = zone;
      if (zone) zone.classList.add('drop-on');
    }
  }
  function onUp() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    if (!drag) return;
    var d = drag; drag = null;
    d.ghost.remove();
    d.node.classList.remove('dragging');
    if (d.target) {
      d.target.classList.remove('drop-on');
      var dest = d.target.dataset.drop;
      S.moveTask(d.task.id, dest === 'inbox' ? null : dest, null);
    } else {
      App.render();
    }
  }

  // ---------------------------------------------------------
  // Petit selecteur "deplacer vers" (pratique au pouce)
  // ---------------------------------------------------------
  function movePicker(task) {
    var el = U().el;
    U().openModal('Déplacer « ' + task.text + ' »', function (box, api) {
      box.appendChild(el('span', { class: 'lab first', text: 'vers' }));
      var chips = [el('button', {
        class: 'chip', text: 'En vrac', 'aria-pressed': String(!task.date),
        onclick: function () { S.moveTask(task.id, null, null); api.close(); }
      })];
      S.rangeDates(week(), S.addDays(week(), 6)).forEach(function (d) {
        chips.push(el('button', {
          class: 'chip', 'aria-pressed': String(task.date === d),
          text: S.ISO_SHORT[S.isoWeekday(d)] + ' ' + S.parseISO(d).getDate(),
          onclick: function () { S.moveTask(task.id, d, null); api.close(); }
        }));
      });
      box.appendChild(el('div', { class: 'chips' }, chips));

      box.appendChild(el('span', { class: 'lab', text: 'la tâche' }));
      box.appendChild(el('input', {
        class: 'field', value: task.text, 'aria-label': 'Texte de la tâche',
        onchange: function () { S.updateTask(task.id, { text: this.value.trim() || task.text }); }
      }));

      box.appendChild(el('div', { class: 'acts' }, [
        el('button', {
          class: 'btn btn-danger', text: 'Supprimer',
          onclick: function () { S.removeTask(task.id); api.close(); }
        }),
        el('button', { class: 'btn btn-gold', text: 'Fermer', onclick: api.close })
      ]));
    }, { noFocus: true });
  }

  // ---------------------------------------------------------
  // Une tache
  // ---------------------------------------------------------
  function taskNode(t) {
    var el = U().el;
    var node = el('div', { class: 'task' + (t.done ? ' done' : ''), dataset: { id: t.id } }, [
      el('span', { class: 'grip', text: '⠿', title: 'Glisser pour déplacer' }),
      el('button', {
        class: 'box', 'aria-label': 'Marquer faite', 'aria-pressed': String(t.done),
        onclick: function () { S.updateTask(t.id, { done: !t.done }); }
      }, [el('span', { text: '✓' })]),
      el('span', { class: 't', text: t.text }),
      el('button', {
        class: 'mv', text: '⋯', 'aria-label': 'Déplacer ou modifier',
        onclick: function () { movePicker(t); }
      })
    ]);
    var grip = node.querySelector('.grip');
    grip.addEventListener('pointerdown', function (ev) { startDrag(ev, t, node); });
    return node;
  }

  // ---------------------------------------------------------
  // Rendu
  // ---------------------------------------------------------
  function render(root) {
    var el = U().el;
    U().clear(root);

    // --- barre d'ajout ---
    var input = el('input', {
      class: 'field', placeholder: 'Une idée, une tâche… puis Entrée',
      'aria-label': 'Nouvelle tâche',
      onkeydown: function (ev) {
        if (ev.key === 'Enter') { add(this); }
      }
    });
    function add(field) {
      var v = (field || input).value.trim();
      if (!v) return;
      S.addTask(v, null);
      input.value = '';
      setTimeout(function () {
        var f = root.querySelector('.addbar .field');
        if (f) f.focus();
      }, 40);
    }
    root.appendChild(el('div', { class: 'addbar' }, [
      input,
      el('button', { class: 'btn btn-gold', text: 'Ajouter', onclick: function () { add(); } })
    ]));

    // --- en vrac ---
    var inboxAll = S.tasksOf(null);
    var inbox = visible(inboxAll);
    root.appendChild(el('div', { class: 'section-label' }, [
      el('span', { text: 'en vrac' }),
      el('span', { text: String(inboxAll.length), style: 'color:#61616b' })
    ]));
    var inboxBox = el('div', {
      class: 'inbox' + (inbox.length ? '' : ' is-empty'), dataset: { drop: 'inbox' }
    }, inbox.length ? inbox.map(taskNode) : [
      el('div', { class: 'faint', style: 'font-size:13px;line-height:1.6' },
        [document.createTextNode('Tout ce que tu notes ici attend son jour. Attrape une tâche par sa poignée et dépose-la sur la semaine.')])
    ]);
    root.appendChild(inboxBox);

    // --- navigation de semaine ---
    root.appendChild(el('div', { class: 'weeknav' }, [
      el('button', {
        class: 'icon-btn', 'aria-label': 'Semaine précédente', text: '‹',
        onclick: function () { weekStart = S.addDays(week(), -7); App.render(); }
      }),
      el('div', { class: 'lbl', text: weekLabel() }),
      el('button', {
        class: 'icon-btn', 'aria-label': 'Semaine suivante', text: '›',
        onclick: function () { weekStart = S.addDays(week(), 7); App.render(); }
      })
    ]));

    // --- les 7 jours ---
    var grid = el('div', { class: 'week' });
    S.rangeDates(week(), S.addDays(week(), 6)).forEach(function (d) {
      var all = S.tasksOf(d);
      var list = visible(all);
      var done = all.filter(function (t) { return t.done; }).length;
      var isToday = d === S.today();
      var box = el('div', {
        class: 'day' + (isToday ? ' is-today' : ''), dataset: { drop: d }
      }, [
        el('div', { class: 'dhd' }, [
          el('span', { text: S.ISO_SHORT[S.isoWeekday(d)] + ' ' + S.parseISO(d).getDate() }),
          all.length ? el('span', { class: 'cnt', text: done + '/' + all.length }) : null
        ])
      ]);
      if (list.length) list.forEach(function (t) { box.appendChild(taskNode(t)); });
      else box.appendChild(el('div', { class: 'empty', text: '—' }));
      grid.appendChild(box);
    });
    root.appendChild(grid);

    // --- pied de page ---
    var doneCount = S.liveTasks().filter(function (t) { return t.done; }).length;
    root.appendChild(el('div', { class: 'taskfoot' }, [
      el('button', {
        class: 'btn btn-sm', 'aria-pressed': String(hideDone),
        text: hideDone ? 'Afficher les tâches faites' : 'Masquer les tâches faites',
        onclick: function () { hideDone = !hideDone; saveUi(); App.render(); }
      }),
      el('button', {
        class: 'btn btn-sm btn-danger', text: 'Supprimer les tâches faites',
        disabled: !doneCount,
        onclick: function () {
          U().confirmBox('Supprimer les tâches faites ?',
            doneCount + ' tâche' + (doneCount > 1 ? 's' : '') + ' cochée' + (doneCount > 1 ? 's' : '') +
            ' vont disparaître de la liste. Tes habitudes et tes statistiques ne bougent pas.',
            'Supprimer', function () {
              var n = S.clearDoneTasks();
              U().toast(n + ' tâche' + (n > 1 ? 's' : '') + ' rangée' + (n > 1 ? 's' : ''));
            });
        }
      }),
      week() !== S.startOfWeek(S.today())
        ? el('button', {
          class: 'btn btn-sm', text: 'Revenir à cette semaine',
          onclick: function () { weekStart = S.startOfWeek(S.today()); App.render(); }
        })
        : null
    ]));
  }

  return { render: render };
})();
