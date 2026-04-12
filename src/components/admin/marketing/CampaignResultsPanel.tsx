
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Users, 
  Mail,
  Info
} from 'lucide-react';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';

interface CampaignResultsProps {
  results: {
    total?: number;
    sent?: number;
    failed?: number;
    recipient?: string;
    test_mode?: boolean;
    message?: string;
  } | null;
}

export default function CampaignResultsPanel({ results }: CampaignResultsProps) {
  if (!results) return null;
  
  // For test mode
  if (results.test_mode) {
    return (
      <Card className="mb-6 shadow-sm border-green-100">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-500" />
            Test Email Sent
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Test email was sent to: <span className="font-medium">{results.recipient}</span>
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Please check the inbox to verify that the email was delivered and appears correctly.
          </p>
        </CardContent>
      </Card>
    );
  }

  // For regular campaign results
  if (results.total === 0) {
    return (
      <Card className="mb-6 shadow-sm border-yellow-100">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            No Recipients Found
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {results.message || "No recipients matched your criteria. Please adjust filters or add manual email addresses."}
          </p>
        </CardContent>
      </Card>
    );
  }

  // Calculate success rate
  const successRate = results.total ? Math.round((results.sent || 0) / results.total * 100) : 0;
  
  return (
    <Card className="mb-6 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          Campaign Results
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="flex flex-col items-center p-3 bg-muted/30 rounded-md">
            <Users className="h-5 w-5 text-muted-foreground mb-1" />
            <span className="text-2xl font-bold">{results.total}</span>
            <span className="text-xs text-muted-foreground">Total Recipients</span>
          </div>
          
          <div className="flex flex-col items-center p-3 bg-green-50 rounded-md">
            <CheckCircle className="h-5 w-5 text-green-500 mb-1" />
            <span className="text-2xl font-bold">{results.sent}</span>
            <span className="text-xs text-muted-foreground">Successfully Sent</span>
          </div>
          
          <div className="flex flex-col items-center p-3 bg-red-50 rounded-md">
            <XCircle className="h-5 w-5 text-red-500 mb-1" />
            <span className="text-2xl font-bold">{results.failed}</span>
            <span className="text-xs text-muted-foreground">Failed</span>
          </div>
        </div>
        
        <div className="mb-2">
          <div className="flex justify-between text-sm mb-1">
            <span>Success Rate</span>
            <span className="font-medium">{successRate}%</span>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Progress value={successRate} className="h-2" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{results.sent} of {results.total} emails sent successfully</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        
        <p className="text-sm text-muted-foreground mt-4">
          Emails have been queued for delivery. Recipients may receive them within a few minutes.
        </p>
      </CardContent>
    </Card>
  );
}
