import React, { useEffect, useMemo, useRef, useState } from 'react';
import { geoGraticule10, geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import worldAtlasCountries from 'world-atlas/countries-110m.json';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Compass,
  Filter,
  Globe,
  Heart,
  Lock,
  MapPin,
  Minus,
  Plus,
  RotateCcw,
  Star,
  Users,
} from 'lucide-react';
import type { BusinessEvent, ProfessionalNetwork } from '../types/domain';
import {
  localeForLang,
  translateCountry,
  translateFormat,
  translateSector,
  type AppLanguage,
} from '../lib/i18n';
import { localizeCity } from '../lib/contentI18n';
import {
  AFRICA_DIASPORA_COUNTRIES,
  WORLD_REGION_PRESETS,
  buildDiasporaCorridors,
  buildHubClusters,
  clampMapTransform,
  findCountryByIso,
  findCountryMeta,
  type HubCluster,
  type MapTransformState,
  type WorldRegionPresetId,
} from '../lib/worldMap';

interface EventNetworkHubMapProps {
  mode: 'events' | 'networks';
  events: BusinessEvent[];
  networks: ProfessionalNetwork[];
  favoriteEventIds: string[];
  lang?: AppLanguage;
  selectedCountryFilter?: string;
  onSelectEvent: (eventId: string) => void;
  onSelectNetwork: (net: ProfessionalNetwork) => void;
  onToggleFavorite: (eventId: string) => void;
  onFilterLocation?: (country: string, city?: string) => void;
}

const SVG_WIDTH = 960;
const SVG_HEIGHT = 480;

type CountryFeature = Feature<Geometry, { name?: string }>;

export const EventNetworkHubMap: React.FC<EventNetworkHubMapProps> = ({
  mode,
  events,
  networks,
  favoriteEventIds,
  lang = 'fr',
  selectedCountryFilter = 'all',
  onSelectEvent,
  onSelectNetwork,
  onToggleFavorite,
  onFilterLocation,
}) => {
  const isEn = lang === 'en';
  const [regionPreset, setRegionPreset] = useState<WorldRegionPresetId>('world');
  const [includeAllCountries, setIncludeAllCountries] = useState(true);
  const [transform, setTransform] = useState<MapTransformState>({ scale: 1, tx: 0, ty: 0 });
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [hoveredCountryIso, setHoveredCountryIso] = useState<string | null>(null);
  const [clusterEventIndex, setClusterEventIndex] = useState(0);

  const dragRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    startTx: number;
    startTy: number;
    moved: boolean;
  }>({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    startTx: 0,
    startTy: 0,
    moved: false,
  });

  const svgRef = useRef<SVGSVGElement | null>(null);

  const { countries, graticulePath, pathGenerator, projection } = useMemo(() => {
    const topo = worldAtlasCountries as unknown as {
      type: 'Topology';
      objects: { countries: unknown };
    };
    const geo = feature(
      topo as unknown as Parameters<typeof feature>[0],
      topo.objects.countries as Parameters<typeof feature>[1]
    ) as unknown as FeatureCollection<Geometry, { name?: string }>;

    const proj = geoNaturalEarth1().fitExtent(
      [
        [18, 22],
        [SVG_WIDTH - 18, SVG_HEIGHT - 22],
      ],
      geo
    );
    const pg = geoPath(proj);
    const grat = pg(geoGraticule10()) || '';
    return {
      countries: geo.features as CountryFeature[],
      graticulePath: grat,
      pathGenerator: pg,
      projection: proj,
    };
  }, []);

  const clusters = useMemo<HubCluster[]>(
    () => buildHubClusters(mode, events, networks, lang, includeAllCountries),
    [mode, events, networks, lang, includeAllCountries]
  );

  const corridors = useMemo(() => buildDiasporaCorridors(clusters), [clusters]);

  const activeCatalogCount = useMemo(
    () => clusters.filter((c) => c.isCatalogActive).length,
    [clusters]
  );

  const applyPreset = (presetId: WorldRegionPresetId) => {
    setRegionPreset(presetId);
    const preset = WORLD_REGION_PRESETS.find((p) => p.id === presetId);
    if (!preset || preset.id === 'world') {
      setTransform({ scale: 1, tx: 0, ty: 0 });
      return;
    }
    const projected = projection(preset.center);
    if (!projected) {
      setTransform({ scale: 1, tx: 0, ty: 0 });
      return;
    }
    const [px, py] = projected;
    const next = clampMapTransform(
      preset.scaleFactor,
      SVG_WIDTH / 2 - px * preset.scaleFactor,
      SVG_HEIGHT / 2 - py * preset.scaleFactor,
      SVG_WIDTH,
      SVG_HEIGHT
    );
    setTransform(next);
  };

  const handleZoomStep = (delta: number) => {
    setTransform((prev) => {
      const nextScale = prev.scale * (delta > 0 ? 1.32 : 1 / 1.32);
      const cx = SVG_WIDTH / 2;
      const cy = SVG_HEIGHT / 2;
      const clampedScale = Math.max(1, Math.min(5.5, nextScale));
      const factor = clampedScale / prev.scale;
      return clampMapTransform(
        clampedScale,
        cx - (cx - prev.tx) * factor,
        cy - (cy - prev.ty) * factor,
        SVG_WIDTH,
        SVG_HEIGHT
      );
    });
  };

  useEffect(() => {
    if (selectedCountryFilter && selectedCountryFilter !== 'all') {
      const targetMeta = findCountryMeta(selectedCountryFilter);
      const match = clusters.find(
        (c) =>
          (targetMeta && c.isoNumeric === targetMeta.isoNumeric) ||
          c.country.toLowerCase() === selectedCountryFilter.toLowerCase()
      );
      if (match) {
        setSelectedKey(match.key);
        setClusterEventIndex(0);
        return;
      }
    }
    if (clusters.length === 0) {
      setSelectedKey('');
      return;
    }
    if (!clusters.some((c) => c.key === selectedKey)) {
      const firstActive = clusters.find((c) => c.isCatalogActive) || clusters[0];
      setSelectedKey(firstActive.key);
      setClusterEventIndex(0);
    }
  }, [clusters, selectedKey, selectedCountryFilter]);

  const activeCluster =
    clusters.find((c) => c.key === selectedKey) ||
    clusters.find((c) => c.isCatalogActive) ||
    clusters[0];

  const hoveredCountryMeta = hoveredCountryIso ? findCountryByIso(hoveredCountryIso) : undefined;
  const activeCountryMeta = activeCluster
    ? (activeCluster.isoNumeric ? findCountryByIso(activeCluster.isoNumeric) : undefined) ||
      findCountryMeta(activeCluster.country)
    : undefined;

  const ev =
    activeCluster && activeCluster.events.length > 0
      ? activeCluster.events[clusterEventIndex % activeCluster.events.length]
      : undefined;
  const net =
    activeCluster && activeCluster.networks.length > 0 ? activeCluster.networks[0] : undefined;
  const isFav = ev ? favoriteEventIds.includes(ev.id) : false;

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    dragRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTx: transform.tx,
      startTy: transform.ty,
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current.active || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dxPx = e.clientX - dragRef.current.startX;
    const dyPx = e.clientY - dragRef.current.startY;
    if (Math.abs(dxPx) > 3 || Math.abs(dyPx) > 3) {
      dragRef.current.moved = true;
    }
    const dxSvg = (dxPx / rect.width) * SVG_WIDTH;
    const dySvg = (dyPx / rect.height) * SVG_HEIGHT;
    setTransform((prev) =>
      clampMapTransform(
        prev.scale,
        dragRef.current.startTx + dxSvg,
        dragRef.current.startTy + dySvg,
        SVG_WIDTH,
        SVG_HEIGHT
      )
    );
  };

  const handlePointerUp = () => {
    dragRef.current.active = false;
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    e.preventDefault();
    const rect = svgRef.current.getBoundingClientRect();
    const pointerX = ((e.clientX - rect.left) / rect.width) * SVG_WIDTH;
    const pointerY = ((e.clientY - rect.top) / rect.height) * SVG_HEIGHT;
    const factorDelta = e.deltaY < 0 ? 1.15 : 1 / 1.15;

    setTransform((prev) => {
      const nextScale = Math.max(1, Math.min(5.5, prev.scale * factorDelta));
      const ratio = nextScale / prev.scale;
      return clampMapTransform(
        nextScale,
        pointerX - (pointerX - prev.tx) * ratio,
        pointerY - (pointerY - prev.ty) * ratio,
        SVG_WIDTH,
        SVG_HEIGHT
      );
    });
  };

  const selectCountryOnMap = (iso: string) => {
    if (dragRef.current.moved) return;
    const meta = findCountryByIso(iso);
    if (!meta) return;
    const matchingCluster = clusters.find((c) => c.isoNumeric === meta.isoNumeric);
    if (matchingCluster) {
      setSelectedKey(matchingCluster.key);
      setClusterEventIndex(0);
    }
    if (onFilterLocation && matchingCluster?.isCatalogActive) {
      onFilterLocation(meta.nameFr);
    }
  };

  const invScale = 1 / Math.sqrt(transform.scale);

  return (
    <section
      aria-label={
        mode === 'events'
          ? isEn
            ? 'Dynamic World Map of Business Events'
            : 'Carte mondiale dynamique des événements'
          : isEn
            ? 'Dynamic World Map of Business Networks'
            : 'Carte mondiale dynamique des réseaux'
      }
      className="relative overflow-hidden rounded-[28px] border border-[var(--ae-border)] bg-[#EFEAE3] dark:bg-[#090A0D] min-h-[470px] sm:min-h-[530px] flex flex-col justify-between shadow-sm"
    >
      {/* Interactive SVG World Map Layer */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing touch-pan-y select-none"
        role="img"
        aria-label={
          isEn
            ? 'Interactive geographic map of Africa and global diaspora business hubs'
            : 'Carte géographique interactive de l’Afrique et de la diaspora mondiale'
        }
      >
        <defs>
          <radialGradient id="aeOceanLight" cx="50%" cy="46%" r="70%">
            <stop offset="0%" stopColor="#F8F5F0" />
            <stop offset="100%" stopColor="#E6DFD6" />
          </radialGradient>
          <radialGradient id="aeOceanDark" cx="50%" cy="46%" r="70%">
            <stop offset="0%" stopColor="#12141A" />
            <stop offset="100%" stopColor="#07080A" />
          </radialGradient>
        </defs>

        <rect width={SVG_WIDTH} height={SVG_HEIGHT} className="fill-[#EFEAE3] dark:fill-[#090A0D]" />

        <g transform={`translate(${transform.tx}, ${transform.ty}) scale(${transform.scale})`}>
          {/* Latitude / Longitude Graticule */}
          <path
            d={graticulePath}
            fill="none"
            className="stroke-[#D9C3AB]/45 dark:stroke-[#232630]"
            strokeWidth={0.55 / transform.scale}
          />

          {/* World Countries Polygons */}
          {countries.map((feat, idx) => {
            const iso = String(feat.id ?? idx).padStart(3, '0');
            const meta = findCountryByIso(iso);
            const d = pathGenerator(feat);
            if (!d) return null;

            const hasActiveCatalog = Boolean(
              meta && clusters.some((c) => c.isoNumeric === meta.isoNumeric && c.isCatalogActive)
            );
            const isSelectedCountry = Boolean(
              meta && activeCountryMeta && meta.isoNumeric === activeCountryMeta.isoNumeric
            );
            const isHovered = hoveredCountryIso === iso;

            let fillClass =
              'fill-[#DFD7CC] dark:fill-[#16181F] stroke-[#F9F9F9] dark:stroke-[#252833]';
            if (meta?.region === 'africa') {
              fillClass = hasActiveCatalog
                ? 'fill-[#E85002]/75 dark:fill-[#E85002]/70 stroke-[#F9F9F9] dark:stroke-[#090A0D]'
                : 'fill-[#D9C3AB] dark:fill-[#33271D] stroke-[#F9F9F9] dark:stroke-[#090A0D]';
            } else if (meta?.region === 'diaspora') {
              fillClass = hasActiveCatalog
                ? 'fill-[#F16001]/70 dark:fill-[#F16001]/60 stroke-[#F9F9F9] dark:stroke-[#090A0D]'
                : 'fill-[#CBBFB0] dark:fill-[#252936] stroke-[#F9F9F9] dark:stroke-[#090A0D]';
            }
            if (isSelectedCountry) {
              fillClass = 'fill-[#E85002] dark:fill-[#F16001] stroke-[#000000] dark:stroke-[#F9F9F9]';
            }

            return (
              <path
                key={iso}
                d={d}
                data-country-iso={iso}
                data-region={meta?.region || 'other'}
                onMouseEnter={() => (meta ? setHoveredCountryIso(iso) : setHoveredCountryIso(null))}
                onMouseLeave={() => setHoveredCountryIso(null)}
                onClick={() => meta && selectCountryOnMap(iso)}
                strokeWidth={(isSelectedCountry ? 1.4 : isHovered ? 1.1 : 0.55) / transform.scale}
                className={`${fillClass} transition-colors duration-150 ${
                  meta ? 'cursor-pointer hover:brightness-105' : ''
                }`}
              >
                {meta && <title>{`${isEn ? meta.nameEn : meta.nameFr} (${meta.primaryCity})`}</title>}
              </path>
            );
          })}

          {/* Geodesic Diaspora Corridor Arcs */}
          {corridors.map((arc) => {
            const p1 = projection(arc.from);
            const p2 = projection(arc.to);
            if (!p1 || !p2) return null;
            const mx = (p1[0] + p2[0]) / 2;
            const my = (p1[1] + p2[1]) / 2;
            const dist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
            const cy = Math.max(14, my - dist * 0.22);
            return (
              <path
                key={arc.id}
                d={`M ${p1[0]} ${p1[1]} Q ${mx} ${cy} ${p2[0]} ${p2[1]}`}
                fill="none"
                stroke="#E85002"
                strokeOpacity={0.55}
                strokeWidth={1.3 / transform.scale}
                strokeDasharray={`${4 / transform.scale} ${3 / transform.scale}`}
                className="pointer-events-none"
              />
            );
          })}

          {/* Interactive Hub Markers (All 88 Africa & Diaspora Countries + Active Event/Network Cities) */}
          {clusters.map((cluster) => {
            const coords = projection(cluster.coordinates);
            if (!coords) return null;
            const [cx, cy] = coords;
            const isSelected = activeCluster?.key === cluster.key;

            return (
              <g
                key={cluster.key}
                transform={`translate(${cx}, ${cy}) scale(${invScale})`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedKey(cluster.key);
                  setClusterEventIndex(0);
                }}
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                aria-label={`${localizeCity(cluster.city, lang)} (${translateCountry(cluster.country, lang)})`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedKey(cluster.key);
                    setClusterEventIndex(0);
                  }
                }}
              >
                {cluster.isCatalogActive ? (
                  <>
                    {/* Concentric glowing halo */}
                    <circle
                      r={isSelected ? 19 : 12}
                      fill="#E85002"
                      fillOpacity={isSelected ? 0.28 : 0.16}
                      stroke="#E85002"
                      strokeOpacity={isSelected ? 0.75 : 0.35}
                      strokeWidth={1}
                    />
                    <circle
                      r={isSelected ? 10.5 : 8.5}
                      fill={isSelected ? '#E85002' : '#000000'}
                      stroke="#F9F9F9"
                      strokeWidth={1.5}
                    />
                    <text
                      textAnchor="middle"
                      dy="0.33em"
                      fill="#F9F9F9"
                      fontSize="8.5"
                      fontWeight="700"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {cluster.count}
                    </text>
                    {(isSelected || transform.scale >= 1.8) && (
                      <g transform="translate(0, -16)">
                        <rect
                          x={-(localizeCity(cluster.city, lang).length * 3.4 + 10)}
                          y={-9}
                          width={localizeCity(cluster.city, lang).length * 6.8 + 20}
                          height={15}
                          rx={7.5}
                          fill={isSelected ? '#000000' : '#FFFFFF'}
                          fillOpacity={0.94}
                          stroke="#E85002"
                          strokeOpacity={isSelected ? 0.85 : 0.4}
                          strokeWidth={0.8}
                        />
                        <text
                          textAnchor="middle"
                          dy="1.5"
                          fill={isSelected ? '#F9F9F9' : '#000000'}
                          fontSize="8.5"
                          fontWeight="700"
                          fontFamily="Montserrat, sans-serif"
                        >
                          {localizeCity(cluster.city, lang)}
                        </text>
                      </g>
                    )}
                  </>
                ) : (
                  <circle
                    r={isSelected ? 5.5 : 3.2}
                    fill={
                      isSelected
                        ? '#E85002'
                        : cluster.zone === 'africa'
                          ? '#C10801'
                          : '#333333'
                    }
                    fillOpacity={isSelected ? 1 : 0.75}
                    stroke="#F9F9F9"
                    strokeWidth={0.9}
                  />
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Top Overlay Toolbar: Stats + Region Presets + Zoom + Coverage Toggle */}
      <div className="relative z-10 flex flex-col gap-2.5 p-3 sm:p-4 pointer-events-none">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/92 dark:bg-[#141417]/92 backdrop-blur-md border border-[var(--ae-border)] px-3 py-1.5 text-[11px] font-semibold text-[#000000] dark:text-[#F9F9F9] shadow-xs">
              <MapPin className="h-3.5 w-3.5 text-[#E85002]" />
              <span>
                {mode === 'events'
                  ? isEn
                    ? `${activeCatalogCount} active event hubs · ${AFRICA_DIASPORA_COUNTRIES.length} countries`
                    : `${activeCatalogCount} pôles actifs · ${AFRICA_DIASPORA_COUNTRIES.length} pays Afrique & Diaspora`
                  : isEn
                    ? `${activeCatalogCount} network hubs · ${AFRICA_DIASPORA_COUNTRIES.length} countries`
                    : `${activeCatalogCount} pôles réseaux · ${AFRICA_DIASPORA_COUNTRIES.length} pays`}
              </span>
            </span>

            {hoveredCountryMeta && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#000000]/90 text-[#F9F9F9] px-3 py-1 text-[11px] font-semibold shadow-sm">
                <Globe className="h-3 w-3 text-[#E85002]" />
                <span>
                  {isEn ? hoveredCountryMeta.nameEn : hoveredCountryMeta.nameFr} ·{' '}
                  {hoveredCountryMeta.primaryCity}
                </span>
              </span>
            )}
          </div>

          {/* Zoom & All-88-Countries Toggle */}
          <div className="pointer-events-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIncludeAllCountries((v) => !v)}
              className={`min-h-[32px] inline-flex items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold backdrop-blur-md transition-colors whitespace-nowrap ${
                includeAllCountries
                  ? 'border-[#E85002] bg-[#E85002] text-[#F9F9F9]'
                  : 'border-[var(--ae-border)] bg-white/90 dark:bg-[#141417]/90 text-[#000000] dark:text-[#F9F9F9]'
              }`}
            >
              <Compass className="h-3 w-3" />
              <span>
                {includeAllCountries
                  ? isEn
                    ? 'All Africa + Diaspora (88)'
                    : 'Afrique + Diaspora (88)'
                  : isEn
                    ? 'Active hubs only'
                    : 'Pôles actifs seuls'}
              </span>
            </button>

            <div className="inline-flex items-center rounded-full border border-[var(--ae-border)] bg-white/92 dark:bg-[#141417]/92 backdrop-blur-md p-0.5 shadow-xs">
              <button
                type="button"
                onClick={() => handleZoomStep(-1)}
                aria-label={isEn ? 'Zoom out map' : 'Dézoomer la carte'}
                className="h-7 w-7 flex items-center justify-center rounded-full text-[#000000] dark:text-[#F9F9F9] hover:bg-[#F3EFEA] dark:hover:bg-[#1E1E22]"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleZoomStep(1)}
                aria-label={isEn ? 'Zoom in map' : 'Zoomer la carte'}
                className="h-7 w-7 flex items-center justify-center rounded-full text-[#000000] dark:text-[#F9F9F9] hover:bg-[#F3EFEA] dark:hover:bg-[#1E1E22]"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => applyPreset('world')}
                aria-label={isEn ? 'Reset world view' : 'Réinitialiser la vue monde'}
                className="h-7 w-7 flex items-center justify-center rounded-full text-[#646464] dark:text-[#A7A7A7] hover:text-[#E85002]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* World Region Presets Bar */}
        <div className="pointer-events-auto flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          {WORLD_REGION_PRESETS.map((preset) => {
            const active = regionPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className={`min-h-[30px] rounded-full px-3 text-[11px] font-semibold backdrop-blur-md transition-all whitespace-nowrap border ${
                  active
                    ? 'bg-[#000000] dark:bg-[#E85002] text-[#F9F9F9] border-[#000000] dark:border-[#E85002]'
                    : 'bg-white/88 dark:bg-[#141417]/88 text-[#000000] dark:text-[#F9F9F9] border-[var(--ae-border)] hover:border-[#E85002]'
                }`}
              >
                {isEn ? preset.labelEn : preset.labelFr}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Floating Frosted Spotlight Card */}
      <div className="relative z-20 p-3 sm:p-4 pointer-events-none">
        {mode === 'events' && ev ? (
          <div className="pointer-events-auto rounded-[22px] bg-white/95 dark:bg-[#141417]/95 backdrop-blur-xl border border-[var(--ae-border)] p-3.5 sm:p-4 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
            <div className="flex items-center gap-3.5 min-w-0">
              {ev.imageUrl ? (
                <img
                  src={ev.imageUrl}
                  alt={ev.title}
                  referrerPolicy="no-referrer"
                  className="h-20 w-20 sm:h-22 sm:w-24 rounded-2xl object-cover shrink-0"
                />
              ) : (
                <div className="h-20 w-20 rounded-2xl brand-gradient-card shrink-0 flex items-center justify-center font-bold text-[#F9F9F9]">
                  {ev.city.slice(0, 2).toUpperCase()}
                </div>
              )}

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="font-semibold text-[#000000] dark:text-[#F9F9F9]">
                    {translateFormat(ev.format, lang)}
                  </span>
                  <span className="inline-flex items-center gap-0.5 font-mono font-semibold text-[#E85002]">
                    <Star className="h-3 w-3 fill-[#E85002] text-[#E85002]" />
                    <span>{translateSector(ev.sector, lang)}</span>
                  </span>
                  {ev.locked && (
                    <span className="inline-flex items-center gap-1 text-[#646464] dark:text-[#A7A7A7]">
                      <Lock className="h-3 w-3" />
                      <span>{isEn ? 'Preview' : 'Aperçu'}</span>
                    </span>
                  )}
                  {activeCluster && activeCluster.events.length > 1 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#F3EFEA] dark:bg-[#1E1E22] px-2 py-0.5 font-mono text-[10px]">
                      <button
                        type="button"
                        onClick={() =>
                          setClusterEventIndex(
                            (i) => (i - 1 + activeCluster.events.length) % activeCluster.events.length
                          )
                        }
                        aria-label={isEn ? 'Previous event in hub' : 'Événement précédent du pôle'}
                      >
                        <ChevronLeft className="h-3 w-3" />
                      </button>
                      <span>
                        {(clusterEventIndex % activeCluster.events.length) + 1}/{activeCluster.events.length}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setClusterEventIndex((i) => (i + 1) % activeCluster.events.length)
                        }
                        aria-label={isEn ? 'Next event in hub' : 'Événement suivant du pôle'}
                      >
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                </div>

                <h3 className="text-sm sm:text-base font-bold text-[#000000] dark:text-[#F9F9F9] truncate">
                  {ev.title}
                </h3>
                <p className="text-xs text-[#646464] dark:text-[#A7A7A7] truncate">
                  {ev.city}, {translateCountry(ev.country, lang)} ·{' '}
                  <span className="font-mono tabular-nums">
                    {new Date(ev.dateIso).toLocaleDateString(localeForLang(lang), {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px] font-medium text-[#646464] dark:text-[#A7A7A7]">
                  <span>
                    {ev.registeredCount}/{ev.capacity} {isEn ? 'seats' : 'places'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono font-semibold text-[#000000] dark:text-[#F9F9F9]">
                    {ev.feeEur > 0 ? `${ev.feeEur} €` : isEn ? 'Included in plan' : 'Inclus abo.'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0 self-end sm:self-center">
              {onFilterLocation && (
                <button
                  type="button"
                  onClick={() => onFilterLocation(ev.country)}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-full border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1E1E22] px-3 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002] whitespace-nowrap"
                >
                  <Filter className="h-3.5 w-3.5 text-[#E85002]" />
                  <span>{translateCountry(ev.country, lang)}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onToggleFavorite(ev.id)}
                aria-pressed={isFav}
                aria-label={
                  isEn
                    ? isFav
                      ? `Remove ${ev.title} from favorites`
                      : `Save ${ev.title} to favorites`
                    : isFav
                      ? `Retirer ${ev.title} des favoris (carte)`
                      : `Ajouter ${ev.title} aux favoris (carte)`
                }
                className={`flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${
                  isFav
                    ? 'border-[#E85002] bg-[#E85002] text-[#F9F9F9]'
                    : 'border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1E1E22] text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002]'
                }`}
              >
                <Heart className={`h-4 w-4 ${isFav ? 'fill-white' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => onSelectEvent(ev.id)}
                className="min-h-[42px] inline-flex items-center gap-2 rounded-full orange-glow-btn px-4 text-xs font-semibold transition-all whitespace-nowrap"
              >
                <span>{isEn ? 'View details' : 'Voir la fiche'}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : net ? (
          <div className="pointer-events-auto rounded-[22px] bg-white/95 dark:bg-[#141417]/95 backdrop-blur-xl border border-[var(--ae-border)] p-4 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#E85002] text-[#F9F9F9]">
                <Globe className="h-7 w-7" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-[#E85002]">
                  <span>{net.sectors.map((s) => translateSector(s, lang)).join(' · ')}</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 font-mono text-[#646464] dark:text-[#A7A7A7]">
                    <Users className="h-3 w-3 text-[#E85002]" />
                    {net.memberCount} {isEn ? 'members' : 'membres'}
                  </span>
                </div>
                <h3 className="text-sm sm:text-base font-bold text-[#000000] dark:text-[#F9F9F9] truncate">
                  {net.name}
                </h3>
                <p className="text-xs text-[#646464] dark:text-[#A7A7A7] truncate">
                  {net.countries.map((c) => translateCountry(c, lang)).join(' · ')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSelectNetwork(net)}
              className="min-h-[42px] inline-flex items-center gap-2 rounded-full orange-glow-btn px-4 text-xs font-semibold transition-all whitespace-nowrap self-end sm:self-center"
            >
              <span>
                {net.locked ? (isEn ? 'Preview' : 'Aperçu') : isEn ? 'Explore' : 'Consulter'}
              </span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : activeCluster ? (
          <div className="pointer-events-auto rounded-[22px] bg-white/95 dark:bg-[#141417]/95 backdrop-blur-xl border border-[var(--ae-border)] p-4 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#E85002]/15 text-[#E85002]">
                <Globe className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#E85002]">
                  {activeCluster.zone === 'africa'
                    ? isEn
                      ? 'Africa Hub'
                      : 'Pôle Afrique'
                    : isEn
                      ? 'Global Diaspora Hub'
                      : 'Pôle Diaspora Monde'}
                </p>
                <h3 className="text-sm sm:text-base font-bold text-[#000000] dark:text-[#F9F9F9] truncate">
                  {translateCountry(activeCluster.country, lang)} · {localizeCity(activeCluster.city, lang)}
                </h3>
                <p className="text-xs text-[#646464] dark:text-[#A7A7A7] truncate">
                  {activeCluster.secondaryLabel}
                </p>
              </div>
            </div>
            {onFilterLocation && (
              <button
                type="button"
                onClick={() => onFilterLocation(activeCluster.country)}
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-full orange-glow-btn px-4 text-xs font-semibold whitespace-nowrap self-end sm:self-center"
              >
                <Filter className="h-3.5 w-3.5" />
                <span>{isEn ? 'Filter country' : 'Filtrer ce pays'}</span>
              </button>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
};
