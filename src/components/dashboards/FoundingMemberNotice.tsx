import React from "react";
import FoundingMemberBadgeLive from "@/components/membership/FoundingMemberBadge";

/**
 * FoundingMemberNotice — renders the data-driven Founding Member badge
 * for patients on the dashboard. Automatically hides (renders null)
 * when the current user isn't a founding member, so callers can
 * unconditionally mount this.
 *
 * Previously: hardcoded "Next billing September 1st, 2025" — stale
 * after the 2025 launch window. Now reads founding_member_number +
 * founding_locked_rate_cents from user_memberships.
 */
const FoundingMemberNotice: React.FC<{ className?: string }> = ({ className }) => {
  return <FoundingMemberBadgeLive className={className ?? "mb-6"} />;
};

export default FoundingMemberNotice;
