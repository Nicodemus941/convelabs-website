import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface InvitationData {
  employee_email: string;
  executive_upgrade: boolean;
  expires_at: string;
}

const CorporateInviteAccept: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  useEffect(() => {
    if (!token) {
      toast.error("Invalid invitation link");
      navigate("/");
      return;
    }
    loadInvitation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const loadInvitation = async () => {
    if (!token) return;
    
    setLoading(true);
    const { data, error } = await supabase
      .from("corporate_employees")
      .select("email, executive_upgrade, invitation_expires_at, status")
      .eq("invitation_token", token)
      .eq("status", "invited")
      .maybeSingle();

    setLoading(false);

    if (error || !data) {
      toast.error("Invalid or expired invitation");
      navigate("/");
      return;
    }

    if (new Date(data.invitation_expires_at) < new Date()) {
      toast.error("This invitation has expired");
      navigate("/");
      return;
    }

    setInvitation({
      employee_email: data.email,
      executive_upgrade: data.executive_upgrade,
      expires_at: data.invitation_expires_at,
    });

    setEmail(data.email);
  };

  const acceptInvitation = async () => {
    if (!token || !invitation) return;

    if (!user) {
      // User needs to register
      if (password !== confirmPassword) {
        toast.error("Passwords don't match");
        return;
      }
      if (password.length < 6) {
        toast.error("Password must be at least 6 characters");
        return;
      }
      if (!firstName || !lastName) {
        toast.error("First and last name are required");
        return;
      }

      setAccepting(true);
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            firstName,
            lastName,
          },
        },
      });

      if (authError) {
        setAccepting(false);
        toast.error(authError.message);
        return;
      }

      if (!authData.user) {
        setAccepting(false);
        toast.error("Failed to create account");
        return;
      }

      // Continue with accepting invitation after user is created
      await finalizeAcceptance(authData.user.id);
    } else {
      // User is already logged in
      if (user.email !== invitation.employee_email) {
        toast.error("You must be logged in with the invited email address");
        return;
      }
      await finalizeAcceptance(user.id);
    }
  };

  const finalizeAcceptance = async (userId: string) => {
    setAccepting(true);
    
    const { error } = await supabase
      .from("corporate_employees")
      .update({
        user_id: userId,
        status: "active",
        invitation_token: null,
        invitation_expires_at: null,
      })
      .eq("invitation_token", token);

    setAccepting(false);

    if (error) {
      console.error(error);
      toast.error("Failed to accept invitation");
      return;
    }

    toast.success("Welcome to ConveLabs!");
    navigate("/dashboard");
  };

  if (loading) {
    return (
      <div className="container mx-auto max-w-md p-4 mt-8">
        <Card>
          <CardContent className="p-6">
            <div className="text-center">Loading invitation...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!invitation) {
    return null;
  }

  return (
    <div className="container mx-auto max-w-md p-4 mt-8">
      <Helmet>
        <title>Accept ConveLabs Invitation | ConveLabs</title>
        <meta name="description" content="Accept your ConveLabs team invitation" />
      </Helmet>

      <Card>
        <CardHeader>
          <CardTitle>ConveLabs Corporate Invitation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center space-y-2">
            <h2 className="text-lg font-semibold">ConveLabs</h2>
            <p className="text-sm text-muted-foreground">
              You've been invited to join as a{" "}
              <strong>{invitation.executive_upgrade ? "Executive" : "Standard"}</strong> member
            </p>
            <p className="text-xs text-muted-foreground">
              Expires: {new Date(invitation.expires_at).toLocaleDateString()}
            </p>
          </div>

          {!user ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                Logged in as: <strong>{user.email}</strong>
              </p>
            </div>
          )}

          <Button onClick={acceptInvitation} disabled={accepting} className="w-full">
            {accepting ? "Accepting..." : user ? "Accept Invitation" : "Create Account & Accept"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default CorporateInviteAccept;