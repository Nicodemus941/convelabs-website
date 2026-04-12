
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { 
  Table, 
  TableBody, 
  TableCaption, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  CalendarIcon, 
  Users, 
  Mail, 
  AlertTriangle, 
  Check, 
  Info,
  Clock,
  Trash2
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { getScheduledCampaigns, deleteScheduledCampaign } from '@/services/email-marketing';
import { ScheduledCampaign } from '@/types/marketingTypes';

export default function ScheduledCampaignsTable() {
  const { toast } = useToast();
  const [campaignToDelete, setCampaignToDelete] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['scheduledCampaigns'],
    queryFn: async () => {
      const result = await getScheduledCampaigns();
      if (result.error) throw result.error;
      return result.data as ScheduledCampaign[];
    }
  });

  const handleDeleteCampaign = async (id: string) => {
    const result = await deleteScheduledCampaign(id);
    if (result.success) {
      toast({
        title: "Campaign deleted",
        description: "The scheduled campaign has been deleted.",
        variant: "default",
      });
      refetch();
    } else {
      toast({
        title: "Error",
        description: "Failed to delete the campaign. It may have already been processed.",
        variant: "destructive",
      });
    }
    setCampaignToDelete(null);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            <Clock className="h-3 w-3 mr-1" />
            Scheduled
          </Badge>
        );
      case 'processing':
        return (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Processing
          </Badge>
        );
      case 'completed':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <Check className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            <Info className="h-3 w-3 mr-1" />
            {status}
          </Badge>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="py-10 text-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
        <p className="mt-2 text-muted-foreground">Loading scheduled campaigns...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-10 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
        <p className="mt-2 text-destructive">Failed to load scheduled campaigns</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-muted/30 rounded-lg p-10 text-center">
        <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <h3 className="text-lg font-medium">No scheduled campaigns</h3>
        <p className="text-muted-foreground mt-1">
          When you schedule marketing campaigns, they will appear here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <Table>
        <TableCaption>
          Showing {data.length} scheduled campaigns
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Scheduled For</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead className="text-right">Recipients</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((campaign) => (
            <TableRow key={campaign.id}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  {format(new Date(campaign.scheduled_for), 'PPP p')}
                </div>
              </TableCell>
              <TableCell>
                {campaign.template_data.subject}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  {campaign.estimated_recipients}
                </div>
              </TableCell>
              <TableCell>
                {getStatusBadge(campaign.status)}
              </TableCell>
              <TableCell>
                {campaign.status === 'scheduled' && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setCampaignToDelete(campaign.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Scheduled Campaign</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete this scheduled campaign? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setCampaignToDelete(null)}>
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeleteCampaign(campaign.id)}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
