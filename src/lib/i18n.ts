import type { OpportunityCategory, UserRole } from '../types/domain';
import { findCountryMeta } from './worldMap';

export type AppLanguage = 'fr' | 'en';

export const UI_COPY: Record<
  AppLanguage,
  {
    navHome: string;
    navCatalogue: string;
    navOffers: string;
    navDirectory: string;
    navMessages: string;
    navOrganizer: string;
    navAdmin: string;
    topTitleHome: string;
    topTitleCatalogue: string;
    topTitleSubscription: string;
    topTitleDirectory: string;
    topTitleMessages: string;
    topTitleOrganizer: string;
    topTitleAdmin: string;
    connect: string;
    connectOrRegister: string;
    switchAccount: string;
    accountShort: string;
    logout: string;
    offlineBanner: string;
    syncingBanner: string;
    disclaimer: string;
    e2eeBadge: string;
    greeting: string;
    visitorSubtitle: string;
    overviewTitle: string;
    quickAccessTitle: string;
    myRegistrationsTitle: string;
    opportunitiesTab: string;
    eventsTab: string;
    networksTab: string;
    favoritesTab: string;
    myFavoritesTitle: string;
    noFavoritesText: string;
    favoriteBtn: string;
    favoritedBtn: string;
    searchPlaceholder: string;
    networkingTrendsTitle: string;
    networkingTrendsSub: string;
    scanBadgeBtn: string;
    scannedBadgesTitle: string;
    reminder30mTitle: string;
    reminder30mDesc: string;
    reminderEnableBtn: string;
    reminderActiveLabel: string;
    reminderPermissionDenied: string;
    reminderTestBtn: string;
    reminderBadgeLabel: string;
    addToCalendarBtn: string;
    shareBtn: string;
    recommendedTitle: string;
    recommendedSub: string;
    manualSyncBtn: string;
    manualSyncBusy: string;
    manualSyncSuccess: string;
    manualSyncStillOffline: string;
    manualSyncUpToDate: string;
    lightThemeLabel: string;
    darkThemeLabel: string;
    notificationsTitle: string;
    noNotifications: string;
  }
> = {
  fr: {
    navHome: 'Accueil',
    navCatalogue: 'Catalogue',
    navOffers: 'Offres',
    navDirectory: 'Réseau',
    navMessages: 'Messages',
    navOrganizer: 'Organisateur',
    navAdmin: 'Administration',
    topTitleHome: 'Découverte & Aperçu',
    topTitleCatalogue: 'Événements, Réseaux & Opportunités',
    topTitleSubscription: 'Formules & Facturation',
    topTitleDirectory: 'Annuaire & Fiche Entrepreneur',
    topTitleMessages: 'Messagerie Chiffrée E2EE & Cercles',
    topTitleOrganizer: 'Espace Organisateur & Participants',
    topTitleAdmin: 'Administration & Modération',
    connect: 'Connexion',
    connectOrRegister: 'Connexion / Inscription',
    switchAccount: 'Changer de compte',
    accountShort: 'Compte',
    logout: 'Se déconnecter',
    offlineBanner: 'Mode hors ligne actif — Données chiffrées en cache local.',
    syncingBanner: 'Synchronisation des actions en attente...',
    disclaimer:
      'Africa Entrepreneur — Outil de mise en relation professionnelle. Aucune intermédiation financière entre membres ni garantie de transaction.',
    e2eeBadge: 'E2EE ECDH P-256 · Mode hors ligne actif',
    greeting: 'Bonjour,',
    visitorSubtitle: 'Afrique & Diaspora · Réseau chiffré E2EE',
    overviewTitle: 'Vue d’ensemble',
    quickAccessTitle: 'Accès rapide',
    myRegistrationsTitle: 'Mes inscriptions confirmées',
    opportunitiesTab: 'Opportunités',
    eventsTab: 'Événements',
    networksTab: 'Réseaux',
    favoritesTab: 'Favoris',
    myFavoritesTitle: 'Mes événements favoris',
    noFavoritesText: 'Appuyez sur le cœur d’un événement pour l’enregistrer dans votre liste dédiée.',
    favoriteBtn: 'Favoris',
    favoritedBtn: 'En favoris',
    searchPlaceholder: 'Rechercher par mot-clé, lieu (ville, pays) ou hôte / organisateur...',
    networkingTrendsTitle: 'Tendances de réseautage',
    networkingTrendsSub: 'Connexions et interactions professionnelles sur 30 jours',
    scanBadgeBtn: 'Scanner badge',
    scannedBadgesTitle: 'Badges scannés en présentiel',
    reminder30mTitle: 'Rappels Push locaux (30 min avant)',
    reminder30mDesc:
      'Alerte locale via Service Worker 30 min avant le début de chaque événement favori, même en arrière-plan.',
    reminderEnableBtn: 'Activer rappels 30 min',
    reminderActiveLabel: 'Rappels 30 min actifs (arrière-plan)',
    reminderPermissionDenied: 'Notifications bloquées dans le navigateur',
    reminderTestBtn: 'Tester l’alerte',
    reminderBadgeLabel: 'Rappel 30 min',
    addToCalendarBtn: 'Ajouter à mon calendrier',
    shareBtn: 'Partager',
    recommendedTitle: 'Sélection recommandée',
    recommendedSub: 'Rencontres sélectionnées selon votre secteur et vos corridors',
    manualSyncBtn: 'Synchroniser manuellement',
    manualSyncBusy: 'Synchronisation...',
    manualSyncSuccess: 'Synchronisation réussie',
    manualSyncStillOffline: 'Réseau indisponible · Actions conservées localement',
    manualSyncUpToDate: 'Cache local à jour',
    lightThemeLabel: 'Thème clair',
    darkThemeLabel: 'Thème sombre',
    notificationsTitle: 'Notifications',
    noNotifications: 'Aucune notification récente.',
  },
  en: {
    navHome: 'Home',
    navCatalogue: 'Catalog',
    navOffers: 'Plans',
    navDirectory: 'Network',
    navMessages: 'Messages',
    navOrganizer: 'Organizer',
    navAdmin: 'Admin',
    topTitleHome: 'Discovery & Overview',
    topTitleCatalogue: 'Events, Networks & Opportunities',
    topTitleSubscription: 'Plans & Billing',
    topTitleDirectory: 'Directory & Founder Profile',
    topTitleMessages: 'E2EE Messaging & Circles',
    topTitleOrganizer: 'Organizer Workspace & Attendees',
    topTitleAdmin: 'Administration & Moderation',
    connect: 'Sign in',
    connectOrRegister: 'Sign in / Sign up',
    switchAccount: 'Switch account',
    accountShort: 'Account',
    logout: 'Sign out',
    offlineBanner: 'Offline mode active — Encrypted data cached locally.',
    syncingBanner: 'Syncing pending actions...',
    disclaimer:
      'Africa Entrepreneur — Professional networking platform. No member-to-member financial intermediation or transaction guarantee.',
    e2eeBadge: 'E2EE ECDH P-256 · Offline ready',
    greeting: 'Welcome back,',
    visitorSubtitle: 'Africa & Diaspora · E2EE Encrypted Network',
    overviewTitle: 'Overview',
    quickAccessTitle: 'Quick Access',
    myRegistrationsTitle: 'My Confirmed Registrations',
    opportunitiesTab: 'Opportunities',
    eventsTab: 'Events',
    networksTab: 'Networks',
    favoritesTab: 'Favorites',
    myFavoritesTitle: 'My Favorite Events',
    noFavoritesText: 'Tap the heart on any event to save it into your dedicated list.',
    favoriteBtn: 'Favorite',
    favoritedBtn: 'Saved',
    searchPlaceholder: 'Search by keyword, location (city, country), or host name...',
    networkingTrendsTitle: 'Networking Trends',
    networkingTrendsSub: 'Connections and professional interactions over the last 30 days',
    scanBadgeBtn: 'Scan badge',
    scannedBadgesTitle: 'Scanned Event Badges',
    reminder30mTitle: 'Local Push Reminders (30 min before)',
    reminder30mDesc:
      'Service Worker local alerts 30 minutes before saved favorite events start, even in the background.',
    reminderEnableBtn: 'Enable 30m alerts',
    reminderActiveLabel: '30m background alerts active',
    reminderPermissionDenied: 'Notifications blocked in browser settings',
    reminderTestBtn: 'Test alert',
    reminderBadgeLabel: '30m alert',
    addToCalendarBtn: 'Add to my calendar',
    shareBtn: 'Share',
    recommendedTitle: 'Recommended for You',
    recommendedSub: 'Curated gatherings matched to your sector and corridors',
    manualSyncBtn: 'Manual sync',
    manualSyncBusy: 'Syncing...',
    manualSyncSuccess: 'Sync complete',
    manualSyncStillOffline: 'Network unavailable · Queued locally',
    manualSyncUpToDate: 'Local cache up to date',
    lightThemeLabel: 'Light mode',
    darkThemeLabel: 'Dark mode',
    notificationsTitle: 'Notifications',
    noNotifications: 'No recent notifications.',
  },
};

const SECTOR_TRANSLATIONS: Record<string, string> = {
  Tech: 'Tech',
  Agriculture: 'Agriculture',
  Artisanat: 'Crafts & Artisanship',
  'Événementiel': 'Events & Production',
  BTT: 'Construction & Civil (BTT)',
  Architecture: 'Architecture',
  Design: 'Design',
  Fintech: 'Fintech',
  'Capital-Risque': 'Venture Capital',
  'Agro-industrie': 'Agri-Business',
  Industrie: 'Industry',
  Services: 'Services',
  'Énergie': 'Energy',
  Logistique: 'Logistics',
  'Paiements B2B': 'B2B Payments',
  EdTech: 'EdTech',
  'Intelligence Artificielle': 'Artificial Intelligence',
  'Commerce B2B': 'B2B Commerce',
  Entrepreneuriat: 'Entrepreneurship',
};

export function translateSector(sector: string, lang: AppLanguage): string {
  if (lang === 'fr') return sector;
  return SECTOR_TRANSLATIONS[sector] || sector;
}

export function translateFormat(format: 'in_person' | 'hybrid' | 'virtual', lang: AppLanguage): string {
  if (lang === 'en') {
    if (format === 'hybrid') return 'Hybrid';
    if (format === 'virtual') return 'Online';
    return 'In-Person';
  }
  if (format === 'hybrid') return 'Hybride';
  if (format === 'virtual') return 'En ligne';
  return 'Présentiel';
}

export function translateCountry(country: string, lang: AppLanguage): string {
  if (lang === 'fr') return country;
  return findCountryMeta(country)?.nameEn || country;
}

export function translateRole(
  role: UserRole,
  subscriptionStatus: string,
  lang: AppLanguage
): string {
  if (lang === 'en') {
    if (role === 'admin') return 'Admin';
    if (role === 'organizer') return 'Organizer';
    return subscriptionStatus === 'active' ? 'Active Member' : 'Personal Account';
  }
  if (role === 'admin') return 'Admin';
  if (role === 'organizer') return 'Organisateur';
  return subscriptionStatus === 'active' ? 'Abonné actif' : 'Compte Personnel';
}

export function translateOppCategory(cat: OpportunityCategory, lang: AppLanguage): string {
  if (lang === 'en') {
    switch (cat) {
      case 'co_investment':
        return 'Co-Investment';
      case 'commercial_partner':
        return 'Commercial Partner';
      case 'supplier':
        return 'Supplier / Equipment';
      case 'call_for_projects':
        return 'Call for Projects';
    }
  }
  switch (cat) {
    case 'co_investment':
      return 'Co-investissement';
    case 'commercial_partner':
      return 'Partenaire commercial';
    case 'supplier':
      return 'Fournisseur / Équipement';
    case 'call_for_projects':
      return 'Appel à projets';
  }
}

export function localeForLang(lang: AppLanguage): string {
  return lang === 'en' ? 'en-US' : 'fr-FR';
}

export function readStoredLanguage(): AppLanguage {
  if (typeof window === 'undefined') return 'fr';
  try {
    const saved = window.localStorage.getItem('ae_lang');
    if (saved === 'en' || saved === 'fr') return saved;
  } catch {
    // Ignore storage errors
  }
  return 'fr';
}
