/**
 * Tests for the chatbot's two pure helpers: tagBookingUrl and
 * readVisitorSignals.
 *
 *   node supabase/functions/chatbot/signals.test.mjs
 *
 * Edge functions are Deno and there is no Deno toolchain or unit-test
 * convention in this repo (the other "smoke-test" functions are deployed
 * functions that call the real thing). Rather than ship regex that decides
 * what lands on a lead row with no test at all, this lifts the two pure
 * functions out of index.ts, transpiles them with the esbuild that already
 * ships with vite, and asserts against message text copied verbatim from
 * chatbot_messages.
 *
 * It reads index.ts rather than duplicating the source, so it cannot drift.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { transformSync } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'index.ts'), 'utf8');

const start = src.indexOf('function tagBookingUrl');
const end = src.indexOf('function parseActionsAndEscalation');
if (start < 0 || end < 0 || end <= start) {
  console.error('Could not find the helpers in index.ts — did they move or get renamed?');
  process.exit(1);
}
const ts = src.slice(start, end) + '\nexport { tagBookingUrl, readVisitorSignals };\n';
const js = transformSync(ts, { loader: 'ts', format: 'esm' }).code;
const { tagBookingUrl, readVisitorSignals } =
  await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

const CID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`); fail++; }
  else console.log(`ok   ${name}`);
};

// ── tagBookingUrl: every action shape actually present in chatbot_messages ──
eq('book-now tagged', tagBookingUrl('/book-now', CID), `/book-now?cid=${CID}`);
eq('pricing untouched', tagBookingUrl('/pricing', CID), '/pricing');
eq('sms untouched', tagBookingUrl('sms:+19415279169', CID), 'sms:+19415279169');
eq('mailto untouched', tagBookingUrl('mailto:info@convelabs.com', CID), 'mailto:info@convelabs.com');
eq('partner untouched', tagBookingUrl('/partner-with-us', CID), '/partner-with-us');
eq('existing query kept', tagBookingUrl('/book-now?svc=fasting', CID), `/book-now?svc=fasting&cid=${CID}`);
// The id identifies a visitor's session: it must never cross to another origin.
eq('absolute url untouched', tagBookingUrl('https://evil.test/book-now', CID), 'https://evil.test/book-now');
eq('bare phone untouched', tagBookingUrl('(941) 527-9169', CID), '(941) 527-9169');

// ── readVisitorSignals: real messages, copied from chatbot_messages ─────────
eq('bare zip', readVisitorSignals('32779'), { zip: '32779' });
eq('Maria', readVisitorSignals('32814 you have drawn for me before maria tejedor baldwin park ethan lane'), { zip: '32814' });
// "1) yes" answers a question we no longer have in hand. Guessing what it
// referred to is how a lead ends up with a confidently wrong lab_order flag.
eq('ambiguous yes', readVisitorSignals('1) yes'), {});
eq('plain yes', readVisitorSignals('yes'), {});
eq('opener', readVisitorSignals('I need labs drawn at home'), {});
eq('passive ordered', readVisitorSignals('A quantiferon tb gold test was ordered'), {});
eq('insurance question', readVisitorSignals('do you accept any insurance'), {});

// ── deliberate signals ─────────────────────────────────────────────────────
eq('has order', readVisitorSignals('I have a lab order from my doctor'), { hasLabOrder: true });
eq('no order', readVisitorSignals("I don't have an order yet"), { hasLabOrder: false });
eq('timing soon', readVisitorSignals('I need it this week if possible'), { timing: 'this_week' });
eq('researching', readVisitorSignals('just researching for now'), { timing: 'researching' });
eq('email', readVisitorSignals('reach me at nico.test+lab@example.com'), { email: 'nico.test+lab@example.com' });
eq('phone', readVisitorSignals('call me at (407) 555-0143'), { phone: '(407) 555-0143' });
eq('combined', readVisitorSignals('32801, I have my lab order, need it tomorrow'),
  { zip: '32801', timing: 'this_week', hasLabOrder: true });

// ── a wrong zip is worse than no zip ───────────────────────────────────────
eq('not a zip: year', readVisitorSignals('I booked back in 2024'), {});
eq('not a zip: price', readVisitorSignals('is it really $150 per draw'), {});
eq('not a zip: out of state', readVisitorSignals('I am in 90210'), {});

console.log(fail ? `\n${fail} FAILED` : `\nall passed`);
process.exit(fail ? 1 : 0);
