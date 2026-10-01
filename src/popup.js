document.addEventListener('DOMContentLoaded', function () {

  const grid       = document.getElementById('imageGrid');
  const emptyState = document.getElementById('emptyState');
  const canvasBtn  = document.getElementById('openCanvasBtn');
  const notesLabel = document.getElementById('notesLabel');
  const notesList  = document.getElementById('notesList');

  // ── Load queue (images + texts) and render ────────────────────────
  function loadAll() {
    chrome.storage.local.get(['moodboardImages', 'moodboardTexts'], function (result) {
      renderGrid(result.moodboardImages || [], result.moodboardTexts || []);
    });
  }

  // ── Render the 2-column image grid + text notes ───────────────────
  function renderGrid(images, texts) {
    grid.innerHTML = '';
    notesList.innerHTML = '';

    if (images.length === 0 && texts.length === 0) {
      emptyState.classList.add('visible');
    } else {
      emptyState.classList.remove('visible');
    }

    images.forEach(function (url, index) {
      const card = document.createElement('div');
      card.className = 'img-card';

      const img = document.createElement('img');
      img.src = url;
      img.alt = 'Queue item ' + (index + 1);

      // Remove button (×)
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
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

    if (texts.length > 0) {
      notesLabel.style.display = 'block';
    } else {
      notesLabel.style.display = 'none';
    }

    texts.forEach(function (t) {
      const card = document.createElement('div');
      card.className = 'note-card';
      card.textContent = t.text || '';

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.innerHTML = '&times;';
      removeBtn.title = 'Remove';
      removeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        removeText(t.text);
      });

      card.appendChild(removeBtn);
      notesList.appendChild(card);
    });
  }

  // ── Remove a single image from storage ───────────────────────────
  function removeImage(urlToRemove) {
    chrome.storage.local.get(['moodboardImages'], function (result) {
      const images = (result.moodboardImages || []).filter(function (u) {
        return u !== urlToRemove;
      });
      chrome.storage.local.set({ moodboardImages: images }, function () {
        renderGrid(images);
      });
    });
  }

  // ── Remove a single text note from storage ─────────────────────────
  function removeText(textToRemove) {
    chrome.storage.local.get(['moodboardTexts'], function (result) {
      const texts = (result.moodboardTexts || []).filter(function (t) {
        return !t || t.text !== textToRemove;
      });
      chrome.storage.local.set({ moodboardTexts: texts }, function () {
        loadAll();
      });
    });
  }

  // ── Open Canvas button ────────────────────────────────────────────
  canvasBtn.addEventListener('click', function () {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup/canvas.html') });
  });

  // ── Listen for new items added while popup is open ───────────────
  chrome.storage.onChanged.addListener(function (changes) {
    if (changes.moodboardImages || changes.moodboardTexts) {
      loadAll();
    }
  });

  // ── Apply stored theme (set from the canvas page) ────────────────
  function applyStoredTheme() {
    let name = 'dark';
    try { name = localStorage.getItem('vibeyTheme') || 'dark'; } catch (e) {}
    if (name === 'light') document.body.classList.add('theme-light');
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        chrome.storage.local.get(['vibeyTheme'], function (result) {
          document.body.classList.toggle('theme-light', result && result.vibeyTheme === 'light');
          try { if (result && result.vibeyTheme) localStorage.setItem('vibeyTheme', result.vibeyTheme); } catch (e) {}
        });
      } catch (e) {}
    }
  }

  // ── Init ──────────────────────────────────────────────────────────
  applyStoredTheme();
  loadAll();
});