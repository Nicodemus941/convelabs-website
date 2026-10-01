/**
 * The signed copy of a promotional recording release, as a PDF.
 *
 * Built once, when the patient signs, from the exact release text that was
 * served to them -- so the kept copy is the document they agreed to, not
 * whatever the release says today.
 */

import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
import { RELEASE_SECTIONS, RELEASE_TITLE, SCOPE_LABEL, type RecordingScope } from './recording-release.ts';

export interface ConsentPdfInput {
  consentId: string;
  releaseVersion: string;
  releaseSha256: string;
  scope: RecordingScope;
  signerName: string;
  patientEmail: string;
  signedAt: Date;
  ipAddress: string;
  userAgent: string;
  signaturePng: Uint8Array;
}

// Helvetica in pdf-lib is WinAnsi only. Anything outside it (curly quotes,
// emoji in a pasted name) would throw, so it is replaced rather than lost
// silently in a way that fails the whole signature.
function winAnsi(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

function etStamp(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'long',
    timeStyle: 'long',
  }).format(d);
}

export async function buildConsentPdf(input: ConsentPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${RELEASE_TITLE} - ${input.consentId}`);
  pdf.setAuthor('ConveLabs');
  pdf.setCreationDate(input.signedAt);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const signature = await pdf.embedPng(input.signaturePng);

  const W = 612, H = 792, M = 56, maxW = W - M * 2;
  let page = pdf.addPage([W, H]);
  let y = H - M;

  const newPageIfNeeded = (need: number) => {
    if (y - need < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };

  const write = (text: string, opts: { size?: number; font?: typeof regular; gap?: number; color?: ReturnType<typeof rgb> } = {}) => {
    const size = opts.size ?? 10;
    const font = opts.font ?? regular;
    const words = winAnsi(text).split(/\s+/);
    let line = '';
    const lines: string[] = [];
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > maxW && line) {
        lines.push(line);
        line = w;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    for (const l of lines) {
      newPageIfNeeded(size + 4);
      page.drawText(l, { x: M, y: y - size, size, font, color: opts.color ?? rgb(0.1, 0.1, 0.12) });
      y -= size + 4;
    }
    y -= opts.gap ?? 4;
  };

  write('ConveLabs', { size: 11, font: bold, color: rgb(0.55, 0.1, 0.1), gap: 2 });
  write(RELEASE_TITLE, { size: 17, font: bold, gap: 2 });
  write(`Version ${input.releaseVersion}`, { size: 9, color: rgb(0.4, 0.4, 0.45), gap: 12 });

  for (const section of RELEASE_SECTIONS) {
    write(section.heading, { size: 11, font: bold, gap: 2 });
    for (const p of section.body) write(p, { size: 10, gap: 4 });
    y -= 6;
  }

  newPageIfNeeded(220);
  y -= 6;
  write('Signed', { size: 12, font: bold, gap: 6 });
  write(`What may be recorded: ${SCOPE_LABEL[input.scope]}`, { size: 10, font: bold, gap: 6 });
  write(`Name: ${input.signerName}`);
  write(`Email: ${input.patientEmail}`);
  write(`Signed: ${etStamp(input.signedAt)}`);
  write('Confirmed: I am the patient being seen and I am 18 or older.', { gap: 8 });

  const sigH = 70;
  const sigW = Math.min(maxW / 2, (signature.width / signature.height) * sigH);
  newPageIfNeeded(sigH + 40);
  page.drawImage(signature, { x: M, y: y - sigH, width: sigW, height: sigH });
  y -= sigH + 4;
  page.drawLine({ start: { x: M, y }, end: { x: M + maxW / 2, y }, thickness: 0.6, color: rgb(0.5, 0.5, 0.55) });
  y -= 18;

  write('Record', { size: 9, font: bold, color: rgb(0.4, 0.4, 0.45), gap: 2 });
  for (const line of [
    `Consent ID: ${input.consentId}`,
    `Release SHA-256: ${input.releaseSha256}`,
    `IP address: ${input.ipAddress || 'unknown'}`,
    `Browser: ${input.userAgent.slice(0, 180) || 'unknown'}`,
  ]) write(line, { size: 8, color: rgb(0.4, 0.4, 0.45), gap: 1 });

  return await pdf.save();
}
