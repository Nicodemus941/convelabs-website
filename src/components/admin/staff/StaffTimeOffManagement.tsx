import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar, Plus, Check, X, Clock } from 'lucide-react';
import { useStaffTimeOff } from '@/hooks/admin/useStaffTimeOff';
import { StaffTimeOffRequest } from '@/types/adminTypes';
import TimeOffRequestForm from './TimeOffRequestForm';
import DateBlockForm from './DateBlockForm';

const StaffTimeOffManagement = () => {
  const {
    timeOffRequests,
    dateBlocks,
    isLoading,
    updateTimeOffRequest,
    createDateBlock,
    removeDateBlock
  } = useStaffTimeOff();

  const [statusFilter, setStatusFilter] = useState('all');
  const [isTimeOffDialogOpen, setIsTimeOffDialogOpen] = useState(false);
  const [isDateBlockDialogOpen, setIsDateBlockDialogOpen] = useState(false);

  const filteredRequests = timeOffRequests.filter(request => 
    statusFilter === 'all' || request.status === statusFilter
  );

  const handleApproveRequest = async (id: string) => {
    await updateTimeOffRequest(id, { status: 'approved' });
  };

  const handleDenyRequest = async (id: string, adminNotes?: string) => {
    await updateTimeOffRequest(id, { status: 'denied', admin_notes: adminNotes });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800';
      case 'denied': return 'bg-red-100 text-red-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRequestTypeColor = (type: string) => {
    switch (type) {
      case 'vacation': return 'bg-blue-100 text-blue-800';
      case 'sick': return 'bg-red-100 text-red-800';
      case 'personal': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Time Off Requests */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-2xl font-bold">Time Off Requests</CardTitle>
            <div className="flex space-x-2">
              <Dialog open={isTimeOffDialogOpen} onOpenChange={setIsTimeOffDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Plus className="w-4 h-4 mr-2" />
                    New Request
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Time Off Request</DialogTitle>
                  </DialogHeader>
                  <TimeOffRequestForm onClose={() => setIsTimeOffDialogOpen(false)} />
                </DialogContent>
              </Dialog>
              
              <Dialog open={isDateBlockDialogOpen} onOpenChange={setIsDateBlockDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Calendar className="w-4 h-4 mr-2" />
                    Block Date
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Block Staff Date</DialogTitle>
                  </DialogHeader>
                  <DateBlockForm onClose={() => setIsDateBlockDialogOpen(false)} />
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4 mb-6">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Requests</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="denied">Denied</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff Member</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      Loading requests...
                    </TableCell>
                  </TableRow>
                ) : filteredRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      No time off requests found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>
                        <div className="font-medium">Staff Member {request.staff_id}</div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getRequestTypeColor(request.request_type)}>
                          {request.request_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{new Date(request.start_date).toLocaleDateString()}</div>
                          <div className="text-gray-500">to {new Date(request.end_date).toLocaleDateString()}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-xs truncate">{request.reason || 'No reason provided'}</div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(request.status)}>
                          {request.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(request.requested_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {request.status === 'pending' && (
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleApproveRequest(request.id)}
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDenyRequest(request.id)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                        {request.status !== 'pending' && (
                          <Badge variant="outline">
                            <Clock className="w-3 h-3 mr-1" />
                            Processed
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Date Blocks */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold">Admin Date Blocks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff Member</TableHead>
                  <TableHead>Blocked Date</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Blocked By</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dateBlocks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      No date blocks found
                    </TableCell>
                  </TableRow>
                ) : (
                  dateBlocks.map((block) => (
                    <TableRow key={block.id}>
                      <TableCell>Staff Member {block.staff_id}</TableCell>
                      <TableCell>{new Date(block.blocked_date).toLocaleDateString()}</TableCell>
                      <TableCell>{block.reason}</TableCell>
                      <TableCell>Admin {block.blocked_by}</TableCell>
                      <TableCell>{new Date(block.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeDateBlock(block.id)}
                        >
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StaffTimeOffManagement;