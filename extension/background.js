// Universal Downloader Background Service Worker (Manifest V3)
if (typeof importScripts === 'function') {
  try { importScripts('config.js'); } catch (e) { console.warn('config.js load error', e); }
}

const DEFAULT_SERVER = self.UDL_SERVER || 'http://192.168.1.2:8765';

async function getServerUrl() {
  try {
    const data = await chrome.storage.sync.get(['serverUrl']);
    if (data && data.serverUrl && data.serverUrl.trim()) {
      return data.serverUrl.trim().replace(/\/+$/, '');
    }
  } catch (e) {
    // fallback
  }
  return DEFAULT_SERVER.replace(/\/+$/, '');
}

async function getSaveTarget() {
  try {
    const data = await chrome.storage.sync.get(['saveTarget']);
    if (data && data.saveTarget) return data.saveTarget;
  } catch (e) {}
  return 'device';
}

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus();
});

function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'udl-quick-video',
      title: '⚡ Скачать лучшее видео (NAS)',
      contexts: ['page', 'frame', 'video', 'link']
    });
    chrome.contextMenus.create({
      id: 'udl-quick-mp3',
      title: '🎵 Скачать в MP3 (NAS)',
      contexts: ['page', 'frame', 'audio', 'video', 'link']
    });
    chrome.contextMenus.create({
      id: 'udl-open',
      title: '🌐 Открыть ссылку в Universal Downloader',
      contexts: ['page', 'frame', 'video', 'audio', 'link']
    });
  });
}

function notify(title, message) {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: title || 'Universal Downloader',
      message: message || '',
      priority: 1
    });
  } catch (e) {
    console.error('Notification error', e);
  }
}

async function quickDownload(url, option) {
  if (!url || !/^https?:\/\//i.test(url)) {
    notify('Ошибка', 'Не удалось определить ссылку на видео или страницу.');
    return;
  }
  const server = await getServerUrl();
  const target = await getSaveTarget();

  try {
    const resp = await fetch(`${server}/api/download`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        url: url,
        option: option,
        target: target
      })
    });
    const res = await resp.json();
    if (resp.ok && res.id) {
      notify('Загрузка начата!', `Задача создана на ${server}. Файл загружается...`);
      updateBadge();
    } else {
      notify('Ошибка запуска загрузки', res.error || 'Сервер отклонил запрос.');
    }
  } catch (err) {
    notify('Связь с сервером не удалась', `Не удалось подключиться к ${server}: ${err.message}`);
  }
}

async function openInDownloader(link) {
  const server = await getServerUrl();
  const q = link ? encodeURIComponent(link) : '';
  const targetUrl = link ? `${server}/?url=${q}` : server;

  // Ищем уже открытую вкладку
  try {
    const u = new URL(server);
    const tabs = await chrome.tabs.query({url: `${u.origin}/*`});
    if (tabs && tabs.length > 0) {
      const tab = tabs[0];
      await chrome.tabs.update(tab.id, {
        url: link ? `${server}/#url=${q}` : server,
        active: true
      });
      if (tab.windowId) await chrome.windows.update(tab.windowId, {focused: true});
      return;
    }
  } catch (e) {}

  chrome.tabs.create({url: targetUrl});
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const link = info.linkUrl || info.srcUrl || info.frameUrl || info.pageUrl || (tab && tab.url);
  if (info.menuItemId === 'udl-quick-video') {
    await quickDownload(link, 'vbest');
  } else if (info.menuItemId === 'udl-quick-mp3') {
    await quickDownload(link, 'a_mp3');
  } else if (info.menuItemId === 'udl-open') {
    await openInDownloader(link);
  }
});

async function updateBadge() {
  try {
    const server = await getServerUrl();
    const resp = await fetch(`${server}/api/tasks`, {signal: AbortSignal.timeout(3000)});
    if (!resp.ok) return;
    const tasks = await resp.json();
    if (Array.isArray(tasks)) {
      const active = tasks.filter(t => t.status === 'running' || t.status === 'queued').length;
      chrome.action.setBadgeText({text: active > 0 ? String(active) : ''});
      chrome.action.setBadgeBackgroundColor({color: '#2563eb'});
    }
  } catch (e) {
    // offline or unreachable
  }
}

// Периодическое обновление бейджа
setInterval(updateBadge, 15000);
