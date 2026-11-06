import { useState, useEffect, useRef, useCallback } from 'react';
import { PendingRouteGap, ShiftSession, LocationPoint, TrackingMode, TripDetail } from '../types/session';
import { Coordinates } from '../types/location';
import { EarningsSummary, FuelExpense, FuelExpenseUnit, PlatformType, UserSettings } from '../types/earnings';
import { DEFAULT_PORTUGAL_COORDS, calculateHaversineDistance } from '../utils/geoUtils';
import { encodePolyline, decodePolyline } from '../utils/polylineEncoder';
import { calculateActiveTripMetrics, getEffectiveVehicleCostPerKm } from '../utils/calculations';
import {
  saveSessionToIndexedDb,
  getSessionFromIndexedDb,
  clearSessionFromIndexedDb,
  appendGpsBreadcrumb,
} from '../services/indexedDbSession';
import {
  clearActiveShiftFromFirebase,
  subscribeToActiveShift,
  syncActiveShiftToFirebase,
  getDeviceId,
} from '../services/firebase';
import { getStreetDrivingRoute, enrichTripWithStreetRoute, getPathDistanceKm, getTripResolvedPath } from '../services/routeService';
import type { FinishedShiftData } from '../utils/platformShiftRecords';

const ACTIVE_SHIFT_STORAGE_KEY = 'driverwise_active_shift_state_v2';
const PLATFORM_VALUES: PlatformType[] = ['uber', 'bolt', 'freenow', 'other'];

const isPlatform = (value: unknown): value is PlatformType =>
  typeof value === 'string' && PLATFORM_VALUES.includes(value as PlatformType);

const finiteOr = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export const normalizeLocationPoint = (value: unknown): LocationPoint | null => {
  if (!value || typeof value !== 'object') return null;
  const point = value as Record<string, unknown>;
  const lat = finiteOr(point.lat, NaN);
  const lng = finiteOr(point.lng, NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return {
    lat,
    lng,
    speedKmh: Math.max(0, Math.min(240, finiteOr(point.speedKmh))),
    heading: ((finiteOr(point.heading) % 360) + 360) % 360,
    timestamp: finiteOr(point.timestamp, Date.now()),
    hasPassenger: typeof point.hasPassenger === 'boolean' ? point.hasPassenger : undefined,
  };
};

export const normalizeTripDetail = (value: unknown): TripDetail | null => {
  if (!value || typeof value !== 'object') return null;
  const trip = value as Record<string, unknown>;
  const id = typeof trip.id === 'string' && trip.id.trim().length > 0 ? trip.id : null;
  if (!id) return null;
  const rawPath = Array.isArray(trip.pathHistory) ? trip.pathHistory : [];
  let pathHistory = rawPath.map(normalizeLocationPoint).filter((p): p is LocationPoint => p !== null);
  if (pathHistory.length === 0 && typeof trip.encodedPath === 'string' && trip.encodedPath.trim().length > 0) {
    const decoded = decodePolyline(trip.encodedPath);
    pathHistory = decoded.map(([lat, lng], idx) => ({
      lat,
      lng,
      speedKmh: 40,
      heading: 0,
      timestamp: Date.now() + idx * 1000,
      hasPassenger: true,
    }));
  }

  const pathDist = getPathDistanceKm(pathHistory);
  const rawDist = finiteOr(trip.distanceKm, 0);
  // Se a rota registada tiver quilómetros reais muito superiores ao odómetro provisório (ex: 10 km vs 0.2 km), usar a distância real da rota
  const effectiveDistance = pathDist >= 0.3 && (rawDist <= 0.25 || rawDist < 0.7 * pathDist)
    ? pathDist
    : Math.max(rawDist, pathDist > 0.05 ? pathDist : 0);

  const safeDistance = Math.min(100000, Math.max(0, effectiveDistance));
  const safeGross = Math.min(1000000, Math.max(0, finiteOr(trip.estimatedEarnings, 0)));
  const safeFuel = typeof trip.fuelCost === 'number' && Number.isFinite(trip.fuelCost)
    ? Math.min(1000000, Math.max(0, trip.fuelCost))
    : undefined;
  const safeNet = typeof trip.netEarnings === 'number' && Number.isFinite(trip.netEarnings)
    ? Math.max(-1000000, Math.min(1000000, trip.netEarnings))
    : undefined;

  const encodedPath = typeof trip.encodedPath === 'string' && trip.encodedPath.length > 0
    ? trip.encodedPath
    : (pathHistory.length > 0 ? encodePolyline(pathHistory) : undefined);

  return {
    id,
    platform: isPlatform(trip.platform) ? trip.platform : 'other',
    startTime: typeof trip.startTime === 'string' ? trip.startTime : '00:00',
    endTime: typeof trip.endTime === 'string' ? trip.endTime : '00:00',
    durationSeconds: Math.min(172800, Math.max(0, Math.floor(finiteOr(trip.durationSeconds, 0)))),
    distanceKm: Number(safeDistance.toFixed(2)),
    estimatedEarnings: Number(safeGross.toFixed(2)),
    fuelCost: safeFuel !== undefined ? Number(safeFuel.toFixed(2)) : undefined,
    netEarnings: safeNet !== undefined ? Number(safeNet.toFixed(2)) : undefined,
    encodedPath,
    pathHistory,
  };
};

export const normalizeFuelExpense = (value: unknown): FuelExpense | null => {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const id = typeof item.id === 'string' && item.id.trim().length > 0 ? item.id : null;
  const amount = finiteOr(item.amount, NaN);
  if (!id || !Number.isFinite(amount) || amount <= 0) return null;
  const validUnits: FuelExpenseUnit[] = ['liters', 'kwh', 'unit'];
  const unit = typeof item.unit === 'string' && validUnits.includes(item.unit as FuelExpenseUnit)
    ? (item.unit as FuelExpenseUnit)
    : undefined;
  return {
    id,
    amount: Number(amount.toFixed(2)),
    quantity: typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0
      ? Number(item.quantity.toFixed(2))
      : undefined,
    unit,
    notes: typeof item.notes === 'string' ? item.notes.trim().slice(0, 240) : undefined,
    createdAt: typeof item.createdAt === 'string' && item.createdAt.trim().length > 0
      ? item.createdAt
      : new Date().toISOString(),
  };
};

export const normalizePendingRouteGap = (value: unknown): PendingRouteGap | null => {
  if (!value || typeof value !== 'object') return null;
  const gap = value as Record<string, unknown>;
  const id = typeof gap.id === 'string' && gap.id.trim().length > 0 ? gap.id : null;
  const start = normalizeLocationPoint(gap.start);
  const end = normalizeLocationPoint(gap.end);
  const startedAt = finiteOr(gap.startedAt, NaN);
  const endedAt = finiteOr(gap.endedAt, NaN);
  if (!id || !start || !end || !Number.isFinite(startedAt) || !Number.isFinite(endedAt) || startedAt > endedAt) return null;
  return {
    id,
    start: { lat: start.lat, lng: start.lng },
    end: { lat: end.lat, lng: end.lng },
    startedAt,
    endedAt,
    hasPassenger: Boolean(gap.hasPassenger),
    platform: isPlatform(gap.platform) ? gap.platform : null,
    tripId: typeof gap.tripId === 'string' && gap.tripId.trim().length > 0 ? gap.tripId : undefined,
  };
};

export const normalizeSessionState = (raw: Record<string, unknown>): ShiftSession => {
  const rawTrips = Array.isArray(raw.trips) ? raw.trips : [];
  const trips = rawTrips.map(normalizeTripDetail).filter((trip): trip is TripDetail => trip !== null);
  const rawFuelExpenses = Array.isArray(raw.fuelExpenses) ? raw.fuelExpenses : [];
  const fuelExpenses = rawFuelExpenses.map(normalizeFuelExpense).filter((expense): expense is FuelExpense => expense !== null);
  const pendingRouteGaps = Array.isArray(raw.pendingRouteGaps)
    ? raw.pendingRouteGaps.map(normalizePendingRouteGap).filter((gap): gap is PendingRouteGap => gap !== null)
    : [];

  const rawPathHistory = Array.isArray(raw.pathHistory) ? raw.pathHistory : [];
  const pathHistory = rawPathHistory.map(normalizeLocationPoint).filter((p): p is LocationPoint => p !== null);
  const rawCurrentTripPath = Array.isArray(raw.currentTripPath) ? raw.currentTripPath : [];
  const currentTripPath = rawCurrentTripPath.map(normalizeLocationPoint).filter((p): p is LocationPoint => p !== null);

  const rawPosition = raw.currentPosition && typeof raw.currentPosition === 'object'
    ? raw.currentPosition as Record<string, unknown>
    : {};
  const currentPosition = {
    lat: finiteOr(rawPosition.lat, DEFAULT_PORTUGAL_COORDS.lat),
    lng: finiteOr(rawPosition.lng, DEFAULT_PORTUGAL_COORDS.lng),
    heading: ((finiteOr(rawPosition.heading, 0) % 360) + 360) % 360,
    accuracy: Math.min(10000, Math.max(0, finiteOr(rawPosition.accuracy, 5))),
  };

  const rawCounts = raw.platformTripsCount && typeof raw.platformTripsCount === 'object'
    ? raw.platformTripsCount as Record<string, unknown>
    : {};
  const platformTripsCount: Partial<Record<PlatformType, number>> = {
    uber: Math.max(0, Math.floor(finiteOr(rawCounts.uber, 0))),
    bolt: Math.max(0, Math.floor(finiteOr(rawCounts.bolt, 0))),
    freenow: Math.max(0, Math.floor(finiteOr(rawCounts.freenow, 0))),
    other: Math.max(0, Math.floor(finiteOr(rawCounts.other, 0))),
  };

  const stateVal = raw.state === 'active' || raw.state === 'paused' ? raw.state : 'idle';
  const trackingModeVal = raw.trackingMode === 'joystick' ? 'joystick' : 'real_gps';
  const platformVal = raw.platform === 'all' || isPlatform(raw.platform) ? raw.platform : 'all';
  const currentTripPlatformVal = isPlatform(raw.currentTripPlatform) ? raw.currentTripPlatform : null;

  return {
    id: typeof raw.id === 'string' && raw.id.trim().length > 0 ? raw.id : ('session-' + Date.now()),
    originDeviceId: typeof raw.originDeviceId === 'string' && raw.originDeviceId.trim().length > 0 ? raw.originDeviceId : undefined,
    revision: Math.max(0, Math.floor(finiteOr(raw.revision, 0))),
    state: stateVal,
    drivingStatus: raw.drivingStatus === 'moving' ? 'moving' : 'stopped',
    hasPassenger: Boolean(raw.hasPassenger),
    currentTripPlatform: currentTripPlatformVal,
    platformTripsCount,
    trackingMode: trackingModeVal,
    platform: platformVal,
    startTime: typeof raw.startTime === 'number' && Number.isFinite(raw.startTime) ? raw.startTime : null,
    activeDurationSeconds: Math.max(0, Math.floor(finiteOr(raw.activeDurationSeconds, 0))),
    passengerDurationSeconds: Math.max(0, Math.floor(finiteOr(raw.passengerDurationSeconds, 0))),
    emptyDurationSeconds: Math.max(0, Math.floor(finiteOr(raw.emptyDurationSeconds, 0))),
    movingDurationSeconds: Math.max(0, Math.floor(finiteOr(raw.movingDurationSeconds, 0))),
    totalDistanceKm: Math.max(0, Number(finiteOr(raw.totalDistanceKm, 0).toFixed(4))),
    passengerDistanceKm: Math.max(0, Number(finiteOr(raw.passengerDistanceKm, 0).toFixed(4))),
    emptyDistanceKm: Math.max(0, Number(finiteOr(raw.emptyDistanceKm, 0).toFixed(4))),
    tripsCompletedCount: Math.max(0, Math.floor(finiteOr(raw.tripsCompletedCount, trips.length))),
    currentSpeedKmh: Math.max(0, Math.min(240, finiteOr(raw.currentSpeedKmh, 0))),
    currentPosition,
    pathHistory,
    currentTripPath,
    currentTripStartedAt: Math.max(0, Math.floor(finiteOr(raw.currentTripStartedAt, 0))),
    currentTripStartDistanceKm: Math.max(0, Number(finiteOr(raw.currentTripStartDistanceKm, 0).toFixed(4))),
    currentTripStartEarnings: Math.max(0, Number(finiteOr(raw.currentTripStartEarnings, 0).toFixed(4))),
    currentTripDurationSeconds: Math.max(0, Math.floor(finiteOr(raw.currentTripDurationSeconds, 0))),
    trips,
    pendingRouteGaps,
    estimatedEarnings: Math.max(0, Number(finiteOr(raw.estimatedEarnings, 0).toFixed(4))),
    estimatedFuelCost: Math.max(0, Number(finiteOr(raw.estimatedFuelCost, 0).toFixed(2))),
    fuelExpenses,
    estimatedNetEarnings: Number(finiteOr(raw.estimatedNetEarnings, 0).toFixed(2)),
    effectiveHourlyRate: Math.max(0, Number(finiteOr(raw.effectiveHourlyRate, 0).toFixed(2))),
  };
};

export const normalizePersistedShiftSession = (raw: Record<string, unknown>): ShiftSession | null => {
  if (!raw || (raw.state !== 'active' && raw.state !== 'paused')) return null;
  return normalizeSessionState(raw);
};

const getSessionStorageKey = (userId?: string | null): string | null => {
  if (typeof userId === 'string' && userId.trim().length > 0) {
    return `${ACTIVE_SHIFT_STORAGE_KEY}_${userId.trim()}`;
  }
  return null;
};

const INITIAL_SESSION: ShiftSession = {
  id: 'session-init',
  state: 'idle',
  drivingStatus: 'stopped',
  hasPassenger: false,
  trackingMode: 'real_gps',
  platform: 'all',
  startTime: null,
  activeDurationSeconds: 0,
  passengerDurationSeconds: 0,
  emptyDurationSeconds: 0,
  movingDurationSeconds: 0,
  totalDistanceKm: 0,
  passengerDistanceKm: 0,
  emptyDistanceKm: 0,
  tripsCompletedCount: 0,
  currentSpeedKmh: 0,
  currentPosition: {
    lat: DEFAULT_PORTUGAL_COORDS.lat,
    lng: DEFAULT_PORTUGAL_COORDS.lng,
    heading: 0,
    accuracy: 5,
  },
  pathHistory: [],
  currentTripPath: [],
  currentTripStartedAt: 0,
  currentTripStartDistanceKm: 0,
  currentTripStartEarnings: 0,
  currentTripDurationSeconds: 0,
  trips: [],
  pendingRouteGaps: [],
  estimatedEarnings: 0,
  estimatedFuelCost: 0,
  fuelExpenses: [],
  estimatedNetEarnings: 0,
  effectiveHourlyRate: 0,
};

const resetToIdle = (prev: ShiftSession): ShiftSession => ({
  ...INITIAL_SESSION,
  id: 'session-' + Date.now(),
  trackingMode: prev.trackingMode,
  platform: prev.platform,
  currentPosition: prev.currentPosition,
});

const fuelExpensesTotal = (expenses: FuelExpense[] | undefined) =>
  Number((expenses || []).reduce((acc, e) => acc + (Number.isFinite(e.amount) ? e.amount : 0), 0).toFixed(2));

const createLocalId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const appendAnchoredPathPoint = (currentPath: LocationPoint[], newPoint: LocationPoint): LocationPoint[] => {
  const lastPoint = currentPath[currentPath.length - 1];
  if (!lastPoint) return [newPoint];
  const distanceKm = calculateHaversineDistance(lastPoint, newPoint);
  if (distanceKm < 0.005) return currentPath;
  return [...currentPath.slice(-199), newPoint];
};

const insertRouteAfterAnchor = (
  path: LocationPoint[],
  anchor: { lat: number; lng: number },
  routePath: LocationPoint[]
): LocationPoint[] => {
  if (routePath.length === 0) return path;
  if (path.length === 0) return routePath;
  let bestIndex = -1;
  let minDistance = Infinity;
  for (let i = 0; i < path.length; i += 1) {
    const d = calculateHaversineDistance(path[i], anchor);
    if (d < minDistance) {
      minDistance = d;
      bestIndex = i;
    }
  }
  if (bestIndex === -1 || minDistance > 0.35) {
    return [...path.slice(-100), ...routePath].slice(-250);
  }
  return [...path.slice(0, bestIndex + 1), ...routePath, ...path.slice(bestIndex + 1)].slice(-250);
};

const MAX_GAP_ROUTE_DISTANCE_KM = 350;

interface UseShiftEarningsCalculatorOptions {
  userId?: string | null;
  summary: EarningsSummary;
  settings: UserSettings;
  onFinishShift?: (shiftData: FinishedShiftData) => void;
}

export function useShiftEarningsCalculator({
  userId,
  summary,
  settings,
  onFinishShift,
}: UseShiftEarningsCalculatorOptions) {
  const currentDeviceId = getDeviceId();
  const sessionOwnerUidRef = useRef<string | null>(userId || null);
  const [session, setSession] = useState<ShiftSession>(() => {
    const storageKey = getSessionStorageKey(userId);
    if (storageKey && typeof window !== 'undefined') {
      try {
        const local = localStorage.getItem(storageKey);
        if (local) {
          const parsed = JSON.parse(local);
          if (parsed && typeof parsed.session === 'object') {
            return normalizeSessionState(parsed.session);
          }
        }
      } catch {
        // ignore
      }
    }
    return INITIAL_SESSION;
  });

  const isSessionOwnerDevice = !session.originDeviceId || session.originDeviceId === currentDeviceId;
  const gapPositionRef = useRef<Coordinates | null>(null);
  const gapPositionSavedAtRef = useRef<number>(0);
  const routeRecoveryInFlightRef = useRef<Set<string>>(new Set());

  // Carregar sessão offline inicial do IndexedDB
  useEffect(() => {
    let isMounted = true;
    if (!userId) return;
    void (async () => {
      try {
        const idbRecord = await getSessionFromIndexedDb(userId);
        if (isMounted && idbRecord && idbRecord.session && idbRecord.session.state !== 'idle') {
          setSession((prev) => {
            if (prev.state === 'idle' || (idbRecord.session.revision || 0) > (prev.revision || 0)) {
              return normalizeSessionState(idbRecord.session as unknown as Record<string, unknown>);
            }
            return prev;
          });
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [userId]);

  useEffect(() => {
    if (session.state === 'idle') {
      sessionOwnerUidRef.current = userId || null;
    }
  }, [session.state, userId]);

  // Estado de Deteção de Paragem no Destino
  const [isArrivalAlertOpen, setIsArrivalAlertOpen] = useState<boolean>(false);
  const currentTripSecondsRef = useRef<number>(0);
  const standstillCounterRef = useRef<number>(0);
  const snoozeArrivalUntilRef = useRef<number>(0);

  // Rastreamento da Viagem Individual Ativa (Rota, Horários e Distância)
  const currentTripStartTimeRef = useRef<number | null>(null);
  const currentTripStartDistRef = useRef<number>(0);
  const currentTripStartEarningsRef = useRef<number>(0);
  const currentTripPathRef = useRef<LocationPoint[]>([]);
  const pendingFinishShiftRef = useRef(false);

  const sessionRef = useRef(session);
  sessionRef.current = session;

  const [remoteSyncError, setRemoteSyncErrorState] = useState<string | null>(null);
  const syncErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setRemoteSyncError = useCallback((err: string | null) => {
    if (syncErrorTimeoutRef.current) clearTimeout(syncErrorTimeoutRef.current);
    setRemoteSyncErrorState(err);
    if (err) {
      syncErrorTimeoutRef.current = setTimeout(() => {
        setRemoteSyncErrorState(null);
      }, 4000);
    }
  }, []);

  const remoteReadyRef = useRef(false);
  const remoteUserIdRef = useRef<string | null>(userId || null);
  const remoteSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteSavePendingRef = useRef<{ session: ShiftSession; userId: string; fingerprint: string } | null>(null);
  const lastRemoteFingerprintRef = useRef<string | null>(null);

  if (remoteUserIdRef.current !== (userId || null)) {
    remoteUserIdRef.current = userId || null;
    remoteReadyRef.current = false;
    lastRemoteFingerprintRef.current = null;
    if (remoteSaveTimerRef.current) {
      clearTimeout(remoteSaveTimerRef.current);
      remoteSaveTimerRef.current = null;
    }
    remoteSavePendingRef.current = null;
  }

  const sessionFingerprint = (value: ShiftSession) => JSON.stringify({
    state: value.state,
    originDeviceId: value.originDeviceId || null,
    activeDurationSeconds: Math.floor(value.activeDurationSeconds / 5),
    passengerDurationSeconds: Math.floor(value.passengerDurationSeconds / 5),
    currentTripDurationSeconds: Math.floor(value.currentTripDurationSeconds / 5),
    totalDistanceKm: Number(value.totalDistanceKm.toFixed(3)),
    passengerDistanceKm: Number(value.passengerDistanceKm.toFixed(3)),
    emptyDistanceKm: Number(value.emptyDistanceKm.toFixed(3)),
    tripsCompletedCount: value.tripsCompletedCount,
    hasPassenger: value.hasPassenger,
    currentTripPlatform: value.currentTripPlatform || null,
    platform: value.platform,
    platformTripsCount: value.platformTripsCount || {},
    estimatedEarnings: Number(value.estimatedEarnings.toFixed(3)),
    estimatedFuelCost: Number(value.estimatedFuelCost.toFixed(3)),
    estimatedNetEarnings: Number(value.estimatedNetEarnings.toFixed(3)),
    fuelExpenses: (value.fuelExpenses || []).map((expense) => `${expense.id}:${expense.amount}`).join(','),
    trips: (value.trips || []).map((trip) => `${trip.id}:${trip.platform}:${trip.distanceKm}:${trip.durationSeconds}:${trip.estimatedEarnings}`).join(','),
    pendingRouteGaps: (value.pendingRouteGaps || []).map((gap) => gap.id).join(','),
  });

  // Resolve uma interrupção ou viagem apenas com a rota real pelas ruas via OSRM.
  const resolvePendingRouteGap = useCallback(
    (gap: PendingRouteGap) => {
      if (routeRecoveryInFlightRef.current.has(gap.id)) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

      const isFullTripGap = gap.id.startsWith('trip-route-gap-');
      routeRecoveryInFlightRef.current.add(gap.id);

      void getStreetDrivingRoute(gap.start, gap.end, [], gap.hasPassenger)
        .then((routeResult) => {
          if (!routeResult || !Number.isFinite(routeResult.distanceKm) || routeResult.distanceKm < 0 || routeResult.path.length < 2) return;

          // Para intervalos parciais, limitar por velocidade máxima plausível; para viagens completas, a rota confirmada do OSRM é a verdade
          if (!isFullTripGap) {
            const gapElapsedSeconds = Math.max(1, Math.floor((gap.endedAt - gap.startedAt) / 1000));
            const maxPlausibleRouteDistanceKm = Math.min(
              MAX_GAP_ROUTE_DISTANCE_KM,
              Math.max(1, gapElapsedSeconds * (180 / 3600) * 1.5)
            );
            if (routeResult.distanceKm > maxPlausibleRouteDistanceKm) return;
          }

          const routeDistanceKm = Number(routeResult.distanceKm.toFixed(2));

          setSession((prev) => {
            const pendingGap = (prev.pendingRouteGaps || []).find((candidate) => candidate.id === gap.id);
            if (!pendingGap || prev.state === 'idle') return prev;

            const targetPlatform = pendingGap.platform || (prev.currentTripPlatform || (prev.platform !== 'all' ? prev.platform : 'other'));
            const targetKmRate = summary.platformBreakdown[targetPlatform]?.avgKmRate > 0
              ? summary.platformBreakdown[targetPlatform].avgKmRate
              : summary.avgKmRate || settings.fallbackKmRate;
            const gapSeconds = Math.max(0, Math.floor((pendingGap.endedAt - pendingGap.startedAt) / 1000));
            const targetHourlyRate = summary.avgHourlyGross || settings.fallbackHourlyRate;

            const targetTrip = (prev.trips || []).find((t) => t.id === pendingGap.tripId);
            const previousTripDistance = isFullTripGap && targetTrip ? targetTrip.distanceKm : 0;
            const deltaDistance = isFullTripGap ? Math.max(0, routeDistanceKm - previousTripDistance) : routeDistanceKm;

            const earningIncrement = pendingGap.hasPassenger
              ? targetKmRate * deltaDistance * 0.55 + (gapSeconds / 3600) * targetHourlyRate * 0.45
              : 0;

            const nextTrips = pendingGap.tripId
              ? (prev.trips || []).map((trip) => {
                  if (trip.id !== pendingGap.tripId) return trip;
                  const tripDistance = isFullTripGap ? routeDistanceKm : Number((trip.distanceKm + routeDistanceKm).toFixed(2));
                  const tripDurationHours = Math.max(0, trip.durationSeconds) / 3600;
                  const tripGross = Number((tripDistance * targetKmRate * 0.55 + tripDurationHours * targetHourlyRate * 0.45).toFixed(2));
                  const tripFuel = Number((tripDistance * getEffectiveVehicleCostPerKm(settings)).toFixed(2));
                  const fullRoutePath = isFullTripGap ? routeResult.path : insertRouteAfterAnchor(trip.pathHistory || [], pendingGap.start, routeResult.path);
                  return {
                    ...trip,
                    distanceKm: tripDistance,
                    estimatedEarnings: tripGross,
                    fuelCost: tripFuel,
                    netEarnings: Number((tripGross - tripFuel).toFixed(2)),
                    pathHistory: fullRoutePath,
                    encodedPath: encodePolyline(fullRoutePath),
                  };
                })
              : prev.trips;

            const sumTripsGross = nextTrips && nextTrips.length > 0
              ? Number(nextTrips.reduce((acc, t) => acc + (t.estimatedEarnings || 0), 0).toFixed(2))
              : Number((prev.estimatedEarnings + earningIncrement).toFixed(2));

            const nextTotalDistance = Number((prev.totalDistanceKm + deltaDistance).toFixed(4));
            const nextPassengerDistance = pendingGap.hasPassenger
              ? Number((prev.passengerDistanceKm + deltaDistance).toFixed(4))
              : prev.passengerDistanceKm;
            const nextEmptyDistance = !pendingGap.hasPassenger
              ? Number((prev.emptyDistanceKm + deltaDistance).toFixed(4))
              : prev.emptyDistanceKm;
            const fuelCost = Number((nextTotalDistance * getEffectiveVehicleCostPerKm(settings) + fuelExpensesTotal(prev.fuelExpenses)).toFixed(2));

            const nextPathHistory = insertRouteAfterAnchor(prev.pathHistory || [], pendingGap.start, routeResult.path);
            const nextTripPath = pendingGap.hasPassenger && !pendingGap.tripId && prev.hasPassenger
              ? insertRouteAfterAnchor(prev.currentTripPath || [], pendingGap.start, routeResult.path)
              : prev.currentTripPath;

            if (pendingGap.hasPassenger && !pendingGap.tripId && prev.hasPassenger) {
              currentTripPathRef.current = insertRouteAfterAnchor(currentTripPathRef.current, pendingGap.start, routeResult.path);
            }

            return {
              ...prev,
              pendingRouteGaps: (prev.pendingRouteGaps || []).filter((candidate) => candidate.id !== gap.id),
              totalDistanceKm: nextTotalDistance,
              passengerDistanceKm: nextPassengerDistance,
              emptyDistanceKm: nextEmptyDistance,
              estimatedEarnings: sumTripsGross,
              estimatedFuelCost: fuelCost,
              estimatedNetEarnings: Number((sumTripsGross - fuelCost).toFixed(2)),
              pathHistory: nextPathHistory,
              currentTripPath: nextTripPath,
              trips: nextTrips,
            };
          });
          setRemoteSyncError(null);
        })
        .catch(() => {
          // Manter o gap pendente para retry
        })
        .finally(() => {
          routeRecoveryInFlightRef.current.delete(gap.id);
        });
    },
    [settings, summary]
  );

  const scheduleRemoteSessionSave = useCallback((sessionToSave: ShiftSession, targetUserId: string) => {
    if (!targetUserId) return;
    const fingerprint = sessionFingerprint(sessionToSave);
    if (fingerprint === lastRemoteFingerprintRef.current) return;
    remoteSavePendingRef.current = { session: sessionToSave, userId: targetUserId, fingerprint };

    if (remoteSaveTimerRef.current) clearTimeout(remoteSaveTimerRef.current);
    remoteSaveTimerRef.current = setTimeout(async () => {
      const pending = remoteSavePendingRef.current;
      if (!pending) return;
      lastRemoteFingerprintRef.current = pending.fingerprint;
      try {
        await syncActiveShiftToFirebase(pending.session, pending.userId);
      } catch (error) {
        setRemoteSyncError(error instanceof Error ? error.message : 'Não foi possível sincronizar o turno.');
      }
    }, 1200);
  }, [setRemoteSyncError]);

  const clearRemoteSession = useCallback((targetUserId?: string | null) => {
    if (!targetUserId) return;
    if (remoteSaveTimerRef.current) {
      clearTimeout(remoteSaveTimerRef.current);
      remoteSaveTimerRef.current = null;
    }
    remoteSavePendingRef.current = null;
    lastRemoteFingerprintRef.current = null;
    void clearActiveShiftFromFirebase(targetUserId);
  }, []);

  // Subscrever alterações em tempo real do Firebase Firestore
  useEffect(() => {
    if (!userId) {
      remoteReadyRef.current = true;
      return;
    }
    remoteReadyRef.current = false;
    let unsubscribe: (() => void) | null = null;
    let isMounted = true;
    void subscribeToActiveShift(
      userId,
      (snapshot) => {
        if (!isMounted) return;
        remoteReadyRef.current = true;
        if (!snapshot) return;
        setSession((prev) => {
          if (prev.hasPassenger && prev.state === 'active') return prev;
          if ((snapshot.revision || 0) <= (prev.revision || 0) && prev.state !== 'idle') return prev;
          return normalizeSessionState(snapshot as unknown as Record<string, unknown>);
        });
      },
      (err) => {
        if (!isMounted) return;
        remoteReadyRef.current = true;
        setRemoteSyncError(err?.message || 'Falha na subscrição do turno remoto.');
      }
    ).then((unsub) => {
      if (!isMounted) {
        unsub();
      } else {
        unsubscribe = unsub;
      }
    });

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [setRemoteSyncError, userId]);

  // Iniciar Turno
  const startShift = useCallback((platform?: PlatformType) => {
    if (sessionRef.current.originDeviceId && sessionRef.current.originDeviceId !== currentDeviceId) {
      setRemoteSyncError('Esta sessão está a ser controlada por outro dispositivo.');
      return false;
    }
    const startT = Date.now();
    setSession((prev) => ({
      ...prev,
      state: 'active',
      platform: platform || prev.platform,
      startTime: prev.startTime || startT,
      originDeviceId: prev.originDeviceId || currentDeviceId,
    }));
    return true;
  }, [currentDeviceId, setRemoteSyncError]);

  // Pausar Turno
  const pauseShift = useCallback(() => {
    if (sessionRef.current.originDeviceId && sessionRef.current.originDeviceId !== currentDeviceId) {
      setRemoteSyncError('Esta sessão está a ser controlada por outro dispositivo.');
      return false;
    }
    setSession((prev) => (prev.state === 'active' ? { ...prev, state: 'paused' } : prev));
    return true;
  }, [currentDeviceId, setRemoteSyncError]);

  // Retomar Turno
  const resumeShift = useCallback(() => {
    if (sessionRef.current.originDeviceId && sessionRef.current.originDeviceId !== currentDeviceId) {
      setRemoteSyncError('Esta sessão está a ser controlada por outro dispositivo.');
      return false;
    }
    gapPositionRef.current = null;
    gapPositionSavedAtRef.current = 0;
    setSession((prev) => (prev.state === 'paused' ? { ...prev, state: 'active' } : prev));
    return true;
  }, [currentDeviceId, setRemoteSyncError]);

  // Iniciar Viagem numa Plataforma Específica
  const startTrip = useCallback((platform: PlatformType = 'uber') => {
    const current = sessionRef.current;
    if (userId && !remoteReadyRef.current) {
      setRemoteSyncError('A sincronização ainda está a carregar. Tente iniciar a viagem novamente em instantes.');
      return false;
    }
    const ownsCurrentSession = !current.originDeviceId || current.originDeviceId === currentDeviceId;
    if (!ownsCurrentSession) {
      setRemoteSyncError('Esta sessão está a ser controlada por outro dispositivo. Aguarde a transferência automática.');
      return false;
    }
    if (current.hasPassenger) {
      setRemoteSyncError('Finalize a viagem atual antes de iniciar outra plataforma.');
      return false;
    }
    if (current.state === 'paused') {
      setRemoteSyncError('Retome o turno antes de iniciar uma viagem.');
      return false;
    }
    setIsArrivalAlertOpen(false);
    standstillCounterRef.current = 0;
    currentTripSecondsRef.current = 0;

    const startT = Date.now();
    currentTripStartTimeRef.current = startT;
    currentTripStartDistRef.current = current.totalDistanceKm;
    currentTripStartEarningsRef.current = current.estimatedEarnings;

    const initialPoint: LocationPoint = {
      lat: current.currentPosition.lat,
      lng: current.currentPosition.lng,
      speedKmh: current.currentSpeedKmh,
      heading: current.currentPosition.heading,
      timestamp: startT,
      hasPassenger: true,
    };
    currentTripPathRef.current = [initialPoint];

    setSession((prev) => {
      const nextState = prev.state === 'idle' ? 'active' : (prev.state === 'paused' ? 'active' : prev.state);
      const nextSession: ShiftSession = {
        ...prev,
        state: nextState,
        id: prev.state === 'idle' ? ('session-' + startT) : prev.id,
        originDeviceId: prev.originDeviceId || getDeviceId(),
        startTime: prev.state === 'idle' ? startT : prev.startTime,
        hasPassenger: true,
        currentTripPlatform: platform,
        currentTripPath: [initialPoint],
        currentTripStartedAt: startT,
        currentTripStartDistanceKm: prev.totalDistanceKm,
        currentTripStartEarnings: prev.estimatedEarnings,
        currentTripDurationSeconds: 0,
      };

      const ownerUid = sessionOwnerUidRef.current || userId;
      if (ownerUid) {
        scheduleRemoteSessionSave(nextSession, ownerUid);
        const storageKey = getSessionStorageKey(ownerUid);
        if (storageKey) {
          try {
            localStorage.setItem(storageKey, JSON.stringify({ session: nextSession, lastSavedTimestamp: startT }));
            saveSessionToIndexedDb(nextSession, ownerUid);
          } catch {
            // ignore
          }
        }
      }
      return nextSession;
    });
    return true;
  }, [currentDeviceId, scheduleRemoteSessionSave, setRemoteSyncError, userId]);

  // Finalizar Viagem Ativa e Registar Rota pelas Ruas
  const finishTrip = useCallback(() => {
    const current = sessionRef.current;
    if ((current.state !== 'active' && current.state !== 'paused') || !current.hasPassenger) return false;
    if (current.originDeviceId && current.originDeviceId !== currentDeviceId) {
      setRemoteSyncError('Esta sessão está a ser controlada por outro dispositivo.');
      return false;
    }
    if ((current.pendingRouteGaps || []).some((gap) => gap.hasPassenger)) {
      setRemoteSyncError('A viagem tem um intervalo sem rota confirmada. Aguarde a ligação voltar para finalizar sem imprecisões.');
      return false;
    }
    setIsArrivalAlertOpen(false);
    standstillCounterRef.current = 0;
    const trackedSecs = Math.max(currentTripSecondsRef.current, current.currentTripDurationSeconds || 0);
    currentTripSecondsRef.current = 0;

    const startT = current.currentTripStartedAt || currentTripStartTimeRef.current || Date.now();
    const endT = Date.now();
    const startDistanceKm = current.currentTripStartedAt > 0
      ? current.currentTripStartDistanceKm
      : currentTripStartDistRef.current;
    const startEarnings = current.currentTripStartedAt > 0
      ? current.currentTripStartEarnings
      : currentTripStartEarningsRef.current;
    const tripMetrics = calculateActiveTripMetrics({
      totalDistanceKm: current.totalDistanceKm,
      startDistanceKm,
      currentEarnings: current.estimatedEarnings,
      startEarnings,
      trackedDurationSeconds: trackedSecs,
      startedAt: startT,
      now: endT,
      costPerKm: getEffectiveVehicleCostPerKm(settings),
    });
    const { distanceKm: distKm, durationSeconds, grossEarnings: estEarnings } = tripMetrics;

    const activePlat = current.currentTripPlatform || 'other';

    const finalPoint: LocationPoint = {
      lat: sessionRef.current.currentPosition.lat,
      lng: sessionRef.current.currentPosition.lng,
      speedKmh: sessionRef.current.currentSpeedKmh,
      heading: sessionRef.current.currentPosition.heading,
      timestamp: endT,
      hasPassenger: true,
    };

    const startPoint = currentTripPathRef.current[0] || finalPoint;
    const directHaversineKm = calculateHaversineDistance(startPoint, finalPoint);
    const isDefaultPosition = Math.abs(startPoint.lat - DEFAULT_PORTUGAL_COORDS.lat) < 0.001
      && Math.abs(startPoint.lng - DEFAULT_PORTUGAL_COORDS.lng) < 0.001;

    const finalTripPath = [...currentTripPathRef.current, finalPoint];
    const pathCumulativeKm = getPathDistanceKm(finalTripPath);
    const initialTripDistance = Math.max(distKm, pathCumulativeKm);

    const vehicleCostKm = getEffectiveVehicleCostPerKm(settings);
    const adjustedFuelCost = Number((initialTripDistance * vehicleCostKm).toFixed(2));
    const adjustedNetEarnings = Number((estEarnings - adjustedFuelCost).toFixed(2));

    const calculatedStartT = endT - durationSeconds * 1000;
    const startTimeStr = new Date(calculatedStartT).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    const endTimeStr = new Date(endT).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

    const encodedPath = encodePolyline(finalTripPath);

    const tripId = 'trip-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    const shouldEnrichRoute = !isDefaultPosition && (directHaversineKm >= 0.04 || initialTripDistance >= 0.04);
    const completedTrip: TripDetail = {
      id: tripId,
      platform: activePlat,
      startTime: startTimeStr,
      endTime: endTimeStr,
      durationSeconds,
      distanceKm: initialTripDistance,
      estimatedEarnings: estEarnings,
      fuelCost: adjustedFuelCost,
      netEarnings: adjustedNetEarnings,
      encodedPath,
      pathHistory: finalTripPath,
    };

    const routeGap: PendingRouteGap | null = shouldEnrichRoute
      ? {
          id: `trip-route-gap-${tripId}`,
          start: { lat: startPoint.lat, lng: startPoint.lng },
          end: { lat: finalPoint.lat, lng: finalPoint.lng },
          startedAt: startT,
          endedAt: endT,
          hasPassenger: true,
          platform: activePlat,
          tripId,
        }
      : null;

    currentTripPathRef.current = [];
    currentTripStartTimeRef.current = null;
    currentTripStartDistRef.current = 0;
    currentTripStartEarningsRef.current = 0;

    setSession((prev) => {
      const prevCount = prev.platformTripsCount?.[activePlat] || 0;
      const updatedPlatformTrips = {
        ...prev.platformTripsCount,
        [activePlat]: prevCount + 1,
      };

      const updatedTrips = [...(prev.trips || []), completedTrip];
      const pendingRouteGaps = routeGap
        ? [...(prev.pendingRouteGaps || []), routeGap]
        : prev.pendingRouteGaps;
      const sumTripEarnings = Number(updatedTrips.reduce((acc, t) => acc + (t.estimatedEarnings || 0), 0).toFixed(2));
      const sumTripDistance = Number(updatedTrips.reduce((acc, t) => acc + (t.distanceKm || 0), 0).toFixed(4));
      const updatedTotalDistance = Math.max(Number(prev.totalDistanceKm.toFixed(4)), sumTripDistance);
      const updatedPassengerDistance = Math.max(Number(prev.passengerDistanceKm.toFixed(4)), sumTripDistance);
      const distanceFuel = Number((updatedTotalDistance * getEffectiveVehicleCostPerKm(settings)).toFixed(2));
      const totalFuel = Number((distanceFuel + fuelExpensesTotal(prev.fuelExpenses)).toFixed(2));
      const sumTripNet = Number((sumTripEarnings - totalFuel).toFixed(2));

      return {
        ...prev,
        totalDistanceKm: updatedTotalDistance,
        passengerDistanceKm: updatedPassengerDistance,
        hasPassenger: false,
        currentTripPlatform: null,
        currentTripStartedAt: 0,
        currentTripStartDistanceKm: 0,
        currentTripStartEarnings: 0,
        currentTripDurationSeconds: 0,
        tripsCompletedCount: prev.tripsCompletedCount + 1,
        platformTripsCount: updatedPlatformTrips,
        currentTripPath: [],
        trips: updatedTrips,
        pendingRouteGaps,
        estimatedEarnings: sumTripEarnings,
        estimatedFuelCost: totalFuel,
        estimatedNetEarnings: sumTripNet,
      };
    });

    if (routeGap) {
      resolvePendingRouteGap(routeGap);
    }
    return true;
  }, [currentDeviceId, resolvePendingRouteGap, setRemoteSyncError, settings]);

  // Atualizar Viagem Específica do Turno Ativo
  const updateSessionTrip = useCallback((updatedTrip: TripDetail) => {
    if (sessionRef.current.originDeviceId && sessionRef.current.originDeviceId !== currentDeviceId) {
      setRemoteSyncError('Esta sessão está a ser controlada por outro dispositivo.');
      return;
    }
    const safeDistance = Number.isFinite(updatedTrip.distanceKm)
      ? Math.min(100000, Math.max(0, updatedTrip.distanceKm))
      : 0;
    const safeEarnings = Number.isFinite(updatedTrip.estimatedEarnings)
      ? Math.min(1000000, Math.max(0, updatedTrip.estimatedEarnings))
      : 0;
    const safeFuel = Number((safeDistance * getEffectiveVehicleCostPerKm(settings)).toFixed(2));
    const normalizedTrip: TripDetail = {
      ...updatedTrip,
      platform: isPlatform(updatedTrip.platform) ? updatedTrip.platform : 'other',
      durationSeconds: Number.isFinite(updatedTrip.durationSeconds)
        ? Math.min(172800, Math.max(0, Math.floor(updatedTrip.durationSeconds)))
        : 0,
      distanceKm: Number(safeDistance.toFixed(2)),
      estimatedEarnings: Number(safeEarnings.toFixed(2)),
      fuelCost: safeFuel,
      netEarnings: Number((safeEarnings - safeFuel).toFixed(2)),
    };

    setSession((prev) => {
      const originalTrip = (prev.trips || []).find((trip) => trip.id === normalizedTrip.id);
      const updatedTrips = (prev.trips || []).map((t) => (t.id === normalizedTrip.id ? normalizedTrip : t));
      const previousTripsGross = (prev.trips || []).reduce((total, trip) => total + (Number.isFinite(trip.estimatedEarnings) ? trip.estimatedEarnings : 0), 0);
      const sumTripEarnings = Number(updatedTrips.reduce((acc, t) => acc + (t.estimatedEarnings || 0), 0).toFixed(2));
      const activeTripGross = prev.hasPassenger ? Math.max(0, prev.estimatedEarnings - previousTripsGross) : 0;
      const earningsDelta = originalTrip ? normalizedTrip.estimatedEarnings - originalTrip.estimatedEarnings : 0;
      const distanceDelta = originalTrip ? normalizedTrip.distanceKm - originalTrip.distanceKm : 0;
      const updatedTotalDistance = Math.max(0, Number((prev.totalDistanceKm + distanceDelta).toFixed(4)));
      const updatedPassengerDistance = Math.max(0, Number((prev.passengerDistanceKm + distanceDelta).toFixed(4)));
      const totalFuel = Number((updatedTotalDistance * getEffectiveVehicleCostPerKm(settings) + fuelExpensesTotal(prev.fuelExpenses)).toFixed(2));
      const nextGrossEarnings = Number((sumTripEarnings + activeTripGross).toFixed(2));
      const sumTripNet = Number((nextGrossEarnings - totalFuel).toFixed(2));
      const updatedPlatformTrips = { ...prev.platformTripsCount };
      if (originalTrip && originalTrip.platform !== normalizedTrip.platform) {
        updatedPlatformTrips[originalTrip.platform] = Math.max(0, (updatedPlatformTrips[originalTrip.platform] || 0) - 1);
        updatedPlatformTrips[normalizedTrip.platform] = (updatedPlatformTrips[normalizedTrip.platform] || 0) + 1;
      }

      if (prev.hasPassenger) {
        currentTripStartDistRef.current += distanceDelta;
        currentTripStartEarningsRef.current += earningsDelta;
      }

      return {
        ...prev,
        trips: updatedTrips,
        tripsCompletedCount: updatedTrips.length,
        platformTripsCount: updatedPlatformTrips,
        totalDistanceKm: updatedTotalDistance,
        passengerDistanceKm: updatedPassengerDistance,
        emptyDistanceKm: prev.emptyDistanceKm,
        currentTripStartDistanceKm: prev.hasPassenger ? prev.currentTripStartDistanceKm + distanceDelta : prev.currentTripStartDistanceKm,
        currentTripStartEarnings: prev.hasPassenger ? prev.currentTripStartEarnings + earningsDelta : prev.currentTripStartEarnings,
        estimatedEarnings: nextGrossEarnings,
        estimatedFuelCost: totalFuel,
        estimatedNetEarnings: sumTripNet,
      };
    });
  }, [currentDeviceId, setRemoteSyncError, settings]);

  // Eliminar Viagem Específica do Turno Ativo
  const deleteSessionTrip = useCallback((tripId: string) => {
    if (sessionRef.current.originDeviceId && sessionRef.current.originDeviceId !== currentDeviceId) {
      setRemoteSyncError('Esta sessão está a ser controlada por outro dispositivo.');
      return;
    }
    setSession((prev) => {
      const removedTrip = (prev.trips || []).find((trip) => trip.id === tripId);
      const updatedTrips = (prev.trips || []).filter((t) => t.id !== tripId);
      const previousTripsGross = (prev.trips || []).reduce((total, trip) => total + (Number.isFinite(trip.estimatedEarnings) ? trip.estimatedEarnings : 0), 0);
      const sumTripEarnings = Number(updatedTrips.reduce((acc, t) => acc + (t.estimatedEarnings || 0), 0).toFixed(2));
      const activeTripGross = prev.hasPassenger ? Math.max(0, prev.estimatedEarnings - previousTripsGross) : 0;
      const removedDistance = removedTrip?.distanceKm || 0;
      const removedEarnings = removedTrip?.estimatedEarnings || 0;
      const updatedTotalDistance = Math.max(0, Number((prev.totalDistanceKm - removedDistance).toFixed(4)));
      const updatedPassengerDistance = Math.max(0, Number((prev.passengerDistanceKm - removedDistance).toFixed(4)));
      const totalFuel = Number((updatedTotalDistance * getEffectiveVehicleCostPerKm(settings) + fuelExpensesTotal(prev.fuelExpenses)).toFixed(2));
      const nextGrossEarnings = Number((sumTripEarnings + activeTripGross).toFixed(2));
      const sumTripNet = Number((nextGrossEarnings - totalFuel).toFixed(2));
      const updatedPlatformTrips = { ...prev.platformTripsCount };
      if (removedTrip) {
        updatedPlatformTrips[removedTrip.platform] = Math.max(0, (updatedPlatformTrips[removedTrip.platform] || 0) - 1);
      }

      if (prev.hasPassenger && removedTrip) {
        currentTripStartDistRef.current -= removedDistance;
        currentTripStartEarningsRef.current -= removedEarnings;
      }

      return {
        ...prev,
        trips: updatedTrips,
        tripsCompletedCount: updatedTrips.length,
        platformTripsCount: updatedPlatformTrips,
        totalDistanceKm: updatedTotalDistance,
        passengerDistanceKm: updatedPassengerDistance,
        emptyDistanceKm: prev.emptyDistanceKm,
        currentTripStartDistanceKm: prev.hasPassenger && removedTrip ? prev.currentTripStartDistanceKm - removedDistance : prev.currentTripStartDistanceKm,
        currentTripStartEarnings: prev.hasPassenger && removedTrip ? prev.currentTripStartEarnings - removedEarnings : prev.currentTripStartEarnings,
        estimatedEarnings: nextGrossEarnings,
        estimatedFuelCost: totalFuel,
        estimatedNetEarnings: sumTripNet,
      };
    });
  }, [currentDeviceId, setRemoteSyncError, settings]);

  // Cancelar Viagem Ativa
  const cancelCurrentTrip = useCallback(() => {
    const current = sessionRef.current;
    if (!current.hasPassenger) return;
    if (current.originDeviceId && current.originDeviceId !== currentDeviceId) {
      setRemoteSyncError('Esta sessão está a ser controlada por outro dispositivo.');
      return;
    }
    const startDistanceKm = current.currentTripStartedAt > 0
      ? current.currentTripStartDistanceKm
      : currentTripStartDistRef.current;
    const startEarnings = current.currentTripStartedAt > 0
      ? current.currentTripStartEarnings
      : currentTripStartEarningsRef.current;
    const cancelledDistance = Math.max(0, Number((current.totalDistanceKm - startDistanceKm).toFixed(2)));
    const cancelledEarnings = Math.max(0, Number((current.estimatedEarnings - startEarnings).toFixed(2)));
    setIsArrivalAlertOpen(false);
    standstillCounterRef.current = 0;
    currentTripSecondsRef.current = 0;
    routeRecoveryInFlightRef.current.clear();
    currentTripStartTimeRef.current = null;
    currentTripStartDistRef.current = 0;
    currentTripStartEarningsRef.current = 0;
    currentTripPathRef.current = [];
    pendingFinishShiftRef.current = false;

    setSession((prev) => ({
      ...prev,
      hasPassenger: false,
      currentTripPlatform: null,
      currentTripPath: [],
      currentTripStartedAt: 0,
      currentTripStartDistanceKm: 0,
      currentTripStartEarnings: 0,
      currentTripDurationSeconds: 0,
      pendingRouteGaps: prev.pendingRouteGaps.filter((gap) => !gap.hasPassenger),
      passengerDistanceKm: Math.max(0, Number((prev.passengerDistanceKm - cancelledDistance).toFixed(2))),
      emptyDistanceKm: Number((prev.emptyDistanceKm + cancelledDistance).toFixed(2)),
      estimatedEarnings: Math.max(0, Number((prev.estimatedEarnings - cancelledEarnings).toFixed(2))),
      estimatedFuelCost: Number((prev.totalDistanceKm * getEffectiveVehicleCostPerKm(settings) + fuelExpensesTotal(prev.fuelExpenses)).toFixed(2)),
      estimatedNetEarnings: Number((Math.max(0, prev.estimatedEarnings - cancelledEarnings) - (prev.totalDistanceKm * getEffectiveVehicleCostPerKm(settings) + fuelExpensesTotal(prev.fuelExpenses))).toFixed(2)),
    }));
  }, [currentDeviceId, setRemoteSyncError, settings]);

  // Registar Despesa Pontual de Abastecimento / Carregamento Elétrico
  const addFuelExpense = useCallback((input: Omit<FuelExpense, 'id' | 'createdAt'> | number) => {
    const current = sessionRef.current;
    if (current.state === 'idle') {
      setRemoteSyncError('Inicie um turno antes de registar uma despesa de combustível.');
      return false;
    }
    if (current.originDeviceId && current.originDeviceId !== currentDeviceId) {
      setRemoteSyncError('Esta sessão está a ser controlada por outro dispositivo.');
      return false;
    }
    setSession((prev) => {
      const amount = typeof input === 'number' ? input : input.amount;
      if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) return prev;
      const expense: FuelExpense = {
        id: createLocalId('fuel'),
        amount: Number(amount.toFixed(2)),
        quantity: typeof input === 'number' ? undefined : input.quantity,
        unit: typeof input === 'number' ? undefined : input.unit,
        notes: typeof input === 'number' ? undefined : input.notes?.trim().slice(0, 240),
        createdAt: new Date().toISOString(),
      };
      const fuelExpenses = [...(prev.fuelExpenses || []), expense];
      const totalFuel = Number((prev.totalDistanceKm * getEffectiveVehicleCostPerKm(settings) + fuelExpensesTotal(fuelExpenses)).toFixed(2));
      const newNet = Number((prev.estimatedEarnings - totalFuel).toFixed(2));

      return {
        ...prev,
        fuelExpenses,
        estimatedFuelCost: totalFuel,
        estimatedNetEarnings: newNet,
      };
    });
    return true;
  }, [currentDeviceId, setRemoteSyncError, settings]);

  // Alternador de Passageiro
  const togglePassengerStatus = useCallback((explicitStatus?: unknown, platform?: PlatformType) => {
    if (typeof explicitStatus === 'boolean') {
      if (explicitStatus) {
        startTrip(platform || 'uber');
      } else {
        finishTrip();
      }
      return;
    }

    if (sessionRef.current.hasPassenger) {
      finishTrip();
    } else {
      startTrip(platform || 'uber');
    }
  }, [startTrip, finishTrip]);

  // Atualizar dados de movimento GPS e calcular delta de quilómetros recuperados
  const handleMovementTick = useCallback(
    (coords: Coordinates, speedKmh: number, deltaKm: number, heading: number = 0, accuracyMeters?: number) => {
      if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)
        || coords.lat < -90 || coords.lat > 90 || coords.lng < -180 || coords.lng > 180) return;

      const safeSpeed = Number.isFinite(speedKmh) ? Math.min(240, Math.max(0, speedKmh)) : 0;
      const safeHeading = Number.isFinite(heading) ? heading : 0;
      const safeAccuracy = Number.isFinite(accuracyMeters) ? Math.min(10000, Math.max(0, accuracyMeters as number)) : 5;
      const recoveryStart = gapPositionRef.current;
      const shouldRecoverGap = Boolean(recoveryStart && sessionRef.current.state === 'active');
      const recoveryWasPassenger = shouldRecoverGap && sessionRef.current.hasPassenger;
      const directGapDistanceKm = shouldRecoverGap && recoveryStart
        ? calculateHaversineDistance(recoveryStart, coords)
        : 0;
      const gapElapsedSeconds = gapPositionSavedAtRef.current > 0
        ? Math.max(0, (Date.now() - gapPositionSavedAtRef.current) / 1000)
        : 0;
      const maxPlausibleRouteDistanceKm = Math.min(
        MAX_GAP_ROUTE_DISTANCE_KM,
        Math.max(1, gapElapsedSeconds * (180 / 3600))
      );
      const recoveryRequest = shouldRecoverGap && recoveryStart
        && safeAccuracy <= 100
        && directGapDistanceKm >= 0.1
        && directGapDistanceKm <= maxPlausibleRouteDistanceKm
        ? {
            id: createLocalId('route-gap'),
            start: recoveryStart,
            end: { lat: coords.lat, lng: coords.lng },
            startedAt: gapPositionSavedAtRef.current || Date.now(),
            endedAt: Date.now(),
            hasPassenger: Boolean(recoveryWasPassenger),
            platform: sessionRef.current.currentTripPlatform
              || (sessionRef.current.platform !== 'all' ? sessionRef.current.platform : 'other'),
          }
        : null;

      if (shouldRecoverGap) {
        if (recoveryRequest) {
          gapPositionRef.current = null;
          gapPositionSavedAtRef.current = 0;
        } else if (directGapDistanceKm < 0.1 && recoveryStart) {
          gapPositionRef.current = { lat: coords.lat, lng: coords.lng };
          gapPositionSavedAtRef.current = Date.now();
        }
      }

      setSession((prev) => {
        const validDelta = shouldRecoverGap
          ? 0
          : Number.isFinite(deltaKm) ? Math.min(20, Math.max(0, deltaKm)) : 0;

        const newDistance = Number((prev.totalDistanceKm + validDelta).toFixed(4));
        const newPassengerDistance = prev.hasPassenger
          ? Number((prev.passengerDistanceKm + validDelta).toFixed(4))
          : prev.passengerDistanceKm;
        const newEmptyDistance = !prev.hasPassenger
          ? Number((prev.emptyDistanceKm + validDelta).toFixed(4))
          : prev.emptyDistanceKm;

        const isMoving = safeSpeed >= settings.movementThresholdSpeedKmh;

        const newPoint: LocationPoint = {
          lat: coords.lat,
          lng: coords.lng,
          speedKmh: safeSpeed,
          heading: safeHeading,
          timestamp: Date.now(),
          hasPassenger: prev.hasPassenger,
        };

        if (prev.state === 'active') {
          if (userId) appendGpsBreadcrumb(newPoint, userId);
          if (prev.hasPassenger && !shouldRecoverGap) {
            currentTripPathRef.current = appendAnchoredPathPoint(currentTripPathRef.current, newPoint);
          }
        }

        const updatedPath = shouldRecoverGap
          ? prev.pathHistory
          : [...prev.pathHistory.slice(-199), newPoint];

        if (prev.state !== 'active') {
          return {
            ...prev,
            currentSpeedKmh: safeSpeed,
            drivingStatus: isMoving ? 'moving' : 'stopped',
            currentPosition: {
              ...prev.currentPosition,
              lat: coords.lat,
              lng: coords.lng,
              heading: safeHeading,
              accuracy: safeAccuracy,
            },
            pathHistory: updatedPath,
            pendingRouteGaps: prev.pendingRouteGaps,
          };
        }

        const pendingRouteGaps = recoveryRequest && !prev.pendingRouteGaps.some((gap) => gap.id === recoveryRequest.id)
          ? [...prev.pendingRouteGaps, recoveryRequest]
          : prev.pendingRouteGaps;

        if (pendingRouteGaps.length > 25) {
          setRemoteSyncError('Existem demasiados intervalos GPS pendentes. Aguarde a sincronização antes de continuar.');
          if (shouldRecoverGap && recoveryStart) {
            gapPositionRef.current = recoveryStart;
            gapPositionSavedAtRef.current = gapPositionSavedAtRef.current || Date.now();
          }
          return prev;
        }

        const activePlat = prev.currentTripPlatform || (prev.platform !== 'all' ? prev.platform : 'other');

        const targetKmRate =
          summary.platformBreakdown[activePlat]?.avgKmRate > 0
            ? summary.platformBreakdown[activePlat].avgKmRate
            : summary.avgKmRate || settings.fallbackKmRate;

        const earningIncrement = isMoving && prev.hasPassenger ? targetKmRate * validDelta * 0.55 : 0;

        const newEarnings = Number((prev.estimatedEarnings + earningIncrement).toFixed(4));
        const vehicleCostKm = getEffectiveVehicleCostPerKm(settings);
        const newFuelCost = Number((newDistance * vehicleCostKm + fuelExpensesTotal(prev.fuelExpenses)).toFixed(2));
        const newNetEarnings = Number((newEarnings - newFuelCost).toFixed(2));

        return {
          ...prev,
          currentSpeedKmh: safeSpeed,
          drivingStatus: isMoving ? 'moving' : 'stopped',
          totalDistanceKm: newDistance,
          passengerDistanceKm: newPassengerDistance,
          emptyDistanceKm: newEmptyDistance,
          estimatedEarnings: newEarnings,
          estimatedFuelCost: newFuelCost,
          estimatedNetEarnings: newNetEarnings,
          currentPosition: {
            lat: coords.lat,
            lng: coords.lng,
            heading: safeHeading,
            accuracy: safeAccuracy,
          },
          pathHistory: updatedPath,
          currentTripPath: prev.hasPassenger && !shouldRecoverGap
            ? appendAnchoredPathPoint(prev.currentTripPath || [], newPoint)
            : prev.currentTripPath,
          pendingRouteGaps,
        };
      });

      if (recoveryRequest) {
        resolvePendingRouteGap(recoveryRequest);
      }
    },
    [resolvePendingRouteGap, setRemoteSyncError, settings, summary, userId]
  );

  // Reconciliação automática de rotas viárias de viagens gravadas que precisem de rota pelas ruas
  const reconciledTripIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const trips = session.trips || [];
    if (trips.length === 0 || (session.state !== 'active' && session.state !== 'paused')) return;

    const tripsToReconcile = trips.filter((trip) => {
      if (reconciledTripIdsRef.current.has(trip.id)) return false;
      const path = getTripResolvedPath(trip);
      if (path.length < 2) return false;
      const pathDist = getPathDistanceKm(path);
      const directDist = calculateHaversineDistance(path[0], path[path.length - 1]);
      // Reconciliar se a distância guardada for incoerente com a rota (ex: 0.2km num trajeto real de 10km) ou se faltar rota detalhada
      const needsDistanceFix = pathDist >= 0.3 && (trip.distanceKm <= 0.25 || trip.distanceKm < 0.8 * pathDist);
      const needsStreetDetail = directDist >= 0.04 && (trip.distanceKm <= 0.05 || path.length <= 4);
      return needsDistanceFix || needsStreetDetail;
    });

    if (tripsToReconcile.length === 0) return;

    tripsToReconcile.forEach((trip) => {
      reconciledTripIdsRef.current.add(trip.id);
      enrichTripWithStreetRoute(trip, settings, summary).then((enrichedTrip) => {
        if (!enrichedTrip) return;
        setSession((prev) => {
          const updatedTrips = (prev.trips || []).map((t) => (t.id === enrichedTrip.id ? enrichedTrip : t));
          const sumTripEarnings = Number(updatedTrips.reduce((acc, t) => acc + (t.estimatedEarnings || 0), 0).toFixed(2));
          const sumTripDist = Number(updatedTrips.reduce((acc, t) => acc + (t.distanceKm || 0), 0).toFixed(4));
          const updatedTotalDistance = Math.max(prev.totalDistanceKm, sumTripDist);
          const updatedPassengerDistance = Math.max(prev.passengerDistanceKm, sumTripDist);
          const distanceFuel = Number((updatedTotalDistance * getEffectiveVehicleCostPerKm(settings)).toFixed(2));
          const totalFuel = Number((distanceFuel + fuelExpensesTotal(prev.fuelExpenses)).toFixed(2));
          const updatedEarnings = Math.max(prev.estimatedEarnings, sumTripEarnings);

          return {
            ...prev,
            trips: updatedTrips,
            passengerDistanceKm: updatedPassengerDistance,
            totalDistanceKm: updatedTotalDistance,
            estimatedEarnings: updatedEarnings,
            estimatedFuelCost: totalFuel,
            estimatedNetEarnings: Number((updatedEarnings - totalFuel).toFixed(2)),
          };
        });
      });
    });
  }, [session.trips, session.state, settings, summary]);

  // Timer central do turno
  useEffect(() => {
    if (session.state !== 'active' || !isSessionOwnerDevice) return;

    const interval = setInterval(() => {
      setSession((prev) => {
        if (prev.state !== 'active' || (prev.originDeviceId && prev.originDeviceId !== currentDeviceId)) return prev;

        const isMoving = prev.currentSpeedKmh >= settings.movementThresholdSpeedKmh;
        const newActiveDuration = prev.activeDurationSeconds + 1;
        const newPassengerDuration = prev.hasPassenger
          ? prev.passengerDurationSeconds + 1
          : prev.passengerDurationSeconds;
        const newEmptyDuration = !prev.hasPassenger
          ? prev.emptyDurationSeconds + 1
          : prev.emptyDurationSeconds;
        const newMovingDuration = isMoving
          ? prev.movingDurationSeconds + 1
          : prev.movingDurationSeconds;

        if (prev.hasPassenger) {
          currentTripSecondsRef.current += 1;
        }

        // Lógica de Deteção de Paragem no Destino
        if (
          prev.hasPassenger &&
          currentTripSecondsRef.current >= 60 &&
          !isMoving &&
          Date.now() > snoozeArrivalUntilRef.current
        ) {
          standstillCounterRef.current += 1;
          if (standstillCounterRef.current >= 180) {
            setIsArrivalAlertOpen(true);
          }
        } else if (isMoving) {
          standstillCounterRef.current = 0;
          if (isArrivalAlertOpen) {
            setIsArrivalAlertOpen(false);
          }
        }

        const targetRate = summary.avgHourlyGross || settings.fallbackHourlyRate;
        const deltaSeconds = 1;
        const timeRatePerSec = targetRate / 3600;

        let earningIncrement = 0;
        if (isMoving && prev.hasPassenger) {
          earningIncrement = timeRatePerSec * deltaSeconds * 0.45;
        }

        const newEarnings = Number((prev.estimatedEarnings + earningIncrement).toFixed(4));
        const fuelCost = Number((prev.totalDistanceKm * getEffectiveVehicleCostPerKm(settings) + fuelExpensesTotal(prev.fuelExpenses)).toFixed(2));
        const netEarnings = Number((newEarnings - fuelCost).toFixed(2));

        const effectiveHourlyRate =
          newPassengerDuration > 0 ? (newEarnings / (newPassengerDuration / 3600)) : 0;

        return {
          ...prev,
          activeDurationSeconds: newActiveDuration,
          passengerDurationSeconds: newPassengerDuration,
          emptyDurationSeconds: newEmptyDuration,
          movingDurationSeconds: newMovingDuration,
          currentTripDurationSeconds: prev.hasPassenger ? prev.currentTripDurationSeconds + 1 : prev.currentTripDurationSeconds,
          estimatedEarnings: newEarnings,
          estimatedFuelCost: fuelCost,
          estimatedNetEarnings: netEarnings,
          effectiveHourlyRate,
        };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [currentDeviceId, isArrivalAlertOpen, isSessionOwnerDevice, session.state, settings, summary]);

  // Finalizar Turno
  const finishShift = useCallback(() => {
    const s = sessionRef.current;
    const ownerUid = sessionOwnerUidRef.current || userId;
    if (s.state === 'idle') return;
    if ((s.pendingRouteGaps || []).length > 0) {
      setRemoteSyncError(`Há ${s.pendingRouteGaps.length} intervalo(s) sem rota viária confirmada. Aguarde a internet voltar antes de concluir o turno.`);
      return;
    }
    if (s.hasPassenger) {
      pendingFinishShiftRef.current = true;
      finishTrip();
      return;
    }
    const totalHours = Number((s.activeDurationSeconds / 3600).toFixed(2));
    const passengerHours = Number((s.passengerDurationSeconds / 3600).toFixed(2));
    const occupancyRate =
      s.activeDurationSeconds > 0
        ? Math.min(100, Math.round((s.passengerDurationSeconds / s.activeDurationSeconds) * 100))
        : 0;

    const startDate = s.startTime ? new Date(s.startTime) : new Date();
    const endDate = new Date();

    const formatHHmm = (d: Date) =>
      `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;

    const dateStr = `${startDate.getFullYear()}-${(startDate.getMonth() + 1).toString().padStart(2, '0')}-${startDate.getDate().toString().padStart(2, '0')}`;
    const startTimeStr = formatHHmm(startDate);
    const endTimeStr = formatHHmm(endDate);

    const platCounts = s.platformTripsCount || {};
    let dominantPlatform: PlatformType = s.platform !== 'all' ? s.platform : 'other';
    let maxCount = -1;
    (Object.keys(platCounts) as PlatformType[]).forEach((p) => {
      if ((platCounts[p] || 0) > maxCount) {
        maxCount = platCounts[p] || 0;
        dominantPlatform = p;
      }
    });

    if (maxCount <= 0) dominantPlatform = s.platform !== 'all' ? s.platform : 'other';
    const tripsCount = Math.max(0, s.trips.length);

    if (onFinishShift) {
      onFinishShift({
        platform: dominantPlatform,
        date: dateStr,
        startTime: startTimeStr,
        endTime: endTimeStr,
        totalHours,
        passengerHours: Math.max(0, passengerHours),
        passengerDistanceKm: Number(s.passengerDistanceKm.toFixed(2)),
        emptyDistanceKm: Number(s.emptyDistanceKm.toFixed(2)),
        occupancyRatePct: occupancyRate,
        grossEarnings: Number(s.estimatedEarnings.toFixed(2)),
        fuelCost: Number(s.estimatedFuelCost.toFixed(2)),
        distanceKm: Number(s.totalDistanceKm.toFixed(2)),
        tripsCount,
        platformTripsCount: s.platformTripsCount,
        trips: s.trips || [],
        fuelExpenses: s.fuelExpenses || [],
      });
    }

    try {
      const storageKey = getSessionStorageKey(ownerUid);
      if (storageKey) localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }

    setIsArrivalAlertOpen(false);
    currentTripSecondsRef.current = 0;
    currentTripStartTimeRef.current = null;
    currentTripStartDistRef.current = 0;
    currentTripStartEarningsRef.current = 0;
    currentTripPathRef.current = [];
    standstillCounterRef.current = 0;
    gapPositionRef.current = null;
    gapPositionSavedAtRef.current = 0;
    routeRecoveryInFlightRef.current.clear();
    clearRemoteSession(ownerUid);
    try {
      const storageKey = getSessionStorageKey(ownerUid);
      if (storageKey) localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }

    setSession((prev) => ({
      ...prev,
      state: 'idle',
      drivingStatus: 'stopped',
      hasPassenger: false,
      currentTripPlatform: null,
      currentTripStartedAt: 0,
      currentTripStartDistanceKm: 0,
      currentTripStartEarnings: 0,
      currentTripDurationSeconds: 0,
      platformTripsCount: { uber: 0, bolt: 0, freenow: 0, other: 0 },
      currentSpeedKmh: 0,
      activeDurationSeconds: 0,
      movingDurationSeconds: 0,
      passengerDurationSeconds: 0,
      emptyDurationSeconds: 0,
      totalDistanceKm: 0,
      passengerDistanceKm: 0,
      emptyDistanceKm: 0,
      tripsCompletedCount: 0,
      estimatedEarnings: 0,
      estimatedFuelCost: 0,
      estimatedNetEarnings: 0,
      startTime: null,
      pathHistory: [],
      currentTripPath: [],
      pendingRouteGaps: [],
      trips: [],
      fuelExpenses: [],
    }));
    if (ownerUid) void clearSessionFromIndexedDb(ownerUid);
  }, [clearRemoteSession, finishTrip, onFinishShift, setRemoteSyncError, userId]);

  useEffect(() => {
    if (!pendingFinishShiftRef.current || session.hasPassenger || session.state === 'idle') return;
    if ((session.pendingRouteGaps || []).length > 0) {
      setRemoteSyncError('A aguardar a confirmação das rotas viárias antes de concluir o turno.');
      return;
    }
    pendingFinishShiftRef.current = false;
    finishShift();
  }, [finishShift, session.hasPassenger, session.pendingRouteGaps, session.state, setRemoteSyncError]);

  // Descartar Turno sem guardar
  const detachShift = useCallback(() => {
    const ownerUid = sessionOwnerUidRef.current;
    try {
      const storageKey = getSessionStorageKey(ownerUid);
      if (storageKey) localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    if (ownerUid) void clearSessionFromIndexedDb(ownerUid);
    pendingFinishShiftRef.current = false;
    currentTripSecondsRef.current = 0;
    currentTripStartTimeRef.current = null;
    currentTripStartDistRef.current = 0;
    currentTripStartEarningsRef.current = 0;
    currentTripPathRef.current = [];
    setIsArrivalAlertOpen(false);
    standstillCounterRef.current = 0;
    gapPositionRef.current = null;
    gapPositionSavedAtRef.current = 0;
    routeRecoveryInFlightRef.current.clear();
    setSession((previous) => previous.state === 'idle' ? previous : resetToIdle(previous));
  }, []);

  const discardShift = useCallback(() => {
    const ownerUid = sessionOwnerUidRef.current || userId;
    pendingFinishShiftRef.current = false;
    try {
      const storageKey = getSessionStorageKey(ownerUid);
      if (storageKey) localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }

    setIsArrivalAlertOpen(false);
    currentTripSecondsRef.current = 0;
    currentTripStartTimeRef.current = null;
    currentTripStartDistRef.current = 0;
    currentTripStartEarningsRef.current = 0;
    currentTripPathRef.current = [];
    standstillCounterRef.current = 0;
    gapPositionRef.current = null;
    gapPositionSavedAtRef.current = 0;
    routeRecoveryInFlightRef.current.clear();
    clearRemoteSession(ownerUid);

    setSession((prev) => ({
      ...prev,
      state: 'idle',
      drivingStatus: 'stopped',
      hasPassenger: false,
      currentTripPlatform: null,
      currentTripStartedAt: 0,
      currentTripStartDistanceKm: 0,
      currentTripStartEarnings: 0,
      currentTripDurationSeconds: 0,
      platformTripsCount: { uber: 0, bolt: 0, freenow: 0, other: 0 },
      currentSpeedKmh: 0,
      activeDurationSeconds: 0,
      movingDurationSeconds: 0,
      passengerDurationSeconds: 0,
      emptyDurationSeconds: 0,
      totalDistanceKm: 0,
      passengerDistanceKm: 0,
      emptyDistanceKm: 0,
      tripsCompletedCount: 0,
      estimatedEarnings: 0,
      estimatedFuelCost: 0,
      estimatedNetEarnings: 0,
      startTime: null,
      pathHistory: [],
      currentTripPath: [],
      pendingRouteGaps: [],
      trips: [],
      fuelExpenses: [],
    }));
    if (ownerUid) void clearSessionFromIndexedDb(ownerUid);
  }, [clearRemoteSession, userId]);

  const dismissArrivalAlert = useCallback(() => {
    setIsArrivalAlertOpen(false);
    snoozeArrivalUntilRef.current = Date.now() + 600000;
  }, []);

  const confirmFinishTripFromArrivalAlert = useCallback(() => {
    finishTrip();
  }, [finishTrip]);

  const setTrackingMode = useCallback((mode: TrackingMode) => {
    setSession((prev) => ({ ...prev, trackingMode: mode }));
  }, []);

  const setPlatform = useCallback((p: PlatformType | 'all') => {
    setSession((prev) => ({ ...prev, platform: p }));
  }, []);

  return {
    session,
    isSessionOwnerDevice,
    startShift,
    pauseShift,
    resumeShift,
    finishShift,
    discardShift,
    detachShift,
    startTrip,
    finishTrip,
    cancelCurrentTrip,
    addFuelExpense,
    updateSessionTrip,
    deleteSessionTrip,
    togglePassengerStatus,
    isArrivalAlertOpen,
    currentTripSeconds: currentTripSecondsRef.current,
    dismissArrivalAlert,
    confirmFinishTripFromArrivalAlert,
    setTrackingMode,
    setPlatform,
    handleMovementTick,
    remoteSyncError,
  };
}
