'use strict';

/* 危险区地图界面：走格子 / 迷雾 / 战利品 / 日志 */

/* global ui, run, meta, el, btn, bar, topBar, logPanel, cardEl, goldText,
   CARDS, POTIONS, TILE, TILE_ACTION, ENEMIES, BUFFS, EVENTS, RARITY, canMoveTo, walkTo, tileAt,
   currentSceneTile, performSceneAction, runTotals, POTION_SLOTS, buffDesc, buffScopeText, cardSellPrice,
   refresh, openPileView, flushBattleFx, enterCurrentScene, WORLD_BIOMES, ensureTile, debugPlaceTile,
   biomeColorAt, worldDangerAt */

let biomeBackdropCache = null;
let fogBackdropCache = null;
let mapPanState = null;
let mapClickSuppressed = false;
let mapCameraRun = null;
let mapCameraWorld = null;
let mapViewRevision = 0;
let mapMoveAnimating = false;

function deckIds() {
  const out = [];
  for (let i = 0; i < run.deck.length; i++) out.push(run.deck[i].id);
  return out;
}

function mapView() {
  const map = run.map;
  if (mapCameraRun !== run) {
    mapCameraRun = run;
    mapCameraWorld = { c: map.start.c, r: map.start.r };
  }
  const current = { c: run.pos.c, r: run.pos.r };
  const visibleTiles = Object.values(map.tiles).filter(
    (t) => t.visited || t.revealed || Math.hypot(t.c - current.c, t.r - current.r) <= 3.25,
  );
  for (let r = current.r - 4; r <= current.r + 4; r++) {
    for (let c = current.c - 4; c <= current.c + 4; c++) {
      if (Math.hypot(c - current.c, r - current.r) > 3.25) continue;
      const t = tileAt(map, c, r) || ensureTile(map, c, r);
      if (t && !visibleTiles.includes(t)) visibleTiles.push(t);
    }
  }
  const minC = Math.min(...visibleTiles.map((t) => t.c));
  const maxC = Math.max(...visibleTiles.map((t) => t.c));
  const minR = Math.min(...visibleTiles.map((t) => t.r));
  const maxR = Math.max(...visibleTiles.map((t) => t.r));
  const zoom = Math.max(0.7, Math.min(1.5, Number(ui.mapZoom) || 1));
  const cellSize = 84 * zoom;
  const stride = 94 * zoom;
  const mapPadX = 640;
  const mapPadY = 360;
  const grid = el('div', { class: 'map-grid' });
  grid.style.display = 'block';
  grid.style.position = 'relative';
  const worldWidth = Math.max(cellSize, (maxC - minC) * stride + cellSize);
  const worldHeight = Math.max(cellSize, (maxR - minR) * stride + cellSize);
  grid.style.width = worldWidth + mapPadX * 2 + 'px';
  grid.style.height = worldHeight + mapPadY * 2 + 'px';
  const backdrop = el('canvas', { class: 'map-noise-background', 'aria-hidden': 'true' });
  backdrop.style.left = mapPadX + 'px';
  backdrop.style.top = mapPadY + 'px';
  paintBiomeBackdrop(backdrop, map, minC, minR, maxC, maxR, worldWidth + 'px', worldHeight + 'px');
  grid.appendChild(backdrop);
  const fogBackdrop = el('canvas', { class: 'map-fog-background', 'aria-hidden': 'true' });
  fogBackdrop.style.left = mapPadX + 'px';
  fogBackdrop.style.top = mapPadY + 'px';
  try {
    paintFogBackdrop(
      fogBackdrop,
      map,
      minC,
      minR,
      maxC,
      maxR,
      worldWidth,
      worldHeight,
      stride,
      cellSize,
    );
  } catch (error) {
    console.warn('迷雾背景绘制失败，地图将继续显示。', error);
    fogBackdrop.width = 0;
    fogBackdrop.height = 0;
  }
  grid.appendChild(fogBackdrop);
  visibleTiles.forEach((t) => {
    const cell = tileCell(t);
    cell.style.position = 'absolute';
    cell.style.left = mapPadX + (t.c - minC) * stride + 'px';
    cell.style.top = mapPadY + (t.r - minR) * stride + 'px';
    cell.style.width = cellSize + 'px';
    cell.style.height = cellSize + 'px';
    grid.appendChild(cell);
  });
  const revision = ++mapViewRevision;
  requestAnimationFrame(() => {
    if (revision !== mapViewRevision) return;
    const viewport = document.getElementById('map-viewport');
    if (!viewport) return;
    viewport.scrollLeft = Math.max(
      0,
      mapPadX + (mapCameraWorld.c - minC) * stride + cellSize / 2 - viewport.clientWidth / 2 - 12,
    );
    viewport.scrollTop = Math.max(
      0,
      mapPadY + (mapCameraWorld.r - minR) * stride + cellSize / 2 - viewport.clientHeight / 2 - 12,
    );
  });

  const cur = tileAt(map, run.pos.c, run.pos.r);
  const curEvent =
    cur && cur.type === 'event' && cur.sceneData ? EVENTS[cur.sceneData.eventId] : null;
  const biome = cur && WORLD_BIOMES[cur.environment];
  return el('div', { class: 'screen map-screen' }, [
    topBar(),
    el('div', { class: 'map-main' }, [
      el('div', { class: 'map-center' }, [
        el('div', { class: 'map-head' }, [
          el('div', { class: 'map-head-info' }, [
            el('div', {
              class: 'map-head-title',
              text: `${run.zone.emoji} 无尽大世界${biome ? ` · ${biome.emoji} ${biome.name}` : ''}`,
            }),
            el('div', {
              class: 'map-head-sub',
              text: `坐标 (${run.pos.c}, ${run.pos.r}) · 危险度 ${run.danger}（离世界中心 ${worldDangerAt(run.pos.c, run.pos.r, run.map.start)} 格） · 已探索 ${countVisited()} 格 · 已击败 ${run.kills}`,
            }),
            el('div', {
              class: 'map-head-current',
              text: cur
                ? `${curEvent ? curEvent.title : TILE[cur.type].name} · ${cur.cleared ? '已处理' : cur.spawned ? '待处理' : '已发现'} · 战利品 ${run.loot.length + run.secure.length} · 金币 ${run.gold}`
                : '查看周边地点',
            }),
          ]),
          el('div', { class: 'map-controls' }, [
            btn('−', 'ghost small map-zoom-button', () => changeMapZoom(-0.1)),
            el('span', { class: 'map-zoom-label', text: Math.round(zoom * 100) + '%' }),
            btn('+', 'ghost small map-zoom-button', () => changeMapZoom(0.1)),
            btn('◎ 世界中心', 'ghost small', () => centerMapAt(0, 0)),
            btn('🧙 找到玩家', 'ghost small', () => centerMapAt(run.pos.c, run.pos.r)),
            btn('🃏 卡组', 'ghost small', () =>
              openPileView('🃏 当前卡组', deckIds(), '本次行动获得的新卡也在其中'),
            ),
            btn('🎒 背包', 'ghost small', () => {
              ui.modal = { kind: 'bag' };
              refresh();
            }),
            btn(ui.mapLogOpen ? '收起日志' : '📜 日志', 'ghost small', () => {
              ui.mapLogOpen = !ui.mapLogOpen;
              refresh();
            }),
            btn('📖 帮助', 'ghost small', () => {
              ui.modal = { kind: 'help' };
              refresh();
            }),
            btn(ui.mapDebug.open ? '关闭调试器' : '🧰 地块调试器', 'ghost small', () => {
              ui.mapDebug.open = !ui.mapDebug.open;
              ui.mapDebug.active = false;
              refresh();
            }),
          ]),
        ]),
        el(
          'div',
          {
            class: 'map-viewport',
            id: 'map-viewport',
            'data-map-min-c': minC,
            'data-map-min-r': minR,
            'data-map-stride': stride,
            'data-map-pad-x': mapPadX,
            'data-map-pad-y': mapPadY,
            'data-map-cell-size': cellSize,
            onpointerdown: beginMapPan,
            onpointermove: moveMapPan,
            onpointerup: endMapPan,
            onpointercancel: endMapPan,
          },
          [
            grid,
            el('div', { class: 'map-viewport-legend' }, [
              environmentLegend(),
              el('div', {
                class: 'map-pan-hint',
                text: '按住鼠标拖动地图 · 点击相邻地块移动 · 探索过的区域会持续保留',
              }),
            ]),
            tileActionBar(cur),
            mapDebugPanel(),
            mapLogPanel(),
          ],
        ),
      ]),
    ]),
  ]);
}

function changeMapZoom(delta) {
  ui.mapZoom = Math.max(0.7, Math.min(1.5, (Number(ui.mapZoom) || 1) + delta));
  refresh();
}

function centerMapAt(c, r) {
  mapCameraWorld = { c, r };
  refresh();
}

function animatePlayerMove(c, r) {
  if (mapMoveAnimating || !canMoveTo(c, r)) return;
  const viewport = document.getElementById('map-viewport');
  const grid = viewport && viewport.querySelector('.map-grid');
  if (!viewport || !grid) return;
  const from = { c: run.pos.c, r: run.pos.r };
  const fromTile = grid.querySelector(`[data-tile-c="${from.c}"][data-tile-r="${from.r}"]`);
  if (!fromTile) return;

  const stride = Number(viewport.dataset.mapStride) || 94;
  const cellSize = Number(viewport.dataset.mapCellSize) || (stride * 84) / 94;
  const padX = Number(viewport.dataset.mapPadX) || 0;
  const padY = Number(viewport.dataset.mapPadY) || 0;
  const minC = Number(viewport.dataset.mapMinC) || 0;
  const minR = Number(viewport.dataset.mapMinR) || 0;
  const targetLeft = (Number(fromTile.style.left.replace('px', '')) || 0) + (c - from.c) * stride;
  const targetTop = (Number(fromTile.style.top.replace('px', '')) || 0) + (r - from.r) * stride;
  const sprite = el('div', { class: 'player-travel-sprite', 'aria-hidden': 'true' }, [
    el('span', { text: '🧙' }),
  ]);
  sprite.style.left = fromTile.style.left;
  sprite.style.top = fromTile.style.top;
  sprite.style.width = cellSize + 'px';
  sprite.style.height = cellSize + 'px';
  grid.appendChild(sprite);
  fromTile.classList.add('player-departing');
  viewport.classList.add('map-moving');
  mapMoveAnimating = true;

  requestAnimationFrame(() => {
    sprite.style.transform = `translate(${targetLeft - Number(fromTile.style.left.replace('px', ''))}px, ${targetTop - Number(fromTile.style.top.replace('px', ''))}px)`;
    const desiredLeft = padX + (c - minC) * stride + cellSize / 2 - viewport.clientWidth / 2 - 12;
    const desiredTop = padY + (r - minR) * stride + cellSize / 2 - viewport.clientHeight / 2 - 12;
    viewport.scrollTo({
      left: Math.max(0, desiredLeft),
      top: Math.max(0, desiredTop),
      behavior: 'smooth',
    });
  });

  setTimeout(() => {
    mapMoveAnimating = false;
    mapCameraWorld = { c, r };
    viewport.classList.remove('map-moving');
    const moved = walkTo(c, r);
    if (moved) {
      refresh();
      if (ui.screen === 'battle') flushBattleFx(120);
    } else {
      refresh();
    }
  }, 300);
}

function beginMapPan(event) {
  if (
    mapMoveAnimating ||
    event.button !== 0 ||
    !event.isPrimary ||
    event.target.closest('.map-log-overlay, .map-debug-panel, .map-viewport-legend')
  )
    return;
  const viewport = event.currentTarget;
  const captureTarget = event.target.closest('.tile') || viewport;
  mapPanState = {
    pointerId: event.pointerId,
    viewport,
    captureTarget,
    x: event.clientX,
    y: event.clientY,
    scrollLeft: viewport.scrollLeft,
    scrollTop: viewport.scrollTop,
    dragged: false,
  };
  if (captureTarget.setPointerCapture) captureTarget.setPointerCapture(event.pointerId);
}

function moveMapPan(event) {
  if (!mapPanState || event.pointerId !== mapPanState.pointerId) return;
  const dx = event.clientX - mapPanState.x;
  const dy = event.clientY - mapPanState.y;
  if (!mapPanState.dragged && Math.hypot(dx, dy) < 5) return;
  mapPanState.dragged = true;
  mapPanState.viewport.classList.add('is-panning');
  mapPanState.viewport.scrollLeft = mapPanState.scrollLeft - dx;
  mapPanState.viewport.scrollTop = mapPanState.scrollTop - dy;
  const minC = Number(mapPanState.viewport.dataset.mapMinC) || 0;
  const minR = Number(mapPanState.viewport.dataset.mapMinR) || 0;
  const stride = Number(mapPanState.viewport.dataset.mapStride) || 94;
  const padX = Number(mapPanState.viewport.dataset.mapPadX) || 0;
  const padY = Number(mapPanState.viewport.dataset.mapPadY) || 0;
  const cellSize = Number(mapPanState.viewport.dataset.mapCellSize) || (stride * 84) / 94;
  mapCameraWorld = {
    c:
      minC +
      (mapPanState.viewport.scrollLeft +
        mapPanState.viewport.clientWidth / 2 -
        12 -
        padX -
        cellSize / 2) /
        stride,
    r:
      minR +
      (mapPanState.viewport.scrollTop +
        mapPanState.viewport.clientHeight / 2 -
        12 -
        padY -
        cellSize / 2) /
        stride,
  };
  event.preventDefault();
}

function endMapPan(event) {
  if (!mapPanState || event.pointerId !== mapPanState.pointerId) return;
  const { viewport, captureTarget, dragged } = mapPanState;
  mapPanState = null;
  viewport.classList.remove('is-panning');
  if (dragged) {
    mapClickSuppressed = true;
    setTimeout(() => {
      mapClickSuppressed = false;
    }, 0);
  }
  if (captureTarget.hasPointerCapture && captureTarget.hasPointerCapture(event.pointerId)) {
    captureTarget.releasePointerCapture(event.pointerId);
  }
}

function consumeMapDragClick(event) {
  if (!mapClickSuppressed) return false;
  mapClickSuppressed = false;
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function sceneView() {
  const t = currentSceneTile();
  if (!t) return mapView();
  const info = TILE[t.type];
  const data = t.sceneData || {};
  const spec = TILE_ACTION[t.type] || { label: '处理地点', hint: '选择操作' };
  const event = t.type === 'event' && data.eventId ? EVENTS[data.eventId] : null;
  const rows = [];
  let detail = spec.hint;
  if (t.type === 'empty') detail = '石块间藏着一些遗物，值得仔细翻找。';
  if (t.type === 'loot') {
    detail = `箱中可见 ${data.cards.map((id) => CARDS[id].name).join('、')}，以及 ${data.gold} 金币。`;
  }
  if (t.type === 'potion') detail = `药剂箱中有「${POTIONS[data.potionId].name}」。`;
  if (t.type === 'buff') detail = '符文石浮现出三种力量，你可以选择一种带走，也可以放弃。';
  if (t.type === 'event') {
    detail = event.text;
  }
  if (t.type === 'hazard')
    detail = `腐化液封住了前路。穿过会损失 ${data.damage} 点生命，也可以暂时离开。`;
  if (t.type === 'shop') detail = '旅商摆出了卡牌与药剂，也愿意收购或升级你的卡牌。';
  if (t.type === 'fire')
    detail = `火堆尚未熄灭。你当前生命 ${run.hp}/${run.maxHp}，可休息或升级一张卡。`;
  if (t.type === 'extract')
    detail = '撤离法阵已经稳定。你可以带着当前战利品返回安全区，或继续探索。';
  if (data.result) detail = data.result;

  if (t.cleared) {
    rows.push(btn('返回地图', 'primary big', () => performSceneAction('leave')));
  } else if (t.type === 'empty') {
    rows.push(btn('翻找遗迹', 'primary big', () => performSceneAction('search')));
  } else if (t.type === 'loot') {
    rows.push(btn('收集物资', 'primary big', () => performSceneAction('collect')));
  } else if (t.type === 'potion') {
    rows.push(btn('拿取药剂', 'primary big', () => performSceneAction('take-potion')));
  } else if (t.type === 'buff') {
    data.buffIds.forEach((id) => {
      const b = BUFFS[id];
      rows.push(
        el(
          'button',
          {
            class: 'scene-option',
            onclick: () => performSceneAction('take-buff:' + id),
          },
          [
            el('span', { class: 'scene-option-icon', text: b.emoji }),
            el('span', { class: 'scene-option-copy' }, [
              el('strong', { text: b.name }),
              el('small', { text: buffDesc(b) }),
            ]),
            el('span', { class: 'scene-option-mark', text: '选择' }),
          ],
        ),
      );
    });
  } else if (t.type === 'event' && !data.result) {
    const event = EVENTS[data.eventId];
    event.options.forEach((option, index) => {
      const enabled = !option.canChoose || option.canChoose();
      rows.push(
        el(
          'button',
          {
            class: 'scene-option' + (enabled ? '' : ' disabled'),
            disabled: !enabled,
            onclick: enabled ? () => performSceneAction('event:' + index) : null,
          },
          [
            el('span', { class: 'scene-option-copy' }, [
              el('strong', { text: option.label }),
              el('small', {
                text: enabled ? option.hint : option.disabledHint || option.hint + '（条件不满足）',
              }),
            ]),
            el('span', { class: 'scene-option-mark', text: '选择' }),
          ],
        ),
      );
    });
  } else if (t.type === 'shop') {
    rows.push(btn('查看货架与交易', 'primary big', () => performSceneAction('shop')));
  } else if (t.type === 'fire') {
    rows.push(btn('休息或升级', 'primary big', () => performSceneAction('fire')));
  } else if (t.type === 'hazard') {
    rows.push(btn('穿过危险区域', 'primary big', () => performSceneAction('hazard')));
  } else if (t.type === 'extract') {
    rows.push(btn('撤离', 'primary big', () => performSceneAction('extract')));
    rows.push(btn('继续探索', 'ghost big', () => performSceneAction('leave')));
  }
  if (!t.cleared && t.type !== 'extract') {
    rows.push(btn('离开场景', 'ghost big', () => performSceneAction('leave')));
  }

  return el('div', { class: 'screen scene-screen' }, [
    topBar(),
    el('div', { class: 'scene-shell' }, [
      el('div', { class: 'scene-heading' }, [
        el('div', { class: 'scene-heading-icon', text: info.emoji }),
        el('div', { class: 'scene-heading-copy' }, [
          el('div', { class: 'scene-kicker', text: '地点场景 · 危险度 ' + run.danger }),
          el('h1', { text: event ? event.title : info.name }),
        ]),
        el('div', { class: 'scene-location', text: `第 ${run.steps} 步 · ${run.zone.name}` }),
      ]),
      el('div', { class: 'scene-content' }, [
        el('div', { class: 'scene-content-label', text: t.cleared ? '处理结果' : '场景情况' }),
        el('div', { class: 'scene-description', text: detail }),
      ]),
      el('div', { class: 'scene-actions' }, rows),
      el('div', {
        class: 'scene-footnote',
        text: t.cleared
          ? '此地点已处理，不会重复获得奖励。'
          : '离开不会处理地点；之后可以从当前位置重新进入。',
      }),
    ]),
  ]);
}

function openCurrentScene() {
  if (!run || run.mode !== 'map' || ui.screen !== 'map' || ui.modal) return;
  if (!enterCurrentScene()) return;
  refresh();
}

function countVisited() {
  return Object.values(run.map.tiles).filter((t) => t.visited).length;
}

function environmentLegend() {
  return el(
    'div',
    { class: 'map-environment-legend', 'aria-label': '环境图例' },
    Object.entries(WORLD_BIOMES).map(([id, biome]) =>
      el('span', { class: 'map-environment-chip biome-chip-' + id }, [
        el('i', { class: 'environment-swatch' }),
        el('span', { text: biome.emoji + ' ' + biome.name }),
      ]),
    ),
  );
}

function paintBiomeBackdrop(canvas, map, minC, minR, maxC, maxR, cssWidth, cssHeight) {
  const columns = maxC - minC + 1;
  const rows = maxR - minR + 1;
  const pixelBudget = 60000;
  const pixelsPerTile = Math.max(
    1,
    Math.min(16, Math.floor(Math.sqrt(pixelBudget / (columns * rows)))),
  );
  const width = columns * pixelsPerTile;
  const height = rows * pixelsPerTile;
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = cssWidth;
  canvas.style.height = cssHeight;
  const key = `${map.biomeSeed}:${minC}:${minR}:${maxC}:${maxR}`;
  const context = canvas.getContext('2d');
  if (!context) return;
  if (
    biomeBackdropCache &&
    biomeBackdropCache.key === key &&
    biomeBackdropCache.width === width &&
    biomeBackdropCache.height === height
  ) {
    context.drawImage(biomeBackdropCache.canvas, 0, 0, width, height);
    return;
  }
  const cacheCanvas = document.createElement('canvas');
  cacheCanvas.width = width;
  cacheCanvas.height = height;
  const cacheContext = cacheCanvas.getContext('2d');
  if (!cacheContext) return;
  const image = cacheContext.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = biomeColorAt(
        map,
        minC + (x + 0.5) / pixelsPerTile,
        minR + (y + 0.5) / pixelsPerTile,
      );
      const index = (y * width + x) * 4;
      image.data[index] = color[0];
      image.data[index + 1] = color[1];
      image.data[index + 2] = color[2];
      image.data[index + 3] = 255;
    }
  }
  cacheContext.putImageData(image, 0, 0);
  biomeBackdropCache = { key, width, height, canvas: cacheCanvas };
  context.drawImage(cacheCanvas, 0, 0, width, height);
}

function paintFogBackdrop(
  canvas,
  map,
  minC,
  minR,
  maxC,
  maxR,
  cssWidth,
  cssHeight,
  stride,
  cellSize,
) {
  const columns = maxC - minC + 1;
  const rows = maxR - minR + 1;
  const pixelsPerTile = Math.max(1, Math.min(16, Math.floor(Math.sqrt(60000 / (columns * rows)))));
  canvas.width = columns * pixelsPerTile;
  canvas.height = rows * pixelsPerTile;
  canvas.style.width = cssWidth + 'px';
  canvas.style.height = cssHeight + 'px';
  const context = canvas.getContext('2d');
  if (!context) return;

  const visitedTiles = Object.values(map.tiles).filter(
    (tile) => tile.visited || tile.type === 'start',
  );
  if (!visitedTiles.some((tile) => tile.c === run.pos.c && tile.r === run.pos.r)) {
    visitedTiles.push({ c: run.pos.c, r: run.pos.r });
  }
  const visitedKey = visitedTiles
    .map((tile) => `${tile.c},${tile.r}`)
    .sort()
    .join(';');
  const cacheKey = `${map.biomeSeed}:${minC}:${minR}:${maxC}:${maxR}:${visitedKey}`;
  if (
    fogBackdropCache &&
    fogBackdropCache.key === cacheKey &&
    fogBackdropCache.width === canvas.width &&
    fogBackdropCache.height === canvas.height
  ) {
    context.drawImage(fogBackdropCache.canvas, 0, 0);
    return;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(8, 12, 17, 1)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = 'destination-out';

  const scaleX = canvas.width / cssWidth;
  const scaleY = canvas.height / cssHeight;
  const radius = 2.45;
  const edgeVariation = 0.72;
  visitedTiles.forEach((tile) => {
    const centerX = ((tile.c - minC) * stride + cellSize / 2) * scaleX;
    const centerY = ((tile.r - minR) * stride + cellSize / 2) * scaleY;
    const baseRadiusX = radius * stride * scaleX;
    const baseRadiusY = radius * stride * scaleY;
    const seed = map.biomeSeed + tile.c * 374761393 + tile.r * 668265263;
    const phaseA = ((Math.sin(seed * 0.000001) + 1) * Math.PI) / 2;
    const phaseB = ((Math.sin(seed * 0.000002) + 1) * Math.PI) / 2;

    context.beginPath();
    for (let i = 0; i <= 64; i++) {
      const angle = (i / 64) * Math.PI * 2;
      const edgeNoise =
        Math.sin(angle * 3 + phaseA) * 0.52 +
        Math.sin(angle * 5 + phaseB) * 0.3 +
        Math.sin(angle * 9 + phaseA + phaseB) * 0.18;
      const localRadius = radius + edgeNoise * (edgeVariation / 2);
      const x = centerX + Math.cos(angle) * baseRadiusX * (localRadius / radius);
      const y = centerY + Math.sin(angle) * baseRadiusY * (localRadius / radius);
      if (i === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.shadowBlur = 3 * Math.min(scaleX, scaleY);
    context.shadowColor = 'rgba(0, 0, 0, 0.8)';
    context.fill();
  });

  context.globalCompositeOperation = 'source-over';
  context.shadowBlur = 0;
  const cacheCanvas = document.createElement('canvas');
  cacheCanvas.width = canvas.width;
  cacheCanvas.height = canvas.height;
  const cacheContext = cacheCanvas.getContext('2d');
  if (cacheContext) {
    cacheContext.drawImage(canvas, 0, 0);
    fogBackdropCache = {
      key: cacheKey,
      width: canvas.width,
      height: canvas.height,
      canvas: cacheCanvas,
    };
  }
}

function tileCell(t) {
  const reach = canMoveTo(t.c, t.r);
  const isHere = run.pos.c === t.c && run.pos.r === t.r;
  const info = TILE[t.type];
  const blocked = !!(t.terrain && t.terrain.blocked);
  const biome = WORLD_BIOMES[t.environment];
  if (t.visited) t.revealed = true;
  const pending = t.spawned && !t.cleared && t.type !== 'start';
  const foes = pending && t.payload ? t.payload.map((id) => ENEMIES[id].emoji).join('') : '';
  const cls = [
    'tile',
    't-' + t.type,
    t.revealed ? '' : 'fogged',
    t.visited ? 'visited' : '',
    t.cleared ? 'cleared' : '',
    pending ? 'pending' : '',
    reach ? 'reachable' : '',
    isHere ? 'here' : '',
    blocked ? 'terrain-blocked' : '',
    'biome-' + t.environment,
    ui.mapDebug.active ? 'debug-placeable' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const kids = [];
  if (t.revealed) {
    if (biome) {
      kids.push(
        el('div', {
          class: 'tile-biome-badge biome-chip-' + t.environment,
          text: biome.emoji + ' ' + biome.name,
        }),
      );
    }
    if (blocked) {
      kids.push(
        el('div', { class: 'terrain-3d-icon', 'aria-hidden': 'true' }, [
          el('span', { class: 'terrain-3d-shadow' }),
          el('span', { class: 'terrain-3d-object', text: t.terrain.emoji || '🧱' }),
        ]),
      );
    } else {
      kids.push(el('div', { class: 'tile-emoji', text: info.emoji }));
    }
    kids.push(
      el('div', {
        class: 'tile-name',
        text: blocked
          ? t.terrain.name || '障碍物'
          : foes
            ? foes
            : t.type === 'event' && t.spawned && t.sceneData && EVENTS[t.sceneData.eventId]
              ? EVENTS[t.sceneData.eventId].title
              : t.cleared && t.type !== 'extract'
                ? '已处理'
                : info.name,
      }),
    );
  } else {
    kids.push(el('div', { class: 'tile-emoji', text: '❓' }));
    kids.push(el('div', { class: 'tile-name', text: '' }));
  }
  if (pending) kids.push(el('div', { class: 'tile-new', text: '待处理' }));
  if (reach && !isHere) kids.push(el('div', { class: 'tile-move-hint', text: '移动' }));
  if (reach && t.type === 'hazard' && !t.cleared) {
    kids.push(el('div', { class: 'tile-risk-hint', text: '进入危险场景' }));
  }
  if (isHere) {
    kids.push(
      el('div', { class: 'tile-here', 'aria-label': '玩家当前位置' }, [
        el('span', { class: 'player-location-icon', text: '🧙' }),
        el('span', { class: 'player-location-label', text: '你' }),
      ]),
    );
  }
  return el(
    'div',
    {
      class: cls,
      'data-tile-c': t.c,
      'data-tile-r': t.r,
      title: blocked
        ? `${t.terrain.name || '障碍物'}：无法通过`
        : biome
          ? `${biome.name}${t.terrain.moveDamage ? ` · 移动损失 ${t.terrain.moveDamage} 生命` : ''}${t.terrain.battleDamage ? ` · 战斗每回合双方全体损失 ${t.terrain.battleDamage} 生命` : ''}`
          : '',
      onclick: ui.mapDebug.active
        ? (event) => {
            if (consumeMapDragClick(event)) return;
            debugPlaceTile(t.c, t.r);
            refresh();
          }
        : reach
          ? (event) => {
              if (consumeMapDragClick(event)) return;
              animatePlayerMove(t.c, t.r);
            }
          : isHere && pending
            ? (event) => {
                if (consumeMapDragClick(event)) return;
                openCurrentScene();
              }
            : null,
    },
    kids,
  );
}

/* 地图只负责显示地点与移动；当前地点的操作都在场景界面中。 */
function tileActionBar(cur) {
  if (!cur) return el('div', { class: 'tile-actions' });
  return el('div', { class: 'tile-actions' }, [
    el('div', {
      class: 'hint-text',
      text:
        cur.terrain && cur.terrain.moveDamage
          ? `${WORLD_BIOMES[cur.environment].name}：移动穿过此地会损失 ${cur.terrain.moveDamage} 点生命。相邻墙壁不可通过。`
          : cur.terrain && cur.terrain.battleDamage
            ? `${WORLD_BIOMES[cur.environment].name}：战斗每回合双方全体损失 ${cur.terrain.battleDamage} 点生命。相邻墙壁不可通过。`
            : cur.spawned && !cur.cleared
              ? '地点内容尚未处理；点击当前位置可重新进入场景。'
              : '点击相邻地块移动并进入地点场景；世界会随探索延伸。',
    }),
  ]);
}

function mapDebugPanel() {
  const tool = ui.mapDebug;
  if (!tool.open) return null;
  const tileOptions = Object.keys(TILE).filter((id) => id !== 'start');
  const select = (value, entries, onChange) =>
    el(
      'select',
      { class: 'map-debug-select', value, onchange: (event) => onChange(event.target.value) },
      entries.map((entry) =>
        el('option', {
          value: entry.value,
          text: entry.label,
          selected: entry.value === value,
        }),
      ),
    );
  return el('div', { class: 'map-debug-panel' }, [
    el('strong', { text: '地块调试器' }),
    el('label', { class: 'map-debug-field' }, [
      el('span', { text: '地点' }),
      select(
        tool.tileType,
        tileOptions.map((id) => ({ value: id, label: TILE[id].emoji + ' ' + TILE[id].name })),
        (value) => {
          tool.tileType = value;
          refresh();
        },
      ),
    ]),
    el('label', { class: 'map-debug-field' }, [
      el('span', { text: '环境' }),
      select(
        tool.biome,
        Object.entries(WORLD_BIOMES).map(([id, biome]) => ({
          value: id,
          label: biome.emoji + ' ' + biome.name,
        })),
        (value) => {
          tool.biome = value;
          refresh();
        },
      ),
    ]),
    el('label', { class: 'map-debug-wall' }, [
      el('input', {
        type: 'checkbox',
        checked: tool.wall,
        onchange: (event) => {
          tool.wall = event.target.checked;
          refresh();
        },
      }),
      el('span', { text: '放置时设为不可通过的墙壁' }),
    ]),
    btn(
      tool.active ? '退出放置模式' : '启用放置模式',
      tool.active ? 'primary small' : 'ghost small',
      () => {
        tool.active = !tool.active;
        refresh();
      },
    ),
    el('small', {
      text: tool.active
        ? '点击地图上任意可见坐标放置，不会移动玩家。'
        : '选好地点和环境后启用放置模式。',
    }),
  ]);
}

function mapLogPanel() {
  if (!ui.mapLogOpen) return null;
  return el('div', { class: 'map-log-overlay' }, [
    el('div', { class: 'map-log-heading' }, [
      el('strong', { text: '📜 行动日志' }),
      btn('收起', 'ghost small', () => {
        ui.mapLogOpen = false;
        refresh();
      }),
    ]),
    logPanel('', run.log.slice(-10), 'tall'),
  ]);
}
