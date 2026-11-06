import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { EarningRecord, EarningsSummary, HourlySegment, PlatformType, UserSettings, FuelExpense } from '../types/earnings';
import { LocationPoint, TripDetail } from '../types/session';
import { decodePolyline } from '../utils/polylineEncoder';
import { getPathDistanceKm } from '../services/routeService';
import { calculateCostPerKm, calculateEarningsSummary, calculateNetEarnings, DEFAULT_SETTINGS } from '../utils/calculations';
import {
  syncRecordToFirebase,
  syncAllRecordsToFirebase,
  deleteRecordFromFirebase,
  deleteAllRecordsFromFirebase,
  replaceAllRecordsInFirebase,
  syncSettingsToFirebase,
  fetchSettingsFromFirebase,
  fetchRecordsFromFirebase,
  subscribeToRecords,
  subscribeToAuth,
} from '../services/firebase';

const STORAGE_KEY_RECORDS = 'driverwise_earnings_records_v2';
const STORAGE_KEY_SETTINGS = 'driverwise_user_settings_v2';

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const readNonNegative = (value: unknown): number | null => {
  if (value === undefined || value === null) return 0;
  return isFiniteNumber(value) && value >= 0 ? value : null;
};
const readBoundedNonNegative = (value: unknown, max: number): number | null => {
  const numeric = readNonNegative(value);
  return numeric !== null && numeric <= max ? numeric : null;
};
const validPlatforms: PlatformType[] = ['uber', 'bolt', 'freenow', 'other'];

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00`);
  return parsed.getFullYear() === Number(value.slice(0, 4))
    && parsed.getMonth() + 1 === Number(value.slice(5, 7))
    && parsed.getDate() === Number(value.slice(8, 10));
}

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function createId(prefix: string): string {
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${uuid}`;
}

function userKey(prefix: string, uid: string) {
  return `${prefix}_${uid}`;
}

function normalizeFuelExpense(value: unknown): FuelExpense | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<FuelExpense>;
  const amount = readNonNegative(input.amount);
  if (amount === null || amount <= 0) return null;
  if (input.id !== undefined && (typeof input.id !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(input.id))) return null;
  if (input.createdAt !== undefined && typeof input.createdAt !== 'string') return null;
  if (input.quantity !== undefined && (!isFiniteNumber(input.quantity) || input.quantity <= 0)) return null;
  if (input.unit !== undefined && input.unit !== 'liters' && input.unit !== 'kwh' && input.unit !== 'unit') return null;
  if (input.notes !== undefined && typeof input.notes !== 'string') return null;

  const expense: FuelExpense = {
    id: typeof input.id === 'string' && input.id ? input.id : createId('fuel'),
    amount: Number(amount.toFixed(2)),
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : new Date().toISOString(),
  };
  if (isFiniteNumber(input.quantity) && input.quantity > 0) expense.quantity = Number(input.quantity.toFixed(3));
  if (input.unit) expense.unit = input.unit;
  if (typeof input.notes === 'string' && input.notes.trim()) expense.notes = input.notes.trim().slice(0, 240);
  return expense;
}

function normalizeLocationPoint(value: unknown): LocationPoint | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<LocationPoint>;
  if (!isFiniteNumber(input.lat) || input.lat < -90 || input.lat > 90
    || !isFiniteNumber(input.lng) || input.lng < -180 || input.lng > 180
    || !isFiniteNumber(input.speedKmh) || input.speedKmh < 0 || input.speedKmh > 240
    || !isFiniteNumber(input.heading) || input.heading < 0 || input.heading > 360
    || !isFiniteNumber(input.timestamp) || input.timestamp < 0) return null;
  if (input.hasPassenger !== undefined && typeof input.hasPassenger !== 'boolean') return null;
  return {
    lat: Number(input.lat.toFixed(7)),
    lng: Number(input.lng.toFixed(7)),
    speedKmh: Number(input.speedKmh.toFixed(2)),
    heading: Number(input.heading.toFixed(2)),
    timestamp: Math.floor(input.timestamp),
    ...(input.hasPassenger === undefined ? {} : { hasPassenger: input.hasPassenger }),
  };
}

function normalizeTrip(value: unknown): TripDetail | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<TripDetail>;
  const validTripTime = (time: unknown) => typeof time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time);
  if (typeof input.id !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(input.id)
    || !validPlatforms.includes(input.platform as PlatformType)
    || !validTripTime(input.startTime) || !validTripTime(input.endTime)) return null;
  const durationSeconds = input.durationSeconds;
  const distanceKm = input.distanceKm;
  const estimatedEarnings = input.estimatedEarnings;
  if (!isFiniteNumber(durationSeconds) || durationSeconds < 0 || durationSeconds > 172800
    || !isFiniteNumber(distanceKm) || distanceKm < 0 || distanceKm > 100000
    || !isFiniteNumber(estimatedEarnings) || estimatedEarnings < 0) return null;
  if (input.fuelCost !== undefined && (!isFiniteNumber(input.fuelCost) || input.fuelCost < 0)) return null;
  if (input.netEarnings !== undefined && !isFiniteNumber(input.netEarnings)) return null;
  if (input.encodedPath !== undefined && (typeof input.encodedPath !== 'string' || input.encodedPath.length > 200000)) return null;
  const rawPath = input.pathHistory === undefined ? [] : input.pathHistory;
  if (!Array.isArray(rawPath) || rawPath.length > 2000) return null;
  const pathHistory = rawPath.map(normalizeLocationPoint);
  if (pathHistory.some((point) => point === null)) return null;

  let resolvedPoints: Array<[number, number]> = (pathHistory as LocationPoint[]).map((p) => [p.lat, p.lng]);
  if (resolvedPoints.length === 0 && typeof input.encodedPath === 'string' && input.encodedPath.length > 0) {
    resolvedPoints = decodePolyline(input.encodedPath);
  }
  const pathDist = getPathDistanceKm(resolvedPoints);
  const effectiveDistance = pathDist >= 0.3 && (distanceKm <= 0.25 || distanceKm < 0.7 * pathDist)
    ? pathDist
    : Math.max(distanceKm, pathDist > 0.05 ? pathDist : 0);

  return {
    id: input.id,
    platform: input.platform as PlatformType,
    startTime: input.startTime as string,
    endTime: input.endTime as string,
    durationSeconds: Math.floor(durationSeconds),
    distanceKm: Number(effectiveDistance.toFixed(2)),
    estimatedEarnings: Number(estimatedEarnings.toFixed(2)),
    ...(input.fuelCost === undefined ? {} : { fuelCost: Number(input.fuelCost.toFixed(2)) }),
    ...(input.netEarnings === undefined
      ? { netEarnings: Number((estimatedEarnings - (input.fuelCost || 0)).toFixed(2)) }
      : { netEarnings: Number(input.netEarnings.toFixed(2)) }),
    ...(typeof input.encodedPath === 'string' ? { encodedPath: input.encodedPath } : {}),
    pathHistory: pathHistory as LocationPoint[],
  };
}

function normalizeHourlySegment(value: unknown): HourlySegment | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<HourlySegment>;
  const { hour, km, gross, fuelCost, net, movingMinutes } = input;
  if (!isFiniteNumber(hour) || !isFiniteNumber(km) || !isFiniteNumber(gross)
    || !isFiniteNumber(fuelCost) || !isFiniteNumber(net) || !isFiniteNumber(movingMinutes)
    || !Number.isInteger(hour) || hour < 0 || hour > 23
    || km < 0 || gross < 0 || fuelCost < 0
    || movingMinutes < 0 || movingMinutes > 60) return null;
  return {
    hour,
    km: Number(km.toFixed(2)),
    gross: Number(gross.toFixed(2)),
    fuelCost: Number(fuelCost.toFixed(2)),
    net: Number(net.toFixed(2)),
    movingMinutes: Number(movingMinutes.toFixed(2)),
  };
}

export function normalizeEarningRecord(value: unknown): EarningRecord | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<EarningRecord>;
  if (typeof input.id !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(input.id)) return null;
  if (typeof input.date !== 'string' || !isValidDate(input.date)) return null;
  if (input.platform !== undefined && !validPlatforms.includes(input.platform as PlatformType)) return null;
  if (typeof input.startTime !== 'string' || typeof input.endTime !== 'string' || !isValidTime(input.startTime) || !isValidTime(input.endTime)) return null;
  if (input.trips !== undefined && !Array.isArray(input.trips)) return null;
  if (input.hourlySegments !== undefined && !Array.isArray(input.hourlySegments)) return null;
  if (input.fuelExpenses !== undefined && !Array.isArray(input.fuelExpenses)) return null;
  if (input.notes !== undefined && typeof input.notes !== 'string') return null;
  if (input.createdAt !== undefined && typeof input.createdAt !== 'string') return null;
  if (input.updatedAt !== undefined && typeof input.updatedAt !== 'string') return null;

  const numeric = {
    totalHours: readBoundedNonNegative(input.totalHours, 100),
    passengerHours: readBoundedNonNegative(input.passengerHours, 100),
    passengerDistanceKm: readBoundedNonNegative(input.passengerDistanceKm, 100000),
    emptyDistanceKm: readBoundedNonNegative(input.emptyDistanceKm, 100000),
    occupancyRatePct: readBoundedNonNegative(input.occupancyRatePct, 100),
    grossEarnings: readBoundedNonNegative(input.grossEarnings, 1000000),
    tips: readBoundedNonNegative(input.tips, 1000000),
    bonuses: readBoundedNonNegative(input.bonuses, 1000000),
    tollsReimbursed: readBoundedNonNegative(input.tollsReimbursed, 1000000),
    distanceKm: readBoundedNonNegative(input.distanceKm, 100000),
    tripsCount: readBoundedNonNegative(input.tripsCount, 10000),
    fuelCost: readBoundedNonNegative(input.fuelCost, 1000000),
    commissionCost: readBoundedNonNegative(input.commissionCost, 1000000),
    commissionPct: readBoundedNonNegative(input.commissionPct, 100),
    taxCost: readBoundedNonNegative(input.taxCost, 1000000),
    taxPct: readBoundedNonNegative(input.taxPct, 100),
    otherExpenses: readBoundedNonNegative(input.otherExpenses, 1000000),
  };
  if (Object.values(numeric).some((item) => item === null)
    || (numeric.commissionPct as number) > 100
    || (numeric.taxPct as number) > 100) return null;

  const fuelExpenses = input.fuelExpenses
    ? input.fuelExpenses.map(normalizeFuelExpense)
    : [];
  if (fuelExpenses.some((item) => item === null)) return null;
  const trips = input.trips ? input.trips.map(normalizeTrip) : [];
  if (trips.some((item) => item === null)) return null;
  const hourlySegments = input.hourlySegments ? input.hourlySegments.map(normalizeHourlySegment) : [];
  if (hourlySegments.some((item) => item === null)) return null;
  const totalHours = numeric.totalHours as number;
  const passengerHours = Math.min(totalHours, numeric.passengerHours as number);
  const sumTripsDistance = (trips as TripDetail[]).reduce((acc, t) => acc + (t.distanceKm || 0), 0);
  const sumTripsGross = (trips as TripDetail[]).reduce((acc, t) => acc + (t.estimatedEarnings || 0), 0);
  const rawDistanceKm = numeric.distanceKm as number;
  const distanceKm = Math.max(rawDistanceKm, sumTripsDistance);
  const passengerDistanceKm = sumTripsDistance > 0
    ? Math.max(numeric.passengerDistanceKm as number, sumTripsDistance)
    : Math.min(distanceKm, numeric.passengerDistanceKm as number);
  const emptyDistanceKm = Math.max(0, distanceKm - passengerDistanceKm);
  const grossEarnings = sumTripsGross > 0
    ? Math.max(numeric.grossEarnings as number, sumTripsGross)
    : (numeric.grossEarnings as number);
  const structuredFuelTotal = (fuelExpenses as FuelExpense[]).reduce((total, expense) => total + expense.amount, 0);
  const fuelCost = Number(Math.max(numeric.fuelCost as number, structuredFuelTotal).toFixed(2));
  const commissionPct = input.commissionPct !== undefined
    ? Number((numeric.commissionPct as number).toFixed(2))
    : undefined;
  const taxPct = input.taxPct !== undefined
    ? Number((numeric.taxPct as number).toFixed(2))
    : undefined;
  const commissionCost = commissionPct === undefined
    ? Number((numeric.commissionCost as number).toFixed(2))
    : Number((grossEarnings * commissionPct / 100).toFixed(2));
  const taxCost = taxPct === undefined
    ? Number((numeric.taxCost as number).toFixed(2))
    : Number((grossEarnings * taxPct / 100).toFixed(2));
  const occupancyRatePct = numeric.occupancyRatePct !== 0 || input.occupancyRatePct !== undefined
    ? Math.min(100, Math.round(numeric.occupancyRatePct as number))
    : totalHours > 0 ? Math.round((passengerHours / totalHours) * 100) : 0;
  const notes = typeof input.notes === 'string' && input.notes.trim() ? input.notes.trim().slice(0, 2000) : undefined;
  const record: EarningRecord = {
    id: input.id,
    platform: input.platform as PlatformType || 'other',
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    totalHours: Number(totalHours.toFixed(2)),
    passengerHours: Number(passengerHours.toFixed(2)),
    passengerDistanceKm: Number(passengerDistanceKm.toFixed(2)),
    emptyDistanceKm: Number(emptyDistanceKm.toFixed(2)),
    occupancyRatePct,
    grossEarnings: Number(grossEarnings.toFixed(2)),
    tips: Number((numeric.tips as number).toFixed(2)),
    bonuses: Number((numeric.bonuses as number).toFixed(2)),
    tollsReimbursed: Number((numeric.tollsReimbursed as number).toFixed(2)),
    distanceKm: Number(distanceKm.toFixed(2)),
    tripsCount: trips.length > 0 ? trips.length : Math.floor(numeric.tripsCount as number),
    trips: trips as TripDetail[],
    fuelCost,
    fuelExpenses: fuelExpenses as FuelExpense[],
    commissionCost,
    otherExpenses: Number((numeric.otherExpenses as number).toFixed(2)),
    taxCost,
    netEarnings: 0,
    hourlySegments: hourlySegments as HourlySegment[],
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : new Date().toISOString(),
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : new Date().toISOString(),
  };
  if (commissionPct !== undefined) record.commissionPct = commissionPct;
  if (taxPct !== undefined) record.taxPct = taxPct;
  if (notes) record.notes = notes;
  record.netEarnings = calculateNetEarnings(
    record.grossEarnings,
    record.tips,
    record.bonuses,
    record.fuelCost,
    record.commissionCost,
    record.otherExpenses,
    record.tollsReimbursed,
    record.taxCost
  );
  return record;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

const MAX_LOCAL_CACHE_RECORDS = 200;
const MAX_LOCAL_CACHE_PATH_POINTS = 40;

function compactLocalPath(path: LocationPoint[] | undefined): LocationPoint[] {
  const points = path || [];
  if (points.length <= MAX_LOCAL_CACHE_PATH_POINTS) return points;
  return [points[0], ...points.slice(-(MAX_LOCAL_CACHE_PATH_POINTS - 1))];
}

function compactRecordsForLocalCache(records: EarningRecord[]): EarningRecord[] {
  return records.slice(0, MAX_LOCAL_CACHE_RECORDS).map((record) => ({
    ...record,
    trips: (record.trips || []).slice(-50).map((trip) => ({
      ...trip,
      pathHistory: compactLocalPath(trip.pathHistory),
      encodedPath: undefined,
    })),
  }));
}

function normalizeSettings(value: unknown): UserSettings {
  const input = value && typeof value === 'object' ? value as Partial<UserSettings> : {};
  const energyInput = input.vehicleEnergy && typeof input.vehicleEnergy === 'object'
    ? input.vehicleEnergy as Partial<UserSettings['vehicleEnergy']>
    : {} as Partial<UserSettings['vehicleEnergy']>;
  const vehicleType = energyInput.vehicleType === 'electric'
    || energyInput.vehicleType === 'hybrid'
    || energyInput.vehicleType === 'diesel'
    || energyInput.vehicleType === 'petrol'
    || energyInput.vehicleType === 'lpg'
    ? energyInput.vehicleType
    : DEFAULT_SETTINGS.vehicleEnergy.vehicleType;
  const consumption = isFiniteNumber(energyInput.consumptionPer100Km) && energyInput.consumptionPer100Km > 0
    ? energyInput.consumptionPer100Km
    : DEFAULT_SETTINGS.vehicleEnergy.consumptionPer100Km;
  const fuelPrice = isFiniteNumber(energyInput.fuelPricePerUnit) && energyInput.fuelPricePerUnit > 0
    ? energyInput.fuelPricePerUnit
    : DEFAULT_SETTINGS.vehicleEnergy.fuelPricePerUnit;
  const configuredCost = isFiniteNumber(energyInput.costPerKm) && energyInput.costPerKm > 0
    ? energyInput.costPerKm
    : calculateCostPerKm(consumption, fuelPrice);
  const enabledPlatforms: PlatformType[] = Array.isArray(input.enabledPlatforms)
    ? input.enabledPlatforms.filter((platform): platform is PlatformType => validPlatforms.includes(platform as PlatformType))
    : [...(DEFAULT_SETTINGS.enabledPlatforms || [])];
  const defaultPlatform: UserSettings['defaultPlatform'] = input.defaultPlatform === 'all' || validPlatforms.includes(input.defaultPlatform as PlatformType)
    ? input.defaultPlatform as UserSettings['defaultPlatform']
    : DEFAULT_SETTINGS.defaultPlatform;

  return {
    dailyGoal: isFiniteNumber(input.dailyGoal) && input.dailyGoal >= 0 ? input.dailyGoal : DEFAULT_SETTINGS.dailyGoal,
    weeklyGoal: isFiniteNumber(input.weeklyGoal) && input.weeklyGoal >= 0 ? input.weeklyGoal : DEFAULT_SETTINGS.weeklyGoal,
    defaultPlatform,
    enabledPlatforms: enabledPlatforms.length > 0 ? [...new Set(enabledPlatforms)] : [...(DEFAULT_SETTINGS.enabledPlatforms || [])],
    fallbackHourlyRate: isFiniteNumber(input.fallbackHourlyRate) && input.fallbackHourlyRate >= 0 ? input.fallbackHourlyRate : DEFAULT_SETTINGS.fallbackHourlyRate,
    fallbackKmRate: isFiniteNumber(input.fallbackKmRate) && input.fallbackKmRate >= 0 ? input.fallbackKmRate : DEFAULT_SETTINGS.fallbackKmRate,
    defaultCommissionPct: isFiniteNumber(input.defaultCommissionPct) && input.defaultCommissionPct >= 0
      ? Math.min(100, input.defaultCommissionPct)
      : DEFAULT_SETTINGS.defaultCommissionPct,
    defaultTaxPct: isFiniteNumber(input.defaultTaxPct) && input.defaultTaxPct >= 0
      ? Math.min(100, input.defaultTaxPct)
      : DEFAULT_SETTINGS.defaultTaxPct,
    movementThresholdSpeedKmh: isFiniteNumber(input.movementThresholdSpeedKmh)
      ? Math.min(200, Math.max(0, input.movementThresholdSpeedKmh))
      : DEFAULT_SETTINGS.movementThresholdSpeedKmh,
    soundEnabled: typeof input.soundEnabled === 'boolean' ? input.soundEnabled : DEFAULT_SETTINGS.soundEnabled,
    voiceEnabled: typeof input.voiceEnabled === 'boolean' ? input.voiceEnabled : DEFAULT_SETTINGS.voiceEnabled,
    aircraftSpeedometerEnabled: typeof input.aircraftSpeedometerEnabled === 'boolean'
      ? input.aircraftSpeedometerEnabled
      : DEFAULT_SETTINGS.aircraftSpeedometerEnabled,
    vehicleEnergy: {
      vehicleType,
      vehicleModelName: typeof energyInput.vehicleModelName === 'string' ? energyInput.vehicleModelName.trim().slice(0, 120) : DEFAULT_SETTINGS.vehicleEnergy.vehicleModelName,
      consumptionPer100Km: Number(consumption.toFixed(3)),
      fuelPricePerUnit: Number(fuelPrice.toFixed(3)),
      costPerKm: Number(configuredCost.toFixed(3)),
    },
  };
}

export function useEarningsHistory() {
  const [records, setRecords] = useState<EarningRecord[]>([]);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [activeUserUid, setActiveUserUid] = useState<string | null>(null);
  const [activeUserEmail, setActiveUserEmail] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [syncError, setSyncErrorState] = useState<string | null>(null);
  const syncErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setSyncError = useCallback((err: string | null) => {
    if (syncErrorTimeoutRef.current) clearTimeout(syncErrorTimeoutRef.current);
    setSyncErrorState(err);
    if (err) {
      syncErrorTimeoutRef.current = setTimeout(() => {
        setSyncErrorState(null);
      }, 4000);
    }
  }, []);
  const authGeneration = useRef(0);

  useEffect(() => {
    let unsubscribeRecords: (() => void) | null = null;
    const unsubscribeAuth = subscribeToAuth(async (user) => {
      const generation = ++authGeneration.current;
      unsubscribeRecords?.();
      unsubscribeRecords = null;
      setSyncError(null);

      if (!user) {
        setActiveUserUid(null);
        setActiveUserEmail(null);
        setRecords([]);
        setSettings(normalizeSettings(DEFAULT_SETTINGS));
        setIsAuthLoading(false);
        return;
      }

      const uid = user.uid;
      setActiveUserUid(uid);
      setActiveUserEmail((user.email || '').toLowerCase().trim() || null);
      const cachedRecords = readJson<unknown[]>(userKey(STORAGE_KEY_RECORDS, uid), []);
      setRecords(Array.isArray(cachedRecords)
        ? cachedRecords.map(normalizeEarningRecord).filter((item): item is EarningRecord => item !== null)
        : []);
      setSettings(normalizeSettings(readJson<Partial<UserSettings>>(userKey(STORAGE_KEY_SETTINGS, uid), {})));
      setIsAuthLoading(true);

      try {
        const cloudRecords = await fetchRecordsFromFirebase(uid);
        if (generation !== authGeneration.current) return;
        setRecords(cloudRecords.map(normalizeEarningRecord).filter((item): item is EarningRecord => item !== null));

        const cloudSettings = await fetchSettingsFromFirebase(uid);
        if (generation !== authGeneration.current) return;
        if (cloudSettings) {
          setSettings(normalizeSettings(cloudSettings));
        }

        void subscribeToRecords(uid, (updated) => {
          if (generation === authGeneration.current) {
            setRecords(updated.map(normalizeEarningRecord).filter((item): item is EarningRecord => item !== null));
          }
        }, (error) => {
          if (generation === authGeneration.current) setSyncError(error.message);
        }).then((unsubscribe) => {
          if (generation === authGeneration.current) {
            unsubscribeRecords = unsubscribe;
          } else {
            unsubscribe();
          }
        }).catch((error) => {
          if (generation === authGeneration.current) {
            setSyncError(error instanceof Error ? error.message : 'Não foi possível subscrever o histórico.');
          }
        });
      } catch (error) {
        if (generation === authGeneration.current) {
          setSyncError(error instanceof Error ? error.message : 'Não foi possível carregar os dados.');
        }
      } finally {
        if (generation === authGeneration.current) setIsAuthLoading(false);
      }
    });

    return () => {
      authGeneration.current += 1;
      unsubscribeRecords?.();
      unsubscribeAuth();
    };
  }, []);

  useEffect(() => {
    if (!activeUserUid) return;
    try {
      localStorage.setItem(
        userKey(STORAGE_KEY_RECORDS, activeUserUid),
        JSON.stringify(compactRecordsForLocalCache(records))
      );
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Não foi possível guardar o histórico local.');
    }
  }, [records, activeUserUid]);

  useEffect(() => {
    if (!activeUserUid) return;
    try {
      localStorage.setItem(userKey(STORAGE_KEY_SETTINGS, activeUserUid), JSON.stringify(settings));
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Não foi possível guardar as definições locais.');
    }
  }, [settings, activeUserUid]);

  const persistError = useCallback((error: unknown) => {
    setSyncError(error instanceof Error ? error.message : 'Não foi possível sincronizar com a nuvem.');
  }, []);

  const addRecord = useCallback((newRec: Omit<EarningRecord, 'id' | 'createdAt' | 'updatedAt' | 'netEarnings'>) => {
    if (!activeUserUid) throw new Error('Inicie sessão para guardar um turno.');
    const record = normalizeEarningRecord({
      ...newRec,
      id: createId('rec'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    if (!record) throw new Error('Os dados do turno são inválidos.');
    setRecords((prev) => [record, ...prev]);
    void syncRecordToFirebase(record, activeUserUid).catch(persistError);
    return record;
  }, [activeUserUid, persistError]);

  const addRecords = useCallback((newRecords: Array<Omit<EarningRecord, 'id' | 'createdAt' | 'updatedAt' | 'netEarnings'>>) => {
    if (!activeUserUid) throw new Error('Inicie sessão para guardar um turno.');
    if (newRecords.length === 0) return [] as EarningRecord[];

    const timestamp = new Date().toISOString();
    const normalized = newRecords.map((newRec) => normalizeEarningRecord({
      ...newRec,
      id: createId('rec'),
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    if (normalized.some((record) => record === null)) {
      throw new Error('Os dados de uma ou mais plataformas são inválidos.');
    }

    const recordsToAdd = normalized as EarningRecord[];
    setRecords((prev) => [...recordsToAdd, ...prev]);
    void syncAllRecordsToFirebase(recordsToAdd, activeUserUid).catch(persistError);
    return recordsToAdd;
  }, [activeUserUid, persistError]);

  const updateRecord = useCallback((id: string, updatedFields: Partial<EarningRecord>) => {
    if (!activeUserUid) return;
    const current = records.find((item) => item.id === id);
    if (!current) return;
    const updated = normalizeEarningRecord({ ...current, ...updatedFields, id, updatedAt: new Date().toISOString() });
    if (!updated) {
      setSyncError('Os dados atualizados do turno são inválidos.');
      return;
    }
    setRecords((prev) => prev.map((item) => item.id === id ? updated : item));
    void syncRecordToFirebase(updated, activeUserUid).catch(persistError);
  }, [activeUserUid, records, persistError]);

  const deleteRecord = useCallback((id: string) => {
    if (!activeUserUid) return;
    const previous = records;
    setRecords((prev) => prev.filter((item) => item.id !== id));
    void deleteRecordFromFirebase(id, activeUserUid).catch((error) => {
      setRecords(previous);
      persistError(error);
    });
  }, [activeUserUid, records, persistError]);

  const clearAllRecords = useCallback(async () => {
    if (!activeUserUid) return;
    try {
      await deleteAllRecordsFromFirebase(activeUserUid);
      setRecords([]);
    } catch (error) {
      persistError(error);
    }
  }, [activeUserUid, persistError]);

  const importRecords = useCallback(async (imported: unknown[]) => {
    if (!activeUserUid) throw new Error('Inicie sessão para importar dados.');
    if (!Array.isArray(imported)) throw new Error('O ficheiro não contém uma lista de registos.');
    const normalized = imported.map(normalizeEarningRecord).filter((item): item is EarningRecord => item !== null);
    if (normalized.length !== imported.length || new Set(normalized.map((item) => item.id)).size !== normalized.length) {
      throw new Error('Existem registos inválidos ou duplicados no ficheiro importado.');
    }
    try {
      await replaceAllRecordsInFirebase(normalized, activeUserUid);
      setRecords(normalized);
    } catch (error) {
      persistError(error);
      throw error;
    }
  }, [activeUserUid, persistError]);

  const updateSettings = useCallback((newSettings: Partial<UserSettings>) => {
    if (!activeUserUid) return;
    const updated = normalizeSettings({
      ...settings,
      ...newSettings,
      vehicleEnergy: { ...settings.vehicleEnergy, ...(newSettings.vehicleEnergy || {}) },
    });
    setSettings(updated);
    void syncSettingsToFirebase(updated, activeUserUid)
      .then(() => setSyncError(null))
      .catch(persistError);
  }, [activeUserUid, persistError, settings]);

  const summary: EarningsSummary = useMemo(() => calculateEarningsSummary(records, settings), [records, settings]);

  return {
    records,
    summary,
    settings,
    activeUserUid,
    activeUserEmail,
    isAuthLoading,
    syncError,
    addRecord,
    addRecords,
    updateRecord,
    deleteRecord,
    clearAllRecords,
    importRecords,
    updateSettings,
  };
}
