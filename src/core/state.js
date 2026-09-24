'use strict';

/* 全局状态：meta(存档) / run(局内) / ui(界面) / unlocks(解锁) / App(渲染入口) */

/* global START_HP, START_GOLD */

/* App.render 由 main.js 在启动时接管；各模块改完状态调 refresh() 重渲染。 */
const App = { render: () => {} };
function refresh() {
  App.render();
}

/* ---- 解锁（B站 Toy 点赞/投币/收藏/关注） ---- */
const unlocks = { like: false, coin: false, fav: false, follow: false };

/* ---- 存档（安全区/仓库，跨局持久） ---- */
const meta = {
  loaded: false,
  gold: START_GOLD,
  stash: [], // 仓库卡牌 id 列表（可重复）
  potions: [], // 仓库消耗品 id 列表
  hp: START_HP, // 安全区里可恢复到满血，这里记录上限成长
  maxHp: START_HP,
  secureSlots: 0, // 保险箱额外格数（解锁/购买）
  upgrades: { deckMax: 0, backpackMax: 0, potionSlots: 0 },
  stats: { raids: 0, extracts: 0, deaths: 0, kills: 0, bestDepth: 0, bestGold: 0 },
  seenTutorial: false,
};

/* ---- 局内状态（一次搜打撤行动） ---- */
let run = null; // 由 run.js 的 startRun() 创建

/* ---- 界面状态 ---- */
const ui = {
  screen: 'loading', // loading | safe | map | scene | battle | result | guide
  safeTab: 'stash', // stash | shop | loadout
  modal: null, // { kind, ... } 由 hud.js 渲染
  logs: [],
  toast: null,
  draggingCard: null,
  targeting: null, // 战斗中选目标：{ hand: 手牌下标, ei: 指向的敌人下标 }
  fxLock: false, // 卡牌动画演出期间锁住战斗输入
};

function addLog(text, kind) {
  ui.logs.push({ text, kind: kind || 'info' });
  if (ui.logs.length > 80) ui.logs.shift();
}

let __toastKey = 0;
function toast(text) {
  __toastKey++;
  const key = __toastKey;
  ui.toast = { text, key };
  setTimeout(() => {
    if (ui.toast && ui.toast.key === key) {
      ui.toast = null;
      refresh();
    }
  }, 2000);
}

/* ---- 弹窗 ---- */
function openModal(m) {
  ui.modal = m;
  refresh();
}
function closeModal() {
  ui.modal = null;
  refresh();
}
