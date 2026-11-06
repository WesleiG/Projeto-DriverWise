import { describe, expect, it } from 'vitest';
import { applyUniversalShiftCosts, buildPlatformRecordDrafts } from './platformShiftRecords';
import { TripDetail } from '../types/session';

const trip = (id: string, platform: TripDetail['platform'], distanceKm: number, estimatedEarnings: number): TripDetail => ({
  id,
  platform,
  startTime: '09:00:00',
  endTime: '09:30:00',
  durationSeconds: 1800,
  distanceKm,
  estimatedEarnings,
  pathHistory: [],
});

describe('separação de turnos por plataforma', () => {
  it('mantém viagens e métricas de cada plataforma isoladas', () => {
    const drafts = buildPlatformRecordDrafts({
      platform: 'uber',
      date: '2026-08-28',
      startTime: '08:00',
      endTime: '16:00',
      totalHours: 8,
      passengerHours: 3,
      passengerDistanceKm: 45,
      emptyDistanceKm: 15,
      occupancyRatePct: 38,
      grossEarnings: 100,
      fuelCost: 8,
      distanceKm: 60,
      tripsCount: 3,
      platformTripsCount: { uber: 2, bolt: 1 },
      trips: [
        trip('uber-1', 'uber', 20, 35),
        trip('uber-2', 'uber', 10, 25),
        trip('bolt-1', 'bolt', 15, 40),
      ],
      fuelExpenses: [{ id: 'fuel-1', amount: 8, createdAt: '2026-08-28T12:00:00.000Z' }],
    });

    expect(drafts.map((draft) => draft.platform)).toEqual(['uber', 'bolt']);
    expect(drafts[0].trips?.map((item) => item.id)).toEqual(['uber-1', 'uber-2']);
    expect(drafts[1].trips?.map((item) => item.id)).toEqual(['bolt-1']);
    expect(drafts.reduce((sum, draft) => sum + draft.distanceKm, 0)).toBe(60);
    expect(drafts.reduce((sum, draft) => sum + draft.grossEarnings, 0)).toBe(100);
    expect(drafts.reduce((sum, draft) => sum + draft.fuelCost, 0)).toBe(8);
    expect(drafts.reduce((sum, draft) => sum + draft.tripsCount, 0)).toBe(3);
  });

  it('usa a plataforma dominante quando não há viagens discriminadas', () => {
    const [draft] = buildPlatformRecordDrafts({
      platform: 'bolt',
      date: '2026-08-28',
      startTime: '22:00',
      endTime: '02:00',
      totalHours: 4,
      passengerHours: 0,
      passengerDistanceKm: 0,
      emptyDistanceKm: 20,
      occupancyRatePct: 0,
      grossEarnings: 0,
      fuelCost: 2,
      distanceKm: 20,
      tripsCount: 0,
    });

    expect(draft.platform).toBe('bolt');
    expect(draft.distanceKm).toBe(20);
    expect(draft.emptyDistanceKm).toBe(20);
    expect(draft.totalHours).toBe(4);
  });

  it('reparte custos universais uma única vez e calcula percentagens sobre o bruto', () => {
    const drafts = buildPlatformRecordDrafts({
      platform: 'uber',
      date: '2026-08-28',
      startTime: '08:00',
      endTime: '12:00',
      totalHours: 4,
      passengerHours: 2,
      passengerDistanceKm: 30,
      emptyDistanceKm: 10,
      occupancyRatePct: 50,
      grossEarnings: 100,
      fuelCost: 0,
      distanceKm: 40,
      tripsCount: 2,
      trips: [trip('uber-1', 'uber', 20, 60), trip('bolt-1', 'bolt', 20, 40)],
    });
    const updated = applyUniversalShiftCosts(drafts, {
      fuelCost: 8,
      otherExpenses: 10,
      commissionPct: 20,
      taxPct: 5,
    });

    expect(updated.reduce((sum, draft) => sum + draft.fuelCost, 0)).toBe(8);
    expect(updated.reduce((sum, draft) => sum + draft.otherExpenses, 0)).toBe(10);
    expect(updated.reduce((sum, draft) => sum + draft.commissionCost, 0)).toBe(20);
    expect(updated.reduce((sum, draft) => sum + (draft.taxCost || 0), 0)).toBe(5);
    expect(updated.every((draft) => draft.commissionPct === 20 && draft.taxPct === 5)).toBe(true);
  });
});
