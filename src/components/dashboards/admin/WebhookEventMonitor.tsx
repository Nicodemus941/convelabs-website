import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, ChevronDown, ChevronRight, RotateCcw, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface WebhookEvent {
  id: string;
  event_id: string;
  event_type: string;
  booking_id: string | null;
  payload_json: any;
  processed_status: string;
  error_message: string | null;
  retry_count: number;
  received_at: string;
  processed_at: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  processed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

const WebhookEventMonitor: React.FC = () => {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchBookingId, setSearchBookingId] = useState('');
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    let query = supabase
      .from('ghs_webhook_events')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(100);

    if (filterType !== 'all') query = query.eq('event_type', filterType);
    if (filterStatus !== 'all') query = query.eq('processed_status', filterStatus);
    if (searchBookingId.trim()) query = query.ilike('booking_id', `%${searchBookingId.trim()}%`);

    const { data, error } = await query;
    if (error) {
      toast.error('Failed to load webhook events');
      console.error(error);
    } else {
      setEvents((data as WebhookEvent[]) || []);
    }
    setLoading(false);
  }, [filterType, filterStatus, searchBookingId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchEvents, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchEvents]);

  const retryEvent = async (eventId: string) => {
    setRetryingId(eventId);
    try {
      const { data, error } = await supabase.functions.invoke('ghs-webhook', {
        body: { action: 'reprocess', event_id: eventId },
      });

      if (error) {
        toast.error('Failed to reprocess event');
        console.error('Reprocess error:', error);
      } else {
        toast.success('Event reprocessed successfully');
        fetchEvents();
      }
    } catch (err) {
      toast.error('Failed to reprocess event');
      console.error(err);
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>GHS Webhook Events</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant={autoRefresh ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${autoRefresh ? 'animate-spin' : ''}`} />
              {autoRefresh ? 'Auto' : 'Manual'}
            </Button>
            <Button variant="outline" size="sm" onClick={fetchEvents}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Event Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="booking.created">booking.created</SelectItem>
              <SelectItem value="booking.confirmed">booking.confirmed</SelectItem>
              <SelectItem value="booking.cancelled">booking.cancelled</SelectItem>
              <SelectItem value="booking.rescheduled">booking.rescheduled</SelectItem>
              <SelectItem value="booking.completed">booking.completed</SelectItem>
              <SelectItem value="provider.assigned">provider.assigned</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processed">Processed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search booking ID..."
              value={searchBookingId}
              onChange={(e) => setSearchBookingId(e.target.value)}
              className="pl-8 w-[200px]"
            />
          </div>
        </div>

        {/* Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Event Type</TableHead>
                <TableHead>Booking ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Retries</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Error</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No webhook events found
                  </TableCell>
                </TableRow>
              ) : (
                events.map((event) => (
                  <React.Fragment key={event.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => setExpandedId(expandedId === event.id ? null : event.id)}
                    >
                      <TableCell>
                        {expandedId === event.id ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{event.event_type}</TableCell>
                      <TableCell className="font-mono text-xs">{event.booking_id || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={STATUS_COLORS[event.processed_status] || ''}>
                          {event.processed_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-center">
                        {event.retry_count > 0 ? event.retry_count : '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {format(new Date(event.received_at), 'MMM d, HH:mm:ss')}
                      </TableCell>
                      <TableCell className="text-xs text-red-600 max-w-[200px] truncate">
                        {event.error_message || '—'}
                      </TableCell>
                      <TableCell>
                        {event.processed_status === 'failed' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={retryingId === event.event_id}
                            onClick={(e) => {
                              e.stopPropagation();
                              retryEvent(event.event_id);
                            }}
                          >
                            {retryingId === event.event_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                    {expandedId === event.id && (
                      <TableRow>
                        <TableCell colSpan={8}>
                          <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-64">
                            {JSON.stringify(event.payload_json, null, 2)}
                          </pre>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default WebhookEventMonitor;
