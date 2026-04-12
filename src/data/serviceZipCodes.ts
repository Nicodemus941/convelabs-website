// Central Florida ZIP codes served by ConveLabs
// Covers Orange, Seminole, Osceola, Lake, Volusia (partial), Brevard (partial), Polk (partial)
// EXCLUDED: New Smyrna Beach (32168, 32169, 32170), Titusville (32780, 32781, 32782, 32783, 32796), Haines City (33844, 33845)

export const SERVICE_ZIP_CODES = [
  // === ORANGE COUNTY ===
  // Orlando
  "32801", "32802", "32803", "32804", "32805", "32806", "32807", "32808",
  "32809", "32810", "32811", "32812", "32814", "32816", "32817", "32818",
  "32819", "32820", "32821", "32822", "32824", "32825", "32826", "32827",
  "32828", "32829", "32830", "32831", "32832", "32833", "32834", "32835",
  "32836", "32837", "32839",
  // Winter Park
  "32789", "32790", "32792", "32793",
  // Maitland
  "32751", "32794",
  // Windermere / Isleworth
  "34786",
  // Apopka
  "32703", "32712",
  // Winter Garden / Oakland
  "34787", "34761",
  // Ocoee
  "34761",
  // Belle Isle / Edgewood
  "32812", "32809",
  // Lake Buena Vista / Celebration
  "32830", "34747",
  // Golden Oak / Lake Nona
  "32827", "32832",
  // Christmas / Bithlo
  "32709", "32820",
  // Tangerine / Zellwood
  "32798",
  // Gotha
  "34734",

  // === SEMINOLE COUNTY ===
  // Sanford
  "32771", "32772", "32773",
  // Lake Mary / Heathrow
  "32746", "32795",
  // Altamonte Springs
  "32701", "32714", "32715",
  // Longwood
  "32750", "32752", "32779",
  // Casselberry / Fern Park
  "32707", "32730",
  // Oviedo
  "32765", "32766",
  // Winter Springs
  "32708",
  // Geneva / Chuluota
  "32732", "32766",

  // === OSCEOLA COUNTY ===
  // Kissimmee
  "34741", "34742", "34743", "34744", "34745", "34746", "34747",
  // St. Cloud
  "34769", "34770", "34771", "34772",
  // Poinciana
  "34758", "34759",
  // Reunion
  "34747",
  // Intercession City / Campbell
  "33848",

  // === LAKE COUNTY ===
  // Clermont
  "34711", "34714", "34715",
  // Leesburg
  "34748", "34749", "34788",
  // Mount Dora
  "32757",
  // Eustis
  "32726", "32727",
  // Tavares
  "32778",
  // Minneola / Montverde
  "34715", "34756",
  // Groveland / Mascotte
  "34736", "34753",
  // Lady Lake / The Villages (Lake Co portion)
  "32159", "32162", "32163",
  // Howey-in-the-Hills / Astatula
  "34737", "34705",
  // Sorrento / Mount Plymouth
  "32776",
  // Umatilla
  "32784",
  // Fruitland Park
  "34731",

  // === VOLUSIA COUNTY (partial — excludes New Smyrna Beach) ===
  // Daytona Beach
  "32114", "32115", "32116", "32117", "32118", "32119", "32120", "32121",
  // Daytona Beach Shores / South Daytona
  "32119", "32127",
  // Port Orange
  "32127", "32128", "32129",
  // Ormond Beach
  "32173", "32174", "32175", "32176",
  // DeLand
  "32720", "32721", "32723", "32724",
  // Deltona
  "32725", "32738", "32739",
  // DeBary
  "32713",
  // Orange City
  "32763",
  // Lake Helen / Cassadaga
  "32744",
  // Edgewater
  "32132", "32141",
  // Holly Hill
  "32117",
  // Pierson / Seville / Barberville
  "32180", "32190",

  // === BREVARD COUNTY (partial — excludes Titusville) ===
  // Melbourne
  "32901", "32902", "32903", "32904", "32905", "32906", "32907", "32908",
  "32909", "32910", "32911", "32912",
  // Palm Bay
  "32905", "32907", "32908", "32909",
  // Cocoa / Cocoa Beach
  "32922", "32923", "32924", "32926", "32927", "32931",
  // Rockledge
  "32955", "32956",
  // Merritt Island
  "32952", "32953", "32954",
  // Satellite Beach / Indian Harbour Beach
  "32937",
  // Viera
  "32940",
  // Cape Canaveral
  "32920",
  // Indialantic / Melbourne Beach
  "32903",
  // Mims
  "32754",
  // Grant-Valkaria
  "32949",

  // === POLK COUNTY (partial — excludes Haines City) ===
  // Lakeland
  "33801", "33802", "33803", "33805", "33806", "33807", "33809", "33810",
  "33811", "33812", "33813", "33815",
  // Winter Haven
  "33880", "33881", "33882", "33883", "33884", "33885",
  // Davenport / Champions Gate
  "33836", "33837",
  // Auburndale
  "33823",
  // Bartow
  "33830", "33831",
  // Lake Wales
  "33853", "33859",
  // Poinciana (Polk portion)
  "34759",
  // Dundee
  "33838",
  // Lake Alfred
  "33850",
  // Mulberry
  "33860",
  // Polk City
  "33868",
];

// Deduplicate at module load
const uniqueZips = [...new Set(SERVICE_ZIP_CODES)];

export function isZipServed(zip: string): boolean {
  return uniqueZips.includes(zip.trim());
}
