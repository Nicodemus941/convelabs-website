import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });

Deno.serve(async () => {
  try {
    const bal = await stripe.balance.retrieve();
    const payouts = await stripe.payouts.list({ limit: 10 });
    return new Response(JSON.stringify({
      balance: {
        available: bal.available,
        pending: bal.pending,
        instant_available: (bal as any).instant_available || null,
      },
      recent_payouts: payouts.data.map(p => ({
        id: p.id, amount: p.amount, currency: p.currency,
        status: p.status, arrival_date: new Date(p.arrival_date * 1000).toISOString(),
        method: p.method, type: p.type,
      })),
    }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message }), { status: 500 });
  }
});
