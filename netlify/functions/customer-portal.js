// ═══════════════════════════════════════════════════════════════════
// Netlify Function: customer-portal
// Apre il portale Stripe dove il cliente gestisce abbonamento/fatture
// POST /.netlify/functions/customer-portal
// Body: { userId, userEmail }
// ═══════════════════════════════════════════════════════════════════
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { userId, userEmail } = JSON.parse(event.body || '{}');
    if (!userId || !userEmail) {
      return { statusCode: 400, body: JSON.stringify({ error: 'userId e userEmail obbligatori' }) };
    }

    const stripe  = Stripe(process.env.STRIPE_SECRET_KEY);
    const appUrl  = process.env.APP_URL || 'https://visionary-lamington-701083.netlify.app';

    // Trova customer Stripe tramite email
    const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
    if (!customers.data.length) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Cliente non trovato su Stripe' }) };
    }

    const session = await stripe.billingPortal.sessions.create({
      customer:   customers.data[0].id,
      return_url: appUrl,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url }),
    };

  } catch (err) {
    console.error('customer-portal error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
