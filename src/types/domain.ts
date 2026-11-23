export type UserRole = 'visitor' | 'personnel' | 'subscriber' | 'organizer' | 'admin';

export type SubscriptionPlan = 'monthly' | 'annual';
export type SubscriptionStatus = 'none' | 'active' | 'cancelled' | 'expired' | 'past_due';

export type CalendarSyncScope = 'all_saved' | 'registered_only' | 'favorites_only';

export interface MemberAccount {
  id: string;
  email: string;
  emailVerified: boolean;
  fullName: string;
  role: UserRole;
  subscriptionStatus: SubscriptionStatus;
  subscriptionPlan?: SubscriptionPlan;
  subscriptionStart?: string;
  subscriptionEnd?: string;
  autoRenew?: boolean;
  country: string;
  city: string;
  language: 'fr' | 'en';
  avatarUrl?: string;
  publicKeyJwk?: JsonWebKey;
  wrappedPrivateKey?: WrappedKeyBlob;
  keyFingerprint?: string;
  visibility: 'public_subscribers' | 'connections_only' | 'private';
  notificationsEnabled: boolean;
  favoriteReminderEnabled?: boolean;
  calendarSyncEnabled?: boolean;
  calendarSyncScope?: CalendarSyncScope;
  calendarLastSyncedAt?: string;
  suspended?: boolean;
  profileViews?: number;
  favoriteEventIds?: string[];
  createdAt: string;
}

export interface ProfessionalProfile {
  memberId: string;
  headline: string;
  bio: string;
  sectors: string[];
  skills: string[];
  activeCountries: string[];
  languages: string[];
  collaborationNeeds: string[];
  voicePitchDataUrl?: string;
  voicePitchTranscript?: string;
  updatedAt: string;
}

export interface EnterprisePage {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  sector: string;
  country: string;
  city: string;
  services: string[];
  logoUrl?: string;
  websiteUrl?: string;
  linkedinUrl?: string;
  verified: boolean;
  viewsCount?: number;
}

export type EventFormat = 'in_person' | 'virtual' | 'hybrid';
export type ContentStatus = 'draft' | 'published' | 'suspended' | 'archived';

export interface BusinessEvent {
  id: string;
  organizerId: string;
  organizerName: string;
  title: string;
  publicSummary: string;
  fullDescription: string;
  dateIso: string;
  country: string;
  city: string;
  sector: string;
  format: EventFormat;
  venueAddress: string;
  virtualLink: string;
  capacity: number;
  registeredCount: number;
  feeEur: number;
  imageUrl?: string;
  status: ContentStatus;
  highlights?: string[];
  locked?: boolean;
  isRegistered?: boolean;
}

export interface ProfessionalNetwork {
  id: string;
  name: string;
  publicSummary: string;
  fullDescription: string;
  countries: string[];
  sectors: string[];
  contactEmail: string;
  memberCount: number;
  status: ContentStatus;
  imageUrl?: string;
  locked?: boolean;
}

export type OpportunityCategory =
  | 'co_investment'
  | 'commercial_partner'
  | 'supplier'
  | 'call_for_projects';

export interface BusinessOpportunity {
  id: string;
  authorId: string;
  authorName: string;
  companyName: string;
  title: string;
  category: OpportunityCategory;
  publicSummary: string;
  fullDetails: string;
  country: string;
  sector: string;
  budgetRange: string;
  status: ContentStatus;
  createdAt: string;
  locked?: boolean;
}

export interface DiscussionGroup {
  id: string;
  name: string;
  sector: string;
  description: string;
  memberCount: number;
  locked?: boolean;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  authorId: string;
  authorName: string;
  authorHeadline: string;
  text: string;
  createdAt: string;
}

export interface EventRegistration {
  id: string;
  eventId: string;
  memberId: string;
  status: 'confirmed' | 'cancelled';
  confirmationCode: string;
  sessionSlot?: string;
  createdAt: string;
}

export interface EventParticipantSummary {
  registrationId: string;
  memberId: string;
  fullName: string;
  email: string;
  city: string;
  country: string;
  confirmationCode: string;
  sessionSlot?: string;
  status: 'confirmed' | 'cancelled';
  createdAt: string;
}

export interface PaymentRecord {
  id: string;
  memberId: string;
  plan: SubscriptionPlan;
  amountEur: number;
  currency: 'EUR';
  status: 'succeeded' | 'failed' | 'refunded';
  paymentMethodLabel: string; // e.g., "Visa •••• 4242" or "Orange Money •••• 7781" (never full PAN)
  idempotencyKey: string;
  receiptNumber: string;
  createdAt: string;
}

export interface SubscriptionEventLog {
  id: string;
  memberId: string;
  eventType: 'activated' | 'renewed' | 'plan_changed' | 'payment_failed' | 'cancelled' | 'expired';
  plan?: SubscriptionPlan;
  details: string;
  createdAt: string;
}

export type ConnectionStatus = 'pending' | 'accepted' | 'declined';

export interface ContactConnection {
  id: string;
  senderId: string;
  recipientId: string;
  introMessage: string;
  status: ConnectionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WrappedKeyBlob {
  ciphertext: string;
  iv: string;
  salt: string;
  iterations: number;
}

export interface E2EEEnvelope {
  ciphertext: string;
  iv: string;
  alg: 'AES-GCM-256';
  v: 1;
}

export type MessageMediaType = 'text' | 'image' | 'voice';

export interface EncryptedMessageRecord {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  senderPubKey: JsonWebKey;
  envelope: E2EEEnvelope;
  mediaType: MessageMediaType;
  clientMutationId: string;
  readAt?: string;
  createdAt: string;
}

export interface DecryptedMessagePayload {
  text?: string;
  mediaDataUrl?: string; // base64 image or audio data URL decrypted locally
  mediaName?: string;
  durationSec?: number;
  transcript?: string;
}

export interface AppNotification {
  id: string;
  memberId: string;
  kind: 'connection' | 'message' | 'registration' | 'subscription' | 'moderation' | 'reminder';
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface ModerationReport {
  id: string;
  reporterId: string;
  targetType: 'member' | 'message' | 'event' | 'opportunity';
  targetId: string;
  reason: string;
  status: 'open' | 'resolved' | 'dismissed';
  resolutionNote?: string;
  createdAt: string;
}

export interface AdminAuditLog {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  target: string;
  details: string;
  createdAt: string;
}

export interface MemberBlock {
  id: string;
  blockerId: string;
  blockedId: string;
  createdAt: string;
}

export interface DirectoryEntry {
  member: Pick<
    MemberAccount,
    | 'id'
    | 'fullName'
    | 'country'
    | 'city'
    | 'language'
    | 'avatarUrl'
    | 'publicKeyJwk'
    | 'keyFingerprint'
    | 'visibility'
    | 'profileViews'
  >;
  profile?: ProfessionalProfile;
  enterprise?: EnterprisePage;
}

export interface OfflineMutation {
  id: string;
  clientMutationId: string;
  endpoint: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  createdAt: string;
  label: string;
}

export interface ScannedBadgeContact {
  id: string;
  ownerId?: string;
  eventId?: string;
  eventTitle?: string;
  fullName: string;
  headline: string;
  companyName: string;
  sector: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  linkedinUrl?: string;
  rawText?: string;
  matchedMemberId?: string;
  createdAt: string;
}

export interface NetworkingTrendPoint {
  dateKey: string;
  label: string;
  connections: number;
  interactions: number;
  newConnections: number;
}

export interface NetworkingTrendsResponse {
  days: number;
  series: NetworkingTrendPoint[];
  summary: {
    totalConnections30d: number;
    totalInteractions30d: number;
    newConnections30d: number;
    growthPct: number;
  };
  engine?: 'python' | 'js';
}

export interface EventRecommendation {
  eventId: string;
  title: string;
  sector: string;
  city: string;
  country: string;
  dateIso: string;
  format: EventFormat;
  remainingSeats: number;
  capacity: number;
  registeredCount: number;
  score: number;
  reason: string;
  locked?: boolean;
  imageUrl?: string;
}

export interface RecommendationsResponse {
  recommendations: EventRecommendation[];
  engine?: 'python' | 'js';
}

export interface DirectoryPeerMatch {
  memberId: string;
  fullName: string;
  city: string;
  country: string;
  avatarUrl?: string;
  headline: string;
  enterpriseName: string;
  sector: string;
  score: number;
  reason: string;
  connectionStatus: 'accepted' | 'pending' | 'none';
}

export interface PeerMatchesResponse {
  matches: DirectoryPeerMatch[];
  engine?: 'python' | 'js';
}

