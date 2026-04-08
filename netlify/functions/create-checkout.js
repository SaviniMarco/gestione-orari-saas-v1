// ═══════════════════════════════════════════════════════════════════
// Netlify Function: create-checkout
// Crea sessione Stripe Checkout — mode: subscription (ricorrente)
// POST /.netlify/functions/create-checkout
// Body: { plan, userId, userEmail }
// ═══════════════════════════════════════════════════════════════════
const Stripe = require('stripe');

// Piani — i Price ID devono essere prezzi RICORRENTI su Stripe Dashboard
// (Products → Add product → Recurring → mensile/trimestrale/ecc.)
const PLANS = {
  mensile:  { price_id: process.env.STRIPE_PRICE_MENSILE,  label: 'Piano Mensile',  interval: 'month', interval_count: 1  },
  trimest:  { price_id: process.env.STRIPE_PRICE_TRIMEST,  label: 'Piano 3 Mesi',   interval: 'month', interval_count: 3  },
  semest:   { price_id: process.env.STRIPE_PRICE_SEMEST,   label: 'Piano 6 Mesi',   interval: 'month', interval_count: 6  },
  annuale:  { price_id: process.env.STRIPE_PRICE_ANNUALE,  label: 'Piano Annuale',  interval: 'year',  interval_count: 1  },
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Validazione env vars
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY mancante');
    return { statusCode: 500, body: JSON.stringify({ error: 'Configurazione server incompleta' }) };
  }

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
      return { statusCode: 400, body: JSON.stringify({ error: 'Price ID non configurato per piano: ' + plan }) };
    }

    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const appUrl = process.env.APP_URL || 'https://visionary-lamington-701083.netlify.app';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',                 // ← ABBONAMENTO RICORRENTE
      payment_method_types: ['card'],
      line_items: [{ price: planData.price_id, quantity: 1 }],
      customer_email: userEmail,
      client_reference_id: userId,          // userId passato come reference
      metadata: { userId, plan },           // anche nei metadata per il webhook
      subscription_data: {
        metadata: { userId, plan },         // nei metadata della subscription
      },
      success_url: appUrl + '/?payment=success&session_id={CHECKOUT_SESSION_ID}',
      cancel_url:  appUrl + '/?payment=cancelled',
      locale: 'it',
    });

    console.log('Checkout session created:', session.id, 'user:', userId, 'plan:', plan);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url, sessionId: session.id }),
    };

  } catch (err) {
    console.error('create-checkout error:', err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
