/**
 * Cloudflare Pages Function — POST /api/lead
 *
 * Environment variable (Cloudflare Pages → Settings → Environment Variables):
 *
 *   CINC_WEBHOOK_URL   Zapier Catch Hook URL
 *                      e.g. https://hooks.zapier.com/hooks/catch/27839633/4bp4ggq/
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const body = await request.json();
    const { firstName, lastName, email, phone, preferences, planText, source, timestamp } = body;

    if (!email && !phone) {
      return new Response(JSON.stringify({ error: 'Email or phone required.' }), { status: 400, headers });
    }

    // ── POST to Zapier → CINC ─────────────────────────────────────────────
    if (env.CINC_WEBHOOK_URL) {
      try {
        const noteLines = [
          `Source: Nanaimo Weekend Planner`,
          `Submitted: ${timestamp || new Date().toISOString()}`,
          `Neighbourhood: ${preferences?.hood || ''}`,
          `Group: ${preferences?.group || ''}`,
          `Vibe: ${(preferences?.vibes || []).join(', ')}`,
          `Budget: ${preferences?.budget || ''}`,
          `Duration: ${preferences?.duration || ''}`,
          `Local status: ${preferences?.settled || ''}`,
          `Time on Island: ${preferences?.tenure || ''}`,
          `Dietary: ${(preferences?.dietary || []).join(', ')}`,
        ];
        if (planText) noteLines.push('', '--- PLAN SENT ---', planText);

        const payload = {
          first_name:    firstName || '',
          last_name:     lastName  || '',
          email:         email     || '',
          phone:         phone     || '',
          source:        'Nanaimo Weekend Planner',
          neighbourhood: preferences?.hood     || '',
          group:         preferences?.group    || '',
          vibes:         (preferences?.vibes   || []).join(', '),
          budget:        preferences?.budget   || '',
          notes:         noteLines.join('\n'),
        };

        const zapRes = await fetch(env.CINC_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const zapBody = await zapRes.text().catch(() => '');
        if (!zapRes.ok) {
          console.error('Zapier error:', zapRes.status, zapBody);
          return new Response(JSON.stringify({ ok: false, zap_status: zapRes.status, zap_error: zapBody }), { status: 200, headers });
        }
        console.log('Zapier accepted lead:', zapRes.status);

      } catch (err) {
        console.error('Zapier fetch failed:', err);
      }
    } else {
      console.warn('CINC_WEBHOOK_URL not set');
    }

    return new Response(JSON.stringify({ ok: true, webhook_set: !!env.CINC_WEBHOOK_URL }), { status: 200, headers });

  } catch (err) {
    console.error('Lead handler error:', err);
    return new Response(JSON.stringify({ error: 'Internal error.' }), { status: 500, headers });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
