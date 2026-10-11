/**
 * The Android release build shrinks its code with R8, and keeps what the
 * WebView bridge calls by name.
 *
 * Google Play requires code shrinking on new releases from February 2027, and
 * a release built without it is a silent regression: nothing fails, the app is
 * just three times larger and Play starts warning. So the setting is pinned.
 *
 * What this test does NOT prove, and cannot: that the shrunk app works. That
 * was established on 2026-10-11 by building the release APK with and without
 * R8 and diffing the bytecode: all 10 Capacitor plugins kept their bridge
 * methods by name with @PluginMethod intact (65 methods), @CapacitorPlugin
 * names intact, and every @JavascriptInterface method (MessageHandler.
 * postMessage, the Cordova bridge, SystemBars, CapacitorHttp, CapacitorCookies)
 * kept by name and still annotated. The only proof of RUNTIME behaviour is
 * installing the release on a phone, which the release checklist requires.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const gradle = readFileSync(path.join(ROOT, 'android', 'app', 'build.gradle'), 'utf8');
const rules = readFileSync(path.join(ROOT, 'android', 'app', 'proguard-rules.pro'), 'utf8');

/** Groovy line comments out, so a commented-out setting does not count. */
const code = (src: string) => src.replace(/\/\/.*$/gm, '');
/** ProGuard comments out, for the same reason. */
const ruleCode = (src: string) => src.replace(/#.*$/gm, '');

/** The body of `release { ... }` inside buildTypes, by brace depth. */
function releaseBlock(src: string): string {
  const buildTypes = src.indexOf('buildTypes');
  expect(buildTypes, 'buildTypes block not found').toBeGreaterThan(-1);
  const start = src.indexOf('release', buildTypes);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open + 1, i);
  }
  throw new Error('unterminated release block');
}

describe('Android release build', () => {
  const release = releaseBlock(code(gradle));

  it('shrinks code and resources', () => {
    expect(release).toMatch(/\bminifyEnabled\s+true\b/);
    expect(release).toMatch(/\bshrinkResources\s+true\b/);
  });

  it('uses the optimizing default rules plus the project file', () => {
    expect(release).toContain("getDefaultProguardFile('proguard-android-optimize.txt')");
    expect(release).toContain("'proguard-rules.pro'");
  });

  it('keeps every @JavascriptInterface method, which the WebView calls by name', () => {
    expect(ruleCode(rules).replace(/\s+/g, ' ')).toContain(
      '-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }'
    );
  });

  it('keeps line numbers so Play Console crash reports are readable', () => {
    expect(ruleCode(rules)).toMatch(/-keepattributes\s+SourceFile,LineNumberTable/);
  });
});
