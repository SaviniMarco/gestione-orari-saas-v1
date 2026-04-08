// ═══════════════════════════════════════════════════════════════════
// Netlify Function: stripe-webhook
// Riceve eventi Stripe e aggiorna Supabase
// Endpoint: POST /api/stripe-webhook
// ═══════════════════════════════════════════════════════════════════
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = event.headers['stripe-signature'];

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // Supabase con service role key (solo lato server — MAI nel frontend)
  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY   // service key — sicura perché è solo nel server
  );

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const { userId, plan, months } = session.metadata;

    if (!userId || !months) {
      console.error('Missing metadata:', session.metadata);
      return { statusCode: 400, body: 'Missing metadata' };
    }

    // Calcola data scadenza abbonamento
    const now = new Date();
    const expiration = new Date(now);
    expiration.setMonth(expiration.getMonth() + parseInt(months));

    const { error } = await sb.from('aziende').update({
      piano:            plan,
      stato:            'attivo',
      expiration_date:  expiration.toISOString(),
      stripe_session:   session.id,
      updated_at:       now.toISOString(),
    }).eq('id', userId);

    if (error) {
      console.error('Supabase update error:', error);
      return { statusCode: 500, body: 'DB update failed' };
    }

    console.log(`✅ Abbonamento attivato: user=${userId} piano=${plan} scade=${expiration.toISOString()}`);
  }

  if (stripeEvent.type === 'payment_intent.payment_failed') {
    const pi = stripeEvent.data.object;
    console.warn('Payment failed:', pi.id);
    // Opzionale: notifica all'utente
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
