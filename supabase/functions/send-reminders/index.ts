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
   ETAT : palier 2. Cette fonction ne sait, pour l'instant, QUE repondre
   a un appui sur "M'envoyer un test". Les rappels programmes (taches du
   jour, journee non cochee) viendront au palier suivant, une fois la
   chaine d'envoi prouvee. On ne construit pas la suite avant d'etre sur
   que le telephone recoit vraiment quelque chose.
   ---------------------------------------------------------

   Elle n'ecrit RIEN dans les habitudes, les saisies ni les taches. Elle
   ne fait que lire la liste des appareils abonnes et leur parler.
   ========================================================= */

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function repond(corps: unknown, code = 200) {
  return new Response(JSON.stringify(corps), {
    status: code,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
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

  /* On identifie l'appelant par SON jeton, et on lit ensuite avec ce
     meme jeton. Le verrou pose en migration 001 fait alors tout le
     travail : cette fonction ne peut atteindre que les appareils de la
     personne qui l'appelle, meme si elle le voulait. Le role de service,
     qui contourne ce verrou, n'a rien a faire ici. */
  const auth = req.headers.get('Authorization') ?? '';
  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: auth } } }
  );

  const { data: { user }, error: errUser } = await db.auth.getUser();
  if (errUser || !user) return repond({ error: 'Non connecte.' }, 401);

  let corps: { test?: boolean } = {};
  try { corps = await req.json(); } catch { corps = {}; }
  if (!corps.test) {
    return repond({ error: 'Seul l’envoi de test est disponible pour l’instant.' }, 400);
  }

  const { data: abonnes, error: errAb } = await db
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth');
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

  for (const a of abonnes) {
    try {
      await webpush.sendNotification(
        { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
        message
      );
      envoyes++;
      await db.from('push_subscriptions')
        .update({ last_ok_at: new Date().toISOString(), fail_count: 0 })
        .eq('user_id', user.id).eq('endpoint', a.endpoint);
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      /* 404 ou 410 : l'appareil a desinstalle l'app ou revoque la
         permission. Cette adresse de livraison ne servira plus jamais,
         on la retire plutot que de la garder et d'echouer dessus a
         chaque passage. */
      if (code === 404 || code === 410) perimes.push(a.endpoint);
      else console.error('Envoi echoue', code, (e as Error).message);
    }
  }

  if (perimes.length) {
    await db.from('push_subscriptions')
      .delete().eq('user_id', user.id).in('endpoint', perimes);
  }

  return repond({ sent: envoyes, removed: perimes.length });
});
