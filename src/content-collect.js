// Vibey web collector — floating "+" on hovered images and selected text.
// Runs as a content script on http/https pages. UI is Shadow-DOM isolated
// so page styles can never leak in or out.
(function () {
  'use strict';
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;

  const MIN_SIZE = 60;
  const MIN_TEXT = 3;
  const MAX_TEXT = 2000;

  const host = document.createElement('div');
  host.id = 'vibey-collect-root';
  let shadow;
  try {
    shadow = host.attachShadow({ mode: 'closed' });
  } catch (e) { return; }

  const style = document.createElement('style');
  style.textContent =
    '.vibey-chip{display:none;position:fixed;z-index:2147483647;width:30px;height:30px;' +
    'align-items:center;justify-content:center;border-radius:50%;border:1px solid rgba(139,137,255,.6);' +
    'background:rgba(20,20,28,.92);color:#c4c3ff;font-size:18px;font-weight:800;line-height:1;' +
    'cursor:pointer;font-family:system-ui,sans-serif;padding:0;margin:0;box-shadow:0 4px 16px rgba(0,0,0,.5);}' +
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
  shadow.appendChild(chip);

  const toast = document.createElement('div');
  toast.className = 'vibey-toast';
  shadow.appendChild(toast);

  document.documentElement.appendChild(host);

  let mode = null; // 'image' | 'text'
  let imgUrl = null;
  let selText = null;
  let toastTimer = null;

  function hide() {
    chip.style.display = 'none';
    mode = null; imgUrl = null; selText = null;
  }
  function place(x, y) {
    chip.style.left = Math.max(4, Math.min(x, window.innerWidth - 38)) + 'px';
    chip.style.top = Math.max(4, y) + 'px';
    chip.style.display = 'flex';
  }
  function showToast(msg) {
    toast.textContent = msg;
    toast.style.opacity = '1';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2200);
  }

  function pushUnique(key, value, isText, done) {
    try {
      chrome.storage.local.get([key], (r) => {
        const arr = (r && r[key]) || [];
        const exists = isText
          ? arr.some((t) => t && t.text === value.text)
          : arr.includes(value);
        if (exists) { showToast('Already in Vibey queue'); if (done) done(false); return; }
        arr.unshift(value);
        try {
          chrome.storage.local.set({ [key]: arr }, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
              showToast('Vibey: queue is full');
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
    chip.textContent = ok ? '✓' : '!';
    setTimeout(hide, 700);
  }

  chip.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (mode === 'image' && imgUrl) {
      pushUnique('moodboardImages', imgUrl, false, flash);
    } else if (mode === 'text' && selText) {
      pushUnique('moodboardTexts', { text: selText, url: location.href, ts: Date.now() }, true, (ok) => {
        if (ok) { try { window.getSelection().removeAllRanges(); } catch (err) {} }
        flash(ok);
        hide();
      });
    }
  });

  document.addEventListener('mouseover', (e) => {
    const t = e.target;
    const img = (t && t.closest) ? t.closest('img') : null;
    if (!img) return;
    let r;
    try { r = img.getBoundingClientRect(); } catch (err) { return; }
    if (!r || r.width < MIN_SIZE || r.height < MIN_SIZE) return;
    const src = img.currentSrc || img.src;
    if (!src) return;
    mode = 'image'; imgUrl = src; selText = null;
    chip.textContent = '+';
    place(r.right - 36, r.top + 6);
  }, true);

  document.addEventListener('mouseout', (e) => {
    if (mode !== 'image') return;
    if (e.relatedTarget && host.contains(e.relatedTarget)) return;
    hide();
  }, true);

  let selTimer = null;
  function updateSelection() {
    let sel = null;
    try { sel = window.getSelection(); } catch (err) { return; }
    if (!sel || sel.isCollapsed) { if (mode === 'text') hide(); return; }
    let text = '';
    try { text = sel.toString().trim(); } catch (err) { return; }
    if (text.length < MIN_TEXT || text.length > MAX_TEXT) { if (mode === 'text') hide(); return; }
    try {
      if (sel.anchorNode && host.contains(sel.anchorNode)) return;
      const range = sel.getRangeAt(0);
      const r = range.getBoundingClientRect();
      if (!r || (r.width === 0 && r.height === 0)) return;
      mode = 'text'; selText = text; imgUrl = null;
      chip.textContent = '+';
      place(r.right - 36, r.top - 40);
    } catch (err) { /* ignore */ }
  }
  document.addEventListener('selectionchange', () => {
    if (selTimer) clearTimeout(selTimer);
    selTimer = setTimeout(updateSelection, 250);
  });
  document.addEventListener('mouseup', () => setTimeout(updateSelection, 60));

  document.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); }, true);
})();
