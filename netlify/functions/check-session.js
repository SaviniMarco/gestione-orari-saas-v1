// ═══════════════════════════════════════════════════════════════════
// Netlify Function: check-session
// Verifica se un pagamento Stripe è andato a buon fine
// Chiamata dopo redirect da Stripe success_url
// ═══════════════════════════════════════════════════════════════════
const Stripe = require('stripe');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sessionId = event.queryStringParameters?.session_id;
  if (!sessionId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'session_id mancante' }) };
  }

  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status:    session.payment_status, // 'paid' | 'unpaid' | 'no_payment_required'
        plan:      session.metadata?.plan,
        months:    session.metadata?.months,
        customerEmail: session.customer_email,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
