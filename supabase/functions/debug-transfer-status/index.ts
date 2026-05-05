import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { transfer_id, charge_id, connect_account_id } = await req.json();
    const out: any = {};

    if (transfer_id) {
      const t = await stripe.transfers.retrieve(transfer_id);
      out.transfer = {
        id: t.id, amount: t.amount, currency: t.currency,
        destination: t.destination, source_transaction: t.source_transaction,
        reversed: t.reversed, amount_reversed: t.amount_reversed, created: t.created,
      };
    }
    if (charge_id) {
      const c = await stripe.charges.retrieve(charge_id, { expand: ['balance_transaction'] } as any);
      const bt: any = (c as any).balance_transaction;
      out.charge = {
        id: c.id, paid: c.paid, status: c.status, amount: c.amount,
        balance_transaction_status: bt?.status, available_on: bt?.available_on,
      };
    }
    if (connect_account_id) {
      const bal = await stripe.balance.retrieve({ stripeAccount: connect_account_id });
      out.connect_balance = bal;
      const transfers = await stripe.transfers.list({ destination: connect_account_id, limit: 5 });
      out.recent_transfers_to_connect = transfers.data.map(t => ({
        id: t.id, amount: t.amount, created: t.created, reversed: t.reversed,
      }));
    }
    return new Response(JSON.stringify(out, null, 2), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message, type: e?.type, code: e?.code }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
