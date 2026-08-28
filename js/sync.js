/* =========================================================
   LE SYSTEME - sync.js
   La connexion par lien magique et la synchronisation Supabase.

   Principe : l'app reste LOCALE D'ABORD. Cocher ecrit tout de suite dans
   l'appareil ; la synchro passe ensuite, en arriere-plan. Si le reseau est
   coupe, ou si Supabase n'est pas configure, l'application fonctionne
   exactement pareil - simplement sur un seul appareil.

   Reglement des conflits : la modification la plus recente gagne,
   enregistrement par enregistrement (chaque habitude, chaque journee,
   chaque tache porte son propre updatedAt).

   NOTE DE STYLE : ce fichier utilise async/await, contrairement au reste du
   projet qui est en ES5. C'est volontaire - un enchainement de requetes
   reseau est illisible autrement - et sans consequence : aucun navigateur
   vise ne demande de compilation pour ca.
   ========================================================= */

App.sync = (function () {
  'use strict';

  var S = App.store;

  var client = null;
  var user = null;
  var status = 'off';      // off | signedout | ready | syncing | offline | error
  var lastError = null;
  var lastSyncAt = null;
  var listeners = [];
  var pushTimer = null;
  var loopTimer = null;

  var TABLES = ['settings', 'habits', 'entries', 'tasks'];
  var PAGE = 1000;

  // ---------------------------------------------------------
  // Etat et evenements
  // ---------------------------------------------------------
  function onChange(fn) { listeners.push(fn); }
  function emit() {
    listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
    if (App.render) App.render();
  }
  function setStatus(s, err) {
    status = s; lastError = err || null; emit();
  }
  function info() {
    return {
      status: status,
      email: user ? user.email : null,
      lastSyncAt: lastSyncAt,
      error: lastError,
      configured: configured()
    };
  }

  function configured() {
    var c = window.SUPABASE_CONFIG;
    return !!(c && c.url && c.anonKey);
  }
  function libLoaded() { return !!(window.supabase && window.supabase.createClient); }

  // Un reperage par compte : changer de compte ne melange pas les curseurs.
  function keyCursor() { return 'lesysteme.sync.cursor.' + (user ? user.id : 'x'); }
  function keyPushed() { return 'lesysteme.sync.pushed.' + (user ? user.id : 'x'); }
  function get(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }

  // Postgres renvoie "...+00:00", le navigateur ecrit "...Z" : sans cette
  // normalisation, comparer deux dates sous forme de texte donnerait faux.
  function ts(v) { return v ? new Date(v).toISOString() : null; }

  // ---------------------------------------------------------
  // Traduction entre le format de l'app et celui de la base
  // ---------------------------------------------------------
  function habitToRow(h) {
    return {
      user_id: user.id, id: h.id, name: h.name, section: h.section, type: h.type,
      goal: h.goal, goal_weekend: h.goalWeekend, unit: h.unit, step: h.step,
      days: h.days, active: h.active, position: h.position,
      created_at: h.createdAt, updated_at: h.updatedAt, deleted_at: h.deletedAt
    };
  }
  function rowToHabit(r) {
    return {
      id: r.id, name: r.name, section: r.section, type: r.type,
      goal: r.goal === null ? null : Number(r.goal),
      goalWeekend: r.goal_weekend === null ? null : Number(r.goal_weekend),
      unit: r.unit, step: r.step === null ? null : Number(r.step),
      days: r.days || [1, 2, 3, 4, 5, 6, 7], active: r.active, position: r.position,
      createdAt: ts(r.created_at), updatedAt: ts(r.updated_at), deletedAt: ts(r.deleted_at)
    };
  }
  function entryToRow(e) {
    return {
      user_id: user.id, id: e.date + '|' + e.habitId, day: e.date, habit_id: e.habitId,
      done: !!e.done, value: e.value, plus_day: !!e.plusDay, updated_at: e.updatedAt
    };
  }
  function rowToEntry(r) {
    return {
      date: r.day, habitId: r.habit_id, done: !!r.done,
      value: r.value === null ? null : Number(r.value),
      plusDay: !!r.plus_day, updatedAt: ts(r.updated_at)
    };
  }
  function taskToRow(t) {
    return {
      user_id: user.id, id: t.id, text: t.text, day: t.date, done: !!t.done,
      position: t.position, created_at: t.createdAt,
      updated_at: t.updatedAt, deleted_at: t.deletedAt
    };
  }
  function rowToTask(r) {
    return {
      id: r.id, text: r.text, date: r.day, done: !!r.done, position: r.position,
      createdAt: ts(r.created_at), updatedAt: ts(r.updated_at), deletedAt: ts(r.deleted_at)
    };
  }

  // ---------------------------------------------------------
  // Demarrage
  // ---------------------------------------------------------
  function init() {
    if (!configured()) { setStatus('off'); return; }
    if (!libLoaded()) {
      // Le script Supabase n'a pas pu etre charge (hors ligne au demarrage,
      // par exemple). L'app continue en local ; on reessaiera plus tard.
      setStatus('off');
      setTimeout(function () { if (libLoaded()) init(); }, 4000);
      return;
    }

    client = window.supabase.createClient(
      window.SUPABASE_CONFIG.url,
      window.SUPABASE_CONFIG.anonKey,
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
    );

    client.auth.getSession().then(function (res) {
      adoptSession(res.data ? res.data.session : null);
    });

    client.auth.onAuthStateChange(function (event, session) {
      adoptSession(session);
    });

    // On se resynchronise en revenant sur l'app, et de temps en temps
    // tant qu'elle est visible.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) syncNow();
    });
    window.addEventListener('online', function () { syncNow(); });
    clearInterval(loopTimer);
    loopTimer = setInterval(function () {
      if (!document.hidden) syncNow();
    }, 120000);

    // Chaque modification locale part vers le cloud, sans precipitation.
    S.onChange(function () {
      if (!user) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(function () { syncNow(); }, 2500);
    });
  }

  function adoptSession(session) {
    var was = user ? user.id : null;
    user = session ? session.user : null;
    if (user && user.id !== was) {
      setStatus('ready');
      syncNow();
    } else if (!user) {
      setStatus('signedout');
    }
  }

  // ---------------------------------------------------------
  // Connexion
  // ---------------------------------------------------------
  async function sendMagicLink(email) {
    if (!client) throw new Error('Synchronisation non configurée');
    var redirect = window.location.origin + window.location.pathname;
    var res = await client.auth.signInWithOtp({
      email: String(email).trim(),
      options: { emailRedirectTo: redirect }
    });
    if (res.error) throw res.error;
    return true;
  }

  /* La connexion par mot de passe n'envoie AUCUN email. C'est ce qui la
     rend fiable : le service d'emails de Supabase est bride a quelques
     envois par heure, et se retrouver bloque dehors une heure durant
     serait inacceptable pour une app qu'on ouvre tous les matins. */
  async function signInWithPassword(email, password) {
    if (!client) throw new Error('Synchronisation non configurée');
    var res = await client.auth.signInWithPassword({
      email: String(email).trim(),
      password: password
    });
    if (res.error) throw res.error;
    return true;
  }

  /* Poser (ou changer) le mot de passe du compte deja connecte.
     Le mot de passe part directement chez Supabase, qui n'en garde qu'une
     empreinte : il n'est stocke nulle part dans l'app. */
  async function setPassword(password) {
    if (!client) throw new Error('Synchronisation non configurée');
    if (!user) throw new Error('Il faut être connecté pour faire ça');
    var res = await client.auth.updateUser({ password: password });
    if (res.error) throw res.error;
    return true;
  }

  /* Les messages de Supabase sont en anglais et souvent obscurs.
     On traduit les cas qu'il rencontrera vraiment. */
  function friendlyError(e) {
    var m = (e && (e.message || e.msg)) ? String(e.message || e.msg) : String(e);
    var low = m.toLowerCase();
    if (low.indexOf('invalid login credentials') !== -1) {
      return 'Email ou mot de passe incorrect.';
    }
    if (low.indexOf('email rate limit') !== -1 || low.indexOf('rate limit') !== -1) {
      return 'Trop d’emails envoyés d’un coup. Attends une heure — ou connecte-toi avec ton mot de passe, qui n’envoie rien.';
    }
    if (low.indexOf('for security purposes') !== -1) {
      return 'Un instant : Supabase demande d’attendre quelques secondes entre deux essais.';
    }
    if (low.indexOf('password should be at least') !== -1 || low.indexOf('weak password') !== -1) {
      return 'Mot de passe trop court : il en faut au moins 8 caractères.';
    }
    if (low.indexOf('same as the old') !== -1 || low.indexOf('should be different') !== -1) {
      return 'Ce mot de passe est déjà celui du compte. Choisis-en un autre.';
    }
    if (low.indexOf('failed to fetch') !== -1 || low.indexOf('networkerror') !== -1) {
      return 'Pas de réseau. Tes données restent en sécurité sur cet appareil.';
    }
    if (low.indexOf('not confirmed') !== -1) {
      return 'Ce compte n’est pas encore confirmé. Passe par le lien magique une première fois.';
    }
    return m;
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
    user = null;
    setStatus('signedout');
  }

  // ---------------------------------------------------------
  // Synchronisation
  // ---------------------------------------------------------
  var running = false;

  async function syncNow(force) {
    if (!client || !user || running) return;
    running = true;
    setStatus('syncing');
    try {
      await pull();
      await push(force);
      lastSyncAt = new Date().toISOString();
      setStatus('ready');
    } catch (e) {
      console.error('Synchro impossible', e);
      setStatus(navigator.onLine === false ? 'offline' : 'error', e.message || String(e));
    } finally {
      running = false;
    }
  }

  /* On ne redemande que ce qui a change depuis la derniere visite, en se
     fiant a l'horloge du SERVEUR (synced_at) : les horloges du telephone
     et du PC n'ont pas besoin d'etre d'accord. */
  async function pullTable(table, cursor) {
    var out = [], from = 0;
    for (; ;) {
      var res = await client.from(table).select('*')
        .gt('synced_at', cursor)
        .order('synced_at', { ascending: true })
        .range(from, from + PAGE - 1);
      if (res.error) throw res.error;
      out = out.concat(res.data || []);
      if (!res.data || res.data.length < PAGE) break;
      from += PAGE;
    }
    return out;
  }

  async function pull() {
    var cursor = get(keyCursor(), '1970-01-01T00:00:00Z');
    var results = {};
    for (var i = 0; i < TABLES.length; i++) {
      results[TABLES[i]] = await pullTable(TABLES[i], cursor);
    }

    var changed = 0, maxSynced = cursor;
    function seen(rows) {
      rows.forEach(function (r) {
        var s = ts(r.synced_at);
        if (s && s > maxSynced) maxSynced = s;
      });
    }

    results.habits.forEach(function (r) { if (S.mergeHabit(rowToHabit(r))) changed++; });
    results.entries.forEach(function (r) { if (S.mergeEntry(rowToEntry(r))) changed++; });
    results.tasks.forEach(function (r) { if (S.mergeTask(rowToTask(r))) changed++; });
    results.settings.forEach(function (r) {
      if (S.mergeSettings({ dailyGoal: r.daily_goal, updatedAt: ts(r.updated_at) })) changed++;
    });

    TABLES.forEach(function (t) { seen(results[t]); });
    set(keyCursor(), maxSynced);
    if (changed) S.save();
    return changed;
  }

  /* On envoie tout ce qui a bouge sur cet appareil depuis le dernier envoi
     reussi. Rien a tenir a jour a la main : chaque enregistrement porte son
     updatedAt, donc une semaine hors ligne remonte d'un coup au retour. */
  async function push(force) {
    var since = force ? '' : get(keyPushed(), '');
    var batch = S.recordsSince(since);
    var maxUpdated = since;

    function note(list) {
      list.forEach(function (x) { if ((x.updatedAt || '') > maxUpdated) maxUpdated = x.updatedAt; });
    }

    async function upsert(table, rows) {
      for (var i = 0; i < rows.length; i += 500) {
        var res = await client.from(table).upsert(rows.slice(i, i + 500), { onConflict: 'user_id,id' });
        if (res.error) throw res.error;
      }
    }

    if (batch.habits.length) { await upsert('habits', batch.habits.map(habitToRow)); note(batch.habits); }
    if (batch.entries.length) { await upsert('entries', batch.entries.map(entryToRow)); note(batch.entries); }
    if (batch.tasks.length) { await upsert('tasks', batch.tasks.map(taskToRow)); note(batch.tasks); }
    if (batch.settings) {
      var res = await client.from('settings').upsert({
        user_id: user.id,
        daily_goal: batch.settings.dailyGoal,
        updated_at: batch.settings.updatedAt
      }, { onConflict: 'user_id' });
      if (res.error) throw res.error;
      note([batch.settings]);
    }

    set(keyPushed(), maxUpdated);
    return batch.habits.length + batch.entries.length + batch.tasks.length;
  }

  /* Le bouton de reparation : tout renvoyer, sans se fier au repere du
     dernier envoi. Utile si l'horloge de l'appareil a recule, ou en cas
     de doute. N'efface jamais rien - un upsert ne fait qu'ecrire. */
  function resendEverything() { return syncNow(true); }

  return {
    init: init, onChange: onChange, info: info,
    sendMagicLink: sendMagicLink, signInWithPassword: signInWithPassword,
    setPassword: setPassword, signOut: signOut,
    syncNow: syncNow, resendEverything: resendEverything,
    configured: configured, friendlyError: friendlyError
  };
})();
