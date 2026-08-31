/* =========================================================
   LE SYSTEME - fonction serveur "send-reminders"
   ---------------------------------------------------------
   C'est la seule piece du projet qui ne tourne pas dans le navigateur.
   Elle vit chez Supabase et sait faire une chose qu'un site web ne peut
   pas faire : envoyer un rappel a un telephone dont l'application est
   fermee.

   Pourquoi elle est indispensable : une page web ne s'execute que
   lorsqu'elle est ouverte. Un rappel qui ne partirait que pendant qu'on
   regarde l'app ne servirait a rien - c'est justement quand on ne la
   regarde pas qu'il faut la rappeler a l'esprit.

   ---------------------------------------------------------
   DEUX FACONS DE L'APPELER, et elles n'ont pas les memes droits :

   1. L'APPLICATION, avec le jeton de la personne connectee. Elle ne
      peut demander qu'un envoi de TEST, et seulement vers ses propres
      appareils - le verrou de la migration 001 s'en charge, pas nous.

   2. LA TACHE PLANIFIEE, avec le secret partage en en-tete. Elle
      declenche le vrai tour des rappels, pour tout le monde.

   Un appel sans l'un ni l'autre reste dehors.
   ---------------------------------------------------------

   Elle n'ecrit RIEN dans les habitudes, les saisies ni les taches.
   La seule table qu'elle remplit est notif_sent, le carnet des rappels
   deja envoyes.
   ========================================================= */

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function repond(corps: unknown, code = 200) {
  return new Response(JSON.stringify(corps), {
    status: code,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}

type Abonnement = { endpoint: string; p256dh: string; auth: string };

/* Envoie a un appareil. Renvoie 'ok', 'perime' (l'appareil n'existe
   plus) ou 'echec'. On distingue les trois parce qu'ils appellent trois
   reactions differentes : rien, retirer la ligne, reessayer plus tard. */
async function envoie(a: Abonnement, message: string): Promise<'ok' | 'perime' | 'echec'> {
  try {
    await webpush.sendNotification(
      { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
      message
    );
    return 'ok';
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    /* 404 ou 410 : l'app a ete desinstallee, ou la permission revoquee.
       Cette adresse de livraison ne servira plus jamais. */
    if (code === 404 || code === 410) return 'perime';
    console.error('Envoi echoue', code, (e as Error).message);
    return 'echec';
  }
}

function texteDuRappel(kind: string, nbTaches: number) {
  if (kind === 'tasks') {
    return {
      title: 'Le Système',
      body: nbTaches > 1
        ? nbTaches + ' tâches t’attendent aujourd’hui.'
        : 'Une tâche t’attend aujourd’hui.',
      tag: 'rappel-taches',
      tab: 'tasks'
    };
  }
  return {
    title: 'Le Système',
    body: 'Ta journée n’est pas encore cochée.',
    tag: 'rappel-journee',
    tab: 'today'
  };
}

Deno.serve(async (req) => {
  // Le navigateur demande d'abord la permission d'appeler (preflight).
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const publique = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
  const privee = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  const sujet = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:valcaplot@gmail.com';

  if (!publique || !privee) {
    return repond({
      error: 'Les cles de signature manquent cote serveur.',
      indice: 'Edge Functions > Secrets : VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY.'
    }, 500);
  }
  webpush.setVapidDetails(sujet, publique, privee);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const secretAttendu = Deno.env.get('CRON_SECRET') ?? '';
  const secretRecu = req.headers.get('x-cron-secret') ?? '';
  const estTachePlanifiee = secretAttendu !== '' && secretRecu === secretAttendu;

  // =========================================================
  //  1. LE TOUR AUTOMATIQUE
  // =========================================================
  if (estTachePlanifiee) {
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    /* Toute la regle du "qui recoit quoi" vit dans la fonction SQL
       rappels_a_envoyer (migration 005). Ici, on ne fait que livrer. */
    const { data: lignes, error } = await admin.rpc('rappels_a_envoyer');
    if (error) return repond({ error: error.message }, 500);
    if (!lignes?.length) return repond({ sent: 0, groups: 0 });

    /* Une personne peut avoir plusieurs appareils : on regroupe pour
       n'inscrire qu'UNE fois au carnet, quel que soit le nombre de
       telephones prevenus. */
    type Ligne = {
      p_user_id: string; p_kind: string; p_jour: string;
      p_endpoint: string; p_p256dh: string; p_auth: string; p_nb_taches: number;
    };
    const groupes = new Map<string, Ligne[]>();
    for (const l of lignes as Ligne[]) {
      const cle = l.p_user_id + '|' + l.p_kind + '|' + l.p_jour;
      if (!groupes.has(cle)) groupes.set(cle, []);
      groupes.get(cle)!.push(l);
    }

    let envoyes = 0;
    const perimes: string[] = [];

    for (const [, lot] of groupes) {
      const t = texteDuRappel(lot[0].p_kind, Number(lot[0].p_nb_taches));
      const message = JSON.stringify(t);
      let auMoinsUn = false;

      for (const l of lot) {
        const r = await envoie(
          { endpoint: l.p_endpoint, p256dh: l.p_p256dh, auth: l.p_auth }, message
        );
        if (r === 'ok') { envoyes++; auMoinsUn = true; }
        else if (r === 'perime') perimes.push(l.p_endpoint);
      }

      /* On n'inscrit au carnet que si le rappel est reellement parti.
         Sinon, le prochain passage reessaiera - la fenetre de 90 minutes
         de la migration 005 borne d'elle-meme le nombre de tentatives. */
      if (auMoinsUn) {
        await admin.from('notif_sent').upsert({
          user_id: lot[0].p_user_id, day: lot[0].p_jour, kind: lot[0].p_kind
        }, { onConflict: 'user_id,day,kind' });
      }
    }

    if (perimes.length) {
      await admin.from('push_subscriptions').delete().in('endpoint', perimes);
    }
    return repond({ sent: envoyes, groups: groupes.size, removed: perimes.length });
  }

  // =========================================================
  //  2. L'ENVOI DE TEST, demande depuis l'application
  // =========================================================
  /* On lit avec le jeton de la personne, jamais avec celui du serveur :
     le verrou pose en migration 001 fait alors tout le travail, et cette
     fonction ne peut atteindre que ses appareils a elle. */
  const db = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }
  });

  const { data: { user }, error: errUser } = await db.auth.getUser();
  if (errUser || !user) return repond({ error: 'Non connecte.' }, 401);

  let corps: { test?: boolean } = {};
  try { corps = await req.json(); } catch { corps = {}; }
  if (!corps.test) return repond({ error: 'Requete inconnue.' }, 400);

  const { data: abonnes, error: errAb } = await db
    .from('push_subscriptions').select('endpoint, p256dh, auth');
  if (errAb) return repond({ error: errAb.message }, 500);
  if (!abonnes?.length) return repond({ sent: 0, message: 'Aucun appareil abonne.' });

  const message = JSON.stringify({
    title: 'Le Système',
    body: 'Test reçu. Les rappels fonctionnent sur cet appareil.',
    tag: 'test',
    tab: 'today'
  });

  let envoyes = 0;
  const perimes: string[] = [];
  for (const a of abonnes as Abonnement[]) {
    const r = await envoie(a, message);
    if (r === 'ok') {
      envoyes++;
      await db.from('push_subscriptions')
        .update({ last_ok_at: new Date().toISOString(), fail_count: 0 })
        .eq('user_id', user.id).eq('endpoint', a.endpoint);
    } else if (r === 'perime') perimes.push(a.endpoint);
  }
  if (perimes.length) {
    await db.from('push_subscriptions')
      .delete().eq('user_id', user.id).in('endpoint', perimes);
  }

  return repond({ sent: envoyes, removed: perimes.length });
});
