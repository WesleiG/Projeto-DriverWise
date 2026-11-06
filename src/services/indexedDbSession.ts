import { ShiftSession, LocationPoint } from '../types/session';

const DB_NAME = 'driverwise_db';
const DB_VERSION = 2;

const STORE_SESSION = 'active_session';
const STORE_BREADCRUMBS = 'gps_breadcrumbs';
const STORE_HEARTBEAT = 'heartbeat_log';

function sessionKey(userId: string): string {
  return `current_active_shift:${userId}`;
}

function compactPathWithAnchor(path: LocationPoint[] | undefined, maxPoints: number): LocationPoint[] {
  const points = path || [];
  if (points.length <= maxPoints) return points;
  return [points[0], ...points.slice(-(maxPoints - 1))];
}

// O percurso completo pode crescer durante várias horas. Guardar todos os
// pontos em cada checkpoint cria cópias grandes no IndexedDB e no localStorage.
// O histórico detalhado continua a ser sincronizado separadamente; a sessão
// de recuperação só precisa de uma janela recente para retomar o tracking.
function compactSessionForPersistence(session: ShiftSession): ShiftSession {
  return {
    ...session,
    pathHistory: compactPathWithAnchor(session.pathHistory, 200),
    currentTripPath: compactPathWithAnchor(session.currentTripPath, 500),
    trips: (session.trips || []).slice(-100).map((trip) => ({
      ...trip,
      pathHistory: compactPathWithAnchor(trip.pathHistory, 100),
    })),
    fuelExpenses: (session.fuelExpenses || []).slice(-100),
    pendingRouteGaps: session.pendingRouteGaps || [],
  };
}

// Singleton de ligação aberta à base de dados para evitar fugas de memória no Chromium
let cachedDb: IDBDatabase | null = null;
let pendingDbPromise: Promise<IDBDatabase> | null = null;

/**
 * Abre ou reutiliza a ligação singleton IndexedDB
 */
function openDatabase(): Promise<IDBDatabase> {
  if (cachedDb) {
    return Promise.resolve(cachedDb);
  }

  if (pendingDbPromise) {
    return pendingDbPromise;
  }

  pendingDbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      pendingDbPromise = null;
      reject(new Error('IndexedDB não suportado neste ambiente'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. Store para o estado ativo da sessão
      if (!db.objectStoreNames.contains(STORE_SESSION)) {
        db.createObjectStore(STORE_SESSION, { keyPath: 'key' });
      }

      // 2. Store para os pontos de telemetria GPS (breadcrumbs)
      if (!db.objectStoreNames.contains(STORE_BREADCRUMBS)) {
        const breadcrumbStore = db.createObjectStore(STORE_BREADCRUMBS, {
          keyPath: 'id',
          autoIncrement: true,
        });
        breadcrumbStore.createIndex('timestamp', 'timestamp', { unique: false });
        breadcrumbStore.createIndex('userId', 'userId', { unique: false });
      } else {
        const breadcrumbStore = (event.target as IDBOpenDBRequest).transaction?.objectStore(STORE_BREADCRUMBS);
        if (breadcrumbStore && !breadcrumbStore.indexNames.contains('userId')) {
          breadcrumbStore.createIndex('userId', 'userId', { unique: false });
        }
      }

      // 3. Store para o log de pulso (heartbeat)
      if (!db.objectStoreNames.contains(STORE_HEARTBEAT)) {
        db.createObjectStore(STORE_HEARTBEAT, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      cachedDb = request.result;
      pendingDbPromise = null;

      cachedDb.onversionchange = () => {
        cachedDb?.close();
        cachedDb = null;
      };

      cachedDb.onclose = () => {
        cachedDb = null;
      };

      resolve(cachedDb);
    };

    request.onerror = () => {
      pendingDbPromise = null;
      reject(request.error);
    };
  });

  return pendingDbPromise;
}

/**
 * Guarda o estado da sessão ativa no IndexedDB de forma assíncrona
 */
export async function saveSessionToIndexedDb(session: ShiftSession, userId: string): Promise<void> {
  if (!userId) return;
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SESSION, 'readwrite');
      const store = tx.objectStore(STORE_SESSION);

      const record = {
        key: sessionKey(userId),
        session: compactSessionForPersistence(session),
        lastHeartbeat: Date.now(),
      };

      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transação IndexedDB abortada'));
    });
  } catch (error) {
    console.warn('Falha ao gravar sessão no IndexedDB:', error);
  }
}

/**
 * Recupera a sessão ativa do IndexedDB
 */
export async function getSessionFromIndexedDb(userId: string): Promise<{
  session: ShiftSession;
  lastHeartbeat: number;
} | null> {
  if (!userId) return null;
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SESSION, 'readonly');
      const store = tx.objectStore(STORE_SESSION);

      const getRequest = store.get(sessionKey(userId));
      getRequest.onsuccess = () => {
        const res = getRequest.result;
        if (res && res.session) {
          resolve({
            session: res.session as ShiftSession,
            lastHeartbeat: res.lastHeartbeat || Date.now(),
          });
        } else {
          resolve(null);
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  } catch (error) {
    console.warn('Falha ao obter sessão do IndexedDB:', error);
    return null;
  }
}

/**
 * Remove a sessão ativa do IndexedDB após o encerramento do turno
 */
export async function clearSessionFromIndexedDb(userId: string): Promise<void> {
  if (!userId) return;
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_SESSION, STORE_BREADCRUMBS], 'readwrite');
      const sessionStore = tx.objectStore(STORE_SESSION);
      const breadcrumbStore = tx.objectStore(STORE_BREADCRUMBS);

      sessionStore.delete(sessionKey(userId));
      const userIndex = breadcrumbStore.index('userId');
      const cursorRequest = userIndex.openCursor(IDBKeyRange.only(userId));
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.warn('Falha ao limpar sessão do IndexedDB:', error);
  }
}

let lastBreadcrumbSavedAt = 0;

/**
 * Adiciona um ponto de localização georreferenciado ao log de breadcrumbs (com throttle de 10s)
 */
export async function appendGpsBreadcrumb(point: LocationPoint, userId: string): Promise<void> {
  if (!userId) return;
  const now = Date.now();
  if (now - lastBreadcrumbSavedAt < 10000) return; // Throttle para poupar I/O no Tesla
  lastBreadcrumbSavedAt = now;
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BREADCRUMBS, 'readwrite');
      const store = tx.objectStore(STORE_BREADCRUMBS);

      store.add({
        ...point,
        userId,
        savedAt: now,
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.warn('Falha ao registar breadcrumb GPS:', error);
  }
}

/**
 * Emite um pulso de heartbeat no IndexedDB com timestamp e dados de diagnóstico
 */
export async function emitHeartbeat(data?: {
  state: string;
  speedKmh: number;
  batteryLevel?: number;
}, userId?: string | null): Promise<number> {
  const timestamp = Date.now();
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_HEARTBEAT, 'readwrite');
      const store = tx.objectStore(STORE_HEARTBEAT);

      store.put({
        key: userId ? `latest_heartbeat:${userId}` : 'latest_heartbeat',
        timestamp,
        ...data,
      });

      tx.oncomplete = () => resolve(timestamp);
      tx.onerror = () => resolve(timestamp);
    });
  } catch {
    return timestamp;
  }
}
