'use strict';

/* 局内奖励交互：选牌、增益、营地、事件与商店。 */

/* global ui, run, CARDS, POTIONS, BUFFS, EVENTS, RNG, BATTLE_REWARD_CARDS, ELITE_CARD_POOL,
   SHOP_CARD_SLOTS, SHOP_POTION_SLOTS, SHOP_UPGRADE_COST, SHOP_FUNDS_MIN, SHOP_FUNDS_MAX,
   FIRE_HEAL_RATE, SCENE_RULES, rollCardId, rollPotionId, makeBuff, buffDesc,
   cardSellPrice, cardPrice, refresh, toast, upgradedId, canUpgradeCard,
   runTotals, applyBuff, runHeal, runLog, runGiveCard, runGivePotion, removeLoot,
   activeScene, currentSceneTile, showSceneResult, resolveSceneChoice, leaveScene */

/* ===================== 弹窗：选牌奖励 ===================== */
function openCardReward(kind, rewards) {
  if (!run || run.mode !== 'map') return;
  if (run.pendingReward) {
    ui.modal = run.pendingReward;
    refresh();
    return;
  }
  const n =
    kind === 'elite'
      ? BATTLE_REWARD_CARDS
      : kind === 'boss'
        ? BATTLE_REWARD_CARDS + 1
        : BATTLE_REWARD_CARDS;
  const bonus =
    kind === 'boss'
      ? SCENE_RULES.rewardBossDanger
      : kind === 'elite'
        ? SCENE_RULES.rewardEliteDanger
        : 0;
  const ids = [];
  const seen = {};
  const cardPool = rewards && Array.isArray(rewards.cardPool) ? rewards.cardPool : null;
  if (cardPool) {
    const available = RNG.shuffle(cardPool.filter((id) => CARDS[id]));
    ids.push(...available.slice(0, n));
  }
  for (let i = ids.length; i < n; i++) {
    let id = rollCardId(
      run.danger + bonus,
      run.zone.lootMul + (runTotals().lootBonus || 0) * SCENE_RULES.rewardLootBonusScale,
    );
    let guard = 0;
    while (seen[id] && guard++ < SCENE_RULES.rewardRerolls) {
      id = rollCardId(run.danger + bonus, run.zone.lootMul);
    }
    seen[id] = true;
    ids.push(id);
  }
  run.pendingReward = {
    kind: 'reward',
    title: '战利品',
    ids,
    allowSkip: true,
    rewards: rewards || { gold: 0, potionId: null },
  };
  ui.modal = run.pendingReward;
  refresh();
}

function claimBattleReward(cardId) {
  const m = ui.modal;
  if (!run || run.mode !== 'map' || !m || m.kind !== 'reward' || m !== run.pendingReward) return;
  if (cardId != null && (!m.ids.includes(cardId) || !CARDS[cardId])) return;
  if (cardId == null && !m.allowSkip) return;
  const rewards = m.rewards || {};
  if (rewards.potionId && !POTIONS[rewards.potionId]) return;
  /* 领取权归局内状态所有；先关闭本次领取，旧按钮回调不能再次发奖。 */
  run.pendingReward = null;
  ui.modal = null;
  const details = [];
  const gold = Number.isFinite(rewards.gold) ? Math.max(0, rewards.gold) : 0;
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
  const t = activeScene('buff');
  if (!t || ui.modal) return;
  ids = t.sceneData.buffIds;
  ui.modal = { kind: 'buff', title: '符文石', ids, allowSkip: false };
  refresh();
}

function chooseBuff(id) {
  const t = activeScene('buff');
  const m = ui.modal;
  if (!t || !m || m.kind !== 'buff' || !m.ids.includes(id) || !BUFFS[id]) return;
  const b = makeBuff(id);
  applyBuff(b);
  showSceneResult(t, `选择了「${b.name}」：${buffDesc(b)}`);
}

/* ===================== 弹窗：营地（休息 / 打铁） ===================== */
function markTileCleared() {
  const t = activeScene();
  if (t) t.cleared = true;
}

function openFire() {
  if (!activeScene('fire') || ui.modal) return;
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
  const t = activeScene('fire');
  if (!t || !ui.modal || ui.modal.kind !== 'fire') return;
  const want = Math.max(1, Math.round(run.maxHp * FIRE_HEAL_RATE));
  const got = runHeal(want);
  showSceneResult(t, `🔥 在营地旁休息，回复 ${got} 点生命`);
}

function fireSmith() {
  if (!activeScene('fire') || !ui.modal || ui.modal.kind !== 'fire') return;
  if (upgradableCount(run.deck) <= 0) {
    toast('没有可升级的卡牌，试试休息');
    return;
  }
  openUpgradePick({ source: 'fire', cost: 0, title: '🔨 打铁（免费升级一张牌）' });
}

/* ===================== 弹窗：升级选牌 ===================== */
function openUpgradePick(opts) {
  if (!opts || !activeScene(opts.source) || !ui.modal || ui.modal.kind !== opts.source) return;
  ui.modal = {
    kind: 'upgrade',
    source: opts.source || 'fire',
    cost: opts.source === 'shop' ? SHOP_UPGRADE_COST : 0,
    title: opts.title || '升级一张牌',
  };
  refresh();
}

function pickUpgrade(uidv) {
  const m = ui.modal;
  if (!m || m.kind !== 'upgrade') return;
  const t = activeScene(m.source);
  if (!t || !['fire', 'shop'].includes(m.source)) return;
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
  if (m.cost > 0) {
    run.gold -= m.cost;
    if (run.shopStock) run.shopStock.funds += m.cost;
  }
  const text = `🔨 「${before.name}」升级为「${CARDS[nid].name}」`;
  if (m.source === 'fire') {
    showSceneResult(t, text);
  } else if (m.source === 'shop') {
    runLog(text, 'good');
    ui.modal = { kind: 'shop', stock: run.shopStock };
    refresh();
  }
}

/* ===================== 弹窗：事件 ===================== */
function openEvent(id) {
  const t = activeScene('event');
  if (!t || ui.modal || t.sceneData.eventId !== id || !EVENTS[id]) return;
  ui.modal = {
    kind: 'event',
    event: EVENTS[id],
    step: 'choice',
    result: null,
    fromWorld: ui.screen === 'map',
  };
  refresh();
}
function chooseEventOption(i) {
  const m = ui.modal;
  const t = activeScene('event');
  if (!t || !m || m.kind !== 'event' || m.step !== 'choice' || !Number.isInteger(i)) return;
  if (m.event !== EVENTS[t.sceneData.eventId]) return;
  const opt = m.event.options[i];
  if (!opt) return;
  if (opt.canChoose && !opt.canChoose()) return;
  if (opt.leave) {
    closeEvent();
    return;
  }
  m.step = 'resolving';
  const text = resolveSceneChoice(t, () => opt.run());
  if (run.mode === 'over') return;
  m.step = 'result';
  m.result = text;
  runLog(`❔ ${m.event.title}：${text}`);
  refresh();
}
function closeEvent() {
  if (!run || run.mode !== 'map' || !ui.modal || ui.modal.kind !== 'event') return;
  const fromWorld = !!ui.modal.fromWorld;
  ui.modal = null;
  ui.screen = fromWorld ? 'map' : 'scene';
  refresh();
}

/* ===================== 弹窗：商店 ===================== */
function openShop() {
  const tile = activeScene('shop');
  if (!tile || ui.modal) return;
  tile.sceneData = tile.sceneData || {};
  if (tile && tile.sceneData && tile.sceneData.shopStock) {
    run.shopStock = tile.sceneData.shopStock;
    ui.modal = { kind: 'shop', stock: run.shopStock, tab: 'buy' };
    refresh();
    return;
  }
  const discount = runTotals().shopDiscount || 0;
  const cards = [];
  for (let i = 0; i < SHOP_CARD_SLOTS; i++) {
    const id = rollCardId(run.danger + SCENE_RULES.shopDangerBonus, run.zone.lootMul);
    cards.push({ id, price: cardPrice(CARDS[id], discount), sold: false });
  }
  const potions = [];
  for (let i = 0; i < SHOP_POTION_SLOTS; i++) {
    const id = rollPotionId();
    potions.push({ id, price: Math.round(POTIONS[id].price * (1 - discount)), sold: false });
  }
  /* 商人手上的现金：决定他能收你多少货 */
  const funds = Math.round(
    (RNG.int(SHOP_FUNDS_MIN, SHOP_FUNDS_MAX) + run.danger * SCENE_RULES.shopFundsPerDanger) *
      (run.zone.goldMul || 1),
  );
  run.shopStock = { cards, potions, funds };
  if (tile && tile.sceneData) tile.sceneData.shopStock = run.shopStock;
  ui.modal = { kind: 'shop', stock: run.shopStock, tab: 'buy' };
  refresh();
}

function activeShop() {
  const tile = activeScene('shop');
  return !!(
    tile &&
    ui.modal &&
    ui.modal.kind === 'shop' &&
    run.shopStock &&
    ui.modal.stock === run.shopStock &&
    tile.sceneData.shopStock === run.shopStock
  );
}

function shopBuyCard(i) {
  if (!activeShop() || !Number.isInteger(i)) return;
  const it = run.shopStock.cards[i];
  if (!it || it.sold || run.gold < it.price) return;
  const c = runGiveCard(it.id);
  if (!c) return;
  run.gold -= it.price;
  run.shopStock.funds += it.price; // 钱进了商人口袋，他更有能力收你的货
  it.sold = true;
  runLog(`🛒 买入「${c.name}」（-${it.price} 金币）`, 'good');
  toast(`获得卡牌「${c.name}」`);
  refresh();
}
function shopBuyPotion(i) {
  if (!activeShop() || !Number.isInteger(i)) return;
  const it = run.shopStock.potions[i];
  if (!it || it.sold || run.gold < it.price) return;
  const p = runGivePotion(it.id);
  if (!p) return;
  run.gold -= it.price;
  run.shopStock.funds += it.price;
  it.sold = true;
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
  if (!activeShop()) return;
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
  if (!activeShop()) return;
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
  if (!activeShop()) return;
  run.shopStock = null;
  leaveScene();
}
