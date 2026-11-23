import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCheck,
  Flag,
  Image as ImageIcon,
  KeyRound,
  Lock,
  MessageSquare,
  Mic,
  MicOff,
  Search,
  Send,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import {
  apiFetch,
  derivePeerAesKey,
  getCachedPrivateKeyJwk,
  queueOrSendMutation,
} from '../lib/apiClient';
import { decryptPayloadE2EE, encryptPayloadE2EE } from '../lib/cryptoE2EE';
import { hasActiveSubscription } from '../lib/accessRules';
import { localeForLang, translateCountry, translateSector, type AppLanguage } from '../lib/i18n';
import { localizeCity, localizeGroup } from '../lib/contentI18n';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import type {
  ContactConnection,
  DecryptedMessagePayload,
  DiscussionGroup,
  EncryptedMessageRecord,
  GroupMessage,
  MemberAccount,
} from '../types/domain';

export interface PeerSummary {
  id: string;
  fullName: string;
  city: string;
  country: string;
  avatarUrl?: string;
  publicKeyJwk?: JsonWebKey;
  keyFingerprint?: string;
  headline: string;
}

interface DecryptedRow {
  record: EncryptedMessageRecord;
  payload: DecryptedMessagePayload | null;
  pendingOffline?: boolean;
}

interface MessagesViewProps {
  user: MemberAccount | null;
  connections: ContactConnection[];
  peers: PeerSummary[];
  onlineUsers: string[];
  initialPeerId?: string | null;
  incomingRealtimeMessages: EncryptedMessageRecord[];
  incomingGroupMessages?: GroupMessage[];
  readReceiptSignal?: { peerId: string; readAt: string } | null;
  lang?: AppLanguage;
  onRefresh: () => Promise<void>;
  onGoToSubscription: () => void;
  onOpenAuth: () => void;
}

export const MessagesView: React.FC<MessagesViewProps> = ({
  user,
  connections,
  peers,
  onlineUsers,
  initialPeerId,
  incomingRealtimeMessages,
  incomingGroupMessages = [],
  readReceiptSignal,
  lang = 'fr',
  onRefresh,
  onGoToSubscription,
  onOpenAuth,
}) => {
  const isEn = lang === 'en';
  const dateLocale = localeForLang(lang);
  const isSubscriber = hasActiveSubscription(user);
  const [channelTab, setChannelTab] = useState<'direct' | 'groups'>('direct');

  const acceptedPeers = useMemo(() => {
    if (!user) return [];
    const acceptedIds = new Set<string>();
    for (const c of connections) {
      if (c.status === 'accepted') {
        acceptedIds.add(c.senderId === user.id ? c.recipientId : c.senderId);
      }
    }
    return peers.filter((p) => acceptedIds.has(p.id));
  }, [connections, peers, user]);

  // Direct E2EE state
  const [activePeerId, setActivePeerId] = useState<string | null>(initialPeerId || null);
  const [rawMessages, setRawMessages] = useState<EncryptedMessageRecord[]>([]);
  const [decryptedRows, setDecryptedRows] = useState<DecryptedRow[]>([]);
  const [textInput, setTextInput] = useState('');
  const [imagePreview, setImagePreview] = useState<{ dataUrl: string; name: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [peerSearch, setPeerSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [showKeyInfo, setShowKeyInfo] = useState(false);

  // Report modal state (supports reporting member or specific message)
  const [reportTarget, setReportTarget] = useState<{
    type: 'member' | 'message';
    id: string;
    label: string;
  } | null>(null);
  const [reportReason, setReportReason] = useState('');

  // Discussion Groups state (§4.2)
  const [groups, setGroups] = useState<DiscussionGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [groupInput, setGroupInput] = useState('');
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const groupBottomRef = useRef<HTMLDivElement | null>(null);
  const voiceRec = useVoiceRecorder();

  useEffect(() => {
    setActivePeerId(null);
    setRawMessages([]);
    setDecryptedRows([]);
    setGroupMessages([]);
  }, [user?.id]);

  useEffect(() => {
    if (initialPeerId && acceptedPeers.some((p) => p.id === initialPeerId)) {
      setActivePeerId(initialPeerId);
      setChannelTab('direct');
    } else if ((!activePeerId || !acceptedPeers.some((p) => p.id === activePeerId)) && acceptedPeers.length > 0) {
      setActivePeerId(acceptedPeers[0].id);
    } else if (acceptedPeers.length === 0) {
      setActivePeerId(null);
    }
  }, [initialPeerId, acceptedPeers, activePeerId]);

  const activePeer = useMemo(
    () => acceptedPeers.find((p) => p.id === activePeerId) || null,
    [acceptedPeers, activePeerId]
  );

  // Fetch conversation history + mark incoming messages read
  useEffect(() => {
    if (!user || !isSubscriber || !activePeer) {
      setRawMessages([]);
      return;
    }
    apiFetch<{ messages: EncryptedMessageRecord[] }>(`/api/messages/${activePeer.id}`)
      .then((res) => {
        setRawMessages(res.messages);
        setChatError(null);
        const hasUnreadIncoming = res.messages.some(
          (m) => m.recipientId === user.id && !m.readAt
        );
        if (hasUnreadIncoming) {
          apiFetch(`/api/messages/${activePeer.id}/read`, { method: 'POST' }).catch(() => {});
        }
      })
      .catch((err) => {
        setChatError(err instanceof Error ? err.message : isEn ? 'Loading error.' : 'Erreur de chargement.');
      });
  }, [user, isSubscriber, activePeer]);

  // Merge real-time WebSocket encrypted messages & mark read if active peer
  useEffect(() => {
    if (!activePeerId || !user) return;
    const relevant = incomingRealtimeMessages.filter(
      (m) =>
        (m.senderId === user.id && m.recipientId === activePeerId) ||
        (m.senderId === activePeerId && m.recipientId === user.id)
    );
    if (relevant.length === 0) return;
    setRawMessages((prev) => {
      const seen = new Set(prev.map((x) => x.id));
      const added = relevant.filter((x) => !seen.has(x.id));
      if (added.length === 0) return prev;
      return [...prev, ...added].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
    if (relevant.some((m) => m.senderId === activePeerId && m.recipientId === user.id && !m.readAt)) {
      apiFetch(`/api/messages/${activePeerId}/read`, { method: 'POST' }).catch(() => {});
    }
  }, [incomingRealtimeMessages, activePeerId, user]);

  // Apply real-time read receipt signal to outgoing messages
  useEffect(() => {
    if (!readReceiptSignal || !activePeerId || !user) return;
    if (readReceiptSignal.peerId !== activePeerId) return;
    setRawMessages((prev) =>
      prev.map((m) =>
        m.senderId === user.id && m.recipientId === activePeerId && !m.readAt
          ? { ...m, readAt: readReceiptSignal.readAt }
          : m
      )
    );
  }, [readReceiptSignal, activePeerId, user]);

  // Client-side E2EE decryption of all messages in the active conversation
  useEffect(() => {
    let cancelled = false;
    async function decryptAll() {
      if (!activePeer?.publicKeyJwk || !getCachedPrivateKeyJwk()) {
        setDecryptedRows(rawMessages.map((r) => ({ record: r, payload: null })));
        return;
      }
      const aesKey = await derivePeerAesKey(activePeer.publicKeyJwk);
      if (!aesKey) {
        setDecryptedRows(rawMessages.map((r) => ({ record: r, payload: null })));
        return;
      }
      const out: DecryptedRow[] = [];
      for (const rec of rawMessages) {
        const plain = await decryptPayloadE2EE<DecryptedMessagePayload>(rec.envelope, aesKey);
        out.push({ record: rec, payload: plain });
      }
      if (!cancelled) {
        setDecryptedRows(out);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
      }
    }
    decryptAll();
    return () => {
      cancelled = true;
    };
  }, [rawMessages, activePeer]);

  // Load Discussion Groups (§4.2)
  useEffect(() => {
    if (!user || !isSubscriber) return;
    apiFetch<{ groups: DiscussionGroup[] }>('/api/groups')
      .then((res) => {
        setGroups(res.groups);
        if (res.groups.length > 0 && !activeGroupId) {
          setActiveGroupId(res.groups[0].id);
        }
      })
      .catch(() => {});
  }, [user, isSubscriber, activeGroupId]);

  // Load messages for selected group
  useEffect(() => {
    if (!user || !isSubscriber || !activeGroupId || channelTab !== 'groups') return;
    apiFetch<{ messages: GroupMessage[] }>(`/api/groups/${activeGroupId}/messages`)
      .then((res) => {
        setGroupMessages(res.messages);
        setGroupError(null);
        setTimeout(() => groupBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
      })
      .catch((err) => {
        setGroupError(err instanceof Error ? err.message : isEn ? 'Error loading circle.' : 'Erreur chargement cercle.');
      });
  }, [user, isSubscriber, activeGroupId, channelTab]);

  // Merge real-time group messages
  useEffect(() => {
    if (!activeGroupId) return;
    const relevant = incomingGroupMessages.filter((m) => m.groupId === activeGroupId);
    if (relevant.length === 0) return;
    setGroupMessages((prev) => {
      const seen = new Set(prev.map((x) => x.id));
      const added = relevant.filter((x) => !seen.has(x.id));
      if (added.length === 0) return prev;
      return [...prev, ...added].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
  }, [incomingGroupMessages, activeGroupId]);

  const localizedGroups = useMemo(
    () => groups.map((g) => localizeGroup(g, lang)),
    [groups, lang]
  );

  const activeGroup = useMemo(
    () => localizedGroups.find((g) => g.id === activeGroupId) || null,
    [localizedGroups, activeGroupId]
  );

  const filteredPeers = useMemo(() => {
    const q = peerSearch.trim().toLowerCase();
    if (!q) return acceptedPeers;
    return acceptedPeers.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        localizeCity(p.city, lang).toLowerCase().includes(q) ||
        p.country.toLowerCase().includes(q) ||
        (p.headline || '').toLowerCase().includes(q)
    );
  }, [acceptedPeers, peerSearch, lang]);

  const filteredGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    if (!q) return localizedGroups;
    return localizedGroups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.sector.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q)
    );
  }, [localizedGroups, groupSearch]);

  const sendEncryptedPayload = async (
    payload: DecryptedMessagePayload,
    mediaType: 'text' | 'image' | 'voice'
  ) => {
    if (!user || !activePeer || !activePeer.publicKeyJwk || !user.publicKeyJwk) {
      setChatError(
        isEn
          ? 'E2EE encryption keys unavailable for this recipient.'
          : 'Clés de chiffrement E2EE indisponibles pour ce destinataire.'
      );
      return;
    }
    const aesKey = await derivePeerAesKey(activePeer.publicKeyJwk);
    if (!aesKey) {
      setChatError(
        isEn
          ? 'Your private E2EE key is locked. Sign in again to unlock it.'
          : 'Votre clé privée E2EE est verrouillée. Reconnectez-vous pour la déverrouiller.'
      );
      return;
    }
    setSending(true);
    setChatError(null);
    try {
      const envelope = await encryptPayloadE2EE(payload, aesKey);
      const clientMutationId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const body = {
        recipientId: activePeer.id,
        senderPubKey: user.publicKeyJwk,
        envelope,
        mediaType,
        clientMutationId,
      };
      const optimisticRecord: EncryptedMessageRecord = {
        id: clientMutationId,
        conversationId: [user.id, activePeer.id].sort().join('__'),
        senderId: user.id,
        recipientId: activePeer.id,
        senderPubKey: user.publicKeyJwk,
        envelope,
        mediaType,
        clientMutationId,
        createdAt: new Date().toISOString(),
      };

      const { queued } = await queueOrSendMutation({
        clientMutationId,
        endpoint: '/api/messages',
        method: 'POST',
        body,
        label: isEn ? `E2EE message to ${activePeer.fullName}` : `Message E2EE à ${activePeer.fullName}`,
      });

      if (queued) {
        setDecryptedRows((prev) => [...prev, { record: optimisticRecord, payload, pendingOffline: true }]);
      } else {
        const res = await apiFetch<{ messages: EncryptedMessageRecord[] }>(`/api/messages/${activePeer.id}`);
        setRawMessages(res.messages);
      }
      setTextInput('');
      setImagePreview(null);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : isEn ? 'Encrypted send failed.' : 'Échec d’envoi chiffré.');
    } finally {
      setSending(false);
    }
  };

  const handleSendTextOrImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (imagePreview) {
      await sendEncryptedPayload(
        { text: textInput.trim() || undefined, mediaDataUrl: imagePreview.dataUrl, mediaName: imagePreview.name },
        'image'
      );
    } else if (textInput.trim()) {
      await sendEncryptedPayload({ text: textInput.trim() }, 'text');
    }
  };

  const handleToggleVoiceMessage = async () => {
    if (voiceRec.isRecording) {
      const res = await voiceRec.stopRecording();
      if (res) {
        await sendEncryptedPayload(
          { mediaDataUrl: res.dataUrl, durationSec: res.durationSec },
          'voice'
        );
      }
    } else {
      await voiceRec.startRecording();
    }
  };

  const handlePickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview({ dataUrl: String(reader.result || ''), name: file.name });
    };
    reader.readAsDataURL(file);
  };

  const handleSendGroupMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGroupId || !groupInput.trim()) return;
    setGroupBusy(true);
    setGroupError(null);
    try {
      const res = await apiFetch<{ message: GroupMessage }>(`/api/groups/${activeGroupId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text: groupInput.trim() }),
      });
      setGroupMessages((prev) =>
        prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]
      );
      setGroupInput('');
      setTimeout(() => groupBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
    } catch (err) {
      setGroupError(err instanceof Error ? err.message : isEn ? 'Failed to send to circle.' : 'Erreur d’envoi au cercle.');
    } finally {
      setGroupBusy(false);
    }
  };

  const handleBlockPeer = async () => {
    if (!activePeer) return;
    try {
      await apiFetch('/api/blocks', {
        method: 'POST',
        body: JSON.stringify({ blockedId: activePeer.id }),
      });
      setActivePeerId(null);
      await onRefresh();
    } catch (err) {
      setChatError(err instanceof Error ? err.message : isEn ? 'Unable to block member.' : 'Blocage impossible.');
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTarget || !reportReason.trim()) return;
    try {
      await apiFetch('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          targetType: reportTarget.type,
          targetId: reportTarget.id,
          reason: reportReason,
        }),
      });
      setReportTarget(null);
      setReportReason('');
      setChatError(
        isEn ? 'Report sent to the moderation team.' : 'Signalement transmis à l’équipe de modération.'
      );
    } catch (err) {
      setChatError(err instanceof Error ? err.message : isEn ? 'Report error.' : 'Erreur de signalement.');
    }
  };

  if (!user || !isSubscriber) {
    return (
      <div className="navy-card rounded-3xl p-6 sm:p-8 max-w-3xl mx-auto space-y-6 my-6 text-[#F9F9F9]">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#E85002]/20 border border-[#E85002]/40 text-[#E85002]">
            <Lock className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#F9F9F9]">
              {isEn ? 'E2EE Messaging & Circles for Subscribers' : 'Messagerie E2EE & Cercles réservés aux abonnés'}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#D9C3AB] leading-relaxed">
              {isEn
                ? 'Exchange end-to-end encrypted text, images, and voice notes (ECDH P-256 + AES-GCM-256) with accepted contacts and join sector circles.'
                : 'Échangez textes, visuels et notes vocales chiffrés de bout en bout (ECDH P-256 + AES-GCM-256) avec vos contacts acceptés et participez aux cercles sectoriels.'}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 text-xs">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-1">
            <p className="font-bold text-[#F16001]">ECDH P-256 + AES-256</p>
            <p className="text-[#A7A7A7]">
              {isEn
                ? 'Encrypted locally in your browser before sending.'
                : 'Chiffrement local dans votre navigateur avant tout envoi.'}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-1">
            <p className="font-bold text-[#F16001]">{isEn ? 'Voice notes & photos' : 'Notes vocales & photos'}</p>
            <p className="text-[#A7A7A7]">
              {isEn
                ? 'Share encrypted audio memos and product sheets.'
                : 'Partagez des mémos audio et fiches produit chiffrés.'}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-1">
            <p className="font-bold text-[#F16001]">{isEn ? 'Sector circles' : 'Cercles sectoriels'}</p>
            <p className="text-[#A7A7A7]">
              {isEn
                ? 'Thematic rooms for Fintech, Agri-Business, Export & Diaspora.'
                : 'Salons thématiques Fintech, Agro, Export & Diaspora.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => (!user ? onOpenAuth() : onGoToSubscription())}
          className="min-h-[46px] rounded-full orange-glow-btn px-6 text-sm font-semibold"
        >
          {!user ? (isEn ? 'Sign in' : 'Se connecter') : isEn ? 'Activate subscription' : 'Activer l’abonnement'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--ae-border)] pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#000000] dark:text-[#F9F9F9]">
            {isEn ? 'E2EE Messaging & Circles' : 'Messagerie E2EE & Cercles'}
          </h1>
          <p className="mt-0.5 text-xs text-[#646464] dark:text-[#A7A7A7]">
            {isEn
              ? 'Local AES-GCM-256 encryption (1-on-1) · Subscriber thematic circles'
              : 'Chiffrement local AES-GCM-256 (1-à-1) · Cercles thématiques d’abonnés'}
          </p>
        </div>

        {/* Channel Switcher */}
        <div className="ios-segmented inline-flex">
          <button
            type="button"
            onClick={() => setChannelTab('direct')}
            className={`min-h-[38px] inline-flex items-center gap-1.5 rounded-full px-4 text-xs font-semibold transition-all whitespace-nowrap ${
              channelTab === 'direct'
                ? 'bg-[#E85002] text-[#F9F9F9] shadow-[0_6px_14px_-4px_rgba(232,80,2,0.5)]'
                : 'text-[#646464] dark:text-[#A7A7A7] hover:text-[#000000] dark:hover:text-[#F9F9F9]'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>{isEn ? 'Direct Messages (E2EE)' : 'Messages directs (E2EE)'}</span>
          </button>
          <button
            type="button"
            onClick={() => setChannelTab('groups')}
            className={`min-h-[38px] inline-flex items-center gap-1.5 rounded-full px-4 text-xs font-semibold transition-all whitespace-nowrap ${
              channelTab === 'groups'
                ? 'bg-[#E85002] text-[#F9F9F9] shadow-[0_6px_14px_-4px_rgba(232,80,2,0.5)]'
                : 'text-[#646464] dark:text-[#A7A7A7] hover:text-[#000000] dark:hover:text-[#F9F9F9]'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>{isEn ? 'Circles / Groups' : 'Cercles / Groupes'}</span>
          </button>
        </div>
      </div>

      {channelTab === 'direct' ? (
        <>
          {/* Tactile E2EE Security Cards Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="sand-key-card rounded-2xl px-3.5 py-2.5 flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-[#F9F9F9] shrink-0">
                <KeyRound className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-[#000000] truncate">{isEn ? 'E2EE Key' : 'Clé E2EE'}</p>
                <p className="text-[10px] text-[#333333] truncate">AES-GCM-256</p>
              </div>
              <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-[#E85002] text-[#F9F9F9] shrink-0">
                <Check className="h-2.5 w-2.5 stroke-[3]" />
              </span>
            </div>

            <div className="porcelain-card rounded-2xl px-3.5 py-2.5 flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E85002]/15 text-[#E85002] shrink-0">
                <ShieldCheck className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-[#000000] dark:text-[#F9F9F9] truncate">
                  {isEn ? 'Fingerprint' : 'Empreinte'}
                </p>
                <p className="font-mono text-[10px] text-[#646464] dark:text-[#A7A7A7] truncate">
                  {user.keyFingerprint || 'ECDH P-256'}
                </p>
              </div>
            </div>

            <div className="ice-panel rounded-2xl px-3.5 py-2.5 flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white dark:bg-[#1A1A1D] text-[#E85002] shrink-0">
                <Mic className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-[#000000] dark:text-[#F9F9F9] truncate">Multimodal</p>
                <p className="text-[10px] text-[#646464] dark:text-[#A7A7A7] truncate">
                  {isEn ? 'Voice · Photo · Receipts' : 'Voix · Photo · Accusés'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-12 min-h-[520px]">
            {/* Conversations List */}
            <aside className="lg:col-span-4 porcelain-card rounded-3xl p-3.5 space-y-2 min-w-0">
              <p className="px-2 pt-1 text-xs font-bold text-[#000000] dark:text-[#F9F9F9]">
                {isEn ? `Connected contacts (${acceptedPeers.length})` : `Contacts connectés (${acceptedPeers.length})`}
              </p>
              <div className="relative flex items-center">
                <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-[#A7A7A7]" />
                <input
                  type="text"
                  aria-label={isEn ? 'Filter contacts' : 'Filtrer les contacts'}
                  value={peerSearch}
                  onChange={(e) => setPeerSearch(e.target.value)}
                  placeholder={isEn ? 'Filter by contact or city...' : 'Filtrer un contact ou ville...'}
                  className="w-full min-h-[38px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] pl-8 pr-3 text-xs text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#646464] dark:placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
                />
              </div>
              {filteredPeers.length === 0 ? (
                <p className="px-3 py-6 text-xs text-[#646464] dark:text-[#A7A7A7]">
                  {acceptedPeers.length === 0
                    ? isEn
                      ? 'No accepted contacts yet. Send a request from the directory.'
                      : 'Aucun contact accepté pour l’instant. Envoyez une demande depuis l’annuaire.'
                    : isEn
                      ? 'No contacts match this search.'
                      : 'Aucun contact ne correspond à cette recherche.'}
                </p>
              ) : (
                filteredPeers.map((p) => {
                  const selected = p.id === activePeerId;
                  const online = onlineUsers.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setActivePeerId(p.id);
                        setShowKeyInfo(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-all ${
                        selected
                          ? 'bg-[#E85002]/15 border border-[#E85002]/45 text-[#000000] dark:text-[#F9F9F9]'
                          : 'hover:bg-[#F3EFEA] dark:hover:bg-[#1A1A1D] border border-transparent text-[#000000] dark:text-[#F9F9F9]'
                      }`}
                    >
                      {p.avatarUrl ? (
                        <img
                          src={p.avatarUrl}
                          alt={p.fullName}
                          referrerPolicy="no-referrer"
                          className={`h-10 w-10 rounded-full object-cover shrink-0 ${
                            selected ? 'ring-2 ring-[#E85002]' : 'ring-1 ring-[var(--ae-border)]'
                          }`}
                        />
                      ) : (
                        <span
                          className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold shrink-0 ${
                            selected
                              ? 'bg-[#E85002] text-[#F9F9F9]'
                              : 'bg-[#F3EFEA] dark:bg-[#1E1E22] text-[#000000] dark:text-[#F9F9F9]'
                          }`}
                        >
                          {p.fullName.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold truncate">
                          {p.fullName}
                        </p>
                        <p className={`text-[11px] truncate ${selected ? 'text-[#E85002] font-semibold' : 'text-[#646464] dark:text-[#A7A7A7]'}`}>
                          {localizeCity(p.city, lang)} · {online ? (isEn ? 'Online' : 'Connecté') : isEn ? 'Offline' : 'Hors ligne'}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </aside>

            {/* Thread Panel */}
            <section className="lg:col-span-8 porcelain-card flex flex-col justify-between rounded-3xl overflow-hidden min-w-0">
              {!activePeer ? (
                <div className="flex-1 flex items-center justify-center p-8 text-sm text-[#646464] dark:text-[#A7A7A7]">
                  {isEn
                    ? 'Select a contact to start an encrypted conversation.'
                    : 'Sélectionnez un contact pour démarrer une conversation chiffrée.'}
                </div>
              ) : (
                <>
                  {/* Thread Header */}
                  <div className="border-b border-[var(--ae-border)] bg-[#F3EFEA]/80 dark:bg-[#141417] px-5 py-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-sm font-bold text-[#000000] dark:text-[#F9F9F9] truncate">{activePeer.fullName}</h2>
                        <p className="text-[11px] text-emerald-600 dark:text-[#30D158] flex items-center gap-1 font-mono truncate">
                          <ShieldCheck className="h-3 w-3 shrink-0" />
                          <span>
                            {isEn ? 'Verified E2EE' : 'E2EE vérifié'} · {activePeer.keyFingerprint || 'ECDH P-256'}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setShowKeyInfo((v) => !v)}
                          aria-expanded={showKeyInfo}
                          aria-label={isEn ? 'Verify encryption fingerprints' : 'Vérifier les empreintes de chiffrement'}
                          title={isEn ? 'Verify E2EE fingerprints' : 'Vérifier les empreintes E2EE'}
                          className={`min-h-[38px] min-w-[38px] flex items-center justify-center rounded-full border transition-colors ${
                            showKeyInfo
                              ? 'border-[#E85002] bg-[#E85002]/15 text-[#E85002]'
                              : 'border-[var(--ae-border)] bg-white dark:bg-[#1A1A1D] text-[#646464] dark:text-[#A7A7A7] hover:text-[#E85002] hover:border-[#E85002]'
                          }`}
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setReportTarget({
                              type: 'member',
                              id: activePeer.id,
                              label: activePeer.fullName,
                            })
                          }
                          aria-label={isEn ? 'Report this member' : 'Signaler ce membre'}
                          title={isEn ? 'Report this member' : 'Signaler ce membre'}
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-full border border-[var(--ae-border)] bg-white dark:bg-[#1A1A1D] text-[#646464] dark:text-[#A7A7A7] hover:text-[#E85002] hover:border-[#E85002] transition-colors"
                        >
                          <AlertTriangle className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={handleBlockPeer}
                          aria-label={isEn ? 'Block this member' : 'Bloquer ce membre'}
                          title={isEn ? 'Block this member' : 'Bloquer ce membre'}
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-full border border-[var(--ae-border)] bg-white dark:bg-[#1A1A1D] text-[#646464] dark:text-[#A7A7A7] hover:text-red-500 hover:border-red-400 transition-colors"
                        >
                          <Ban className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {showKeyInfo && (
                      <div className="rounded-xl border border-[#E85002]/30 bg-white dark:bg-[#1A1A1D] px-3.5 py-2.5 text-[11px] space-y-1 font-mono">
                        <p className="font-sans font-semibold text-[#000000] dark:text-[#F9F9F9]">
                          {isEn
                            ? 'Cryptographic verification ECDH P-256 + AES-GCM-256'
                            : 'Vérification cryptographique ECDH P-256 + AES-GCM-256'}
                        </p>
                        <p className="text-[#646464] dark:text-[#A7A7A7]">
                          {isEn ? 'Your key:' : 'Votre clé :'}{' '}
                          <span className="text-[#E85002]">{user.keyFingerprint || (isEn ? 'local' : 'locale')}</span>
                        </p>
                        <p className="text-[#646464] dark:text-[#A7A7A7]">
                          {isEn ? `${activePeer.fullName}’s key:` : `Clé ${activePeer.fullName} :`}{' '}
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {activePeer.keyFingerprint || 'ECDH P-256'}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Messages Feed */}
                  <div className="flex-1 overflow-y-auto bg-[#F9F9F9] dark:bg-[#0A0A0C] p-5 space-y-3 max-h-[380px]">
                    {decryptedRows.length === 0 ? (
                      <p className="text-center text-xs text-[#646464] dark:text-[#A7A7A7] py-8">
                        {isEn
                          ? 'No messages yet. All exchanges are encrypted locally before being sent.'
                          : 'Aucun message pour le moment. Tous vos échanges sont chiffrés localement avant d’être transmis.'}
                      </p>
                    ) : (
                      decryptedRows.map(({ record, payload, pendingOffline }) => {
                        const isMine = record.senderId === user.id;
                        return (
                          <div
                            key={record.id}
                            className={`group flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                          >
                            <div
                              className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm space-y-2 ${
                                isMine
                                  ? 'bg-[#E85002] text-[#F9F9F9] rounded-br-sm shadow-[0_8px_18px_-8px_rgba(232,80,2,0.55)]'
                                  : 'bg-white dark:bg-[#18181B] text-[#000000] dark:text-[#F9F9F9] rounded-bl-sm border border-[var(--ae-border)]'
                              }`}
                            >
                              {!payload ? (
                                <p className="text-xs italic opacity-80">
                                  {isEn
                                    ? 'E2EE encrypted message (private key required to decrypt)'
                                    : 'Message chiffré E2EE (clé privée requise pour déchiffrer)'}
                                </p>
                              ) : (
                                <>
                                  {payload.mediaDataUrl && record.mediaType === 'image' && (
                                    <img
                                      src={payload.mediaDataUrl}
                                      alt={payload.mediaName || (isEn ? 'Encrypted image' : 'Image chiffrée')}
                                      className="max-h-56 rounded-xl object-cover"
                                    />
                                  )}
                                  {payload.mediaDataUrl && record.mediaType === 'voice' && (
                                    <div className="space-y-1">
                                      <p className="text-[11px] opacity-85">
                                        {isEn
                                          ? `Encrypted voice note (${payload.durationSec || 1}s)`
                                          : `Note vocale chiffrée (${payload.durationSec || 1}s)`}
                                      </p>
                                      <audio controls src={payload.mediaDataUrl} className="h-8 max-w-[230px]" />
                                    </div>
                                  )}
                                  {payload.text && <p className="leading-relaxed">{payload.text}</p>}
                                </>
                              )}
                            </div>

                            <div className="mt-1 flex items-center gap-2 text-[10px] text-[#646464] dark:text-[#A7A7A7] font-mono tabular-nums">
                              <span>
                                {new Date(record.createdAt).toLocaleTimeString(dateLocale, {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              {pendingOffline && <span>· {isEn ? 'Pending' : 'En attente'}</span>}
                              {isMine && !pendingOffline && (
                                <span
                                  className={`inline-flex items-center gap-0.5 ${
                                    record.readAt ? 'text-emerald-600 dark:text-[#30D158] font-semibold' : 'opacity-70'
                                  }`}
                                >
                                  {record.readAt ? (
                                    <>
                                      <CheckCheck className="h-3 w-3" />
                                      <span>{isEn ? 'Read' : 'Lu'}</span>
                                    </>
                                  ) : (
                                    <>
                                      <Check className="h-3 w-3" />
                                      <span>{isEn ? 'Sent' : 'Envoyé'}</span>
                                    </>
                                  )}
                                </span>
                              )}
                              {!isMine && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setReportTarget({
                                      type: 'message',
                                      id: record.id,
                                      label: isEn ? `message from ${activePeer.fullName}` : `message de ${activePeer.fullName}`,
                                    })
                                  }
                                  className="inline-flex items-center gap-0.5 hover:text-[#E85002] transition-colors"
                                  title={isEn ? 'Report this message' : 'Signaler ce message'}
                                >
                                  <Flag className="h-2.5 w-2.5" />
                                  <span>{isEn ? 'Report' : 'Signaler'}</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={bottomRef} />
                  </div>

                  {/* Multimodal Composer */}
                  <div className="border-t border-[var(--ae-border)] bg-white dark:bg-[#121214] p-3.5 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(isEn
                        ? [
                            'Hello! Available for a 15-minute call this week?',
                            'Would you like to view our company overview?',
                            'Let’s discuss a commercial synergy along our corridor.',
                          ]
                        : [
                            'Bonjour ! Disponible pour un appel de 15 min cette semaine ?',
                            'Souhaitez-vous découvrir notre présentation entreprise ?',
                            'Échangeons sur une synergie commerciale sur notre corridor.',
                          ]
                      ).map((prompt, idx) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => setTextInput(prompt)}
                          className="rounded-full border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-2.5 py-1 text-[11px] font-medium text-[#333333] dark:text-[#D9C3AB] hover:border-[#E85002] hover:text-[#E85002] transition-colors whitespace-nowrap"
                        >
                          {idx === 0
                            ? isEn
                              ? 'Suggest a call'
                              : 'Proposer un appel'
                            : idx === 1
                              ? isEn
                                ? 'Share overview'
                                : 'Partager présentation'
                              : isEn
                                ? 'Corridor synergy'
                                : 'Synergie corridor'}
                        </button>
                      ))}
                    </div>

                    {chatError && (
                      <p className="rounded-lg bg-red-500/10 border border-red-500/30 px-2.5 py-1.5 text-xs text-red-600 dark:text-red-300">
                        {chatError}
                      </p>
                    )}

                    {imagePreview && (
                      <div className="flex items-center justify-between rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] p-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <img src={imagePreview.dataUrl} alt={isEn ? 'Preview' : 'Aperçu'} className="h-10 w-10 rounded-lg object-cover" />
                          <span className="text-xs font-medium text-[#000000] dark:text-[#F9F9F9] truncate">{imagePreview.name}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setImagePreview(null)}
                          aria-label={isEn ? 'Remove image' : 'Retirer l’image'}
                          className="p-1.5 text-[#646464] dark:text-[#A7A7A7] hover:text-[#E85002]"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}

                    {voiceRec.isRecording && (
                      <div className="flex items-center justify-between rounded-xl border border-[#E85002]/35 bg-[#E85002]/10 px-3.5 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-[#000000] dark:text-[#F9F9F9]">
                            {isEn ? `Recording voice (${voiceRec.durationSec}s)` : `Enregistrement vocal (${voiceRec.durationSec}s)`}
                          </span>
                          <div className="flex items-end gap-0.5 h-5">
                            {voiceRec.levels.map((lvl, i) => (
                              <span
                                key={i}
                                className="w-1 rounded-full bg-[#E85002] transition-all"
                                style={{ height: `${Math.max(20, lvl)}%` }}
                              />
                            ))}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleToggleVoiceMessage}
                          className="rounded-full orange-glow-btn px-3 py-1 text-xs font-semibold"
                        >
                          {isEn ? 'Send voice' : 'Envoyer vocal'}
                        </button>
                      </div>
                    )}

                    <form onSubmit={handleSendTextOrImage} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        aria-label={isEn ? 'Attach encrypted image' : 'Joindre une image chiffrée'}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002] transition-colors shrink-0"
                      >
                        <ImageIcon className="h-4 w-4" />
                      </button>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        onChange={handlePickImage}
                        className="hidden"
                      />

                      <button
                        type="button"
                        onClick={handleToggleVoiceMessage}
                        aria-label={
                          voiceRec.isRecording
                            ? isEn
                              ? 'Stop voice note'
                              : 'Arrêter la note vocale'
                            : isEn
                              ? 'Record a voice note'
                              : 'Enregistrer une note vocale'
                        }
                        className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full border transition-colors shrink-0 ${
                          voiceRec.isRecording
                            ? 'border-red-600 bg-red-600 text-white'
                            : 'border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002]'
                        }`}
                      >
                        {voiceRec.isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                      </button>

                      <label htmlFor="e2ee-msg-input" className="sr-only">
                        {isEn ? 'Encrypted message' : 'Message chiffré'}
                      </label>
                      <input
                        id="e2ee-msg-input"
                        type="text"
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        placeholder={isEn ? 'End-to-end encrypted message...' : 'Message chiffré de bout en bout...'}
                        className="flex-1 min-w-0 min-h-[44px] rounded-full border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-4 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#646464] dark:placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
                      />

                      <button
                        type="submit"
                        disabled={sending || (!textInput.trim() && !imagePreview)}
                        aria-label={isEn ? 'Send message' : 'Envoyer le message'}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full orange-glow-btn disabled:opacity-40 shrink-0"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </form>
                  </div>
                </>
              )}
            </section>
          </div>
        </>
      ) : (
        /* Discussion Groups (§4.2) */
        <div className="grid gap-4 lg:grid-cols-12 min-h-[520px]">
          <aside className="lg:col-span-4 porcelain-card rounded-3xl p-3.5 space-y-2 min-w-0">
            <div className="px-2 pt-1">
              <p className="text-xs font-bold text-[#000000] dark:text-[#F9F9F9]">
                {isEn
                  ? `Thematic circles (${localizedGroups.length})`
                  : `Cercles thématiques (${localizedGroups.length})`}
              </p>
              <p className="text-[11px] text-[#646464] dark:text-[#A7A7A7]">
                {isEn
                  ? 'Shared sector rooms for verified subscribers.'
                  : 'Salons sectoriels partagés entre abonnés vérifiés.'}
              </p>
            </div>
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-[#A7A7A7]" />
              <input
                type="text"
                aria-label={isEn ? 'Filter circles' : 'Filtrer les cercles'}
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                placeholder={isEn ? 'Search a circle or sector...' : 'Rechercher un cercle ou secteur...'}
                className="w-full min-h-[38px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] pl-8 pr-3 text-xs text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#646464] dark:placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
              />
            </div>
            {filteredGroups.map((g) => {
              const selected = g.id === activeGroupId;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setActiveGroupId(g.id)}
                  className={`flex w-full flex-col gap-1 rounded-2xl p-3.5 text-left transition-all ${
                    selected
                      ? 'bg-[#E85002]/15 border border-[#E85002]/45 text-[#000000] dark:text-[#F9F9F9]'
                      : 'hover:bg-[#F3EFEA] dark:hover:bg-[#1A1A1D] border border-transparent text-[#000000] dark:text-[#F9F9F9]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold truncate">
                      {g.name}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0 ${
                        selected
                          ? 'bg-[#E85002] text-[#F9F9F9]'
                          : 'bg-[#F3EFEA] dark:bg-[#1E1E22] text-[#646464] dark:text-[#A7A7A7]'
                      }`}
                    >
                      {g.memberCount} {isEn ? 'mbr' : 'mbr'}
                    </span>
                  </div>
                  <p className="text-[11px] line-clamp-2 text-[#646464] dark:text-[#A7A7A7]">
                    {g.description}
                  </p>
                </button>
              );
            })}
          </aside>

          <section className="lg:col-span-8 porcelain-card flex flex-col justify-between rounded-3xl overflow-hidden min-w-0">
            {!activeGroup ? (
              <div className="flex-1 flex items-center justify-center p-8 text-sm text-[#646464] dark:text-[#A7A7A7]">
                {isEn
                  ? 'Select a sector circle to join the discussion.'
                  : 'Sélectionnez un cercle sectoriel pour rejoindre la discussion.'}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 border-b border-[var(--ae-border)] bg-[#F3EFEA]/80 dark:bg-[#141417] px-5 py-3.5">
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-[#000000] dark:text-[#F9F9F9] truncate">{activeGroup.name}</h2>
                    <p className="text-[11px] text-[#646464] dark:text-[#A7A7A7] truncate">
                      {isEn ? 'Sector:' : 'Secteur :'} {translateSector(activeGroup.sector, lang)} ·{' '}
                      {isEn ? 'Shared subscriber discussions' : 'Échanges partagés abonnés'}
                    </p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto bg-[#F9F9F9] dark:bg-[#0A0A0C] p-5 space-y-3 max-h-[380px]">
                  {groupMessages.length === 0 ? (
                    <p className="text-center text-xs text-[#646464] dark:text-[#A7A7A7] py-8">
                      {isEn
                        ? 'No contributions in this circle yet. Start the discussion.'
                        : 'Aucune contribution dans ce cercle pour le moment. Lancez la discussion.'}
                    </p>
                  ) : (
                    groupMessages.map((gm) => {
                      const isMine = gm.authorId === user.id;
                      return (
                        <div
                          key={gm.id}
                          className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm space-y-1 ${
                              isMine
                                ? 'bg-[#E85002] text-[#F9F9F9] rounded-br-sm shadow-[0_8px_18px_-8px_rgba(232,80,2,0.55)]'
                                : 'bg-white dark:bg-[#18181B] border border-[var(--ae-border)] text-[#000000] dark:text-[#F9F9F9] rounded-bl-sm'
                            }`}
                          >
                            <p
                              className={`text-[11px] font-semibold ${
                                isMine ? 'text-[#F9F9F9]/85' : 'text-[#E85002]'
                              }`}
                            >
                              {gm.authorName} · {gm.authorHeadline}
                            </p>
                            <p className="leading-relaxed">{gm.text}</p>
                          </div>
                          <span className="mt-1 text-[10px] text-[#646464] dark:text-[#A7A7A7] font-mono tabular-nums">
                            {new Date(gm.createdAt).toLocaleTimeString(dateLocale, {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      );
                    })
                  )}
                  <div ref={groupBottomRef} />
                </div>

                <div className="border-t border-[var(--ae-border)] bg-white dark:bg-[#121214] p-3.5 space-y-2">
                  {groupError && (
                    <p className="rounded-lg bg-red-500/10 border border-red-500/30 px-2.5 py-1.5 text-xs text-red-600 dark:text-red-300">
                      {groupError}
                    </p>
                  )}
                  <form onSubmit={handleSendGroupMessage} className="flex items-center gap-2">
                    <label htmlFor="group-msg-input" className="sr-only">
                      {isEn ? 'Message in the circle' : 'Message dans le cercle'}
                    </label>
                    <input
                      id="group-msg-input"
                      type="text"
                      value={groupInput}
                      onChange={(e) => setGroupInput(e.target.value)}
                      placeholder={
                        isEn ? `Share with ${activeGroup.name}...` : `Partager avec ${activeGroup.name}...`
                      }
                      className="flex-1 min-w-0 min-h-[44px] rounded-full border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-4 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#646464] dark:placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={groupBusy || !groupInput.trim()}
                      aria-label={isEn ? 'Post in circle' : 'Publier dans le cercle'}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full orange-glow-btn disabled:opacity-40 shrink-0"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </form>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {/* Report Modal (FR-16, RM-08) */}
      {reportTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleReportSubmit}
            className="w-full max-w-md rounded-3xl border border-[var(--ae-border)] bg-white dark:bg-[#121214] p-6 space-y-4 shadow-2xl"
          >
            <h3 className="text-lg font-bold text-[#000000] dark:text-[#F9F9F9]">
              {isEn ? `Report ${reportTarget.label}` : `Signaler ${reportTarget.label}`}
            </h3>
            <p className="text-xs text-[#646464] dark:text-[#A7A7A7]">
              {isEn
                ? 'The reason will be forwarded to the Africa Entrepreneur moderation team.'
                : 'Le motif sera transmis à l’équipe de modération Africa Entrepreneur.'}
            </p>
            <textarea
              rows={3}
              required
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder={isEn ? 'Describe the reason for reporting...' : 'Décrivez le motif du signalement...'}
              className="w-full rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] p-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportTarget(null)}
                className="min-h-[40px] rounded-full border border-[var(--ae-border)] px-4 text-xs font-semibold text-[#646464] dark:text-[#A7A7A7] hover:border-[#E85002]"
              >
                {isEn ? 'Cancel' : 'Annuler'}
              </button>
              <button
                type="submit"
                className="min-h-[40px] rounded-full orange-glow-btn px-5 text-xs font-semibold"
              >
                {isEn ? 'Submit report' : 'Envoyer le signalement'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
