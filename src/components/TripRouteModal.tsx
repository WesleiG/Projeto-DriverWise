import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap, Popup } from 'react-leaflet';
import L from 'leaflet';
import { TripDetail } from '../types/session';
import { formatCurrency, formatDistance, formatSecondsToDigital } from '../utils/formatters';
import { decodePolyline } from '../utils/polylineEncoder';
import { getPathDistanceKm, getStreetDrivingRoute } from '../services/routeService';
import { calculateHaversineDistance } from '../utils/geoUtils';
import { X, Navigation, RefreshCw } from 'lucide-react';
import { useAdaptiveMapTheme } from '../hooks/useAdaptiveMapTheme';

interface TripRouteModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: TripDetail | null;
}

// Componente para ajustar automaticamente o zoom e centrar no percurso da viagem
function MapFitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (positions && positions.length > 0) {
      if (positions.length === 1) {
        map.setView(positions[0], 16);
      } else {
        const bounds = L.latLngBounds(positions);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
      }
    }
  }, [positions, map]);

  return null;
}

const MAX_ROUTE_POINTS = 250;

function downsampleRoute(points: [number, number][]): [number, number][] {
  if (points.length <= MAX_ROUTE_POINTS) return points;
  const sampled: [number, number][] = [];
  const step = (points.length - 1) / (MAX_ROUTE_POINTS - 1);
  for (let index = 0; index < MAX_ROUTE_POINTS; index += 1) {
    sampled.push(points[Math.round(index * step)]);
  }
  return sampled;
}

const startIcon = L.divIcon({
  className: 'custom-start-marker',
  html: `
    <div class="w-7 h-7 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-emerald-500/50">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <polygon points="10 8 16 12 10 16 10 8"></polygon>
      </svg>
    </div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const endIcon = L.divIcon({
  className: 'custom-end-marker',
  html: `
    <div class="w-7 h-7 rounded-full bg-rose-500 border-2 border-white flex items-center justify-center text-white font-bold shadow-lg shadow-rose-500/50">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
        <line x1="4" y1="22" x2="4" y2="15"></line>
      </svg>
    </div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export const TripRouteModal: React.FC<TripRouteModalProps> = ({
  isOpen,
  onClose,
  trip,
}) => {
  const { tileUrl } = useAdaptiveMapTheme();
  const [enrichedPositions, setEnrichedPositions] = useState<[number, number][] | null>(null);
  const [isEnriching, setIsEnriching] = useState<boolean>(false);

  const basePositions = useMemo<[number, number][]>(() => {
    if (!trip) return [];
    const rawPositions = trip.pathHistory && trip.pathHistory.length > 0
      ? trip.pathHistory.map((p) => [p.lat, p.lng] as [number, number])
      : trip.encodedPath
        ? decodePolyline(trip.encodedPath)
        : [];
    return downsampleRoute(rawPositions);
  }, [trip]);

  // Se a rota for uma linha reta ou com poucos pontos, consultar OSRM para desenhar pelas ruas reais
  useEffect(() => {
    setEnrichedPositions(null);
    if (!isOpen || !trip) return;

    const rawPositions = trip.pathHistory && trip.pathHistory.length > 0
      ? trip.pathHistory.map((p) => [p.lat, p.lng] as [number, number])
      : trip.encodedPath
        ? decodePolyline(trip.encodedPath)
        : [];

    if (rawPositions.length < 2) return;

    const start = { lat: rawPositions[0][0], lng: rawPositions[0][1] };
    const end = { lat: rawPositions[rawPositions.length - 1][0], lng: rawPositions[rawPositions.length - 1][1] };
    const directDist = calculateHaversineDistance(start, end);
    const pathDist = getPathDistanceKm(rawPositions);

    if (directDist >= 0.04 && (rawPositions.length <= 6 || trip.distanceKm <= 0.25 || trip.distanceKm < 0.7 * pathDist)) {
      setIsEnriching(true);
      const waypoints = rawPositions.slice(1, -1).map(([lat, lng]) => ({ lat, lng }));
      void getStreetDrivingRoute(start, end, waypoints, true)
        .then((result) => {
          if (result && result.path.length >= 2) {
            setEnrichedPositions(result.path.map((p) => [p.lat, p.lng]));
          }
        })
        .finally(() => {
          setIsEnriching(false);
        });
    }
  }, [isOpen, trip]);

  const activePositions = useMemo<[number, number][]>(() => {
    if (enrichedPositions && enrichedPositions.length > 0) {
      return downsampleRoute(enrichedPositions);
    }
    return basePositions;
  }, [enrichedPositions, basePositions]);

  const effectiveDistance = useMemo(() => {
    if (!trip) return 0;
    const pathDist = getPathDistanceKm(activePositions);
    return pathDist >= 0.3 && (trip.distanceKm <= 0.25 || trip.distanceKm < 0.7 * pathDist)
      ? pathDist
      : Math.max(trip.distanceKm, pathDist > 0.05 ? pathDist : 0);
  }, [activePositions, trip]);

  if (!isOpen || !trip) return null;

  const startCoord = activePositions[0] || null;
  const endCoord = activePositions.length > 1 ? activePositions[activePositions.length - 1] : startCoord;

  const getPlatformBadge = () => {
    switch (trip.platform) {
      case 'uber':
        return <span className="px-2 py-0.5 rounded-lg bg-black text-white border border-slate-700 text-xs font-bold">UBER</span>;
      case 'bolt':
        return <span className="px-2 py-0.5 rounded-lg bg-teal-500 text-slate-950 font-bold text-xs">BOLT</span>;
      case 'freenow':
        return <span className="px-2 py-0.5 rounded-lg bg-rose-500 text-white font-bold text-xs">FREENOW</span>;
      default:
        return <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 font-bold text-xs">OUTRA</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col text-slate-100 max-h-[92vh]">
        {/* Cabeçalho */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            {getPlatformBadge()}
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2">
                <span>Percurso da Viagem</span>
                <span className="text-xs text-slate-400 font-normal">
                  ({trip.startTime} → {trip.endTime})
                </span>
                {isEnriching && (
                  <span className="flex items-center gap-1 text-[10px] text-cyan-400 font-normal font-mono bg-cyan-950/50 px-2 py-0.5 rounded-full border border-cyan-800/60 animate-pulse">
                    <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                    <span>A traçar ruas...</span>
                  </span>
                )}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Métricas Rápidas da Viagem (Bruto, Custo e Lucro Líquido) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-800 bg-slate-950/80 border-b border-slate-800 text-center py-2.5 px-4 text-xs gap-y-2">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-500 block">Distância / Duração</span>
            <span className="font-mono font-bold text-slate-200">
              {formatDistance(effectiveDistance)} • {formatSecondsToDigital(trip.durationSeconds)}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-500 block">Faturação Bruta</span>
            <span className="font-mono font-bold text-slate-200">{formatCurrency(trip.estimatedEarnings)}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-500 block">Custo Estimado</span>
            <span className="font-mono font-bold text-rose-400">
              {trip.fuelCost ? `-${formatCurrency(trip.fuelCost)}` : '0,00 €'}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold block">Lucro Líquido</span>
            <span className="font-mono font-bold text-emerald-400">
              {formatCurrency(trip.netEarnings ?? trip.estimatedEarnings)}
            </span>
          </div>
        </div>

        {/* Mapa do Trajeto */}
        <div className="relative w-full h-[52vh] sm:h-[60vh] bg-slate-950">
          {activePositions.length > 0 ? (
            <MapContainer
              center={activePositions[0]}
              zoom={14}
              className="w-full h-full"
              attributionControl={false}
              zoomControl={false}
            >
              <TileLayer url={tileUrl} />
              <MapFitBounds positions={activePositions} />

              {/* Rota desenhada no mapa */}
              <Polyline
                positions={activePositions}
                pathOptions={{
                  color: trip.platform === 'uber' ? '#ffffff' : (trip.platform === 'bolt' ? '#2dd4bf' : '#38bdf8'),
                  weight: 4.5,
                  opacity: 0.9,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />

              {/* Marcador de Início */}
              {startCoord && (
                <Marker position={startCoord} icon={startIcon}>
                  <Popup className="custom-popup">
                    <div className="text-xs p-1">
                      <p className="font-bold text-emerald-600">Ponto de Partida</p>
                      <p className="text-slate-600 font-mono text-[10px]">Início: {trip.startTime}</p>
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Marcador de Fim */}
              {endCoord && (
                <Marker position={endCoord} icon={endIcon}>
                  <Popup className="custom-popup">
                    <div className="text-xs p-1">
                      <p className="font-bold text-rose-600">Ponto de Chegada</p>
                      <p className="text-slate-600 font-mono text-[10px]">Fim: {trip.endTime}</p>
                    </div>
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
              <Navigation className="w-8 h-8 opacity-40 animate-pulse" />
              <p className="text-sm">Sem rota GPS registada para esta viagem.</p>
            </div>
          )}

          {/* Legenda do Mapa */}
          <div className="absolute bottom-3 left-3 z-[400] bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl px-3 py-2 text-[10px] space-y-1 shadow-lg text-slate-300">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              <span>Partida: {trip.startTime}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
              <span>Chegada: {trip.endTime}</span>
            </div>
          </div>
        </div>

        {/* Rodapé do Modal */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          <span className="text-xs text-slate-400 font-mono">
            {activePositions.length} pontos de trajeto viário
          </span>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default TripRouteModal;
