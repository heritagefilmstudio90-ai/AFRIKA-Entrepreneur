import type { AppLanguage } from './i18n';
import type { BusinessEvent, ProfessionalNetwork } from '../types/domain';

export type WorldRegionPresetId = 'world' | 'africa' | 'europe' | 'americas' | 'gulf_asia';

export type CountryZone = 'africa' | 'diaspora';

export type CountrySubRegion =
  | 'west_africa'
  | 'central_africa'
  | 'east_africa'
  | 'north_africa'
  | 'southern_africa'
  | 'europe'
  | 'americas'
  | 'gulf_asia';

export interface CountryHubMeta {
  isoNumeric: string;
  nameFr: string;
  nameEn: string;
  region: CountryZone;
  subRegion: CountrySubRegion;
  primaryCity: string;
  cities: string[];
  coordinates: [number, number]; // [lng, lat]
  aliases?: string[];
}

export interface WorldRegionPreset {
  id: WorldRegionPresetId;
  labelFr: string;
  labelEn: string;
  center: [number, number];
  scaleFactor: number;
}

export interface MapTransformState {
  scale: number;
  tx: number;
  ty: number;
}

export interface HubCluster {
  key: string;
  city: string;
  country: string;
  isoNumeric?: string;
  zone: CountryZone;
  coordinates: [number, number];
  count: number;
  events: BusinessEvent[];
  networks: ProfessionalNetwork[];
  primaryLabel: string;
  secondaryLabel: string;
  isCatalogActive: boolean;
}

export interface CorridorArc {
  id: string;
  from: [number, number];
  to: [number, number];
  fromCity: string;
  toCity: string;
  label: string;
}

export function normalizeGeoText(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, "'")
    .toLowerCase()
    .trim();
}

export const WORLD_REGION_PRESETS: WorldRegionPreset[] = [
  { id: 'world', labelFr: 'Monde', labelEn: 'World', center: [12, 14], scaleFactor: 1 },
  { id: 'africa', labelFr: 'Afrique', labelEn: 'Africa', center: [18, 2], scaleFactor: 2.35 },
  { id: 'europe', labelFr: 'Europe', labelEn: 'Europe', center: [8, 49], scaleFactor: 3.1 },
  { id: 'americas', labelFr: 'Amériques', labelEn: 'Americas', center: [-66, 22], scaleFactor: 2.0 },
  { id: 'gulf_asia', labelFr: 'Golfe & Asie', labelEn: 'Gulf & Asia', center: [82, 22], scaleFactor: 1.85 },
];

/**
 * Complete directory of all 54 UN African countries + 34 major Diaspora host countries worldwide.
 * ISO 3166-1 numeric codes match world-atlas/countries-110m.json geometries.
 */
export const AFRICA_DIASPORA_COUNTRIES: CountryHubMeta[] = [
  // --- AFRICA (54 UN sovereign states) ---
  {
    isoNumeric: '012',
    nameFr: 'Algérie',
    nameEn: 'Algeria',
    region: 'africa',
    subRegion: 'north_africa',
    primaryCity: 'Alger',
    cities: ['Alger', 'Oran', 'Constantine'],
    coordinates: [3.0588, 36.7538],
    aliases: ['Algiers'],
  },
  {
    isoNumeric: '024',
    nameFr: 'Angola',
    nameEn: 'Angola',
    region: 'africa',
    subRegion: 'southern_africa',
    primaryCity: 'Luanda',
    cities: ['Luanda', 'Lobito'],
    coordinates: [13.2343, -8.8383],
  },
  {
    isoNumeric: '204',
    nameFr: 'Bénin',
    nameEn: 'Benin',
    region: 'africa',
    subRegion: 'west_africa',
    primaryCity: 'Cotonou',
    cities: ['Cotonou', 'Porto-Novo'],
    coordinates: [2.3912, 6.3703],
  },
  {
    isoNumeric: '072',
    nameFr: 'Botswana',
    nameEn: 'Botswana',
    region: 'africa',
    subRegion: 'southern_africa',
    primaryCity: 'Gaborone',
    cities: ['Gaborone', 'Francistown'],
    coordinates: [25.9231, -24.6282],
  },
  {
    isoNumeric: '854',
    nameFr: 'Burkina Faso',
    nameEn: 'Burkina Faso',
    region: 'africa',
    subRegion: 'west_africa',
    primaryCity: 'Ouagadougou',
    cities: ['Ouagadougou', 'Bobo-Dioulasso'],
    coordinates: [-1.5197, 12.3714],
  },
  {
    isoNumeric: '108',
    nameFr: 'Burundi',
    nameEn: 'Burundi',
    region: 'africa',
    subRegion: 'east_africa',
    primaryCity: 'Bujumbura',
    cities: ['Bujumbura', 'Gitega'],
    coordinates: [29.3644, -3.3822],
  },
  {
    isoNumeric: '132',
    nameFr: 'Cabo Verde',
    nameEn: 'Cabo Verde',
    region: 'africa',
    subRegion: 'west_africa',
    primaryCity: 'Praia',
    cities: ['Praia', 'Mindelo'],
    coordinates: [-23.5133, 14.933],
    aliases: ['Cap-Vert', 'Cape Verde'],
  },
  {
    isoNumeric: '120',
    nameFr: 'Cameroun',
    nameEn: 'Cameroon',
    region: 'africa',
    subRegion: 'central_africa',
    primaryCity: 'Douala',
    cities: ['Douala', 'Yaoundé'],
    coordinates: [9.7679, 4.0511],
  },
  {
    isoNumeric: '174',
    nameFr: 'Comores',
    nameEn: 'Comoros',
    region: 'africa',
    subRegion: 'east_africa',
    primaryCity: 'Moroni',
    cities: ['Moroni'],
    coordinates: [43.2551, -11.7172],
  },
  {
    isoNumeric: '178',
    nameFr: 'Congo',
    nameEn: 'Republic of the Congo',
    region: 'africa',
    subRegion: 'central_africa',
    primaryCity: 'Brazzaville',
    cities: ['Brazzaville', 'Pointe-Noire'],
    coordinates: [15.2429, -4.2634],
    aliases: ['Congo-Brazzaville'],
  },
  {
    isoNumeric: '384',
    nameFr: 'Côte d’Ivoire',
    nameEn: 'Côte d’Ivoire',
    region: 'africa',
    subRegion: 'west_africa',
    primaryCity: 'Abidjan',
    cities: ['Abidjan', 'Yamoussoukro', 'Bouaké'],
    coordinates: [-4.0083, 5.36],
    aliases: ["Côte d'Ivoire", 'Ivory Coast'],
  },
  {
    isoNumeric: '262',
    nameFr: 'Djibouti',
    nameEn: 'Djibouti',
    region: 'africa',
    subRegion: 'east_africa',
    primaryCity: 'Djibouti',
    cities: ['Djibouti'],
    coordinates: [43.1456, 11.5721],
  },
  {
    isoNumeric: '818',
    nameFr: 'Égypte',
    nameEn: 'Egypt',
    region: 'africa',
    subRegion: 'north_africa',
    primaryCity: 'Le Caire',
    cities: ['Le Caire', 'Alexandrie'],
    coordinates: [31.2357, 30.0444],
    aliases: ['Cairo'],
  },
  {
    isoNumeric: '232',
    nameFr: 'Érythrée',
    nameEn: 'Eritrea',
    region: 'africa',
    subRegion: 'east_africa',
    primaryCity: 'Asmara',
    cities: ['Asmara'],
    coordinates: [38.9251, 15.3229],
  },
  {
    isoNumeric: '748',
    nameFr: 'Eswatini',
    nameEn: 'Eswatini',
    region: 'africa',
    subRegion: 'southern_africa',
    primaryCity: 'Mbabane',
    cities: ['Mbabane'],
    coordinates: [31.1367, -26.3054],
    aliases: ['Swaziland'],
  },
  {
    isoNumeric: '231',
    nameFr: 'Éthiopie',
    nameEn: 'Ethiopia',
    region: 'africa',
    subRegion: 'east_africa',
    primaryCity: 'Addis-Abeba',
    cities: ['Addis-Abeba', 'Adama'],
    coordinates: [38.7578, 8.9806],
    aliases: ['Addis Ababa'],
  },
  {
    isoNumeric: '266',
    nameFr: 'Gabon',
    nameEn: 'Gabon',
    region: 'africa',
    subRegion: 'central_africa',
    primaryCity: 'Libreville',
    cities: ['Libreville', 'Port-Gentil'],
    coordinates: [9.4673, 0.4162],
  },
  {
    isoNumeric: '270',
    nameFr: 'Gambie',
    nameEn: 'Gambia',
    region: 'africa',
    subRegion: 'west_africa',
    primaryCity: 'Banjul',
    cities: ['Banjul'],
    coordinates: [-16.579, 13.4549],
  },
  {
    isoNumeric: '288',
    nameFr: 'Ghana',
    nameEn: 'Ghana',
    region: 'africa',
    subRegion: 'west_africa',
    primaryCity: 'Accra',
    cities: ['Accra', 'Kumasi'],
    coordinates: [-0.187, 5.6037],
  },
  {
    isoNumeric: '324',
    nameFr: 'Guinée',
    nameEn: 'Guinea',
    region: 'africa',
    subRegion: 'west_africa',
    primaryCity: 'Conakry',
    cities: ['Conakry'],
    coordinates: [-13.5784, 9.6412],
  },
  {
    isoNumeric: '624',
    nameFr: 'Guinée-Bissau',
    nameEn: 'Guinea-Bissau',
    region: 'africa',
    subRegion: 'west_africa',
    primaryCity: 'Bissau',
    cities: ['Bissau'],
    coordinates: [-15.5984, 11.8817],
  },
  {
    isoNumeric: '226',
    nameFr: 'Guinée équatoriale',
    nameEn: 'Equatorial Guinea',
    region: 'africa',
    subRegion: 'central_africa',
    primaryCity: 'Malabo',
    cities: ['Malabo', 'Bata'],
    coordinates: [8.7832, 3.7504],
  },
  {
    isoNumeric: '404',
    nameFr: 'Kenya',
    nameEn: 'Kenya',
    region: 'africa',
    subRegion: 'east_africa',
    primaryCity: 'Nairobi',
    cities: ['Nairobi', 'Mombasa'],
    coordinates: [36.8219, -1.2921],
  },
  {
    isoNumeric: '426',
    nameFr: 'Lesotho',
    nameEn: 'Lesotho',
    region: 'africa',
    subRegion: 'southern_africa',
    primaryCity: 'Maseru',
    cities: ['Maseru'],
    coordinates: [27.4833, -29.3167],
  },
  {
    isoNumeric: '430',
    nameFr: 'Libéria',
    nameEn: 'Liberia',
    region: 'africa',
    subRegion: 'west_africa',
    primaryCity: 'Monrovia',
    cities: ['Monrovia'],
    coordinates: [-10.7605, 6.2907],
  },
  {
    isoNumeric: '434',
    nameFr: 'Libye',
    nameEn: 'Libya',
    region: 'africa',
    subRegion: 'north_africa',
    primaryCity: 'Tripoli',
    cities: ['Tripoli', 'Benghazi'],
    coordinates: [13.1913, 32.8872],
  },
  {
    isoNumeric: '450',
    nameFr: 'Madagascar',
    nameEn: 'Madagascar',
    region: 'africa',
    subRegion: 'east_africa',
    primaryCity: 'Antananarivo',
    cities: ['Antananarivo', 'Toamasina'],
    coordinates: [47.5079, -18.8792],
  },
  {
    isoNumeric: '454',
    nameFr: 'Malawi',
    nameEn: 'Malawi',
    region: 'africa',
    subRegion: 'southern_africa',
    primaryCity: 'Lilongwe',
    cities: ['Lilongwe', 'Blantyre'],
    coordinates: [33.7741, -13.9626],
  },
  {
    isoNumeric: '466',
    nameFr: 'Mali',
    nameEn: 'Mali',
    region: 'africa',
    subRegion: 'west_africa',
    primaryCity: 'Bamako',
    cities: ['Bamako', 'Sikasso'],
    coordinates: [-8.0029, 12.6392],
  },
  {
    isoNumeric: '504',
    nameFr: 'Maroc',
    nameEn: 'Morocco',
    region: 'africa',
    subRegion: 'north_africa',
    primaryCity: 'Casablanca',
    cities: ['Casablanca', 'Marrakech', 'Rabat', 'Tanger'],
    coordinates: [-7.5898, 33.5731],
  },
  {
    isoNumeric: '480',
    nameFr: 'Maurice',
    nameEn: 'Mauritius',
    region: 'africa',
    subRegion: 'east_africa',
    primaryCity: 'Port-Louis',
    cities: ['Port-Louis'],
    coordinates: [57.5012, -20.1609],
  },
  {
    isoNumeric: '478',
    nameFr: 'Mauritanie',
    nameEn: 'Mauritania',
    region: 'africa',
    subRegion: 'west_africa',
    primaryCity: 'Nouakchott',
    cities: ['Nouakchott'],
    coordinates: [-15.9582, 18.0735],
  },
  {
    isoNumeric: '508',
    nameFr: 'Mozambique',
    nameEn: 'Mozambique',
    region: 'africa',
    subRegion: 'southern_africa',
    primaryCity: 'Maputo',
    cities: ['Maputo', 'Beira'],
    coordinates: [32.5732, -25.9692],
  },
  {
    isoNumeric: '516',
    nameFr: 'Namibie',
    nameEn: 'Namibia',
    region: 'africa',
    subRegion: 'southern_africa',
    primaryCity: 'Windhoek',
    cities: ['Windhoek'],
    coordinates: [17.0658, -22.5609],
  },
  {
    isoNumeric: '562',
    nameFr: 'Niger',
    nameEn: 'Niger',
    region: 'africa',
    subRegion: 'west_africa',
    primaryCity: 'Niamey',
    cities: ['Niamey'],
    coordinates: [2.1254, 13.5116],
  },
  {
    isoNumeric: '566',
    nameFr: 'Nigeria',
    nameEn: 'Nigeria',
    region: 'africa',
    subRegion: 'west_africa',
    primaryCity: 'Lagos',
    cities: ['Lagos', 'Abuja', 'Port Harcourt'],
    coordinates: [3.3792, 6.5244],
    aliases: ['Nigéria'],
  },
  {
    isoNumeric: '800',
    nameFr: 'Ouganda',
    nameEn: 'Uganda',
    region: 'africa',
    subRegion: 'east_africa',
    primaryCity: 'Kampala',
    cities: ['Kampala', 'Entebbe'],
    coordinates: [32.5825, 0.3476],
  },
  {
    isoNumeric: '140',
    nameFr: 'République centrafricaine',
    nameEn: 'Central African Republic',
    region: 'africa',
    subRegion: 'central_africa',
    primaryCity: 'Bangui',
    cities: ['Bangui'],
    coordinates: [18.5582, 4.3947],
    aliases: ['RCA', 'Centrafrique'],
  },
  {
    isoNumeric: '180',
    nameFr: 'RD Congo',
    nameEn: 'DR Congo',
    region: 'africa',
    subRegion: 'central_africa',
    primaryCity: 'Kinshasa',
    cities: ['Kinshasa', 'Lubumbashi'],
    coordinates: [15.2663, -4.4419],
    aliases: ['RDC', 'DRC', 'République démocratique du Congo'],
  },
  {
    isoNumeric: '646',
    nameFr: 'Rwanda',
    nameEn: 'Rwanda',
    region: 'africa',
    subRegion: 'east_africa',
    primaryCity: 'Kigali',
    cities: ['Kigali'],
    coordinates: [30.0619, -1.9441],
  },
  {
    isoNumeric: '678',
    nameFr: 'São Tomé-et-Príncipe',
    nameEn: 'São Tomé and Príncipe',
    region: 'africa',
    subRegion: 'central_africa',
    primaryCity: 'São Tomé',
    cities: ['São Tomé'],
    coordinates: [6.7273, 0.3365],
    aliases: ['Sao Tome'],
  },
  {
    isoNumeric: '686',
    nameFr: 'Sénégal',
    nameEn: 'Senegal',
    region: 'africa',
    subRegion: 'west_africa',
    primaryCity: 'Dakar',
    cities: ['Dakar', 'Diamniadio', 'Saint-Louis'],
    coordinates: [-17.4677, 14.7167],
  },
  {
    isoNumeric: '690',
    nameFr: 'Seychelles',
    nameEn: 'Seychelles',
    region: 'africa',
    subRegion: 'east_africa',
    primaryCity: 'Victoria',
    cities: ['Victoria'],
    coordinates: [55.4513, -4.6191],
  },
  {
    isoNumeric: '694',
    nameFr: 'Sierra Leone',
    nameEn: 'Sierra Leone',
    region: 'africa',
    subRegion: 'west_africa',
    primaryCity: 'Freetown',
    cities: ['Freetown'],
    coordinates: [-13.2317, 8.4657],
  },
  {
    isoNumeric: '706',
    nameFr: 'Somalie',
    nameEn: 'Somalia',
    region: 'africa',
    subRegion: 'east_africa',
    primaryCity: 'Mogadiscio',
    cities: ['Mogadiscio'],
    coordinates: [45.3182, 2.0469],
    aliases: ['Mogadishu'],
  },
  {
    isoNumeric: '729',
    nameFr: 'Soudan',
    nameEn: 'Sudan',
    region: 'africa',
    subRegion: 'north_africa',
    primaryCity: 'Khartoum',
    cities: ['Khartoum'],
    coordinates: [32.5599, 15.5007],
  },
  {
    isoNumeric: '728',
    nameFr: 'Soudan du Sud',
    nameEn: 'South Sudan',
    region: 'africa',
    subRegion: 'east_africa',
    primaryCity: 'Juba',
    cities: ['Juba'],
    coordinates: [31.5825, 4.8517],
  },
  {
    isoNumeric: '710',
    nameFr: 'Afrique du Sud',
    nameEn: 'South Africa',
    region: 'africa',
    subRegion: 'southern_africa',
    primaryCity: 'Johannesburg',
    cities: ['Johannesburg', 'Le Cap', 'Durban'],
    coordinates: [28.0473, -26.2041],
    aliases: ['Cape Town'],
  },
  {
    isoNumeric: '834',
    nameFr: 'Tanzanie',
    nameEn: 'Tanzania',
    region: 'africa',
    subRegion: 'east_africa',
    primaryCity: 'Dar es Salaam',
    cities: ['Dar es Salaam', 'Arusha'],
    coordinates: [39.2083, -6.7924],
  },
  {
    isoNumeric: '148',
    nameFr: 'Tchad',
    nameEn: 'Chad',
    region: 'africa',
    subRegion: 'central_africa',
    primaryCity: 'N’Djamena',
    cities: ['N’Djamena'],
    coordinates: [15.0557, 12.1348],
    aliases: ["N'Djamena"],
  },
  {
    isoNumeric: '768',
    nameFr: 'Togo',
    nameEn: 'Togo',
    region: 'africa',
    subRegion: 'west_africa',
    primaryCity: 'Lomé',
    cities: ['Lomé'],
    coordinates: [1.2123, 6.1725],
  },
  {
    isoNumeric: '788',
    nameFr: 'Tunisie',
    nameEn: 'Tunisia',
    region: 'africa',
    subRegion: 'north_africa',
    primaryCity: 'Tunis',
    cities: ['Tunis', 'Sfax'],
    coordinates: [10.1815, 36.8065],
  },
  {
    isoNumeric: '894',
    nameFr: 'Zambie',
    nameEn: 'Zambia',
    region: 'africa',
    subRegion: 'southern_africa',
    primaryCity: 'Lusaka',
    cities: ['Lusaka'],
    coordinates: [28.3228, -15.3875],
  },
  {
    isoNumeric: '716',
    nameFr: 'Zimbabwe',
    nameEn: 'Zimbabwe',
    region: 'africa',
    subRegion: 'southern_africa',
    primaryCity: 'Harare',
    cities: ['Harare', 'Bulawayo'],
    coordinates: [31.0522, -17.8252],
  },

  // --- DIASPORA COUNTRIES WORLDWIDE (34 major destinations) ---
  {
    isoNumeric: '250',
    nameFr: 'France',
    nameEn: 'France',
    region: 'diaspora',
    subRegion: 'europe',
    primaryCity: 'Paris',
    cities: ['Paris', 'Lyon', 'Marseille', 'Bordeaux'],
    coordinates: [2.3522, 48.8566],
  },
  {
    isoNumeric: '826',
    nameFr: 'Royaume-Uni',
    nameEn: 'United Kingdom',
    region: 'diaspora',
    subRegion: 'europe',
    primaryCity: 'Londres',
    cities: ['Londres', 'Manchester', 'Birmingham'],
    coordinates: [-0.1276, 51.5072],
    aliases: ['London', 'UK'],
  },
  {
    isoNumeric: '056',
    nameFr: 'Belgique',
    nameEn: 'Belgium',
    region: 'diaspora',
    subRegion: 'europe',
    primaryCity: 'Bruxelles',
    cities: ['Bruxelles', 'Anvers'],
    coordinates: [4.3517, 50.8503],
    aliases: ['Brussels'],
  },
  {
    isoNumeric: '756',
    nameFr: 'Suisse',
    nameEn: 'Switzerland',
    region: 'diaspora',
    subRegion: 'europe',
    primaryCity: 'Genève',
    cities: ['Genève', 'Zurich', 'Lausanne'],
    coordinates: [6.1432, 46.2044],
    aliases: ['Geneva'],
  },
  {
    isoNumeric: '276',
    nameFr: 'Allemagne',
    nameEn: 'Germany',
    region: 'diaspora',
    subRegion: 'europe',
    primaryCity: 'Berlin',
    cities: ['Berlin', 'Francfort', 'Munich'],
    coordinates: [13.405, 52.52],
    aliases: ['Frankfurt'],
  },
  {
    isoNumeric: '724',
    nameFr: 'Espagne',
    nameEn: 'Spain',
    region: 'diaspora',
    subRegion: 'europe',
    primaryCity: 'Madrid',
    cities: ['Madrid', 'Barcelone'],
    coordinates: [-3.7038, 40.4168],
    aliases: ['Barcelona'],
  },
  {
    isoNumeric: '380',
    nameFr: 'Italie',
    nameEn: 'Italy',
    region: 'diaspora',
    subRegion: 'europe',
    primaryCity: 'Milan',
    cities: ['Milan', 'Rome'],
    coordinates: [9.19, 45.4642],
  },
  {
    isoNumeric: '528',
    nameFr: 'Pays-Bas',
    nameEn: 'Netherlands',
    region: 'diaspora',
    subRegion: 'europe',
    primaryCity: 'Amsterdam',
    cities: ['Amsterdam', 'Rotterdam'],
    coordinates: [4.9041, 52.3676],
  },
  {
    isoNumeric: '620',
    nameFr: 'Portugal',
    nameEn: 'Portugal',
    region: 'diaspora',
    subRegion: 'europe',
    primaryCity: 'Lisbonne',
    cities: ['Lisbonne', 'Porto'],
    coordinates: [-9.1393, 38.7223],
    aliases: ['Lisbon'],
  },
  {
    isoNumeric: '442',
    nameFr: 'Luxembourg',
    nameEn: 'Luxembourg',
    region: 'diaspora',
    subRegion: 'europe',
    primaryCity: 'Luxembourg',
    cities: ['Luxembourg'],
    coordinates: [6.1319, 49.6116],
  },
  {
    isoNumeric: '372',
    nameFr: 'Irlande',
    nameEn: 'Ireland',
    region: 'diaspora',
    subRegion: 'europe',
    primaryCity: 'Dublin',
    cities: ['Dublin'],
    coordinates: [-6.2603, 53.3498],
  },
  {
    isoNumeric: '752',
    nameFr: 'Suède',
    nameEn: 'Sweden',
    region: 'diaspora',
    subRegion: 'europe',
    primaryCity: 'Stockholm',
    cities: ['Stockholm'],
    coordinates: [18.0686, 59.3293],
  },
  {
    isoNumeric: '578',
    nameFr: 'Norvège',
    nameEn: 'Norway',
    region: 'diaspora',
    subRegion: 'europe',
    primaryCity: 'Oslo',
    cities: ['Oslo'],
    coordinates: [10.7522, 59.9139],
  },
  {
    isoNumeric: '208',
    nameFr: 'Danemark',
    nameEn: 'Denmark',
    region: 'diaspora',
    subRegion: 'europe',
    primaryCity: 'Copenhague',
    cities: ['Copenhague'],
    coordinates: [12.5683, 55.6761],
    aliases: ['Copenhagen'],
  },
  {
    isoNumeric: '040',
    nameFr: 'Autriche',
    nameEn: 'Austria',
    region: 'diaspora',
    subRegion: 'europe',
    primaryCity: 'Vienne',
    cities: ['Vienne'],
    coordinates: [16.3738, 48.2082],
    aliases: ['Vienna'],
  },
  {
    isoNumeric: '616',
    nameFr: 'Pologne',
    nameEn: 'Poland',
    region: 'diaspora',
    subRegion: 'europe',
    primaryCity: 'Varsovie',
    cities: ['Varsovie'],
    coordinates: [21.0122, 52.2297],
    aliases: ['Warsaw'],
  },
  {
    isoNumeric: '792',
    nameFr: 'Turquie',
    nameEn: 'Turkey',
    region: 'diaspora',
    subRegion: 'europe',
    primaryCity: 'Istanbul',
    cities: ['Istanbul', 'Ankara'],
    coordinates: [28.9784, 41.0082],
  },
  {
    isoNumeric: '643',
    nameFr: 'Russie',
    nameEn: 'Russia',
    region: 'diaspora',
    subRegion: 'europe',
    primaryCity: 'Moscou',
    cities: ['Moscou'],
    coordinates: [37.6173, 55.7558],
    aliases: ['Moscow'],
  },
  {
    isoNumeric: '840',
    nameFr: 'États-Unis',
    nameEn: 'United States',
    region: 'diaspora',
    subRegion: 'americas',
    primaryCity: 'New York',
    cities: ['New York', 'Washington D.C.', 'Atlanta', 'Houston', 'Los Angeles'],
    coordinates: [-74.006, 40.7128],
    aliases: ['USA', 'United States of America'],
  },
  {
    isoNumeric: '124',
    nameFr: 'Canada',
    nameEn: 'Canada',
    region: 'diaspora',
    subRegion: 'americas',
    primaryCity: 'Montréal',
    cities: ['Montréal', 'Toronto', 'Ottawa'],
    coordinates: [-73.5673, 45.5017],
    aliases: ['Montreal'],
  },
  {
    isoNumeric: '076',
    nameFr: 'Brésil',
    nameEn: 'Brazil',
    region: 'diaspora',
    subRegion: 'americas',
    primaryCity: 'São Paulo',
    cities: ['São Paulo', 'Salvador'],
    coordinates: [-46.6333, -23.5505],
    aliases: ['Sao Paulo'],
  },
  {
    isoNumeric: '484',
    nameFr: 'Mexique',
    nameEn: 'Mexico',
    region: 'diaspora',
    subRegion: 'americas',
    primaryCity: 'Mexico',
    cities: ['Mexico'],
    coordinates: [-99.1332, 19.4326],
  },
  {
    isoNumeric: '170',
    nameFr: 'Colombie',
    nameEn: 'Colombia',
    region: 'diaspora',
    subRegion: 'americas',
    primaryCity: 'Bogotá',
    cities: ['Bogotá'],
    coordinates: [-74.0721, 4.711],
  },
  {
    isoNumeric: '332',
    nameFr: 'Haïti',
    nameEn: 'Haiti',
    region: 'diaspora',
    subRegion: 'americas',
    primaryCity: 'Port-au-Prince',
    cities: ['Port-au-Prince'],
    coordinates: [-72.3074, 18.5944],
  },
  {
    isoNumeric: '388',
    nameFr: 'Jamaïque',
    nameEn: 'Jamaica',
    region: 'diaspora',
    subRegion: 'americas',
    primaryCity: 'Kingston',
    cities: ['Kingston'],
    coordinates: [-76.7936, 17.9712],
  },
  {
    isoNumeric: '784',
    nameFr: 'Émirats arabes unis',
    nameEn: 'United Arab Emirates',
    region: 'diaspora',
    subRegion: 'gulf_asia',
    primaryCity: 'Dubaï',
    cities: ['Dubaï', 'Abou Dabi'],
    coordinates: [55.2708, 25.2048],
    aliases: ['UAE', 'Dubai'],
  },
  {
    isoNumeric: '682',
    nameFr: 'Arabie saoudite',
    nameEn: 'Saudi Arabia',
    region: 'diaspora',
    subRegion: 'gulf_asia',
    primaryCity: 'Riyad',
    cities: ['Riyad', 'Djeddah'],
    coordinates: [46.6753, 24.7136],
    aliases: ['Riyadh'],
  },
  {
    isoNumeric: '634',
    nameFr: 'Qatar',
    nameEn: 'Qatar',
    region: 'diaspora',
    subRegion: 'gulf_asia',
    primaryCity: 'Doha',
    cities: ['Doha'],
    coordinates: [51.531, 25.2854],
  },
  {
    isoNumeric: '422',
    nameFr: 'Liban',
    nameEn: 'Lebanon',
    region: 'diaspora',
    subRegion: 'gulf_asia',
    primaryCity: 'Beyrouth',
    cities: ['Beyrouth'],
    coordinates: [35.5018, 33.8938],
    aliases: ['Beirut'],
  },
  {
    isoNumeric: '156',
    nameFr: 'Chine',
    nameEn: 'China',
    region: 'diaspora',
    subRegion: 'gulf_asia',
    primaryCity: 'Guangzhou',
    cities: ['Guangzhou', 'Shanghai', 'Pékin'],
    coordinates: [113.2644, 23.1291],
    aliases: ['Beijing'],
  },
  {
    isoNumeric: '356',
    nameFr: 'Inde',
    nameEn: 'India',
    region: 'diaspora',
    subRegion: 'gulf_asia',
    primaryCity: 'Mumbai',
    cities: ['Mumbai', 'New Delhi'],
    coordinates: [72.8777, 19.076],
  },
  {
    isoNumeric: '392',
    nameFr: 'Japon',
    nameEn: 'Japan',
    region: 'diaspora',
    subRegion: 'gulf_asia',
    primaryCity: 'Tokyo',
    cities: ['Tokyo'],
    coordinates: [139.6917, 35.6895],
  },
  {
    isoNumeric: '702',
    nameFr: 'Singapour',
    nameEn: 'Singapore',
    region: 'diaspora',
    subRegion: 'gulf_asia',
    primaryCity: 'Singapour',
    cities: ['Singapour'],
    coordinates: [103.8198, 1.3521],
  },
  {
    isoNumeric: '036',
    nameFr: 'Australie',
    nameEn: 'Australia',
    region: 'diaspora',
    subRegion: 'gulf_asia',
    primaryCity: 'Sydney',
    cities: ['Sydney', 'Melbourne'],
    coordinates: [151.2093, -33.8688],
  },
];

export const CITY_GEO_COORDS: Record<string, [number, number]> = (() => {
  const map: Record<string, [number, number]> = {};
  for (const c of AFRICA_DIASPORA_COUNTRIES) {
    map[normalizeGeoText(c.primaryCity)] = c.coordinates;
    for (const city of c.cities) {
      if (!map[normalizeGeoText(city)]) {
        map[normalizeGeoText(city)] = c.coordinates;
      }
    }
  }
  const overrides: Array<[string, [number, number]]> = [
    ['Oran', [-0.6308, 35.6971]],
    ['Yaoundé', [11.5021, 3.848]],
    ['Yamoussoukro', [-5.2767, 6.8276]],
    ['Marrakech', [-7.9811, 31.6295]],
    ['Rabat', [-6.8498, 34.0209]],
    ['Tanger', [-5.834, 35.7595]],
    ['Abuja', [7.3986, 9.0765]],
    ['Port Harcourt', [7.0498, 4.8156]],
    ['Lubumbashi', [27.4794, -11.6876]],
    ['Le Cap', [18.4241, -33.9249]],
    ['Cape Town', [18.4241, -33.9249]],
    ['Durban', [31.0218, -29.8587]],
    ['Mombasa', [39.6682, -4.0435]],
    ['Lyon', [4.8357, 45.764]],
    ['Marseille', [5.3698, 43.2965]],
    ['Bordeaux', [-0.5792, 44.8378]],
    ['Manchester', [-2.2426, 53.4808]],
    ['Birmingham', [-1.8904, 52.4862]],
    ['London', [-0.1276, 51.5072]],
    ['Zurich', [8.5417, 47.3769]],
    ['Francfort', [8.6821, 50.1109]],
    ['Frankfurt', [8.6821, 50.1109]],
    ['Munich', [11.582, 48.1351]],
    ['Barcelone', [2.1734, 41.3851]],
    ['Barcelona', [2.1734, 41.3851]],
    ['Rome', [12.4964, 41.9028]],
    ['Rotterdam', [4.4777, 51.9244]],
    ['Toronto', [-79.3832, 43.6532]],
    ['Ottawa', [-75.6972, 45.4215]],
    ['Washington D.C.', [-77.0369, 38.9072]],
    ['Atlanta', [-84.388, 33.749]],
    ['Houston', [-95.3698, 29.7604]],
    ['Los Angeles', [-118.2437, 34.0522]],
    ['Salvador', [-38.5014, -12.9777]],
    ['Abou Dabi', [54.3773, 24.4539]],
    ['Djeddah', [39.1925, 21.4858]],
    ['Shanghai', [121.4737, 31.2304]],
    ['Pékin', [116.4074, 39.9042]],
    ['Beijing', [116.4074, 39.9042]],
    ['Melbourne', [144.9631, -37.8136]],
    ['Diamniadio', [-17.205, 14.703]],
  ];
  for (const [city, coords] of overrides) {
    map[normalizeGeoText(city)] = coords;
  }
  return map;
})();

const COUNTRY_BY_ISO = new Map<string, CountryHubMeta>();
const COUNTRY_BY_NORM = new Map<string, CountryHubMeta>();

for (const meta of AFRICA_DIASPORA_COUNTRIES) {
  COUNTRY_BY_ISO.set(meta.isoNumeric, meta);
  COUNTRY_BY_NORM.set(normalizeGeoText(meta.nameFr), meta);
  COUNTRY_BY_NORM.set(normalizeGeoText(meta.nameEn), meta);
  for (const alias of meta.aliases || []) {
    COUNTRY_BY_NORM.set(normalizeGeoText(alias), meta);
  }
}

export function findCountryByIso(isoNumeric?: string | number | null): CountryHubMeta | undefined {
  if (isoNumeric === undefined || isoNumeric === null) return undefined;
  const padded = String(isoNumeric).padStart(3, '0');
  return COUNTRY_BY_ISO.get(padded);
}

export function findCountryMeta(name?: string | null): CountryHubMeta | undefined {
  if (!name) return undefined;
  return COUNTRY_BY_NORM.get(normalizeGeoText(name));
}

export function getCityCoordinates(city?: string | null, country?: string | null): [number, number] {
  if (city) {
    const exact = CITY_GEO_COORDS[normalizeGeoText(city)];
    if (exact) return exact;
  }
  const countryMeta = findCountryMeta(country);
  if (countryMeta) return countryMeta.coordinates;
  return [2.3522, 48.8566];
}

export function clampMapTransform(scale: number, tx: number, ty: number, width = 960, height = 480): MapTransformState {
  const clampedScale = Math.max(1, Math.min(7, Number.isFinite(scale) ? scale : 1));
  if (clampedScale <= 1.01) {
    return { scale: 1, tx: 0, ty: 0 };
  }
  const maxOffsetX = (width * (clampedScale - 1)) / 2 + 120;
  const maxOffsetY = (height * (clampedScale - 1)) / 2 + 80;
  return {
    scale: clampedScale,
    tx: Math.max(-maxOffsetX, Math.min(maxOffsetX, Number.isFinite(tx) ? tx : 0)),
    ty: Math.max(-maxOffsetY, Math.min(maxOffsetY, Number.isFinite(ty) ? ty : 0)),
  };
}

export function buildHubClusters(
  mode: 'events' | 'networks',
  events: BusinessEvent[],
  networks: ProfessionalNetwork[],
  lang: AppLanguage = 'fr',
  includeAllDirectoryCountries = false
): HubCluster[] {
  const clusterMap = new Map<string, HubCluster>();

  if (mode === 'events') {
    for (const ev of events) {
      const countryMeta = findCountryMeta(ev.country);
      const key = `city-${normalizeGeoText(ev.city)}`;
      const existing = clusterMap.get(key);
      if (existing) {
        existing.events.push(ev);
        existing.count = existing.events.length;
        existing.secondaryLabel =
          lang === 'en'
            ? `${existing.events.length} events · ${ev.sector}`
            : `${existing.events.length} événements · ${ev.sector}`;
      } else {
        clusterMap.set(key, {
          key,
          city: ev.city,
          country: ev.country,
          isoNumeric: countryMeta?.isoNumeric,
          zone: countryMeta?.region || 'africa',
          coordinates: getCityCoordinates(ev.city, ev.country),
          count: 1,
          events: [ev],
          networks: [],
          primaryLabel: `${ev.city} · ${ev.sector}`,
          secondaryLabel: `${ev.registeredCount}/${ev.capacity} ${lang === 'en' ? 'seats' : 'places'}`,
          isCatalogActive: true,
        });
      }
    }
  } else {
    for (const net of networks) {
      const countries = net.countries.length > 0 ? net.countries : ['Sénégal'];
      for (const countryName of countries) {
        const meta = findCountryMeta(countryName);
        const city = meta?.primaryCity || countryName;
        const key = `net-country-${meta?.isoNumeric || normalizeGeoText(countryName)}`;
        const existing = clusterMap.get(key);
        if (existing) {
          if (!existing.networks.some((n) => n.id === net.id)) {
            existing.networks.push(net);
          }
          existing.count = existing.networks.length;
          existing.secondaryLabel =
            lang === 'en'
              ? `${existing.networks.length} circle(s) · ${existing.networks[0].memberCount} members`
              : `${existing.networks.length} cercle(s) · ${existing.networks[0].memberCount} membres`;
        } else {
          clusterMap.set(key, {
            key,
            city,
            country: countryName,
            isoNumeric: meta?.isoNumeric,
            zone: meta?.region || 'africa',
            coordinates: getCityCoordinates(city, countryName),
            count: 1,
            events: [],
            networks: [net],
            primaryLabel: net.sectors[0] || (lang === 'en' ? 'Network' : 'Réseau'),
            secondaryLabel: `${net.memberCount} ${lang === 'en' ? 'members' : 'membres'}`,
            isCatalogActive: true,
          });
        }
      }
    }
  }

  if (includeAllDirectoryCountries) {
    const representedIsos = new Set<string>();
    for (const c of clusterMap.values()) {
      if (c.isoNumeric) representedIsos.add(c.isoNumeric);
    }
    for (const meta of AFRICA_DIASPORA_COUNTRIES) {
      if (representedIsos.has(meta.isoNumeric)) continue;
      clusterMap.set(`hub-${meta.isoNumeric}`, {
        key: `hub-${meta.isoNumeric}`,
        city: meta.primaryCity,
        country: meta.nameFr,
        isoNumeric: meta.isoNumeric,
        zone: meta.region,
        coordinates: meta.coordinates,
        count: 0,
        events: [],
        networks: [],
        primaryLabel: meta.primaryCity,
        secondaryLabel:
          meta.region === 'africa'
            ? lang === 'en'
              ? 'Africa Hub · Open directory'
              : 'Pôle Afrique · Annuaire ouvert'
            : lang === 'en'
              ? 'Diaspora Hub · Open corridor'
              : 'Pôle Diaspora · Corridor ouvert',
        isCatalogActive: false,
      });
    }
  }

  return Array.from(clusterMap.values());
}

export function buildDiasporaCorridors(clusters: HubCluster[]): CorridorArc[] {
  const active = clusters.filter((c) => c.isCatalogActive);
  const africaHubs = active.filter((c) => c.zone === 'africa');
  const diasporaHubs = active.filter((c) => c.zone === 'diaspora');
  const arcs: CorridorArc[] = [];
  const seen = new Set<string>();

  for (const a of africaHubs) {
    for (const d of diasporaHubs) {
      if (arcs.length >= 12) break;
      const id = `${a.city}-${d.city}`;
      if (seen.has(id)) continue;
      seen.add(id);
      arcs.push({
        id,
        from: a.coordinates,
        to: d.coordinates,
        fromCity: a.city,
        toCity: d.city,
        label: `${a.city} ↔ ${d.city}`,
      });
    }
  }

  // Fallback intra-Africa links if only African hubs are visible
  if (arcs.length === 0 && africaHubs.length > 1) {
    for (let i = 1; i < Math.min(africaHubs.length, 6); i += 1) {
      const a = africaHubs[0];
      const b = africaHubs[i];
      arcs.push({
        id: `${a.city}-${b.city}`,
        from: a.coordinates,
        to: b.coordinates,
        fromCity: a.city,
        toCity: b.city,
        label: `${a.city} ↔ ${b.city}`,
      });
    }
  }

  return arcs;
}

export function getGroupedCountryOptions(): {
  africa: CountryHubMeta[];
  diaspora: CountryHubMeta[];
} {
  const africa = AFRICA_DIASPORA_COUNTRIES.filter((c) => c.region === 'africa').sort((a, b) =>
    a.nameFr.localeCompare(b.nameFr, 'fr')
  );
  const diaspora = AFRICA_DIASPORA_COUNTRIES.filter((c) => c.region === 'diaspora').sort((a, b) =>
    a.nameFr.localeCompare(b.nameFr, 'fr')
  );
  return { africa, diaspora };
}

export function getAllCityOptions(extraCities: string[] = []): string[] {
  const set = new Set<string>(extraCities.filter(Boolean));
  for (const c of AFRICA_DIASPORA_COUNTRIES) {
    for (const city of c.cities) {
      set.add(city);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
}
