// Netlify Function: create-checkout
// POST /.netlify/functions/create-checkout
// Body: { plan, userId, userEmail }

const PLANS = {
  mensile:  { price_id: process.env.STRIPE_PRICE_MENSILE,  label: 'Piano Mensile',  months: 1  },
  trimest:  { price_id: process.env.STRIPE_PRICE_TRIMEST,  label: 'Piano 3 Mesi',   months: 3  },
  semest:   { price_id: process.env.STRIPE_PRICE_SEMEST,   label: 'Piano 6 Mesi',   months: 6  },
  annuale:  { price_id: process.env.STRIPE_PRICE_ANNUALE,  label: 'Piano Annuale',  months: 12 },
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // ── Valida env vars prima di tutto ──
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.error('[create-checkout] STRIPE_SECRET_KEY non trovata nelle env vars');
    return { statusCode: 500, body: JSON.stringify({
      error: 'Configurazione server incompleta — contattare supporto'
    })};
  }

  // ── Init Stripe con chiave esplicita ──
  const stripe = require('stripe')(stripeKey);

  try {
    const body = JSON.parse(event.body || '{}');
    const { plan, userId, userEmail } = body;

    if (!plan || !PLANS[plan]) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Piano non valido: ' + plan }) };
    }
    if (!userId || !userEmail) {
      return { statusCode: 400, body: JSON.stringify({ error: 'userId e userEmail obbligatori' }) };
    }

    const planData = PLANS[plan];
    if (!planData.price_id) {
      return { statusCode: 400, body: JSON.stringify({
        error: 'Price ID non configurato per: ' + plan + ' — verificare env vars STRIPE_PRICE_*'
      })};
    }

    const appUrl = process.env.APP_URL || 'https://visionary-lamington-701083.netlify.app';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: planData.price_id, quantity: 1 }],
      customer_email: userEmail,
      client_reference_id: userId,
      metadata: { userId, plan },
      subscription_data: { metadata: { userId, plan } },
      success_url: appUrl + '/?payment=success&session_id={CHECKOUT_SESSION_ID}',
      cancel_url:  appUrl + '/?payment=cancelled',
      locale: 'it',
    });

    console.log('[create-checkout] OK session:', session.id, 'user:', userId, 'plan:', plan);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url, sessionId: session.id }),
    };

  } catch (err) {
    console.error('[create-checkout] Error:', err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
