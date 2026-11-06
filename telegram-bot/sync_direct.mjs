import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  projectId: 'driverwise-app-2026',
  appId: '1:716591352361:web:fb9e8013b1e454d66bea38',
  storageBucket: 'driverwise-app-2026.firebasestorage.app',
  apiKey: 'AIzaSyAtR-0ozGo-bJa6WYzwLgOhqUS3AVUH3BA',
  authDomain: 'driverwise-app-2026.firebaseapp.com',
  messagingSenderId: '716591352361',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const EXPORT_JSON = 'C:/Users/wesle/.gemini/antigravity/brain/ca1206d1-81d7-45b2-b5ea-dbac7a25e1b1/scratch/codex_db_export.json';

async function run() {
  const exportData = JSON.parse(fs.readFileSync(EXPORT_JSON, 'utf8'));
  const workspaces = exportData.workspaces || [];
  const sessions = exportData.sessions || [];

  for (const w of workspaces) {
    await setDoc(doc(db, 'controle_mental_codex_workspaces', w.id), w, { merge: true });
    await setDoc(doc(db, 'controle_mental_workspaces', w.id), w, { merge: true });
  }
  console.log(`SUCCESS: Sincronizados ${workspaces.length} workspaces do Codex com o Firestore!`);

  for (const s of sessions.slice(0, 30)) {
    await setDoc(doc(db, 'controle_mental_codex_sessions', s.conversationId), s, { merge: true });
  }
  console.log(`SUCCESS: Sincronizadas ${Math.min(sessions.length, 30)} sessoes do Codex com o Firestore!`);
  process.exit(0);
}

run();
