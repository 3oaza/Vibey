
    // —————————————————————————————————————————————————————
    // State
    // —————————————————————————————————————————————————————
    const state = {
      tool: 'select',
      zoom: 1.0,
      targetZoom: 1.0,
      panX: 0,
      panY: 0,
      targetPanX: 0,
      targetPanY: 0,
      selectedId: null,
      selectedIds: [],
      isCropping: false,
      drawShape: 'pen', // 'pen', 'rect', 'circle', 'line'
      drawStart: null,
      selectedSpecialLayer: null,
      isDrawing: false,
      isPanning: false,
      drawingLayerOnTop: false,
      title: 'Untitled',
      gridSize: 24,
      gridSnap: true,
      lastKeyDown: null,
      mouseX: 0,
      mouseY: 0,
      ytPlayers: new Map(),
      globalOpacity: 1,
      exportMatchView: true
    };

    const layerCounters = {
      image: 0,
      text: 0,
      drawing: 0
    };
    const UI = {
      cursor:   document.getElementById('custom-cursor'),
      board:    document.getElementById('board'),
      content:  document.getElementById('content-layer'),
      elements: document.getElementById('elements-container'),
      canvas:   document.getElementById('drawing-canvas'),
      preview:  document.getElementById('preview-canvas'),
      get ctx() { return this.canvas.getContext('2d'); },
      get pctx() { return this.preview.getContext('2d'); },
      zoomLabel: document.getElementById('zoomLabel')
    };

    function createLayerName(type) {
      layerCounters[type] = (layerCounters[type] || 0) + 1;
      const labelMap = {
        image: 'Image Layer',
        text: 'Text Layer',
        drawing: 'Drawing Layer',
        stroke: 'Stroke',
        shape: 'Shape',
        sticky: 'Sticky note'
      };
      return `${labelMap[type] || 'Layer'} ${layerCounters[type]}`;
    }

    function syncElementStack() {
      const items = Array.from(UI.elements.children);
      items.sort((a, b) => {
        const aTop = a.dataset.alwaysOnTop === 'true' ? 2 : (a.dataset.alwaysOnBottom === 'true' ? 0 : 1);
        const bTop = b.dataset.alwaysOnTop === 'true' ? 2 : (b.dataset.alwaysOnBottom === 'true' ? 0 : 1);
        return aTop - bTop;
      });
      items.forEach((el, index) => {
        el.style.zIndex = String(index + 1);
      });
    }

    function updateDrawingLayerPosition() {
      UI.canvas.style.zIndex = state.drawingLayerOnTop ? '999' : '5';
      UI.elements.style.zIndex = state.drawingLayerOnTop ? '10' : '10';
    }

    function selectDrawingLayer() {
      state.selectedId = null;
      state.selectedSpecialLayer = 'drawing';
      document.querySelectorAll('.board-item').forEach(el => el.classList.remove('selected'));
      updateLayersPanel();
    }

    // Everything new lands at the center of the current view
    function getNextPlacement(width = 280, height = 200) {
      const { x: cx, y: cy } = screenToBoard(window.innerWidth / 2, window.innerHeight / 2);
      return { x: cx - width / 2, y: cy - height / 2 };
    }

    function initPanelDragging(panelId) {
      const panel = document.getElementById(panelId);
      const handle = panel.querySelector('.panel-header');
      if (!panel || !handle) return;
      let dragState = null;
      handle.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        dragState = {
          startX: e.clientX,
          startY: e.clientY,
          left: panel.offsetLeft,
          top: panel.offsetTop
        };
        panel.classList.add('dragging');
        e.preventDefault();
      });
      window.addEventListener('mousemove', (e) => {
        if (!dragState) return;
        const nextLeft = dragState.left + (e.clientX - dragState.startX);
        const nextTop = dragState.top + (e.clientY - dragState.startY);
        const maxLeft = Math.max(8, window.innerWidth - panel.offsetWidth - 8);
        const maxTop = Math.max(8, window.innerHeight - panel.offsetHeight - 8);
        panel.style.left = Math.min(Math.max(8, nextLeft), maxLeft) + 'px';
        panel.style.top = Math.min(Math.max(8, nextTop), maxTop) + 'px';
      });
      window.addEventListener('mouseup', () => {
        dragState = null;
        panel.classList.remove('dragging');
      });
    }

    let toastTimer;
    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
    }

    let transformFrame = null;
    let panSession = null;

    // ── Smart dots grid: zoom-reactive size + mouse glow (Figma/Miro feel) ──
    const dotsCanvas = document.getElementById('dots-canvas');
    const dotsCtx = dotsCanvas ? dotsCanvas.getContext('2d') : null;
    const dotsMouse = { x: -9999, y: -9999 };
    let dotsFrame = null;
    const DOTS_GAP = 24; // world spacing, matches grid snap
    function sizeDotsCanvas() {
      if (!dotsCanvas || !dotsCtx) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      dotsCanvas.width = Math.floor(window.innerWidth * dpr);
      dotsCanvas.height = Math.floor(window.innerHeight * dpr);
      dotsCanvas.style.width = window.innerWidth + 'px';
      dotsCanvas.style.height = window.innerHeight + 'px';
      dotsCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawDots();
    }
    function drawDots() {
      if (!dotsCanvas || !dotsCtx) return;
      const w = window.innerWidth, h = window.innerHeight;
      dotsCtx.clearRect(0, 0, w, h);
      const gap = DOTS_GAP * state.zoom;
      if (gap < 7) return; // zoomed far out: hide grid like Figma/Miro
      const isLight = document.body.classList.contains('theme-light');
      // Dot size grows with zoom, so zoom-in looks different from zoom-out
      const r = Math.min(3.2, Math.max(1, 1.1 * state.zoom));
      const glowR = 130;
      const fade = Math.min(1, (gap - 7) / 10);
      const baseA = (isLight ? 0.16 : 0.12) * fade;
      const baseColor = isLight ? '20,25,40' : '255,255,255';
      const x0 = Math.floor((-state.panX / state.zoom) / DOTS_GAP) * DOTS_GAP;
      const x1 = (-state.panX + w) / state.zoom;
      const y0 = Math.floor((-state.panY / state.zoom) / DOTS_GAP) * DOTS_GAP;
      const y1 = (-state.panY + h) / state.zoom;
      for (let wy = y0; wy <= y1; wy += DOTS_GAP) {
        const sy = wy * state.zoom + state.panY;
        for (let wx = x0; wx <= x1; wx += DOTS_GAP) {
          const sx = wx * state.zoom + state.panX;
          const dx = sx - dotsMouse.x, dy = sy - dotsMouse.y;
          const d2 = dx * dx + dy * dy;
          dotsCtx.beginPath();
          if (d2 < glowR * glowR) {
            const t = 1 - Math.sqrt(d2) / glowR; // 0..1 near cursor
            dotsCtx.fillStyle = `rgba(139,137,255,${(0.12 * fade + t * 0.3).toFixed(3)})`;
            dotsCtx.arc(sx, sy, r + t * 0.8, 0, 6.2832);
          } else {
            dotsCtx.fillStyle = `rgba(${baseColor},${baseA.toFixed(3)})`;
            dotsCtx.arc(sx, sy, r, 0, 6.2832);
          }
          dotsCtx.fill();
        }
      }
    }
    function queueDotsDraw() {
      if (dotsFrame !== null) return;
      dotsFrame = requestAnimationFrame(() => { dotsFrame = null; drawDots(); });
    }
    window.addEventListener('mousemove', (e) => {
      dotsMouse.x = e.clientX; dotsMouse.y = e.clientY;
      queueDotsDraw();
    });
    window.addEventListener('resize', sizeDotsCanvas);

    function renderTransform() {
      UI.content.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
      drawDots();
      updateSelectionFrame();
      UI.zoomLabel.innerText = Math.round(state.zoom * 100) + '%';
    }

    function queueTransformRender() {
      if (transformFrame !== null) return;
      transformFrame = requestAnimationFrame(() => {
        transformFrame = null;
        state.zoom += (state.targetZoom - state.zoom) * 0.18;
        state.panX += (state.targetPanX - state.panX) * 0.18;
        state.panY += (state.targetPanY - state.panY) * 0.18;
        if (Math.abs(state.targetZoom - state.zoom) < 0.001) state.zoom = state.targetZoom;
        if (Math.abs(state.targetPanX - state.panX) < 0.1) state.panX = state.targetPanX;
        if (Math.abs(state.targetPanY - state.panY) < 0.1) state.panY = state.targetPanY;
        renderTransform();
        if (state.zoom !== state.targetZoom || state.panX !== state.targetPanX || state.panY !== state.targetPanY) {
          queueTransformRender();
        }
      });
    }

    function updateTool(newTool) {
      state.tool = newTool;
      document.querySelectorAll('.tool-item[data-tool]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === newTool);
      });
      document.body.classList.toggle('tool-select', newTool === 'select');
      syncBoardCursor();
      UI.canvas.classList.toggle('active', newTool === 'draw');

      document.getElementById('brushSettings').style.display = newTool === 'draw' ? 'block' : 'none';
      if (newTool !== 'draw') document.getElementById('shapesMenu')?.classList.remove('visible');
      syncPenPopover();
      if (newTool === 'draw') selectElement(null);
    }

    function createId() { return Math.random().toString(36).substr(2, 9); }

    function applyTransform() {
      state.zoom = state.targetZoom;
      state.panX = state.targetPanX;
      state.panY = state.targetPanY;
      renderTransform();
    }

    function updateZoom(delta, cx, cy) {
      const oldZoom = state.targetZoom;
      state.targetZoom = Math.max(0.05, Math.min(10, state.targetZoom + delta * state.targetZoom * 5));
      if (cx !== undefined && cy !== undefined) {
        const factor = state.targetZoom / oldZoom;
        state.targetPanX = cx - (cx - state.targetPanX) * factor;
        state.targetPanY = cy - (cy - state.targetPanY) * factor;
      }
      queueTransformRender();
    }

    function panBoard(dx, dy) {
      state.targetPanX += dx;
      state.targetPanY += dy;
      queueTransformRender();
    }

    let drawingDataURL = null;

    function resizeDrawingCanvas() {
      const saved = drawingDataURL;
      UI.canvas.width = window.innerWidth * 2;
      UI.canvas.height = window.innerHeight * 2;
      UI.preview.width = UI.canvas.width;
      UI.preview.height = UI.canvas.height;
      const ctx = UI.ctx;
      ctx.strokeStyle = '#8b89ff';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (saved) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0);
        img.src = saved;
      }
    }

    function saveDrawing() {
      drawingDataURL = UI.canvas.toDataURL();
    }

    resizeDrawingCanvas();
    sizeDotsCanvas();
    window.addEventListener('resize', resizeDrawingCanvas);
    window.addEventListener('resize', sizeDotsCanvas);

    function selectElement(id, multi = false) {
      if (!multi) {
        state.selectedIds = id ? [id] : [];
        state.selectedId = id;
      } else if (id) {
        if (state.selectedIds.includes(id)) {
          state.selectedIds = state.selectedIds.filter(val => val !== id);
        } else {
          state.selectedIds.push(id);
        }
        state.selectedId = state.selectedIds[state.selectedIds.length - 1] || null;
      } else {
        state.selectedIds = [];
        state.selectedId = null;
      }
      state.selectedSpecialLayer = null;
      applySelection();
    }

    function rgbToHex(rgb) {
      if (!rgb) return null;
      const s = String(rgb).trim();
      const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
      if (hex) {
        let h = hex[1];
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        return '#' + h.toLowerCase();
      }
      const m = s.match(/\d+/g);
      if (!m || m.length < 3) return null;
      return "#" + m.slice(0, 3).map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
    }

    function applySelection() {
      document.querySelectorAll('.board-item').forEach(el => {
        el.classList.toggle('selected', state.selectedIds.includes(el.id));
      });

      const selEl = state.selectedId ? document.getElementById(state.selectedId) : null;
      const isText = selEl?.dataset.layerType === 'text' || selEl?.dataset.layerType === 'sticky';
      document.getElementById('textSettings').style.display = isText ? 'block' : 'none';
      if (isText) {
        const txt = selEl.querySelector('.board-text, .sticky-text');
        document.getElementById('fontFamily').value = txt.style.fontFamily || '';
        document.getElementById('fontSize').value = parseInt(txt.style.fontSize) || 24;
        document.getElementById('textColor').value = rgbToHex(txt.style.color) || '#ffffff';
      }

      updateLayersPanel();
      updateSelectionFrame();
      positionTextToolbar();
    }
    function selectIds(ids) {
      state.selectedIds = [...new Set(ids)];
      state.selectedId = state.selectedIds[state.selectedIds.length - 1] || null;
      state.selectedSpecialLayer = null;
      applySelection();
    }

    // ── Marquee select: Windows/Miro blue drag box ──
    let marquee = null;
    let spaceDown = false;
    let pendingNodeSelect = null;
    function ensureMarquee() {
      let m = document.getElementById('marquee');
      if (!m) {
        m = document.createElement('div');
        m.id = 'marquee';
        document.body.appendChild(m);
      }
      return m;
    }
    function positionMarquee() {
      if (!marquee) return;
      const m = marquee.el;
      m.classList.add('visible');
      m.style.left = Math.min(marquee.x0, marquee.x1) + 'px';
      m.style.top = Math.min(marquee.y0, marquee.y1) + 'px';
      m.style.width = Math.abs(marquee.x1 - marquee.x0) + 'px';
      m.style.height = Math.abs(marquee.y1 - marquee.y0) + 'px';
    }
    function cancelMarquee(restore) {
      if (!marquee) return;
      marquee.el.classList.remove('visible');
      if (restore) selectIds(marquee.base);
      marquee = null;
    }
    function updateMarqueeSelection() {
      const ax = screenToBoard(Math.min(marquee.x0, marquee.x1), Math.min(marquee.y0, marquee.y1));
      const bx = screenToBoard(Math.max(marquee.x0, marquee.x1), Math.max(marquee.y0, marquee.y1));
      const hits = [];
      Array.from(UI.elements.children).forEach(el => {
        if (!el.classList || !el.classList.contains('board-item')) return;
        const ex = parseFloat(el.style.left) || 0, ey = parseFloat(el.style.top) || 0;
        const ew = el.offsetWidth || 0, eh = el.offsetHeight || 0;
        if (ex < bx.x && ex + ew > ax.x && ey < bx.y && ey + eh > ax.y) hits.push(el.id);
      });
      selectIds([...marquee.base, ...hits]);
    }

    function makeDraggable(el) {
      let isDragging = false;
      let moved = false;
      let start = { x: 0, y: 0 };
      el.addEventListener('mousedown', (e) => {
        if (state.tool !== 'select' || e.target.classList.contains('resizer')) return;
        if (el.dataset.diagramChild) return; // diagram parts move with their group
        if (el.dataset.diagram === '1') {
          const roleEl = e.target.closest && e.target.closest('[data-diagram-role="branch"], [data-diagram-role="center"]');
          pendingNodeSelect = roleEl && roleEl.id ? { id: roleEl.id, x: e.clientX, y: e.clientY } : null;
        }
        if (state.lastKeyDown === 'e') { pickColor(e); return; }
        const txt = e.target.closest('.board-text');
        if (txt && document.activeElement === txt) return;
        isDragging = true;
        selectElement(el.id, e.ctrlKey || e.metaKey);
        start.x = e.clientX;
        start.y = e.clientY;
        state.selectedIds.forEach(id => {
          const item = document.getElementById(id);
          if (item) {
            item._dragStartPos = {
              x: parseFloat(item.style.left) || 0,
              y: parseFloat(item.style.top) || 0
            };
          }
        });
        el.classList.add('dragging');
        e.stopPropagation();
      });
      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        let dx = (e.clientX - start.x) / state.zoom;
        let dy = (e.clientY - start.y) / state.zoom;
        if (dx || dy) moved = true;
        // Snap only while the grid is actually visible (dots fade out when zoomed far out)
        if (state.gridSnap && state.zoom * state.gridSize >= 7 && el._dragStartPos) {
          // Snap the shared delta once so multi-select keeps its offsets
          dx = Math.round((el._dragStartPos.x + dx) / state.gridSize) * state.gridSize - el._dragStartPos.x;
          dy = Math.round((el._dragStartPos.y + dy) / state.gridSize) * state.gridSize - el._dragStartPos.y;
        }
        state.selectedIds.forEach(id => {
          const item = document.getElementById(id);
          if (item && item._dragStartPos) {
            item.style.left = item._dragStartPos.x + dx + 'px';
            item.style.top  = item._dragStartPos.y + dy + 'px';
          }
        });
        updateSelectionFrame();
      });
      window.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          el.classList.remove('dragging');
          state.selectedIds.forEach(id => {
            const item = document.getElementById(id);
            if (item) delete item._dragStartPos;
          });
          if (moved) { moved = false; pushHistory(); }
        }
      });
    }

    function makeResizable(el) {
      const resizer = el.querySelector('.resizer');
      if (!resizer) return;
      let isResizing = false;
      let startSize = { w: 0, h: 0, x: 0, y: 0 };
      
      resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        startSize = {
          w: el.offsetWidth,
          h: el.offsetHeight,
          x: e.clientX,
          y: e.clientY
        };
        e.stopPropagation();
        e.preventDefault();
      });

      window.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const dx = (e.clientX - startSize.x) / state.zoom;
        const dy = (e.clientY - startSize.y) / state.zoom;
        el.style.width = Math.max(40, startSize.w + dx) + 'px';
        el.style.height = Math.max(40, startSize.h + dy) + 'px';
      });

      window.addEventListener('mouseup', () => {
        isResizing = false;
      });
    }

    // ── Miro-style selection frame: blue box + 8 resize handles ──
    let selFrame = null;
    const selHandles = {};
    const HANDLE_DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    const HANDLE_CURSOR = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
    function ensureSelectionFrame() {
      if (selFrame) return;
      selFrame = document.createElement('div');
      selFrame.id = 'selection-frame';
      HANDLE_DIRS.forEach(dir => {
        const h = document.createElement('div');
        h.className = 'sel-handle';
        h.style.cursor = HANDLE_CURSOR[dir];
        h.addEventListener('mousedown', (e) => startFrameResize(dir, e));
        selFrame.appendChild(h);
        selHandles[dir] = h;
      });
      UI.content.appendChild(selFrame);
    }
    function selectedBounds() {
      const els = state.selectedIds
        .map(id => document.getElementById(id))
        .filter(el => el && el.classList && el.classList.contains('board-item'));
      if (!els.length) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      els.forEach(el => {
        const r = el.getBoundingClientRect();
        const a = screenToBoard(r.left, r.top);
        const b = screenToBoard(r.right, r.bottom);
        minX = Math.min(minX, a.x); minY = Math.min(minY, a.y);
        maxX = Math.max(maxX, b.x); maxY = Math.max(maxY, b.y);
      });
      return { x: minX, y: minY, w: Math.max(4, maxX - minX), h: Math.max(4, maxY - minY), single: els.length === 1 };
    }
    function updateSelectionFrame() {
      ensureSelectionFrame();
      const b = selectedBounds();
      const nodeEl = (b && b.single && state.tool === 'select' && state.selectedId) ? document.getElementById(state.selectedId) : null;
      const nodeSel = !!(nodeEl && (nodeEl.dataset.diagramRole === 'branch' || nodeEl.dataset.diagramRole === 'center'));
      selFrame.classList.toggle('node-mode', nodeSel);
      document.body.classList.toggle('node-selected', nodeSel);
      if (!b || state.tool !== 'select') {
        selFrame.classList.remove('visible');
      } else {
        selFrame.classList.add('visible');
        selFrame.style.left = b.x + 'px';
        selFrame.style.top = b.y + 'px';
        selFrame.style.width = b.w + 'px';
        selFrame.style.height = b.h + 'px';
        selFrame.style.borderWidth = (1.5 / state.zoom) + 'px';
        const hs = 12 / state.zoom; // constant screen-size handles
        HANDLE_DIRS.forEach(dir => {
          const h = selHandles[dir];
          if (!b.single) { h.style.display = 'none'; return; }
          h.style.display = 'block';
          h.style.width = hs + 'px';
          h.style.height = hs + 'px';
          h.style.borderWidth = (2 / state.zoom) + 'px';
          let hx = b.w / 2, hy = b.h / 2;
          if (dir.includes('w')) hx = 0; else if (dir.includes('e')) hx = b.w;
          if (dir.includes('n')) hy = 0; else if (dir.includes('s')) hy = b.h;
          h.style.left = hx + 'px';
          h.style.top = hy + 'px';
        });
      }
      positionTextToolbar();
      syncStickySwatches();
      positionDiagramBar();
      positionNodeButtons();
    }
    function nodeBranchSide(nodeEl, groupEl) {
      if (!nodeEl || nodeEl.dataset.diagramRole === 'center') return 'right';
      const content = groupEl ? groupEl.querySelector('.group-content') : null;
      const center = content && content.querySelector('[data-diagram-role="center"]');
      if (!center) return 'right';
      const cl = parseFloat(center.style.left) || 0;
      return (parseFloat(nodeEl.style.left) || 0) >= cl ? 'right' : 'left';
    }
    function positionNodeButtons() {
      const wrap = document.getElementById('nodeButtons');
      if (!wrap) return;
      const n = state.selectedId ? document.getElementById(state.selectedId) : null;
      const ok = n && state.tool === 'select' && state.selectedIds.length === 1 &&
        (n.dataset.diagramRole === 'branch' || n.dataset.diagramRole === 'center');
      if (!ok) { wrap.classList.remove('visible'); return; }
      wrap.classList.add('visible');
      wrap.dataset.node = n.id;
      const r = n.getBoundingClientRect();
      const addBtn = document.getElementById('nodeAddBtn');
      const doneBtn = document.getElementById('nodeDoneBtn');
      addBtn.style.left = Math.max(4, Math.min(r.right + 8, window.innerWidth - 38)) + 'px';
      addBtn.style.top = Math.max(4, Math.min(r.top + r.height / 2 - 15, window.innerHeight - 38)) + 'px';
      doneBtn.style.left = Math.max(4, Math.min(r.left + r.width / 2 - 15, window.innerWidth - 38)) + 'px';
      doneBtn.style.top = Math.max(4, Math.min(r.bottom + 8, window.innerHeight - 38)) + 'px';
    }
    let frameResize = null;
    function startFrameResize(dir, e) {
      if (e.button !== 0) return;
      const el = state.selectedId ? document.getElementById(state.selectedId) : null;
      if (!el) return;
      e.stopPropagation();
      e.preventDefault();
      frameResize = {
        dir, el,
        startX: e.clientX, startY: e.clientY,
        left: parseFloat(el.style.left) || 0,
        top: parseFloat(el.style.top) || 0,
        w: el.offsetWidth || 40,
        h: el.offsetHeight || 40
      };
    }
    window.addEventListener('mousemove', (e) => {
      if (!frameResize) return;
      const dx = (e.clientX - frameResize.startX) / state.zoom;
      const dy = (e.clientY - frameResize.startY) / state.zoom;
      if (dx || dy) frameResize.moved = true;
      const dir = frameResize.dir;
      const MIN = 40;
      let left = frameResize.left, top = frameResize.top;
      let w = frameResize.w, h = frameResize.h;
      if (dir.includes('e')) w = Math.max(MIN, frameResize.w + dx);
      if (dir.includes('s')) h = Math.max(MIN, frameResize.h + dy);
      if (dir.includes('w')) {
        left = Math.min(frameResize.left + dx, frameResize.left + frameResize.w - MIN);
        w = frameResize.w - (left - frameResize.left);
      }
      if (dir.includes('n')) {
        top = Math.min(frameResize.top + dy, frameResize.top + frameResize.h - MIN);
        h = frameResize.h - (top - frameResize.top);
      }
      const el = frameResize.el;
      el.style.left = left + 'px';
      el.style.top = top + 'px';
      el.style.width = w + 'px';
      el.style.height = h + 'px';
      updateSelectionFrame();
      positionTextToolbar();
    });
    window.addEventListener('mouseup', () => {
      if (frameResize) {
        const el = frameResize.el;
        const moved = frameResize.moved;
        frameResize = null;
        // Keep group box in sync with children (expand-only: never undo the resize)
        const group = el.classList && el.classList.contains('group-layer') ? el
          : (el.closest ? el.closest('.group-layer') : null);
        if (group) {
          const content = group.querySelector('.group-content');
          if (content) {
            let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
            Array.from(content.children).forEach(ch => {
              const x = parseFloat(ch.style.left) || 0, y = parseFloat(ch.style.top) || 0;
              minX = Math.min(minX, x); minY = Math.min(minY, y);
              maxX = Math.max(maxX, x + (ch.offsetWidth || 0));
              maxY = Math.max(maxY, y + (ch.offsetHeight || 0));
            });
            if (minX < 0 || minY < 0) expandGroupToFit(group);
            else {
              const gw = parseFloat(group.style.width) || 0, gh = parseFloat(group.style.height) || 0;
              if (maxX > gw) group.style.width = maxX + 'px';
              if (maxY > gh) group.style.height = maxY + 'px';
              updateSelectionFrame();
            }
          }
        }
        if (moved) pushHistory();
      }
    });

    // ── Floating text toolbar (Miro-style) ──
    function selectedTextEl() {
      const el = state.selectedId ? document.getElementById(state.selectedId) : null;
      if (!el) return null;
      if (el.dataset.layerType === 'text' || el.dataset.layerType === 'sticky') return el.querySelector('.board-text, .sticky-text');
      // Editing text nested inside a selected group/diagram: style that text
      const active = document.activeElement;
      if (active && active.classList && active.classList.contains('board-text') && el.contains(active)) return active;
      return null;
    }
    function syncTextToolbar(txt) {
      const size = parseInt(txt.style.fontSize) || 24;
      document.getElementById('ttSize').value = size;
      const fw = txt.style.fontWeight;
      document.getElementById('ttBold').classList.toggle('active', fw === '700' || fw === '800' || fw === 'bold');
      document.getElementById('ttItalic').classList.toggle('active', txt.style.fontStyle === 'italic');
      const align = txt.style.textAlign || 'left';
      ['Left', 'Center', 'Right'].forEach(a => {
        document.getElementById('ttAlign' + a).classList.toggle('active', align === a.toLowerCase());
      });
      const c = rgbToHex(txt.style.color) || '#ffffff';
      document.getElementById('ttColor').value = c;
      document.querySelector('.tt-color').style.borderBottomColor = c;
      const fs = document.getElementById('fontSize'); if (fs) fs.value = size;
      const tc = document.getElementById('textColor'); if (tc) tc.value = c;
    }
    function positionTextToolbar() {
      const bar = document.getElementById('textToolbar');
      if (!bar) return;
      const txt = selectedTextEl();
      if (!txt || state.tool !== 'select') { bar.classList.remove('visible'); return; }
      syncTextToolbar(txt);
      bar.classList.add('visible');
      const host = document.getElementById(state.selectedId);
      const r = host.getBoundingClientRect();
      const bw = bar.offsetWidth, bh = bar.offsetHeight;
      let left = r.left + r.width / 2 - bw / 2;
      left = Math.max(8, Math.min(window.innerWidth - bw - 8, left));
      let top = r.top - bh - 10;
      if (top < 60) top = r.bottom + 10; // flip below when no room above
      bar.style.left = left + 'px';
      bar.style.top = top + 'px';
    }
    function applyTextStyle(fn, skipHistory) {
      const txt = selectedTextEl();
      if (!txt) return;
      fn(txt);
      syncTextToolbar(txt);
      if (!skipHistory) pushHistory();
    }
    function textFontSize() {
      const txt = selectedTextEl();
      return txt ? (parseInt(txt.style.fontSize) || 24) : 24;
    }
    function bindTextToolbar() {
      const bar = document.getElementById('textToolbar');
      if (!bar || bar.dataset.bound) return;
      bar.dataset.bound = '1';
      bar.querySelectorAll('button').forEach(b => b.addEventListener('mousedown', e => e.preventDefault()));
      document.getElementById('ttDecrease').addEventListener('click', () => {
        const s = Math.max(8, textFontSize() - 2);
        applyTextStyle(t => t.style.fontSize = s + 'px');
      });
      document.getElementById('ttIncrease').addEventListener('click', () => {
        const s = Math.min(200, textFontSize() + 2);
        applyTextStyle(t => t.style.fontSize = s + 'px');
      });
      document.getElementById('ttSize').addEventListener('change', (e) => {
        const s = Math.max(8, Math.min(200, parseInt(e.target.value) || 24));
        applyTextStyle(t => t.style.fontSize = s + 'px');
      });
      document.getElementById('ttBold').addEventListener('click', () => {
        const on = document.getElementById('ttBold').classList.contains('active');
        applyTextStyle(t => t.style.fontWeight = on ? '500' : '800');
      });
      document.getElementById('ttItalic').addEventListener('click', () => {
        const on = document.getElementById('ttItalic').classList.contains('active');
        applyTextStyle(t => t.style.fontStyle = on ? 'normal' : 'italic');
      });
      ['Left', 'Center', 'Right'].forEach(a => {
        document.getElementById('ttAlign' + a).addEventListener('click', () => {
          applyTextStyle(t => t.style.textAlign = a.toLowerCase());
        });
      });
      document.getElementById('ttColor').addEventListener('input', (e) => {
        applyTextStyle(t => t.style.color = e.target.value, true);
      });
      document.getElementById('ttColor').addEventListener('change', () => pushHistory());
      // Reposition while typing (box grows)
      UI.elements.addEventListener('input', (e) => {
        if (e.target.closest && e.target.closest('.board-text') && selectedTextEl()) positionTextToolbar();
      });
    }
    bindTextToolbar();
    function positionDiagramBar() {
      const bar = document.getElementById('diagramBar');
      if (!bar) return;
      const g = state.selectedId ? document.getElementById(state.selectedId) : null;
      if (!g || g.dataset.diagram !== '1' || state.selectedIds.length !== 1 || state.tool !== 'select') { bar.classList.remove('visible'); return; }
      bar.classList.add('visible');
      const r = g.getBoundingClientRect();
      const bw = bar.offsetWidth, bh = bar.offsetHeight;
      let left = r.left + r.width / 2 - bw / 2;
      left = Math.max(8, Math.min(window.innerWidth - bw - 8, left));
      let top = r.bottom + 10;
      if (top + bh > window.innerHeight - 90) top = r.top - bh - 10;
      bar.style.left = left + 'px';
      bar.style.top = Math.max(60, top) + 'px';
    }

    function addElement(type, data, x, y) {
      const el = document.createElement('div');
      el.id = 'el-' + createId();
      el.className = 'board-item';
      el.style.left = x + 'px';
      el.style.top  = y + 'px';
      el.dataset.layerType = type;
      el.dataset.layerName = createLayerName(type);
      
      const resizer = document.createElement('div');
      resizer.className = 'resizer';
      el.appendChild(resizer);

      if (type === 'image') {
        const img = document.createElement('img');
        img.src = data;
        el.appendChild(img);
        el.style.width = '280px';
      } else if (type === 'video') {
        const video = document.createElement('video');
        video.src = data;
        video.controls = false;
        video.setAttribute('loop', '');
        video.setAttribute('autoplay', '');
        video.setAttribute('muted', '');
        video.setAttribute('playsinline', '');
        video.muted = true;
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.borderRadius = '12px';
        video.style.objectFit = 'contain';
        el.appendChild(video);
        el.style.width = '320px';
        el.style.height = '180px';
      } else if (type === 'youtube') {
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube.com/embed/${data}?autoplay=1&mute=1&controls=1&modestbranding=1&loop=1&playlist=${data}`;
        iframe.classList.add('w-full', 'h-full', 'rounded-xl', 'overflow-hidden', 'pointer-events-none');
        iframe.frameBorder = "0";
        iframe.allow = "autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
        iframe.allowFullscreen = true;
        el.appendChild(iframe);
        el.dataset.ytId = data;
        el.style.width = '480px';
        el.style.height = '270px';
      } else if (type === 'text') {
        const txt = document.createElement('div');
        txt.className = 'board-text';
        txt.contentEditable = true;
        txt.innerText = data || 'Type something...';
        el.appendChild(txt);
        el.style.width = 'auto';
        setTimeout(() => {
          txt.focus();
        }, 50);
      }
      UI.elements.appendChild(el);
      syncElementStack();
      makeDraggable(el);
      makeResizable(el);
      selectElement(el.id);
      updateLayersPanel();
      pushHistory();
      return el;
    }

    function getYouTubeId(url) {
      const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
      const match = url.match(regExp);
      return (match && match[2].length === 11) ? match[2] : null;
    }

    function createGroup() {
      if (state.selectedIds.length < 2) { showToast('Select multiple items to group.'); return; }
      const groupEl = document.createElement('div');
      groupEl.id = 'group-' + createId();
      groupEl.className = 'board-item group-layer';
      groupEl.dataset.layerType = 'group';
      groupEl.dataset.layerName = createLayerName('group');
      const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      const selectedItems = state.selectedIds.map(id => document.getElementById(id)).filter(Boolean);
      selectedItems.forEach(el => {
        const x = parseFloat(el.style.left) || 0;
        const y = parseFloat(el.style.top) || 0;
        const w = el.offsetWidth || 280;
        const h = el.offsetHeight || 200;
        bounds.minX = Math.min(bounds.minX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxX = Math.max(bounds.maxX, x + w);
        bounds.maxY = Math.max(bounds.maxY, y + h);
      });
      groupEl.style.left = bounds.minX + 'px';
      groupEl.style.top  = bounds.minY + 'px';
      groupEl.style.width = (bounds.maxX - bounds.minX) + 'px';
      groupEl.style.height = (bounds.maxY - bounds.minY) + 'px';
      const content = document.createElement('div');
      content.className = 'group-content';
      groupEl.appendChild(content);
      selectedItems.forEach(el => {
        el.style.left = (parseFloat(el.style.left) - bounds.minX) + 'px';
        el.style.top  = (parseFloat(el.style.top) - bounds.minY) + 'px';
        content.appendChild(el);
      });
      UI.elements.appendChild(groupEl);
      makeDraggable(groupEl);
      selectElement(groupEl.id);
      pushHistory();
      showToast('Items grouped.');
    }

    function screenToBoard(cx, cy) {
      return { x: (cx - state.panX) / state.zoom, y: (cy - state.panY) / state.zoom };
    }

    async function pickColor(e) {
      const target = e.target.closest('img');
      if (!target) return;
      const canvas = document.createElement('canvas');
      canvas.width = 1; canvas.height = 1;
      const ctx = canvas.getContext('2d');
      const rect = target.getBoundingClientRect();
      const rx = (e.clientX - rect.left) / (rect.width / target.naturalWidth);
      const ry = (e.clientY - rect.top) / (rect.height / target.naturalHeight);
      try {
        const tempImg = await loadImage(target.src);
        ctx.drawImage(tempImg, rx, ry, 1, 1, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        showToast(`Color: ${hex}`);
        navigator.clipboard.writeText(hex);
      } catch (err) { showToast('Cannot pick color (CORS)'); }
    }

    // ── Smooth brush engine (Miro / Figma style): live DOM/SVG stroke ──
    let activeStroke = null;
    function brushBaseSize() {
      return parseFloat(document.getElementById('brushSize')?.value) || 3;
    }
    function brushColor() {
      return document.getElementById('brushColor')?.value || '#8b89ff';
    }
    function setupBrushCtx(ctx) {
      ctx = ctx || UI.ctx;
      ctx.strokeStyle = brushColor();
      ctx.lineWidth = brushBaseSize() / state.zoom;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
    function strokePathD(L) {
      let d = `M ${L[0].x.toFixed(2)} ${L[0].y.toFixed(2)}`;
      for (let i = 1; i < L.length - 1; i++) {
        const mx = ((L[i].x + L[i + 1].x) / 2).toFixed(2);
        const my = ((L[i].y + L[i + 1].y) / 2).toFixed(2);
        d += ` Q ${L[i].x.toFixed(2)} ${L[i].y.toFixed(2)} ${mx} ${my}`;
      }
      const last = L[L.length - 1];
      d += ` L ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
      return d;
    }
    function layoutLiveStroke(s, pts) {
      const pad = s.lw / 2 + 4;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      pts.forEach(p => {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
      });
      minX -= pad; minY -= pad;
      const w = Math.max(8, maxX - minX + pad * 2);
      const h = Math.max(8, maxY - minY + pad * 2);
      s.el.style.left = minX + 'px';
      s.el.style.top = minY + 'px';
      s.el.style.width = w + 'px';
      s.el.style.height = h + 'px';
      s.svg.setAttribute('viewBox', `0 0 ${w.toFixed(2)} ${h.toFixed(2)}`);
      s.path.setAttribute('d', strokePathD(pts.map(p => ({ x: p.x - minX, y: p.y - minY }))));
    }
    function beginSmoothStroke(x, y) {
      const svgNS = 'http://www.w3.org/2000/svg';
      const color = brushColor(), size = brushBaseSize(), zoom = state.zoom;
      const lw = size / zoom;
      const el = document.createElement('div');
      el.id = 'el-' + createId();
      el.className = 'board-item';
      el.style.pointerEvents = 'none';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('class', 'vibey-stroke');
      svg.setAttribute('xmlns', svgNS);
      svg.setAttribute('preserveAspectRatio', 'none');
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', color);
      path.setAttribute('stroke-width', lw.toFixed(2));
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(path);
      el.appendChild(svg);
      UI.elements.appendChild(el);
      activeStroke = { el, svg, path, pts: [{ x, y }], smooth: { x, y }, color, size, zoom, lw, moved: false };
      layoutLiveStroke(activeStroke, activeStroke.pts);
    }
    function pushSmoothPoint(x, y) {
      const s = activeStroke;
      if (!s) return;
      // Stabilization: heavier easing kills hand shake while drawing
      s.smooth.x += (x - s.smooth.x) * 0.45;
      s.smooth.y += (y - s.smooth.y) * 0.45;
      const px = s.smooth.x, py = s.smooth.y;
      const prev = s.pts[s.pts.length - 1];
      if (Math.hypot(px - prev.x, py - prev.y) < 1.2 / s.zoom) return; // jitter filter
      s.pts.push({ x: px, y: py });
      s.moved = true;
      layoutLiveStroke(s, s.pts);
    }
    function chaikinSmooth(pts) {
      if (pts.length < 3) return pts;
      const out = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
        out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
      }
      out.push(pts[pts.length - 1]);
      return out;
    }
    function beautifyStroke(pts, zoom) {
      // 1) drop over-dense points
      const minD = 2.5 / (zoom || state.zoom);
      const filtered = [pts[0]];
      for (const p of pts) {
        const l = filtered[filtered.length - 1];
        if (Math.hypot(p.x - l.x, p.y - l.y) >= minD) filtered.push(p);
      }
      if (filtered.length < 3) return filtered;
      // 2) moving average: kills jitter bumps
      const avg = filtered.map((p, i) => {
        const a = filtered[Math.max(0, i - 1)];
        const b = filtered[Math.min(filtered.length - 1, i + 1)];
        return { x: (a.x + p.x * 2 + b.x) / 4, y: (a.y + p.y * 2 + b.y) / 4 };
      });
      avg[0] = filtered[0];
      avg[avg.length - 1] = filtered[filtered.length - 1];
      // 3) Chaikin x2: the Figma-like clean curve
      return chaikinSmooth(chaikinSmooth(avg));
    }
    function endSmoothStroke() {
      const s = activeStroke;
      activeStroke = null;
      if (!s) return;
      const el = s.el;
      el.style.pointerEvents = '';
      if (!s.moved || s.pts.length < 2) {
        const p = s.pts[0];
        const r = s.lw / 2;
        const minX = p.x - r - 1, minY = p.y - r - 1;
        const w = s.lw + 2, h = s.lw + 2;
        el.style.left = minX + 'px';
        el.style.top = minY + 'px';
        el.style.width = w + 'px';
        el.style.height = h + 'px';
        s.svg.setAttribute('viewBox', `0 0 ${w.toFixed(2)} ${h.toFixed(2)}`);
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', (p.x - minX).toFixed(2));
        c.setAttribute('cy', (p.y - minY).toFixed(2));
        c.setAttribute('r', r.toFixed(2));
        c.setAttribute('fill', s.color);
        s.path.remove();
        s.svg.appendChild(c);
      } else {
        layoutLiveStroke(s, beautifyStroke(s.pts, s.zoom));
      }
      el.dataset.layerType = 'stroke';
      el.dataset.layerName = createLayerName('stroke');
      const resizer = document.createElement('div');
      resizer.className = 'resizer';
      el.appendChild(resizer);
      syncElementStack();
      makeDraggable(el);
      makeResizable(el);
      selectElement(el.id);
      updateLayersPanel();
      // NOTE: history push happens in the mouseup caller
    }
    async function rasterizeStrokeSVG(svg, w, h) {
      const clone = svg.cloneNode(true);
      clone.setAttribute('width', Math.max(1, Math.round(w * 2)));
      clone.setAttribute('height', Math.max(1, Math.round(h * 2)));
      const str = new XMLSerializer().serializeToString(clone);
      const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
      return loadImage(url);
    }
    // ── Shapes engine: every shape becomes a selectable object (like Miro) ──
    function hexToRgba(hex, a) {
      const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
      if (!m) return `rgba(139,137,255,${a})`;
      const n = parseInt(m[1], 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    }
    function svgEl(tag, attrs) {
      const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const k in attrs) n.setAttribute(k, attrs[k]);
      return n;
    }
    function commitShapeAsObject(kind, sx, sy, ex, ey) {
      const svgNS = 'http://www.w3.org/2000/svg';
      const color = brushColor();
      const lw = brushBaseSize() / state.zoom;
      const needHead = kind === 'arrow' || kind === 'elbow';
      const headLen = Math.max(10 / state.zoom, lw * 3.5);
      const pad = lw / 2 + 4 / state.zoom + (needHead ? headLen : 0);
      const thin = kind === 'line' || kind === 'arrow' || kind === 'divider' || kind === 'elbow';
      const minX = Math.min(sx, ex) - pad, minY = Math.min(sy, ey) - pad;
      const w = Math.max(thin ? 8 : 16, Math.abs(ex - sx) + pad * 2);
      const h = Math.max(thin ? 8 : 16, Math.abs(ey - sy) + pad * 2);
      const f = n => +n.toFixed(2);
      const X = v => f(v - minX), Y = v => f(v - minY);
      const base = { fill: 'none', stroke: color, 'stroke-width': lw.toFixed(2), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
      const fillShape = Object.assign({}, base, { fill: hexToRgba(color, 0.12) });
      const kids = [];
      const addLine = (x1, y1, x2, y2) => kids.push(svgEl('line', Object.assign({ x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2) }, base)));
      const addPath = d => kids.push(svgEl('path', Object.assign({ d }, base)));
      const addHead = (tx, ty, ang) => {
        const sp = 0.42;
        const ax1 = tx - headLen * Math.cos(ang - sp), ay1 = ty - headLen * Math.sin(ang - sp);
        const ax2 = tx - headLen * Math.cos(ang + sp), ay2 = ty - headLen * Math.sin(ang + sp);
        addPath(`M ${X(tx)} ${Y(ty)} L ${X(ax1)} ${Y(ay1)} M ${X(tx)} ${Y(ty)} L ${X(ax2)} ${Y(ay2)}`);
      };
      if (kind === 'rect') {
        kids.push(svgEl('rect', Object.assign({ x: 0, y: 0, width: f(w), height: f(h), rx: f(Math.min(10, w / 5, h / 5)) }, fillShape)));
      } else if (kind === 'oval') {
        kids.push(svgEl('ellipse', Object.assign({ cx: f(w / 2), cy: f(h / 2), rx: f(w / 2), ry: f(h / 2) }, fillShape)));
      } else if (kind === 'rhombus') {
        kids.push(svgEl('polygon', Object.assign({ points: `${f(w / 2)},0 ${f(w)},${f(h / 2)} ${f(w / 2)},${f(h)} 0,${f(h / 2)}` }, fillShape)));
      } else if (kind === 'triangle') {
        kids.push(svgEl('polygon', Object.assign({ points: `${f(w / 2)},0 ${f(w)},${f(h)} 0,${f(h)}` }, fillShape)));
      } else if (kind === 'tridown') {
        kids.push(svgEl('polygon', Object.assign({ points: `0,0 ${f(w)},0 ${f(w / 2)},${f(h)}` }, fillShape)));
      } else if (kind === 'cylinder') {
        const eh = Math.min(w * 0.2, h * 0.28);
        kids.push(svgEl('path', Object.assign({ d: `M 0 ${f(eh)} L 0 ${f(h - eh)} Q 0 ${f(h)} ${f(w / 2)} ${f(h)} Q ${f(w)} ${f(h)} ${f(w)} ${f(h - eh)} L ${f(w)} ${f(eh)}` }, fillShape)));
        kids.push(svgEl('ellipse', Object.assign({ cx: f(w / 2), cy: f(eh), rx: f(w / 2), ry: f(eh) }, fillShape)));
      } else if (kind === 'block') {
        kids.push(svgEl('polygon', Object.assign({ points: `0,${f(h * 0.25)} ${f(w * 0.55)},${f(h * 0.25)} ${f(w * 0.55)},0 ${f(w)},${f(h / 2)} ${f(w * 0.55)},${f(h)} ${f(w * 0.55)},${f(h * 0.75)} 0,${f(h * 0.75)}` }, fillShape)));
      } else if (kind === 'line') {
        addLine(sx, sy, ex, ey);
      } else if (kind === 'divider') {
        const my = (sy + ey) / 2;
        addLine(sx, my, ex, my);
      } else if (kind === 'arrow') {
        addLine(sx, sy, ex, ey);
        addHead(ex, ey, Math.atan2(ey - sy, ex - sx));
      } else if (kind === 'elbow') {
        addPath(`M ${X(sx)} ${Y(sy)} L ${X(ex)} ${Y(sy)} L ${X(ex)} ${Y(ey)}`);
        addHead(ex, ey, ey >= sy ? Math.PI / 2 : -Math.PI / 2);
      } else {
        return;
      }
      const el = mountSVGObject(kids, minX, minY, w, h, 'shape', createLayerName('shape') + ' · ' + (SHAPE_NAMES[kind] || kind));
      selectElement(el.id);
      updateLayersPanel();
      // NOTE: history push happens in the mouseup caller
    }
    function previewShape(kind, sx, sy, ex, ey) {
      const p = UI.pctx;
      p.clearRect(0, 0, UI.preview.width, UI.preview.height);
      p.strokeStyle = brushColor();
      p.lineWidth = brushBaseSize() / state.zoom;
      p.lineCap = 'round';
      p.lineJoin = 'round';
      const minX = Math.min(sx, ex), minY = Math.min(sy, ey);
      const w = Math.abs(ex - sx), h = Math.abs(ey - sy);
      const headLen = Math.max(10, p.lineWidth * 3.5);
      const head = (tx, ty, ang) => {
        const sp = 0.42;
        p.beginPath();
        p.moveTo(tx, ty);
        p.lineTo(tx - headLen * Math.cos(ang - sp), ty - headLen * Math.sin(ang - sp));
        p.moveTo(tx, ty);
        p.lineTo(tx - headLen * Math.cos(ang + sp), ty - headLen * Math.sin(ang + sp));
        p.stroke();
      };
      p.beginPath();
      if (kind === 'rect') p.rect(minX, minY, w, h);
      else if (kind === 'oval') { if (w > 0 && h > 0) p.ellipse(minX + w / 2, minY + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); }
      else if (kind === 'rhombus') { p.moveTo(minX + w / 2, minY); p.lineTo(minX + w, minY + h / 2); p.lineTo(minX + w / 2, minY + h); p.lineTo(minX, minY + h / 2); p.closePath(); }
      else if (kind === 'triangle') { p.moveTo(minX + w / 2, minY); p.lineTo(minX + w, minY + h); p.lineTo(minX, minY + h); p.closePath(); }
      else if (kind === 'tridown') { p.moveTo(minX, minY); p.lineTo(minX + w, minY); p.lineTo(minX + w / 2, minY + h); p.closePath(); }
      else if (kind === 'cylinder') {
        const eh2 = Math.max(1, Math.min(w * 0.2, h * 0.28, h / 2));
        p.moveTo(minX, minY + eh2);
        p.lineTo(minX, minY + h - eh2);
        p.quadraticCurveTo(minX, minY + h, minX + w / 2, minY + h);
        p.quadraticCurveTo(minX + w, minY + h, minX + w, minY + h - eh2);
        p.lineTo(minX + w, minY + eh2);
        p.quadraticCurveTo(minX + w, minY, minX + w / 2, minY);
        p.quadraticCurveTo(minX, minY, minX, minY + eh2);
        p.closePath();
      }
      else if (kind === 'block') { p.moveTo(minX, minY + h * 0.25); p.lineTo(minX + w * 0.55, minY + h * 0.25); p.lineTo(minX + w * 0.55, minY); p.lineTo(minX + w, minY + h / 2); p.lineTo(minX + w * 0.55, minY + h); p.lineTo(minX + w * 0.55, minY + h * 0.75); p.lineTo(minX, minY + h * 0.75); p.closePath(); }
      else if (kind === 'line') { p.moveTo(sx, sy); p.lineTo(ex, ey); }
      else if (kind === 'divider') { const my = (sy + ey) / 2; p.moveTo(sx, my); p.lineTo(ex, my); }
      else if (kind === 'arrow') { p.moveTo(sx, sy); p.lineTo(ex, ey); }
      else if (kind === 'elbow') { p.moveTo(sx, sy); p.lineTo(ex, sy); p.lineTo(ex, ey); }
      else return;
      p.stroke();
      if (kind === 'arrow') head(ex, ey, Math.atan2(ey - sy, ex - sx));
      if (kind === 'elbow') head(ex, ey, ey >= sy ? Math.PI / 2 : -Math.PI / 2);
    }
    // ── Diagram: mindmap like Miro (editable texts + curved wires) ──
    function mountSVGObject(kids, minX, minY, w, h, layerType, layerName) {
      const svgNS = 'http://www.w3.org/2000/svg';
      const el = document.createElement('div');
      el.id = 'el-' + createId();
      el.className = 'board-item';
      el.style.left = minX + 'px';
      el.style.top = minY + 'px';
      el.style.width = Math.max(w, 8) + 'px';
      el.style.height = Math.max(h, 8) + 'px';
      el.dataset.layerType = layerType;
      el.dataset.layerName = layerName;
      const resizer = document.createElement('div');
      resizer.className = 'resizer';
      el.appendChild(resizer);
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('class', 'vibey-stroke');
      svg.setAttribute('xmlns', svgNS);
      svg.setAttribute('viewBox', `0 0 ${w.toFixed(2)} ${h.toFixed(2)}`);
      svg.setAttribute('preserveAspectRatio', 'none');
      kids.forEach(k => svg.appendChild(k));
      el.appendChild(svg);
      UI.elements.appendChild(el);
      syncElementStack();
      makeDraggable(el);
      makeResizable(el);
      return el;
    }
    function bindDiagramTextEdit(t) {
      t.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        t.focus();
        try {
          const r = document.createRange();
          r.selectNodeContents(t);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(r);
        } catch (err) {}
      });
    }
    function addDiagram() {
      const dark = !document.body.classList.contains('theme-light');
      const ink = dark ? '#e4e4e7' : '#171a21';
      const wire = '#8a8f98';
      const pos = getNextPlacement(640, 280);
      const cx = pos.x, cy = pos.y;
      const mkText = (str, x, y, fs, bold, role) => {
        const el = document.createElement('div');
        el.id = 'el-' + createId();
        el.className = 'board-item';
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.dataset.layerType = 'text';
        el.dataset.layerName = createLayerName('text');
        el.dataset.diagramChild = '1';
        el.dataset.diagramRole = role;
        const resizer = document.createElement('div');
        resizer.className = 'resizer';
        el.appendChild(resizer);
        const t = document.createElement('div');
        t.className = 'board-text';
        t.contentEditable = true;
        t.innerText = str;
        t.style.fontSize = fs + 'px';
        t.style.fontWeight = bold ? '800' : '500';
        t.style.color = ink;
        t.style.whiteSpace = 'nowrap';
        bindDiagramTextEdit(t);
        el.appendChild(t);
        UI.elements.appendChild(el);
        syncElementStack();
        makeDraggable(el);
        makeResizable(el);
        return el;
      };
      const mkWire = (sx, sy, ex, ey) => {
        const pad = 10;
        const minX = Math.min(sx, ex) - pad, minY = Math.min(sy, ey) - pad;
        const w = Math.abs(ex - sx) + pad * 2, h = Math.abs(ey - sy) + pad * 2;
        const f = n => +n.toFixed(2);
        const X = v => f(v - minX), Y = v => f(v - minY);
        const d = `M ${X(sx)} ${Y(sy)} C ${X(sx + 110)} ${Y(sy)} ${X(ex - 110)} ${Y(ey)} ${X(ex)} ${Y(ey)}`;
        const path = svgEl('path', { d, fill: 'none', stroke: wire, 'stroke-width': 3, 'stroke-linecap': 'round' });
        const wireEl = mountSVGObject([path], minX, minY, w, h, 'shape', createLayerName('shape') + ' · Connector');
        wireEl.dataset.diagramChild = '1';
        wireEl.dataset.diagramRole = 'wire';
        return wireEl;
      };
      const center = mkText('Any question or topic', cx, cy, 30, true, 'center');
      const cw = center.offsetWidth || 300, ch = center.offsetHeight || 40;
      const ids = [center.id];
      [['A concept', -110], ['An idea', 0], ['A thought', 110]].forEach(([label, dy]) => {
        const bx = cx + cw + 130;
        const b = mkText(label, bx, cy + dy - 14, 20, false, 'branch');
        const bh = b.offsetHeight || 28;
        ids.push(b.id);
        ids.push(mkWire(cx + cw + 6, cy + ch / 2, bx - 10, cy + dy + bh / 2).id);
      });
      selectIds(ids);
      createGroup();
      const g = document.getElementById(state.selectedId);
      if (g) g.dataset.diagram = '1';
      showToast('Diagram added — drag moves all, double-click edits text');
    }
    function expandGroupToFit(g) {
      const content = g.querySelector('.group-content');
      if (!content) return;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      Array.from(content.children).forEach(ch => {
        const x = parseFloat(ch.style.left) || 0, y = parseFloat(ch.style.top) || 0;
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + (ch.offsetWidth || 0));
        maxY = Math.max(maxY, y + (ch.offsetHeight || 0));
      });
      if (!isFinite(minX)) return;
      const ox = parseFloat(g.style.left) || 0, oy = parseFloat(g.style.top) || 0;
      const dx = minX < 0 ? minX : 0, dy = minY < 0 ? minY : 0;
      if (dx || dy) {
        Array.from(content.children).forEach(ch => {
          ch.style.left = ((parseFloat(ch.style.left) || 0) - dx) + 'px';
          ch.style.top = ((parseFloat(ch.style.top) || 0) - dy) + 'px';
        });
      }
      g.style.left = (ox + dx) + 'px';
      g.style.top = (oy + dy) + 'px';
      g.style.width = (maxX - Math.min(0, minX)) + 'px';
      g.style.height = (maxY - Math.min(0, minY)) + 'px';
    }
    function addDiagramBranch(side, gEl) {
      const g = gEl || (state.selectedId ? document.getElementById(state.selectedId) : null);
      if (!g || g.dataset.diagram !== '1') return;
      const content = g.querySelector('.group-content');
      if (!content) return;
      const dark = !document.body.classList.contains('theme-light');
      const ink = dark ? '#e4e4e7' : '#171a21';
      const center = content.querySelector('[data-diagram-role="center"]');
      if (!center) return;
      const dir = side === 'right' ? 1 : -1;
      const cl = parseFloat(center.style.left) || 0, ct = parseFloat(center.style.top) || 0;
      const cww = center.offsetWidth || 200, chh = center.offsetHeight || 30;
      const edgeX = dir > 0 ? cl + cww : cl;
      const midY = ct + chh / 2;
      const branches = Array.from(content.querySelectorAll('[data-diagram-role="branch"]'));
      const sameSide = branches.filter(b => dir > 0 ? (parseFloat(b.style.left) || 0) > cl : (parseFloat(b.style.left) || 0) < cl);
      let relY;
      if (sameSide.length) {
        let maxB = -Infinity;
        sameSide.forEach(b => { maxB = Math.max(maxB, (parseFloat(b.style.top) || 0) + (b.offsetHeight || 28)); });
        relY = maxB + 20;
      } else {
        relY = midY - 14;
      }
      const branchW = 150;
      const relX = dir > 0 ? edgeX + 130 : edgeX - 130 - branchW;
      const el = document.createElement('div');
      el.id = 'el-' + createId();
      el.className = 'board-item';
      el.style.left = relX + 'px';
      el.style.top = relY + 'px';
      el.dataset.layerType = 'text';
      el.dataset.layerName = createLayerName('text');
      el.dataset.diagramChild = '1';
      el.dataset.diagramRole = 'branch';
      const resizer = document.createElement('div');
      resizer.className = 'resizer';
      el.appendChild(resizer);
      const t = document.createElement('div');
      t.className = 'board-text';
      t.contentEditable = true;
      t.innerText = 'New idea';
      t.style.fontSize = '20px';
      t.style.fontWeight = '500';
      t.style.color = ink;
      t.style.whiteSpace = 'nowrap';
      bindDiagramTextEdit(t);
      el.appendChild(t);
      content.appendChild(el);
      makeDraggable(el);
      makeResizable(el);
      const sx = edgeX, sy = midY;
      const exx = dir > 0 ? relX - 8 : relX + branchW + 8, eyy = relY + 14;
      const pad = 10;
      const minX = Math.min(sx, exx) - pad, minY = Math.min(sy, eyy) - pad;
      const w = Math.abs(exx - sx) + pad * 2, h = Math.abs(eyy - sy) + pad * 2;
      const f = n => +n.toFixed(2);
      const X = v => f(v - minX), Y = v => f(v - minY);
      const wpath = svgEl('path', {
        d: `M ${X(sx)} ${Y(sy)} C ${X(sx + dir * 110)} ${Y(sy)} ${X(exx - dir * 110)} ${Y(eyy)} ${X(exx)} ${Y(eyy)}`,
        fill: 'none', stroke: '#8a8f98', 'stroke-width': 3, 'stroke-linecap': 'round'
      });
      const wire = mountSVGObject([wpath], minX, minY, w, h, 'shape', createLayerName('shape') + ' · Connector');
      content.appendChild(wire);
      wire.dataset.diagramChild = '1';
      wire.dataset.diagramRole = 'wire';
      expandGroupToFit(g);
      selectElement(g.id);
      pushHistory();
      showToast(side === 'right' ? 'Branch added →' : '← Branch added');
    }

    // ── Brush cursor ring (shows real brush size, like Figma) ──
    let brushCursorEl = null;
    function ensureBrushCursor() {
      if (!brushCursorEl) {
        brushCursorEl = document.createElement('div');
        brushCursorEl.id = 'brush-cursor';
        document.body.appendChild(brushCursorEl);
      }
      return brushCursorEl;
    }
    function syncBoardCursor() {
      const ringActive = (state.tool === 'draw' && state.drawShape === 'pen') || state.tool === 'eraser';
      UI.board.style.cursor =
        state.tool === 'hand' ? 'grab' :
        state.tool === 'select' ? 'default' :
        ringActive ? 'none' :
        state.tool === 'draw' ? 'crosshair' : 'default';
      if (!ringActive && brushCursorEl) brushCursorEl.style.display = 'none';
    }
    function updateBrushCursor(cx, cy) {
      const penMode = state.tool === 'draw' && state.drawShape === 'pen';
      const eraserMode = state.tool === 'eraser';
      if (!penMode && !eraserMode) return;
      const el = ensureBrushCursor();
      const d = Math.max(8, eraserMode ? brushBaseSize() * 2 : brushBaseSize());
      el.style.display = 'block';
      el.style.width = d + 'px';
      el.style.height = d + 'px';
      el.style.left = cx + 'px';
      el.style.top = cy + 'px';
      el.style.borderColor = state.tool === 'eraser' ? '#f87171' : brushColor();
    }

    // ── Eraser: wipes stroke/shape objects precisely + bitmap layer ──
    let erasing = false, erasedAny = false, lastErase = null;
    let eraseCandidates = [], eraseBoxes = new Map();
    function eraserSize() { return (brushBaseSize() * 2) / state.zoom; }
    function beginEraseSession() {
      erasedAny = false;
      eraseCandidates = Array.from(UI.elements.children).filter(el =>
        el.dataset && (el.dataset.layerType === 'stroke' || el.dataset.layerType === 'shape'));
      eraseBoxes = new Map();
      eraseCandidates.forEach(el => {
        eraseBoxes.set(el, {
          x: parseFloat(el.style.left) || 0,
          y: parseFloat(el.style.top) || 0,
          w: el.offsetWidth || 0,
          h: el.offsetHeight || 0
        });
      });
    }
    function strokeHit(el, box, bx, by) {
      if (bx < box.x || bx > box.x + box.w || by < box.y || by > box.y + box.h) return false; // cheap reject
      const svg = el.querySelector('svg.vibey-stroke');
      const shape = svg && svg.firstElementChild;
      if (!shape || (typeof shape.isPointInStroke !== 'function' && typeof shape.isPointInFill !== 'function')) return true; // inside bbox
      try {
        const vb = svg.viewBox.baseVal;
        const lx = (bx - box.x) * (vb.width / (box.w || 1));
        const ly = (by - box.y) * (vb.height / (box.h || 1));
        const pt = new DOMPoint(lx, ly);
        if (typeof shape.isPointInStroke === 'function' && shape.isPointInStroke(pt)) return true;
        if (typeof shape.isPointInFill === 'function' && shape.isPointInFill(pt)) return true;
        return false;
      } catch (e) { return true; }
    }
    function eraseAt(bx, by) {
      for (let i = eraseCandidates.length - 1; i >= 0; i--) {
        const el = eraseCandidates[i];
        const box = eraseBoxes.get(el);
        if (!box) { eraseCandidates.splice(i, 1); continue; }
        if (strokeHit(el, box, bx, by)) {
          el.remove();
          eraseCandidates.splice(i, 1);
          eraseBoxes.delete(el);
          erasedAny = true;
          break;
        }
      }
      const ctx = UI.ctx;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(bx, by, eraserSize(), 0, 6.2832);
      ctx.fill();
      ctx.restore();
      erasedAny = true;
      lastErase = { x: bx, y: by };
    }
    function eraseTo(bx, by) {
      const from = lastErase || { x: bx, y: by };
      const step = Math.max(1, eraserSize() / 3);
      const dx = bx - from.x, dy = by - from.y;
      const n = Math.min(60, Math.floor(Math.hypot(dx, dy) / step));
      for (let i = 1; i <= n; i++) eraseAt(from.x + dx * i / n, from.y + dy * i / n);
      eraseAt(bx, by);
    }
    UI.board.addEventListener('pointermove', (e) => {
      if (!erasing || state.tool !== 'eraser') return;
      let pts = null;
      try {
        if (typeof e.getCoalescedEvents === 'function') {
          const evts = e.getCoalescedEvents();
          if (evts && evts.length > 1) pts = evts.map(ev => screenToBoard(ev.clientX, ev.clientY));
        }
      } catch (_) { /* fallback below */ }
      if (!pts) {
        const { x, y } = screenToBoard(e.clientX, e.clientY);
        pts = [{ x, y }];
      }
      for (const p of pts) eraseTo(p.x, p.y);
    });

    UI.board.addEventListener('mousedown', (e) => {
      if (e.target.closest('.toolbar-right, header, .side-panel, .zoom-nav, .modal-menu, #selection-frame, #dock, .text-toolbar, .shapes-menu, .sticky-menu, #penPopover')) return;
      if (e.button === 1) {
        e.preventDefault();
        state.isPanning = true;
        panSession = { startX: e.clientX, startY: e.clientY, panX: state.targetPanX, panY: state.targetPanY };
        UI.board.classList.add('panning');
        return;
      }
      const { x, y } = screenToBoard(e.clientX, e.clientY);
      if (state.tool === 'select') {
        if (!e.target.closest('.board-item')) {
          if (e.button !== 0) return;
          if (spaceDown) {
            state.isPanning = true;
            panSession = { startX: e.clientX, startY: e.clientY, panX: state.targetPanX, panY: state.targetPanY };
            UI.board.classList.add('panning');
            return;
          }
          marquee = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, base: e.shiftKey ? [...state.selectedIds] : [], el: ensureMarquee() };
          if (!e.shiftKey) selectElement(null);
          positionMarquee();
        }
      } else if (state.tool === 'hand') {
        selectElement(null);
        state.isPanning = true;
        panSession = { startX: e.clientX, startY: e.clientY, panX: state.targetPanX, panY: state.targetPanY };
        UI.board.classList.add('panning');
      } else if (state.tool === 'eraser') {
        if (e.button !== 0) return;
        erasing = true; beginEraseSession(); lastErase = { x, y };
        eraseAt(x, y);
      } else if (state.tool === 'text') {
        if (!e.target.closest('.board-item')) {
          addElement('text', '', x, y);
          updateTool('select');
        }
      } else if (state.tool === 'draw') {
        state.isDrawing = true;
        state.drawStart = { x, y };
        if (state.drawShape === 'pen') beginSmoothStroke(x, y);
        else setupBrushCtx();
      }
    });

    UI.board.addEventListener('mousemove', (e) => {
      state.mouseX = e.clientX; state.mouseY = e.clientY;
      updateBrushCursor(e.clientX, e.clientY);
      if (!state.isDrawing || state.tool !== 'draw' || state.drawShape === 'pen') return;
      const { x, y } = screenToBoard(e.clientX, e.clientY);
      const start = state.drawStart;
      if (state.drawShape === 'circle') {
        UI.pctx.clearRect(0, 0, UI.preview.width, UI.preview.height);
        UI.pctx.strokeStyle = brushColor(); UI.pctx.lineWidth = brushBaseSize() / state.zoom;
        const r = Math.sqrt(Math.pow(x - start.x, 2) + Math.pow(y - start.y, 2));
        UI.pctx.beginPath(); UI.pctx.arc(start.x, start.y, r, 0, Math.PI * 2); UI.pctx.stroke();
      } else {
        previewShape(state.drawShape, start.x, start.y, x, y);
      }
    });

    // High-frequency pen path: coalesced events = no gaps on fast moves
    UI.board.addEventListener('pointermove', (e) => {
      if (!state.isDrawing || state.tool !== 'draw' || state.drawShape !== 'pen' || !activeStroke) return;
      let pts = null;
      try {
        if (typeof e.getCoalescedEvents === 'function') {
          const evts = e.getCoalescedEvents();
          if (evts && evts.length > 1) pts = evts.map(ev => screenToBoard(ev.clientX, ev.clientY));
        }
      } catch (_) { /* fallback below */ }
      if (!pts) {
        const { x, y } = screenToBoard(e.clientX, e.clientY);
        pts = [{ x, y }];
      }
      for (const p of pts) pushSmoothPoint(p.x, p.y);
    });
    UI.board.addEventListener('mouseleave', () => {
      if (brushCursorEl) brushCursorEl.style.display = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (marquee) {
        marquee.x1 = e.clientX; marquee.y1 = e.clientY;
        positionMarquee();
        updateMarqueeSelection();
        return;
      }
      if (!state.isPanning || !panSession) return;
      state.targetPanX = panSession.panX + (e.clientX - panSession.startX);
      state.targetPanY = panSession.panY + (e.clientY - panSession.startY);
      queueTransformRender();
    });

    window.addEventListener('mouseup', (e) => {
      if (pendingNodeSelect) {
        const p = pendingNodeSelect;
        pendingNodeSelect = null;
        if (e && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6 && document.getElementById(p.id)) selectElement(p.id, !!(e && (e.ctrlKey || e.metaKey)));
      }
      if (marquee) cancelMarquee(false);
      if (state.isDrawing) {
        if (state.drawShape !== 'pen') {
           const { x, y } = screenToBoard(state.mouseX, state.mouseY);
           const start = state.drawStart;
           UI.pctx.clearRect(0, 0, UI.preview.width, UI.preview.height);
           // Click without drag: no shape, no history entry
           if (Math.hypot(x - start.x, y - start.y) * state.zoom < 6) {
             state.isDrawing = false;
             return;
           }
           if (state.drawShape === 'circle') {
             const r = Math.sqrt(Math.pow(x - start.x, 2) + Math.pow(y - start.y, 2));
             commitShapeAsObject('oval', start.x - r, start.y - r, start.x + r, start.y + r);
           } else {
             commitShapeAsObject(state.drawShape, start.x, start.y, x, y);
           }
        } else {
          endSmoothStroke();
        }
        state.isDrawing = false; saveDrawing(); pushHistory();
      }
      if (state.isPanning) { state.isPanning = false; panSession = null; UI.board.classList.remove('panning'); }
      if (erasing) {
        erasing = false; lastErase = null;
        if (erasedAny) { erasedAny = false; selectElement(null); saveDrawing(); pushHistory(); showToast('Erased'); }
      }
    });

    UI.board.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) updateZoom(-e.deltaY * 0.0015, e.clientX, e.clientY);
      else panBoard(-e.deltaX, -e.deltaY);
    }, { passive: false });

    function renderQueuePanel(images, texts) {
      images = images || [];
      texts = texts || [];
      const list = document.getElementById('queueList');
      const count = document.getElementById('queueCount');
      if (count) count.textContent = images.length + texts.length;
      list.innerHTML = (images.length === 0 && texts.length === 0) ? '<p class="text-[11px] text-slate-600 italic text-center py-20">Queue is empty.</p>' : '';
      images.forEach((url) => {
        const item = document.createElement('div'); item.className = 'queue-item';
        const img = document.createElement('img'); img.src = url;
        const overlay = document.createElement('div'); overlay.className = 'add-overlay';
        overlay.innerHTML = '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M12 6v12M6 12h12"/></svg>';
        item.appendChild(img); item.appendChild(overlay);
        item.addEventListener('click', () => {
          const pos = getNextPlacement(280, 200);
          addElement('image', url, pos.x, pos.y);
          showToast('Image added.');
        });
        list.appendChild(item);
      });
      texts.forEach((t) => {
        const item = document.createElement('div'); item.className = 'queue-item queue-text';
        const p = document.createElement('p'); p.className = 'queue-text-body';
        p.textContent = (t.text || '').slice(0, 140);
        const overlay = document.createElement('div'); overlay.className = 'add-overlay';
        overlay.innerHTML = '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M12 6v12M6 12h12"/></svg>';
        item.appendChild(p); item.appendChild(overlay);
        item.addEventListener('click', () => {
          const pos = getNextPlacement(280, 200);
          addElement('text', t.text, pos.x, pos.y);
          showToast('Text added.');
        });
        list.appendChild(item);
      });
    }

    function loadQueue() {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const refresh = () => {
          chrome.storage.local.get(['moodboardImages', 'moodboardTexts'], (r) => {
            renderQueuePanel((r && r.moodboardImages) || [], (r && r.moodboardTexts) || []);
          });
        };
        refresh();
        chrome.storage.onChanged.addListener(c => { if (c.moodboardImages || c.moodboardTexts) refresh(); });
      }
    }
    loadQueue();

    function updateLayersPanel() {
      const list = document.getElementById('layersList');
      const count = document.getElementById('layersCount');
      if (!list) return;
      const items = Array.from(UI.elements.children).reverse();
      if (count) count.textContent = items.length + 1;
      
      let html = `<div class="layer-item ${state.selectedSpecialLayer === 'drawing' ? 'active' : ''}" onclick="selectDrawingLayer()">
        <span class="layer-name">Drawing Layer</span>
      </div>`;
      
      items.forEach(el => {
        const hidden = el.style.display === 'none';
        const eye = hidden
          ? '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6C3.8 8.3 2 12 2 12s3.5 7 10 7c1.5 0 2.9-.4 4.1-.9"/></svg>'
          : '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
        html += `<div class="layer-item ${state.selectedIds.includes(el.id) ? 'active' : ''}" onclick="selectElement('${el.id}')">
          <span class="layer-name">${el.dataset.layerName || 'Layer'}</span>
          <span class="layer-reorder">
            <button class="icon-btn" title="${hidden ? 'Show layer' : 'Hide layer'}" onclick="event.stopPropagation(); toggleLayerVisibility('${el.id}')">${eye}</button>
            <button class="icon-btn" title="Delete layer" onclick="event.stopPropagation(); deleteLayer('${el.id}')">×</button>
          </span>
        </div>`;
      });
      list.innerHTML = html;
    }

    function moveLayerPosition(direction) {
      if (!state.selectedId) return;
      const target = document.getElementById(state.selectedId);
      if (!target) return;
      if (direction === 'front') UI.elements.appendChild(target);
      else if (direction === 'back') UI.elements.prepend(target);
      syncElementStack(); updateLayersPanel(); pushHistory();
    }

    function deleteLayer(id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.remove();
      selectElement(null);
      pushHistory();
      showToast('Layer deleted');
    }

    function toggleLayerVisibility(id) {
      const el = document.getElementById(id);
      if (!el) return;
      const hidden = el.style.display === 'none';
      el.style.display = hidden ? '' : 'none';
      if (!hidden) selectElement(null);
      else updateLayersPanel();
      pushHistory();
      showToast(hidden ? 'Layer shown' : 'Layer hidden');
    }

    function bindLayersPanelEvents() {
       // Panel events handled via inline onclick for simplicity in this version
    }

    function closeAllPanels(exceptId) {
      document.querySelectorAll('.side-panel.visible').forEach(p => {
        if (p.id !== exceptId) p.classList.remove('visible');
      });
      document.querySelectorAll('.modal-menu.visible').forEach(m => {
        if (m.id !== exceptId) m.classList.remove('visible');
      });
      document.querySelectorAll('.shapes-menu.visible').forEach(m => {
        if (m.id !== exceptId) m.classList.remove('visible');
      });
      document.querySelectorAll('.sticky-menu.visible').forEach(m => {
        if (m.id !== exceptId) m.classList.remove('visible');
      });
    }

    // ── Sticky notes (Miro-style) ──
    function stickyLuminance(hex) {
      const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
      if (!m) return 1;
      const n = parseInt(m[1], 16);
      return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    }
    function stickyTextColor(bg) {
      return stickyLuminance(bg) < 0.5 ? '#ffffff' : '#1a1d21';
    }
    function addSticky(color, x, y) {
      const el = document.createElement('div');
      el.id = 'el-' + createId();
      el.className = 'board-item sticky-note';
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.width = '220px';
      el.style.height = '220px';
      el.style.background = color;
      el.dataset.color = color;
      el.dataset.layerType = 'sticky';
      el.dataset.layerName = createLayerName('sticky');
      const resizer = document.createElement('div');
      resizer.className = 'resizer';
      el.appendChild(resizer);
      const txt = document.createElement('div');
      txt.className = 'sticky-text';
      txt.contentEditable = true;
      txt.style.fontSize = '20px';
      txt.style.color = stickyTextColor(color);
      el.appendChild(txt);
      UI.elements.appendChild(el);
      syncElementStack();
      makeDraggable(el);
      makeResizable(el);
      selectElement(el.id);
      updateLayersPanel();
      pushHistory();
      setTimeout(() => txt.focus(), 50);
      return el;
    }
    function stackSelectedStickies() {
      const sticks = state.selectedIds
        .map(id => document.getElementById(id))
        .filter(el => el && el.dataset.layerType === 'sticky');
      if (sticks.length < 2) { showToast('Select 2+ sticky notes to stack'); return; }
      const gap = 16;
      const cols = Math.ceil(Math.sqrt(sticks.length));
      const x0 = parseFloat(sticks[0].style.left) || 0;
      const y0 = parseFloat(sticks[0].style.top) || 0;
      const w = sticks[0].offsetWidth || 220, h = sticks[0].offsetHeight || 220;
      sticks.forEach((el, i) => {
        el.style.left = (x0 + (i % cols) * (w + gap)) + 'px';
        el.style.top = (y0 + Math.floor(i / cols) * (h + gap)) + 'px';
      });
      updateSelectionFrame();
      positionTextToolbar();
      pushHistory();
      showToast('Stacked ' + sticks.length + ' notes');
    }
    function drawStickyExport(ctx, el, left, top, width, height) {
      const txt = el.querySelector('.sticky-text');
      ctx.fillStyle = el.style.background || '#FFF7AE';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(left, top, width, height, 6);
      else ctx.rect(left, top, width, height);
      ctx.fill();
      if (!txt) return;
      const fs = parseInt(txt.style.fontSize) || 20;
      const align = txt.style.textAlign || 'left';
      ctx.fillStyle = txt.style.color || '#1a1d21';
      ctx.font = `500 ${fs}px Inter, 'Segoe UI', sans-serif`;
      ctx.textBaseline = 'top';
      const pad = 14;
      const words = (txt.innerText || '').split(/\s+/).filter(Boolean);
      const lines = [];
      let line = '';
      const maxW = width - pad * 2;
      words.forEach(word => {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
        else line = test;
      });
      if (line) lines.push(line);
      lines.forEach((ln, idx) => {
        ctx.textAlign = align === 'center' ? 'center' : (align === 'right' ? 'right' : 'left');
        const tx = align === 'center' ? left + width / 2 : (align === 'right' ? left + width - pad : left + pad);
        ctx.fillText(ln, tx, top + pad + idx * fs * 1.4);
      });
      ctx.textAlign = 'left';
    }
    function syncStickySwatches() {
      const sel = state.selectedId ? document.getElementById(state.selectedId) : null;
      const cur = sel && sel.dataset.layerType === 'sticky' ? (sel.dataset.color || '').toLowerCase() : null;
      document.querySelectorAll('.sticky-swatch').forEach(sw => {
        sw.classList.toggle('active', !!cur && sw.dataset.color.toLowerCase() === cur);
      });
    }

    // ── Undo / Redo history (DOM + drawing snapshots) ──
    let historyStack = [];
    let historyIndex = -1;
    let isRestoringHistory = false;
    function snapshotBoard() {
      return { html: UI.elements.innerHTML, drawing: drawingDataURL };
    }
    function pushHistory() {
      if (isRestoringHistory) return;
      historyStack = historyStack.slice(0, historyIndex + 1);
      historyStack.push(snapshotBoard());
      if (historyStack.length > 50) historyStack.shift();
      historyIndex = historyStack.length - 1;
      scheduleAutosave();
    }
    function restoreSnapshot(snap) {
      isRestoringHistory = true;
      try {
        UI.elements.innerHTML = snap.html || '';
        drawingDataURL = snap.drawing || null;
        const ctx = UI.ctx;
        ctx.clearRect(0, 0, UI.canvas.width, UI.canvas.height);
        if (drawingDataURL) {
          const img = new Image();
          img.onload = () => ctx.drawImage(img, 0, 0);
          img.src = drawingDataURL;
        }
        UI.elements.querySelectorAll('.board-item').forEach(el => {
          makeDraggable(el);
          makeResizable(el);
          el.querySelectorAll('.board-text').forEach(t => { if (t.closest('.group-layer')) bindDiagramTextEdit(t); });
        });
        syncElementStack();
        selectElement(null);
      } finally {
        isRestoringHistory = false;
      }
    }
    function undo() {
      if (historyIndex <= 0) { showToast('Nothing to undo'); return; }
      historyIndex--;
      restoreSnapshot(historyStack[historyIndex]);
      scheduleAutosave();
      showToast('Undone');
    }
    function redo() {
      if (historyIndex >= historyStack.length - 1) { showToast('Nothing to redo'); return; }
      historyIndex++;
      restoreSnapshot(historyStack[historyIndex]);
      scheduleAutosave();
      showToast('Redone');
    }
    function deleteSelected() {
      if (!state.selectedIds.length) return;
      state.selectedIds.forEach(id => document.getElementById(id)?.remove());
      selectElement(null);
      pushHistory();
    }
    function duplicateSelected() {
      const ids = state.selectedIds.length ? [...state.selectedIds] : (state.selectedId ? [state.selectedId] : []);
      if (!ids.length) { showToast('Select an item to duplicate (Ctrl+D)'); return; }
      const newIds = [];
      ids.forEach(id => {
        const t = document.getElementById(id);
        if (!t) return;
        const c = t.cloneNode(true);
        const nid = 'el-' + createId();
        c.id = nid;
        c.style.left = ((parseFloat(t.style.left) || 0) + 24) + 'px';
        c.style.top = ((parseFloat(t.style.top) || 0) + 24) + 'px';
        c.classList.remove('selected');
        // Fresh IDs for the whole subtree (cloned groups carry duplicate IDs otherwise)
        c.querySelectorAll('[id]').forEach((kid) => { kid.id = 'el-' + createId(); });
        c.querySelectorAll('.board-item.selected').forEach((kid) => kid.classList.remove('selected'));
        UI.elements.appendChild(c);
        syncElementStack();
        makeDraggable(c);
        makeResizable(c);
        // Clones lose listeners: rebind every nested item too
        c.querySelectorAll('.board-item').forEach((kid) => {
          makeDraggable(kid); makeResizable(kid);
          kid.querySelectorAll('.board-text').forEach(t => { if (t.closest('.group-layer')) bindDiagramTextEdit(t); });
        });
        newIds.push(nid);
      });
      if (newIds.length) {
        selectElement(null);
        selectElement(newIds[newIds.length - 1]);
        state.selectedIds = newIds;
        state.selectedId = newIds[newIds.length - 1];
        updateLayersPanel();
        pushHistory();
        showToast('Duplicated');
      }
    }
    const SHAPE_NAMES = { pen: 'Pen', line: 'Line', arrow: 'Arrow', elbow: 'Elbow arrow', block: 'Block arrow', rect: 'Rectangle', oval: 'Oval', rhombus: 'Rhombus', triangle: 'Triangle', tridown: 'Inverted triangle', cylinder: 'Cylinder', divider: 'Divider', circle: 'Circle' };
    function syncPenPopover() {
      const pp = document.getElementById('penPopover');
      if (!pp) return;
      const show = state.tool === 'draw' && state.drawShape === 'pen';
      pp.classList.toggle('visible', show);
      if (show) {
        document.getElementById('penSize').value = document.getElementById('brushSize').value;
        const cur = (document.getElementById('brushColor').value || '').toLowerCase();
        document.querySelectorAll('.pen-swatch').forEach(s => s.classList.toggle('active', s.dataset.color.toLowerCase() === cur));
      }
      const dot = document.getElementById('shapePenDotColor');
      if (dot) dot.style.background = document.getElementById('brushColor').value || '#8b89ff';
    }
    function setDrawShape(shape) {
      state.drawShape = shape;
      if (state.tool !== 'draw') updateTool('draw');
      else syncBoardCursor();
      document.querySelectorAll('[data-shape]').forEach(b => b.classList.toggle('active', b.dataset.shape === shape));
      document.querySelectorAll('.shape-cell[data-shape]').forEach(b => b.classList.toggle('active', b.dataset.shape === shape));
      document.querySelectorAll('#shapesBtn, #dockShapesBtn').forEach(sBtn => {
        sBtn.classList.toggle('active', shape !== 'pen');
      });
      syncPenPopover();
      showToast((SHAPE_NAMES[shape] || shape) + ' — drag on canvas');
    }

    const THEMES = ['dark', 'light', 'glass'];
    function getSavedTheme() {
      try { return localStorage.getItem('vibeyTheme') || 'dark'; }
      catch (e) { return 'dark'; }
    }
    function applyThemeClass(name) {
      if (!THEMES.includes(name)) name = 'dark';
      document.body.classList.remove('theme-dark', 'theme-light', 'theme-glass');
      if (name !== 'dark') document.body.classList.add('theme-' + name);
    }
    function setTheme(name) {
      if (!THEMES.includes(name)) name = 'dark';
      applyThemeClass(name);
      try { localStorage.setItem('vibeyTheme', name); } catch (e) {}
      if (typeof chrome !== 'undefined' && chrome.storage) {
        try { chrome.storage.local.set({ vibeyTheme: name }); } catch (e) {}
      }
      drawDots();
      showToast(name === 'light' ? 'Light mode' : name === 'glass' ? 'Glass mode' : 'Dark mode');
    }
    function toggleTheme() {
      const cur = document.body.classList.contains('theme-light') ? 'light'
        : document.body.classList.contains('theme-glass') ? 'glass' : 'dark';
      setTheme(cur === 'dark' ? 'light' : 'dark');
    }
    function applyStoredTheme() {
      applyThemeClass(getSavedTheme());
      if (typeof chrome !== 'undefined' && chrome.storage) {
        try {
          chrome.storage.local.get(['vibeyTheme'], (r) => {
            if (r && r.vibeyTheme && THEMES.includes(r.vibeyTheme)) {
              applyThemeClass(r.vibeyTheme);
              try { localStorage.setItem('vibeyTheme', r.vibeyTheme); } catch (e) {}
            }
          });
        } catch (e) {}
      }
    }

    // ── Board autosave: survive refresh, warn when storage is too small ──
    const AUTOSAVE_KEY = 'vibeyAutosave';
    let autosaveTimer = null;
    let autosaveWarned = false;
    function setSaveStatus(mode) {
      const el = document.getElementById('saveStatus');
      if (!el) return;
      el.classList.remove('ok', 'bad');
      if (mode === 'saving') { el.textContent = 'Saving…'; }
      else if (mode === 'saved') {
        el.classList.add('ok');
        const d = new Date();
        el.textContent = 'Saved ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      }
      else if (mode === 'failed') { el.classList.add('bad'); el.textContent = 'Save failed'; }
      else if (mode === 'restored') { el.classList.add('ok'); el.textContent = 'Restored'; }
      else { el.textContent = ''; }
    }
    function serializeBoard() {
      return {
        app: 'vibey',
        version: 1,
        savedAt: Date.now(),
        title: state.title,
        theme: document.body.classList.contains('theme-light') ? 'light'
          : (document.body.classList.contains('theme-glass') ? 'glass' : 'dark'),
        zoom: state.targetZoom,
        panX: state.targetPanX,
        panY: state.targetPanY,
        elements: UI.elements.innerHTML,
        drawing: drawingDataURL
      };
    }
    function restoreBoardData(data) {
      if (!data || typeof data !== 'object' || typeof data.elements !== 'string') {
        throw new Error('Bad board data');
      }
      restoreSnapshot({ html: data.elements, drawing: data.drawing || null });
      if (typeof data.title === 'string' && data.title) {
        state.title = data.title;
        const t = document.getElementById('canvasTitle');
        if (t) t.innerText = data.title;
        document.title = 'Vibey - ' + data.title;
      }
      if (data.theme) applyThemeClass(data.theme);
      if (typeof data.zoom === 'number' && isFinite(data.zoom)) {
        state.zoom = state.targetZoom = Math.max(0.05, Math.min(10, data.zoom));
        state.panX = state.targetPanX = Number(data.panX) || 0;
        state.panY = state.targetPanY = Number(data.panY) || 0;
        queueTransformRender();
      }
      pushHistory();
    }
    // ── Board file storage: OPFS device files → chrome.storage → localStorage ──
    const AUTOSAVE_FILE = 'board.vibey.json';
    async function opfsWriteText(name, text) {
      if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.getDirectory) {
        throw new Error('no OPFS');
      }
      const dir = await navigator.storage.getDirectory();
      const handle = await dir.getFileHandle(name, { create: true });
      const w = await handle.createWritable();
      await w.write(text);
      await w.close();
    }
    async function opfsReadText(name) {
      try {
        if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.getDirectory) return null;
        const dir = await navigator.storage.getDirectory();
        const handle = await dir.getFileHandle(name, { create: false });
        const file = await handle.getFile();
        return await file.text();
      } catch (e) { return null; }
    }
    function scheduleAutosave() {
      if (autosaveTimer) clearTimeout(autosaveTimer);
      setSaveStatus('saving');
      autosaveTimer = setTimeout(async () => {
        autosaveTimer = null;
        let payload;
        try { payload = JSON.stringify(serializeBoard()); }
        catch (e) { setSaveStatus('failed'); return; }
        const onOk = () => setSaveStatus('saved');
        const onFail = () => {
          setSaveStatus('failed');
          if (!autosaveWarned) { autosaveWarned = true; showToast('Autosave failed — board too large for storage'); }
        };
        try { await opfsWriteText(AUTOSAVE_FILE, payload); onOk(); return; }
        catch (e) { /* fall through to legacy backends */ }
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          try {
            chrome.storage.local.set({ [AUTOSAVE_KEY]: payload }, () => {
              if (chrome.runtime && chrome.runtime.lastError) onFail();
              else onOk();
            });
          } catch (e) { onFail(); }
        } else {
          try { localStorage.setItem(AUTOSAVE_KEY, payload); onOk(); }
          catch (e) { onFail(); }
        }
      }, 1000);
    }
    function loadAutosave() {
      const done = (payload) => {
        if (!payload) return;
        let data;
        try { data = JSON.parse(payload); }
        catch (e) { return; }
        if (!data || !data.elements) return;
        if (UI.elements.children.length > 0 || drawingDataURL) return;
        try {
          restoreBoardData(data);
          setSaveStatus('restored');
          showToast('Board restored');
        } catch (e) { /* corrupt — start fresh */ }
      };
      (async () => {
        const fromFile = await opfsReadText(AUTOSAVE_FILE);
        if (fromFile) { done(fromFile); return; }
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          try { chrome.storage.local.get([AUTOSAVE_KEY], (r) => done(r && r[AUTOSAVE_KEY])); }
          catch (e) {}
        } else {
          try { done(localStorage.getItem(AUTOSAVE_KEY)); } catch (e) {}
        }
      })();
    }

    // Sticky notes bindings
    document.getElementById('stickyBtn').onclick = (e) => { closeAllPanels('stickyMenu'); document.getElementById('stickyMenu').classList.toggle('visible'); hidePenPopover(); e.stopPropagation(); };
    document.querySelectorAll('.sticky-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        const color = sw.dataset.color;
        const sel = state.selectedId ? document.getElementById(state.selectedId) : null;
        if (sel && sel.dataset.layerType === 'sticky') {
          sel.style.background = color;
          sel.dataset.color = color;
          const txt = sel.querySelector('.sticky-text');
          if (txt) {
            txt.style.color = stickyTextColor(color);
            syncTextToolbar(txt);
          }
          syncStickySwatches();
          pushHistory();
        } else {
          const pos = getNextPlacement(220, 220);
          addSticky(color, pos.x, pos.y);
          syncStickySwatches();
        }
      });
    });
    document.getElementById('stickyGenerateBtn').onclick = () => showToast('AI Generate coming soon');
    document.getElementById('stickyStackBtn').onclick = () => stackSelectedStickies();
    document.getElementById('shapeDiagramBtn').onclick = () => {
      document.getElementById('shapesMenu').classList.remove('visible');
      addDiagram();
    };
    document.getElementById('diagramAddLeft').onclick = () => addDiagramBranch('left');
    document.getElementById('diagramAddRight').onclick = () => addDiagramBranch('right');
    document.getElementById('nodeAddBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      const wrap = document.getElementById('nodeButtons');
      const n = wrap && wrap.dataset.node ? document.getElementById(wrap.dataset.node) : null;
      if (!n) return;
      const g = n.closest('.group-layer');
      if (!g) return;
      addDiagramBranch(nodeBranchSide(n, g), g);
    });
    document.getElementById('nodeDoneBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      const wrap = document.getElementById('nodeButtons');
      if (wrap) delete wrap.dataset.node;
      selectElement(null);
    });

    // Shapes menu (toolbar button)
    document.getElementById('shapesBtn').onclick = (e) => { closeAllPanels('shapesMenu'); document.getElementById('shapesMenu').classList.toggle('visible'); hidePenPopover(); e.stopPropagation(); };
    document.querySelectorAll('.shape-cell[data-shape]').forEach(item => {
      item.addEventListener('click', () => {
        setDrawShape(item.dataset.shape);
        document.getElementById('shapesMenu').classList.remove('visible');
      });
    });
    document.getElementById('shapePenDot').addEventListener('click', () => {
      setDrawShape('pen');
      document.getElementById('shapesMenu').classList.remove('visible');
    });

    // Header Actions
    document.getElementById('menuBtn').onclick = () => { closeAllPanels('menuPanel'); document.getElementById('menuPanel').classList.toggle('visible'); };
    document.getElementById('shareBtn').onclick = (e) => { document.getElementById('shareMenu').classList.toggle('visible'); e.stopPropagation(); };
    document.getElementById('shareEmail').onclick = () => {
      const n = UI.elements.children.length;
      const subject = encodeURIComponent('Vibey board: ' + (state.title || 'Untitled'));
      const body = encodeURIComponent(
        'Board: ' + (state.title || 'Untitled') + '\nItems: ' + n +
        '\nExported: ' + new Date().toLocaleString() +
        '\n\nTip: export the board as PNG from Vibey and attach it to this email.'
      );
      const a = document.createElement('a');
      a.href = 'mailto:?subject=' + subject + '&body=' + body;
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
    document.getElementById('shareClearBoard').onclick = () => { if (confirm('Clear board?')) { UI.elements.innerHTML = ''; selectElement(null); updateLayersPanel(); pushHistory(); } };

    // --- REFINED EXPORT ENGINE ---
    function downloadDataUrl(filename, dataUrl) {
      const link = document.createElement('a');
      link.download = filename; link.href = dataUrl; link.click();
    }

    function getExportBounds() {
      if (state.exportMatchView) {
        return {
          x: -state.panX / state.zoom,
          y: -state.panY / state.zoom,
          width: window.innerWidth / state.zoom,
          height: window.innerHeight / state.zoom
        };
      }

      const items = Array.from(UI.elements.querySelectorAll('.board-item')).filter(el => el.style.display !== 'none' && el.offsetWidth > 0);
      if (items.length === 0 && !drawingDataURL) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      items.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const { x, y } = screenToBoard(rect.left, rect.top);
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + rect.width / state.zoom);
        maxY = Math.max(maxY, y + rect.height / state.zoom);
      });
      const padding = 60;
      return { x: minX - padding, y: minY - padding, width: (maxX - minX) + padding * 2, height: (maxY - minY) + padding * 2 };
    }

    async function loadImage(src) {
      return new Promise((resolve, reject) => {
        const img = new Image(); img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img); img.onerror = reject; img.src = src;
      });
    }

    // CORS-clean reload: sites that refuse embedding are skipped instead of
    // tainting (and killing) the whole export.
    function loadCleanImage(src, timeoutMs) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs || 8000);
        img.onload = () => { clearTimeout(timer); resolve(img); };
        img.onerror = () => { clearTimeout(timer); reject(new Error('blocked')); };
        img.crossOrigin = 'anonymous';
        img.src = src;
      });
    }

    async function preloadCleanImages(assets) {
      const map = new Map();
      let skipped = 0;
      await Promise.all(assets.map(async (el) => {
        if (el.style.display === 'none') return;
        const img = el.querySelector('img');
        if (!img) return;
        try {
          map.set(el, await loadCleanImage(img.currentSrc || img.src));
        } catch (e) { skipped++; }
      }));
      return { map, skipped };
    }

    let isExporting = false;
    let exportCancelled = false;

    // Frame lookup shared by GIF + video exports
    function frameAtTime(gifEntry, timeMs) {
      const totalMs = gifEntry.frames.reduce((s, f) => s + f.delay, 0) || 1;
      let t = timeMs % totalMs;
      for (const f of gifEntry.frames) {
        if (t < f.delay) return f.canvas;
        t -= f.delay;
      }
      return gifEntry.frames[gifEntry.frames.length - 1].canvas;
    }

    async function collectGifElements(assets) {
      const gifElements = []; // { el, frames: [{canvas, delay}] }
      for (const el of assets) {
        const img = el.querySelector('img');
        if (!img) continue;
        const src = img.src || '';
        const isGIF = src.startsWith('data:image/gif') || /\.gif(\?|$)/i.test(src);
        if (!isGIF) continue;
        const frames = await extractGIFFrames(src);
        if (frames && frames.length > 1) gifElements.push({ el, img, frames });
      }
      return gifElements;
    }

    function longestGifLoopMs(gifElements) {
      if (!gifElements.length) return 0;
      return Math.max(...gifElements.map(g => g.frames.reduce((s, f) => s + f.delay, 0)));
    }

    // Strokes are recorded in board units on a 2x backing store:
    // half size maps canvas pixels back to board units in any export ctx.
    async function drawDrawingLayer(ctx, bounds) {
      if (!drawingDataURL) return;
      const draw = await loadImage(drawingDataURL);
      ctx.drawImage(draw, -bounds.x, -bounds.y, UI.canvas.width / 2, UI.canvas.height / 2);
    }

    // Export text with its real size/color/alignment instead of a fixed style
    function textExportStyle(txt) {
      const cs = (typeof getComputedStyle === 'function') ? getComputedStyle(txt) : null;
      const pick = (inline, computed) => (inline && inline.trim()) || computed || '';
      const size = parseFloat(pick(txt.style.fontSize, cs && cs.fontSize)) || 24;
      const color = pick(txt.style.color, cs && cs.color) || '#ffffff';
      const weight = pick(txt.style.fontWeight, cs && cs.fontWeight) || '600';
      const tstyle = pick(txt.style.fontStyle, cs && cs.fontStyle);
      const family = (pick(txt.style.fontFamily, cs && cs.fontFamily) || 'Segoe UI').split(',')[0].replace(/["']/g, '').trim() || 'Segoe UI';
      const align = pick(txt.style.textAlign, cs && cs.textAlign);
      return {
        size, color,
        font: (tstyle && tstyle !== 'normal' ? tstyle + ' ' : '') + weight + ' ' + size + 'px "' + family + '"',
        align: (align === 'center' || align === 'right') ? align : 'left'
      };
    }
    function drawExportText(ctx, txt, x, y, w) {
      const st = textExportStyle(txt);
      ctx.fillStyle = st.color;
      ctx.font = st.font;
      ctx.textBaseline = 'top';
      ctx.textAlign = st.align;
      const ax = st.align === 'center' ? x + w / 2 : (st.align === 'right' ? x + w - 8 : x + 8);
      const lh = st.size * 1.25;
      (txt.innerText || '').split('\n').forEach((line, idx) => ctx.fillText(line, ax, y + 8 + idx * lh));
      ctx.textAlign = 'left';
    }

    // Flatten groups for export: nested items paint at group offset.
    // (Painting the group div itself would stretch one child over the box.)
    function collectPaintItems() {
      const out = [];
      Array.from(UI.elements.children).forEach(el => {
        if (el.style.display === 'none') return;
        if (el.classList.contains('group-layer')) {
          const gx = parseFloat(el.style.left) || 0, gy = parseFloat(el.style.top) || 0;
          el.querySelectorAll('.board-item').forEach(ch => {
            if (ch.style.display === 'none') return;
            out.push({ el: ch, dx: gx, dy: gy });
          });
        } else {
          out.push({ el, dx: 0, dy: 0 });
        }
      });
      return out;
    }

    async function renderExportCanvas(format) {
      const bounds = getExportBounds();
      if (!bounds) throw new Error('Nothing to export.');
      // Cap size: uncapped huge boards can kill toDataURL
      const staticMaxDim = 1600;
      const renderScale = Math.max(0.5, Math.min(2, staticMaxDim / Math.max(bounds.width, bounds.height)));
      const canvas = document.createElement('canvas');
      canvas.width = bounds.width * renderScale; canvas.height = bounds.height * renderScale;
      const ctx = canvas.getContext('2d');
      ctx.scale(renderScale, renderScale);
      
      if (format === 'jpeg') { ctx.fillStyle = '#08080a'; ctx.fillRect(0, 0, bounds.width, bounds.height); }

      const paintItems = collectPaintItems();
      const { map: cleanImgs, skipped } = await preloadCleanImages(paintItems.map(p => p.el));
      for (const { el, dx, dy } of paintItems) {
        const left = (parseFloat(el.style.left) || 0) + dx - bounds.x;
        const top = (parseFloat(el.style.top) || 0) + dy - bounds.y;
        const width = el.offsetWidth || 280;
        const height = el.offsetHeight || 200;
        const img = el.querySelector('img');
        const video = el.querySelector('video');
        const txt = el.querySelector('.board-text');
        const sticky = el.querySelector('.sticky-text');
        const strokeSvg = el.querySelector('svg.vibey-stroke');

        if (img && cleanImgs.has(el)) ctx.drawImage(cleanImgs.get(el), left, top, width, height);
        else if (sticky) drawStickyExport(ctx, el, left, top, width, height);
        else if (strokeSvg) {
          try {
            const si = await rasterizeStrokeSVG(strokeSvg, width, height);
            ctx.drawImage(si, left, top, width, height);
          } catch (e) { /* skip broken stroke */ }
        }
        else if (video) ctx.drawImage(video, left, top, width, height);
        else if (txt) drawExportText(ctx, txt, left, top, width);
      }
      
      await drawDrawingLayer(ctx, bounds);

      const mimeMap = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
      let url;
      try {
        url = canvas.toDataURL(mimeMap[format] || 'image/png', 1.0);
      } catch (e) {
        throw new Error('Export blocked by page content (CORS). Try removing web videos.');
      }
      if (skipped) showToast('Exported (' + skipped + ' blocked image(s) skipped)');
      return url;
    }

    // ── GIF Frame Extractor ───────────────────────────────────────────
    async function extractGIFFrames(src) {
      // Strategy 1: ImageDecoder API (Chrome 94+) — works on data: URLs and
      // same-origin or CORS-enabled external URLs.
      if ('ImageDecoder' in window) {
        try {
          let blob;
          if (src.startsWith('data:')) {
            // data: URL → convert to blob directly
            const res = await fetch(src);
            blob = await res.blob();
          } else {
            // External URL → try with CORS
            const res = await fetch(src, { mode: 'cors' });
            blob = await res.blob();
          }
          const decoder = new ImageDecoder({ data: blob.stream(), type: 'image/gif' });
          await decoder.tracks.ready;
          const track = decoder.tracks.selectedTrack;
          const frameCount = track.frameCount;
          if (frameCount <= 1) { decoder.close(); return null; }
          const frames = [];
          for (let i = 0; i < frameCount; i++) {
            const { image, duration } = await decoder.decode({ frameIndex: i });
            const fc = document.createElement('canvas');
            fc.width = image.displayWidth;
            fc.height = image.displayHeight;
            fc.getContext('2d').drawImage(image, 0, 0);
            // duration from ImageDecoder is in microseconds
            frames.push({ canvas: fc, delay: Math.max((duration / 1000), 20) });
          }
          decoder.close();
          return frames.length > 1 ? frames : null;
        } catch (e) {
          // CORS blocked or API error — fall through to DOM sampling
        }
      }

      // Strategy 2: DOM sampling — attach the <img> to the document so the
      // browser actually runs the GIF animation, then sample via canvas.
      // Works for same-origin and data: URLs. CORS-blocked URLs will throw on
      // getImageData — we catch that and return null (treated as static image).
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const w = img.naturalWidth  || 100;
          const h = img.naturalHeight || 100;

          // Attach to DOM so browser animates it
          img.style.cssText = 'position:fixed;opacity:0;pointer-events:none;left:-9999px;top:-9999px';
          document.body.appendChild(img);

          const sampleCanvas = document.createElement('canvas');
          sampleCanvas.width  = w;
          sampleCanvas.height = h;
          const sctx = sampleCanvas.getContext('2d', { willReadFrequently: true });

          const frames  = [];
          const SAMPLE_MS = 40; // ~25fps sampling
          const DURATION_MS = 10000; // sample for up to 10s to catch slow GIFs
          const STABLE_MS = 2000; // stop early if nothing changed for 2s
          let lastHash  = null;
          let elapsed   = 0;
          let lastNew   = 0;

          const sample = () => {
            try {
              sctx.clearRect(0, 0, w, h);
              sctx.drawImage(img, 0, 0, w, h);
              // Fast hash: sample 1 pixel per 100 to detect changes
              const d = sctx.getImageData(0, 0, w, h).data;
              let hash = '';
              for (let i = 0; i < d.length; i += 400) hash += d[i] + ',' + d[i+1] + ',' + d[i+2] + '|';

              if (hash !== lastHash) {
                const fc = document.createElement('canvas');
                fc.width  = w;
                fc.height = h;
                fc.getContext('2d').drawImage(img, 0, 0, w, h);
                frames.push({ canvas: fc, delay: SAMPLE_MS });
                lastHash = hash;
                lastNew = elapsed;
              }
            } catch (e) {
              // CORS tainted canvas — can't read pixels, give up
              document.body.removeChild(img);
              resolve(null);
              return;
            }

            elapsed += SAMPLE_MS;
            if (elapsed < DURATION_MS && (elapsed - lastNew) < STABLE_MS) {
              setTimeout(sample, SAMPLE_MS);
            } else {
              document.body.removeChild(img);
              resolve(frames.length > 1 ? frames : null);
            }
          };

          setTimeout(sample, SAMPLE_MS);
        };
        img.onerror = () => resolve(null);
        // crossOrigin must be set BEFORE src
        img.crossOrigin = 'anonymous';
        img.src = src;
      });
    }

    async function exportBoard(format) {
      const btn = document.getElementById('exportBtn');
      if (!btn) return;
      if (isExporting) { showToast('Export already running'); return; }

      const assets = Array.from(UI.elements.querySelectorAll('.board-item'));
      const allDurations = assets.map(el => {
        const video = el.querySelector('video');
        return (video && !isNaN(video.duration)) ? video.duration : 0;
      });
      const maxDuration = Math.max(0, ...allDurations);
      const MAX_ALLOWED = 30;
      const exportDuration = (format === 'gif' || format === 'mp4') 
        ? (Math.min(maxDuration, MAX_ALLOWED) || 10) 
        : 0;

      showToast(`🎬 Starting ${format.toUpperCase()} Export (${exportDuration.toFixed(1)}s)... (Esc cancels)`);
      btn.classList.add('export-loading');
      isExporting = true;
      exportCancelled = false;
      selectElement(null);

      try {
        const bounds = getExportBounds();
        if (!bounds) throw new Error('Nothing to export (board is empty).');

        if (format === 'gif') {
          const gifExp = window.exports || {};
          const GIFEncoder  = gifExp.GIFEncoder;
          const quantize    = gifExp.quantize;
          const applyPalette = gifExp.applyPalette;

          if (typeof GIFEncoder !== 'function') {
            throw new Error('GIF engine failed to load. Try reloading the canvas.');
          }

          // ── Step 1: extract frames from any animated GIFs on the board ──
          showToast('🔍 Analysing GIFs on board…');
          const gifElements = await collectGifElements(assets);

          const hasAnimated = gifElements.length > 0;
          const hasVideos   = assets.some(el => el.querySelector('video'));

          // ── Step 2: calculate total frames & timing ──
          const fps        = 10;
          const frameDelay = 1000 / fps; // 100ms per frame
          let totalFrames  = 100; // default: always 10 seconds (10fps × 100 = 10s)

          if (!hasAnimated && !hasVideos) {
            totalFrames = 1; // static board: a single frame is enough
          } else if (hasAnimated && !hasVideos) {
            // Drive duration by the longest GIF loop, minimum 10s
            const longestLoopMs = longestGifLoopMs(gifElements);
            totalFrames = Math.max(Math.floor(Math.max(longestLoopMs, 10000) / frameDelay), 100);
          } else if (hasVideos) {
            totalFrames = Math.max(Math.floor(exportDuration * fps), 100);
          }

          showToast(`🎞️ Rendering ${totalFrames} frames…`);

          // ── Step 3: set up output canvas ──
          const maxDim = 800;
          let scale = 1;
          if (bounds.width > maxDim || bounds.height > maxDim) {
            scale = maxDim / Math.max(bounds.width, bounds.height);
          }
          const width  = Math.floor(bounds.width  * scale);
          const height = Math.floor(bounds.height * scale);
          const gif    = GIFEncoder();
          const captureCanvas = document.createElement('canvas');
          captureCanvas.width  = width;
          captureCanvas.height = height;
          const ctx = captureCanvas.getContext('2d');

          // Pre-raster pen strokes (SVG → image, once for all frames)
          const strokeImgs = new Map();
          const paintItems = collectPaintItems();
          for (const { el } of paintItems) {
            const svg = el.querySelector && el.querySelector('svg.vibey-stroke');
            if (!svg) continue;
            try {
              strokeImgs.set(el, await rasterizeStrokeSVG(svg, el.offsetWidth || 280, el.offsetHeight || 200));
            } catch (e) { /* skip broken stroke */ }
          }
          const { map: cleanImgs, skipped: skippedImgs } = await preloadCleanImages(paintItems.map(p => p.el));
          if (exportCancelled) {
            showToast('Export cancelled');
            btn.classList.remove('export-loading');
            return;
          }

          // ── Step 4: render each output frame ──
          const progressEvery = Math.max(1, Math.floor(totalFrames / 10));
          for (let i = 0; i < totalFrames; i++) {
            if (exportCancelled) {
              showToast('Export cancelled');
              btn.classList.remove('export-loading');
              return;
            }
            const timeMs = i * frameDelay;
            if (i % progressEvery === 0 || i === totalFrames - 1) showToast(`🎞️ Frame ${i + 1}/${totalFrames}`);

            // Seek videos if any
            if (hasVideos) {
              await Promise.all(assets.map(el => {
                const v = el.querySelector('video');
                if (!v) return;
                return new Promise(resolve => {
                  const onSeeked = () => {
                    v.removeEventListener('seeked', onSeeked);
                    requestAnimationFrame(() => setTimeout(resolve, 60));
                  };
                  v.addEventListener('seeked', onSeeked);
                  v.currentTime = ((timeMs / 1000) % (v.duration || 1)) + 0.001;
                  setTimeout(() => { v.removeEventListener('seeked', onSeeked); resolve(); }, 1200);
                });
              }));
              await new Promise(r => requestAnimationFrame(() => setTimeout(r, 20)));
            }

            // Draw frame
            ctx.fillStyle = '#08080a';
            ctx.fillRect(0, 0, width, height);
            ctx.save();
            ctx.scale(scale, scale);

            for (const { el, dx, dy } of paintItems) {
              const itemLeft = (parseFloat(el.style.left) || 0) + dx - bounds.x;
              const itemTop  = (parseFloat(el.style.top) || 0) + dy - bounds.y;
              const elW = el.offsetWidth  || 280;
              const elH = el.offsetHeight || 200;

              const video = el.querySelector('video');
              const txt   = el.querySelector('.board-text');

              // Check if this element is an animated GIF we decoded
              const strokeImg = strokeImgs.get(el);
              const stickyTxt = el.querySelector('.sticky-text');
              const gifEntry = gifElements.find(g => g.el === el);
              if (strokeImg) {
                ctx.drawImage(strokeImg, itemLeft, itemTop, elW, elH);
              } else if (stickyTxt) {
                drawStickyExport(ctx, el, itemLeft, itemTop, elW, elH);
              } else if (gifEntry) {
                // Draw the correct frame for this timestamp
                ctx.drawImage(frameAtTime(gifEntry, timeMs), itemLeft, itemTop, elW, elH);
              } else {
                const img = el.querySelector('img');
                if (img && cleanImgs.has(el)) ctx.drawImage(cleanImgs.get(el), itemLeft, itemTop, elW, elH);
                else if (video) ctx.drawImage(video, itemLeft, itemTop, elW, elH);
                else if (txt) drawExportText(ctx, txt, itemLeft, itemTop, elW);
              }
            }

            if (drawingDataURL) {
              await drawDrawingLayer(ctx, bounds);
            }
            ctx.restore();

            // Encode frame
            const imageData = ctx.getImageData(0, 0, width, height).data;
            const palette   = quantize(imageData, 256);
            const index     = applyPalette(imageData, palette);
            gif.writeFrame(index, width, height, {
              palette,
              delay: frameDelay,
              repeat: 0
            });
          }

          gif.finish();
          const blob = new Blob([gif.bytes()], { type: 'image/gif' });
          const gifUrl = URL.createObjectURL(blob);
          const gifFilename = `${state.title || 'Vibey'}.gif`;
          if (typeof chrome !== 'undefined' && chrome.downloads) {
            chrome.downloads.download({ url: gifUrl, filename: gifFilename, saveAs: false }, () => {
              setTimeout(() => URL.revokeObjectURL(gifUrl), 5000);
            });
          } else {
            downloadDataUrl(gifFilename, gifUrl);
            setTimeout(() => URL.revokeObjectURL(gifUrl), 5000);
          }
          showToast('✅ GIF Exported!' + (skippedImgs ? ' (' + skippedImgs + ' blocked skipped)' : ''));
          btn.classList.remove('export-loading');
          return;
        }

        if (format === 'mp4') {
          showToast('Analysing GIFs on board…');
          const gifElements = await collectGifElements(assets);
          if (!gifElements) {
            showToast('Export cancelled');
            btn.classList.remove('export-loading');
            return;
          }
          const hasAnimated = gifElements.length > 0;
          const hasVideos = assets.some(el => el.querySelector('video'));
          // Static board: short clip instead of 10s of identical frames
          const mp4Duration = hasVideos ? exportDuration
            : (hasAnimated ? Math.max(longestGifLoopMs(gifElements) / 1000, 3) : 3);

          const captureCanvas = document.createElement('canvas');
          // Cap size: uncapped huge boards kill the recorder
          const mp4MaxDim = 1280;
          const vs = Math.max(0.1, Math.min(2, mp4MaxDim / Math.max(bounds.width, bounds.height)));
          captureCanvas.width = Math.floor(bounds.width * vs);
          captureCanvas.height = Math.floor(bounds.height * vs);
          const ctx = captureCanvas.getContext('2d');

          // Pick best supported codec
          const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : 'video/webm;codecs=vp8';
          const stream = captureCanvas.captureStream(30);
          const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12000000 });
          const chunks = [];
          recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
          recorder.onstop = () => {
            if (exportCancelled) {
              showToast('Export cancelled');
              btn.classList.remove('export-loading');
              return;
            }
            // Save as .webm (browsers record webm, not mp4)
            const blob = new Blob(chunks, { type: 'video/webm' });
            downloadDataUrl(`${state.title || 'Vibey'}.webm`, URL.createObjectURL(blob));
            showToast('✅ WebM Video Exported!' + (skippedImgs ? ' (' + skippedImgs + ' blocked skipped)' : ''));
            btn.classList.remove('export-loading');
          };

          const drawingImg = drawingDataURL ? await loadImage(drawingDataURL) : null;
          const strokeImgs = new Map();
          for (const el of UI.elements.children) {
            const svg = el.querySelector && el.querySelector('svg.vibey-stroke');
            if (!svg) continue;
            try {
              strokeImgs.set(el, await rasterizeStrokeSVG(svg, el.offsetWidth || 280, el.offsetHeight || 200));
            } catch (e) { /* skip broken stroke */ }
          }
          const paintItems = collectPaintItems();
          const { map: cleanImgs, skipped: skippedImgs } = await preloadCleanImages(paintItems.map(p => p.el));
          if (exportCancelled) {
            showToast('Export cancelled');
            btn.classList.remove('export-loading');
            return;
          }
          recorder.start();
          const startTime = Date.now();

          const recordLoop = () => {
            if (exportCancelled) { recorder.stop(); return; }
            const timeMs = Date.now() - startTime;
            if (timeMs > mp4Duration * 1000) { recorder.stop(); return; }
            // FIX: reset transform each frame instead of accumulating scale(2,2)
            ctx.setTransform(vs, 0, 0, vs, 0, 0);
            ctx.fillStyle = '#08080a'; ctx.fillRect(0, 0, bounds.width, bounds.height);
            for (const { el, dx, dy } of paintItems) {
              const left = (parseFloat(el.style.left) || 0) + dx - bounds.x;
              const top = (parseFloat(el.style.top) || 0) + dy - bounds.y;
              const elW = el.offsetWidth || 280;
              const elH = el.offsetHeight || 200;
              const strokeImg = strokeImgs.get(el);
              const stickyTxt = el.querySelector('.sticky-text');
              const gifEntry = gifElements.find(g => g.el === el);
              if (strokeImg) {
                ctx.drawImage(strokeImg, left, top, elW, elH);
                continue;
              }
              if (stickyTxt) {
                drawStickyExport(ctx, el, left, top, elW, elH);
                continue;
              }
              if (gifEntry) {
                ctx.drawImage(frameAtTime(gifEntry, timeMs), left, top, elW, elH);
                continue;
              }
              const img = el.querySelector('img'); const video = el.querySelector('video'); const txt = el.querySelector('.board-text');
              if (img && cleanImgs.has(el)) ctx.drawImage(cleanImgs.get(el), left, top, elW, elH);
              else if (video) ctx.drawImage(video, left, top, elW, elH);
              else if (txt) drawExportText(ctx, txt, left, top, elW);
            }
            if (drawingImg) ctx.drawImage(drawingImg, -bounds.x, -bounds.y, UI.canvas.width / 2, UI.canvas.height / 2);
            requestAnimationFrame(recordLoop);
          };
          recordLoop();
          return;
        }

        const url = await renderExportCanvas(format);
        const ext = { png: 'png', jpeg: 'jpg', webp: 'webp' }[format] || 'png';
        downloadDataUrl(`${state.title || 'Vibey'}.${ext}`, url);
        showToast(`✅ ${format.toUpperCase()} Exported!`);
      } catch (e) {
        showToast('❌ Export error: ' + e.message);
        btn.classList.remove('export-loading');
      } finally {
        isExporting = false;
        if (format !== 'gif' && format !== 'mp4') btn.classList.remove('export-loading');
      }
    }

    function togglePreview() {
      document.body.classList.toggle('preview-mode');
      const is = document.body.classList.contains('preview-mode');
      document.getElementById('exitPreview').classList.toggle('visible', is);
      if (is) { selectElement(null); closeAllPanels(); }
    }

    document.getElementById('exportBtn').onclick = () => document.getElementById('exportMenu').classList.toggle('visible');
    document.querySelectorAll('[data-export-format]').forEach(i => i.onclick = () => exportBoard(i.dataset.exportFormat));
    document.getElementById('previewBtn').onclick = togglePreview;
    document.getElementById('exitPreview').onclick = togglePreview;
    
    // Tool selection listeners
    document.querySelectorAll('.tool-item[data-tool]').forEach(btn => {
      btn.onclick = () => updateTool(btn.dataset.tool);
    });

    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) settingsBtn.onclick = () => document.getElementById('settingsPanel').classList.toggle('visible');
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) themeBtn.onclick = () => toggleTheme();
    const shortcutsBtn = document.getElementById('shortcutsBtn');
    if (shortcutsBtn) shortcutsBtn.onclick = () => toggleShortcuts(true);
    const shortcutsClose = document.getElementById('shortcutsClose');
    if (shortcutsClose) shortcutsClose.onclick = () => toggleShortcuts(false);
    const shortcutsModal = document.getElementById('shortcutsModal');
    if (shortcutsModal) shortcutsModal.onclick = (e) => { if (e.target === shortcutsModal) toggleShortcuts(false); };

    // Header Actions & Settings
    document.getElementById('canvasTitle').onblur = (e) => { state.title = e.target.innerText; document.title = `Vibey - ${state.title}`; };
    document.getElementById('resetZoomBtn').onclick = () => { state.targetZoom = 1.0; state.targetPanX = 0; state.targetPanY = 0; queueTransformRender(); };
    document.getElementById('clearDrawBtn').onclick = () => { if(confirm('Clear all drawing?')) { UI.ctx.clearRect(0,0,UI.canvas.width,UI.canvas.height); saveDrawing(); pushHistory(); } };
    document.getElementById('deleteSelectedBtn').onclick = () => deleteSelected();
    
    document.getElementById('globalOpacityRange').oninput = (e) => {
      const val = parseInt(e.target.value);
      state.globalOpacity = val / 100;
      document.getElementById('opacityVal').textContent = val + '%';
      UI.elements.style.opacity = state.globalOpacity;
      UI.canvas.style.opacity = state.globalOpacity;
    };

    // Layers Panel Actions
    document.getElementById('newLayerBtn').onclick = () => document.getElementById('fileInput').click();
    document.getElementById('newTextLayerBtn').onclick = () => { const p = getNextPlacement(); addElement('text', '', p.x, p.y); };
    document.getElementById('drawingLayerBtn').onclick = () => updateTool('draw');
    document.getElementById('clearLayerSelectionBtn').onclick = () => selectElement(null);
    
    document.getElementById('layerBringFrontBtn').onclick = () => moveLayerPosition('front');
    document.getElementById('layerSendBackBtn').onclick = () => moveLayerPosition('back');
    document.getElementById('layerMoveUpBtn').onclick = () => {
      if (!state.selectedId) return;
      const el = document.getElementById(state.selectedId);
      if (el.nextElementSibling) el.parentNode.insertBefore(el.nextElementSibling, el);
      syncElementStack(); updateLayersPanel(); pushHistory();
    };
    document.getElementById('layerMoveDownBtn').onclick = () => {
      if (!state.selectedId) return;
      const el = document.getElementById(state.selectedId);
      if (el.previousElementSibling) el.parentNode.insertBefore(el, el.previousElementSibling);
      syncElementStack(); updateLayersPanel(); pushHistory();
    };

    // Menu Panel
    document.getElementById('menuSaveBtn').onclick = () => {
      try {
        const blob = new Blob([JSON.stringify(serializeBoard())], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const safe = (state.title || 'Vibey').replace(/[\\/:*?"<>|]/g, '-');
        downloadDataUrl(safe + '.vibey.json', url);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        showToast('Backup downloaded');
      } catch (e) { showToast('Backup failed: ' + e.message); }
    };
    document.getElementById('menuLoadBtn').onclick = () => document.getElementById('loadBoardInput').click();
    document.getElementById('loadBoardInput').onchange = (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      const r = new FileReader();
      r.onload = (re) => {
        try {
          const data = JSON.parse(re.target.result);
          if (UI.elements.children.length > 0 && !confirm('Replace current board?')) return;
          restoreBoardData(data);
          showToast('Backup loaded');
        } catch (err) { showToast('Load failed: ' + err.message); }
      };
      r.readAsText(f);
    };
    document.getElementById('menuClearBtn').onclick = () => { if(confirm('Clear entire board?')) { UI.elements.innerHTML = ''; selectElement(null); updateLayersPanel(); pushHistory(); } };

    // Toolbar logic
    document.getElementById('imageToolBtn').onclick = () => document.getElementById('fileInput').click();
    document.getElementById('fileInput').onchange = (e) => {
      const files = Array.from(e.target.files);
      files.forEach((f, i) => {
        const isVideo = f.type && f.type.startsWith('video/');
        if (!isVideo && !(f.type && f.type.startsWith('image/'))) return;
        const r = new FileReader();
        r.onload = (re) => {
          const p = getNextPlacement(isVideo ? 320 : 280, isVideo ? 180 : 200);
          addElement(isVideo ? 'video' : 'image', re.target.result, p.x + i * 20, p.y + i * 20);
        };
        r.readAsDataURL(f);
      });
      e.target.value = '';
    };
    // ── Drag & drop + clipboard paste: images from web pages, files, clipboard ──
    function handleImageFile(file, x, y) {
      if (!file || !file.type) return false;
      const isVideo = file.type.startsWith('video/');
      if (!isVideo && !file.type.startsWith('image/')) return false;
      const r = new FileReader();
      r.onload = (re) => {
        let pos = (typeof x === 'number') ? { x, y } : getNextPlacement(isVideo ? 320 : 280, isVideo ? 180 : 200);
        addElement(isVideo ? 'video' : 'image', re.target.result, pos.x, pos.y);
      };
      r.readAsDataURL(file);
      return true;
    }
    function addImageUrlAt(url, clientX, clientY) {
      const clean = (url || '').split('\n').map((s) => s.trim()).find((s) => s && !s.startsWith('#'));
      if (!clean || (!clean.startsWith('http') && !clean.startsWith('data:image'))) return false;
      let x, y;
      if (typeof clientX === 'number') {
        const p = screenToBoard(clientX, clientY);
        x = p.x - 140; y = p.y - 100;
      } else {
        const p = getNextPlacement(); x = p.x; y = p.y;
      }
      addElement('image', clean, x, y);
      showToast('Image added — drag it where you like');
      return true;
    }
    UI.board.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      UI.board.classList.add('dragging-over');
    });
    UI.board.addEventListener('dragleave', (e) => {
      if (e.target === UI.board) UI.board.classList.remove('dragging-over');
    });
    UI.board.addEventListener('drop', (e) => {
      e.preventDefault();
      UI.board.classList.remove('dragging-over');
      const dt = e.dataTransfer;
      if (dt.files && dt.files.length) {
        let n = 0;
        Array.from(dt.files).forEach((f, i) => {
          const p = screenToBoard(e.clientX, e.clientY);
          if (handleImageFile(f, p.x - 140 + i * 20, p.y - 100 + i * 20)) n++;
        });
        if (!n) showToast('Only image/video files can be dropped');
        return;
      }
      const url = dt.getData('text/uri-list') || dt.getData('text/plain');
      if (addImageUrlAt(url, e.clientX, e.clientY)) return;
      // Google Images & co. often provide only HTML: extract the first <img>
      const html = dt.getData('text/html') || '';
      const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (m && addImageUrlAt(m[1], e.clientX, e.clientY)) return;
      showToast('Drop an image file or image link');
    });
    document.addEventListener('paste', (e) => {
      if (isTypingTarget(e.target)) return;
      const items = (e.clipboardData && e.clipboardData.items) || [];
      for (const it of items) {
        if (it.type && (it.type.startsWith('image/') || it.type.startsWith('video/'))) {
          const f = it.getAsFile();
          if (f && handleImageFile(f)) { e.preventDefault(); return; }
        }
      }
      const text = e.clipboardData ? e.clipboardData.getData('text') : '';
      if (text && text.trim() && addImageUrlAt(text.trim())) e.preventDefault();
    });
    document.getElementById('toggleQueueBtn').onclick = () => document.getElementById('queuePanel').classList.toggle('visible');
    document.getElementById('toggleLayersBtn').onclick = () => document.getElementById('layersPanel').classList.toggle('visible');
    document.getElementById('duplicateBtn').onclick = () => duplicateSelected();

    // Keyboard shortcuts — V/D/T/I/Q/L/S/P/R/C, Delete, Escape, Ctrl+Z/Y/D/G
    function isTypingTarget(el) {
      if (!el) return false;
      if (el.closest) {
        return !!el.closest('input, textarea, select, [contenteditable="true"]');
      }
      return el.contentEditable === 'true';
    }
    document.addEventListener('keydown', e => {
      const typing = isTypingTarget(e.target);
      const mod = e.ctrlKey || e.metaKey;
      // Ctrl/Cmd combos work everywhere except native text undo
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey && !typing) { e.preventDefault(); undo(); return; }
      if (((mod && e.key.toLowerCase() === 'y') || (mod && e.shiftKey && e.key.toLowerCase() === 'z')) && !typing) { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); return; }
      if (mod && e.key.toLowerCase() === 'g') { e.preventDefault(); createGroup(); return; }
      if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); toggleCommandPalette(); return; }
      if (typing) {
        if (e.key === 'Escape') e.target.blur();
        if ((e.key === 'Delete' || e.key === 'Backspace') && e.target.closest && e.target.closest('.board-text, .sticky-text')) {
          const box = e.target.closest('.board-text, .sticky-text');
          if (!box.innerText.trim()) {
            e.preventDefault();
            const host = box.closest('.board-item');
            if (host) { state.selectedIds = [host.id]; state.selectedId = host.id; }
            box.blur();
            deleteSelected();
            return;
          }
        }
        return;
      }
      if (mod || e.altKey) return;
      if (e.code === 'Space') {
        if (!e.repeat) { spaceDown = true; if (state.tool === 'select') UI.board.style.cursor = 'grab'; }
        e.preventDefault();
        return;
      }
      state.lastKeyDown = e.key.toLowerCase();
      const k = e.key.toLowerCase();
      if (k === 'v') updateTool('select');
      else if (k === 'h') updateTool('hand');
      else if (k === 'x') updateTool('eraser');
      else if (k === 'd') updateTool('draw');
      else if (k === 't') updateTool('text');
      else if (k === 'i') document.getElementById('fileInput')?.click();
      else if (k === 'q') document.getElementById('queuePanel')?.classList.toggle('visible');
      else if (k === 'l') document.getElementById('layersPanel')?.classList.toggle('visible');
      else if (k === 's') document.getElementById('settingsPanel')?.classList.toggle('visible');
      else if (k === 'p') setDrawShape('pen');
      else if (k === 'r') setDrawShape('rect');
      else if (k === 'c') setDrawShape('circle');
      else if (k === 'o') setDrawShape('oval');
      else if (k === '?') toggleShortcuts();
      else if (k === 'g') {
        state.gridSnap = !state.gridSnap;
        const t = document.getElementById('gridSnapToggle');
        if (t) t.checked = state.gridSnap;
        showToast('Grid snap ' + (state.gridSnap ? 'on' : 'off'));
      }
      else if (k === '+' || k === '=') updateZoom(0.08, window.innerWidth / 2, window.innerHeight / 2);
      else if (k === '-' || k === '_') updateZoom(-0.08, window.innerWidth / 2, window.innerHeight / 2);
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); return; }
      if (e.key === 'Escape') { if (isExporting) exportCancelled = true; toggleShortcuts(false); closeAllPanels(); if (marquee) cancelMarquee(true); else selectElement(null); if (document.body.classList.contains('preview-mode')) togglePreview(); }
    });
    document.addEventListener('keyup', e => {
      if (e.code === 'Space') { spaceDown = false; syncBoardCursor(); }
      if (e.key.toLowerCase() === (state.lastKeyDown || '').toLowerCase()) state.lastKeyDown = null;
    });

    // Init
    updateDrawingLayerPosition();
    updateLayersPanel();
    const commands = [
      { id: 'group', name: 'Group Selected', action: createGroup, shortcut: 'Ctrl+G' },
      { id: 'ungroup', name: 'Ungroup Selected', action: () => { 
        state.selectedIds.forEach(id => {
          const el = document.getElementById(id);
          if (el?.dataset.layerType === 'group') {
             const content = el.querySelector('.group-content');
             if (content) {
                Array.from(content.children).forEach(child => {
                  const rect = child.getBoundingClientRect();
                  const { x, y } = screenToBoard(rect.left, rect.top);
                  child.style.left = x + 'px'; child.style.top = y + 'px';
                  delete child.dataset.diagramChild;
                  delete child.dataset.diagramRole;
                  UI.elements.appendChild(child);
                });
             }
             el.remove();
          }
        });
        selectElement(null);
        pushHistory();
      } },
      { id: 'export-png', name: 'Export as PNG', action: () => exportBoard('png') },
      { id: 'export-jpg', name: 'Export as JPG', action: () => exportBoard('jpeg') },
      { id: 'theme-dark', name: 'Theme: Dark', action: () => setTheme('dark') },
      { id: 'theme-light', name: 'Theme: Light', action: () => setTheme('light') },
      { id: 'theme-glass', name: 'Theme: Glass', action: () => setTheme('glass') }
    ];

    function toggleShortcuts(show) {
      const m = document.getElementById('shortcutsModal');
      if (!m) return;
      const willShow = typeof show === 'boolean' ? show : m.classList.contains('opacity-0');
      m.classList.toggle('opacity-0', !willShow);
      m.classList.toggle('pointer-events-none', !willShow);
    }
    function toggleCommandPalette() {
      const p = document.getElementById('commandPalette');
      if (!p) return;
      p.classList.toggle('opacity-0'); p.classList.toggle('pointer-events-none');
      if (!p.classList.contains('opacity-0')) {
        renderCommandList('');
        document.getElementById('commandInput').focus();
      } else {
        const ci = document.getElementById('commandInput');
        if (ci) ci.value = '';
      }
    }

    function renderCommandList(filter) {
      const list = document.getElementById('commandList');
      const filtered = commands.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()));
      list.innerHTML = filtered.map(c => `<div class="modal-item" onclick="commands.find(cmd=>cmd.id==='${c.id}').action(); toggleCommandPalette();"><span>${c.name}</span></div>`).join('');
    }

    const commandInput = document.getElementById('commandInput');
    if (commandInput) {
      commandInput.oninput = (e) => renderCommandList(e.target.value);
      commandInput.onkeydown = (e) => { 
        if (e.key === 'Enter') { const f = document.querySelector('#commandList .modal-item'); if (f) f.click(); }
        if (e.key === 'Escape') toggleCommandPalette();
      };
    }

    // (Ctrl+P handled in main keyboard handler above)

    // Listeners for Settings
    function selectedTextBox() {
      const el = state.selectedId ? document.getElementById(state.selectedId) : null;
      if (!el || (el.dataset.layerType !== 'text' && el.dataset.layerType !== 'sticky')) return null;
      return el.querySelector('.board-text, .sticky-text');
    }
    document.getElementById('fontFamily').addEventListener('input', (e) => {
      selectedTextBox()?.style.setProperty('font-family', e.target.value);
    });
    document.getElementById('fontSize').addEventListener('input', (e) => {
      const t = selectedTextBox();
      if (t) t.style.fontSize = e.target.value + 'px';
    });
    document.getElementById('textColor').addEventListener('input', (e) => {
      const t = selectedTextBox();
      if (t) t.style.color = e.target.value;
    });
    
    document.getElementById('brushSize').addEventListener('input', (e) => {
        UI.ctx.lineWidth = e.target.value / state.zoom;
    });
    document.getElementById('brushColor').addEventListener('input', (e) => {
        UI.ctx.strokeStyle = e.target.value;
    });

    document.getElementById('matchViewToggle')?.addEventListener('change', (e) => {
        state.exportMatchView = e.target.checked;
    });
    document.getElementById('gridSnapToggle')?.addEventListener('change', (e) => {
        state.gridSnap = e.target.checked;
        showToast('Grid snap ' + (state.gridSnap ? 'on' : 'off'));
    });

    initPanelDragging('menuPanel'); initPanelDragging('queuePanel'); initPanelDragging('layersPanel'); initPanelDragging('settingsPanel');
    applyStoredTheme();
    document.getElementById('zoomInBtn').onclick = () => updateZoom(0.12, window.innerWidth / 2, window.innerHeight / 2);
    document.getElementById('zoomOutBtn').onclick = () => updateZoom(-0.12, window.innerWidth / 2, window.innerHeight / 2);
    document.addEventListener('click', e => {
      if (!e.target.closest('#exportMenu, #exportBtn')) document.getElementById('exportMenu')?.classList.remove('visible');
      if (!e.target.closest('#shareMenu, #shareBtn')) document.getElementById('shareMenu')?.classList.remove('visible');
      if (!e.target.closest('#shapesMenu, #shapesBtn, #dockShapesBtn')) document.getElementById('shapesMenu')?.classList.remove('visible');
      if (!e.target.closest('#stickyMenu, #stickyBtn, #dockStickyBtn')) document.getElementById('stickyMenu')?.classList.remove('visible');
      syncPenPopover();
    });

    // Bottom dock bindings
    document.getElementById('dockZoomSlot').appendChild(document.getElementById('zoomNav'));
    document.getElementById('dockImageBtn').onclick = () => document.getElementById('fileInput').click();
    document.getElementById('dockQueueBtn').onclick = () => document.getElementById('queuePanel').classList.toggle('visible');
    document.getElementById('dockLayersBtn').onclick = () => document.getElementById('layersPanel').classList.toggle('visible');
    document.getElementById('dockSettingsBtn').onclick = () => document.getElementById('settingsPanel').classList.toggle('visible');
    document.getElementById('dockDuplicateBtn').onclick = () => duplicateSelected();
    document.getElementById('dockUndoBtn').onclick = () => undo();
    document.getElementById('dockRedoBtn').onclick = () => redo();
    const hidePenPopover = () => document.getElementById('penPopover')?.classList.remove('visible');
    document.getElementById('dockShapesBtn').onclick = (e) => { closeAllPanels('shapesMenu'); document.getElementById('shapesMenu').classList.toggle('visible'); hidePenPopover(); e.stopPropagation(); };
    document.getElementById('dockStickyBtn').onclick = (e) => { closeAllPanels('stickyMenu'); document.getElementById('stickyMenu').classList.toggle('visible'); hidePenPopover(); e.stopPropagation(); };
    document.querySelectorAll('.pen-swatch').forEach(sw => sw.addEventListener('click', () => {
      const c = sw.dataset.color;
      document.getElementById('brushColor').value = c;
      UI.ctx.strokeStyle = c;
      document.querySelectorAll('.pen-swatch').forEach(s => s.classList.toggle('active', s === sw));
    }));
    document.getElementById('penSize').addEventListener('input', (e) => {
      document.getElementById('brushSize').value = e.target.value;
      UI.ctx.lineWidth = e.target.value / state.zoom;
    });

    // Shapes menu
    document.getElementById('shapesBtn').onclick = (e) => { closeAllPanels('shapesMenu'); document.getElementById('shapesMenu').classList.toggle('visible'); hidePenPopover(); e.stopPropagation(); };
    document.querySelectorAll('.shape-cell[data-shape]').forEach(item => {
      item.addEventListener('click', () => {
        setDrawShape(item.dataset.shape);
        document.getElementById('shapesMenu').classList.remove('visible');
      });
    });
    document.getElementById('shapePenDot').addEventListener('click', () => {
      setDrawShape('pen');
      document.getElementById('shapesMenu').classList.remove('visible');
    });
    applyTransform();
    document.body.classList.add('tool-select');
    selectElement(null);
    pushHistory();
    loadAutosave();
