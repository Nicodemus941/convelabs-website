import React from 'react';
import Header from '@/components/home/Header';
import Footer from '@/components/home/Footer';

const TermsOfService = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="container mx-auto py-12 px-4 flex-grow">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-3">Terms and Conditions of Service</h1>
            <p className="text-muted-foreground">ConveLabs, LLC</p>
            <p className="text-sm text-muted-foreground">Effective Date: April 13, 2026 | Version 2.0</p>
            <p className="text-sm text-muted-foreground">1800 Pembrook Drive, Suite 300, Orlando, FL 32810</p>
          </div>

          <div className="prose prose-gray max-w-none space-y-8 text-sm leading-relaxed">
            {/* Preamble */}
            <div className="bg-red-50 border border-red-200 rounded-xl p-6">
              <p className="font-semibold text-[#B91C1C] mb-2">IMPORTANT: PLEASE READ THESE TERMS CAREFULLY BEFORE USING OUR SERVICES.</p>
              <p>
                These Terms and Conditions ("Agreement") constitute a legally binding contract between you ("Patient," "You," or "User") and ConveLabs, LLC ("ConveLabs," "Company," "We," "Us," or "Our"), a Florida limited liability company. By booking an appointment, accessing our website, using our mobile application, or engaging any ConveLabs services, you acknowledge that you have read, understood, and agree to be bound by the terms and conditions set forth herein. If you do not agree to these Terms, you must not use our services.
              </p>
              <p className="mt-2">
                Your electronic acceptance of these Terms at the time of booking, whether by checking the acceptance box, clicking "Proceed to Payment," or any other affirmative act indicating acceptance, shall have the same legal force and effect as a handwritten signature pursuant to the Electronic Signatures in Global and National Commerce Act (E-SIGN Act, 15 U.S.C. 7001 et seq.) and the Uniform Electronic Transactions Act (UETA).
              </p>
            </div>

            {/* Section 1 */}
            <section>
              <h2 className="text-xl font-bold text-gray-900 border-b pb-2">Section 1: Description of Services</h2>
              <p className="mt-3">
                ConveLabs is a licensed mobile phlebotomy service provider operating in the State of Florida. Our services include, but are not limited to: mobile blood draws at the patient's home, office, hotel, or other designated location; in-office blood draws at our facility; specimen collection for laboratory testing; specimen transport and delivery to designated laboratories; and coordination of laboratory services on behalf of the patient's ordering healthcare provider.
              </p>
              <p>
                ConveLabs is a specimen collection and transport service. We do not practice medicine, diagnose conditions, interpret laboratory results, prescribe treatments, or provide medical advice. All laboratory testing must be ordered by a licensed healthcare provider. ConveLabs acts solely as an intermediary between the patient, the ordering provider, and the receiving laboratory.
              </p>
            </section>

            {/* Section 2 */}
            <section>
              <h2 className="text-xl font-bold text-gray-900 border-b pb-2">Section 2: Insurance Processing and Financial Responsibility</h2>
              <p className="mt-3 font-semibold text-[#B91C1C]">
                CONVELABS DOES NOT ACCEPT, PROCESS, FILE, OR SUBMIT INSURANCE CLAIMS ON BEHALF OF PATIENTS FOR OUR PHLEBOTOMY SERVICE FEES.
              </p>
              <p>
                2.1. <strong>Service Fee Responsibility.</strong> All ConveLabs service fees (including but not limited to visit fees, surcharges, travel fees, and ancillary charges) are the sole financial responsibility of the Patient. These fees are separate and distinct from any laboratory testing charges and are due at the time of booking unless otherwise arranged.
              </p>
              <p>
                2.2. <strong>Insurance Information Collection.</strong> ConveLabs may collect insurance information from the Patient for the sole purpose of submitting such information to the designated receiving laboratory. This submission is performed as a courtesy and does not constitute insurance billing, claims processing, or any guarantee of coverage. ConveLabs makes no representations or warranties regarding insurance coverage, eligibility, benefits, or reimbursement.
              </p>
              <p>
                2.3. <strong>Laboratory Billing.</strong> The receiving laboratory (e.g., LabCorp, Quest Diagnostics, AdventHealth, Orlando Health) will bill the Patient's insurance directly for laboratory testing charges. Any copays, deductibles, coinsurance amounts, or denied claims related to laboratory testing are the sole responsibility of the Patient.
              </p>
              <p>
                2.4. <strong>Billing Inquiries.</strong> For questions regarding laboratory test billing, coverage, or claims, the Patient must contact their insurance provider directly or the receiving laboratory. ConveLabs is unable to assist with insurance disputes, appeals, or coverage determinations.
              </p>
              <p>
                2.5. <strong>No Superbill Guarantee.</strong> While ConveLabs may provide a receipt or superbill upon request for the service fee, this does not guarantee reimbursement from the Patient's insurer. The Patient assumes all risk of non-reimbursement.
              </p>
            </section>

            {/* Section 3 */}
            <section>
              <h2 className="text-xl font-bold text-gray-900 border-b pb-2">Section 3: Laboratory Results</h2>
              <p className="mt-3 font-semibold text-[#B91C1C]">
                CONVELABS DOES NOT RECEIVE, STORE, ACCESS, INTERPRET, OR DISTRIBUTE LABORATORY TEST RESULTS.
              </p>
              <p>
                3.1. <strong>Results Delivery.</strong> In accordance with Clinical Laboratory Improvement Amendments (CLIA) regulations (42 CFR Part 493), laboratory test results are transmitted directly from the performing laboratory to the ordering healthcare provider. ConveLabs does not serve as an intermediary for results delivery.
              </p>
              <p>
                3.2. <strong>Patient Access to Results.</strong> Patients may access their laboratory results through: (a) the performing laboratory's patient portal (e.g., LabCorp Patient Portal, MyQuest by Quest Diagnostics); (b) their ordering healthcare provider's office or patient portal; or (c) by contacting the performing laboratory directly. ConveLabs cannot provide, relay, or expedite access to results.
              </p>
              <p>
                3.3. <strong>Processing Times.</strong> Laboratory result processing times vary significantly depending on the type of test ordered, the performing laboratory, and other factors outside of ConveLabs' control. Routine tests may be available within 24 to 72 hours, while specialized panels, cultures, or reference laboratory tests may require 7 to 14+ business days. ConveLabs makes no guarantees regarding result availability timelines.
              </p>
              <p>
                3.4. <strong>Specimen Delivery Confirmation.</strong> Upon delivery of specimens to the designated laboratory, ConveLabs will send the Patient a confirmation via SMS and/or email containing the laboratory-generated specimen tracking identification number. This confirmation serves as proof of delivery and does not indicate result availability.
              </p>
              <p>
                3.5. <strong>Results Not Appearing in Patient Portal.</strong> If results do not appear in the laboratory's patient portal, this may be because: (a) not all tests have been finalized; (b) results may be displaying in the ordering provider's portal but have not yet crossed over into the patient-facing portal; or (c) the laboratory requires additional processing time. The Patient should contact the performing laboratory or their ordering provider for status updates.
              </p>
              <p>
                3.6. <strong>Provider Missing Results.</strong> If the ordering provider reports that results have not been received, the Patient should provide the provider with the specimen identification number provided to them by ConveLabs via SMS and/or email. The provider can use this identification number to locate results directly with the performing laboratory.
              </p>
              <p>
                3.7. <strong>Results Access Fee.</strong> Any request to ConveLabs to assist with locating, retrieving, or facilitating access to laboratory results shall incur an administrative fee of Twenty-Five Dollars ($25.00) per request. This fee is non-refundable regardless of the outcome of the request.
              </p>
              <p>
                3.8. <strong>Results Forwarding.</strong> ConveLabs does not forward laboratory results to other healthcare providers, specialists, or third parties. The Patient is solely responsible for sharing results with additional providers. Should the Patient request that ConveLabs facilitate the forwarding of results to another provider, an administrative fee of Thirty-Five Dollars ($35.00) per forwarding request shall be invoiced to the Patient.
              </p>
            </section>

            {/* Section 4 */}
            <section>
              <h2 className="text-xl font-bold text-gray-900 border-b pb-2">Section 4: Lab Order Requirements</h2>
              <p className="mt-3">
                4.1. <strong>Physician Lab Order Required.</strong> All specimen collection services require a valid, current laboratory order ("Lab Order") from a licensed healthcare provider. ConveLabs cannot perform specimen collection without proper authorization from the ordering provider.
              </p>
              <p>
                4.2. <strong>Upload at Time of Booking.</strong> ConveLabs strongly recommends that Patients upload their physician's Lab Order at the time of booking through our online booking portal. Early submission allows our team to review the order, confirm the required tubes and collection methodology, and ensure preparedness for the appointment.
              </p>
              <p>
                4.3. <strong>Failure to Provide Lab Order.</strong> If the Patient fails to provide a valid Lab Order at or before the time of the scheduled appointment, the following consequences may apply:
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li>ConveLabs may be unable to perform specimen collection, in whole or in part;</li>
                <li>The appointment may need to be rescheduled, subject to availability and applicable rescheduling fees;</li>
                <li>A trip fee or partial service fee may be charged at ConveLabs' discretion;</li>
                <li>Processing and delivery of specimens may be delayed;</li>
                <li>Additional fees may be assessed for return visits required due to incomplete or missing orders.</li>
              </ul>
              <p>
                4.4. <strong>Provider Fax.</strong> If the Patient is unable to upload the Lab Order electronically, ConveLabs may attempt to obtain the order directly from the ordering provider's office via fax. However, this process is not guaranteed and may result in delays. ConveLabs is not responsible for delays caused by the ordering provider's failure to respond.
              </p>
            </section>

            {/* Section 5 */}
            <section>
              <h2 className="text-xl font-bold text-gray-900 border-b pb-2">Section 5: Limitation of Liability</h2>
              <p className="mt-3">
                5.1. <strong>Scope of Services.</strong> ConveLabs provides specimen collection and transport services only. ConveLabs does not verify insurance eligibility or benefits, guarantee laboratory result timelines, provide medical diagnoses or advice, access, interpret, or store laboratory results, or guarantee specimen integrity after delivery to the receiving laboratory.
              </p>
              <p>
                5.2. <strong>Recollection Due to Specimen Issues.</strong> In the event that a recollection is required:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>ConveLabs Error (e.g., hemolysis due to collection technique, wrong tube used):</strong> ConveLabs will waive the service fee for the recollection visit at no additional charge to the Patient.</li>
                <li><strong>Laboratory Error or Provider Error (e.g., specimen lost by lab, wrong test ordered by provider):</strong> The Patient will be required to pay for a new service appointment. ConveLabs may, at its sole discretion, offer a discount for the recollection of the specific test that requires re-collection. However, if the ordering provider adds additional tests beyond the original recollection order, full service fees shall apply for the entire appointment.</li>
              </ul>
              <p>
                5.3. <strong>Maximum Liability.</strong> TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, CONVELABS' TOTAL AGGREGATE LIABILITY FOR ANY AND ALL CLAIMS ARISING OUT OF OR RELATED TO THESE TERMS OR THE SERVICES PROVIDED SHALL NOT EXCEED THE TOTAL AMOUNT PAID BY THE PATIENT FOR THE SPECIFIC SERVICE GIVING RISE TO THE CLAIM.
              </p>
              <p>
                5.4. <strong>Exclusion of Damages.</strong> IN NO EVENT SHALL CONVELABS, ITS OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, OR AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, REGARDLESS OF WHETHER SUCH DAMAGES WERE FORESEEABLE OR WHETHER CONVELABS WAS ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
              </p>
              <p>
                5.5. <strong>Force Majeure.</strong> ConveLabs shall not be liable for any failure or delay in performing its obligations where such failure or delay results from events beyond its reasonable control, including but not limited to acts of God, natural disasters, pandemics, epidemics, government actions or restrictions, traffic conditions, vehicle breakdowns, severe weather, civil unrest, or supply chain disruptions affecting necessary medical supplies.
              </p>
            </section>

            {/* Section 6 */}
            <section>
              <h2 className="text-xl font-bold text-gray-900 border-b pb-2">Section 6: Provider and Service Availability</h2>
              <p className="mt-3">
                6.1. <strong>No Guarantee of Availability.</strong> Appointment availability varies based on geographic location, current demand, staffing levels, and other operational factors. ConveLabs does not guarantee immediate availability, specific appointment times, or availability of a particular phlebotomist.
              </p>
              <p>
                6.2. <strong>Service Area.</strong> ConveLabs currently serves the Central Florida metropolitan area, including but not limited to Orlando, Winter Park, Windermere, Dr. Phillips, Lake Nona, Celebration, Kissimmee, Lake Mary, Altamonte Springs, Sanford, Oviedo, Maitland, Clermont, and surrounding communities. Service availability in extended areas may be subject to additional surcharges.
              </p>
              <p>
                6.3. <strong>Operating Hours.</strong> Standard operating hours are Monday through Friday, 6:00 AM to 1:30 PM, and Saturday, 6:00 AM to 9:45 AM (Eastern Time). Sunday service is not available. Hours may vary on holidays and are subject to change without notice. ConveLabs observes all major U.S. federal holidays.
              </p>
              <p>
                6.4. <strong>Same-Day and Urgent Appointments.</strong> Same-day appointments are subject to availability and may incur a surcharge of Fifty Dollars ($50.00). ConveLabs does not guarantee same-day service.
              </p>
            </section>

            {/* Section 7 - HIPAA */}
            <section>
              <h2 className="text-xl font-bold text-gray-900 border-b pb-2">Section 7: HIPAA Compliance and Protected Health Information</h2>
              <p className="mt-3">
                7.1. <strong>HIPAA Acknowledgment.</strong> ConveLabs is committed to protecting the privacy and security of your Protected Health Information ("PHI") in compliance with the Health Insurance Portability and Accountability Act of 1996 ("HIPAA"), the Health Information Technology for Economic and Clinical Health Act ("HITECH Act"), and all applicable federal and state privacy laws and regulations.
              </p>
              <p>
                7.2. <strong>Use and Disclosure of PHI.</strong> ConveLabs collects, uses, and discloses PHI only as necessary to: (a) provide specimen collection and transport services; (b) coordinate with ordering healthcare providers and receiving laboratories; (c) process payments and billing; (d) comply with legal and regulatory requirements; and (e) as otherwise permitted or required by law.
              </p>
              <p>
                7.3. <strong>Patient Rights Under HIPAA.</strong> As a Patient, you have the right to: (a) receive a copy of ConveLabs' Notice of Privacy Practices; (b) request restrictions on certain uses and disclosures of your PHI; (c) request access to your PHI maintained by ConveLabs; (d) request amendments to your PHI; (e) receive an accounting of disclosures of your PHI; (f) request confidential communications; and (g) file a complaint if you believe your privacy rights have been violated.
              </p>
              <p>
                7.4. <strong>Security Measures.</strong> ConveLabs implements administrative, physical, and technical safeguards to protect the confidentiality, integrity, and availability of your PHI, including but not limited to: encrypted data transmission and storage, role-based access controls, staff training on privacy and security protocols, secure specimen labeling and chain of custody procedures, and regular security assessments and audits.
              </p>
              <p>
                7.5. <strong>Breach Notification.</strong> In the event of a breach of unsecured PHI, ConveLabs will provide notification to affected individuals, the U.S. Department of Health and Human Services, and other parties as required by applicable law, within the timeframes specified under HIPAA and HITECH.
              </p>
              <p>
                7.6. <strong>Consent to Use PHI.</strong> By accepting these Terms and booking an appointment, you consent to the collection, use, and disclosure of your PHI as described herein and in ConveLabs' Notice of Privacy Practices.
              </p>
            </section>

            {/* Section 8 */}
            <section>
              <h2 className="text-xl font-bold text-gray-900 border-b pb-2">Section 8: Payment Terms and Cancellation Policy</h2>
              <p className="mt-3">
                8.1. <strong>Payment Due at Booking.</strong> Full payment for ConveLabs services is due at the time of booking unless an alternative payment arrangement has been established (e.g., organizational billing, VIP accounts, or invoiced appointments).
              </p>
              <p>
                8.2. <strong>Invoiced Appointments.</strong> For appointments created with invoice billing, payment must be received within twelve (12) hours of invoice issuance. Failure to remit payment within this period may result in a payment reminder. If payment is not received within thirty (30) minutes of the reminder, the appointment may be cancelled at ConveLabs' sole discretion, and the appointment slot released to other patients.
              </p>
              <p>
                8.3. <strong>Cancellation by Patient.</strong> Patients may cancel an appointment free of charge with at least twenty-four (24) hours' notice prior to the scheduled appointment time. Late cancellations (less than 24 hours' notice) or no-shows may result in: (a) forfeiture of one (1) service from the monthly allocation for membership patients; (b) a cancellation fee for non-member patients; or (c) deduction of the visit from prepaid service packages.
              </p>
              <p>
                8.4. <strong>Refund Policy.</strong> Service fees are generally non-refundable once the phlebotomist has arrived at the Patient's location and attempted specimen collection. Refunds for services not rendered due to ConveLabs' inability to perform (e.g., missing lab order not attributable to Patient, phlebotomist unavailability) will be processed within 5-10 business days.
              </p>
              <p>
                8.5. <strong>Additional Fees.</strong> The following additional fees may apply: extended area surcharge ($75.00 for locations outside the standard service area); same-day appointment surcharge ($50.00); weekend surcharge ($75.00); results access assistance ($25.00 per request); results forwarding to other providers ($35.00 per request); and additional patient at same location (pricing varies by service type).
              </p>
            </section>

            {/* Section 9 */}
            <section>
              <h2 className="text-xl font-bold text-gray-900 border-b pb-2">Section 9: Patient Responsibilities</h2>
              <p className="mt-3">
                9.1. The Patient agrees to: (a) provide accurate, complete, and current personal, medical, and insurance information; (b) present a valid government-issued photo identification at the time of service; (c) provide or arrange access to a clean, well-lit, and sterile area suitable for specimen collection; (d) disclose all relevant medical conditions, medications, allergies, and bleeding disorders prior to collection; (e) follow all fasting and preparation instructions as required by the ordered tests; (f) provide a valid Lab Order from a licensed healthcare provider; and (g) comply with all scheduling and cancellation policies.
              </p>
              <p>
                9.2. <strong>Informed Consent to Venipuncture.</strong> By scheduling an appointment, the Patient acknowledges and consents to venipuncture (blood draw) procedures performed by a licensed phlebotomist. The Patient understands that inherent risks of venipuncture include but are not limited to bruising, hematoma, pain or discomfort, infection, nerve injury, fainting or vasovagal response, and allergic reaction to latex, adhesive, or antiseptic. The Patient agrees to immediately inform the phlebotomist of any adverse reactions during or after the procedure.
              </p>
            </section>

            {/* Section 10 */}
            <section>
              <h2 className="text-xl font-bold text-gray-900 border-b pb-2">Section 10: Governing Law and Dispute Resolution</h2>
              <p className="mt-3">
                10.1. <strong>Governing Law.</strong> These Terms shall be governed by and construed in accordance with the laws of the State of Florida, without regard to its conflict of law principles.
              </p>
              <p>
                10.2. <strong>Dispute Resolution.</strong> Any dispute, controversy, or claim arising out of or relating to these Terms or the services provided shall first be submitted to good-faith mediation. If mediation is unsuccessful, the dispute shall be resolved by binding arbitration conducted in Orange County, Florida, in accordance with the rules of the American Arbitration Association. The arbitrator's decision shall be final and binding.
              </p>
              <p>
                10.3. <strong>Class Action Waiver.</strong> THE PATIENT AGREES THAT ANY CLAIMS AGAINST CONVELABS SHALL BE BROUGHT IN THE PATIENT'S INDIVIDUAL CAPACITY AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS, CONSOLIDATED, OR REPRESENTATIVE ACTION.
              </p>
              <p>
                10.4. <strong>Statute of Limitations.</strong> Any claim or cause of action arising out of or related to these Terms or the services must be filed within one (1) year after such claim or cause of action arose, or be forever barred.
              </p>
            </section>

            {/* Section 11 */}
            <section>
              <h2 className="text-xl font-bold text-gray-900 border-b pb-2">Section 11: Modifications and Severability</h2>
              <p className="mt-3">
                11.1. <strong>Modifications.</strong> ConveLabs reserves the right to modify, amend, or update these Terms at any time. Material changes will be communicated via email to registered users and/or posted on our website. Continued use of ConveLabs services after the effective date of any modifications constitutes acceptance of the revised Terms.
              </p>
              <p>
                11.2. <strong>Severability.</strong> If any provision of these Terms is found to be invalid, illegal, or unenforceable by a court of competent jurisdiction, such provision shall be modified to the minimum extent necessary to make it enforceable, and the remaining provisions shall continue in full force and effect.
              </p>
              <p>
                11.3. <strong>Entire Agreement.</strong> These Terms, together with ConveLabs' Privacy Policy and any applicable membership agreements, constitute the entire agreement between the Patient and ConveLabs regarding the use of our services, superseding all prior or contemporaneous agreements, communications, and proposals, whether oral or written.
              </p>
              <p>
                11.4. <strong>Waiver.</strong> The failure of ConveLabs to enforce any right or provision of these Terms shall not constitute a waiver of such right or provision.
              </p>
            </section>

            {/* Section 12 */}
            <section>
              <h2 className="text-xl font-bold text-gray-900 border-b pb-2">Section 12: Contact Information</h2>
              <p className="mt-3">
                For questions, concerns, or complaints regarding these Terms, please contact:
              </p>
              <div className="bg-gray-50 rounded-xl p-6 mt-3">
                <p className="font-semibold">ConveLabs, LLC</p>
                <p>1800 Pembrook Drive, Suite 300</p>
                <p>Orlando, FL 32810</p>
                <p className="mt-2">Phone: (941) 527-9169</p>
                <p>Email: info@convelabs.com</p>
                <p className="mt-2">HIPAA Privacy Officer: info@convelabs.com</p>
              </div>
            </section>

            {/* Acknowledgment */}
            <div className="bg-gray-900 text-white rounded-xl p-6 mt-8">
              <p className="font-semibold text-lg mb-2">Acknowledgment and Acceptance</p>
              <p className="text-gray-300 text-sm">
                By booking an appointment with ConveLabs, checking the "I agree to the terms and conditions" box, or otherwise using our services, I acknowledge that I have read, understood, and agree to be bound by these Terms and Conditions in their entirety. I understand that this constitutes a legally binding agreement and that my electronic acceptance has the same force and effect as a handwritten signature. I further acknowledge that I have been given the opportunity to review these Terms prior to acceptance and that I accept them voluntarily.
              </p>
            </div>

            <p className="text-center text-xs text-muted-foreground mt-8">
              Version 2.0 | Effective April 13, 2026 | ConveLabs, LLC. All rights reserved.
            </p>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default TermsOfService;
