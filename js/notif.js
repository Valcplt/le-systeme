/* =========================================================
   LE SYSTEME - notif.js
   Les rappels : demander la permission, s'abonner, se desabonner.

   Ce fichier ne parle qu'au NAVIGATEUR. C'est lui qui fabrique
   l'abonnement ; le rangement dans Supabase passe par le client deja
   ouvert par js/sync.js, et l'envoi lui-meme se fait cote serveur.

   NOTE DE STYLE : comme sync.js, ce fichier utilise async/await. Meme
   raison, et elle est bonne : demander une permission, attendre le
   service worker puis s'abonner est un enchainement d'attentes, illisible
   autrement. Aucune compilation n'est necessaire pour autant.

   A SAVOIR SUR L'IPHONE : le code ci-dessous est le meme pour tout le
   monde, c'est un standard. Apple pose une seule condition
   supplementaire : l'application doit avoir ete ajoutee a l'ecran
   d'accueil. Dans un simple onglet Safari, les notifications n'existent
   pas - ce n'est pas une panne, et c'est detecte plus bas pour afficher
   la marche a suivre plutot qu'un bouton qui ne ferait rien.
   Ce chemin n'a jamais pu etre teste sur un vrai iPhone.
   ========================================================= */

App.notif = (function () {
  'use strict';

  var sub = null;          // l'abonnement de CET appareil
  var status = 'unknown';  // unsupported | ios-home-screen | denied | off | on
  var lastError = null;
  var listeners = [];

  function onChange(fn) { listeners.push(fn); }
  function emit() {
    listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
    if (App.render) App.render();
  }
  function setStatus(s, err) { status = s; lastError = err || null; emit(); }

  function info() {
    return { status: status, error: lastError, configured: !!publicKey() };
  }

  function publicKey() {
    var c = window.SUPABASE_CONFIG;
    return (c && c.vapidPublicKey) ? c.vapidPublicKey : '';
  }

  // ---------------------------------------------------------
  // Ce que sait faire l'appareil
  // ---------------------------------------------------------
  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      // les iPad recents se font passer pour des Mac
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  /* "Installee sur l'ecran d'accueil" plutot qu'ouverte dans un onglet. */
  function isInstalled() {
    return window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }
  function browserCan() {
    return ('serviceWorker' in navigator) &&
      ('PushManager' in window) &&
      ('Notification' in window);
  }

  // ---------------------------------------------------------
  // Conversions : le navigateur parle en octets, Supabase en texte
  // ---------------------------------------------------------
  function keyToBytes(base64url) {
    var manque = (4 - base64url.length % 4) % 4;
    var b64 = (base64url + '===='.slice(0, manque)).replace(/-/g, '+').replace(/_/g, '/');
    var brut = atob(b64);
    var out = new Uint8Array(brut.length);
    for (var i = 0; i < brut.length; i++) out[i] = brut.charCodeAt(i);
    return out;
  }
  function bytesToKey(buffer) {
    var bytes = new Uint8Array(buffer), s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /* De quoi s'y retrouver dans la liste de ses appareils. Volontairement
     grossier : on veut distinguer un telephone d'un PC, pas etablir une
     fiche signaletique. */
  function deviceLabel() {
    var ua = navigator.userAgent;
    var os = isIOS() ? 'iPhone' : /Android/.test(ua) ? 'Android'
      : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Appareil';
    var nav = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome'
      : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
    return nav ? os + ' - ' + nav : os;
  }

  // ---------------------------------------------------------
  // Etat au demarrage
  // ---------------------------------------------------------
  async function init() {
    if (!browserCan()) {
      /* Sur iPhone, c'est presque toujours parce que l'app est dans un
         onglet et non sur l'ecran d'accueil. Le dire, plutot que
         d'annoncer une incompatibilite qui n'en est pas une. */
      setStatus(isIOS() && !isInstalled() ? 'ios-home-screen' : 'unsupported');
      return;
    }
    if (!publicKey()) { setStatus('unsupported'); return; }
    if (Notification.permission === 'denied') { setStatus('denied'); return; }

    try {
      var reg = await navigator.serviceWorker.ready;
      sub = await reg.pushManager.getSubscription();
      setStatus(sub ? 'on' : 'off');
    } catch (e) {
      console.error('Etat des rappels indisponible', e);
      setStatus('off');
    }
  }

  // ---------------------------------------------------------
  // Activer
  // ---------------------------------------------------------
  async function enable() {
    if (!browserCan()) throw new Error('Cet appareil ne sait pas afficher de rappels.');
    if (!publicKey()) throw new Error('Les rappels ne sont pas configures.');

    var db = App.sync && App.sync.db ? App.sync.db() : null;
    var account = App.sync && App.sync.account ? App.sync.account() : null;
    if (!db || !account) {
      throw new Error('Il faut etre connecte : c’est le compte qui recoit les rappels.');
    }

    /* La demande de permission DOIT partir d'un vrai clic, sinon le
       navigateur la refuse sans rien afficher. C'est pour cela que cette
       fonction n'est jamais appelee toute seule au demarrage. */
    var perm = await Notification.requestPermission();
    if (perm === 'denied') { setStatus('denied'); throw new Error('Notifications refusees.'); }
    if (perm !== 'granted') { setStatus('off'); throw new Error('Permission non accordee.'); }

    var reg = await navigator.serviceWorker.ready;
    sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        /* Obligatoire : on s'engage a toujours afficher quelque chose de
           visible. Un push silencieux servirait a pister, les navigateurs
           ne le permettent pas. */
        userVisibleOnly: true,
        applicationServerKey: keyToBytes(publicKey())
      });
    }

    var res = await db.from('push_subscriptions').upsert({
      user_id: account.id,
      endpoint: sub.endpoint,
      p256dh: bytesToKey(sub.getKey('p256dh')),
      auth: bytesToKey(sub.getKey('auth')),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris',
      device_label: deviceLabel(),
      fail_count: 0
    }, { onConflict: 'user_id,endpoint' });
    if (res.error) throw res.error;

    setStatus('on');
    return true;
  }

  // ---------------------------------------------------------
  // Desactiver
  // ---------------------------------------------------------
  /* On retire la ligne cote serveur ET l'abonnement cote navigateur.
     N'en retirer qu'un seul laisserait soit un telephone qui recoit des
     rappels dont plus personne ne tient le registre, soit un serveur qui
     parle dans le vide. */
  async function disable() {
    var db = App.sync && App.sync.db ? App.sync.db() : null;
    var account = App.sync && App.sync.account ? App.sync.account() : null;

    try {
      var reg = await navigator.serviceWorker.ready;
      sub = sub || await reg.pushManager.getSubscription();
    } catch (e) { }

    if (sub && db && account) {
      var res = await db.from('push_subscriptions')
        .delete().eq('user_id', account.id).eq('endpoint', sub.endpoint);
      if (res.error) console.warn('Ligne d’abonnement non retiree', res.error);
    }
    if (sub) { try { await sub.unsubscribe(); } catch (e) { } }
    sub = null;
    setStatus('off');
    return true;
  }

  // ---------------------------------------------------------
  // L'essai
  // ---------------------------------------------------------
  /* Le seul moyen honnete de savoir si la chaine fonctionne : demander au
     serveur d'envoyer pour de vrai, puis fermer l'app et regarder. */
  async function sendTest() {
    var db = App.sync && App.sync.db ? App.sync.db() : null;
    if (!db) throw new Error('Il faut etre connecte.');
    if (status !== 'on') throw new Error('Active d’abord les rappels sur cet appareil.');

    var res = await db.functions.invoke('send-reminders', { body: { test: true } });
    if (res.error) throw res.error;
    return res.data;
  }

  return {
    init: init, info: info, onChange: onChange,
    enable: enable, disable: disable, sendTest: sendTest,
    isIOS: isIOS, isInstalled: isInstalled, deviceLabel: deviceLabel
  };
})();
