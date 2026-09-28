'use strict';

/* 安全区：仓库 / 携带卡组 / 商店 / 解锁。改的是 meta（存档）。 */

/* global meta, ui, run, unlocks, Toy, ZONES, CARDS, POTIONS, RARITY, RNG, clamp,
   starterDeck, cardPrice, cardSellPrice, rollCardId, rollPotionId, saveMeta, loadMeta,
   DECK_MAX, DECK_MIN, POTION_SLOTS, refresh, toast, upgradedId, SMITH_COST,
   SAFE_SHOP_FUNDS_MIN, SAFE_SHOP_FUNDS_MAX, SAFE_SHOP_CARDS, SAFE_SHOP_POTIONS,
   REFRESH_COST, SECURE_COST, SECURE_UPGRADE_MAX, DECK_SLOT_COST, DECK_UPGRADE_MAX, SELL_RATE */

const UNLOCK_HINT = {
  like: '点赞视频解锁',
  coin: '投币视频解锁',
  fav: '收藏视频解锁',
  follow: '关注UP解锁',
};

/* ---- 解锁 ---- */
async function refreshUnlocks() {
  if (!Toy.available()) {
    for (const k in unlocks) unlocks[k] = true;
    refresh();
    return;
  }
  const [va, rel] = await Promise.all([Toy.getVideoActions(), Toy.getAuthorRelation()]);
  if (!va && !rel) {
    for (const k in unlocks) unlocks[k] = true;
    refresh();
    return;
  }
  if (va) {
    unlocks.like = va.liked;
    unlocks.coin = va.coin;
    unlocks.fav = va.fav;
  }
  if (rel) unlocks.follow = rel.following;
  refresh();
}

function zoneUnlocked(key) {
  const z = ZONES[key];
  if (!z || !z.unlock || z.unlock === 'free') return true;
  return !!unlocks[z.unlock];
}
function zoneUnlockHint(key) {
  const z = ZONES[key];
  return (z && UNLOCK_HINT[z.unlock]) || '';
}

/* ---- 卡组上限 ---- */
function deckMax() {
  return DECK_MAX + (meta.upgrades.deckMax || 0);
}
function potionSlots() {
  return POTION_SLOTS + (meta.upgrades.potionSlots || 0);
}

/* ---- 仓库 ---- */
function stashHas(id) {
  return meta.stash.indexOf(id) >= 0;
}
/* 仓库按稀有度→费用排序（只读列表，不改变仓库顺序） */
function stashList() {
  return meta.stash.map((id, i) => ({ id, index: i, card: CARDS[id] }));
}

/* 保底：仓库太空时补基础卡，避免无法出发。
 * 空仓库（新档/全丢）补满一整套 10 张；否则只补到刚好够出发，防止刷基础牌。 */
function ensureStarter() {
  if (!meta.stash.length) {
    const full = starterDeck();
    for (let i = 0; i < full.length; i++) meta.stash.push(full[i]);
    saveMeta();
    return true;
  }
  let playable = meta.stash.filter((id) => CARDS[id] && !CARDS[id].junk).length;
  if (playable >= DECK_MIN) return false;
  const add = starterDeck();
  let i = 0;
  while (playable < DECK_MIN) {
    meta.stash.push(add[i % add.length]);
    playable++;
    i++;
  }
  saveMeta();
  return true;
}

/* 自动配一套卡组：优先高稀有度 + 基础循环牌 */
function autoLoadout() {
  const order = ['epic', 'rare', 'common', 'basic'];
  const idx = meta.stash
    .map((id, i) => ({ id, i, card: CARDS[id] }))
    .filter((e) => e.card && !e.card.junk);
  idx.sort((a, b) => {
    const oa = order.indexOf(a.card.rarity);
    const ob = order.indexOf(b.card.rarity);
    if (oa !== ob) return oa - ob;
    return a.card.cost - b.card.cost;
  });
  return idx.slice(0, deckMax()).map((e) => e.i);
}

/* 配装与仓库下标一起维护；删除前面的卡不能让选中项悄悄变成另一张。 */
function normalizeLoadout() {
  if (!Array.isArray(ui.loadout)) ui.loadout = autoLoadout();
  ui.loadout = [...new Set(ui.loadout)]
    .filter(
      (i) => Number.isInteger(i) && i >= 0 && CARDS[meta.stash[i]] && !CARDS[meta.stash[i]].junk,
    )
    .slice(0, deckMax());
  return ui.loadout;
}

function toggleLoadout(index) {
  if (ui.screen !== 'safe' || run) return;
  const load = normalizeLoadout();
  const card = CARDS[meta.stash[index]];
  if (!card || card.junk) return;
  if (load.includes(index)) ui.loadout = load.filter((i) => i !== index);
  else if (load.length < deckMax()) ui.loadout.push(index);
  else toast('携带卡组已满');
  refresh();
}

function prepareSafeZone() {
  ensureStarter();
  if (!meta.safeShop) refreshSafeShop(false);
  normalizeLoadout();
}

function canManageStash() {
  return ui.screen === 'safe' && !run;
}

/* ---- 安全区商店 ---- */
function shopFunds() {
  if (!meta.safeShop) return 0;
  if (meta.safeShop.funds == null) meta.safeShop.funds = SAFE_SHOP_FUNDS_MAX;
  return meta.safeShop.funds;
}
/* 商人对这张牌最多出多少钱 */
function metaPayout(card) {
  const want = cardSellPrice(card);
  return { want, pay: Math.max(0, Math.min(want, shopFunds())) };
}

function refreshSafeShop(force) {
  if (force && (!canManageStash() || meta.gold < REFRESH_COST)) return false;
  if (force) meta.gold -= REFRESH_COST;
  const cards = [];
  for (let i = 0; i < SAFE_SHOP_CARDS; i++) {
    const id = rollCardId(2, 1.1);
    cards.push({ id, price: cardPrice(CARDS[id], 0), sold: false });
  }
  const potions = [];
  for (let i = 0; i < SAFE_SHOP_POTIONS; i++) {
    const id = rollPotionId();
    potions.push({ id, price: POTIONS[id].price, sold: false });
  }
  meta.safeShop = { cards, potions, funds: RNG.int(SAFE_SHOP_FUNDS_MIN, SAFE_SHOP_FUNDS_MAX) };
  saveMeta();
  return true;
}

function safeShopBuyCard(i) {
  if (!canManageStash()) return;
  const it = meta.safeShop && meta.safeShop.cards[i];
  if (!it || it.sold || meta.gold < it.price) return;
  meta.gold -= it.price;
  meta.safeShop.funds += it.price;
  it.sold = true;
  meta.stash.push(it.id);
  saveMeta();
  refresh();
}
function safeShopBuyPotion(i) {
  if (!canManageStash()) return;
  const it = meta.safeShop && meta.safeShop.potions[i];
  if (!it || it.sold || meta.gold < it.price) return;
  meta.gold -= it.price;
  meta.safeShop.funds += it.price;
  it.sold = true;
  meta.potions.push(it.id);
  saveMeta();
  refresh();
}
function safeShopRefresh() {
  if (!canManageStash()) return;
  if (meta.gold < REFRESH_COST) {
    toast('金币不足');
    return;
  }
  refreshSafeShop(true);
  refresh();
}

/* 仓库卖卡：商人资金不足就只能拿到他出得起的钱 */
function metaSellCard(index, expectedId) {
  if (!canManageStash() || !Number.isInteger(index) || index < 0) return;
  const id = meta.stash[index];
  if (!id || (expectedId && id !== expectedId)) return;
  const { want, pay } = metaPayout(CARDS[id]);
  if (pay < 1) {
    toast('商人现金不足，先买点东西给他回血');
    return;
  }
  meta.stash.splice(index, 1);
  if (Array.isArray(ui.loadout)) {
    ui.loadout = ui.loadout.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i));
  }
  ensureStarter();
  if (meta.safeShop) meta.safeShop.funds -= pay;
  meta.gold += pay;
  saveMeta();
  if (pay < want) toast(`商人只出得起 ${pay}/${want} 金币`);
  refresh();
}

/* 安全区铁匠铺：升级仓库里的一张牌（永久） */
function metaUpgradeCard(index, expectedId) {
  if (!canManageStash() || !Number.isInteger(index) || index < 0) return;
  const id = meta.stash[index];
  if (!id || (expectedId && id !== expectedId)) return;
  const nid = upgradedId(id);
  if (!nid) {
    toast('这张牌无法升级');
    return;
  }
  if (meta.gold < SMITH_COST) {
    toast('金币不足');
    return;
  }
  meta.gold -= SMITH_COST;
  if (meta.safeShop) meta.safeShop.funds += SMITH_COST;
  meta.stash[index] = nid;
  saveMeta();
  toast(`🔨 ${CARDS[id].name} → ${CARDS[nid].name}`);
  refresh();
}
function metaSellPotion(index) {
  if (!canManageStash() || !Number.isInteger(index) || index < 0) return;
  const id = meta.potions[index];
  if (!id) return;
  const want = Math.round(POTIONS[id].price * SELL_RATE);
  const pay = Math.min(want, shopFunds());
  if (pay < 1) {
    toast('商人现金不足');
    return;
  }
  meta.potions.splice(index, 1);
  if (meta.safeShop) meta.safeShop.funds -= pay;
  meta.gold += pay;
  saveMeta();
  refresh();
}

/* 保险箱扩容 */
function buySecureSlot() {
  if (!canManageStash()) return;
  if (meta.gold < SECURE_COST) {
    toast('金币不足');
    return;
  }
  if (meta.secureSlots >= SECURE_UPGRADE_MAX) {
    toast('保险箱已满级');
    return;
  }
  meta.gold -= SECURE_COST;
  meta.secureSlots++;
  saveMeta();
  refresh();
}

/* 卡组容量扩容 */
function buyDeckSlot() {
  if (!canManageStash()) return;
  if (meta.gold < DECK_SLOT_COST) {
    toast('金币不足');
    return;
  }
  if (meta.upgrades.deckMax >= DECK_UPGRADE_MAX) {
    toast('卡组已满级');
    return;
  }
  meta.gold -= DECK_SLOT_COST;
  meta.upgrades.deckMax++;
  saveMeta();
  refresh();
}

/* ---- 排行榜 ---- */
const rankState = { loading: false, list: null, my: null, error: '' };
async function loadRank() {
  if (rankState.loading) return;
  rankState.loading = true;
  refresh();
  const [list, my] = await Promise.all([Toy.getRankList(1, 10), Toy.getMyRank(1)]);
  rankState.list = list;
  rankState.my = my;
  rankState.loading = false;
  rankState.error = list ? '' : '排行榜需要登录 B站账号';
  refresh();
}
