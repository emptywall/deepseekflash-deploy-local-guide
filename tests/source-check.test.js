const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
const valid = { id: 'deepseek-ai/DeepSeek-V4.1-Flash-1017', sha: 'a'.repeat(40), lastModified: '2026-11-06T10:00:00.000Z' };

function setup(fetch) {
  const elements = Object.fromEntries(['check-updates', 'check-status', 'check-result'].map(id => [id, {
    textContent: '', hidden: id === 'check-result', disabled: false,
    addEventListener(event, handler) { this[event] = handler; }
  }]));
  vm.runInNewContext(source, {
    document: { querySelectorAll: () => [], getElementById: id => elements[id] },
    fetch, AbortController, setTimeout, clearTimeout, Date
  });
  return elements;
}

test('only queries on click and reports validated metadata', async () => {
  const requests = [];
  const e = setup(async (...args) => { requests.push(args); return { ok: true, json: async () => valid }; });
  assert.equal(requests.length, 0);
  await e['check-updates'].click();
  assert.equal(requests.length, 1);
  assert.equal(requests[0][1].credentials, 'omit');
  assert.match(e['check-result'].textContent, /2026-11-06 10:00:00 UTC/);
  assert.match(e['check-status'].textContent, /查询成功/);
  assert.equal(e['check-result'].hidden, false);
  assert.equal(e['check-updates'].disabled, false);
});

test('invalid data and network failure retain the last result and allow retry', async () => {
  let attempt = 0;
  const e = setup(async () => {
    attempt++;
    if (attempt === 2) return { ok: true, json: async () => ({ ...valid, sha: '<invalid>' }) };
    if (attempt === 3) throw new Error('offline');
    return { ok: true, json: async () => valid };
  });
  await e['check-updates'].click();
  const previous = e['check-result'].textContent;
  for (let i = 0; i < 2; i++) {
    await e['check-updates'].click();
    assert.match(e['check-status'].textContent, /查询失败/);
    assert.equal(e['check-result'].textContent, previous);
    assert.equal(e['check-updates'].disabled, false);
  }
  await e['check-updates'].click();
  assert.match(e['check-status'].textContent, /查询成功/);
});
