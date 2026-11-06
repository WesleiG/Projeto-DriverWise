import https from 'https';
import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';

const BOT_TOKEN = '8612193337:AAEfZZ-rFk0hO2S5m3gTJgq3cwxl7kfVn8A';
const ADMIN_ID = '6079004663';

const firebaseConfig = {
  projectId: 'controle-mental-total-2026',
  appId: '1:600366155123:web:14f7846d8fbd0a4e077106',
  storageBucket: 'controle-mental-total-2026.firebasestorage.app',
  apiKey: 'AIzaSyDBzMVScF_iNeFnstKwRtSW0Wsz9RtdGPY',
  authDomain: 'controle-mental-total-2026.firebaseapp.com',
  messagingSenderId: '600366155123',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function sendTelegramMessage(text) {
  if (!text) return;

  const data = JSON.stringify({
    chat_id: ADMIN_ID,
    text: text,
    parse_mode: 'Markdown',
  });

  const options = {
    hostname: 'api.telegram.org',
    port: 443,
    path: `/bot${BOT_TOKEN}/sendMessage`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    },
  };

  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => {
      try {
        const resp = JSON.parse(body);
        console.log('Envio Telegram resultado:', resp.ok);
      } catch (e) {
        console.log('Telegram resp:', body);
      }
    });
  });

  req.on('error', (e) => {
    console.error('Erro Telegram:', e.message);
  });

  req.write(data);
  req.end();

  // Sincronizar também no Firestore do Controle Mental Total
  try {
    const cleanText = text.replace(/[*`_]/g, '');
    await addDoc(collection(db, 'controle_mental_responses'), {
      sender: '🤖 Antigravity Executor',
      content: cleanText,
      status: 'concluido',
      timestamp: serverTimestamp(),
    });
    console.log('✅ [BRIDGE] Resposta sincronizada no Firestore do Controle Mental Total!');
  } catch (err) {
    console.warn('[BRIDGE] Firestore sync ignorado:', err.message);
  }
}

const message = process.argv.slice(2).join(' ');
if (message) {
  sendTelegramMessage(message);
}
