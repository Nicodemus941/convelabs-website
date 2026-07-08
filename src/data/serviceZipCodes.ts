// Central Florida ZIP codes served by ConveLabs, grouped by county so pricing
// rules can key off county (e.g., travel fees for Lake / Volusia / Polk).
// Coverage is ultimately governed by the 39-mile service radius (src/lib/
// serviceArea.ts); this list is the manual-entry fallback + the county source
// for travel-fee determination.
// EXCLUDED: New Smyrna Beach (32168, 32169, 32170), Titusville (32780, 32781,
// 32782, 32783, 32796), Haines City core (33844, 33845), Edgewater (32132, 32141)

// === CORE (no travel fee) ===
export const ORANGE_ZIPS = [
  // Orlando
  "32801", "32802", "32803", "32804", "32805", "32806", "32807", "32808",
  "32809", "32810", "32811", "32812", "32814", "32816", "32817", "32818",
  "32819", "32820", "32821", "32822", "32824", "32825", "32826", "32827",
  "32828", "32829", "32830", "32831", "32832", "32833", "32834", "32835",
  "32836", "32837", "32839",
  // Winter Park / Maitland
  "32789", "32790", "32792", "32793", "32751", "32794",
  // Windermere / Apopka / Winter Garden / Ocoee
  "34786", "32703", "32712", "34787", "34761",
  // Lake Buena Vista / Celebration / Lake Nona / Christmas / Zellwood / Gotha
  "34747", "32709", "32798", "34734",
];

export const SEMINOLE_ZIPS = [
  // Sanford / Lake Mary / Heathrow
  "32771", "32772", "32773", "32746", "32795",
  // Altamonte / Longwood / Casselberry / Fern Park
  "32701", "32714", "32715", "32750", "32752", "32779", "32707", "32730",
  // Oviedo / Winter Springs / Geneva / Chuluota
  "32765", "32766", "32708", "32732",
];

export const OSCEOLA_ZIPS = [
  // Kissimmee
  "34741", "34742", "34743", "34744", "34745", "34746", "34747",
  // St. Cloud
  "34769", "34770", "34771", "34772",
  // Poinciana / Intercession City
  "34758", "34759", "33848",
];

// === TRAVEL-FEE COUNTIES (Lake / Volusia / Polk) ===
// Owner rule 2026-06: visits in these counties carry the Extended Service Area
// travel fee. Coverage still bounded by the 39-mile radius.
export const LAKE_ZIPS = [
  // Clermont / Minneola / Montverde
  "34711", "34714", "34715", "34756",
  // Fruitland Park / Lady Lake / The Villages (Lake portion)
  "34731", "32159", "32162", "32163",
  // Mount Dora / Eustis / Sorrento / Umatilla
  "32757", "32726", "32727", "32776", "32784",
  // Mascotte / Howey / Astatula
  "34753", "34737", "34705",
  // NOTE: Leesburg (34748/34749/34788), Tavares (32778), and Groveland (34736)
  // were removed from coverage 2026-06 (owner). See EXCLUDED_ZIPS below — they
  // fall within the 39-mile radius, so the gate must exclude them explicitly.
];

export const VOLUSIA_ZIPS = [
  // Daytona Beach / Holly Hill
  "32114", "32115", "32116", "32117", "32118", "32119", "32120", "32121",
  // South Daytona / Port Orange
  "32127", "32128", "32129",
  // Ormond Beach
  "32173", "32174", "32175", "32176",
  // DeLand / Deltona / DeBary / Orange City / Lake Helen
  "32720", "32721", "32723", "32724", "32725", "32738", "32739",
  "32713", "32763", "32744",
  // Pierson / Seville / Barberville
  "32180", "32190",
];

export const POLK_ZIPS = [
  // Davenport / Champions Gate
  "33836", "33837",
  // Lakeland
  "33801", "33802", "33803", "33805", "33806", "33807", "33809", "33810",
  "33811", "33812", "33813", "33815",
  // Winter Haven
  "33880", "33881", "33882", "33883", "33884", "33885",
  // Auburndale / Bartow / Lake Wales / Dundee / Lake Alfred / Mulberry / Polk City
  "33823", "33830", "33831", "33853", "33859", "33838", "33850", "33860", "33868",
  // Poinciana (Polk portion)
  "34759",
];

export const BREVARD_ZIPS = [
  // Melbourne / Palm Bay
  "32901", "32902", "32903", "32904", "32905", "32906", "32907", "32908",
  "32909", "32910", "32911", "32912",
  // Cocoa / Rockledge / Merritt Island / Beaches / Viera / Cape Canaveral / Mims / Grant
  "32922", "32923", "32924", "32926", "32927", "32931", "32955", "32956",
  "32952", "32953", "32954", "32937", "32940", "32920", "32754", "32949",
];

// === EXTENDED-AREA ORANGE ZIPs (covered, but carry the travel fee) ===
// Orange-County ZIPs on the far west edge, adjacent to Lake County
// (Montverde / Clermont). They fall within the 39-mile radius but are far
// enough that the owner applies the Extended Service Area surcharge, so they
// live in their own bucket rather than in the core (no-fee) ORANGE_ZIPS.
// Owner add 2026-07-08: Oakland (34760) — as near as Clermont / Montverde.
export const EXTENDED_ORANGE_ZIPS = [
  "34760", // Oakland
];

export const SERVICE_ZIP_CODES = [
  ...ORANGE_ZIPS, ...SEMINOLE_ZIPS, ...OSCEOLA_ZIPS,
  ...LAKE_ZIPS, ...VOLUSIA_ZIPS, ...POLK_ZIPS, ...BREVARD_ZIPS,
  ...EXTENDED_ORANGE_ZIPS,
];

// Travel-fee zones — visits here carry the Extended Service Area surcharge.
// Lake / Volusia / Polk counties + explicit extended-area Orange edge ZIPs.
const TRAVEL_FEE_ZIP_SET = new Set([
  ...LAKE_ZIPS, ...VOLUSIA_ZIPS, ...POLK_ZIPS, ...EXTENDED_ORANGE_ZIPS,
]);

// ZIPs we explicitly DO NOT serve even though they fall within the 39-mile
// radius (owner exclusions 2026-06): Leesburg, Tavares, Groveland.
export const EXCLUDED_ZIPS = new Set(['34748', '34749', '34788', '32778', '34736']);

// Deduplicate at module load
const uniqueZips = [...new Set(SERVICE_ZIP_CODES)];

function first5(zip: string | null | undefined): string | null {
  if (!zip) return null;
  const m = String(zip).match(/\d{5}/);
  return m ? m[0] : null;
}

/** True for ZIPs we deliberately do not serve (within radius but excluded). */
export function isZipExcluded(zip: string | null | undefined): boolean {
  const z = first5(zip);
  return z ? EXCLUDED_ZIPS.has(z) : false;
}

export function isZipServed(zip: string | null | undefined): boolean {
  const z = first5(zip);
  if (!z || EXCLUDED_ZIPS.has(z)) return false;
  return uniqueZips.includes(z);
}

/** True when a ZIP is in a travel-fee county (Lake, Volusia, or Polk). */
export function isTravelFeeZip(zip: string | null | undefined): boolean {
  const z = first5(zip);
  return z ? TRAVEL_FEE_ZIP_SET.has(z) : false;
}

// Shared so the booking gate and the edge function agree on messaging.
export const OUT_OF_AREA_MESSAGE =
  "That address is outside our standard service area. Call (941) 527-9169 or email info@convelabs.com and we'll confirm whether we can reach you.";
