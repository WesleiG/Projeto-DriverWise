import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, onSnapshot, query, where, updateDoc, doc, addDoc, serverTimestamp } from 'firebase/firestore';

process.on('unhandledRejection', () => {});
process.on('uncaughtException', () => {});

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

const INBOX_PATH = process.env.BRAIN_CONVERSATION_ID
  ? `C:/Users/wesle/.gemini/antigravity/brain/${process.env.BRAIN_CONVERSATION_ID}/telegram_inbox.jsonl`
  : 'C:/Users/wesle/.gemini/antigravity/brain/6bd8f479-adba-428e-997e-4caba1668cc8/telegram_inbox.jsonl';
const CODEX_EXE = 'C:/Users/wesle/.codex/.sandbox-bin/codex.exe';
const EXPORT_JSON = process.env.BRAIN_CONVERSATION_ID
  ? `C:/Users/wesle/.gemini/antigravity/brain/${process.env.BRAIN_CONVERSATION_ID}/scratch/codex_db_export.json`
  : 'C:/Users/wesle/.gemini/antigravity/brain/6bd8f479-adba-428e-997e-4caba1668cc8/scratch/codex_db_export.json';

console.log('🚀 [BRIDGE DAEMON] Conectado e a escutar tarefas no Firestore do controle-mental-total-2026!');

function resolveWorkspacePath(workspaceId) {
  if (fs.existsSync(EXPORT_JSON)) {
    try {
      const data = JSON.parse(fs.readFileSync(EXPORT_JSON, 'utf8'));
      const found = (data.workspaces || []).find(w => w.id === workspaceId || w.displayName === workspaceId || w.shortName === workspaceId);
      if (found && found.path) return found.path;
    } catch {}
  }
  if (workspaceId && fs.existsSync(`C:/Projeto - ${workspaceId}`)) return `C:/Projeto - ${workspaceId}`;
  if (workspaceId && fs.existsSync(`C:/${workspaceId}`)) return `C:/${workspaceId}`;
  return 'C:/Projeto - DriverWise';
}

function startTaskListener() {
  try {
    const q = query(collection(db, 'controle_mental_tasks'), where('status', '==', 'pending'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const docId = change.doc.id;

          const isCodex = (data.provider === 'openai') || (data.workspace && data.workspace.startsWith('codex_')) || (data.workspace && data.workspace.toLowerCase().includes('codex'));
          const targetPath = resolveWorkspacePath(data.workspace);

          console.log(`📥 [BRIDGE] Nova tarefa recebida: "${data.title}" | Destino: ${isCodex ? '🤖 ChatGPT Codex' : '⚡ Antigravity'} | Pasta: ${targetPath}`);

          if (isCodex) {
            const prompt = `[TAREFA DO CONTROLE MENTAL TOTAL]\nTítulo: ${data.title}\nDescrição: ${data.description}\nPlano de Ação:\n${(data.actionPlan || []).map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\nPor favor execute esta tarefa com acesso total ao projeto.`;
            const model = data.model || 'gpt-5.6-luna';
            const reasoning = data.reasoningEffort || 'xhigh';

            const cmd = `"${prompt.replace(/"/g, '\\"')}" | "${CODEX_EXE}" exec -m ${model} -c model_reasoning_effort="${reasoning}" --dangerously-bypass-approvals-and-sandbox -C "${targetPath}" -`;

            exec(cmd, async (error, stdout, stderr) => {
              const resultText = stdout || stderr || 'Executado pelo Codex.';
              console.log(`✅ [CODEX] Tarefa "${data.title}" executada no chat do Codex!`);

              try {
                await addDoc(collection(db, 'controle_mental_responses'), {
                  sender: `ChatGPT Codex (${model})`,
                  content: `Tarefa "${data.title}" executada no projeto ${targetPath}:\n${resultText.slice(0, 1500)}`,
                  status: 'concluido',
                  timestamp: serverTimestamp(),
                });
              } catch {}

              exec(`node "C:/Projeto - DriverWise/telegram-bot/send_telegram.mjs" "🤖 *ChatGPT Codex executou a tarefa: ${data.title}* no projeto \`${targetPath}\`!\n\n${resultText.slice(0, 400)}..."`);
            });

            try {
              await updateDoc(doc(db, 'controle_mental_tasks', docId), {
                status: 'processing',
                engine: 'codex',
                processedAt: serverTimestamp(),
              });
            } catch (e) {}
          } else {
            const entry = {
              id: `web-${docId}`,
              timestamp: new Date().toISOString(),
              type: 'USER_INPUT',
              sender: 'controle_mental_total',
              content: `[COMANDO VIA CONTROLE MENTAL TOTAL]\nWorkspace: ${data.workspace}\nTítulo: ${data.title}\nDescrição: ${data.description}\nPlano:\n${(data.actionPlan || []).map((p, i) => `${i + 1}. ${p}`).join('\n')}`,
            };

            try {
              fs.appendFileSync(INBOX_PATH, JSON.stringify(entry) + String.fromCharCode(10), 'utf8');
              console.log(`✅ [BRIDGE] Tarefa enviada ao Antigravity com sucesso!`);

              await updateDoc(doc(db, 'controle_mental_tasks', docId), {
                status: 'processing',
                engine: 'antigravity',
                processedAt: serverTimestamp(),
              });
            } catch (err) {
              console.error('[BRIDGE] Erro ao registar tarefa:', err.message);
            }
          }
        }
      });
    }, (err) => {
      setTimeout(startTaskListener, 60000);
    });
  } catch (err) {
    setTimeout(startTaskListener, 60000);
  }
}

startTaskListener();
