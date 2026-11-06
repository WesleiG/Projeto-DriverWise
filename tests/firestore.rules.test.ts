import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

let testEnvironment: RulesTestEnvironment;

const record = {
  id: 'rec-rules-1',
  platform: 'uber',
  date: '2026-08-27',
  startTime: '08:00',
  endTime: '09:00',
  totalHours: 1,
  passengerHours: 0.5,
  passengerDistanceKm: 5,
  emptyDistanceKm: 2,
  occupancyRatePct: 50,
  grossEarnings: 20,
  tips: 0,
  bonuses: 0,
  tollsReimbursed: 0,
  distanceKm: 7,
  tripsCount: 1,
  trips: [],
  fuelCost: 1,
  fuelExpenses: [],
  commissionCost: 0,
  commissionPct: 0,
  taxCost: 0,
  taxPct: 0,
  otherExpenses: 0,
  netEarnings: 19,
  hourlySegments: [],
  createdAt: '2026-08-27T08:00:00.000Z',
  updatedAt: '2026-08-27T09:00:00.000Z',
};

const activeShift = {
  session: {
    id: 'session-rules-1',
    originDeviceId: 'dev_rules_1',
    state: 'active',
    drivingStatus: 'stopped',
    hasPassenger: true,
    currentTripPlatform: 'uber',
    platformTripsCount: { uber: 0, bolt: 0, freenow: 0, other: 0 },
    trackingMode: 'real_gps',
    platform: 'all',
    startTime: 1787817600000,
    activeDurationSeconds: 120,
    passengerDurationSeconds: 60,
    emptyDurationSeconds: 60,
    movingDurationSeconds: 30,
    totalDistanceKm: 3.2,
    passengerDistanceKm: 2.1,
    emptyDistanceKm: 1.1,
    tripsCompletedCount: 0,
    currentSpeedKmh: 0,
    currentPosition: { lat: 38.7253, lng: -9.15, heading: 0, accuracy: 5 },
    pathHistory: [],
    currentTripPath: [],
    currentTripStartedAt: 1787817660000,
    currentTripStartDistanceKm: 1.1,
    currentTripStartEarnings: 0,
    currentTripDurationSeconds: 60,
    trips: [],
    pendingRouteGaps: [],
    estimatedEarnings: 1,
    estimatedFuelCost: 0.26,
    fuelExpenses: [],
    estimatedNetEarnings: 0.74,
    effectiveHourlyRate: 30,
  },
  updatedAt: '2026-08-27T09:00:00.000Z',
  originDeviceId: 'dev_rules_1',
};

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: 'driverwise-rules-test',
    firestore: {
      rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
    },
  });
});

afterEach(async () => {
  await testEnvironment.clearFirestore();
});

afterAll(async () => {
  await testEnvironment.cleanup();
});

describe('Firestore Rules', () => {
  it('isola os registos entre utilizadores autenticados', async () => {
    const alice = testEnvironment.authenticatedContext('alice').firestore();
    const bob = testEnvironment.authenticatedContext('bob').firestore();
    const aliceRecord = doc(alice, 'users/alice/driverwise_records/rec-rules-1');
    const bobRecord = doc(bob, 'users/alice/driverwise_records/rec-rules-1');

    await assertSucceeds(setDoc(aliceRecord, record));
    await assertFails(getDoc(bobRecord));
  });

  it('rejeita escrita sem schema completo ou na coleção legada', async () => {
    const alice = testEnvironment.authenticatedContext('alice').firestore();
    const incomplete = doc(alice, 'users/alice/driverwise_records/incomplete');
    const legacy = doc(alice, 'driverwise_records/incomplete');

    await assertFails(setDoc(incomplete, { id: 'incomplete' }));
    await assertFails(setDoc(legacy, record));
  });

  it('permite recuperar o turno apenas ao próprio utilizador', async () => {
    const alice = testEnvironment.authenticatedContext('alice').firestore();
    const bob = testEnvironment.authenticatedContext('bob').firestore();
    const aliceShift = doc(alice, 'users/alice/active_shift/current');
    const bobView = doc(bob, 'users/alice/active_shift/current');

    await assertSucceeds(setDoc(aliceShift, activeShift));
    await assertFails(getDoc(bobView));
    await assertFails(setDoc(aliceShift, { ...activeShift, session: { ...activeShift.session, estimatedEarnings: 'invalid' } }));
    await assertFails(setDoc(aliceShift, {
      ...activeShift,
      session: {
        ...activeShift.session,
        pendingRouteGaps: Array.from({ length: 1001 }, (_, index) => ({
          id: `gap-${index}`,
          start: { lat: 38.7, lng: -9.1 },
          end: { lat: 38.71, lng: -9.11 },
          startedAt: 1,
          endedAt: 2,
          hasPassenger: true,
          platform: 'uber',
        })),
      },
    }));

    await assertFails(setDoc(aliceShift, {
      ...activeShift,
      session: {
        ...activeShift.session,
        passengerDistanceKm: 4,
        totalDistanceKm: 3,
      },
    }));
  });
});
