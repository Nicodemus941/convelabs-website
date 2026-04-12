
import React from "react";
import { Helmet } from "react-helmet-async";
import Header from "@/components/home/Header";
import Footer from "@/components/home/Footer";

const PrivacyPolicy: React.FC = () => {
  const effectiveDate = "May 17, 2025";

  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>Privacy Policy | ConveLabs | Protecting Your Personal Information</title>
        <meta 
          name="description" 
          content="Learn how ConveLabs protects your personal and health information. Our privacy policy outlines how we collect, use, share, and secure your data in compliance with HIPAA and other regulations." 
        />
        <meta name="keywords" content="privacy policy, HIPAA compliance, data security, patient privacy, healthcare data protection, ConveLabs privacy" />
        <link rel="canonical" href="https://convelabs.com/privacy" />
      </Helmet>
      
      <Header />
      
      <main className="py-12 lg:py-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-3xl md:text-4xl font-bold mb-6">ConveLabs Privacy Policy</h1>
          <p className="text-lg mb-8"><strong>Effective Date:</strong> {effectiveDate}</p>
          
          <div className="prose prose-lg max-w-none">
            <p>ConveLabs, LLC ("ConveLabs," "we," "our," or "us") is committed to protecting your privacy and ensuring that your personal information is handled safely and responsibly. This Privacy Policy ("Policy") explains how we collect, use, share, and protect your personal information when you use our website, services, or mobile applications ("Services"). You consent to the practices described in this Policy by accessing or using our website or services.</p>
            
            <p>This Privacy Policy applies to all users, including visitors to our website and those who use our membership services.</p>
            
            <h2>1. Information We Collect</h2>
            <p>We collect several types of information to improve and provide our services. The types of information we collect include:</p>
            
            <h3>a. Personal Information</h3>
            <p>This includes any information that can identify you as an individual, such as:</p>
            <ul>
              <li>Name (first and last)</li>
              <li>Email address</li>
              <li>Phone number</li>
              <li>Mailing address</li>
              <li>Date of birth</li>
              <li>Insurance information (e.g., insurance provider, policy number)</li>
            </ul>
            
            <h3>b. Health Information</h3>
            <p>As healthcare providers, we collect certain health-related information to provide medical services. This may include:</p>
            <ul>
              <li>Medical history (e.g., pre-existing conditions, allergies)</li>
              <li>Physician orders for lab tests or procedures</li>
              <li>Lab results and test reports</li>
              <li>Treatment records and notes from healthcare providers</li>
              <li>Prescription information (if applicable)</li>
            </ul>
            <p>Note: Health information is collected and handled in compliance with the Health Insurance Portability and Accountability Act (HIPAA) and other relevant healthcare privacy laws.</p>
            
            <h3>c. Payment Information</h3>
            <p>When you subscribe to our Services, we may collect payment information such as:</p>
            <ul>
              <li>Credit or debit card numbers</li>
              <li>Billing address</li>
              <li>Payment history</li>
            </ul>
            
            <h3>d. Usage Data</h3>
            <p>We may automatically collect data about how you interact with our Services, including:</p>
            <ul>
              <li>IP address</li>
              <li>Browser type and version</li>
              <li>Device type and operating system</li>
              <li>Pages visited on our website</li>
              <li>Date and time of access</li>
              <li>Referring URL</li>
            </ul>
            
            <h3>e. Cookies and Tracking Technologies</h3>
            <p>We use cookies and other tracking technologies to enhance the user experience on our website and Services. This may include:</p>
            <ul>
              <li>Cookies to remember your preferences and login status</li>
              <li>Web beacons to track user activity on our website</li>
              <li>Google Analytics and other third-party tools to analyze website traffic</li>
            </ul>
            
            <h3>f. Employment and Membership Information</h3>
            <p>If you are a healthcare provider or business using our services, we may collect:</p>
            <ul>
              <li>Business name and contact information</li>
              <li>Medical practice details</li>
              <li>Membership plan details (e.g., Corporate Membership)</li>
            </ul>
            
            <h2>2. How We Use Your Information</h2>
            <p>We collect your personal, health, and payment information to provide and enhance our services. By using our website and subscribing to our services, you consent to the collection and use of your information for the following purposes:</p>
            
            <h3>a. To Provide and Deliver Services</h3>
            <p>The primary purpose for collecting your personal, health, and payment information is to provide you with at-home or in-office blood draws, lab tests, diagnostic services, and other health-related services as part of your membership. This includes:</p>
            <ul>
              <li>Processing your lab test orders.</li>
              <li>Scheduling and providing blood draws and health monitoring services.</li>
              <li>Communicating with you regarding your appointments and lab results.</li>
              <li>Analyzing and reporting test results.</li>
              <li>Manage your membership and ensure the services align with your needs.</li>
            </ul>
            
            <h3>b. To Verify Your Identity and Eligibility</h3>
            <p>We use personal information (e.g., name, date of birth, insurance details) to verify your identity and determine eligibility for specific services, discounts, and insurance benefits. This includes submitting insurance information to an in-network laboratory for billing and claims. This verification ensures we provide the most accurate and appropriate services.</p>
            
            <h3>c. To Process Payments</h3>
            <p>Your payment information (e.g., credit card numbers, billing address) is used to process subscription payments and any out-of-pocket charges related to services not covered by insurance. This includes billing for lab tests, service upgrades, and additional services requested outside your membership plan.</p>
            
            <h3>d. To Communicate with You</h3>
            <p>We use your contact information to communicate important information regarding your membership, services, and account, including:</p>
            <ul>
              <li>Sending appointment reminders and confirmations.</li>
              <li>Providing updates on the status of lab results.</li>
              <li>Notifying you of any changes to services, fees, or terms.</li>
              <li>Responding to your inquiries and providing customer support.</li>
              <li>Sending you marketing communications (if you opt in) regarding new services, offers, or health-related promotions.</li>
            </ul>
            
            <h3>e. To Comply with Legal and Regulatory Requirements</h3>
            <p>We are required to collect, use, and store certain information to comply with applicable laws and regulations, including but not limited to:</p>
            <ul>
              <li>Health Insurance Portability and Accountability Act (HIPAA): We use and disclose health information as necessary to provide healthcare services and in compliance with HIPAA to protect your medical records and privacy.</li>
              <li>State and Federal Healthcare Laws: We are obligated to comply with laws that regulate healthcare services, including the submission of insurance claims, reporting lab test results to government entities, and maintaining appropriate health records.</li>
              <li>Insurance Verification and Claims: We use your insurance information to verify your eligibility for benefits and submit claims to insurance providers for covered lab services.</li>
            </ul>
            
            <h3>f. To Improve Our Services</h3>
            <p>We use your personal and usage data to enhance the quality of our services, optimize user experience, and troubleshoot technical issues. This includes:</p>
            <ul>
              <li>Monitor and analyze how you interact with our website and services (e.g., pages visited, appointment booking behavior).</li>
              <li>Collecting feedback and suggestions to improve our services.</li>
              <li>Making adjustments to improve the safety and convenience of our service delivery.</li>
            </ul>
            
            <h3>g. To Provide Personalized Health Recommendations</h3>
            <p>We may use your health-related data to offer personalized health insights, recommendations, or reminders based on the tests performed or services you receive. This helps you stay informed about your health and wellness and enables us to tailor services to your needs.</p>
            
            <h3>h. To Send Marketing Communications</h3>
            <p>With your consent, we may send you marketing communications about new products, services, promotions, or health-related information. This may include emails, text messages, or phone calls. You can opt out of receiving marketing communications at any time by following the unsubscribe instructions provided in our communications or by contacting us directly.</p>
            
            <h3>i. To Conduct Research and Development</h3>
            <p>We may use anonymized and aggregated data for research and development purposes, including:</p>
            <ul>
              <li>Conducting studies or surveys to improve the quality of our services.</li>
              <li>Analyzing trends in health data to refine our service offerings.</li>
              <li>Conducting clinical research or trials in compliance with ethical standards and legal requirements.</li>
            </ul>
            <p>All data used for these purposes will be anonymized or de-identified to ensure that it cannot be linked to you directly, and we will not use your identifiable health information for research without your explicit consent.</p>
            
            <h3>j. To Prevent Fraud and Misuse</h3>
            <p>We use your personal information, including transaction data and usage information, to detect, prevent, and mitigate fraudulent activities, identity theft, and misuse of our services. This may include:</p>
            <ul>
              <li>Verifying the authenticity of membership and service usage.</li>
              <li>Monitoring for unauthorized access to accounts or service manipulation.</li>
              <li>Investigating suspicious activities or potential violations of our Terms and Conditions.</li>
            </ul>
            
            <h3>k. To Ensure Compliance with Membership Terms</h3>
            <p>We may use your personal and membership data to ensure compliance with the terms and conditions of your subscription, including:</p>
            <ul>
              <li>Monitoring service usage to ensure members adhere to their subscription plan and usage limits.</li>
              <li>Managing membership renewals, cancellations, and any early termination requests.</li>
              <li>Addressing any disputes related to payments, cancellations, or service delivery.</li>
            </ul>
            
            <h3>l. For Legal Defense</h3>
            <p>In the event of a legal dispute or claim, we may use your information to defend our rights, protect our interests, and resolve any issues arising from your membership, payments, or use of services.</p>
            
            <h3>m. To Facilitate Business Transfers</h3>
            <p>In the event of a merger, acquisition, or sale of ConveLabs or its assets, your information may be transferred as part of the transaction. If this occurs, we will notify you via email or through a prominent notice on our website about any changes in ownership or use of your personal information.</p>
            
            <h2>3. Sharing Your Information</h2>
            <p>We do not sell, trade, or rent your personal information to third parties. However, we may share your information with trusted third-party service providers in the following circumstances:</p>
            
            <h3>a. Healthcare Providers</h3>
            <p>We may share your health information with in-network laboratories, healthcare providers, or physicians involved in your care, as required to provide our services.</p>
            
            <h3>b. Insurance Providers</h3>
            <p>We may submit your insurance information to insurance companies to verify benefits and process claims for covered services.</p>
            
            <h3>c. Service Providers</h3>
            <p>We may share your information with third-party vendors who assist us in providing services, such as payment processors, hosting providers, and customer support platforms. These third parties are obligated to protect your information and only use it to provide services to ConveLabs.</p>
            
            <h3>d. Legal Compliance</h3>
            <p>We may disclose your information if required by law or in response to valid legal processes, such as subpoenas, court orders, or government investigations.</p>
            
            <h3>e. Business Transfers</h3>
            <p>In the event of a merger, acquisition, or sale of ConveLabs, your personal information may be transferred as part of the transaction. We will notify you via email or a prominent notice on our website if such a transfer occurs.</p>
            
            <h2>4. Data Security</h2>
            <p>We implement various security measures to protect your personal and health information, including encryption, access controls, and secure server infrastructure. However, please note that no data transmission or storage method is 100% secure, and we cannot guarantee the absolute security of your information.</p>
            <p>If you believe your account or personal information has been compromised, please get in touch with us immediately at Info@convelabs.com.</p>
            
            <h2>5. Your Privacy Rights</h2>
            <p>Under Florida law and applicable federal regulations, you have certain rights regarding your personal and health information, including:</p>
            
            <h3>a. Right to Access</h3>
            <p>You have the right to request access to the personal and health information that we maintain. You may request a copy of your health records, billing information, and other data we hold about you.</p>
            
            <h3>b. Right to Correct Information</h3>
            <p>If you believe that any information we hold about you is inaccurate or incomplete, you have the right to request corrections or updates to your personal information.</p>
            
            <h3>c. Right to Request Deletion</h3>
            <p>You have the right to request the deletion of your personal information, subject to certain legal exceptions (e.g., if the information is required to comply with healthcare regulations).</p>
            
            <h3>d. Right to Opt-Out of Marketing Communications</h3>
            <p>You may opt out of receiving marketing communications at any time by clicking the unsubscribe link in any email or contacting us directly.</p>
            
            <h3>e. HIPAA Rights</h3>
            <p>If you are a patient receiving services from ConveLabs, you have specific rights under the Health Insurance Portability and Accountability Act (HIPAA) to protect the privacy and security of your health information. For more information on your HIPAA rights, please review our HIPAA Notice of Privacy Practices.</p>
            
            <h2>6. State-Specific Privacy Notice</h2>
            <p>This State-Specific Privacy Notice supplements the ConveLabs Privacy Policy and applies to users located in specific states with data protection laws that are more stringent than federal laws. This notice applies to users from states like California, Nevada, and other states with more robust privacy regulations. Suppose you are accessing ConveLabs from one of these states. In that case, this notice will provide additional details about your rights, how we handle your personal information, and how you can exercise your privacy rights.</p>
            <p>Using our services, you acknowledge and agree to the practices described in this State-Specific Privacy Notice.</p>
            
            <h3>a. Information We Collect</h3>
            <p>For detailed information about personal and health information types, please refer to the "Information We Collect"section of our Privacy Policy.</p>
            
            <h3>b. How We Use Your Information</h3>
            <p>The "How We Use Your Information" section of our Privacy Policy details how we use the information we collect, including personal, health, and payment information.</p>
            
            <h3>c. Sharing Your Information</h3>
            <p>For information on how we may share your personal and health information with third parties, and the circumstances under which we do so, please refer to the "Sharing Your Information" section of our Privacy Policy.</p>
            
            <h3>d. Your Privacy Rights</h3>
            <p>Depending on the state where you reside, you may have specific privacy rights under applicable state laws, such as the California Consumer Privacy Act (CCPA) or Nevada Privacy Law. Below are some of the key rights you may have under these laws.</p>
            <ol className="list-roman">
              <li>Right to Know: You have the right to request information about the categories of personal information we collect about you, the sources of that information, the purposes for collecting it, and any third parties with whom we share it.</li>
              <li>Right to Access: You can request a copy of the personal information we hold about you, including health-related information, billing details, and any other data we maintain.</li>
              <li>Right to Delete: You have the right to request the deletion of your personal information, subject to certain exceptions. We will comply with your request unless we retain certain data for legal reasons.</li>
              <li>Right to Opt-Out: While we do not sell your personal information, the CCPA requires that businesses allow California residents to opt out of the sale of personal information. Since ConveLabs does not sell personal data, this provision does not apply. However, if ConveLabs engages in any future activities involving selling personal information, you would have the right to opt out of such sales.</li>
              <li>Right to Correct: You have the right to request that we correct any inaccurate or incomplete personal information we hold about you.</li>
              <li>Right to Non-Discrimination: We will not discriminate against you for exercising your privacy rights. You will not be denied services, charged a different price, or provided a lower quality of service because you requested the deletion, access, or correction of your personal information.</li>
            </ol>
            
            <h3>e. Security of Your Information</h3>
            <p>To learn about our measures to protect your personal and health information, please refer to the "Data Security" section of our Privacy Policy.</p>
            
            <h3>f. State-Specific Information</h3>
            <ol className="list-roman">
              <li>California Residents: If you are a California resident, the California Consumer Privacy Act (CCPA) provides you with additional rights, including the ability to request a list of the personal information we have collected, access to the specific information we've gathered, and the right to decline or opt out of the sale of your data. For more information about your rights under the CCPA, please see our CCPA Privacy Notice.</li>
              <li>Nevada Residents: Nevada residents can opt out of the sale of their personal data under Nevada Privacy Law. Although ConveLabs does not sell personal information, Nevada residents can submit a request to opt out by contacting us.</li>
            </ol>
            
            <h3>g. How to Exercise Your Rights</h3>
            <p>To exercise any of the privacy rights outlined in this State-Specific Privacy Notice, please submit a request to ConveLabs at:</p>
            <p>
              ConveLabs, LLC<br/>
              1800 Pembrook Drive, Suite 300<br/>
              Orlando, FL 32810<br/>
              Email: Info@convelabs.com<br/>
              Phone: 833-881-9444 | 941-251-8467
            </p>
            <p>We will respond to your request within the timeframes required by applicable law. Please note that certain requests may require us to verify your identity before fulfilling them, and some requests may be subject to legal or business obligations that require us to retain your information.</p>
            
            <h2>7. Changes to This Privacy Policy</h2>
            <p>We may occasionally update this Privacy Policy to reflect changes in our practices, legal requirements, or industry standards. When we do so, we will update the "Effective Date" at the top of the page. We encourage you to review this Privacy Policy periodically to stay informed about how we are protecting your information.</p>
            
            <h2>8. Contact Us</h2>
            <p>If you have any questions about this Privacy Policy or would like to exercise any of your rights, please get in touch with us at:</p>
            <p>
              ConveLabs, LLC<br/>
              1800 Pembrook Drive, Suite 300<br/>
              Orlando, FL 32810<br/>
              Email: Info@convelabs.com<br/>
              Phone: 833-881-9444 | 941-251-8467
            </p>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default PrivacyPolicy;
