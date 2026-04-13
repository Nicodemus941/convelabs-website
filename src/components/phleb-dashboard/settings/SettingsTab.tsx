import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  User, Phone, Mail, Bell, LogOut, Save, Loader2, CheckCircle2, Shield,
} from 'lucide-react';
import { toast } from '@/components/ui/sonner';

const SettingsTab: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [smsNotifications, setSmsNotifications] = useState(true);

  // Load staff profile phone
  useEffect(() => {
    const load = async () => {
      if (!user) return;
      // Try staff_profiles first
      const { data: staffData } = await supabase
        .from('staff_profiles')
        .select('phone')
        .eq('user_id', user.id)
        .maybeSingle();

      if (staffData?.phone) {
        setPhone(staffData.phone);
      }
      setIsLoaded(true);
    };
    load();
  }, [user]);

  const handleSavePhone = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      // Update staff_profiles
      const { error: staffError } = await supabase
        .from('staff_profiles')
        .update({ phone } as any)
        .eq('user_id', user.id);

      if (staffError) {
        console.error('Staff profile update error:', staffError);
        // Try upsert approach
        const { error: upsertError } = await supabase
          .from('staff_profiles')
          .upsert({ user_id: user.id, phone, pay_rate: 0 } as any, { onConflict: 'user_id' });

        if (upsertError) throw upsertError;
      }

      toast.success('Phone number saved successfully');
    } catch (err: any) {
      console.error('Save error:', err);
      toast.error('Failed to save phone number: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
      // Force redirect even if logout fails
      window.location.href = '/login';
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <User className="h-5 w-5 text-[#B91C1C]" />
        Settings
      </h2>

      {/* Profile Info */}
      <Card className="shadow-sm">
        <CardContent className="p-4 space-y-3">
          <h3 className="font-semibold text-sm text-gray-800">Profile</h3>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#B91C1C]/10 flex items-center justify-center">
              <User className="h-6 w-6 text-[#B91C1C]" />
            </div>
            <div>
              <p className="font-semibold">{user?.firstName} {user?.lastName}</p>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Mail className="h-3 w-3" /> {user?.email}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Phone Number */}
      <Card className="shadow-sm">
        <CardContent className="p-4 space-y-3">
          <h3 className="font-semibold text-sm text-gray-800 flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Phone Number
          </h3>
          <p className="text-xs text-muted-foreground">
            Used to receive SMS notifications when you're assigned new appointments.
          </p>
          <div className="flex gap-2">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 000-0000"
              className="flex-1"
              type="tel"
            />
            <Button
              className="bg-[#B91C1C] hover:bg-[#991B1B] text-white"
              onClick={handleSavePhone}
              disabled={isSaving}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </Button>
          </div>
          {phone && isLoaded && (
            <p className="text-xs text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Phone number on file
            </p>
          )}
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card className="shadow-sm">
        <CardContent className="p-4 space-y-3">
          <h3 className="font-semibold text-sm text-gray-800 flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">SMS Notifications</p>
              <p className="text-xs text-muted-foreground">Receive texts for new assignments</p>
            </div>
            <button
              onClick={() => setSmsNotifications(!smsNotifications)}
              className={`w-11 h-6 rounded-full transition-colors ${smsNotifications ? 'bg-[#B91C1C]' : 'bg-gray-300'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${smsNotifications ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* App Info */}
      <Card className="shadow-sm">
        <CardContent className="p-4 space-y-2">
          <h3 className="font-semibold text-sm text-gray-800 flex items-center gap-2">
            <Shield className="h-4 w-4" />
            About
          </h3>
          <p className="text-xs text-muted-foreground">ConveLabs Phlebotomist App v1.0</p>
          <p className="text-xs text-muted-foreground">HIPAA Compliant - All data encrypted</p>
        </CardContent>
      </Card>

      {/* Logout */}
      <Button
        variant="outline"
        className="w-full border-red-200 text-[#B91C1C] hover:bg-red-50 gap-2"
        onClick={handleLogout}
      >
        <LogOut className="h-4 w-4" />
        Sign Out
      </Button>
    </div>
  );
};

export default SettingsTab;
