import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { csvEscape, timestamp } from './utils.js';

const COLUMNS = [
  ['序号', 'index'],
  ['活动名称', 'activityTitle'],
  ['活动链接', 'detailUrl'],
  ['点评App链接', 'appDetailUrl'],
  ['活动类型', 'mode'],
  ['活动商圈', 'regionName'],
  ['报名开始时间', 'applyStartTime'],
  ['报名结束时间', 'applyEndTime'],
  ['活动名额', 'activityCount'],
  ['报名人数', 'applyCount'],
  ['中奖率(%)', 'winningRate'],
  ['是否已报名', 'applied'],
  ['关注人数', 'attentionCount'],
  ['活动开始时间', 'activityStartTime'],
  ['活动结束时间', 'activityEndTime'],
  ['活动地址', 'activityAddress'],
  ['PASS总名额', 'passTotalCount'],
  ['PASS剩余名额', 'passRemainingCount'],
  ['详情错误', 'detailError'],
  ['发现状态', 'discoveryStatus'],
  ['发现结果', 'discoveryMessage']
];

export async function writeReports({ reportDir, records, summary }) {
  await mkdir(reportDir, { recursive: true });
  const stamp = timestamp();
  const csvPath = join(reportDir, `freemeal-${stamp}.csv`);
  const jsonPath = join(reportDir, `freemeal-${stamp}.json`);

  const csv = [
    COLUMNS.map(([label]) => csvEscape(label)).join(','),
    ...records.map((record) => COLUMNS.map(([, key]) => csvEscape(record[key])).join(','))
  ].join('\n');

  await writeFile(csvPath, `${csv}\n`, 'utf8');
  await writeFile(jsonPath, JSON.stringify({ summary, records }, null, 2), 'utf8');
  return { csvPath, jsonPath };
}
