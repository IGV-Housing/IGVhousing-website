/**
 * igvhousing-contact-verify
 * Single-file Cloudflare Worker for the igvhousing.com contact form.
 *
 * Verifies a reCAPTCHA v3 token server-side, then forwards the submission
 * to HubSpot form b401e161-8211-4202-8eab-848f123749f8 on portal 342997618.
 *
 * Deploy:
 *   wrangler secret put RECAPTCHA_SECRET_IGVHOUSING
 *   wrangler deploy
 */

const HUBSPOT_PORTAL_ID = '342997618';
const HUBSPOT_FORM_GUID = 'b401e161-8211-4202-8eab-848f123749f8';
const HUBSPOT_SUBMIT_URL =
  `https://api.hsforms.com/submissions/v3/integration/submit/${HUBSPOT_PORTAL_ID}/${HUBSPOT_FORM_GUID}`;

const SCORE_THRESHOLD = 0.5;

const ALLOWED_ORIGINS = [
  'https://www.igvhousing.com',
  'https://igvhousing.com'
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
  });
}

async function handleContact(request, env) {
  const origin = request.headers.get('Origin') || '';

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed.' }, 405, origin);
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ success: false, error: 'Malformed request.' }, 400, origin);
  }

  // Honeypot: silently accept so bots do not learn they were caught.
  if (data.company_website) {
    return json({ success: true }, 200, origin);
  }

  if (!data.recaptchaToken) {
    return json({ success: false, error: 'Verification missing. Reload the page and try again.' }, 400, origin);
  }

  // ---- 1. Verify the v3 token with Google ----
  let verdict;
  try {
    const params = new URLSearchParams({
      secret: env.RECAPTCHA_SECRET_IGVHOUSING,
      response: data.recaptchaToken
    });
    const ip = request.headers.get('CF-Connecting-IP');
    if (ip) params.set('remoteip', ip);

    const verifyRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    verdict = await verifyRes.json();
  } catch {
    return json({ success: false, error: 'Could not verify your submission. Try again shortly.' }, 502, origin);
  }

  if (!verdict.success) {
    console.log('recaptcha rejected', JSON.stringify(verdict['error-codes'] || []));
    return json({ success: false, error: 'Verification failed. Reload the page and try again.' }, 403, origin);
  }
  if (verdict.action && verdict.action !== 'contact') {
    return json({ success: false, error: 'Verification failed. Reload the page and try again.' }, 403, origin);
  }
  if (typeof verdict.score === 'number' && verdict.score < SCORE_THRESHOLD) {
    console.log('recaptcha low score', verdict.score, verdict.hostname);
    return json({ success: false, error: 'We could not confirm this submission. Email us directly and we will help.' }, 403, origin);
  }

  // ---- 2. Validate the payload ----
  const required = ['firstname', 'email', 'igvhousing_message'];
  for (const key of required) {
    if (!data[key] || !String(data[key]).trim()) {
      return json({ success: false, error: 'Some required fields are missing.' }, 400, origin);
    }
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) {
    return json({ success: false, error: 'Enter a valid email address.' }, 400, origin);
  }

  // ---- 3. Forward to HubSpot ----
  const fieldNames = [
    'firstname',
    'lastname',
    'email',
    'phone',
    'igvhousing_role',
    'igvhousing_where-did-you-hear',
    'igvhousing_interests',
    'igvhousing_message'
  ];

  const fields = fieldNames
    .filter((name) => data[name] && String(data[name]).trim())
    .map((name) => ({
      objectTypeId: '0-1',
      name,
      value: String(data[name]).trim()
    }));

  const context = {
    pageUri: data.pageUri || 'https://www.igvhousing.com/contact/',
    pageName: data.pageName || 'Contact Us | IGV Housing'
  };
  if (data.hutk) context.hutk = data.hutk;

  let hsRes, hsBody;
  try {
    hsRes = await fetch(HUBSPOT_SUBMIT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields, context })
    });
    hsBody = await hsRes.text();
  } catch {
    return json({ success: false, error: 'We could not deliver your message. Try again shortly.' }, 502, origin);
  }

  if (!hsRes.ok) {
    // Surfaces INVALID_PROPERTY_VALUE for dropdown values that do not match HubSpot.
    console.log('hubspot rejected', hsRes.status, hsBody);
    return json({ success: false, error: 'We could not deliver your message. Try again shortly.' }, 502, origin);
  }

  return json({ success: true }, 200, origin);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '/contact') {
      return handleContact(request, env);
    }

    return new Response('Not found', { status: 404 });
  }
};
