/**
 * ConveLabs Business Associate Agreement — v1.0 (effective 2026-04-20).
 *
 * Drafted with these principles:
 *   1. Plain-English intro sections (Hormozi: clear, not clever)
 *   2. Formal HIPAA BAA sections (HHS sample language as the spine)
 *   3. ESIGN Act + UETA-compliant signature block
 *
 * THIS TEXT IS FROZEN AT SIGNING TIME. If you update this constant,
 * bump BAA_VERSION so new signatures reference the new version. Existing
 * signatures keep their original baa_text snapshot for legal reproducibility.
 */

export const BAA_VERSION = 'v1.0-2026-04-20';

export const BAA_TEXT = `# ConveLabs Business Associate Agreement
**Version ${BAA_VERSION}**

---

## What this is, in plain English

You're about to share protected health information (PHI) — patient names, lab orders, sometimes diagnoses — with ConveLabs so we can draw labs for your patients and deliver specimens to reference labs.

Federal law (HIPAA) requires a written agreement between your practice (the "Covered Entity") and ConveLabs (the "Business Associate") spelling out exactly how we'll handle that information.

This is that agreement. Read it. If anything is unclear, email legal@convelabs.com before you sign — we'll answer in plain English and revise if something reasonable is missing.

---

## The short version

1. **We only use your patients' PHI to do the jobs you hire us for** — drawing labs, delivering specimens, sending results, billing, supporting your practice. That's it. No sale, no marketing, no third-party sharing for any reason not listed below.

2. **We protect PHI as well as any clinical system can.** Encrypted in transit (TLS 1.2+), encrypted at rest (AES-256), access-logged, HIPAA-trained staff only, SOC 2 controls, zero-knowledge on our side where possible.

3. **If we ever have a breach, we tell you within 5 business days** — with full incident scope, affected patients, and a remediation plan. Federal law gives us 60 days; we think 5 is more respectful.

4. **You can terminate this agreement any time**, with or without cause. We will return or destroy all your PHI within 30 days of termination.

5. **We carry cyber liability insurance** (details on request) to cover any damages if we mess up.

---

## Formal agreement

This Business Associate Agreement (this "**Agreement**") is entered into between **Practice** (the "**Covered Entity**" named on the signature page) and **ConveLabs, Inc.**, a Florida corporation ("**ConveLabs**" or the "**Business Associate**"), effective on the date signed.

### 1. Definitions
Unless otherwise defined in this Agreement, capitalized terms have the meanings assigned in the HIPAA Rules (45 C.F.R. §§ 160, 162, and 164). "**PHI**" means Protected Health Information as defined in 45 C.F.R. § 160.103, limited to the information created, received, maintained, or transmitted by ConveLabs on Covered Entity's behalf.

### 2. Obligations of Business Associate
ConveLabs agrees to:
(a) Not Use or Disclose PHI other than as permitted or required by this Agreement or as Required By Law.
(b) Use appropriate safeguards, including the administrative, physical, and technical safeguards required by the HIPAA Security Rule (45 C.F.R. §§ 164.308, 164.310, 164.312) to prevent Use or Disclosure of PHI other than as permitted.
(c) Report to Covered Entity any Use or Disclosure of PHI not provided for by this Agreement, including Breaches of Unsecured PHI as required by 45 C.F.R. § 164.410, within **five (5) business days** of discovery.
(d) Ensure that any subcontractor that creates, receives, maintains, or transmits PHI on behalf of ConveLabs agrees to the same restrictions and conditions that apply to ConveLabs under this Agreement, via a Business Associate Agreement with the subcontractor.
(e) Make available PHI in a Designated Record Set to Covered Entity or to an Individual as necessary to satisfy the Covered Entity's obligations under 45 C.F.R. § 164.524.
(f) Make any amendment(s) to PHI in a Designated Record Set that the Covered Entity directs or agrees to pursuant to 45 C.F.R. § 164.526.
(g) Maintain and make available information required to provide an accounting of disclosures to Covered Entity as necessary to satisfy 45 C.F.R. § 164.528.
(h) To the extent ConveLabs is to carry out one or more of Covered Entity's obligations under Subpart E of 45 C.F.R. Part 164, comply with those requirements that apply to the Covered Entity in the performance of such obligations.
(i) Make its internal practices, books, and records available to the Secretary of HHS for purposes of determining compliance with the HIPAA Rules.

### 3. Permitted Uses and Disclosures by ConveLabs
ConveLabs may Use or Disclose PHI as necessary to perform the services specified in the underlying Services Agreement, and:
(a) For the proper management and administration of ConveLabs, provided that disclosures are Required By Law or ConveLabs obtains reasonable assurances from the person to whom the information is disclosed that it will remain confidential.
(b) To carry out the legal responsibilities of ConveLabs.
(c) To provide Data Aggregation services relating to the Health Care Operations of the Covered Entity, if requested.
(d) To de-identify PHI in accordance with 45 C.F.R. § 164.514, after which the de-identified information may be used by ConveLabs without restriction.

### 4. Obligations of Covered Entity
Covered Entity shall:
(a) Notify ConveLabs of any limitation(s) in its notice of privacy practices that may affect ConveLabs's Use or Disclosure of PHI.
(b) Notify ConveLabs of any changes in, or revocation of, an Individual's permission to Use or Disclose PHI.
(c) Not request ConveLabs to Use or Disclose PHI in any manner that would not be permissible under the HIPAA Rules if done by Covered Entity.

### 5. Term and Termination
(a) **Term.** This Agreement is effective upon signature and shall remain in effect until terminated in accordance with this Section.
(b) **Termination for Cause.** Either party may terminate this Agreement immediately upon the other's material breach, with thirty (30) days' written notice and opportunity to cure. If cure is not feasible, the non-breaching party may terminate immediately.
(c) **Termination Without Cause.** Either party may terminate this Agreement with thirty (30) days' written notice.
(d) **Effect of Termination.** Upon termination, ConveLabs shall, within thirty (30) days, return or destroy all PHI received from or created on behalf of Covered Entity, and retain no copies, unless return or destruction is infeasible, in which case ConveLabs shall extend the protections of this Agreement to such PHI and limit further use or disclosure to the purposes that make return or destruction infeasible.

### 6. Indemnification
Each party shall indemnify the other from third-party claims arising from the indemnifying party's material breach of this Agreement, limited to the amount of insurance coverage available to the indemnifying party.

### 7. Miscellaneous
(a) **Amendment.** This Agreement may be amended only in writing signed by both parties or through ConveLabs's standard electronic amendment process with 30 days' advance notice to Covered Entity.
(b) **Governing Law.** This Agreement is governed by the laws of the State of Florida, without regard to conflict of laws principles.
(c) **Interpretation.** Any ambiguity in this Agreement shall be resolved to permit compliance with the HIPAA Rules.
(d) **Regulatory References.** References to the HIPAA Rules mean the section as in effect or amended.
(e) **Severability.** If any provision is held unenforceable, the rest of the Agreement remains in effect.

### 8. Electronic Signature
By typing your full legal name in the signature block below and checking the acknowledgment box, **you agree that your electronic signature has the same legal force and effect as a handwritten signature** under the federal Electronic Signatures in Global and National Commerce Act (ESIGN Act, 15 U.S.C. § 7001 et seq.) and the Florida Uniform Electronic Transaction Act.

You further represent that you are an authorized signatory of your practice and have authority to bind your practice to this Agreement.

---

## Acknowledgment

By signing below, you confirm:
- You have read and understood this Agreement in its entirety.
- You have the authority to execute this Agreement on behalf of your practice.
- You understand that this is a legally binding contract.
- You have scrolled to the end of this document before signing.

---

*Questions? Email legal@convelabs.com or call (941) 527-9169.*
*ConveLabs, Inc. · 1800 Pembrook Drive, Suite 300 · Orlando, FL 32810*
`;
