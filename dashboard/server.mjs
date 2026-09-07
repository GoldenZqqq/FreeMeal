import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = process.env;

const PORT = Number(env.PORT || 8787);
const CITY_ID = env.DIANPING_CITY_ID || '1';
const CITY_NAME = env.DIANPING_CITY_NAME || '上海';
const COOKIE = env.DIANPING_COOKIE || '';
const MAX_PAGES = Number(env.FREEMEAL_DASH_MAX_PAGES || 20);
const LIST_REFRESH_MS = Number(env.FREEMEAL_DASH_REFRESH_MS || 60000);
const DETAIL_REFRESH_MS = Number(env.FREEMEAL_DASH_DETAIL_REFRESH_MS || 120000);
const CONCURRENCY = Number(env.FREEMEAL_DASH_CONCURRENCY || 4);

const TYPE_NAMES = Object.freeze({
  0: '全部',
  1: '美食',
  2: '变美',
  3: '美妆',
  4: '健康亲子',
  6: '玩乐休闲',
  8: '教育培训',
  10: '生活服务',
  17: '汽车服务',
  18: '宠物',
  19: '医疗健康'
});

function parseTypeList(value) {
  if (!value) return [];
  const list = String(value).split(',').map(s => Number(s.trim())).filter(v => Number.isFinite(v) && v > 0);
  return list.filter((v, i, a) => a.indexOf(v) === i);
}

const rawExclude = parseTypeList(env.FREEMEAL_DASH_EXCLUDE_TYPES);
const EXCLUDE_TYPES = new Set(rawExclude.length ? rawExclude : [1]);
const INCLUDE_TYPES = parseTypeList(env.FREEMEAL_DASH_INCLUDE_TYPES);
const ALL_TYPES = Object.entries(TYPE_NAMES).map(([value,name]) => ({ value: Number(value), name })).filter(x => x.value !== 0);
const DATA_TYPES = INCLUDE_TYPES.length ? INCLUDE_TYPES : ALL_TYPES.map(x => x.value);
const DEFAULT_TYPES = INCLUDE_TYPES.length ? INCLUDE_TYPES : ALL_TYPES.map(x => x.value).filter(v => !EXCLUDE_TYPES.has(v));

const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 dp/com.dianping.dpscope/11.63.13',
  'Referer': 'https://h5.dianping.com/app/app-community-free-meal/detail.html',
  'Origin': 'https://m.dianping.com'
};

function headersWithCookie(contentType) {
  const headers = { ...BASE_HEADERS };
  if (contentType) headers['Content-Type'] = contentType;
  if (COOKIE) headers.Cookie = COOKIE;
  return headers;
}

const LIST_URL = 'https://m.dianping.com/activity/static/pc/ajaxList';
const DETAIL_URL = 'https://m.dianping.com/bwc/customer/bwcDetailPackage';

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function typeNameOf(type) {
  return TYPE_NAMES[type] || `品类 ${type}`;
}

function buildAppUrl(id) {
  if (!id) return '';
  const params = new URLSearchParams({
    picassoid: 'pexus-freetry-detail/index-bundle.js',
    notitlebar: 'true',
    activityId: String(id),
    offlineActivityId: String(id)
  });
  return `dianping://picassobox?${params.toString()}`;
}

async function fetchListPage(type, page) {
  const res = await fetch(LIST_URL, {
    method: 'POST',
    headers: headersWithCookie('application/json;charset=UTF-8'),
    body: JSON.stringify({ cityId: CITY_ID, mode: '', page, type })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} from list: ${text.slice(0, 200)}`);
  const json = JSON.parse(text);
  if (json.code !== 200) throw new Error(`list code ${json.code}: ${json.errorMsg || ''}`);
  return json.data || {};
}

function normalizeList(item, type) {
  const rawId = String(item.offlineActivityId || '');
  const detailUrl = item.detailUrl || '';
  const idMatch = String(detailUrl).match(/\/event\/([^/?#]+)/);
  const offlineActivityId = rawId || (idMatch ? idMatch[1] : '');
  return {
    offlineActivityId,
    activityTitle: item.activityTitle || '',
    picUrl: item.picUrl || '',
    detailUrl,
    regionName: item.regionName || '',
    mode: toNumber(item.mode, 0),
    applyCount: toNumber(item.applyCount, 0),
    hits: toNumber(item.hits, 0),
    type,
    typeName: typeNameOf(type),
    appDetailUrl: buildAppUrl(offlineActivityId)
  };
}

async function fetchActivitiesForType(type) {
  const out = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await fetchListPage(type, page);
    const items = data.detail || [];
    for (const item of items) out.push(normalizeList(item, type));
    if (!data.hasNext || items.length === 0) break;
  }
  return out;
}

function isApplied(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  const text = String(value ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'applied', 'success', '已报名', '已申请'].includes(text);
}

function isRegistrationOpen(begin, end, now) {
  return (!begin || begin <= now) && (!end || now <= end);
}

function normalizeDetail(d, fallback) {
  const applyBeginTime = toNumber(d.applyBeginTime, 0);
  const applyEndTime = toNumber(d.applyEndTime, 0);
  const beginTime = toNumber(d.beginTime,  0);
  const endTime = toNumber(d.endTime,  0);
  const activityCount = toNumber(d.joinCount,  0);
  const applyCount = toNumber(d.applyCount,  0);
  const passTotalCount = toNumber(d.passCount,  0);
  const passRemainingCount = toNumber(d.leftPassCount,  0);
  const attentionCount = toNumber(d.followCount,  0);
  return {
    ...fallback,
    activityTitle: d.title || fallback.activityTitle,
    passTotalCount,
    passRemainingCount,
    activityCount,
    applyCount,
    attentionCount,
    cost: toNumber(d.cost,  0),
    applied: isApplied(d.userApplyStatus),
    registrationOpen: isRegistrationOpen(applyBeginTime, applyEndTime, Date.now()),
    applyBeginTime,
    applyEndTime,
    beginTime,
    endTime,
    type: toNumber(d.type, fallback.type),
  };
}

async function fetchDetail(id) {
  const form = new URLSearchParams({
    id: String(id),
    offlineActivityId: String(id),
    busiType: '0',
    env: '0',
    lat: '',
    lng: '',
    cityId: CITY_ID,
    appCityId: CITY_ID,
    uuidSwitch: 'false'
  });
  const res = await fetch(DETAIL_URL, {
    method: 'POST',
    headers: headersWithCookie('application/x-www-form-urlencoded;charset=UTF-8'),
    body: form.toString()
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} from detail ${id}: ${text.slice(0, 200)}`);
  const json = JSON.parse(text);
  if (!json || json.code !== 200 || !json.data) throw new Error(`detail code ${json && json.code}`);
  return normalizeDetail(json.data, { offlineActivityId: String(id) });
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= items.length) break;
      try {
        results[index] = await fn(items[index], index);
      } catch (err) {
        results[index] = { error: err.message };
      }
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

let cache = {
  activities: [],
  fetchedAt: 0,
  detailUpdatedAt: 0,
  lastError: null
};
let refreshing = null;

async function refresh(forceDetail = false) {
  if (refreshing && !forceDetail) return refreshing;
  const task = (async () => {
    try {
      const listActivities = [];
      for (const type of DATA_TYPES) {
        const items = await fetchActivitiesForType(type);
        listActivities.push(...items);
      }
      const byId = new Map();
      for (const activity of listActivities) byId.set(activity.offlineActivityId, activity);
      const oldById = new Map(cache.activities.map(a => [a.offlineActivityId, a]));
      const detailStale = Date.now() - cache.detailUpdatedAt > DETAIL_REFRESH_MS;
      const needDetailIds = [];
      for (const id of Array.from(byId.keys())) {
        const old = oldById.get(id);
        if (!old || detailStale || forceDetail) needDetailIds.push(id);
      }
      const detailResults = needDetailIds.length
        ? await mapLimit(needDetailIds, CONCURRENCY, async (id) => {
            try {
              return { id, data: await fetchDetail(id) };
            } catch (err) {
              return { id, error: err.message };
            }
          })
        : [];
      const detailById = new Map();
      const detailErrors = new Map();
      for (const result of detailResults) {
        if (result.error) detailErrors.set(result.id, result.error);
        else detailById.set(result.id, result.data);
      }
      const activities = Array.from(byId.values()).map(activity => {
        const old = oldById.get(activity.offlineActivityId) || {};
        const detail = detailById.get(activity.offlineActivityId) || old;
        const detailError = detailErrors.get(activity.offlineActivityId) || old.detailError || '';
        return { ...activity, ...detail, detailError };
      });
      cache = {
        activities,
        fetchedAt: Date.now(),
        detailUpdatedAt: detailStale || forceDetail ? Date.now() : cache.detailUpdatedAt,
        lastError: null
      };
    } catch (err) {
      cache.lastError = err.message;
      if (!cache.activities.length) throw err;
    } finally {
      refreshing = null;
    }
  })();
  refreshing = task;
  return task;
}

function getView() {
  return {
    cityId: CITY_ID,
    cityName: CITY_NAME,
    fetchedAt: cache.fetchedAt,
    detailUpdatedAt: cache.detailUpdatedAt,
    lastError: cache.lastError,
    types: ALL_TYPES,
    defaultTypes: DEFAULT_TYPES,
    activities: cache.activities
  };
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

async function serveStatic(res, pathname) {
  const root = join(__dirname, 'public');
  const filePath = pathname === '/' ? join(root, 'index.html') : normalize(join(root, pathname));
  if (!filePath.startsWith(root)) {
    sendJson(res, 403, { error: 'forbidden' });
    return;
  }
  try {
    const text = await readFile(filePath, 'utf8');
    const ext = extname(filePath) || '.html';
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(text);
  } catch (err) {
    if (err.code === 'ENOENT') sendJson(res, 404, { error: 'not found' });
    else sendJson(res, 500, { error: err.message });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const pathname = decodeURIComponent(url.pathname);
  if (pathname === '/api/activities') {
    const force = url.searchParams.get('force') === '1';
    try {
      if (force) {
        await refresh(true);
      } else {
        if (!cache.activities.length) {
          await refresh(false);
        } else if (Date.now() - cache.fetchedAt > LIST_REFRESH_MS) {
          refresh(false).catch(() => {});
        }
      }
      sendJson(res, 200, getView());
    } catch (err) {
      sendJson(res, 502, { error: err.message });
    }
    return;
  }
  if (pathname === '/api/config') {
    sendJson(res, 200, {
      cityId: CITY_ID,
      cityName: CITY_NAME,
      types: ALL_TYPES,
      defaultTypes: DEFAULT_TYPES
    });
    return;
  }
  await serveStatic(res, pathname);
});

server.listen(PORT, () => {
  console.log(`[FreeMeal Dashboard] http://127.0.0.1:${PORT}`);
  console.log(`[FreeMeal Dashboard] city=${CITY_NAME}(${CITY_ID}) types=${DATA_TYPES.join(',')}`);
});
