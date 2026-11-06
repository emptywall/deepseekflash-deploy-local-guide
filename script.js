const links = [...document.querySelectorAll('.nav-link')];
links.forEach(link => link.addEventListener('click', () => {
  links.forEach(item => item.classList.remove('active'));
  link.classList.add('active');
}));

// This opt-in check reports repository metadata only; it never rewrites the snapshot.
const checkButton = document.getElementById('check-updates');
const checkStatus = document.getElementById('check-status');
const checkResult = document.getElementById('check-result');
const modelId = 'deepseek-ai/DeepSeek-V4.1-Flash-1017';

checkButton.addEventListener('click', async () => {
  checkButton.disabled = true;
  checkStatus.textContent = '正在查询官方模型仓库元数据…';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`https://huggingface.co/api/models/${modelId}`, {
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('Request failed');
    const data = await response.json();
    if (data.id !== modelId || !/^[a-f0-9]{40}$/.test(data.sha) ||
        typeof data.lastModified !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(data.lastModified) ||
        !Number.isFinite(Date.parse(data.lastModified))) throw new Error('Invalid metadata');
    const modified = new Date(data.lastModified).toISOString().replace('T', ' ').replace('.000Z', ' UTC');
    const checked = new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
    checkResult.textContent = `仓库最后修改：${modified}；版本：${data.sha}。检查时间：${checked}。仓库修改不代表模型、价格或本页内容发生变化，请打开官方模型卡核实。`;
    checkResult.hidden = false;
    checkStatus.textContent = '仓库元数据查询成功；静态快照未改变。';
  } catch {
    checkStatus.textContent = '查询失败或超时（可能是网络、跨域限制或服务限流）；静态快照保持不变。可稍后重试或直接查看官方模型卡。';
  } finally {
    clearTimeout(timer);
    checkButton.disabled = false;
  }
});
