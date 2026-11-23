import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  RefreshCw,
  ScanLine,
  Sparkles,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/apiClient';
import { parseBadgeOcrText, processBadgeCanvas, type ParsedBadgeFields } from '../lib/badgeOcr';
import type { AppLanguage } from '../lib/i18n';
import type { BusinessEvent, ScannedBadgeContact } from '../types/domain';

interface BadgeScannerModalProps {
  isOpen: boolean;
  event?: BusinessEvent | null;
  mode: 'event_contact' | 'my_profile';
  isAuthenticated: boolean;
  lang?: AppLanguage;
  onClose: () => void;
  onSaveBadgeContact: (badge: ScannedBadgeContact) => Promise<void> | void;
  onApplyToProfile?: (fields: ParsedBadgeFields) => void;
}

const EMPTY_FIELDS: ParsedBadgeFields = {
  fullName: '',
  headline: '',
  companyName: '',
  sector: 'Entrepreneuriat',
  email: '',
  phone: '',
  city: '',
  country: '',
  linkedinUrl: '',
  rawText: '',
};

export const BadgeScannerModal: React.FC<BadgeScannerModalProps> = ({
  isOpen,
  event,
  mode,
  isAuthenticated,
  lang = 'fr',
  onClose,
  onSaveBadgeContact,
  onApplyToProfile,
}) => {
  const isEn = lang === 'en';
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [processedPreviewUrl, setProcessedPreviewUrl] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<string | null>(null);
  const [fields, setFields] = useState<ParsedBadgeFields>(EMPTY_FIELDS);
  const [saving, setSaving] = useState(false);

  const stopCamera = () => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen]);

  if (!isOpen) return null;

  const startCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        isEn
          ? 'Live camera unavailable on this browser — upload a badge photo instead.'
          : 'Caméra directe non disponible sur ce navigateur — importez une photo du badge.'
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setCameraError(
        isEn
          ? 'Camera access denied or unavailable. You can upload a badge photo.'
          : 'Accès caméra refusé ou indisponible. Vous pouvez importer une photo du badge.'
      );
      setCameraActive(false);
    }
  };

  const runOcrExtraction = async (processedDataUrl: string) => {
    setOcrBusy(true);
    setOcrStatus(
      isEn
        ? 'Image preprocessing and OCR extraction in progress...'
        : 'Traitement d’image et extraction OCR en cours...'
    );

    try {
      if (navigator.onLine) {
        try {
          const res = await apiFetch<{ extracted: Partial<ParsedBadgeFields> }>('/api/multimodal/scan-badge', {
            method: 'POST',
            body: JSON.stringify({ imageBase64: processedDataUrl, mimeType: 'image/jpeg' }),
          });
          const ext = res.extracted || {};
          const rawParsed = ext.rawText ? parseBadgeOcrText(ext.rawText) : EMPTY_FIELDS;
          setFields({
            fullName: ext.fullName || rawParsed.fullName,
            headline: ext.headline || rawParsed.headline,
            companyName: ext.companyName || rawParsed.companyName,
            sector: ext.sector || rawParsed.sector || 'Entrepreneuriat',
            email: ext.email || rawParsed.email,
            phone: ext.phone || rawParsed.phone,
            city: ext.city || rawParsed.city || event?.city || '',
            country: ext.country || rawParsed.country || event?.country || '',
            linkedinUrl: ext.linkedinUrl || rawParsed.linkedinUrl,
            rawText: ext.rawText || rawParsed.rawText,
          });
          setOcrStatus(
            isEn
              ? 'Profile extracted automatically via visual OCR.'
              : 'Profil extrait automatiquement par OCR visuel.'
          );
          setOcrBusy(false);
          return;
        } catch (err) {
          const winWithDetector = window as unknown as {
            TextDetector?: new () => { detect: (img: HTMLCanvasElement) => Promise<Array<{ rawValue?: string }>> };
          };
          if (winWithDetector.TextDetector && canvasRef.current) {
            try {
              const detector = new winWithDetector.TextDetector();
              const blocks = await detector.detect(canvasRef.current);
              const detectedText = blocks
                .map((b) => b.rawValue || '')
                .filter(Boolean)
                .join('\n');
              if (detectedText.trim()) {
                const localParsed = parseBadgeOcrText(detectedText);
                setFields({
                  ...localParsed,
                  city: localParsed.city || event?.city || '',
                  country: localParsed.country || event?.country || '',
                });
                setOcrStatus(
                  isEn
                    ? 'Text extracted locally via on-device OCR.'
                    : 'Texte extrait localement via OCR embarqué de l’appareil.'
                );
                setOcrBusy(false);
                return;
              }
            } catch {
              // Fall through
            }
          }
          setOcrStatus(
            err instanceof Error
              ? `${err.message} ${isEn ? 'Verify or paste raw badge text below for instant parsing.' : 'Vérifiez ou collez le texte brut du badge ci-dessous pour extraction instantanée.'}`
              : isEn
                ? 'Cloud OCR unavailable — check or fill in extracted fields below.'
                : 'OCR cloud indisponible — vérifiez ou complétez les champs extraits ci-dessous.'
          );
        }
      } else {
        setOcrStatus(
          isEn
            ? 'Offline mode: high-contrast image prepared. Fill in or paste badge text for local parsing.'
            : 'Mode hors ligne : image traitée en haut contraste. Complétez ou collez le texte du badge pour l’analyse locale.'
        );
      }
    } finally {
      setOcrBusy(false);
    }
  };

  const handleCaptureCameraFrame = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const dataUrl = processBadgeCanvas(videoRef.current, canvasRef.current);
    setProcessedPreviewUrl(dataUrl);
    stopCamera();
    await runOcrExtraction(dataUrl);
  };

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !canvasRef.current) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = async () => {
        if (!canvasRef.current) return;
        const processed = processBadgeCanvas(img, canvasRef.current);
        setProcessedPreviewUrl(processed);
        await runOcrExtraction(processed);
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleParseRawText = async () => {
    if (!fields.rawText.trim()) return;
    if (isAuthenticated && navigator.onLine) {
      try {
        const pyParsed = await apiFetch<ParsedBadgeFields>('/api/badges/parse-python', {
          method: 'POST',
          body: JSON.stringify({ rawText: fields.rawText }),
        });
        setFields((prev) => ({
          ...pyParsed,
          city: pyParsed.city || prev.city || event?.city || '',
          country: pyParsed.country || prev.country || event?.country || '',
        }));
        setOcrStatus(
          isEn
            ? 'Structured fields extracted from badge OCR text.'
            : 'Champs structurés extraits depuis le texte OCR du badge.'
        );
        return;
      } catch {
        // Fallback to local parser below
      }
    }
    const parsed = parseBadgeOcrText(fields.rawText);
    setFields((prev) => ({
      ...parsed,
      city: parsed.city || prev.city || event?.city || '',
      country: parsed.country || prev.country || event?.country || '',
    }));
    setOcrStatus(
      isEn
        ? 'Fields automatically parsed from badge OCR text.'
        : 'Champs extraits automatiquement depuis le texte OCR du badge.'
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fields.fullName.trim()) return;
    setSaving(true);
    try {
      if (mode === 'my_profile' && onApplyToProfile) {
        onApplyToProfile(fields);
        onClose();
        return;
      }

      const localBadge: ScannedBadgeContact = {
        id: `badge-${Date.now()}`,
        eventId: event?.id,
        eventTitle: event?.title,
        fullName: fields.fullName.trim(),
        headline: fields.headline.trim(),
        companyName: fields.companyName.trim(),
        sector: fields.sector.trim() || 'Entrepreneuriat',
        email: fields.email.trim().toLowerCase(),
        phone: fields.phone.trim(),
        city: fields.city.trim(),
        country: fields.country.trim(),
        linkedinUrl: fields.linkedinUrl.trim() || undefined,
        rawText: fields.rawText.trim() || undefined,
        createdAt: new Date().toISOString(),
      };

      if (isAuthenticated && navigator.onLine) {
        try {
          const res = await apiFetch<{ badge: ScannedBadgeContact }>('/api/badges', {
            method: 'POST',
            body: JSON.stringify(localBadge),
          });
          await onSaveBadgeContact(res.badge);
          onClose();
          return;
        } catch {
          // Persist locally if request fails
        }
      }

      await onSaveBadgeContact(localBadge);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="badge-scanner-title"
    >
      <div className="ios-sheet max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-[28px] sm:rounded-[28px] p-5 sm:p-6 space-y-5">
        <div className="mx-auto h-1 w-10 rounded-full bg-[#A7A7A7]/50 dark:bg-[#333333] sm:hidden" />

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#E85002]/15 text-[#E85002]">
              <ScanLine className="h-5 w-5" />
            </span>
            <div>
              <h2 id="badge-scanner-title" className="text-lg font-bold text-[#000000] dark:text-[#F9F9F9]">
                {isEn ? 'Business Badge Scanner (OCR)' : 'Scan de badge professionnel (OCR)'}
              </h2>
              <p className="text-xs text-[#646464] dark:text-[#A7A7A7]">
                {event
                  ? `${event.title} · ${event.city}`
                  : isEn
                    ? 'Automatic extraction via camera and image preprocessing'
                    : 'Extraction automatique par caméra et traitement d’image'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            aria-label={isEn ? 'Close badge scanner' : 'Fermer le scanner de badge'}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F3EFEA] dark:bg-[#1E1E22] text-[#646464] dark:text-[#A7A7A7] hover:text-[#E85002] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-3xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] p-4 space-y-3">
          <canvas ref={canvasRef} className="hidden" />

          {cameraActive ? (
            <div className="relative overflow-hidden rounded-2xl bg-black aspect-video">
              <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
              <div className="pointer-events-none absolute inset-4 rounded-2xl border-2 border-dashed border-[#E85002]/85 flex items-end justify-center p-2">
                <span className="rounded-full bg-black/75 px-3 py-1 text-[11px] font-medium text-[#F9F9F9]">
                  {isEn ? 'Align badge inside frame' : 'Alignez le badge dans le cadre'}
                </span>
              </div>
            </div>
          ) : processedPreviewUrl ? (
            <div className="relative overflow-hidden rounded-2xl bg-black border border-[var(--ae-border)]">
              <img
                src={processedPreviewUrl}
                alt={isEn ? 'High-contrast preprocessed badge preview' : 'Aperçu du badge traité en haut contraste'}
                className="max-h-48 w-full object-contain mx-auto"
              />
              <span className="absolute bottom-2 left-2 rounded-full bg-black/80 px-2.5 py-0.5 text-[10px] font-medium text-[#F9F9F9]">
                {isEn ? 'B&W contrast preprocessing applied' : 'Prétraitement contraste N&B appliqué'}
              </span>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#E85002]/45 bg-white dark:bg-[#121214] px-4 py-6 text-center space-y-2">
              <Camera className="mx-auto h-7 w-7 text-[#E85002]" />
              <p className="text-xs font-semibold text-[#000000] dark:text-[#F9F9F9]">
                {isEn ? 'Snap or upload an attendee badge' : 'Photographiez ou importez un badge participant'}
              </p>
              <p className="text-[11px] text-[#646464] dark:text-[#A7A7A7]">
                {isEn
                  ? 'Image preprocessing sharpens text contrast before OCR extraction.'
                  : 'Le traitement d’image améliore la netteté des caractères avant l’extraction OCR.'}
              </p>
            </div>
          )}

          {cameraError && (
            <p className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              {cameraError}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {cameraActive ? (
              <>
                <button
                  type="button"
                  onClick={handleCaptureCameraFrame}
                  className="min-h-[42px] flex-1 inline-flex items-center justify-center gap-2 rounded-full orange-glow-btn px-4 text-xs font-semibold"
                >
                  <Camera className="h-4 w-4" />
                  <span>{isEn ? 'Capture & extract OCR' : 'Capturer & extraire OCR'}</span>
                </button>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="min-h-[42px] rounded-full border border-[var(--ae-border)] bg-white dark:bg-[#121214] px-4 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9]"
                >
                  {isEn ? 'Stop camera' : 'Arrêter caméra'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={startCamera}
                  className="min-h-[42px] flex-1 inline-flex items-center justify-center gap-2 rounded-full orange-glow-btn px-4 text-xs font-semibold whitespace-nowrap"
                >
                  <Camera className="h-4 w-4" />
                  <span>{isEn ? 'Open camera' : 'Activer la caméra'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[42px] flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-[var(--ae-border)] bg-white dark:bg-[#121214] px-4 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002] transition-colors whitespace-nowrap"
                >
                  <Upload className="h-4 w-4 text-[#E85002]" />
                  <span>{isEn ? 'Upload badge photo' : 'Importer photo badge'}</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  aria-label={isEn ? 'Upload a business badge photo' : 'Importer une image de badge professionnel'}
                  onChange={handleImageFileUpload}
                  className="hidden"
                />
              </>
            )}
          </div>
        </div>

        {ocrStatus && (
          <div className="flex items-center gap-2 rounded-2xl bg-[#E85002]/12 border border-[#E85002]/25 px-3.5 py-2.5 text-xs font-medium text-[#000000] dark:text-[#F9F9F9]">
            {ocrBusy ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0 text-[#E85002]" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#E85002]" />
            )}
            <span>{ocrStatus}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="badge-raw-ocr" className="text-xs font-semibold text-[#646464] dark:text-[#A7A7A7]">
              {isEn ? 'Detected OCR text (editable)' : 'Texte OCR détecté (modifiable)'}
            </label>
            <button
              type="button"
              onClick={handleParseRawText}
              disabled={!fields.rawText.trim()}
              className="text-xs font-semibold text-[#E85002] hover:underline disabled:opacity-40"
            >
              {isEn ? 'Parse OCR fields' : 'Extraire les champs OCR'}
            </button>
          </div>
          <textarea
            id="badge-raw-ocr"
            rows={2}
            value={fields.rawText}
            onChange={(e) => setFields((f) => ({ ...f, rawText: e.target.value }))}
            placeholder={
              isEn
                ? 'Ex: Kofi Boateng · Managing Director · Volta Pay SAS · kofi@voltapay.io · Dakar'
                : 'Ex: Kofi Boateng · Directeur Général · Volta Pay SAS · kofi@voltapay.io · Dakar'
            }
            className="w-full rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 py-2 text-xs text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
          />
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="badge-fullname" className="block text-[11px] font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                {isEn ? 'Full name *' : 'Nom complet *'}
              </label>
              <input
                id="badge-fullname"
                type="text"
                required
                value={fields.fullName}
                onChange={(e) => setFields((f) => ({ ...f, fullName: e.target.value }))}
                placeholder={isEn ? 'First & last name' : 'Nom et prénom'}
                className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="badge-headline" className="block text-[11px] font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                {isEn ? 'Role / Title' : 'Fonction / Titre'}
              </label>
              <input
                id="badge-headline"
                type="text"
                value={fields.headline}
                onChange={(e) => setFields((f) => ({ ...f, headline: e.target.value }))}
                placeholder={isEn ? 'Ex: Founder & CEO' : 'Ex: Fondatrice & CEO'}
                className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="badge-company" className="block text-[11px] font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                {isEn ? 'Company' : 'Entreprise'}
              </label>
              <input
                id="badge-company"
                type="text"
                value={fields.companyName}
                onChange={(e) => setFields((f) => ({ ...f, companyName: e.target.value }))}
                placeholder="Ex: Volta Pay SAS"
                className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="badge-sector" className="block text-[11px] font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                {isEn ? 'Sector' : 'Secteur'}
              </label>
              <input
                id="badge-sector"
                type="text"
                value={fields.sector}
                onChange={(e) => setFields((f) => ({ ...f, sector: e.target.value }))}
                placeholder="Ex: Fintech"
                className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="badge-email" className="block text-[11px] font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                {isEn ? 'Work email' : 'Courriel professionnel'}
              </label>
              <input
                id="badge-email"
                type="email"
                value={fields.email}
                onChange={(e) => setFields((f) => ({ ...f, email: e.target.value }))}
                placeholder="name@company.com"
                className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="badge-phone" className="block text-[11px] font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                {isEn ? 'Phone' : 'Téléphone'}
              </label>
              <input
                id="badge-phone"
                type="text"
                value={fields.phone}
                onChange={(e) => setFields((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+221 77 000 00 00"
                className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="badge-city" className="block text-[11px] font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                {isEn ? 'City' : 'Ville'}
              </label>
              <input
                id="badge-city"
                type="text"
                value={fields.city}
                onChange={(e) => setFields((f) => ({ ...f, city: e.target.value }))}
                placeholder="Dakar"
                className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="badge-country" className="block text-[11px] font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                {isEn ? 'Country' : 'Pays'}
              </label>
              <input
                id="badge-country"
                type="text"
                value={fields.country}
                onChange={(e) => setFields((f) => ({ ...f, country: e.target.value }))}
                placeholder={isEn ? 'Senegal' : 'Sénégal'}
                className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            {onApplyToProfile && mode === 'event_contact' && fields.fullName.trim() && (
              <button
                type="button"
                onClick={() => {
                  onApplyToProfile(fields);
                  onClose();
                }}
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-full border border-[var(--ae-border)] bg-white dark:bg-[#1A1A1D] px-4 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002]"
              >
                <UserCheck className="h-3.5 w-3.5 text-[#E85002]" />
                <span>{isEn ? 'Pre-fill my profile' : 'Pré-remplir mon profil'}</span>
              </button>
            )}
            <button
              type="submit"
              disabled={saving || !fields.fullName.trim()}
              className="min-h-[44px] flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-full orange-glow-btn px-6 text-xs font-semibold disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              <span>
                {mode === 'my_profile'
                  ? isEn
                    ? 'Apply to profile'
                    : 'Appliquer au profil'
                  : saving
                    ? isEn
                      ? 'Saving...'
                      : 'Enregistrement...'
                    : isEn
                      ? 'Save badge contact'
                      : 'Enregistrer le contact badge'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
