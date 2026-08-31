/* =========================================================
   LE SYSTEME - store.js
   Le "cerveau" : les donnees + le calcul du score.
   Aucune dependance. Scripts classiques (pas de modules ES),
   pour que l'app fonctionne aussi en double-cliquant index.html.
   ========================================================= */

var App = window.App || {};
window.App = App;

(function () {
  'use strict';

  // ---------------------------------------------------------
  // REGLE D'OR : on n'efface jamais de donnees.
  // Toute evolution du format se fait dans migrate(), de facon
  // additive. Voir CLAUDE.md, section "Regles d'or".
  // ---------------------------------------------------------
  var STORAGE_KEY = 'lesysteme.data';
  var SCHEMA_VERSION = 2;   // 2 : reglages des rappels (31 aout 2026)

  /* Les valeurs par defaut des rappels, au meme endroit pour la creation
     et pour la migration : deux listes separees finiraient par diverger. */
  var RAPPELS_DEFAUT = {
    notifEnabled: true,
    remindTasksAt: 12 * 60,   // 12:00, en minutes depuis minuit
    remindFillAt: 21 * 60     // 21:00
  };

  var DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var DAY_SHORT = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
  var MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var MONTHS_ACC = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
    'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  // 1 = lundi ... 7 = dimanche (norme ISO, celle qu'on utilise partout)
  var ISO_SHORT = { 1: 'lun', 2: 'mar', 3: 'mer', 4: 'jeu', 5: 'ven', 6: 'sam', 7: 'dim' };
  var SECTIONS = [
    { id: 'morning', label: 'Matin' },
    { id: 'day', label: 'Journée' },
    { id: 'evening', label: 'Soir' }
  ];

  // ---------- petits utilitaires de date ----------
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function iso(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function parseISO(s) {
    var p = String(s).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function today() { return iso(new Date()); }
  function addDays(s, n) {
    var d = parseISO(s); d.setDate(d.getDate() + n); return iso(d);
  }
  function isoWeekday(s) {          // 1 = lundi ... 7 = dimanche
    var g = parseISO(s).getDay();   // 0 = dimanche
    return g === 0 ? 7 : g;
  }
  function startOfWeek(s) { return addDays(s, -(isoWeekday(s) - 1)); }
  function startOfMonth(s) { var d = parseISO(s); return iso(new Date(d.getFullYear(), d.getMonth(), 1)); }
  function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }
  function rangeDates(from, to) {
    var out = [], c = from;
    var guard = 0;
    while (c <= to && guard++ < 20000) { out.push(c); c = addDays(c, 1); }
    return out;
  }
  function longDate(s) {
    var d = parseISO(s);
    return DAY_NAMES[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }
  function shortDate(s) {
    var d = parseISO(s);
    return d.getDate() + ' ' + MONTHS_ACC[d.getMonth()];
  }
  function uid() {
    return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function now() { return new Date().toISOString(); }

  // ---------- mise en forme des valeurs ----------
  function fmtNum(n) {
    var r = Math.round(n * 10) / 10;
    return String(r).replace('.', ',');
  }
  function minutesToHHMM(m) {
    m = ((Math.round(m) % 1440) + 1440) % 1440;
    return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
  }
  function hhmmToMinutes(s) {
    if (!s) return null;
    var p = String(s).split(':');
    if (p.length < 2) return null;
    var h = parseInt(p[0], 10), m = parseInt(p[1], 10);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  }
  // Une duree est TOUJOURS stockee en minutes ; l'unite ne sert qu'a l'affichage.
  function toDisplay(min, unit) { return unit === 'h' ? min / 60 : min; }
  function fromDisplay(v, unit) { return unit === 'h' ? Math.round(v * 60) : Math.round(v); }
  function fmtDuration(min, unit) { return fmtNum(toDisplay(min, unit)) + ' ' + unit; }

  // ---------- les habitudes de depart ----------
  function seedHabits() {
    var ALL = [1, 2, 3, 4, 5, 6, 7];
    /* Les identifiants sont FIXES et non tires au hasard : deux appareils
       fraichement installes fabriquent donc exactement les memes habitudes
       de depart. Sans cela, brancher le second appareil sur le cloud
       creerait 14 doublons. Ne jamais renommer un de ces identifiants. */
    var raw = [
      // id, section, nom, type, objectif, unite, jours, actif, objectif week-end
      ['seed-lever', 'morning', 'Lever', 'time', 6 * 60 + 40, null, ALL, false, 7 * 60 + 40],
      ['seed-douche-froide', 'morning', 'Douche froide', 'binary', null, null, ALL, true, null],
      ['seed-meditation-matin', 'morning', 'Méditation du matin', 'binary', null, null, [3, 4, 5, 6, 7], true, null],
      ['seed-planifier', 'morning', 'Planifier la journée', 'binary', null, null, ALL, false, null],
      ['seed-sommeil', 'morning', 'Sommeil', 'duration', 450, 'h', ALL, true, null],
      ['seed-sport', 'day', 'Sport', 'duration', 30, 'min', ALL, false, null],
      ['seed-deep-work', 'day', 'Deep Work', 'duration', 60, 'min', [1, 2, 3, 4, 5], true, null],
      ['seed-manger-sain', 'day', 'Manger sain', 'binary', null, null, ALL, true, null],
      ['seed-no-fap', 'day', 'No FAP', 'binary', null, null, ALL, true, null],
      ['seed-reload-dimanche', 'day', 'Reload du dimanche', 'binary', null, null, [7], true, null],
      ['seed-lecture', 'evening', 'Lecture', 'duration', 20, 'min', ALL, true, null],
      ['seed-meditation-soir', 'evening', 'Méditation du soir', 'binary', null, null, ALL, true, null],
      ['seed-tracking', 'evening', 'Tracking', 'binary', null, null, ALL, true, null],
      ['seed-coucher', 'evening', 'Coucher', 'time', 23 * 60 + 30, null, ALL, true, null]
    ];
    var pos = { morning: 0, day: 0, evening: 0 };
    /* Les habitudes de depart sont antidatees d'un mois. Sans cela, la
       regle "une habitude ne compte pas avant sa creation" empecherait de
       renseigner ne serait-ce qu'hier le jour de l'installation.
       Aucun effet sur les moyennes : un jour non rempli ne compte pas. */
    var back = new Date(); back.setDate(back.getDate() - 30);
    var t = back.toISOString();
    /* updatedAt volontairement place au plus loin dans le passe : une
       habitude de depart doit TOUJOURS perdre face a la version du cloud.
       Sinon, installer l'app sur un appareil neuf pourrait ecraser un nom
       ou un objectif modifie il y a longtemps, la "modification la plus
       recente" etant alors celle de l'installation. */
    var JAMAIS_MODIFIEE = '1970-01-01T00:00:00.000Z';
    return raw.map(function (r) {
      return {
        id: r[0],
        name: r[2],
        section: r[1],
        type: r[3],
        goal: r[4],
        goalWeekend: r[8],
        unit: r[5],
        step: r[5] === 'h' ? 0.5 : 5,
        days: r[6].slice(),
        active: r[7],
        position: pos[r[1]]++,
        createdAt: t,
        updatedAt: JAMAIS_MODIFIEE,
        deletedAt: null
      };
    });
  }

  /* Un etat neuf ne contient AUCUNE habitude, volontairement.
     Les 14 habitudes ci-dessus sont celles de Valentin : les poser
     d'office ferait heriter n'importe quel nouvel arrivant de la vie
     de quelqu'un d'autre. C'est desormais un choix, propose au premier
     lancement (voir seedFromTemplate et l'ecran d'accueil de
     js/ui-today.js). */
  function emptyState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      settings: {
        dailyGoal: 85,
        notifEnabled: RAPPELS_DEFAUT.notifEnabled,
        remindTasksAt: RAPPELS_DEFAUT.remindTasksAt,
        remindFillAt: RAPPELS_DEFAUT.remindFillAt,
        updatedAt: now()
      },
      habits: [],
      entries: {},   // cle "AAAA-MM-JJ|idHabitude" -> enregistrement
      tasks: [],
      meta: { createdAt: now() }
    };
  }

  /* Adopter le modele de depart. Ne fait rien si des habitudes existent
     deja : ce bouton ne doit jamais pouvoir doubler une liste en place. */
  function seedFromTemplate() {
    if (state.habits.length) return 0;
    state.habits = seedHabits();
    save();
    return state.habits.length;
  }

  // ---------- chargement / sauvegarde ----------
  var state = null;
  var listeners = [];
  var saveTimer = null;

  function migrate(s) {
    if (!s || typeof s !== 'object') return emptyState();
    var v = s.schemaVersion || 0;

    /* --- version 1 -> 2 : les reglages des rappels ---
       Purement additif : on pose trois champs manquants avec leur valeur
       par defaut. Aucune donnee existante n'est lue, modifiee ni relue de
       travers. Une sauvegarde exportee avant aujourd'hui repasse donc ici
       sans encombre.
       On ne touche PAS a settings.updatedAt : le faire ferait croire a la
       synchronisation que ces reglages viennent d'etre changes sur cet
       appareil, et ils ecraseraient ceux d'un autre appareil ou ils
       auraient ete regles pour de vrai. */
    if (v < 2) {
      if (s.settings) {
        for (var champ in RAPPELS_DEFAUT) {
          if (s.settings[champ] === undefined) s.settings[champ] = RAPPELS_DEFAUT[champ];
        }
      }
      v = 2;
    }

    if (v > SCHEMA_VERSION) {
      // Donnees ecrites par une version PLUS RECENTE de l'app : on ne
      // les abime pas, on les laisse telles quelles.
      console.warn('Donnees plus recentes que cette version de l’app.');
      return s;
    }
    s.schemaVersion = SCHEMA_VERSION;
    if (!s.settings) s.settings = { dailyGoal: 85, updatedAt: now() };
    if (typeof s.settings.dailyGoal !== 'number') s.settings.dailyGoal = 85;
    if (typeof s.settings.notifEnabled !== 'boolean') s.settings.notifEnabled = RAPPELS_DEFAUT.notifEnabled;
    if (typeof s.settings.remindTasksAt !== 'number') s.settings.remindTasksAt = RAPPELS_DEFAUT.remindTasksAt;
    if (typeof s.settings.remindFillAt !== 'number') s.settings.remindFillAt = RAPPELS_DEFAUT.remindFillAt;
    if (!Array.isArray(s.habits)) s.habits = [];
    if (!s.entries || typeof s.entries !== 'object') s.entries = {};
    if (!Array.isArray(s.tasks)) s.tasks = [];
    if (!s.meta) s.meta = { createdAt: now() };
    s.habits.forEach(function (h) {
      if (!Array.isArray(h.days)) h.days = [1, 2, 3, 4, 5, 6, 7];
      if (typeof h.position !== 'number') h.position = 0;
      if (h.deletedAt === undefined) h.deletedAt = null;
      if (h.goalWeekend === undefined) h.goalWeekend = null;
      if (!h.createdAt) h.createdAt = s.meta.createdAt;
      if (!h.updatedAt) h.updatedAt = h.createdAt;
    });
    s.tasks.forEach(function (t) {
      if (t.deletedAt === undefined) t.deletedAt = null;
      if (t.date === undefined) t.date = null;
      if (typeof t.position !== 'number') t.position = 0;
    });
    return s;
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { raw = null; }
    if (!raw) { state = emptyState(); persist(); return state; }
    try {
      state = migrate(JSON.parse(raw));
    } catch (e) {
      console.error('Donnees illisibles, sauvegarde de secours conservee.', e);
      try { localStorage.setItem(STORAGE_KEY + '.corrompu.' + Date.now(), raw); } catch (e2) { }
      state = emptyState();
    }
    return state;
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Sauvegarde impossible', e);
      if (App.ui && App.ui.toast) App.ui.toast('Sauvegarde impossible sur cet appareil');
    }
  }

  function save(silent) {
    filledIndex = null;   // les donnees ont bouge : on refera l'index a la demande
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 120);
    if (!silent) emit();
  }

  function emit() {
    listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
  }
  function onChange(fn) { listeners.push(fn); }

  // ---------- habitudes ----------
  function allHabits() {
    return state.habits.filter(function (h) { return !h.deletedAt; });
  }
  function habitsOfSection(section) {
    return allHabits()
      .filter(function (h) { return h.section === section; })
      .sort(function (a, b) { return a.position - b.position; });
  }
  function habitById(id) {
    for (var i = 0; i < state.habits.length; i++) if (state.habits[i].id === id) return state.habits[i];
    return null;
  }
  function habitCreatedDay(h) { return h.createdAt ? h.createdAt.slice(0, 10) : '1970-01-01'; }

  /* Une habitude "compte" un jour donne si :
     - elle est active,
     - elle n'est pas supprimee,
     - ce jour de la semaine est coche pour elle,
     - et ce jour n'est pas anterieur a sa creation. */
  function countsOn(h, date) {
    if (!h.active || h.deletedAt) return false;
    if (h.days.indexOf(isoWeekday(date)) === -1) return false;
    if (date < habitCreatedDay(h)) return false;
    return true;
  }

  function goalFor(h, date) {
    var wd = isoWeekday(date);
    if (wd >= 6 && h.goalWeekend !== null && h.goalWeekend !== undefined) return h.goalWeekend;
    return h.goal;
  }

  function isValidated(h, entry, date) {
    if (!entry) return false;
    if (h.type === 'binary') return entry.done === true;
    if (entry.value === null || entry.value === undefined) return false;
    var g = goalFor(h, date);
    if (g === null || g === undefined) return entry.done === true;
    if (h.type === 'duration') return entry.value >= g;
    if (h.type === 'time') return (entry.plusDay ? entry.value + 1440 : entry.value) <= g;
    return false;
  }

  // ---------- saisies du jour ----------
  function ekey(date, habitId) { return date + '|' + habitId; }
  function getEntry(date, habitId) { return state.entries[ekey(date, habitId)] || null; }

  function setEntry(date, habitId, patch) {
    var k = ekey(date, habitId);
    var e = state.entries[k] || { date: date, habitId: habitId, done: false, value: null, plusDay: false };
    for (var p in patch) if (Object.prototype.hasOwnProperty.call(patch, p)) e[p] = patch[p];
    e.updatedAt = now();
    state.entries[k] = e;
    save();
    return e;
  }

  function toggleHabit(date, h) {
    var e = getEntry(date, h.id);
    if (h.type === 'binary') return setEntry(date, h.id, { done: !(e && e.done) });
    // Pour les types chiffres, la pastille remplit l'objectif d'un coup,
    // ou remet a zero si l'objectif etait deja atteint.
    var ok = isValidated(h, e, date);
    if (ok) return setEntry(date, h.id, { value: null, done: false, plusDay: false });
    return setEntry(date, h.id, { value: goalFor(h, date), done: true, plusDay: false });
  }

  /* Index des jours renseignes, reconstruit seulement quand les donnees
     changent : sans lui, afficher un an de calendrier relirait toutes les
     saisies pour chaque case. */
  var filledIndex = null;
  function buildFilledIndex() {
    filledIndex = {};
    for (var k in state.entries) {
      var e = state.entries[k];
      if (e.done === true || (e.value !== null && e.value !== undefined)) {
        filledIndex[k.slice(0, 10)] = true;
      }
    }
  }
  function isFilled(date) {
    if (!filledIndex) buildFilledIndex();
    return filledIndex[date] === true;
  }

  // ---------- calcul du score ----------
  /* Score du jour = habitudes validees / habitudes qui comptent ce jour-la.
     Renvoie score = null quand aucune habitude ne compte ce jour-la. */
  function dayStats(date) {
    var counted = 0, done = 0;
    state.habits.forEach(function (h) {
      if (!countsOn(h, date)) return;
      counted++;
      if (isValidated(h, getEntry(date, h.id), date)) done++;
    });
    return {
      counted: counted,
      done: done,
      score: counted ? (done / counted) * 100 : null,
      filled: isFilled(date)
    };
  }

  function firstDay() {
    var min = null;
    for (var k in state.entries) {
      var d = k.slice(0, 10);
      if (!min || d < min) min = d;
    }
    var created = state.meta && state.meta.createdAt ? state.meta.createdAt.slice(0, 10) : today();
    if (!min || created < min) min = created;
    return min || today();
  }

  /* Moyenne sur une periode : uniquement les jours renseignes,
     comme dans ton tableur (un jour non rempli ne compte pas comme un zero). */
  function averageOver(from, to) {
    var sum = 0, n = 0;
    rangeDates(from, to).forEach(function (d) {
      var s = dayStats(d);
      if (s.filled && s.score !== null) { sum += s.score; n++; }
    });
    return n ? { avg: sum / n, days: n } : { avg: null, days: 0 };
  }

  function filledDaysCount() {
    return averageOver(firstDay(), today()).days;
  }

  /* Serie en cours : nombre de jours consecutifs (en remontant) ou
     l'objectif quotidien a ete atteint. Si aujourd'hui n'est pas encore
     rempli, on demarre a hier - la serie n'est pas "cassee" par une
     journee en cours. */
  function streak() {
    var goal = state.settings.dailyGoal;
    var d = today();
    if (!dayStats(d).filled) d = addDays(d, -1);
    var n = 0, guard = 0;
    while (guard++ < 3000) {
      var s = dayStats(d);
      if (!s.filled || s.score === null || s.score < goal) break;
      n++; d = addDays(d, -1);
    }
    return n;
  }

  /* Regularite par habitude sur une periode : parmi les jours ou
     l'habitude comptait ET ou la journee a ete renseignee, combien
     de fois a-t-elle ete validee. */
  function regularity(from, to) {
    var dates = rangeDates(from, to).filter(function (d) { return isFilled(d); });
    return allHabits().filter(function (h) { return h.active; }).map(function (h) {
      var tot = 0, ok = 0;
      dates.forEach(function (d) {
        if (!countsOn(h, d)) return;
        tot++;
        if (isValidated(h, getEntry(d, h.id), d)) ok++;
      });
      return { habit: h, total: tot, ok: ok, pct: tot ? (ok / tot) * 100 : null };
    }).filter(function (r) { return r.total > 0; })
      .sort(function (a, b) { return b.pct - a.pct; });
  }

  // ---------- taches ----------
  function liveTasks() {
    return state.tasks.filter(function (t) { return !t.deletedAt; });
  }
  function tasksOf(date) {   // date = "AAAA-MM-JJ" ou null pour "en vrac"
    return liveTasks()
      .filter(function (t) { return (t.date || null) === date; })
      .sort(function (a, b) { return a.position - b.position; });
  }
  function addTask(text, date) {
    var t = {
      id: uid(), text: String(text).trim(), date: date || null, done: false,
      position: tasksOf(date || null).length,
      createdAt: now(), updatedAt: now(), deletedAt: null
    };
    if (!t.text) return null;
    state.tasks.push(t); save(); return t;
  }
  function updateTask(id, patch) {
    var t = null;
    for (var i = 0; i < state.tasks.length; i++) if (state.tasks[i].id === id) t = state.tasks[i];
    if (!t) return null;
    for (var p in patch) if (Object.prototype.hasOwnProperty.call(patch, p)) t[p] = patch[p];
    t.updatedAt = now(); save(); return t;
  }
  function moveTask(id, date, index) {
    var t = updateTask(id, { date: date || null });
    if (!t) return;
    var list = tasksOf(date || null).filter(function (x) { return x.id !== id; });
    if (index === undefined || index === null || index > list.length) index = list.length;
    list.splice(index, 0, t);
    list.forEach(function (x, i) { x.position = i; x.updatedAt = now(); });
    save();
  }
  // Suppression DOUCE : la tache est marquee, jamais effacee.
  function removeTask(id) { updateTask(id, { deletedAt: now() }); }
  function clearDoneTasks() {
    var n = 0;
    liveTasks().forEach(function (t) { if (t.done) { t.deletedAt = now(); t.updatedAt = now(); n++; } });
    save(); return n;
  }

  // ---------- reglages ----------
  function setGoal(v) {
    v = Math.max(0, Math.min(100, Math.round(v)));
    state.settings.dailyGoal = v;
    state.settings.updatedAt = now();
    save();
  }

  /* Les reglages des rappels vivent dans settings, donc ils SUIVENT la
     personne d'un appareil a l'autre : regler 21 h sur le PC vaut aussi
     pour le telephone. Ce qui est propre a l'appareil (etre abonne ou
     non) vit ailleurs, dans push_subscriptions. */
  function setNotifPrefs(patch) {
    for (var p in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, p)) state.settings[p] = patch[p];
    }
    state.settings.updatedAt = now();
    save();
    return state.settings;
  }

  // ---------- gestion des habitudes ----------
  function addHabit(section) {
    var h = {
      id: uid(), name: '', section: section, type: 'binary',
      goal: null, goalWeekend: null, unit: null, step: 5,
      days: [1, 2, 3, 4, 5, 6, 7], active: true,
      position: habitsOfSection(section).length,
      createdAt: now(), updatedAt: now(), deletedAt: null
    };
    state.habits.push(h);
    return h;   // pas de save() : l'appelant ouvre l'editeur puis valide
  }
  function saveHabit(id, patch) {
    var h = habitById(id); if (!h) return null;
    for (var p in patch) if (Object.prototype.hasOwnProperty.call(patch, p)) h[p] = patch[p];
    h.updatedAt = now(); save(); return h;
  }
  // Suppression DOUCE : les statistiques passees restent justes.
  function removeHabit(id) { saveHabit(id, { deletedAt: now(), active: false }); }
  function discardHabit(id) {
    // Uniquement pour une habitude tout juste creee et jamais validee
    state.habits = state.habits.filter(function (h) { return h.id !== id; });
    save();
  }
  function moveHabit(id, dir) {
    var h = habitById(id); if (!h) return;
    var list = habitsOfSection(h.section);
    var i = list.indexOf(h), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    list[i].position = j; list[j].position = i;
    list[i].updatedAt = now(); list[j].updatedAt = now();
    save();
  }

  // ---------- sauvegarde / restauration ----------
  function exportData() {
    return JSON.stringify({
      app: 'le-systeme',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: now(),
      data: state
    }, null, 2);
  }
  /* L'import FUSIONNE par defaut : pour chaque element, la version la
     plus recemment modifiee gagne. Rien n'est jamais perdu par surprise. */
  function importData(json) {
    var parsed = JSON.parse(json);
    var incoming = migrate(parsed.data || parsed);
    var report = { habits: 0, entries: 0, tasks: 0 };

    (incoming.habits || []).forEach(function (ih) {
      var cur = habitById(ih.id);
      if (!cur) { state.habits.push(ih); report.habits++; }
      else if ((ih.updatedAt || '') > (cur.updatedAt || '')) {
        for (var p in ih) cur[p] = ih[p];
        report.habits++;
      }
    });
    for (var k in (incoming.entries || {})) {
      var ie = incoming.entries[k], ce = state.entries[k];
      if (!ce || (ie.updatedAt || '') > (ce.updatedAt || '')) { state.entries[k] = ie; report.entries++; }
    }
    (incoming.tasks || []).forEach(function (it) {
      var cur = null;
      for (var i = 0; i < state.tasks.length; i++) if (state.tasks[i].id === it.id) cur = state.tasks[i];
      if (!cur) { state.tasks.push(it); report.tasks++; }
      else if ((it.updatedAt || '') > (cur.updatedAt || '')) {
        for (var p2 in it) cur[p2] = it[p2];
        report.tasks++;
      }
    });
    if (incoming.settings && (incoming.settings.updatedAt || '') > (state.settings.updatedAt || '')) {
      state.settings = incoming.settings;
    }
    save();
    return report;
  }

  /* Le mode RESTAURATION : le fichier remplace tout.
     C'est ce qu'il faut apres une fausse manoeuvre (une habitude supprimee
     par erreur, par exemple), la ou la fusion ne suffirait pas puisqu'elle
     garde toujours la modification la plus recente.
     Avant de remplacer, on met l'etat actuel de cote : on ne detruit rien
     sans filet, meme quand c'est l'utilisateur qui le demande. */
  function restoreData(json) {
    var parsed = JSON.parse(json);
    var incoming = migrate(parsed.data || parsed);
    if (!incoming || !Array.isArray(incoming.habits)) throw new Error('Fichier invalide');
    try {
      localStorage.setItem(STORAGE_KEY + '.avant-restauration', JSON.stringify(state));
    } catch (e) { console.warn('Copie de securite impossible', e); }
    state = incoming;
    filledIndex = null;
    save();
    return {
      habits: state.habits.length,
      entries: Object.keys(state.entries).length,
      tasks: state.tasks.length
    };
  }
  /* Reprendre l'etat mis de cote par la derniere restauration. */
  function undoRestore() {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY + '.avant-restauration'); } catch (e) { }
    if (!raw) return false;
    state = migrate(JSON.parse(raw));
    filledIndex = null;
    save();
    return true;
  }
  function hasUndoRestore() {
    try { return !!localStorage.getItem(STORAGE_KEY + '.avant-restauration'); } catch (e) { return false; }
  }

  /* Repartir a zero parce qu'un AUTRE compte vient de se connecter sur
     cet appareil.

     Pourquoi c'est indispensable : localStorage n'appartient a aucun
     compte. Sans ce menage, la premiere synchronisation du nouveau venu
     enverrait tout l'historique du precedent dans SON coffre - il n'a
     jamais rien envoye, donc pour lui "ce qui a change depuis le dernier
     envoi", c'est absolument tout.

     On archive avant d'effacer, comme restoreData() le fait deja : meme
     ici, on ne detruit rien sans filet. L'archive reste dans l'appareil
     et n'est jamais envoyee nulle part. */
  function resetForNewUser(previousUserId) {
    var stamp = now().replace(/[:.]/g, '-');
    var archiveKey = STORAGE_KEY + '.archive.' + (previousUserId || 'inconnu') + '.' + stamp;
    /* On archive l'etat EN MEMOIRE, et non ce que contient localStorage.
       Les deux ne sont pas toujours d'accord : save() differe l'ecriture
       de 120 ms pour ne pas ecrire a chaque frappe. Archiver le disque
       reviendrait donc a perdre les 120 dernieres millisecondes - soit,
       tres exactement, la coche que la personne vient de faire.
       restoreData() prend deja cette precaution, c'est le meme reflexe. */
    try {
      localStorage.setItem(archiveKey, JSON.stringify(state));
    } catch (e) {
      console.warn('Archivage impossible avant changement de compte', e);
    }
    state = emptyState();
    filledIndex = null;
    persist();   // tout de suite, et non differe : une synchro part juste apres
    emit();
    return archiveKey;
  }

  /* Les archives laissees par un changement de compte. Sert a rassurer :
     rien n'a ete perdu, tout est encore la. */
  function listArchives() {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(STORAGE_KEY + '.archive.') === 0) out.push(k);
      }
    } catch (e) { }
    return out.sort();
  }

  // ---------------------------------------------------------
  // Ce dont la synchronisation a besoin (js/sync.js)
  // ---------------------------------------------------------

  /* Tout ce qui a bouge sur cet appareil depuis un instant donne.
     Chaque enregistrement porte son propre updatedAt : pas besoin de
     tenir une liste des choses "en attente", et rien ne peut etre oublie
     si l'appareil est reste hors ligne plusieurs jours. */
  function recordsSince(sinceIso) {
    var s = sinceIso || '';
    var ent = [];
    for (var k in state.entries) {
      if ((state.entries[k].updatedAt || '') > s) ent.push(state.entries[k]);
    }
    return {
      settings: (state.settings.updatedAt || '') > s ? state.settings : null,
      habits: state.habits.filter(function (h) { return (h.updatedAt || '') > s; }),
      entries: ent,
      tasks: state.tasks.filter(function (t) { return (t.updatedAt || '') > s; })
    };
  }

  /* Fusion d'un enregistrement venu du cloud : la modification la plus
     recente gagne, enregistrement par enregistrement. */
  function mergeHabit(h) {
    var cur = habitById(h.id);
    if (!cur) { state.habits.push(h); return true; }
    if ((h.updatedAt || '') > (cur.updatedAt || '')) {
      for (var p in h) cur[p] = h[p];
      return true;
    }
    return false;
  }
  function mergeEntry(e) {
    var k = ekey(e.date, e.habitId);
    var cur = state.entries[k];
    if (!cur || (e.updatedAt || '') > (cur.updatedAt || '')) { state.entries[k] = e; return true; }
    return false;
  }
  function mergeTask(t) {
    for (var i = 0; i < state.tasks.length; i++) {
      if (state.tasks[i].id === t.id) {
        if ((t.updatedAt || '') > (state.tasks[i].updatedAt || '')) {
          for (var p in t) state.tasks[i][p] = t[p];
          return true;
        }
        return false;
      }
    }
    state.tasks.push(t); return true;
  }
  function mergeSettings(s) {
    if ((s.updatedAt || '') > (state.settings.updatedAt || '')) { state.settings = s; return true; }
    return false;
  }

  /* Un appareil "vierge" : l'app y a ete installee mais rien n'y a jamais
     ete saisi. C'est le cas ou l'on peut adopter le contenu du cloud sans
     rien perdre - et sans se retrouver avec les habitudes en double. */
  function isPristine() {
    if (state.tasks.length) return false;
    for (var k in state.entries) return false;
    return true;
  }

  // ---------- ce que le reste de l'app peut utiliser ----------
  App.store = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    STORAGE_KEY: STORAGE_KEY,
    SECTIONS: SECTIONS,
    DAY_SHORT: DAY_SHORT,
    ISO_SHORT: ISO_SHORT,

    load: load, save: save, onChange: onChange,
    get state() { return state; },

    // dates
    iso: iso, parseISO: parseISO, today: today, addDays: addDays,
    isoWeekday: isoWeekday, startOfWeek: startOfWeek, startOfMonth: startOfMonth,
    rangeDates: rangeDates, daysBetween: daysBetween,
    longDate: longDate, shortDate: shortDate,

    // formats
    fmtNum: fmtNum, minutesToHHMM: minutesToHHMM, hhmmToMinutes: hhmmToMinutes,
    toDisplay: toDisplay, fromDisplay: fromDisplay, fmtDuration: fmtDuration, uid: uid,

    // habitudes
    allHabits: allHabits, habitsOfSection: habitsOfSection, habitById: habitById,
    countsOn: countsOn, goalFor: goalFor, isValidated: isValidated,
    addHabit: addHabit, saveHabit: saveHabit, removeHabit: removeHabit,
    discardHabit: discardHabit, moveHabit: moveHabit,

    // saisies
    getEntry: getEntry, setEntry: setEntry, toggleHabit: toggleHabit, isFilled: isFilled,

    // statistiques
    dayStats: dayStats, averageOver: averageOver, streak: streak,
    regularity: regularity, firstDay: firstDay, filledDaysCount: filledDaysCount,

    // taches
    tasksOf: tasksOf, liveTasks: liveTasks, addTask: addTask, updateTask: updateTask,
    moveTask: moveTask, removeTask: removeTask, clearDoneTasks: clearDoneTasks,

    // reglages + sauvegarde
    setGoal: setGoal, setNotifPrefs: setNotifPrefs,
    exportData: exportData, importData: importData,
    restoreData: restoreData, undoRestore: undoRestore, hasUndoRestore: hasUndoRestore,
    resetForNewUser: resetForNewUser, listArchives: listArchives,
    seedFromTemplate: seedFromTemplate,

    // synchronisation
    recordsSince: recordsSince, mergeHabit: mergeHabit, mergeEntry: mergeEntry,
    mergeTask: mergeTask, mergeSettings: mergeSettings, isPristine: isPristine
  };
})();
