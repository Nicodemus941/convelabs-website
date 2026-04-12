
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
import { 
  CalendarIcon, 
  Users, 
  Mail, 
  AlertTriangle, 
  Check, 
  Info,
  Download,
  FileText,
  Filter
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { DateRange } from 'react-day-picker';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { exportToCSV, exportToPDF } from '@/utils/exportUtils';
import { format } from 'date-fns';

// Define a proper type for the metadata object structure
interface EmailMetadata {
  campaign?: boolean;
  campaign_id?: string;
  template_name?: string;
  test_mode?: boolean;
}

interface CampaignRecord {
  id: string;
  template_name: string;
  sent_at: string;
  total_recipients: number;
  successful_deliveries: number;
  failed_deliveries: number;
  test_mode: boolean;
  subject: string;
}

interface FilterOptions {
  dateRange: DateRange | undefined;
  subject: string;
  status: 'all' | 'complete' | 'partial' | 'test';
}

export default function CampaignHistoryTable() {
  const [filters, setFilters] = useState<FilterOptions>({
    dateRange: undefined,
    subject: '',
    status: 'all'
  });

  const { data: campaigns, isLoading, error } = useQuery({
    queryKey: ['campaignHistory', filters],
    queryFn: async () => {
      let query = supabase
        .from('email_logs')
        .select('*')
        .eq('status', 'sent')
        .filter('metadata->campaign', 'eq', true)
        .order('sent_at', { ascending: false })
        .limit(100);
      
      // Apply date range filter if set
      if (filters.dateRange?.from) {
        query = query.gte('sent_at', filters.dateRange.from.toISOString());
      }
      
      if (filters.dateRange?.to) {
        // Add a day to include the entire end date
        const toDate = new Date(filters.dateRange.to);
        toDate.setDate(toDate.getDate() + 1);
        query = query.lt('sent_at', toDate.toISOString());
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      // Process the raw logs to construct campaign records
      // In a real implementation this would be more robust
      const campaignMap = new Map<string, CampaignRecord>();
      
      data.forEach(log => {
        const metadata = log.metadata as unknown as EmailMetadata;
        const campaignId = metadata?.campaign_id || log.sent_at;
        const isTest = metadata?.test_mode || false;
        
        if (!campaignMap.has(campaignId)) {
          campaignMap.set(campaignId, {
            id: campaignId,
            template_name: metadata?.template_name || 'Marketing Campaign',
            sent_at: log.sent_at,
            total_recipients: 1,
            successful_deliveries: log.status === 'sent' ? 1 : 0,
            failed_deliveries: log.status === 'failed' ? 1 : 0,
            test_mode: isTest,
            subject: log.subject
          });
        } else {
          const campaign = campaignMap.get(campaignId)!;
          campaign.total_recipients += 1;
          if (log.status === 'sent') {
            campaign.successful_deliveries += 1;
          } else {
            campaign.failed_deliveries += 1;
          }
        }
      });
      
      // Convert the map to an array
      let campaignsArray = Array.from(campaignMap.values());
      
      // Apply client-side filters
      if (filters.subject) {
        campaignsArray = campaignsArray.filter(campaign => 
          campaign.subject.toLowerCase().includes(filters.subject.toLowerCase())
        );
      }
      
      if (filters.status !== 'all') {
        campaignsArray = campaignsArray.filter(campaign => {
          if (filters.status === 'test') return campaign.test_mode;
          if (filters.status === 'complete') return campaign.failed_deliveries === 0 && !campaign.test_mode;
          if (filters.status === 'partial') return campaign.failed_deliveries > 0 && !campaign.test_mode;
          return true;
        });
      }
      
      return campaignsArray;
    }
  });

  const handleExportCSV = () => {
    if (!campaigns || campaigns.length === 0) return;
    
    exportToCSV(
      campaigns, 
      `campaign-history-${format(new Date(), 'yyyy-MM-dd')}`,
      [
        { key: 'sent_at', header: 'Date' },
        { key: 'subject', header: 'Subject' },
        { key: 'template_name', header: 'Template' },
        { key: 'total_recipients', header: 'Recipients' },
        { key: 'successful_deliveries', header: 'Delivered' },
        { key: 'failed_deliveries', header: 'Failed' },
        { key: 'test_mode', header: 'Test Mode' }
      ]
    );
  };

  const handleExportPDF = () => {
    if (!campaigns || campaigns.length === 0) return;
    
    exportToPDF(
      campaigns, 
      `Campaign History Report - ${format(new Date(), 'yyyy-MM-dd')}`,
      [
        { key: 'sent_at', header: 'Date' },
        { key: 'subject', header: 'Subject' },
        { key: 'template_name', header: 'Template' },
        { key: 'total_recipients', header: 'Recipients' },
        { key: 'successful_deliveries', header: 'Delivered' },
        { key: 'failed_deliveries', header: 'Failed' },
        { key: 'test_mode', header: 'Test Mode' }
      ]
    );
  };

  const updateSubjectFilter = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters(prev => ({ ...prev, subject: e.target.value }));
  };

  const updateStatusFilter = (status: 'all' | 'complete' | 'partial' | 'test') => {
    setFilters(prev => ({ ...prev, status }));
  };

  const updateDateRange = (range: DateRange | undefined) => {
    setFilters(prev => ({ ...prev, dateRange: range }));
  };

  if (isLoading) {
    return (
      <div className="py-10 text-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
        <p className="mt-2 text-muted-foreground">Loading campaign history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-10 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
        <p className="mt-2 text-destructive">Failed to load campaign history</p>
      </div>
    );
  }

  if (!campaigns || campaigns.length === 0) {
    return (
      <div className="bg-muted/30 rounded-lg p-10 text-center">
        <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <h3 className="text-lg font-medium">No campaigns sent yet</h3>
        <p className="text-muted-foreground mt-1">
          When you send marketing campaigns, they will appear here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-4 mb-6 justify-between items-start sm:items-center">
        <div className="flex flex-wrap gap-2">
          {/* Subject filter */}
          <div className="w-full sm:w-auto">
            <Input
              placeholder="Filter by subject..."
              value={filters.subject}
              onChange={updateSubjectFilter}
              className="max-w-xs"
            />
          </div>
          
          {/* Date range filter */}
          <DatePickerWithRange 
            date={filters.dateRange} 
            setDate={updateDateRange} 
          />
          
          {/* Status filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-10">
                <Filter className="h-4 w-4 mr-2" />
                Status: {filters.status.charAt(0).toUpperCase() + filters.status.slice(1)}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-0">
              <div className="flex flex-col">
                <Button 
                  variant={filters.status === 'all' ? 'secondary' : 'ghost'} 
                  className="justify-start rounded-none"
                  onClick={() => updateStatusFilter('all')}
                >
                  All
                </Button>
                <Button 
                  variant={filters.status === 'complete' ? 'secondary' : 'ghost'} 
                  className="justify-start rounded-none"
                  onClick={() => updateStatusFilter('complete')}
                >
                  <Check className="h-4 w-4 mr-2 text-green-600" />
                  Complete
                </Button>
                <Button 
                  variant={filters.status === 'partial' ? 'secondary' : 'ghost'} 
                  className="justify-start rounded-none"
                  onClick={() => updateStatusFilter('partial')}
                >
                  <AlertTriangle className="h-4 w-4 mr-2 text-amber-600" />
                  Partial
                </Button>
                <Button 
                  variant={filters.status === 'test' ? 'secondary' : 'ghost'} 
                  className="justify-start rounded-none"
                  onClick={() => updateStatusFilter('test')}
                >
                  <Info className="h-4 w-4 mr-2 text-blue-600" />
                  Test
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        
        {/* Export buttons */}
        <div className="flex space-x-2">
          <Button 
            onClick={handleExportPDF} 
            variant="outline" 
            size="sm"
            className="gap-1"
          >
            <FileText className="h-4 w-4 mr-1" />
            Export PDF
          </Button>
          <Button 
            onClick={handleExportCSV} 
            variant="outline" 
            size="sm"
            className="gap-1"
          >
            <Download className="h-4 w-4 mr-1" />
            Export CSV
          </Button>
        </div>
      </div>
      
      <Table>
        <TableCaption>
          Showing {campaigns.length} campaigns
          {filters.dateRange?.from && filters.dateRange?.to && 
            ` from ${format(filters.dateRange.from, 'MMM d, yyyy')} to ${format(filters.dateRange.to, 'MMM d, yyyy')}`}
          {filters.subject && ` matching "${filters.subject}"`}
          {filters.status !== 'all' && ` with status "${filters.status}"`}
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead className="text-right">Recipients</TableHead>
            <TableHead className="text-right">Delivered</TableHead>
            <TableHead className="text-right">Failed</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {campaigns.map((campaign) => (
            <TableRow key={campaign.id}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  {new Date(campaign.sent_at).toLocaleDateString()}
                </div>
              </TableCell>
              <TableCell>
                {campaign.subject}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  {campaign.total_recipients}
                </div>
              </TableCell>
              <TableCell className="text-right text-green-600 font-medium">
                {campaign.successful_deliveries}
              </TableCell>
              <TableCell className="text-right text-red-600 font-medium">
                {campaign.failed_deliveries}
              </TableCell>
              <TableCell>
                {campaign.test_mode ? (
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    <Info className="h-3 w-3 mr-1" />
                    Test
                  </Badge>
                ) : campaign.failed_deliveries === 0 ? (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    <Check className="h-3 w-3 mr-1" />
                    Complete
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Partial
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
