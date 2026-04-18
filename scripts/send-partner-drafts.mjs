// Sends 4 tailored announcement-email DRAFTS to info@convelabs.com for Nico's review.
// Intentionally sent to internal inbox — NOT to the actual partners until approved.
// Run: node scripts/send-partner-drafts.mjs

const SUPABASE_URL = 'https://yluyonhrxxtyuiyrdixl.supabase.co';
const ANON = process.env.SUPABASE_ANON_KEY || '';
if (!ANON) {
  console.error('Set SUPABASE_ANON_KEY env var first');
  process.exit(1);
}

const brandWrap = (title, body) => `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
  <div style="background:linear-gradient(135deg,#B91C1C 0%,#7F1D1D 100%);padding:28px 32px;border-radius:12px 12px 0 0;text-align:center;">
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${title}</h1>
    <p style="margin:6px 0 0;color:#fecaca;font-size:13px;">ConveLabs Mobile Phlebotomy</p>
  </div>
  <div style="padding:28px 32px;background:#ffffff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;color:#111827;line-height:1.6;">
    ${body}
    <hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0 16px;">
    <p style="font-size:11px;color:#9ca3af;text-align:center;margin:0;">
      ConveLabs · 1800 Pembrook Drive, Suite 300, Orlando, FL 32810 · (941) 527-9169
    </p>
  </div>
</div>`;

const PORTAL_URL = 'https://www.convelabs.com/provider';
const FORGOT_URL = 'https://www.convelabs.com/forgot-password';

const emails = [
  {
    to: 'info@convelabs.com',
    subjectPrefix: '[DRAFT → Aristotle Education]',
    actualRecipient: 'bjung@aristotleeducation.com',
    subject: 'Your new Aristotle × ConveLabs provider portal is live',
    html: brandWrap('Welcome to your Aristotle portal', `
      <p>Hi Barry,</p>
      <p>You've been one of our longest-running VIP partners, and the team built something specifically with you in mind.</p>
      <p><strong>What's new:</strong></p>
      <ul style="padding-left:20px;margin:12px 0;">
        <li><strong>Your own provider portal</strong> — add patients, schedule visits, track specimen delivery, and view every completed visit + receipt in one place.</li>
        <li><strong>VIP scheduling window</strong> — your patients book anytime Monday through Friday. No restrictions.</li>
        <li><strong>Flat $185 per specialty kit collection</strong>, invoiced to Aristotle (or flipped to patient-pay per visit if you prefer — you choose at booking).</li>
        <li><strong>Add your own team</strong> — invite staff members who can manage scheduling on your behalf.</li>
        <li><strong>Coming soon:</strong> enter a patient's next appointment with you when scheduling, so their results land in your hands BEFORE they walk in.</li>
      </ul>
      <p><strong>How to log in:</strong></p>
      <p style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:14px;margin:12px 0;">
        <strong>1.</strong> Visit <a href="${PORTAL_URL}" style="color:#B91C1C;">convelabs.com/provider</a><br>
        <strong>2.</strong> Log in with <strong>bjung@aristotleeducation.com</strong><br>
        <strong>3.</strong> No password yet? Reset it here: <a href="${FORGOT_URL}" style="color:#B91C1C;">${FORGOT_URL}</a>
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${PORTAL_URL}" style="display:inline-block;background:#B91C1C;color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Log in to your portal →</a>
      </div>
      <p>Thanks for trusting us with your patients. If anything doesn't feel right — reply to this email or call Nico at (941) 527-9169.</p>
      <p>Nicodemus Jean-Baptiste<br><em>Founder, ConveLabs</em></p>
    `),
  },
  {
    to: 'info@convelabs.com',
    subjectPrefix: '[DRAFT → The Restoration Place]',
    actualRecipient: 'schedule@trpclinic.com',
    subject: 'Big changes for your AM cortisol patients — cleaner, faster, safer',
    html: brandWrap('A better system for your cortisol patients', `
      <p>Hi Restoration Place team,</p>
      <p>Your AM cortisol patients are medically time-sensitive — they <strong>must</strong> be drawn 6am–9am for accurate results. We've rebuilt our scheduling system around that reality.</p>
      <p><strong>What's new:</strong></p>
      <ul style="padding-left:20px;margin:12px 0;">
        <li><strong>6–9am window enforced automatically</strong> — your patients can't accidentally book outside the biological window. System blocks it, explains why.</li>
        <li><strong>Provider portal</strong> — add patients, schedule their draws, see every specimen ID, delivery log, and signed receipt.</li>
        <li><strong>$125 flat patient pricing</strong> — if your patient is also a ConveLabs member, they automatically get whichever rate is lower (no confusion, no "did I get the discount?" phone calls).</li>
        <li><strong>Your team can be added</strong> — give your front-desk staff their own login.</li>
        <li><strong>Coming soon:</strong> enter the patient's next cortisol follow-up with you when scheduling, so results are in-hand before they return.</li>
      </ul>
      <p><strong>How to log in:</strong></p>
      <p style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:14px;margin:12px 0;">
        <strong>1.</strong> Visit <a href="${PORTAL_URL}" style="color:#B91C1C;">convelabs.com/provider</a><br>
        <strong>2.</strong> Log in with <strong>schedule@trpclinic.com</strong><br>
        <strong>3.</strong> First time logging in? Reset your password: <a href="${FORGOT_URL}" style="color:#B91C1C;">${FORGOT_URL}</a>
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${PORTAL_URL}" style="display:inline-block;background:#B91C1C;color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Log in to your portal →</a>
      </div>
      <p>Cortisol accuracy depends on the clock. We built this so you never have to think about it again.</p>
      <p>Nicodemus Jean-Baptiste<br><em>Founder, ConveLabs</em></p>
    `),
  },
  {
    to: 'info@convelabs.com',
    subjectPrefix: '[DRAFT → NaturaMed / Natura Integrative]',
    actualRecipient: 'team@naturamed.org',
    subject: 'Your Natura × ConveLabs portal is ready — specialty kits, streamlined',
    html: brandWrap('Your Natura portal is live', `
      <p>Hi Natura team,</p>
      <p>Your patients choose you because functional medicine is <strong>personal</strong>. We've made sure the lab-draw handoff matches that standard.</p>
      <p><strong>What's new:</strong></p>
      <ul style="padding-left:20px;margin:12px 0;">
        <li><strong>Provider portal</strong> — add patients, schedule their specialty kit collection, track the kit back to the lab, see results-delivery timestamps.</li>
        <li><strong>$85 per specialty kit collection</strong>, Mon–Fri 6–9am morning window (optimal for fasting-based panels).</li>
        <li><strong>Flexible billing</strong> — patient pays by default. Per-visit, you can flip the bill to Natura for patients on scholarship or special care plans. One click.</li>
        <li><strong>Your admin team can be added</strong> — as many logins as you need.</li>
        <li><strong>Coming soon:</strong> enter the patient's next appointment with you when scheduling, so results land in your portal BEFORE their follow-up.</li>
      </ul>
      <p><strong>How to log in:</strong></p>
      <p style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:14px;margin:12px 0;">
        <strong>1.</strong> Visit <a href="${PORTAL_URL}" style="color:#B91C1C;">convelabs.com/provider</a><br>
        <strong>2.</strong> Log in with <strong>team@naturamed.org</strong><br>
        <strong>3.</strong> Reset your password if needed: <a href="${FORGOT_URL}" style="color:#B91C1C;">${FORGOT_URL}</a>
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${PORTAL_URL}" style="display:inline-block;background:#B91C1C;color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Log in to your portal →</a>
      </div>
      <p>Functional medicine lives or dies on the quality of the data. We're honored you trust us with the collection step.</p>
      <p>Nicodemus Jean-Baptiste<br><em>Founder, ConveLabs</em></p>
    `),
  },
  {
    to: 'info@convelabs.com',
    subjectPrefix: '[DRAFT → ND Wellness]',
    actualRecipient: 'info@ndwellness.com',
    subject: 'Your ND Wellness × ConveLabs provider portal is live',
    html: brandWrap('ND Wellness — your portal is ready', `
      <p>Hi ND Wellness team,</p>
      <p>Your patients come to you for a concierge-quality experience. We've rebuilt our system so the lab-collection step feels the same.</p>
      <p><strong>What's new:</strong></p>
      <ul style="padding-left:20px;margin:12px 0;">
        <li><strong>Provider portal</strong> — add patients, schedule specialty kit collection, track every specimen ID, download payment receipts.</li>
        <li><strong>$85 per specialty kit</strong>, patient pays at booking — <strong>anytime during business hours</strong> (Mon–Fri). No morning-only restriction.</li>
        <li><strong>Billing flexibility</strong> — flip specific patients to "ND Wellness pays" with one toggle per visit. Patient never sees a charge on those.</li>
        <li><strong>Team logins</strong> — add as many staff members as you need.</li>
        <li><strong>Coming soon:</strong> enter the patient's follow-up appointment with you when scheduling, so lab results are ready before they walk in.</li>
      </ul>
      <p><strong>How to log in:</strong></p>
      <p style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:14px;margin:12px 0;">
        <strong>1.</strong> Visit <a href="${PORTAL_URL}" style="color:#B91C1C;">convelabs.com/provider</a><br>
        <strong>2.</strong> Log in with <strong>info@ndwellness.com</strong><br>
        <strong>3.</strong> Password reset (if needed): <a href="${FORGOT_URL}" style="color:#B91C1C;">${FORGOT_URL}</a>
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${PORTAL_URL}" style="display:inline-block;background:#B91C1C;color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Log in to your portal →</a>
      </div>
      <p>We're grateful you refer patients our way. This system is built to honor that trust.</p>
      <p>Nicodemus Jean-Baptiste<br><em>Founder, ConveLabs</em></p>
    `),
  },
];

async function send(one) {
  const subject = `${one.subjectPrefix} ${one.subject}`;
  const wrapperNote = `
<div style="font-family:sans-serif;max-width:600px;margin:16px auto;background:#fef3c7;border:2px dashed #f59e0b;border-radius:8px;padding:14px;">
  <p style="margin:0;color:#78350f;font-size:12px;"><strong>🔎 DRAFT PREVIEW</strong> — not sent to partner. Intended recipient: <strong>${one.actualRecipient}</strong>. Review + reply with edits or say "send for real" when approved.</p>
</div>
`;
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON}` },
    body: JSON.stringify({
      to: one.to,
      subject,
      html: wrapperNote + one.html,
      from: 'ConveLabs Drafts <noreply@mg.convelabs.com>',
    }),
  });
  const result = await resp.text();
  console.log(`${one.subjectPrefix}: ${resp.status} ${resp.ok ? '✓' : '✗'} ${result.substring(0, 200)}`);
}

for (const e of emails) {
  await send(e);
  await new Promise(r => setTimeout(r, 800));
}
console.log('\nAll 4 drafts sent to info@convelabs.com.');
