import { describe, expect, it } from 'vitest';
import { normalizePersistedShiftSession } from './useShiftEarningsCalculator';

describe('estado persistido do turno', () => {
  it('preserva os marcadores da viagem ativa necessários ao reload', () => {
    const restored = normalizePersistedShiftSession({
      id: 'session-1',
      state: 'active',
      drivingStatus: 'stopped',
      hasPassenger: true,
      currentTripPlatform: 'uber',
      platformTripsCount: { uber: 0, bolt: 0, freenow: 0, other: 0 },
      trackingMode: 'real_gps',
      platform: 'all',
      startTime: 1_000,
      activeDurationSeconds: 300,
      passengerDurationSeconds: 120,
      emptyDurationSeconds: 180,
      movingDurationSeconds: 90,
      totalDistanceKm: 10,
      passengerDistanceKm: 4,
      emptyDistanceKm: 6,
      tripsCompletedCount: 0,
      currentSpeedKmh: 0,
      currentPosition: { lat: 38.7, lng: -9.1, heading: 0, accuracy: 5 },
      pathHistory: [],
      currentTripPath: [],
      currentTripStartedAt: 2_000,
      currentTripStartDistanceKm: 6,
      currentTripStartEarnings: 12.5,
      currentTripDurationSeconds: 120,
      trips: [],
      fuelExpenses: [],
      pendingRouteGaps: [{
        id: 'gap-1',
        start: { lat: 38.7, lng: -9.1 },
        end: { lat: 38.71, lng: -9.11 },
        startedAt: 2_500,
        endedAt: 3_500,
        hasPassenger: true,
        platform: 'uber',
      }],
      estimatedEarnings: 35,
      estimatedFuelCost: 0.8,
      estimatedNetEarnings: 34.2,
      effectiveHourlyRate: 420,
    });

    expect(restored).not.toBeNull();
    expect(restored?.currentTripStartedAt).toBe(2_000);
    expect(restored?.currentTripStartDistanceKm).toBe(6);
    expect(restored?.currentTripStartEarnings).toBe(12.5);
    expect(restored?.currentTripDurationSeconds).toBe(120);
    expect(restored?.pendingRouteGaps).toHaveLength(1);
    expect(restored?.pendingRouteGaps[0].platform).toBe('uber');
  });

  it('rejeita uma sessão persistida sem estado ativo/pausado', () => {
    expect(normalizePersistedShiftSession({ id: 'idle', state: 'idle' })).toBeNull();
  });
});
