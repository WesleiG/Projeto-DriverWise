// Este módulo é importado dinamicamente por firebase.ts. Imports nomeados
// mantêm o chunk Firestore limitado às operações realmente utilizadas.
import type { FirebaseApp } from 'firebase/app';
import {
  getFirestore as getNativeFirestore,
  initializeFirestore,
  collection,
  doc,
  setDoc,
  runTransaction,
  getDoc,
  getDocs,
  deleteDoc,
  writeBatch,
  query,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
} from 'firebase/firestore';

export {
  collection,
  doc,
  setDoc,
  runTransaction,
  getDoc,
  getDocs,
  deleteDoc,
  writeBatch,
  query,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
};

import type { Firestore } from 'firebase/firestore';

let configuredFirestore: Firestore | null = null;

/**
 * Deixa o SDK detetar automaticamente quando o ambiente (incluindo o browser
 * do Tesla) precisa de long-polling, evitando forçar esse modo em browsers
 * normais onde o WebChannel é mais leve.
 */
export function getFirestore(app: FirebaseApp): Firestore {
  if (configuredFirestore) return configuredFirestore;
  try {
    configuredFirestore = initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
    });
  } catch {
    // Se outra parte da aplicação já tiver inicializado o Firestore, reutiliza
    // essa instância em vez de falhar o arranque da aplicação.
    configuredFirestore = getNativeFirestore(app);
  }
  return configuredFirestore;
}
