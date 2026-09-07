import { loadConfig } from './config.js';
import { DianpingClient, shouldApply } from './dianping.js';
import { loadSeenActivityIds, notificationStateExists, saveSeenActivityIds, loadLastBarkAt, saveLastBarkAt } from './history.js';
import { notifyBark } from './notifier.js';
import { writeReports } from './report.js';
import { compactText, createLogger } from './utils.js';

const logger = createLogger();

async function main() {
  logger.info('Script started');
  const config = await loadConfig();
  const client = new DianpingClient({ cookie: config.cookie, logger });
  logConfig(config);

  const hasState = await notificationStateExists(config.reportDir);
  const seenActivityIds = await loadSeenActivityIds(config.reportDir, logger);
  logger.info(`Loaded ${seenActivityIds.size} previously processed activities`);

  const list = await client.fetchActivities({
    cityId: config.cityId,
    maxPages: config.maxPages
  });
  logger.info(`Fetched ${list.length} activities`);

  if (!hasState && seenActivityIds.size === 0 && config.baselineOnFirstRun) {
    await initializeBaseline(config, list);
    logger.info('Script finished after first-run baseline');
    return;
  }

  const scan = await scanActivities({ client, config, list, seenActivityIds });
  const notification = await notifyMatches(config, scan.records, scan.processedIds);
  scan.summary.notified = notification.notified;
  scan.summary.notificationFailed = notification.failed;
  await saveSeenActivityIds(config.reportDir, scan.processedIds);
  await finishRun(config, scan);

  if (notification.failed > 0) {
    process.exitCode = 1;
  }
  logger.info('Script finished');
}

function logConfig(config) {
  logger.info([
    `Config loaded: city=${config.cityName || config.cityId}`,
    `maxPages=${config.maxPages}`,
    `maxResults=${config.maxResults}`,
    `passOnly=${config.filters.passOnly}`,
    `minPassRemaining=${config.filters.minPassRemaining}`,
    `registrationOpenOnly=${config.filters.registrationOpenOnly}`,
    `baselineOnFirstRun=${config.baselineOnFirstRun}`,
    `cookie=${config.cookie ? 'configured' : 'missing'}`,
    `bark=${config.bark ? 'configured' : 'missing'}`
  ].join(', '));
}

async function initializeBaseline(config, list) {
  const activityIds = new Set(list.map((activity) => String(activity.offlineActivityId)).filter(Boolean));
  await saveSeenActivityIds(config.reportDir, activityIds);
  logger.info(`First-run baseline saved ${activityIds.size} current activities without notification`);
}

async function scanActivities({ client, config, list, seenActivityIds }) {
  const records = [];
  const processedIds = new Set(seenActivityIds);
  const summary = createSummary(config, list.length);

  for (const [index, activity] of list.entries()) {
    const id = String(activity.offlineActivityId);
    logger.info(`Processing ${index + 1}/${list.length}: ${compactText(activity.activityTitle, 60)}`);
    const earlyReason = getEarlySkipReason(activity, config, seenActivityIds);
    if (earlyReason) {
      records.push(skipRecord({ index, activity }, earlyReason));
      summary.skipped += 1;
      if (!seenActivityIds.has(id)) {
        processedIds.add(id);
      }
      continue;
    }

    const detail = await safeFetchDetail(client, activity, config.cityId);
    const record = createRecord(index, activity, detail);
    const reason = getDetailSkipReason(record, config);
    if (reason) {
      records.push(skipRecord(record, reason));
      summary.skipped += 1;
      if (!record.detailError) {
        processedIds.add(id);
      }
      continue;
    }

    if (summary.matched >= config.maxResults) {
      records.push(skipRecord(record, '超过 maxResults 限制，将在下次重试'));
      summary.skipped += 1;
      continue;
    }
    records.push(matchRecord(record));
    summary.matched += 1;
  }
  return { records, processedIds, summary };
}

function createSummary(config, total) {
  return {
    city: config.cityName || config.cityId,
    total,
    matched: 0,
    skipped: 0,
    notified: 0,
    notificationFailed: 0
  };
}

function getEarlySkipReason(activity, config, seenActivityIds) {
  const id = String(activity.offlineActivityId);
  if (seenActivityIds.has(id)) {
    return '历史已处理，跳过';
  }
  if (config.excludeActivityIds.includes(id)) {
    return '已在 FREEMEAL_EXCLUDE_IDS 中手动排除';
  }
  return '';
}

function getDetailSkipReason(record, config) {
  if (record.detailError) {
    return '详情读取失败，将在下次重试';
  }
  if (record.applied) {
    return '已报名，跳过';
  }
  if (!shouldApply(record, config.filters)) {
    return '过滤规则跳过';
  }
  return '';
}

function createRecord(index, activity, detail = {}) {
  return {
    index: index + 1,
    ...activity,
    ...detail,
    applied: Boolean(activity.applied || detail.applied),
    discoveryStatus: 'pending',
    discoveryMessage: ''
  };
}

function skipRecord(record, reason) {
  const normalized = record.activity ? createRecord(record.index, record.activity) : record;
  normalized.discoveryStatus = 'skipped';
  normalized.discoveryMessage = reason;
  logger.info(`Skipped: ${compactText(normalized.activityTitle, 60)} - ${reason}`);
  return normalized;
}

function matchRecord(record) {
  record.discoveryStatus = 'matched';
  record.discoveryMessage = buildMatchMessage(record);
  logger.info(`Matched: ${compactText(record.activityTitle, 60)} - ${record.discoveryMessage}`);
  return record;
}

async function safeFetchDetail(client, activity, cityId) {
  try {
    return await client.fetchActivityDetail({
      offlineActivityId: activity.offlineActivityId,
      cityId
    });
  } catch (error) {
    logger.warn(`Detail failed for ${activity.offlineActivityId}: ${error.message}`);
    return { detailError: error.message, winningRate: 0 };
  }
}

async function notifyMatches(config, records, processedIds) {
  const result = { notified: 0, failed: 0, throttled: 0 };
  const matchedRecords = records.filter((record) => record.discoveryStatus === 'matched');
  if (!matchedRecords.length) return result;

  const now = Date.now();
  const lastBarkAt = await loadLastBarkAt(config.reportDir, logger);
  const withinWindow = lastBarkAt > 0 && (now - lastBarkAt) < config.barkDebounceMs;

  if (withinWindow) {
    for (const record of matchedRecords) {
      processMatched(record, processedIds, "Bark 节流窗口内，已合并静默");
    }
    result.throttled += matchedRecords.length;
    logger.info(`Bark throttled: ${matchedRecords.length} 个新活动已在 ${Math.round((now - lastBarkAt) / 1000)}s 内合并，不重复推送`);
    return result;
  }

  const notification = buildNewArrivalNotification(config, matchedRecords.length);
  try {
    const response = await notifyBark({ bark: config.bark, ...notification });
    if (response.skipped) {
      logger.info("Bark skipped: " + response.reason);
      for (const record of matchedRecords) processMatched(record, processedIds, "Bark 未配置或跳过，已去重");
      return result;
    }
    await saveLastBarkAt(config.reportDir, now, logger);
    for (const record of matchedRecords) {
      processMatched(record, processedIds, "Bark 已发合并通知");
    }
    result.notified += matchedRecords.length;
    logger.info("Bark sent consolidated new-arrival notification for " + matchedRecords.length + " activities");
  } catch (error) {
    result.failed += 1;
    logger.error("Bark failed: " + error.message);
  }
  return result;
}
function processMatched(record, processedIds, message) {
  record.discoveryStatus = "notified";
  record.discoveryMessage = message;
  processedIds.add(String(record.offlineActivityId));
}

function buildNewArrivalNotification(config, count) {
  return {
    title: '免费试上新提醒',
    body: `${config.cityName || config.cityId} 有 ${count} 个新活动上新`,

    url: '',
  };
}
async function finishRun(config, scan) {
  const { summary, records } = scan;
  logger.info([
    `Run summary: city=${summary.city}`,
    `total=${summary.total}`,
    `matched=${summary.matched}`,
    `notified=${summary.notified}`,
    `notificationFailed=${summary.notificationFailed}`,
    `skipped=${summary.skipped}`
  ].join(', '));
  if (summary.matched > 0 || config.writeEmptyReports) {
    const paths = await writeReports({ reportDir: config.reportDir, records, summary });
    logger.info(`Reports written: ${paths.csvPath}, ${paths.jsonPath}`);
  }
  if (summary.matched === 0 && config.notifyEmpty) {
    await notifyEmptyResult(config, summary);
  }
}

async function notifyEmptyResult(config, summary) {
  try {
    await notifyBark({
      bark: config.bark,
      title: '大众点评免费试暂无上新',
      body: `城市：${summary.city}\n活动：${summary.total}，本次没有新的可报名活动`
    });
  } catch (error) {
    logger.error(`Empty-result Bark notification failed: ${error.message}`);
  }
}

function buildMatchMessage(record) {
  const parts = [
    '报名中',
    record.passTotalCount ? `PASS剩余 ${record.passRemainingCount}/${record.passTotalCount}` : '',
    record.winningRate ? `中奖率 ${record.winningRate}%` : '',
    record.applyCount ? `报名 ${record.applyCount}` : '',
    record.activityCount ? `活动名额 ${record.activityCount}` : '',
    record.regionName ? `商圈 ${record.regionName}` : ''
  ].filter(Boolean);
  return parts.join('，');
}

main().catch(async (error) => {
  logger.error(error.stack || error.message);
  try {
    const config = await loadConfig([]);
    await notifyBark({
      bark: config.bark,
      title: '大众点评免费试监控失败',
      body: error.message
    });
  } catch {
    // Keep the original failure as the process result.
  }
  process.exitCode = 1;
});

