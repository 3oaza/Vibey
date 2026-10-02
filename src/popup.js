document.addEventListener('DOMContentLoaded', function () {

  const grid       = document.getElementById('imageGrid');
  const emptyState = document.getElementById('emptyState');
  const canvasBtn  = document.getElementById('openCanvasBtn');
  const notesLabel = document.getElementById('notesLabel');
  const notesList  = document.getElementById('notesList');

  const MAX_QUEUE_RENDER = 200;

  function asArray(v) { return Array.isArray(v) ? v : []; }
  function isSafeUrl(url) {
    if (typeof url !== 'string' || !url) return false;
    const u = url.trim().toLowerCase();
    if (u.startsWith('javascript:') || u.startsWith('data:text/html') || u.startsWith('vbscript:')) return false;
    return u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:image/') || u.startsWith('blob:');
  }

  // ── Load queue (images + texts) and render ────────────────────────
  function loadAll() {
    if (!chrome.storage || !chrome.storage.local) return;
    try {
      chrome.storage.local.get(['moodboardImages', 'moodboardTexts'], function (result) {
        if (chrome.runtime && chrome.runtime.lastError) return;
        renderGrid(asArray(result && result.moodboardImages), asArray(result && result.moodboardTexts));
      });
    } catch (e) { /* storage unavailable */ }
  }

  // ── Render the 2-column image grid + text notes ───────────────────
  function renderGrid(images, texts) {
    images = asArray(images);
    texts = asArray(texts);
    grid.innerHTML = '';
    notesList.innerHTML = '';

    if (images.length === 0 && texts.length === 0) {
      emptyState.classList.add('visible');
    } else {
      emptyState.classList.remove('visible');
    }

    const shown = images.slice(0, MAX_QUEUE_RENDER);
    shown.forEach(function (url, index) {
      const card = document.createElement('div');
      card.className = 'img-card';

      const img = document.createElement('img');
      if (isSafeUrl(url)) {
        img.src = url;
      } else {
        img.alt = 'Blocked unsafe URL';
      }
      img.alt = 'Queue item ' + (index + 1);
      img.loading = 'lazy';
      img.onerror = function () {
        img.alt = 'Image unavailable (expired or blocked)';
        img.style.opacity = '0.35';
      };

      // Remove button (×)
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.type = 'button';
      removeBtn.setAttribute('aria-label', 'Remove image ' + (index + 1));
      removeBtn.innerHTML = '&times;';
      removeBtn.title = 'Remove';
      removeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        removeImage(url);
      });

      card.appendChild(img);
      card.appendChild(removeBtn);
      grid.appendChild(card);
    });
    if (images.length > MAX_QUEUE_RENDER) {
      const more = document.createElement('div');
      more.className = 'note-card';
      more.textContent = '+' + (images.length - MAX_QUEUE_RENDER) + ' more — open Canvas to manage full queue';
      notesList.appendChild(more);
    }

    if (texts.length > 0) {
      notesLabel.style.display = 'block';
    } else {
      notesLabel.style.display = 'none';
    }

    texts.forEach(function (t) {
      const card = document.createElement('div');
      card.className = 'note-card';
      card.textContent = (t && t.text) || '';

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.type = 'button';
      removeBtn.setAttribute('aria-label', 'Remove note');
      removeBtn.innerHTML = '&times;';
      removeBtn.title = 'Remove';
      removeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        removeText(t && t.text);
      });

      card.appendChild(removeBtn);
      notesList.appendChild(card);
    });
  }

  // ── Remove a single image from storage ───────────────────────────
  function removeImage(urlToRemove) {
    try {
      chrome.storage.local.get(['moodboardImages'], function (result) {
        if (chrome.runtime && chrome.runtime.lastError) return;
        const images = asArray(result && result.moodboardImages).filter(function (u) {
          return u !== urlToRemove;
        });
        chrome.storage.local.set({ moodboardImages: images }, function () {
          loadAll();
        });
      });
    } catch (e) { /* ignore */ }
  }

  // ── Remove a single text note from storage ─────────────────────────
  function removeText(textToRemove) {
    try {
      chrome.storage.local.get(['moodboardTexts'], function (result) {
        if (chrome.runtime && chrome.runtime.lastError) return;
        const texts = asArray(result && result.moodboardTexts).filter(function (t) {
          return !t || t.text !== textToRemove;
        });
        chrome.storage.local.set({ moodboardTexts: texts }, function () {
          loadAll();
        });
      });
    } catch (e) { /* ignore */ }
  }

  // ── Open Canvas button ────────────────────────────────────────────
  if (canvasBtn) {
    canvasBtn.addEventListener('click', function () {
      chrome.tabs.create({ url: chrome.runtime.getURL('popup/canvas.html') });
    });
  }

  // ── Listen for new items added while popup is open (throttled) ───
  let reloadTimer = null;
  function scheduleReload() {
    if (reloadTimer) return;
    reloadTimer = setTimeout(function () { reloadTimer = null; loadAll(); }, 150);
  }
  try {
    chrome.storage.onChanged.addListener(function (changes) {
      if (changes.moodboardImages || changes.moodboardTexts) {
        scheduleReload();
      }
      if (changes.vibeyTheme) {
        applyStoredTheme();
      }
    });
  } catch (e) { /* ignore */ }

  // ── Apply stored theme (set from the canvas page) ────────────────
  function applyStoredTheme() {
    let local = null;
    try { local = localStorage.getItem('vibeyTheme'); } catch (e) {}
    if (local === 'light' || local === 'glass') document.body.classList.add('theme-light');
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        chrome.storage.local.get(['vibeyTheme'], function (result) {
          if (chrome.runtime && chrome.runtime.lastError) return;
          const stored = result && result.vibeyTheme;
          if (stored === 'light' || stored === 'glass') {
            document.body.classList.add('theme-light');
            try { localStorage.setItem('vibeyTheme', stored); } catch (e) {}
          } else if (stored === 'dark') {
            document.body.classList.remove('theme-light');
            try { localStorage.setItem('vibeyTheme', 'dark'); } catch (e) {}
          }
          // else: no stored value -> keep localStorage choice, don't wipe
        });
      } catch (e) {}
    }
  }

  // ── Init ──────────────────────────────────────────────────────────
  applyStoredTheme();
  loadAll();
});
