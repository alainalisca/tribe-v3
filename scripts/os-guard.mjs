#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { checkMigrations } from './os-migration-check.mjs';

const errors = [];

// 1. Branch check
let branch = '';
try {
  branch = execSync('git symbolic-ref --short HEAD', { encoding: 'utf-8' }).trim();
} catch {
  branch = 'DETACHED';
}

if (branch === 'main') {
  errors.push('Branch is main. All Tribe.OS work must be on tribe-os/* or feat/t-os* branches.');
} else if (branch !== 'DETACHED' && !branch.startsWith('tribe-os/') && !branch.startsWith('feat/t-os')) {
  errors.push(`Branch '${branch}' does not start with tribe-os/ or feat/t-os.`);
}

// 2. Migration check
const migResult = await checkMigrations();
if (migResult.errors.length) {
  for (const e of migResult.errors) errors.push(`migration: ${e}`);
}

// 3. Send-path env check
const emailMode = process.env.EMAIL_MODE || 'log';
const pushMode = process.env.PUSH_MODE || 'log';
if (emailMode !== 'log') {
  errors.push(`EMAIL_MODE is '${emailMode}', must be 'log' on this branch.`);
}
if (pushMode !== 'log') {
  errors.push(`PUSH_MODE is '${pushMode}', must be 'log' on this branch.`);
}

// 4. AI provider check (T-OS2)
const aiProvider = process.env.TRIBE_OS_AI_PROVIDER || 'fake';
const aiLive = process.env.TRIBE_OS_AI_LIVE;
if (aiProvider === 'anthropic' && aiLive !== 'true') {
  errors.push(`TRIBE_OS_AI_PROVIDER=anthropic but TRIBE_OS_AI_LIVE is not 'true'. The paid provider cannot be used without explicit opt-in.`);
}

// Report
if (errors.length) {
  console.error('❌ os-guard FAILED:');
  for (const e of errors) console.error(`   ${e}`);
  process.exit(1);
}

console.log(
  `os-guard OK: branch=${branch} migrations=${migResult.classACount} A / ${migResult.heldCount} held email=${emailMode} ai=${aiProvider}`
);
