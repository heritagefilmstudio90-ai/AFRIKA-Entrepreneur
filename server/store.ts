import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  deriveSharedSecretKey,
  encryptPayloadE2EE,
  generateIdentityKeyPair,
  wrapPrivateKeyWithPassphrase,
} from '../src/lib/cryptoE2EE';
import type {
  AdminAuditLog,
  AppNotification,
  BusinessEvent,
  BusinessOpportunity,
  ContactConnection,
  DiscussionGroup,
  EncryptedMessageRecord,
  EnterprisePage,
  EventRegistration,
  GroupMessage,
  MemberAccount,
  MemberBlock,
  ModerationReport,
  PaymentRecord,
  ProfessionalNetwork,
  ProfessionalProfile,
  ScannedBadgeContact,
  SubscriptionEventLog,
} from '../src/types/domain';

export interface StoredMember extends MemberAccount {
  passwordHash: string;
  passwordSalt: string;
  verificationCode?: string;
}

export interface SessionRecord {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface DatabaseState {
  members: StoredMember[];
  profiles: ProfessionalProfile[];
  enterprises: EnterprisePage[];
  events: BusinessEvent[];
  networks: ProfessionalNetwork[];
  opportunities: BusinessOpportunity[];
  groups: DiscussionGroup[];
  groupMessages: GroupMessage[];
  registrations: EventRegistration[];
  payments: PaymentRecord[];
  subscriptionLogs: SubscriptionEventLog[];
  connections: ContactConnection[];
  messages: EncryptedMessageRecord[];
  notifications: AppNotification[];
  reports: ModerationReport[];
  auditLogs: AdminAuditLog[];
  blocks: MemberBlock[];
  sessions: SessionRecord[];
  scannedBadges: ScannedBadgeContact[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const FALLBACK_DATA_DIR = path.join(os.tmpdir(), 'africa-entrepreneur-data');
let activeDataDir = DATA_DIR;

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return { hash, salt: actualSalt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
}

export function stripSecretMemberFields(m: StoredMember): MemberAccount {
  const { passwordHash: _ph, passwordSalt: _ps, verificationCode: _vc, ...safe } = m;
  return safe;
}

function defaultOpportunities(): BusinessOpportunity[] {
  return [
    {
      id: 'opp-1',
      authorId: 'u-amina',
      authorName: 'Amina Diallo',
      companyName: 'PayTeranga SAS',
      title: 'Partenaires bancaires & distributeurs B2B UEMOA',
      category: 'commercial_partner',
      publicSummary: 'Recherche de correspondants financiers et agrégateurs PME au Sénégal, Mali et Côte d’Ivoire.',
      fullDetails:
        'PayTeranga ouvre son corridor EUR/XOF aux partenaires B2B agréés. Rémunération sur volume traité, API temps réel et support conformité BCEAO inclus. Dossier technique envoyé après prise de contact.',
      country: 'Sénégal',
      sector: 'Fintech',
      budgetRange: 'Partenariat volume 50k–250k €/mois',
      status: 'published',
      createdAt: '2026-11-16T09:00:00.000Z',
    },
    {
      id: 'opp-2',
      authorId: 'u-kwame',
      authorName: 'Kwame Mensah',
      companyName: 'Diaspora Ventures Partners',
      title: 'Enveloppe co-investissement Amorçage Fintech & Logistique',
      category: 'co_investment',
      publicSummary: 'Tickets de 50 000 € à 300 000 € pour startups B2B génératrices de revenus en Afrique de l’Ouest.',
      fullDetails:
        'Thèse Q1 2027 : infrastructures logistiques du dernier kilomètre, paiements transfrontaliers et logiciels de gestion PME. Processus de due diligence en 4 semaines avec syndicat diaspora Londres/Paris.',
      country: 'Royaume-Uni',
      sector: 'Capital-Risque',
      budgetRange: '50 000 € – 300 000 €',
      status: 'published',
      createdAt: '2026-11-17T14:30:00.000Z',
    },
    {
      id: 'opp-3',
      authorId: 'u-orga',
      authorName: 'Seydou Keïta',
      companyName: 'Réseau Agro-Industrie CI',
      title: 'Fournisseurs d’unités solaires de séchage & transformation cacao/anacarde',
      category: 'supplier',
      publicSummary: 'Appel à équipementiers industriels et ingénieurs agroalimentaires pour 4 coopératives en Côte d’Ivoire.',
      fullDetails:
        'Besoin de 4 lignes de transformation modulaires autonomes (capacité 2 tonnes/jour), livraison port d’Abidjan T1 2027 avec contrat de maintenance 24 mois.',
      country: 'Côte d’Ivoire',
      sector: 'Agro-industrie',
      budgetRange: '80 000 € – 180 000 €',
      status: 'published',
      createdAt: '2026-11-18T11:15:00.000Z',
    },
    {
      id: 'opp-4',
      authorId: 'u-fatou',
      authorName: 'Fatou Ndiaye',
      companyName: 'Atelier Atlas & Savoir-Faire',
      title: 'Distribution Europe & Amérique du Nord — Artisanat & Design durable',
      category: 'commercial_partner',
      publicSummary: 'Partenariat export pour ateliers de céramique, textile bogolan et mobilier artisanal certifié.',
      fullDetails:
        'Sélection de 12 maîtres-artisans du Maroc, Sénégal, Ghana et Rwanda pour distribution B2B auprès de concept-stores à Paris, Londres, Montréal et New York.',
      country: 'Maroc',
      sector: 'Artisanat',
      budgetRange: '40 000 € – 150 000 €',
      status: 'published',
      createdAt: '2026-11-19T10:00:00.000Z',
    },
    {
      id: 'opp-5',
      authorId: 'u-chidi',
      authorName: 'Chidi Okonkwo',
      companyName: 'BuildAfrica Consortium',
      title: 'Appel à consortium BTT & Architecture bioclimatique — Pôle Diamniadio',
      category: 'call_for_projects',
      publicSummary: 'Recherche bureaux d’architecture, ingénieurs BTT et fournisseurs de matériaux bas-carbone.',
      fullDetails:
        'Programme de 3 immeubles tertiaires modulaires intégrant brique de terre compressée et refroidissement passif en Afrique de l’Ouest et Centrale.',
      country: 'Cameroun',
      sector: 'BTT',
      budgetRange: '250 000 € – 900 000 €',
      status: 'published',
      createdAt: '2026-11-20T09:30:00.000Z',
    },
  ];
}

function defaultGroups(): DiscussionGroup[] {
  return [
    {
      id: 'grp-fintech',
      name: 'Club Fintech & Paiements UEMOA',
      sector: 'Fintech',
      description: 'Échanges entre fondateurs, banques partenaires et équipes conformité BCEAO/COBAC.',
      memberCount: 148,
    },
    {
      id: 'grp-export',
      name: 'Corridor Export Afrique — Europe',
      sector: 'Agro-industrie',
      description: 'Logistique, certifications export, acheteurs européens et financements de campagne.',
      memberCount: 92,
    },
    {
      id: 'grp-btt-arch',
      name: 'BTT, Architecture & Design Urbain',
      sector: 'BTT',
      description: 'Bureaux d’études, promoteurs immobiliers, architectes et maîtres d’ouvrage Afrique & Diaspora.',
      memberCount: 114,
    },
    {
      id: 'grp-artisanat',
      name: 'Artisanat, Design & Événementiel',
      sector: 'Artisanat',
      description: 'Créateurs, maisons d’artisanat, agences événementielles et distributeurs internationaux.',
      memberCount: 126,
    },
  ];
}

function defaultGroupMessages(): GroupMessage[] {
  return [
    {
      id: 'gmsg-1',
      groupId: 'grp-fintech',
      authorId: 'u-amina',
      authorName: 'Amina Diallo',
      authorHeadline: 'CEO · PayTeranga SAS',
      text: 'Bienvenue dans le cercle Fintech ! Nous partageons ici nos retours sur les intégrations API et les rencontres du Dakar Summit.',
      createdAt: '2026-11-18T10:00:00.000Z',
    },
    {
      id: 'gmsg-2',
      groupId: 'grp-fintech',
      authorId: 'u-kwame',
      authorName: 'Kwame Mensah',
      authorHeadline: 'Associé · Diaspora Ventures Partners',
      text: 'Nous organiserons une session Q&A sur les tours pre-seed diaspora la semaine prochaine.',
      createdAt: '2026-11-18T12:15:00.000Z',
    },
    {
      id: 'gmsg-3',
      groupId: 'grp-export',
      authorId: 'u-orga',
      authorName: 'Seydou Keïta',
      authorHeadline: 'Organisateur · Réseau Agro-Industrie CI',
      text: 'Les dossiers des 4 coopératives partenaires pour le webinaire Abidjan AgriTech sont prêts pour les membres inscrits.',
      createdAt: '2026-11-18T15:40:00.000Z',
    },
  ];
}

function extraSeedEvents(): BusinessEvent[] {
  return [
    {
      id: 'evt-kigali',
      organizerId: 'u-orga',
      organizerName: 'Kigali Innovation Alliance',
      title: 'Kigali DeepTech & Cloud Africa Forum',
      publicSummary: 'Rencontre des fondateurs Tech, éditeurs SaaS et ingénieurs IA d’Afrique de l’Est et de la diaspora.',
      fullDescription:
        'Ateliers d’architecture cloud souveraine, souveraineté des données, démos produit en direct et rendez-vous B2B avec des intégrateurs basés au Rwanda, Kenya et Canada.',
      dateIso: '2027-02-04T09:00:00.000Z',
      country: 'Rwanda',
      city: 'Kigali',
      sector: 'Tech',
      format: 'hybrid',
      venueAddress: 'Kigali Innovation City, Special Economic Zone, Kigali',
      virtualLink: 'https://visio.africaentrepreneur.com/room/kigali-tech-2027',
      capacity: 150,
      registeredCount: 94,
      feeEur: 0,
      imageUrl: '/src/assets/images/event_kigali_tech_1795356687566.jpg',
      status: 'published',
      highlights: [
        'Déploiements IA & SaaS bas débit sur le continent',
        'Rencontres partenaires techniques Kigali ↔ Montréal',
      ],
    },
    {
      id: 'evt-nairobi',
      organizerId: 'u-orga',
      organizerName: 'East Africa Agribusiness Hub',
      title: 'Nairobi Sustainable Agriculture & Cold-Chain Summit',
      publicSummary: 'Solutions agricoles climat-intelligentes, chaîne du froid solaire et financement des coopératives.',
      fullDescription:
        'Connectez vos exploitations, coopératives et startups agricoles aux fournisseurs de micro-irrigation, traçabilité blockchain et acheteurs internationaux.',
      dateIso: '2027-02-12T08:30:00.000Z',
      country: 'Kenya',
      city: 'Nairobi',
      sector: 'Agriculture',
      format: 'in_person',
      venueAddress: 'Kenyatta International Convention Centre, Harambee Ave, Nairobi',
      virtualLink: '',
      capacity: 140,
      registeredCount: 88,
      feeEur: 25,
      imageUrl: '/src/assets/images/event_nairobi_agriculture_1795356687671.jpg',
      status: 'published',
      highlights: [
        'Pavillon équipements solaires agricoles & serres modulaires',
        'Contrats d’exportation directe vers Europe & Golfe',
      ],
    },
    {
      id: 'evt-marrakech',
      organizerId: 'u-orga',
      organizerName: 'Maison Artisanat & Export',
      title: 'Marrakech Artisanat, Savoir-Faire & Export Showcase',
      publicSummary: 'Vitrine B2B pour ateliers d’artisanat d’art, cuir, textile, céramique et acheteurs internationaux.',
      fullDescription:
        'Showroom privé réunissant maîtres-artisans du Maghreb et d’Afrique subsaharienne avec acheteurs de concept-stores, hôtellerie de luxe et distributeurs diaspora.',
      dateIso: '2027-02-20T10:00:00.000Z',
      country: 'Maroc',
      city: 'Marrakech',
      sector: 'Artisanat',
      format: 'hybrid',
      venueAddress: 'Dar Artisans & Design Hub, Avenue Mohammed VI, Marrakech',
      virtualLink: 'https://visio.africaentrepreneur.com/room/marrakech-artisanat',
      capacity: 90,
      registeredCount: 57,
      feeEur: 20,
      imageUrl: '/src/assets/images/event_morocco_artisanat_1795356687577.jpg',
      status: 'published',
      highlights: [
        'Logistique export certifiée & packaging premium',
        'Commandes groupées hôtellerie Afrique & Europe',
      ],
    },
    {
      id: 'evt-accra',
      organizerId: 'u-admin',
      organizerName: 'Diaspora Creative Production',
      title: 'Accra Événementiel, Culture & Festivals Business Forum',
      publicSummary: 'Forum professionnel de l’événementiel, production scénique, billetterie et tourisme d’affaires.',
      fullDescription:
        'Rassemblez agences événementielles, régisseurs, prestataires audiovisuels et sponsors diaspora préparant la saison des sommets et festivals en Afrique de l’Ouest.',
      dateIso: '2027-03-03T11:00:00.000Z',
      country: 'Ghana',
      city: 'Accra',
      sector: 'Événementiel',
      format: 'in_person',
      venueAddress: 'Osu Creative Convention District, Oxford Street, Accra',
      virtualLink: '',
      capacity: 110,
      registeredCount: 73,
      feeEur: 15,
      imageUrl: '/src/assets/images/hero_diaspora_lounge_1795139287796.jpg',
      status: 'published',
      highlights: [
        'Bourse aux prestataires scéniques, son & lumière',
        'Co-production d’événements diaspora Londres / Accra / Abidjan',
      ],
    },
    {
      id: 'evt-casablanca',
      organizerId: 'u-orga',
      organizerName: 'BTT & Infrastructures Afrique',
      title: 'Casablanca BTT, Chantiers & Infrastructures Durables',
      publicSummary: 'Rencontres d’affaires BTT, génie civil, matériaux locaux et partenariats maîtrise d’ouvrage.',
      fullDescription:
        'Networking ciblé entre entreprises générales de BTT, bureaux d’études structure, fournisseurs d’acier/béton bas-carbone et promoteurs panafricains.',
      dateIso: '2027-03-11T09:00:00.000Z',
      country: 'Maroc',
      city: 'Casablanca',
      sector: 'BTT',
      format: 'in_person',
      venueAddress: 'Anfa Finance & Construction Center, Boulevard d’Anfa, Casablanca',
      virtualLink: '',
      capacity: 130,
      registeredCount: 79,
      feeEur: 30,
      imageUrl: '/src/assets/images/event_dakar_summit_1795137733263.jpg',
      status: 'published',
      highlights: [
        'Appels d’offres privés logements & zones industrielles',
        'Consortiums conjoints Afrique du Nord — Afrique de l’Ouest',
      ],
    },
    {
      id: 'evt-addis',
      organizerId: 'u-orga',
      organizerName: 'Pan-African Architecture Collective',
      title: 'Addis-Abeba Architecture Bioclimatique & Urbanisme',
      publicSummary: 'Colloque d’architectes, urbanistes et bureaux d’études concevant les villes africaines de demain.',
      fullDescription:
        'Exposition de maquettes, conférences sur l’architecture bioclimatique, brique de terre compressée et grands projets d’aménagement urbain durables.',
      dateIso: '2027-03-19T09:30:00.000Z',
      country: 'Éthiopie',
      city: 'Addis-Abeba',
      sector: 'Architecture',
      format: 'hybrid',
      venueAddress: 'Bole Architecture Pavilion, Cameroon Street, Addis-Abeba',
      virtualLink: 'https://visio.africaentrepreneur.com/room/addis-arch-2027',
      capacity: 100,
      registeredCount: 64,
      feeEur: 0,
      imageUrl: '/src/assets/images/event_kigali_tech_1795356687566.jpg',
      status: 'published',
      highlights: [
        'Concours d’architecture durable pour campus & pôles tech',
        'Mise en réseau cabinets Addis, Dakar, Nairobi & Paris',
      ],
    },
    {
      id: 'evt-douala',
      organizerId: 'u-admin',
      organizerName: 'Studio Afrique Design',
      title: 'Douala Design Industriel, Mobilier & Branding B2B',
      publicSummary: 'Rencontre des studios de design produit, designers d’espace et marques africaines émergentes.',
      fullDescription:
        'Sessions de co-création, sourcing bois certifié & matériaux recyclés, packaging export et rencontres avec des directeurs artistiques de la diaspora.',
      dateIso: '2027-03-27T10:00:00.000Z',
      country: 'Cameroun',
      city: 'Douala',
      sector: 'Design',
      format: 'in_person',
      venueAddress: 'Bonanjo Design Atelier, Rue Joss, Douala',
      virtualLink: '',
      capacity: 75,
      registeredCount: 48,
      feeEur: 0,
      imageUrl: '/src/assets/images/event_morocco_artisanat_1795356687577.jpg',
      status: 'published',
      highlights: [
        'Showroom mobilier contemporain & design industriel',
        'Partenariats marques Afrique Centrale — Amérique du Nord',
      ],
    },
    {
      id: 'evt-montreal',
      organizerId: 'u-admin',
      organizerName: 'Hub Diaspora Amérique du Nord',
      title: 'Montréal Tech, IA & Entrepreneuriat Diaspora',
      publicSummary: 'Carrefour technologique reliant ingénieurs, fondateurs IA et investisseurs entre le Canada et l’Afrique.',
      fullDescription:
        'Démonstrations d’outils numériques, partenariats R&D universitaires, financement export et recrutement d’équipes hybrides Montréal–Dakar–Abidjan.',
      dateIso: '2027-04-06T14:00:00.000Z',
      country: 'Canada',
      city: 'Montréal',
      sector: 'Tech',
      format: 'hybrid',
      venueAddress: 'Quartier de l’Innovation, 1250 Rue Guy, Montréal',
      virtualLink: 'https://visio.africaentrepreneur.com/room/montreal-tech',
      capacity: 110,
      registeredCount: 68,
      feeEur: 0,
      imageUrl: '/src/assets/images/event_paris_diaspora_1795137736001.jpg',
      status: 'published',
      highlights: [
        'Ponts R&D Québec — Afrique francophone',
        'Sessions mentorat produit & expansion B2B',
      ],
    },
    {
      id: 'evt-dubai',
      organizerId: 'u-admin',
      organizerName: 'Gulf-Africa Trade Council',
      title: 'Dubaï BTT, Logistique & Investissements Afrique-Golfe',
      publicSummary: 'Forum investisseurs et grands chantiers entre le Golfe, l’Afrique de l’Est et l’Afrique de l’Ouest.',
      fullDescription:
        'Table ronde infrastructure portuaire, BTT modulaire, logistique frigorifique et co-financement de projets énergétiques sur le continent africain.',
      dateIso: '2027-04-15T10:00:00.000Z',
      country: 'Émirats arabes unis',
      city: 'Dubaï',
      sector: 'BTT',
      format: 'in_person',
      venueAddress: 'DIFC Gate District Business Lounge, Dubaï',
      virtualLink: '',
      capacity: 95,
      registeredCount: 54,
      feeEur: 45,
      imageUrl: '/src/assets/images/hero_diaspora_lounge_1795139287796.jpg',
      status: 'published',
      highlights: [
        'Syndicats d’infrastructures Golfe ↔ Afrique',
        'Rencontres directes maîtres d’ouvrage & promoteurs',
      ],
    },
    {
      id: 'evt-newyork',
      organizerId: 'u-admin',
      organizerName: 'Diaspora Design & Venture NY',
      title: 'New York Afro-Design, Architecture & Creative Capital',
      publicSummary: 'Édition nord-américaine réunissant architectes, designers, curateurs événementiels et fonds créatifs.',
      fullDescription:
        'Vitrine internationale de studios d’architecture, marques de design et producteurs événementiels connectant New York, Londres, Lagos et Johannesburg.',
      dateIso: '2027-04-22T17:30:00.000Z',
      country: 'États-Unis',
      city: 'New York',
      sector: 'Design',
      format: 'hybrid',
      venueAddress: 'SoHo Creative Loft, 412 Broadway, New York',
      virtualLink: 'https://visio.africaentrepreneur.com/room/ny-design-2027',
      capacity: 85,
      registeredCount: 52,
      feeEur: 30,
      imageUrl: '/src/assets/images/event_paris_diaspora_1795137736001.jpg',
      status: 'published',
      highlights: [
        'Commandes B2B architecture intérieure & hôtellerie',
        'Réseau distribution États-Unis pour créateurs africains',
      ],
    },
  ];
}

function extraSeedNetworks(): ProfessionalNetwork[] {
  return [
    {
      id: 'net-agri',
      name: 'Alliance Agriculture & Souveraineté Alimentaire',
      publicSummary: 'Producteurs, agritech, coopératives et acheteurs structurant les chaînes agricoles africaines.',
      fullDescription:
        'Partage de fournisseurs d’équipements solaires, contrats d’exportation directe, financement d’intrants et certification qualité entre l’Afrique et la diaspora.',
      countries: ['Côte d’Ivoire', 'Kenya', 'Éthiopie', 'Maroc', 'France', 'Pays-Bas'],
      sectors: ['Agriculture', 'Agro-industrie'],
      contactEmail: 'agri@africaentrepreneur.com',
      memberCount: 186,
      status: 'published',
      imageUrl: '/src/assets/images/event_nairobi_agriculture_1795356687671.jpg',
    },
    {
      id: 'net-btt-arch',
      name: 'Consortium BTT, Génie Civil & Architecture Afrique',
      publicSummary: 'Architectes, entrepreneurs BTT, bureaux d’études et promoteurs opérant sur tout le continent.',
      fullDescription:
        'Réponse conjointe aux appels d’offres d’infrastructures, partage de maîtres d’œuvre locaux certifiés, innovation matériaux bas-carbone et ingénierie bioclimatique.',
      countries: ['Cameroun', 'Maroc', 'Sénégal', 'Afrique du Sud', 'Émirats arabes unis', 'Belgique'],
      sectors: ['BTT', 'Architecture'],
      contactEmail: 'btt-architecture@africaentrepreneur.com',
      memberCount: 132,
      status: 'published',
      imageUrl: '/src/assets/images/event_kigali_tech_1795356687566.jpg',
    },
    {
      id: 'net-artisanat-design',
      name: 'Guilde Artisanat, Design & Événementiel Global',
      publicSummary: 'Ateliers d’artisanat d’excellence, designers produit et agences événementielles Afrique-Diaspora.',
      fullDescription:
        'Accès aux salons internationaux, regroupement logistique export, co-production de festivals et commandes B2B pour l’hôtellerie et le retail mondial.',
      countries: ['Maroc', 'Ghana', 'Cameroun', 'Tunisie', 'États-Unis', 'Royaume-Uni', 'Brésil'],
      sectors: ['Artisanat', 'Design', 'Événementiel'],
      contactEmail: 'design-artisanat@africaentrepreneur.com',
      memberCount: 174,
      status: 'published',
      imageUrl: '/src/assets/images/event_morocco_artisanat_1795356687577.jpg',
    },
    {
      id: 'net-tech-africa',
      name: 'Réseau Tech & Innovation Panafricaine',
      publicSummary: 'Fondateurs SaaS, ingénieurs cloud/IA et CTO reliant les hubs Tech africains et mondiaux.',
      fullDescription:
        'Entraide architecture logicielle, recrutement tech transcontinental, co-distribution B2B et veille technologique Kigali, Lagos, Nairobi, Le Cap, Montréal et Singapour.',
      countries: ['Rwanda', 'Nigeria', 'Kenya', 'Afrique du Sud', 'Égypte', 'Canada', 'Allemagne', 'Singapour'],
      sectors: ['Tech', 'EdTech', 'Intelligence Artificielle'],
      contactEmail: 'tech@africaentrepreneur.com',
      memberCount: 240,
      status: 'published',
      imageUrl: '/src/assets/images/event_kigali_tech_1795356687566.jpg',
    },
    {
      id: 'net-gulf-asia',
      name: 'Corridor Négoce & Industrie Afrique — Golfe — Asie',
      publicSummary: 'Entrepreneurs et industriels de la diaspora actifs entre l’Afrique, Dubaï, la Chine et l’Inde.',
      fullDescription:
        'Sourcing industriel sécurisé, contrôle qualité usine, fret maritime/aérien et co-entreprises de transformation locale en Afrique.',
      countries: ['Tanzanie', 'Angola', 'RD Congo', 'Émirats arabes unis', 'Chine', 'Inde', 'Turquie', 'Arabie saoudite'],
      sectors: ['Industrie', 'Logistique', 'BTT'],
      contactEmail: 'corridor-asia@africaentrepreneur.com',
      memberCount: 118,
      status: 'published',
      imageUrl: '/src/assets/images/hero_diaspora_lounge_1795139287796.jpg',
    },
  ];
}

async function createInitialSeed(): Promise<DatabaseState> {
  const demoPass = 'Africa2026!';
  const vaultPass = 'Africa2026!';

  const [aminaKp, kwameKp, moussaKp, adminKp, fatouKp, chidiKp, orgaKp] = await Promise.all([
    generateIdentityKeyPair(),
    generateIdentityKeyPair(),
    generateIdentityKeyPair(),
    generateIdentityKeyPair(),
    generateIdentityKeyPair(),
    generateIdentityKeyPair(),
    generateIdentityKeyPair(),
  ]);

  const [aminaWrapped, kwameWrapped, moussaWrapped, adminWrapped, fatouWrapped, chidiWrapped, orgaWrapped] =
    await Promise.all([
      wrapPrivateKeyWithPassphrase(aminaKp.privateKeyJwk, vaultPass, 10000),
      wrapPrivateKeyWithPassphrase(kwameKp.privateKeyJwk, vaultPass, 10000),
      wrapPrivateKeyWithPassphrase(moussaKp.privateKeyJwk, vaultPass, 10000),
      wrapPrivateKeyWithPassphrase(adminKp.privateKeyJwk, vaultPass, 10000),
      wrapPrivateKeyWithPassphrase(fatouKp.privateKeyJwk, vaultPass, 10000),
      wrapPrivateKeyWithPassphrase(chidiKp.privateKeyJwk, vaultPass, 10000),
      wrapPrivateKeyWithPassphrase(orgaKp.privateKeyJwk, vaultPass, 10000),
    ]);

  const makeCreds = () => hashPassword(demoPass);

  const members: StoredMember[] = [
    {
      id: 'u-amina',
      email: 'amina@africaentrepreneur.com',
      emailVerified: true,
      fullName: 'Amina Diallo',
      role: 'subscriber',
      subscriptionStatus: 'active',
      subscriptionPlan: 'annual',
      subscriptionStart: '2026-09-01T09:00:00.000Z',
      subscriptionEnd: '2027-09-01T09:00:00.000Z',
      autoRenew: true,
      country: 'Sénégal',
      city: 'Dakar',
      language: 'fr',
      avatarUrl: '/src/assets/images/avatar_amina_1795137734029.jpg',
      publicKeyJwk: aminaKp.publicKeyJwk,
      wrappedPrivateKey: aminaWrapped,
      keyFingerprint: aminaKp.fingerprint,
      visibility: 'public_subscribers',
      notificationsEnabled: true,
      profileViews: 142,
      createdAt: '2026-09-01T09:00:00.000Z',
      ...(() => {
        const c = makeCreds();
        return { passwordHash: c.hash, passwordSalt: c.salt };
      })(),
    },
    {
      id: 'u-kwame',
      email: 'kwame@africaentrepreneur.com',
      emailVerified: true,
      fullName: 'Kwame Mensah',
      role: 'subscriber',
      subscriptionStatus: 'active',
      subscriptionPlan: 'monthly',
      subscriptionStart: '2026-11-01T09:00:00.000Z',
      subscriptionEnd: '2027-02-01T09:00:00.000Z',
      autoRenew: true,
      country: 'Royaume-Uni',
      city: 'Londres',
      language: 'fr',
      avatarUrl: '/src/assets/images/avatar_kwame_1795137732755.jpg',
      publicKeyJwk: kwameKp.publicKeyJwk,
      wrappedPrivateKey: kwameWrapped,
      keyFingerprint: kwameKp.fingerprint,
      visibility: 'public_subscribers',
      notificationsEnabled: true,
      profileViews: 98,
      createdAt: '2026-09-15T10:00:00.000Z',
      ...(() => {
        const c = makeCreds();
        return { passwordHash: c.hash, passwordSalt: c.salt };
      })(),
    },
    {
      id: 'u-moussa',
      email: 'moussa@africaentrepreneur.com',
      emailVerified: true,
      fullName: 'Moussa Konaté',
      role: 'personnel',
      subscriptionStatus: 'none',
      autoRenew: false,
      country: 'France',
      city: 'Paris',
      language: 'fr',
      publicKeyJwk: moussaKp.publicKeyJwk,
      wrappedPrivateKey: moussaWrapped,
      keyFingerprint: moussaKp.fingerprint,
      visibility: 'private',
      notificationsEnabled: true,
      profileViews: 0,
      createdAt: '2026-11-10T11:00:00.000Z',
      ...(() => {
        const c = makeCreds();
        return { passwordHash: c.hash, passwordSalt: c.salt };
      })(),
    },
    {
      id: 'u-orga',
      email: 'orga@africaentrepreneur.com',
      emailVerified: true,
      fullName: 'Seydou Keïta (Organisateur)',
      role: 'organizer',
      subscriptionStatus: 'active',
      subscriptionPlan: 'annual',
      subscriptionStart: '2026-08-01T08:00:00.000Z',
      subscriptionEnd: '2027-08-01T08:00:00.000Z',
      autoRenew: true,
      country: 'Côte d’Ivoire',
      city: 'Abidjan',
      language: 'fr',
      publicKeyJwk: orgaKp.publicKeyJwk,
      wrappedPrivateKey: orgaWrapped,
      keyFingerprint: orgaKp.fingerprint,
      visibility: 'public_subscribers',
      notificationsEnabled: true,
      profileViews: 76,
      createdAt: '2026-08-01T08:00:00.000Z',
      ...(() => {
        const c = makeCreds();
        return { passwordHash: c.hash, passwordSalt: c.salt };
      })(),
    },
    {
      id: 'u-admin',
      email: 'admin@africaentrepreneur.com',
      emailVerified: true,
      fullName: 'Nadia Bamba (Modération)',
      role: 'admin',
      subscriptionStatus: 'active',
      subscriptionPlan: 'annual',
      subscriptionStart: '2026-01-01T00:00:00.000Z',
      subscriptionEnd: '2028-01-01T00:00:00.000Z',
      autoRenew: true,
      country: 'Côte d’Ivoire',
      city: 'Abidjan',
      language: 'fr',
      publicKeyJwk: adminKp.publicKeyJwk,
      wrappedPrivateKey: adminWrapped,
      keyFingerprint: adminKp.fingerprint,
      visibility: 'connections_only',
      notificationsEnabled: true,
      profileViews: 34,
      createdAt: '2026-01-01T00:00:00.000Z',
      ...(() => {
        const c = makeCreds();
        return { passwordHash: c.hash, passwordSalt: c.salt };
      })(),
    },
    {
      id: 'u-fatou',
      email: 'fatou@africaentrepreneur.com',
      emailVerified: true,
      fullName: 'Fatou Ndiaye',
      role: 'subscriber',
      subscriptionStatus: 'active',
      subscriptionPlan: 'annual',
      subscriptionStart: '2026-10-01T08:00:00.000Z',
      subscriptionEnd: '2027-10-01T08:00:00.000Z',
      autoRenew: true,
      country: 'Canada',
      city: 'Montréal',
      language: 'fr',
      avatarUrl: '/src/assets/images/avatar_fatou_1795139287344.jpg',
      publicKeyJwk: fatouKp.publicKeyJwk,
      wrappedPrivateKey: fatouWrapped,
      keyFingerprint: fatouKp.fingerprint,
      visibility: 'public_subscribers',
      notificationsEnabled: true,
      profileViews: 89,
      createdAt: '2026-10-01T08:00:00.000Z',
      ...(() => {
        const c = makeCreds();
        return { passwordHash: c.hash, passwordSalt: c.salt };
      })(),
    },
    {
      id: 'u-chidi',
      email: 'chidi@africaentrepreneur.com',
      emailVerified: true,
      fullName: 'Chidi Okonkwo',
      role: 'subscriber',
      subscriptionStatus: 'active',
      subscriptionPlan: 'monthly',
      subscriptionStart: '2026-11-05T08:00:00.000Z',
      subscriptionEnd: '2027-01-05T08:00:00.000Z',
      autoRenew: true,
      country: 'Nigeria',
      city: 'Lagos',
      language: 'en',
      avatarUrl: '/src/assets/images/avatar_chidi_1795139287332.jpg',
      publicKeyJwk: chidiKp.publicKeyJwk,
      wrappedPrivateKey: chidiWrapped,
      keyFingerprint: chidiKp.fingerprint,
      visibility: 'public_subscribers',
      notificationsEnabled: true,
      profileViews: 64,
      createdAt: '2026-11-05T08:00:00.000Z',
      ...(() => {
        const c = makeCreds();
        return { passwordHash: c.hash, passwordSalt: c.salt };
      })(),
    },
  ];

  const profiles: ProfessionalProfile[] = [
    {
      memberId: 'u-amina',
      headline: 'Fondatrice & CEO — Paiements transfrontaliers UEMOA',
      bio: 'Nous simplifions les encaissements B2B entre la diaspora européenne et les PME d’Afrique de l’Ouest. Ouverte aux partenariats bancaires et co-investisseurs.',
      sectors: ['Fintech', 'Paiements B2B'],
      skills: ['Stratégie Réglementaire BCEAO', 'Architecture Paiement', 'Levée Série A'],
      activeCountries: ['Sénégal', 'Côte d’Ivoire', 'France'],
      languages: ['Français', 'Anglais', 'Wolof'],
      collaborationNeeds: ['Co-investissement', 'Partenaires Distribution'],
      updatedAt: '2026-11-15T10:00:00.000Z',
    },
    {
      memberId: 'u-kwame',
      headline: 'Associé Gérant — Capital-risque Diaspora & Amorçage',
      bio: 'Fonds d’amorçage dédié aux infrastructures logistiques, énergie propre et logiciels B2B entre Londres, Accra et Abidjan.',
      sectors: ['Capital-Risque', 'Logistique'],
      skills: ['Due Diligence', 'Structuration Financière', 'Expansion Marché'],
      activeCountries: ['Royaume-Uni', 'Ghana', 'Côte d’Ivoire'],
      languages: ['Français', 'Anglais'],
      collaborationNeeds: ['Deal-flow Qualifié', 'Co-investisseurs'],
      updatedAt: '2026-11-12T15:00:00.000Z',
    },
    {
      memberId: 'u-moussa',
      headline: 'Consultant Export & Agro-Transformation',
      bio: 'Accompagnement des coopératives agricoles vers les marchés européens et certification biologique.',
      sectors: ['Agro-industrie', 'Export'],
      skills: ['Supply Chain', 'Certification UE'],
      activeCountries: ['France', 'Mali', 'Sénégal'],
      languages: ['Français'],
      collaborationNeeds: ['Clients B2B', 'Mentorat'],
      updatedAt: '2026-11-10T11:00:00.000Z',
    },
    {
      memberId: 'u-orga',
      headline: 'Organisateur — Sommets Agro-Industrie & Export Afrique de l’Ouest',
      bio: 'Coordination de forums économiques et mise en relation des coopératives ivoiriennes avec des partenaires industriels.',
      sectors: ['Agro-industrie', 'Export'],
      skills: ['Organisation de Sommets', 'Partenariats B2B'],
      activeCountries: ['Côte d’Ivoire', 'Sénégal', 'France'],
      languages: ['Français', 'Anglais'],
      collaborationNeeds: ['Sponsors', 'Fournisseurs Industriels'],
      updatedAt: '2026-11-14T10:00:00.000Z',
    },
    {
      memberId: 'u-fatou',
      headline: 'Directrice Produit IA & EdTech — Montréal / Dakar',
      bio: 'Plateformes de formation professionnelle certifiante adaptées aux connexions bas débit en Afrique francophone.',
      sectors: ['EdTech', 'Intelligence Artificielle'],
      skills: ['Produit Mobile Offline', 'Partenariats Institutionnels'],
      activeCountries: ['Canada', 'Sénégal', 'Rwanda'],
      languages: ['Français', 'Anglais'],
      collaborationNeeds: ['Partenaires Techniques', 'Distribution'],
      updatedAt: '2026-11-14T09:30:00.000Z',
    },
    {
      memberId: 'u-chidi',
      headline: 'Co-fondateur — Alara Venture Studio Lagos',
      bio: 'Studio de création de startups Fintech et Commerce B2B opérant au Nigeria et en Afrique de l’Est.',
      sectors: ['Fintech', 'Commerce B2B'],
      skills: ['Ingénierie Core Banking', 'Croissance B2B'],
      activeCountries: ['Nigeria', 'Kenya'],
      languages: ['Anglais', 'Français'],
      collaborationNeeds: ['Partenaires Francophones', 'Investisseurs'],
      updatedAt: '2026-11-16T14:00:00.000Z',
    },
  ];

  const enterprises: EnterprisePage[] = [
    {
      id: 'ent-payteranga',
      ownerId: 'u-amina',
      name: 'PayTeranga SAS',
      description: 'Infrastructure de règlement instantané multi-devises EUR/XOF pour PME exportatrices et prestataires de services.',
      sector: 'Fintech',
      country: 'Sénégal',
      city: 'Dakar',
      services: ['API Encaissement B2B', 'Trésorerie Multi-devises', 'Conformité KYC/AML'],
      websiteUrl: 'https://payteranga.example.com',
      linkedinUrl: 'https://linkedin.com/company/payteranga',
      verified: true,
      viewsCount: 218,
    },
    {
      id: 'ent-diasporavc',
      ownerId: 'u-kwame',
      name: 'Diaspora Ventures Partners',
      description: 'Véhicule d’investissement seed & pre-seed reliant les capitaux de la diaspora aux bâtisseurs technologiques africains.',
      sector: 'Capital-Risque',
      country: 'Royaume-Uni',
      city: 'Londres',
      services: ['Tickets 50k–400k €', 'Programme Go-to-Market Europe/Afrique'],
      websiteUrl: 'https://diasporaventures.example.com',
      verified: true,
      viewsCount: 165,
    },
    {
      id: 'ent-alara',
      ownerId: 'u-chidi',
      name: 'Alara Venture Studio',
      description: 'Venture studio accompagnant les fondateurs Fintech de l’idée au premier million de volume mensuel.',
      sector: 'Fintech',
      country: 'Nigeria',
      city: 'Lagos',
      services: ['Co-fondation technique', 'Accès licence PSP'],
      verified: true,
      viewsCount: 110,
    },
  ];

  const events: BusinessEvent[] = [
    {
      id: 'evt-dakar',
      organizerId: 'u-admin',
      organizerName: 'Africa Entrepreneur · Sommets',
      title: 'Dakar Business Summit 2026',
      publicSummary: 'Rencontre annuelle des fondateurs Fintech, investisseurs diaspora et institutions financières d’Afrique de l’Ouest.',
      fullDescription:
        'Deux jours de tables rondes à huis clos, sessions de deal-room 1-à-1 entre fondateurs Série A et fonds diaspora, et ateliers sur l’interopérabilité des paiements UEMOA. Inclut l’accès au salon investisseurs et au dîner exécutif sur la Corniche.',
      dateIso: '2026-12-14T09:00:00.000Z',
      country: 'Sénégal',
      city: 'Dakar',
      sector: 'Fintech',
      format: 'hybrid',
      venueAddress: 'Pavillon Corniche Ouest, Route des Almadies, Dakar',
      virtualLink: 'https://visio.africaentrepreneur.com/room/dakar-summit-2026',
      capacity: 120,
      registeredCount: 85,
      feeEur: 0,
      imageUrl: '/src/assets/images/event_dakar_summit_1795137733263.jpg',
      status: 'published',
      highlights: [
        '18 fonds d’investissement actifs Afrique & Europe présents',
        'Sessions de pitch privées de 15 minutes pré-planifiées',
        'Traduction simultanée Français / Anglais incluse',
      ],
    },
    {
      id: 'evt-paris',
      organizerId: 'u-admin',
      organizerName: 'Cercle Diaspora Europe',
      title: 'Forum Diaspora Executive Paris',
      publicSummary: 'Soirée exécutive de mise en relation entre dirigeants de la diaspora en Europe et porteurs de projets industriels.',
      fullDescription:
        'Rencontre stratégique réunissant 80 décideurs, dirigeants de PME et business angels basés à Paris, Bruxelles et Londres. Focus sur le co-investissement industriel, l’énergie décentralisée et les chaînes d’approvisionnement Afrique-Europe.',
      dateIso: '2026-12-22T18:30:00.000Z',
      country: 'France',
      city: 'Paris',
      sector: 'Capital-Risque',
      format: 'in_person',
      venueAddress: 'Salon Haussmann Panorama, 42 Boulevard Haussmann, 75009 Paris',
      virtualLink: '',
      capacity: 80,
      registeredCount: 62,
      feeEur: 35,
      imageUrl: '/src/assets/images/event_paris_diaspora_1795137736001.jpg',
      status: 'published',
      highlights: [
        'Rencontres qualifiées par secteur avant l’événement',
        'Cocktail dînatoire & présentation de 6 projets vérifiés',
      ],
    },
    {
      id: 'evt-lagos',
      organizerId: 'u-admin',
      organizerName: 'Alara Venture Studio',
      title: 'Lagos Fintech & Venture Studio Day',
      publicSummary: 'Immersion pratique au cœur de l’écosystème Fintech de Lagos : paiements, crédit PME et expansion francophone.',
      fullDescription:
        'Journée dédiée aux ponts technologiques et commerciaux entre le Nigeria et l’espace UEMOA/CEMAC. Démonstrations techniques, revue réglementaire et rencontres directes avec les équipes produit d’Alara.',
      dateIso: '2027-01-16T10:00:00.000Z',
      country: 'Nigeria',
      city: 'Lagos',
      sector: 'Fintech',
      format: 'in_person',
      venueAddress: 'Alara Studio, Victoria Island, Plot 14 Adeola Odeku, Lagos',
      virtualLink: '',
      capacity: 60,
      registeredCount: 41,
      feeEur: 0,
      imageUrl: '/src/assets/images/event_lagos_fintech_1795137735619.jpg',
      status: 'published',
      highlights: [
        'Table ronde expansion Lagos → Abidjan & Dakar',
        'Clinique architecture API & conformité transfrontalière',
      ],
    },
    {
      id: 'evt-abidjan',
      organizerId: 'u-orga',
      organizerName: 'Réseau Agro-Industrie CI',
      title: 'Abidjan AgriTech & Export Connect',
      publicSummary: 'Webinaire opérationnel sur le financement des chaînes agricoles et la transformation locale en Côte d’Ivoire.',
      fullDescription:
        'Session en ligne interactive avec les acteurs de la transformation cacao/anacarde, fournisseurs d’équipements solaires agricoles et acheteurs européens.',
      dateIso: '2027-01-28T15:00:00.000Z',
      country: 'Côte d’Ivoire',
      city: 'Abidjan',
      sector: 'Agro-industrie',
      format: 'virtual',
      venueAddress: 'En ligne (lien sécurisé fourni aux inscrits)',
      virtualLink: 'https://visio.africaentrepreneur.com/room/abidjan-agritech',
      capacity: 200,
      registeredCount: 112,
      feeEur: 0,
      imageUrl: '/src/assets/images/event_abidjan_agritech_1795139286689.jpg',
      status: 'published',
      highlights: [
        'Contrats d’approvisionnement directs avec acheteurs UE',
        'Replay chiffré accessible 30 jours aux abonnés inscrits',
      ],
    },
    ...extraSeedEvents(),
  ];

  const networks: ProfessionalNetwork[] = [
    {
      id: 'net-fintech',
      name: 'Cercle Fintech UEMOA & Diaspora',
      publicSummary: 'Collectif de fondateurs, responsables conformité et investisseurs bâtissant les rails financiers africains.',
      fullDescription:
        'Échanges mensuels confidentiels sur les agréments BCEAO/COBAC, partenariats bancaires correspondants en Europe et partage de retours d’expérience réglementaires.',
      countries: ['Sénégal', 'Côte d’Ivoire', 'France', 'Royaume-Uni'],
      sectors: ['Fintech', 'Paiements B2B'],
      contactEmail: 'fintech-cercle@africaentrepreneur.com',
      memberCount: 148,
      status: 'published',
      imageUrl: '/src/assets/images/event_lagos_fintech_1795137735619.jpg',
    },
    {
      id: 'net-women',
      name: 'Femmes Dirigeantes Afrique-Europe',
      publicSummary: 'Réseau de dirigeantes et fondatrices développant des entreprises à fort impact entre le continent et la diaspora.',
      fullDescription:
        'Mentorat croisé entre CEO confirmées et créatrices d’entreprise, accès privilégié aux appels à projets et cercles d’entraide sectoriels.',
      countries: ['Sénégal', 'Canada', 'France', 'Maroc'],
      sectors: ['Tech', 'Industrie', 'Services'],
      contactEmail: 'dirigeantes@africaentrepreneur.com',
      memberCount: 215,
      status: 'published',
      imageUrl: '/src/assets/images/event_paris_diaspora_1795137736001.jpg',
    },
    {
      id: 'net-angels',
      name: 'Investisseurs & Business Angels Diaspora',
      publicSummary: 'Syndicat de cadres et entrepreneurs de la diaspora co-investissant en amorçage sur des projets vérifiés.',
      fullDescription:
        'Accès à un flux mensuel de 4 dossiers audités, partage des mémos d’investissement et co-investissement dès 5 000 € par opération.',
      countries: ['France', 'Royaume-Uni', 'Canada', 'États-Unis'],
      sectors: ['Capital-Risque', 'Énergie', 'Logistique'],
      contactEmail: 'angels@africaentrepreneur.com',
      memberCount: 94,
      status: 'published',
      imageUrl: '/src/assets/images/event_dakar_summit_1795137733263.jpg',
    },
    ...extraSeedNetworks(),
  ];

  const registrations: EventRegistration[] = [
    {
      id: 'reg-1',
      eventId: 'evt-dakar',
      memberId: 'u-amina',
      status: 'confirmed',
      confirmationCode: 'AE-DKR-8421',
      sessionSlot: 'Deal-Room (11:30)',
      createdAt: '2026-11-12T10:20:00.000Z',
    },
    {
      id: 'reg-2',
      eventId: 'evt-abidjan',
      memberId: 'u-amina',
      status: 'confirmed',
      confirmationCode: 'AE-ABI-4410',
      sessionSlot: 'Plénière (09:00)',
      createdAt: '2026-11-16T11:00:00.000Z',
    },
    {
      id: 'reg-3',
      eventId: 'evt-abidjan',
      memberId: 'u-kwame',
      status: 'confirmed',
      confirmationCode: 'AE-ABI-5102',
      sessionSlot: 'Atelier Export (14:30)',
      createdAt: '2026-11-17T09:15:00.000Z',
    },
  ];

  const payments: PaymentRecord[] = [
    {
      id: 'pay-1',
      memberId: 'u-amina',
      plan: 'annual',
      amountEur: 180,
      currency: 'EUR',
      status: 'succeeded',
      paymentMethodLabel: 'Visa •••• 4242',
      idempotencyKey: 'seed-pay-amina-annual',
      receiptNumber: 'REC-2026-0091',
      createdAt: '2026-09-01T09:00:00.000Z',
    },
    {
      id: 'pay-2',
      memberId: 'u-kwame',
      plan: 'monthly',
      amountEur: 19,
      currency: 'EUR',
      status: 'succeeded',
      paymentMethodLabel: 'Mastercard •••• 8562',
      idempotencyKey: 'seed-pay-kwame-monthly',
      receiptNumber: 'REC-2026-0412',
      createdAt: '2026-11-01T09:00:00.000Z',
    },
  ];

  const subscriptionLogs: SubscriptionEventLog[] = [
    {
      id: 'sublog-1',
      memberId: 'u-amina',
      eventType: 'activated',
      plan: 'annual',
      details: 'Activation Abonnement Annuel (180 € · Visa •••• 4242)',
      createdAt: '2026-09-01T09:00:00.000Z',
    },
    {
      id: 'sublog-2',
      memberId: 'u-kwame',
      eventType: 'activated',
      plan: 'monthly',
      details: 'Activation Abonnement Mensuel (19 € · Mastercard •••• 8562)',
      createdAt: '2026-11-01T09:00:00.000Z',
    },
  ];

  const connections: ContactConnection[] = [
    {
      id: 'conn-1',
      senderId: 'u-kwame',
      recipientId: 'u-amina',
      introMessage: 'Bonjour Amina, impressionné par l’expansion de PayTeranga. Échangeons avant le sommet de Dakar.',
      status: 'accepted',
      createdAt: '2026-11-10T14:00:00.000Z',
      updatedAt: '2026-11-10T16:15:00.000Z',
    },
    {
      id: 'conn-2',
      senderId: 'u-fatou',
      recipientId: 'u-amina',
      introMessage: 'Bonjour Amina ! Nous déployons nos modules EdTech hors ligne au Sénégal, ravi d’échanger.',
      status: 'pending',
      createdAt: '2026-11-18T11:30:00.000Z',
      updatedAt: '2026-11-18T11:30:00.000Z',
    },
  ];

  const sharedAminaKwame = await deriveSharedSecretKey(kwameKp.privateKeyJwk, aminaKp.publicKeyJwk);
  const env1 = await encryptPayloadE2EE(
    { text: 'Bonjour Amina ! Nous préparons une enveloppe co-investissement Fintech pour Q1 2027. Disponible à Dakar le 14 décembre ?' },
    sharedAminaKwame
  );
  const env2 = await encryptPayloadE2EE(
    { text: 'Bonjour Kwame, avec plaisir ! Je serai au Pavillon Corniche dès 9h. Je vous envoie notre deck chiffré en séance.' },
    sharedAminaKwame
  );

  const convId = ['u-amina', 'u-kwame'].sort().join('__');
  const messages: EncryptedMessageRecord[] = [
    {
      id: 'msg-seed-1',
      conversationId: convId,
      senderId: 'u-kwame',
      recipientId: 'u-amina',
      senderPubKey: kwameKp.publicKeyJwk,
      envelope: env1,
      mediaType: 'text',
      clientMutationId: 'seed-msg-1',
      readAt: '2026-11-18T09:20:00.000Z',
      createdAt: '2026-11-18T09:15:00.000Z',
    },
    {
      id: 'msg-seed-2',
      conversationId: convId,
      senderId: 'u-amina',
      recipientId: 'u-kwame',
      senderPubKey: aminaKp.publicKeyJwk,
      envelope: env2,
      mediaType: 'text',
      clientMutationId: 'seed-msg-2',
      readAt: '2026-11-18T09:26:00.000Z',
      createdAt: '2026-11-18T09:24:00.000Z',
    },
  ];

  const notifications: AppNotification[] = [
    {
      id: 'notif-1',
      memberId: 'u-amina',
      kind: 'connection',
      title: 'Nouvelle demande de contact',
      body: 'Fatou Ndiaye (Montréal) souhaite rejoindre votre réseau.',
      read: false,
      createdAt: '2026-11-18T11:30:00.000Z',
    },
    {
      id: 'notif-2',
      memberId: 'u-amina',
      kind: 'registration',
      title: 'Inscription confirmée',
      body: 'Votre place pour Dakar Business Summit 2026 est confirmée (AE-DKR-8421).',
      read: true,
      createdAt: '2026-11-12T10:20:00.000Z',
    },
  ];

  const reports: ModerationReport[] = [
    {
      id: 'rep-1',
      reporterId: 'u-kwame',
      targetType: 'member',
      targetId: 'u-chidi',
      reason: 'Vérification souhaitée de la fiche entreprise avant mise en avant.',
      status: 'open',
      createdAt: '2026-11-17T16:00:00.000Z',
    },
  ];

  const auditLogs: AdminAuditLog[] = [
    {
      id: 'aud-1',
      actorId: 'u-admin',
      actorEmail: 'admin@africaentrepreneur.com',
      action: 'PUBLISH_EVENT',
      target: 'evt-dakar',
      details: 'Publication de Dakar Business Summit 2026 (capacité 120)',
      createdAt: '2026-11-10T08:00:00.000Z',
    },
  ];

  return {
    members,
    profiles,
    enterprises,
    events,
    networks,
    opportunities: defaultOpportunities(),
    groups: defaultGroups(),
    groupMessages: defaultGroupMessages(),
    registrations,
    payments,
    subscriptionLogs,
    connections,
    messages,
    notifications,
    reports,
    auditLogs,
    blocks: [],
    sessions: [],
    scannedBadges: [],
  };
}

let cachedDb: DatabaseState | null = null;

export async function loadDb(): Promise<DatabaseState> {
  if (cachedDb) return cachedDb;
  try {
    fs.mkdirSync(activeDataDir, { recursive: true });
  } catch {
    activeDataDir = FALLBACK_DATA_DIR;
    try {
      fs.mkdirSync(activeDataDir, { recursive: true });
    } catch {
      // Ignore if strictly read-only
    }
  }
  const dbPath = fs.existsSync(path.join(activeDataDir, 'db.json'))
    ? path.join(activeDataDir, 'db.json')
    : path.join(DATA_DIR, 'db.json');
  if (fs.existsSync(dbPath)) {
    try {
      const raw = fs.readFileSync(dbPath, 'utf-8');
      const parsed = JSON.parse(raw) as DatabaseState;
      let dirty = false;

      if (!Array.isArray(parsed.opportunities) || parsed.opportunities.length === 0) {
        parsed.opportunities = defaultOpportunities();
        dirty = true;
      } else {
        for (const opp of defaultOpportunities()) {
          if (!parsed.opportunities.some((existing) => existing.id === opp.id)) {
            parsed.opportunities.push(opp);
            dirty = true;
          }
        }
      }
      if (!Array.isArray(parsed.groups) || parsed.groups.length === 0) {
        parsed.groups = defaultGroups();
        dirty = true;
      } else {
        for (const grp of defaultGroups()) {
          if (!parsed.groups.some((existing) => existing.id === grp.id)) {
            parsed.groups.push(grp);
            dirty = true;
          }
        }
      }
      if (!Array.isArray(parsed.events)) {
        parsed.events = [];
        dirty = true;
      }
      for (const seedEv of extraSeedEvents()) {
        if (!parsed.events.some((existing) => existing.id === seedEv.id)) {
          parsed.events.push(seedEv);
          dirty = true;
        }
      }
      if (!Array.isArray(parsed.networks)) {
        parsed.networks = [];
        dirty = true;
      }
      for (const seedNet of extraSeedNetworks()) {
        if (!parsed.networks.some((existing) => existing.id === seedNet.id)) {
          parsed.networks.push(seedNet);
          dirty = true;
        }
      }
      if (!parsed.groupMessages || parsed.groupMessages.length === 0) {
        parsed.groupMessages = defaultGroupMessages();
        dirty = true;
      }
      if (!parsed.subscriptionLogs || parsed.subscriptionLogs.length === 0) {
        parsed.subscriptionLogs = [
          {
            id: 'slog-seed-1',
            memberId: 'u-amina',
            eventType: 'activated',
            plan: 'annual',
            details: 'Abonnement Annuel activé (REC-2026-8841)',
            createdAt: '2026-09-01T10:00:00.000Z',
          },
          {
            id: 'slog-seed-2',
            memberId: 'u-kwame',
            eventType: 'activated',
            plan: 'monthly',
            details: 'Abonnement Mensuel activé (REC-2026-9104)',
            createdAt: '2026-09-12T10:00:00.000Z',
          },
        ];
        dirty = true;
      }
      if (parsed.registrations && !parsed.registrations.some((r) => r.eventId === 'evt-abidjan')) {
        parsed.registrations.push(
          {
            id: 'reg-2',
            eventId: 'evt-abidjan',
            memberId: 'u-amina',
            status: 'confirmed',
            confirmationCode: 'AE-ABI-4410',
            sessionSlot: 'Deal-Room',
            createdAt: '2026-10-08T14:20:00.000Z',
          },
          {
            id: 'reg-3',
            eventId: 'evt-abidjan',
            memberId: 'u-kwame',
            status: 'confirmed',
            confirmationCode: 'AE-ABI-5102',
            sessionSlot: 'Atelier Export',
            createdAt: '2026-10-10T09:15:00.000Z',
          }
        );
        dirty = true;
      }

      if (!parsed.members.some((m) => m.id === 'u-orga')) {
        const orgaKp = await generateIdentityKeyPair();
        const orgaWrapped = await wrapPrivateKeyWithPassphrase(orgaKp.privateKeyJwk, 'Africa2026!', 10000);
        const c = hashPassword('Africa2026!');
        parsed.members.push({
          id: 'u-orga',
          email: 'orga@africaentrepreneur.com',
          emailVerified: true,
          fullName: 'Seydou Keïta (Organisateur)',
          role: 'organizer',
          subscriptionStatus: 'active',
          subscriptionPlan: 'annual',
          subscriptionStart: '2026-08-01T08:00:00.000Z',
          subscriptionEnd: '2027-08-01T08:00:00.000Z',
          autoRenew: true,
          country: 'Côte d’Ivoire',
          city: 'Abidjan',
          language: 'fr',
          publicKeyJwk: orgaKp.publicKeyJwk,
          wrappedPrivateKey: orgaWrapped,
          keyFingerprint: orgaKp.fingerprint,
          visibility: 'public_subscribers',
          notificationsEnabled: true,
          profileViews: 76,
          createdAt: '2026-08-01T08:00:00.000Z',
          passwordHash: c.hash,
          passwordSalt: c.salt,
        });
        dirty = true;
      }

      for (const m of parsed.members || []) {
        if (m.id === 'u-fatou' && !m.avatarUrl) {
          m.avatarUrl = '/src/assets/images/avatar_fatou_1795139287344.jpg';
          dirty = true;
        }
        if (m.id === 'u-chidi' && !m.avatarUrl) {
          m.avatarUrl = '/src/assets/images/avatar_chidi_1795139287332.jpg';
          dirty = true;
        }
        if (m.autoRenew === undefined) {
          m.autoRenew = m.subscriptionStatus === 'active';
          dirty = true;
        }
        if (m.profileViews === undefined) {
          m.profileViews = m.subscriptionStatus === 'active' ? 65 : 0;
          dirty = true;
        }
        if (!Array.isArray(m.favoriteEventIds)) {
          m.favoriteEventIds = [];
          dirty = true;
        }
        if (m.calendarSyncEnabled === undefined) {
          m.calendarSyncEnabled = false;
          dirty = true;
        }
        if (!m.calendarSyncScope) {
          m.calendarSyncScope = 'all_saved';
          dirty = true;
        }
      }
      for (const ev of parsed.events || []) {
        if (ev.id === 'evt-abidjan' && !ev.imageUrl) {
          ev.imageUrl = '/src/assets/images/event_abidjan_agritech_1795139286689.jpg';
          dirty = true;
        }
        if (ev.id === 'evt-abidjan' && ev.organizerId === 'u-admin') {
          ev.organizerId = 'u-orga';
          dirty = true;
        }
      }
      if (!Array.isArray(parsed.scannedBadges)) {
        parsed.scannedBadges = [];
        dirty = true;
      }
      cachedDb = parsed;
      if (dirty) saveDb(cachedDb);
      return cachedDb;
    } catch {
      // Fallback to fresh seed if corrupted
    }
  }
  cachedDb = await createInitialSeed();
  saveDb(cachedDb);
  return cachedDb;
}

export function saveDb(db: DatabaseState): void {
  cachedDb = db;
  const writeTo = (dir: string) => {
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, 'db.json');
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tmp, target);
  };
  try {
    writeTo(activeDataDir);
  } catch {
    try {
      activeDataDir = FALLBACK_DATA_DIR;
      writeTo(activeDataDir);
    } catch {
      // Keep in-memory state if filesystem is strictly read-only
    }
  }
}
