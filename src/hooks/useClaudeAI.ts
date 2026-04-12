import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ClaudeAIResponse {
  success: boolean;
  response?: string;
  model?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  error?: string;
}

interface ClaudeAIOptions {
  model?: string;
  max_tokens?: number;
  temperature?: number;
  system_prompt?: string;
}

export function useClaudeAI() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const sendMessage = async (
    messages: ChatMessage[],
    options: ClaudeAIOptions = {}
  ): Promise<string | null> => {
    setLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('claude-ai-chat', {
        body: {
          messages,
          ...options
        }
      });

      if (error) {
        throw error;
      }

      const response = data as ClaudeAIResponse;

      if (!response.success) {
        throw new Error(response.error || 'Unknown error occurred');
      }

      return response.response || null;
    } catch (error) {
      console.error('Claude AI error:', error);
      toast({
        title: "AI Error",
        description: error.message || "Failed to get AI response",
        variant: "destructive",
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const generateContent = async (
    prompt: string,
    systemPrompt?: string,
    options: Omit<ClaudeAIOptions, 'system_prompt'> = {}
  ): Promise<string | null> => {
    const messages: ChatMessage[] = [
      { role: 'user', content: prompt }
    ];

    return sendMessage(messages, {
      ...options,
      system_prompt: systemPrompt
    });
  };

  const improveText = async (
    text: string,
    instruction: string = "Improve this text for clarity, engagement, and professionalism"
  ): Promise<string | null> => {
    return generateContent(
      `Please ${instruction}:\n\n${text}`,
      "You are an expert content writer specializing in healthcare and professional communications. Provide clear, engaging, and professional content."
    );
  };

  const generateMarketingContent = async (
    type: 'email' | 'social' | 'blog' | 'ad',
    topic: string,
    targetAudience?: string
  ): Promise<string | null> => {
    const audienceText = targetAudience ? ` for ${targetAudience}` : '';
    const prompt = `Create compelling ${type} content about ${topic}${audienceText}. Make it engaging, professional, and relevant to healthcare services.`;
    
    return generateContent(
      prompt,
      "You are a healthcare marketing expert specializing in mobile phlebotomy and at-home medical services. Create content that is professional, trustworthy, and engaging while adhering to healthcare marketing best practices."
    );
  };

  const analyzeText = async (
    text: string,
    analysisType: 'sentiment' | 'summary' | 'keywords' | 'tone' = 'summary'
  ): Promise<string | null> => {
    const prompts = {
      sentiment: `Analyze the sentiment of this text and provide insights: ${text}`,
      summary: `Provide a concise summary of this text: ${text}`,
      keywords: `Extract the key topics and keywords from this text: ${text}`,
      tone: `Analyze the tone and style of this text: ${text}`
    };

    return generateContent(
      prompts[analysisType],
      "You are an expert text analyst. Provide clear, actionable insights about the given text."
    );
  };

  return {
    loading,
    sendMessage,
    generateContent,
    improveText,
    generateMarketingContent,
    analyzeText
  };
}