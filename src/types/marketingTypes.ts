
export interface EmailTemplate {
  id: string;
  name: string;
  subject_template: string;
  description: string | null;
  html_template?: string;
}

export interface MarketingCampaignFormValues {
  templateId: string;
  senderName: string;
  senderEmail: string;
  replyTo: string;
  subject: string;
  includeFoundingMembers: boolean;
  includeSupernovaMembers: boolean;
  onlyActiveMembers: boolean;
  customMessage: string;
  manualEmails: string;
  recipientMode: 'members' | 'manual';
  schedulingMode: 'now' | 'later';
  scheduledDate: Date | null;
  scheduledTime: string | null;
}

export interface ScheduledCampaign {
  id: string;
  template_name: string;
  template_data: Record<string, any>;
  sender_name: string;
  sender_email: string;
  reply_to: string;
  scheduled_for: string;
  status: 'scheduled' | 'processing' | 'completed' | 'failed';
  created_at: string;
  estimated_recipients: number;
  result?: {
    sent?: number;
    failed?: number;
    total?: number;
    message?: string;
    error?: string;
  };
  processed_at?: string;
}
