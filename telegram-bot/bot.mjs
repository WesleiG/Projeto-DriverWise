import { Bot, InlineKeyboard } from 'grammy';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const rawAdminIds = process.env.TELEGRAM_ADMIN_IDS?.trim() || '';
const adminIdTokens = rawAdminIds ? rawAdminIds.split(',').map((value) => value.trim()) : [];
const adminIds = new Set(adminIdTokens.map((value) => Number(value)));

if (!token || !/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) {
  console.error('TELEGRAM_BOT_TOKEN ausente ou inválido. Configure-o fora do repositório.');
  process.exit(1);
}
if (adminIds.size === 0 || adminIdTokens.some((value) => !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0)) {
  console.error('TELEGRAM_ADMIN_IDS ausente. O bot não inicia sem uma ACL explícita.');
  process.exit(1);
}

const workspacePath = path.resolve(process.env.WORKSPACE_PATH || path.join(__dirname, '..'));
const brainDir = process.env.BRAIN_DIR ? path.resolve(process.env.BRAIN_DIR) : null;
const dataUid = process.env.TELEGRAM_DATA_UID?.trim() || '';
const pythonBin = process.env.PYTHON_BIN?.trim() || 'python';
const transcriptionModel = process.env.TRANSCRIPTION_MODEL?.trim() || 'tiny';
const maxUploadBytes = Math.min(20 * 1024 * 1024, Math.max(256 * 1024, Number(process.env.MAX_UPLOAD_BYTES) || 10 * 1024 * 1024));
const stateDir = path.join(__dirname, '.bot-state');
const stateFile = path.join(stateDir, 'state.json');
const transcriptRelativePath = path.join('.system_generated', 'logs', 'transcript.jsonl');

if (!fs.existsSync(workspacePath) || !fs.statSync(workspacePath).isDirectory()) {
  console.error(`WORKSPACE_PATH inválido: ${workspacePath}`);
  process.exit(1);
}
if (brainDir && (!fs.existsSync(brainDir) || !fs.statSync(brainDir).isDirectory())) {
  console.error(`BRAIN_DIR inválido: ${brainDir}`);
  process.exit(1);
}

const bot = new Bot(token);
let operationInProgress = false;
const pendingActions = new Map();
const unauthorizedLastReply = new Map();
let pollInProgress = false;

function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return {
      bindings: parsed?.bindings && typeof parsed.bindings === 'object' ? parsed.bindings : {},
      cursors: parsed?.cursors && typeof parsed.cursors === 'object' ? parsed.cursors : {},
    };
  } catch {
    return { bindings: {}, cursors: {} };
  }
}

const state = loadState();

function saveState() {
  fs.mkdirSync(stateDir, { recursive: true });
  const temporary = `${stateFile}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
  try {
    fs.renameSync(temporary, stateFile);
  } catch (error) {
    // Windows não substitui sempre um ficheiro existente com renameSync.
    // O fallback mantém o estado válido e remove apenas o temporário criado.
    if (!['EEXIST', 'EPERM', 'ENOTEMPTY'].includes(error.code)) throw error;
    fs.copyFileSync(temporary, stateFile);
    fs.rmSync(temporary, { force: true });
  }
}

bot.use(async (ctx, next) => {
  const senderId = ctx.from?.id || 'desconhecido';
  const textPreview = ctx.message?.text || ctx.message?.caption || (ctx.message?.voice ? '[Voz]' : '[Outro]');
  console.log(`[TELEGRAM RECEBIDO] De: ${senderId} | Tipo: ${ctx.update ? Object.keys(ctx.update)[1] : 'update'} | Conteúdo: ${textPreview}`);
  await next();
});

function isAuthorized(ctx) {
  return Boolean(ctx.chat?.type === 'private' && ctx.from?.id && adminIds.has(ctx.from.id));
}

async function guard(ctx) {
  if (isAuthorized(ctx)) return true;
  const chatId = ctx.chat?.id;
  if (chatId && Date.now() - (unauthorizedLastReply.get(chatId) || 0) > 60_000) {
    unauthorizedLastReply.set(chatId, Date.now());
    await ctx.reply('Acesso não autorizado. Este bot aceita apenas administradores configurados.');
  }
  return false;
}

function conversationDirectory(id) {
  if (!brainDir || !/^[A-Za-z0-9_-]{1,160}$/.test(id)) return null;
  const candidate = path.resolve(brainDir, id);
  const relative = path.relative(path.resolve(brainDir), candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  try {
    const stat = fs.lstatSync(candidate);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return null;
  } catch {
    return null;
  }
  return candidate;
}

function transcriptPath(id) {
  const directory = conversationDirectory(id);
  if (!directory) return null;
  const transcript = path.join(directory, transcriptRelativePath);
  try {
    const stat = fs.lstatSync(transcript);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
  } catch {
    return null;
  }
  return transcript;
}

function listConversations(limit = 20) {
  if (!brainDir) return [];
  try {
    return fs.readdirSync(brainDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !['tempmediaStorage', 'scratch'].includes(entry.name))
      .map((entry) => {
        const transcript = transcriptPath(entry.name);
        if (!transcript || !fs.existsSync(transcript)) return null;
        const stat = fs.statSync(transcript);
        return { id: entry.name, transcript, updatedAt: stat.mtimeMs };
      })
      .filter(Boolean)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  } catch (error) {
    console.warn('Não foi possível listar conversas:', error.message);
    return [];
  }
}

function currentConversation(ctx) {
  return state.bindings[String(ctx.from.id)] || null;
}

function bindConversation(ctx, id) {
  const directory = conversationDirectory(id);
  const transcript = transcriptPath(id);
  if (!directory || !transcript || !fs.existsSync(transcript)) {
    throw new Error('Conversa inválida ou inexistente.');
  }
  const existingOwner = Object.entries(state.bindings).find(([userId, conversationId]) => conversationId === id && userId !== String(ctx.from.id));
  if (existingOwner) throw new Error('Esta conversa já está associada a outro administrador.');
  state.bindings[String(ctx.from.id)] = id;
  const completeContent = fs.readFileSync(transcript, 'utf8');
  state.cursors[id] = completeContent.endsWith('\n') ? completeContent.split('\n').length - 1 : completeContent.split('\n').length;
  saveState();
}

function stripRequestMarkers(value) {
  return String(value || '').replace(/<USER_REQUEST>|<\/USER_REQUEST>/g, '').trim();
}

function appendInboxEvent(conversationId, content, extra = {}) {
  const directory = conversationDirectory(conversationId);
  if (!directory) throw new Error('Conversa inválida.');
  const inboxPath = path.join(directory, 'telegram_inbox.jsonl');
  try {
    const stat = fs.lstatSync(inboxPath);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Inbox inválida.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const event = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    type: 'USER_INPUT',
    sender: 'telegram',
    content: String(content).slice(0, 20_000),
    ...extra,
  };
  fs.appendFileSync(inboxPath, `${JSON.stringify(event)}${os.EOL}`, { encoding: 'utf8', mode: 0o600 });
}

async function sendChunked(ctx, text) {
  const value = String(text || '').trim();
  if (!value) return;
  for (let index = 0; index < value.length; index += 3800) {
    await ctx.reply(value.slice(index, index + 3800));
  }
}

async function downloadTelegramFile(ctx, fileId, fileName) {
  const file = await ctx.api.getFile(fileId);
  if (!file.file_path) throw new Error('O Telegram não devolveu o caminho do ficheiro.');
  const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(fileUrl, {
        signal: AbortSignal.timeout(180_000),
      });
      if (!response.ok) throw new Error(`Download Telegram falhou (${response.status})`);
      const arrayBuf = await response.arrayBuffer();
      const bytes = Buffer.from(arrayBuf);
      if (bytes.length > maxUploadBytes) throw new Error('O ficheiro excede o limite permitido.');

      const vault = path.join(__dirname, 'audio_vault');
      fs.mkdirSync(vault, { recursive: true });
      const safeExtension = path.extname(fileName || file.file_path).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
      const target = path.join(vault, `${Date.now()}-${randomUUID()}${safeExtension}`);
      fs.writeFileSync(target, bytes, { mode: 0o600 });
      return target;
    } catch (err) {
      lastError = err;
      console.warn(`[BOT] Tentativa ${attempt}/4 de download falhou:`, err.message);
      if (attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
      }
    }
  }
  throw lastError || new Error('Download do áudio falhou após várias tentativas.');
}

async function transcribeAudio(filePath) {
  const result = await execFileAsync(pythonBin, [path.join(__dirname, 'transcribe.py'), filePath, transcriptionModel], {
    cwd: __dirname,
    timeout: 300_000,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  const parsed = JSON.parse(result.stdout.trim());
  if (!parsed.success) throw new Error(parsed.error || 'A transcrição falhou.');
  return String(parsed.text || '').trim();
}

const pendingUserRequests = new Map();

async function forwardText(ctx, text, extra = {}) {
  if (!(await guard(ctx))) return;
  const conversationId = currentConversation(ctx);
  if (!conversationId) {
    await ctx.reply('Selecione primeiro uma conversa com /chats e /selecionar.');
    return;
  }
  appendInboxEvent(conversationId, text, extra);
  pendingUserRequests.set(String(ctx.from.id), {
    conversationId,
    text: String(text).slice(0, 100),
    timestamp: Date.now(),
    stage: 0,
  });
  await ctx.reply('Mensagem encaminhada para o Antigravity. A aguardar resposta...');
}

function getAdminDb() {
  if (!dataUid) throw new Error('TELEGRAM_DATA_UID não está configurado.');
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_CLOUD_PROJECT && !process.env.FIREBASE_CONFIG) {
    throw new Error('Configure ADC/GOOGLE_APPLICATION_CREDENTIALS fora do projeto para consultar o Firestore.');
  }
  if (getApps().length === 0) {
    initializeApp({
      credential: applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID || 'driverwise-app-2026',
    });
  }
  return getFirestore();
}

async function runFixedOperation(action) {
  if (operationInProgress) throw new Error('Já existe uma operação administrativa em curso.');
  operationInProgress = true;
  try {
    const command = action === 'build'
      ? ['npm.cmd', ['run', 'build'], 300_000]
      : ['firebase.cmd', ['deploy', '--only', 'hosting,firestore:rules,storage'], 300_000];
    const result = await execFileAsync(command[0], command[1], {
      cwd: workspacePath,
      timeout: command[2],
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    });
    return `${result.stdout || ''}${result.stderr || ''}`.trim().slice(-6000);
  } finally {
    operationInProgress = false;
  }
}

function requestConfirmation(ctx, action, label) {
  const chatId = String(ctx.chat.id);
  pendingActions.set(chatId, { action, expiresAt: Date.now() + 60_000 });
  return ctx.reply(`Confirma ${label}? Esta ação tem efeito administrativo.`, {
    reply_markup: new InlineKeyboard().text('Confirmar', `confirm:${action}`).text('Cancelar', 'confirm:cancel'),
  });
}

async function pollTranscripts() {
  if (pollInProgress || !brainDir) return;
  pollInProgress = true;
  try {
    for (const [userId, conversationId] of Object.entries(state.bindings)) {
      const transcript = transcriptPath(conversationId);
      if (!transcript || !fs.existsSync(transcript)) continue;
      const raw = fs.readFileSync(transcript, 'utf8');
      const completeLength = raw.endsWith('\n') ? raw.length : raw.lastIndexOf('\n') + 1;
      if (completeLength <= 0) continue;
      const lines = raw.slice(0, completeLength).split('\n');
      let cursor = Number.isInteger(state.cursors[conversationId]) ? state.cursors[conversationId] : lines.length - 1;
      cursor = Math.max(0, Math.min(cursor, lines.length - 1));

      while (cursor < lines.length - 1) {
        const line = lines[cursor];
        cursor += 1;
        if (!line.trim()) {
          state.cursors[conversationId] = cursor;
          continue;
        }
        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch {
          state.cursors[conversationId] = cursor;
          continue;
        }
        if (parsed.type === 'PLANNER_RESPONSE' && parsed.content) {
          pendingUserRequests.delete(String(userId));
          const body = `ANTIGRAVITY • ${path.basename(workspacePath)}\n\n${String(parsed.content).trim()}`;
          try {
            await sendChunked({ reply: (message) => bot.api.sendMessage(Number(userId), message) }, body);
          } catch (error) {
            cursor -= 1;
            console.warn('Resposta não enviada; será tentada novamente:', error.message);
            break;
          }
        } else if (parsed.type === 'ERROR_MESSAGE' || parsed.status === 'ERROR') {
          pendingUserRequests.delete(String(userId));
          const rawError = String(parsed.content || '').trim();
          let friendlyMsg = '⚠️ [ANTIGRAVITY • FLUXO INTERROMPIDO OU ERRO]\n\n';
          if (rawError.includes('stream was interrupted')) {
            friendlyMsg += '⚡ O fluxo de resposta foi interrompido temporariamente pelos servidores. O Antigravity foi notificado para retomar a tarefa automaticamente.';
          } else if (rawError.toLowerCase().includes('high traffic') || rawError.toLowerCase().includes('traffic')) {
            friendlyMsg += '🚦 Os servidores da Google estão com tráfego elevado ("high traffic") neste momento. Recomenda-se aguardar cerca de 1 minuto antes de tentar novamente.';
          } else {
            friendlyMsg += `Detalhe do erro reportado:\n"${rawError.slice(0, 300)}"`;
          }
          try {
            await sendChunked({ reply: (message) => bot.api.sendMessage(Number(userId), message) }, friendlyMsg);
          } catch (error) {
            console.warn('[BOT] Falha ao enviar notificação de erro:', error.message);
          }
        }
        state.cursors[conversationId] = cursor;
      }
    }
    saveState();

    // Verificação de timeout em pedidos enviados pelo Telegram sem resposta do Antigravity
    const now = Date.now();
    for (const [userId, pending] of pendingUserRequests.entries()) {
      const elapsed = now - pending.timestamp;
      if (elapsed > 40_000 && pending.stage === 0) {
        pending.stage = 1;
        sendChunked(
          { reply: (msg) => bot.api.sendMessage(Number(userId), msg) },
          '⏳ [ANTIGRAVITY • EM PROCESSAMENTO]\n\nO teu pedido ainda está a ser processado pelo Antigravity.\nSe os servidores da Google estiverem com tráfego elevado ("high traffic"), a resposta poderá demorar um pouco mais.'
        ).catch((err) => console.warn('[BOT] Erro ao enviar aviso de 40s:', err.message));
      } else if (elapsed > 90_000 && pending.stage === 1) {
        pending.stage = 2;
        pendingUserRequests.delete(userId);
        sendChunked(
          { reply: (msg) => bot.api.sendMessage(Number(userId), msg) },
          '⚠️ [ANTIGRAVITY • SEM RESPOSTA / POSSÍVEL INTERRUPÇÃO]\n\nPassaram mais de 90 segundos sem resposta do Antigravity.\nÉ provável que tenha ocorrido sobrecarga de rede ("Our servers are experiencing high traffic right now") ou o fluxo tenha sido interrompido.\n\n💡 Recomendações:\n• Aguarda cerca de 1 minuto e tenta reenviar a tua mensagem.\n• Podes usar o comando /verificar para consultar o estado do Antigravity.'
        ).catch((err) => console.warn('[BOT] Erro ao enviar aviso de timeout:', err.message));
      }
    }
  } catch (error) {
    console.warn('Falha no watcher do transcript:', error.message);
  } finally {
    pollInProgress = false;
  }
}

bot.command('start', async (ctx) => {
  if (!(await guard(ctx))) return;
  await ctx.reply('DriverWise/Antigravity conectado. Use /chats, /selecionar <id> e /ajuda.');
});

bot.command('ajuda', async (ctx) => {
  if (!(await guard(ctx))) return;
  await ctx.reply([
    '/chats — listar conversas disponíveis',
    '/selecionar <id> — associar este chat a uma conversa',
    '/chat_atual — mostrar a conversa associada',
    '/projetos — mostrar o workspace configurado',
    '/status — estado do computador e bot',
    '/verificar — verificar o estado e últimos eventos do Antigravity',
    '/turnos — últimos turnos reais do Firestore',
    '/build — executar build fixo',
    '/deploy — pedir confirmação para publicar',
    '/desligar <1-60> — pedir confirmação para desligar',
    '/cancelar_desligar — cancelar desligamento agendado',
    '/seguranca — mostrar a política ativa',
    'Comandos livres de shell e respostas de voz externa estão desativados.',
  ].join('\n'));
});

bot.command('chats', async (ctx) => {
  if (!(await guard(ctx))) return;
  const chats = listConversations();
  if (chats.length === 0) {
    await ctx.reply(brainDir ? 'Não foram encontradas conversas com transcript.' : 'BRAIN_DIR não configurado.');
    return;
  }
  const keyboard = new InlineKeyboard();
  chats.forEach((chat) => keyboard.text(`${chat.id.slice(0, 28)} • ${new Date(chat.updatedAt).toLocaleString('pt-PT')}`, `select:${chat.id}`).row());
  await ctx.reply('Escolha uma conversa:', { reply_markup: keyboard });
});

bot.command('selecionar', async (ctx) => {
  if (!(await guard(ctx))) return;
  const id = ctx.match?.trim();
  if (!id) {
    await ctx.reply('Use /selecionar <id>.');
    return;
  }
  try {
    bindConversation(ctx, id);
    await ctx.reply(`Conversa ${id} selecionada. As mensagens seguintes serão encaminhadas apenas para ela.`);
  } catch (error) {
    await ctx.reply(error.message);
  }
});

bot.command('chat_atual', async (ctx) => {
  if (!(await guard(ctx))) return;
  await ctx.reply(`Conversa atual: ${currentConversation(ctx) || 'nenhuma'}`);
});

bot.callbackQuery(/^select:([A-Za-z0-9_-]{1,160})$/, async (ctx) => {
  if (!(await guard(ctx))) return;
  try {
    bindConversation(ctx, ctx.match[1]);
    await ctx.answerCallbackQuery({ text: 'Conversa selecionada.' });
    await ctx.reply(`Conversa ${ctx.match[1]} selecionada.`);
  } catch (error) {
    await ctx.answerCallbackQuery({ text: error.message.slice(0, 190), show_alert: true });
  }
});

bot.command('projetos', async (ctx) => {
  if (!(await guard(ctx))) return;
  await ctx.reply(`Workspace ativo:\n${workspacePath}`);
});

bot.command('status', async (ctx) => {
  if (!(await guard(ctx))) return;
  const memory = process.memoryUsage();
  await ctx.reply(`Bot online\nCPU: ${os.loadavg().map((value) => value.toFixed(2)).join(' / ')}\nMemória do processo: ${(memory.rss / 1024 / 1024).toFixed(1)} MB\nWorkspace: ${workspacePath}`);
});

bot.command('verificar', async (ctx) => {
  if (!(await guard(ctx))) return;
  const conversationId = currentConversation(ctx);
  if (!conversationId) {
    await ctx.reply('Nenhuma conversa selecionada. Usa /chats e /selecionar.');
    return;
  }
  const transcript = transcriptPath(conversationId);
  if (!transcript || !fs.existsSync(transcript)) {
    await ctx.reply('Ficheiro de transcript não encontrado para a conversa atual.');
    return;
  }
  try {
    const raw = fs.readFileSync(transcript, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const lastLines = lines.slice(-4);
    const summary = lastLines.map((l) => {
      try {
        const obj = JSON.parse(l);
        const snippet = obj.content ? obj.content.replace(/\r?\n+/g, ' ').slice(0, 140) : (obj.tool_calls ? `Ferramenta chamada: ${obj.tool_calls[0]?.name}` : 'Sem conteúdo de texto');
        return `• Passo ${obj.step_index ?? '?'}: [${obj.type} | ${obj.status}]\n  ${snippet}`;
      } catch {
        return `• ${l.slice(0, 80)}`;
      }
    }).join('\n\n');
    await ctx.reply(`📊 Estado do Antigravity:\nConversa: ${conversationId.slice(0, 8)}...\nTotal de passos: ${lines.length}\n\nÚltimos eventos:\n${summary}`);
  } catch (err) {
    await ctx.reply(`Erro ao ler transcript: ${err.message}`);
  }
});

bot.command('seguranca', async (ctx) => {
  if (!(await guard(ctx))) return;
  await ctx.reply(`ACL privada por from.id: ativa\nGrupos: bloqueados\nShell: allowlist fixa\nUploads: ${(maxUploadBytes / 1024 / 1024).toFixed(0)} MB\nTTS externo: desativado`);
});

bot.command('turnos', async (ctx) => {
  if (!(await guard(ctx))) return;
  try {
    const snapshot = await getAdminDb().collection('users').doc(dataUid).collection('driverwise_records').orderBy('date', 'desc').limit(5).get();
    if (snapshot.empty) {
      await ctx.reply('Não existem turnos guardados.');
      return;
    }
    const lines = snapshot.docs.map((entry) => {
      const data = entry.data();
      return `${data.date || 'sem data'} • ${data.platform || 'outra'} • ${(Number(data.netEarnings) || 0).toFixed(2)} € líquidos`;
    });
    await ctx.reply(`Últimos turnos reais:\n${lines.join('\n')}`);
  } catch (error) {
    await ctx.reply(`Não foi possível consultar o Firestore: ${error.message}`);
  }
});

bot.command('build', async (ctx) => {
  if (!(await guard(ctx))) return;
  try {
    await ctx.reply('Build iniciado…');
    const output = await runFixedOperation('build');
    await sendChunked(ctx, `Build concluído.\n${output || 'Sem saída.'}`);
  } catch (error) {
    await ctx.reply(`Build falhou: ${error.message}`);
  }
});

bot.command('deploy', async (ctx) => {
  if (!(await guard(ctx))) return;
  await requestConfirmation(ctx, 'deploy', 'publicar Hosting, Firestore Rules e Storage Rules');
});

bot.command('desligar', async (ctx) => {
  if (!(await guard(ctx))) return;
  const minutes = Number(ctx.match?.trim());
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) {
    await ctx.reply('Indique um número inteiro de minutos entre 1 e 60.');
    return;
  }
  await requestConfirmation(ctx, `shutdown:${minutes}`, `desligar o computador em ${minutes} minuto(s)`);
});

bot.command('cancelar_desligar', async (ctx) => {
  if (!(await guard(ctx))) return;
  try {
    await execFileAsync('shutdown.exe', ['/a'], { timeout: 10_000, windowsHide: true });
    await ctx.reply('Desligamento cancelado.');
  } catch (error) {
    await ctx.reply(`Não foi possível cancelar: ${error.message}`);
  }
});

bot.callbackQuery(/^confirm:(deploy|shutdown(?::\d+)?|cancel)$/, async (ctx) => {
  if (!(await guard(ctx))) return;
  const chatId = String(ctx.chat.id);
  const pending = pendingActions.get(chatId);
  pendingActions.delete(chatId);
  if (ctx.match[1] === 'cancel' || !pending || pending.expiresAt < Date.now() || pending.action !== ctx.match[1]) {
    await ctx.answerCallbackQuery({ text: 'Confirmação expirada.', show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery({ text: 'Operação autorizada.' });
  try {
    if (pending.action === 'deploy') {
      await ctx.reply('Deploy iniciado…');
      await sendChunked(ctx, `Deploy concluído.\n${await runFixedOperation('deploy')}`);
    } else if (pending.action.startsWith('shutdown:')) {
      const minutes = Number(pending.action.split(':')[1]);
      await execFileAsync('shutdown.exe', ['/s', '/t', String(minutes * 60), '/c', 'DriverWise: desligamento confirmado'], { timeout: 10_000, windowsHide: true });
      await ctx.reply(`Desligamento agendado para ${minutes} minuto(s).`);
    }
  } catch (error) {
    await ctx.reply(`Operação falhou: ${error.message}`);
  }
});

bot.on('message:text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;
  console.log(`[BOT] Texto recebido de ${ctx.from.id}: "${ctx.message.text.slice(0, 80)}"`);
  await forwardText(ctx, ctx.message.text);
});

bot.on(['message:voice', 'message:audio', 'message:video_note'], async (ctx) => {
  if (!(await guard(ctx))) return;
  const audioObj = ctx.message.voice || ctx.message.audio || ctx.message.video_note;
  const isVoice = Boolean(ctx.message.voice);
  const isAudio = Boolean(ctx.message.audio);
  const isVideoNote = Boolean(ctx.message.video_note);
  const fileId = audioObj?.file_id;
  const fileSize = audioObj?.file_size || 0;

  console.log(`[BOT] Áudio/Voz recebido de ${ctx.from.id} (${fileSize} bytes)`);
  if (fileSize > maxUploadBytes) {
    await ctx.reply('O áudio excede o limite permitido (máx 10 MB).');
    return;
  }

  await ctx.reply('🎤 Áudio recebido. A processar transcrição...');
  try {
    const ext = isVoice ? 'voice.oga' : isAudio ? 'audio.mp3' : 'video_note.mp4';
    const filePath = await downloadTelegramFile(ctx, fileId, ext);
    let transcript = '';
    try {
      transcript = await transcribeAudio(filePath);
    } catch (err) {
      console.warn('[BOT] Transcrição falhou:', err.message);
      // Se a transcrição local falhar, regista o evento com o caminho do ficheiro
      await forwardText(ctx, `[Áudio recebido no Telegram mas transcrição pendente: ${path.basename(filePath)}]`, {
        source: isVoice ? 'voice' : isAudio ? 'audio' : 'video_note',
        filePath,
        transcriptionError: err.message,
      });
      await ctx.reply(`⚠️ Áudio guardado, mas a transcrição deu erro: ${err.message}`);
      return;
    }

    console.log(`[BOT] Transcrição concluída: "${transcript.slice(0, 100)}..."`);
    await forwardText(ctx, transcript, {
      source: isVoice ? 'voice' : isAudio ? 'audio' : 'video_note',
      filePath,
      duration: audioObj?.duration || null,
    });
  } catch (error) {
    console.error('[BOT] Erro ao processar áudio:', error);
    await ctx.reply(`Não foi possível processar o áudio: ${error.message}`);
  }
});

bot.on('message:photo', async (ctx) => {
  if (!(await guard(ctx))) return;
  const photos = ctx.message.photo || [];
  const largestPhoto = photos[photos.length - 1];
  if (!largestPhoto) return;

  console.log(`[BOT] Foto recebida de ${ctx.from.id}`);
  try {
    const filePath = await downloadTelegramFile(ctx, largestPhoto.file_id, 'photo.jpg');
    const caption = ctx.message.caption || '[Foto enviada pelo Telegram]';
    await forwardText(ctx, caption, {
      source: 'photo',
      filePath,
      caption: ctx.message.caption || null,
    });
  } catch (error) {
    console.error('[BOT] Erro ao guardar foto:', error);
    await ctx.reply(`Não foi possível guardar a foto: ${error.message}`);
  }
});

bot.on('message:document', async (ctx) => {
  if (!(await guard(ctx))) return;
  console.log(`[BOT] Documento recebido de ${ctx.from.id}: ${ctx.message.document?.file_name}`);
  try {
    const doc = ctx.message.document;
    const filePath = await downloadTelegramFile(ctx, doc.file_id, doc.file_name || 'document.bin');
    await forwardText(ctx, ctx.message.caption || `[Documento: ${doc.file_name}]`, {
      source: 'document',
      filePath,
      fileName: doc.file_name,
    });
  } catch (error) {
    await ctx.reply(`Erro ao descarregar documento: ${error.message}`);
  }
});

process.on('unhandledRejection', (reason) => {
  console.warn('[BOT UNHANDLED REJECTION]', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.warn('[BOT UNCAUGHT EXCEPTION]', err?.message || err);
});

bot.catch((error) => {
  console.warn('[BOT ERROR TRATADO]', error?.error?.message || error?.message || error);
});

const stop = () => {
  try { bot.stop(); } catch {}
  process.exit(0);
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

try {
  await bot.api.setMyCommands([
    { command: 'start', description: 'Abrir o bot' },
    { command: 'ajuda', description: 'Ver ajuda' },
    { command: 'chats', description: 'Listar conversas' },
    { command: 'chat_atual', description: 'Ver conversa atual' },
    { command: 'selecionar', description: 'Selecionar conversa' },
    { command: 'status', description: 'Ver estado do bot' },
    { command: 'verificar', description: 'Ver estado do Antigravity' },
    { command: 'turnos', description: 'Ver turnos reais' },
    { command: 'build', description: 'Executar build fixo' },
    { command: 'deploy', description: 'Publicar com confirmação' },
    { command: 'desligar', description: 'Agendar desligamento confirmado' },
    { command: 'cancelar_desligar', description: 'Cancelar desligamento' },
    { command: 'seguranca', description: 'Ver política de segurança' },
  ]);
} catch (e) {
  console.warn('[BOT] Aviso ao registar comandos:', e.message);
}

console.log(`Bot seguro iniciado para ${adminIds.size} administrador(es).`);
setInterval(() => {
  pollTranscripts().catch((err) => {
    console.warn('[POLL TRANSCRIPT ERRO]', err?.message || err);
  });
}, 1500);

while (true) {
  try {
    await bot.start({
      onStart: () => console.log('✅ [BOT TELEGRAM] Conectado e a escutar no Telegram!'),
      drop_pending_updates: false,
    });
  } catch (err) {
    console.warn('⚠️ [BOT TELEGRAM] Conexão interrompida, a reiniciar em 3s:', err.message);
    await new Promise((r) => setTimeout(r, 3000));
  }
}
