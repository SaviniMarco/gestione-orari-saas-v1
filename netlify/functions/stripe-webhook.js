// ═══════════════════════════════════════════════════════════════════
// stripe-webhook.js — Netlify Function
// POST /.netlify/functions/stripe-webhook
// ═══════════════════════════════════════════════════════════════════
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const stripeKey     = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey || !webhookSecret) {
    console.error('[webhook] Env vars mancanti: STRIPE_SECRET_KEY o STRIPE_WEBHOOK_SECRET');
    return { statusCode: 500, body: 'Configurazione incompleta' };
  }

  const stripe = require('stripe')(stripeKey);
  const sig    = event.headers['stripe-signature'];

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
  } catch (err) {
    console.error('[webhook] Firma non valida:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const type = stripeEvent.type;
  console.log(`[webhook] Evento: ${type}`);

  // ── Helper: aggiorna aziende per userId ──
  async function updateAzienda(userId, fields) {
    const { error } = await sb.from('aziende')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) console.error('[webhook] Supabase update error:', error.message);
    else console.log('[webhook] Supabase aggiornato:', userId, fields);
    return !error;
  }

  try {

    // ── checkout.session.completed ───────────────────────────────
    if (type === 'checkout.session.completed') {
      const session  = stripeEvent.data.object;
      const userId   = session.metadata?.userId || session.client_reference_id;
      const plan     = session.metadata?.plan || 'mensile';
      const custId   = session.customer;
      const subId    = session.subscription;

      if (!userId) {
        console.error('[webhook] userId mancante nella session:', session.id);
        return { statusCode: 400, body: 'userId mancante' };
      }

      let expDate = null;
      if (subId) {
        const sub = await stripe.subscriptions.retrieve(subId);
        expDate   = new Date(sub.current_period_end * 1000).toISOString();
      }

      await updateAzienda(userId, {
        piano:                  plan,
        stato:                  'active',
        expiration_date:        expDate,
        stripe_customer_id:     custId,
        stripe_subscription_id: subId,
        stripe_session:         session.id,
      });

      console.log(`[webhook] ✅ Piano attivato: ${userId} → ${plan}, scade: ${expDate}`);
    }

    // ── invoice.payment_succeeded (rinnovo) ─────────────────────
    else if (type === 'invoice.payment_succeeded') {
      const invoice = stripeEvent.data.object;
      if (invoice.billing_reason !== 'subscription_cycle') {
        return { statusCode: 200, body: JSON.stringify({ received: true }) };
      }
      const sub    = await stripe.subscriptions.retrieve(invoice.subscription);
      const userId = sub.metadata?.userId;
      if (!userId) { console.warn('[webhook] rinnovo senza userId'); return { statusCode: 200, body: 'ok' }; }

      await updateAzienda(userId, {
        stato:                  'active',
        expiration_date:        new Date(sub.current_period_end * 1000).toISOString(),
        stripe_subscription_id: sub.id,
      });
      console.log(`[webhook] 🔄 Rinnovato: ${userId}`);
    }

    // ── invoice.payment_failed ───────────────────────────────────
    else if (type === 'invoice.payment_failed') {
      const invoice = stripeEvent.data.object;
      const sub     = await stripe.subscriptions.retrieve(invoice.subscription);
      const userId  = sub.metadata?.userId;
      if (userId) {
        await updateAzienda(userId, { stato: 'past_due' });
        console.warn(`[webhook] ❌ Pagamento fallito: ${userId}`);
      }
    }

    // ── customer.subscription.deleted ───────────────────────────
    else if (type === 'customer.subscription.deleted') {
      const sub    = stripeEvent.data.object;
      const userId = sub.metadata?.userId;
      if (userId) {
        await updateAzienda(userId, { stato: 'canceled', expiration_date: new Date().toISOString() });
        console.log(`[webhook] 🚫 Abbonamento cancellato: ${userId}`);
      }
    }

  } catch (err) {
    console.error('[webhook] Handler error:', err.message);
    return { statusCode: 500, body: err.message };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
