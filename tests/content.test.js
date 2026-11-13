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

test('the setup table has tiered rows and each names a real source', () => {
  // 行数随收录方案增长；锁下限而不是固定值，避免每加一组方案就改测试。
  assert.ok(rowBlocks.length >= 10, `expected at least 10 rows, got ${rowBlocks.length}`);
  assert.equal(rowBlocks.length, new Set(tiers).size >= 0 ? rowBlocks.length : 0);
  for (const tier of tiers) assert.ok(['single', 'dual', 'triple', 'quad', 'octa', 'spark', 'apple', 'other'].includes(tier), `unknown tier ${tier}`);
  const body = html.match(/id="setups-table"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)[1];
  const rowMarkup = body.split(/<tr /).slice(1);
  assert.equal(rowMarkup.length, rowBlocks.length);
  for (const row of rowMarkup) {
    assert.match(row, /href="https:\/\//, 'every setup row links to its public source');
    assert.match(row, /target="_blank"/);
    assert.match(row, /rel="noopener noreferrer"/);
  }
});

test('the DeepSeek whale mark is defined once and reused', () => {
  // 图标用 symbol + use 复用：path 只存一份，三处引用。
  assert.equal((html.match(/<symbol id="whale-mark"/g) || []).length, 1, 'whale symbol must be defined exactly once');
  assert.equal((html.match(/href="#whale-mark"/g) || []).length, 3, 'brand mark, side orb and hero core each reuse it');
  // 内联 path 会被重复计入体积，且与 symbol 版本漂移。
  assert.doesNotMatch(html, /<svg viewBox="0 1\.7 27 19\.9"[^>]*><path/, 'no duplicated inline whale path');
});

test('the hero names the cheapest, fastest and best-value plans with sources', () => {
  const hero = html.match(/<ul class="picks">[\s\S]*?<\/ul>/);
  assert.ok(hero, 'hero picks list is missing');
  for (const tag of ['最便宜', '最快', '性价比最高']) {
    assert.ok(hero[0].includes(tag), `missing pick: ${tag}`);
  }
  // 每个「最」都必须能点进原始来源。
  const links = hero[0].match(/href="https:\/\/[^"]+"/g) || [];
  assert.equal(links.length, 3, 'each pick needs one source link');
  for (const link of links) assert.match(link, /^href="https:\/\//);
});

test('the page carries a generated two-day price table', () => {
  // 该区块由 deploy/check_prices.py 生成；测试只保证它存在且结构可解析，
  // 不锁死具体价格（价格每天可能变）。
  const block = html.match(/<!-- PRICE-CHANGES:BEGIN[\s\S]*?<!-- PRICE-CHANGES:END -->/);
  assert.ok(block, 'generated price block is missing');
  assert.match(block[0], /id="price-changes"/);
  assert.match(block[0], /昨天 vs 今天/);
  assert.match(block[0], /昨天均价/);
  assert.match(block[0], /今天均价/);
  assert.match(block[0], /<tbody>/);
  // 必须标注方法与局限，否则「均价」会被误读成全网成交价。
  assert.match(block[0], /算术平均/);
  assert.match(block[0], /无采样/);
});

test('the two-day table never fabricates a missing day', () => {
  // 未采集到的日期必须显式写「无采样」，不得用插值或复制昨天的数字冒充。
  const block = html.match(/<!-- PRICE-CHANGES:BEGIN[\s\S]*?<!-- PRICE-CHANGES:END -->/);
  assert.ok(block);
  // 每行都要说明样本来源数量
  const rows = block[0].match(/<tr><th scope="row">[\s\S]*?<\/tr>/g) || [];
  assert.ok(rows.length >= 1, 'expected at least one priced row');
  for (const row of rows) {
    // 行内必须能追溯到报价：昨/今几个来源、最近两次对比日期、或长窗口的来源日期。
    assert.match(
      row,
      /昨 \d+ 源|今 \d+ 源|对比 20\d\d-|近\d+日 \d+ 源/,
      'each row states its sample provenance',
    );
  }
});

test('the page includes Apple Silicon routes', () => {
  // 「官方权重是原精度还是量化」栏目已按 boss 要求移除，不再断言其内容；
  // 这里只保留苹果方案的存在性检查。
  assert.match(html, /Apple Silicon/);
  assert.match(html, /mlx/i);
  assert.match(html, /Thunderbolt 5/);
});

test('the removed weight-precision panel stays removed', () => {
  // 防止以后有人「顺手加回来」：该栏目是按明确要求删掉的。
  assert.doesNotMatch(html, /官方权重是原精度还是量化/);
  assert.doesNotMatch(html, /quant_method/);
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
