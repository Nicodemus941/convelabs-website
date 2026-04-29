/**
 * Resize an image File so its base64-encoded payload fits under Anthropic's
 * 5 MB Vision-API limit. Phleb photos taken on modern phones are routinely
 * 5–12 MB at full resolution; OCR doesn't need that detail.
 *
 * Strategy:
 *   - Skip if not an image (PDFs, etc.) or file is already under 4.5 MB
 *   - Otherwise: render to a canvas at most 1600px on the long edge, encode
 *     as JPEG quality 0.85. This typically lands a 12 MP photo at 600KB-1.2MB
 *     while preserving every legible character on a printed lab order.
 *
 * Returns the original file when shrinking isn't applicable, so the call
 * site can use the result unconditionally.
 */
export async function resizeImageForUpload(file: File, opts?: { maxBytes?: number; maxLongEdge?: number; quality?: number }): Promise<File> {
  const maxBytes = opts?.maxBytes ?? 4_500_000; // 4.5 MB to leave headroom for base64 + JSON wrapper
  const maxLongEdge = opts?.maxLongEdge ?? 1600;
  const quality = opts?.quality ?? 0.85;

  if (!file.type.startsWith('image/')) return file;
  if (file.size <= maxBytes) return file;
  // HEIC: browsers can't easily decode it via canvas; let it pass through
  // and the OCR side will surface a useful error. Patient phlebs should
  // be using JPG/PNG anyway.
  if (file.type === 'image/heic' || file.type === 'image/heif') return file;

  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('FileReader error'));
      reader.readAsDataURL(file);
    });

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Image decode failed'));
      i.src = dataUrl;
    });

    const longEdge = Math.max(img.width, img.height);
    const scale = Math.min(1, maxLongEdge / longEdge);
    const targetW = Math.round(img.width * scale);
    const targetH = Math.round(img.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', quality);
    });

    if (blob.size >= file.size) return file; // nothing gained
    const safeName = file.name.replace(/\.(jpg|jpeg|png|webp|gif|bmp)$/i, '') + '_resized.jpg';
    return new File([blob], safeName, { type: 'image/jpeg', lastModified: Date.now() });
  } catch (e) {
    // Resize failed — better to let the original through and surface a
    // clear server-side error than block the upload entirely.
    console.warn('[imageResize] failed, using original:', e);
    return file;
  }
}
