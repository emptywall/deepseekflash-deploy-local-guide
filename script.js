'use strict';

/* 社区部署参考页的表格筛选与排序。
   纯函数与 DOM 初始化分离，便于 node --test 直接测试。 */

function matchesTier(rowTier, filter) {
  return filter === 'all' || rowTier === filter;
}

function parseMetric(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : null;
}

function sortRows(rows, key) {
  const copy = rows.slice();
  if (key === 'single-desc' || key === 'batch-desc') {
    const field = key === 'single-desc' ? 'single' : 'batch';
    copy.sort((left, right) => {
      const a = left[field];
      const b = right[field];
      if (a === null && b === null) return left.order - right.order;
      if (a === null) return 1;
      if (b === null) return -1;
      if (b !== a) return b - a;
      return left.order - right.order;
    });
  }
  return copy;
}

function readRows(table) {
  return [...table.tBodies[0].rows].map((row, order) => ({
    row,
    order: Number(row.getAttribute('data-order') ?? order),
    tier: row.getAttribute('data-tier') || '',
    single: parseMetric(row.getAttribute('data-single')),
    batch: parseMetric(row.getAttribute('data-batch')),
  }));
}

function applyView(table, filter, sortKey) {
  const rows = readRows(table);
  let shown = 0;
  for (const entry of rows) {
    const visible = matchesTier(entry.tier, filter);
    entry.row.hidden = !visible;
    if (visible) shown += 1;
  }
  const ordered = sortRows(rows, sortKey);
  const body = table.tBodies[0];
  for (const entry of ordered) body.append(entry.row);
  return shown;
}

function init() {
  const table = document.getElementById('setups-table');
  if (!table) return;
  const chips = [...document.querySelectorAll('.filter-chips .chip')];
  const sortSelect = document.getElementById('sort-select');
  const status = document.getElementById('table-status');
  const total = table.tBodies[0].rows.length;
  [...table.tBodies[0].rows].forEach((row, order) => row.setAttribute('data-order', String(order)));
  let filter = 'all';
  let sortKey = 'default';

  const render = () => {
    const shown = applyView(table, filter, sortKey);
    if (status) status.textContent = `显示 ${shown} / ${total} 组方案${filter === 'all' ? '' : '（已按硬件档位筛选）'}`;
  };

  for (const chip of chips) {
    chip.addEventListener('click', () => {
      filter = chip.getAttribute('data-filter') || 'all';
      for (const other of chips) {
        const active = other === chip;
        other.classList.toggle('active', active);
        other.setAttribute('aria-pressed', String(active));
      }
      render();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      sortKey = sortSelect.value || 'default';
      render();
    });
  }

  const links = [...document.querySelectorAll('.nav-link')];
  for (const link of links) {
    link.addEventListener('click', () => {
      for (const other of links) other.classList.remove('active');
      link.classList.add('active');
    });
  }

  render();
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { matchesTier, parseMetric, sortRows };
}
