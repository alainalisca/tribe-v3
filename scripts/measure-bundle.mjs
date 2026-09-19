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
/** Present whenever a build ran, whatever it decided to prerender. */
const BUILD_DIR = '.next/server/app';

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

// Two very different failures used to share one message.
//
// "run the build first" is true when nothing has been built. It is badly
// misleading when the build ran fine and simply stopped prerendering the home
// page, which is what happened when 740475b added headers() to the root
// layout: every route in the app became request-time rendered, this file
// vanished, and the CI failure read as though someone had forgotten a step.
// It cost a pull request a red check that had nothing to do with its changes.
if (!fs.existsSync(HOME_HTML)) {
  const buildRan = fs.existsSync(BUILD_DIR);

  if (!buildRan) {
    console.error(`::error::${HOME_HTML} not found and ${BUILD_DIR} does not exist. Run the build first.`);
    process.exit(1);
  }

  console.error(
    `::error::The home page is no longer prerendered. The build ran and produced ${BUILD_DIR}, but it did not emit ${HOME_HTML}, so / is now rendered at request time instead of statically. This gate measures the scripts a prerendered home page references, so it has nothing to read.`
  );
  console.error(
    '::error::The usual cause is a request-time API reaching the root layout or the home page: headers(), cookies(), draftMode(), connection(), searchParams, or an explicit `export const dynamic`. In app/layout.tsx any of those opts in EVERY route underneath it, not only the one that uses it.'
  );
  console.error(
    '::error::Confirm it in the build output: the route table should show / as "o" (Static). If it shows "f" (Dynamic), that is this failure. Worked example: commit 740475b introduced it and its revert restored 79 static routes.'
  );
  console.error(
    '::error::Fix the rendering rather than this gate. A dynamic home page is a real regression in what an athlete on 4G downloads, which is the thing the budget exists to protect.'
  );
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
