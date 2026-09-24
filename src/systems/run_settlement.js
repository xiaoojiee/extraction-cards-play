'use strict';

/* 局内结算：撤离、阵亡、保险箱和局内卡牌移除。 */

/* global meta, ui, run:writable, ZONES, TILE, CARDS, POTIONS, BUFFS, EVENTS, RNG, uid, clamp,
   SAVE_KEY, DECK_MAX, POTION_SLOTS, SECURE_SLOTS, BATTLE_REWARD_CARDS, BATTLE_POTION_CHANCE, ELITE_POTION_CHANCE,
   BOSS_POTION_CHANCE, DANGER_GOLD, SHOP_CARD_SLOTS, SHOP_POTION_SLOTS, SELL_RATE,
   SHOP_UPGRADE_COST, FIRE_HEAL_RATE,
   genMap, tileAt, isAdjacent, revealAround, newEncounter, pickEncounterIds, newBattle,
   battleResult, aliveEnemies, rollIntent, rollCardId, rollPotionId, rollEventId, rollBuffId,
   rollBadBuffId, makeBuff, buffTotals, buffDesc, cardSellPrice, cardPrice, saveMeta,
   POTION_IDS, ENEMIES, BOSS_POOL, ELITE_POOL, NORMAL_POOL, refresh, closeModal, toast, Toy,
   upgradedId, canUpgradeCard, runTotals, runLog */

/* ===================== 撤离 ===================== */
function openExtract() {
  const bonus = runTotals().extractBonus || 0;
  ui.modal = { kind: 'extract', bonus };
  refresh();
}
function doExtract() {
  const bonus = runTotals().extractBonus || 0;
  run.gold += bonus;
  finishRun(true);
}
function resolveDeath(reason) {
  run.deathReason = reason;
  finishRun(false);
}

/* ===================== 结算 ===================== */
function finishRun(extracted) {
  run.mode = 'over';
  /* 局内升级过的仓库卡写回 */
  for (let i = 0; i < run.upgradedStash.length; i++) {
    const u = run.upgradedStash[i];
    if (meta.stash[u.index] != null) meta.stash[u.index] = u.id;
  }
  /* 需要从仓库一并移除的下标：卖掉的 + 用掉的消耗牌 */
  const removeIdx = {};
  for (let i = 0; i < run.removedStash.length; i++) removeIdx[run.removedStash[i]] = true;
  for (let i = 0; i < run.consumed.length; i++) removeIdx[run.consumed[i]] = true;

  const lost = [];
  const brought = [];
  for (let i = 0; i < meta.stash.length; i++) {
    if (removeIdx[i]) lost.push(meta.stash[i]);
    else brought.push(meta.stash[i]);
  }
  meta.stash = brought;

  const gainedCards = [];
  const lostCards = [];
  if (extracted) {
    for (let i = 0; i < run.loot.length; i++) gainedCards.push(run.loot[i].id);
    for (let i = 0; i < run.secure.length; i++) gainedCards.push(run.secure[i]);
    meta.stash = meta.stash.concat(gainedCards);
    meta.potions = meta.potions.concat(run.potions);
    meta.gold += run.gold;
    meta.stats.extracts++;
    meta.stats.bestDepth = Math.max(meta.stats.bestDepth, run.danger);
    meta.stats.bestGold = Math.max(meta.stats.bestGold, run.gold);
  } else {
    /* 阵亡：战利品与携带消耗品全丢，保险箱内的保留 */
    for (let i = 0; i < run.loot.length; i++) lostCards.push(run.loot[i].id);
    for (let i = 0; i < run.secure.length; i++) {
      meta.stash.push(run.secure[i]);
      gainedCards.push(run.secure[i]);
    }
    meta.stats.deaths++;
  }

  run.result = {
    extracted,
    reason: run.deathReason || '',
    gold: extracted ? run.gold : 0,
    gainedCards,
    lostCards,
    lostStash: lost,
    depth: run.danger,
    steps: run.steps,
    kills: run.kills,
    pots: extracted ? run.potions.slice() : [],
    lostPotions: extracted ? [] : run.potions.slice(),
  };
  saveMeta();
  ui.screen = 'result';
  ui.modal = null;
  /* 上报排行榜：榜1 金币，榜2 最远深度 */
  if (typeof Toy !== 'undefined' && Toy.available()) {
    Toy.submitScore(1, meta.gold);
    Toy.submitScore(2, meta.stats.bestDepth);
  }
  refresh();
}

function secureCap() {
  return SECURE_SLOTS + (meta.secureSlots || 0);
}

/* 放进保险箱 = 收起来保管：阵亡也能带出，但本局就不能再用了 */
function secureAdd(uidv) {
  const cap = secureCap();
  if (run.secure.length >= cap) {
    toast('保险箱已满');
    return;
  }
  const i = run.loot.findIndex((c) => c.uid === uidv);
  if (i < 0) return;
  run.secure.push(run.loot[i].id);
  run.loot.splice(i, 1);
  removeCardFromDeck(uidv);
  runLog('🔒 战利品已移入保险箱，本局不再可用', 'good');
  refresh();
}

function removeCardFromDeck(uidv) {
  const idx = run.deck.findIndex((c) => c.uid === uidv);
  if (idx >= 0) run.deck.splice(idx, 1);
}
