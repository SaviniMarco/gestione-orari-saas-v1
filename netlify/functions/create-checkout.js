// ═══════════════════════════════════════════════════════════════════
// Netlify Function: create-checkout
// Crea sessione Stripe Checkout per abbonamento
// Chiamata da: frontend → POST /api/create-checkout
// ═══════════════════════════════════════════════════════════════════
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

// Piani disponibili — aggiorna i Price ID dopo averli creati su Stripe Dashboard
const PLANS = {
  mensile:  { price_id: process.env.STRIPE_PRICE_MENSILE,  label: 'Piano Mensile',   months: 1  },
  trimest:  { price_id: process.env.STRIPE_PRICE_TRIMEST,  label: 'Piano 3 Mesi',    months: 3  },
  semest:   { price_id: process.env.STRIPE_PRICE_SEMEST,   label: 'Piano 6 Mesi',    months: 6  },
  annuale:  { price_id: process.env.STRIPE_PRICE_ANNUALE,  label: 'Piano Annuale',   months: 12 },
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { plan, userId, userEmail } = JSON.parse(event.body);

    if (!plan || !PLANS[plan]) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Piano non valido' }) };
    }
    if (!userId || !userEmail) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Utente non autenticato' }) };
    }

    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const planData = PLANS[plan];

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',                        // pagamento una tantum (non recurring)
      payment_method_types: ['card'],
      line_items: [{
        price: planData.price_id,
        quantity: 1,
      }],
      customer_email: userEmail,
      metadata: {
        userId,                               // passa userId per il webhook
        plan,
        months: planData.months,
      },
      success_url: process.env.APP_URL + '/?payment=success&session_id={CHECKOUT_SESSION_ID}',
      cancel_url:  process.env.APP_URL + '/?payment=cancelled',
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url, sessionId: session.id }),
    };

  } catch (err) {
    console.error('create-checkout error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
