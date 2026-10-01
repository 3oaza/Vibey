// ── Create context menu on install ───────────────────────────────────
chrome.runtime.onInstalled.addListener(function () {
  // Clear existing menus first to avoid duplicates during development
  chrome.contextMenus.removeAll(function () {
    // 1. Context for Images (Main Feature)
    chrome.contextMenus.create({
      id: 'addToMoodboard',
      title: 'Add Image to Vibey',
      contexts: ['image'],
    });

    // 2. Context for selected text
    chrome.contextMenus.create({
      id: 'addTextToMoodboard',
      title: 'Add Selection to Vibey',
      contexts: ['selection'],
    });

    // 3. Context for the Page (General access)
    chrome.contextMenus.create({
      id: 'openMoodboard',
      title: 'Open Vibey Canvas',
      contexts: ['page'],
    });
  });
});

// ── Handle context menu click ─────────────────────────────────────────
chrome.contextMenus.onClicked.addListener(function (info) {
  if (info.menuItemId === 'addToMoodboard' && info.srcUrl) {
    const imageUrl = info.srcUrl;

    chrome.storage.local.get(['moodboardImages'], function (result) {
      const images = result.moodboardImages || [];

      // Avoid duplicates
      if (!images.includes(imageUrl)) {
        images.unshift(imageUrl); // add to front of queue
        chrome.storage.local.set({ moodboardImages: images }, function () {
          // Show a brief notification
          chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('assets/icons/logo-icon128.png'),
            title: 'Vibey',
            message: 'Image added to queue!',
          });
        });
      } else {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('assets/icons/logo-icon128.png'),
          title: 'Vibey',
          message: 'Already in queue.',
        });
      }
    });
  } else if (info.menuItemId === 'addTextToMoodboard' && info.selectionText) {
    const text = info.selectionText.trim().slice(0, 2000);
    if (!text) return;
    chrome.storage.local.get(['moodboardTexts'], function (result) {
      const texts = result.moodboardTexts || [];
      if (!texts.some(function (t) { return t && t.text === text; })) {
        texts.unshift({ text: text, url: info.pageUrl || '', ts: Date.now() });
        chrome.storage.local.set({ moodboardTexts: texts }, function () {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('assets/icons/logo-icon128.png'),
            title: 'Vibey',
            message: 'Text added to queue!',
          });
        });
      } else {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('assets/icons/logo-icon128.png'),
          title: 'Vibey',
          message: 'Already in queue.',
        });
      }
    });
  } else if (info.menuItemId === 'openMoodboard') {
    // Open the canvas page directly
    chrome.tabs.create({ url: chrome.runtime.getURL('popup/canvas.html') });
  }
});
