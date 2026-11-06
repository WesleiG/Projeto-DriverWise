import { useState, useEffect, useRef } from 'react';
import { Coordinates, GeolocationState } from '../types/location';
import { calculateBearing, calculateHaversineDistance, DEFAULT_PORTUGAL_COORDS } from '../utils/geoUtils';

interface UseGeolocationTrackerProps {
  enabled: boolean;
  onPositionUpdate?: (coords: Coordinates, speedKmh: number, heading: number, distanceDeltaKm: number, accuracyMeters?: number) => void;
}

interface PosHistoryItem {
  coords: Coordinates;
  timestamp: number;
}

export function useGeolocationTracker({ enabled, onPositionUpdate }: UseGeolocationTrackerProps) {
  const [geoState, setGeoState] = useState<GeolocationState>({
    coords: DEFAULT_PORTUGAL_COORDS,
    heading: 0,
    speedKmh: 0,
    accuracy: 10,
    isTracking: false,
    error: null,
    timestamp: Date.now(),
  });

  const lastPosRef = useRef<PosHistoryItem | null>(null);
  const historyRef = useRef<PosHistoryItem[]>([]);
  const watchIdRef = useRef<number | null>(null);
  const onPositionUpdateRef = useRef(onPositionUpdate);
  const headingRef = useRef(0);
  const smoothedSpeedRef = useRef(0);
  const lastUiPublishAtRef = useRef(0);
  onPositionUpdateRef.current = onPositionUpdate;

  useEffect(() => {
    if (!enabled) {
      if (watchIdRef.current !== null) {
        navigator.geolocation?.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      lastPosRef.current = null;
      historyRef.current = [];
      headingRef.current = 0;
      smoothedSpeedRef.current = 0;
      lastUiPublishAtRef.current = 0;
      setGeoState((prev) => ({ ...prev, isTracking: false, speedKmh: 0 }));
      return;
    }

    if (!('geolocation' in navigator)) {
      setGeoState((prev) => ({
        ...prev,
        error: 'Geolocalização não suportada neste navegador.',
        isTracking: false,
      }));
      return;
    }

    setGeoState((prev) => ({ ...prev, isTracking: true, error: null }));

    const handleSuccess = (position: GeolocationPosition) => {
      const { latitude, longitude, speed, heading, accuracy } = position.coords;
      if (![latitude, longitude].every(Number.isFinite)
        || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return;
      const currentCoords: Coordinates = { lat: latitude, lng: longitude };
      const now = position.timestamp || Date.now();
      const currentAccuracy = Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : 5;

      let calculatedSpeedKmh = 0;
      let calculatedHeading = heading !== null && Number.isFinite(heading) ? heading : headingRef.current;
      let distanceDeltaKm = 0;

      // Adicionar leitura ao histórico de curta duração para cálculo de velocidade
      historyRef.current.push({ coords: currentCoords, timestamp: now });
      if (historyRef.current.length > 8) {
        historyRef.current.shift();
      }

      if (lastPosRef.current) {
        const distKm = calculateHaversineDistance(lastPosRef.current.coords, currentCoords);
        const timeDiffSeconds = Math.max(0.1, (now - lastPosRef.current.timestamp) / 1000);
        const instantSpeedKmh = (distKm / (timeDiffSeconds / 3600));

        const isAccuracyAcceptable = currentAccuracy <= 55;
        const isPlausibleSpeed = instantSpeedKmh <= 170;

        // 1. Se o hardware fornecer velocidade nativa por GPS Doppler
        if (speed !== null && speed >= 0 && Number.isFinite(speed)) {
          calculatedSpeedKmh = Math.min(180, speed * 3.6);
        } else if (historyRef.current.length >= 2) {
          // 2. Se o hardware (Tesla/Safari) omitir a velocidade nativa, calcular a velocidade móvel
          const older = historyRef.current[0];
          const totalWindowTimeSec = Math.max(0.4, (now - older.timestamp) / 1000);
          const totalWindowDistKm = calculateHaversineDistance(older.coords, currentCoords);
          const windowSpeedKmh = (totalWindowDistKm / (totalWindowTimeSec / 3600));

          if (totalWindowDistKm >= 0.003 && windowSpeedKmh <= 170 && isAccuracyAcceptable) {
            calculatedSpeedKmh = windowSpeedKmh;
          } else {
            calculatedSpeedKmh = 0;
          }
        }

        // Suavização exponencial da velocidade (elimina saltos e tremores do velocímetro)
        smoothedSpeedRef.current = smoothedSpeedRef.current * 0.4 + calculatedSpeedKmh * 0.6;
        if (smoothedSpeedRef.current < 1.5) smoothedSpeedRef.current = 0;

        // 3. Acumulação precisa de odómetro (distância percorrida)
        if (isAccuracyAcceptable && isPlausibleSpeed && distKm >= 0.002) {
          distanceDeltaKm = distKm;
          if (distKm >= 0.004) {
            calculatedHeading = calculateBearing(lastPosRef.current.coords, currentCoords);
          }
          lastPosRef.current = { coords: currentCoords, timestamp: now };
        } else if (distKm < 0.002) {
          // Micro-ruído de GPS estacionário
          distanceDeltaKm = 0;
        } else {
          // Salto anómalo de antena ignorado
          distanceDeltaKm = 0;
          lastPosRef.current = { coords: currentCoords, timestamp: now };
        }
      } else {
        lastPosRef.current = { coords: currentCoords, timestamp: now };
      }

      const displaySpeed = Math.round(smoothedSpeedRef.current);

      // O callback continua a receber todas as leituras para não perder
      // distância, mas a árvore React só precisa de refrescar a interface
      // algumas vezes por segundo. Isto reduz renders no Tesla sem alterar
      // os cálculos do odómetro.
      if (lastUiPublishAtRef.current === 0 || now - lastUiPublishAtRef.current >= 500) {
        lastUiPublishAtRef.current = now;
        setGeoState({
          coords: currentCoords,
          heading: calculatedHeading,
          speedKmh: Math.max(0, Math.min(180, displaySpeed)),
          accuracy: currentAccuracy,
          isTracking: true,
          error: null,
          timestamp: now,
        });
      }
      headingRef.current = calculatedHeading;

      if (onPositionUpdateRef.current) {
        onPositionUpdateRef.current(
          currentCoords,
          displaySpeed,
          calculatedHeading,
          distanceDeltaKm,
          currentAccuracy
        );
      }
    };

    const handleError = (err: GeolocationPositionError) => {
      let msg = 'Erro ao obter localização.';
      if (err.code === 1) msg = 'Permissão de localização recusada pelo utilizador.';
      else if (err.code === 2) msg = 'Localização indisponível.';
      else if (err.code === 3) msg = 'Tempo limite de localização excedido.';

      setGeoState((prev) => ({
        ...prev,
        error: msg,
        isTracking: false,
      }));
    };

    const options: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000,
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      handleSuccess,
      handleError,
      options
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      lastPosRef.current = null;
      historyRef.current = [];
      lastUiPublishAtRef.current = 0;
    };
  }, [enabled]);

  return geoState;
}
