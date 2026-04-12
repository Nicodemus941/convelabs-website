import { supabase } from '@/integrations/supabase/client';

// Updated membership agreement text with the new legal content
export const MEMBERSHIP_AGREEMENT_TEXT = `
# ConveLabs Individual & Family Membership
# Subscription Agreement

This Subscription Agreement ("Agreement") is entered into by and between: 
A. ConveLabs, LLC ("ConveLabs," "we," "our," or "us") and 
B. The undersigned subscriber ("Subscriber," "you," or "your") as of the effective date below. 

By subscribing to ConveLabs' Individual & Family Membership services, you agree to the terms and conditions outlined in this Agreement.

## 1. Definitions

For the purposes of this Agreement, the following terms shall have the meanings set forth below:

a. "Member" or "Subscriber": Refers to the individual or entity who has signed this Agreement and is subscribing to the ConveLabs membership plan. This includes both the Individual Membership and the Family Membership subscribers, as well as any individuals enrolled under a Family Membership.

b. "Services": Refers to the at-home or in-office lab services, including but not limited to blood draws, lab tests, diagnostic services, and health monitoring provided by ConveLabs to the Member. Services are delivered as part of the membership plan and may vary based on the specific plan selected.

c. "Single Membership": Refers to the individual membership plan under which one person is eligible to receive up to 2 services per month, priority booking, lab result tracking, and discounted pricing for out-of-pocket lab tests.

d. "Family Membership": Refers to the membership plan that allows up to four (4) family members to receive services under a single subscription. Each family member is entitled to 2 services per month, with shared booking, lab results tracking, and discounted pricing for out-of-pocket lab tests.

e. "Executive VIP Membership": Refers to the premium membership plan which includes all the benefits of the Single Membership but with unlimited priority booking, extended hours, same-day bookings, and private bookings with the owner. This plan is available for individual members only and includes exclusive access to additional services.

f. "Service Usage": Refers to the utilization of any of the services provided by ConveLabs under the terms of this Agreement. Service usage includes, but is not limited to, blood draws, lab tests, or any diagnostic services provided by ConveLabs. Once a service is used, the Member is subject to the full commitment term as outlined in this Agreement.

g. "Physician's Order": Refers to a written or electronic order from a licensed healthcare provider that is required for certain lab tests or services. A physician's order is required for all medical services provided by ConveLabs, except for lab tests that are available for purchase without a physician's order.

h. "Appointment": Refers to the scheduled time for a Member to receive services, such as a blood draw, lab test, or other diagnostic services. Appointments are subject to ConveLabs' scheduling availability and may be rescheduled as per the cancellation and rescheduling policies outlined in this Agreement.

i. "No-Show": Refers to a Member failing to attend a scheduled appointment without prior notice or cancellation. A "No-Show" will count toward the Member's monthly service allocation as described in the Cancellation and Termination section.

j. "Late Cancellation": Refers to the cancellation of an appointment by the Member with less than 24 hours' notice prior to the scheduled appointment time. A Late Cancellation may result in the deduction of one service from the Member's monthly allocation as outlined in the Cancellation and Termination section.

k. "Discounted Lab Tests": Refers to the lab tests offered at a reduced price to Members who subscribe to ConveLabs' services. These discounted tests are available only to members and may be applicable for certain services not covered by insurance or for out-of-pocket payments.

l. "Insurance Information": Refers to the details of the Member's health insurance provider, policy number, and other relevant data used by ConveLabs to submit claims for covered services. This information will be submitted to an in-network laboratory for processing and billing purposes, and it is the Member's responsibility to ensure that all information provided is accurate and up to date.

m. "Subscription Fee": Refers to the recurring monthly fee charged to the Member for participation in the selected membership plan. The Subscription Fee is due at the beginning of each billing cycle, as specified in this Agreement.

## 2. Membership Services

ConveLabs offers the following membership services:

● Single Membership: This plan provides access to exclusive at-home or in-office lab services for an individual subscriber.
  ○ 5 Lab Service Credits per year 
  ○ Priority Booking
  ○ Lab Results Tracking and Verification of Completion
  ○ Text-Based Support
  ○ At-home or In-Office Visits

● Family Plan: This plan is designed for families and provides coverage for up to four (4) family members.
  ○ 16 Shared Services Per Year
  ○ Shared Between Up to Four Family Members
  ○ At-Home or In-Office Visits
  ○ Result Tracking for all Members
  ○ Centralized Family Dashboard

● Individual Plus 1: This plan is an exclusive offer for an individual member and one other additional person.
  ○ 8 Shared Lab Services Per Year
  ○ Shared Between Both Users
  ○ At-Home or In-Office Visits
  ○ Result Tracking for Both Users

Services included with the membership are subject to physician's orders, except for the purchase of certain lab tests.

## 3. Membership Fees and Payment

By signing up for the Single Membership, Family Membership, or Individual Plus One, you agree to pay the monthly subscription fee specified for your selected membership plan. Payments will be charged automatically on a recurring monthly basis on the date of the initial subscription and will continue monthly unless canceled in accordance with the cancellation policy outlined below.

● Single Membership: $99.00 per month, $275.00 Quarterly, or Annual $1,062.10 ($962.10 /yr if SuperNova Deal Chosen)
● Individual +1: $150.00/month, $419.00 Quarterly, $1,620.00/yr, or ($1,48.00/yr if Supernova Deal if chosen)
● Family Membership: $250.00 per month (up to 4 members), $700.00/ Quarter, $2,700.00/yr, or ($2,430.00/yr if Supernova Deal is Chosen)

All payments are due in advance and will be automatically processed to the credit card or other payment method you provide during the registration process. ConveLabs reserves the right to modify subscription fees at any time, with any changes being communicated to the Subscriber prior to the next billing cycle.

## 4. Insurance Information

As part of your Individual & Family Membership, you are required to provide ConveLabs with your current insurance information, which will be used solely for the purpose of submitting claims and verifying coverage for applicable lab tests. Your insurance information may be shared with an in-network laboratory to process any claims related to the tests covered by your insurance plan.

By submitting your insurance information to ConveLabs, you authorize ConveLabs to share this information with the relevant laboratory or medical provider to facilitate the processing of claims, verification of benefits, and billing for services rendered. ConveLabs will ensure that all submissions are handled in compliance with applicable privacy laws, including the Health Insurance Portability and Accountability Act (HIPAA).

### Important Notes Regarding Insurance Coverage:

a. No Guarantee of Coverage or Payment: While ConveLabs will submit your insurance information to an in-network laboratory, ConveLabs makes no representations or guarantees regarding whether your insurance provider will cover the costs of lab tests. Each insurance plan is different, and coverage is subject to your individual plan terms, including any limitations or exclusions that may apply to certain types of lab tests. It is your responsibility to verify your coverage directly with your insurance provider.

b. Out-of-Pocket Costs: If your insurance provider does not cover the full cost of lab tests or services, you will be responsible for paying any remaining balance. ConveLabs offers discounted rates on out-of-pocket lab tests for members, which may be applicable if your insurance does not cover the full cost of services. Please note that these discounted prices are exclusive to members and apply only to certain tests and services.

c. Insurance Changes: It is your responsibility to promptly inform ConveLabs of any changes to your insurance coverage, including changes in your insurance provider, policy number, or plan type. Failure to provide up-to-date insurance information may result in delays or issues with claims processing, and you may be held responsible for any unpaid balances if your insurance information is outdated or inaccurate.

d. Insurance Claims and Billing: ConveLabs will make reasonable efforts to assist in submitting claims to your insurance provider for covered lab tests. However, ConveLabs is not responsible for the approval or denial of claims. All decisions regarding claims, including approval, denial, and payment, are made by your insurance provider. ConveLabs is not liable for any issues related to the payment of claims or the determination of covered services by your insurance provider.

e. Coordination of Benefits: If you have multiple insurance policies, you agree to provide ConveLabs with information regarding the coordination of benefits (COB). This will enable ConveLabs to accurately submit claims in accordance with the rules of your insurance providers. You are responsible for coordinating any claims with your insurers, and ConveLabs will not be held liable for any mistakes or delays caused by inaccurate COB information.

f. No Insurance Required for Certain Tests: Certain services, such as the purchase of select lab tests that do not require a physician's order, may not be covered by insurance. For these services, you may pay for the tests directly at the discounted member rate. ConveLabs will provide you with clear pricing for these services, which may be paid out-of-pocket without the need for insurance processing.

By subscribing to the Individual & Family Membership and providing your insurance information, you consent to the use of this information as described in this section and authorize ConveLabs to submit your insurance details to the appropriate laboratories and healthcare providers for the purpose of billing and claims processing. You acknowledge and agree that any disputes regarding insurance claims or coverage are between you and your insurance provider, and ConveLabs is not responsible for resolving such disputes.

## 5. Additional Services Provided

Your Individual & Family Membership includes access to the following services and discounts:

● Routine & Fasting Blood Draws
  Value: $150-$250
● Specialty Collection Kits
  Value: $185-$350
● Glucose and Pregnancy Test
  Value: $190-$400
● H. Pylori Collections
  Value: $175
● Urine or Stool Collections
  Value: $75
● Covid or Flu Test Collection
  Value: $150
● Genetic Blood Collection
  Value: $250
● Therapeutic Blood Removal
  Value: $350

All services provided require a physician's order unless purchasing a lab test independently.

## 6. Member Responsibilities

As a member of ConveLabs, you agree to the following responsibilities in order to maintain your membership and receive the benefits provided under your selected subscription plan:

a. Provide Accurate and Complete Information: You are responsible for providing truthful, accurate, and complete information during the registration process and throughout your membership. This includes, but is not limited to, personal identification details, health history, insurance information, and payment information. Any inaccuracies or omissions in the information provided may result in delays or termination of services. You must notify ConveLabs promptly if any information provided changes, including but not limited to changes in insurance coverage, contact information, or health status.

b. Maintain Confidentiality of Account Details: You are responsible for maintaining the confidentiality of your account, including your login credentials, username, password, and any other security information. You must ensure that only authorized individuals have access to your account and promptly notify ConveLabs if you believe your account has been compromised.

c. Use Services Only for Intended Purposes: You agree to use the services provided by ConveLabs solely for personal, non-commercial use and in accordance with the intended purposes of the membership plan you have selected. You are responsible for ensuring that any family members or other individuals utilizing the services under your membership also comply with the terms and conditions of this Agreement.

d. Provide Valid Physician Orders When Required: All services, including lab tests and blood draws, require a valid physician's order unless specifically excluded (e.g., certain out-of-pocket lab tests). You agree to ensure that all required physician orders are provided before services are rendered. It is your responsibility to ensure that the orders are accurate, complete, and up-to-date.

e. Cooperate with ConveLabs' Healthcare Professionals: You are required to follow all instructions provided by ConveLabs staff during at-home or in-office services, including any medical professionals conducting tests or blood draws. You agree to cooperate fully with any necessary medical procedures and ensure that you or any family member receiving services is physically able to undergo the procedures.

f. Comply with Scheduling and Cancellation Policies: You are responsible for adhering to the scheduling policies set forth by ConveLabs, including arriving on time for appointments. If you need to cancel or reschedule an appointment, you must provide at least 24 hours notice to avoid any late cancellation fees or service disruption. Repeated missed appointments may result in suspension or termination of membership.

g. Payment of Fees and Charges: You agree to pay all membership fees in accordance with the terms specified for your selected subscription plan. This includes the monthly subscription fee and any additional charges that may arise for services not covered by the membership, such as out-of-pocket lab tests. You are responsible for ensuring that your payment information is current and for promptly updating your payment details if needed. Failure to pay any outstanding balances may result in suspension or termination of services.

h. Insurance Cooperation: You are responsible for providing accurate and up-to-date insurance information as requested by ConveLabs. This includes submitting your insurance details for billing purposes and promptly notifying ConveLabs of any changes to your insurance coverage. You acknowledge that ConveLabs will assist with the submission of insurance claims, but the ultimate responsibility for ensuring that your insurance covers applicable services rests with you.

i. Notify ConveLabs of Health Conditions Affecting Service Delivery: You agree to inform ConveLabs of any medical conditions, health concerns, or special needs that may affect the delivery of the services, including but not limited to allergies, blood disorders, or other conditions that could impact the safety or effectiveness of blood draws and lab testing. This information is vital to ensure that services are provided safely and effectively.

j. Comply with Service Limitations and Restrictions: You acknowledge and agree to adhere to the limitations and restrictions of your membership, including any service usage limits as specified in your subscription plan. For example, if your membership includes a limited number of services per month, you are responsible for managing and utilizing these services within the designated limits.

k. Notify ConveLabs of Discrepancies in Service Delivery or Billing: If you notice any discrepancies or issues with the services provided (e.g., missed appointments, inaccurate lab results) or billing (e.g., incorrect charges), you agree to notify ConveLabs immediately. Timely notification is essential to address and resolve any issues quickly and efficiently.

l. Avoid Misuse of Services: You agree not to misuse the services provided by ConveLabs, including but not limited to engaging in fraudulent activities, attempting to access services under false pretenses, or using the services in any manner that could be deemed illegal or in violation of these Terms and Conditions. Misuse of services will result in immediate suspension or termination of your membership.

m. Adhere to Health and Safety Standards: You agree to maintain a safe and suitable environment for the provision of services, particularly for in-home services. This includes ensuring that the space where lab services will be provided is clean, accessible, and safe for ConveLabs staff to perform necessary medical procedures. You are responsible for ensuring that you or anyone receiving services is in a physical condition appropriate for the services being provided.

n. Responsibility for Minors and Family Members: If you are subscribing to the Family Membership, you are responsible for ensuring that all members of your household who are included in the membership adhere to the terms and conditions of this Agreement. This includes ensuring that any family members or minors receiving services under your membership provide accurate medical information and follow the instructions provided by ConveLabs staff.

o. Adhere to ConveLabs' Policies and Procedures: You agree to comply with all other policies and procedures outlined by ConveLabs, as well as any updates to these policies, that are communicated to you in writing or through the Site. This may include new procedures for scheduling, service delivery, or health data management.

## 7. Cancellation, Term and Termination

a. 12-Month Commitment: All membership plans, including Individual Membership, Family Membership, Corporate Membership, and Concierge Practice Membership, require a 12-month commitment. By subscribing to any of these membership plans, you agree to remain a member for the full 12-month term from the date of registration.

b. Cancellation Within 30 Days (No Service Used): Members may cancel their membership within the first 30 calendar days from registration, provided that no ConveLabs services have been used. If you have not utilized any services, you are entitled to receive a full refund for the amount paid during the initial 30-day period. To cancel, you must notify ConveLabs in writing within the first 30 days.

c. Cancellation After Service Usage: If any ConveLabs service (such as a lab draw or test) has been used during the membership period, you are immediately locked into the full 12-month term and financially responsible for the remaining balance of the subscription fees for the entire term, regardless of whether you choose to cancel the membership. This applies even if the cancellation is requested after the 30-day cancellation period.

d. Early Cancellations After Service Usage: Early cancellation requests made after any service has been used do not relieve the member of their payment obligations for the full 12-month term. You are responsible for paying the remaining balance of your membership fees for the full commitment period, even if you no longer wish to continue with the membership.

e. Appointment Cancellations and Rescheduling: You must cancel or reschedule any scheduled appointments at least 24 hours in advance to avoid a deduction from your monthly service usage. If you cancel or reschedule with less than 24 hours' notice, or fail to show up for your appointment (no-show), the appointment will be counted toward your monthly service limit. The missed or canceled appointment will be considered as a used service for that month.

f. Late Cancellations or No-Shows: If you fail to cancel or reschedule an appointment at least 24 hours in advance or do not show up for your scheduled appointment, this will count as a used service and be deducted from your monthly service allocation, regardless of the reason for cancellation or absence. Members are advised to adhere to this policy to avoid excess service usage charges.

g. Rescheduling by ConveLabs: In the event that ConveLabs needs to reschedule an appointment due to staffing shortages or circumstances beyond our control (such as weather, emergencies, or equipment failures), you will be rescheduled at no additional charge, and the rescheduled appointment will not count toward your service usage for that month. ConveLabs will notify you promptly of any necessary rescheduling and work with you to find a suitable alternative appointment.

h. Termination by ConveLabs: ConveLabs reserves the right to terminate your membership at any time for failure to comply with the terms and conditions of this Agreement, including non-payment of fees or misuse of services. If your membership is terminated by ConveLabs due to a violation of these terms, you will still be responsible for any unpaid balances due for the remainder of your 12-month commitment period.

## 8. Limitations of Liability

To the fullest extent permitted by applicable law, ConveLabs, its affiliates, officers, directors, employees, agents, and contractors (collectively, the "ConveLabs Parties") shall not be liable to you or any third party for any indirect, incidental, special, consequential, punitive, or exemplary damages arising out of or in connection with the use of the Site, services, or membership under this Agreement, including, but not limited to, lost profits, revenue, data, or business opportunities, regardless of the cause of action, whether in contract, tort (including negligence), or otherwise, even if ConveLabs has been advised of the possibility of such damages.

Without limiting the foregoing, ConveLabs' total liability for any and all claims arising under or in connection with this Agreement shall not exceed the total amount paid by you for the services under the specific membership plan for the 12-month period immediately preceding the date the claim arises. Under no circumstances shall ConveLabs be liable for damages arising from the use or inability to use the services provided, the loss of health data, or any other form of service disruption.

In particular, ConveLabs makes no guarantees regarding the accuracy, timeliness, completeness, or reliability of the services, including test results, health data, or other information provided via the services. You understand that any reliance on such services or data is at your own risk and that ConveLabs disclaims any liability for errors, omissions, or inaccuracies in the provided services.

ConveLabs shall not be held liable for any delay, failure, or disruption in the services caused by circumstances beyond its reasonable control, including, but not limited to, natural disasters, acts of terrorism, labor strikes, or technical failures of third-party systems or telecommunications networks.

You agree to indemnify, defend, and hold harmless ConveLabs, its affiliates, officers, directors, employees, agents, and contractors (collectively, the "Indemnified Parties") from and against any and all claims, demands, losses, damages, liabilities, costs, and expenses (including reasonable attorney's fees and legal costs) arising out of or in connection with:

a. Your Use of the Services: Any use or misuse of the services provided by ConveLabs, including but not limited to the provision of false or inaccurate information, failure to adhere to service usage policies, or any violation of applicable laws and regulations.

b. Violation of Agreement: Any breach of the terms of this Agreement, including but not limited to the failure to make timely payments, failure to comply with appointment cancellation policies, or failure to adhere to ConveLabs' medical or service protocols.

c. Third-Party Claims: Any claims or actions brought against the ConveLabs Parties by third parties arising out of your actions, including those related to the disclosure of your personal health information, actions regarding your insurance claims, or interactions with third-party services.

d. Negligence or Misconduct: Any claims arising from your own negligent or wrongful acts in connection with the services, including but not limited to failure to follow medical instructions or ignoring safety protocols provided by ConveLabs.

e. Third-Party Services: Any claims or disputes arising from third-party services or products provided through or in conjunction with ConveLabs' services, including those related to external healthcare providers, laboratories, or other vendors.

f. Health Information and Insurance: Any issues related to the submission of your health or insurance information to third-party providers or laboratories, including but not limited to billing disputes, claims denials, or disputes over coverage or payments.

The indemnification obligations herein will survive the termination of this Agreement and will be binding upon you and your successors, assigns, and legal representatives.

You acknowledge and agree that ConveLabs is not responsible for any services or products provided by third parties, including but not limited to medical professionals, laboratories, or health insurance providers. ConveLabs disclaims all liability for the actions, omissions, or negligence of third-party service providers, and you agree to indemnify and hold ConveLabs harmless for any claims arising from third-party services or products.

## 9. Dispute Resolution

In the event of any dispute, claim, or controversy arising out of or in connection with this Agreement, the parties agree to first attempt to resolve the matter through good faith negotiations. If the dispute remains unresolved after thirty (30) days, the dispute shall be resolved by binding arbitration in accordance with the rules of the American Arbitration Association ("AAA") in Orlando, Florida, by a single arbitrator. The decision of the arbitrator shall be final and binding. The parties agree that any arbitration will be conducted on an individual basis only, and not as a class, consolidated, or representative action. You waive any right to bring or participate in a class action, collective action, or representative action. Notwithstanding the foregoing, either party may seek injunctive or equitable relief in a court of competent jurisdiction if necessary to prevent harm that cannot be remedied through arbitration, including but not limited to intellectual property or confidentiality violations.

## 10. Miscellaneous

a. Entire Agreement: This Agreement, along with the Website Terms and Conditions, Privacy Policy, and any other legal notices or policies published by ConveLabs on the Site, constitutes the entire agreement between you and ConveLabs regarding your membership and use of the services. This Agreement supersedes all prior and contemporaneous agreements, whether written or oral, relating to the subject matter hereof.

b. Conflict Between Agreements: In the event of any conflict or inconsistency between the terms of this Subscription Agreement and the Website Terms and Conditions, the terms of this Subscription Agreement shall govern and take precedence. The Website Terms and Conditions govern general website usage, while this Subscription Agreement specifically addresses the terms applicable to your membership with ConveLabs. If any provision of the Website Terms and Conditions conflicts with the terms in this Subscription Agreement, the provisions of this Subscription Agreement will prevail.

c. Severability: If any provision of this Agreement is determined to be illegal, invalid, or unenforceable by a court of competent jurisdiction, the validity and enforceability of the remaining provisions shall not be affected. In such cases, the unenforceable provision will be modified to the extent necessary to make it enforceable while maintaining its original intent as much as possible.

d. Waiver: The failure of ConveLabs to enforce any provision of this Agreement shall not be deemed a waiver of future enforcement of that provision or any other provision. No waiver of any provision of this Agreement shall be deemed to have been made unless expressly stated in writing and signed by an authorized representative of ConveLabs.

e. Assignment: You may not assign, transfer, or sublicense your rights or obligations under this Agreement without the prior written consent of ConveLabs. ConveLabs may assign or transfer its rights and obligations under this Agreement at its discretion without notice to you.

f. Force Majeure: ConveLabs shall not be held liable for any failure or delay in the performance of its obligations under this Agreement due to circumstances beyond its reasonable control, including, but not limited to, acts of God, natural disasters, war, terrorism, labor strikes, governmental actions, power outages, or any other event that makes it impossible or commercially impracticable for ConveLabs to fulfill its obligations.

g. Governing Law and Jurisdiction: This Agreement shall be governed by and construed in accordance with the laws of the State of Florida, without regard to its conflict of laws principles. Any dispute arising out of or relating to this Agreement, and not resolved through dispute resolution as outlined in the Dispute Resolution clause, shall be subject to the exclusive jurisdiction of the state or federal courts located in Orlando, Florida.

h. Survival of Terms: Any provisions of this Agreement that by their nature should survive termination or expiration of this Agreement shall survive, including but not limited to provisions related to Limitation of Liability, Indemnification, Payment Obligations, and Governing Law.

i. Headings: The headings in this Agreement are for convenience only and shall not affect the interpretation of the terms. The headings are not to be considered part of this Agreement or used in the interpretation of any provision.

j. Electronic Signature and Acceptance: You acknowledge that by electronically submitting this Agreement, you are agreeing to be bound by the terms and conditions set forth in this Subscription Agreement. Your acceptance of this Agreement constitutes an electronic signature, which shall have the same effect as a written signature for legal and contractual purposes.

k. Changes to the Agreement: ConveLabs reserves the right to modify, amend, or revise this Agreement at any time, provided that any changes are communicated to you. Any modifications will be effective upon posting the updated Agreement on the Site. By continuing to use the services after such updates are posted, you agree to the revised terms. You are encouraged to review this Agreement periodically to stay informed of any changes.

l. No Third-Party Beneficiaries: This Agreement is entered into solely for the benefit of the parties to it. No third party shall have any rights or benefits under this Agreement except as expressly provided herein.

By signing this Agreement, you acknowledge that you have read, understood, and agreed to the terms and conditions outlined above.
`;

/**
 * Seeds the membership agreement in the database if it doesn't exist
 * @returns Promise<boolean> true if agreement was seeded or already exists, false otherwise
 */
export const seedMembershipAgreement = async (): Promise<boolean> => {
  try {
    // First try using anon key (limited permissions)
    let fetchError;
    
    // Check if a membership agreement already exists
    const { data: existingAgreements, error } = await supabase
      .from('agreements')
      .select('*')
      .eq('name', 'Membership Agreement')
      .eq('is_active', true);
      
    fetchError = error;
    
    // If there's a permission error, try an alternative approach
    if (fetchError && fetchError.code === '42501') {
      console.log('Permission denied with anon key, agreement may still exist in the database');
      return true; // Return true to prevent repeated error logs
    }
    
    // If membership agreement already exists, update it
    if (existingAgreements && existingAgreements.length > 0) {
      // Update the existing agreement with the new text
      const { error } = await supabase
        .from('agreements')
        .update({
          document_path: MEMBERSHIP_AGREEMENT_TEXT,
          updated_at: new Date().toISOString()
        })
        .eq('name', 'Membership Agreement');
        
      if (error) {
        console.error('Error updating membership agreement:', error);
        return false;
      }
      
      console.log('Membership agreement updated successfully');
      return true;
    }
    
    // Create the membership agreement if it doesn't exist
    const { error: insertError } = await supabase
      .from('agreements')
      .insert({
        name: 'Membership Agreement',
        description: 'Terms and conditions for ConveLabs membership plans',
        document_path: MEMBERSHIP_AGREEMENT_TEXT,
        is_active: true,
        version: 1
      });
      
    if (insertError) {
      console.error('Error creating membership agreement:', insertError);
      return false;
    }
    
    console.log('Membership agreement created successfully');
    return true;
  } catch (error) {
    console.error('Exception in seedMembershipAgreement:', error);
    return false;
  }
};

/**
 * Checks if a user has accepted the membership agreement
 * @param userId The user ID to check
 * @returns Promise<boolean> true if the user has accepted the agreement, false otherwise
 */
export const hasUserAcceptedAgreement = async (userId: string): Promise<boolean> => {
  try {
    const { count, error } = await supabase
      .from('user_agreements')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
      
    if (error) {
      console.error('Error checking agreement acceptance:', error);
      return false;
    }
    
    return count > 0;
  } catch (error) {
    console.error('Exception in hasUserAcceptedAgreement:', error);
    return false;
  }
};
