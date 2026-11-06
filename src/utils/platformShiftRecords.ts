import { EarningRecord, FuelExpense, PlatformType } from '../types/earnings';
import { TripDetail } from '../types/session';

export type PlatformRecordDraft = Omit<EarningRecord, 'id' | 'createdAt' | 'updatedAt' | 'netEarnings'>;

export interface FinishedShiftData {
  platform: PlatformType;
  date: string;
  startTime: string;
  endTime: string;
  totalHours: number;
  passengerHours: number;
  passengerDistanceKm: number;
  emptyDistanceKm: number;
  occupancyRatePct: number;
  grossEarnings: number;
  fuelCost: number;
  distanceKm: number;
  tripsCount: number;
  platformTripsCount?: Partial<Record<PlatformType, number>>;
  trips?: TripDetail[];
  fuelExpenses?: FuelExpense[];
}

export interface UniversalShiftCosts {
  fuelCost: number;
  otherExpenses: number;
  commissionPct: number;
  taxPct: number;
}

const PLATFORM_ORDER: PlatformType[] = ['uber', 'bolt', 'freenow', 'other'];

const nonNegative = (value: number | undefined): number =>
  Number.isFinite(value) ? Math.max(0, value as number) : 0;

const round2 = (value: number): number => Number(value.toFixed(2));

/** Distribui um total sem perder cêntimos por arredondamento. */
function distribute(total: number, weights: number[]): number[] {
  const safeTotal = round2(nonNegative(total));
  const safeWeights = weights.map(nonNegative);
  const weightTotal = safeWeights.reduce((sum, value) => sum + value, 0);
  if (safeWeights.length === 0) return [];
  if (weightTotal <= 0) {
    const values = safeWeights.map(() => round2(safeTotal / safeWeights.length));
    values[values.length - 1] = round2(Math.max(0, safeTotal - values.slice(0, -1).reduce((sum, value) => sum + value, 0)));
    return values;
  }

  const values = safeWeights.map((weight) => round2(safeTotal * weight / weightTotal));
  const partialTotal = values.slice(0, -1).reduce((sum, value) => sum + value, 0);
  values[values.length - 1] = round2(Math.max(0, safeTotal - partialTotal));
  return values;
}

function platformLabel(platform: PlatformType): string {
  return platform === 'freenow' ? 'FreeNow' : platform === 'other' ? 'Outra' : platform.toUpperCase();
}

/**
 * Converte um turno agregado em rascunhos por plataforma. Cada viagem fica
 * exclusivamente no registo da plataforma onde ocorreu e os totais globais
 * são distribuídos uma única vez.
 */
export function buildPlatformRecordDrafts(input: FinishedShiftData): PlatformRecordDraft[] {
  const trips = Array.isArray(input.trips) ? input.trips : [];
  const platformCounts = input.platformTripsCount || {};
  const groupedTrips = new Map<PlatformType, TripDetail[]>();

  trips.forEach((trip) => {
    const platform = PLATFORM_ORDER.includes(trip.platform) ? trip.platform : 'other';
    groupedTrips.set(platform, [...(groupedTrips.get(platform) || []), trip]);
  });

  const platforms = PLATFORM_ORDER.filter((platform) =>
    (groupedTrips.get(platform)?.length || 0) > 0 || nonNegative(platformCounts[platform]) > 0
  );
  if (platforms.length === 0) {
    platforms.push(PLATFORM_ORDER.includes(input.platform) ? input.platform : 'other');
  }

  const stats = platforms.map((platform) => {
    const platformTrips = groupedTrips.get(platform) || [];
    const distanceKm = platformTrips.reduce((sum, trip) => sum + nonNegative(trip.distanceKm), 0);
    const passengerSeconds = platformTrips.reduce((sum, trip) => sum + nonNegative(trip.durationSeconds), 0);
    const grossEarnings = platformTrips.reduce((sum, trip) => sum + nonNegative(trip.estimatedEarnings), 0);
    const tripsCount = Math.max(platformTrips.length, Math.floor(nonNegative(platformCounts[platform])));
    return { platform, trips: platformTrips, distanceKm, passengerSeconds, grossEarnings, tripsCount };
  });

  const totalHours = nonNegative(input.totalHours);
  const passengerHours = Math.min(totalHours, nonNegative(input.passengerHours));
  const totalDistanceKm = Math.max(nonNegative(input.distanceKm), nonNegative(input.passengerDistanceKm));
  const passengerDistanceKm = Math.min(totalDistanceKm, nonNegative(input.passengerDistanceKm));
  const emptyDistanceKm = Math.max(0, totalDistanceKm - passengerDistanceKm);
  const emptyHours = Math.max(0, totalHours - passengerHours);
  const fallbackWeights = stats.map((stat) => stat.distanceKm || stat.passengerSeconds || stat.tripsCount || 1);
  const passengerDistanceWeights = stats.map((stat) => stat.distanceKm || stat.passengerSeconds || stat.tripsCount || 1);
  const passengerHoursWeights = stats.map((stat) => stat.passengerSeconds || stat.distanceKm || stat.tripsCount || 1);
  const grossWeights = stats.map((stat) => stat.grossEarnings || stat.distanceKm || stat.passengerSeconds || stat.tripsCount || 1);
  const recordDistanceWeights = stats.map((_stat, index) =>
    (passengerDistanceKm > 0
      ? passengerDistanceKm * passengerDistanceWeights[index] / passengerDistanceWeights.reduce((sum, value) => sum + value, 0)
      : 0) + fallbackWeights[index]
  );

  const allocatedPassengerDistance = distribute(passengerDistanceKm, passengerDistanceWeights);
  const allocatedPassengerHours = distribute(passengerHours, passengerHoursWeights);
  const allocatedEmptyDistance = distribute(emptyDistanceKm, fallbackWeights);
  const allocatedEmptyHours = distribute(emptyHours, fallbackWeights);
  const allocatedGross = distribute(input.grossEarnings, grossWeights);
  const allocatedFuel = distribute(input.fuelCost, recordDistanceWeights);
  const sourceExpenses = (input.fuelExpenses || []).filter((expense) => nonNegative(expense.amount) > 0);
  const allocatedExpenses = platforms.map(() => [] as FuelExpense[]);

  sourceExpenses.forEach((expense) => {
    const amountParts = distribute(expense.amount, fallbackWeights);
    const quantityParts = expense.quantity !== undefined ? distribute(expense.quantity, fallbackWeights) : [];
    amountParts.forEach((amount, index) => {
      if (amount <= 0) return;
      allocatedExpenses[index].push({
        ...expense,
        id: `${expense.id.slice(0, 110)}-${stats[index].platform}`,
        amount,
        ...(quantityParts.length > 0 ? { quantity: quantityParts[index] } : {}),
      });
    });
  });

  return stats.map((stat, index) => {
    const platformPassengerHours = allocatedPassengerHours[index];
    const platformTotalHours = round2(platformPassengerHours + allocatedEmptyHours[index]);
    const platformPassengerDistance = allocatedPassengerDistance[index];
    const platformDistance = round2(platformPassengerDistance + allocatedEmptyDistance[index]);
    const tripsCount = stat.tripsCount;
    return {
      platform: stat.platform,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      totalHours: platformTotalHours,
      passengerHours: Math.min(platformTotalHours, platformPassengerHours),
      passengerDistanceKm: platformPassengerDistance,
      emptyDistanceKm: allocatedEmptyDistance[index],
      occupancyRatePct: platformTotalHours > 0 ? Math.min(100, Math.round((platformPassengerHours / platformTotalHours) * 100)) : 0,
      grossEarnings: allocatedGross[index],
      tips: 0,
      bonuses: 0,
      tollsReimbursed: 0,
      distanceKm: platformDistance,
      tripsCount,
      trips: stat.trips,
      fuelCost: allocatedFuel[index],
      fuelExpenses: allocatedExpenses[index],
      commissionCost: 0,
      commissionPct: 0,
      taxCost: 0,
      taxPct: 0,
      otherExpenses: 0,
      hourlySegments: [],
      notes: `Turno ${input.startTime} - ${input.endTime} • ${tripsCount} viagens ${platformLabel(stat.platform)}`,
    };
  });
}

/**
 * Aplica custos definidos para o turno inteiro aos seus registos por
 * plataforma. Os totais são repartidos uma única vez e preservam os
 * cêntimos, evitando que o histórico duplique despesas universais.
 */
export function applyUniversalShiftCosts(
  drafts: PlatformRecordDraft[],
  costs: UniversalShiftCosts
): PlatformRecordDraft[] {
  if (drafts.length === 0) return [];

  const safePct = (value: number): number => Math.min(100, nonNegative(value));
  const grossWeights = drafts.map((draft) => nonNegative(draft.grossEarnings));
  const fuelWeights = drafts.map((draft) =>
    nonNegative(draft.distanceKm) || nonNegative(draft.tripsCount) || 1
  );
  const structuredFuelTotal = drafts.reduce((total, draft) => total + (draft.fuelExpenses || [])
    .reduce((subtotal, expense) => subtotal + nonNegative(expense.amount), 0), 0);
  const fuelTotal = Math.max(nonNegative(costs.fuelCost), round2(structuredFuelTotal));
  const otherTotal = nonNegative(costs.otherExpenses);
  const totalGross = grossWeights.reduce((sum, value) => sum + value, 0);
  const commissionPct = safePct(costs.commissionPct);
  const taxPct = safePct(costs.taxPct);
  const commissionTotal = round2(totalGross * commissionPct / 100);
  const taxTotal = round2(totalGross * taxPct / 100);
  const fuelParts = distribute(fuelTotal, fuelWeights);
  const otherParts = distribute(otherTotal, grossWeights);
  const commissionParts = distribute(commissionTotal, grossWeights);
  const taxParts = distribute(taxTotal, grossWeights);

  return drafts.map((draft, index) => ({
    ...draft,
    fuelCost: fuelParts[index],
    otherExpenses: otherParts[index],
    commissionPct,
    commissionCost: commissionParts[index],
    taxPct,
    taxCost: taxParts[index],
  }));
}
