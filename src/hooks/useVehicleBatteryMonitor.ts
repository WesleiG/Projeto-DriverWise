import { useState, useEffect, useCallback, useRef } from 'react';
import { emitHeartbeat } from '../services/indexedDbSession';

export interface BatteryState {
  level: number; // 0 a 100%
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
  isSupported: boolean;
  alertType: 'none' | 'low_battery' | 'unplugged_driving';
}

interface UseVehicleBatteryMonitorProps {
  isMoving?: boolean;
}

export function useVehicleBatteryMonitor({ isMoving = false }: UseVehicleBatteryMonitorProps = {}) {
  const [batteryState, setBatteryState] = useState<BatteryState>({
    level: 100,
    charging: true,
    chargingTime: 0,
    dischargingTime: Infinity,
    isSupported: false,
    alertType: 'none',
  });

  const [isAlertDismissed, setIsAlertDismissed] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMovingRef = useRef(isMoving);
  isMovingRef.current = isMoving;

  const dismissBatteryAlert = useCallback(() => {
    setIsAlertDismissed(true);
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => {
      setIsAlertDismissed(false);
    }, 5 * 60 * 1000);
  }, []);

  useEffect(() => {
    let batteryInstance: (EventTarget & { level?: number; charging?: boolean; chargingTime?: number; dischargingTime?: number }) | null = null;

    const onBatteryChange = () => {
      if (!batteryInstance) return;
      const levelPct = Math.round((batteryInstance.level || 1) * 100);
      const isCharging = Boolean(batteryInstance.charging);

      let alert: 'none' | 'low_battery' | 'unplugged_driving' = 'none';

      if (!isCharging && levelPct <= 20) {
        alert = 'low_battery';
      } else if (!isCharging && isMovingRef.current && levelPct <= 45) {
        alert = 'unplugged_driving';
      }

      setBatteryState({
        level: levelPct,
        charging: isCharging,
        chargingTime: batteryInstance.chargingTime || 0,
        dischargingTime: batteryInstance.dischargingTime || Infinity,
        isSupported: true,
        alertType: alert,
      });

      emitHeartbeat({
        state: isMovingRef.current ? 'moving' : 'active',
        speedKmh: 0,
        batteryLevel: levelPct,
      });
    };

    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      const getBattery = (navigator as Navigator & { getBattery: () => Promise<typeof batteryInstance> }).getBattery;
      getBattery()
        .then((battery) => {
          if (!battery) return;
          batteryInstance = battery;
          onBatteryChange();

          battery.addEventListener('levelchange', onBatteryChange);
          battery.addEventListener('chargingchange', onBatteryChange);
        })
        .catch(() => {
          // API não suportada
        });
    }

    return () => {
      if (batteryInstance) {
        try {
          batteryInstance.removeEventListener('levelchange', onBatteryChange);
          batteryInstance.removeEventListener('chargingchange', onBatteryChange);
        } catch {
          // ignore
        }
      }
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []); // Monta uma única vez sem recriar listeners

  return {
    ...batteryState,
    showAlert: !isAlertDismissed && batteryState.alertType !== 'none',
    dismissBatteryAlert,
  };
}
