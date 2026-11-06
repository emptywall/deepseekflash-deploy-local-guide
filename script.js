const links = [...document.querySelectorAll('.nav-link')];
links.forEach(link => link.addEventListener('click', () => {
  links.forEach(item => item.classList.remove('active'));
  link.classList.add('active');
}));

// Both requests are opt-in and report repository information, not deployment news.
const checkButton = document.getElementById('check-updates');
const checkStatus = document.getElementById('check-status');
const checkResult = document.getElementById('check-result');
const historyStatus = document.getElementById('history-status');
const historyList = document.getElementById('history-list');
const modelId = 'deepseek-ai/DeepSeek-V4.1-Flash-1017';
const api = `https://huggingface.co/api/models/${modelId}`;
const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) && Number.isFinite(Date.parse(value));
const formatDate = value => new Date(value).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit', cache: 'no-store' });
    if (!response.ok) throw new Error('Request failed');
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function checkMetadata() {
  try {
    const data = await getJson(api);
    if (data.id !== modelId || !/^[a-f0-9]{40}$/.test(data.sha) || !isDate(data.lastModified)) throw new Error('Invalid metadata');
    const checked = formatDate(new Date().toISOString());
    checkResult.textContent = `仓库最后修改：${formatDate(data.lastModified)}；版本：${data.sha}。检查时间：${checked}。仓库修改不代表模型、价格或本页内容发生变化，请打开官方模型卡核实。`;
    checkResult.hidden = false;
    checkStatus.textContent = '仓库元数据查询成功；静态快照未改变。';
  } catch {
    checkStatus.textContent = '元数据查询失败或超时（可能是网络、跨域限制或服务限流）；静态快照保持不变。可稍后重试或直接查看官方模型卡。';
  }
}

async function checkHistory() {
  try {
    const data = await getJson(`${api}/commits/main?limit=5`);
    if (!Array.isArray(data)) throw new Error('Invalid history');
    const commits = data.slice(0, 5).filter(commit => commit && typeof commit.id === 'string' && /^[a-f0-9]{40}$/.test(commit.id) && typeof commit.title === 'string' && commit.title.trim() && isDate(commit.date));
    historyList.replaceChildren();
    for (const commit of commits) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = `https://huggingface.co/${modelId}/commit/${commit.id}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = commit.title.slice(0, 300);
      const date = document.createElement('time');
      date.dateTime = commit.date;
      date.textContent = formatDate(commit.date);
      item.append(link, date);
      historyList.append(item);
    }
    historyStatus.textContent = commits.length ? '最近仓库提交（最多 5 条）：' : '未找到可显示的仓库提交。';
  } catch {
    historyList.replaceChildren();
    historyStatus.textContent = '仓库历史查询失败或超时，可稍后重试；不影响元数据查询。';
  }
}

checkButton.addEventListener('click', async () => {
  checkButton.disabled = true;
  checkStatus.textContent = '正在查询官方模型仓库元数据…';
  historyStatus.textContent = '正在查询仓库历史…';
  historyList.replaceChildren();
  try {
    await Promise.all([checkMetadata(), checkHistory()]);
  } finally {
    checkButton.disabled = false;
  }
});
