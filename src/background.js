// ── Vibey background: context menus + queue ────────────────────────────
const MAX_QUEUE_ITEMS = 500;
const MAX_TEXT_LEN = 2000;

function normalizeUrl(u) {
  if (typeof u !== 'string') return '';
  try {
    const url = new URL(u, 'http://x');
    url.hash = '';
    // drop trailing slash for root only
    return url.toString();
  } catch (e) { return u.trim(); }
}
function normalizeText(t) {
  if (typeof t !== 'string') return '';
  return t.replace(/\s+/g, ' ').trim().toLowerCase();
}
function safeNotify(opts) {
  try {
    chrome.notifications.create('', {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('assets/icons/logo-icon128.png'),
      title: opts.title || 'Vibey',
      message: String(opts.message || '').slice(0, 200),
    }, function () {
      if (chrome.runtime && chrome.runtime.lastError) { /* notifications blocked — ignore */ }
    });
  } catch (e) { /* ignore */ }
}
function checkedSet(items, okMsg, dupMsg) {
  try {
    chrome.storage.local.set(items, function () {
      if (chrome.runtime && chrome.runtime.lastError) {
        safeNotify({ message: 'Queue is full — remove old items first.' });
      } else if (okMsg) {
        safeNotify({ message: okMsg });
      }
    });
  } catch (e) {
    safeNotify({ message: 'Could not save to queue.' });
  }
}

function ensureMenus() {
  try {
    chrome.contextMenus.removeAll(function () {
      if (chrome.runtime && chrome.runtime.lastError) { /* ignore */ }
      // 1. Context for Images (Main Feature)
      try {
        chrome.contextMenus.create({ id: 'addToMoodboard', title: 'Add Image to Vibey', contexts: ['image'] });
        // 2. Context for selected text
        chrome.contextMenus.create({ id: 'addTextToMoodboard', title: 'Add Selection to Vibey', contexts: ['selection'] });
        // 3. Context for the Page (General access)
        chrome.contextMenus.create({ id: 'openMoodboard', title: 'Open Vibey Canvas', contexts: ['page'] });
      } catch (e) { /* menu exists */ }
    });
  } catch (e) { /* ignore */ }
}

// ── Create context menu on install AND on startup (worker may wake without install) ──
chrome.runtime.onInstalled.addListener(ensureMenus);
chrome.runtime.onStartup.addListener(ensureMenus);
// MV3 service workers can lose menus — re-ensure lazily on click too
try {
  if (chrome.contextMenus && chrome.contextMenus.onClicked) { /* exists */ }
} catch (e) {}

// ── Handle context menu click ─────────────────────────────────────────
chrome.contextMenus.onClicked.addListener(function (info) {
  if (info.menuItemId === 'addToMoodboard' && info.srcUrl) {
    const raw = info.srcUrl;
    if (/^blob:/i.test(raw)) {
      safeNotify({ message: 'This image lives only in that tab — open it fully first.' });
      return;
    }
    const imageUrl = raw;
    const norm = normalizeUrl(raw).toLowerCase();
    try {
      chrome.storage.local.get(['moodboardImages'], function (result) {
        if (chrome.runtime && chrome.runtime.lastError) {
          safeNotify({ message: 'Could not read queue.' });
          return;
        }
        let images = Array.isArray(result.moodboardImages) ? result.moodboardImages : [];
        const exists = images.some(function (u) { return normalizeUrl(u).toLowerCase() === norm; });
        if (!exists) {
          images.unshift(imageUrl);
          if (images.length > MAX_QUEUE_ITEMS) images = images.slice(0, MAX_QUEUE_ITEMS);
          checkedSet({ moodboardImages: images }, 'Image added to queue!');
        } else {
          safeNotify({ message: 'Already in queue.' });
        }
      });
    } catch (e) { safeNotify({ message: 'Could not save.' }); }
  } else if (info.menuItemId === 'addTextToMoodboard' && info.selectionText) {
    const text = info.selectionText.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LEN);
    if (!text) return;
    const normT = normalizeText(text);
    try {
      chrome.storage.local.get(['moodboardTexts'], function (result) {
        if (chrome.runtime && chrome.runtime.lastError) {
          safeNotify({ message: 'Could not read queue.' });
          return;
        }
        let texts = Array.isArray(result.moodboardTexts) ? result.moodboardTexts : [];
        // dedup on normalized text + page url (same quote on different pages is allowed)
        const exists = texts.some(function (t) {
          return t && normalizeText(t.text) === normT && (t.url || '') === (info.pageUrl || '');
        });
        if (!exists) {
          texts.unshift({ text: text, url: info.pageUrl || '', ts: Date.now() });
          if (texts.length > MAX_QUEUE_ITEMS) texts = texts.slice(0, MAX_QUEUE_ITEMS);
          checkedSet({ moodboardTexts: texts }, 'Text added to queue!');
        } else {
          safeNotify({ message: 'Already in queue.' });
        }
      });
    } catch (e) { safeNotify({ message: 'Could not save.' }); }
  } else if (info.menuItemId === 'openMoodboard') {
    // Open the canvas page directly
    try {
      chrome.tabs.create({ url: chrome.runtime.getURL('popup/canvas.html') });
    } catch (e) { /* ignore */ }
  }
});
