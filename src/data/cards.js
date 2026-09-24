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
 */

const CARDS = {};
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
  return Object.keys(CARDS).filter((id) => !CARDS[id].junk && !CARDS[id].upgraded);
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

/* 文案：从 fx 自动生成 */
function cardText(card) {
  const parts = [];
  for (let i = 0; i < card.fx.length; i++) {
    const f = card.fx[i];
    switch (f.k) {
      case 'dmg':
        parts.push(f.times > 1 ? `造成 ${f.v} 点伤害，${f.times} 次` : `造成 ${f.v} 点伤害`);
        break;
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
        parts.push(`使${who}获得 ${f.v} 层${STATUS[f.st].name}`);
        break;
      }
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
