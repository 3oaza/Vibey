// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // State
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const state = {
      tool: 'select',
      zoom: 1.0,
      targetZoom: 1.0,
      panX: 0,
      panY: 0,
      targetPanX: 0,
      targetPanY: 0,
      selectedId: null,
      selectedSpecialLayer: null,
      isDrawing: false,
      isPanning: false,
      drawingLayerOnTop: false,
      title: 'Untitled'
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
      get ctx() { return this.canvas.getContext('2d'); },
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
      Array.from(UI.elements.children).forEach((el, index) => {
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

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Toast
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let toastTimer;
    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Tool Management
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let transformFrame = null;
    let panSession = null;

    function renderTransform() {
      UI.content.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
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

        if (
          state.zoom !== state.targetZoom ||
          state.panX !== state.targetPanX ||
          state.panY !== state.targetPanY
        ) {
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
    }

    function createId() { return Math.random().toString(36).substr(2, 9); }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // FIX: Zoom â€” ط¨ظٹط­ط³ط¨ ط§ظ„ط¥ط­ط¯ط§ط«ظٹط§طھ طµط­
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function applyTransform() {
      state.zoom = state.targetZoom;
      state.panX = state.targetPanX;
      state.panY = state.targetPanY;
      renderTransform();
    }

    function updateZoom(delta, cx, cy) {
      const oldZoom = state.targetZoom;
      state.targetZoom = Math.max(0.15, Math.min(5, state.targetZoom + delta));
      
      // Zoom toward cursor position
      if (cx !== undefined && cy !== undefined) {
        const scale = state.targetZoom / oldZoom;
        state.targetPanX = cx - scale * (cx - state.targetPanX);
        state.targetPanY = cy - scale * (cy - state.targetPanY);
      }
      queueTransformRender();
    }

    function panBoard(dx, dy) {
      state.targetPanX += dx;
      state.targetPanY += dy;
      queueTransformRender();
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Drawing Canvas â€” FIX: ط¨ظٹطھظ…ط³ط­ ظ„ظˆ ط§طھط؛ظٹط± ط§ظ„ظ€ size
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let drawingDataURL = null;

    function resizeDrawingCanvas() {
      const saved = drawingDataURL;
      UI.canvas.width = window.innerWidth;
      UI.canvas.height = window.innerHeight;
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

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Cursor
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Element Management
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function selectElement(id) {
      state.selectedId = id;
      state.selectedSpecialLayer = null;
      document.querySelectorAll('.board-item').forEach(el => {
        el.classList.toggle('selected', el.id === id);
      });
      updateLayersPanel();
    }

    function makeDraggable(el) {
      let isDragging = false;
      let start = { x: 0, y: 0 };
      let offset = { x: 0, y: 0 };

      el.addEventListener('mousedown', (e) => {
        if (state.tool !== 'select') return;
        const txt = e.target.closest('.board-text');
        if (txt && document.activeElement === txt) return;

        isDragging = true;
        selectElement(el.id);
        start.x = e.clientX;
        start.y = e.clientY;
        offset.x = parseFloat(el.style.left) || 0;
        offset.y = parseFloat(el.style.top) || 0;
        el.classList.add('dragging');
        e.stopPropagation();
      });

      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = (e.clientX - start.x) / state.zoom;
        const dy = (e.clientY - start.y) / state.zoom;
        el.style.left = (offset.x + dx) + 'px';
        el.style.top  = (offset.y + dy) + 'px';
      });

      window.addEventListener('mouseup', () => {
        isDragging = false;
        el.classList.remove('dragging');
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

      if (type === 'image') {
        const img = document.createElement('img');
        img.src = data;
        el.appendChild(img);
        el.style.width = '280px';
      } else if (type === 'text') {
        const txt = document.createElement('div');
        txt.className = 'board-text';
        txt.contentEditable = true;
        txt.innerText = data || 'Type something...';
        el.appendChild(txt);
        setTimeout(() => {
          txt.focus();
          const range = document.createRange();
          range.selectNodeContents(txt);
          window.getSelection().removeAllRanges();
          window.getSelection().addRange(range);
        }, 50);
      }

      UI.elements.appendChild(el);
      syncElementStack();
      makeDraggable(el);
      selectElement(el.id);
      updateLayersPanel();
      return el;
    }

    // Helper: board coords from screen coords
    function screenToBoard(cx, cy) {
      const rect = UI.content.getBoundingClientRect();
      return {
        x: (cx - rect.left) / state.zoom,
        y: (cy - rect.top)  / state.zoom
      };
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Board Events
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    UI.board.addEventListener('mousedown', (e) => {
      if (e.target.closest('.toolbar-right, header, .side-panel, .zoom-nav, .modal-menu')) return;

      const { x, y } = screenToBoard(e.clientX, e.clientY);

      if (state.tool === 'select') {
        if (!e.target.closest('.board-item')) {
          selectElement(null);
          state.isPanning = true;
          panSession = {
            startX: e.clientX,
            startY: e.clientY,
            panX: state.targetPanX,
            panY: state.targetPanY
          };
          UI.board.classList.add('panning');
        }
      }
      else if (state.tool === 'text') {
        if (!e.target.closest('.board-item')) {
          addElement('text', '', x, y);
          updateTool('select');
        }
      }
      else if (state.tool === 'draw') {
        state.isDrawing = true;
        const ctx = UI.ctx;
        ctx.beginPath();
        ctx.moveTo(e.clientX, e.clientY);
        ctx.lineTo(e.clientX + 0.1, e.clientY + 0.1);
        ctx.stroke();
      }
    });

    // FIX: ط§ظ„ط±ط³ظ… ط¨ظٹط³طھط®ط¯ظ… screen coords ظ…ط´ board coords ط¹ط´ط§ظ† ط§ظ„ظ€ canvas ظپظˆظ‚ ظƒظ„ ط­ط§ط¬ط©
    UI.board.addEventListener('mousemove', (e) => {
      if (!state.isDrawing || state.tool !== 'draw') return;
      const ctx = UI.ctx;
      ctx.lineTo(e.clientX, e.clientY);
      ctx.stroke();
    });

    window.addEventListener('mousemove', (e) => {
      if (!state.isPanning || !panSession) return;
      state.targetPanX = panSession.panX + (e.clientX - panSession.startX);
      state.targetPanY = panSession.panY + (e.clientY - panSession.startY);
      queueTransformRender();
    });

    window.addEventListener('mouseup', () => {
      if (state.isDrawing) {
        state.isDrawing = false;
        saveDrawing();
      }
      if (state.isPanning) {
        state.isPanning = false;
        panSession = null;
        UI.board.classList.remove('panning');
      }
    });

    // Mouse wheel pan / zoom
    UI.board.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        updateZoom(-e.deltaY * 0.0015, e.clientX, e.clientY);
        return;
      }

      panBoard(-e.deltaX, -e.deltaY);
    }, { passive: false });

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // FIX: Queue Panel â€” ط¨ظٹط¬ظٹط¨ ط§ظ„طµظˆط± ظ…ظ† chrome.storage
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function renderQueuePanel(images) {
      const list = document.getElementById('queueList');
      const count = document.getElementById('queueCount');
      count.textContent = images.length;

      list.innerHTML = '';

      if (images.length === 0) {
        list.innerHTML = '<p class="text-[11px] text-slate-600 italic text-center py-20 empty-msg">Queue is empty.</p>';
        return;
      }

      images.forEach((url) => {
        const item = document.createElement('div');
        item.className = 'queue-item';

        const img = document.createElement('img');
        img.src = url;
        img.alt = '';

        const overlay = document.createElement('div');
        overlay.className = 'add-overlay';
        overlay.innerHTML = '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>';

        item.appendChild(img);
        item.appendChild(overlay);

        // FIX: ط§ط¶ط؛ط· ط¹ظ„ظ‰ ط§ظ„طµظˆط±ط© طھط¶ظٹظپظ‡ط§ ظ„ظ„ط¨ظˆط±ط¯ ظپظٹ ط§ظ„ظ†طµ
        item.addEventListener('click', () => {
          const pos = getNextPlacement(280, 200);
          addElement('image', url, pos.x, pos.y);
          showToast('Image added to board.');
        });

        list.appendChild(item);
      });
    }

    function loadQueue() {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(['moodboardImages'], (result) => {
          renderQueuePanel(result.moodboardImages || []);
        });
        chrome.storage.onChanged.addListener((changes) => {
          if (changes.moodboardImages) {
            renderQueuePanel(changes.moodboardImages.newValue || []);
          }
        });
      } else {
        // Dev mode fallback
        renderQueuePanel([]);
      }
    }
    loadQueue();

    function createLayerControlButton(iconPath, action, title) {
      return `<button class="icon-btn" type="button" data-layer-action="${action}" title="${title}"><svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true">${iconPath}</svg></button>`;
    }

    function renderLayerRow(id, name, kind, iconPaths, active, isDrawingLayer) {
      const iconMarkup = `<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true">${iconPaths}</svg>`;
      const reorderButtons = isDrawingLayer
        ? `
          ${createLayerControlButton('<path d="M7 17 12 12 17 17"/><path d="M7 12 12 7l5 5"/>', 'drawing-top', 'Place drawing on top')}
          ${createLayerControlButton('<path d="M7 7 12 12 17 7"/><path d="m7 12 5 5 5-5"/>', 'drawing-bottom', 'Place drawing below')}
        `
        : `
          ${createLayerControlButton('<path d="m7 14 5-5 5 5"/>', 'up', 'Move up')}
          ${createLayerControlButton('<path d="m7 10 5 5 5-5"/>', 'down', 'Move down')}
        `;

      return `
        <div class="layer-item${active ? ' active' : ''}" data-layer-id="${id}" data-layer-kind="${isDrawingLayer ? 'drawing' : 'element'}">
          <div class="layer-meta">
            <span class="layer-icon">${iconMarkup}</span>
            <div class="layer-copy">
              <div class="layer-name">${name}</div>
              <div class="layer-kind">${kind}</div>
            </div>
          </div>
          <div class="layer-reorder">${reorderButtons}</div>
        </div>
      `;
    }

    function updateLayersPanel() {
      const list = document.getElementById('layersList');
      const count = document.getElementById('layersCount');
      const items = Array.from(UI.elements.querySelectorAll('.board-item'));
      const drawingRow = renderLayerRow(
        'drawing-layer',
        'Drawing Layer',
        state.drawingLayerOnTop ? 'Canvas • Top' : 'Canvas • Bottom',
        '<path d="M4 20l4.5-1 9.8-9.8a2.2 2.2 0 0 0 0-3.1l-.4-.4a2.2 2.2 0 0 0-3.1 0L5 15.5z"/><path d="M13.5 6.5l4 4"/>',
        state.selectedSpecialLayer === 'drawing',
        true
      );

      const layerRows = items.slice().reverse().map((el) => {
        const type = el.dataset.layerType || 'layer';
        const iconMap = {
          image: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="m7 15 3-3 3 3 2-2 2 2"/><circle cx="9" cy="9" r="1.2"/>',
          text: '<path d="M5 6h14"/><path d="M12 6v12"/><path d="M8 18h8"/>'
        };
        const kindMap = {
          image: 'Image',
          text: 'Text'
        };

        return renderLayerRow(
          el.id,
          el.dataset.layerName || 'Layer',
          kindMap[type] || 'Layer',
          iconMap[type] || '<rect x="5" y="5" width="14" height="14" rx="2"/>',
          state.selectedId === el.id,
          false
        );
      });

      const rows = state.drawingLayerOnTop
        ? [drawingRow, ...layerRows]
        : [...layerRows, drawingRow];

      list.innerHTML = rows.join('');
      count.textContent = String(items.length + 1);
    }

    function moveLayerPosition(direction) {
      if (!state.selectedId) return;
      const target = document.getElementById(state.selectedId);
      if (!target) return;

      if (direction === 'front') {
        UI.elements.appendChild(target);
      } else if (direction === 'back') {
        UI.elements.prepend(target);
      } else if (direction === 'up') {
        const next = target.nextElementSibling;
        if (next) {
          next.insertAdjacentElement('afterend', target);
        }
      } else if (direction === 'down') {
        const prev = target.previousElementSibling;
        if (prev) {
          prev.insertAdjacentElement('beforebegin', target);
        }
      }

      syncElementStack();
      updateLayersPanel();
      selectElement(target.id);
    }

    function bindLayersPanelEvents() {
      document.getElementById('layersList').addEventListener('click', (e) => {
        const actionButton = e.target.closest('[data-layer-action]');
        const row = e.target.closest('.layer-item');
        if (!row) return;

        if (actionButton) {
          const action = actionButton.dataset.layerAction;
          if (action === 'drawing-top') {
            state.drawingLayerOnTop = true;
            updateDrawingLayerPosition();
            selectDrawingLayer();
            return;
          }
          if (action === 'drawing-bottom') {
            state.drawingLayerOnTop = false;
            updateDrawingLayerPosition();
            selectDrawingLayer();
            return;
          }

          if (row.dataset.layerKind === 'element') {
            selectElement(row.dataset.layerId);
            moveLayerPosition(action);
          }
          return;
        }

        if (row.dataset.layerKind === 'drawing') {
          selectDrawingLayer();
        } else {
          selectElement(row.dataset.layerId);
        }
      });
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Header Buttons
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    document.getElementById('menuBtn').onclick = () => {
      closeAllPanels('menuPanel');
      document.getElementById('menuPanel').classList.toggle('visible');
    };

    document.getElementById('shareBtn').onclick = (e) => {
      document.getElementById('shareMenu').classList.toggle('visible');
      e.stopPropagation();
    };

    // FIX: Copy Link â€” ط¨ظٹظ†ط³ط® ط§ظ„ظ€ URL ط§ظ„ط­ط§ظ„ظٹ
    document.getElementById('shareCopyLink').onclick = () => {
      navigator.clipboard.writeText(window.location.href).then(() => {
        showToast('âœ“ Link copied!');
      });
      document.getElementById('shareMenu').classList.remove('visible');
    };

    // FIX: Email Project â€” ط¨ظٹظپطھط­ email client
    document.getElementById('shareEmail').onclick = () => {
      const subject = encodeURIComponent('Vibey: ' + state.title);
      const body = encodeURIComponent('Check out my Vibey board: ' + window.location.href);
      window.open('mailto:?subject=' + subject + '&body=' + body);
      document.getElementById('shareMenu').classList.remove('visible');
    };

    // FIX: Clear Board ظ…ظ† ط§ظ„ظ€ share menu
    document.getElementById('shareClearBoard').onclick = () => {
      if (confirm('ظ…ط³ط­ ظƒظ„ ط­ط§ط¬ط© ط¹ظ„ظ‰ ط§ظ„ط¨ظˆط±ط¯طں')) {
        UI.elements.innerHTML = '';
        state.selectedId = null;
        state.selectedSpecialLayer = null;
        updateLayersPanel();
        showToast('Board cleared');
      }
      document.getElementById('shareMenu').classList.remove('visible');
    };

    // FIX: Export â€” ط¨ظٹطµط¯ط± ط§ظ„طµظˆط± ظˆط§ظ„ط±ط³ظ… ظ…ط¹ ط¨ط¹ط¶
    const legacyExportHandler = async () => {
      showToast('âڈ³ ط¬ط§ط±ظٹ ط§ظ„طھطµط¯ظٹط±...');
      const btn = document.getElementById('exportBtn');
      btn.classList.add('export-loading');

      try {
        // Use html2canvas via CDN loaded dynamically
        if (!window.html2canvas) {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = '';
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
          });
        }

        // Temporarily remove selection highlight
        selectElement(null);
        await new Promise(r => setTimeout(r, 100));

        const canvasEl = await html2canvas(document.getElementById('board'), {
          backgroundColor: '#08080a',
          useCORS: true,
          allowTaint: true,
          scale: 1
        });

        const link = document.createElement('a');
        link.download = (state.title || 'Vibey') + '.png';
        link.href = canvasEl.toDataURL('image/png');
        link.click();
        showToast('âœ“ Exported as PNG!');
      } catch (err) {
        // Fallback: export drawing canvas only
        const link = document.createElement('a');
        link.download = (state.title || 'Vibey') + '-drawing.png';
        link.href = UI.canvas.toDataURL();
        link.click();
        showToast('âœ“ Drawing exported (basic mode)');
      }

      btn.classList.remove('export-loading');
    };

    function downloadDataUrl(filename, dataUrl) {
      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      link.click();
    }

    function getExportBounds() {
      const items = Array.from(UI.elements.querySelectorAll('.board-item'));
      if (items.length === 0) return null;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      items.forEach((el) => {
        const left = parseFloat(el.style.left) || 0;
        const top = parseFloat(el.style.top) || 0;
        const width = el.offsetWidth || parseFloat(el.style.width) || 280;
        const height = el.offsetHeight || 200;
        minX = Math.min(minX, left);
        minY = Math.min(minY, top);
        maxX = Math.max(maxX, left + width);
        maxY = Math.max(maxY, top + height);
      });

      return {
        x: Math.floor(minX - 40),
        y: Math.floor(minY - 40),
        width: Math.ceil(maxX - minX + 80),
        height: Math.ceil(maxY - minY + 80)
      };
    }

    async function loadImage(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
    }

    async function renderExportCanvas(format) {
      const bounds = getExportBounds();
      if (!bounds) {
        throw new Error('Nothing to export.');
      }

      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = Math.max(1, bounds.width);
      exportCanvas.height = Math.max(1, bounds.height);
      const ctx = exportCanvas.getContext('2d');

      if (format === 'jpeg') {
        ctx.fillStyle = '#08080a';
        ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      } else {
        ctx.clearRect(0, 0, exportCanvas.width, exportCanvas.height);
      }

      const drawElements = async () => {
        const elements = Array.from(UI.elements.querySelectorAll('.board-item'));
        for (const el of elements) {
          const left = (parseFloat(el.style.left) || 0) - bounds.x;
          const top = (parseFloat(el.style.top) || 0) - bounds.y;
          const width = el.offsetWidth || parseFloat(el.style.width) || 280;
          const height = el.offsetHeight || 200;
          const img = el.querySelector('img');
          const text = el.querySelector('.board-text');

          if (img) {
            const source = await loadImage(img.src);
            ctx.drawImage(source, left, top, width, height);
            continue;
          }

          if (text) {
            ctx.fillStyle = '#ffffff';
            ctx.font = '600 28px Segoe UI';
            ctx.textBaseline = 'top';
            const lines = (text.innerText || '').split('\n');
            lines.forEach((line, index) => {
              ctx.fillText(line, left + 8, top + 8 + index * 34);
            });
          }
        }
      };

      const drawDrawingLayer = async () => {
        if (!drawingDataURL) return;
        try {
          const drawingImage = await loadImage(drawingDataURL);
          ctx.drawImage(
            drawingImage,
            bounds.x, bounds.y, bounds.width, bounds.height,
            0, 0, bounds.width, bounds.height
          );
        } catch {}
      };

      if (!state.drawingLayerOnTop) {
        await drawDrawingLayer();
      }
      await drawElements();
      if (state.drawingLayerOnTop) {
        await drawDrawingLayer();
      }

      const mimeMap = {
        png: 'image/png',
        jpeg: 'image/jpeg',
        webp: 'image/webp'
      };

      return exportCanvas.toDataURL(mimeMap[format] || 'image/png', 0.95);
    }

    // Preview
    const previewBtn = document.getElementById('previewBtn');
    const exitPreview = document.getElementById('exitPreview');
    function togglePreview() {
      document.body.classList.toggle('preview-mode');
      const isPreview = document.body.classList.contains('preview-mode');
      exitPreview.classList.toggle('visible', isPreview);
      if (isPreview) { selectElement(null); closeAllPanels(); }
    }

    async function exportBoard(format) {
      const btn = document.getElementById('exportBtn');
      const extensionMap = { png: 'png', jpeg: 'jpg', webp: 'webp' };

      showToast(`Exporting ${format.toUpperCase()}...`);
      btn.classList.add('export-loading');

      try {
        selectElement(null);
        const dataUrl = await renderExportCanvas(format);
        downloadDataUrl(`${state.title || 'Vibey'}.${extensionMap[format] || 'png'}`, dataUrl);
        showToast(`Board exported as ${format.toUpperCase()}.`);
      } catch (err) {
        showToast('Add at least one layer before export.');
      } finally {
        btn.classList.remove('export-loading');
      }
    }

    document.getElementById('exportBtn').onclick = (e) => {
      document.getElementById('exportMenu').classList.toggle('visible');
      e.stopPropagation();
    };

    previewBtn.onclick = togglePreview;
    exitPreview.onclick = togglePreview;
    document.querySelectorAll('[data-export-format]').forEach((item) => {
      item.onclick = async () => {
        document.getElementById('exportMenu').classList.remove('visible');
        await exportBoard(item.dataset.exportFormat);
      };
    });

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Toolbar Buttons
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    document.querySelectorAll('.tool-item[data-tool]').forEach(btn => {
      btn.onclick = () => updateTool(btn.dataset.tool);
    });

    document.getElementById('imageToolBtn').onclick = () => {
      document.getElementById('fileInput').click();
    };

    document.getElementById('fileInput').onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (re) => {
        const pos = getNextPlacement(280, 200);
        addElement('image', re.target.result, pos.x, pos.y);
        updateTool('select');
      };
      reader.readAsDataURL(file);
      e.target.value = ''; // reset so same file can be re-added
    };

    document.getElementById('toggleQueueBtn').onclick = () => {
      document.getElementById('queuePanel').classList.toggle('visible');
    };

    document.getElementById('toggleLayersBtn').onclick = () => {
      document.getElementById('layersPanel').classList.toggle('visible');
    };

    document.getElementById('newLayerBtn').onclick = () => {
      const { x, y } = screenToBoard(window.innerWidth / 2, window.innerHeight / 2);
      addElement('text', 'New layer', x - 60, y - 20);
      showToast('New layer created');
    };

    document.getElementById('newTextLayerBtn').onclick = () => {
      const { x, y } = screenToBoard(window.innerWidth / 2, window.innerHeight / 2);
      addElement('text', 'Type here', x - 60, y - 20);
      showToast('Text layer created');
    };

    document.getElementById('drawingLayerBtn').onclick = () => {
      selectDrawingLayer();
      updateTool('draw');
      showToast('Drawing layer selected');
    };

    document.getElementById('clearLayerSelectionBtn').onclick = () => {
      state.selectedSpecialLayer = null;
      selectElement(null);
      showToast('Layer selection cleared');
    };

    document.getElementById('layerBringFrontBtn').onclick = () => moveLayerPosition('front');
    document.getElementById('layerMoveUpBtn').onclick = () => moveLayerPosition('up');
    document.getElementById('layerMoveDownBtn').onclick = () => moveLayerPosition('down');
    document.getElementById('layerSendBackBtn').onclick = () => moveLayerPosition('back');

    // FIX: Duplicate â€” ط¨ظٹطھط£ظƒط¯ ط¥ظ† ط§ظ„ظ€ clone ظٹظƒظˆظ† draggable طµط­
    document.getElementById('duplicateBtn').onclick = () => {
      if (!state.selectedId) { showToast('Select a layer first.'); return; }
      const target = document.getElementById(state.selectedId);
      if (!target) return;
      const clone = target.cloneNode(true);
      const newId = 'el-' + createId();
      clone.id = newId;
      clone.classList.remove('selected', 'dragging');
      clone.style.left = (parseFloat(target.style.left) + 40) + 'px';
      clone.style.top  = (parseFloat(target.style.top)  + 40) + 'px';
      clone.dataset.layerName = (target.dataset.layerName || 'Layer') + ' Copy';
      UI.elements.appendChild(clone);
      syncElementStack();
      makeDraggable(clone); // â†گ FIX: ط¨ظٹط¹ظ…ظ„ draggable ط¬ط¯ظٹط¯ ظ„ظ„ظ€ clone
      selectElement(newId);
      updateLayersPanel();
      showToast('Element duplicated.');
    };

    document.getElementById('settingsBtn').onclick = () => {
      document.getElementById('settingsPanel').classList.toggle('visible');
    };

    // Settings panel buttons
    document.getElementById('resetZoomBtn').onclick = () => {
      state.targetZoom = 1;
      state.targetPanX = 0;
      state.targetPanY = 0;
      queueTransformRender();
      showToast('Zoom reset to 100%');
    };
    document.getElementById('clearDrawBtn').onclick = () => {
      const ctx = UI.ctx;
      ctx.clearRect(0, 0, UI.canvas.width, UI.canvas.height);
      drawingDataURL = null;
      showToast('Drawing cleared');
    };
    document.getElementById('deleteSelectedBtn').onclick = () => {
      if (state.selectedId) {
        document.getElementById(state.selectedId)?.remove();
        state.selectedId = null;
        updateLayersPanel();
        showToast('Element deleted');
      } else {
        showToast('Select a layer first.');
      }
    };

    // Zoom Buttons
    document.getElementById('zoomInBtn').onclick  = () => updateZoom(0.1, window.innerWidth/2, window.innerHeight/2);
    document.getElementById('zoomOutBtn').onclick = () => updateZoom(-0.1, window.innerWidth/2, window.innerHeight/2);

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Menu Panel â€” Save/Load/Clear
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    document.getElementById('menuSaveBtn').onclick = () => {
      const data = { title: state.title, elements: [] };
      document.querySelectorAll('.board-item').forEach(el => {
        const img = el.querySelector('img');
        const txt = el.querySelector('.board-text');
        data.elements.push({
          type: img ? 'image' : 'text',
          data: img ? img.src : txt?.innerText,
          x: parseFloat(el.style.left) || 0,
          y: parseFloat(el.style.top) || 0,
          width: el.style.width || ''
        });
      });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (state.title || 'Vibey') + '.json';
      a.click();
      showToast('âœ“ Board saved as JSON');
    };

    document.getElementById('menuLoadBtn').onclick = () => {
      document.getElementById('loadBoardInput').click();
    };
    document.getElementById('loadBoardInput').onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (re) => {
        try {
          const data = JSON.parse(re.target.result);
          UI.elements.innerHTML = '';
          state.selectedId = null;
          state.selectedSpecialLayer = null;
          if (data.title) {
            state.title = data.title;
            document.getElementById('canvasTitle').innerText = data.title;
          }
          (data.elements || []).forEach(el => {
            addElement(el.type, el.data, el.x, el.y);
          });
          syncElementStack();
          updateLayersPanel();
          showToast('âœ“ Board loaded!');
        } catch { showToast('â‌Œ Invalid file'); }
      };
      reader.readAsText(file);
    };

    document.getElementById('menuClearBtn').onclick = () => {
      if (confirm('ظ…ط³ط­ ظƒظ„ ط§ظ„ط¹ظ†ط§طµط±طں')) {
        UI.elements.innerHTML = '';
        state.selectedId = null;
        state.selectedSpecialLayer = null;
        updateLayersPanel();
        showToast('Board cleared');
      }
    };

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Title
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const canvasTitle = document.getElementById('canvasTitle');
    canvasTitle.onblur = () => {
      state.title = canvasTitle.innerText || 'Untitled';
      document.title = state.title + ' - Artist Canvas';
    };
    canvasTitle.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); canvasTitle.blur(); }
    };

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Panel Helpers
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function closeAllPanels(except) {
      ['menuPanel', 'queuePanel', 'layersPanel', 'settingsPanel'].forEach(id => {
        if (id !== except) document.getElementById(id).classList.remove('visible');
      });
    }

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#shareBtn') && !e.target.closest('#shareMenu')) {
        document.getElementById('shareMenu').classList.remove('visible');
      }
      if (!e.target.closest('#exportBtn') && !e.target.closest('#exportMenu')) {
        document.getElementById('exportMenu').classList.remove('visible');
      }
    });

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Keyboard Shortcuts
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    document.addEventListener('keydown', (e) => {
      if (e.target.contentEditable === 'true') return;

      if (e.key === 'v' || e.key === 'V') updateTool('select');
      if (e.key === 'd' || e.key === 'D') updateTool('draw');
      if (e.key === 't' || e.key === 'T') updateTool('text');
      if (e.key === 'i' || e.key === 'I') document.getElementById('fileInput').click();
      if (e.key === 'q' || e.key === 'Q') document.getElementById('toggleQueueBtn').click();
      if (e.key === 'l' || e.key === 'L') document.getElementById('toggleLayersBtn').click();
      if (e.key === 's' || e.key === 'S') document.getElementById('settingsBtn').click();
      if (e.key === '=' || e.key === '+') updateZoom(0.1, window.innerWidth/2, window.innerHeight/2);
      if (e.key === '-') updateZoom(-0.1, window.innerWidth/2, window.innerHeight/2);
      if (e.key === 'ArrowLeft') { e.preventDefault(); panBoard(120, 0); }
      if (e.key === 'ArrowRight') { e.preventDefault(); panBoard(-120, 0); }
      if (e.key === 'ArrowUp') { e.preventDefault(); panBoard(0, 120); }
      if (e.key === 'ArrowDown') { e.preventDefault(); panBoard(0, -120); }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.selectedId) {
          document.getElementById(state.selectedId)?.remove();
          state.selectedId = null;
          updateLayersPanel();
        }
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        document.getElementById('duplicateBtn').click();
      }
      if (e.key === 'Escape') {
        closeAllPanels();
        selectElement(null);
        if (document.body.classList.contains('preview-mode')) togglePreview();
      }
    });

    // Init
    updateDrawingLayerPosition();
    bindLayersPanelEvents();
    updateLayersPanel();
    initPanelDragging('menuPanel');
    initPanelDragging('queuePanel');
    initPanelDragging('layersPanel');
    initPanelDragging('settingsPanel');
    applyTransform();

