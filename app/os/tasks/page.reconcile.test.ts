import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, 'page.tsx'), 'utf-8');

describe('tasks page reconcile-before-fetch contract', () => {
  it('calls POST reconcile before GET tasks in fetchTasks', () => {
    const reconcileIdx = src.indexOf("fetch('/api/tribe-os/sequences/reconcile'");
    const tasksIdx = src.indexOf("fetch('/api/tribe-os/sequences/tasks')");

    expect(reconcileIdx).toBeGreaterThan(-1);
    expect(tasksIdx).toBeGreaterThan(-1);
    expect(reconcileIdx).toBeLessThan(tasksIdx);
  });

  it('reconcile call uses POST method', () => {
    const match = src.match(
      /fetch\('\/api\/tribe-os\/sequences\/reconcile'[^)]*method:\s*'POST'/,
    );
    expect(match).toBeTruthy();
  });

  it('reconcile failure does not prevent tasks fetch (no early return)', () => {
    const fetchTasksMatch = src.match(/const fetchTasks[\s\S]*?(?=\n  const \w)/);
    expect(fetchTasksMatch).toBeTruthy();
    const body = fetchTasksMatch![0];

    const reconcileIdx = body.indexOf('reconcile');
    const tasksIdx = body.indexOf("fetch('/api/tribe-os/sequences/tasks')");
    expect(reconcileIdx).toBeGreaterThan(-1);
    expect(tasksIdx).toBeGreaterThan(-1);

    const between = body.slice(reconcileIdx, tasksIdx);
    expect(between).not.toContain('return;');
    expect(between).not.toContain('return ');
  });
});
