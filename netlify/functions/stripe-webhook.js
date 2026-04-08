// ═══════════════════════════════════════════════════════════════════
// Netlify Function: stripe-webhook
// Riceve eventi Stripe → aggiorna Supabase
// POST /.netlify/functions/stripe-webhook
// ═══════════════════════════════════════════════════════════════════
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sig    = event.headers['stripe-signature'];

  // Verifica firma webhook
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

  // Supabase con service role (solo server-side)
  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const type = stripeEvent.type;
  console.log('Stripe event:', type);

  try {

    // ── Checkout completato ──────────────────────────────────────
    if (type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;
      const userId  = session.metadata?.userId || session.client_reference_id;
      const plan    = session.metadata?.plan || 'mensile';

      if (!userId) {
        console.error('userId mancante nella session:', session.id);
        return { statusCode: 400, body: 'userId mancante' };
      }

      // Recupera subscription per avere current_period_end
      let expirationDate = null;
      if (session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription);
        expirationDate = new Date(sub.current_period_end * 1000).toISOString();
      }

      const { error } = await sb.from('aziende').update({
        piano:            plan,
        stato:            'attivo',
        expiration_date:  expirationDate,
        stripe_session:   session.id,
        updated_at:       new Date().toISOString(),
      }).eq('id', userId);

      if (error) {
        console.error('Supabase update error:', error.message);
        return { statusCode: 500, body: 'DB update failed' };
      }
      console.log('✅ Piano attivato:', userId, plan, 'scade:', expirationDate);
    }

    // ── Abbonamento rinnovato ────────────────────────────────────
    if (type === 'invoice.payment_succeeded') {
      const invoice = stripeEvent.data.object;
      if (invoice.billing_reason !== 'subscription_cycle') return { statusCode: 200, body: 'ok' };

      const sub    = await stripe.subscriptions.retrieve(invoice.subscription);
      const userId = sub.metadata?.userId;
      if (!userId) return { statusCode: 200, body: 'no userId' };

      const expirationDate = new Date(sub.current_period_end * 1000).toISOString();
      await sb.from('aziende').update({
        stato:           'attivo',
        expiration_date: expirationDate,
        updated_at:      new Date().toISOString(),
      }).eq('id', userId);
      console.log('🔄 Abbonamento rinnovato:', userId, 'nuova scadenza:', expirationDate);
    }

    // ── Pagamento fallito ────────────────────────────────────────
    if (type === 'invoice.payment_failed') {
      const invoice = stripeEvent.data.object;
      const sub     = await stripe.subscriptions.retrieve(invoice.subscription);
      const userId  = sub.metadata?.userId;
      if (userId) {
        await sb.from('aziende').update({
          stato:      'pagamento_fallito',
          updated_at: new Date().toISOString(),
        }).eq('id', userId);
        console.warn('❌ Pagamento fallito per:', userId);
      }
    }

    // ── Abbonamento cancellato ───────────────────────────────────
    if (type === 'customer.subscription.deleted') {
      const sub    = stripeEvent.data.object;
      const userId = sub.metadata?.userId;
      if (userId) {
        await sb.from('aziende').update({
          stato:      'sospeso',
          updated_at: new Date().toISOString(),
        }).eq('id', userId);
        console.log('🚫 Abbonamento cancellato per:', userId);
      }
    }

  } catch (err) {
    console.error('Webhook handler error:', err.message);
    return { statusCode: 500, body: err.message };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
