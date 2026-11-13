'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { matchesTier, parseMetric, sortRows } = require('../script.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'script.js'), 'utf8');

const rowBlocks = [...html.matchAll(/<tr ([^>]*data-tier="[^"]+"[^>]*)>/g)].map(match => match[1]);
const tiers = rowBlocks.map(attributes => (attributes.match(/data-tier="([^"]+)"/) || [])[1]);
const chips = [...html.matchAll(/data-filter="([^"]+)"/g)].map(match => match[1]);

test('the page is a community local-deployment reference, not an official API index', () => {
  assert.match(html, /社区本地部署/);
  assert.match(html, /本地部署参考/);
  assert.match(html, /社区实测/);
  assert.doesNotMatch(html, /check-updates/);
  assert.doesNotMatch(html, /repository-history/);
  assert.doesNotMatch(html, /官方 API 接入/);
  assert.doesNotMatch(js, /huggingface\.co\/api/);
});

test('the page focuses on 1017 and provides RMB cost assumptions', () => {
  assert.doesNotMatch(html, /0909/);
  assert.match(html, /1017/);
  assert.match(html, /510,296,708,312/);
  assert.match(html, /Engram/);
  // 汇率与人民币金额随快照更新；这里只锁定「明确写出示例汇率」这一承诺，
  // 不锁定具体数值，避免每次复核汇率都要改测试。
  assert.match(html, /1 美元 = ¥\d+\.\d+/);
  assert.match(html, /1 欧元 = ¥\d+\.\d+/);
  assert.match(html, /¥\d+\.\d+ 每百万输出 token/);
  assert.match(html, /非实时汇率|示例汇率|非实时/);
});

test('the setup table has ten tiered rows and each names a real source', () => {
  assert.equal(rowBlocks.length, 10);
  for (const tier of tiers) assert.ok(['single', 'dual', 'triple', 'quad', 'octa', 'spark', 'other'].includes(tier), `unknown tier ${tier}`);
  const body = html.match(/id="setups-table"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)[1];
  const rowMarkup = body.split(/<tr /).slice(1);
  assert.equal(rowMarkup.length, 10);
  for (const row of rowMarkup) {
    assert.match(row, /href="https:\/\//, 'every setup row links to its public source');
    assert.match(row, /target="_blank"/);
    assert.match(row, /rel="noopener noreferrer"/);
  }
});

test('filter chips cover every hardware tier used by the table', () => {
  assert.ok(chips.includes('all'));
  for (const tier of new Set(tiers)) assert.ok(chips.includes(tier), `missing chip for ${tier}`);
});

test('the page has no runtime network or third-party script dependencies', () => {
  assert.doesNotMatch(html, /<script[^>]+src="https?:/);
  assert.doesNotMatch(html, /<link[^>]+href="https?:/);
  assert.doesNotMatch(js, /fetch\(|XMLHttpRequest/);
  // 允许 ?v=<hash> 之类的缓存参数：页面用它强制刷新，不影响「无网络依赖」这一承诺。
  assert.match(html, /<script src="script\.js(\?v=[A-Za-z0-9]+)?"><\/script>/);
});

test('the stylesheet keeps the responsive table and chart layout', () => {
  for (const selector of ['.setups-table', '.table-scroll', '.filter-chips', '.bar-track', '.stat-chips', '@media (max-width: 680px)']) {
    assert.ok(css.includes(selector), `missing ${selector}`);
  }
});

test('matchesTier filters by hardware tier', () => {
  assert.equal(matchesTier('dual', 'all'), true);
  assert.equal(matchesTier('dual', 'dual'), true);
  assert.equal(matchesTier('spark', 'dual'), false);
});

test('parseMetric keeps numbers and rejects missing values', () => {
  assert.equal(parseMetric('224.1'), 224.1);
  assert.equal(parseMetric(''), null);
  assert.equal(parseMetric(undefined), null);
  assert.equal(parseMetric('n/a'), null);
});

test('sortRows orders by metric descending with missing values last', () => {
  const rows = [
    { order: 0, single: 57, batch: 140 },
    { order: 1, single: 224.1, batch: 362.9 },
    { order: 2, single: null, batch: 2282 },
    { order: 3, single: 103.35, batch: null },
  ];
  assert.deepEqual(sortRows(rows, 'default').map(row => row.order), [0, 1, 2, 3]);
  assert.deepEqual(sortRows(rows, 'single-desc').map(row => row.order), [1, 3, 0, 2]);
  assert.deepEqual(sortRows(rows, 'batch-desc').map(row => row.order), [2, 1, 0, 3]);
  assert.deepEqual(rows.map(row => row.order), [0, 1, 2, 3], 'input array is not mutated');
});

test('every internal anchor resolves and every external link is https', () => {
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]));
  for (const match of html.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(ids.has(match[1]), `missing anchor target #${match[1]}`);
  }
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const href = match[1];
    assert.ok(!href.startsWith('http:') && !href.startsWith('javascript:'), `unsafe link ${href}`);
    assert.ok(href.startsWith('https://') || href.startsWith('#') || !href.includes('://'), `unexpected link ${href}`);
  }
});
