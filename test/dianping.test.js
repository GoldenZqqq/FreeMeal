import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeActivityDetail, shouldApply } from '../src/dianping.js';

test('normalizeActivityDetail maps current PASS fields', () => {
  const actual = normalizeActivityDetail({
    title: '测试套餐',
    applyBeginTime: 1785895200000,
    applyEndTime: 1786894200000,
    beginTime: 1786982400000,
    endTime: 1789574399000,
    passCount: 10,
    leftPassCount: 3,
    joinCount: 20,
    applyCount: 100,
    followCount: 200,
    userApplyStatus: 0
  });

  assert.equal(actual.activityTitle, '测试套餐');
  assert.equal(actual.passTotalCount, 10);
  assert.equal(actual.passRemainingCount, 3);
  assert.equal(actual.activityCount, 20);
  assert.equal(actual.winningRate, 20);
  assert.equal(actual.applied, false);
  assert.match(actual.applyStartTime, /^2026-08-05 /);
});

test('shouldApply requires the configured PASS remainder', () => {
  const filters = {
    includeKeywords: [],
    excludeKeywords: [],
    modes: [],
    minWinningRate: 0,
    passOnly: true,
    minPassRemaining: 1
  };

  assert.equal(shouldApply({ activityTitle: '有名额', passRemainingCount: 1 }, filters), true);
  assert.equal(shouldApply({ activityTitle: '已抢完', passRemainingCount: 0 }, filters), false);
});
