'use strict';

/* 局内基础流程：开局、资源变化、状态效果与地图移动。
 * 战斗遭遇、奖励交互和撤离结算分别位于相邻的 run_* 模块。 */

/* global meta, ui, run:writable, ZONES, TILE, CARDS, POTIONS, BUFFS, EVENTS, RNG, uid,
   SAVE_KEY, DECK_MAX, POTION_SLOTS, SECURE_SLOTS, REVISIT_AMBUSH, REVISIT_AMBUSH_PER_DANGER,
   REVISIT_AMBUSH_MAX, BATTLE_REWARD_CARDS, BATTLE_POTION_CHANCE, ELITE_POTION_CHANCE,
   BOSS_POTION_CHANCE, DANGER_GOLD, SHOP_CARD_SLOTS, SHOP_POTION_SLOTS, SELL_RATE,
   SHOP_UPGRADE_COST, FIRE_HEAL_RATE,
   genMap, tileAt, isAdjacent, revealAround, newEncounter, pickEncounterIds, newBattle,
   battleResult, aliveEnemies, rollIntent, rollCardId, rollPotionId, rollEventId, rollBuffId,
   rollBadBuffId, makeBuff, buffTotals, buffDesc, cardSellPrice, cardPrice, saveMeta,
   POTION_IDS, ENEMIES, BOSS_POOL, ELITE_POOL, NORMAL_POOL, refresh, closeModal, toast, Toy,
   upgradedId, canUpgradeCard, resolveDeath, encounterFor, startBattle */

const RUN_START_GOLD = 25; // 出发时从仓库带入的行动资金上限
const HAZARD_DAMAGE = 7; // 危险区域基础伤害
const BOSS_DEPTH = 8; // 走满这么多格后可能遇到 Boss

/* ===================== 开局 ===================== */
/* picks: [{ id, stashIndex }]，stashIndex 指向 meta.stash 的下标 */
function startRun(zoneKey, picks) {
  meta.stats.raids++;
  const zone = ZONES[zoneKey];
  const cap = POTION_SLOTS + (meta.upgrades.potionSlots || 0);
  const potions = meta.potions.splice(0, Math.min(cap, meta.potions.length));
  const startGold = Math.min(meta.gold, RUN_START_GOLD);
  meta.gold -= startGold;

  run = {
    zoneKey,
    zone,
    deck: picks.map((p) => ({ uid: uid('c'), id: p.id, stashIndex: p.stashIndex })),
    loot: [], // 本次行动新获得的卡（撤离入库，阵亡丢失）
    secure: [], // 保险箱内的战利品（阵亡也能带出）
    removedStash: [], // 局内卖掉的仓库卡下标
    upgradedStash: [], // 局内升级过的仓库卡 [{index, id}]
    consumed: [], // 用掉的「消耗」牌对应的仓库下标（撤离也拿不回）
    sparePotions: meta.potions, // 没带进场的消耗品（留在仓库）
    potions,
    buffs: [],
    maxHp: meta.maxHp,
    hp: meta.maxHp,
    gold: startGold,
    danger: 0,
    steps: 0,
    kills: 0,
    bossDefeated: false,
    map: genMap(zoneKey),
    pos: null,
    battle: null,
    shopStock: null,
    mode: 'map', // map | battle | over
    log: [],
    result: null,
  };
  run.pos = { c: run.map.start.c, r: run.map.start.r };
  const st = tileAt(run.map, run.pos.c, run.pos.r);
  if (st) {
    st.visited = true;
    st.spawned = true;
    st.cleared = true;
  }
  runLog(`🏕️ 进入「${zone.name}」，危险度 0`, 'good');
  ui.screen = 'map';
  return run;
}

function runLog(text, kind) {
  if (!run) return;
  run.log.push({ text, kind: kind || 'info' });
  if (run.log.length > 200) run.log.shift();
}

function runZone() {
  return run.zone;
}
function runDanger() {
  return run.danger;
}
function runGold() {
  return run.gold;
}
function runHasJunk() {
  return run.deck.some((c) => CARDS[c.id].junk);
}

/* buff 汇总（商店折扣 / 撤离奖励等非战斗项） */
function runTotals() {
  return buffTotals(run.buffs);
}

/* ===================== 资源变更（事件/格子调用） ===================== */
function runGiveCard(id) {
  const card = CARDS[id];
  if (!card) return null;
  /* 战利品与牌堆共用同一个实例（uid 一致），便于卖出/丢弃时同步移除 */
  const inst = { uid: uid('l'), id, stashIndex: null };
  run.loot.push(inst);
  run.deck.push(inst);
  return card;
}
function runGivePotion(id) {
  const p = POTIONS[id];
  if (!p) return null;
  run.potions.push(id);
  return p;
}
function runGainGold(n) {
  const mul = runTotals().goldMul || 1;
  const g = Math.round(n * mul);
  run.gold += g;
  return g;
}
function runLoseGold(n) {
  const g = Math.min(run.gold, n);
  run.gold -= g;
  return g;
}
function runHeal(n) {
  const h = Math.min(n, run.maxHp - run.hp);
  run.hp += h;
  return h;
}
function runDamage(n) {
  run.hp -= n;
  if (run.hp <= 0) {
    run.hp = 0;
    resolveDeath('伤重不治');
    return n;
  }
  return n;
}
function runLoseMaxHp(n) {
  const lost = Math.min(n, Math.max(0, run.maxHp - 12));
  run.maxHp -= lost;
  run.hp = Math.min(run.hp, run.maxHp);
  return lost;
}
function runAddBuff() {
  const b = makeBuff(rollBuffId());
  applyBuff(b);
  return b;
}
function runAddBadBuff() {
  const b = makeBuff(rollBadBuffId());
  applyBuff(b);
  return b;
}
function applyBuff(b) {
  if (b.scope === 'run' && b.eff.maxHp) {
    run.maxHp += b.eff.maxHp;
    run.hp = run.maxHp;
  }
  if (b.scope === 'run' && b.eff.heal) runHeal(b.eff.heal);
  run.buffs.push(b);
  runLog(`${b.emoji} 获得效果「${b.name}」：${buffDesc(b)}`, b.bad ? 'bad' : 'good');
}
function runRaiseDanger(n) {
  run.danger += n;
  runLog(`⚠️ 危险度 +${n}（当前 ${run.danger}）`, 'bad');
}
function runRemoveJunk() {
  for (let i = run.deck.length - 1; i >= 0; i--) {
    if (CARDS[run.deck[i].id].junk) {
      const inst = run.deck[i];
      removeLoot(inst.uid);
      run.deck.splice(i, 1);
      return 1;
    }
  }
  return 0;
}
function removeLoot(uidv) {
  for (let i = 0; i < run.loot.length; i++) {
    if (run.loot[i].uid === uidv) {
      run.loot.splice(i, 1);
      return true;
    }
  }
  return false;
}

/* 消耗牌结算：从本局卡组里删掉，并记住要一起从仓库删掉的仓库下标 */
function consumeCards(uids) {
  for (let i = 0; i < uids.length; i++) {
    const idx = run.deck.findIndex((c) => c.uid === uids[i]);
    if (idx < 0) continue;
    const inst = run.deck[idx];
    const card = CARDS[inst.id];
    run.deck.splice(idx, 1);
    if (inst.stashIndex != null) run.consumed.push(inst.stashIndex);
    removeLoot(inst.uid);
    runLog(`🔥 「${card.name}」已消耗，从卡组中移除`, 'bad');
  }
}

/* 战斗结束后的 buff 计时 */
function tickBuffs() {
  for (let i = run.buffs.length - 1; i >= 0; i--) {
    const b = run.buffs[i];
    if (b.scope !== 'battle') continue;
    b.battles--;
    if (b.battles <= 0) {
      runLog(`${b.emoji}「${b.name}」已失效`, 'bad');
      run.buffs.splice(i, 1);
    }
  }
}

/* ===================== 地图移动 ===================== */
function canMoveTo(c, r) {
  if (!run || run.mode !== 'map') return false;
  const t = tileAt(run.map, c, r);
  if (!t) return false;
  return isAdjacent(run.pos, t);
}

function walkTo(c, r) {
  if (!canMoveTo(c, r)) return;
  const t = tileAt(run.map, c, r);
  const first = !t.visited;
  run.steps++;
  run.danger += 1;
  if (first) {
    t.visited = true;
    t.spawned = true;
  }
  run.pos = { c, r };
  revealAround(run.map, c, r);

  if (first) {
    spawnTile(t);
  }
  if (t.cleared) {
    if (t.type !== 'start' && t.type !== 'extract') revisitTile();
    return;
  }
  if (t.type === 'combat' || t.type === 'elite') {
    startBattle(
      t.payload && t.payload.length ? t.payload : encounterFor(t),
      t.type === 'elite' ? 'elite' : 'combat',
      { c: t.c, r: t.r },
    );
  } else {
    ui.screen = 'scene';
    ui.modal = null;
  }
}

function revisitTile() {
  const chance = Math.min(
    REVISIT_AMBUSH_MAX,
    REVISIT_AMBUSH + run.danger * REVISIT_AMBUSH_PER_DANGER,
  );
  if (!RNG.chance(chance)) return;
  runLog(`👀 重走旧路时遭遇伏击（${Math.round(chance * 100)}%）`, 'bad');
  startBattle(pickEncounterIds(run.danger, run.zone, 1), 'combat', null);
}

/* 首次发现时生成该地点固定内容；离开后重返仍会显示相同内容。 */
function spawnTile(t) {
  const info = TILE[t.type];
  if (t.type === 'combat' || t.type === 'elite') {
    t.payload = encounterFor(t);
    const names = t.payload.map((id) => ENEMIES[id].name).join('、');
    runLog(`${info.emoji} 进入${info.name}场景：${names}`, 'bad');
  } else if (t.type === 'empty') {
    t.sceneData = { gold: RNG.chance(0.35) ? RNG.int(5, 18) : 0 };
  } else if (t.type === 'loot') {
    const n = RNG.chance(0.35) ? 2 : 1;
    t.sceneData = {
      cards: Array.from({ length: n }, () => rollCardId(run.danger, run.zone.lootMul)),
      gold: RNG.int(10, 25),
    };
  } else if (t.type === 'potion') {
    t.sceneData = { potionId: rollPotionId() };
  } else if (t.type === 'buff') {
    const ids = [];
    while (ids.length < 3) {
      const id = rollBuffId();
      if (!ids.includes(id)) ids.push(id);
    }
    t.sceneData = { buffIds: ids };
  } else if (t.type === 'event') {
    t.sceneData = { eventId: rollEventId() };
  } else if (t.type === 'hazard') {
    t.sceneData = { damage: HAZARD_DAMAGE + Math.floor(run.danger * 0.6) };
    runLog(`${info.emoji} 发现危险区域`, 'bad');
  } else if (t.type === 'extract') {
    runLog('🌀 已抵达撤离法阵', 'good');
  } else if (t.type !== 'start') {
    runLog(`${info.emoji} 进入${info.name}场景`, 'good');
  }
}
