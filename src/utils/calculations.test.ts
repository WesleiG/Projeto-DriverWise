import { describe, expect, it } from 'vitest';
import {
  calculateEarningsSummary,
  calculateActiveTripMetrics,
  calculateHoursBetween,
  calculateNetEarnings,
  getHoursCoveredByShift,
  getObservedFuelCostPerKm,
  DEFAULT_SETTINGS,
} from './calculations';
import { EarningRecord } from '../types/earnings';

const record = (overrides: Partial<EarningRecord> = {}): EarningRecord => ({
  id: 'test-record',
  platform: 'uber',
  date: '2026-08-27',
  startTime: '08:00',
  endTime: '16:30',
  totalHours: 8.5,
  passengerHours: 5,
  passengerDistanceKm: 70,
  emptyDistanceKm: 30,
  occupancyRatePct: 59,
  grossEarnings: 100,
  tips: 10,
  bonuses: 5,
  tollsReimbursed: 4,
  distanceKm: 100,
  tripsCount: 10,
  trips: [],
  fuelCost: 8,
  fuelExpenses: [],
  commissionCost: 3,
  otherExpenses: 2,
  netEarnings: 0,
  createdAt: '2026-08-27T08:00:00.000Z',
  updatedAt: '2026-08-27T08:00:00.000Z',
  ...overrides,
});

describe('cálculos financeiros', () => {
  it('mantém km, duração e ganho da viagem consistentes ao recuperar o estado', () => {
    const metrics = calculateActiveTripMetrics({
      totalDistanceKm: 112.346,
      startDistanceKm: 100,
      currentEarnings: 75,
      startEarnings: 20,
      trackedDurationSeconds: 0,
      startedAt: 1_000_000,
      now: 1_125_000,
      costPerKm: 0.08,
    });
    expect(metrics.distanceKm).toBe(12.35);
    expect(metrics.durationSeconds).toBe(125);
    expect(metrics.grossEarnings).toBe(55);
    expect(metrics.fuelCost).toBe(0.99);
    expect(metrics.netEarnings).toBe(54.01);
  });

  it('inclui portagens reembolsadas e não mascara prejuízo', () => {
    expect(calculateNetEarnings(100, 10, 5, 8, 3, 2, 4)).toBe(106);
    expect(calculateNetEarnings(0, 0, 0, 10, 0, 0)).toBe(-10);
    expect(calculateNetEarnings(100, 0, 0, 0, 10, 0, 0, 5)).toBe(85);
  });

  it('valida horários e suporta turnos noturnos', () => {
    expect(calculateHoursBetween('22:00', '02:30')).toBe(4.5);
    expect(calculateHoursBetween('08:00', '08:00')).toBe(0);
    expect(calculateHoursBetween('25:00', '02:30')).toBe(0);
    expect(getHoursCoveredByShift('08:00', '16:30')).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16]);
    expect(getHoursCoveredByShift('23:30', '00:15')).toEqual([23, 0]);
  });

  it('recalcula o líquido armazenado em vez de confiar num valor obsoleto', () => {
    const summary = calculateEarningsSummary([record({ netEarnings: 999 })], DEFAULT_SETTINGS);
    expect(summary.totalGross).toBe(119);
    expect(summary.totalNet).toBe(106);
    expect(summary.avgHourlyGross).toBe(23.8);
    expect(summary.avgHourlyNet).toBe(21.2);
    expect(summary.avgKmRate).toBe(1.7);
    expect(summary.avgNetKmRate).toBe(1.51);
    expect(summary.bestHourlyKmRate).toBeGreaterThan(0);
  });

  it('estima o custo real por km com base no histórico e não duplica abastecimentos', () => {
    expect(getObservedFuelCostPerKm([record({ fuelCost: 8, fuelExpenses: [{
      id: 'fuel-1',
      amount: 25,
      createdAt: '2026-08-27T10:00:00.000Z',
    }] })])).toBe(0.25);
    expect(getObservedFuelCostPerKm([record({ distanceKm: 0, fuelCost: 25 })])).toBeNull();
  });

  it('limita horas e quilómetros de passageiro aos totais', () => {
    const summary = calculateEarningsSummary([record({ passengerHours: 20, passengerDistanceKm: 200 })], DEFAULT_SETTINGS);
    expect(summary.totalPassengerHours).toBe(8.5);
    expect(summary.totalPassengerKm).toBe(100);
    expect(summary.avgOccupancyRate).toBe(100);
  });

  it('não inventa indicadores quando não existem dados', () => {
    const summary = calculateEarningsSummary([], DEFAULT_SETTINGS);
    expect(summary.totalGross).toBe(0);
    expect(summary.avgHourlyGross).toBe(0);
    expect(summary.avgHourlyKm).toBe(0);
    expect(summary.bestHourlyWindow).toBe('—');
    expect(summary.bestDayOfWeek).toBe('—');
    expect(summary.hotspotZones).toEqual([]);
    expect(summary.hourlyBreakdown.every((item) => item.sampleCount === 0 && item.avgHourlyRate === 0)).toBe(true);
  });

  it('inclui despesas de combustível discriminadas sem as duplicar', () => {
    const summary = calculateEarningsSummary([record({
      fuelCost: 20,
      fuelExpenses: [{ id: 'fuel-1', amount: 20, quantity: 10, unit: 'liters', createdAt: '2026-08-27T10:00:00.000Z' }],
    })], DEFAULT_SETTINGS);
    expect(summary.totalFuelCost).toBe(20);
    expect(summary.totalNet).toBe(94);
  });

  it('preserva zeros reais e calcula a rentabilidade só sobre tempo útil', () => {
    const summary = calculateEarningsSummary([record({
      totalHours: 8,
      passengerHours: 2,
      grossEarnings: 40,
      tips: 0,
      bonuses: 0,
      tollsReimbursed: 0,
      fuelCost: 0,
      commissionCost: 0,
      otherExpenses: 0,
      taxCost: 0,
      distanceKm: 80,
      passengerDistanceKm: 40,
      emptyDistanceKm: 40,
    })], DEFAULT_SETTINGS);

    expect(summary.totalNet).toBe(40);
    expect(summary.avgHourlyGross).toBe(20);
    expect(summary.avgHourlyNet).toBe(20);
  });
});
