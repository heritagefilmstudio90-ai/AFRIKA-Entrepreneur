import type {
  BusinessEvent,
  BusinessOpportunity,
  ContactConnection,
  DiscussionGroup,
  EventRegistration,
  MemberAccount,
  MemberBlock,
  ProfessionalNetwork,
  SubscriptionPlan,
} from '../types/domain';

export const SUBSCRIPTION_PRICING: Record<
  SubscriptionPlan,
  { label: string; priceEur: number; periodLabel: string; discountText?: string }
> = {
  monthly: {
    label: 'Abonnement Mensuel',
    priceEur: 19,
    periodLabel: 'par mois',
  },
  annual: {
    label: 'Abonnement Annuel',
    priceEur: 180,
    periodLabel: 'par an',
    discountText: '2 mois offerts (-21 %)',
  },
};

export function hasActiveSubscription(
  user: Pick<MemberAccount, 'role' | 'subscriptionStatus' | 'subscriptionEnd'> | null | undefined
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.subscriptionStatus !== 'active') return false;
  if (user.subscriptionEnd) {
    return new Date(user.subscriptionEnd).getTime() > Date.now();
  }
  return true;
}

export function canAccessFullDetails(
  user: Pick<MemberAccount, 'role' | 'subscriptionStatus' | 'subscriptionEnd'> | null | undefined
): boolean {
  return hasActiveSubscription(user);
}

/**
 * Enforces RM-01 & RM-02 server-side: Personnel & Visitor accounts receive ONLY the public preview.
 * Full descriptions, exact venue addresses, and virtual links are strictly stripped before leaving the server.
 */
export function sanitizeEventForUser(
  event: BusinessEvent,
  user: Pick<MemberAccount, 'id' | 'role' | 'subscriptionStatus' | 'subscriptionEnd'> | null | undefined,
  isRegistered: boolean
): BusinessEvent {
  const fullAccess = canAccessFullDetails(user);
  if (fullAccess) {
    return {
      ...event,
      locked: false,
      isRegistered,
    };
  }
  return {
    ...event,
    fullDescription: '',
    venueAddress: 'Réservé aux membres abonnés',
    virtualLink: '',
    highlights: [],
    locked: true,
    isRegistered: false,
  };
}

export function sanitizeNetworkForUser(
  network: ProfessionalNetwork,
  user: Pick<MemberAccount, 'role' | 'subscriptionStatus' | 'subscriptionEnd'> | null | undefined
): ProfessionalNetwork {
  if (canAccessFullDetails(user)) {
    return { ...network, locked: false };
  }
  return {
    ...network,
    fullDescription: '',
    contactEmail: '',
    locked: true,
  };
}

export function sanitizeOpportunityForUser(
  opportunity: BusinessOpportunity,
  user: Pick<MemberAccount, 'role' | 'subscriptionStatus' | 'subscriptionEnd'> | null | undefined
): BusinessOpportunity {
  if (canAccessFullDetails(user)) {
    return { ...opportunity, locked: false };
  }
  return {
    ...opportunity,
    authorName: 'Membre vérifié',
    companyName: 'Entreprise abonnée',
    fullDetails: '',
    budgetRange: 'Réservé aux abonnés',
    locked: true,
  };
}

export function sanitizeGroupForUser(
  group: DiscussionGroup,
  user: Pick<MemberAccount, 'role' | 'subscriptionStatus' | 'subscriptionEnd'> | null | undefined
): DiscussionGroup {
  if (canAccessFullDetails(user)) {
    return { ...group, locked: false };
  }
  return {
    ...group,
    locked: true,
  };
}

export function canManageEvent(
  event: Pick<BusinessEvent, 'organizerId'>,
  user: Pick<MemberAccount, 'id' | 'role' | 'suspended'> | null | undefined
): boolean {
  if (!user || user.suspended) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'organizer' && event.organizerId === user.id) return true;
  return false;
}

export function canRegisterForEvent(
  event: BusinessEvent,
  user: Pick<MemberAccount, 'id' | 'role' | 'subscriptionStatus' | 'subscriptionEnd' | 'suspended'> | null | undefined,
  registrations: EventRegistration[]
): { allowed: boolean; reason?: string; code?: string } {
  if (!user) {
    return { allowed: false, reason: 'Connexion requise pour vous inscrire.', code: 'AUTH_REQUIRED' };
  }
  if (user.suspended) {
    return { allowed: false, reason: 'Votre compte est suspendu par la modération.', code: 'ACCOUNT_SUSPENDED' };
  }
  if (!hasActiveSubscription(user)) {
    return {
      allowed: false,
      reason: 'Un abonnement mensuel ou annuel actif est requis pour vous inscrire à cet événement.',
      code: 'SUBSCRIPTION_REQUIRED',
    };
  }
  if (event.status !== 'published') {
    return { allowed: false, reason: 'Cet événement n’est pas ouvert aux inscriptions.', code: 'EVENT_UNAVAILABLE' };
  }
  const already = registrations.some(
    (r) => r.eventId === event.id && r.memberId === user.id && r.status === 'confirmed'
  );
  if (already) {
    return { allowed: false, reason: 'Vous êtes déjà inscrit à cet événement.', code: 'DUPLICATE_REGISTRATION' };
  }
  if (event.registeredCount >= event.capacity) {
    return { allowed: false, reason: 'Capacité maximale atteinte pour cet événement.', code: 'EVENT_FULL' };
  }
  return { allowed: true };
}

export function isBlockedBetween(userA: string, userB: string, blocks: MemberBlock[]): boolean {
  return blocks.some(
    (b) => (b.blockerId === userA && b.blockedId === userB) || (b.blockerId === userB && b.blockedId === userA)
  );
}

export function canMessageRecipient(
  sender: Pick<MemberAccount, 'id' | 'role' | 'subscriptionStatus' | 'subscriptionEnd' | 'suspended'> | null | undefined,
  recipientId: string,
  connections: ContactConnection[],
  blocks: MemberBlock[]
): { allowed: boolean; reason?: string; code?: string } {
  if (!sender) {
    return { allowed: false, reason: 'Authentification requise.', code: 'AUTH_REQUIRED' };
  }
  if (sender.suspended) {
    return { allowed: false, reason: 'Compte suspendu.', code: 'ACCOUNT_SUSPENDED' };
  }
  if (!hasActiveSubscription(sender)) {
    return {
      allowed: false,
      reason: 'Abonnement actif requis pour utiliser la messagerie chiffrée.',
      code: 'SUBSCRIPTION_REQUIRED',
    };
  }
  if (isBlockedBetween(sender.id, recipientId, blocks)) {
    return { allowed: false, reason: 'Conversation bloquée entre ces membres.', code: 'USER_BLOCKED' };
  }
  const accepted = connections.some(
    (c) =>
      c.status === 'accepted' &&
      ((c.senderId === sender.id && c.recipientId === recipientId) ||
        (c.senderId === recipientId && c.recipientId === sender.id))
  );
  if (!accepted) {
    return {
      allowed: false,
      reason: 'Une demande de contact acceptée est requise avant d’ouvrir la conversation (RM).',
      code: 'CONNECTION_REQUIRED',
    };
  }
  return { allowed: true };
}

export function computeSubscriptionDates(plan: SubscriptionPlan, now = new Date()): { startIso: string; endIso: string } {
  const start = new Date(now.getTime());
  const end = new Date(now.getTime());
  if (plan === 'annual') {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    end.setMonth(end.getMonth() + 1);
  }
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}
