// stripe-webhook.js — Netlify Function
// POST /.netlify/functions/stripe-webhook
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const stripeKey     = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeKey || !webhookSecret) {
    console.error('[webhook] Env vars mancanti');
    return { statusCode: 500, body: 'Config error' };
  }

  const stripe = require('stripe')(stripeKey);
  const sig    = event.headers['stripe-signature'];

  let ev;
  try {
    ev = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
  } catch (err) {
    console.error('[webhook] Firma invalida:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // ── Helper: trova userId da email (fallback se metadata manca) ──
  async function userIdByEmail(email) {
    if (!email) return null;
    const { data } = await sb
      .from('aziende')
      .select('id')
      .ilike('nome', email)  // nome = email al momento della registrazione
      .single();
    if (data) return data.id;
    // fallback: cerca in auth.users via email
    const { data: users } = await sb.auth.admin.listUsers();
    const user = users?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
    return user?.id || null;
  }

  // ── Helper: aggiorna aziende ──
  async function activate(userId, fields) {
    if (!userId) { console.error('[webhook] activate: userId null'); return false; }
    const { error } = await sb.from('aziende')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) { console.error('[webhook] Supabase error:', error.message); return false; }
    console.log('[webhook] ✅ Supabase aggiornato:', userId, fields.stato);
    return true;
  }

  const type = ev.type;
  console.log('[webhook] Evento:', type);

  try {

    // ── checkout.session.completed ──────────────────────────────
    if (type === 'checkout.session.completed') {
      const session = ev.data.object;

      // userId: prima da metadata, poi da client_reference_id, poi da email
      let userId = session.metadata?.userId || session.client_reference_id;
      if (!userId) {
        const email = session.customer_details?.email || session.customer_email;
        userId = await userIdByEmail(email);
        console.log('[webhook] userId recuperato da email:', email, '→', userId);
      }

      if (!userId) {
        console.error('[webhook] userId non trovato per session:', session.id);
        return { statusCode: 200, body: 'ok - userId not found' }; // 200 per non far rifare webhook
      }

      const plan  = session.metadata?.plan || 'mensile';
      const subId = session.subscription;
      let expDate = null;

      if (subId) {
        const sub = await stripe.subscriptions.retrieve(subId);
        expDate   = new Date(sub.current_period_end * 1000).toISOString();
      }

      await activate(userId, {
        piano:                  plan,
        stato:                  'active',        // ← 'active' non 'attivo'
        expiration_date:        expDate,
        stripe_customer_id:     session.customer,
        stripe_subscription_id: subId,
        stripe_session:         session.id,
      });
    }

    // ── invoice.payment_succeeded (rinnovo) ─────────────────────
    else if (type === 'invoice.payment_succeeded') {
      const invoice = ev.data.object;
      // Salta prima fattura (gestita da checkout.session.completed)
      if (invoice.billing_reason === 'subscription_create') {
        return { statusCode: 200, body: JSON.stringify({ received: true }) };
      }
      const sub    = await stripe.subscriptions.retrieve(invoice.subscription);
      const userId = sub.metadata?.userId;
      if (!userId) { console.warn('[webhook] rinnovo: userId mancante in sub metadata'); return { statusCode: 200, body: 'ok' }; }

      await activate(userId, {
        stato:           'active',
        expiration_date: new Date(sub.current_period_end * 1000).toISOString(),
      });
      console.log('[webhook] 🔄 Rinnovo:', userId);
    }

    // ── invoice.payment_failed ───────────────────────────────────
    else if (type === 'invoice.payment_failed') {
      const invoice = ev.data.object;
      if (!invoice.subscription) return { statusCode: 200, body: 'ok' };
      const sub    = await stripe.subscriptions.retrieve(invoice.subscription);
      const userId = sub.metadata?.userId;
      if (userId) await activate(userId, { stato: 'past_due' });
    }

    // ── customer.subscription.deleted ───────────────────────────
    else if (type === 'customer.subscription.deleted') {
      const sub    = ev.data.object;
      const userId = sub.metadata?.userId;
      if (userId) await activate(userId, { stato: 'canceled', expiration_date: new Date().toISOString() });
    }

  } catch (err) {
    console.error('[webhook] Handler error:', err.message);
    return { statusCode: 500, body: err.message };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
