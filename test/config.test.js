import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

test('open-registration monitoring and first-run baseline are enabled by default', async () => {
  const config = await loadConfig(['--config', 'missing-test-config.json'], {});
  assert.equal(config.filters.registrationOpenOnly, true);
  assert.equal(config.filters.passOnly, false);
  assert.equal(config.filters.minPassRemaining, 1);
  assert.equal(config.baselineOnFirstRun, true);
  assert.equal(config.notifyEmpty, false);
  assert.equal(config.writeEmptyReports, false);
});

test('boolean environment options can disable PASS filtering', async () => {
  const config = await loadConfig(['--config', 'missing-test-config.json'], {
    FREEMEAL_PASS_ONLY: 'false',
    FREEMEAL_NOTIFY_EMPTY: 'true'
  });
  assert.equal(config.filters.passOnly, false);
  assert.equal(config.notifyEmpty, true);
});
