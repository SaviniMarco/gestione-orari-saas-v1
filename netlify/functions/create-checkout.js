// Netlify Function: create-checkout
// POST /.netlify/functions/create-checkout
// Body: { plan, userId, userEmail }

const PLANS = {
  mensile:  { price_id: process.env.STRIPE_PRICE_MENSILE,      label: 'Piano Mensile',  months: 1  },
  trimest:  { price_id: process.env.STRIPE_PRICE_TRIMESTRALE,  label: 'Piano 3 Mesi',   months: 3  },
  semest:   { price_id: process.env.STRIPE_PRICE_SEMESTRALE,   label: 'Piano 6 Mesi',   months: 6  },
  annuale:  { price_id: process.env.STRIPE_PRICE_ANNUALE,      label: 'Piano Annuale',  months: 12 },
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.error('[create-checkout] STRIPE_SECRET_KEY mancante');
    return { statusCode: 500, body: JSON.stringify({ error: 'Configurazione server incompleta' }) };
  }

  const stripe = require('stripe')(stripeKey);

  try {
    const { plan, userId, userEmail } = JSON.parse(event.body || '{}');

    if (!plan || !PLANS[plan]) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Piano non valido: ' + plan }) };
    }
    if (!userId || !userEmail) {
      return { statusCode: 400, body: JSON.stringify({ error: 'userId e userEmail obbligatori' }) };
    }

    const planData = PLANS[plan];
    if (!planData.price_id) {
      return { statusCode: 400, body: JSON.stringify({
        error: 'Price ID mancante per: ' + plan + ' (env: STRIPE_PRICE_' +
          { mensile:'MENSILE', trimest:'TRIMESTRALE', semest:'SEMESTRALE', annuale:'ANNUALE' }[plan] + ')'
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

    console.log('[create-checkout] OK:', session.id, plan, userId);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url, sessionId: session.id }),
    };

  } catch (err) {
    console.error('[create-checkout] Error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
