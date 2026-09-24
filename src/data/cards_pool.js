'use strict';

/* 扩展卡池（普通 / 稀有 / 史诗 / 废料）—— 当前版本暂未启用。
 * 启用方式：在 index.html 中 cards.js 之后加一行
 *   <script src="src/data/cards_pool.js"></script>
 * 它们会通过 cards.js 的 defCard() 注册进 CARDS，加入掉落、商店和奖励卡池。
 * 注意：依赖 cards.js 先加载。 */

/* global defCard, buildUpgrades */

/* ===================== 普通 ===================== */
defCard({
  id: 'knife_throw',
  name: '攻击',
  emoji: '🔪',
  type: 'attack',
  rarity: 'common',
  cost: 0,
  exhaust: true,
  fx: [{ k: 'dmg', v: 6 }],
});
defCard({
  id: 'burst_fire',
  name: '强力攻击',
  emoji: '🔫',
  type: 'attack',
  rarity: 'common',
  cost: 1,
  exhaust: true,
  fx: [{ k: 'dmg', v: 9 }],
});
defCard({
  id: 'quick_draw',
  name: '攻击抽牌',
  emoji: '⚡',
  type: 'attack',
  rarity: 'common',
  cost: 1,
  exhaust: true,
  fx: [
    { k: 'dmg', v: 6 },
    { k: 'draw', v: 1 },
  ],
});
defCard({
  id: 'cover',
  name: '防御',
  emoji: '🧱',
  type: 'skill',
  rarity: 'common',
  cost: 1,
  exhaust: true,
  fx: [{ k: 'block', v: 8 }],
});
defCard({
  id: 'tactical_roll',
  name: '防御抽牌',
  emoji: '🤸',
  type: 'skill',
  rarity: 'common',
  cost: 1,
  exhaust: true,
  fx: [
    { k: 'block', v: 5 },
    { k: 'draw', v: 1 },
  ],
});
defCard({
  id: 'first_aid',
  name: '治疗',
  emoji: '🧰',
  type: 'skill',
  rarity: 'common',
  cost: 1,
  exhaust: true,
  fx: [{ k: 'heal', v: 7 }],
});
defCard({
  id: 'frag',
  name: '全体攻击',
  emoji: '💣',
  type: 'attack',
  rarity: 'common',
  cost: 2,
  exhaust: true,
  fx: [{ k: 'dmgAll', v: 10 }],
});
defCard({
  id: 'molotov',
  name: '全体灼烧',
  emoji: '🔥',
  type: 'skill',
  rarity: 'common',
  cost: 1,
  exhaust: true,
  fx: [{ k: 'status', st: 'burn', v: 3, target: 'allEnemies' }],
});
defCard({
  id: 'toxin',
  name: '攻击中毒',
  emoji: '🧪',
  type: 'attack',
  rarity: 'common',
  cost: 1,
  exhaust: true,
  fx: [
    { k: 'dmg', v: 5 },
    { k: 'status', st: 'poison', v: 3, target: 'enemy' },
  ],
});
defCard({
  id: 'disarm',
  name: '敌方虚弱',
  emoji: '🥴',
  type: 'skill',
  rarity: 'common',
  cost: 1,
  exhaust: true,
  fx: [{ k: 'status', st: 'weak', v: 2, target: 'enemy' }],
});
defCard({
  id: 'mark',
  name: '敌方易伤',
  emoji: '🎯',
  type: 'skill',
  rarity: 'common',
  cost: 0,
  exhaust: true,
  fx: [{ k: 'status', st: 'vuln', v: 2, target: 'enemy' }],
});
defCard({
  id: 'precise_shot',
  name: '精准攻击',
  emoji: '🏹',
  type: 'attack',
  rarity: 'common',
  cost: 1,
  exhaust: false,
  fx: [{ k: 'dmg', v: 7 }],
});
defCard({
  id: 'riposte',
  name: '防御反击',
  emoji: '🌵',
  type: 'skill',
  rarity: 'common',
  cost: 1,
  exhaust: false,
  fx: [
    { k: 'block', v: 4 },
    { k: 'status', st: 'thorns', v: 2, target: 'self' },
  ],
});
defCard({
  id: 'ironblood',
  name: '护甲强化',
  emoji: '🩸',
  type: 'power',
  rarity: 'common',
  cost: 1,
  exhaust: false,
  fx: [{ k: 'powerBlock', v: 2 }],
});
defCard({
  id: 'scavenger',
  name: '抽牌',
  emoji: '👁️',
  type: 'skill',
  rarity: 'common',
  cost: 0,
  exhaust: true,
  fx: [{ k: 'draw', v: 2 }],
});

/* ===================== 稀有 ===================== */
defCard({
  id: 'snipe',
  name: '高伤攻击',
  emoji: '🎯',
  type: 'attack',
  rarity: 'rare',
  cost: 2,
  exhaust: true,
  fx: [{ k: 'dmg', v: 22 }],
});
defCard({
  id: 'shotgun',
  name: '多段攻击',
  emoji: '💥',
  type: 'attack',
  rarity: 'rare',
  cost: 2,
  exhaust: true,
  fx: [{ k: 'dmg', v: 4, times: 5 }],
});
defCard({
  id: 'ap_round',
  name: '破甲攻击',
  emoji: '🗡️',
  type: 'attack',
  rarity: 'rare',
  cost: 1,
  exhaust: true,
  fx: [
    { k: 'dmg', v: 10 },
    { k: 'status', st: 'vuln', v: 2, target: 'enemy' },
  ],
});
defCard({
  id: 'body_armor',
  name: '强力防御',
  emoji: '🦺',
  type: 'skill',
  rarity: 'rare',
  cost: 1,
  exhaust: true,
  fx: [{ k: 'block', v: 15 }],
});
defCard({
  id: 'stim',
  name: '力量强化',
  emoji: '💉',
  type: 'skill',
  rarity: 'rare',
  cost: 1,
  exhaust: true,
  fx: [{ k: 'status', st: 'str', v: 3, target: 'self' }],
});
defCard({
  id: 'tactical_pack',
  name: '多抽牌',
  emoji: '🎒',
  type: 'skill',
  rarity: 'rare',
  cost: 1,
  exhaust: true,
  fx: [{ k: 'draw', v: 3 }],
});
defCard({
  id: 'emp',
  name: '群体虚弱易伤',
  emoji: '🎯',
  type: 'skill',
  rarity: 'rare',
  cost: 1,
  exhaust: true,
  fx: [
    { k: 'status', st: 'weak', v: 2, target: 'allEnemies' },
    { k: 'status', st: 'vuln', v: 2, target: 'allEnemies' },
  ],
});
defCard({
  id: 'combo_kick',
  name: '连击攻击',
  emoji: '🦵',
  type: 'attack',
  rarity: 'rare',
  cost: 1,
  exhaust: true,
  fx: [{ k: 'dmg', v: 5, times: 2 }],
});
defCard({
  id: 'tourniquet',
  name: '治疗',
  emoji: '🩸',
  type: 'skill',
  rarity: 'rare',
  cost: 0,
  exhaust: true,
  fx: [{ k: 'heal', v: 5 }],
});
defCard({
  id: 'sledge',
  name: '破甲重击',
  emoji: '🔨',
  type: 'attack',
  rarity: 'rare',
  cost: 2,
  exhaust: true,
  fx: [
    { k: 'dmg', v: 12 },
    { k: 'status', st: 'vuln', v: 2, target: 'enemy' },
  ],
});
defCard({
  id: 'power_training',
  name: '力量提升',
  emoji: '💪',
  type: 'power',
  rarity: 'rare',
  cost: 1,
  exhaust: false,
  fx: [{ k: 'status', st: 'str', v: 2, target: 'self' }],
});
defCard({
  id: 'field_hospital',
  name: '持续治疗',
  emoji: '⛑️',
  type: 'power',
  rarity: 'rare',
  cost: 2,
  exhaust: false,
  fx: [{ k: 'powerHeal', v: 3 }],
});
defCard({
  id: 'ammo_recover',
  name: '回收卡牌',
  emoji: '♻️',
  type: 'skill',
  rarity: 'rare',
  cost: 1,
  exhaust: false,
  fx: [{ k: 'recover', v: 2 }],
});
defCard({
  id: 'adrenaline',
  name: '能量强化',
  emoji: '❤️‍🔥',
  type: 'power',
  rarity: 'rare',
  cost: 2,
  exhaust: false,
  fx: [{ k: 'powerEnergy', v: 1 }],
});

/* ===================== 史诗 ===================== */
defCard({
  id: 'airstrike',
  name: '全体重击',
  emoji: '🛩️',
  type: 'attack',
  rarity: 'epic',
  cost: 3,
  exhaust: true,
  fx: [{ k: 'dmgAll', v: 30 }],
});
defCard({
  id: 'golden_deagle',
  name: '重击抽牌',
  emoji: '🌟',
  type: 'attack',
  rarity: 'epic',
  cost: 2,
  exhaust: true,
  fx: [
    { k: 'dmg', v: 18 },
    { k: 'draw', v: 2 },
  ],
});
defCard({
  id: 'nano_heal',
  name: '强力治疗',
  emoji: '🧬',
  type: 'skill',
  rarity: 'epic',
  cost: 2,
  exhaust: true,
  fx: [{ k: 'heal', v: 16 }],
});
defCard({
  id: 'iron_wall',
  name: '防御敏捷强化',
  emoji: '🧿',
  type: 'skill',
  rarity: 'epic',
  cost: 2,
  exhaust: true,
  fx: [
    { k: 'block', v: 18 },
    { k: 'status', st: 'dex', v: 3, target: 'self' },
  ],
});
defCard({
  id: 'berserk',
  name: '持续攻击强化',
  emoji: '😤',
  type: 'power',
  rarity: 'epic',
  cost: 2,
  exhaust: false,
  fx: [{ k: 'powerStr', v: 1 }],
});
defCard({
  id: 'time_rift',
  name: '能量抽牌',
  emoji: '⏳',
  type: 'skill',
  rarity: 'epic',
  cost: 1,
  exhaust: true,
  fx: [
    { k: 'energy', v: 2 },
    { k: 'draw', v: 1 },
  ],
});
defCard({
  id: 'full_salvo',
  name: '多段重击',
  emoji: '🚀',
  type: 'attack',
  rarity: 'epic',
  cost: 2,
  exhaust: true,
  fx: [{ k: 'dmg', v: 6, times: 4 }],
});
defCard({
  id: 'ghost_protocol',
  name: '防御抽牌',
  emoji: '👻',
  type: 'skill',
  rarity: 'epic',
  cost: 1,
  exhaust: true,
  fx: [
    { k: 'block', v: 12 },
    { k: 'draw', v: 2 },
  ],
});
defCard({
  id: 'reaper',
  name: '全体虚弱',
  emoji: '💀',
  type: 'attack',
  rarity: 'epic',
  cost: 2,
  exhaust: true,
  fx: [
    { k: 'dmgAll', v: 12 },
    { k: 'status', st: 'weak', v: 2, target: 'allEnemies' },
  ],
});

/* ===================== 废料（只能从事件 / 敌人特殊掉落获得） ===================== */
defCard({
  id: 'scrap',
  name: '废料',
  emoji: '⚙️',
  type: 'skill',
  rarity: 'junk',
  cost: 1,
  exhaust: true,
  junk: true,
  fx: [],
});
defCard({
  id: 'polluted',
  name: '失血',
  emoji: '☣️',
  type: 'skill',
  rarity: 'junk',
  cost: 0,
  exhaust: true,
  junk: true,
  fx: [{ k: 'loseHp', v: 3 }],
});
defCard({
  id: 'heavy_bag',
  name: '沉重负担',
  emoji: '🧳',
  type: 'skill',
  rarity: 'junk',
  cost: 2,
  exhaust: false,
  junk: true,
  fx: [],
});

/* 扩展卡池也可能有升级版（CARD_UPGRADES 在 cards.js 里集中定义） */
buildUpgrades();
