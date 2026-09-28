'use strict';

/* 启动时检查内容引用；只读数据，不消耗 RNG，也不修改存档。 */
/* global CARDS, CARD_UPGRADES, POTIONS, ENEMIES, BUFFS, EVENTS, ZONES, STATUS, SUMMONS,
   RARITY, TILE, TILE_WEIGHTS, NORMAL_POOL, ELITE_POOL, BOSS_POOL, ELITE_CARD_POOL, NORMAL_CARD_POOL, starterDeck */

function validateGameContent() {
  const errors = [];
  const knownFx = new Set([
    'dmg',
    'dmgAll',
    'block',
    'draw',
    'energy',
    'heal',
    'loseHp',
    'gold',
    'status',
    'recover',
    'addCard',
    'powerBlock',
    'powerHeal',
    'powerEnergy',
    'powerStr',
    'cleanse',
    'goldPerHit',
    'nextAttackDiscount',
    'vulnerableDamage',
    'summon',
    'summonAttackAll',
    'summonAttack',
    'assimilationAura',
    'powerPenguinGroup',
    'huff',
    'powerAttackEcho',
    'nextTurnAttackBonus',
  ]);
  const valuedFx = new Set([
    'dmg',
    'dmgAll',
    'block',
    'draw',
    'energy',
    'heal',
    'loseHp',
    'gold',
    'status',
    'recover',
    'powerBlock',
    'powerHeal',
    'powerEnergy',
    'powerStr',
    'goldPerHit',
    'nextAttackDiscount',
    'vulnerableDamage',
    'summonAttackAll',
    'assimilationAura',
    'powerPenguinGroup',
    'huff',
    'nextTurnAttackBonus',
  ]);
  const validNumber = (v) => Number.isFinite(v) && v >= 0;
  function checkFx(fx, owner) {
    if (!Array.isArray(fx)) {
      errors.push(owner + ' 缺少效果列表');
      return;
    }
    fx.forEach((f) => {
      if (!f || !knownFx.has(f.k)) {
        errors.push(owner + ' 存在未知效果');
        return;
      }
      if (valuedFx.has(f.k) && !validNumber(f.v)) errors.push(owner + ' 效果缺少有效数值');
      if (f.v != null && !validNumber(f.v)) errors.push(owner + ' 效果数值无效');
      if (f.times != null && (!Number.isInteger(f.times) || f.times < 1))
        errors.push(owner + ' 连击次数无效');
      if (
        f.k === 'summon' &&
        (!SUMMONS[f.id] ||
          !Number.isInteger(f.n) ||
          f.n < 1 ||
          !Number.isInteger(f.attack) ||
          f.attack < 1 ||
          !Number.isInteger(f.hp) ||
          f.hp < 1)
      )
        errors.push(owner + ' 召唤效果配置无效');
      if (f.k === 'powerAttackEcho' && (!Number.isFinite(f.chance) || f.chance < 0 || f.chance > 1))
        errors.push(owner + ' 额外触发概率无效');
      if (
        f.onKillHealMaxFraction != null &&
        (!Number.isFinite(f.onKillHealMaxFraction) ||
          f.onKillHealMaxFraction < 0 ||
          f.onKillHealMaxFraction > 1)
      )
        errors.push(owner + ' 击杀恢复比例无效');
      if (f.bonusIfWeak != null && (!Number.isFinite(f.bonusIfWeak) || f.bonusIfWeak < 0))
        errors.push(owner + ' 虚弱增伤无效');
      if (
        f.k === 'status' &&
        (!STATUS[f.st] || (f.target != null && !['self', 'enemy', 'allEnemies'].includes(f.target)))
      )
        errors.push(owner + ' 状态或目标无效');
      if (
        f.k === 'addCard' &&
        (!CARDS[f.card] ||
          !['hand', 'draw', 'discard'].includes(f.to) ||
          (f.n != null && (!Number.isInteger(f.n) || f.n < 1)))
      )
        errors.push(owner + ' 塞牌效果配置无效');
      for (const key of ['bonusFirstHit', 'bonusIfVulnerable']) {
        if (f[key] != null && !validNumber(f[key])) errors.push(owner + ' 攻击加成无效');
      }
      if (f.onKill) checkFx(f.onKill, owner + ' 击杀效果');
      if (f.onSurvive) checkFx(f.onSurvive, owner + ' 未击杀效果');
    });
  }
  Object.entries(CARDS).forEach(([id, c]) => {
    if (c.id !== id || !c.name || !RARITY[c.rarity] || !validNumber(c.cost))
      errors.push('卡牌 ' + id + ' 配置无效');
    checkFx(c.fx, '卡牌 ' + id);
  });
  Object.keys(CARD_UPGRADES).forEach((id) => {
    /* 升级表可能保留暂未启用的旧卡配置；只校验当前卡池中的基础卡。 */
    if (CARDS[id] && !CARDS[id + '＋']) errors.push('卡牌 ' + id + ' 尚未生成有效升级版');
  });
  if (!Array.isArray(ELITE_CARD_POOL) || ELITE_CARD_POOL.some((id) => !CARDS[id]))
    errors.push('双人精英掉落卡池引用无效');
  if (!Array.isArray(NORMAL_CARD_POOL) || NORMAL_CARD_POOL.some((id) => !CARDS[id]))
    errors.push('普通敌人专属卡池引用无效');
  if (starterDeck().some((id) => !CARDS[id] || CARDS[id].junk)) errors.push('初始卡组引用无效');
  Object.entries(POTIONS).forEach(([id, p]) => {
    if (!p.name || !validNumber(p.price)) errors.push('药剂 ' + id + ' 配置无效');
    checkFx(p.fx, '药剂 ' + id);
  });
  Object.entries(ENEMIES).forEach(([id, e]) => {
    if (!e.name || !validNumber(e.hp) || e.hp < 1 || !Array.isArray(e.moves) || !e.moves.length) {
      errors.push('敌人 ' + id + ' 配置无效');
      return;
    }
    e.moves.forEach((move) => {
      if (
        !move.label ||
        (move.w != null && !validNumber(move.w)) ||
        (move.dmg != null && !validNumber(move.dmg)) ||
        (move.times != null && (!Number.isInteger(move.times) || move.times < 1))
      ) {
        errors.push('敌人 ' + id + ' 招式配置无效');
      }
      for (const status of (move.self || []).concat(move.player || [])) {
        if (!STATUS[status.st] || !validNumber(status.v))
          errors.push('敌人 ' + id + ' 招式状态无效');
      }
    });
  });
  [NORMAL_POOL, ELITE_POOL].forEach((pool) => {
    if (!pool.length || pool.some((id) => !ENEMIES[id])) errors.push('遭遇池含无效敌人');
  });
  if (BOSS_POOL.some((id) => !ENEMIES[id])) errors.push('Boss 遭遇池含无效敌人');
  Object.entries(EVENTS).forEach(([id, event]) => {
    if (
      !event.title ||
      !Array.isArray(event.options) ||
      !event.options.length ||
      event.options.some(
        (opt) =>
          !opt.label ||
          typeof opt.run !== 'function' ||
          (opt.canChoose != null && typeof opt.canChoose !== 'function') ||
          (opt.leave != null && typeof opt.leave !== 'boolean'),
      )
    )
      errors.push('事件 ' + id + ' 选项无效');
  });
  Object.entries(BUFFS).forEach(([id, buff]) => {
    if (!buff.eff || !['run', 'battle'].includes(buff.scope))
      errors.push('增益 ' + id + ' 配置无效');
  });
  Object.entries(ZONES).forEach(([id, zone]) => {
    if (
      ![zone.cols, zone.rows, zone.extractCount].every((n) => Number.isInteger(n) && n > 0) ||
      zone.cols < 2 ||
      zone.extractCount > zone.rows
    )
      errors.push('区域 ' + id + ' 尺寸或撤离点无效');
  });
  Object.keys(TILE_WEIGHTS).forEach((type) => {
    if (!TILE[type] || !validNumber(TILE_WEIGHTS[type])) errors.push('地点权重 ' + type + ' 无效');
  });
  return errors;
}
