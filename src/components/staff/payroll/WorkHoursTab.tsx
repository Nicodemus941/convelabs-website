
import React, { useState, useEffect, useCallback } from 'react';
import { 
  Button,
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  Label,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/index';
import { Skeleton } from '@/components/ui/skeleton';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { Clock, ClockIcon, Loader2, Plus, UserCircle } from 'lucide-react';
import { usePayroll, WorkHours } from '@/hooks/usePayroll';
import { StaffProfile } from '@/hooks/useStaffProfiles';
import { toast } from 'sonner';

interface WorkHoursTabProps {
  staffProfile: StaffProfile | null;
  isAdmin: boolean;
}

const WorkHoursTab: React.FC<WorkHoursTabProps> = ({ staffProfile, isAdmin }) => {
  const { 
    workHours, 
    fetchWorkHours, 
    clockIn, 
    clockOut, 
    getActiveClockIn,
    isLoading 
  } = usePayroll();
  
  const [activeClockIn, setActiveClockIn] = useState<WorkHours | null>(null);
  const [clockInNotes, setClockInNotes] = useState('');
  const [clockOutNotes, setClockOutNotes] = useState('');
  const [isClockingIn, setIsClockingIn] = useState(false);
  const [isClockingOut, setIsClockingOut] = useState(false);

  const loadWorkHours = useCallback(async () => {
    if (staffProfile) {
      await fetchWorkHours(staffProfile.id);
    }
  }, [staffProfile, fetchWorkHours]);

  const loadActiveClockIn = useCallback(async () => {
    if (staffProfile) {
      const active = await getActiveClockIn(staffProfile.id);
      setActiveClockIn(active);
    }
  }, [staffProfile, getActiveClockIn]);

  useEffect(() => {
    loadWorkHours();
    loadActiveClockIn();
  }, [loadWorkHours, loadActiveClockIn]);

  const handleClockIn = async () => {
    if (!staffProfile) return;
    
    setIsClockingIn(true);
    try {
      await clockIn(staffProfile.id, clockInNotes);
      await loadWorkHours();
      await loadActiveClockIn();
      setClockInNotes('');
    } catch (error) {
      console.error("Error during clock-in:", error);
      toast.error("Failed to clock in");
    } finally {
      setIsClockingIn(false);
    }
  };

  const handleClockOut = async () => {
    if (!activeClockIn) return;
    
    setIsClockingOut(true);
    try {
      await clockOut(activeClockIn.id, clockOutNotes);
      await loadWorkHours();
      await loadActiveClockIn();
      setClockOutNotes('');
    } catch (error) {
      console.error("Error during clock-out:", error);
      toast.error("Failed to clock out");
    } finally {
      setIsClockingOut(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = parseISO(dateString);
    if (isToday(date)) {
      return `Today, ${format(date, 'h:mm a')}`;
    } else if (isYesterday(date)) {
      return `Yesterday, ${format(date, 'h:mm a')}`;
    } else {
      return format(date, 'MMM d, yyyy h:mm a');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {staffProfile ? (
        activeClockIn ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold flex items-center">
                <ClockIcon className="mr-2 h-5 w-5" />
                Clocked In
              </CardTitle>
              <CardDescription>
                You are currently clocked in. Record your clock-out time below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="clock-out-notes">Clock-out Notes</Label>
                <Input
                  id="clock-out-notes"
                  placeholder="Add any notes about your shift"
                  value={clockOutNotes}
                  onChange={(e) => setClockOutNotes(e.target.value)}
                />
              </div>
              <Button 
                className="w-full" 
                onClick={handleClockOut} 
                disabled={isClockingOut}
              >
                {isClockingOut && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Clock Out
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold flex items-center">
                <Clock className="mr-2 h-5 w-5" />
                Clock In
              </CardTitle>
              <CardDescription>
                Start tracking your work hours by clocking in.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="clock-in-notes">Clock-in Notes</Label>
                <Input
                  id="clock-in-notes"
                  placeholder="Add any notes about your shift"
                  value={clockInNotes}
                  onChange={(e) => setClockInNotes(e.target.value)}
                />
              </div>
              <Button 
                className="w-full" 
                onClick={handleClockIn} 
                disabled={isClockingIn}
              >
                {isClockingIn && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Clock In
              </Button>
            </CardContent>
          </Card>
        )
      ) : (
        <div className="text-center py-6">
          <UserCircle className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-lg font-medium">No Staff Profile</h3>
          <p className="text-muted-foreground">
            Please ensure your staff profile is properly set up.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Work Hours History</CardTitle>
          <CardDescription>
            View your past clock-in and clock-out times.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {workHours.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-muted-foreground">No work hours recorded yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Clock In</TableHead>
                    <TableHead>Clock Out</TableHead>
                    <TableHead>Hours Worked</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workHours.map((hour) => (
                    <TableRow key={hour.id}>
                      <TableCell>{formatDate(hour.clock_in)}</TableCell>
                      <TableCell>
                        {hour.clock_out ? formatDate(hour.clock_out) : 'Still Clocked In'}
                      </TableCell>
                      <TableCell>{hour.hours_worked ? hour.hours_worked.toFixed(2) : 'N/A'}</TableCell>
                      <TableCell>{hour.notes || 'No notes'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WorkHoursTab;
