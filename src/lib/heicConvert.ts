/**
 * HEIC → JPEG conversion for uploads.
 *
 * HEIC is the iPhone camera default, so a meaningful share of patient lab
 * orders and insurance cards arrive in it. Until now every upload path
 * accepted `.heic` and nothing could read the result:
 *
 *   - `ocr-lab-order` bails out with `skipped: 'heic_unsupported'` — the
 *     Claude Vision API accepts jpeg/png/gif/webp and nothing else, so the
 *     document was never read and never classified.
 *   - `LabOrderViewerModal` can't preview it and falls back to an "Open HEIC
 *     file" link, which on desktop Chrome and Windows opens nothing useful.
 *   - `resizeImageForUpload` returned HEIC untouched, because a browser that
 *     can't decode HEIC can't draw it to a canvas either.
 *
 * The file was accepted, stored, and then unreadable by both a human and the
 * model. Converting once here, at the edge, means storage only ever holds a
 * format everything downstream already handles.
 *
 * Why a library rather than canvas: Safari decodes HEIC natively, but Chrome
 * and Firefox — including every Windows desktop the office uses — do not, so
 * `drawImage` fails exactly where it is needed most. heic2any carries its own
 * decoder, which is also why it is imported dynamically: it is large, and a
 * visitor who never touches a HEIC should never download it.
 */

/** Rendered JPEG quality. Lab orders are text — this stays legible well below 1.0. */
const JPEG_QUALITY = 0.9;

/**
 * Detect HEIC/HEIF by content, not just by name.
 *
 * `file.type` is unreliable: some browsers report an empty string for HEIC,
 * and a file can be renamed to `.jpg` while still holding HEIC bytes (which is
 * exactly what the specimen-label upload path used to produce). The ISO-BMFF
 * header is authoritative — bytes 4..8 are 'ftyp' and the brand that follows
 * says which flavor.
 */
export async function isHeic(file: File): Promise<boolean> {
  const byType = /^image\/(heic|heif)$/i.test(file.type || '');
  const byName = /\.(heic|heif)$/i.test(file.name || '');
  if (byType || byName) return true;

  // Sniff the brand for the renamed-file case.
  try {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (head.length < 12) return false;
    const ascii = String.fromCharCode(...head.subarray(4, 12));
    if (!ascii.startsWith('ftyp')) return false;
    const brand = ascii.slice(4, 8).toLowerCase();
    return ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand);
  } catch {
    return false;
  }
}

/**
 * Convert a HEIC/HEIF file to JPEG. Any other file is returned untouched, so
 * call sites can apply this unconditionally.
 *
 * On failure the ORIGINAL file is returned rather than throwing. A patient
 * mid-booking should never lose their upload to a decoder problem — a stored
 * HEIC is still recoverable by hand, whereas a blocked upload usually means
 * an abandoned booking. The caller can use `didConvert` to tell the two apart.
 */
export async function convertHeicToJpeg(file: File): Promise<{ file: File; didConvert: boolean; error?: string }> {
  if (!(await isHeic(file))) return { file, didConvert: false };

  try {
    // Dynamic import: heic2any bundles its own decoder and is far too large to
    // ship to every visitor when only a minority of uploads are HEIC.
    const { default: heic2any } = await import('heic2any');

    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: JPEG_QUALITY });
    // heic2any returns Blob[] for multi-image HEICs (iPhone burst / Live
    // Photo). The first frame is the still image the patient photographed.
    const blob = Array.isArray(converted) ? converted[0] : converted;
    if (!blob || !(blob instanceof Blob) || blob.size === 0) {
      return { file, didConvert: false, error: 'decoder returned no image' };
    }

    const base = (file.name || 'upload').replace(/\.(heic|heif)$/i, '');
    return {
      file: new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }),
      didConvert: true,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.warn('[heicConvert] conversion failed, uploading original:', error);
    return { file, didConvert: false, error };
  }
}
