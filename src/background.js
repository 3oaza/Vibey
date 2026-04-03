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

    // 2. Context for the Page (General access)
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
            iconUrl: 'logo-icon128.png',
            title: 'Vibey',
            message: 'Image added to queue!',
          });
        });
      }
    });
  } else if (info.menuItemId === 'openMoodboard') {
    // Open the canvas page directly
    chrome.tabs.create({ url: chrome.runtime.getURL('popup/canvas.html') });
  }
});
