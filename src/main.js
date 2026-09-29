'use strict';

/* =====================================================================
 *  撤离区 EXTRACTION ZONE  (搜打撤 × 卡牌构筑)
 *  ------------------------------------------------------------------
 *  玩法：安全区配装 → 危险区走格子搜刮/战斗/变强 → 抵达撤离法阵带回战利品；
 *        阵亡则本次战利品与已消耗卡牌全丢。危险度随离世界中心的距离增加。
 *  ------------------------------------------------------------------
 *  结构：core(工具/常量/状态/存档/SDK) → data(卡牌/敌人/消耗品/buff/事件)
 *        → systems(地图/战斗/局内/安全区) → ui(DOM 渲染) → main(入口)
 * ===================================================================== */

/* global ui, run, meta, App, refresh, clearNode, el, btn, safeView, spawnView, mapView, sceneView, battleView, resultView,
   modalView, toastView, loadMeta, saveMeta, ensureStarter, refreshSafeShop, refreshUnlocks,
   startRun, autoLoadout, endTurn, pickCard, canPlay, battleOver, resolveBattle, VIEW_W, VIEW_H,
   Toy, addLog, cancelTargeting, confirmTarget, moveTargetCursor, flushBattleFx,
   finishBattleWhenFxDone, closeModal, prepareSafeZone, syncBattleFxContext,
   afterBattleRender, endBattleTurn, validateGameContent, saveState, ENEMIES, SUMMONS,
   WORLD_TILE_IMAGE, WORLD_TERRAIN_IMAGE, WORLD_BLOCKED_IMAGE, WORLD_FEATURE_IMAGE,
   WORLD_PLAYER_IMAGE, WORLD_SUMMON_IMAGE */

/* ===================== 舞台缩放 ===================== */
function fitStage() {
  const stage = document.getElementById('stage');
  if (!stage) return;
  const k = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  stage.style.transform = `translate(-50%, -50%) scale(${k})`;
  ui.scale = k;
}
window.addEventListener('resize', fitStage);

/* ===================== 渲染 ===================== */
let renderedContext = '';
const SCROLL_REGIONS =
  '.card-grid, .sell-list, .log-body, .zone-list, .loadout-chips, .spawn-stage-options, .modal, .help-body, .scene-shell';

function viewContext() {
  return [
    ui.screen,
    ui.screen === 'safe' ? ui.safeTab : '',
    run && run.battle ? run.battle.turn : '',
    ui.modal ? ui.modal.kind : '',
    ui.modal ? ui.modal.title || '' : '',
  ].join(':');
}

/* 全量重渲染只保存纯值；重新查询新节点，不把旧 DOM 留在事件闭包中。 */
function captureViewPosition(root) {
  const nodes = [...root.querySelectorAll(SCROLL_REGIONS)];
  const active = document.activeElement;
  return {
    scroll: nodes.map((node) => ({ top: node.scrollTop, left: node.scrollLeft })),
    focus:
      active && root.contains(active)
        ? {
            id: active.id,
            key: active.getAttribute('data-focus-key'),
            text: active.getAttribute('aria-label') || active.textContent,
            tag: active.tagName,
            inModal: !!(
              root.querySelector('.modal') && root.querySelector('.modal').contains(active)
            ),
          }
        : null,
  };
}

function restoreViewPosition(root, position) {
  [...root.querySelectorAll(SCROLL_REGIONS)].forEach((node, i) => {
    const value = position.scroll[i];
    if (value) {
      node.scrollTop = value.top;
      node.scrollLeft = value.left;
    }
  });
  const focus = position.focus;
  if (!focus) return;
  const scope = focus.inModal ? root.querySelector('.modal') || root : root;
  const target = [...scope.querySelectorAll('button, input, select, textarea, [tabindex]')].find(
    (node) =>
      !node.disabled &&
      node.getAttribute('aria-disabled') !== 'true' &&
      (focus.id
        ? node.id === focus.id
        : focus.key
          ? node.getAttribute('data-focus-key') === focus.key
          : node.tagName === focus.tag &&
            (node.getAttribute('aria-label') || node.textContent) === focus.text),
  );
  if (target) target.focus({ preventScroll: true });
}

function loadingView() {
  return el('div', { class: 'screen loading-screen' }, [
    el('div', { class: 'loading-emoji', text: '🎒' }),
    el('div', { class: 'loading-title', text: '撤离区' }),
    el('div', { class: 'loading-sub', text: '正在准备出发…' }),
  ]);
}

let textureImageCache = Object.create(null);

/* 运行时只加载五张分类图集；源图路径映射到图集单元，便于 UI 继续按资源名取图。 */
const TEXTURE_ATLASES = {
  'assets/atlases/cards.webp': { cols: 4, rows: 4, cellWidth: 320, cellHeight: 426 },
  'assets/atlases/characters.webp': { cols: 4, rows: 2, cellWidth: 192, cellHeight: 192 },
  'assets/atlases/terrain.webp': { cols: 5, rows: 1, cellWidth: 256, cellHeight: 256 },
  'assets/atlases/map-icons.webp': { cols: 4, rows: 4, cellWidth: 128, cellHeight: 128 },
  'assets/atlases/obstacles.webp': { cols: 4, rows: 2, cellWidth: 256, cellHeight: 256 },
};
const TEXTURE_SPRITES = {
  'assets/cards/basic_attack_art.webp': { atlas: 'assets/atlases/cards.webp', col: 0, row: 0 },
  'assets/cards/basic_defend_art.webp': { atlas: 'assets/atlases/cards.webp', col: 1, row: 0 },
  'assets/cards/basic_heal_art.webp': { atlas: 'assets/atlases/cards.webp', col: 2, row: 0 },
  'assets/cards/attack_draw_art.webp': { atlas: 'assets/atlases/cards.webp', col: 3, row: 0 },
  'assets/cards/armor_break_attack_art.webp': {
    atlas: 'assets/atlases/cards.webp',
    col: 0,
    row: 1,
  },
  'assets/cards/enhanced_defense_art.webp': {
    atlas: 'assets/atlases/cards.webp',
    col: 1,
    row: 1,
  },
  'assets/cards/defense_stance_art.webp': { atlas: 'assets/atlases/cards.webp', col: 2, row: 1 },
  'assets/卡面/刘华强.webp': {
    card: { atlas: 'assets/atlases/cards.webp', col: 3, row: 1 },
    character: { atlas: 'assets/atlases/characters.webp', col: 0, row: 0 },
  },
  'assets/卡面/瓜摊老板.webp': {
    card: { atlas: 'assets/atlases/cards.webp', col: 0, row: 2 },
    character: { atlas: 'assets/atlases/characters.webp', col: 1, row: 0 },
  },
  'assets/卡面/耄耋.webp': {
    card: { atlas: 'assets/atlases/cards.webp', col: 1, row: 2 },
    character: { atlas: 'assets/atlases/characters.webp', col: 2, row: 0 },
  },
  'assets/卡面/大狗.webp': {
    card: { atlas: 'assets/atlases/cards.webp', col: 2, row: 2 },
    character: { atlas: 'assets/atlases/characters.webp', col: 3, row: 0 },
  },
  'assets/卡面/咕咕嘎嘎-香企鹅.webp': {
    card: { atlas: 'assets/atlases/cards.webp', col: 3, row: 2 },
    character: { atlas: 'assets/atlases/characters.webp', col: 0, row: 1 },
  },
  'assets/卡面/咕咕嘎嘎-凑企鹅.webp': {
    card: { atlas: 'assets/atlases/cards.webp', col: 0, row: 3 },
    character: { atlas: 'assets/atlases/characters.webp', col: 1, row: 1 },
  },
  'assets/world/terrain_forest.webp': {
    atlas: 'assets/atlases/terrain.webp',
    col: 0,
    row: 0,
    terrain: true,
  },
  'assets/world/terrain_volcanic_waste.webp': {
    atlas: 'assets/atlases/terrain.webp',
    col: 1,
    row: 0,
    terrain: true,
  },
  'assets/world/terrain_snowmountain.webp': {
    atlas: 'assets/atlases/terrain.webp',
    col: 2,
    row: 0,
    terrain: true,
  },
  'assets/world/terrain_swamp.webp': {
    atlas: 'assets/atlases/terrain.webp',
    col: 3,
    row: 0,
    terrain: true,
  },
  'assets/world/terrain_ruins.webp': {
    atlas: 'assets/atlases/terrain.webp',
    col: 4,
    row: 0,
    terrain: true,
  },
  'assets/world/icons/camp_spawn.webp': { atlas: 'assets/atlases/map-icons.webp', col: 0, row: 0 },
  'assets/world/icons/extraction_point.webp': {
    atlas: 'assets/atlases/map-icons.webp',
    col: 1,
    row: 0,
  },
  'assets/world/icons/combat.webp': { atlas: 'assets/atlases/map-icons.webp', col: 2, row: 0 },
  'assets/world/icons/elite_combat.webp': {
    atlas: 'assets/atlases/map-icons.webp',
    col: 3,
    row: 0,
  },
  'assets/world/icons/loot_chest.webp': { atlas: 'assets/atlases/map-icons.webp', col: 0, row: 1 },
  'assets/world/icons/potion_cache.webp': {
    atlas: 'assets/atlases/map-icons.webp',
    col: 1,
    row: 1,
  },
  'assets/world/icons/rune_stone.webp': { atlas: 'assets/atlases/map-icons.webp', col: 2, row: 1 },
  'assets/world/icons/merchant_tent.webp': {
    atlas: 'assets/atlases/map-icons.webp',
    col: 3,
    row: 1,
  },
  'assets/world/icons/campfire.webp': { atlas: 'assets/atlases/map-icons.webp', col: 0, row: 2 },
  'assets/world/icons/random_event.webp': {
    atlas: 'assets/atlases/map-icons.webp',
    col: 1,
    row: 2,
  },
  'assets/world/icons/danger_zone.webp': {
    atlas: 'assets/atlases/map-icons.webp',
    col: 2,
    row: 2,
  },
  'assets/world/icons/player_marker.webp': {
    atlas: 'assets/atlases/map-icons.webp',
    col: 3,
    row: 2,
  },
  'assets/world/icons/penguin_summon.webp': {
    atlas: 'assets/atlases/map-icons.webp',
    col: 0,
    row: 3,
  },
  'assets/world/obstacles/snow_ridge_wall.webp': {
    atlas: 'assets/atlases/obstacles.webp',
    col: 0,
    row: 0,
  },
  'assets/world/obstacles/obsidian_wall.webp': {
    atlas: 'assets/atlases/obstacles.webp',
    col: 1,
    row: 0,
  },
  'assets/world/obstacles/forest_wall.webp': {
    atlas: 'assets/atlases/obstacles.webp',
    col: 2,
    row: 0,
  },
  'assets/world/obstacles/ruin_wall.webp': {
    atlas: 'assets/atlases/obstacles.webp',
    col: 3,
    row: 0,
  },
  'assets/world/obstacles/swamp_mudpit.webp': {
    atlas: 'assets/atlases/obstacles.webp',
    col: 0,
    row: 1,
  },
  'assets/world/obstacles/lava_fissure.webp': {
    atlas: 'assets/atlases/obstacles.webp',
    col: 1,
    row: 1,
  },
  'assets/world/obstacles/blizzard_marker.webp': {
    atlas: 'assets/atlases/obstacles.webp',
    col: 2,
    row: 1,
  },
};

function assetSpriteStyle(path, mode) {
  const entry = TEXTURE_SPRITES[path];
  const sprite = entry && ((mode && entry[mode]) || entry.default || entry.character || entry);
  if (!sprite || sprite.terrain) return null;
  const atlas = TEXTURE_ATLASES[sprite.atlas];
  if (!atlas) return null;
  const x = atlas.cols > 1 ? (sprite.col / (atlas.cols - 1)) * 100 : 0;
  const y = atlas.rows > 1 ? (sprite.row / (atlas.rows - 1)) * 100 : 0;
  return {
    backgroundImage: `url("${sprite.atlas}")`,
    backgroundPosition: `${x}% ${y}%`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${atlas.cols * 100}% ${atlas.rows * 100}%`,
  };
}

function assetSpriteElement(path, className, alt, mode) {
  const style = assetSpriteStyle(path, mode);
  if (!style) {
    return el('img', {
      class: className || '',
      src: path,
      alt: alt || '',
      draggable: 'false',
      loading: 'lazy',
      decoding: 'async',
    });
  }
  const attrs = {
    class: [className, 'atlas-sprite'].filter(Boolean).join(' '),
    style,
  };
  if (alt) {
    attrs.role = 'img';
    attrs['aria-label'] = alt;
  } else {
    attrs['aria-hidden'] = 'true';
  }
  return el('span', attrs);
}

function registerTerrainTextureSprites() {
  Object.entries(TEXTURE_SPRITES).forEach(([sourcePath, sprite]) => {
    if (!sprite.terrain) return;
    const atlas = TEXTURE_ATLASES[sprite.atlas];
    const image = textureImageCache[sprite.atlas];
    if (!atlas || !image) throw new Error('地表图集缺少贴图：' + sprite.atlas);
    const canvas = document.createElement('canvas');
    canvas.width = atlas.cellWidth;
    canvas.height = atlas.cellHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建地表贴图画布');
    context.drawImage(
      image,
      sprite.col * atlas.cellWidth,
      sprite.row * atlas.cellHeight,
      atlas.cellWidth,
      atlas.cellHeight,
      0,
      0,
      atlas.cellWidth,
      atlas.cellHeight,
    );
    textureImageCache[sourcePath] = canvas;
  });
}

function gameTexturePaths() {
  return Object.keys(TEXTURE_ATLASES);
}

function renderTextureLoading(root, loaded, total, failedPath) {
  const percent = total ? Math.round((loaded / total) * 100) : 100;
  root.replaceChildren(
    el('div', { class: 'screen loading-screen texture-loading-screen' }, [
      el('div', { class: 'loading-emoji', text: '🎒' }),
      el('div', { class: 'loading-title', text: '正在加载贴图' }),
      el('div', {
        class: 'loading-sub',
        text: failedPath ? '有贴图没有加载成功，请检查网络后重试。' : '贴图加载完成后进入游戏…',
      }),
      el('div', { class: 'texture-progress-track', 'aria-label': '贴图加载进度' }, [
        el('div', {
          class: 'texture-progress-fill',
          style: { width: percent + '%' },
        }),
      ]),
      el('div', {
        class: 'texture-progress-count',
        text: failedPath ? '加载失败：' + failedPath : `${loaded} / ${total} 张贴图`,
      }),
      failedPath ? btn('重试加载', 'primary', boot) : null,
    ]),
  );
  fitStage();
}

function loadTextureImage(path) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      const decoded = typeof image.decode === 'function' ? image.decode() : Promise.resolve();
      decoded.then(() => resolve(image)).catch(() => reject(new Error(path)));
    };
    image.onload = finish;
    image.onerror = () => {
      if (settled) return;
      settled = true;
      reject(new Error(path));
    };
    image.src = path;
    if (image.complete && image.naturalWidth > 0) finish();
  });
}

function preloadGameTextures(root) {
  const paths = gameTexturePaths();
  let loaded = 0;
  let failed = false;
  textureImageCache = Object.create(null);
  renderTextureLoading(root, loaded, paths.length);
  return Promise.all(
    paths.map((path) =>
      loadTextureImage(path).then((image) => {
        textureImageCache[path] = image;
        loaded += 1;
        if (!failed) renderTextureLoading(root, loaded, paths.length);
      }).catch((error) => {
        failed = true;
        throw error;
      }),
    ),
  ).then(registerTerrainTextureSprites);
}

function showTextureLoadError(root, error) {
  const path = error && error.message ? error.message : String(error);
  const paths = gameTexturePaths();
  const loaded = paths.filter((texturePath) => textureImageCache[texturePath]).length;
  renderTextureLoading(root, loaded, paths.length, path);
}

function showBootError(root, error) {
  console.error('游戏启动失败', error);
  root.replaceChildren(
    el('div', { class: 'screen loading-screen' }, [
      el('h1', { text: '游戏启动失败' }),
      el('p', { text: String(error && error.message ? error.message : error) }),
    ]),
  );
  fitStage();
}

function renderScreen() {
  const root = document.getElementById('screen');
  if (!root) return;
  const context = viewContext();
  const position = renderedContext === context ? captureViewPosition(root) : null;
  clearNode(root);
  let view;
  try {
    syncBattleFxContext();
    if (ui.screen === 'safe') view = safeView();
    else if (ui.screen === 'spawn' && !run) view = spawnView();
    else if (ui.screen === 'map' && run) view = mapView();
    else if (ui.screen === 'scene' && run) view = sceneView();
    else if (ui.screen === 'battle' && run && run.battle) view = battleView();
    else if (ui.screen === 'result' && run && run.result) view = resultView();
    else view = loadingView();
  } catch (error) {
    console.error('游戏界面渲染失败', error);
    view = el('div', { class: 'screen loading-screen' }, [
      el('h1', { text: '界面加载失败' }),
      el('p', { text: String(error && error.message ? error.message : error) }),
      btn('重新加载', 'primary', () => window.location.reload()),
    ]);
  }
  root.appendChild(view);
  let m;
  let t;
  try {
    m = modalView();
    t = toastView();
  } catch (error) {
    console.error('游戏弹窗渲染失败', error);
    root.replaceChildren(
      el('div', { class: 'screen loading-screen' }, [
        el('h1', { text: '界面加载失败' }),
        el('p', { text: String(error && error.message ? error.message : error) }),
      ]),
    );
    return;
  }
  if (m) root.appendChild(m);
  if (t) root.appendChild(t);
  if (m) {
    view.inert = true;
    if (!position || (position.focus && !position.focus.inModal)) {
      const focus = m.querySelector('button:not(:disabled), [tabindex="0"], input');
      if (focus) focus.focus({ preventScroll: true });
    }
  }
  if (position) {
    restoreViewPosition(root, position);
    if (m && !position.focus) {
      const focus = m.querySelector('button:not(:disabled), [tabindex="0"], input');
      if (focus) focus.focus({ preventScroll: true });
    }
  }
  renderedContext = context;
  afterBattleRender();
}
App.render = renderScreen;

/* ===================== 快捷键 ===================== */
/* 方向键是 PC 的主要操作：选目标用 ←→/AD，回车确认，Esc/右键取消 */
function doEndTurn() {
  endBattleTurn();
}

function onKey(e) {
  if (e.defaultPrevented || e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  const target = e.target;
  if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))
    return;
  if (e.key === 'Tab' && ui.modal) {
    const focusable = [
      ...document.querySelectorAll(
        '.modal button:not(:disabled), .modal [tabindex="0"], .modal input',
      ),
    ].filter((node) => node.getAttribute('aria-disabled') !== 'true' && !node.hidden);
    if (focusable.length) {
      const at = focusable.indexOf(document.activeElement);
      if (e.shiftKey && at <= 0) {
        e.preventDefault();
        focusable[focusable.length - 1].focus();
      } else if (!e.shiftKey && (at < 0 || at === focusable.length - 1)) {
        e.preventDefault();
        focusable[0].focus();
      }
    }
    return;
  }
  if (e.key === 'Escape') {
    if (ui.modal) {
      closeModal();
      return;
    }
    if (ui.targeting) cancelTargeting();
    return;
  }
  if (ui.screen !== 'battle' || !run || !run.battle || ui.modal) return;
  if (ui.fxLock) return;
  // 原生按钮的 Enter/空格交给按钮，避免一次按键既点击按钮又结束回合。
  if (
    target &&
    target.closest &&
    target.closest('button, [role="button"]') &&
    (e.key === 'Enter' || e.key === ' ')
  )
    return;

  /* 选目标模式：切换目标 / 确认 */
  if (ui.targeting) {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') {
      e.preventDefault();
      moveTargetCursor(-1);
    } else if (k === 'ArrowRight' || k === 'd' || k === 'D') {
      e.preventDefault();
      moveTargetCursor(1);
    } else if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      confirmTarget(ui.targeting.ei);
    } else if (k >= '1' && k <= '9') {
      const i = Number(k) - 1;
      if (canPlay(run.battle, i)) pickCard(i);
    }
    return;
  }

  if (e.key === ' ' || e.key === 'n' || e.key === 'N') {
    e.preventDefault();
    doEndTurn();
    return;
  }
  if (e.key >= '1' && e.key <= '9') {
    const i = Number(e.key) - 1;
    if (canPlay(run.battle, i)) pickCard(i);
  }
}
window.addEventListener('keydown', onKey);

/* 右键取消选目标 */
window.addEventListener('contextmenu', (e) => {
  if (ui.targeting) {
    e.preventDefault();
    cancelTargeting();
  }
});

/* ===================== 启动 ===================== */
function initializeGame() {
  try {
    const contentErrors = validateGameContent();
    if (contentErrors.length) {
      showBootError(
        document.getElementById('screen'),
        new Error('游戏内容配置错误：' + contentErrors.join('；')),
      );
      return;
    }
    loadMeta();
    prepareSafeZone();
    fitStage();
    ui.screen = 'safe';
    ui.safeTab = 'zones';
    ui.loadout = autoLoadout();
    if (!meta.seenTutorial) {
      meta.seenTutorial = true;
      saveMeta();
      ui.modal = { kind: 'help' };
    }
    App.render();
    refreshUnlocks();
    if (typeof Toy !== 'undefined' && Toy.isMock && Toy.isMock()) {
      addLog('本地模拟模式：?mock=1', 'info');
    }
  } catch (error) {
    showBootError(document.getElementById('screen'), error);
  }
}

function boot() {
  const root = document.getElementById('screen');
  if (!root) return;
  fitStage();
  preloadGameTextures(root)
    .then(initializeGame)
    .catch((error) => showTextureLoadError(root, error));
}

window.addEventListener('beforeunload', (e) => {
  if (run && run.mode !== 'over') {
    e.preventDefault();
    e.returnValue = '';
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
