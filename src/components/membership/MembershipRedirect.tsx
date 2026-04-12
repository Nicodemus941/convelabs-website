
import React, { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createAuthPayload, refreshSessionBeforeRedirect } from '@/utils/auth-tokens';
import { useNavigate, useParams } from 'react-router-dom';
import { ENROLLMENT_URL } from '@/lib/constants/urls';

const MembershipRedirect: React.FC = () => {
  const { user, session, refreshSession } = useAuth();
  const navigate = useNavigate();
  const params = useParams();
  const membershipType = params.membershipType || '';

  useEffect(() => {
    const redirectToAppointmentsSite = async () => {
      try {
        console.log("Redirecting to appointments site for membership...");
        
        // Base URL for the ConveLabs membership enrollment page
        let appointmentsUrl = ENROLLMENT_URL;
        
        // Add source parameter for analytics
        const source = membershipType ? `membership_${membershipType}` : 'membership_redirect';
        appointmentsUrl += `?source=${source}`;
        
        // If user is logged in, we need to pass authentication tokens
        if (session?.access_token && session?.refresh_token) {
          // First try to refresh the session to get fresh tokens
          const refreshedSession = await refreshSessionBeforeRedirect();
          
          // Create an auth payload with both tokens and user info
          const encodedPayload = refreshedSession 
            ? createAuthPayload(refreshedSession)
            : createAuthPayload(session);
          
          if (encodedPayload) {
            // Add authentication payload to URL
            appointmentsUrl += `?auth=${encodeURIComponent(encodedPayload)}&noredirect=true`;
            window.location.href = appointmentsUrl;
            return;
          }
        }
        
        // Fallback if user is not logged in or we couldn't get a valid token
        window.location.href = appointmentsUrl;
      } catch (err) {
        console.error("Error during membership redirect:", err);
        // Fallback to direct URL if anything fails
        window.location.href = ENROLLMENT_URL;
      }
    };

    redirectToAppointmentsSite();
  }, [membershipType, session]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Redirecting to Membership Portal</h2>
        <p className="text-muted-foreground">Please wait while we redirect you to our membership portal...</p>
        <div className="mt-4">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
        </div>
      </div>
    </div>
  );
};

export default MembershipRedirect;
