/**
 * TRUST CLAIMS — single place for the owner-supplied facts used on the
 * Meta landing page, the booking flow and the summary card.
 *
 * Edit numbers/wording here and every surface updates.
 *
 * Lab names are PLAIN TEXT only. We say "we deliver to" these labs — never
 * show their logos or imply a partnership or endorsement.
 *
 * OWNER DECISION 2026-10-02 — what we can and cannot say yet:
 *   Live data: 440 collections since 2026-04-13 with zero *recorded*
 *   failures, but failed draws are not tracked, ~29 lab-bound visits lack a
 *   delivery record, and no draw-timing data exists. So numeric success /
 *   no-loss claims ("99.9% success rate", "100% lab collection accuracy",
 *   "100% no-samples-lost guarantee", "10 minutes or less") stay OFF until
 *   outcome tracking (separate branch `feat/draw-outcome-tracking`) has
 *   measured them. The replacements below are process promises and a
 *   verifiable count. Operational facts (labs we deliver to, notifications,
 *   results retrieval) are unchanged.
 */

/** Labs we physically deliver specimens to. Display order matters. */
export const LABS_DELIVERED_TO = ['Quest Diagnostics', 'Labcorp', 'AdventHealth'] as const;

/** Short form for tight rows (hero trust row, summary card). */
export const LABS_DELIVERED_TO_SHORT = 'Quest, Labcorp or AdventHealth';

/**
 * Collections completed since 2026-04-13. Update this number as it grows;
 * it renders as "<n>+ collections and counting".
 */
export const COLLECTIONS_COUNT = 440;

export const TRUST_CLAIMS = {
  /** Full sentence. */
  deliveredTo: 'We deliver your samples to Quest Diagnostics, Labcorp and AdventHealth.',
  /** Summary-card line. */
  deliveredToShort: `Delivered to ${LABS_DELIVERED_TO_SHORT}`,

  drawTime: 'Most draws take under 10 minutes.',
  drawTimeShort: 'Most draws under 10 minutes',
  drawTimeCard: 'Most draws take under 10 minutes',

  /** Replaces "99.9% success rate" until outcomes are measured. */
  collections: `${COLLECTIONS_COUNT}+ collections and counting`,

  /** Replaces "100% lab collection accuracy". */
  collectionAccuracy: 'Every tube labeled and verified at your side',

  patientNotified: 'Get notified when your samples are delivered.',
  doctorNotified: 'We notify your doctor when your labs are collected, delivered, and where.',
  /** Summary-card line combining the two notification claims. */
  notifiedCard: 'You and your doctor are notified when it’s collected and delivered',

  resultsRetrieval: 'Can’t find your results? Contact us and we’ll retrieve your lab results for you.',

  /** Replaces "100% no-samples-lost guarantee…" — the process + the promise. */
  sampleTracked: 'Every sample tracked from your arm to the lab',
  lostSamplePromise: 'If we ever lose a sample, your redraw is free.',

  /** Existing site guarantee, phrased for the checkout step. */
  onTimeWaived: 'On time or your visit fee is waived.',
} as const;

/** Compact row for the landing-page hero: draw time · collections · labs. */
export const HERO_TRUST_ROW = [
  TRUST_CLAIMS.drawTimeShort,
  TRUST_CLAIMS.collections,
  LABS_DELIVERED_TO.map(l => (l === 'Quest Diagnostics' ? 'Quest' : l)).join(' / '),
] as const;

/** "Your samples, handled end to end" section on the landing page. */
export const SAMPLE_HANDLING_POINTS = [
  { title: 'Drawn at your side', body: `${TRUST_CLAIMS.drawTime} ${TRUST_CLAIMS.collectionAccuracy}.` },
  { title: 'Delivered to your lab', body: TRUST_CLAIMS.deliveredTo },
  { title: 'Tracked the whole way', body: `${TRUST_CLAIMS.sampleTracked}. ${TRUST_CLAIMS.lostSamplePromise}` },
  { title: 'You are kept in the loop', body: TRUST_CLAIMS.patientNotified },
  { title: 'So is your doctor', body: TRUST_CLAIMS.doctorNotified },
  { title: 'Results you can find', body: TRUST_CLAIMS.resultsRetrieval },
] as const;
