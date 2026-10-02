/**
 * trust-claims — every marketing claim used in patient-facing recovery copy,
 * in one place. Owner-reviewed 2026-10-02.
 *
 * Rules:
 *   • Only claims substantiated by data or operations go here. No "99.9%",
 *     no "one-try", no "guarantee" wording — those were pulled on 2026-10-02
 *     because nothing measures them yet.
 *   • Edit here, never inline. The frontend mirror lives in
 *     src/lib/bookingDraft.ts (TRUST_CLAIMS) — keep the two in sync.
 */

export const TRUST_CLAIMS = {
  /** Replaces "blood draws take 10 minutes or less". */
  duration: 'Most draws take under 10 minutes.',
  /** Optional count when a number is wanted (replaces the 99.9% figure). */
  collections: '440+ collections and counting.',
  /** Replaces "100% no-samples-lost guarantee". */
  tracked: 'Every sample tracked from your arm to the lab.',
  /** The promise that goes with `tracked` where it fits. */
  redraw: 'If we ever lose a sample, your redraw is free.',
  /** Operational facts — keep as-is. */
  labs: 'We deliver to Quest Diagnostics, Labcorp and AdventHealth.',
  notified: 'You and your doctor are notified when samples are collected and delivered.',
  labOrder: "We'll get the order from your doctor.",
  /** Needles line, verbatim from the owner. */
  needles: 'Nervous about needles? Our phlebotomists are gentle, experienced, and most draws take under 10 minutes.',
} as const;

/** Lower-cases the first letter so a claim can sit mid-sentence. */
export const midSentence = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
