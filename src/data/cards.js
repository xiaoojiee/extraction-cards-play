'use strict';

/* 卡牌数据与文案生成。文案一律由 cardText() 从 fx 生成，禁止手写 text 字段。 */

/* global RARITY, STATUS, LOOT_RARITIES, RNG */

/* fx 效果种类（由 combat.js 解释执行）：
 *  dmg{v,times}            对目标造成伤害
 *  dmgAll{v,times}         对所有敌人造成伤害
 *  block{v}                获得护甲
 *  draw{v}                 抽牌
 *  energy{v}               获得能量
 *  heal{v}                 回复生命
 *  loseHp{v}               失去生命(护甲无法抵挡)
 *  gold{v}                 获得金币
 *  status{st,v,target}     施加状态 enemy|allEnemies|self
 *  recover{v}              从弃牌堆随机回收 v 张到手牌
 *  addCard{card,to,n}      往 手牌/抽牌堆/弃牌堆 塞牌
 *  powerBlock{v}           能力：每回合开始获得护甲
 *  powerHeal{v}            能力：每回合结束回复生命
 *  powerEnergy{v}          能力：每回合 +能量
 *  powerStr{v}             能力：每回合获得力量
 *  summon{id,n,attack,hp}  召唤可跨战斗存活的伙伴
 */

const CARDS = {};
const SUMMONS = {
  penguin: { id: 'penguin', name: '小企鹅', emoji: '🐧', image: 'assets/卡面/咕咕嘎嘎-香企鹅.png' },
};
function defCard(c) {
  CARDS[c.id] = c;
  return c;
}

/* ===================== 升级表 =====================
 * 与卡牌数据分开维护，便于集中调平衡。
 * 支持改效果 fx / 改费用 cost / 取消消耗 exhaust。
 * 生成规则：CARDS[id + '＋'] 由 buildUpgrades() 从基底卡派生。 */
const CARD_UPGRADES = {
  /* 基础 */
  strike: { fx: [{ k: 'dmg', v: 9 }] },
  defend: { fx: [{ k: 'block', v: 8 }] },
  crowbar: { fx: [{ k: 'dmg', v: 11 }] },
  bandage: { fx: [{ k: 'heal', v: 7 }] },

  /* 普通 */
  viral_reply: {
    fx: [
      { k: 'dmg', v: 9 },
      { k: 'draw', v: 1 },
    ],
  },
  firewall_breach: {
    fx: [
      { k: 'dmg', v: 15 },
      { k: 'status', st: 'vuln', v: 2, target: 'enemy' },
    ],
  },
  cache_shield: { fx: [{ k: 'block', v: 11 }] },
  algorithm_boost: { fx: [{ k: 'powerBlock', v: 3 }] },
  knife_throw: { fx: [{ k: 'dmg', v: 9 }] },
  mark: { fx: [{ k: 'status', st: 'vuln', v: 3, target: 'enemy' }] },
  scavenger: { fx: [{ k: 'draw', v: 3 }] },
  burst_fire: { fx: [{ k: 'dmg', v: 12 }] },
  cover: { fx: [{ k: 'block', v: 11 }] },
  disarm: { fx: [{ k: 'status', st: 'weak', v: 3, target: 'enemy' }] },
  first_aid: { fx: [{ k: 'heal', v: 10 }] },
  ironblood: { fx: [{ k: 'powerBlock', v: 3 }] },
  molotov: { fx: [{ k: 'status', st: 'burn', v: 4, target: 'allEnemies' }] },
  precise_shot: { fx: [{ k: 'dmg', v: 10 }] },
  quick_draw: {
    fx: [
      { k: 'dmg', v: 9 },
      { k: 'draw', v: 1 },
    ],
  },
  riposte: {
    fx: [
      { k: 'block', v: 6 },
      { k: 'status', st: 'thorns', v: 3, target: 'self' },
    ],
  },
  tactical_roll: {
    fx: [
      { k: 'block', v: 8 },
      { k: 'draw', v: 1 },
    ],
  },
  toxin: {
    fx: [
      { k: 'dmg', v: 7 },
      { k: 'status', st: 'poison', v: 4, target: 'enemy' },
    ],
  },
  frag: { fx: [{ k: 'dmgAll', v: 14 }] },

  /* 稀有 */
  tourniquet: { fx: [{ k: 'heal', v: 8 }] },
  ammo_recover: { fx: [{ k: 'recover', v: 3 }] },
  ap_round: {
    fx: [
      { k: 'dmg', v: 14 },
      { k: 'status', st: 'vuln', v: 2, target: 'enemy' },
    ],
  },
  body_armor: { fx: [{ k: 'block', v: 20 }] },
  combo_kick: { fx: [{ k: 'dmg', v: 6, times: 3 }] },
  emp: {
    fx: [
      { k: 'status', st: 'weak', v: 3, target: 'allEnemies' },
      { k: 'status', st: 'vuln', v: 3, target: 'allEnemies' },
    ],
  },
  power_training: { fx: [{ k: 'status', st: 'str', v: 3, target: 'self' }] },
  stim: { fx: [{ k: 'status', st: 'str', v: 4, target: 'self' }] },
  tactical_pack: { fx: [{ k: 'draw', v: 4 }] },
  adrenaline: { cost: 1 },
  field_hospital: { fx: [{ k: 'powerHeal', v: 4 }] },
  shotgun: { fx: [{ k: 'dmg', v: 5, times: 5 }] },
  sledge: {
    fx: [
      { k: 'dmg', v: 16 },
      { k: 'status', st: 'vuln', v: 3, target: 'enemy' },
    ],
  },
  snipe: { fx: [{ k: 'dmg', v: 28 }] },

  /* 史诗 */
  ghost_protocol: {
    fx: [
      { k: 'block', v: 16 },
      { k: 'draw', v: 2 },
    ],
  },
  time_rift: {
    cost: 0,
    fx: [
      { k: 'energy', v: 2 },
      { k: 'draw', v: 1 },
    ],
  },
  berserk: { cost: 1 },
  full_salvo: { fx: [{ k: 'dmg', v: 7, times: 5 }] },
  golden_deagle: {
    fx: [
      { k: 'dmg', v: 22 },
      { k: 'draw', v: 2 },
    ],
  },
  iron_wall: {
    fx: [
      { k: 'block', v: 22 },
      { k: 'status', st: 'dex', v: 4, target: 'self' },
    ],
  },
  nano_heal: { fx: [{ k: 'heal', v: 22 }] },
  reaper: {
    fx: [
      { k: 'dmgAll', v: 16 },
      { k: 'status', st: 'weak', v: 3, target: 'allEnemies' },
    ],
  },
  airstrike: { fx: [{ k: 'dmgAll', v: 40 }] },
  /* 废料不可升级（没有条目） */
};

/* 生成升级卡：id + '＋'。可重复调用（幂等）。 */
function buildUpgrades() {
  const ids = Object.keys(CARDS);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const c = CARDS[id];
    if (!c || c.upgraded) continue;
    const spec = c.up || CARD_UPGRADES[id];
    if (!spec) continue;
    const nid = id + '＋';
    if (CARDS[nid]) continue;
    CARDS[nid] = Object.assign({}, c, spec, {
      id: nid,
      name: c.name + '＋',
      upgraded: true,
      base: id,
      up: null,
    });
  }
}

/* 升级后的 id（不可升级返回 null） */
function upgradedId(id) {
  const c = CARDS[id];
  if (!c || c.upgraded) return null;
  return c.up || CARD_UPGRADES[id] ? id + '＋' : null;
}
function canUpgradeCard(id) {
  return !!upgradedId(id);
}
function isUpgraded(id) {
  return !!(CARDS[id] && CARDS[id].upgraded);
}

/* ===================== 基础牌（初始卡组，不消耗，用于循环） ===================== */
defCard({
  id: 'strike',
  name: '攻击',
  emoji: '💬',
  characterId: 'reply_echo',
  tags: ['基础', '攻击'],
  quote: '向前挥出一击。',
  type: 'attack',
  rarity: 'basic',
  cost: 1,
  exhaust: false,
  starter: true,
  fx: [{ k: 'dmg', v: 6 }],
});
defCard({
  id: 'defend',
  name: '防御',
  emoji: '🪵',
  characterId: 'firewall_guard',
  tags: ['护甲', '防御'],
  quote: '举盾护住要害。',
  type: 'skill',
  rarity: 'basic',
  cost: 1,
  exhaust: false,
  starter: true,
  fx: [{ k: 'block', v: 5 }],
});
defCard({
  id: 'crowbar',
  name: '重击',
  emoji: '🕊️',
  characterId: 'patch_runner',
  tags: ['攻击', '消耗'],
  quote: '以全力挥下重击。',
  type: 'attack',
  rarity: 'basic',
  cost: 1,
  exhaust: true,
  starter: true,
  fx: [{ k: 'dmg', v: 8 }],
});
defCard({
  id: 'bandage',
  name: '治疗',
  emoji: '😱',
  characterId: 'patch_runner',
  tags: ['治疗', '消耗'],
  quote: '药草和绷带总算派上用场。',
  type: 'skill',
  rarity: 'basic',
  cost: 0,
  exhaust: true,
  starter: true,
  fx: [{ k: 'heal', v: 4 }],
});

/* 少量梗角色主题样例牌；角色内容可扩展，规则仍由 fx 驱动。 */
defCard({
  id: 'viral_reply',
  name: '攻击抽牌',
  emoji: '📣',
  characterId: 'reply_echo',
  tags: ['攻击', '抽牌'],
  quote: '回声在石壁间接连响起。',
  type: 'attack',
  rarity: 'common',
  cost: 1,
  exhaust: false,
  fx: [
    { k: 'dmg', v: 7 },
    { k: 'draw', v: 1 },
  ],
});
defCard({
  id: 'firewall_breach',
  name: '破甲攻击',
  emoji: '🕊️',
  characterId: 'firewall_guard',
  tags: ['破甲', '攻击'],
  quote: '找准甲胄的缝隙。',
  type: 'attack',
  rarity: 'rare',
  cost: 2,
  exhaust: false,
  fx: [
    { k: 'dmg', v: 12 },
    { k: 'status', st: 'vuln', v: 1, target: 'enemy' },
  ],
});
defCard({
  id: 'cache_shield',
  name: '强化防御',
  emoji: '🪵',
  characterId: 'firewall_guard',
  tags: ['护甲', '防御'],
  quote: '盾面挡下迎面一击。',
  type: 'skill',
  rarity: 'common',
  cost: 1,
  exhaust: false,
  fx: [{ k: 'block', v: 8 }],
});
defCard({
  id: 'algorithm_boost',
  name: '防御强化',
  emoji: '✨',
  characterId: 'reply_echo',
  tags: ['能力', '防御'],
  quote: '魔力沿着护腕缓缓流转。',
  type: 'power',
  rarity: 'rare',
  cost: 2,
  exhaust: false,
  fx: [{ k: 'powerBlock', v: 2 }],
});

/* 华强买瓜双人精英的签名卡：所有效果由 fx 驱动，卡面沿用角色原图。 */
defCard({
  id: 'unripe_melon',
  name: '生瓜蛋子',
  emoji: '🍉',
  characterId: 'melon_vendor_elite',
  art: 'melon-vendor',
  tags: ['攻击', '首击强化'],
  quote: '这瓜一看就不对劲。',
  type: 'attack',
  rarity: 'common',
  cost: 1,
  exhaust: false,
  fx: [{ k: 'dmg', v: 6, bonusFirstHit: 3 }],
});
defCard({
  id: 'two_yuan_melon',
  name: '瓜两块钱一斤',
  emoji: '🪙',
  characterId: 'melon_vendor_elite',
  art: 'melon-vendor',
  tags: ['能力', '金币'],
  quote: '买卖归买卖，账可得算清楚。',
  type: 'power',
  rarity: 'epic',
  cost: 2,
  exhaust: true,
  fx: [{ k: 'goldPerHit', v: 2 }],
});
defCard({
  id: 'electric_scooter',
  name: '电驴',
  emoji: '🛡️',
  characterId: 'liu_huaqiang_elite',
  art: 'liu-huaqiang',
  tags: ['能力', '防御'],
  quote: '先把护具安排明白。',
  type: 'power',
  rarity: 'common',
  cost: 1,
  exhaust: true,
  fx: [{ k: 'status', st: 'dex', v: 1, target: 'self' }],
});
defCard({
  id: 'unripe_check',
  name: '这瓜保熟吗',
  emoji: '🔪',
  characterId: 'liu_huaqiang_elite',
  art: 'liu-huaqiang',
  tags: ['攻击', '虚弱'],
  quote: '华强盯着瓜看了两眼。',
  type: 'attack',
  rarity: 'rare',
  cost: 2,
  exhaust: true,
  fx: [
    { k: 'dmg', v: 10, bonusIfVulnerable: 6 },
    { k: 'status', st: 'weak', v: 2, target: 'enemy', ifTargetVulnerable: true },
  ],
});
defCard({
  id: 'pick_melon',
  name: '挑瓜',
  emoji: '🤔',
  characterId: 'melon_vendor_elite',
  art: 'melon-vendor',
  tags: ['技能', '抽牌'],
  quote: '先挑好的，再省下一笔。',
  type: 'skill',
  rarity: 'rare',
  cost: 1,
  exhaust: false,
  fx: [
    { k: 'draw', v: 2 },
    { k: 'nextAttackDiscount', v: 1 },
  ],
});
defCard({
  id: 'huaqiang_split',
  name: '华强劈瓜',
  emoji: '💥',
  characterId: 'liu_huaqiang_elite',
  art: 'liu-huaqiang',
  tags: ['攻击', '易伤'],
  quote: '这一刀下去，结果立见分晓。',
  type: 'attack',
  rarity: 'epic',
  cost: 2,
  exhaust: true,
  fx: [
    {
      k: 'dmg',
      v: 16,
      onKill: [
        { k: 'block', v: 8 },
        { k: 'draw', v: 1 },
      ],
      onSurvive: [{ k: 'status', st: 'vuln', v: 3, target: 'enemy' }],
    },
  ],
});
defCard({
  id: 'fruit_shop',
  name: '我开水果店的',
  emoji: '🍎',
  characterId: 'melon_vendor_elite',
  art: 'melon-vendor',
  tags: ['能力', '易伤'],
  quote: '该出手时也不能含糊。',
  type: 'power',
  rarity: 'epic',
  cost: 1,
  exhaust: true,
  fx: [{ k: 'vulnerableDamage', v: 3 }],
});
defCard({
  id: 'mao_die_swat',
  name: '偷家',
  emoji: '🐾',
  characterId: 'mao_die',
  art: 'mao-die',
  tags: ['攻击', '格挡'],
  quote: '旧版卡牌已按设计表调整。',
  type: 'skill',
  rarity: 'common',
  cost: 0,
  exhaust: false,
  legacy: true,
  fx: [{ k: 'dmg', v: 6, blockEqualDamage: true }],
});
defCard({
  id: 'mao_die_stare',
  name: '哈气',
  emoji: '👁️',
  characterId: 'mao_die',
  art: 'mao-die',
  tags: ['虚弱', '哈气'],
  quote: '旧版卡牌已按设计表调整。',
  type: 'skill',
  rarity: 'rare',
  cost: 1,
  exhaust: false,
  legacy: true,
  fx: [
    { k: 'status', st: 'weak', v: 1, target: 'enemy' },
    { k: 'huff', v: 1 },
  ],
});
defCard({
  id: 'mao_die_roll',
  name: '合并同类项攻击',
  emoji: '🐈',
  characterId: 'mao_die',
  art: 'mao-die',
  tags: ['攻击', '恢复'],
  quote: '旧版卡牌已按设计表调整。',
  type: 'attack',
  rarity: 'epic',
  cost: 2,
  exhaust: true,
  legacy: true,
  fx: [{ k: 'dmg', v: 10, onKillHealMaxFraction: 0.5 }],
});

/* 下方角色卡按《华强买瓜卡牌表（含耄耋系列） (2).xlsx》逐行配置。 */
defCard({
  id: 'mao_hiss',
  name: '哈气',
  emoji: '😾',
  characterId: 'mao_die',
  art: 'mao-die',
  tags: ['虚弱', '哈气'],
  type: 'skill',
  rarity: 'rare',
  cost: 1,
  exhaust: false,
  fx: [
    { k: 'status', st: 'weak', v: 1, target: 'enemy' },
    { k: 'huff', v: 1 },
  ],
});
defCard({
  id: 'mao_home_raid',
  name: '偷家',
  emoji: '🐾',
  characterId: 'mao_die',
  art: 'mao-die',
  tags: ['攻击', '格挡'],
  type: 'skill',
  rarity: 'common',
  cost: 0,
  exhaust: false,
  fx: [{ k: 'dmg', v: 6, blockEqualDamage: true }],
});
defCard({
  id: 'mao_spine_dragon',
  name: '脊背龙形态',
  emoji: '🐉',
  characterId: 'mao_die',
  art: 'mao-die',
  tags: ['能力', '攻击'],
  type: 'power',
  rarity: 'rare',
  cost: 1,
  exhaust: true,
  fx: [{ k: 'powerAttackEcho', chance: 0.25 }],
});
defCard({
  id: 'mao_overlord',
  name: '王霸之气',
  emoji: '👑',
  characterId: 'mao_die',
  art: 'mao-die',
  tags: ['虚弱', '易伤'],
  type: 'skill',
  rarity: 'epic',
  cost: 0,
  exhaust: true,
  fx: [
    { k: 'status', st: 'weak', v: 10, target: 'enemy' },
    { k: 'status', st: 'vuln', v: 10, target: 'enemy' },
  ],
});
defCard({
  id: 'mao_combine',
  name: '合并同类项攻击',
  emoji: '🐈',
  characterId: 'mao_die',
  art: 'mao-die',
  tags: ['攻击', '恢复'],
  type: 'attack',
  rarity: 'epic',
  cost: 2,
  exhaust: true,
  fx: [{ k: 'dmg', v: 10, onKillHealMaxFraction: 0.5 }],
});

defCard({
  id: 'dog_bark',
  name: '叫',
  emoji: '🐕',
  characterId: 'big_dog',
  art: 'big-dog',
  tags: ['防御', '虚弱'],
  type: 'skill',
  rarity: 'common',
  cost: 1,
  exhaust: false,
  fx: [
    { k: 'block', v: 5 },
    { k: 'status', st: 'weak', v: 1, target: 'enemy' },
  ],
});
defCard({
  id: 'dog_snarl',
  name: '龇牙',
  emoji: '🦷',
  characterId: 'big_dog',
  art: 'big-dog',
  tags: ['易伤'],
  type: 'skill',
  rarity: 'common',
  cost: 0,
  exhaust: false,
  fx: [{ k: 'status', st: 'vuln', v: 1, target: 'enemy' }],
});
defCard({
  id: 'dog_pounce',
  name: '扑咬',
  emoji: '🐾',
  characterId: 'big_dog',
  art: 'big-dog',
  tags: ['攻击'],
  type: 'attack',
  rarity: 'common',
  cost: 1,
  exhaust: false,
  fx: [{ k: 'dmg', v: 6 }],
});
defCard({
  id: 'dog_growl',
  name: '低吼',
  emoji: '🐶',
  characterId: 'big_dog',
  art: 'big-dog',
  tags: ['抽牌'],
  type: 'skill',
  rarity: 'common',
  cost: 1,
  exhaust: false,
  fx: [{ k: 'draw', v: 1 }],
});
defCard({
  id: 'dog_bark_bark',
  name: '叫叫叫',
  emoji: '📣',
  characterId: 'big_dog',
  art: 'big-dog',
  tags: ['防御', '攻击强化'],
  type: 'skill',
  rarity: 'rare',
  cost: 1,
  exhaust: false,
  fx: [
    { k: 'block', v: 8 },
    { k: 'nextTurnAttackBonus', v: 4 },
  ],
});
defCard({
  id: 'dog_set_on',
  name: '放狗咬人',
  emoji: '💥',
  characterId: 'big_dog',
  art: 'big-dog',
  tags: ['攻击', '虚弱'],
  type: 'attack',
  rarity: 'rare',
  cost: 2,
  exhaust: false,
  fx: [{ k: 'dmg', v: 10, bonusIfWeak: 6 }],
});

defCard({
  id: 'gugu',
  name: '咕咕',
  emoji: '🐧',
  characterId: 'gugugaga',
  art: 'gugugaga-scent',
  tags: ['召唤'],
  type: 'skill',
  rarity: 'common',
  cost: 0,
  exhaust: false,
  fx: [{ k: 'summon', id: 'penguin', n: 1, attack: 1, hp: 1 }],
});
defCard({
  id: 'gaga',
  name: '嘎嘎',
  emoji: '🐧',
  characterId: 'gugugaga',
  art: 'gugugaga-scent',
  tags: ['召唤强化', '防御'],
  type: 'skill',
  rarity: 'common',
  cost: 1,
  exhaust: true,
  fx: [
    { k: 'summonAttackAll', v: 2 },
    { k: 'block', v: 5 },
  ],
});
defCard({
  id: 'gather_penguin',
  name: '凑企鹅',
  emoji: '🐧',
  characterId: 'gugugaga',
  art: 'gugugaga-gather',
  tags: ['攻击', '同化'],
  type: 'attack',
  rarity: 'common',
  cost: 1,
  exhaust: false,
  fx: [
    { k: 'status', st: 'assimilation', v: 1, target: 'enemy' },
    { k: 'dmg', v: 3 },
    { k: 'summonAttack' },
  ],
});
defCard({
  id: 'gugugaga',
  name: '咕咕嘎嘎',
  emoji: '🐧',
  characterId: 'gugugaga',
  art: 'gugugaga-scent',
  tags: ['召唤'],
  type: 'skill',
  rarity: 'rare',
  cost: 1,
  exhaust: true,
  fx: [{ k: 'summon', id: 'penguin', n: 2, attack: 2, hp: 2 }],
});
defCard({
  id: 'meme_contamination',
  name: '模因污染',
  emoji: '🌀',
  characterId: 'gugugaga',
  art: 'gugugaga-scent',
  tags: ['同化'],
  type: 'skill',
  rarity: 'rare',
  cost: 1,
  exhaust: true,
  fx: [{ k: 'assimilationAura', v: 2 }],
});
defCard({
  id: 'penguin_swarm',
  name: '企鹅群',
  emoji: '🐧',
  characterId: 'gugugaga',
  art: 'gugugaga-scent',
  tags: ['能力', '召唤强化'],
  type: 'power',
  rarity: 'rare',
  cost: 2,
  exhaust: true,
  fx: [{ k: 'powerPenguinGroup', v: 1 }],
});

const NORMAL_CARD_POOL = [
  'dog_bark',
  'dog_snarl',
  'dog_pounce',
  'dog_growl',
  'dog_bark_bark',
  'dog_set_on',
  'gugu',
  'gaga',
  'gather_penguin',
  'gugugaga',
  'meme_contamination',
  'penguin_swarm',
];

const ELITE_CARD_POOL = [
  'unripe_melon',
  'two_yuan_melon',
  'electric_scooter',
  'unripe_check',
  'pick_melon',
  'huaqiang_split',
  'fruit_shop',
  'mao_hiss',
  'mao_home_raid',
  'mao_spine_dragon',
  'mao_overlord',
  'mao_combine',
];

/* 生成所有升级卡（须在全部 defCard 之后调用；cards_pool.js 会再调一次以覆盖扩展卡池） */
buildUpgrades();

/* ===================== 工具 ===================== */

/* 出发用初始卡组 */
function starterDeck() {
  return [
    'strike',
    'strike',
    'strike',
    'strike',
    'defend',
    'defend',
    'defend',
    'defend',
    'crowbar',
    'bandage',
  ];
}

/* 战斗掉落 / 商店可出现的卡池（废料与升级卡除外） */
function lootPool() {
  return Object.keys(CARDS).filter(
    (id) =>
      !CARDS[id].junk &&
      !CARDS[id].upgraded &&
      !CARDS[id].legacy &&
      !ELITE_CARD_POOL.includes(id) &&
      !NORMAL_CARD_POOL.includes(id),
  );
}

/* 抽取指定稀有度的卡池；该稀有度没有卡时回退到整个卡池 */
function cardPoolByRarity(rarity) {
  const pool = lootPool().filter((id) => CARDS[id].rarity === rarity);
  return pool.length ? pool : lootPool();
}

/* 卡牌售价（卖回商店）；升级卡更值钱 */
function cardSellPrice(card) {
  const base = RARITY[card.rarity].price || 8;
  const mul = card.upgraded ? 1.6 : 1;
  return Math.max(4, Math.round(base * 0.4 * mul));
}
function cardPrice(card, discount) {
  const base = RARITY[card.rarity].price || 8;
  return Math.max(1, Math.round(base * (1 - (discount || 0))));
}

/* 按稀有度权重随机抽卡（danger 越高越容易出高稀有度） */
function rollCardId(danger, lootMul) {
  const d = (danger || 0) * 0.5 * (lootMul || 1);
  const items = [
    { id: 'common', w: Math.max(4, RARITY.common.weight - d * 4) },
    { id: 'rare', w: RARITY.rare.weight + d * 2 },
    { id: 'epic', w: RARITY.epic.weight + d * 2 },
  ];
  const rar = RNG.weighted(items).id;
  return RNG.pick(cardPoolByRarity(rar));
}

function fxSummary(fx) {
  return fx
    .map((f) => {
      if (f.k === 'block') return `获得 ${f.v} 点护甲`;
      if (f.k === 'draw') return `抽 ${f.v} 张牌`;
      if (f.k === 'status') return `使目标获得 ${f.v} 层${STATUS[f.st].name}`;
      return '';
    })
    .filter(Boolean)
    .join('并');
}

/* 文案：从 fx 自动生成 */
function cardText(card) {
  const parts = [];
  for (let i = 0; i < card.fx.length; i++) {
    const f = card.fx[i];
    switch (f.k) {
      case 'dmg': {
        let text = f.times > 1 ? `造成 ${f.v} 点伤害，${f.times} 次` : `造成 ${f.v} 点伤害`;
        if (f.bonusFirstHit) text += `；若本回合未攻击该目标，额外造成 ${f.bonusFirstHit} 点伤害`;
        if (f.bonusIfVulnerable) text += `；目标有易伤时额外造成 ${f.bonusIfVulnerable} 点伤害`;
        if (f.bonusIfWeak) text += `；目标有虚弱时额外造成 ${f.bonusIfWeak} 点伤害`;
        if (f.blockEqualDamage) text += '；获得等同于实际生命伤害的护甲';
        if (f.onKillHealMaxFraction)
          text += `；击杀后回复目标最大生命的 ${Math.round(f.onKillHealMaxFraction * 100)}%`;
        if (f.onKill && f.onKill.length) text += `；击杀后${fxSummary(f.onKill)}`;
        if (f.onSurvive && f.onSurvive.length) text += `；未击杀时${fxSummary(f.onSurvive)}`;
        parts.push(text);
        break;
      }
      case 'dmgAll':
        parts.push(
          f.times > 1
            ? `对所有敌人造成 ${f.v} 点伤害，${f.times} 次`
            : `对所有敌人造成 ${f.v} 点伤害`,
        );
        break;
      case 'block':
        parts.push(`获得 ${f.v} 点护甲`);
        break;
      case 'draw':
        parts.push(`抽 ${f.v} 张牌`);
        break;
      case 'energy':
        parts.push(`获得 ${f.v} 点能量`);
        break;
      case 'heal':
        parts.push(`回复 ${f.v} 点生命`);
        break;
      case 'loseHp':
        parts.push(`失去 ${f.v} 点生命`);
        break;
      case 'gold':
        parts.push(`获得 ${f.v} 金币`);
        break;
      case 'recover':
        parts.push(`从弃牌堆回收 ${f.v} 张牌`);
        break;
      case 'addCard': {
        const n = f.n > 1 ? `${f.n} 张` : '1 张';
        const to = f.to === 'draw' ? '抽牌堆' : f.to === 'discard' ? '弃牌堆' : '手牌';
        parts.push(`将 ${n}「${CARDS[f.card].name}」加入${to}`);
        break;
      }
      case 'status': {
        const who =
          f.target === 'allEnemies' ? '所有敌人' : f.target === 'self' ? '自身' : '目标敌人';
        parts.push(
          (f.ifTargetVulnerable ? '目标有易伤时，' : '') +
            `使${who}获得 ${f.v} 层${STATUS[f.st].name}` +
            (f.st === 'assimilation' ? '（其死亡时召唤同化层数生命的小企鹅）' : ''),
        );
        break;
      }
      case 'summon':
        parts.push(
          `召唤 ${f.n} 只${SUMMONS[f.id].name}（${f.attack} 攻 / ${f.hp} 血，随本次行动同行）`,
        );
        break;
      case 'summonAttackAll':
        parts.push(`所有小企鹅攻击力 +${f.v}`);
        break;
      case 'summonAttack':
        parts.push('随机 1 只小企鹅对目标攻击 1 次');
        break;
      case 'assimilationAura':
        parts.push(`目标敌人每回合获得 ${f.v} 层同化`);
        break;
      case 'powerPenguinGroup':
        parts.push(`本场战斗每召唤 1 只小企鹅，所有小企鹅攻击力 +${f.v}`);
        break;
      case 'huff':
        parts.push(`获得 ${f.v} 点哈气；每累计 3 点，下次造成的伤害翻倍`);
        break;
      case 'powerAttackEcho':
        parts.push(`本场战斗攻击牌有 ${Math.round(f.chance * 100)}% 概率额外触发 1 次效果`);
        break;
      case 'nextTurnAttackBonus':
        parts.push(`下回合首次攻击牌伤害 +${f.v}`);
        break;
      case 'goldPerHit':
        parts.push(`本场战斗中每次有效攻击获得 ${f.v} 金币`);
        break;
      case 'nextAttackDiscount':
        parts.push(`本回合下一张攻击牌费用 -${f.v}`);
        break;
      case 'vulnerableDamage':
        parts.push(`本场战斗中攻击易伤敌人时额外造成 ${f.v} 点伤害`);
        break;
      case 'powerBlock':
        parts.push(`每回合开始获得 ${f.v} 点护甲`);
        break;
      case 'powerHeal':
        parts.push(`每回合结束回复 ${f.v} 点生命`);
        break;
      case 'powerEnergy':
        parts.push(`每回合 +${f.v} 点能量`);
        break;
      case 'powerStr':
        parts.push(`每回合获得 ${f.v} 点力量`);
        break;
      default:
        break;
    }
  }
  return parts.join('；') || '（无效果）';
}

/* 卡牌类型显示名 */
const CARD_TYPE_NAME = { attack: '攻击', skill: '技能', power: '能力' };
