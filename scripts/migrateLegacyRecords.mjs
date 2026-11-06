import fs from 'node:fs';
import path from 'node:path';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const targetUid = process.env.MIGRATION_TARGET_UID?.trim();
if (!targetUid || !/^[A-Za-z0-9:_-]{1,128}$/.test(targetUid)) {
  console.error('Defina MIGRATION_TARGET_UID com o UID Firebase alvo.');
  process.exit(1);
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_CLOUD_PROJECT && !process.env.FIREBASE_CONFIG) {
  console.error('Configure ADC/GOOGLE_APPLICATION_CREDENTIALS fora do projeto.');
  process.exit(1);
}
if (getApps().length === 0) initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID || 'driverwise-app-2026' });

const db = getFirestore();
const legacySnapshot = await db.collection('driverwise_records').get();
const records = legacySnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
const backupDir = path.join(process.cwd(), 'scripts', 'backups');
fs.mkdirSync(backupDir, { recursive: true });
const backupPath = path.join(backupDir, `legacy-records-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(backupPath, JSON.stringify(records, null, 2), { encoding: 'utf8', mode: 0o600 });
console.log(`Backup criado: ${backupPath}`);

if (process.env.APPLY_MIGRATION !== 'true') {
  console.log(`Dry-run: ${records.length} registos encontrados. Defina APPLY_MIGRATION=true para copiar para o UID alvo.`);
  process.exit(0);
}

const validDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return date.getFullYear() === Number(value.slice(0, 4))
    && date.getMonth() + 1 === Number(value.slice(5, 7))
    && date.getDate() === Number(value.slice(8, 10));
};
const validTime = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const nonNegative = (value, max = 1_000_000) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(0, number)) : 0;
};
const safeId = (value, index) => {
  const original = String(value || '');
  if (/^[A-Za-z0-9_-]{1,120}$/.test(original)) return original;
  return `legacy-${Buffer.from(`${index}:${original}`).toString('hex').slice(0, 110)}`;
};

function normalizeRecord(raw, index) {
  if (!validDate(raw.date)) return null;
  const totalHours = nonNegative(raw.totalHours, 100);
  const passengerHours = Math.min(totalHours, nonNegative(raw.passengerHours, 100));
  const distanceKm = nonNegative(raw.distanceKm, 100_000);
  const passengerDistanceKm = Math.min(distanceKm, nonNegative(raw.passengerDistanceKm, 100_000));
  const emptyDistanceKm = Math.min(distanceKm - passengerDistanceKm, nonNegative(raw.emptyDistanceKm, 100_000));
  const grossEarnings = nonNegative(raw.grossEarnings);
  const tips = nonNegative(raw.tips);
  const bonuses = nonNegative(raw.bonuses);
  const tollsReimbursed = nonNegative(raw.tollsReimbursed);
  const fuelCost = nonNegative(raw.fuelCost);
  const commissionCost = nonNegative(raw.commissionCost);
  const otherExpenses = nonNegative(raw.otherExpenses);
  const trips = Array.isArray(raw.trips) ? raw.trips.slice(0, 1000) : [];
  const fuelExpenses = Array.isArray(raw.fuelExpenses) ? raw.fuelExpenses.slice(0, 1000) : [];
  const hourlySegments = Array.isArray(raw.hourlySegments) ? raw.hourlySegments.slice(0, 1000) : [];
  const platform = ['uber', 'bolt', 'freenow', 'other'].includes(raw.platform) ? raw.platform : 'other';
  const now = new Date().toISOString();

  return {
    id: safeId(raw.id, index),
    platform,
    date: raw.date,
    startTime: validTime(raw.startTime) ? raw.startTime : '00:00',
    endTime: validTime(raw.endTime) ? raw.endTime : '00:00',
    totalHours,
    passengerHours,
    passengerDistanceKm,
    emptyDistanceKm,
    occupancyRatePct: totalHours > 0 ? Math.min(100, Math.round((passengerHours / totalHours) * 100)) : 0,
    grossEarnings,
    tips,
    bonuses,
    tollsReimbursed,
    distanceKm,
    tripsCount: Math.min(10_000, Math.floor(nonNegative(raw.tripsCount, 10_000))),
    trips,
    fuelCost,
    fuelExpenses,
    commissionCost,
    otherExpenses,
    netEarnings: Number((grossEarnings + tips + bonuses + tollsReimbursed - fuelCost - commissionCost - otherExpenses).toFixed(2)),
    hourlySegments,
    ...(typeof raw.notes === 'string' && raw.notes.trim() ? { notes: raw.notes.trim().slice(0, 2000) } : {}),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
  };
}

const target = db.collection('users').doc(targetUid).collection('driverwise_records');
let migrated = 0;
for (const [index, legacyRecord] of records.entries()) {
  const record = normalizeRecord(legacyRecord, index);
  if (!record) {
    console.warn(`Registo legado ignorado por data inválida: ${legacyRecord.id}`);
    continue;
  }
  await target.doc(record.id).set(record);
  migrated += 1;
}
console.log(`Migração concluída: ${migrated}/${records.length} registos copiados. A coleção legada deve ser bloqueada pelas Rules.`);
