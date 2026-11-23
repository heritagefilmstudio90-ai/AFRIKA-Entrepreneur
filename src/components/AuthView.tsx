import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Eye, EyeOff, KeyRound, Lock, Mail, MapPin, ShieldCheck, User } from 'lucide-react';
import { BrandMark } from './BrandMark';
import { apiFetch, ensureUserE2EEUnlocked, saveToken } from '../lib/apiClient';
import { generateIdentityKeyPair, wrapPrivateKeyWithPassphrase } from '../lib/cryptoE2EE';
import { translateCountry, type AppLanguage } from '../lib/i18n';
import { getGroupedCountryOptions } from '../lib/worldMap';
import type { MemberAccount, UserRole, SubscriptionStatus } from '../types/domain';

interface DemoAccountSummary {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  subscriptionStatus: SubscriptionStatus;
  subscriptionPlan?: string;
  city: string;
  country: string;
  avatarUrl?: string;
}

interface AuthViewProps {
  lang?: AppLanguage;
  onSuccess: (user: MemberAccount) => void;
  onClose?: () => void;
  initialMode?: 'login' | 'register' | 'recover';
}

export const AuthView: React.FC<AuthViewProps> = ({
  lang = 'fr',
  onSuccess,
  onClose,
  initialMode = 'login',
}) => {
  const isEn = lang === 'en';
  const [mode, setMode] = useState<'login' | 'register' | 'recover'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [country, setCountry] = useState('Sénégal');
  const [city, setCity] = useState('Dakar');
  const [showPass, setShowPass] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccountSummary[]>([]);

  // Email verification step after register
  const [verifyPendingUser, setVerifyPendingUser] = useState<MemberAccount | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyHint, setVerifyHint] = useState<string | null>(null);

  const groupedCountries = useMemo(() => getGroupedCountryOptions(), []);

  useEffect(() => {
    apiFetch<{ accounts: DemoAccountSummary[] }>('/api/auth/demo-accounts')
      .then((res) => setDemoAccounts(res.accounts))
      .catch(() => {});
  }, []);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMsg(null);

    if (mode === 'recover') {
      if (!emailValid || password.length < 6) {
        setError(
          isEn
            ? 'Enter a valid email and a new password (6+ characters).'
            : 'Saisissez un courriel valide et un nouveau mot de passe (6+ caractères).'
        );
        return;
      }
      setLoading(true);
      try {
        const res = await apiFetch<{ message: string }>('/api/auth/recover', {
          method: 'POST',
          body: JSON.stringify({ email, newPassword: password }),
        });
        setInfoMsg(res.message);
        setMode('login');
      } catch (err) {
        setError(err instanceof Error ? err.message : isEn ? 'Recovery failed.' : 'Échec de récupération.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === 'register') {
      if (!fullName.trim() || !emailValid || password.length < 6) {
        setError(
          isEn
            ? 'Please enter your full name, a valid email, and a password (6+ characters).'
            : 'Veuillez remplir votre nom complet, un courriel valide et un mot de passe (6+ caractères).'
        );
        return;
      }
      if (!agreeTerms) {
        setError(
          isEn
            ? 'Please accept the terms of service and end-to-end encryption privacy policy.'
            : 'Veuillez accepter les conditions d’utilisation et la politique de confidentialité.'
        );
        return;
      }
      setLoading(true);
      try {
        const kp = await generateIdentityKeyPair();
        const wrapped = await wrapPrivateKeyWithPassphrase(kp.privateKeyJwk, password, 10000);
        const res = await apiFetch<{
          token: string;
          user: MemberAccount;
          verificationHintCode?: string;
        }>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            email,
            password,
            fullName,
            country,
            city,
            language: lang,
            publicKeyJwk: kp.publicKeyJwk,
            wrappedPrivateKey: wrapped,
            keyFingerprint: kp.fingerprint,
          }),
        });
        saveToken(res.token);
        await ensureUserE2EEUnlocked(res.user, password);
        setVerifyPendingUser(res.user);
        setVerifyHint(res.verificationHintCode || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : isEn ? 'Registration error.' : 'Erreur lors de l’inscription.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!emailValid || !password) {
      setError(
        isEn ? 'Please enter your email and password.' : 'Veuillez saisir votre courriel et votre mot de passe.'
      );
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: MemberAccount }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      saveToken(res.token);
      await ensureUserE2EEUnlocked(res.user, password);
      onSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : isEn ? 'Unable to sign in.' : 'Connexion impossible.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyPendingUser) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ user: MemberAccount }>('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ code: verifyCode }),
      });
      onSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : isEn ? 'Incorrect code.' : 'Code incorrect.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoLogin = async (demoEmail: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ token: string; user: MemberAccount }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: demoEmail, password: 'Africa2026!' }),
      });
      saveToken(res.token);
      await ensureUserE2EEUnlocked(res.user, 'Africa2026!');
      onSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : isEn ? 'Demo login failed.' : 'Connexion démo échouée.');
    } finally {
      setLoading(false);
    }
  };

  if (verifyPendingUser) {
    return (
      <div className="mx-auto w-full max-w-md rounded-3xl border border-[var(--ae-border)] bg-white dark:bg-[#121214] overflow-hidden shadow-2xl">
        <div className="navy-card px-6 pt-8 pb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E85002]/15 border border-[#E85002]/35">
            <ShieldCheck className="h-7 w-7 text-[#E85002]" />
          </div>
          <h2 className="text-2xl font-bold text-[#F9F9F9]">
            {isEn ? 'Verify your email' : 'Vérifiez votre courriel'}
          </h2>
          <p className="mt-1.5 text-sm text-[#D9C3AB]">
            {isEn
              ? `E2EE vault initialized (${verifyPendingUser.keyFingerprint}). Enter the 6-digit code to activate your Personal Account.`
              : `Coffre E2EE initialisé (${verifyPendingUser.keyFingerprint}). Confirmez le code à 6 chiffres pour activer votre Compte Personnel.`}
          </p>
        </div>

        <form onSubmit={handleVerifyEmail} className="p-6 space-y-4">
          {verifyHint && (
            <div className="ice-panel rounded-2xl px-4 py-3 text-xs text-[#000000] dark:text-[#F9F9F9]">
              {isEn ? 'Verification code sent to ' : 'Code de vérification envoyé à '}
              <strong>{verifyPendingUser.email}</strong> :{' '}
              <span className="font-mono font-bold text-[#E85002]">{verifyHint}</span>
            </div>
          )}
          <div>
            <label htmlFor="verify-code" className="sr-only">
              {isEn ? 'Verification code' : 'Code de vérification'}
            </label>
            <input
              id="verify-code"
              type="text"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
              placeholder={isEn ? '6-digit code' : 'Code à 6 chiffres'}
              className="w-full min-h-[48px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-4 text-center font-mono text-lg tracking-widest text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[48px] rounded-full orange-glow-btn text-sm font-semibold disabled:opacity-60"
          >
            {loading
              ? isEn
                ? 'Verifying...'
                : 'Vérification...'
              : isEn
                ? 'Confirm & open member space'
                : 'Confirmer et accéder à l’espace membre'}
          </button>
          <button
            type="button"
            onClick={() => onSuccess(verifyPendingUser)}
            className="w-full min-h-[40px] text-xs font-medium text-[#646464] dark:text-[#A7A7A7] hover:text-[#E85002] transition-colors"
          >
            {isEn ? 'Continue and verify later' : 'Continuer et vérifier plus tard'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-3xl border border-[var(--ae-border)] bg-white dark:bg-[#121214] overflow-hidden shadow-2xl">
      {/* Top OLED Header Card with warm orange glow */}
      <div className="navy-card px-6 pt-7 pb-6 text-center">
        <div className="mx-auto mb-3.5 flex items-center justify-center">
          <BrandMark size={74} forceDarkSurface />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-[#F9F9F9]">
          {mode === 'login'
            ? isEn
              ? 'Secure Sign In'
              : 'Connexion sécurisée'
            : mode === 'register'
              ? isEn
                ? 'Create an Account'
                : 'Créer un compte'
              : isEn
                ? 'Recover Access'
                : 'Récupérer mon accès'}
        </h2>
        <p className="mt-1 text-xs sm:text-sm text-[#D9C3AB]">
          {mode === 'login'
            ? isEn
              ? 'Access your end-to-end encrypted vault'
              : 'Accédez à votre coffre chiffré de bout en bout'
            : mode === 'register'
              ? isEn
                ? 'Free Personal Account · E2EE encryption included'
                : 'Compte Personnel gratuit · Chiffrement E2EE inclus'
              : isEn
                ? 'Reset your access password'
                : 'Réinitialisez votre mot de passe d’accès'}
        </p>

        {/* Segmented mode switch */}
        <div className="mt-5 inline-flex rounded-full bg-white/10 p-1 border border-white/10">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`min-h-[36px] rounded-full px-4 text-xs font-semibold transition-all whitespace-nowrap ${
              mode === 'login'
                ? 'bg-[#E85002] text-[#F9F9F9] shadow-[0_6px_16px_-4px_rgba(232,80,2,0.55)]'
                : 'text-[#A7A7A7] hover:text-[#F9F9F9]'
            }`}
          >
            {isEn ? 'Sign in' : 'Connexion'}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`min-h-[36px] rounded-full px-4 text-xs font-semibold transition-all whitespace-nowrap ${
              mode === 'register'
                ? 'bg-[#E85002] text-[#F9F9F9] shadow-[0_6px_16px_-4px_rgba(232,80,2,0.55)]'
                : 'text-[#A7A7A7] hover:text-[#F9F9F9]'
            }`}
          >
            {isEn ? 'Sign up' : 'Inscription'}
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="px-6 pt-5 pb-6 space-y-3.5">
        {mode === 'register' && (
          <div className="relative flex items-center">
            <User className="pointer-events-none absolute left-4 h-4 w-4 text-[#A7A7A7]" />
            <label htmlFor="auth-fullname" className="sr-only">
              {isEn ? 'Full name' : 'Nom complet'}
            </label>
            <input
              id="auth-fullname"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={isEn ? 'Full name or founder' : 'Nom complet ou dirigeant'}
              className="w-full min-h-[48px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] pl-11 pr-4 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
            />
          </div>
        )}

        <div className="relative flex items-center">
          <Mail className="pointer-events-none absolute left-4 h-4 w-4 text-[#A7A7A7]" />
          <label htmlFor="auth-email" className="sr-only">
            {isEn ? 'Email address' : 'Adresse courriel'}
          </label>
          <input
            id="auth-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={isEn ? 'email@company.com' : 'courriel@entreprise.com'}
            className="w-full min-h-[48px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] pl-11 pr-11 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
          />
          {emailValid && (
            <span className="absolute right-3.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#E85002] text-[#F9F9F9]">
              <Check className="h-3 w-3 stroke-[3]" />
            </span>
          )}
        </div>

        <div className="relative flex items-center">
          <Lock className="pointer-events-none absolute left-4 h-4 w-4 text-[#A7A7A7]" />
          <label htmlFor="auth-password" className="sr-only">
            {mode === 'recover'
              ? isEn
                ? 'New password'
                : 'Nouveau mot de passe'
              : isEn
                ? 'Password'
                : 'Mot de passe'}
          </label>
          <input
            id="auth-password"
            type={showPass ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={
              mode === 'recover'
                ? isEn
                  ? 'New password (6+ chars)'
                  : 'Nouveau mot de passe (6+ car.)'
                : isEn
                  ? 'Password & vault key'
                  : 'Mot de passe & clé de coffre'
            }
            className="w-full min-h-[48px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] pl-11 pr-11 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShowPass((v) => !v)}
            aria-label={
              showPass
                ? isEn
                  ? 'Hide password'
                  : 'Masquer le mot de passe'
                : isEn
                  ? 'Show password'
                  : 'Afficher le mot de passe'
            }
            className="absolute right-2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full text-[#646464] dark:text-[#A7A7A7] hover:text-[#E85002]"
          >
            {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {mode === 'register' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="relative flex items-center">
              <MapPin className="pointer-events-none absolute left-3.5 h-4 w-4 text-[#A7A7A7]" />
              <label htmlFor="auth-country" className="sr-only">
                {isEn ? 'Country' : 'Pays'}
              </label>
              <select
                id="auth-country"
                value={country}
                onChange={(e) => {
                  const chosen = e.target.value;
                  setCountry(chosen);
                  const found = [...groupedCountries.africa, ...groupedCountries.diaspora].find(
                    (c) => c.nameFr === chosen
                  );
                  if (found) setCity(found.primaryCity);
                }}
                className="w-full min-h-[44px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] pl-10 pr-2 text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
              >
                <optgroup label={isEn ? 'Africa (54 countries)' : 'Afrique (54 pays)'}>
                  {groupedCountries.africa.map((c) => (
                    <option key={c.isoNumeric} value={c.nameFr}>
                      {isEn ? c.nameEn : c.nameFr}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={isEn ? 'Diaspora Worldwide (34 countries)' : 'Diaspora mondiale (34 pays)'}>
                  {groupedCountries.diaspora.map((c) => (
                    <option key={c.isoNumeric} value={c.nameFr}>
                      {isEn ? c.nameEn : c.nameFr}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div>
              <label htmlFor="auth-city" className="sr-only">
                {isEn ? 'City' : 'Ville'}
              </label>
              <input
                id="auth-city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder={isEn ? 'City' : 'Ville'}
                className="w-full min-h-[44px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-4 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
              />
            </div>
          </div>
        )}

        {mode === 'register' && (
          <label className="flex items-start gap-2.5 pt-1 text-xs text-[#646464] dark:text-[#A7A7A7] cursor-pointer">
            <input
              type="checkbox"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#E85002]"
            />
            <span>
              {isEn
                ? 'I accept the networking terms of service and end-to-end encryption privacy policy.'
                : 'J’accepte les conditions de mise en relation et la politique de chiffrement de bout en bout.'}
            </span>
          </label>
        )}

        {error && (
          <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        {infoMsg && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            {infoMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-1 w-full min-h-[48px] rounded-full orange-glow-btn px-6 text-sm font-semibold active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <span>
            {loading
              ? isEn
                ? 'Encrypting & verifying...'
                : 'Chiffrement & validation...'
              : mode === 'login'
                ? isEn
                  ? 'Sign in'
                  : 'Se connecter'
                : mode === 'register'
                  ? isEn
                    ? 'Create Personal Account'
                    : 'Créer mon compte Personnel'
                  : isEn
                    ? 'Reset password'
                    : 'Réinitialiser le mot de passe'}
          </span>
          <ArrowRight className="h-4 w-4" />
        </button>

        <div className="flex items-center justify-between pt-1 text-xs text-[#646464] dark:text-[#A7A7A7]">
          {mode !== 'recover' ? (
            <button
              type="button"
              onClick={() => {
                setMode('recover');
                setError(null);
              }}
              className="hover:text-[#E85002] font-medium transition-colors"
            >
              {isEn ? 'Forgot password?' : 'Mot de passe oublié ?'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMode('login')}
              className="hover:text-[#E85002] font-medium transition-colors"
            >
              {isEn ? 'Back to sign in' : 'Retour à la connexion'}
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="hover:text-[#E85002] font-medium transition-colors"
            >
              {isEn ? 'Continue as guest' : 'Continuer en visiteur'}
            </button>
          )}
        </div>
      </form>

      {/* Demo multi-role quick switcher for testing & client reception */}
      {demoAccounts.length > 0 && (
        <div className="border-t border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#0B0B0D] px-6 py-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] mb-2.5">
            <KeyRound className="h-3.5 w-3.5 text-[#E85002]" />
            <span>
              {isEn
                ? 'Quick multi-role access (E2EE Demo)'
                : 'Accès rapide multi-rôles (Démonstration E2EE)'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {demoAccounts.map((acc) => (
              <button
                key={acc.id}
                type="button"
                disabled={loading}
                onClick={() => handleQuickDemoLogin(acc.email)}
                className="porcelain-card flex flex-col items-start rounded-xl px-3 py-2 text-left hover:border-[#E85002] transition-colors"
              >
                <span className="text-xs font-bold text-[#000000] dark:text-[#F9F9F9] truncate w-full">{acc.fullName}</span>
                <span className="text-[11px] text-[#646464] dark:text-[#A7A7A7] truncate w-full">
                  {acc.role === 'admin'
                    ? isEn
                      ? 'Administrator'
                      : 'Administrateur'
                    : acc.subscriptionStatus === 'active'
                      ? `${isEn ? 'Member' : 'Abonné'} · ${acc.city} (${translateCountry(acc.country, lang)})`
                      : `${isEn ? 'Personal' : 'Personnel'} · ${acc.city}`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

