#!/usr/bin/env node
/**
 * Bundle measurement for CI.
 *
 * Reports two numbers, because they mean different things and confusing them
 * is what caused a false alarm during T-UI3:
 *
 *   HOME PAGE DOWNLOAD  what a browser actually fetches for "/". This is the
 *                       number that matters to an athlete on 4G in Medellin,
 *                       and it is what CI gates on.
 *   ALL CHUNKS ON DISK  every chunk for all routes added together. Build
 *                       output, not a download. Informational only: code
 *                       splitting moves bytes between chunks without changing
 *                       this total, so gating on it punishes splitting.
 *
 * Method: sum the sizes of the scripts the prerendered home page references.
 * Next 16 no longer prints per-route First Load JS, and @next/bundle-analyzer
 * is webpack-only so it produces no report against a Turbopack build. Reading
 * the script tags is the reliable way left.
 *
 * Usage: node scripts/measure-bundle.mjs [budgetKb]
 * Exits non-zero when the home page exceeds the budget.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const HOME_HTML = '.next/server/app/index.html';
const CHUNKS_DIR = '.next/static/chunks';

function scriptRefs(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  return [...new Set([...html.matchAll(/\/_next\/static\/[a-zA-Z0-9/._-]+\.js/g)].map((m) => m[0]))];
}

function bytesOf(ref) {
  try {
    return fs.statSync(path.join('.next', ref.replace('/_next', ''))).size;
  } catch {
    return 0;
  }
}

if (!fs.existsSync(HOME_HTML)) {
  console.error(`::error::${HOME_HTML} not found — run the build first.`);
  process.exit(1);
}

const refs = scriptRefs(HOME_HTML);
const homeKb = Math.round(refs.reduce((sum, r) => sum + bytesOf(r), 0) / 1024);
const totalKb = Number(execSync(`du -sk ${CHUNKS_DIR}`).toString().trim().split(/\s+/)[0]);
const budgetKb = Number(process.argv[2] ?? 0);

console.log('─────────────────────────────────────────────────────────');
console.log(`  HOME PAGE DOWNLOAD : ${homeKb} KB across ${refs.length} scripts   <-- gated`);
console.log(`  ALL CHUNKS ON DISK : ${totalKb} KB (all routes)          <-- informational`);
console.log(`  BUDGET             : ${budgetKb} KB (home page only)`);
console.log('─────────────────────────────────────────────────────────');

if (budgetKb > 0 && homeKb > budgetKb) {
  console.error(`::error::Home page download ${homeKb} KB exceeds budget ${budgetKb} KB`);
  process.exit(1);
}
