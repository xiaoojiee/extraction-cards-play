'use strict';

/* 局内基础流程：开局、资源变化、状态效果与地图移动。
 * 战斗遭遇、奖励交互和撤离结算分别位于相邻的 run_* 模块。 */

/* global meta, ui, run:writable, ZONES, TILE, CARDS, POTIONS, RNG, uid,
   DECK_MIN, RUN_START_GOLD, HAZARD_DAMAGE, SCENE_RULES, ENEMIES,
   genMap, restoreWorldMap, snapshotWorldMap, worldDangerAt, tileAt, ensureTile, isAdjacent, revealAround, configureTileEnvironment, WORLD_BIOMES, rollCardId, rollPotionId, rollEventId,
   rollBuffId, rollBadBuffId, makeBuff, buffTotals, buffDesc, toast, deckMax,
   potionSlots, zoneUnlocked, resolveDeath, encounterFor, enterCurrentScene, saveWorldMap */

/* ===================== 开局 ===================== */
/* picks: [{ id, stashIndex }]，stashIndex 指向 meta.stash 的下标 */
function startRun(zoneKey, picks, spawnAt) {
  if (run && run.mode !== 'over') return null;
  const zone =
    zoneKey === 'world'
      ? Object.assign({}, ZONES.suburb, {
          key: 'world',
          name: '无尽大世界',
          emoji: '🌍',
          desc: '世界会随着你的探索不断生成。',
        })
      : ZONES[zoneKey];
  if (!zone || (zoneKey !== 'world' && !zoneUnlocked(zoneKey)) || !Array.isArray(picks))
    return null;
  const indices = new Set();
  const valid = picks.every((p) => {
    if (!p || !Number.isInteger(p.stashIndex) || indices.has(p.stashIndex)) return false;
    if (!CARDS[p.id] || CARDS[p.id].junk || meta.stash[p.stashIndex] !== p.id) return false;
    indices.add(p.stashIndex);
    return true;
  });
  if (!valid || picks.length < DECK_MIN || picks.length > deckMax()) {
    toast('配装已变化，请重新选择携带卡牌');
    return null;
  }
  const map = (meta.worldMap && restoreWorldMap(meta.worldMap)) || genMap();
  const selectedStart =
    spawnAt && Number.isInteger(spawnAt.c) && Number.isInteger(spawnAt.r)
      ? tileAt(map, spawnAt.c, spawnAt.r)
      : null;
  if (
    spawnAt &&
    (!selectedStart || selectedStart.type !== 'extract' || !selectedStart.usedExtraction)
  ) {
    toast('所选撤离点已不可用，请重新选择出发位置');
    return null;
  }
  const spawn = selectedStart ? { c: selectedStart.c, r: selectedStart.r } : { ...map.start };
  meta.stats.raids++;
  const cap = potionSlots();
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
    potions,
    buffs: [],
    summons: [],
    maxHp: meta.maxHp,
    hp: meta.maxHp,
    gold: startGold,
    danger: worldDangerAt(spawn.c, spawn.r, map.start),
    dangerBonus: 0,
    steps: 0,
    kills: 0,
    bossDefeated: false,
    map,
    pos: null,
    battle: null,
    shopStock: null,
    pendingReward: null,
    mode: 'map', // map | battle | over
    log: [],
    result: null,
  };
  run.pos = spawn;
  const st = tileAt(run.map, run.pos.c, run.pos.r);
  if (st) {
    st.visited = true;
    if (st.type === 'start') {
      st.spawned = true;
      st.cleared = true;
    } else if (st.type === 'extract') {
      st.spawned = true;
    }
  }
  revealAround(run.map, run.pos.c, run.pos.r);
  persistWorldMap();
  runLog(`🏕️ 进入「${zone.name}」，危险度 ${run.danger}`, 'good');
  ui.modal = null;
  ui.targeting = null;
  ui.fxLock = false;
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
  if (!run || run.mode === 'over' || !card) return null;
  /* 战利品与牌堆共用同一个实例（uid 一致），便于卖出/丢弃时同步移除 */
  const inst = { uid: uid('l'), id, stashIndex: null };
  run.loot.push(inst);
  run.deck.push(inst);
  return card;
}
function runGivePotion(id) {
  const p = POTIONS[id];
  if (!run || run.mode === 'over' || !p) return null;
  run.potions.push(id);
  return p;
}
function runGainGold(n) {
  if (!run || run.mode === 'over' || !Number.isFinite(n) || n < 0) return 0;
  const mul = runTotals().goldMul || 1;
  const g = Math.round(n * mul);
  run.gold += g;
  return g;
}
function runLoseGold(n) {
  if (!run || run.mode === 'over' || !Number.isFinite(n) || n < 0) return 0;
  const g = Math.min(run.gold, n);
  run.gold -= g;
  return g;
}
function runHeal(n) {
  if (!run || run.mode === 'over' || !Number.isFinite(n) || n < 0) return 0;
  const h = Math.min(n, run.maxHp - run.hp);
  run.hp += h;
  return h;
}
function runDamage(n) {
  if (!run || run.mode === 'over' || !Number.isFinite(n) || n < 0) return 0;
  const lost = Math.min(run.hp, n);
  run.hp -= lost;
  if (run.hp <= 0) {
    run.hp = 0;
    /* 事件是一次完整操作：先完成其资源变化，再生成阵亡结算快照。 */
    if (!run.resolvingScene) resolveDeath('伤重不治');
  }
  return lost;
}
function runLoseMaxHp(n) {
  if (!run || run.mode === 'over' || !Number.isFinite(n) || n < 0) return 0;
  const lost = Math.min(n, Math.max(0, run.maxHp - SCENE_RULES.minMaxHp));
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
  if (!run || run.mode === 'over' || !b) return;
  if (b.scope === 'run' && b.eff.maxHp) {
    run.maxHp += b.eff.maxHp;
    run.hp = run.maxHp;
  }
  if (b.scope === 'run' && b.eff.heal) runHeal(b.eff.heal);
  run.buffs.push(b);
  runLog(`${b.emoji} 获得效果「${b.name}」：${buffDesc(b)}`, b.bad ? 'bad' : 'good');
}
function runRaiseDanger(n) {
  if (!run || run.mode === 'over' || !Number.isFinite(n) || n < 0) return;
  run.dangerBonus += n;
  run.danger = worldDangerAt(run.pos.c, run.pos.r, run.map.start) + run.dangerBonus;
  runLog(`⚠️ 危险度 +${n}（当前 ${run.danger}）`, 'bad');
}

function persistWorldMap() {
  if (!run || !run.map) return false;
  return saveWorldMap(snapshotWorldMap(run.map));
}
function runRemoveJunk() {
  if (!run || run.mode === 'over') return 0;
  for (let i = run.deck.length - 1; i >= 0; i--) {
    if (CARDS[run.deck[i].id].junk) {
      const inst = run.deck[i];
      if (inst.stashIndex != null) run.removedStash.push(inst.stashIndex);
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
  if (!run || run.mode !== 'map' || ui.screen !== 'map' || ui.modal || run.pendingReward)
    return false;
  if (!Number.isInteger(c) || !Number.isInteger(r)) return false;
  if (!isAdjacent(run.pos, { c, r })) return false;
  const t = ensureTile(run.map, c, r);
  return !!t && !(t.terrain && t.terrain.blocked);
}

function walkTo(c, r) {
  if (!canMoveTo(c, r)) return false;
  const t = tileAt(run.map, c, r);
  const previous = tileAt(run.map, run.pos.c, run.pos.r);
  run.steps++;
  run.danger = worldDangerAt(c, r, run.map.start) + run.dangerBonus;
  t.visited = true;
  run.pos = { c, r };
  revealAround(run.map, c, r);

  const stepDamage = Math.max(
    t.terrain ? t.terrain.moveDamage || 0 : 0,
    previous && previous.terrain ? previous.terrain.moveDamage || 0 : 0,
  );
  if (stepDamage) {
    const lost = runDamage(stepDamage);
    runLog(`🌋 环境伤害：移动消耗 ${lost} 点生命。`, 'bad');
    if (run.mode === 'over') {
      persistWorldMap();
      return true;
    }
  }

  if (!t.spawned) spawnTile(t);
  if (!t.cleared) enterCurrentScene();
  persistWorldMap();
  return true;
}

/* 地块调试器：只在大世界地图上使用，不会直接移动玩家。 */
function debugPlaceTile(c, r) {
  const tool = ui.mapDebug;
  if (!run || run.mode !== 'map' || ui.screen !== 'map' || !tool || !tool.active) return false;
  if (run.pos.c === c && run.pos.r === r) {
    toast('不能覆盖玩家所在的地块');
    return false;
  }
  const tile = ensureTile(run.map, c, r);
  if (!tile) return false;
  const type = TILE[tool.tileType] ? tool.tileType : 'combat';
  tile.type = type;
  tile.visited = false;
  tile.usedExtraction = false;
  tile.revealed = true;
  tile.spawned = false;
  tile.cleared = false;
  tile.payload = null;
  tile.sceneData = {};
  configureTileEnvironment(
    run.map,
    tile,
    WORLD_BIOMES[tool.biome] ? tool.biome : 'woodland',
    tool.wall,
  );
  persistWorldMap();
  runLog(`🧰 调试放置：${WORLD_BIOMES[tile.environment].name} · ${TILE[type].name}（${c}, ${r}）`);
  toast(`已放置 ${TILE[type].name} · ${WORLD_BIOMES[tile.environment].name}`);
  return true;
}

/* 首次发现时生成该地点固定内容；离开后重返仍会显示相同内容。 */
function spawnTile(t) {
  if (!run || !t || t.spawned || !TILE[t.type]) return;
  t.sceneData = t.sceneData || {};
  const info = TILE[t.type];
  if (t.type === 'combat' || t.type === 'elite') {
    t.payload = encounterFor(t);
    const names = t.payload.map((id) => ENEMIES[id].name).join('、');
    runLog(`${info.emoji} 进入${info.name}场景：${names}`, 'bad');
  } else if (t.type === 'empty') {
    t.sceneData = {
      gold: RNG.chance(SCENE_RULES.ruinGoldChance)
        ? RNG.int(SCENE_RULES.ruinGoldMin, SCENE_RULES.ruinGoldMax)
        : 0,
    };
  } else if (t.type === 'loot') {
    const n = RNG.chance(SCENE_RULES.lootExtraCardChance) ? 2 : 1;
    t.sceneData = {
      cards: Array.from({ length: n }, () => rollCardId(run.danger, run.zone.lootMul)),
      gold: RNG.int(SCENE_RULES.lootGoldMin, SCENE_RULES.lootGoldMax),
    };
  } else if (t.type === 'potion') {
    t.sceneData = { potionId: rollPotionId() };
  } else if (t.type === 'buff') {
    const ids = [];
    let attempts = 0;
    while (
      ids.length < SCENE_RULES.buffChoices &&
      attempts++ < SCENE_RULES.buffChoices * SCENE_RULES.rewardRerolls
    ) {
      const id = rollBuffId();
      if (!ids.includes(id)) ids.push(id);
    }
    t.sceneData = { buffIds: ids };
  } else if (t.type === 'event') {
    t.sceneData = { eventId: rollEventId() };
  } else if (t.type === 'hazard') {
    t.sceneData = {
      damage: HAZARD_DAMAGE + Math.floor(run.danger * SCENE_RULES.hazardDangerDamage),
    };
    runLog(`${info.emoji} 发现危险区域`, 'bad');
  } else if (t.type === 'extract') {
    runLog('🌀 已抵达撤离法阵', 'good');
  } else if (t.type !== 'start') {
    runLog(`${info.emoji} 进入${info.name}场景`, 'good');
  }
  t.spawned = true;
}
