document.addEventListener('DOMContentLoaded', function () {

  const grid       = document.getElementById('imageGrid');
  const emptyState = document.getElementById('emptyState');
  const canvasBtn  = document.getElementById('openCanvasBtn');

  // ── Load images from storage and render ──────────────────────────
  function loadImages() {
    chrome.storage.local.get(['moodboardImages'], function (result) {
      const images = result.moodboardImages || [];
      renderGrid(images);
    });
  }

  // ── Render the 2-column image grid ───────────────────────────────
  function renderGrid(images) {
    grid.innerHTML = '';

    if (images.length === 0) {
      emptyState.classList.add('visible');
      return;
    }

    emptyState.classList.remove('visible');

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

  // ── Open Canvas button ────────────────────────────────────────────
  canvasBtn.addEventListener('click', function () {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup/canvas.html') });
  });

  // ── Listen for new images added while popup is open ───────────────
  chrome.storage.onChanged.addListener(function (changes) {
    if (changes.moodboardImages) {
      renderGrid(changes.moodboardImages.newValue || []);
    }
  });

  // ── Init ──────────────────────────────────────────────────────────
  loadImages();
});