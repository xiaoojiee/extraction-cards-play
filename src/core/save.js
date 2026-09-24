'use strict';

/* 存档：安全区/仓库持久化到 localStorage（无 localStorage 时静默降级为内存态） */

/* global meta, SAVE_KEY, START_HP, START_GOLD */

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch (_) {
    return null;
  }
}

/* 只持久化需要跨局保留的字段 */
function snapshotMeta() {
  return {
    v: 1,
    gold: meta.gold,
    stash: meta.stash,
    potions: meta.potions,
    maxHp: meta.maxHp,
    secureSlots: meta.secureSlots,
    upgrades: meta.upgrades,
    stats: meta.stats,
    seenTutorial: meta.seenTutorial,
  };
}

function saveMeta() {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(SAVE_KEY, JSON.stringify(snapshotMeta()));
  } catch (_) {}
}

function loadMeta() {
  const s = storage();
  let raw = null;
  if (s) {
    try {
      raw = s.getItem(SAVE_KEY);
    } catch (_) {}
  }
  if (raw) {
    try {
      const d = JSON.parse(raw);
      if (d && d.v === 1) {
        meta.gold = Number(d.gold) || 0;
        meta.stash = Array.isArray(d.stash) ? d.stash : [];
        meta.potions = Array.isArray(d.potions) ? d.potions : [];
        meta.maxHp = Number(d.maxHp) || START_HP;
        meta.secureSlots = Number(d.secureSlots) || 0;
        if (d.upgrades) meta.upgrades = Object.assign(meta.upgrades, d.upgrades);
        if (d.stats) meta.stats = Object.assign(meta.stats, d.stats);
        meta.seenTutorial = !!d.seenTutorial;
        meta.loaded = true;
        return;
      }
    } catch (_) {}
  }
  meta.loaded = true;
  saveMeta();
}

function resetMeta() {
  meta.gold = START_GOLD;
  meta.stash = [];
  meta.potions = [];
  meta.maxHp = START_HP;
  meta.secureSlots = 0;
  meta.upgrades = { deckMax: 0, backpackMax: 0, potionSlots: 0 };
  meta.stats = { raids: 0, extracts: 0, deaths: 0, kills: 0, bestDepth: 0, bestGold: 0 };
  saveMeta();
}
