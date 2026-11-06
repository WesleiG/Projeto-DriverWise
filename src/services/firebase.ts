import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  User,
} from 'firebase/auth';
import { EarningRecord, UserSettings } from '../types/earnings';
import { LocationPoint, ShiftSession } from '../types/session';

const firebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'driverwise-app-2026',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:716591352361:web:fb9e8013b1e454d66bea38',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'driverwise-app-2026.firebasestorage.app',
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyAtR-0ozGo-bJa6WYzwLgOhqUS3AVUH3BA',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'driverwise-app-2026.firebaseapp.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '716591352361',
  projectNumber: import.meta.env.VITE_FIREBASE_PROJECT_NUMBER || '716591352361',
};

// Inicialização segura das instâncias do Firebase
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY;
if (appCheckSiteKey && typeof window !== 'undefined') {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

// A sessão persiste no localStorage do navegador até logout explícito do condutor.
// Isto garante que o Tesla, PC ou telemóvel mantêm a sessão ativa entre reinícios.
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('Configuração de persistência de sessão:', err?.message);
});

// Coleções Firestore
const COLLECTION_RECORDS = 'driverwise_records';
const ACTIVE_SHIFT_DOCUMENT = 'active_shift/current';
const ACTIVE_SHIFT_OWNER_LEASE_MS = 15_000;
type FirestoreModule = typeof import('./firebaseFirestore');
let firestoreModulePromise: Promise<FirestoreModule> | null = null;

function loadFirestore(): Promise<FirestoreModule> {
  firestoreModulePromise ??= import('./firebaseFirestore');
  return firestoreModulePromise;
}

function omitUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => omitUndefined(item)) as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, omitUndefined(entry)])
    ) as T;
  }
  return value;
}

// ==========================================
// 🔐 SERVIÇOS DE AUTENTICAÇÃO
// ==========================================

/**
 * Iniciar sessão com Email e Palavra-passe
 */
export async function loginWithEmail(email: string, pass: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email, pass);
  return cred.user;
}

/**
 * Criar nova conta de motorista com Email e Palavra-passe
 */
export async function registerWithEmail(
  email: string,
  pass: string,
  displayName?: string
): Promise<User> {
  const cred = await createUserWithEmailAndPassword(auth, email, pass);
  if (displayName && cred.user) {
    await updateProfile(cred.user, { displayName });
  }
  return cred.user;
}

/**
 * Iniciar sessão rápida com Conta Google
 */
export async function loginWithGoogle(): Promise<User> {
  const cred = await signInWithPopup(auth, googleProvider);
  return cred.user;
}

/**
 * Terminar sessão ativa
 */
export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

/**
 * Enviar email para recuperação de palavra-passe
 */
export async function resetUserPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

/**
 * Subscrever alterações no estado de autenticação
 */
export function subscribeToAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Obter o utilizador autenticado atual
 */
export function getCurrentUser(): User | null {
  return auth.currentUser;
}

// ==========================================
// 📊 SERVIÇOS DE SINCRONIZAÇÃO FIRESTORE
// ==========================================

/**
 * Guarda ou atualiza um registo de turno na nuvem Firebase Firestore
 */
export async function syncRecordToFirebase(record: EarningRecord, userId: string): Promise<void> {
  assertAuthenticatedUser(userId);
  const firestore = await loadFirestore();
  const db = firestore.getFirestore(app);
  await firestore.setDoc(firestore.doc(db, `users/${userId}/${COLLECTION_RECORDS}`, record.id), omitUndefined(record));
}

/**
 * Sincroniza um conjunto completo de registos locais com o Firestore
 */
export async function syncAllRecordsToFirebase(records: EarningRecord[], userId: string): Promise<void> {
  assertAuthenticatedUser(userId);
  const firestore = await loadFirestore();
  const db = firestore.getFirestore(app);
  // Uma confirmação atómica evita que a subscrição receba apenas a Uber ou
  // apenas a Bolt enquanto os registos de um turno multi-plataforma chegam.
  for (let index = 0; index < records.length; index += 450) {
    const batch = firestore.writeBatch(db);
    records.slice(index, index + 450).forEach((record) => {
      batch.set(
        firestore.doc(db, `users/${userId}/${COLLECTION_RECORDS}`, record.id),
        omitUndefined(record)
      );
    });
    await batch.commit();
  }
}

/**
 * Elimina um registo no Firebase Firestore
 */
export async function deleteRecordFromFirebase(recordId: string, userId: string): Promise<void> {
  assertAuthenticatedUser(userId);
  const firestore = await loadFirestore();
  const db = firestore.getFirestore(app);
  await firestore.deleteDoc(firestore.doc(db, `users/${userId}/${COLLECTION_RECORDS}`, recordId));
}

/**
 * Obtém todos os registos do Firestore ordenados por data decrescente
 */
export async function fetchRecordsFromFirebase(userId: string): Promise<EarningRecord[]> {
  assertAuthenticatedUser(userId);
  const firestore = await loadFirestore();
  const db = firestore.getFirestore(app);
  const records: EarningRecord[] = [];
  const recordsCollection = firestore.collection(db, `users/${userId}/${COLLECTION_RECORDS}`);
  let pageQuery = firestore.query(recordsCollection, firestore.orderBy('date', 'desc'), firestore.limit(250));
  while (true) {
    const snapshot = await firestore.getDocs(pageQuery);
    records.push(...snapshot.docs.map((docSnap) => ({ ...docSnap.data(), id: docSnap.id } as EarningRecord)));
    if (snapshot.docs.length < 250) break;
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];
    pageQuery = firestore.query(
      recordsCollection,
      firestore.orderBy('date', 'desc'),
      firestore.startAfter(lastDoc),
      firestore.limit(250)
    );
  }
  return records;
}

export async function deleteAllRecordsFromFirebase(userId: string): Promise<void> {
  assertAuthenticatedUser(userId);
  const firestore = await loadFirestore();
  const db = firestore.getFirestore(app);
  const recordsCollection = firestore.collection(db, `users/${userId}/${COLLECTION_RECORDS}`);
  while (true) {
    const snapshot = await firestore.getDocs(firestore.query(recordsCollection, firestore.limit(450)));
    if (snapshot.empty) return;
    const batch = firestore.writeBatch(db);
    snapshot.docs.forEach((recordDoc) => batch.delete(recordDoc.ref));
    await batch.commit();
  }
}

/**
 * Substitui o conjunto de registos sem apagar o histórico antigo antes de a
 * nova versão estar totalmente escrita. Em caso de falha, os registos antigos
 * permanecem disponíveis e os novos ficam apenas como uma versão parcial
 * recuperável, em vez de deixar a conta vazia.
 */
export async function replaceAllRecordsInFirebase(records: EarningRecord[], userId: string): Promise<void> {
  assertAuthenticatedUser(userId);
  const existing = await fetchRecordsFromFirebase(userId);
  await syncAllRecordsToFirebase(records, userId);

  const nextIds = new Set(records.map((record) => record.id));
  const obsolete = existing.filter((record) => !nextIds.has(record.id));
  if (obsolete.length === 0) return;

  const firestore = await loadFirestore();
  const db = firestore.getFirestore(app);
  for (let index = 0; index < obsolete.length; index += 450) {
    const batch = firestore.writeBatch(db);
    obsolete.slice(index, index + 450).forEach((record) => {
      batch.delete(firestore.doc(db, `users/${userId}/${COLLECTION_RECORDS}`, record.id));
    });
    await batch.commit();
  }
}

/**
 * Guarda as definições do utilizador no Firestore
 */
export async function syncSettingsToFirebase(settings: UserSettings, userId: string): Promise<void> {
  assertAuthenticatedUser(userId);
  const firestore = await loadFirestore();
  const db = firestore.getFirestore(app);
  await firestore.setDoc(firestore.doc(db, `users/${userId}/settings/config`), omitUndefined(settings));
}

/**
 * Carrega as definições do utilizador a partir do Firestore
 */
export async function fetchSettingsFromFirebase(userId: string): Promise<UserSettings | null> {
  assertAuthenticatedUser(userId);
  const firestore = await loadFirestore();
  const db = firestore.getFirestore(app);
  const docSnap = await firestore.getDoc(firestore.doc(db, `users/${userId}/settings/config`));
  return docSnap.exists() ? docSnap.data() as UserSettings : null;
}

/**
 * Subscreve atualizações em tempo real dos registos
 */
export function subscribeToRecords(
  userId: string,
  onUpdate: (records: EarningRecord[]) => void,
  onError?: (error: Error) => void
): Promise<() => void> {
  assertAuthenticatedUser(userId);
  return loadFirestore().then((firestore) => {
    const db = firestore.getFirestore(app);
    const q = firestore.query(
      firestore.collection(db, `users/${userId}/${COLLECTION_RECORDS}`),
      firestore.orderBy('date', 'desc')
    );
    return firestore.onSnapshot(
      q,
      (snapshot) => {
        onUpdate(snapshot.docs.map((docSnap) => ({ ...docSnap.data(), id: docSnap.id } as EarningRecord)));
      },
      (err) => {
        console.warn('Erro na subscrição do Firestore:', err);
        onError?.(err);
      }
    );
  });
}

export interface ActiveShiftSnapshot {
  session: ShiftSession;
  updatedAt: string;
  originDeviceId?: string;
  revision?: number;
}

export function getDeviceId(): string {
  let deviceId = localStorage.getItem('driverwise_device_id');
  if (!deviceId) {
    deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    localStorage.setItem('driverwise_device_id', deviceId);
  }
  return deviceId;
}

function compactActiveShiftSession(session: ShiftSession): ShiftSession {
  const compactPathWithAnchor = (path: LocationPoint[] | undefined, maxPoints: number): LocationPoint[] => {
    const points = path || [];
    if (points.length <= maxPoints) return points;
    return [points[0], ...points.slice(-(maxPoints - 1))];
  };

  return omitUndefined({
    ...session,
    pathHistory: compactPathWithAnchor(session.pathHistory, 200),
    currentTripPath: compactPathWithAnchor(session.currentTripPath, 500),
    fuelExpenses: (session.fuelExpenses || []).slice(-100),
    pendingRouteGaps: session.pendingRouteGaps || [],
    trips: (session.trips || []).slice(-50).map((trip) => {
      const compactTrip = {
        ...trip,
        pathHistory: compactPathWithAnchor(trip.pathHistory, 100),
      };
      // As rotas completas ficam no registo final; não arriscar exceder o
      // limite de 1 MiB do documento de recuperação durante um turno longo.
      delete compactTrip.encodedPath;
      return compactTrip;
    }),
  });
}

/** Guarda o turno ativo para permitir recuperação noutro dispositivo autenticado. */
export async function syncActiveShiftToFirebase(session: ShiftSession, userId: string): Promise<void> {
  assertAuthenticatedUser(userId);
  if (session.state !== 'active' && session.state !== 'paused') return;
  const firestore = await loadFirestore();
  const db = firestore.getFirestore(app);
  const sessionRef = firestore.doc(db, `users/${userId}/${ACTIVE_SHIFT_DOCUMENT}`);
  const ownerDeviceId = session.originDeviceId || getDeviceId();
  const incomingSession = compactActiveShiftSession({
    ...session,
    originDeviceId: ownerDeviceId,
    revision: Math.max(0, Math.floor(session.revision || 0)),
  });
  const updatedAt = new Date().toISOString();

  await firestore.runTransaction(db, async (transaction) => {
    const currentSnapshot = await transaction.get(sessionRef);
    if (currentSnapshot.exists()) {
      const currentData = currentSnapshot.data() as Partial<ActiveShiftSnapshot>;
      const currentSession = currentData.session;
      const currentRevision = Math.max(
        0,
        Math.floor(Number(currentData.revision ?? currentSession?.revision ?? 0))
      );
      const incomingRevision = Math.max(0, Math.floor(incomingSession.revision || 0));
      const currentOwner = currentData.originDeviceId || currentSession?.originDeviceId;
      const currentUpdatedAt = Date.parse(currentData.updatedAt || '');
      const leaseExpired = !Number.isFinite(currentUpdatedAt)
        || Date.now() - currentUpdatedAt >= ACTIVE_SHIFT_OWNER_LEASE_MS;

      if (currentRevision > incomingRevision) {
        throw new Error('A sessão remota já possui uma versão mais recente.');
      }
      if (currentOwner && currentOwner !== ownerDeviceId && !leaseExpired) {
        throw new Error('A sessão está a ser atualizada noutro dispositivo.');
      }
    }

    transaction.set(sessionRef, omitUndefined({
      session: incomingSession,
      revision: incomingSession.revision || 0,
      updatedAt,
      originDeviceId: ownerDeviceId,
    }));
  });
}

/** Obtém o turno ativo remoto do próprio utilizador, se existir. */
export async function fetchActiveShiftFromFirebase(userId: string): Promise<ActiveShiftSnapshot | null> {
  assertAuthenticatedUser(userId);
  const firestore = await loadFirestore();
  const db = firestore.getFirestore(app);
  const snapshot = await firestore.getDoc(firestore.doc(db, `users/${userId}/${ACTIVE_SHIFT_DOCUMENT}`));
  if (!snapshot.exists()) return null;
  const data = snapshot.data() as Partial<ActiveShiftSnapshot>;
  if (!data.session || typeof data.updatedAt !== 'string') return null;
  return {
    session: data.session,
    updatedAt: data.updatedAt,
    originDeviceId: data.originDeviceId,
    revision: Number.isFinite(data.revision as number) ? data.revision as number : undefined,
  };
}

/** Subscreve o turno ativo remoto, limitado ao documento do utilizador autenticado. */
export function subscribeToActiveShift(
  userId: string,
  onUpdate: (snapshot: ActiveShiftSnapshot | null) => void,
  onError?: (error: Error) => void
): Promise<() => void> {
  assertAuthenticatedUser(userId);
  return loadFirestore().then((firestore) => {
    const db = firestore.getFirestore(app);
    return firestore.onSnapshot(
      firestore.doc(db, `users/${userId}/${ACTIVE_SHIFT_DOCUMENT}`),
      (snapshot) => {
        if (!snapshot.exists()) {
          onUpdate(null);
          return;
        }
        const data = snapshot.data() as Partial<ActiveShiftSnapshot>;
        if (data.session && typeof data.updatedAt === 'string') {
          onUpdate({
            session: data.session,
            updatedAt: data.updatedAt,
            originDeviceId: data.originDeviceId,
            revision: Number.isFinite(data.revision as number) ? data.revision as number : undefined,
          });
        }
      },
      (error) => {
        console.warn('Erro na subscrição do turno ativo:', error);
        onError?.(error);
      }
    );
  });
}

/** Remove o turno ativo remoto ao finalizar ou descartar o turno. */
export async function clearActiveShiftFromFirebase(userId: string, expectedOwnerDeviceId = getDeviceId()): Promise<void> {
  assertAuthenticatedUser(userId);
  const firestore = await loadFirestore();
  const db = firestore.getFirestore(app);
  const sessionRef = firestore.doc(db, `users/${userId}/${ACTIVE_SHIFT_DOCUMENT}`);
  await firestore.runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(sessionRef);
    if (!snapshot.exists()) return;
    const data = snapshot.data() as Partial<ActiveShiftSnapshot>;
    const currentOwner = data.originDeviceId || data.session?.originDeviceId;
    if (currentOwner && currentOwner !== expectedOwnerDeviceId) return;
    transaction.delete(sessionRef);
  });
}

function assertAuthenticatedUser(userId: string): void {
  if (!userId || auth.currentUser?.uid !== userId) {
    throw new Error('É necessário um utilizador autenticado válido para aceder aos dados.');
  }
}
