
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
    const placementOffsets = [
      { x: -260, y: -130 },
      { x: 240, y: -110 },
      { x: -320, y: 120 },
      { x: 40, y: 160 },
      { x: 300, y: 180 },
      { x: -80, y: -250 },
      { x: 340, y: -260 }
    ];

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
        drawing: 'Drawing Layer'
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

    function getNextPlacement(width = 280, height = 200) {
      const index = UI.elements.querySelectorAll('.board-item').length;
      const offset = placementOffsets[index % placementOffsets.length];
      const cycle = Math.floor(index / placementOffsets.length);
      const { x: cx, y: cy } = screenToBoard(window.innerWidth / 2, window.innerHeight / 2);
      return {
        x: cx + offset.x + cycle * 28 - width / 2,
        y: cy + offset.y + cycle * 24 - height / 2
      };
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

    function renderTransform() {
      UI.content.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
      const gridSize = 24 * state.zoom;
      document.querySelector('.canvas-bg').style.backgroundSize = `${gridSize}px ${gridSize}px`;
      document.querySelector('.canvas-bg').style.backgroundPosition = `${state.panX}px ${state.panY}px`;
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
      UI.board.style.cursor = newTool === 'draw' ? 'crosshair' : 'grab';
      UI.canvas.classList.toggle('active', newTool === 'draw');
      
      document.getElementById('brushSettings').style.display = newTool === 'draw' ? 'block' : 'none';
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
    window.addEventListener('resize', resizeDrawingCanvas);

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
      document.querySelectorAll('.board-item').forEach(el => {
        el.classList.toggle('selected', state.selectedIds.includes(el.id));
      });
      
      const selEl = state.selectedId ? document.getElementById(state.selectedId) : null;
      const isText = selEl?.dataset.layerType === 'text';
      document.getElementById('textSettings').style.display = isText ? 'block' : 'none';
      if (isText) {
        const txt = selEl.querySelector('.board-text');
        document.getElementById('fontFamily').value = txt.style.fontFamily || '';
        document.getElementById('fontSize').value = parseInt(txt.style.fontSize) || 24;
        document.getElementById('textColor').value = rgbToHex(txt.style.color) || '#ffffff';
      }

      updateLayersPanel();
    }

    function rgbToHex(rgb) {
      if (!rgb) return null;
      const m = rgb.match(/\d+/g);
      if (!m || m.length < 3) return null;
      return "#" + m.slice(0, 3).map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
    }

    function makeDraggable(el) {
      let isDragging = false;
      let start = { x: 0, y: 0 };
      el.addEventListener('mousedown', (e) => {
        if (state.tool !== 'select' || e.target.classList.contains('resizer')) return;
        if (state.lastKeyDown === 's' || state.lastKeyDown === 'S') { pickColor(e); return; }
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
        state.selectedIds.forEach(id => {
          const item = document.getElementById(id);
          if (item && item._dragStartPos) {
            let nextX = item._dragStartPos.x + dx;
            let nextY = item._dragStartPos.y + dy;
            if (state.gridSnap) {
              nextX = Math.round(nextX / state.gridSize) * state.gridSize;
              nextY = Math.round(nextY / state.gridSize) * state.gridSize;
            }
            item.style.left = nextX + 'px';
            item.style.top  = nextY + 'px';
          }
        });
      });
      window.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          el.classList.remove('dragging');
          state.selectedIds.forEach(id => {
            const item = document.getElementById(id);
            if (item) delete item._dragStartPos;
          });
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
        video.loop = true;
        video.autoplay = true;
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

    UI.board.addEventListener('mousedown', (e) => {
      if (e.target.closest('.toolbar-right, header, .side-panel, .zoom-nav, .modal-menu')) return;
      const { x, y } = screenToBoard(e.clientX, e.clientY);
      if (state.tool === 'select') {
        if (!e.target.closest('.board-item')) {
          selectElement(null);
          state.isPanning = true;
          panSession = { startX: e.clientX, startY: e.clientY, panX: state.targetPanX, panY: state.targetPanY };
          UI.board.classList.add('panning');
        }
      } else if (state.tool === 'text') {
        if (!e.target.closest('.board-item')) {
          addElement('text', '', x, y);
          updateTool('select');
        }
      } else if (state.tool === 'draw') {
        state.isDrawing = true;
        state.drawStart = { x, y };
        const ctx = UI.ctx;
        ctx.strokeStyle = document.getElementById('brushColor').value;
        ctx.lineWidth = document.getElementById('brushSize').value / state.zoom;
        if (state.drawShape === 'pen') {
           ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.1, y + 0.1); ctx.stroke();
        }
      }
    });

    UI.board.addEventListener('mousemove', (e) => {
      state.mouseX = e.clientX; state.mouseY = e.clientY;
      if (!state.isDrawing || state.tool !== 'draw') return;
      const { x, y } = screenToBoard(e.clientX, e.clientY);
      if (state.drawShape === 'pen') {
        UI.ctx.lineTo(x, y); UI.ctx.stroke();
      } else {
        UI.pctx.clearRect(0, 0, UI.preview.width, UI.preview.height);
        UI.pctx.strokeStyle = '#8b89ff'; UI.pctx.lineWidth = 3 / state.zoom;
        const start = state.drawStart;
        if (state.drawShape === 'rect') UI.pctx.strokeRect(start.x, start.y, x - start.x, y - start.y);
        else if (state.drawShape === 'circle') {
          const r = Math.sqrt(Math.pow(x - start.x, 2) + Math.pow(y - start.y, 2));
          UI.pctx.beginPath(); UI.pctx.arc(start.x, start.y, r, 0, Math.PI * 2); UI.pctx.stroke();
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!state.isPanning || !panSession) return;
      state.targetPanX = panSession.panX + (e.clientX - panSession.startX);
      state.targetPanY = panSession.panY + (e.clientY - panSession.startY);
      queueTransformRender();
    });

    window.addEventListener('mouseup', () => {
      if (state.isDrawing) {
        if (state.drawShape !== 'pen') {
           const { x, y } = screenToBoard(state.mouseX, state.mouseY);
           const start = state.drawStart;
           if (state.drawShape === 'rect') UI.ctx.strokeRect(start.x, start.y, x - start.x, y - start.y);
           else if (state.drawShape === 'circle') {
             const r = Math.sqrt(Math.pow(x - start.x, 2) + Math.pow(y - start.y, 2));
             UI.ctx.beginPath(); UI.ctx.arc(start.x, start.y, r, 0, Math.PI * 2); UI.ctx.stroke();
           }
           UI.pctx.clearRect(0, 0, UI.preview.width, UI.preview.height);
        }
        state.isDrawing = false; saveDrawing();
      }
      if (state.isPanning) { state.isPanning = false; panSession = null; UI.board.classList.remove('panning'); }
    });

    UI.board.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) updateZoom(-e.deltaY * 0.0015, e.clientX, e.clientY);
      else panBoard(-e.deltaX, -e.deltaY);
    }, { passive: false });

    function renderQueuePanel(images) {
      const list = document.getElementById('queueList');
      const count = document.getElementById('queueCount');
      if (count) count.textContent = images.length;
      list.innerHTML = images.length === 0 ? '<p class="text-[11px] text-slate-600 italic text-center py-20">Queue is empty.</p>' : '';
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
    }

    function loadQueue() {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(['moodboardImages'], (r) => renderQueuePanel(r.moodboardImages || []));
        chrome.storage.onChanged.addListener(c => c.moodboardImages && renderQueuePanel(c.moodboardImages.newValue || []));
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
        html += `<div class="layer-item ${state.selectedIds.includes(el.id) ? 'active' : ''}" onclick="selectElement('${el.id}')">
          <span class="layer-name">${el.dataset.layerName || 'Layer'}</span>
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
      syncElementStack(); updateLayersPanel();
    }

    function bindLayersPanelEvents() {
       // Panel events handled via inline onclick for simplicity in this version
    }

    // Header Actions
    document.getElementById('menuBtn').onclick = () => { closeAllPanels('menuPanel'); document.getElementById('menuPanel').classList.toggle('visible'); };
    document.getElementById('shareBtn').onclick = (e) => { document.getElementById('shareMenu').classList.toggle('visible'); e.stopPropagation(); };
    document.getElementById('shareCopyLink').onclick = () => { navigator.clipboard.writeText(window.location.href); showToast('Link copied!'); };
    document.getElementById('shareClearBoard').onclick = () => { if (confirm('Clear board?')) { UI.elements.innerHTML = ''; selectElement(null); updateLayersPanel(); } };

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

      const items = Array.from(UI.elements.querySelectorAll('.board-item'));
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

    async function renderExportCanvas(format) {
      const bounds = getExportBounds();
      if (!bounds) throw new Error('Nothing to export.');
      const renderScale = 2; // High-DPI export
      const canvas = document.createElement('canvas');
      canvas.width = bounds.width * renderScale; canvas.height = bounds.height * renderScale;
      const ctx = canvas.getContext('2d');
      ctx.scale(renderScale, renderScale);
      
      if (format === 'jpeg') { ctx.fillStyle = '#08080a'; ctx.fillRect(0, 0, bounds.width, bounds.height); }
      
      for (const el of UI.elements.children) {
        const left = (parseFloat(el.style.left) || 0) - bounds.x;
        const top = (parseFloat(el.style.top) || 0) - bounds.y;
        const width = el.offsetWidth || 280;
        const height = el.offsetHeight || 200;
        const img = el.querySelector('img'); 
        const video = el.querySelector('video'); 
        const txt = el.querySelector('.board-text');
        
        if (img) ctx.drawImage(img, left, top, width, height);
        else if (video) ctx.drawImage(video, left, top, width, height);
        else if (txt) {
          ctx.fillStyle = '#fff'; ctx.font = '600 24px Segoe UI'; ctx.textBaseline = 'top';
          const lines = (txt.innerText || '').split('\n');
          lines.forEach((line, idx) => ctx.fillText(line, left + 8, top + 8 + idx * 30));
        }
      }
      
      if (drawingDataURL) {
        const draw = await loadImage(drawingDataURL);
        ctx.drawImage(draw, -bounds.x, -bounds.y, UI.canvas.width, UI.canvas.height);
      }
      
      const mimeMap = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
      return canvas.toDataURL(mimeMap[format] || 'image/png', 1.0);
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
          const DURATION_MS = 10000; // sample for 10s to catch slow GIFs
          let lastHash  = null;
          let elapsed   = 0;

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
              }
            } catch (e) {
              // CORS tainted canvas — can't read pixels, give up
              document.body.removeChild(img);
              resolve(null);
              return;
            }

            elapsed += SAMPLE_MS;
            if (elapsed < DURATION_MS) {
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

      showToast(`🎬 Starting ${format.toUpperCase()} Export (${exportDuration.toFixed(1)}s)...`);
      btn.classList.add('export-loading');
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
          const gifElements = []; // { el, frames: [{canvas, delay}] }
          for (const el of assets) {
            const img = el.querySelector('img');
            if (!img) continue;
            // Only try to decode if src looks like a GIF
            const src = img.src || '';
            const isGIF = src.startsWith('data:image/gif') || /\.gif(\?|$)/i.test(src);
            if (!isGIF) continue;
            const frames = await extractGIFFrames(src);
            if (frames && frames.length > 1) {
              gifElements.push({ el, img, frames });
            }
          }

          const hasAnimated = gifElements.length > 0;
          const hasVideos   = assets.some(el => el.querySelector('video'));

          // ── Step 2: calculate total frames & timing ──
          const fps        = 10;
          const frameDelay = 1000 / fps; // 100ms per frame
          let totalFrames  = 100; // default: always 10 seconds (10fps × 100 = 10s)

          if (hasAnimated && !hasVideos) {
            // Drive duration by the longest GIF loop, minimum 10s
            const longestLoopMs = Math.max(
              ...gifElements.map(g => g.frames.reduce((s, f) => s + f.delay, 0))
            );
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

          // Pre-build per-GIF frame index lookup
          // frameAtTime(gifEntry, timeMs) → canvas for that GIF at the given time
          function frameAtTime(gifEntry, timeMs) {
            const totalMs = gifEntry.frames.reduce((s, f) => s + f.delay, 0);
            let t = timeMs % totalMs;
            for (const f of gifEntry.frames) {
              if (t < f.delay) return f.canvas;
              t -= f.delay;
            }
            return gifEntry.frames[gifEntry.frames.length - 1].canvas;
          }

          // ── Step 4: render each output frame ──
          for (let i = 0; i < totalFrames; i++) {
            const timeMs = i * frameDelay;
            showToast(`🎞️ Frame ${i + 1}/${totalFrames}`);

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

            for (const el of UI.elements.children) {
              if (el.classList.contains('drawing-layer')) continue;
              const itemLeft = (parseFloat(el.style.left) || 0) - bounds.x;
              const itemTop  = (parseFloat(el.style.top)  || 0) - bounds.y;
              const elW = el.offsetWidth  || 280;
              const elH = el.offsetHeight || 200;

              const video = el.querySelector('video');
              const txt   = el.querySelector('.board-text');

              // Check if this element is an animated GIF we decoded
              const gifEntry = gifElements.find(g => g.el === el);
              if (gifEntry) {
                // Draw the correct frame for this timestamp
                ctx.drawImage(frameAtTime(gifEntry, timeMs), itemLeft, itemTop, elW, elH);
              } else {
                const img = el.querySelector('img');
                if (img)   ctx.drawImage(img,   itemLeft, itemTop, elW, elH);
                else if (video) ctx.drawImage(video, itemLeft, itemTop, elW, elH);
                else if (txt) {
                  ctx.fillStyle = '#fff';
                  ctx.font = '600 24px Segoe UI';
                  ctx.textBaseline = 'top';
                  const lines = (txt.innerText || '').split('\n');
                  lines.forEach((line, idx) => ctx.fillText(line, itemLeft + 8, itemTop + 8 + idx * 30));
                }
              }
            }

            if (drawingDataURL) {
              const draw = await loadImage(drawingDataURL);
              ctx.drawImage(draw, -bounds.x, -bounds.y, UI.canvas.width, UI.canvas.height);
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
          showToast('✅ GIF Exported!');
          btn.classList.remove('export-loading');
          return;
        }

        if (format === 'mp4') {
          const captureCanvas = document.createElement('canvas');
          captureCanvas.width = bounds.width * 2;
          captureCanvas.height = bounds.height * 2;
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
            // Save as .webm (browsers record webm, not mp4)
            const blob = new Blob(chunks, { type: 'video/webm' });
            downloadDataUrl(`${state.title || 'Vibey'}.webm`, URL.createObjectURL(blob));
            showToast('✅ WebM Video Exported!');
            btn.classList.remove('export-loading');
          };

          const drawingImg = drawingDataURL ? await loadImage(drawingDataURL) : null;
          recorder.start();
          const startTime = Date.now();
          
          const recordLoop = () => {
            if (Date.now() - startTime > exportDuration * 1000) { recorder.stop(); return; }
            // FIX: reset transform each frame instead of accumulating scale(2,2)
            ctx.setTransform(2, 0, 0, 2, 0, 0);
            ctx.fillStyle = '#08080a'; ctx.fillRect(0, 0, bounds.width, bounds.height);
            for (const el of assets) {
              const left = (parseFloat(el.style.left) || 0) - bounds.x;
              const top = (parseFloat(el.style.top) || 0) - bounds.y;
              const img = el.querySelector('img'); const video = el.querySelector('video'); const txt = el.querySelector('.board-text');
              if (img) ctx.drawImage(img, left, top, el.offsetWidth || 280, el.offsetHeight || 200);
              else if (video) ctx.drawImage(video, left, top, el.offsetWidth || 320, el.offsetHeight || 180);
              else if (txt) {
                ctx.fillStyle = '#fff'; ctx.font = '600 24px Segoe UI'; ctx.textBaseline = 'top';
                const lines = txt.innerText.split('\n');
                lines.forEach((line, idx) => ctx.fillText(line, left + 8, top + 8 + idx * 30));
              }
            }
            if (drawingImg) ctx.drawImage(drawingImg, -bounds.x, -bounds.y, UI.canvas.width, UI.canvas.height);
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

    // Header Actions & Settings
    document.getElementById('canvasTitle').onblur = (e) => { state.title = e.target.innerText; document.title = `Vibey - ${state.title}`; };
    document.getElementById('resetZoomBtn').onclick = () => { state.targetZoom = 1.0; state.targetPanX = 0; state.targetPanY = 0; queueTransformRender(); };
    document.getElementById('clearDrawBtn').onclick = () => { if(confirm('Clear all drawing?')) { UI.ctx.clearRect(0,0,UI.canvas.width,UI.canvas.height); saveDrawing(); } };
    document.getElementById('deleteSelectedBtn').onclick = () => { state.selectedIds.forEach(id => document.getElementById(id)?.remove()); selectElement(null); };
    
    document.getElementById('globalOpacityRange').oninput = (e) => {
      const val = parseInt(e.target.value);
      state.globalOpacity = val / 100;
      document.getElementById('opacityVal').textContent = val + '%';
      UI.elements.style.opacity = state.globalOpacity;
      UI.canvas.style.opacity = state.globalOpacity;
    };

    // Layers Panel Actions
    document.getElementById('newLayerBtn').onclick = () => document.getElementById('fileInput').click();
    document.getElementById('newTextLayerBtn').onclick = () => addElement('text', '', 0, 0);
    document.getElementById('drawingLayerBtn').onclick = () => updateTool('draw');
    document.getElementById('clearLayerSelectionBtn').onclick = () => selectElement(null);
    
    document.getElementById('layerBringFrontBtn').onclick = () => moveLayerPosition('front');
    document.getElementById('layerSendBackBtn').onclick = () => moveLayerPosition('back');
    document.getElementById('layerMoveUpBtn').onclick = () => {
      if (!state.selectedId) return;
      const el = document.getElementById(state.selectedId);
      if (el.nextElementSibling) el.parentNode.insertBefore(el.nextElementSibling, el);
      syncElementStack(); updateLayersPanel();
    };
    document.getElementById('layerMoveDownBtn').onclick = () => {
      if (!state.selectedId) return;
      const el = document.getElementById(state.selectedId);
      if (el.previousElementSibling) el.parentNode.insertBefore(el, el.previousElementSibling);
      syncElementStack(); updateLayersPanel();
    };

    // Menu Panel
    document.getElementById('menuClearBtn').onclick = () => { if(confirm('Clear entire board?')) { UI.elements.innerHTML = ''; selectElement(null); updateLayersPanel(); } };

    // Toolbar logic
    document.getElementById('imageToolBtn').onclick = () => document.getElementById('fileInput').click();
    document.getElementById('fileInput').onchange = (e) => {
      const files = Array.from(e.target.files);
      files.forEach((f, i) => {
        const r = new FileReader();
        r.onload = (re) => { const p = getNextPlacement(); addElement('image', re.target.result, p.x + i*20, p.y + i*20); };
        r.readAsDataURL(f);
      });
    };
    document.getElementById('toggleQueueBtn').onclick = () => document.getElementById('queuePanel').classList.toggle('visible');
    document.getElementById('toggleLayersBtn').onclick = () => document.getElementById('layersPanel').classList.toggle('visible');
    document.getElementById('duplicateBtn').onclick = () => {
      if (!state.selectedId) return;
      const t = document.getElementById(state.selectedId);
      const c = t.cloneNode(true);
      const nid = 'el-' + createId(); c.id = nid;
      UI.elements.appendChild(c); syncElementStack(); makeDraggable(c); selectElement(nid);
    };

    // Keyboard
    document.addEventListener('keydown', e => {
      if (e.target.contentEditable === 'true') return;
      if (e.key === 'v') updateTool('select');
      if (e.key === 'd') updateTool('draw');
      if (e.key === 'Escape') { closeAllPanels(); selectElement(null); if (document.body.classList.contains('preview-mode')) togglePreview(); }
      if (e.key === 'Delete' || e.key === 'Backspace') { state.selectedIds.forEach(id => document.getElementById(id)?.remove()); selectElement(null); }
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
                 UI.elements.appendChild(child);
               });
             }
             el.remove();
          }
        });
        selectElement(null);
      } },
      { id: 'export-png', name: 'Export as PNG', action: () => exportBoard('png') },
      { id: 'export-jpg', name: 'Export as JPG', action: () => exportBoard('jpeg') },
      { id: 'theme-dark', name: 'Theme: Dark', action: () => document.body.className = 'theme-dark' },
      { id: 'theme-light', name: 'Theme: Light', action: () => document.body.className = 'theme-light' },
      { id: 'theme-glass', name: 'Theme: Glass', action: () => document.body.className = 'theme-glass' }
    ];

    function toggleCommandPalette() {
      const p = document.getElementById('commandPalette');
      if (!p) return;
      p.classList.toggle('opacity-0'); p.classList.toggle('pointer-events-none');
      if (!p.classList.contains('opacity-0')) document.getElementById('commandInput').focus();
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

    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') { e.preventDefault(); toggleCommandPalette(); }
    });

    // Listeners for Settings
    document.getElementById('fontFamily').addEventListener('input', (e) => {
      const el = state.selectedId ? document.getElementById(state.selectedId) : null;
      if (el?.dataset.layerType === 'text') el.querySelector('.board-text').style.fontFamily = e.target.value;
    });
    document.getElementById('fontSize').addEventListener('input', (e) => {
      const el = state.selectedId ? document.getElementById(state.selectedId) : null;
      if (el?.dataset.layerType === 'text') el.querySelector('.board-text').style.fontSize = e.target.value + 'px';
    });
    document.getElementById('textColor').addEventListener('input', (e) => {
      const el = state.selectedId ? document.getElementById(state.selectedId) : null;
      if (el?.dataset.layerType === 'text') el.querySelector('.board-text').style.color = e.target.value;
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

    initPanelDragging('menuPanel'); initPanelDragging('queuePanel'); initPanelDragging('layersPanel'); initPanelDragging('settingsPanel');
    applyTransform();
    selectElement(null);
