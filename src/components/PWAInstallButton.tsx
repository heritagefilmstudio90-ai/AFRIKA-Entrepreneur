import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Laptop,
  QrCode,
  Share,
  Smartphone,
  Tablet,
  X,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import type { AppLanguage } from '../lib/i18n';

export const PWAInstallButton: React.FC<{ compact?: boolean; lang?: AppLanguage }> = ({
  compact = false,
  lang = 'fr',
}) => {
  const { isInstallable, isInstalled, isIOS, platformType, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [appUrl, setAppUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setAppUrl(window.location.origin);
    try {
      setIsInIframe(window.self !== window.top);
    } catch {
      setIsInIframe(true);
    }
  }, []);

  useEffect(() => {
    if (!showGuide || !appUrl.trim()) return;
    let cancelled = false;
    QRCode.toDataURL(appUrl.trim(), {
      width: 240,
      margin: 2,
      color: { dark: '#09090B', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [showGuide, appUrl]);

  if (isInstalled && platformType !== 'desktop') return null;

  const isEn = lang === 'en';

  const handleClick = async () => {
    if (platformType === 'android' && isInstallable && !isInIframe) {
      await install();
      return;
    }
    setShowGuide(true);
  };

  const handleCopyLink = async () => {
    if (!appUrl.trim()) return;
    try {
      await navigator.clipboard.writeText(appUrl.trim());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked in restricted frames
    }
  };

  const fullLabel = isIOS
    ? isEn
      ? 'Install iOS / QR'
      : 'Installer iOS / QR'
    : isEn
      ? 'Install App / QR'
      : 'Installer l’App / QR';

  const shortMobileLabel = isIOS ? 'iOS' : 'App';

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label={
          isEn
            ? 'Install on Android, iOS, tablet or desktop via QR code'
            : 'Installer sur Android, iOS, tablette ou ordinateur via code QR'
        }
        className={
          compact
            ? 'inline-flex min-h-[36px] sm:min-h-[38px] items-center justify-center gap-1 sm:gap-1.5 rounded-full bg-[#E85002] px-2.5 sm:px-3 text-[11px] sm:text-xs font-bold text-[#F9F9F9] hover:bg-[#F16001] shadow-[0_6px_18px_-6px_rgba(232,80,2,0.7)] transition-all shrink-0 whitespace-nowrap'
            : 'inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-[#E85002] px-4 py-2 text-xs font-bold text-[#F9F9F9] hover:bg-[#F16001] shadow-[0_10px_24px_-8px_rgba(232,80,2,0.65)] transition-all whitespace-nowrap'
        }
      >
        {compact ? (
          <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#F9F9F9] shrink-0" />
        ) : (
          <QrCode className="w-4 h-4 text-[#F9F9F9] shrink-0" />
        )}
        {compact ? (
          <>
            <span className="sm:hidden">{shortMobileLabel}</span>
            <span className="hidden sm:inline">{fullLabel}</span>
          </>
        ) : (
          <span>{fullLabel}</span>
        )}
      </button>

      {showGuide &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md p-4 pb-safe overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pwa-guide-title"
          >
            <div className="ios-sheet w-full max-w-lg rounded-3xl p-5 sm:p-6 my-auto max-h-[92dvh] overflow-y-auto">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-[#E85002]/15 border border-[#E85002]/35 flex items-center justify-center text-[#E85002] shrink-0">
                    <QrCode className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 id="pwa-guide-title" className="text-base font-bold text-[#000000] dark:text-[#F9F9F9]">
                      {isEn ? 'Install on iPhone & Android' : 'Installer sur iPhone & Android'}
                    </h3>
                    <p className="text-xs text-[#646464] dark:text-[#A7A7A7]">
                      {isEn
                        ? 'Scan the QR code with your phone camera'
                        : 'Scannez le code QR avec l’appareil photo du téléphone'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  aria-label={isEn ? 'Close install guide' : 'Fermer le guide d’installation'}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full text-[#646464] dark:text-[#A7A7A7] hover:text-[#000000] dark:hover:text-[#F9F9F9] hover:bg-black/5 dark:hover:bg-[#333333]/60"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scannable QR Code + Direct Mobile Link */}
              <div className="mt-4 rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#141417] p-4 flex flex-col items-center text-center">
                {qrDataUrl ? (
                  <div className="rounded-2xl bg-white p-2.5 shadow-sm border border-black/10">
                    <img
                      src={qrDataUrl}
                      alt={
                        isEn
                          ? 'QR code to open and install Africa Entrepreneur on iPhone and Android'
                          : 'Code QR pour ouvrir et installer Africa Entrepreneur sur iPhone et Android'
                      }
                      className="w-40 h-40 sm:w-44 sm:h-44 block"
                    />
                  </div>
                ) : (
                  <div className="w-44 h-44 rounded-2xl bg-white/80 flex items-center justify-center text-xs text-[#646464]">
                    {isEn ? 'Generating QR code…' : 'Génération du code QR…'}
                  </div>
                )}

                <p className="mt-3 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9]">
                  {isEn
                    ? 'Point your iPhone or Android camera at this QR code'
                    : 'Pointez la caméra de votre iPhone ou Android sur ce code QR'}
                </p>

                {isInIframe && (
                  <p className="mt-1 text-[11px] text-[#646464] dark:text-[#D9C3AB]">
                    {isEn
                      ? 'Tip: On mobile, open the direct link outside the preview frame in Safari or Chrome to install.'
                      : 'Astuce : ouvrez le lien directement dans Safari (iPhone) ou Chrome (Android) hors de la fenêtre d’aperçu.'}
                  </p>
                )}

                <div className="mt-3 w-full space-y-2">
                  <label className="sr-only" htmlFor="pwa-qr-url-input">
                    {isEn ? 'App installation URL' : 'Lien d’installation de l’application'}
                  </label>
                  <input
                    id="pwa-qr-url-input"
                    type="url"
                    value={appUrl}
                    onChange={(e) => setAppUrl(e.target.value)}
                    className="w-full rounded-xl border border-[var(--ae-border)] bg-white dark:bg-[#0B0B0D] px-3 py-2 text-[11px] font-mono text-[#000000] dark:text-[#F9F9F9] focus:outline-none focus:border-[#E85002]"
                  />

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-full border border-[var(--ae-border)] bg-white dark:bg-[#1E1E22] px-3 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002] transition-colors"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                          <span>{isEn ? 'Copied!' : 'Copié !'}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5 text-[#E85002]" />
                          <span>{isEn ? 'Copy link' : 'Copier le lien'}</span>
                        </>
                      )}
                    </button>

                    <a
                      href={appUrl || '/'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-full border border-[var(--ae-border)] bg-white dark:bg-[#1E1E22] px-3 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002] transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-[#E85002]" />
                      <span>{isEn ? 'Open link' : 'Ouvrir'}</span>
                    </a>

                    {qrDataUrl && (
                      <a
                        href={qrDataUrl}
                        download="afrika-entrepreneur-qr.png"
                        className="col-span-2 sm:col-span-1 inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-full border border-[var(--ae-border)] bg-white dark:bg-[#1E1E22] px-3 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002] transition-colors"
                      >
                        <Download className="h-3.5 w-3.5 text-[#E85002]" />
                        <span>{isEn ? 'Save QR' : 'QR PNG'}</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-2.5 text-sm text-[#333333] dark:text-[#A7A7A7]">
                <div
                  className={`rounded-2xl bg-[#F3EFEA] dark:bg-[#1A1A1D] border p-3 ${
                    platformType === 'ios' ? 'border-[#E85002]' : 'border-[var(--ae-border)]'
                  }`}
                >
                  <p className="font-semibold text-xs text-[#000000] dark:text-[#F9F9F9] flex items-center gap-2">
                    <Tablet className="h-4 w-4 text-[#E85002] shrink-0" />
                    <span>iPhone & iPad (Safari)</span>
                  </p>
                  <p className="mt-1 text-xs leading-relaxed">
                    {isEn ? (
                      <>
                        1. Scan the QR code and open in <strong className="text-[#E85002]">Safari</strong>. Tap{' '}
                        <span className="inline-flex items-center gap-0.5 font-semibold text-[#E85002]">
                          <Share className="h-3 w-3" /> Share
                        </span>{' '}
                        → <strong className="text-[#E85002]">Add to Home Screen</strong>.
                      </>
                    ) : (
                      <>
                        1. Scannez le QR et ouvrez dans <strong className="text-[#E85002]">Safari</strong>. Touchez{' '}
                        <span className="inline-flex items-center gap-0.5 font-semibold text-[#E85002]">
                          <Share className="h-3 w-3" /> Partager
                        </span>{' '}
                        → <strong className="text-[#E85002]">Sur l’écran d’accueil</strong>.
                      </>
                    )}
                  </p>
                </div>

                <div
                  className={`rounded-2xl bg-[#F3EFEA] dark:bg-[#1A1A1D] border p-3 ${
                    platformType === 'android' ? 'border-[#E85002]' : 'border-[var(--ae-border)]'
                  }`}
                >
                  <p className="font-semibold text-xs text-[#000000] dark:text-[#F9F9F9] flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-[#E85002] shrink-0" />
                    <span>{isEn ? 'Android & Tablets (Chrome)' : 'Android & Tablettes (Chrome)'}</span>
                  </p>
                  <p className="mt-1 text-xs leading-relaxed">
                    {isEn ? (
                      <>
                        Scan the QR code and open in <strong className="text-[#E85002]">Chrome</strong>, then tap menu{' '}
                        <strong className="text-[#E85002]">⋮ → Install app</strong>.
                      </>
                    ) : (
                      <>
                        Scannez le QR et ouvrez dans <strong className="text-[#E85002]">Chrome</strong>, puis touchez le menu{' '}
                        <strong className="text-[#E85002]">⋮ → Installer l’application</strong>.
                      </>
                    )}
                  </p>
                </div>

                {isInstallable && (
                  <button
                    type="button"
                    onClick={async () => {
                      await install();
                    }}
                    className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 rounded-full border border-[#E85002] text-xs font-bold text-[#E85002] hover:bg-[#E85002]/10 transition-colors"
                  >
                    <Laptop className="h-4 w-4" />
                    <span>
                      {isEn ? 'Install on this computer now' : 'Installer sur cet ordinateur maintenant'}
                    </span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="mt-4 w-full min-h-[44px] rounded-full bg-[#E85002] text-sm font-bold text-[#F9F9F9] hover:bg-[#F16001] transition-colors"
              >
                {isEn ? 'Got it' : 'Fermer'}
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

