import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const targetUid = process.env.SEED_USER_UID?.trim();
if (!targetUid || !/^[A-Za-z0-9:_-]{1,128}$/.test(targetUid)) {
  console.error('Defina SEED_USER_UID com o UID Firebase alvo.');
  process.exit(1);
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_CLOUD_PROJECT && !process.env.FIREBASE_CONFIG) {
  console.error('Configure ADC/GOOGLE_APPLICATION_CREDENTIALS fora do projeto.');
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID || 'driverwise-app-2026',
  });
}

const db = getFirestore();
const recordsToSeed = [
  {
    id: 'rec-uber-20260825', platform: 'uber', date: '2026-08-25', startTime: '12:17', endTime: '00:17',
    totalHours: 12, passengerHours: 8, occupancyRatePct: 67, distanceKm: 185.4,
    passengerDistanceKm: 133, emptyDistanceKm: 52.4, tripsCount: 16, grossEarnings: 110.01,
    tips: 0, bonuses: 0, tollsReimbursed: 0, fuelCost: 19.39, fuelExpenses: [], trips: [], hourlySegments: [], commissionCost: 0,
    otherExpenses: 0, netEarnings: 90.62, notes: 'Dados de desenvolvimento; confirme antes de utilizar.',
    createdAt: '2026-08-25T12:17:00.000Z', updatedAt: '2026-08-26T12:30:00.000Z',
  },
  {
    id: 'rec-bolt-20260822', platform: 'bolt', date: '2026-08-22', startTime: '12:00', endTime: '00:00',
    totalHours: 12, passengerHours: 2, occupancyRatePct: 17, distanceKm: 90,
    passengerDistanceKm: 65, emptyDistanceKm: 25, tripsCount: 10, grossEarnings: 40.98,
    tips: 0, bonuses: 0, tollsReimbursed: 0, fuelCost: 7.2, fuelExpenses: [], trips: [], hourlySegments: [], commissionCost: 0,
    otherExpenses: 0, netEarnings: 33.78, notes: 'Dados de desenvolvimento; confirme antes de utilizar.',
    createdAt: '2026-08-22T12:00:00.000Z', updatedAt: '2026-08-26T12:30:00.000Z',
  },
];

async function seed() {
  const collection = db.collection('users').doc(targetUid).collection('driverwise_records');
  for (const record of recordsToSeed) {
    await collection.doc(record.id).set(record);
    console.log(`Registo ${record.platform.toUpperCase()} (${record.date}) gravado para o UID configurado.`);
  }
}

seed().catch((error) => {
  console.error('Erro ao enviar dados para o Firestore:', error.message);
  process.exit(1);
});
