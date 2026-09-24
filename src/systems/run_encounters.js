'use strict';

/* 局内遭遇：格子触发、遭遇生成与战斗开始/结束衔接。 */

/* global meta, ui, run:writable, ZONES, TILE, CARDS, POTIONS, BUFFS, EVENTS, RNG, uid, clamp,
   SAVE_KEY, DECK_MAX, POTION_SLOTS, SECURE_SLOTS, BATTLE_REWARD_CARDS, BATTLE_POTION_CHANCE, ELITE_POTION_CHANCE,
   BOSS_POTION_CHANCE, DANGER_GOLD, SHOP_CARD_SLOTS, SHOP_POTION_SLOTS, SELL_RATE,
   SHOP_UPGRADE_COST, FIRE_HEAL_RATE,
   genMap, tileAt, isAdjacent, revealAround, newEncounter, pickEncounterIds, newBattle,
   battleResult, aliveEnemies, rollIntent, rollCardId, rollPotionId, rollEventId, rollBuffId,
   rollBadBuffId, makeBuff, buffTotals, buffDesc, cardSellPrice, cardPrice, saveMeta,
   POTION_IDS, ENEMIES, BOSS_POOL, ELITE_POOL, NORMAL_POOL, refresh, closeModal, toast, Toy,
   upgradedId, canUpgradeCard, runLog, openExtract, runGainGold, runGiveCard, runGivePotion,
   openBuffPick, openFire, openShop, openEvent, applyBuff, runDamage, consumeCards, resolveDeath,
   tickBuffs, openCardReward, runTotals, HAZARD_DAMAGE, BOSS_DEPTH */

/* ===================== 地点场景操作 ===================== */
function currentSceneTile() {
  return run && tileAt(run.map, run.pos.c, run.pos.r);
}

function leaveScene() {
  if (ui.modal) ui.modal = null;
  ui.screen = 'map';
  refresh();
}

function showSceneResult(t, text, kind) {
  t.cleared = true;
  t.sceneData = t.sceneData || {};
  t.sceneData.result = text;
  runLog(text, kind || 'good');
  toast(text);
  if (run.mode !== 'over') ui.screen = 'map';
  refresh();
}

function performSceneAction(action) {
  const t = currentSceneTile();
  if (!t || t.cleared || !t.spawned) return;
  const data = t.sceneData || {};
  const split = action.indexOf(':');
  const actionType = split < 0 ? action : action.slice(0, split);
  const actionValue = split < 0 ? '' : action.slice(split + 1);
  switch (actionType) {
    case 'search': {
      const gold = data.gold ? runGainGold(data.gold) : 0;
      showSceneResult(t, gold ? `🪨 翻找遗迹，找到 ${gold} 金币。` : '🪨 翻找遗迹，没有发现有价值的东西。', gold ? 'good' : 'info');
      break;
    }
    case 'collect': {
      const cards = (data.cards || []).map((id) => runGiveCard(id)).filter(Boolean);
      const gold = runGainGold(data.gold || 0);
      showSceneResult(t, `🎁 收集宝箱：${cards.map((c) => `「${c.name}」`).join('、')}${cards.length ? '、' : ''}${gold} 金币。`);
      break;
    }
    case 'take-potion': {
      const p = runGivePotion(data.potionId);
      if (p) showSceneResult(t, `⚗️ 收下「${p.name}」。`);
      break;
    }
    case 'take-buff': {
      const id = actionValue;
      if (!data.buffIds.includes(id)) return;
      const buff = makeBuff(id);
      applyBuff(buff);
      showSceneResult(t, `选择了「${buff.name}」：${buffDesc(buff)}`);
      break;
    }
    case 'event': {
      const index = Number(actionValue);
      const event = EVENTS[data.eventId];
      const option = event && event.options[index];
      if (!option) return;
      const result = option.run();
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
      const damage = data.damage || HAZARD_DAMAGE;
      runDamage(damage);
      if (run.mode === 'over') return;
      showSceneResult(t, `⚠️ 腐化液灼伤你，失去 ${damage} 点生命。`, 'bad');
      break;
    }
    case 'extract':
      openExtract();
      break;
    case 'leave':
      leaveScene();
      break;
    default:
      break;
  }
}

/* 生成遭遇（战斗格按区域倍率，精英格必带精英） */
function encounterFor(t) {
  const zone = run.zone;
  if (t.type === 'elite') {
    const ids = [RNG.pick(ELITE_POOL)];
    if (RNG.chance(0.4)) ids.push(RNG.pick(NORMAL_POOL));
    return ids;
  }
  /* 深处有概率遇到 Boss */
  if (run.danger >= BOSS_DEPTH && !run.bossDefeated && RNG.chance(0.12)) {
    return [RNG.pick(BOSS_POOL)];
  }
  return pickEncounterIds(run.danger, zone, 1);
}

/* ===================== 战斗 ===================== */
function startBattle(enemyIds, kind, at) {
  const enemies = newEncounter(enemyIds, run.danger, run.zone);
  const hasBoss = enemies.some((e) => e.tier === 'boss');
  run.battle = newBattle({
    hp: run.hp,
    maxHp: run.maxHp,
    deck: run.deck,
    buffs: run.buffs,
    enemies,
    potions: run.potions,
  });
  run.battle.kind = hasBoss ? 'boss' : kind || 'combat';
  run.battle.at = at || null;
  run.battle.location = at ? TILE[tileAt(run.map, at.c, at.r).type].name : '遭遇战';
  run.mode = 'battle';
  ui.screen = 'battle';
  ui.battleTarget = 0;
  ui.targeting = null;
  runLog(`⚔️ 战斗开始：${enemies.map((e) => e.name).join('、')}`, 'bad');
}

/* UI 在战斗结束后调用 */
function resolveBattle() {
  if (!run.battle) return;
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
  tickBuffs();
  run.mode = 'map';
  ui.screen = 'map';
  /* 战斗奖励选牌 */
  openCardReward(kind, { gold: claimableGold, potionId });
}
