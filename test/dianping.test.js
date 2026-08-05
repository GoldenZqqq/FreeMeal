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
    userApplyStatus: 0,
    activityAbnormal: null
  }, 1786000000000);

  assert.equal(actual.activityTitle, '测试套餐');
  assert.equal(actual.passTotalCount, 10);
  assert.equal(actual.passRemainingCount, 3);
  assert.equal(actual.activityCount, 20);
  assert.equal(actual.winningRate, 20);
  assert.equal(actual.applied, false);
  assert.equal(actual.registrationOpen, true);
  assert.match(actual.applyStartTime, /^2026-08-05 /);
});

test('shouldApply requires the configured PASS remainder', () => {
  const filters = {
    includeKeywords: [],
    excludeKeywords: [],
    modes: [],
    minWinningRate: 0,
    registrationOpenOnly: true,
    passOnly: true,
    minPassRemaining: 1
  };

  const openActivity = { activityTitle: '有名额', registrationOpen: true, passRemainingCount: 1 };
  const exhaustedActivity = { ...openActivity, activityTitle: '已抢完', passRemainingCount: 0 };
  assert.equal(shouldApply(openActivity, filters), true);
  assert.equal(shouldApply(exhaustedActivity, filters), false);
});

test('shouldApply rejects activities outside the registration window', () => {
  const filters = {
    includeKeywords: [],
    excludeKeywords: [],
    modes: [],
    minWinningRate: 0,
    registrationOpenOnly: true,
    passOnly: false,
    minPassRemaining: 1
  };

  assert.equal(shouldApply({ activityTitle: '报名中', registrationOpen: true }, filters), true);
  assert.equal(shouldApply({ activityTitle: '已截止', registrationOpen: false }, filters), false);
  assert.equal(shouldApply({ activityTitle: '异常活动', registrationOpen: true, activityAbnormal: true }, filters), false);
});
