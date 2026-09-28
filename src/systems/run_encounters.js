'use strict';

/* 局内遭遇：格子触发、遭遇生成与战斗开始/结束衔接。 */

/* global meta, ui, run, TILE, CARDS, POTIONS, BUFFS, EVENTS, RNG, ENEMIES, ELITE_CARD_POOL, NORMAL_CARD_POOL, WORLD_BIOMES,
   BATTLE_POTION_CHANCE, ELITE_POTION_CHANCE, BOSS_POTION_CHANCE, SCENE_RULES,
   tileAt, newEncounter, pickEncounterIds, newBattle, battleResult, battleOver, rollPotionId, rollEventId,
   makeBuff, buffDesc, BOSS_POOL, ELITE_POOL, NORMAL_POOL, refresh, toast,
   runLog, openExtract, runGainGold, runGiveCard, runGivePotion, openFire, openShop,
   applyBuff, runDamage, consumeCards, resolveDeath, tickBuffs, openCardReward,
   runTotals, HAZARD_DAMAGE, BOSS_DEPTH */

/* ===================== 地点场景操作 ===================== */
function currentSceneTile() {
  return run && run.pos ? tileAt(run.map, run.pos.c, run.pos.r) : null;
}

/* 所有地点入口共用此函数；UI 只负责在成功后刷新。 */
function enterCurrentScene() {
  if (!run || run.mode !== 'map' || ui.screen !== 'map' || ui.modal || run.pendingReward)
    return false;
  const t = currentSceneTile();
  if (!t || !t.spawned || t.cleared) return false;
  if (t.type === 'combat' || t.type === 'elite') {
    return startBattle(t.payload, t.type, { c: t.c, r: t.r });
  }
  if (t.type === 'event') {
    t.sceneData = t.sceneData || {};
    let event = EVENTS[t.sceneData.eventId];
    if (!event) {
      t.sceneData.eventId = rollEventId();
      event = EVENTS[t.sceneData.eventId];
    }
    if (!event) return false;
    ui.screen = 'map';
    ui.modal = { kind: 'event', event, step: 'choice', result: null, fromWorld: true };
    ui.targeting = null;
    return true;
  }
  ui.screen = 'scene';
  ui.targeting = null;
  return true;
}

/* 地点弹窗中的后续操作也必须仍然属于同一地点。 */
function activeScene(type) {
  const eventOverlay =
    type === 'event' &&
    ui.screen === 'map' &&
    ui.modal &&
    ui.modal.kind === 'event' &&
    ui.modal.fromWorld;
  if (!run || run.mode !== 'map' || (ui.screen !== 'scene' && !eventOverlay) || run.pendingReward)
    return null;
  const t = currentSceneTile();
  return t && t.spawned && !t.cleared && (!type || t.type === type) ? t : null;
}

function leaveScene() {
  if (!run || run.mode !== 'map' || ui.screen !== 'scene' || run.pendingReward) return false;
  if (ui.modal) ui.modal = null;
  ui.screen = 'map';
  refresh();
  return true;
}

function showSceneResult(t, text, kind) {
  if (!run || !t) return;
  t.cleared = true;
  t.sceneData = t.sceneData || {};
  t.sceneData.result = text;
  runLog(text, kind || 'good');
  toast(text);
  ui.modal = null;
  if (run.mode !== 'over') ui.screen = 'scene';
  refresh();
}

function resolveSceneChoice(t, effect) {
  if (!t || t.cleared || !run || run.resolvingScene) return null;
  /* 提前占用这次操作，防止回调触发刷新时再次领取。 */
  t.cleared = true;
  run.resolvingScene = true;
  let text;
  try {
    text = effect();
  } finally {
    run.resolvingScene = false;
  }
  t.sceneData.result = text;
  if (run.hp <= 0) resolveDeath('伤重不治');
  return text;
}

function performSceneAction(action) {
  if (typeof action !== 'string' || ui.modal) return;
  if (action === 'leave') {
    leaveScene();
    return;
  }
  const t = activeScene();
  if (!t) return;
  const data = t.sceneData || {};
  const split = action.indexOf(':');
  const actionType = split < 0 ? action : action.slice(0, split);
  const actionValue = split < 0 ? '' : action.slice(split + 1);
  const sceneTypes = {
    search: 'empty',
    collect: 'loot',
    'take-potion': 'potion',
    'take-buff': 'buff',
    event: 'event',
    shop: 'shop',
    fire: 'fire',
    hazard: 'hazard',
    extract: 'extract',
  };
  if (sceneTypes[actionType] !== t.type) return;
  switch (actionType) {
    case 'search': {
      const gold = data.gold ? runGainGold(data.gold) : 0;
      showSceneResult(
        t,
        gold ? `🪨 翻找遗迹，找到 ${gold} 金币。` : '🪨 翻找遗迹，没有发现有价值的东西。',
        gold ? 'good' : 'info',
      );
      break;
    }
    case 'collect': {
      if (!Array.isArray(data.cards) || data.cards.some((id) => !CARDS[id])) return;
      const cards = (data.cards || []).map((id) => runGiveCard(id)).filter(Boolean);
      const gold = runGainGold(data.gold || 0);
      showSceneResult(
        t,
        `🎁 收集宝箱：${cards.map((c) => `「${c.name}」`).join('、')}${cards.length ? '、' : ''}${gold} 金币。`,
      );
      break;
    }
    case 'take-potion': {
      if (!POTIONS[data.potionId]) return;
      const p = runGivePotion(data.potionId);
      if (p) showSceneResult(t, `⚗️ 收下「${p.name}」。`);
      break;
    }
    case 'take-buff': {
      const id = actionValue;
      if (!Array.isArray(data.buffIds) || !data.buffIds.includes(id) || !BUFFS[id]) return;
      const buff = makeBuff(id);
      applyBuff(buff);
      showSceneResult(t, `选择了「${buff.name}」：${buffDesc(buff)}`);
      break;
    }
    case 'event': {
      const index = Number(actionValue);
      const event = EVENTS[data.eventId];
      const option = event && event.options[index];
      if (!Number.isInteger(index) || actionValue === '' || !option) return;
      if (option.canChoose && !option.canChoose()) return;
      if (option.leave) {
        leaveScene();
        return;
      }
      const result = resolveSceneChoice(t, () => option.run());
      if (run.mode === 'over') return;
      showSceneResult(t, `${event.title}：${result}`);
      break;
    }
    case 'shop':
      openShop();
      break;
    case 'fire':
      openFire();
      break;
    case 'hazard': {
      const damage = Number.isFinite(data.damage) ? data.damage : HAZARD_DAMAGE;
      resolveSceneChoice(t, () => `⚠️ 腐化液灼伤你，失去 ${runDamage(damage)} 点生命。`);
      if (run.mode === 'over') return;
      showSceneResult(t, t.sceneData.result, 'bad');
      break;
    }
    case 'extract':
      openExtract();
      break;
    default:
      break;
  }
}

/* 生成遭遇（战斗格按区域倍率，精英格必带精英） */
function encounterFor(t) {
  const zone = run.zone;
  if (t.type === 'elite') {
    return RNG.pick([['mao_die'], ['liu_huaqiang_elite', 'melon_vendor_elite']]);
  }
  return pickEncounterIds(run.danger, zone, 1);
}

/* ===================== 战斗 ===================== */
function startBattle(enemyIds, kind, at) {
  if (!run || run.mode !== 'map' || run.battle || run.pendingReward || ui.modal) return false;
  if (!Array.isArray(enemyIds) || !enemyIds.length) return false;
  /* 旧存档里缓存的无立绘敌人改用当前普通敌人承接，避免地点无法开战。 */
  enemyIds = enemyIds.map((id) => (ENEMIES[id] ? id : 'big_dog'));
  const tile =
    at && Number.isInteger(at.c) && Number.isInteger(at.r) ? tileAt(run.map, at.c, at.r) : null;
  if (at && (!tile || tile.cleared || at.c !== run.pos.c || at.r !== run.pos.r)) return false;
  const enemies = newEncounter(enemyIds, run.danger, run.zone);
  const hasBoss = enemies.some((e) => e.tier === 'boss');
  run.battle = newBattle({
    hp: run.hp,
    maxHp: run.maxHp,
    deck: run.deck,
    buffs: run.buffs,
    enemies,
    potions: run.potions,
    summons: run.summons,
    environment: tile
      ? {
          name: (WORLD_BIOMES[tile.environment] || {}).name || '野外',
          battleDamage: tile.terrain ? tile.terrain.battleDamage || 0 : 0,
        }
      : null,
  });
  run.battle.kind = hasBoss ? 'boss' : kind || 'combat';
  run.battle.at = at || null;
  run.battle.location = tile ? TILE[tile.type].name : '遭遇战';
  run.mode = 'battle';
  ui.screen = 'battle';
  ui.battleTarget = 0;
  ui.targeting = null;
  ui.modal = null;
  runLog(`⚔️ 战斗开始：${enemies.map((e) => e.name).join('、')}`, 'bad');
  return true;
}

/* UI 在战斗结束后调用 */
function resolveBattle() {
  if (!run || run.mode !== 'battle' || !run.battle || !battleOver(run.battle)) return;
  ui.targeting = null;
  const res = battleResult(run.battle);
  const kind = run.battle.kind;
  const enemies = run.battle.enemies;
  const at = run.battle.at;
  run.hp = res.hp;
  run.potions = run.battle.potions.slice();
  run.battle = null;

  /* 「消耗」牌：用完即从本局卡组移除（撤离也拿不回来，阵亡同样丢） */
  consumeCards(res.spent);

  if (res.result === 'lose') {
    resolveDeath('战斗中阵亡');
    return;
  }

  /* 打赢后格子才算处理完 */
  if (at) {
    const tt = tileAt(run.map, at.c, at.r);
    if (tt) {
      tt.cleared = true;
      ui.screen = 'map';
    }
  }

  /* 胜利结算 */
  let gold = res.goldGain;
  for (let i = 0; i < enemies.length; i++) {
    gold += enemies[i].gold;
    if (enemies[i].tier === 'boss') run.bossDefeated = true;
  }
  const claimableGold = Math.round(gold * (runTotals().goldMul || 1));
  run.kills += enemies.length;
  meta.stats.kills += enemies.length;
  runLog(`🏆 战斗胜利，请认领奖励：${claimableGold} 金币`, 'good');

  const potionChance =
    kind === 'boss'
      ? BOSS_POTION_CHANCE
      : kind === 'elite'
        ? ELITE_POTION_CHANCE
        : BATTLE_POTION_CHANCE;
  const potionId = RNG.chance(potionChance) ? rollPotionId() : null;
  const characterCardPool =
    kind === 'elite' || kind === 'combat'
      ? (kind === 'elite' ? ELITE_CARD_POOL : NORMAL_CARD_POOL).filter((id) =>
          enemies.some((enemy) => enemy.characterId === CARDS[id].characterId),
        )
      : null;
  tickBuffs();
  run.mode = 'map';
  ui.screen = 'map';
  /* 战斗奖励选牌 */
  openCardReward(kind, {
    gold: claimableGold,
    potionId,
    cardPool: characterCardPool,
  });
}
