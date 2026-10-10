/**
 * Verifies that saving gym plans does NOT create notification rows.
 *
 * The bell count jumped from 4 → 9+ during testing because of concurrent
 * background cron jobs (behavioral-nudges, smart-match, spotlight-rotation),
 * not because plan saves create notifications.
 *
 * This test confirms by auditing the route source for any notification
 * or bell-affecting writes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('plan save does not create notifications', () => {
  const routeSource = readFileSync(
    join(__dirname, 'route.ts'),
    'utf-8',
  );

  it('route.ts does not import createNotification', () => {
    expect(routeSource).not.toContain('createNotification');
  });

  it('route.ts does not insert into notifications table', () => {
    expect(routeSource).not.toMatch(/from\s*\(\s*['"]notifications['"]\s*\)/);
    expect(routeSource).not.toMatch(/\.insert\b.*notification/i);
  });

  it('route.ts does not call any notification RPC', () => {
    expect(routeSource).not.toMatch(/\.rpc\s*\(\s*['"].*notif/i);
  });
});

describe('gym settings PATCH does not create notifications', () => {
  const gymRouteSource = readFileSync(
    join(__dirname, '..', 'route.ts'),
    'utf-8',
  );

  it('gym route.ts does not import createNotification', () => {
    expect(gymRouteSource).not.toContain('createNotification');
  });

  it('gym route.ts does not insert into notifications table', () => {
    expect(gymRouteSource).not.toMatch(/from\s*\(\s*['"]notifications['"]\s*\)/);
  });
});
