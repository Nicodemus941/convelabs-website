import { stripe } from '../_shared/stripe.ts';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { invoiceIds } = await req.json();

    if (!invoiceIds || !Array.isArray(invoiceIds)) {
      return new Response(JSON.stringify({ error: 'invoiceIds array required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = [];
    for (const id of invoiceIds) {
      try {
        const invoice = await stripe.invoices.retrieve(id);
        results.push({
          id: invoice.id,
          status: invoice.status,
          paid: invoice.paid,
          amount_due: invoice.amount_due,
          amount_paid: invoice.amount_paid,
          customer_email: invoice.customer_email,
          hosted_invoice_url: invoice.hosted_invoice_url,
        });
      } catch (err: any) {
        results.push({ id, error: err.message });
      }
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
