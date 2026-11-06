import { describe, expect, it } from 'vitest';
import { normalizeEarningRecord } from './useEarningsHistory';

const baseRecord = {
  id: 'record-1',
  platform: 'uber',
  date: '2026-08-28',
  startTime: '08:00',
  endTime: '09:00',
  totalHours: 1,
  passengerHours: 0.5,
  passengerDistanceKm: 4,
  emptyDistanceKm: 2,
  occupancyRatePct: 50,
  grossEarnings: 20,
  tips: 0,
  bonuses: 0,
  tollsReimbursed: 0,
  distanceKm: 6,
  tripsCount: 99,
  trips: [{
    id: 'trip-1',
    platform: 'uber',
    startTime: '08:00:00',
    endTime: '08:30:00',
    durationSeconds: 1800,
    distanceKm: 6,
    estimatedEarnings: 20,
    pathHistory: [],
  }],
  fuelCost: 0,
  fuelExpenses: [],
  commissionCost: 0,
  otherExpenses: 0,
  netEarnings: 20,
  hourlySegments: [],
};

describe('normalização de histórico', () => {
  it('alinha a contagem de viagens à lista discriminada', () => {
    const normalized = normalizeEarningRecord(baseRecord);
    expect(normalized?.tripsCount).toBe(1);
    expect(normalized?.netEarnings).toBe(20);
  });

  it('rejeita valores fora dos limites do Firestore antes de os guardar localmente', () => {
    expect(normalizeEarningRecord({ ...baseRecord, distanceKm: 100001 })).toBeNull();
    expect(normalizeEarningRecord({ ...baseRecord, grossEarnings: 1_000_001 })).toBeNull();
  });
});
