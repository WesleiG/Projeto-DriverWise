import { useState, useEffect, useRef } from 'react';

export interface AdaptiveMapThemeState {
  isDark: boolean;
  isTunnelOrNight: boolean;
  lux: number | null;
  mode: 'day' | 'night' | 'tunnel';
  tileUrl: string;
}

// OpenStreetMap público, sem chave. O tema noturno é aplicado pelo CSS do
// Leaflet para manter apenas uma fonte pública de tiles e um cache pequeno.
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

type AmbientLightSensorLike = {
  illuminance: number;
  addEventListener: (type: 'reading', listener: () => void) => void;
  start: () => void;
  stop: () => void;
};

type AmbientLightSensorConstructor = new (options: { frequency: number }) => AmbientLightSensorLike;

export function useAdaptiveMapTheme(): AdaptiveMapThemeState {
  const [lux, setLux] = useState<number | null>(null);
  const [isDark, setIsDark] = useState<boolean>(() => {
    const hour = new Date().getHours();
    return hour < 7 || hour >= 20;
  });
  const [mode, setMode] = useState<'day' | 'night' | 'tunnel'>('day');
  const luxRef = useRef<number | null>(null);

  useEffect(() => {
    let sensor: AmbientLightSensorLike | null = null;

    // 1. Tentar ler o Sensor de Luz Ambiente
    const AmbientLightSensor = typeof window !== 'undefined'
      ? (window as Window & { AmbientLightSensor?: AmbientLightSensorConstructor }).AmbientLightSensor
      : undefined;
    if (AmbientLightSensor) {
      try {
        const lightSensor = new AmbientLightSensor({ frequency: 0.5 });
        sensor = lightSensor;
        lightSensor.addEventListener('reading', () => {
          const currentLux = lightSensor.illuminance;
          luxRef.current = currentLux;
          setLux(currentLux);

          const hour = new Date().getHours();
          const isNightTime = hour < 7 || hour >= 20;

          if (currentLux < 25) {
            setIsDark(true);
            setMode(isNightTime ? 'night' : 'tunnel');
          } else {
            setIsDark(false);
            setMode('day');
          }
        });

        lightSensor.start();
      } catch {
        // Sensor bloqueado ou não suportado
      }
    }

    // 2. Fallback baseado no relógio solar (20:00 - 07:00 é noite)
    const checkSolarTime = () => {
      if (luxRef.current === null) {
        const hour = new Date().getHours();
        const night = hour < 7 || hour >= 20;
        setIsDark(night);
        setMode(night ? 'night' : 'day');
      }
    };

    checkSolarTime();
    const interval = setInterval(checkSolarTime, 60000);

    return () => {
      clearInterval(interval);
      if (sensor) {
        try {
          sensor.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []); // Monta uma única vez sem recriar a cada leitura

  return {
    isDark,
    isTunnelOrNight: isDark,
    lux,
    mode,
    tileUrl: TILE_URL,
  };
}
