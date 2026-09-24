'use strict';

/* 局内奖励交互：选牌、增益、营地、事件与商店。 */

/* global meta, ui, run:writable, ZONES, TILE, CARDS, POTIONS, BUFFS, EVENTS, RNG, uid, clamp,
   SAVE_KEY, DECK_MAX, POTION_SLOTS, SECURE_SLOTS, BATTLE_REWARD_CARDS, BATTLE_POTION_CHANCE, ELITE_POTION_CHANCE,
   BOSS_POTION_CHANCE, DANGER_GOLD, SHOP_CARD_SLOTS, SHOP_POTION_SLOTS, SELL_RATE,
   SHOP_UPGRADE_COST, FIRE_HEAL_RATE,
   genMap, tileAt, isAdjacent, revealAround, newEncounter, pickEncounterIds, newBattle,
   battleResult, aliveEnemies, rollIntent, rollCardId, rollPotionId, rollEventId, rollBuffId,
   rollBadBuffId, makeBuff, buffTotals, buffDesc, cardSellPrice, cardPrice, saveMeta,
   POTION_IDS, ENEMIES, BOSS_POOL, ELITE_POOL, NORMAL_POOL, refresh, closeModal, toast, Toy,
   upgradedId, canUpgradeCard, runTotals, applyBuff, runHeal, runLog, runGiveCard,
   runGivePotion, removeLoot */

/* ===================== 弹窗：选牌奖励 ===================== */
function openCardReward(kind, rewards) {
  const n = kind === 'elite' || kind === 'boss' ? BATTLE_REWARD_CARDS + 1 : BATTLE_REWARD_CARDS;
  const bonus = kind === 'boss' ? 6 : kind === 'elite' ? 3 : 0;
  const ids = [];
  const seen = {};
  for (let i = 0; i < n; i++) {
    let id = rollCardId(run.danger + bonus, run.zone.lootMul + (runTotals().lootBonus || 0) * 0.5);
    let guard = 0;
    while (seen[id] && guard++ < 8) {
      id = rollCardId(run.danger + bonus, run.zone.lootMul);
    }
    seen[id] = true;
    ids.push(id);
  }
  ui.modal = {
    kind: 'reward',
    title: '战利品',
    ids,
    allowSkip: true,
    rewards: rewards || { gold: 0, potionId: null },
  };
  refresh();
}

function claimBattleReward(cardId) {
  const m = ui.modal;
  if (!m || m.kind !== 'reward') return;
  const rewards = m.rewards || {};
  const details = [];
  const gold = rewards.gold || 0;
  run.gold += gold;
  if (gold) details.push(`${gold} 金币`);
  if (rewards.potionId) {
    const potion = runGivePotion(rewards.potionId);
    if (potion) details.push(`消耗品「${potion.name}」`);
  }
  if (cardId) {
    const card = runGiveCard(cardId);
    if (card) details.push(`卡牌「${card.name}」`);
  }
  const text = `认领战斗奖励：${details.length ? details.join('、') : '没有额外物品'}。`;
  runLog(text, 'good');
  toast(text);
  ui.modal = null;
  refresh();
}

/* ===================== 弹窗：符文石增益三选一 ===================== */
function openBuffPick(ids) {
  if (!ids) {
    ids = [];
    const seen = {};
    for (let i = 0; i < 3; i++) {
      let id = rollBuffId();
      let guard = 0;
      while (seen[id] && guard++ < 8) id = rollBuffId();
      seen[id] = true;
      ids.push(id);
    }
  }
  ui.modal = { kind: 'buff', title: '符文石', ids, allowSkip: false };
  refresh();
}

function chooseBuff(id) {
  const b = makeBuff(id);
  applyBuff(b);
  markTileCleared();
  closeModal();
  ui.screen = 'map';
  refresh();
}

/* ===================== 弹窗：营地（休息 / 打铁） ===================== */
function markTileCleared() {
  const t = tileAt(run.map, run.pos.c, run.pos.r);
  if (t) t.cleared = true;
}

function openFire() {
  ui.modal = { kind: 'fire' };
  refresh();
}

/* 卡组里还能升级几张 */
function upgradableCount(deck) {
  let n = 0;
  for (let i = 0; i < deck.length; i++) if (canUpgradeCard(deck[i].id)) n++;
  return n;
}

function fireRest() {
  const want = Math.max(1, Math.round(run.maxHp * FIRE_HEAL_RATE));
  const got = runHeal(want);
  markTileCleared();
  runLog(`🔥 在营地旁休息，回复 ${got} 点生命`, 'good');
  closeModal();
  ui.screen = 'map';
  refresh();
}

function fireSmith() {
  if (upgradableCount(run.deck) <= 0) {
    toast('没有可升级的卡牌，试试休息');
    return;
  }
  openUpgradePick({ source: 'fire', cost: 0, title: '🔨 打铁（免费升级一张牌）' });
}

/* ===================== 弹窗：升级选牌 ===================== */
function openUpgradePick(opts) {
  ui.modal = {
    kind: 'upgrade',
    source: opts.source || 'fire',
    cost: opts.cost || 0,
    title: opts.title || '升级一张牌',
  };
  refresh();
}

function pickUpgrade(uidv) {
  const m = ui.modal;
  if (!m || m.kind !== 'upgrade') return;
  if (m.cost > run.gold) {
    toast('金币不足');
    return;
  }
  const inst = run.deck.find((c) => c.uid === uidv);
  if (!inst) return;
  const before = CARDS[inst.id];
  const nid = upgradedId(inst.id);
  if (!nid) {
    toast('这张牌无法升级');
    return;
  }
  inst.id = nid;
  if (inst.stashIndex != null) run.upgradedStash.push({ index: inst.stashIndex, id: nid });
  if (m.cost > 0) run.gold -= m.cost;
  runLog(`🔨 「${before.name}」升级为「${CARDS[nid].name}」`, 'good');
  if (m.source === 'fire') {
    markTileCleared();
    closeModal();
    ui.screen = 'map';
    refresh();
  } else if (m.source === 'shop') {
    ui.modal = { kind: 'shop', stock: run.shopStock };
    refresh();
  } else {
    closeModal();
  }
}

/* ===================== 弹窗：事件 ===================== */
function openEvent(id) {
  ui.modal = { kind: 'event', event: EVENTS[id], step: 'choice', result: null };
  refresh();
}
function chooseEventOption(i) {
  const m = ui.modal;
  if (!m || m.kind !== 'event') return;
  const opt = m.event.options[i];
  if (!opt) return;
  const text = opt.run();
  const t = tileAt(run.map, run.pos.c, run.pos.r);
  if (t) t.cleared = true;
  m.step = 'result';
  m.result = text;
  runLog(`❔ ${m.event.title}：${text}`);
  refresh();
}
function closeEvent() {
  closeModal();
  const t = tileAt(run.map, run.pos.c, run.pos.r);
  ui.screen = t && t.cleared ? 'map' : 'scene';
  refresh();
}

/* ===================== 弹窗：商店 ===================== */
function openShop() {
  const tile = tileAt(run.map, run.pos.c, run.pos.r);
  if (tile && tile.sceneData && tile.sceneData.shopStock) {
    run.shopStock = tile.sceneData.shopStock;
    ui.modal = { kind: 'shop', stock: run.shopStock, tab: 'buy' };
    refresh();
    return;
  }
  const discount = runTotals().shopDiscount || 0;
  const cards = [];
  for (let i = 0; i < SHOP_CARD_SLOTS; i++) {
    const id = rollCardId(run.danger + 2, run.zone.lootMul);
    cards.push({ id, price: cardPrice(CARDS[id], discount), sold: false });
  }
  const potions = [];
  for (let i = 0; i < SHOP_POTION_SLOTS; i++) {
    const id = rollPotionId();
    potions.push({ id, price: Math.round(POTIONS[id].price * (1 - discount)), sold: false });
  }
  /* 商人手上的现金：决定他能收你多少货 */
  const funds = Math.round((RNG.int(70, 150) + run.danger * 7) * (run.zone.goldMul || 1));
  run.shopStock = { cards, potions, funds };
  if (tile && tile.sceneData) tile.sceneData.shopStock = run.shopStock;
  ui.modal = { kind: 'shop', stock: run.shopStock, tab: 'buy' };
  refresh();
}
function shopBuyCard(i) {
  const it = run.shopStock.cards[i];
  if (!it || it.sold || run.gold < it.price) return;
  run.gold -= it.price;
  run.shopStock.funds += it.price; // 钱进了商人口袋，他更有能力收你的货
  it.sold = true;
  const c = runGiveCard(it.id);
  runLog(`🛒 买入「${c.name}」（-${it.price} 金币）`, 'good');
  toast(`获得卡牌「${c.name}」`);
  refresh();
}
function shopBuyPotion(i) {
  const it = run.shopStock.potions[i];
  if (!it || it.sold || run.gold < it.price) return;
  run.gold -= it.price;
  run.shopStock.funds += it.price;
  it.sold = true;
  const p = runGivePotion(it.id);
  runLog(`🛒 买入「${p.name}」（-${it.price} 金币）`, 'good');
  toast(`获得消耗品「${p.name}」`);
  refresh();
}

/* 商人当前能给这张牌出多少钱（资金不足时只能给一部分） */
function shopPayout(card) {
  const want = cardSellPrice(card);
  const funds = run.shopStock ? run.shopStock.funds : 0;
  return { want, pay: Math.max(0, Math.min(want, funds)) };
}

function shopSellCard(uidv) {
  const i = run.deck.findIndex((c) => c.uid === uidv);
  if (i < 0) return;
  const inst = run.deck[i];
  const card = CARDS[inst.id];
  const { want, pay } = shopPayout(card);
  if (pay < 1) {
    toast('商人现金不足，先买点东西给他回血');
    return;
  }
  run.shopStock.funds -= pay;
  run.gold += pay;
  run.deck.splice(i, 1);
  if (inst.stashIndex != null) run.removedStash.push(inst.stashIndex);
  removeLoot(inst.uid);
  runLog(
    `💰 卖出「${card.name}」（+${pay} 金币${pay < want ? `，商人只出得起 ${pay}/${want}` : ''}）`,
  );
  refresh();
}

/* 商店铁匠铺：花钱升级场上的一张牌（钱也进商人口袋） */
function shopUpgrade(uidv) {
  const inst = run.deck.find((c) => c.uid === uidv);
  if (!inst) return;
  const nid = upgradedId(inst.id);
  if (!nid) {
    toast('这张牌无法升级');
    return;
  }
  if (run.gold < SHOP_UPGRADE_COST) {
    toast('金币不足');
    return;
  }
  run.gold -= SHOP_UPGRADE_COST;
  if (run.shopStock) run.shopStock.funds += SHOP_UPGRADE_COST;
  const before = CARDS[inst.id];
  inst.id = nid;
  if (inst.stashIndex != null) run.upgradedStash.push({ index: inst.stashIndex, id: nid });
  runLog(`🔨 「${before.name}」升级为「${CARDS[nid].name}」（-${SHOP_UPGRADE_COST} 金币）`, 'good');
  refresh();
}
function closeShop() {
  ui.modal = null;
  ui.screen = 'map';
  refresh();
}
