import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });
const brainDir = process.env.BRAIN_DIR ? path.resolve(process.env.BRAIN_DIR) : null;
const conversationId = process.env.BRAIN_CONVERSATION_ID?.trim() || '';

if (!brainDir || !conversationId || !/^[A-Za-z0-9_-]{1,160}$/.test(conversationId)) {
  console.error('Configure BRAIN_DIR e BRAIN_CONVERSATION_ID para aguardar mensagens.');
  process.exit(1);
}

const conversationDir = path.resolve(brainDir, conversationId);
const relative = path.relative(path.resolve(brainDir), conversationDir);
if (relative.startsWith('..') || path.isAbsolute(relative)) process.exit(1);
const inboxPath = path.join(conversationDir, 'telegram_inbox.jsonl');
let initialCount = 0;
if (fs.existsSync(inboxPath)) {
  const content = fs.readFileSync(inboxPath, 'utf8');
  const complete = content.endsWith('\n') ? content : content.slice(0, content.lastIndexOf('\n') + 1);
  initialCount = complete ? complete.split('\n').filter(Boolean).length : 0;
}

const interval = setInterval(() => {
  if (!fs.existsSync(inboxPath)) return;
  try {
    const content = fs.readFileSync(inboxPath, 'utf8');
    const complete = content.endsWith('\n') ? content : content.slice(0, content.lastIndexOf('\n') + 1);
    const lines = complete ? complete.split('\n').filter(Boolean) : [];
    if (lines.length <= initialCount) return;
    const entry = JSON.parse(lines[lines.length - 1]);
    console.log(JSON.stringify({ received: true, type: entry.type || 'USER_INPUT', timestamp: entry.timestamp || null }));
    clearInterval(interval);
    process.exit(0);
  } catch {
    // A write in progress is retried on the next tick.
  }
}, 500);
