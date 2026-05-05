import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  try {
    const { invoice_id } = await req.json();
    const inv: any = await stripe.invoices.retrieve(invoice_id, { expand: ['customer'] } as any);
    return new Response(JSON.stringify({
      id: inv.id,
      status: inv.status,
      customer_id: inv.customer?.id || inv.customer,
      customer_email: inv.customer_email || inv.customer?.email,
      customer_name: inv.customer?.name,
      account_name: inv.account_name,
      account_country: inv.account_country,
      hosted_invoice_url: inv.hosted_invoice_url,
      finalized_at: inv.status_transitions?.finalized_at,
      sent_at: inv.status_transitions?.invoice_sent_at,
      paid_at: inv.status_transitions?.paid_at,
      amount_due: inv.amount_due,
      amount_paid: inv.amount_paid,
      collection_method: inv.collection_method,
      metadata: inv.metadata,
      lines: (inv.lines?.data || []).map((l: any) => ({ desc: l.description, amount: l.amount, metadata: l.metadata })),
    }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message }), { status: 500 });
  }
});
