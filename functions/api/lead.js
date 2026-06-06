/**
 * Cloudflare Pages Function — POST /api/lead
 *
 * Environment variables (Cloudflare Pages → Settings → Environment Variables):
 *
 *   CINC_API_KEY   Your CINC Zapier API key (string)
 *
 * CINC endpoint: https://public.cincapi.com/v2/site/leads
 * Auth: Bearer token (your CINC Zapier API key)
 */

const CINC_ENDPOINT = 'https://public.cincapi.com/v2/site/leads';

export async function onRequestPost(context) {
  const { request, env } = context;

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const body = await request.json();
    const { firstName, lastName, email, phone, preferences, planText, source, timestamp } = body;

    // Server-side validation — require email or phone
    if (!email && !phone) {
      return new Response(JSON.stringify({ error: 'Email or phone required.' }), { status: 400, headers });
    }

    // ── Post lead to CINC ─────────────────────────────────────────────────
    if (env.CINC_API_KEY) {
      try {
        const cincPayload = buildCincPayload({ firstName, lastName, email, phone, preferences, planText, source, timestamp });

        const cincRes = await fetch(CINC_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.CINC_API_KEY}`,
          },
          body: JSON.stringify(cincPayload),
        });

        if (!cincRes.ok) {
          const errText = await cincRes.text().catch(() => 'unknown');
          console.error('CINC error:', cincRes.status, errText);
          // Log and continue — don't fail the user's form submission
        } else {
          console.log('CINC lead created:', cincRes.status);
        }
      } catch (cincErr) {
        console.error('CINC fetch failed:', cincErr);
      }
    } else {
      console.warn('CINC_API_KEY not set — lead not forwarded to CRM');
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });

  } catch (err) {
    console.error('Lead handler error:', err);
    return new Response(JSON.stringify({ error: 'Internal error.' }), { status: 500, headers });
  }
}

// CORS preflight
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

// ─────────────────────────────────────────────────────────────────────────────
// Build CINC lead payload
// CINC upsert endpoint keys on `username` (= email). All other fields optional.
// Preferences and plan are captured as a pinned note for visibility in CINC.
// ─────────────────────────────────────────────────────────────────────────────
function buildCincPayload({ firstName, lastName, email, phone, preferences, planText, source, timestamp }) {
  const noteLines = [
    `Source: Nanaimo Weekend Planner`,
    `Submitted: ${timestamp || new Date().toISOString()}`,
    ``,
    `--- PREFERENCES ---`,
    `Neighbourhood: ${preferences?.hood || ''}`,
    `Group: ${preferences?.group || ''}`,
    `Vibe: ${(preferences?.vibes || []).join(', ')}`,
    `Budget: ${preferences?.budget || ''}`,
    `Duration: ${preferences?.duration || ''}`,
    `Local status: ${preferences?.settled || ''}`,
    `Time on Island: ${preferences?.tenure || ''}`,
    `Dietary: ${(preferences?.dietary || []).join(', ')}`,
  ];

  if (planText) {
    noteLines.push('', '--- PLAN SENT ---', planText);
  }

  return {
    username: email || phone,          // required — CINC keys on this
    info: {
      first_name: firstName || '',
      last_name:  lastName  || '',
      contact: {
        email: email || '',
        phone: phone || '',
      },
    },
    notes: [
      {
        content:   noteLines.join('\n'),
        category:  'general',
        is_pinned: true,
      },
    ],
  };
}
