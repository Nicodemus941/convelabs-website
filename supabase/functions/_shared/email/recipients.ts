
import { EmailRecipient } from './types.ts';

/**
 * Process manually entered email addresses for a marketing campaign
 */
export async function processManualEmails(
  emails: string[]
): Promise<EmailRecipient[]> {
  console.log(`Processing ${emails.length} manual email addresses`);
  
  return emails.map(email => ({
    email: email.trim(),
    firstName: '',
    lastName: '',
    fullName: ''
  }));
}

/**
 * Fetch member recipients based on filters
 */
export async function fetchMemberRecipients(
  supabase: any, 
  filter: {
    includeRoles?: string[];
    excludeIds?: string[];
    specificIds?: string[];
    includeFoundingMembers?: boolean;
    includeSupernovaMembers?: boolean;
    onlyActiveMembers?: boolean;
  }
): Promise<EmailRecipient[]> {
  if (!filter) {
    return [];
  }

  // Build recipient query
  let recipientQuery = supabase.from('auth.users')
    .select(`
      id, 
      email,
      raw_user_meta_data,
      user_profiles(*)
    `);

  // Filter for founding members or supernova members
  if (filter.includeFoundingMembers || filter.includeSupernovaMembers) {
    const membershipQuery = supabase
      .from('user_memberships')
      .select('user_id');
    
    if (filter.includeFoundingMembers) {
      membershipQuery.eq('founding_member', true);
    }
    
    if (filter.includeSupernovaMembers) {
      membershipQuery.eq('is_supernova_member', true);
    }
    
    const { data: filteredMemberIds, error: memberError } = await membershipQuery;
    
    if (memberError) {
      console.error("Error filtering members:", memberError);
      throw new Error("Failed to filter members");
    }
    
    if (filteredMemberIds && filteredMemberIds.length > 0) {
      const userIds = filteredMemberIds.map(record => record.user_id);
      recipientQuery.in('id', userIds);
    } else {
      // No matching members
      return [];
    }
  }
  
  // Filter for specific user IDs
  if (filter.specificIds && filter.specificIds.length > 0) {
    recipientQuery.in('id', filter.specificIds);
  }
  
  // Exclude specific user IDs
  if (filter.excludeIds && filter.excludeIds.length > 0) {
    recipientQuery.not('id', 'in', `(${filter.excludeIds.join(',')})`);
  }
  
  // Filter for active members only
  if (filter.onlyActiveMembers) {
    const { data: activeMembers, error: activeMembersError } = await supabase
      .from('user_memberships')
      .select('user_id')
      .eq('status', 'active');
    
    if (activeMembersError) {
      console.error("Error filtering active members:", activeMembersError);
      throw new Error("Failed to filter active members");
    }
    
    if (activeMembers && activeMembers.length > 0) {
      const activeUserIds = activeMembers.map(record => record.user_id);
      recipientQuery.in('id', activeUserIds);
    }
  }
  
  // Execute the query to get member recipients
  const { data: memberRecipients, error: recipientsError } = await recipientQuery;
  
  if (recipientsError) {
    console.error("Error fetching recipients:", recipientsError);
    throw new Error("Failed to fetch recipients");
  }
  
  if (!memberRecipients || memberRecipients.length === 0) {
    return [];
  }

  // Transform member data to the EmailRecipient format
  return memberRecipients.map(user => ({
    id: user.id,
    email: user.email,
    firstName: user.raw_user_meta_data?.firstName || user.user_profiles?.full_name?.split(' ')[0] || '',
    lastName: user.raw_user_meta_data?.lastName || '',
    fullName: user.raw_user_meta_data?.firstName 
      ? `${user.raw_user_meta_data?.firstName} ${user.raw_user_meta_data?.lastName || ''}`
      : user.user_profiles?.full_name || ''
  }));
}
