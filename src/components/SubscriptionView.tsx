import React, { useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CreditCard,
  Download,
  FileText,
  Lock,
  Printer,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { apiFetch } from '../lib/apiClient';
import { hasActiveSubscription, SUBSCRIPTION_PRICING } from '../lib/accessRules';
import { localeForLang, type AppLanguage } from '../lib/i18n';
import { computeSubscriptionComparison } from '../lib/workspaceInsights';
import type {
  MemberAccount,
  PaymentRecord,
  SubscriptionEventLog,
  SubscriptionPlan,
} from '../types/domain';

interface SubscriptionViewProps {
  user: MemberAccount | null;
  payments: PaymentRecord[];
  subscriptionLogs?: SubscriptionEventLog[];
  lang?: AppLanguage;
  onUpdated: (user: MemberAccount) => Promise<void>;
  onNavigate?: (tab: 'catalogue' | 'directory' | 'messages') => void;
  onOpenAuth: () => void;
}

export const SubscriptionView: React.FC<SubscriptionViewProps> = ({
  user,
  payments,
  subscriptionLogs = [],
  lang = 'fr',
  onUpdated,
  onNavigate,
  onOpenAuth,
}) => {
  const isEn = lang === 'en';
  const dateLocale = localeForLang(lang);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>('annual');
  const [modePreview, setModePreview] = useState<'free' | SubscriptionPlan>('annual');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [payMethod, setPayMethod] = useState<'card' | 'mobile_money'>('card');
  const [cardLast4, setCardLast4] = useState('4242');
  const [cardExpiry, setCardExpiry] = useState('09/29');
  const [mobilePhone, setMobilePhone] = useState('7781');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<PaymentRecord | null>(null);
  const [activeReceiptModal, setActiveReceiptModal] = useState<PaymentRecord | null>(null);
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);

  const isSubscriber = hasActiveSubscription(user);
  const pricing = SUBSCRIPTION_PRICING[selectedPlan];
  const savings = computeSubscriptionComparison(
    SUBSCRIPTION_PRICING.monthly.priceEur,
    SUBSCRIPTION_PRICING.annual.priceEur
  );

  const handleDownloadReceipt = (receipt: PaymentRecord) => {
    const lines = [
      isEn ? 'AFRICA ENTREPRENEUR — PAYMENT RECEIPT' : 'AFRICA ENTREPRENEUR — JUSTIFICATIF DE PAIEMENT',
      '=============================================',
      `${isEn ? 'Receipt number' : 'Numéro de reçu'} : ${receipt.receiptNumber}`,
      `${isEn ? 'Account holder' : 'Titulaire'} : ${user?.fullName || (isEn ? 'Member' : 'Membre')} (${user?.email || ''})`,
      `${isEn ? 'Plan' : 'Formule'} : ${
        receipt.plan === 'annual'
          ? isEn
            ? 'Annual Membership'
            : 'Abonnement Annuel'
          : isEn
            ? 'Monthly Membership'
            : 'Abonnement Mensuel'
      }`,
      `${isEn ? 'Amount paid' : 'Montant réglé'} : ${receipt.amountEur}.00 EUR`,
      `${isEn ? 'Payment method' : 'Moyen de paiement'} : ${receipt.paymentMethodLabel}`,
      `Date : ${new Date(receipt.createdAt).toLocaleString(dateLocale)}`,
      `${isEn ? 'Status' : 'Statut'} : ${
        receipt.status === 'succeeded'
          ? isEn
            ? 'Paid & verified'
            : 'Payé et vérifié'
          : receipt.status === 'refunded'
            ? isEn
              ? 'Refunded'
              : 'Remboursé'
            : isEn
              ? 'Failed'
              : 'Échec'
      }`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${isEn ? 'receipt' : 'recu'}-${receipt.receiptNumber}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCheckoutConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const cleanLast4 = (payMethod === 'card' ? cardLast4 : mobilePhone).replace(/\D/g, '').slice(-4) || '0000';
      const label =
        payMethod === 'card' ? `Carte •••• ${cleanLast4}` : `Mobile Money •••• ${cleanLast4}`;
      const idempotencyKey = `sub-${user.id}-${selectedPlan}-${Math.floor(Date.now() / 10000)}`;

      const res = await apiFetch<{ payment: PaymentRecord; user: MemberAccount }>(
        '/api/subscriptions/checkout',
        {
          method: 'POST',
          body: JSON.stringify({
            plan: selectedPlan,
            paymentMethodLabel: label,
            idempotencyKey,
          }),
        }
      );
      setLastReceipt(res.payment);
      setStep(3);
      await onUpdated(res.user);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isEn
            ? 'Payment validation failed.'
            : 'Échec de validation du paiement.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ user: MemberAccount }>('/api/subscriptions/cancel', {
        method: 'POST',
      });
      await onUpdated(res.user);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isEn
            ? 'Unable to cancel subscription.'
            : 'Erreur lors de la résiliation.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSwitchPlan = async () => {
    if (!user) return;
    const nextPlan: SubscriptionPlan = user.subscriptionPlan === 'annual' ? 'monthly' : 'annual';
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ user: MemberAccount }>('/api/subscriptions/switch-plan', {
        method: 'POST',
        body: JSON.stringify({ plan: nextPlan }),
      });
      await onUpdated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Changement de formule impossible.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleAutoRenew = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ user: MemberAccount }>('/api/subscriptions/auto-renew', {
        method: 'POST',
        body: JSON.stringify({ autoRenew: !(user.autoRenew ?? true) }),
      });
      await onUpdated(res.user);
    } finally {
      setBusy(false);
    }
  };

  const handleSimulateState = async (kind: 'failure' | 'expire') => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ user: MemberAccount }>(
        kind === 'failure'
          ? '/api/subscriptions/simulate-payment-failure'
          : '/api/subscriptions/simulate-expire',
        { method: 'POST' }
      );
      await onUpdated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="border-b border-[var(--ae-border)] pb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#000000] dark:text-[#F9F9F9]">
            {isEn ? 'Choose your access mode' : 'Choisissez votre mode'}
          </h1>
          <ArrowUpRight className="h-5 w-5 text-[#E85002]" aria-hidden="true" />
        </div>
        <p className="mt-1 text-sm text-[#646464] dark:text-[#A7A7A7]">
          {isEn
            ? 'Monthly and annual plans unlock all premium networking features. No full card numbers are ever stored.'
            : 'Les formules mensuelle et annuelle donnent accès aux mêmes fonctions premium. Aucun numéro complet de carte n’est conservé.'}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left column: OLED Black & Orange Member Pass + Billing History */}
        <div className="lg:col-span-5 space-y-5">
          <div className="navy-card relative overflow-hidden rounded-3xl p-6 text-[#F9F9F9]">
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 opacity-20"
              viewBox="0 0 200 200"
              fill="none"
            >
              <circle cx="100" cy="100" r="88" stroke="#E85002" strokeWidth="1.4" />
              <circle cx="100" cy="100" r="64" stroke="#D9C3AB" strokeWidth="1.2" />
              <circle cx="100" cy="100" r="40" stroke="#F9F9F9" strokeWidth="1.2" />
            </svg>

            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-[#D9C3AB]">
                  {isEn ? 'Africa Entrepreneur Member Pass' : 'Pass Membre Africa Entrepreneur'}
                </p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-[#F9F9F9]">
                  {isSubscriber
                    ? user?.subscriptionPlan === 'annual'
                      ? isEn
                        ? 'Annual Member'
                        : 'Abonné Annuel'
                      : isEn
                        ? 'Monthly Member'
                        : 'Abonné Mensuel'
                    : user
                      ? isEn
                        ? 'Personal Account'
                        : 'Compte Personnel'
                      : isEn
                        ? 'Visitor'
                        : 'Visiteur'}
                </p>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#E85002]/20 border border-[#E85002]/35 text-[#E85002]">
                <ShieldCheck className="h-5 w-5" />
              </span>
            </div>

            <div className="relative mt-9 flex items-end justify-between gap-4 border-t border-white/10 pt-4">
              <div>
                <p className="text-[11px] text-[#A7A7A7]">{isEn ? 'Holder' : 'Titulaire'}</p>
                <p className="text-sm font-semibold text-[#F9F9F9]">
                  {user ? user.fullName : isEn ? 'Not signed in' : 'Non connecté'}
                </p>
                {user?.keyFingerprint && (
                  <p className="mt-1 font-mono text-[11px] text-[#D9C3AB]">
                    E2EE · {user.keyFingerprint}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-[11px] text-[#A7A7A7]">{isEn ? 'Valid until' : 'Validité'}</p>
                <p className="font-mono text-xs font-semibold text-[#F9F9F9] tabular-nums">
                  {isSubscriber && user?.subscriptionEnd
                    ? new Date(user.subscriptionEnd).toLocaleDateString(dateLocale)
                    : isEn
                      ? 'Free preview'
                      : 'Aperçu gratuit'}
                </p>
              </div>
            </div>
          </div>

          {isSubscriber && user?.role !== 'admin' && (
            <div className="porcelain-card rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#000000] dark:text-[#F9F9F9]">
                    {isEn ? 'Renewal management' : 'Gestion du renouvellement'}
                  </p>
                  <p className="text-xs text-[#646464] dark:text-[#A7A7A7]">
                    {isEn
                      ? 'Canceling or expiration reverts to Personal tier while keeping your profile.'
                      : 'La résiliation ou l’échéance ramène au niveau Personnel en conservant votre profil.'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleCancelSubscription}
                  className="min-h-[38px] rounded-full border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-red-400 hover:bg-red-500/10 hover:text-red-700 dark:hover:text-red-300 transition-colors whitespace-nowrap"
                >
                  {isEn ? 'Cancel plan' : 'Résilier'}
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ae-border)] pt-3">
                <label className="flex items-center gap-2 text-xs font-medium text-[#000000] dark:text-[#F9F9F9] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={user?.autoRenew ?? true}
                    onChange={handleToggleAutoRenew}
                    className="h-4 w-4 accent-[#E85002]"
                  />
                  <span>{isEn ? 'Automatic renewal' : 'Renouvellement automatique'}</span>
                </label>

                <button
                  type="button"
                  disabled={busy}
                  onClick={handleSwitchPlan}
                  className="min-h-[36px] rounded-full bg-[#E85002]/15 border border-[#E85002]/30 px-3.5 text-xs font-semibold text-[#E85002] hover:bg-[#E85002]/25 transition-colors whitespace-nowrap"
                >
                  {user?.subscriptionPlan === 'annual'
                    ? isEn
                      ? 'Switch to Monthly'
                      : 'Passer au Mensuel'
                    : isEn
                      ? 'Switch to Annual'
                      : 'Passer à l’Annuel'}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-[var(--ae-border)] pt-2.5 text-[11px]">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleSimulateState('failure')}
                  className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-500/20 transition-colors"
                >
                  {isEn ? 'Test payment failure' : 'Tester échec prélèvement'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleSimulateState('expire')}
                  className="rounded-full border border-[var(--ae-border)] bg-white dark:bg-[#1A1A1D] px-3 py-1 font-medium text-[#646464] dark:text-[#A7A7A7] hover:border-[#E85002] transition-colors"
                >
                  {isEn ? 'Test expiration' : 'Tester échéance'}
                </button>
              </div>
            </div>
          )}

          {/* Billing History & Receipts */}
          <div className="porcelain-card rounded-3xl p-5 space-y-4">
            <div>
              <h2 className="text-base font-bold text-[#000000] dark:text-[#F9F9F9]">
                {isEn ? 'Billing & Receipts' : 'Historique & Justificatifs'}
              </h2>
              {payments.length === 0 ? (
                <p className="mt-2 text-xs text-[#646464] dark:text-[#A7A7A7]">
                  {isEn ? 'No payments recorded on this account.' : 'Aucun paiement enregistré sur ce compte.'}
                </p>
              ) : (
                <div className="mt-2 divide-y divide-[var(--ae-border)]">
                  {payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <p className="text-sm font-semibold text-[#000000] dark:text-[#F9F9F9]">
                          {p.plan === 'annual'
                            ? isEn
                              ? 'Annual Plan'
                              : 'Formule Annuelle'
                            : isEn
                              ? 'Monthly Plan'
                              : 'Formule Mensuelle'}{' '}
                          · <span className="font-mono tabular-nums">{p.amountEur} €</span>
                          {p.status === 'failed' && (
                            <span className="ml-2 text-[11px] font-semibold text-red-600 dark:text-red-400">
                              {isEn ? '(Failed)' : '(Échec)'}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-[#646464] dark:text-[#A7A7A7] font-mono tabular-nums">
                          {new Date(p.createdAt).toLocaleDateString(dateLocale)} · {p.paymentMethodLabel}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveReceiptModal(p)}
                        className="min-h-[36px] inline-flex items-center gap-1.5 rounded-full bg-[#F3EFEA] dark:bg-[#1E1E22] border border-[var(--ae-border)] px-3.5 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002] transition-colors"
                      >
                        <FileText className="h-3.5 w-3.5 text-[#E85002]" />
                        <span>{isEn ? 'Receipt' : 'Reçu'}</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {subscriptionLogs.length > 0 && (
              <div className="border-t border-[var(--ae-border)] pt-4">
                <h3 className="text-xs font-bold text-[#000000] dark:text-[#F9F9F9] uppercase tracking-wide">
                  {isEn ? 'Subscription Status Log' : 'Journal d’état de l’abonnement'}
                </h3>
                <div className="mt-2 space-y-2">
                  {subscriptionLogs.slice(0, 5).map((log) => (
                    <div key={log.id} className="ice-panel rounded-xl px-3 py-2 text-xs">
                      <p className="font-semibold text-[#000000] dark:text-[#F9F9F9]">{log.details}</p>
                      <p className="text-[10px] text-[#646464] dark:text-[#A7A7A7] font-mono">
                        {log.eventType} · {new Date(log.createdAt).toLocaleDateString(dateLocale)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right column: 3-Step Checkout Flow */}
        <div className="lg:col-span-7 porcelain-card rounded-3xl p-6 sm:p-8">
          {/* 3-Step Horizontal Stepper */}
          <div className="flex items-center justify-between gap-2 pb-6 border-b border-[var(--ae-border)]">
            {[
              { n: 1 as const, label: isEn ? 'Plan' : 'Formule' },
              { n: 2 as const, label: isEn ? 'Payment' : 'Paiement' },
              { n: 3 as const, label: isEn ? 'Confirmation' : 'Confirmation' },
            ].map((item, idx) => (
              <React.Fragment key={item.n}>
                <button
                  type="button"
                  onClick={() => (item.n < step ? setStep(item.n) : undefined)}
                  className="flex flex-col items-center gap-1.5"
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full font-mono text-xs font-bold transition-colors ${
                      step === item.n
                        ? 'bg-[#E85002] text-[#F9F9F9] shadow-[0_6px_16px_-4px_rgba(232,80,2,0.55)]'
                        : step > item.n
                          ? 'bg-emerald-600 text-white'
                          : 'bg-[#F3EFEA] dark:bg-[#1E1E22] text-[#646464] dark:text-[#A7A7A7]'
                    }`}
                  >
                    {step > item.n ? <Check className="h-4 w-4 stroke-[3]" /> : item.n}
                  </span>
                  <span
                    className={`text-xs font-semibold ${
                      step === item.n ? 'text-[#000000] dark:text-[#F9F9F9]' : 'text-[#646464] dark:text-[#A7A7A7]'
                    }`}
                  >
                    {item.label}
                  </span>
                </button>
                {idx < 2 && <div className="h-px flex-1 bg-[var(--ae-border)] mb-5" />}
              </React.Fragment>
            ))}
          </div>

          {step === 1 && (
            <div className="mt-6 space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-[#000000] dark:text-[#F9F9F9]">
                    {isEn ? 'Choose your plan' : 'Choisissez votre formule'}
                  </h2>
                  <p className="mt-1 text-xs text-[#646464] dark:text-[#A7A7A7]">
                    {isEn
                      ? 'Switch between free discovery and full E2EE encrypted access.'
                      : 'Basculez entre découverte gratuite et accès intégral chiffré E2EE.'}
                  </p>
                </div>

                {/* Editorial 3-mode capsule */}
                <div
                  className="ios-segmented inline-flex self-start"
                  role="tablist"
                  aria-label={isEn ? 'Access mode' : 'Mode d’accès'}
                >
                  {(
                    [
                      { id: 'free', label: isEn ? 'Personal' : 'Personnel' },
                      { id: 'monthly', label: isEn ? 'Monthly' : 'Mensuel' },
                      { id: 'annual', label: isEn ? 'Annual' : 'Annuel' },
                    ] as const
                  ).map((m) => {
                    const active = modePreview === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => {
                          setModePreview(m.id);
                          if (m.id !== 'free') setSelectedPlan(m.id);
                        }}
                        className={`min-h-[34px] rounded-full px-4 text-xs font-semibold transition-all whitespace-nowrap ${
                          active
                            ? 'bg-[#E85002] text-[#F9F9F9] shadow-[0_6px_14px_-4px_rgba(232,80,2,0.5)]'
                            : 'text-[#646464] dark:text-[#A7A7A7] hover:text-[#000000] dark:hover:text-[#F9F9F9]'
                        }`}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Spotlight Pass Card */}
              <div
                className={`rounded-[26px] p-5 sm:p-6 space-y-4 ${
                  modePreview === 'free' ? 'ice-panel' : 'brand-gradient-card text-[#F9F9F9]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p
                      className={`text-[11px] font-semibold uppercase tracking-wider ${
                        modePreview === 'free' ? 'text-[#E85002]' : 'text-[#F9F9F9]/85'
                      }`}
                    >
                      {modePreview === 'free'
                        ? isEn
                          ? 'Discovery'
                          : 'Découverte'
                        : modePreview === 'annual'
                          ? isEn
                            ? 'Visionary · Recommended'
                            : 'Visionnaire · Recommandé'
                          : isEn
                            ? 'Pro Essential'
                            : 'Essentiel Pro'}
                    </p>
                    <h3
                      className={`mt-0.5 text-xl font-bold ${
                        modePreview === 'free' ? 'text-[#000000] dark:text-[#F9F9F9]' : 'text-[#F9F9F9]'
                      }`}
                    >
                      {modePreview === 'free'
                        ? isEn
                          ? 'Personal Preview Access'
                          : 'Accès Aperçu Personnel'
                        : modePreview === 'annual'
                          ? isEn
                            ? 'Unlimited Annual Access'
                            : 'Accès Illimité Annuel'
                          : isEn
                            ? 'Unlimited Monthly Access'
                            : 'Accès Illimité Mensuel'}
                    </h3>
                    <p
                      className={`mt-1 text-xs max-w-md ${
                        modePreview === 'free' ? 'text-[#646464] dark:text-[#A7A7A7]' : 'text-[#F9F9F9]/90'
                      }`}
                    >
                      {modePreview === 'free'
                        ? isEn
                          ? 'Explore the catalog, build your private profile, and manage your offline favorites.'
                          : 'Explorez le catalogue, créez votre fiche privée et gérez vos favoris hors ligne.'
                        : isEn
                          ? 'Full access to events, networks, verified directory, contact requests, and E2EE messaging.'
                          : 'Accès complet aux événements, réseaux, annuaire vérifié, demandes de contact et messagerie E2EE.'}
                    </p>
                  </div>
                  {modePreview === 'annual' && (
                    <span className="rounded-full bg-[#121214] px-3 py-1 text-[11px] font-semibold text-[#F9F9F9] border border-white/15 whitespace-nowrap">
                      {isEn ? 'Best value' : 'Meilleure offre'}
                    </span>
                  )}
                </div>

                <div
                  className={`flex flex-wrap items-end justify-between gap-4 border-t pt-4 ${
                    modePreview === 'free' ? 'border-[var(--ae-border)]' : 'border-white/20'
                  }`}
                >
                  <ul
                    className={`space-y-1.5 text-xs ${
                      modePreview === 'free' ? 'text-[#000000] dark:text-[#F9F9F9]' : 'text-[#F9F9F9]'
                    }`}
                  >
                    {(modePreview === 'free'
                      ? isEn
                        ? [
                            'Catalog preview & favorites',
                            'Private profile & company page',
                            'iOS / Android calendar export',
                          ]
                        : [
                            'Aperçu catalogue & favoris',
                            'Profil privé & page entreprise',
                            'Export calendrier iOS / Android',
                          ]
                      : isEn
                        ? [
                            'Full details & unlimited registrations',
                            'Founder directory & warm introductions',
                            'Real-time ECDH P-256 encrypted messaging',
                            'In-person OCR badge scanning',
                          ]
                        : [
                            'Fiches complètes & inscriptions illimitées',
                            'Annuaire des dirigeants & mises en relation',
                            'Messagerie temps réel chiffrée ECDH P-256',
                            'Scan OCR de badges en présentiel',
                          ]
                    ).map((feat) => (
                      <li key={feat} className="flex items-center gap-2">
                        <Check
                          className={`h-3.5 w-3.5 shrink-0 ${
                            modePreview === 'free' ? 'text-[#E85002]' : 'text-[#F9F9F9]'
                          }`}
                        />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="text-right">
                    <p
                      className={`font-mono text-3xl sm:text-4xl font-bold tabular-nums ${
                        modePreview === 'free' ? 'text-[#000000] dark:text-[#F9F9F9]' : 'text-[#F9F9F9]'
                      }`}
                    >
                      {modePreview === 'free' ? '0 €' : `${SUBSCRIPTION_PRICING[modePreview].priceEur} €`}
                    </p>
                    <p
                      className={`text-xs ${
                        modePreview === 'free' ? 'text-[#646464] dark:text-[#A7A7A7]' : 'text-[#F9F9F9]/85'
                      }`}
                    >
                      {modePreview === 'free'
                        ? isEn
                          ? 'Free'
                          : 'Gratuit'
                        : modePreview === 'annual'
                          ? isEn
                            ? '/ year'
                            : SUBSCRIPTION_PRICING[modePreview].periodLabel
                          : isEn
                            ? '/ month'
                            : SUBSCRIPTION_PRICING[modePreview].periodLabel}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {(['monthly', 'annual'] as SubscriptionPlan[]).map((planKey) => {
                  const p = SUBSCRIPTION_PRICING[planKey];
                  const active = selectedPlan === planKey;
                  const planLabel = planKey === 'annual' ? (isEn ? 'Annual' : p.label) : isEn ? 'Monthly' : p.label;
                  const planPeriod = planKey === 'annual' ? (isEn ? '/ year' : p.periodLabel) : isEn ? '/ month' : p.periodLabel;
                  const planDiscount = p.discountText ? (isEn ? 'Save 38%' : p.discountText) : undefined;
                  return (
                    <button
                      key={planKey}
                      type="button"
                      onClick={() => {
                        setSelectedPlan(planKey);
                        setModePreview(planKey);
                      }}
                      className={`relative flex flex-col justify-between rounded-2xl border p-5 text-left transition-all ${
                        active
                          ? 'border-[#E85002] bg-[#E85002]/10 ring-1 ring-[#E85002]'
                          : 'border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] hover:border-[#E85002]/60'
                      }`}
                    >
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-bold text-[#000000] dark:text-[#F9F9F9] whitespace-nowrap">
                            {planLabel}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {planDiscount && (
                              <span className="rounded-full bg-[#E85002]/15 border border-[#E85002]/30 px-2.5 py-0.5 text-[11px] font-semibold text-[#E85002] whitespace-nowrap shrink-0">
                                {planDiscount}
                              </span>
                            )}
                            {active && (
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#E85002] text-[#F9F9F9] shrink-0">
                                <Check className="h-3 w-3 stroke-[3]" />
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="mt-3 font-mono text-3xl font-bold text-[#000000] dark:text-[#F9F9F9] tabular-nums">
                          {p.priceEur} €
                          <span className="ml-1 text-xs font-normal text-[#646464] dark:text-[#A7A7A7]">
                            {planPeriod}
                          </span>
                        </p>
                      </div>
                      <p className="mt-4 text-xs text-[#646464] dark:text-[#A7A7A7]">
                        {isEn
                          ? `${planKey === 'annual' ? 'Annual' : 'Monthly'} renewal, cancel anytime.`
                          : `Renouvellement ${planKey === 'annual' ? 'annuel' : 'mensuel'}, résiliable à tout moment.`}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="ice-panel rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-[#000000] dark:text-[#F9F9F9]">
                  {isEn ? 'Annual Plan: only ' : 'Formule Annuelle : soit '}
                  <span className="font-mono text-[#E85002] tabular-nums">
                    {savings.annualEffectiveMonthlyEur.toFixed(2)} {isEn ? '€/mo' : '€/mois'}
                  </span>
                </span>
                <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {isEn
                    ? `${savings.yearlySavingsEur} € saved/year (-${savings.yearlySavingsPct}%)`
                    : `${savings.yearlySavingsEur} € économisés/an (-${savings.yearlySavingsPct}%)`}
                </span>
              </div>

              <div className="rounded-2xl border border-[var(--ae-border)] bg-white/80 dark:bg-[#141417] overflow-hidden text-xs">
                <div className="grid grid-cols-3 border-b border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1E1E22] px-4 py-2.5 font-semibold text-[#000000] dark:text-[#F9F9F9]">
                  <span>{isEn ? 'Feature' : 'Fonction'}</span>
                  <span className="text-center text-[#646464] dark:text-[#A7A7A7]">
                    {isEn ? 'Personal' : 'Personnel'}
                  </span>
                  <span className="text-center text-[#E85002]">
                    {isEn ? 'Active Member' : 'Abonné actif'}
                  </span>
                </div>
                {(isEn
                  ? [
                      ['Events & Networks', 'Free preview', 'Full access'],
                      ['Details & Registrations', 'Locked', 'Unlimited'],
                      ['Profile & Company Page', 'Private only', 'Visible in directory'],
                      ['Directory & Contacts', 'Locked', 'Requests & filters'],
                      ['E2EE Messaging & Voice', 'Locked', 'Real-time & offline'],
                    ]
                  : [
                      ['Événements & Réseaux', 'Aperçu gratuit', 'Accès complet'],
                      ['Fiches & Inscriptions', 'Verrouillé', 'Illimité'],
                      ['Profil & Page entreprise', 'Privé uniquement', 'Visible annuaire'],
                      ['Annuaire & Contacts', 'Verrouillé', 'Demandes & tri'],
                      ['Messagerie E2EE & Voix', 'Verrouillé', 'Temps réel & hors ligne'],
                    ]
                ).map(([feat, pers, sub]) => (
                  <div
                    key={feat}
                    className="grid grid-cols-3 border-b last:border-b-0 border-[var(--ae-border)] px-4 py-2.5 text-[#333333] dark:text-[#D9C3AB]"
                  >
                    <span className="font-semibold text-[#000000] dark:text-[#F9F9F9]">{feat}</span>
                    <span className="text-center text-[#646464] dark:text-[#A7A7A7]">{pers}</span>
                    <span className="text-center font-semibold text-emerald-600 dark:text-emerald-400">{sub}</span>
                  </div>
                ))}
              </div>

              {/* Billing & Mobile Money FAQ Accordion */}
              <div className="rounded-2xl border border-[var(--ae-border)] divide-y divide-[var(--ae-border)] bg-white/70 dark:bg-[#141417] overflow-hidden">
                {(isEn
                  ? [
                      {
                        q: 'Which Mobile Money providers are accepted?',
                        a: 'Orange Money, Wave, MTN MoMo, and Visa/Mastercard. Only the last 4 digits are retained for your receipts.',
                      },
                      {
                        q: 'What happens if I cancel my plan?',
                        a: 'Your profile, accepted contacts, and E2EE vault remain intact; your access simply reverts to the Personal tier.',
                      },
                      {
                        q: 'Can I switch from Monthly to Annual later?',
                        a: 'Yes, anytime from the Renewal management panel on the left with zero session interruption.',
                      },
                    ]
                  : [
                      {
                        q: 'Quels moyens Mobile Money sont acceptés ?',
                        a: 'Orange Money, Wave, MTN MoMo et cartes Visa/Mastercard. Seuls les 4 derniers chiffres sont conservés pour vos justificatifs.',
                      },
                      {
                        q: 'Que se passe-t-il en cas de résiliation ?',
                        a: 'Votre profil, vos contacts déjà acceptés et votre coffre E2EE restent intacts ; l’accès repasse simplement au niveau Personnel.',
                      },
                      {
                        q: 'Puis-je basculer du Mensuel à l’Annuel plus tard ?',
                        a: 'Oui, à tout moment depuis le panneau Gestion du renouvellement à gauche sans interruption de session.',
                      },
                    ]
                ).map((item, idx) => {
                  const expanded = openFaqIdx === idx;
                  return (
                    <div key={item.q}>
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => setOpenFaqIdx(expanded ? null : idx)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:bg-[#F3EFEA]/60 dark:hover:bg-[#1A1A1D]"
                      >
                        <span>{item.q}</span>
                        <ChevronDown
                          className={`h-4 w-4 text-[#E85002] shrink-0 transition-transform ${
                            expanded ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                      {expanded && (
                        <p className="px-4 pb-3 text-xs text-[#646464] dark:text-[#A7A7A7] leading-relaxed">
                          {item.a}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!user) onOpenAuth();
                  else setStep(2);
                }}
                className="w-full min-h-[50px] rounded-full orange-glow-btn px-3 text-sm font-semibold flex items-center justify-between"
              >
                <span className="pl-3">
                  {user
                    ? isEn
                      ? 'Continue to payment'
                      : 'Continuer vers le paiement'
                    : isEn
                      ? 'Sign in to continue'
                      : 'Se connecter pour continuer'}
                </span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-[#F9F9F9]">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </button>
            </div>
          )}

          {step === 2 && (
            <form onSubmit={handleCheckoutConfirm} className="mt-6 space-y-5">
              <div>
                <h2 className="text-xl font-bold text-[#000000] dark:text-[#F9F9F9]">
                  {isEn ? 'Complete your subscription' : 'Finaliser votre abonnement'}
                </h2>
                <p className="mt-1 text-sm text-[#646464] dark:text-[#A7A7A7]">
                  {isEn
                    ? 'You are one step away from unlocking full Africa Entrepreneur access.'
                    : 'Vous êtes à une étape de débloquer l’accès complet Africa Entrepreneur.'}
                </p>
              </div>

              {/* Payment method selector */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPayMethod('card')}
                  className={`min-h-[48px] flex items-center justify-center gap-2 rounded-2xl border text-xs font-semibold transition-colors ${
                    payMethod === 'card'
                      ? 'border-[#E85002] bg-[#E85002]/12 text-[#000000] dark:text-[#F9F9F9]'
                      : 'border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] text-[#646464] dark:text-[#A7A7A7] hover:text-[#000000] dark:hover:text-[#F9F9F9]'
                  }`}
                >
                  <CreditCard className={`h-4 w-4 ${payMethod === 'card' ? 'text-[#E85002]' : ''}`} />
                  <span>{isEn ? 'Bank card' : 'Carte bancaire'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPayMethod('mobile_money')}
                  className={`min-h-[48px] flex items-center justify-center gap-2 rounded-2xl border text-xs font-semibold transition-colors ${
                    payMethod === 'mobile_money'
                      ? 'border-[#E85002] bg-[#E85002]/12 text-[#000000] dark:text-[#F9F9F9]'
                      : 'border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] text-[#646464] dark:text-[#A7A7A7] hover:text-[#000000] dark:hover:text-[#F9F9F9]'
                  }`}
                >
                  <Smartphone className={`h-4 w-4 ${payMethod === 'mobile_money' ? 'text-[#E85002]' : ''}`} />
                  <span>Mobile Money</span>
                </button>
              </div>

              {payMethod === 'card' ? (
                <div className="space-y-3">
                  <div>
                    <label htmlFor="card-digits" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                      {isEn
                        ? 'Last 4 digits (secure delegated processing)'
                        : '4 derniers chiffres (traitement délégué sécurisé)'}
                    </label>
                    <input
                      id="card-digits"
                      type="text"
                      value={cardLast4}
                      onChange={(e) => setCardLast4(e.target.value)}
                      placeholder="4242"
                      maxLength={19}
                      className="w-full min-h-[46px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-4 font-mono text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="card-exp" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                        {isEn ? 'Expiry' : 'Expiration'}
                      </label>
                      <input
                        id="card-exp"
                        type="text"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        placeholder={isEn ? 'MM / YY' : 'MM / AA'}
                        className="w-full min-h-[46px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-4 font-mono text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="card-cvc" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                        {isEn ? 'Security code' : 'Code sécurité'}
                      </label>
                      <input
                        id="card-cvc"
                        type="password"
                        defaultValue="884"
                        placeholder="CVC"
                        className="w-full min-h-[46px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-4 font-mono text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <label htmlFor="momo-phone" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                    {isEn
                      ? 'Orange Money / Wave / MTN MoMo number (last 4 digits kept)'
                      : 'Numéro Orange Money / Wave / MTN MoMo (4 derniers chiffres conservés)'}
                  </label>
                  <input
                    id="momo-phone"
                    type="tel"
                    value={mobilePhone}
                    onChange={(e) => setMobilePhone(e.target.value)}
                    placeholder="+221 77 000 77 81"
                    className="w-full min-h-[46px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-4 font-mono text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
                  />
                </div>
              )}

              {/* Order Summary Box */}
              <div className="ice-panel rounded-2xl p-4 space-y-2.5">
                <p className="text-sm font-bold text-[#000000] dark:text-[#F9F9F9]">
                  {isEn ? 'Summary' : 'Récapitulatif'}
                </p>
                <div className="flex items-center justify-between text-sm text-[#646464] dark:text-[#A7A7A7]">
                  <span>{selectedPlan === 'annual' ? (isEn ? 'Annual' : pricing.label) : isEn ? 'Monthly' : pricing.label}</span>
                  <span className="font-mono font-semibold tabular-nums">{pricing.priceEur},00 €</span>
                </div>
                <div className="border-t border-[var(--ae-border)] pt-2.5 flex items-center justify-between text-base font-bold text-[#000000] dark:text-[#F9F9F9]">
                  <span>{isEn ? 'Total due today' : 'Total aujourd’hui'}</span>
                  <span className="font-mono tabular-nums text-[#E85002]">{pricing.priceEur},00 €</span>
                </div>
              </div>

              {/* 3 guarantees footer */}
              <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-[#646464] dark:text-[#A7A7A7]">
                <div className="flex flex-col items-center gap-1">
                  <ShieldCheck className="h-4 w-4 text-[#E85002]" />
                  <span>{isEn ? 'Encrypted payment' : 'Paiement chiffré'}</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <RefreshCw className="h-4 w-4 text-[#E85002]" />
                  <span>{isEn ? 'Cancel anytime' : 'Annulation libre'}</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <Lock className="h-4 w-4 text-[#E85002]" />
                  <span>{isEn ? 'No card stored' : 'Aucune carte stockée'}</span>
                </div>
              </div>

              {error && (
                <p className="rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                  {error}
                </p>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="min-h-[48px] rounded-full border border-[var(--ae-border)] bg-white dark:bg-[#1A1A1D] px-5 text-xs font-semibold text-[#333333] dark:text-[#F9F9F9] hover:border-[#E85002]"
                >
                  {isEn ? 'Back' : 'Retour'}
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 min-h-[48px] rounded-full orange-glow-btn px-4 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <span>
                    {busy
                      ? isEn
                        ? 'Confirming with server...'
                        : 'Confirmation serveur...'
                      : isEn
                        ? `Confirm payment (${pricing.priceEur} €)`
                        : `Confirmer le paiement (${pricing.priceEur} €)`}
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </form>
          )}

          {step === 3 && (
            <div className="mt-6 text-center space-y-4 py-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
                <Check className="h-7 w-7 stroke-[2.5]" />
              </div>
              <h2 className="text-2xl font-bold text-[#000000] dark:text-[#F9F9F9]">
                {isEn ? 'Subscription activated' : 'Abonnement activé'}
              </h2>
              <p className="text-sm text-[#646464] dark:text-[#A7A7A7] max-w-md mx-auto">
                {isEn
                  ? 'Your premium access is now active on the server. You can view full event details, register for gatherings, publish your profile, and chat over E2EE.'
                  : 'Vos droits premium sont désormais actifs côté serveur. Vous pouvez consulter les fiches complètes, vous inscrire aux événements, publier votre profil et discuter en E2EE.'}
              </p>
              {lastReceipt && (
                <div className="mx-auto max-w-sm ice-panel rounded-2xl p-4 text-left text-xs text-[#000000] dark:text-[#F9F9F9] space-y-1 font-mono">
                  <p>{isEn ? 'Receipt:' : 'Justificatif :'} {lastReceipt.receiptNumber}</p>
                  <p>{isEn ? 'Amount:' : 'Montant :'} {lastReceipt.amountEur} € ({lastReceipt.paymentMethodLabel})</p>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {onNavigate && (
                  <>
                    <button
                      type="button"
                      onClick={() => onNavigate('catalogue')}
                      className="min-h-[42px] rounded-full border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-4 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002]"
                    >
                      {isEn ? 'Explore Catalog' : 'Explorer le Catalogue'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('directory')}
                      className="min-h-[42px] rounded-full border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-4 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002]"
                    >
                      {isEn ? 'Open Directory' : 'Ouvrir l’Annuaire'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('messages')}
                      className="min-h-[42px] rounded-full border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-4 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002]"
                    >
                      {isEn ? 'E2EE Messaging' : 'Messagerie E2EE'}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="min-h-[42px] rounded-full orange-glow-btn px-6 text-xs font-semibold"
                >
                  {isEn ? 'Done' : 'Terminer'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Receipt Modal */}
      {activeReceiptModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-3xl border border-[var(--ae-border)] bg-white dark:bg-[#121214] p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-[#000000] dark:text-[#F9F9F9]">
              {isEn ? 'Payment Receipt' : 'Justificatif de paiement'}
            </h3>
            <div className="ice-panel rounded-2xl p-4 font-mono text-xs text-[#000000] dark:text-[#F9F9F9] space-y-2">
              <p>{isEn ? 'Receipt #:' : 'N° Reçu :'} {activeReceiptModal.receiptNumber}</p>
              <p>
                {isEn ? 'Plan:' : 'Formule :'}{' '}
                {activeReceiptModal.plan === 'annual' ? (isEn ? 'Annual' : 'Annuelle') : isEn ? 'Monthly' : 'Mensuelle'}
              </p>
              <p>{isEn ? 'Amount paid:' : 'Montant réglé :'} {activeReceiptModal.amountEur},00 EUR</p>
              <p>{isEn ? 'Method:' : 'Moyen :'} {activeReceiptModal.paymentMethodLabel}</p>
              <p>{isEn ? 'Date:' : 'Date :'} {new Date(activeReceiptModal.createdAt).toLocaleString(dateLocale)}</p>
              <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                {isEn ? 'Status: Paid & Verified' : 'Statut : Payé et vérifié'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleDownloadReceipt(activeReceiptModal)}
                className="min-h-[42px] inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-4 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002]"
              >
                <Download className="h-3.5 w-3.5 text-[#E85002]" />
                <span>{isEn ? 'Download' : 'Télécharger'}</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="min-h-[42px] inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-4 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002]"
              >
                <Printer className="h-3.5 w-3.5 text-[#E85002]" />
                <span>{isEn ? 'Print' : 'Imprimer'}</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setActiveReceiptModal(null)}
              className="w-full min-h-[44px] rounded-full orange-glow-btn text-xs font-semibold"
            >
              {isEn ? 'Close' : 'Fermer'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
