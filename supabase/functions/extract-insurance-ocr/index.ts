// extract-insurance-ocr v11 — front + back card OCR.
//
// 2026-05-08: accepts `side` ('front' | 'back'). Back-side OCR targets a
// different field set (member-services phone, claims-submission address)
// — these are the fields insurers REQUIRE to verify a claim. Reduces the
// $50-150/rejection class of failures.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { filePath, imageBase64, patientId, appointmentId, rank, side } = await req.json();
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
    if (!filePath && !imageBase64) throw new Error('filePath or imageBase64 required');

    const insRank: 'primary' | 'secondary' = rank === 'secondary' ? 'secondary' : 'primary';
    const cardSide: 'front' | 'back' = side === 'back' ? 'back' : 'front';

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    let base64Data = imageBase64;
    let mediaType = 'image/jpeg';

    if (filePath && !imageBase64) {
      let dl = await supabase.storage.from('insurance-cards').download(filePath);
      if (dl.error) {
        const fb = await supabase.storage.from('lab-orders').download(filePath);
        if (fb.error) throw new Error(`Failed to download file from either bucket: ${fb.error.message}`);
        dl = fb;
      }
      const arrayBuffer = await dl.data!.arrayBuffer();
      base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      if (filePath.endsWith('.png')) mediaType = 'image/png';
      else if (filePath.endsWith('.pdf')) mediaType = 'application/pdf';
      else if (filePath.endsWith('.heic')) mediaType = 'image/heic';
      else if (filePath.endsWith('.webp')) mediaType = 'image/webp';
    }

    const FRONT_PROMPT = `Extract all insurance information from this insurance card FRONT image. Return ONLY a JSON object with these fields (use null if not found):
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
Return ONLY the JSON, no explanation or markdown.`;

    const BACK_PROMPT = `Extract all useful information from this insurance card BACK image. The back typically contains member-services phone numbers (CRITICAL for claim verification), claims-submission addresses, and provider-side info. Return ONLY a JSON object (use null if not found):
{
  "memberServicesPhone": "Customer / member-services phone number",
  "providerServicesPhone": "Provider services phone (separate from member services)",
  "claimsPhone": "Claims-specific phone if separate",
  "claimsAddress": "Mailing address for paper claims",
  "electronicPayerId": "Electronic payer ID if shown",
  "website": "Insurance company website",
  "groupNumber": "Group number if printed on the back",
  "effectiveDate": "Effective date if printed on the back",
  "notes": "Any other notable information (precert phone, behavioral health line, etc.)"
}
Return ONLY the JSON, no explanation or markdown.`;

    console.log(`[extract-insurance-ocr] processing rank=${insRank} side=${cardSide} patient=${patientId || 'none'}`);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            { type: 'text', text: cardSide === 'back' ? BACK_PROMPT : FRONT_PROMPT },
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
    let extracted: any = null;
    try {
      const jsonMatch = textContent.match(/\{[\s\S]*\}/);
      extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      console.error('[extract-insurance-ocr] failed to parse Claude response:', textContent);
    }

    if (!extracted) {
      return new Response(JSON.stringify({ success: false, error: 'Could not extract insurance data from image' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (patientId) {
      try {
        const { data: existing } = await supabase
          .from('patient_insurances')
          .select('id, card_front_path, card_back_path, ocr_raw_response, group_number')
          .eq('patient_id', patientId)
          .eq('rank', insRank)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const updateFields: any = {};
        if (cardSide === 'front') {
          updateFields.provider = extracted.provider || null;
          updateFields.member_id = extracted.memberId || null;
          updateFields.group_number = extracted.groupNumber || null;
          updateFields.plan_type = extracted.planType || null;
          if (filePath && (!existing || !existing.card_front_path)) {
            updateFields.card_front_path = filePath;
          }
          updateFields.ocr_raw_response = {
            ...((existing as any)?.ocr_raw_response || {}),
            front: extracted,
          };
        } else {
          if (extracted.groupNumber && existing && !(existing as any).group_number) {
            updateFields.group_number = extracted.groupNumber;
          }
          if (filePath && (!existing || !(existing as any).card_back_path)) {
            updateFields.card_back_path = filePath;
          }
          updateFields.ocr_raw_response = {
            ...((existing as any)?.ocr_raw_response || {}),
            back: extracted,
          };
        }

        if (existing) {
          await supabase.from('patient_insurances').update(updateFields).eq('id', existing.id);
        } else {
          await supabase.from('patient_insurances')
            .update({ is_active: false })
            .eq('patient_id', patientId)
            .eq('rank', insRank)
            .eq('is_active', true);
          await supabase.from('patient_insurances').insert({
            patient_id: patientId, rank: insRank, is_active: true,
            card_front_path: cardSide === 'front' ? (filePath || null) : null,
            card_back_path: cardSide === 'back' ? (filePath || null) : null,
            ...updateFields,
          });
        }
      } catch (e) {
        console.warn('[extract-insurance-ocr] patient_insurances write failed:', e);
      }
    }

    if (patientId && insRank === 'primary' && cardSide === 'front' && extracted.provider) {
      try {
        await supabase.from('tenant_patients').update({
          insurance_provider: extracted.provider,
          insurance_member_id: extracted.memberId,
          insurance_group_number: extracted.groupNumber,
        }).eq('id', patientId);
      } catch (e) {
        console.warn('[extract-insurance-ocr] tenant_patients legacy update failed:', e);
      }
    }

    return new Response(JSON.stringify({ success: true, data: extracted, rank: insRank, side: cardSide }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[extract-insurance-ocr] error:', error);
    return new Response(JSON.stringify({ success: false, error: error?.message || String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
