import { useState, useEffect, useRef, useCallback } from 'react';
import { Coordinates, JoystickVector } from '../types/location';
import { moveCoordinate, DEFAULT_PORTUGAL_COORDS } from '../utils/geoUtils';

interface UseJoystickSimulationProps {
  enabled: boolean;
  initialCoords?: Coordinates;
  onSimulationTick?: (coords: Coordinates, speedKmh: number, heading: number, distanceDeltaKm: number) => void;
}

export function useJoystickSimulation({
  enabled,
  initialCoords = DEFAULT_PORTUGAL_COORDS,
  onSimulationTick,
}: UseJoystickSimulationProps) {
  const [coords, setCoords] = useState<Coordinates>(initialCoords);
  const [speedKmh, setSpeedKmh] = useState<number>(0);
  const [heading, setHeading] = useState<number>(0);
  const [isDriving, setIsDriving] = useState<boolean>(false);

  const joystickVectorRef = useRef<JoystickVector>({ x: 0, y: 0, angleDegrees: 0, force: 0 });
  const currentCoordsRef = useRef<Coordinates>(initialCoords);
  const currentSpeedRef = useRef<number>(0);
  const currentHeadingRef = useRef<number>(0);
  const onSimulationTickRef = useRef(onSimulationTick);
  onSimulationTickRef.current = onSimulationTick;

  // Atualizar vetor do joystick vindo da UI
  const setJoystickInput = useCallback((vector: JoystickVector) => {
    joystickVectorRef.current = vector;
    if (vector.force > 0.05) {
      setIsDriving(true);
    }
  }, []);

  // Resetar posição
  const resetPosition = useCallback((newCoords?: Coordinates) => {
    const c = newCoords || DEFAULT_PORTUGAL_COORDS;
    currentCoordsRef.current = c;
    currentSpeedRef.current = 0;
    setCoords(c);
    setSpeedKmh(0);
  }, []);

  // Loop de física e simulação
  useEffect(() => {
    if (!enabled) {
      currentSpeedRef.current = 0;
      setSpeedKmh(0);
      setIsDriving(false);
      return;
    }

    const intervalMs = 100; // 10 ticks por segundo para física suave
    const timer = setInterval(() => {
      const { force, angleDegrees } = joystickVectorRef.current;
      const targetSpeed = force > 0.05 ? force * 140 : 0; // Velocidade até 140 km/h

      // Aceleração / Desaceleração suave e responsiva
      if (targetSpeed > currentSpeedRef.current) {
        currentSpeedRef.current = Math.min(
          targetSpeed,
          currentSpeedRef.current + 10 // Aceleração gradual
        );
      } else {
        currentSpeedRef.current = Math.max(
          0,
          currentSpeedRef.current - 12 // Desaceleração / travagem
        );
      }

      const activeSpeed = Math.round(currentSpeedRef.current);
      setSpeedKmh(activeSpeed);

      if (force > 0.05) {
        currentHeadingRef.current = angleDegrees;
        setHeading(angleDegrees);
        setIsDriving(true);
      } else if (activeSpeed <= 0.1) {
        setIsDriving(false);
      }

      // Se houver velocidade, calcula o deslocamento em metros e nova coordenada
      let distanceDeltaKm = 0;
      if (activeSpeed > 0.1) {
        // Velocidade em m/s = speed / 3.6
        const speedMps = activeSpeed / 3.6;
        const deltaSeconds = intervalMs / 1000;
        const distanceMeters = speedMps * deltaSeconds;
        distanceDeltaKm = distanceMeters / 1000;

        const nextCoords = moveCoordinate(
          currentCoordsRef.current,
          distanceMeters,
          currentHeadingRef.current
        );

        currentCoordsRef.current = nextCoords;
        setCoords(nextCoords);
      }

      if (onSimulationTickRef.current) {
        onSimulationTickRef.current(
          currentCoordsRef.current,
          activeSpeed,
          currentHeadingRef.current,
          distanceDeltaKm
        );
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [enabled]);

  return {
    coords,
    speedKmh,
    heading,
    isDriving,
    setJoystickInput,
    resetPosition,
  };
}
