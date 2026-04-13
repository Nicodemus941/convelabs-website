import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { filePath, imageBase64, patientId } = await req.json();
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
    if (!filePath && !imageBase64) throw new Error('filePath or imageBase64 required');

    let base64Data = imageBase64;
    let mediaType = 'image/jpeg';

    // If filePath provided, download from Supabase Storage
    if (filePath && !imageBase64) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') || '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      );

      const { data, error } = await supabase.storage.from('lab-orders').download(filePath);
      if (error) throw new Error(`Failed to download file: ${error.message}`);

      const arrayBuffer = await data.arrayBuffer();
      base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      // Detect media type
      if (filePath.endsWith('.png')) mediaType = 'image/png';
      else if (filePath.endsWith('.pdf')) mediaType = 'application/pdf';
      else if (filePath.endsWith('.heic')) mediaType = 'image/heic';
    }

    // Call Claude Vision API
    console.log('Sending image to Claude Vision for insurance extraction...');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Data },
            },
            {
              type: 'text',
              text: `Extract all insurance information from this insurance card image. Return ONLY a JSON object with these fields (use null if not found):
{
  "provider": "Insurance company name",
  "memberId": "Member/Subscriber ID number",
  "groupNumber": "Group number",
  "planType": "Plan type (PPO, HMO, EPO, etc.)",
  "subscriberName": "Name on the card",
  "rxBin": "RX BIN number",
  "rxPcn": "RX PCN number",
  "rxGroup": "RX Group",
  "copay": "Copay amount if shown",
  "effectiveDate": "Effective date if shown",
  "phoneNumber": "Customer service phone number"
}
Return ONLY the JSON, no explanation or markdown.`,
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Claude API error: ${response.status} ${errText}`);
    }

    const result = await response.json();
    const textContent = result.content?.[0]?.text || '';

    // Parse the JSON from Claude's response
    let extracted;
    try {
      // Try to extract JSON from the response (Claude sometimes wraps in markdown)
      const jsonMatch = textContent.match(/\{[\s\S]*\}/);
      extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      console.error('Failed to parse Claude response:', textContent);
      extracted = null;
    }

    if (!extracted) {
      return new Response(JSON.stringify({ success: false, error: 'Could not extract insurance data from image' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If patientId provided, update tenant_patients
    if (patientId && extracted.provider) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') || '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      );

      await supabase.from('tenant_patients').update({
        insurance_provider: extracted.provider,
        insurance_member_id: extracted.memberId,
        insurance_group_number: extracted.groupNumber,
      }).eq('id', patientId);

      console.log(`Updated insurance for patient ${patientId}: ${extracted.provider}`);
    }

    return new Response(JSON.stringify({ success: true, data: extracted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('OCR extraction error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
