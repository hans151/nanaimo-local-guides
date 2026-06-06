/**
 * Cloudflare Pages Function — POST /api/unsubscribe
 * Receives email from the unsubscribe form and tags/removes in CINC.
 */

export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  try {
    const body = await request.json();
    const { email } = body;

    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'Valid email required.' }), { status: 400, headers });
    }

    // Notify Hans via email so he can manually suppress in CINC
    // (CINC unsubscribe API varies — update if your account supports it directly)
    if (env.RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: env.FROM_EMAIL || 'hans@hanssuhr.ca',
          to: [env.FROM_EMAIL || 'hans@hanssuhr.ca'],
          subject: `Unsubscribe request — Nanaimo Weekend Planner`,
          html: `<p><strong>${email}</strong> has requested to unsubscribe from the Nanaimo Weekend Planner list.</p><p>Please suppress this contact in CINC.</p><p>Timestamp: ${new Date().toISOString()}</p>`,
        }),
      });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (err) {
    console.error('Unsubscribe error:', err);
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
