/**
 * openInMaps — single helper for "open this address in the user's
 * default map app." Detects the OS and uses the platform-native scheme:
 *
 *   iOS    → `maps://` (opens Apple Maps app, falls back to web)
 *   Android → `geo:` URI with q= label (opens default — Google Maps,
 *             Waze, Maps.me, whatever the user's default is)
 *   else    → web Google Maps
 *
 * Use everywhere instead of hardcoding `https://maps.google.com/`. The
 * patient bug report 2026-05-07: phlebs on iPhone were getting Safari
 * web Google Maps instead of native Apple Maps when tapping
 * "Route to lab." This helper makes that one line.
 *
 * For multi-stop routes (phleb has 3 deliveries), pass `stops` —
 * the helper picks the right multi-waypoint URL for each platform.
 */

export type MapsTarget =
  | { kind: 'address'; address: string; label?: string }
  | { kind: 'coords'; lat: number; lng: number; label?: string }
  | { kind: 'multi'; stops: Array<{ address?: string; lat?: number; lng?: number; label?: string }> };

const isIOS = (): boolean =>
  typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

const isAndroid = (): boolean =>
  typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

export function buildMapsUrl(target: MapsTarget): string {
  if (target.kind === 'multi') {
    // Multi-stop: build a Google Maps directions URL with waypoints.
    // Apple Maps doesn't natively support multi-waypoint URLs as cleanly,
    // so we fall back to the web Google Maps for multi on iOS too.
    const stops = target.stops.filter(s => s.address || (s.lat && s.lng));
    if (stops.length === 0) return '';
    if (stops.length === 1) {
      const s = stops[0];
      return buildMapsUrl(s.address
        ? { kind: 'address', address: s.address, label: s.label }
        : { kind: 'coords', lat: s.lat!, lng: s.lng!, label: s.label }
      );
    }
    const dest = stops[stops.length - 1];
    const waypoints = stops.slice(0, -1).map(s => s.address || `${s.lat},${s.lng}`).join('|');
    const destStr = dest.address || `${dest.lat},${dest.lng}`;
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destStr)}&waypoints=${encodeURIComponent(waypoints)}&travelmode=driving`;
  }

  if (target.kind === 'coords') {
    if (isIOS()) {
      // Apple Maps: `?ll=` for show, `?daddr=` for directions
      return `maps://maps.apple.com/?daddr=${target.lat},${target.lng}`;
    }
    if (isAndroid()) {
      // Android geo: URI with optional label
      const q = target.label ? `(${encodeURIComponent(target.label)})` : '';
      return `geo:${target.lat},${target.lng}?q=${target.lat},${target.lng}${q}`;
    }
    return `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}`;
  }

  // address
  const encoded = encodeURIComponent(target.address);
  if (isIOS()) return `maps://maps.apple.com/?daddr=${encoded}`;
  if (isAndroid()) return `geo:0,0?q=${encoded}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
}

/**
 * One-shot "open this in the right map app" — uses window.open.
 * Logs the attempt + falls back to web Google Maps if the deep link
 * fails (some browsers block `maps://` and `geo:` schemes outside of
 * a real user gesture).
 */
export function openInMaps(target: MapsTarget): void {
  const url = buildMapsUrl(target);
  if (!url) return;
  const win = window.open(url, '_blank');
  // If the deep link didn't open (e.g. blocked or no app installed),
  // fall back to web Google Maps after 800ms.
  if (!win && (isIOS() || isAndroid())) {
    let webUrl: string;
    if (target.kind === 'address') webUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target.address)}`;
    else if (target.kind === 'coords') webUrl = `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}`;
    else webUrl = url; // multi already returns a web URL
    setTimeout(() => window.open(webUrl, '_blank'), 600);
  }
}
