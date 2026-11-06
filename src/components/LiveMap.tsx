import React, { useMemo, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Coordinates } from '../types/location';
import { LocationPoint } from '../types/session';
import { useAdaptiveMapTheme } from '../hooks/useAdaptiveMapTheme';
import { Moon, Sun } from 'lucide-react';

interface LiveMapProps {
  currentPosition: Coordinates;
  heading: number;
  speedKmh: number;
  pathHistory: LocationPoint[];
  isTracking: boolean;
}

// Componente leve para recentrar o mapa com threshold de deslocamento (poupa CPU/GPU no Tesla)
function MapAutoRecenter({ coords }: { coords: Coordinates }) {
  const map = useMap();
  const lastPanRef = useRef<Coordinates | null>(null);

  useEffect(() => {
    if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return;

    if (lastPanRef.current) {
      const dLat = Math.abs(lastPanRef.current.lat - coords.lat);
      const dLng = Math.abs(lastPanRef.current.lng - coords.lng);
      if (dLat < 0.00008 && dLng < 0.00008) return;
    }

    lastPanRef.current = coords;
    map.setView([coords.lat, coords.lng], map.getZoom(), { animate: false });
  }, [coords, map]);

  return null;
}

// Ícone estático criado uma única vez para ZERO fugas de memória DOM no WebKit da Tesla
const staticCarIcon = L.divIcon({
  className: 'custom-car-marker-container',
  html: `<div id="tesla-car-marker-icon" style="transform: rotate(0deg); transition: transform 0.2s linear;" class="relative flex items-center justify-center">
    <div class="w-7 h-7 rounded-full bg-slate-950 border-2 border-emerald-400 flex items-center justify-center shadow-md">
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="12 2 19 21 12 17 5 21 12 2"></polygon>
      </svg>
    </div>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export const LiveMap: React.FC<LiveMapProps> = React.memo(({
  currentPosition,
  heading,
  speedKmh,
  pathHistory,
  isTracking,
}) => {
  const { tileUrl, isDark, mode } = useAdaptiveMapTheme();

  // Atualizar a rotação do ícone via DOM direto sem recriar instâncias Leaflet
  useEffect(() => {
    const el = document.getElementById('tesla-car-marker-icon');
    if (el) {
      el.style.transform = `rotate(${Math.round(heading)}deg)`;
    }
  }, [heading]);

  const polylinePositions = useMemo(() => {
    return pathHistory.slice(-40).map((p) => [p.lat, p.lng] as [number, number]);
  }, [pathHistory]);
  const shouldRenderMap = isTracking || polylinePositions.length > 0;

  return (
    <div className="relative w-full h-56 md:h-60 rounded-3xl overflow-hidden border border-slate-800 shadow-xl bg-slate-950">
      {shouldRenderMap ? (
        <MapContainer
          center={[currentPosition.lat, currentPosition.lng]}
          zoom={16}
          scrollWheelZoom={false}
          preferCanvas={true}
          className="w-full h-full z-0"
        >
          <TileLayer
            key={tileUrl}
            url={tileUrl}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            keepBuffer={0}
            updateWhenIdle={true}
            maxNativeZoom={18}
          />

          <MapAutoRecenter coords={currentPosition} />

          {polylinePositions.length > 1 && (
            <Polyline
              positions={polylinePositions}
              pathOptions={{
                color: '#10b981',
                weight: 3.5,
                opacity: 0.85,
                dashArray: speedKmh > 5 ? '6, 6' : undefined,
              }}
            />
          )}

          {isTracking && <Marker position={[currentPosition.lat, currentPosition.lng]} icon={staticCarIcon} />}
        </MapContainer>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">
          GPS em espera — inicie um turno para ativar o mapa
        </div>
      )}

      {/* Indicador de Modo Adaptativo */}
      <div className="absolute top-3 left-3 z-[400] bg-slate-900/95 px-2.5 py-1 rounded-xl border border-slate-800 text-[11px] text-slate-300 flex items-center gap-1.5 shadow-md">
        {isDark ? (
          <Moon className="w-3.5 h-3.5 text-indigo-400" />
        ) : (
          <Sun className="w-3.5 h-3.5 text-amber-400" />
        )}
        <span className="capitalize font-medium">
          {mode === 'tunnel' ? 'Túnel' : mode === 'night' ? 'Noturno' : 'Diurno'}
        </span>
      </div>
    </div>
  );
});
