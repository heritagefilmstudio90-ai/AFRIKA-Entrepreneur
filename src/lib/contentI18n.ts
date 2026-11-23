import type {
  AppNotification,
  BusinessEvent,
  BusinessOpportunity,
  DirectoryEntry,
  DiscussionGroup,
  EnterprisePage,
  ProfessionalNetwork,
  ProfessionalProfile,
} from '../types/domain';
import type { AppLanguage } from './i18n';

const CITY_EN: Record<string, string> = {
  Montréal: 'Montreal',
  Londres: 'London',
  Dubaï: 'Dubai',
  'Addis-Abeba': 'Addis Ababa',
  'Le Cap': 'Cape Town',
  Bruxelles: 'Brussels',
  Genève: 'Geneva',
  Pékin: 'Beijing',
  Alger: 'Algiers',
  'Le Caire': 'Cairo',
  Singapour: 'Singapore',
  Séoul: 'Seoul',
  'São Paulo': 'Sao Paulo',
  Lisbonne: 'Lisbon',
  Copenhague: 'Copenhagen',
  Varsovie: 'Warsaw',
  Vienne: 'Vienna',
  Athènes: 'Athens',
  Milan: 'Milan',
  Rome: 'Rome',
  Barcelone: 'Barcelona',
  Francfort: 'Frankfurt',
  Munich: 'Munich',
  LaHay: 'The Hague',
  'La Haye': 'The Hague',
  Riyad: 'Riyadh',
  Koweït: 'Kuwait City',
  Beyrouth: 'Beirut',
  'New Delhi': 'New Delhi',
  Bombay: 'Mumbai',
  Téhéran: 'Tehran',
  Moscou: 'Moscow',
  'En ligne': 'Online',
};

export function localizeCity(city: string, lang: AppLanguage): string {
  if (!city || lang === 'fr') return city;
  return CITY_EN[city] || city;
}

interface EventEnTranslation {
  organizerName?: string;
  title: string;
  publicSummary: string;
  fullDescription: string;
  venueAddress?: string;
  highlights: string[];
}

const EVENT_EN: Record<string, EventEnTranslation> = {
  'evt-dakar': {
    organizerName: 'Africa Entrepreneur · Summits',
    title: 'Dakar Business Summit 2026',
    publicSummary:
      'Annual gathering of Fintech founders, diaspora investors, and West African financial institutions.',
    fullDescription:
      'Two days of closed-door roundtables, 1-on-1 deal-room meetings between Series A founders and diaspora funds, and workshops on WAEMU payment interoperability. Includes investor lounge access and the executive dinner on the Corniche.',
    venueAddress: 'Corniche Ouest Pavilion, Route des Almadies, Dakar',
    highlights: [
      '18 active Africa & Europe investment funds attending',
      'Pre-scheduled 15-minute private pitch sessions',
      'Simultaneous French / English interpretation included',
    ],
  },
  'evt-paris': {
    organizerName: 'Europe Diaspora Circle',
    title: 'Paris Executive Diaspora Forum',
    publicSummary:
      'Executive evening connecting European diaspora leaders with industrial and high-growth venture founders.',
    fullDescription:
      'Strategic forum bringing together 80 decision-makers, SME executives, and angel investors across Paris, Brussels, and London. Focused on industrial co-investment, decentralized energy, and Africa-Europe supply chains.',
    venueAddress: 'Salon Haussmann Panorama, 42 Boulevard Haussmann, 75009 Paris',
    highlights: [
      'Sector-matched introductions curated prior to the forum',
      'Executive cocktail reception & showcase of 6 vetted ventures',
    ],
  },
  'evt-lagos': {
    organizerName: 'Alara Venture Studio',
    title: 'Lagos Fintech & Venture Studio Day',
    publicSummary:
      'Hands-on immersion inside the Lagos Fintech ecosystem: payments, SME credit, and Francophone expansion.',
    fullDescription:
      'Full-day program focused on technology and commercial bridges between Nigeria and WAEMU/CEMAC markets. Live product demos, regulatory reviews, and direct meetings with Alara Studio product leads.',
    venueAddress: 'Alara Studio, Victoria Island, Plot 14 Adeola Odeku, Lagos',
    highlights: [
      'Roundtable on Lagos → Abidjan & Dakar market expansion',
      'API architecture & cross-border compliance clinic',
    ],
  },
  'evt-abidjan': {
    organizerName: 'CI Agribusiness Network',
    title: 'Abidjan AgriTech & Export Connect',
    publicSummary:
      'Operational webinar on agricultural value-chain financing and local processing in Côte d’Ivoire.',
    fullDescription:
      'Interactive online session featuring cocoa and cashew processing operators, solar agri-equipment suppliers, and European commodity buyers.',
    venueAddress: 'Online (encrypted room link provided to confirmed attendees)',
    highlights: [
      'Direct sourcing contracts with European buyers',
      'Encrypted replay available for 30 days for registered members',
    ],
  },
  'evt-kigali': {
    organizerName: 'Kigali Innovation Alliance',
    title: 'Kigali DeepTech & Cloud Africa Forum',
    publicSummary:
      'Gathering of Tech founders, SaaS builders, and AI engineers from East Africa and the global diaspora.',
    fullDescription:
      'Sovereign cloud architecture workshops, data sovereignty briefings, live product demos, and B2B meetings with system integrators across Rwanda, Kenya, and Canada.',
    venueAddress: 'Kigali Innovation City, Special Economic Zone, Kigali',
    highlights: [
      'Low-bandwidth AI & SaaS deployments across Africa',
      'Kigali ↔ Montreal technical partner matchmaking',
    ],
  },
  'evt-nairobi': {
    organizerName: 'East Africa Agribusiness Hub',
    title: 'Nairobi Sustainable Agriculture & Cold-Chain Summit',
    publicSummary:
      'Climate-smart farming solutions, solar cold-chain logistics, and cooperative trade financing.',
    fullDescription:
      'Connect farms, cooperatives, and agritech startups with micro-irrigation suppliers, blockchain traceability providers, and international export buyers.',
    venueAddress: 'Kenyatta International Convention Centre, Harambee Ave, Nairobi',
    highlights: [
      'Solar agricultural equipment & modular greenhouse pavilion',
      'Direct export contracts to Europe & the Gulf',
    ],
  },
  'evt-marrakech': {
    organizerName: 'Crafts & Export House',
    title: 'Marrakech Crafts, Artisanship & Export Showcase',
    publicSummary:
      'B2B showcase connecting fine crafts, leather, textile, and ceramic ateliers with global buyers.',
    fullDescription:
      'Private showroom uniting master artisans from North and Sub-Saharan Africa with concept-store buyers, luxury hospitality groups, and diaspora distributors.',
    venueAddress: 'Dar Artisans & Design Hub, Avenue Mohammed VI, Marrakech',
    highlights: [
      'Certified export logistics & premium packaging desk',
      'Bulk hospitality orders across Africa & Europe',
    ],
  },
  'evt-accra': {
    organizerName: 'Diaspora Creative Production',
    title: 'Accra Events, Culture & Festivals Business Forum',
    publicSummary:
      'Industry forum for live events, stage production, ticketing platforms, and business tourism.',
    fullDescription:
      'Brings together event agencies, stage directors, AV vendors, and diaspora sponsors preparing the upcoming West African summit and festival season.',
    venueAddress: 'Osu Creative Convention District, Oxford Street, Accra',
    highlights: [
      'Stage, sound & lighting supplier marketplace',
      'London / Accra / Abidjan diaspora co-production tracks',
    ],
  },
  'evt-casablanca': {
    organizerName: 'Africa Construction (BTT) & Infrastructure',
    title: 'Casablanca Construction (BTT), Sites & Sustainable Infrastructure',
    publicSummary:
      'B2B construction (BTT), civil engineering, local building materials, and project-delivery partnerships.',
    fullDescription:
      'Targeted networking between general contractors, structural engineering firms, low-carbon steel/cement suppliers, and pan-African real estate developers.',
    venueAddress: 'Anfa Finance & Construction Center, Boulevard d’Anfa, Casablanca',
    highlights: [
      'Private tenders for housing & industrial zones',
      'North Africa — West Africa joint construction consortia',
    ],
  },
  'evt-addis': {
    organizerName: 'Pan-African Architecture Collective',
    title: 'Addis Ababa Bioclimatic Architecture & Urbanism',
    publicSummary:
      'Symposium of architects, urban planners, and design studios shaping tomorrow’s African cities.',
    fullDescription:
      'Architectural scale-model exhibition, sessions on bioclimatic design, compressed earth brick engineering, and sustainable urban development masterplans.',
    venueAddress: 'Bole Architecture Pavilion, Cameroon Street, Addis Ababa',
    highlights: [
      'Sustainable architecture competition for tech campuses & hubs',
      'Cross-border links among practices in Addis, Dakar, Nairobi & Paris',
    ],
  },
  'evt-douala': {
    organizerName: 'Africa Design Studio',
    title: 'Douala Industrial Design, Furniture & B2B Branding',
    publicSummary:
      'Meetup of product design studios, spatial designers, and emerging African consumer brands.',
    fullDescription:
      'Co-creation labs, certified timber & recycled material sourcing, export packaging clinics, and meetings with diaspora creative directors.',
    venueAddress: 'Bonanjo Design Atelier, Rue Joss, Douala',
    highlights: [
      'Contemporary furniture & industrial design showroom',
      'Central Africa — North America brand distribution links',
    ],
  },
  'evt-montreal': {
    organizerName: 'North America Diaspora Hub',
    title: 'Montreal Tech, AI & Diaspora Entrepreneurship',
    publicSummary:
      'Tech crossroads linking engineers, AI founders, and venture investors across Canada and Africa.',
    fullDescription:
      'Live software tool demos, university R&D partnerships, export growth financing, and hybrid engineering team building across Montreal, Dakar, and Abidjan.',
    venueAddress: 'Quartier de l’Innovation, 1250 Rue Guy, Montreal',
    highlights: [
      'Quebec — Francophone Africa applied R&D bridges',
      'Product mentorship & B2B expansion roundtables',
    ],
  },
  'evt-dubai': {
    organizerName: 'Gulf-Africa Trade Council',
    title: 'Dubai Construction (BTT), Logistics & Africa-Gulf Investment',
    publicSummary:
      'Investor and major infrastructure summit connecting the Gulf, East Africa, and West Africa.',
    fullDescription:
      'Roundtables on port infrastructure, modular construction (BTT), cold-chain freight, and joint project financing for African energy corridors.',
    venueAddress: 'DIFC Gate District Business Lounge, Dubai',
    highlights: [
      'Gulf ↔ Africa infrastructure investment syndicates',
      'Direct meetings with project owners & developers',
    ],
  },
  'evt-newyork': {
    organizerName: 'Diaspora Design & Venture NY',
    title: 'New York Afro-Design, Architecture & Creative Capital',
    publicSummary:
      'North American edition uniting architects, designers, event producers, and creative venture funds.',
    fullDescription:
      'International showcase of architecture studios, design labels, and event producers connecting New York, London, Lagos, and Johannesburg.',
    venueAddress: 'SoHo Creative Loft, 412 Broadway, New York',
    highlights: [
      'B2B commissions in interior architecture & hospitality',
      'US retail distribution network for African creators',
    ],
  },
};

export function localizeEvent(ev: BusinessEvent, lang: AppLanguage): BusinessEvent {
  if (lang === 'fr') return ev;
  const en = EVENT_EN[ev.id];
  const city = localizeCity(ev.city, lang);
  if (!en) {
    return { ...ev, city };
  }
  return {
    ...ev,
    city,
    organizerName: en.organizerName || ev.organizerName,
    title: en.title,
    publicSummary: en.publicSummary,
    fullDescription: ev.locked ? ev.fullDescription : en.fullDescription,
    venueAddress: ev.locked ? ev.venueAddress : en.venueAddress || ev.venueAddress,
    highlights: ev.locked ? ev.highlights : en.highlights,
  };
}

interface NetworkEnTranslation {
  name: string;
  publicSummary: string;
  fullDescription: string;
}

const NETWORK_EN: Record<string, NetworkEnTranslation> = {
  'net-fintech': {
    name: 'WAEMU & Diaspora Fintech Circle',
    publicSummary:
      'Collective of founders, compliance officers, and investors building African financial rails.',
    fullDescription:
      'Confidential monthly briefings on BCEAO/COBAC licensing, European correspondent banking partnerships, and regulatory peer reviews.',
  },
  'net-women': {
    name: 'Women Leaders Africa-Europe',
    publicSummary:
      'Network of women executives and founders scaling high-impact businesses across Africa and the diaspora.',
    fullDescription:
      'Peer mentorship pairing seasoned CEOs with emerging founders, priority access to project tenders, and sector support circles.',
  },
  'net-angels': {
    name: 'Diaspora Investors & Business Angels',
    publicSummary:
      'Syndicate of diaspora executives and entrepreneurs co-investing at seed stage in vetted ventures.',
    fullDescription:
      'Monthly deal flow of 4 audited startups, shared investment memos, and co-investment tickets starting from €5,000 per deal.',
  },
  'net-agri': {
    name: 'Agriculture & Food Sovereignty Alliance',
    publicSummary:
      'Producers, agritech builders, cooperatives, and buyers strengthening African agricultural chains.',
    fullDescription:
      'Shared roster of solar equipment suppliers, direct export off-take contracts, input financing, and quality certification between Africa and the diaspora.',
  },
  'net-btt-arch': {
    name: 'Africa Construction (BTT), Civil & Architecture Consortium',
    publicSummary:
      'Architects, BTT contractors, engineering firms, and developers operating across the continent.',
    fullDescription:
      'Joint bidding on infrastructure tenders, verified local site-supervision partners, low-carbon materials innovation, and bioclimatic engineering.',
  },
  'net-artisanat-design': {
    name: 'Global Crafts, Design & Events Guild',
    publicSummary:
      'Master craft workshops, product designers, and event agencies bridging Africa and the diaspora.',
    fullDescription:
      'Access to international trade fairs, consolidated export freight, festival co-production, and B2B orders for global hospitality and retail.',
  },
  'net-tech-africa': {
    name: 'Pan-African Tech & Innovation Network',
    publicSummary:
      'SaaS founders, cloud/AI engineers, and CTOs linking African and global technology hubs.',
    fullDescription:
      'Software architecture peer reviews, transcontinental tech hiring, B2B co-distribution, and R&D insights across Kigali, Lagos, Nairobi, Cape Town, Montreal, and Singapore.',
  },
  'net-gulf-asia': {
    name: 'Africa — Gulf — Asia Trade & Industry Corridor',
    publicSummary:
      'Diaspora entrepreneurs and industrialists operating between Africa, Dubai, China, and India.',
    fullDescription:
      'Verified industrial sourcing, factory QA inspections, sea/air freight coordination, and local manufacturing joint ventures in Africa.',
  },
};

export function localizeNetwork(net: ProfessionalNetwork, lang: AppLanguage): ProfessionalNetwork {
  if (lang === 'fr') return net;
  const en = NETWORK_EN[net.id];
  if (!en) return net;
  return {
    ...net,
    name: en.name,
    publicSummary: en.publicSummary,
    fullDescription: net.locked ? net.fullDescription : en.fullDescription,
  };
}

interface OpportunityEnTranslation {
  companyName?: string;
  title: string;
  publicSummary: string;
  fullDetails: string;
  budgetRange?: string;
}

const OPP_EN: Record<string, OpportunityEnTranslation> = {
  'opp-1': {
    title: 'Banking Partners & B2B Distributors — WAEMU',
    publicSummary:
      'Seeking financial correspondents and SME payment aggregators in Senegal, Mali, and Côte d’Ivoire.',
    fullDetails:
      'PayTeranga is opening its EUR/XOF settlement corridor to licensed B2B partners. Volume-based revenue share, real-time API, and BCEAO compliance support included. Technical pack sent upon connection.',
    budgetRange: '€50k–€250k/mo partner volume',
  },
  'opp-2': {
    title: 'Seed Co-Investment Envelope — Fintech & Logistics',
    publicSummary:
      '€50,000 to €300,000 tickets for revenue-generating B2B startups in West Africa.',
    fullDetails:
      'Q1 2027 thesis: last-mile logistics infrastructure, cross-border payments, and SME ERP software. 4-week due diligence track led with London/Paris diaspora syndicate.',
    budgetRange: '€50,000 – €300,000',
  },
  'opp-3': {
    companyName: 'CI Agribusiness Network',
    title: 'Solar Drying & Cocoa/Cashew Processing Unit Suppliers',
    publicSummary:
      'Call for industrial equipment manufacturers and food-process engineers for 4 cooperatives in Côte d’Ivoire.',
    fullDetails:
      'Need 4 modular off-grid processing lines (2 tons/day capacity), Q1 2027 delivery at Abidjan port with 24-month maintenance SLA.',
    budgetRange: '€80,000 – €180,000',
  },
  'opp-4': {
    title: 'Europe & North America Distribution — Crafts & Sustainable Design',
    publicSummary:
      'Export partnership for ceramic workshops, bogolan textiles, and certified artisan furniture.',
    fullDetails:
      'Curating 12 master artisan studios across Morocco, Senegal, Ghana, and Rwanda for B2B wholesale to concept stores in Paris, London, Montreal, and New York.',
    budgetRange: '€40,000 – €150,000',
  },
  'opp-5': {
    title: 'Consortium Call: Construction (BTT) & Bioclimatic Architecture — Diamniadio',
    publicSummary:
      'Seeking architecture practices, BTT civil engineers, and low-carbon building material suppliers.',
    fullDetails:
      'Program of 3 modular commercial buildings integrating compressed earth bricks and passive cooling across West and Central Africa.',
    budgetRange: '€250,000 – €900,000',
  },
};

export function localizeOpportunity(opp: BusinessOpportunity, lang: AppLanguage): BusinessOpportunity {
  if (lang === 'fr') return opp;
  const en = OPP_EN[opp.id];
  if (!en) return opp;
  return {
    ...opp,
    companyName: en.companyName || opp.companyName,
    title: en.title,
    publicSummary: en.publicSummary,
    fullDetails: opp.locked ? opp.fullDetails : en.fullDetails,
    budgetRange: en.budgetRange || opp.budgetRange,
  };
}

const GROUP_EN: Record<string, { name: string; description: string }> = {
  'grp-fintech': {
    name: 'Fintech & WAEMU Payments Circle',
    description: 'Discussions among founders, partner banks, and BCEAO/COBAC compliance teams.',
  },
  'grp-export': {
    name: 'Africa — Europe Export Corridor',
    description: 'Logistics, export certifications, European buyers, and harvest campaign financing.',
  },
  'grp-btt-arch': {
    name: 'Construction (BTT), Architecture & Urban Design',
    description: 'Engineering firms, property developers, architects, and project owners across Africa & Diaspora.',
  },
  'grp-artisanat': {
    name: 'Crafts, Design & Events Guild',
    description: 'Creators, artisan workshops, event production agencies, and international distributors.',
  },
};

export function localizeGroup(group: DiscussionGroup, lang: AppLanguage): DiscussionGroup {
  if (lang === 'fr') return group;
  const en = GROUP_EN[group.id];
  if (!en) return group;
  return {
    ...group,
    name: en.name,
    description: en.description,
  };
}

export function localizeSessionSlot(slot: string, lang: AppLanguage): string {
  if (!slot || lang === 'fr') return slot;
  return slot
    .replace(/^Plénière/i, 'Plenary')
    .replace(/^Atelier Export/i, 'Export Workshop')
    .replace(/^Deal-Room/i, 'Deal Room')
    .replace(/^Networking Libre/i, 'Open Networking');
}

export function localizeNotification(n: AppNotification, lang: AppLanguage): AppNotification {
  if (lang === 'fr') return n;
  if (n.id === 'notif-1') {
    return {
      ...n,
      title: 'New connection request',
      body: 'Fatou Ndiaye (Montreal) wants to join your network.',
    };
  }
  if (n.id === 'notif-2') {
    return {
      ...n,
      title: 'Registration confirmed',
      body: 'Your seat for Dakar Business Summit 2026 is confirmed (AE-DKR-8421).',
    };
  }
  if (n.title === 'Nouvelle demande de contact') {
    return { ...n, title: 'New connection request' };
  }
  if (n.title === 'Inscription confirmée') {
    return { ...n, title: 'Registration confirmed' };
  }
  return n;
}

const PROFILE_EN: Record<
  string,
  { headline: string; bio: string; skills: string[]; collaborationNeeds: string[] }
> = {
  'u-amina': {
    headline: 'Founder & CEO — Cross-Border WAEMU Payments',
    bio: 'Simplifying B2B settlements between the European diaspora and West African SMEs. Open to banking partnerships and co-investors.',
    skills: ['BCEAO Regulatory Strategy', 'Payment Architecture', 'Series A Fundraising'],
    collaborationNeeds: ['Co-investment', 'Distribution Partners'],
  },
  'u-kwame': {
    headline: 'Managing Partner — Diaspora Venture & Seed Capital',
    bio: 'Seed fund backing logistics infrastructure, clean energy, and B2B software across London, Accra, and Abidjan.',
    skills: ['Due Diligence', 'Financial Structuring', 'Market Expansion'],
    collaborationNeeds: ['Qualified Deal Flow', 'Co-investors'],
  },
  'u-moussa': {
    headline: 'Export & Agro-Processing Consultant',
    bio: 'Supporting agricultural cooperatives with European market entry and organic export certification.',
    skills: ['Supply Chain', 'EU Certification'],
    collaborationNeeds: ['B2B Clients', 'Mentorship'],
  },
  'u-orga': {
    headline: 'Organizer — West Africa Agribusiness & Export Summits',
    bio: 'Coordinating economic summits and connecting Ivorian cooperatives with industrial equipment partners.',
    skills: ['Summit Production', 'B2B Partnerships'],
    collaborationNeeds: ['Sponsors', 'Industrial Suppliers'],
  },
  'u-fatou': {
    headline: 'AI & EdTech Product Director — Montreal / Dakar',
    bio: 'Certifying workforce training platforms engineered for low-bandwidth environments across Francophone Africa.',
    skills: ['Offline Mobile Product', 'Institutional Partnerships'],
    collaborationNeeds: ['Technical Partners', 'Distribution'],
  },
  'u-chidi': {
    headline: 'Co-founder — Alara Venture Studio Lagos',
    bio: 'Venture studio building Fintech and B2B Commerce startups operating in Nigeria and East Africa.',
    skills: ['Core Banking Engineering', 'B2B Growth'],
    collaborationNeeds: ['Francophone Partners', 'Investors'],
  },
};

const ENTERPRISE_EN: Record<string, { description: string; services: string[] }> = {
  'ent-payteranga': {
    description:
      'Instant multi-currency EUR/XOF settlement infrastructure for exporting SMEs and service providers.',
    services: ['B2B Collection API', 'Multi-Currency Treasury', 'KYC/AML Compliance'],
  },
  'ent-diasporavc': {
    description:
      'Seed & pre-seed investment vehicle connecting diaspora capital with African technology builders.',
    services: ['€50k–€400k Tickets', 'Europe/Africa Go-to-Market Program'],
  },
  'ent-alara': {
    description:
      'Venture studio backing Fintech founders from zero to their first million in monthly volume.',
    services: ['Technical Co-founding', 'PSP License Access'],
  },
};

export function localizeEnterprise(
  ent: EnterprisePage | null | undefined,
  lang: AppLanguage
): EnterprisePage | undefined {
  if (!ent) return undefined;
  if (lang === 'fr') return ent;
  const en = ENTERPRISE_EN[ent.id];
  const city = localizeCity(ent.city, lang);
  if (!en) return { ...ent, city };
  return {
    ...ent,
    city,
    description: en.description,
    services: en.services,
  };
}

export function localizeProfile(
  profile: ProfessionalProfile | null | undefined,
  lang: AppLanguage
): ProfessionalProfile | undefined {
  if (!profile) return undefined;
  if (lang === 'fr') return profile;
  const en = PROFILE_EN[profile.memberId];
  if (!en) {
    return {
      ...profile,
      headline:
        profile.headline === 'Membre Africa Entrepreneur'
          ? 'Africa Entrepreneur Member'
          : profile.headline,
    };
  }
  return {
    ...profile,
    headline: en.headline,
    bio: en.bio,
    skills: en.skills,
    collaborationNeeds: en.collaborationNeeds,
  };
}

export function localizeDirectoryEntry(entry: DirectoryEntry, lang: AppLanguage): DirectoryEntry {
  if (lang === 'fr') return entry;
  return {
    ...entry,
    member: {
      ...entry.member,
      city: localizeCity(entry.member.city, lang),
    },
    profile: localizeProfile(entry.profile, lang),
    enterprise: localizeEnterprise(entry.enterprise, lang),
  };
}
