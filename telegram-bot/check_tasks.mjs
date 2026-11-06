import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

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

async function checkTasks() {
  const q = query(collection(db, 'controle_mental_tasks'), limit(10));
  const snapshot = await getDocs(q);
  console.log(`Total de tarefas no Firestore: ${snapshot.size}`);
  snapshot.forEach((doc) => {
    console.log('---');
    console.log(`ID: ${doc.id}`);
    console.log('Dados:', JSON.stringify(doc.data(), null, 2));
  });
  process.exit(0);
}

checkTasks().catch((e) => {
  console.error(e);
  process.exit(1);
});
