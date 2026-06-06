/**
 * Cloudflare Pages Function — POST /api/lead
 *
 * Environment variables to set in Cloudflare Pages → Settings → Environment Variables:
 *
 *   CINC_API_URL      e.g. https://api.cincpro.com/v2/leads   (confirm exact URL with CINC support)
 *   CINC_API_KEY      Your CINC API key
 *   RESEND_API_KEY    From resend.com (free — 3,000 emails/month)
 *   FROM_EMAIL        e.g. hans@hanssuhr.ca  (must be verified in Resend)
 *   TWILIO_SID        (optional) Twilio Account SID for SMS
 *   TWILIO_TOKEN      (optional) Twilio Auth Token
 *   TWILIO_FROM       (optional) Twilio phone number e.g. +12508881234
 *
 * Zapier note: if you prefer to use Zapier instead of calling CINC directly,
 * set CINC_API_URL to your Zapier Webhook URL and leave CINC_API_KEY blank.
 * Zapier webhooks require a paid Zapier plan. The Zapier Free plan does NOT
 * support webhook triggers — direct CINC API (above) avoids that cost entirely.
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  // ── CORS headers ──
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const body = await request.json();
    const { firstName, lastName, email, phone, preferences, planText, source, timestamp } = body;

    // Basic server-side validation
    if (!email && !phone) {
      return new Response(JSON.stringify({ error: 'Email or phone required.' }), { status: 400, headers });
    }

    // ── 1. Post lead to CINC ──────────────────────────────────────────────
    if (env.CINC_API_URL) {
      try {
        const cincPayload = buildCincPayload({ firstName, lastName, email, phone, preferences, planText, source, timestamp });

        const cincRes = await fetch(env.CINC_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(env.CINC_API_KEY ? { 'Authorization': `Bearer ${env.CINC_API_KEY}` } : {}),
            ...(env.CINC_API_KEY ? { 'x-api-key': env.CINC_API_KEY } : {}),
          },
          body: JSON.stringify(cincPayload),
        });

        if (!cincRes.ok) {
          const err = await cincRes.text().catch(() => 'unknown');
          console.error('CINC API error:', cincRes.status, err);
          // Don't fail the whole request — log and continue
        }
      } catch (cincErr) {
        console.error('CINC fetch failed:', cincErr);
      }
    }

    // ── 2. Send plan via email (Resend) ───────────────────────────────────
    if (env.RESEND_API_KEY && email) {
      try {
        const emailHtml = buildPlanEmail({ firstName, planText, preferences });

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: env.FROM_EMAIL || 'hans@hanssuhr.ca',
            to: [email],
            subject: `Your Nanaimo Weekend Plan is ready, ${firstName || 'Explorer'}! 🗺️`,
            html: emailHtml,
          }),
        });
      } catch (emailErr) {
        console.error('Email send failed:', emailErr);
      }
    }

    // ── 3. Send plan via SMS (Twilio — optional) ──────────────────────────
    if (env.TWILIO_SID && env.TWILIO_TOKEN && env.TWILIO_FROM && phone) {
      try {
        const smsBody = buildSmsBody({ firstName, planText });
        const formData = new URLSearchParams({
          From: env.TWILIO_FROM,
          To:   normalizePhone(phone),
          Body: smsBody,
        });

        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${env.TWILIO_SID}:${env.TWILIO_TOKEN}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString(),
        });
      } catch (smsErr) {
        console.error('SMS send failed:', smsErr);
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });

  } catch (err) {
    console.error('Lead handler error:', err);
    return new Response(JSON.stringify({ error: 'Internal error.' }), { status: 500, headers });
  }
}

// Handle CORS preflight
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

// ──────────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────────

/**
 * Build the CINC lead payload.
 *
 * CINC's exact field names vary by integration type. The most common format
 * for their lead ingestion API is shown below. If your CINC rep gave you a
 * different schema, update the field names here.
 *
 * Docs / support: https://support.cincpro.com  or your account manager.
 */
function buildCincPayload({ firstName, lastName, email, phone, preferences, planText, source, timestamp }) {
  const note = [
    `Source: Nanaimo Weekend Planner`,
    `Neighbourhood: ${preferences?.hood || ''}`,
    `Group: ${preferences?.group || ''}`,
    `Vibe: ${(preferences?.vibes || []).join(', ')}`,
    `Budget: ${preferences?.budget || ''}`,
    `Duration: ${preferences?.duration || ''}`,
    `Local status: ${preferences?.settled || ''}`,
    `Time on Island: ${preferences?.tenure || ''}`,
    `Dietary: ${(preferences?.dietary || []).join(', ')}`,
    '',
    'WEEKEND PLAN SENT:',
    planText || '',
    '',
    `Submitted: ${timestamp || new Date().toISOString()}`,
  ].join('\n');

  return {
    // Standard CINC lead fields — verify with your CINC account manager
    first_name: firstName || '',
    last_name:  lastName  || '',
    email:      email     || '',
    phone:      phone     || '',
    source:     source    || 'Nanaimo Weekend Planner',
    notes:      note,
    // Some CINC integrations use these alternative field names:
    // firstName, lastName, emailAddress, phoneNumber
  };
}

function buildPlanEmail({ firstName, planText, preferences }) {
  const name = firstName || 'Explorer';
  const hood = preferences?.hood || 'Nanaimo';
  const items = planText
    ? planText.split('\n\n').map(line => `<p style="margin:0 0 12px;padding:12px;background:#f8f9fa;border-left:3px solid #1A2B4A;border-radius:6px;font-size:15px;line-height:1.5;">${line.replace(/\n/g,'<br>')}</p>`).join('')
    : '<p>Your plan is ready — check the website to view it.</p>';

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8f9fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.1);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1A2B4A,#2C4A7A);padding:28px 24px;text-align:center;">
            <div style="display:inline-block;background:#E31837;color:#fff;font-weight:800;font-size:12px;padding:4px 12px;border-radius:4px;letter-spacing:0.5px;margin-bottom:12px;">RE/MAX</div>
            <h1 style="color:#fff;font-size:24px;font-weight:800;margin:0 0 8px;">Your Nanaimo Weekend Plan 🗺️</h1>
            <p style="color:rgba(255,255,255,0.8);font-size:14px;margin:0;">Built just for you, ${name}</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:28px 24px;">
            <p style="font-size:16px;color:#1A2B4A;font-weight:700;margin:0 0 20px;">Hi ${name},</p>
            <p style="font-size:15px;color:#374151;margin:0 0 24px;line-height:1.6;">Here's your personalized Nanaimo weekend itinerary. Save this email — everything is in here including neighbourhoods, timing, and what to order.</p>
            ${items}
            <p style="font-size:14px;color:#6B7280;margin:24px 0 0;line-height:1.6;">Questions about the Nanaimo market, or thinking about buying or selling? I'd love to help.</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#1A2B4A;padding:20px 24px;text-align:center;">
            <p style="color:#fff;font-weight:800;font-size:15px;margin:0 0 4px;">Hans Suhr, REALTOR®</p>
            <p style="color:rgba(255,255,255,0.65);font-size:13px;margin:0 0 12px;">RE/MAX Anchor Realty · Central Vancouver Island</p>
            <a href="https://hanssuhr.ca" style="color:rgba(255,255,255,0.65);font-size:13px;">hanssuhr.ca</a>
            &nbsp;·&nbsp;
            <a href="mailto:hans@hanssuhr.ca" style="color:rgba(255,255,255,0.65);font-size:13px;">hans@hanssuhr.ca</a>
            <p style="color:rgba(255,255,255,0.3);font-size:11px;margin:16px 0 0;">
              You received this because you requested a weekend plan at nanaimo-local-guides.pages.dev.<br>
              <a href="https://nanaimo-local-guides.pages.dev/unsubscribe" style="color:rgba(255,255,255,0.4);">Unsubscribe</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildSmsBody({ firstName, planText }) {
  const name = firstName || 'Explorer';
  const preview = planText
    ? planText.split('\n\n').slice(0, 3).map(l => l.split(' — ')[0].trim()).join(' · ')
    : 'Your Nanaimo weekend plan';

  return `Hi ${name}! Your Nanaimo weekend plan from Hans Suhr is ready 🗺️\n\n${preview}\n\nFull plan sent to your email. Questions? hans@hanssuhr.ca | hanssuhr.ca`;
}

function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  return `+${digits}`;
}
