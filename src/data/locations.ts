export interface LocationServiceArea {
  name: string;
  description: string;
}

export interface LocationSpecialService {
  title: string;
  description: string;
  features: string[];
}

export interface LocationData {
  slug: string;
  name: string;
  tagline: string;
  heroTitle: string;
  heroDescription: string;
  badgeText: string;
  badgeColor: string; // tailwind gradient classes
  seo: {
    title: string;
    description: string;
    keywords: string;
    canonicalPath: string;
    ogImage: string;
  };
  geo: {
    latitude: number;
    longitude: number;
    postalCode: string;
  };
  trustSignals: {
    title: string;
    description: string;
  }[];
  specialServices: LocationSpecialService[];
  serviceAreas: LocationServiceArea[];
  whyChoose: {
    title: string;
    description: string;
  }[];
  ctaTitle: string;
  ctaDescription: string;
  nearbyCities?: string[]; // slugs of nearby location pages
}

export const locations: Record<string, LocationData> = {
  windermere: {
    slug: "windermere",
    name: "Windermere",
    tagline: "Serving Windermere's Luxury Communities",
    heroTitle: "Private Mobile Lab Services in Windermere, Florida",
    heroDescription: "White-glove concierge blood draws at your Windermere estate, yacht, or private office. Our certified phlebotomists serve Isleworth, Keene's Pointe, and Central Florida's most exclusive communities with VIP appointments and ultimate discretion.",
    badgeText: "Windermere's Premier Lab Service",
    badgeColor: "from-amber-100 to-amber-50 border-amber-200 text-amber-800",
    seo: {
      title: "Luxury Mobile Phlebotomy Windermere | VIP Concierge Blood Draw Services | ConveLabs",
      description: "Windermere's premier luxury mobile phlebotomy service. White-glove concierge blood draws at your estate, yacht, or private office. Serving Isleworth, Keene's Pointe with same-day VIP appointments.",
      keywords: "luxury mobile phlebotomy Windermere, VIP mobile blood work, premium home lab services Windermere, concierge phlebotomy Isleworth, executive health screening Windermere",
      canonicalPath: "/windermere",
      ogImage: "https://convelabs.com/images/windermere-mobile-phlebotomy.jpg",
    },
    geo: { latitude: 28.4947, longitude: -81.5342, postalCode: "34786" },
    trustSignals: [
      { title: "Same-Day Available", description: "Emergency and routine appointments throughout Windermere" },
      { title: "Certified & Insured", description: "Licensed phlebotomists serving Central Florida" },
      { title: "Premium Service", description: "White-glove service with hospital-grade equipment" },
    ],
    specialServices: [
      {
        title: "Estate Concierge Service",
        description: "Professional phlebotomists come directly to your Windermere residence with complete privacy and discretion.",
        features: ["Private estate house calls", "Early morning fasting appointments", "Complete family coverage"],
      },
      {
        title: "Corporate & Office Visits",
        description: "Discreet, efficient blood draws at your Windermere workplace or business.",
        features: ["Multiple employees per visit", "Minimal disruption", "Corporate wellness programs"],
      },
    ],
    serviceAreas: [
      { name: "Windermere Proper", description: "Full community coverage" },
      { name: "Isleworth", description: "Golf community estates" },
      { name: "Keene's Pointe", description: "Luxury waterfront homes" },
      { name: "The Reserve", description: "Gated community" },
      { name: "Lake Butler Sound", description: "Lakefront estates" },
      { name: "Dr. Phillips (nearby)", description: "Adjacent community" },
    ],
    whyChoose: [
      { title: "Local Knowledge", description: "We understand Windermere traffic patterns and community access." },
      { title: "Flexible Scheduling", description: "Early morning, evening, and weekend appointments available." },
      { title: "Membership Savings", description: "Up to 64% off with our founding member plans." },
      { title: "Same-Day Results", description: "Rapid turnaround for busy executives." },
    ],
    ctaTitle: "Ready for Premium Service in Windermere?",
    ctaDescription: "Join hundreds of Windermere residents who've simplified their lab testing with our mobile phlebotomy services.",
  },

  isleworth: {
    slug: "isleworth",
    name: "Isleworth",
    tagline: "Serving Isleworth's Elite Community",
    heroTitle: "Isleworth VIP Mobile Lab Services",
    heroDescription: "Exclusive mobile phlebotomy services for Isleworth's distinguished golf community. Experience luxury at-home blood work with the discretion and excellence you expect.",
    badgeText: "Serving Isleworth's Elite Community",
    badgeColor: "from-yellow-100 to-yellow-50 border-yellow-200 text-yellow-800",
    seo: {
      title: "Isleworth Mobile Lab Services | VIP Blood Work | ConveLabs | 941-527-9169",
      description: "Exclusive Mobile Lab Services for Isleworth Residents. Luxury at-home blood work for golf community executives. Same-day results, HIPAA compliant.",
      keywords: "mobile lab services Isleworth, VIP blood work Bay Hill Club, luxury phlebotomy Isleworth golf community, executive health screening Isleworth",
      canonicalPath: "/isleworth",
      ogImage: "https://convelabs.com/isleworth-mobile-lab.jpg",
    },
    geo: { latitude: 28.4639, longitude: -81.5376, postalCode: "32836" },
    trustSignals: [
      { title: "Same-Day Available", description: "Quick scheduling for your busy lifestyle" },
      { title: "Certified & Insured", description: "Licensed professionals you can trust" },
      { title: "VIP Service", description: "White-glove experience every time" },
    ],
    specialServices: [
      {
        title: "Golf Community Services",
        description: "Specialized mobile lab for Isleworth's active golf community, including pre-tournament screenings.",
        features: ["Pre-round health assessments", "Executive physical screenings", "Tournament medical clearance"],
      },
      {
        title: "Estate Concierge Services",
        description: "White-glove mobile lab services for your Isleworth estate with complete discretion.",
        features: ["Private estate house calls", "Complete privacy protection", "Same-day result delivery"],
      },
    ],
    serviceAreas: [
      { name: "Isleworth Country Club", description: "Complete golf community" },
      { name: "Bay Hill Club", description: "Adjacent luxury community" },
      { name: "Phillips Point", description: "Exclusive waterfront estates" },
    ],
    whyChoose: [
      { title: "Unmatched Discretion", description: "We maintain the highest standards of confidentiality." },
      { title: "Golf-Friendly Scheduling", description: "Appointments that don't interfere with tee times." },
      { title: "Executive-Level Service", description: "White-glove service matching your luxury standards." },
      { title: "Same-Day Results", description: "Rapid turnaround for busy executives." },
    ],
    ctaTitle: "Ready to Experience VIP Mobile Lab Services?",
    ctaDescription: "Join Isleworth's elite who trust ConveLabs for their health screening needs.",
  },

  "bay-hill": {
    slug: "bay-hill",
    name: "Bay Hill",
    tagline: "Serving Arnold Palmer's Legendary Community",
    heroTitle: "Bay Hill Club VIP Mobile Lab",
    heroDescription: "Exclusive mobile phlebotomy for Bay Hill Club & Lodge members and residents. Tournament-quality healthcare with the excellence that defines Arnold Palmer's legacy.",
    badgeText: "Serving Arnold Palmer's Legendary Community",
    badgeColor: "from-green-100 to-green-50 border-green-200 text-green-800",
    seo: {
      title: "Bay Hill Club Mobile Lab | Arnold Palmer's Community | ConveLabs | 941-527-9169",
      description: "Exclusive Mobile Lab Services for Bay Hill Club & Lodge. VIP blood work for Arnold Palmer's legendary golf community. Same-day results, HIPAA compliant.",
      keywords: "mobile lab services Bay Hill Club, VIP blood work Arnold Palmer community, luxury phlebotomy Bay Hill Lodge",
      canonicalPath: "/bay-hill",
      ogImage: "https://convelabs.com/bay-hill-mobile-lab.jpg",
    },
    geo: { latitude: 28.4531, longitude: -81.5087, postalCode: "32819" },
    trustSignals: [
      { title: "Tournament-Day Ready", description: "Quick health screening for members and guests" },
      { title: "Championship Standards", description: "Arnold Palmer's legacy of excellence" },
      { title: "VIP Club Service", description: "Member-exclusive healthcare experience" },
    ],
    specialServices: [
      {
        title: "Championship Golf Community",
        description: "Mobile lab services for Bay Hill Club's prestigious membership, including tournament health clearances.",
        features: ["Pre-tournament medical clearance", "Member executive physicals", "Invitational guest services"],
      },
      {
        title: "Lodge & Residential Services",
        description: "White-glove mobile lab for Bay Hill Lodge guests and community residents.",
        features: ["Lodge guest room service", "Residential community calls", "Tournament week availability"],
      },
    ],
    serviceAreas: [
      { name: "Bay Hill Club & Lodge", description: "Full club coverage" },
      { name: "Tournament Facilities", description: "Championship course access" },
      { name: "Residential Community", description: "Private homes and estates" },
    ],
    whyChoose: [
      { title: "Championship Excellence", description: "We deliver excellence in every interaction." },
      { title: "Tournament-Level Precision", description: "Timing that meets championship event demands." },
      { title: "Member-First Service", description: "Personalized attention for every member." },
      { title: "Legendary Discretion", description: "Privacy that Bay Hill's membership expects." },
    ],
    ctaTitle: "Champion Your Health at Bay Hill",
    ctaDescription: "Experience the same excellence in healthcare that Bay Hill brings to golf.",
  },

  "golden-oak": {
    slug: "golden-oak",
    name: "Golden Oak",
    tagline: "Serving Disney's Most Exclusive Community",
    heroTitle: "Golden Oak Ultra-Luxury Mobile Lab",
    heroDescription: "Exclusive mobile phlebotomy for Golden Oak at Walt Disney World residents. Disney's magic meets luxury healthcare at your resort home.",
    badgeText: "Serving Disney's Most Exclusive Community",
    badgeColor: "from-purple-100 to-purple-50 border-purple-200 text-purple-800",
    seo: {
      title: "Golden Oak Disney Mobile Lab | Luxury Resort Blood Work | ConveLabs | 941-527-9169",
      description: "Exclusive Mobile Lab Services for Golden Oak at Walt Disney World. Ultra-luxury blood work for Disney's most prestigious neighborhood.",
      keywords: "mobile lab services Golden Oak Disney, luxury phlebotomy Four Seasons Orlando, VIP blood work Disney Golden Oak",
      canonicalPath: "/golden-oak",
      ogImage: "https://convelabs.com/golden-oak-disney-mobile-lab.jpg",
    },
    geo: { latitude: 28.3844, longitude: -81.5707, postalCode: "34747" },
    trustSignals: [
      { title: "Disney-Fast Service", description: "Magical convenience on your schedule" },
      { title: "Resort-Grade Standards", description: "Disney-quality excellence guaranteed" },
      { title: "VIP Club Service", description: "Ultra-exclusive member experience" },
    ],
    specialServices: [
      {
        title: "Disney Resort Community",
        description: "Mobile lab services for Golden Oak's ultra-exclusive Disney community, Four Seasons guests and club members.",
        features: ["Four Seasons Resort services", "Disney vacation home visits", "Club-level concierge coordination"],
      },
      {
        title: "Ultra-Luxury Estate Services",
        description: "White-glove mobile lab for Golden Oak's multi-million dollar estates with Disney-level service.",
        features: ["Private estate house calls", "Resort-style service delivery", "VIP family health packages"],
      },
    ],
    serviceAreas: [
      { name: "Golden Oak Estates", description: "Ultra-luxury private homes" },
      { name: "Four Seasons Resort", description: "Resort guest services" },
      { name: "Private Club Facilities", description: "Exclusive member amenities" },
    ],
    whyChoose: [
      { title: "Magical Attention to Detail", description: "We anticipate needs and exceed expectations." },
      { title: "Resort-Level Hospitality", description: "Warm hospitality matching Disney standards." },
      { title: "Ultra-Premium Discretion", description: "Complete privacy for Disney's most prestigious community." },
      { title: "Same-Day Results", description: "Rapid delivery that respects your schedule." },
    ],
    ctaTitle: "Experience Disney-Level Healthcare",
    ctaDescription: "Join Golden Oak's elite residents who trust ConveLabs for their health screening needs.",
  },

  "lake-nona": {
    slug: "lake-nona",
    name: "Lake Nona",
    tagline: "Central Florida's Innovation District",
    heroTitle: "Lake Nona Medical City Mobile Lab",
    heroDescription: "Premier mobile phlebotomy for Lake Nona Medical City professionals. Executive blood work for busy medical executives, tech leaders, and innovation district residents.",
    badgeText: "Serving Lake Nona's Innovation District",
    badgeColor: "from-blue-100 to-blue-50 border-blue-200 text-blue-800",
    seo: {
      title: "Lake Nona Medical City Mobile Lab | Innovation District | ConveLabs | 941-527-9169",
      description: "Premier Mobile Lab Services for Lake Nona Medical City. Executive blood work for Central Florida's innovation district professionals.",
      keywords: "mobile lab services Lake Nona Medical City, executive phlebotomy Lake Nona innovation district, VIP blood work Lake Nona",
      canonicalPath: "/lake-nona",
      ogImage: "https://convelabs.com/lake-nona-mobile-lab.jpg",
    },
    geo: { latitude: 28.4158, longitude: -81.3081, postalCode: "32827" },
    trustSignals: [
      { title: "Innovation-Speed Service", description: "Fast results for fast-moving professionals" },
      { title: "Medical-Grade Standards", description: "Meeting Medical City's excellence" },
      { title: "Executive Service", description: "Tailored for busy medical professionals" },
    ],
    specialServices: [
      {
        title: "Medical City Professionals",
        description: "Specialized service for medical executives, physicians, and healthcare leaders in the innovation district.",
        features: ["Medical executive physicals", "Physician peer services", "Innovation campus visits"],
      },
      {
        title: "Town Center & Residential",
        description: "Convenient mobile lab for Lake Nona Town Center businesses and residential communities.",
        features: ["Town Center office visits", "Residential estate calls", "Family health packages"],
      },
    ],
    serviceAreas: [
      { name: "Lake Nona Medical City", description: "Innovation campus" },
      { name: "Lake Nona Town Center", description: "Commercial district" },
      { name: "Laureate Park", description: "Residential community" },
    ],
    whyChoose: [
      { title: "Innovation District Expertise", description: "We understand the pace of Medical City." },
      { title: "Physician-Level Quality", description: "Standards that satisfy medical professionals." },
      { title: "Tech-Forward Service", description: "Digital results and seamless scheduling." },
      { title: "Same-Day Turnaround", description: "Results as fast as your workday demands." },
    ],
    ctaTitle: "Elevate Your Health in Lake Nona",
    ctaDescription: "Join Lake Nona's medical and tech leaders who trust ConveLabs for executive lab services.",
  },

  "doctor-phillips": {
    slug: "doctor-phillips",
    name: "Doctor Phillips",
    tagline: "Serving Dr Phillips' Affluent Community",
    heroTitle: "Executive Mobile Lab Services in Doctor Phillips",
    heroDescription: "Premium mobile phlebotomy for Dr Phillips executives and affluent families. White-glove concierge blood draws at your Bay Hill estate or high-end office.",
    badgeText: "Serving Dr Phillips Community",
    badgeColor: "from-rose-100 to-rose-50 border-rose-200 text-rose-800",
    seo: {
      title: "Luxury Mobile Phlebotomy Dr Phillips | Executive Concierge Lab Services | ConveLabs",
      description: "Dr Phillips' premier luxury mobile phlebotomy for executives and affluent families. White-glove concierge blood draws with same-day results.",
      keywords: "luxury mobile phlebotomy Dr Phillips, executive health screening Bay Hill, VIP mobile blood work Dr Phillips",
      canonicalPath: "/doctor-phillips",
      ogImage: "https://convelabs.com/images/doctor-phillips-mobile-phlebotomy.jpg",
    },
    geo: { latitude: 28.4505, longitude: -81.4948, postalCode: "32819" },
    trustSignals: [
      { title: "Same-Day Available", description: "Emergency and routine appointments available" },
      { title: "Certified & Insured", description: "Licensed professionals with years of experience" },
      { title: "Premium Service", description: "White-glove service for discerning clients" },
    ],
    specialServices: [
      {
        title: "Estate & Home Service",
        description: "Professional phlebotomists come directly to your Dr Phillips residence with ultimate comfort and privacy.",
        features: ["Private home visits", "Family appointments", "Fasting-friendly scheduling"],
      },
      {
        title: "Office & Corporate Visits",
        description: "Efficient blood draws at your Dr Phillips workplace with minimal disruption.",
        features: ["Multi-employee visits", "Corporate wellness", "Flexible scheduling"],
      },
    ],
    serviceAreas: [
      { name: "Dr. Phillips Proper", description: "Full community coverage" },
      { name: "Sand Lake Road Corridor", description: "Business district" },
      { name: "Restaurant Row Area", description: "Commercial and residential" },
    ],
    whyChoose: [
      { title: "Local Expertise", description: "Deep knowledge of Dr Phillips and surrounding areas." },
      { title: "Flexible Hours", description: "Early morning to evening appointments available." },
      { title: "Premium Equipment", description: "Hospital-grade equipment and safety protocols." },
      { title: "Membership Savings", description: "Significant savings with founding member plans." },
    ],
    ctaTitle: "Ready for Premium Service in Dr Phillips?",
    ctaDescription: "Join Dr Phillips residents who've elevated their healthcare with our mobile lab services.",
  },

  orlando: {
    slug: "orlando",
    name: "Orlando",
    tagline: "Central Florida's Premier Mobile Lab",
    heroTitle: "Orlando Mobile Phlebotomy Services",
    heroDescription: "Premium mobile phlebotomy throughout Orlando. Professional at-home and office blood draws in Lake Nona, Baldwin Park, College Park, and surrounding areas.",
    badgeText: "Orlando's Premier Mobile Lab",
    badgeColor: "from-sky-100 to-sky-50 border-sky-200 text-sky-800",
    seo: {
      title: "Orlando Mobile Phlebotomy Services | At-Home Blood Draws | ConveLabs",
      description: "Premium mobile phlebotomy services in Orlando, FL. Professional at-home and office blood draws with same-day appointments.",
      keywords: "Orlando phlebotomy, mobile blood draw Orlando, at-home lab services Orlando, Lake Nona blood draw",
      canonicalPath: "/orlando",
      ogImage: "https://convelabs.com/images/orlando-mobile-phlebotomy.jpg",
    },
    geo: { latitude: 28.5383, longitude: -81.3792, postalCode: "32801" },
    trustSignals: [
      { title: "Same-Day Available", description: "Appointments throughout greater Orlando" },
      { title: "Certified & Insured", description: "Licensed phlebotomists serving Central Florida" },
      { title: "Comprehensive Coverage", description: "Serving all Orlando neighborhoods" },
    ],
    specialServices: [
      {
        title: "At-Home Blood Draws",
        description: "Professional phlebotomists come directly to your Orlando residence for ultimate comfort.",
        features: ["All Orlando neighborhoods", "Early morning fasting", "Family appointments"],
      },
      {
        title: "Office & Corporate Services",
        description: "Efficient blood draws at your Orlando workplace with corporate wellness programs.",
        features: ["Downtown Orlando offices", "Corporate wellness", "Group scheduling"],
      },
    ],
    serviceAreas: [
      { name: "Downtown Orlando", description: "Business district" },
      { name: "Baldwin Park", description: "Residential community" },
      { name: "College Park", description: "Historic neighborhood" },
      { name: "Lake Nona", description: "Innovation district" },
      { name: "Winter Park (nearby)", description: "Adjacent city" },
      { name: "Dr. Phillips (nearby)", description: "Adjacent community" },
    ],
    whyChoose: [
      { title: "Metro-Wide Coverage", description: "Serving all of greater Orlando." },
      { title: "Flexible Scheduling", description: "Early morning to evening, including weekends." },
      { title: "Fast Results", description: "Same-day results for most routine blood work." },
      { title: "Affordable Plans", description: "Membership plans starting with significant savings." },
    ],
    ctaTitle: "Ready to Simplify Your Lab Testing in Orlando?",
    ctaDescription: "Join thousands of Orlando residents who've made lab testing effortless with ConveLabs.",
  },

  "winter-park": {
    slug: "winter-park",
    name: "Winter Park",
    tagline: "60+ Winter Park patients already trust us",
    heroTitle: "Mobile Phlebotomy in Winter Park, FL",
    heroDescription: "A licensed phlebotomist at your door in Winter Park — Park Avenue, Hannibal Square, College Park border, and every 32789 / 32792 address. One-try blood draws, results in 48 hours, same-day appointments, on-time or your visit is free.",
    badgeText: "Winter Park's trusted concierge lab",
    badgeColor: "from-teal-100 to-teal-50 border-teal-200 text-teal-800",
    seo: {
      title: "Mobile Phlebotomy Winter Park FL | At-Home Blood Draw 32789 | ConveLabs",
      description: "60+ Winter Park patients trust ConveLabs for at-home blood draws. Licensed phlebotomist to your door on Park Avenue, Hannibal Square, and across 32789 / 32792. Same-day available · results in 48 hours · recollection guarantee in writing.",
      keywords: "mobile phlebotomy Winter Park FL, blood draw Winter Park, at-home lab services 32789, Park Avenue blood draw, concierge phlebotomist Winter Park, mobile blood test Winter Park, LabCorp alternative Winter Park, mobile phlebotomist 32789",
      canonicalPath: "/locations/winter-park",
      ogImage: "https://convelabs.com/images/winter-park-mobile-phlebotomy.jpg",
    },
    geo: { latitude: 28.5999, longitude: -81.3392, postalCode: "32789" },
    trustSignals: [
      { title: "60+ Winter Park patients served", description: "32789 is our #1 zip by patient count" },
      { title: "Licensed phlebotomist, founder-operated", description: "Nico Jean-Baptiste serves every visit personally or through a licensed teammate" },
      { title: "Recollection guarantee in writing", description: "If we caused it, 100% free. If the reference lab did, 50% off." },
    ],
    specialServices: [
      {
        title: "At-home blood draws on Park Avenue and surrounding neighborhoods",
        description: "Your phlebotomist shows up at your Winter Park home in a 30-minute window. We skip the waiting-room — you drink coffee in your own kitchen while we handle the draw and courier the specimen to your lab of choice.",
        features: [
          "Park Avenue corridor + Hannibal Square",
          "Olde Winter Park, Interlachen, Isle of Sicily",
          "College Park border + 17-92 corridor",
          "Fasting-friendly 6-9 AM weekday windows",
          "Family-member add-ons at one visit",
        ],
      },
      {
        title: "Office-visit draws for Winter Park professionals",
        description: "Law firms, medical practices, and financial advisors on Orange Avenue or New England Avenue — we come to your office, zero disruption, no LabCorp line.",
        features: [
          "Downtown Winter Park offices",
          "Group/corporate wellness programs",
          "HIPAA-compliant, hospital-grade equipment",
          "Before/after-hours scheduling available",
        ],
      },
      {
        title: "Concierge panels for Winter Park's functional-medicine patients",
        description: "Working with your provider at NaturaMed, The Restoration Place, or another Winter Park-area concierge practice? We handle specialty kits — DUTCH, Genova, GI-MAP, hormone panels — with the same day-of prep reminders your doctor prescribes.",
        features: [
          "DUTCH / Genova / GI-MAP specialty kits",
          "Full hormone + thyroid panels",
          "OCR reads your lab order for prep instructions",
          "Direct courier to Quest / LabCorp / AdventHealth / Orlando Health",
        ],
      },
    ],
    serviceAreas: [
      { name: "Park Avenue / downtown Winter Park", description: "Shopping + dining corridor, offices, residential" },
      { name: "Hannibal Square", description: "Historic West Winter Park neighborhood" },
      { name: "Olde Winter Park", description: "Lake Osceola and Rollins College area" },
      { name: "Isle of Sicily", description: "Luxury residential estates" },
      { name: "Interlachen", description: "Private gated community" },
      { name: "Mead Botanical Garden area", description: "Quiet residential enclave" },
      { name: "Winter Park Village", description: "Mixed-use + corporate offices" },
      { name: "College Park border (32804)", description: "Dubsdread / Edgewater corridor" },
    ],
    whyChoose: [
      { title: "We already know your neighborhood", description: "40+ Winter Park patients, 60+ visits. We know the Rollins College area, the Park Avenue one-way grid, and which buildings have tricky parking." },
      { title: "Founder-led, licensed phlebotomist", description: "Nico Jean-Baptiste has 15+ years of experience, 20,000+ patients served. Not a gig-economy contractor." },
      { title: "Your time is worth protecting", description: "A Winter Park LabCorp visit runs 45-90 minutes with wait times. Our visit takes 15 minutes, in your kitchen, on your schedule." },
      { title: "The written recollection guarantee", description: "If ConveLabs caused the issue: 100% free redraw. If the reference lab caused it: 50% off. In writing. No one else in Florida does this." },
    ],
    ctaTitle: "Book your Winter Park blood draw — same day or next-day available",
    ctaDescription: "Join 60+ Winter Park professionals who've stopped driving to LabCorp. Text (941) 527-9169 or book online in 90 seconds.",
    nearbyCities: ["orlando", "maitland", "lake-mary", "longwood"],
  },

  celebration: {
    slug: "celebration",
    name: "Celebration",
    tagline: "Serving Disney's Celebration Community",
    heroTitle: "Celebration Mobile Phlebotomy Services",
    heroDescription: "Premium mobile phlebotomy in Celebration, FL. Professional at-home blood draws in Disney's Celebration community with same-day appointments.",
    badgeText: "Serving Celebration Community",
    badgeColor: "from-indigo-100 to-indigo-50 border-indigo-200 text-indigo-800",
    seo: {
      title: "Celebration Mobile Phlebotomy Services | At-Home Blood Draws | ConveLabs",
      description: "Premium mobile phlebotomy services in Celebration, FL. Professional at-home blood draws in Disney's Celebration community.",
      keywords: "Celebration phlebotomy, mobile blood draw Celebration, Disney Celebration blood draw, mobile lab services",
      canonicalPath: "/celebration",
      ogImage: "https://convelabs.com/images/celebration-mobile-phlebotomy.jpg",
    },
    geo: { latitude: 28.3253, longitude: -81.5339, postalCode: "34747" },
    trustSignals: [
      { title: "Same-Day Available", description: "Appointments throughout Celebration" },
      { title: "Certified & Insured", description: "Licensed professionals you can trust" },
      { title: "Community Focused", description: "Dedicated service for Celebration residents" },
    ],
    specialServices: [
      {
        title: "At-Home Blood Draws",
        description: "Professional phlebotomists come to your Celebration home for a comfortable, private experience.",
        features: ["All Celebration neighborhoods", "Fasting appointments", "Family coverage"],
      },
      {
        title: "Vacation Home Services",
        description: "Convenient mobile lab for Celebration vacation homeowners and seasonal residents.",
        features: ["Vacation home visits", "Flexible scheduling", "Seasonal resident packages"],
      },
    ],
    serviceAreas: [
      { name: "Celebration Village", description: "Town center area" },
      { name: "North Village", description: "Residential community" },
      { name: "South Village", description: "Residential community" },
    ],
    whyChoose: [
      { title: "Community Knowledge", description: "We know Celebration's layout and access points." },
      { title: "Disney-Adjacent Service", description: "Convenient for vacation home owners." },
      { title: "Flexible Scheduling", description: "Accommodating seasonal residents." },
      { title: "Quality Assurance", description: "Hospital-grade equipment and safety protocols." },
    ],
    ctaTitle: "Ready for Premium Service in Celebration?",
    ctaDescription: "Join Celebration residents who've simplified their lab testing with ConveLabs.",
  },

  "heathrow-golf": {
    slug: "heathrow-golf",
    name: "Heathrow Golf",
    tagline: "Serving Heathrow's Aviation & Golf Community",
    heroTitle: "Heathrow Golf Executive Mobile Lab",
    heroDescription: "Executive mobile phlebotomy for Heathrow Golf & Country Club and aviation community. First-class healthcare for pilots, aviation executives, and golf professionals.",
    badgeText: "Serving Heathrow's Executive Community",
    badgeColor: "from-slate-100 to-slate-50 border-slate-200 text-slate-800",
    seo: {
      title: "Heathrow Golf Mobile Lab | Executive Aviation Community | ConveLabs | 941-527-9169",
      description: "Elite Mobile Lab Services for Heathrow Golf & Country Club. Executive blood work for Central Florida's aviation community.",
      keywords: "mobile lab services Heathrow Golf Country Club, executive phlebotomy Heathrow aviation community, VIP blood work Heathrow",
      canonicalPath: "/heathrow-golf",
      ogImage: "https://convelabs.com/heathrow-golf-mobile-lab.jpg",
    },
    geo: { latitude: 28.7645, longitude: -81.3748, postalCode: "32746" },
    trustSignals: [
      { title: "Aviation-Ready", description: "FAA-compatible health screening" },
      { title: "Championship Standards", description: "Golf club-level service quality" },
      { title: "Executive Service", description: "Tailored for aviation professionals" },
    ],
    specialServices: [
      {
        title: "Aviation Community Services",
        description: "Specialized lab services for pilots, aviation executives, and frequent travelers needing rapid health clearances.",
        features: ["Pilot health screenings", "Aviation executive physicals", "Travel-ready results"],
      },
      {
        title: "Golf Club Services",
        description: "Mobile lab services for Heathrow Golf & Country Club members with convenient on-site scheduling.",
        features: ["Club member services", "Pre-round health checks", "Tournament-day availability"],
      },
    ],
    serviceAreas: [
      { name: "Heathrow Golf & Country Club", description: "Full club coverage" },
      { name: "Heathrow Residential", description: "Community homes" },
      { name: "Colonial TownPark", description: "Adjacent community" },
    ],
    whyChoose: [
      { title: "Aviation Expertise", description: "Understanding pilot and crew health requirements." },
      { title: "Club-Level Quality", description: "Service matching country club standards." },
      { title: "Rapid Turnaround", description: "Results aligned with travel schedules." },
      { title: "Executive Discretion", description: "Complete confidentiality for all clients." },
    ],
    ctaTitle: "Elevate Your Healthcare Experience",
    ctaDescription: "Join Heathrow's aviation and golf professionals who trust ConveLabs for executive-level mobile lab services.",
  },

  "lake-mary": {
    slug: "lake-mary",
    name: "Lake Mary",
    tagline: "Serving Lake Mary & Heathrow",
    heroTitle: "Mobile Blood Draw in Lake Mary, FL",
    heroDescription: "Professional mobile phlebotomy in Lake Mary. Licensed phlebotomists come to your home or office for convenient blood draws with same-day appointments.",
    badgeText: "Serving Lake Mary & Seminole County",
    badgeColor: "from-emerald-100 to-emerald-50 border-emerald-200 text-emerald-800",
    seo: {
      title: "Mobile Blood Draw Lake Mary FL | At-Home Phlebotomy | ConveLabs",
      description: "Mobile blood draw in Lake Mary, FL. Licensed phlebotomists come to your home or office. Same-day appointments. Starting at $125.",
      keywords: "mobile blood draw Lake Mary, at-home phlebotomy Lake Mary FL, mobile phlebotomist Lake Mary",
      canonicalPath: "/lake-mary",
      ogImage: "https://convelabs.com/images/lake-mary-mobile-phlebotomy.jpg",
    },
    geo: { latitude: 28.7589, longitude: -81.3178, postalCode: "32746" },
    trustSignals: [
      { title: "Same-Day Available", description: "Appointments throughout Lake Mary" },
      { title: "Certified & Insured", description: "Licensed phlebotomists you can trust" },
      { title: "Convenient Service", description: "We come to your home or office" },
    ],
    specialServices: [
      {
        title: "At-Home Blood Draws",
        description: "Professional phlebotomists come directly to your Lake Mary home for a comfortable experience.",
        features: ["All Lake Mary neighborhoods", "Early morning fasting", "Family appointments"],
      },
      {
        title: "Office & Corporate Services",
        description: "Efficient blood draws at your Lake Mary workplace or corporate office.",
        features: ["Corporate wellness programs", "Multi-employee visits", "Flexible scheduling"],
      },
    ],
    serviceAreas: [
      { name: "Lake Mary Proper", description: "Full community coverage" },
      { name: "Heathrow", description: "Adjacent community" },
      { name: "Colonial TownPark", description: "Mixed-use community" },
    ],
    whyChoose: [
      { title: "Local Coverage", description: "Deep knowledge of Lake Mary and Seminole County." },
      { title: "Flexible Hours", description: "Early morning to evening appointments." },
      { title: "Fast Results", description: "Specimen delivery confirmation sent with your lab-generated tracking ID." },
      { title: "Affordable", description: "Starting at $125 with membership savings available." },
    ],
    ctaTitle: "Book a Mobile Blood Draw in Lake Mary",
    ctaDescription: "Join Lake Mary residents who've simplified their lab testing with ConveLabs.",
  },

  reunion: {
    slug: "reunion",
    name: "Reunion",
    tagline: "Serving Reunion Resort & Community",
    heroTitle: "Mobile Blood Draw in Reunion, FL",
    heroDescription: "Professional mobile phlebotomy for Reunion Resort residents and vacation homeowners. Convenient at-home blood draws with same-day scheduling.",
    badgeText: "Serving Reunion Resort Community",
    badgeColor: "from-violet-100 to-violet-50 border-violet-200 text-violet-800",
    seo: {
      title: "Mobile Blood Draw Reunion FL | At-Home Phlebotomy | ConveLabs",
      description: "Mobile blood draw in Reunion, FL. Licensed phlebotomists come to your resort home. Same-day appointments. Starting at $125.",
      keywords: "mobile blood draw Reunion FL, at-home phlebotomy Reunion resort, mobile phlebotomist Reunion",
      canonicalPath: "/reunion",
      ogImage: "https://convelabs.com/images/reunion-mobile-phlebotomy.jpg",
    },
    geo: { latitude: 28.3106, longitude: -81.5879, postalCode: "34747" },
    trustSignals: [
      { title: "Same-Day Available", description: "Appointments throughout Reunion" },
      { title: "Certified & Insured", description: "Licensed professionals you can trust" },
      { title: "Resort-Friendly", description: "Serving vacation homes and resort properties" },
    ],
    specialServices: [
      {
        title: "Resort Home Visits",
        description: "Mobile phlebotomy at your Reunion vacation home or rental property.",
        features: ["Vacation home visits", "Seasonal resident coverage", "Flexible scheduling"],
      },
      {
        title: "Residential Services",
        description: "Convenient blood draws for Reunion's year-round residents.",
        features: ["All Reunion neighborhoods", "Family appointments", "Fasting-friendly times"],
      },
    ],
    serviceAreas: [
      { name: "Reunion Resort", description: "Full resort coverage" },
      { name: "Reunion Village", description: "Residential community" },
      { name: "Champions Gate (nearby)", description: "Adjacent area" },
    ],
    whyChoose: [
      { title: "Resort Expertise", description: "We know Reunion's layout and access." },
      { title: "Flexible Scheduling", description: "Perfect for seasonal and vacation residents." },
      { title: "Fast Results", description: "Specimen delivery confirmation sent with your lab-generated tracking ID." },
      { title: "No Hassle", description: "Skip the clinic — we come to you." },
    ],
    ctaTitle: "Book a Mobile Blood Draw in Reunion",
    ctaDescription: "Convenient lab testing for Reunion residents and vacation homeowners.",
  },

  "altamonte-springs": {
    slug: "altamonte-springs",
    name: "Altamonte Springs",
    tagline: "Serving Altamonte Springs & Surrounding Areas",
    heroTitle: "Mobile Blood Draw in Altamonte Springs, FL",
    heroDescription: "Professional mobile phlebotomy in Altamonte Springs. Licensed phlebotomists come to your home or office for convenient blood draws.",
    badgeText: "Serving Altamonte Springs",
    badgeColor: "from-cyan-100 to-cyan-50 border-cyan-200 text-cyan-800",
    seo: {
      title: "Mobile Blood Draw Altamonte Springs FL | At-Home Phlebotomy | ConveLabs",
      description: "Mobile blood draw in Altamonte Springs, FL. Licensed phlebotomists come to you. Same-day appointments. Starting at $125.",
      keywords: "mobile blood draw Altamonte Springs, at-home phlebotomy Altamonte Springs FL, mobile phlebotomist Altamonte",
      canonicalPath: "/altamonte-springs",
      ogImage: "https://convelabs.com/images/altamonte-springs-mobile-phlebotomy.jpg",
    },
    geo: { latitude: 28.6612, longitude: -81.3656, postalCode: "32701" },
    trustSignals: [
      { title: "Same-Day Available", description: "Appointments throughout Altamonte Springs" },
      { title: "Certified & Insured", description: "Licensed phlebotomists you can trust" },
      { title: "Convenient", description: "We come to your home or office" },
    ],
    specialServices: [
      {
        title: "At-Home Blood Draws",
        description: "Professional phlebotomists come to your Altamonte Springs home.",
        features: ["All neighborhoods covered", "Early morning fasting", "Family appointments"],
      },
      {
        title: "Office Services",
        description: "Efficient blood draws at your Altamonte Springs workplace.",
        features: ["Corporate wellness", "Group scheduling", "Minimal disruption"],
      },
    ],
    serviceAreas: [
      { name: "Altamonte Springs", description: "Full city coverage" },
      { name: "Altamonte Mall Area", description: "Commercial district" },
      { name: "Spring Oaks", description: "Residential community" },
    ],
    whyChoose: [
      { title: "Full Coverage", description: "Serving all of Altamonte Springs." },
      { title: "Flexible Hours", description: "Early morning to evening appointments." },
      { title: "Fast Results", description: "Specimen delivery confirmation sent with your lab-generated tracking ID." },
      { title: "Affordable", description: "Starting at $125 per visit." },
    ],
    ctaTitle: "Book a Mobile Blood Draw in Altamonte Springs",
    ctaDescription: "Skip the clinic. Get your blood drawn at home in Altamonte Springs.",
  },

  kissimmee: {
    slug: "kissimmee",
    name: "Kissimmee",
    tagline: "Serving Kissimmee & Osceola County",
    heroTitle: "Mobile Blood Draw in Kissimmee, FL",
    heroDescription: "Professional mobile phlebotomy in Kissimmee and Osceola County. Licensed phlebotomists come to your home for convenient blood draws.",
    badgeText: "Serving Kissimmee & Osceola County",
    badgeColor: "from-orange-100 to-orange-50 border-orange-200 text-orange-800",
    seo: {
      title: "Mobile Blood Draw Kissimmee FL | At-Home Phlebotomy | ConveLabs",
      description: "Mobile blood draw in Kissimmee, FL. Licensed phlebotomists come to your home. Same-day appointments. Starting at $125.",
      keywords: "mobile blood draw Kissimmee, at-home phlebotomy Kissimmee FL, mobile phlebotomist Kissimmee Osceola",
      canonicalPath: "/kissimmee",
      ogImage: "https://convelabs.com/images/kissimmee-mobile-phlebotomy.jpg",
    },
    geo: { latitude: 28.2920, longitude: -81.4076, postalCode: "34741" },
    trustSignals: [
      { title: "Same-Day Available", description: "Appointments throughout Kissimmee" },
      { title: "Certified & Insured", description: "Licensed professionals you can trust" },
      { title: "Wide Coverage", description: "Serving all of Osceola County" },
    ],
    specialServices: [
      {
        title: "At-Home Blood Draws",
        description: "Professional phlebotomists come directly to your Kissimmee home.",
        features: ["All Kissimmee neighborhoods", "Fasting appointments", "Family coverage"],
      },
      {
        title: "Tourist & Vacation Services",
        description: "Mobile phlebotomy for vacation rental guests and seasonal visitors.",
        features: ["Vacation rental visits", "Hotel visits", "Flexible scheduling"],
      },
    ],
    serviceAreas: [
      { name: "Downtown Kissimmee", description: "City center" },
      { name: "Poinciana", description: "Southern community" },
      { name: "St. Cloud (nearby)", description: "Adjacent city" },
    ],
    whyChoose: [
      { title: "Osceola Coverage", description: "Serving all of Kissimmee and surrounding areas." },
      { title: "Flexible Hours", description: "Morning to evening appointments available." },
      { title: "Fast Results", description: "Specimen delivery confirmation sent with your lab-generated tracking ID." },
      { title: "No Hidden Fees", description: "Transparent pricing starting at $125." },
    ],
    ctaTitle: "Book a Mobile Blood Draw in Kissimmee",
    ctaDescription: "Convenient at-home lab testing for Kissimmee and Osceola County residents.",
  },

  sanford: {
    slug: "sanford",
    name: "Sanford",
    tagline: "Serving Sanford & North Seminole County",
    heroTitle: "Mobile Blood Draw in Sanford, FL",
    heroDescription: "Professional mobile phlebotomy in Sanford. Licensed phlebotomists come to your home or office for convenient, same-day blood draws.",
    badgeText: "Serving Sanford & Seminole County",
    badgeColor: "from-lime-100 to-lime-50 border-lime-200 text-lime-800",
    seo: {
      title: "Mobile Blood Draw Sanford FL | At-Home Phlebotomy | ConveLabs",
      description: "Mobile blood draw in Sanford, FL. Licensed phlebotomists come to your home. Same-day appointments. Starting at $125.",
      keywords: "mobile blood draw Sanford, at-home phlebotomy Sanford FL, mobile phlebotomist Sanford",
      canonicalPath: "/sanford",
      ogImage: "https://convelabs.com/images/sanford-mobile-phlebotomy.jpg",
    },
    geo: { latitude: 28.8003, longitude: -81.2732, postalCode: "32771" },
    trustSignals: [
      { title: "Same-Day Available", description: "Appointments throughout Sanford" },
      { title: "Certified & Insured", description: "Licensed phlebotomists" },
      { title: "Convenient", description: "We come to your home or office" },
    ],
    specialServices: [
      {
        title: "At-Home Blood Draws",
        description: "Professional phlebotomists come to your Sanford home.",
        features: ["All Sanford neighborhoods", "Early morning fasting", "Family appointments"],
      },
      {
        title: "Office & Corporate",
        description: "Mobile phlebotomy at your Sanford workplace.",
        features: ["Corporate wellness", "Multi-employee visits", "Flexible scheduling"],
      },
    ],
    serviceAreas: [
      { name: "Downtown Sanford", description: "Historic district" },
      { name: "Sanford/Orlando Airport Area", description: "Commercial district" },
      { name: "Debary (nearby)", description: "Adjacent community" },
    ],
    whyChoose: [
      { title: "North Seminole Coverage", description: "Serving Sanford and surrounding areas." },
      { title: "Flexible Hours", description: "Early morning to evening appointments." },
      { title: "Fast Results", description: "Specimen delivery confirmation sent with your lab-generated tracking ID." },
      { title: "Affordable", description: "Starting at $125 per visit." },
    ],
    ctaTitle: "Book a Mobile Blood Draw in Sanford",
    ctaDescription: "Skip the clinic. Get your blood drawn at home in Sanford.",
  },

  clermont: {
    slug: "clermont",
    name: "Clermont",
    tagline: "Serving Clermont & South Lake County",
    heroTitle: "Mobile Blood Draw in Clermont, FL",
    heroDescription: "Professional mobile phlebotomy in Clermont and South Lake County. Licensed phlebotomists come to your home for convenient blood draws.",
    badgeText: "Serving Clermont & Lake County",
    badgeColor: "from-amber-100 to-amber-50 border-amber-200 text-amber-800",
    seo: {
      title: "Mobile Blood Draw Clermont FL | At-Home Phlebotomy | ConveLabs",
      description: "Mobile blood draw in Clermont, FL. Licensed phlebotomists come to your home. Same-day appointments available. Starting at $125.",
      keywords: "mobile blood draw Clermont, at-home phlebotomy Clermont FL, mobile phlebotomist Clermont Lake County",
      canonicalPath: "/clermont",
      ogImage: "https://convelabs.com/images/clermont-mobile-phlebotomy.jpg",
    },
    geo: { latitude: 28.5494, longitude: -81.7729, postalCode: "34711" },
    trustSignals: [
      { title: "Same-Day Available", description: "Appointments in Clermont area" },
      { title: "Certified & Insured", description: "Licensed professionals" },
      { title: "Convenient", description: "We come to your home" },
    ],
    specialServices: [
      {
        title: "At-Home Blood Draws",
        description: "Professional phlebotomists come to your Clermont home.",
        features: ["All Clermont neighborhoods", "Fasting appointments", "Family coverage"],
      },
      {
        title: "Active Lifestyle Services",
        description: "Mobile phlebotomy for Clermont's active community — athletes, cyclists, and fitness enthusiasts.",
        features: ["Sports health panels", "Hormone testing", "Performance monitoring"],
      },
    ],
    serviceAreas: [
      { name: "Clermont Proper", description: "Full city coverage" },
      { name: "Minneola", description: "Adjacent community" },
      { name: "Groveland (nearby)", description: "Surrounding area" },
    ],
    whyChoose: [
      { title: "Lake County Coverage", description: "Serving Clermont and surrounding areas." },
      { title: "Flexible Scheduling", description: "Morning to evening appointments." },
      { title: "Fast Results", description: "Specimen delivery confirmation sent with your lab-generated tracking ID." },
      { title: "No Hidden Fees", description: "Transparent pricing from $125." },
    ],
    ctaTitle: "Book a Mobile Blood Draw in Clermont",
    ctaDescription: "Convenient at-home lab testing for Clermont and Lake County residents.",
  },

  oviedo: {
    slug: "oviedo",
    name: "Oviedo",
    tagline: "Serving Oviedo & East Seminole County",
    heroTitle: "Mobile Blood Draw in Oviedo, FL",
    heroDescription: "Professional mobile phlebotomy in Oviedo. Licensed phlebotomists come to your home or office for convenient blood draws with same-day availability.",
    badgeText: "Serving Oviedo & East Seminole",
    badgeColor: "from-teal-100 to-teal-50 border-teal-200 text-teal-800",
    seo: {
      title: "Mobile Blood Draw Oviedo FL | At-Home Phlebotomy | ConveLabs",
      description: "Mobile blood draw in Oviedo, FL. Licensed phlebotomists come to your home. Same-day appointments. Starting at $125.",
      keywords: "mobile blood draw Oviedo, at-home phlebotomy Oviedo FL, mobile phlebotomist Oviedo",
      canonicalPath: "/oviedo",
      ogImage: "https://convelabs.com/images/oviedo-mobile-phlebotomy.jpg",
    },
    geo: { latitude: 28.6700, longitude: -81.2081, postalCode: "32765" },
    trustSignals: [
      { title: "Same-Day Available", description: "Appointments throughout Oviedo" },
      { title: "Certified & Insured", description: "Licensed phlebotomists" },
      { title: "Family Friendly", description: "Serving Oviedo families" },
    ],
    specialServices: [
      {
        title: "At-Home Blood Draws",
        description: "Professional phlebotomists come to your Oviedo home.",
        features: ["All Oviedo neighborhoods", "Early morning fasting", "Family appointments"],
      },
      {
        title: "UCF Area Services",
        description: "Convenient mobile phlebotomy near University of Central Florida.",
        features: ["UCF area coverage", "Student-friendly scheduling", "Affordable pricing"],
      },
    ],
    serviceAreas: [
      { name: "Oviedo Proper", description: "Full city coverage" },
      { name: "Oviedo on the Park", description: "Town center" },
      { name: "Winter Springs (nearby)", description: "Adjacent community" },
    ],
    whyChoose: [
      { title: "East Seminole Coverage", description: "Serving Oviedo and Winter Springs." },
      { title: "Family Friendly", description: "Multi-patient appointments available." },
      { title: "Fast Results", description: "Specimen delivery confirmation sent with your lab-generated tracking ID." },
      { title: "Affordable", description: "Starting at $125 per visit." },
    ],
    ctaTitle: "Book a Mobile Blood Draw in Oviedo",
    ctaDescription: "Skip the clinic. Get your blood drawn at home in Oviedo.",
  },

  maitland: {
    slug: "maitland",
    name: "Maitland",
    tagline: "Serving Maitland & Central Orange County",
    heroTitle: "Mobile Blood Draw in Maitland, FL",
    heroDescription: "Professional mobile phlebotomy in Maitland. Licensed phlebotomists come to your home or office for convenient, same-day blood draws.",
    badgeText: "Serving Maitland Community",
    badgeColor: "from-sky-100 to-sky-50 border-sky-200 text-sky-800",
    seo: {
      title: "Mobile Blood Draw Maitland FL | At-Home Phlebotomy | ConveLabs",
      description: "Mobile blood draw in Maitland, FL. Licensed phlebotomists come to your home. Same-day appointments. Starting at $125.",
      keywords: "mobile blood draw Maitland, at-home phlebotomy Maitland FL, mobile phlebotomist Maitland",
      canonicalPath: "/maitland",
      ogImage: "https://convelabs.com/images/maitland-mobile-phlebotomy.jpg",
    },
    geo: { latitude: 28.6275, longitude: -81.3631, postalCode: "32751" },
    trustSignals: [
      { title: "Same-Day Available", description: "Appointments throughout Maitland" },
      { title: "Certified & Insured", description: "Licensed professionals" },
      { title: "Convenient", description: "Home and office visits" },
    ],
    specialServices: [
      {
        title: "At-Home Blood Draws",
        description: "Professional phlebotomists come to your Maitland home.",
        features: ["All Maitland neighborhoods", "Fasting appointments", "Family coverage"],
      },
      {
        title: "Office & Business Park Services",
        description: "Mobile phlebotomy at Maitland Center and surrounding business parks.",
        features: ["Maitland Center offices", "Corporate wellness", "Multi-employee scheduling"],
      },
    ],
    serviceAreas: [
      { name: "Maitland Proper", description: "Full city coverage" },
      { name: "Maitland Center", description: "Business district" },
      { name: "Dommerich (nearby)", description: "Residential area" },
    ],
    whyChoose: [
      { title: "Central Location", description: "Conveniently located between Orlando and Winter Park." },
      { title: "Business District Coverage", description: "Serving Maitland Center offices." },
      { title: "Fast Results", description: "Specimen delivery confirmation sent with your lab-generated tracking ID." },
      { title: "Transparent Pricing", description: "From $55 office / $150 mobile. Members save 15-25%." },
    ],
    ctaTitle: "Book a Mobile Blood Draw in Maitland",
    ctaDescription: "Convenient at-home lab testing for Maitland residents and professionals.",
  },
};

export const getLocationBySlug = (slug: string): LocationData | undefined => {
  return locations[slug];
};

export const getAllLocationSlugs = (): string[] => {
  return Object.keys(locations);
};

// Nearby cities map for internal linking
export const NEARBY_CITIES: Record<string, string[]> = {
  'windermere': ['doctor-phillips', 'bay-hill', 'isleworth', 'golden-oak', 'orlando'],
  'isleworth': ['windermere', 'bay-hill', 'doctor-phillips', 'golden-oak'],
  'bay-hill': ['doctor-phillips', 'windermere', 'isleworth', 'orlando'],
  'golden-oak': ['celebration', 'lake-nona', 'windermere', 'kissimmee'],
  'lake-nona': ['orlando', 'celebration', 'kissimmee', 'golden-oak'],
  'doctor-phillips': ['windermere', 'bay-hill', 'orlando', 'winter-park'],
  'orlando': ['winter-park', 'doctor-phillips', 'maitland', 'altamonte-springs', 'lake-nona'],
  'winter-park': ['orlando', 'maitland', 'oviedo', 'altamonte-springs'],
  'celebration': ['kissimmee', 'golden-oak', 'lake-nona', 'reunion'],
  'heathrow-golf': ['lake-mary', 'sanford', 'altamonte-springs', 'oviedo'],
  'lake-mary': ['heathrow-golf', 'sanford', 'altamonte-springs', 'maitland'],
  'reunion': ['celebration', 'kissimmee', 'clermont', 'golden-oak'],
  'altamonte-springs': ['maitland', 'winter-park', 'orlando', 'lake-mary'],
  'kissimmee': ['celebration', 'reunion', 'lake-nona', 'orlando'],
  'sanford': ['lake-mary', 'heathrow-golf', 'oviedo', 'altamonte-springs'],
  'clermont': ['windermere', 'reunion', 'winter-park'],
  'maitland': ['winter-park', 'altamonte-springs', 'orlando', 'lake-mary'],
  'oviedo': ['winter-park', 'sanford', 'lake-mary', 'orlando'],
};

export function getNearbyCities(slug: string): { slug: string; name: string }[] {
  const nearby = NEARBY_CITIES[slug] || [];
  return nearby
    .map(s => locations[s] ? { slug: s, name: locations[s].name } : null)
    .filter(Boolean) as { slug: string; name: string }[];
}

// Generate city-specific FAQs dynamically
export function getLocationFAQs(location: LocationData): { question: string; answer: string }[] {
  const name = location.name;
  return [
    {
      question: `How much does mobile phlebotomy cost in ${name}?`,
      answer: `Mobile blood draws in ${name} start at $150 per visit. Office visits are $55. Senior patients (65+) pay $100. Members save 15-25% on all services. Additional patients at the same location are $75 each.`,
    },
    {
      question: `Is same-day mobile phlebotomy available in ${name}?`,
      answer: `Yes! ConveLabs offers same-day appointments in ${name} when available. STAT/same-day appointments have a $100 surcharge. Our operating hours are Monday-Friday 6 AM - 1:30 PM, with Saturday appointments available for members.`,
    },
    {
      question: `What areas in ${name} do you serve?`,
      answer: `We serve all of ${name} and surrounding neighborhoods including ${location.serviceAreas.map(a => a.name).join(', ')}. Our licensed phlebotomists come to your home, office, or hotel.`,
    },
    {
      question: `Do I need a doctor's order for blood work in ${name}?`,
      answer: `For most lab tests, yes — a doctor's lab order is required. You can upload your lab order during booking, or we can retrieve it from your doctor's office via fax.`,
    },
    {
      question: `How quickly do I get results from a blood draw in ${name}?`,
      answer: `Once your specimens are delivered to the lab, we send you a confirmation text and email with your lab-generated tracking ID. Results are available through your lab's patient portal (LabCorp, Quest Diagnostics, AdventHealth, or Orlando Health). We deliver your samples directly to the lab of your choice.`,
    },
    {
      question: `Are ConveLabs phlebotomists licensed in ${name}?`,
      answer: `Absolutely. All ConveLabs phlebotomists are licensed, certified, insured, and background-checked. We maintain HIPAA compliance and use hospital-grade equipment for every blood draw.`,
    },
  ];
}
