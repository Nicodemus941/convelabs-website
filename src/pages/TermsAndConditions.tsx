
import React from "react";
import { Helmet } from "react-helmet-async";
import Header from "@/components/home/Header";
import Footer from "@/components/home/Footer";
import { Container } from "@/components/ui/container";

const TermsAndConditions = () => {
  const effectiveDate = "May 21, 2025";
  
  return (
    <div className="min-h-screen flex flex-col">
      <Helmet>
        <title>Terms and Conditions - ConveLabs</title>
        <meta
          name="description"
          content="Terms and conditions for ConveLabs website usage and services."
        />
      </Helmet>

      <Header />

      <main className="flex-1 py-12">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">Terms and Conditions for Website Usage</h1>
            <p className="text-gray-600 mb-8">Effective Date: {effectiveDate}</p>
            
            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">1. Introduction</h2>
              <p className="mb-4">
                Welcome to ConveLabs, your trusted mobile lab service providing convenient at-home or in-office blood draws. 
                These Terms and Conditions ("Terms") govern your use of the website ("Site") and services provided by ConveLabs, LLC ("ConveLabs," "we," "our," or "us"). 
                By accessing or using this Site, you agree to comply with and be bound by these Terms. If you do not agree to these Terms, please do not use the Site.
              </p>
              <p>
                ConveLabs reserves the right to update, modify, or change these Terms at any time, and such changes will be effective immediately upon posting on the Site.
                We encourage you to review these Terms regularly to stay informed about any changes. Your continued use of the Site after any such revisions constitutes your acceptance of the updated Terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">2. Eligibility</h2>
              <p className="mb-4">
                To use the services offered by ConveLabs through this Site, you must meet the following eligibility requirements:
              </p>
              <div className="ml-4">
                <p className="mb-4">
                  <strong>a. Age Requirement:</strong> You must be at least 18 years old, or the age of majority in your jurisdiction, whichever is greater. 
                  This is in accordance with Florida state law and federal regulations that govern contract formation, including the legal capacity to enter into binding agreements.
                  If you are under 18 years of age, you are not authorized to use this Site or access ConveLabs' services unless you have obtained the explicit consent of a parent or legal guardian, 
                  and your parent or legal guardian has agreed to these Terms and Conditions on your behalf.
                </p>
                <p className="mb-4">
                  <strong>b. Legal Capacity:</strong> By using this Site, you represent and warrant that you have the legal capacity to enter into this Agreement and are not barred or prohibited 
                  from using the Site or subscribing to ConveLabs' services under any applicable law, including but not limited to the laws of Florida or the United States.
                  If you are using the services on behalf of a business, organization, or healthcare entity, you further represent and warrant that you have the necessary legal authority 
                  to bind such entity to these Terms and Conditions.
                </p>
                <p className="mb-4">
                  <strong>c. Compliance with Federal and State Laws:</strong> By accessing the Site and subscribing to ConveLabs' services, you agree to comply with all applicable federal, state, and local laws.
                </p>
                <p className="mb-4">
                  <strong>d. Restricted Use by Certain Persons:</strong> The use of ConveLabs' services is prohibited by any individual or entity that has been prohibited or restricted from entering into health-related contracts under any applicable law or regulation.
                </p>
                <p className="mb-4">
                  <strong>e. Parental or Guardian Consent for Minors:</strong> For users under the age of 18, a parent or legal guardian must provide their consent to these Terms and agree to supervise the minor's use of the Site and services.
                </p>
                <p className="mb-4">
                  <strong>f. Restricted Jurisdictions:</strong> ConveLabs' services are primarily intended for use by residents of the State of Florida, the United States, and certain other jurisdictions where we are legally authorized to operate.
                </p>
                <p>
                  <strong>g. Right to Refuse Service:</strong> ConveLabs reserves the right to refuse service to any individual or entity who does not meet the eligibility requirements or violates any applicable laws, regulations, or these Terms and Conditions.
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">3. Services Provided</h2>
              <p className="mb-4">
                ConveLabs offers a variety of subscription-based services that allow individuals, healthcare providers, and corporations to access at-home or in-office blood draw services. Our primary services include:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li className="mb-2">At-home or in-office blood draw services: For individuals who prefer the convenience of having lab tests conducted at their residence or workplace.</li>
                <li className="mb-2">Health monitoring and testing services: Including blood work, lab tests, and diagnostic services to assist with personal health management.</li>
                <li className="mb-2">Specialized services for healthcare professionals and businesses: Including tailored solutions for concierge doctors, healthcare facilities, and corporate wellness programs.</li>
              </ul>
              <p>
                Our services are offered under different subscription models to meet the needs of various users, including Individual/Family Membership, Concierge Practice/Healthcare Facility Membership, and Corporate Wellness Membership.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">4. User Responsibilities</h2>
              <p className="mb-4">
                By using this Site and subscribing to ConveLabs' services, you agree to fulfill the following responsibilities:
              </p>
              <div className="ml-4">
                <p className="mb-4">
                  <strong>a. Provide Accurate and Complete Information:</strong> You are required to provide accurate, current, and complete information during the registration or subscription process.
                </p>
                <p className="mb-4">
                  <strong>b. Maintain Account Security:</strong> You are responsible for maintaining the confidentiality and security of your account.
                </p>
                <p className="mb-4">
                  <strong>c. Compliance with Service-Specific Requirements:</strong> Depending on the subscription type you select, you may be required to provide additional information or documents.
                </p>
                <p className="mb-4">
                  <strong>d. Respect the Terms of Subscription Agreements:</strong> If you select one of the subscription models, you agree to abide by the terms outlined in the relevant Subscription Agreement.
                </p>
                <p className="mb-4">
                  <strong>e. Use Services in a Responsible Manner:</strong> You agree to use ConveLabs' services for their intended purposes only.
                </p>
                <p>
                  <strong>f. Adhere to Health and Safety Protocols:</strong> You are responsible for ensuring a suitable environment for medical procedures.
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">5. Prohibited Activities</h2>
              <p className="mb-4">
                You agree not to engage in the following activities while using this Site:
              </p>
              <div className="ml-4">
                <p className="mb-4">
                  <strong>a. Use the Site for unlawful purposes:</strong> Any use of the Site for illegal activities is strictly prohibited.
                </p>
                <p className="mb-4">
                  <strong>b. Attempt to access unauthorized areas of the Site:</strong> You may not attempt to gain unauthorized access to any part of the Site.
                </p>
                <p className="mb-4">
                  <strong>c. Damage or disrupt the Site:</strong> You may not engage in any activities that could damage, overburden, or disable the Site.
                </p>
                <p>
                  <strong>d. Upload or transmit harmful content:</strong> You may not upload or transmit any content that is defamatory, obscene, or violates the rights of others.
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">6. Payments and Billing</h2>
              <p className="mb-4">
                By subscribing to ConveLabs' services, you agree to the payment and billing terms outlined in the Subscription Agreement, including subscription fees, billing cycles, payment methods, automatic renewal, taxes, refund policies, and late payment consequences.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">7. Disclaimer</h2>
              <p className="mb-4">
                The services provided by ConveLabs are intended to assist with health management and lab testing. However, ConveLabs makes no representations or warranties regarding the accuracy, completeness, or reliability of any medical information, diagnoses, results, or interpretations provided through the services.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">8. Privacy Policy</h2>
              <p className="mb-4">
                ConveLabs values your privacy and is committed to protecting your personal information. Our <a href="/privacy-policy" className="text-conve-red hover:underline">Privacy Policy</a> outlines the types of information we collect, how we use it, and how we protect your data.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">9. Limitations of Liability</h2>
              <p className="mb-4">
                To the fullest extent permitted by applicable law, ConveLabs shall not be liable for any indirect, incidental, special, consequential, punitive, or exemplary damages, or for any loss of profits, revenue, data, or business opportunities.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">10. Indemnification</h2>
              <p className="mb-4">
                You agree to indemnify, defend, and hold harmless ConveLabs, its officers, directors, employees, agents, and affiliates from any and all claims, damages, liabilities, costs, and expenses arising from your use of the Site or violation of these Terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">11. Governing Law and Dispute Resolution</h2>
              <p className="mb-4">
                These Terms and the agreement between you and ConveLabs are governed by the laws of the State of Florida. In the event of any dispute, the parties will first attempt to resolve the matter through good faith negotiations, followed by binding arbitration if necessary.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">12. Termination</h2>
              <p className="mb-4">
                ConveLabs reserves the right to terminate or suspend your access to the Site at any time, for any reason. You may terminate your subscription at any time by providing written notice to ConveLabs, subject to the terms and conditions outlined in the Subscription Agreement.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">13. Miscellaneous</h2>
              <ul className="list-disc ml-6">
                <li className="mb-2">
                  <strong>Entire Agreement:</strong> These Terms, along with the Subscription Agreement, Privacy Policy, and any other legal notices published on the Site, constitute the entire agreement between you and ConveLabs regarding the use of the Site.
                </li>
                <li className="mb-2">
                  <strong>Severability:</strong> If any provision of these Terms is deemed invalid or unenforceable, the remaining provisions will remain in full force and effect.
                </li>
                <li>
                  <strong>Waiver:</strong> The failure of ConveLabs to enforce any provision of these Terms will not be deemed a waiver of such provision.
                </li>
              </ul>
            </section>

            <p className="text-sm text-gray-600 mt-12">
              Last updated: {effectiveDate}
            </p>
          </div>
        </Container>
      </main>

      <Footer />
    </div>
  );
};

export default TermsAndConditions;
