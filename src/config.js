import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { splitList, toNumber } from './utils.js';

const DEFAULT_CONFIG_PATH = 'config/local.json';
const DEFAULT_CITY_ID = '1';
const DEFAULT_CITY_NAME = '上海';

export async function loadConfig(argv = process.argv.slice(2), env = process.env) {
  const cli = parseArgs(argv);
  const fileConfig = await readJsonIfExists(cli.config || env.FREEMEAL_CONFIG || DEFAULT_CONFIG_PATH);

  const config = {
    cityId: cli.cityId || env.DIANPING_CITY_ID || fileConfig.cityId || DEFAULT_CITY_ID,
    cityName: cli.cityName || env.DIANPING_CITY_NAME || fileConfig.cityName || DEFAULT_CITY_NAME,
    cookie: env.DIANPING_COOKIE || fileConfig.cookie || '',
    maxPages: positiveInteger(cli.maxPages ?? env.FREEMEAL_MAX_PAGES ?? fileConfig.maxPages, 5),
    maxResults: positiveInteger(cli.maxResults ?? env.FREEMEAL_MAX_RESULTS ?? fileConfig.maxResults, 20),
    excludeActivityIds: splitList(cli.excludeIds ?? env.FREEMEAL_EXCLUDE_IDS ?? fileConfig.excludeActivityIds),
    reportDir: cli.reportDir || env.FREEMEAL_REPORT_DIR || fileConfig.reportDir || 'reports',
    bark: env.BARK || fileConfig.bark || '',
    notifyEmpty: toBoolean(cli.notifyEmpty ?? env.FREEMEAL_NOTIFY_EMPTY ?? fileConfig.notifyEmpty, false),
    baselineOnFirstRun: toBoolean(
      cli.baselineOnFirstRun ?? env.FREEMEAL_BASELINE_ON_FIRST_RUN ?? fileConfig.baselineOnFirstRun,
      true
    ),
    writeEmptyReports: toBoolean(
      cli.writeEmptyReports ?? env.FREEMEAL_WRITE_EMPTY_REPORTS ?? fileConfig.writeEmptyReports,
      false
    ),
    filters: {
      includeKeywords: splitList(cli.include ?? env.FREEMEAL_INCLUDE ?? fileConfig.filters?.includeKeywords),
      excludeKeywords: splitList(cli.exclude ?? env.FREEMEAL_EXCLUDE ?? fileConfig.filters?.excludeKeywords),
      minWinningRate: toNumber(cli.minWinningRate ?? env.FREEMEAL_MIN_WIN_RATE ?? fileConfig.filters?.minWinningRate, 0),
      modes: splitList(cli.modes ?? env.FREEMEAL_MODES ?? fileConfig.filters?.modes),
      registrationOpenOnly: toBoolean(
        cli.registrationOpenOnly ?? env.FREEMEAL_REGISTRATION_OPEN_ONLY ?? fileConfig.filters?.registrationOpenOnly,
        true
      ),
      passOnly: toBoolean(cli.passOnly ?? env.FREEMEAL_PASS_ONLY ?? fileConfig.filters?.passOnly, false),
      minPassRemaining: nonNegativeInteger(
        cli.minPassRemaining ?? env.FREEMEAL_MIN_PASS_REMAINING ?? fileConfig.filters?.minPassRemaining,
        1
      )
    }
  };

  return config;
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      continue;
    }
    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    const nextValue = argv[index + 1];
    const value = inlineValue ?? (nextValue?.startsWith('--') ? true : nextValue ?? true);
    if (inlineValue === undefined && value === nextValue) {
      index += 1;
    }
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    result[key] = value;
  }
  return result;
}

async function readJsonIfExists(path) {
  const resolved = resolve(path);
  if (!existsSync(resolved)) {
    return {};
  }
  const text = await readFile(resolved, 'utf8');
  return JSON.parse(text);
}

function positiveInteger(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonNegativeInteger(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function toBoolean(value, fallback) {
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}
