/**
 * The promotional recording release: the one place its words live.
 *
 * The checkout modal fetches this text from submit-recording-consent, and the
 * same function stores exactly this text (and its hash) with every signature.
 * So what the patient read, what they signed and what we keep can never drift
 * apart. Changing ANY wording means bumping RELEASE_VERSION.
 *
 * DRAFT -- pending attorney review. Written to carry the core elements a
 * HIPAA marketing authorization needs (45 CFR 164.508): what is used, by whom,
 * for what purpose, an expiration, the right to revoke and how, that care is
 * not conditioned on signing, and that published content can be redisclosed.
 */

export const RELEASE_VERSION = '2026-10-01-draft-1';

export type RecordingScope = 'arm_hands_only' | 'face_and_testimonial';

export const SCOPE_LABEL: Record<RecordingScope, string> = {
  arm_hands_only: 'Arm and hands only',
  face_and_testimonial: 'Face may appear, plus a short testimonial at the end',
};

export interface ReleaseSection {
  heading: string;
  body: string[];
}

export const RELEASE_TITLE = 'Authorization for Promotional Recording';

export const RELEASE_SECTIONS: ReleaseSection[] = [
  {
    heading: 'What may be recorded',
    body: [
      'Your ConveLabs phlebotomist may record video of the setup of supplies and of your blood draw.',
      'Arm and hands only: unless you choose otherwise below, the recording shows only your arm and hands. Your face is not shown and your voice is not used.',
      'Face and testimonial (only if you choose it): your face may appear, and you may be invited to give a short spoken testimonial at the end of the visit. You can still say no to the testimonial on the day.',
    ],
  },
  {
    heading: 'What will never be recorded',
    body: [
      'Your lab order or requisition, your name, your date of birth, your address, your house number or the outside of your home, your insurance card, tube labels, or any screen or paperwork showing your information.',
      'Tube labelling is done off camera.',
    ],
  },
  {
    heading: 'How it will be used',
    body: [
      'ConveLabs may edit the recording and use it on its website, social media, advertising and other marketing materials to show what a ConveLabs mobile blood draw looks like.',
      'You will not be paid for this use.',
    ],
  },
  {
    heading: 'This is your choice',
    body: [
      'Saying yes is voluntary. Your appointment, your care and your price are exactly the same whether or not you agree.',
      'Before recording starts, your phlebotomist will check with you again. You can ask them to stop at any time.',
    ],
  },
  {
    heading: 'Withdrawing your permission',
    body: [
      'You can withdraw this permission at any time by telling your phlebotomist or emailing info@convelabs.com. If you withdraw before or during your visit, nothing is recorded or kept.',
      'If you withdraw after a recording has been published, ConveLabs will stop any new use and remove it from channels it controls, but cannot recall copies others have already shared.',
    ],
  },
  {
    heading: 'Once published',
    body: [
      'Content published publicly can be viewed, copied and shared by anyone, and is no longer protected by federal health privacy rules once it is public.',
    ],
  },
  {
    heading: 'How long this lasts',
    body: [
      'This authorization expires three years from the date you sign it, unless you withdraw it sooner.',
    ],
  },
  {
    heading: 'Your confirmation',
    body: [
      'By signing, you confirm that you are the patient being seen at this appointment and that you are 18 or older, that you have read this authorization, and that you agree to it. You will receive a copy by email.',
    ],
  },
];

/** The release as plain text: what is hashed and stored with each signature. */
export function releasePlainText(): string {
  return [
    `${RELEASE_TITLE} (version ${RELEASE_VERSION})`,
    '',
    ...RELEASE_SECTIONS.flatMap((s) => [s.heading.toUpperCase(), ...s.body, '']),
  ].join('\n').trim();
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Age in whole years on a given day. `dob` is YYYY-MM-DD; returns null when
 * it is missing or not a real date, so callers can tell "unknown" from "minor".
 */
export function ageOn(dob: string | null | undefined, on: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dob || ''));
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900) return null;
  let age = on.getUTCFullYear() - y;
  const beforeBirthday = on.getUTCMonth() + 1 < mo || (on.getUTCMonth() + 1 === mo && on.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

/** True only when we KNOW the patient is under 18. Unknown DOB is not a minor. */
export function isKnownMinor(dob: string | null | undefined, on: Date): boolean {
  const age = ageOn(dob, on);
  return age !== null && age < 18;
}
