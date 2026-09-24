'use strict';

/* =====================================================================
 *  撤离区 EXTRACTION ZONE  (搜打撤 × 卡牌构筑)
 *  ------------------------------------------------------------------
 *  玩法：安全区配装 → 危险区走格子搜刮/战斗/变强 → 抵达撤离法阵带回战利品；
 *        阵亡则本次战利品与已消耗卡牌全丢。每走一格危险度 +1。
 *  ------------------------------------------------------------------
 *  结构：core(工具/常量/状态/存档/SDK) → data(卡牌/敌人/消耗品/buff/事件)
 *        → systems(地图/战斗/局内/安全区) → ui(DOM 渲染) → main(入口)
 * ===================================================================== */

/* global ui, run, meta, App, refresh, clearNode, el, safeView, mapView, sceneView, battleView, resultView,
   modalView, toastView, loadMeta, saveMeta, ensureStarter, refreshSafeShop, refreshUnlocks,
   startRun, autoLoadout, endTurn, pickCard, canPlay, battleOver, resolveBattle, VIEW_W, VIEW_H,
   Toy, addLog, cancelTargeting, confirmTarget, moveTargetCursor, flushBattleFx,
   finishBattleWhenFxDone */

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
function loadingView() {
  return el('div', { class: 'screen loading-screen' }, [
    el('div', { class: 'loading-emoji', text: '🎒' }),
    el('div', { class: 'loading-title', text: '撤离区' }),
    el('div', { class: 'loading-sub', text: '正在准备出发…' }),
  ]);
}

function renderScreen() {
  const root = document.getElementById('screen');
  if (!root) return;
  clearNode(root);
  let view;
  if (ui.screen === 'safe') view = safeView();
  else if (ui.screen === 'map' && run) view = mapView();
  else if (ui.screen === 'scene' && run) view = sceneView();
  else if (ui.screen === 'battle' && run && run.battle) view = battleView();
  else if (ui.screen === 'result' && run && run.result) view = resultView();
  else view = loadingView();
  root.appendChild(view);
  const m = modalView();
  if (m) root.appendChild(m);
  const t = toastView();
  if (t) root.appendChild(t);
}
App.render = renderScreen;

/* ===================== 快捷键 ===================== */
/* 方向键是 PC 的主要操作：选目标用 ←→/AD，回车确认，Esc/右键取消 */
function doEndTurn() {
  const b = run && run.battle;
  if (!b) return;
  ui.targeting = null;
  endTurn(b);
  refresh();
  const fxWait = flushBattleFx();
  finishBattleWhenFxDone(b, fxWait + 40);
}

function onKey(e) {
  if (e.key === 'Escape') {
    if (ui.modal) {
      if (ui.modal.kind === 'reward') return;
      ui.modal = null;
      refresh();
      return;
    }
    if (ui.targeting) cancelTargeting();
    return;
  }
  if (ui.screen !== 'battle' || !run || !run.battle || ui.modal) return;
  if (ui.fxLock) return;

  /* 选目标模式：切换目标 / 确认 */
  if (ui.targeting) {
    const k = e.key;
    if (
      (k === 'ArrowLeft' || k === 'a' || k === 'A')
    ) {
      e.preventDefault();
      moveTargetCursor(-1);
    } else if (
      (k === 'ArrowRight' || k === 'd' || k === 'D')
    ) {
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
function boot() {
  loadMeta();
  ensureStarter();
  if (!meta.safeShop) refreshSafeShop(false);
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
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
