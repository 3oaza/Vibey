// Vibey web collector — floating "+" on hovered images and selected text.
// Runs as a content script on http/https pages. UI is Shadow-DOM isolated.
(function () {
  'use strict';
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
  // Guard against double-injection in SPA navigations
  if (document.getElementById('vibey-collect-root')) return;

  const MIN_SIZE = 60;
  const MIN_TEXT = 1;
  const MAX_TEXT = 2000;
  const MAX_QUEUE_ITEMS = 500;

  const host = document.createElement('div');
  host.id = 'vibey-collect-root';
  // Harden host against page CSS: isolate from page styles
  try {
    host.style.cssText = 'all:initial !important;position:fixed !important;top:0 !important;left:0 !important;width:0 !important;height:0 !important;z-index:2147483647 !important;pointer-events:none !important;';
  } catch (e) {}
  let shadow;
  try {
    shadow = host.attachShadow({ mode: 'closed' });
  } catch (e) { return; }

  const style = document.createElement('style');
  style.textContent =
    '.vibey-chip{display:none;position:fixed;z-index:2147483647;width:30px;height:30px;' +
    'align-items:center;justify-content:center;border-radius:50%;border:1px solid rgba(139,137,255,.6);' +
    'background:rgba(20,20,28,.92);color:#c4c3ff;font-size:18px;font-weight:800;line-height:1;' +
    'cursor:pointer;font-family:system-ui,sans-serif;padding:0;margin:0;box-shadow:0 4px 16px rgba(0,0,0,.5);pointer-events:auto;}' +
    '.vibey-chip:hover{background:#8b89ff;color:#08080a;}' +
    '.vibey-toast{position:fixed;z-index:2147483647;bottom:24px;left:50%;transform:translateX(-50%);' +
    'background:rgba(20,20,28,.94);border:1px solid rgba(139,137,255,.4);color:#c4c3ff;' +
    'font-size:12px;font-weight:600;font-family:system-ui,sans-serif;padding:8px 18px;border-radius:99px;' +
    'opacity:0;transition:opacity .25s;pointer-events:none;white-space:nowrap;}';
  shadow.appendChild(style);

  const chip = document.createElement('button');
  chip.className = 'vibey-chip';
  chip.type = 'button';
  chip.textContent = '+';
  chip.setAttribute('aria-label', 'Add to Vibey');
  shadow.appendChild(chip);

  const toast = document.createElement('div');
  toast.className = 'vibey-toast';
  shadow.appendChild(toast);

  document.documentElement.appendChild(host);

  // Re-inject if page removes our host
  try {
    const obs = new MutationObserver(function () {
      if (!document.contains(host) && document.documentElement) {
        try { document.documentElement.appendChild(host); } catch (e) {}
      }
    });
    obs.observe(document.documentElement, { childList: true });
  } catch (e) {}

  let mode = null; // 'image' | 'text'
  let imgUrl = null;
  let selText = null;
  let toastTimer = null;
  let flashTimer = null;
  let flashSession = 0;

  function hide() {
    chip.style.display = 'none';
    mode = null; imgUrl = null; selText = null;
  }
  function place(x, y) {
    // Clamp both axes inside viewport
    const cx = Math.max(4, Math.min(x, window.innerWidth - 38));
    const cy = Math.max(4, Math.min(y, window.innerHeight - 38));
    chip.style.left = cx + 'px';
    chip.style.top = cy + 'px';
    chip.style.display = 'flex';
  }
  function showToast(msg) {
    toast.textContent = msg;
    toast.style.opacity = '1';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2200);
  }

  function normUrl(u) {
    if (typeof u !== 'string') return '';
    try { const url = new URL(u, location.href); url.hash = ''; return url.toString().toLowerCase(); }
    catch (e) { return u.trim().toLowerCase(); }
  }
  function normText(t) {
    return String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function pushUnique(key, value, isText, done) {
    try {
      chrome.storage.local.get([key], (r) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          showToast('Vibey: queue is full');
          if (done) done(false);
          return;
        }
        let arr = (r && r[key]) || [];
        if (!Array.isArray(arr)) arr = [];
        let exists;
        if (isText) {
          const nt = normText(value.text);
          exists = arr.some((t) => t && normText(t.text) === nt && (t.url || '') === (value.url || ''));
        } else {
          const nu = normUrl(value);
          exists = arr.some((u) => normUrl(u) === nu);
        }
        if (exists) { showToast('Already in Vibey queue'); if (done) done(false); return; }
        arr.unshift(value);
        if (arr.length > MAX_QUEUE_ITEMS) arr = arr.slice(0, MAX_QUEUE_ITEMS);
        try {
          chrome.storage.local.set({ [key]: arr }, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
              showToast('Vibey: queue is full — remove old items');
              if (done) done(false);
            } else {
              showToast(isText ? 'Text sent to Vibey' : 'Image sent to Vibey');
              if (done) done(true);
            }
          });
        } catch (e) { showToast('Vibey: could not save'); if (done) done(false); }
      });
    } catch (e) { showToast('Vibey: could not save'); if (done) done(false); }
  }

  function flash(ok) {
    const my = ++flashSession;
    chip.textContent = ok ? '✓' : '!';
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { if (my === flashSession) hide(); }, 700);
  }

  chip.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (mode === 'image' && imgUrl) {
      if (/^blob:/i.test(imgUrl)) { showToast('Open image fully first (preview only)'); flash(false); return; }
      pushUnique('moodboardImages', imgUrl, false, flash);
    } else if (mode === 'text' && selText) {
      pushUnique('moodboardTexts', { text: selText, url: location.href, ts: Date.now() }, true, (ok) => {
        if (ok) { try { window.getSelection().removeAllRanges(); } catch (err) {} }
        flash(ok);
        if (ok) hide();
      });
    }
  });

  // Throttled mouseover: avoid getBoundingClientRect on every pixel
  let hoverRaf = null;
  let lastHover = null;
  function handleHover(e) {
    const t = e.target;
    const img = (t && t.closest) ? t.closest('img') : null;
    if (!img) return;
    let r;
    try { r = img.getBoundingClientRect(); } catch (err) { return; }
    if (!r || r.width < MIN_SIZE || r.height < MIN_SIZE) return;
    // skip lazy placeholders: prefer data-src resolved src, skip tiny/placeholder
    const src = img.currentSrc || img.src;
    if (!src || /^data:image\/gif;base64,R0lGODlhAQAB/i.test(src)) return;
    if (/^blob:/i.test(src)) {
      // still show chip but click will explain; store original src for dedup
    }
    mode = 'image'; imgUrl = src; selText = null;
    chip.textContent = '+';
    place(r.right - 36, r.top + 6);
  }
  document.addEventListener('mouseover', (e) => {
    lastHover = e;
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = null;
      if (lastHover) { try { handleHover(lastHover); } catch (err) {} }
    });
  }, true);

  document.addEventListener('mouseout', (e) => {
    if (mode !== 'image') return;
    // Shadow retargeting: relatedTarget may be host/null — only hide when truly leaving
    try {
      const rt = e.relatedTarget;
      if (!rt) { hide(); return; }
      // moving onto chip (inside shadow) reports host as target in some browsers
      if (rt === host) return;
      if (rt && rt.nodeType === 1 && (rt.closest && rt.closest('#vibey-collect-root'))) return;
    } catch (err) {}
    // small grace: don't flicker when moving toward chip
    setTimeout(() => {
      try {
        if (chip.matches && chip.matches(':hover')) return;
      } catch (err) {}
      if (mode === 'image') hide();
    }, 120);
  }, true);

  let selTimer = null;
  function getFieldSelection() {
    try {
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
        const s = ae.selectionStart, en = ae.selectionEnd;
        if (typeof s === 'number' && typeof en === 'number' && en > s) {
          return (ae.value || '').slice(s, en).trim();
        }
      }
    } catch (err) {}
    return null;
  }
  function updateSelection() {
    let text = getFieldSelection();
    let rect = null;
    if (!text) {
      let sel = null;
      try { sel = window.getSelection(); } catch (err) { return; }
      if (!sel || sel.isCollapsed) { if (mode === 'text') hide(); return; }
      try { text = sel.toString().trim(); } catch (err) { return; }
      if (!text || text.length < MIN_TEXT || text.length > MAX_TEXT) { if (mode === 'text') hide(); return; }
      try {
        if (sel.anchorNode && host.contains(sel.anchorNode)) return;
        const range = sel.getRangeAt(0);
        rect = range.getBoundingClientRect();
      } catch (err) { return; }
    } else {
      if (text.length < MIN_TEXT || text.length > MAX_TEXT) { if (mode === 'text') hide(); return; }
      try {
        const ae = document.activeElement;
        rect = ae.getBoundingClientRect();
      } catch (err) { return; }
    }
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      // field selection without rect: place near top of field
      if (!rect) return;
    }
    try {
      mode = 'text'; selText = text; imgUrl = null;
      chip.textContent = '+';
      place(rect.right - 36, rect.top - 40);
    } catch (err) { /* ignore */ }
  }
  document.addEventListener('selectionchange', () => {
    if (selTimer) clearTimeout(selTimer);
    selTimer = setTimeout(updateSelection, 250);
  });
  // mouseup already covered by selectionchange debounce — keep single path
  document.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); }, true);
})();
