import { compactText, toNumber } from './utils.js';

const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 dp/com.dianping.dpscope/11.63.13',
  Referer: 'https://h5.dianping.com/app/app-community-free-meal/detail.html',
  Origin: 'https://m.dianping.com'
};

const LIST_URL = 'https://m.dianping.com/activity/static/pc/ajaxList';
const DETAIL_URL = 'https://m.dianping.com/bwc/customer/bwcDetailPackage';

const MODE_NAMES = new Map([
  [1, '聚会'],
  [2, 'V聚会'],
  [3, '电子券'],
  [4, '好礼到家'],
  [5, '天天抽奖']
]);

export class HttpError extends Error {
  constructor(message, { status, url, body = '' } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

export class DianpingClient {
  constructor({ cookie = '', timeoutMs = 15000, logger = null } = {}) {
    this.cookie = cookie;
    this.timeoutMs = timeoutMs;
    this.logger = logger;
  }

  async fetchActivities({ cityId, maxPages = 5 }) {
    const activities = [];
    for (let page = 1; page <= maxPages; page += 1) {
      this.logger?.info(`Fetching activity list page ${page}/${maxPages} for city ${cityId}`);
      const payload = { cityId, mode: '', page, type: 0 };
      const body = await this.requestJson(LIST_URL, {
        method: 'POST',
        headers: {
          ...this.mobileHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const detail = body?.data?.detail;
      if (!Array.isArray(detail)) {
        throw new Error(`Unexpected activity list response on page ${page}`);
      }

      this.logger?.info(`Activity list page ${page} returned ${detail.length} items, hasNext=${Boolean(body.data.hasNext)}`);
      activities.push(...detail.map(normalizeActivity));
      if (!body.data.hasNext) {
        break;
      }
    }
    return activities;
  }

  async fetchActivityDetail({ offlineActivityId, cityId }) {
    if (!offlineActivityId) {
      return {};
    }
    const form = new URLSearchParams({
      id: String(offlineActivityId),
      offlineActivityId: String(offlineActivityId),
      busiType: '0',
      env: '0',
      lat: '',
      lng: '',
      cityId: String(cityId),
      appCityId: String(cityId),
      uuidSwitch: 'false'
    });
    const body = await this.requestJson(DETAIL_URL, {
      method: 'POST',
      headers: {
        ...this.mobileHeaders(),
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      },
      body: form.toString()
    });
    if (body?.code !== 200 || !body?.data) {
      throw new Error(`Unexpected activity detail response for ${offlineActivityId}`);
    }
    return normalizeActivityDetail(body.data);
  }

  mobileHeaders() {
    const headers = {
      ...BASE_HEADERS,
      Accept: 'application/json, text/plain, */*'
    };
    if (this.cookie) {
      headers.Cookie = this.cookie;
    }
    return headers;
  }

  async requestJson(url, options) {
    const text = await this.requestText(url, options);
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(`Invalid JSON from ${sanitizeUrl(url)}: ${compactText(text)}`);
    }
  }

  async requestText(url, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      const text = await response.text();
      if (!response.ok) {
        throw new HttpError(`HTTP ${response.status} from ${sanitizeUrl(url)}: ${compactText(text)}`, {
          status: response.status,
          url: sanitizeUrl(url),
          body: text
        });
      }
      return text;
    } finally {
      clearTimeout(timer);
    }
  }
}

export function activityIdFromUrl(detailUrl) {
  const match = String(detailUrl || '').match(/\/event\/([^/?#]+)/);
  return match?.[1] || '';
}

export function appDetailUrlFromUrl(detailUrl) {
  const activityId = activityIdFromUrl(detailUrl);
  if (!activityId) {
    return '';
  }
  const params = new URLSearchParams({
    picassoid: 'pexus-freetry-detail/index-bundle.js',
    notitlebar: 'true',
    activityId,
    offlineActivityId: activityId
  });
  return `dianping://picassobox?${params.toString()}`;
}

export function normalizeActivity(activity) {
  const modeValue = toNumber(activity.mode, 0);
  const detailUrl = activity.detailUrl || '';
  const offlineActivityId = String(activity.offlineActivityId || activityIdFromUrl(detailUrl) || '');
  const applied = [
    activity.applyed,
    activity.applied,
    activity.hasApplied,
    activity.isApplied,
    activity.userApplyStatus
  ].some(isTruthyFlag);
  return {
    offlineActivityId,
    activityTitle: activity.activityTitle || '',
    detailUrl,
    appDetailUrl: appDetailUrlFromUrl(detailUrl),
    mode: MODE_NAMES.get(modeValue) || String(activity.mode || ''),
    regionName: activity.regionName || '',
    applied,
    raw: activity
  };
}

export function normalizeActivityDetail(detail) {
  const activityCount = toNumber(detail.joinCount, 0);
  const applyCount = toNumber(detail.applyCount, 0);
  return {
    activityTitle: detail.title || '',
    applyStartTime: formatTimestamp(detail.applyBeginTime),
    applyEndTime: formatTimestamp(detail.applyEndTime),
    activityStartTime: formatTimestamp(detail.beginTime),
    activityEndTime: formatTimestamp(detail.endTime),
    activityCount,
    applyCount,
    attentionCount: toNumber(detail.followCount, 0),
    passTotalCount: toNumber(detail.passCount, 0),
    passRemainingCount: toNumber(detail.leftPassCount, 0),
    applied: isTruthyFlag(detail.userApplyStatus),
    winningRate: applyCount > 0 ? Number(((activityCount / applyCount) * 100).toFixed(2)) : 0
  };
}

export function shouldApply(activity, filters) {
  const title = activity.activityTitle || '';
  if (filters.includeKeywords.length > 0 && !filters.includeKeywords.some((word) => title.includes(word))) {
    return false;
  }
  if (filters.excludeKeywords.some((word) => title.includes(word))) {
    return false;
  }
  if (filters.modes.length > 0 && !filters.modes.includes(activity.mode)) {
    return false;
  }
  if (toNumber(activity.winningRate, 0) < filters.minWinningRate) {
    return false;
  }
  if (filters.passOnly && toNumber(activity.passRemainingCount, 0) < filters.minPassRemaining) {
    return false;
  }
  return true;
}

function sanitizeUrl(url) {
  try {
    const parsed = new URL(url);
    for (const key of ['token', 'cookie', 'passCardNo']) {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, '[REDACTED]');
      }
    }
    return parsed.toString();
  } catch {
    return String(url).replace(/([?&](?:token|cookie|passCardNo)=)[^&\s]+/gi, '$1[REDACTED]');
  }
}

function formatTimestamp(value) {
  const milliseconds = toNumber(value, 0);
  if (!milliseconds) {
    return '';
  }
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date(milliseconds));
}

function isTruthyFlag(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value > 0;
  }
  const text = String(value ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'applied', 'success', '已报名', '已申请'].includes(text);
}
