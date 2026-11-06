import { useState, useEffect, useMemo, useRef } from 'react';
import { Coordinates } from '../types/location';
import { calculateHaversineDistance } from '../utils/geoUtils';

export type TrafficCondition = 'fluid' | 'moderate' | 'heavy_traffic';

export interface TvdeHotspot {
  id: string;
  name: string;
  region: 'lisbon' | 'porto' | 'coastal';
  lat: number;
  lng: number;
  description: string;
  peakHours: string;
  estimatedWaitMin: number;
  occupancyEfficiency: number;
  distanceKm?: number;
  estimatedDriveTimeMin?: number;
}

// Não existem aqui dados de procura/espera validados por uma fonte externa.
// A lista permanece vazia até ser ligada a uma API real e identificada.
export const TVDE_HOTSPOTS: TvdeHotspot[] = [];

interface UseTrafficHotspotAdvisorProps {
  currentPosition: Coordinates;
  currentSpeedKmh: number;
  isMoving: boolean;
  hasPassenger: boolean;
  isShiftActive: boolean;
}

export function useTrafficHotspotAdvisor({
  currentPosition,
  currentSpeedKmh,
  isMoving,
  hasPassenger,
  isShiftActive,
}: UseTrafficHotspotAdvisorProps) {
  const [trafficCondition, setTrafficCondition] = useState<TrafficCondition>('fluid');
  const [rollingAvgSpeed, setRollingAvgSpeed] = useState<number>(0);
  const speedHistoryRef = useRef<{ speed: number; time: number }[]>([]);

  // 1. Cálculo da Velocidade Média Móvel nos últimos 2 minutos
  useEffect(() => {
    if (!isShiftActive) return;

    const now = Date.now();
    speedHistoryRef.current.push({ speed: currentSpeedKmh, time: now });

    // Manter apenas amostras dos últimos 120 segundos
    speedHistoryRef.current = speedHistoryRef.current.filter((item) => now - item.time <= 120000);

    if (speedHistoryRef.current.length >= 5) {
      const sum = speedHistoryRef.current.reduce((acc, curr) => acc + curr.speed, 0);
      const avg = sum / speedHistoryRef.current.length;
      setRollingAvgSpeed(Number(avg.toFixed(1)));

      if (avg < 14 && isMoving && !hasPassenger) {
        setTrafficCondition('heavy_traffic');
      } else if (avg <= 28) {
        setTrafficCondition('moderate');
      } else {
        setTrafficCondition('fluid');
      }
    }
  }, [currentSpeedKmh, isMoving, hasPassenger, isShiftActive]);

  // Coordenadas arredondadas para 3 casas decimais (~100m) para evitar recalcular em micro-oscilações GPS
  const roundedLat = Number.isFinite(currentPosition?.lat) ? Number(currentPosition.lat.toFixed(3)) : null;
  const roundedLng = Number.isFinite(currentPosition?.lng) ? Number(currentPosition.lng.toFixed(3)) : null;

  // 2. Determinar os Hotspots mais próximos do condutor com base na geolocalização atual
  const nearestHotspots = useMemo(() => {
    if (roundedLat === null || roundedLng === null) return [];

    return [...TVDE_HOTSPOTS]
      .map((spot) => {
        const distKm = calculateHaversineDistance(
          { lat: roundedLat, lng: roundedLng },
          { lat: spot.lat, lng: spot.lng }
        );
        return {
          ...spot,
          distanceKm: Number(distKm.toFixed(1)),
          estimatedDriveTimeMin: Math.max(2, Math.round((distKm / 32) * 60)),
        };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [roundedLat, roundedLng]);

  const topRecommendation = nearestHotspots[0] || null;

  return {
    trafficCondition,
    rollingAvgSpeed,
    nearestHotspots,
    topRecommendation,
    isTrafficJamAlert: trafficCondition === 'heavy_traffic' && !hasPassenger && isShiftActive,
  };
}
