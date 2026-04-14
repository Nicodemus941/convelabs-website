import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckCircle2, Circle, Upload, Loader2, Shield, FileText, Video, PenLine, UserCheck, CheckSquare } from 'lucide-react';
import { toast } from 'sonner';

// Ordered onboarding steps, keyed to staff_onboarding column names.
// Each step has its own completion mechanic — we store the timestamp
// column directly on staff_onboarding when the user finishes.
type StepKey =
  | 'account_setup_completed_at'
  | 'role_assignment_completed_at'
  | 'sop_training_completed_at'
  | 'digital_signature_completed_at'
  | 'background_check_completed_at'
  | 'final_approval_completed_at';

interface Step {
  key: StepKey;
  title: string;
  desc: string;
  icon: React.ReactNode;
  userActionable: boolean; // false = admin-controlled (final approval, BG check)
  uploadKind?: 'license' | 'id' | 'tb_card' | 'w9';
}

const STEPS: Step[] = [
  { key: 'account_setup_completed_at', title: 'Account set up', desc: 'Password created & terms accepted.', icon: <CheckSquare className="h-5 w-5" />, userActionable: false },
  { key: 'role_assignment_completed_at', title: 'Upload license & ID', desc: 'Phlebotomy license (or relevant cert) + government ID. We verify credentials.', icon: <FileText className="h-5 w-5" />, userActionable: true, uploadKind: 'license' },
  { key: 'sop_training_completed_at', title: 'Watch SOP training', desc: '4 short videos (HIPAA, specimen handling, patient flow, safety). ~25 min.', icon: <Video className="h-5 w-5" />, userActionable: true },
  { key: 'digital_signature_completed_at', title: 'Sign W-9 & HIPAA attestation', desc: 'Digital signature for tax + compliance paperwork.', icon: <PenLine className="h-5 w-5" />, userActionable: true, uploadKind: 'w9' },
  { key: 'background_check_completed_at', title: 'Background check', desc: 'Runs automatically once license is uploaded. Usually clears in 24–48 hrs.', icon: <Shield className="h-5 w-5" />, userActionable: false },
  { key: 'final_approval_completed_at', title: 'Final approval', desc: 'Manager review — you\'re cleared for your first visit and your $200 welcome bonus.', icon: <UserCheck className="h-5 w-5" />, userActionable: false },
];

const StaffOnboarding: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState<any | null>(null);
  const [staffProfileId, setStaffProfileId] = useState<string | null>(null);
  const [savingStep, setSavingStep] = useState<StepKey | null>(null);
  const [videoProgress, setVideoProgress] = useState(0);
  const [signatureName, setSignatureName] = useState('');
  const [agreeHipaa, setAgreeHipaa] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data: profile } = await supabase
        .from('staff_profiles')
        .select('id, compliance_status')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!profile) {
        toast.error('No staff profile found. Did you accept your invite?');
        setLoading(false);
        return;
      }
      setStaffProfileId(profile.id);
      const { data: ob } = await supabase
        .from('staff_onboarding')
        .select('*')
        .eq('staff_id', profile.id)
        .maybeSingle();
      setOnboarding(ob);
      setLoading(false);
    })();
  }, [user?.id]);

  const completed = useMemo(
    () => STEPS.filter(s => onboarding?.[s.key]).length,
    [onboarding]
  );
  const percent = Math.round((completed / STEPS.length) * 100);

  const markStepComplete = async (key: StepKey) => {
    if (!onboarding?.id) return;
    setSavingStep(key);
    const { data, error } = await supabase
      .from('staff_onboarding')
      .update({ [key]: new Date().toISOString() })
      .eq('id', onboarding.id)
      .select('*')
      .single();
    if (error) {
      toast.error(error.message);
    } else {
      setOnboarding(data);
      toast.success('Step complete');
    }
    setSavingStep(null);
  };

  const uploadDoc = async (file: File, kind: NonNullable<Step['uploadKind']>, stepKey: StepKey) => {
    if (!user?.id || !staffProfileId) return;
    setSavingStep(stepKey);
    try {
      const ext = file.name.split('.').pop() || 'pdf';
      const path = `${user.id}/${kind}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('staff-onboarding').upload(path, file);
      if (upErr) throw upErr;

      // Only create a staff_certifications row for credential-type uploads
      if (kind === 'license' || kind === 'id' || kind === 'tb_card') {
        await supabase.from('staff_certifications').insert({
          staff_profile_id: staffProfileId,
          certification_name: kind === 'license' ? 'Phlebotomy License' : kind === 'id' ? 'Government ID' : 'TB Card',
          issuing_organization: 'Self-reported (pending verification)',
          issue_date: new Date().toISOString().slice(0, 10),
          document_path: path,
          status: 'pending',
        });
      }
      await markStepComplete(stepKey);
    } catch (e: any) {
      toast.error(e.message || 'Upload failed');
      setSavingStep(null);
    }
  };

  const submitSignature = async () => {
    if (!signatureName.trim() || !agreeHipaa) {
      toast.error('Type your name and check the HIPAA attestation');
      return;
    }
    // Persist signature as an audit trail
    await supabase.from('staff_audit_logs').insert({
      change_type: 'digital_signature',
      new_values: { name: signatureName, hipaa_agreed: true, signed_at: new Date().toISOString() },
      staff_id: staffProfileId,
      changed_by: user?.id,
    });
    await markStepComplete('digital_signature_completed_at');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
      </div>
    );
  }

  if (!onboarding) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center">
            <p className="mb-4">We couldn't find your onboarding record.</p>
            <Button onClick={() => navigate('/dashboard')}>Go to dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-red-50 p-4">
      <div className="max-w-2xl mx-auto py-8 space-y-4">
        <Card className="border-2 border-[#B91C1C] shadow-lg">
          <CardHeader className="bg-[#B91C1C] text-white rounded-t-lg">
            <CardTitle>Welcome aboard — let's get you cleared to work</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Progress</span>
              <span className="text-sm font-semibold">{completed} / {STEPS.length} steps</span>
            </div>
            <Progress value={percent} className="h-3" />
            {percent === 100 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
                🎉 You're fully cleared. Your $200 welcome bonus will hit your next paycheck.
              </div>
            )}
          </CardContent>
        </Card>

        {STEPS.map((step, i) => {
          const done = !!onboarding[step.key];
          const prevDone = i === 0 || !!onboarding[STEPS[i - 1].key];
          const active = !done && prevDone;
          return (
            <Card key={step.key} className={done ? 'opacity-70' : active ? 'border-[#B91C1C]' : ''}>
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {done ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : <Circle className="h-6 w-6 text-muted-foreground" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {step.icon}
                      <h3 className="font-semibold">{step.title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">{step.desc}</p>

                    {!done && active && step.userActionable && (
                      <>
                        {step.uploadKind === 'license' && (
                          <UploadRow
                            label="Upload phlebotomy license (PDF or image)"
                            saving={savingStep === step.key}
                            onFile={f => uploadDoc(f, 'license', step.key)}
                          />
                        )}
                        {step.key === 'sop_training_completed_at' && (
                          <div className="space-y-2">
                            <p className="text-xs text-muted-foreground">
                              (Training videos coming soon — click below to self-certify you've reviewed
                              the onboarding packet.)
                            </p>
                            <Progress value={videoProgress} className="h-2" />
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => setVideoProgress(Math.min(100, videoProgress + 25))}>
                                Mark next video watched
                              </Button>
                              <Button
                                size="sm"
                                className="bg-[#B91C1C] hover:bg-[#991B1B] text-white"
                                disabled={videoProgress < 80 || savingStep === step.key}
                                onClick={() => markStepComplete(step.key)}
                              >
                                {savingStep === step.key ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Mark complete'}
                              </Button>
                            </div>
                          </div>
                        )}
                        {step.key === 'digital_signature_completed_at' && (
                          <div className="space-y-2">
                            <Input
                              placeholder="Type your full legal name to sign"
                              value={signatureName}
                              onChange={e => setSignatureName(e.target.value)}
                            />
                            <label className="flex items-start gap-2 text-xs text-muted-foreground">
                              <Checkbox checked={agreeHipaa} onCheckedChange={c => setAgreeHipaa(!!c)} />
                              <span>
                                I acknowledge HIPAA training and agree to the W-9 / independent-contractor terms.
                              </span>
                            </label>
                            <Button
                              size="sm"
                              className="bg-[#B91C1C] hover:bg-[#991B1B] text-white"
                              onClick={submitSignature}
                              disabled={savingStep === step.key}
                            >
                              {savingStep === step.key ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign & continue'}
                            </Button>
                          </div>
                        )}
                      </>
                    )}

                    {!done && !step.userActionable && (
                      <p className="text-xs text-muted-foreground italic">
                        Handled by your manager — no action needed from you.
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

const UploadRow: React.FC<{ label: string; saving: boolean; onFile: (f: File) => void }> = ({ label, saving, onFile }) => (
  <label className="flex items-center gap-2 cursor-pointer">
    <div className="flex items-center gap-2 px-3 py-2 border-2 border-dashed border-[#B91C1C] rounded-lg text-sm text-[#B91C1C] hover:bg-red-50">
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
      <span>{label}</span>
    </div>
    <input
      type="file"
      accept="application/pdf,image/*"
      className="hidden"
      disabled={saving}
      onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }}
    />
  </label>
);

export default StaffOnboarding;
