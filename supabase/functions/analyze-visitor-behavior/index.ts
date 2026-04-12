import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');

interface VisitorData {
  sessionId: string;
  userId?: string;
  pageViews: Array<{
    path: string;
    timeOnPage: number;
    interactions: string[];
    timestamp: string;
  }>;
  interactions: Array<{
    type: 'cta_click' | 'form_start' | 'form_complete' | 'video_play' | 'scroll_depth' | 'exit_intent';
    element: string;
    value?: string;
    timestamp: string;
  }>;
  demographics: {
    location?: string;
    deviceType: string;
    isReturning: boolean;
  };
}

async function analyzeVisitorWithClaude(visitorData: VisitorData) {
  try {
    const analysisPrompt = `
    Analyze this ConveLabs website visitor behavior and provide optimization recommendations:

    Visitor Data:
    - Page Views: ${JSON.stringify(visitorData.pageViews)}
    - Interactions: ${JSON.stringify(visitorData.interactions)}
    - Demographics: ${JSON.stringify(visitorData.demographics)}

    ConveLabs Context:
    - Mobile phlebotomy service (blood draws at home/office)
    - Target audiences: Busy professionals, health-conscious individuals, corporate wellness, membership prospects
    - Services: At-home blood draws, same-day results, corporate programs
    - Membership plans with credits system

    Provide analysis in this exact JSON format:
    {
      "visitor_analysis": {
        "profile": "busy_professional|health_conscious|corporate|membership_prospect",
        "intent_score": 0-100,
        "conversion_likelihood": "high|medium|low",
        "pain_points": ["specific challenges"],
        "motivators": ["key drivers"]
      },
      "recommendations": {
        "immediate_actions": ["specific changes to make now"],
        "personalization": {
          "headline": "tailored headline variant",
          "cta": "optimized call-to-action",
          "offer": "relevant promotion/incentive"
        },
        "conversion_path": "direct_booking|consultation|nurture",
        "messaging_focus": ["key points to emphasize"]
      }
    }`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: analysisPrompt
          }
        ]
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const analysisText = data.content[0].text;
    
    // Extract JSON from the response
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    throw new Error('Failed to parse analysis response');
  } catch (error) {
    console.error('Error analyzing visitor with Claude:', error);
    // Return default analysis
    return {
      visitor_analysis: {
        profile: "busy_professional",
        intent_score: 50,
        conversion_likelihood: "medium",
        pain_points: ["time constraints", "scheduling flexibility"],
        motivators: ["convenience", "professional service"]
      },
      recommendations: {
        immediate_actions: ["highlight same-day service", "emphasize convenience"],
        personalization: {
          "headline": "Professional Blood Draws at Your Office",
          "cta": "Book Same-Day Service",
          "offer": "First-time professional discount"
        },
        conversion_path: "consultation",
        messaging_focus: ["time-saving", "professional quality"]
      }
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, data } = await req.json();

    if (action === 'analyze_visitor') {
      const analysis = await analyzeVisitorWithClaude(data);
      
      // Store visitor analysis in database
      const { error: insertError } = await supabase
        .from('visitor_analyses')
        .insert({
          session_id: data.sessionId,
          user_id: data.userId,
          visitor_data: data,
          analysis_result: analysis,
          created_at: new Date().toISOString()
        });

      if (insertError) {
        console.error('Error storing visitor analysis:', insertError);
      }

      return new Response(JSON.stringify({
        success: true,
        analysis
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'track_interaction') {
      // Store interaction data
      const { error: trackError } = await supabase
        .from('visitor_interactions')
        .insert({
          session_id: data.sessionId,
          user_id: data.userId,
          interaction_type: data.type,
          element: data.element,
          value: data.value,
          page_path: data.path,
          created_at: new Date().toISOString()
        });

      if (trackError) {
        console.error('Error tracking interaction:', trackError);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-visitor-behavior function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});