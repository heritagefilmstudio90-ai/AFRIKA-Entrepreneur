import type { ScannedBadgeContact } from '../types/domain';

export interface ParsedBadgeFields {
  fullName: string;
  headline: string;
  companyName: string;
  sector: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  linkedinUrl: string;
  rawText: string;
}

const KNOWN_SECTORS: Array<{ keywords: RegExp; sector: string }> = [
  { keywords: /fintech|paiement|payment|bank|finance|pay/i, sector: 'Fintech' },
  { keywords: /agro|agri|cacao|anacarde|export|farm/i, sector: 'Agro-industrie' },
  { keywords: /capital|venture|invest|vc|fund/i, sector: 'Capital-Risque' },
  { keywords: /edtech|éduc|educ|school|learn|formation/i, sector: 'EdTech' },
  { keywords: /énergie|energy|solar|solaire|clean|green/i, sector: 'Énergie & Climat' },
  { keywords: /logist|transport|supply|port|fret/i, sector: 'Logistique' },
  { keywords: /tech|studio|digital|software|ia|ai|cloud/i, sector: 'Technologie' },
];

const KNOWN_LOCATIONS: Array<{ pattern: RegExp; city: string; country: string }> = [
  { pattern: /\bdakar\b/i, city: 'Dakar', country: 'Sénégal' },
  { pattern: /\babidjan\b/i, city: 'Abidjan', country: 'Côte d’Ivoire' },
  { pattern: /\blagos\b/i, city: 'Lagos', country: 'Nigeria' },
  { pattern: /\bparis\b/i, city: 'Paris', country: 'France' },
  { pattern: /\blondres|london\b/i, city: 'Londres', country: 'Royaume-Uni' },
  { pattern: /\bmontr[eé]al\b/i, city: 'Montréal', country: 'Canada' },
  { pattern: /\bcasablanca|rabat\b/i, city: 'Casablanca', country: 'Maroc' },
  { pattern: /\bnairobi\b/i, city: 'Nairobi', country: 'Kenya' },
  { pattern: /\baccra\b/i, city: 'Accra', country: 'Ghana' },
  { pattern: /\bkigali\b/i, city: 'Kigali', country: 'Rwanda' },
  { pattern: /\baddis\b/i, city: 'Addis-Abeba', country: 'Éthiopie' },
];

const ROLE_PATTERN =
  /\b(ceo|cto|cfo|coo|fondat(eur|rice)|founder|co-founder|direct(eur|rice)|director|managing|associ[ée]|partner|responsable|head of|vp|président|manager|lead|ingénieur|engineer|consultant)\b/i;

const COMPANY_SUFFIX_PATTERN =
  /\b(sas|sarl|sa|ltd|llc|inc|corp|group|groupe|ventures|partners|labs|studio|africa|capital|tech|solutions|bank)\b/i;

export function parseBadgeOcrText(rawText: string): ParsedBadgeFields {
  const normalized = String(rawText || '')
    .replace(/\r\n/g, '\n')
    .trim();
  const lines = normalized
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const emailMatch = normalized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const email = emailMatch ? emailMatch[0].toLowerCase() : '';

  const phoneMatch = normalized.match(/(?:\+|00)?\d[\d\s().-]{7,16}\d/);
  const phone = phoneMatch ? phoneMatch[0].replace(/\s+/g, ' ').trim() : '';

  const linkedinMatch = normalized.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-z0-9_-]+/i);
  const linkedinUrl = linkedinMatch
    ? linkedinMatch[0].startsWith('http')
      ? linkedinMatch[0]
      : `https://${linkedinMatch[0]}`
    : '';

  let city = '';
  let country = '';
  for (const loc of KNOWN_LOCATIONS) {
    if (loc.pattern.test(normalized)) {
      city = loc.city;
      country = loc.country;
      break;
    }
  }

  let sector = '';
  for (const s of KNOWN_SECTORS) {
    if (s.keywords.test(normalized)) {
      sector = s.sector;
      break;
    }
  }

  // Filter lines for text fields (skip pure email/phone/url/event header noise)
  const contentLines = lines.filter((line) => {
    if (email && line.toLowerCase().includes(email) && line.length <= email.length + 12) return false;
    if (phone && line.includes(phone) && line.replace(/\D/g, '').length >= 8 && line.length < 24) return false;
    if (linkedinUrl && /linkedin\.com/i.test(line)) return false;
    if (/^(badge|vip|participant|exhibitor|speaker|pass|africa entrepreneur)\b/i.test(line)) return false;
    return true;
  });

  let fullName = '';
  let headline = '';
  let companyName = '';

  for (const line of contentLines) {
    // Explicit labeled lines e.g. "Nom: ...", "Poste: ...", "Entreprise: ..."
    const labelMatch = line.match(/^(nom|name|titre|poste|role|title|entreprise|company|société|secteur|sector|ville|city|pays|country)\s*[:\-]\s*(.+)$/i);
    if (labelMatch) {
      const key = labelMatch[1].toLowerCase();
      const val = labelMatch[2].trim();
      if (key === 'nom' || key === 'name') fullName = val;
      else if (key === 'titre' || key === 'poste' || key === 'role' || key === 'title') headline = val;
      else if (key === 'entreprise' || key === 'company' || key === 'société') companyName = val;
      else if (key === 'secteur' || key === 'sector') sector = val;
      else if (key === 'ville' || key === 'city') city = val;
      else if (key === 'pays' || key === 'country') country = val;
      continue;
    }

    if (!headline && ROLE_PATTERN.test(line)) {
      // Handle "CEO · PayTeranga SAS" or "Fondatrice @ PayTeranga"
      const splitParts = line.split(/\s*[·|@/\-–]\s*/).filter(Boolean);
      if (splitParts.length >= 2 && !companyName) {
        headline = splitParts[0].trim();
        companyName = splitParts.slice(1).join(' · ').trim();
      } else {
        headline = line;
      }
      continue;
    }

    if (!companyName && COMPANY_SUFFIX_PATTERN.test(line)) {
      companyName = line;
      continue;
    }

    if (!fullName && /^[A-ZÀ-Ÿ][a-zà-ÿ'-]+(?:\s+[A-ZÀ-Ÿ][A-Za-zÀ-ÿ'-]+){1,3}$/.test(line)) {
      fullName = line;
      continue;
    }
  }

  if (!fullName && contentLines.length > 0) {
    const candidate = contentLines.find((l) => l !== headline && l !== companyName);
    if (candidate) fullName = candidate;
  }
  if (!companyName && contentLines.length > 1) {
    const candidate = contentLines.find((l) => l !== fullName && l !== headline && !KNOWN_LOCATIONS.some((k) => k.pattern.test(l)));
    if (candidate) companyName = candidate;
  }
  if (!sector && companyName) {
    for (const s of KNOWN_SECTORS) {
      if (s.keywords.test(companyName)) {
        sector = s.sector;
        break;
      }
    }
  }

  return {
    fullName,
    headline,
    companyName,
    sector: sector || 'Entrepreneuriat',
    email,
    phone,
    city,
    country,
    linkedinUrl,
    rawText: normalized,
  };
}

/**
 * Pure RGBA pixel contrast & grayscale enhancer for OCR legibility on printed conference badges.
 */
export function applyBadgeContrastFilter(data: Uint8ClampedArray, contrastFactor = 1.45): Uint8ClampedArray {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const adjusted = Math.max(0, Math.min(255, Math.round((lum - 128) * contrastFactor + 128)));
    data[i] = adjusted;
    data[i + 1] = adjusted;
    data[i + 2] = adjusted;
  }
  return data;
}

export function processBadgeCanvas(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  targetCanvas: HTMLCanvasElement
): string {
  const srcWidth =
    source instanceof HTMLVideoElement
      ? source.videoWidth || 1280
      : source instanceof HTMLImageElement
        ? source.naturalWidth || source.width || 1280
        : source.width || 1280;
  const srcHeight =
    source instanceof HTMLVideoElement
      ? source.videoHeight || 720
      : source instanceof HTMLImageElement
        ? source.naturalHeight || source.height || 720
        : source.height || 720;

  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(srcWidth, srcHeight, 1));
  const width = Math.max(1, Math.round(srcWidth * scale));
  const height = Math.max(1, Math.round(srcHeight * scale));

  targetCanvas.width = width;
  targetCanvas.height = height;
  const ctx = targetCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Contexte graphique 2D indisponible pour le traitement d’image.');
  }

  ctx.drawImage(source, 0, 0, width, height);
  try {
    const imgData = ctx.getImageData(0, 0, width, height);
    applyBadgeContrastFilter(imgData.data, 1.4);
    ctx.putImageData(imgData, 0, 0);
  } catch {
    // Fallback if canvas pixels are tainted
  }
  return targetCanvas.toDataURL('image/jpeg', 0.9);
}

export function mergeScannedBadgeList(
  existing: ScannedBadgeContact[],
  incoming: ScannedBadgeContact
): ScannedBadgeContact[] {
  const normalizedEmail = incoming.email.trim().toLowerCase();
  const filtered = existing.filter((item) => {
    if (item.id === incoming.id) return false;
    if (normalizedEmail && item.email.trim().toLowerCase() === normalizedEmail) return false;
    return true;
  });
  return [incoming, ...filtered];
}
