# Nanaimo Local Guides — Deployment Guide

## File structure

```
nanaimo-local-guides/
├── index.html                  ← main site (edit CONFIG block at bottom)
├── privacy.html
├── unsubscribe.html
├── DEPLOY.md                   ← this file
└── functions/
    └── api/
        ├── lead.js             ← Cloudflare Pages Function (lead capture → CINC)
        └── unsubscribe.js      ← Cloudflare Pages Function (unsubscribe handler)
```

---

## Step 1 — Create GitHub repo

1. Go to github.com → New repository
2. Name it `nanaimo-local-guides` (or whatever you prefer)
3. Set to **Public** (required for Cloudflare Pages free tier) or Private if you have a paid GitHub plan
4. Don't initialize with README
5. Push all these files to the repo:

```bash
git init
git add .
git commit -m "Initial site"
git remote add origin https://github.com/YOUR_USERNAME/nanaimo-local-guides.git
git push -u origin main
```

---

## Step 2 — Connect Cloudflare Pages

1. Log into Cloudflare → **Pages** → **Create a project** → **Connect to Git**
2. Authorize GitHub, select the `nanaimo-local-guides` repo
3. Build settings:
   - **Framework preset**: None
   - **Build command**: (leave blank)
   - **Build output directory**: `/` (root)
4. Click **Save and Deploy**

Your site will be live at `https://nanaimo-local-guides.pages.dev` within 60 seconds.

> **Custom domain**: In Cloudflare Pages → Custom Domains, add your domain
> (e.g. `weekendplanner.hanssuhr.ca`). Update the `CONFIG.SITE_URL` in index.html.

---

## Step 3 — Set environment variables

In Cloudflare Pages → your project → **Settings** → **Environment Variables**, add:

| Variable | Value | Required? |
|---|---|---|
| `CINC_API_URL` | Your CINC lead API endpoint (see below) | Yes |
| `CINC_API_KEY` | Your CINC API key | Yes |
| `RESEND_API_KEY` | From resend.com (free account) | Yes (for email) |
| `FROM_EMAIL` | `hans@hanssuhr.ca` | Yes |
| `TWILIO_SID` | Twilio Account SID | Optional (SMS) |
| `TWILIO_TOKEN` | Twilio Auth Token | Optional (SMS) |
| `TWILIO_FROM` | Your Twilio phone number e.g. `+12508881234` | Optional (SMS) |

Set variables for **both** Production and Preview environments.

---

## Step 4 — CINC API setup

CINC (Commissions Inc) has a lead submission API. To get your endpoint and key:

1. Log into CINC → Settings → Integrations (or contact your CINC account manager)
2. Look for "API" or "Lead Ingestion" — they may call it "Lead Posting API"
3. Common endpoint format: `https://api.cincpro.com/v2/leads`
4. Copy the API key they provide

Set `CINC_API_URL` and `CINC_API_KEY` in Cloudflare Pages env vars.

**If your CINC setup uses a different field schema**, edit the `buildCincPayload()` function
in `functions/api/lead.js` to match the field names your CINC account expects.

> **Zapier alternative**: If you prefer to route through Zapier, set `CINC_API_URL`
> to your Zapier Webhook Catch URL. Note: Zapier webhook triggers require a paid
> Zapier plan (Starter ~$20/month). The direct CINC API route above avoids that cost.

---

## Step 5 — Resend (email delivery, free)

1. Go to **resend.com** → Sign up (free: 3,000 emails/month)
2. Add your domain (`hanssuhr.ca`) under Domains → add the DNS records they show you
3. Go to API Keys → Create API Key → copy it
4. Set `RESEND_API_KEY` in Cloudflare Pages env vars
5. Set `FROM_EMAIL` to `hans@hanssuhr.ca`

---

## Step 6 — Vapi (voice AI, optional)

The voice mode requires a Vapi account. Vapi free tier: 10 min/month of voice.

1. Go to **app.vapi.ai** → Sign up
2. Go to **Assistants** → Create Assistant
3. Set the system prompt (copy below)
4. Under Voice, pick a voice you like (e.g. "Aria" or "Rachel")
5. Copy the **Assistant ID**
6. Go to Account → copy your **Public Key**
7. In `index.html`, find the CONFIG block and update:
   ```javascript
   VAPI_PUBLIC_KEY:   'your-public-key-here',
   VAPI_ASSISTANT_ID: 'your-assistant-id-here',
   ```
8. Commit and push — Cloudflare redeploys automatically

### Vapi assistant system prompt

```
You are Aime, a friendly local concierge for Nanaimo and Central Vancouver Island. 
Your job is to build a personalized weekend itinerary for the person you're talking to.

Ask these questions one at a time, conversationally:
1. What's their name?
2. Who's joining them — solo, couple, family, or friends?
3. Which part of Nanaimo or the Island are they based in or want to explore?
4. What vibe are they going for — outdoors, food, arts, active, relaxed, or nightlife?
5. What's the budget — free, under $50, moderate, or treat themselves?
6. How much time — a few hours, full day, or full weekend?

Keep responses warm, brief, and confident. You know Nanaimo well. 
Once you have all answers, call the setPreferences function with the data collected.
Then tell them their plan is being built and they'll see it on screen in a moment.

Always end the call naturally after collecting all information.
```

### Vapi function definition (add in Assistant → Functions)

```json
{
  "name": "setPreferences",
  "description": "Store the user's weekend preferences to generate their plan",
  "parameters": {
    "type": "object",
    "properties": {
      "name":           { "type": "string" },
      "group":          { "type": "string", "enum": ["solo","couple","family","friends"] },
      "neighbourhood":  { "type": "string" },
      "vibes":          { "type": "array", "items": { "type": "string" } },
      "budget":         { "type": "string", "enum": ["free","low","moderate","splurge"] },
      "duration":       { "type": "string", "enum": ["few-hours","full-day","full-weekend"] }
    }
  }
}
```

---

## Step 7 — Update site URL in index.html

Find the CONFIG block near the bottom of `index.html` and update:

```javascript
SITE_URL: 'https://your-actual-domain.pages.dev',  // or custom domain
```

Commit and push — Cloudflare redeploys in ~30 seconds.

---

## Step 8 — Test end-to-end

1. Open the live URL
2. Complete the quiz → verify plan appears (blurred)
3. Submit a test lead (use your own email/phone)
4. Verify: plan reveals ✓ | email arrives in inbox ✓ | lead appears in CINC ✓
5. Test unsubscribe at `/unsubscribe`

---

## Ongoing — every lead that comes in

Each submitted lead:
- Gets added to CINC automatically (tagged "Nanaimo Weekend Planner")
- Receives the personalized plan by email (and SMS if Twilio is set up)
- Appears in your CINC pipeline for follow-up

Speed-to-lead: respond within 5 minutes for maximum conversion. 
Set a CINC automation or alert so you're notified immediately.

---

## Notes on costs

| Service | Cost |
|---|---|
| GitHub | Free |
| Cloudflare Pages | Free (unlimited sites, 500 builds/month) |
| Resend | Free (3,000 emails/month) |
| Vapi | Free tier (10 min voice/month) — upgrade ~$0.05/min after |
| CINC | Your existing subscription |
| Twilio SMS | ~$0.0079/message + number rental ~$1/month |
| Zapier | NOT needed if using direct CINC API |
