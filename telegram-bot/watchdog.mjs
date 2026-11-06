import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.on('uncaughtException', (err) => {
  console.warn('[WATCHDOG UNCAUGHT EXCEPTION]', err.message);
});
process.on('unhandledRejection', (err) => {
  console.warn('[WATCHDOG UNHANDLED REJECTION]', err?.message || err);
});

const SERVICES = [
  { name: 'Bot Telegram', cwd: __dirname, script: 'bot.mjs', args: ['--max-old-space-size=256', 'bot.mjs'], env: {} },
  { name: 'Bridge Listener', cwd: __dirname, script: 'bridge_listener.mjs', args: ['--max-old-space-size=512', 'bridge_listener.mjs'], env: {} },
  { 
    name: 'Controle PC Agent', 
    cwd: 'C:/Projeto - Controle Mental Total', 
    script: 'local-control-agent.cjs', 
    args: ['local-control-agent.cjs'], 
    env: { 
      CONTROLE_MENTAL_TOKEN: '@Maconha1234', 
      CONTROLE_MENTAL_HOST: '0.0.0.0',
      CONTROLE_MENTAL_PORT: '5199'
    } 
  },
];

function runService(service) {
  console.log(`🚀 [WATCHDOG] A iniciar serviço: ${service.name}...`);
  let child;
  try {
    child = spawn('node', service.args, {
      cwd: service.cwd || __dirname,
      stdio: 'inherit',
      windowsHide: true,
      env: { ...process.env, ...service.env },
    });

    child.on('exit', (code, signal) => {
      console.warn(`⚠️ [WATCHDOG] Serviço ${service.name} terminou (código: ${code}, sinal: ${signal}). A reiniciar em 3s...`);
      setTimeout(() => runService(service), 3000);
    });

    child.on('error', (err) => {
      console.error(`❌ [WATCHDOG] Erro no serviço ${service.name}:`, err.message);
      setTimeout(() => runService(service), 3000);
    });
  } catch (err) {
    console.error(`❌ [WATCHDOG SPAWN ERROR] ${service.name}:`, err.message);
    setTimeout(() => runService(service), 3000);
  }
}

console.log('🛡️ [WATCHDOG SUPERVISOR] Gestor de Serviços Ativo (incluindo Controle PC Agent)!');
SERVICES.forEach(s => runService(s));
