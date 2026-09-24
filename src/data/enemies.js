'use strict';

/* 敌人数据与实例化。数值按危险度与区域倍率成长。 */

/* global DANGER_HP, DANGER_DMG, DANGER_GOLD, RNG, uid, clamp, STATUS, calcAttack */

/* 招式字段：
 *  label/emoji  意图展示
 *  dmg/times    攻击伤害与段数
 *  block        自身获得护甲
 *  heal         自身回复
 *  self[]       对自身施加状态
 *  player[]     对玩家施加状态
 *  w            权重
 */

const ENEMIES = {};
function defEnemy(e) {
  ENEMIES[e.id] = e;
  return e;
}

defEnemy({
  id: 'scavenger',
  name: '哥布林咒术师',
  characterId: 'reply_ghost',
  archetype: 'scavenger',
  emoji: '👺',
  tier: 'normal',
  hp: 22,
  gold: 14,
  moves: [
    { label: '重复咒语', emoji: '📜', dmg: 6, w: 50 },
    { label: '回声小盾', emoji: '🛡️', block: 5, dmg: 3, w: 25 },
    { label: '双重咒击', emoji: '✨', dmg: 4, times: 2, w: 25 },
  ],
});
defEnemy({
  id: 'wild_dog',
  name: '喷火犬',
  characterId: 'flame_hound',
  archetype: 'disruptor',
  emoji: '🐕‍🦺',
  tier: 'normal',
  hp: 16,
  gold: 10,
  moves: [
    { label: '利齿撕咬', emoji: '🦷', dmg: 5, times: 2, w: 45 },
    { label: '灼热咆哮', emoji: '🔥', dmg: 3, player: [{ st: 'weak', v: 1 }], w: 25 },
    { label: '烈焰扑击', emoji: '🐾', dmg: 9, w: 30 },
  ],
});
defEnemy({
  id: 'patrol',
  name: '回音石像',
  characterId: 'repost_bot',
  archetype: 'attacker',
  emoji: '🪖',
  tier: 'normal',
  hp: 30,
  gold: 18,
  moves: [
    { label: '回声震荡', emoji: '🔊', dmg: 7, w: 45 },
    { label: '石像壁垒', emoji: '🧱', block: 8, dmg: 3, w: 25 },
    { label: '震耳咆哮', emoji: '📣', dmg: 4, player: [{ st: 'weak', v: 1 }], w: 30 },
  ],
});
defEnemy({
  id: 'drone',
  name: '迷路魔像',
  characterId: 'crawler_probe',
  archetype: 'disruptor',
  emoji: '🗿',
  tier: 'normal',
  hp: 18,
  gold: 16,
  moves: [
    { label: '石拳横扫', emoji: '🔺', dmg: 6, w: 45 },
    { label: '笨拙出拳', emoji: '👊', dmg: 2, player: [{ st: 'vuln', v: 1 }], w: 30 },
    { label: '用力过猛', emoji: '⚡', dmg: 11, w: 25 },
  ],
});
defEnemy({
  id: 'mutant',
  name: '狂战食人魔',
  characterId: 'rage_glitch',
  archetype: 'attacker',
  emoji: '👹',
  tier: 'normal',
  hp: 34,
  gold: 22,
  moves: [
    { label: '怒火重击', emoji: '🔨', dmg: 10, w: 40 },
    { label: '狂怒', emoji: '💚', heal: 6, self: [{ st: 'str', v: 1 }], w: 25 },
    { label: '乱拳连击', emoji: '🐾', dmg: 5, times: 2, w: 35 },
  ],
});
defEnemy({
  id: 'sniper',
  name: '游侠弓手',
  characterId: 'quote_sniper',
  archetype: 'attacker',
  emoji: '🎯',
  tier: 'normal',
  hp: 20,
  gold: 20,
  moves: [
    { label: '蓄力瞄准', emoji: '💪', self: [{ st: 'str', v: 2 }], block: 4, w: 30 },
    { label: '穿心箭', emoji: '💥', dmg: 14, w: 40 },
    { label: '闪身后撤', emoji: '🛡️', block: 7, w: 30 },
  ],
});
defEnemy({
  id: 'bomber',
  name: '诅咒术士',
  characterId: 'meme_bomber',
  archetype: 'attacker',
  emoji: '💣',
  tier: 'normal',
  hp: 26,
  gold: 20,
  moves: [
    { label: '投掷诅咒卷轴', emoji: '📜', dmg: 8, w: 45 },
    { label: '毒瓶陷阱', emoji: '☣️', dmg: 3, player: [{ st: 'poison', v: 3 }], w: 30 },
    { label: '爆裂咒', emoji: '💥', dmg: 13, w: 25 },
  ],
});
defEnemy({
  id: 'raider',
  name: '黑羽骑士',
  characterId: 'trend_raider',
  archetype: 'attacker',
  emoji: '🏴‍☠️',
  tier: 'normal',
  hp: 30,
  gold: 24,
  moves: [
    { label: '双刃连斩', emoji: '⚔️', dmg: 6, times: 2, w: 40 },
    { label: '格挡', emoji: '🛡️', block: 10, w: 20 },
    {
      label: '怒吼',
      emoji: '😤',
      dmg: 4,
      self: [{ st: 'str', v: 1 }],
      player: [{ st: 'vuln', v: 1 }],
      w: 40,
    },
  ],
});

defEnemy({
  id: 'cleaner',
  name: '审判骑士',
  characterId: 'admin_enforcer',
  archetype: 'elite',
  emoji: '🛡️',
  tier: 'elite',
  hp: 66,
  gold: 55,
  moves: [
    { label: '连弩齐射', emoji: '🏹', dmg: 9, times: 2, w: 40 },
    { label: '盾阵', emoji: '🛡️', block: 12, self: [{ st: 'dex', v: 2 }], w: 25 },
    { label: '骑士冲锋', emoji: '🐎', dmg: 16, w: 20 },
    { label: '战吼', emoji: '📣', dmg: 6, player: [{ st: 'weak', v: 2 }], w: 15 },
  ],
});
defEnemy({
  id: 'abomination',
  name: '腐化巨魔',
  characterId: 'data_aberration',
  archetype: 'elite',
  emoji: '🧟',
  tier: 'elite',
  hp: 80,
  gold: 60,
  moves: [
    { label: '腐蚀', emoji: '☣️', dmg: 6, player: [{ st: 'poison', v: 4 }], w: 30 },
    { label: '巨爪连击', emoji: '🐙', dmg: 8, times: 2, w: 30 },
    { label: '生命汲取', emoji: '🩸', dmg: 8, heal: 10, w: 20 },
    {
      label: '尖啸',
      emoji: '📣',
      dmg: 4,
      player: [
        { st: 'vuln', v: 2 },
        { st: 'weak', v: 2 },
      ],
      w: 20,
    },
  ],
});
defEnemy({
  id: 'marksman',
  name: '暗影术士',
  characterId: 'top_comment_sniper',
  archetype: 'elite',
  emoji: '🧙',
  tier: 'elite',
  hp: 58,
  gold: 58,
  moves: [
    { label: '诅咒印记', emoji: '🎯', dmg: 3, player: [{ st: 'vuln', v: 3 }], w: 25 },
    { label: '魔法飞弹', emoji: '💥', dmg: 18, w: 35 },
    { label: '镜像护盾', emoji: '🛡️', block: 15, dmg: 4, w: 20 },
    { label: '双重咒击', emoji: '✨', dmg: 7, times: 2, w: 20 },
  ],
});

defEnemy({
  id: 'collector',
  name: '深渊魔王',
  characterId: 'algorithm_harvester',
  archetype: 'boss',
  emoji: '👿',
  tier: 'boss',
  hp: 140,
  gold: 160,
  moves: [
    {
      label: '锁链禁锢',
      emoji: '⛓️',
      dmg: 6,
      player: [
        { st: 'weak', v: 2 },
        { st: 'vuln', v: 2 },
      ],
      w: 25,
    },
    { label: '地狱火球', emoji: '🔥', dmg: 11, times: 2, w: 30 },
    { label: '魔王护盾', emoji: '🛡️', block: 25, self: [{ st: 'dex', v: 2 }], w: 20 },
    { label: '生命汲取', emoji: '🩸', dmg: 14, heal: 8, w: 25 },
  ],
});
defEnemy({
  id: 'watchman',
  name: '古代飞龙',
  characterId: 'not_found_keeper',
  archetype: 'boss',
  emoji: '🕯️',
  tier: 'boss',
  hp: 160,
  gold: 180,
  moves: [
    { label: '龙翼双斩', emoji: '⚔️', dmg: 13, times: 2, w: 30 },
    { label: '龙威震慑', emoji: '💫', dmg: 4, player: [{ st: 'stun', v: 1 }], w: 15 },
    { label: '龙息吐息', emoji: '🔥', dmg: 21, w: 25 },
    { label: '龙血复原', emoji: '💚', heal: 12, self: [{ st: 'str', v: 2 }], w: 30 },
  ],
});

/* 各区域可出的普通敌人（精英/Boss 单独处理） */
const NORMAL_POOL = [
  'scavenger',
  'wild_dog',
  'patrol',
  'drone',
  'mutant',
  'sniper',
  'bomber',
  'raider',
];
const ELITE_POOL = ['cleaner', 'abomination', 'marksman'];
const BOSS_POOL = ['collector', 'watchman'];

/* ---- 数值成长 ---- */
function enemyScale(danger, zone) {
  const zoom = (zone && zone.dangerMul) || 1;
  const d = (danger || 0) * zoom;
  return {
    hp: 1 + d * DANGER_HP,
    dmg: 1 + d * DANGER_DMG,
    gold: 1 + d * DANGER_GOLD,
  };
}

/* 随机挑一批敌人 id（tier 混合） */
function pickEncounterIds(danger, zone, eliteness) {
  const ids = [];
  const n = eliteness > 1 ? 2 : RNG.chance(0.35) ? 2 : 1;
  for (let i = 0; i < n; i++) ids.push(RNG.pick(NORMAL_POOL));
  if (RNG.chance(clamp((eliteness - 1) * 0.5, 0, 0.9))) ids.push(RNG.pick(ELITE_POOL));
  return ids;
}

function makeEnemy(id, danger, zone) {
  const def = ENEMIES[id] || ENEMIES.scavenger;
  const s = enemyScale(danger, zone);
  const hp = Math.max(1, Math.round(def.hp * s.hp));
  return {
    uid: uid('e'),
    id: def.id,
    name: def.name,
    emoji: def.emoji,
    tier: def.tier,
    characterId: def.characterId || def.id,
    archetype: def.archetype || def.tier,
    hp,
    maxHp: hp,
    block: 0,
    st: {},
    dmgMul: s.dmg,
    gold: Math.round(def.gold * s.gold),
    moves: def.moves,
    lastMove: null,
    sameCount: 0,
    intent: null,
  };
}

/* 抽招式（不连续 3 次同招） */
function rollIntent(enemy) {
  const items = [];
  for (let i = 0; i < enemy.moves.length; i++) {
    const m = enemy.moves[i];
    let w = m.w || 30;
    if (m.label === enemy.lastMove && enemy.sameCount >= 1) w = Math.max(1, Math.round(w * 0.35));
    items.push({ m, w });
  }
  const picked = RNG.weighted(items).m;
  if (picked.label === enemy.lastMove) enemy.sameCount++;
  else {
    enemy.lastMove = picked.label;
    enemy.sameCount = 0;
  }
  enemy.intent = picked;
  return picked;
}

function newEncounter(ids, danger, zone) {
  const list = ids.map((id) => {
    const e = makeEnemy(id, danger, zone);
    rollIntent(e);
    return e;
  });
  return list;
}

/* 意图展示：显示敌人下一步要做什么，攻击会算上力量/虚弱/易伤，给出真实伤害 */
function intentText(e, playerSt) {
  const m = e.intent;
  if (!m) return '待机';
  const parts = [];
  if (m.dmg) {
    /* calcAttack 在 combat.js 里（运行时已加载）；无则退回粗略值 */
    const d =
      typeof calcAttack === 'function'
        ? calcAttack(m.dmg, e.st || {}, playerSt || {}, e.dmgMul)
        : Math.round(m.dmg * e.dmgMul);
    parts.push(m.times > 1 ? `${d} × ${m.times}` : `${d}`);
  }
  if (m.block) parts.push(`🛡${m.block}`);
  if (m.heal) parts.push(`💚${m.heal}`);
  const bad = [];
  if (m.player) for (let i = 0; i < m.player.length; i++) bad.push(STATUS[m.player[i].st].emoji);
  if (m.self) for (let i = 0; i < m.self.length; i++) parts.push(STATUS[m.self[i].st].emoji);
  let s = parts.join(' ');
  if (bad.length) s += (s ? ' ' : '') + bad.join('');
  return s || m.label;
}

/* 意图分类：给 UI 决定图标与配色 */
function intentKind(e) {
  const m = e.intent;
  if (!m) return 'idle';
  if (m.dmg) return m.player ? 'attack-debuff' : 'attack';
  if (m.block) return 'block';
  if (m.heal) return 'heal';
  if (m.player) return 'debuff';
  if (m.self) return 'buff';
  return 'idle';
}

/* 意图的可读描述（title 提示用） */
function intentLabel(e) {
  const m = e.intent;
  if (!m) return '待机';
  const bits = [m.label];
  if (m.dmg)
    bits.push(`造成 ${intentText(e).split(' ')[0]} 点伤害${m.times > 1 ? `，${m.times} 次` : ''}`);
  if (m.block) bits.push(`获得 ${m.block} 点护甲`);
  if (m.heal) bits.push(`回复 ${m.heal} 点生命`);
  if (m.player) {
    for (let i = 0; i < m.player.length; i++) {
      bits.push(`使你获得 ${m.player[i].v} 层${STATUS[m.player[i].st].name}`);
    }
  }
  if (m.self) {
    for (let i = 0; i < m.self.length; i++) {
      bits.push(`自身获得 ${m.self[i].v} 层${STATUS[m.self[i].st].name}`);
    }
  }
  return bits.join('：');
}
