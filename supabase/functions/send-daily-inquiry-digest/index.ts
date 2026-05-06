import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY');
    const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
    const OWNER_EMAIL = 'nicodemmebaptiste@convelabs.com';

    if (!MAILGUN_API_KEY) {
      throw new Error('Missing Mailgun API key');
    }

    // Get yesterday's inquiries
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: inquiries, error } = await supabase
      .from('chatbot_inquiries')
      .select('*')
      .gte('created_at', yesterday.toISOString())
      .lt('created_at', today.toISOString())
      .order('created_at', { ascending: true });

    if (error) throw error;

    if (!inquiries || inquiries.length === 0) {
      console.log('No inquiries yesterday — skipping digest');
      return new Response(
        JSON.stringify({ success: true, message: 'No inquiries to report' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Group by booking step
    const grouped: Record<string, typeof inquiries> = {};
    inquiries.forEach((q: any) => {
      const step = q.booking_step || 'General';
      if (!grouped[step]) grouped[step] = [];
      grouped[step].push(q);
    });

    // Build email HTML
    const dateStr = yesterday.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    let questionsHtml = '';
    for (const [step, questions] of Object.entries(grouped)) {
      questionsHtml += `<h3 style="color:#B91C1C;margin:16px 0 8px;">${step} (${questions.length})</h3>`;
      questions.forEach((q: any, i: number) => {
        questionsHtml += `
          <div style="background:#f9fafb;border-radius:8px;padding:12px;margin-bottom:8px;">
            <p style="margin:0;font-weight:600;font-size:14px;">Q: ${q.question}</p>
            <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">A: ${q.answer || 'No answer provided'}</p>
            <p style="margin:4px 0 0;font-size:11px;color:#9ca3af;">${new Date(q.created_at).toLocaleTimeString('en-US')}${q.patient_email ? ' | ' + q.patient_email : ''}</p>
          </div>
        `;
      });
    }

    // Identify potential FAQ candidates (questions asked more than once)
    const questionCounts: Record<string, number> = {};
    inquiries.forEach((q: any) => {
      const normalized = q.question.toLowerCase().trim();
      questionCounts[normalized] = (questionCounts[normalized] || 0) + 1;
    });
    const frequentQuestions = Object.entries(questionCounts)
      .filter(([_, count]) => count > 1)
      .sort((a, b) => b[1] - a[1]);

    let faqHtml = '';
    if (frequentQuestions.length > 0) {
      faqHtml = `
        <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:16px;margin:16px 0;">
          <h3 style="margin:0 0 8px;color:#92400e;">Potential FAQ Candidates</h3>
          ${frequentQuestions.map(([q, count]) => `<p style="margin:4px 0;font-size:13px;">"${q}" - asked ${count} times</p>`).join('')}
        </div>
      `;
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:linear-gradient(135deg,#B91C1C,#991B1B);color:white;padding:24px;border-radius:12px 12px 0 0;">
          <h1 style="margin:0;font-size:22px;">Daily Patient Inquiry Digest</h1>
          <p style="margin:4px 0 0;opacity:0.8;font-size:14px;">${dateStr}</p>
        </div>
        <div style="background:white;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:24px;">
          <div style="display:flex;gap:16px;margin-bottom:20px;">
            <div style="background:#fef2f2;border-radius:8px;padding:12px;flex:1;text-align:center;">
              <p style="margin:0;font-size:28px;font-weight:700;color:#B91C1C;">${inquiries.length}</p>
              <p style="margin:0;font-size:12px;color:#6b7280;">Total Questions</p>
            </div>
            <div style="background:#f0fdf4;border-radius:8px;padding:12px;flex:1;text-align:center;">
              <p style="margin:0;font-size:28px;font-weight:700;color:#059669;">${Object.keys(grouped).length}</p>
              <p style="margin:0;font-size:12px;color:#6b7280;">Booking Steps</p>
            </div>
          </div>
          ${faqHtml}
          <h2 style="font-size:18px;margin:20px 0 12px;">All Inquiries</h2>
          ${questionsHtml}
          <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;">
            <p style="font-size:12px;color:#9ca3af;">ConveLabs - 1800 Pembrook Drive, Suite 300, Orlando, FL 32810</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send via Mailgun
    const formData = new FormData();
    formData.append('from', 'Nicodemme Jean-Baptiste <info@convelabs.com>');
    formData.append('to', OWNER_EMAIL);
    formData.append('subject', `ConveLabs Daily Inquiry Digest - ${inquiries.length} questions (${dateStr})`);
    formData.append('html', emailHtml);

    const mgResponse = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}`,
      },
      body: formData,
    });

    if (!mgResponse.ok) {
      const errText = await mgResponse.text();
      throw new Error(`Mailgun error: ${errText}`);
    }

    console.log(`Daily digest sent: ${inquiries.length} inquiries`);

    return new Response(
      JSON.stringify({ success: true, inquiryCount: inquiries.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Daily digest error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
