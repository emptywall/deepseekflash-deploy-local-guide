const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
const valid = { id: 'deepseek-ai/DeepSeek-V4.1-Flash-1017', sha: 'a'.repeat(40), lastModified: '2026-11-06T10:00:00.000Z' };
const commit = { id: 'b'.repeat(40), title: '<img src=x onerror=alert(1)>', date: '2026-10-17T05:46:55.000Z' };
const response = data => ({ ok: true, json: async () => data });

function setup(fetch, timers = { setTimeout, clearTimeout }) {
  function element() {
    return { textContent: '', children: [], hidden: false, disabled: false,
      addEventListener(event, handler) { this[event] = handler; },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; }
    };
  }
  const elements = Object.fromEntries(['check-updates', 'check-status', 'check-result', 'history-status', 'history-list'].map(id => [id, element()]));
  elements['check-result'].hidden = true;
  vm.runInNewContext(source, {
    document: { querySelectorAll: () => [], getElementById: id => elements[id], createElement: element },
    fetch, AbortController, ...timers, Date
  });
  return elements;
}

test('opt-in check displays metadata and bounded, safely constructed repository history', async () => {
  const requests = [];
  const e = setup(async (...args) => { requests.push(args); return response(args[0].includes('/commits/') ? [commit, ...Array(7).fill(commit)] : valid); });
  assert.equal(requests.length, 0);
  await e['check-updates'].click();
  assert.equal(requests.length, 2);
  assert.equal(requests[1][0], 'https://huggingface.co/api/models/deepseek-ai/DeepSeek-V4.1-Flash-1017/commits/main?limit=5');
  assert.ok(requests.every(r => r[1].credentials === 'omit' && r[1].cache === 'no-store' && r[1].signal));
  assert.match(e['check-result'].textContent, /2026-11-06 10:00:00 UTC/);
  assert.match(e['check-status'].textContent, /查询成功/);
  assert.equal(e['check-result'].hidden, false);
  assert.equal(e['check-updates'].disabled, false);
  const items = e['history-list'].children;
  assert.equal(items.length, 5);
  assert.equal(items[0].children[0].textContent, commit.title);
  assert.equal(items[0].children[0].href, `https://huggingface.co/${valid.id}/commit/${commit.id}`);
  assert.equal(items[0].children[0].rel, 'noopener noreferrer');
  assert.equal(items[0].children[1].textContent, '2026-10-17 05:46:55 UTC');
});

test('history failure does not prevent metadata and retries clear stale history', async () => {
  let fail = false;
  const e = setup(async url => url.includes('/commits/') ? (fail ? Promise.reject(Error('offline')) : response([commit])) : response(valid));
  await e['check-updates'].click();
  assert.equal(e['history-list'].children.length, 1);
  fail = true;
  await e['check-updates'].click();
  assert.match(e['check-status'].textContent, /查询成功/);
  assert.match(e['history-status'].textContent, /失败或超时/);
  assert.equal(e['history-list'].children.length, 0);
});

test('invalid entries are omitted and metadata errors retain last result', async () => {
  let invalid = false;
  const e = setup(async url => url.includes('/commits/') ? response([{ ...commit, id: '../bad' }, { ...commit, date: 'bad' }, { ...commit, title: 123 }]) : response(invalid ? { ...valid, sha: '<invalid>' } : valid));
  await e['check-updates'].click();
  const previous = e['check-result'].textContent;
  assert.equal(e['history-list'].children.length, 0);
  assert.match(e['history-status'].textContent, /未找到/);
  invalid = true;
  await e['check-updates'].click();
  assert.match(e['check-status'].textContent, /查询失败/);
  assert.equal(e['check-result'].textContent, previous);
  assert.equal(e['check-updates'].disabled, false);
});

test('each request has an independent timeout and history timeout is graceful', async () => {
  const callbacks = [];
  const e = setup((url, options) => url.includes('/commits/') ? new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(Error('aborted')))) : Promise.resolve(response(valid)), {
    setTimeout(fn, ms) { assert.equal(ms, 10000); callbacks.push(fn); return callbacks.length; },
    clearTimeout() {}
  });
  const pending = e['check-updates'].click();
  assert.equal(callbacks.length, 2);
  callbacks[1]();
  await pending;
  assert.match(e['history-status'].textContent, /失败或超时/);
  assert.match(e['check-status'].textContent, /查询成功/);
  assert.equal(e['check-updates'].disabled, false);
});
