import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { activityIdFromUrl } from './dianping.js';
import { compactText } from './utils.js';

export async function loadSeenActivityIds(reportDir, logger = null) {
  const statePath = join(reportDir, 'seen-activities.json');
  try {
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    return new Set((state.activityIds || []).map(String));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger?.warn(`Failed to read notification state: ${error.message}`);
    }
  }

  return loadLegacyReportIds(reportDir, logger);
}

export async function saveSeenActivityIds(reportDir, activityIds) {
  await mkdir(reportDir, { recursive: true });
  const statePath = join(reportDir, 'seen-activities.json');
  const temporaryPath = `${statePath}.tmp`;
  const state = {
    updatedAt: new Date().toISOString(),
    activityIds: [...activityIds].map(String).sort()
  };
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, statePath);
}

async function loadLegacyReportIds(reportDir, logger) {
  const seen = new Set();
  let files = [];
  try {
    files = await readdir(reportDir);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger?.warn(`Failed to read report history: ${error.message}`);
    }
    return seen;
  }

  const jsonFiles = files.filter((file) => /^freemeal-.*\.json$/.test(file));
  for (const file of jsonFiles) {
    try {
      const text = await readFile(join(reportDir, file), 'utf8');
      const report = JSON.parse(text);
      for (const record of report.records || []) {
        if (!['matched', 'notified'].includes(record.discoveryStatus)) {
          continue;
        }
        const id = String(record.offlineActivityId || activityIdFromUrl(record.detailUrl) || '');
        if (id) {
          seen.add(id);
        }
      }
    } catch (error) {
      logger?.warn(`Skipped unreadable report history ${compactText(file, 80)}: ${error.message}`);
    }
  }

  return seen;
}
