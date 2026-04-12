
import React from 'react';
import { format } from 'date-fns';
import { 
  Alert,
  AlertTitle,
  AlertDescription 
} from '@/components/ui/alert';
import { 
  CheckCircle2, 
  AlertCircle,
  Clock
} from 'lucide-react';

interface CampaignResultsProps {
  campaignResults: {
    scheduled?: boolean;
    scheduled_for?: string;
    estimated_recipients?: number;
    total?: number;
    sent?: number;
    failed?: number;
    recipient?: string;
  } | null;
}

const CampaignResultAlert: React.FC<CampaignResultsProps> = ({ campaignResults }) => {
  if (!campaignResults) return null;

  // If campaign is scheduled
  if (campaignResults.scheduled && campaignResults.scheduled_for) {
    return (
      <Alert className="mb-6 bg-blue-50 border-blue-200">
        <Clock className="h-5 w-5 text-blue-600" />
        <AlertTitle className="text-blue-800">Campaign Scheduled</AlertTitle>
        <AlertDescription className="text-blue-700">
          Your campaign has been scheduled for{' '}
          <strong>{format(new Date(campaignResults.scheduled_for), 'PPP p')}</strong>.
          <br />
          Estimated recipients: <strong>{campaignResults.estimated_recipients}</strong>.
        </AlertDescription>
      </Alert>
    );
  }

  // If it's a test email
  if (campaignResults.recipient) {
    return (
      <Alert className="mb-6 bg-green-50 border-green-200">
        <CheckCircle2 className="h-5 w-5 text-green-600" />
        <AlertTitle className="text-green-800">Test Email Sent</AlertTitle>
        <AlertDescription className="text-green-700">
          A test email has been sent to <strong>{campaignResults.recipient}</strong>.
        </AlertDescription>
      </Alert>
    );
  }

  // For regular campaigns
  if (campaignResults.sent !== undefined) {
    // Some emails failed
    if (campaignResults.failed && campaignResults.failed > 0) {
      return (
        <Alert className="mb-6 bg-yellow-50 border-yellow-200">
          <AlertCircle className="h-5 w-5 text-yellow-600" />
          <AlertTitle className="text-yellow-800">Campaign Started with Warnings</AlertTitle>
          <AlertDescription className="text-yellow-700">
            Your campaign has started. <strong>{campaignResults.sent}</strong> emails queued for delivery.
            <br />
            However, <strong>{campaignResults.failed}</strong> emails could not be queued.
          </AlertDescription>
        </Alert>
      );
    }

    // All emails succeeded
    return (
      <Alert className="mb-6 bg-green-50 border-green-200">
        <CheckCircle2 className="h-5 w-5 text-green-600" />
        <AlertTitle className="text-green-800">Campaign Started</AlertTitle>
        <AlertDescription className="text-green-700">
          Your campaign has started. <strong>{campaignResults.sent}</strong> emails queued for delivery.
        </AlertDescription>
      </Alert>
    );
  }

  return null;
};

export default CampaignResultAlert;
