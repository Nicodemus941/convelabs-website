import React, { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import CsvEmployeeUploader from "@/components/corporate/CsvEmployeeUploader";

interface CorporateEmployee {
  id: string;
  email: string;
  status: string;
  executive_upgrade: boolean;
  user_id: string | null;
  employee_id: string | null;
}

const CorporateBilling: React.FC = () => {
  const [employees, setEmployees] = useState<CorporateEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [invEmail, setInvEmail] = useState("");
  const [invExec, setInvExec] = useState(false);

  const totals = useMemo(() => {
    const total = employees.length;
    const exec = employees.filter((e) => e.executive_upgrade).length;
    return { total, exec };
  }, [employees]);

  const loadEmployees = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("corporate_employees")
      .select("id, email, status, executive_upgrade, user_id, employee_id")
      .order("created_at", { ascending: true });
    if (error) {
      console.error(error);
      toast.error("Failed to load employees");
    } else {
      setEmployees(data as CorporateEmployee[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  const inviteEmployee = async () => {
    if (!invEmail) return;
    setLoading(true);
    
    // Use the refactored edge function
    const { data, error } = await supabase.functions.invoke("corporate-invite-employee", {
      body: {
        email: invEmail,
        executiveUpgrade: invExec,
      },
    });
    
    setLoading(false);
    
    if (error) {
      console.error(error);
      toast.error(error.message || "Failed to send invitation");
      return;
    }
    
    setInvEmail("");
    setInvExec(false);
    toast.success("Invitation sent successfully");
    loadEmployees();
  };

  const updateExec = async (employee: CorporateEmployee, value: boolean) => {
    setLoading(true);
    const { error } = await supabase
      .from("corporate_employees")
      .update({ executive_upgrade: value })
      .eq("id", employee.id);
    setLoading(false);
    if (error) {
      console.error(error);
      toast.error("Failed to update");
      return;
    }
    toast.success("Updated");
    setEmployees((prev) => prev.map((e) => (e.id === employee.id ? { ...e, executive_upgrade: value } : e)));
  };

  const removeEmployee = async (employee: CorporateEmployee) => {
    setLoading(true);
    const { error } = await supabase.from("corporate_employees").delete().eq("id", employee.id);
    setLoading(false);
    if (error) {
      console.error(error);
      toast.error("Failed to remove");
      return;
    }
    toast.success("Removed");
    setEmployees((prev) => prev.filter((e) => e.id !== employee.id));
  };

  const openBillingPortal = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("corporate-customer-portal", {});
    setLoading(false);
    if (error || !data?.url) {
      console.error(error);
      toast.error(error?.message || "Failed to open billing portal");
      return;
    }
    window.open(data.url, "_blank");
  };

  const syncSeatsToStripe = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("corporate-seat-update", {
      body: { totalSeats: totals.total, executiveSeats: totals.exec },
    });
    setLoading(false);
    if (error) {
      console.error(error);
      toast.error(error.message || "Failed to sync seats");
      return;
    }
    toast.success("Seats synced with Stripe");
  };

  return (
    <div className="container mx-auto max-w-5xl p-4">
      <Helmet>
        <title>Corporate Billing & Seats | ConveLabs</title>
        <meta name="description" content="Manage ConveLabs corporate seats, invitations, and billing." />
        <link rel="canonical" href="https://convelabs.com/corporate-billing" />
      </Helmet>

      <h1 className="text-2xl font-semibold mb-4">ConveLabs Corporate Billing & Seats</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Seat Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between py-2">
              <div>Total seats</div>
              <div className="font-medium">{totals.total}</div>
            </div>
            <div className="flex items-center justify-between py-2">
              <div>Executive upgrades</div>
              <div className="font-medium">{totals.exec}</div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button onClick={syncSeatsToStripe} disabled={loading} className="w-full">
                Sync seats to Stripe
              </Button>
              <Button onClick={openBillingPortal} variant="outline" disabled={loading} className="w-full">
                Open billing portal
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invite Employee</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Input
                type="email"
                placeholder="employee@convelabs.com"
                value={invEmail}
                onChange={(e) => setInvEmail(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <Checkbox id="exec" checked={invExec} onCheckedChange={(v) => setInvExec(!!v)} />
                <label htmlFor="exec">Executive upgrade</label>
              </div>
              <Button onClick={inviteEmployee} disabled={loading || !invEmail} className="w-full">
                Send invite
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <CsvEmployeeUploader onUploadComplete={loadEmployees} />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Employees</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="py-2">Email</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Executive</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id} className="border-t">
                    <td className="py-2">{e.email}</td>
                    <td className="py-2 capitalize">{e.status}</td>
                    <td className="py-2">
                      <Checkbox
                        checked={!!e.executive_upgrade}
                        onCheckedChange={(v) => updateExec(e, !!v)}
                      />
                    </td>
                    <td className="py-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => removeEmployee(e)} disabled={loading}>
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
                {!employees.length && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted-foreground">
                      No employees yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CorporateBilling;