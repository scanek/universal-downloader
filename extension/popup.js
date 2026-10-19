// Universal Downloader Popup Script

const DEFAULT_SERVER = (typeof self !== 'undefined' && self.UDL_SERVER) || 'http://192.168.1.2:8765';

let currentTab = null;
let serverUrl = DEFAULT_SERVER;
let pollInterval = null;

const $ = id => document.getElementById(id);

async function init() {
  // 1. Загрузка настроек сервера
  try {
    const data = await chrome.storage.sync.get(['serverUrl', 'saveTarget']);
    if (data && data.serverUrl && data.serverUrl.trim()) {
      serverUrl = data.serverUrl.trim().replace(/\/+$/, '');
    }
    if (data && data.saveTarget) {
      const radio = document.querySelector(`input[name="popup-target"][value="${data.saveTarget}"]`);
      if (radio) radio.checked = true;
    }
  } catch (e) {
    console.warn('Storage error', e);
  }
  $('server-url').value = serverUrl;

  // 2. Получение текущей вкладки
  try {
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (tabs && tabs[0]) {
      currentTab = tabs[0];
      $('page-title').textContent = currentTab.title || 'Текущая страница';
      $('page-url').textContent = currentTab.url || '';

      const isWeb = /^https?:\/\//i.test(currentTab.url || '');
      $('btn-download-video').disabled = !isWeb;
      $('btn-download-audio').disabled = !isWeb;
      if (!isWeb) {
        $('page-title').textContent = 'Эта страница не поддерживается';
        $('page-url').textContent = 'Откройте YouTube, Rutube, VK или другой сайт с медиа';
      }
    }
  } catch (e) {
    console.error('Tabs error', e);
  }

  // 3. Проверка подключения к серверу
  await checkServer();

  // 4. Периодический опрос задач
  pollInterval = setInterval(updateTasks, 2500);

  // 5. Навешивание обработчиков событий
  setupEvents();
}

function setupEvents() {
  $('btn-settings-toggle').addEventListener('click', () => {
    $('settings-panel').classList.toggle('hidden');
  });

  $('btn-save-server').addEventListener('click', async () => {
    const val = $('server-url').value.trim().replace(/\/+$/, '');
    if (!val) return;
    serverUrl = val;
    await chrome.storage.sync.set({serverUrl: val});
    $('settings-panel').classList.add('hidden');
    showFeedback('Адрес сохранён. Проверка связи...', 'success');
    await checkServer();
  });

  document.querySelectorAll('input[name="popup-target"]').forEach(radio => {
    radio.addEventListener('change', async e => {
      await chrome.storage.sync.set({saveTarget: e.target.value});
    });
  });

  $('btn-download-video').addEventListener('click', () => startDownload('vbest'));
  $('btn-download-audio').addEventListener('click', () => startDownload('a_mp3'));

  $('btn-open-web').addEventListener('click', () => {
    chrome.tabs.create({url: serverUrl});
  });

  $('btn-open-files').addEventListener('click', () => {
    chrome.tabs.create({url: `${serverUrl}/#files`});
  });
}

async function checkServer() {
  const dot = $('status-dot');
  const txt = $('status-text');
  const proxyBadge = $('proxy-badge');

  dot.className = 'status-dot checking';
  txt.textContent = 'Подключение...';

  try {
    const res = await fetch(`${serverUrl}/api/status`, {signal: AbortSignal.timeout(3500)});
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    dot.className = 'status-dot online';
    txt.textContent = `NAS онлайн (${serverUrl.replace(/^https?:\/\//, '')})`;

    // Проверяем прокси
    try {
      const pRes = await fetch(`${serverUrl}/api/proxy/status`, {signal: AbortSignal.timeout(2000)});
      const pData = await pRes.json();
      if (pData && pData.enabled && pData.ip) {
        proxyBadge.textContent = `🛡 VPN: ${pData.ip}`;
        proxyBadge.classList.remove('hidden');
      } else {
        proxyBadge.classList.add('hidden');
      }
    } catch (e) {
      proxyBadge.classList.add('hidden');
    }

    await updateTasks();
  } catch (err) {
    dot.className = 'status-dot offline';
    txt.textContent = `Нет связи: ${serverUrl.replace(/^https?:\/\//, '')}`;
    proxyBadge.classList.add('hidden');
  }
}

async function startDownload(option) {
  if (!currentTab || !currentTab.url) return;

  const targetRadio = document.querySelector('input[name="popup-target"]:checked');
  const target = targetRadio ? targetRadio.value : 'device';

  $('btn-download-video').disabled = true;
  $('btn-download-audio').disabled = true;
  showFeedback('Отправка задачи на сервер...', 'info');

  try {
    const resp = await fetch(`${serverUrl}/api/download`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        url: currentTab.url,
        title: currentTab.title || currentTab.url,
        option: option,
        target: target
      })
    });
    const res = await resp.json();
    if (resp.ok && res.id) {
      showFeedback('✅ Загрузка начата!', 'success');
      await updateTasks();
    } else {
      showFeedback('❌ Ошибка: ' + (res.error || 'Не удалось запустить'), 'error');
    }
  } catch (err) {
    showFeedback('❌ Не удалось связаться с сервером: ' + err.message, 'error');
  } finally {
    $('btn-download-video').disabled = false;
    $('btn-download-audio').disabled = false;
  }
}

async function updateTasks() {
  try {
    const resp = await fetch(`${serverUrl}/api/tasks`, {signal: AbortSignal.timeout(2500)});
    if (!resp.ok) return;
    const tasks = await resp.json();
    if (!Array.isArray(tasks)) return;

    const activeTasks = tasks.filter(t => t.status === 'running' || t.status === 'queued');
    $('tasks-count').textContent = activeTasks.length;

    const list = $('tasks-list');
    if (activeTasks.length === 0) {
      list.innerHTML = '<div class="empty-tasks">Нет активных загрузок</div>';
      return;
    }

    list.innerHTML = activeTasks.map(t => {
      const percent = t.percent || 0;
      const speed = t.speed ? ` · ${t.speed}` : '';
      return `
        <div class="task-item">
          <div class="task-item-head">
            <span class="task-item-title" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</span>
            <span class="task-item-percent">${percent}%</span>
          </div>
          <div class="task-item-bar">
            <div class="task-item-fill" style="width: ${percent}%;"></div>
          </div>
          <div style="font-size: 10.5px; color: var(--muted);">${escapeHtml(t.stage || '')}${escapeHtml(speed)}</div>
        </div>
      `;
    }).join('');
  } catch (e) {
    // ignore polling error
  }
}

function showFeedback(text, type) {
  const fb = $('action-feedback');
  fb.className = `feedback ${type}`;
  fb.textContent = text;
  fb.classList.remove('hidden');
  setTimeout(() => { fb.classList.add('hidden'); }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

document.addEventListener('DOMContentLoaded', init);
