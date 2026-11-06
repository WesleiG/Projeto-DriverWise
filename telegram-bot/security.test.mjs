import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./bot.mjs', import.meta.url), 'utf8');

test('bot exige token e ACL externa antes de iniciar', () => {
  assert.match(source, /TELEGRAM_BOT_TOKEN/);
  assert.match(source, /TELEGRAM_ADMIN_IDS/);
  assert.match(source, /adminIds\.size === 0/);
  assert.match(source, /adminIdTokens\.some/);
  assert.match(source, /ctx\.from\?\.id/);
});

test('bot não executa shell arbitrário nem usa dependências removidas', () => {
  assert.doesNotMatch(source, /from ['"](?:child_process)['"].*exec['"]/s);
  assert.doesNotMatch(source, /exec\(command/);
  assert.doesNotMatch(source, /node-telegram-bot-api|google-tts-api|textToSpeech/);
  assert.doesNotMatch(source, /bot\.command\('cmd'/);
  assert.match(source, /execFileAsync/);
});

test('operações administrativas usam confirmação e limites', () => {
  assert.match(source, /confirm:\$\{action\}/);
  assert.match(source, /minutes < 1 \|\| minutes > 60/);
  assert.match(source, /--only', 'hosting,firestore:rules,storage'/);
});
