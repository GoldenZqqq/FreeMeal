import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBarkRequest } from '../src/notifier.js';

test('buildBarkRequest normalizes an official Bark URL with placeholder text', () => {
  const request = buildBarkRequest(
    'https://api.day.app/test-device-key/Body%20Text',
    'PASS 上新',
    '剩余 3 个',
    'dianping://activity'
  );

  assert.equal(request.url, 'https://api.day.app/test-device-key');
  assert.deepEqual(JSON.parse(request.options.body), {
    title: 'PASS 上新',
    body: '剩余 3 个',
    url: 'dianping://activity'
  });
});

test('buildBarkRequest accepts a device key', () => {
  const request = buildBarkRequest('test-device-key', '标题', '正文');
  assert.equal(request.url, 'https://api.day.app/test-device-key');
  assert.equal(request.options.method, 'POST');
});
