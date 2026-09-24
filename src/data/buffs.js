'use strict';

/* 格子 buff 数据。scope: run(整次行动) | battle(限接下来 N 场战斗)。
 * 文案由 buffDesc() 从 eff 自动生成，禁止手写 desc。 */

/* global RNG, clamp */

const BUFFS = {};
function defBuff(b) {
  BUFFS[b.id] = b;
  return b;
}

/* ---- 增益 ---- */
defBuff({
  id: 'ration',
  name: '旅人干粮',
  emoji: '🍖',
  scope: 'run',
  eff: { maxHp: 8 },
});
defBuff({
  id: 'med_support',
  name: '圣水疗愈',
  emoji: '🚑',
  scope: 'run',
  eff: { heal: 25 },
});
defBuff({
  id: 'stim_inject',
  name: '狂战士药剂',
  emoji: '💉',
  scope: 'battle',
  battles: 3,
  eff: { energy: 1 },
});
defBuff({
  id: 'armor_plate',
  name: '守护者铠片',
  emoji: '🦺',
  scope: 'battle',
  battles: 2,
  eff: { startBlock: 5 },
});
defBuff({
  id: 'recon',
  name: '鹰眼符文',
  emoji: '🔭',
  scope: 'battle',
  battles: 3,
  eff: { draw: 1 },
});
defBuff({
  id: 'ammo_supply',
  name: '矮人弹药箱',
  emoji: '📦',
  scope: 'battle',
  battles: 3,
  eff: { damageMul: 1.25 },
});
defBuff({
  id: 'reinforced',
  name: '钢铁护符',
  emoji: '🧱',
  scope: 'battle',
  battles: 3,
  eff: { blockMul: 1.25 },
});
defBuff({
  id: 'spike_paint',
  name: '荆棘刻印',
  emoji: '🌵',
  scope: 'battle',
  battles: 2,
  eff: { thornsStart: 3 },
});
defBuff({
  id: 'danger_sense',
  name: '先兆之眼',
  emoji: '👁️',
  scope: 'battle',
  battles: 2,
  eff: { firstTurnEnergy: 2 },
});
defBuff({
  id: 'regen_serum',
  name: '生命露珠',
  emoji: '💚',
  scope: 'battle',
  battles: 3,
  eff: { healPerTurn: 2 },
});
defBuff({
  id: 'lucky_coin',
  name: '幸运硬币',
  emoji: '🪙',
  scope: 'run',
  eff: { shopDiscount: 0.3 },
});
defBuff({
  id: 'loot_expert',
  name: '盗贼手套',
  emoji: '🎒',
  scope: 'run',
  eff: { lootBonus: 1 },
});
defBuff({
  id: 'greed',
  name: '贪婪诅咒',
  emoji: '💰',
  scope: 'run',
  eff: { goldMul: 1.4 },
});
defBuff({
  id: 'extract_insurance',
  name: '归途卷轴',
  emoji: '🧾',
  scope: 'run',
  eff: { extractBonus: 60 },
});
defBuff({
  id: 'ghost_cloak',
  name: '返程符文',
  emoji: '🔮',
  scope: 'run',
  eff: { extractBonus: 30 },
});

/* ---- 诅咒（事件可能塞给你） ---- */
defBuff({
  id: 'radiation',
  name: '腐化诅咒',
  emoji: '☢️',
  scope: 'run',
  bad: true,
  eff: { hurtPerBattle: 3 },
});
defBuff({
  id: 'bad_ammo',
  name: '锈蚀箭矢',
  emoji: '💩',
  scope: 'battle',
  battles: 3,
  bad: true,
  eff: { damageMul: 0.8 },
});

/* 可随机到的增益（符文石/事件用） */
const BUFF_POOL = Object.keys(BUFFS).filter((id) => !BUFFS[id].bad);
const BAD_BUFF_POOL = Object.keys(BUFFS).filter((id) => BUFFS[id].bad);

function makeBuff(id) {
  const def = BUFFS[id];
  return {
    id: def.id,
    name: def.name,
    emoji: def.emoji,
    scope: def.scope,
    eff: def.eff,
    bad: !!def.bad,
    battles: def.battles || 0,
  };
}

function rollBuffId() {
  return RNG.pick(BUFF_POOL);
}
function rollBadBuffId() {
  return RNG.pick(BAD_BUFF_POOL);
}

/* 从一组 buff 汇总效果（战斗开始时调用） */
function buffTotals(buffs) {
  const t = {
    energy: 0,
    draw: 0,
    startBlock: 0,
    healPerTurn: 0,
    damageMul: 1,
    blockMul: 1,
    thornsStart: 0,
    firstTurnEnergy: 0,
    shopDiscount: 0,
    lootBonus: 0,
    goldMul: 1,
    extractBonus: 0,
    hurtPerBattle: 0,
    maxHp: 0,
    heal: 0,
  };
  for (let i = 0; i < buffs.length; i++) {
    const e = buffs[i].eff;
    for (const k in e) {
      if (k === 'damageMul' || k === 'blockMul' || k === 'goldMul') t[k] *= e[k];
      else t[k] = (t[k] || 0) + e[k];
    }
  }
  return t;
}

/* 文案自动生成 */
const PCT = (v) => Math.round(v * 100) + '%';
function buffDesc(b) {
  const e = b.eff;
  const p = [];
  if (e.maxHp) p.push(`生命上限 +${e.maxHp} 并回满`);
  if (e.heal) p.push(`立即回复 ${e.heal} 点生命`);
  if (e.energy) p.push(`每回合 +${e.energy} 点能量`);
  if (e.draw) p.push(`每回合多抽 ${e.draw} 张牌`);
  if (e.startBlock) p.push(`每回合开始获得 ${e.startBlock} 点护甲`);
  if (e.healPerTurn) p.push(`每回合结束回复 ${e.healPerTurn} 点生命`);
  if (e.firstTurnEnergy) p.push(`每场战斗第 1 回合 +${e.firstTurnEnergy} 点能量`);
  if (e.thornsStart) p.push(`每场战斗开始获得 ${e.thornsStart} 层荆棘`);
  if (e.damageMul && e.damageMul !== 1) p.push(`造成伤害 ×${e.damageMul}`);
  if (e.blockMul && e.blockMul !== 1) p.push(`获得护甲 ×${e.blockMul}`);
  if (e.shopDiscount) p.push(`商店价格 -${PCT(e.shopDiscount)}`);
  if (e.lootBonus) p.push('战利品品质提升');
  if (e.goldMul && e.goldMul !== 1) p.push(`金币收益 ×${e.goldMul}`);
  if (e.extractBonus) p.push(`撤离额外 +${e.extractBonus} 金币`);
  if (e.hurtPerBattle) p.push(`每场战斗开始失去 ${e.hurtPerBattle} 点生命`);
  return p.join('；') || '（无效果）';
}

function buffScopeText(b) {
  return b.scope === 'run' ? '本次行动' : `接下来 ${b.battles} 场战斗`;
}
