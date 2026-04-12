import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  max_tokens?: number;
  temperature?: number;
  system_prompt?: string;
}

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }

    const {
      messages,
      model = 'claude-3-5-sonnet-20241022',
      max_tokens = 4096,
      temperature = 0.7,
      system_prompt
    }: ChatRequest = await req.json();

    console.log('Claude AI request:', { 
      messageCount: messages.length, 
      model, 
      max_tokens, 
      temperature 
    });

    // Filter out system messages and convert to Claude format
    const claudeMessages: ClaudeMessage[] = messages
      .filter(msg => msg.role !== 'system')
      .map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }));

    // Build request body for Claude API
    const requestBody: any = {
      model,
      max_tokens,
      temperature,
      messages: claudeMessages
    };

    // Add system prompt if provided or if there are system messages
    const systemMessages = messages.filter(msg => msg.role === 'system');
    if (system_prompt) {
      requestBody.system = system_prompt;
    } else if (systemMessages.length > 0) {
      requestBody.system = systemMessages.map(msg => msg.content).join('\n\n');
    }

    console.log('Sending request to Claude API...');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      throw new Error(`Claude API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Claude API response received successfully');

    // Extract the response content
    const aiResponse = data.content?.[0]?.text || 'No response generated';

    return new Response(
      JSON.stringify({
        success: true,
        response: aiResponse,
        model: data.model,
        usage: data.usage
      }),
      {
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        }
      }
    );

  } catch (error) {
    console.error('Error in Claude AI chat function:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error occurred'
      }),
      {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        }
      }
    );
  }
});