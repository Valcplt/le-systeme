/* =========================================================
   LE SYSTEME - app.js
   Assemble le tout : outils communs, onglets, demarrage.
   Charge en DERNIER (voir index.html).
   ========================================================= */

(function () {
  'use strict';

  var S = App.store;

  // ---------------------------------------------------------
  // Petits outils partages par tous les onglets
  // ---------------------------------------------------------
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'html') n.innerHTML = v;
        else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'dataset') { for (var d in v) n.dataset[d] = v[d]; }
        else n.setAttribute(k, v === true ? '' : v);
      }
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  // ---------- fenetre modale ----------
  var modalRoot = null;
  function openModal(title, buildBody, opts) {
    opts = opts || {};
    modalRoot = document.getElementById('modal-root');
    clear(modalRoot);
    modalRoot.hidden = false;

    var box = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' });
    box.appendChild(el('h2', { text: title }));
    var api = { close: closeModal, box: box };
    buildBody(box, api);

    modalRoot.appendChild(el('div', { class: 'modal-bg', onclick: function () { if (!opts.sticky) closeModal(); } }));
    modalRoot.appendChild(box);
    document.body.style.overflow = 'hidden';
    setTimeout(function () {
      var f = box.querySelector('input,select,button');
      if (f && !opts.noFocus) f.focus();
    }, 60);
    return api;
  }
  function closeModal() {
    var r = document.getElementById('modal-root');
    clear(r); r.hidden = true;
    document.body.style.overflow = '';
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  function confirmBox(title, message, confirmLabel, onYes) {
    openModal(title, function (box, api) {
      box.appendChild(el('p', { class: 'hint', text: message, style: 'font-size:14px;color:#9a9aa4;margin:0' }));
      box.appendChild(el('div', { class: 'acts' }, [
        el('button', { class: 'btn', text: 'Annuler', onclick: api.close }),
        el('button', {
          class: 'btn btn-gold', text: confirmLabel,
          onclick: function () { api.close(); onYes(); }
        })
      ]));
    }, { noFocus: true });
  }

  // ---------- helpers d'affichage ----------
  function pct(v, dec) {
    if (v === null || v === undefined) return null;
    var d = dec === undefined ? 1 : dec;
    var r = v.toFixed(d);
    if (d > 0 && r.slice(-2) === '.0') r = r.slice(0, -2);
    return r.replace('.', ',');
  }
  function scoreClass(score, goal) {
    if (score === null) return 'is-empty';
    if (score >= goal) return 'is-ok';
    if (score >= goal - 15) return 'is-warn';
    return 'is-bad';
  }
  function habitSubtitle(h) {
    var bits = [];
    if (h.type === 'binary') bits.push('binaire');
    else if (h.type === 'duration') bits.push('≥ ' + S.fmtDuration(h.goal || 0, h.unit || 'min'));
    else if (h.type === 'time') bits.push('avant ' + S.minutesToHHMM(h.goal || 0));
    if (h.type !== 'binary' && h.goalWeekend !== null && h.goalWeekend !== undefined) {
      bits.push((h.type === 'duration'
        ? '≥ ' + S.fmtDuration(h.goalWeekend, h.unit || 'min')
        : 'avant ' + S.minutesToHHMM(h.goalWeekend)) + ' le week-end');
    }
    if (h.days.length < 7) {
      bits.push(h.days.slice().sort().map(function (d) { return S.ISO_SHORT[d]; }).join(' '));
    }
    if (!h.active) bits.push('désactivé');
    return bits.join(' · ');
  }

  /* "il y a 3 min", "hier" : plus parlant qu'une date complete pour dire
     quand la derniere synchro a eu lieu. */
  function ago(iso) {
    if (!iso) return 'jamais';
    var s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 45) return 'à l’instant';
    if (s < 5400) return 'il y a ' + Math.round(s / 60) + ' min';
    if (s < 172800) return 'il y a ' + Math.round(s / 3600) + ' h';
    return 'il y a ' + Math.round(s / 86400) + ' jours';
  }

  App.ui = {
    el: el, clear: clear, toast: toast,
    openModal: openModal, closeModal: closeModal, confirmBox: confirmBox,
    pct: pct, scoreClass: scoreClass, habitSubtitle: habitSubtitle, ago: ago
  };

  // ---------------------------------------------------------
  // Le temoin de synchronisation, en haut a droite
  // ---------------------------------------------------------
  var LAMP = {
    ready: ['●', 'à jour'],
    syncing: ['●', 'synchro…'],
    offline: ['○', 'hors ligne'],
    signedout: ['○', 'non connecté'],
    error: ['▲', 'problème']
  };
  function drawLamp() {
    var n = document.getElementById('synclamp');
    var i = App.sync ? App.sync.info() : { status: 'off' };
    if (i.status === 'off') { n.hidden = true; return; }
    n.hidden = false;
    var d = LAMP[i.status] || LAMP.error;
    n.className = 'synclamp s-' + i.status;
    n.title = i.status === 'ready' ? 'Synchronisé ' + ago(i.lastSyncAt)
      : i.status === 'error' ? 'Synchro impossible : ' + (i.error || '')
        : d[1];
    clear(n);
    n.appendChild(el('i', { text: '' }));
    n.appendChild(el('span', { class: 'lamptxt', text: d[1] }));
    n.onclick = function () { go('system'); };
  }

  // ---------------------------------------------------------
  // Onglets
  // ---------------------------------------------------------
  var TABS = [
    { id: 'today', label: 'Aujourd’hui', short: 'Jour', ico: '●' },
    { id: 'tasks', label: 'Tâches', short: 'Tâches', ico: '☰' },
    { id: 'progress', label: 'Progression', short: 'Progr.', ico: '◧' },
    { id: 'system', label: 'Système', short: 'Syst.', ico: '⚙' }
  ];
  var current = 'today';

  function buildTabs() {
    var top = document.getElementById('tabs-top');
    var bot = document.getElementById('tabs-bottom');
    clear(top); clear(bot);
    TABS.forEach(function (t) {
      top.appendChild(el('button', {
        class: 'tab', 'aria-current': String(t.id === current),
        text: t.label, onclick: function () { go(t.id); }
      }));
      bot.appendChild(el('button', {
        class: 'tab', 'aria-current': String(t.id === current),
        onclick: function () { go(t.id); }
      }, [
        el('span', { class: 'ico', text: t.ico }),
        el('span', { text: t.short }),
        el('span', { class: 'dot' })
      ]));
    });
  }

  function go(id) {
    current = id;
    TABS.forEach(function (t) {
      document.getElementById('view-' + t.id).hidden = (t.id !== id);
    });
    buildTabs();
    window.scrollTo(0, 0);
    render();
  }
  App.go = go;

  // ---------------------------------------------------------
  // Rendu
  // ---------------------------------------------------------
  var rafPending = false;
  function render() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () {
      rafPending = false;
      var v = App.views[current];
      if (v && v.render) v.render(document.getElementById('view-' + current));
      drawLamp();
    });
  }
  App.render = render;

  // ---------------------------------------------------------
  // Demarrage
  // ---------------------------------------------------------
  S.load();
  S.onChange(render);
  buildTabs();
  go('today');
  if (App.sync) App.sync.init();
  /* On se contente de RELEVER l'etat des rappels ; on ne demande jamais
     la permission ici. Une demande qui surgit a l'ouverture est refusee
     par reflexe, et le navigateur ne la represente plus jamais. Elle
     part donc d'un bouton, dans l'onglet Systeme. */
  if (App.notif) App.notif.init();

  /* Le mode hors ligne. Ne s'active qu'en ligne (pas en double-cliquant
     le fichier) : c'est une contrainte des navigateurs, pas un choix.
     Rappel : sw.js ne met en cache que le CODE, jamais les donnees. */
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (e) {
        console.warn('Mode hors ligne indisponible', e);
      });
    });

    /* Quand on tape sur un rappel, le service worker ramene l'app au
       premier plan puis dit ici quel onglet ouvrir. Un rappel de taches
       qui atterrit sur l'onglet Taches evite une manipulation. */
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'aller-onglet' && e.data.tab) go(e.data.tab);
    });
  }

  // Si l'app reste ouverte pendant la nuit, on rebascule sur le bon jour.
  var lastDay = S.today();
  setInterval(function () {
    var d = S.today();
    if (d !== lastDay) { lastDay = d; App.views.today.resetToToday(); render(); }
  }, 60000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      var d = S.today();
      if (d !== lastDay) { lastDay = d; App.views.today.resetToToday(); }
      render();
    }
  });
})();
