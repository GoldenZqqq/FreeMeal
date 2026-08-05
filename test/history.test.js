import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadSeenActivityIds, saveSeenActivityIds } from '../src/history.js';

test('notification state is stored and loaded atomically', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'freemeal-test-'));
  try {
    await saveSeenActivityIds(directory, new Set(['20', '10']));
    const loaded = await loadSeenActivityIds(directory);
    const state = JSON.parse(await readFile(join(directory, 'seen-activities.json'), 'utf8'));

    assert.deepEqual([...loaded].sort(), ['10', '20']);
    assert.deepEqual(state.activityIds, ['10', '20']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('legacy notified reports are migrated when state is missing', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'freemeal-legacy-test-'));
  try {
    const report = {
      records: [{ offlineActivityId: '30', discoveryStatus: 'notified' }]
    };
    await writeFile(join(directory, 'freemeal-legacy.json'), JSON.stringify(report), 'utf8');
    const loaded = await loadSeenActivityIds(directory);
    assert.deepEqual([...loaded], ['30']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
