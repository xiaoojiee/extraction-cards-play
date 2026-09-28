'use strict';

/* 常量配置（纯常量，无外部依赖）。数值平衡集中在此与 src/data/*.js */

/* ===================== 逻辑分辨率 ===================== */
const VIEW_W = 1280;
const VIEW_H = 720;

/* ===================== 战斗规则 ===================== */
const BASE_ENERGY = 3; // 每回合基础能量
const BASE_DRAW = 5; // 每回合基础抽牌
const HAND_LIMIT = 10; // 手牌上限
const BLOCK_RESET = true; // 回合开始是否清空护甲
const WEAK_MUL = 0.75; // 虚弱：造成攻击伤害 ×
const VULN_MUL = 1.5; // 易伤：受到攻击伤害 ×
const POISON_DECAY = 1; // 中毒每回合衰减量
const BURN_DECAY = 1; // 灼烧每回合衰减量
const REGEN_DECAY = 1; // 再生每回合衰减量

/* ===================== 玩家 ===================== */
const START_HP = 70;
const START_GOLD = 60;
const RUN_START_GOLD = 25; // 出发时从仓库带入的行动资金上限
const HAZARD_DAMAGE = 7;
const BOSS_DEPTH = 8;
const SCENE_RULES = {
  ruinGoldChance: 0.35,
  ruinGoldMin: 5,
  ruinGoldMax: 18,
  lootExtraCardChance: 0.35,
  lootGoldMin: 10,
  lootGoldMax: 25,
  buffChoices: 3,
  hazardDangerDamage: 0.6,
  eliteCompanionChance: 0.4,
  bossChance: 0.12,
  rewardEliteDanger: 3,
  rewardBossDanger: 6,
  rewardLootBonusScale: 0.5,
  rewardRerolls: 8,
  shopDangerBonus: 2,
  shopFundsPerDanger: 7,
  minMaxHp: 12,
};
const POTION_SLOTS = 3; // 消耗品腰带
const SECURE_SLOTS = 2; // 保险箱（阵亡也能带出的战利品格数）

/* ===================== 卡组 / 背包 ===================== */
const DECK_MAX = 14; // 出发携带卡组上限
const DECK_MIN = 6; // 出发携带卡组下限
const BACKPACK_MAX = 12; // 一次行动最多带回的卡牌数
const BATTLE_REWARD_CARDS = 3; // 战斗胜利提供的选牌数
const BATTLE_POTION_CHANCE = 0.25; // 战斗胜利掉消耗品概率
const ELITE_POTION_CHANCE = 0.55;
const BOSS_POTION_CHANCE = 0.85;

/* ===================== 地图 ===================== */
/* 进入格子只开启地点场景，不在移动时直接结算。 */
const TILE = {
  start: { emoji: '🏕️', name: '营地', fog: false },
  extract: { emoji: '🌀', name: '撤离法阵', fog: false },
  empty: { emoji: '🪨', name: '古代遗迹', fog: true },
  combat: { emoji: '💀', name: '敌人', fog: true },
  elite: { emoji: '☠️', name: '精英敌人', fog: true },
  loot: { emoji: '🎁', name: '宝箱', fog: true },
  potion: { emoji: '⚗️', name: '药剂箱', fog: true },
  buff: { emoji: '🗿', name: '符文石', fog: true },
  shop: { emoji: '🧙', name: '旅商营帐', fog: true },
  fire: { emoji: '🔥', name: '营地', fog: true },
  event: { emoji: '❔', name: '随机事件', fog: true },
  hazard: { emoji: '⚠️', name: '危险区域', fog: true },
};

/* 场景中显示的操作标题与地点说明 */
const TILE_ACTION = {
  empty: { label: '翻找遗迹', hint: '石块间散落着旧物，仔细翻找或离开。' },
  combat: { label: '交战', hint: '进入战斗，击败守卫后再处理奖励。' },
  elite: { label: '挑战精英', hint: '进入精英战斗，击败守卫后再处理奖励。' },
  loot: { label: '收集物资', hint: '检查宝箱内容，选择收集或离开。' },
  potion: { label: '拿取药剂', hint: '确认拿取后加入携带物品。' },
  buff: { label: '选择增益', hint: '选择一项增益，或放弃。' },
  shop: { label: '查看货架', hint: '购买、出售或升级卡牌；离开后返回地图。' },
  fire: { label: '使用营地', hint: '选择休息或升级；离开后返回地图。' },
  event: { label: '查看事件', hint: '阅读事件并选择行动，也可以离开。' },
  hazard: { label: '处理危险', hint: '查看危险并决定是否穿过。' },
  extract: { label: '撤离', hint: '选择撤离或继续探索。' },
};

/* 无限世界的地点权重；start 由世界起点固定放置，撤离点稀疏生成 */
const TILE_WEIGHTS = {
  empty: 16,
  combat: 30,
  elite: 5,
  loot: 12,
  potion: 6,
  buff: 7,
  shop: 6,
  fire: 7,
  event: 7,
  hazard: 4,
  extract: 1,
};

/* ===================== 难度（每移动一格 +1 危险度） ===================== */
const DANGER_HP = 0.1; // 敌人血量成长 /危险度
const DANGER_DMG = 0.07; // 敌人伤害成长 /危险度
const DANGER_LOOT = 0.05; // 战利品稀有度成长 /危险度
const DANGER_GOLD = 0.12; // 金币掉落成长 /危险度

/* ===================== 稀有度 ===================== */
const RARITY = {
  basic: { name: '基础', color: '#8b93a1', price: 25, weight: 0 },
  common: { name: '普通', color: '#6ea8fe', price: 45, weight: 62 },
  rare: { name: '稀有', color: '#5fd08a', price: 85, weight: 28 },
  epic: { name: '史诗', color: '#c08cff', price: 150, weight: 10 },
  junk: { name: '废料', color: '#9a7b58', price: 8, weight: 0 },
};
/* 掉落/商店可出现的稀有度（basic / junk 特殊来源） */
const LOOT_RARITIES = ['common', 'rare', 'epic'];

/* ===================== 区域 ===================== */
const ZONES = {
  suburb: {
    key: 'suburb',
    name: '迷雾荒野',
    emoji: '🌲',
    unlock: 'free',
    desc: '危险较低，适合初次出发',
    cols: 6,
    rows: 4,
    dangerMul: 1,
    eliteMul: 0.8,
    lootMul: 0.9,
    goldMul: 0.9,
    extractCount: 2,
  },
  city: {
    key: 'city',
    name: '古堡遗迹',
    emoji: '🏰',
    unlock: 'free',
    desc: '敌人更强，物资也更丰富',
    cols: 7,
    rows: 4,
    dangerMul: 1.35,
    eliteMul: 1.15,
    lootMul: 1.25,
    goldMul: 1.2,
    extractCount: 2,
  },
  military: {
    key: 'military',
    name: '矮人矿坑',
    emoji: '⛏️',
    unlock: 'free',
    desc: '精英敌人更多，战利品更好',
    cols: 7,
    rows: 5,
    dangerMul: 1.8,
    eliteMul: 1.5,
    lootMul: 1.6,
    goldMul: 1.5,
    extractCount: 1,
  },
  lab: {
    key: 'lab',
    name: '龙骨地窟',
    emoji: '🐉',
    unlock: 'free',
    desc: '危险极高，带上最好的卡组再来',
    cols: 8,
    rows: 5,
    dangerMul: 2.4,
    eliteMul: 1.9,
    lootMul: 2.1,
    goldMul: 1.9,
    extractCount: 1,
  },
};

/* ===================== 商店 ===================== */
const SHOP_CARD_SLOTS = 5;
const SHOP_POTION_SLOTS = 2;
const SELL_RATE = 0.4; // 卖卡返还比例
const SHOP_BUFF_CHANCE = 0.35; // 商店额外刷新 buff 的概率
const SHOP_UPGRADE_COST = 75; // 商店铁匠服务：升级一张牌
const SMITH_COST = 90; // 安全区铁匠铺：升级一张牌
/* 商人手上的现金区间：决定他能收你多少货；你买他的东西会让他更有钱 */
const SHOP_FUNDS_MIN = 70;
const SHOP_FUNDS_MAX = 150;
const SAFE_SHOP_FUNDS_MIN = 150;
const SAFE_SHOP_FUNDS_MAX = 320;
const SAFE_SHOP_CARDS = 5;
const SAFE_SHOP_POTIONS = 3;
const REFRESH_COST = 20;
const SECURE_COST = 180;
const SECURE_UPGRADE_MAX = 3;
const DECK_SLOT_COST = 150;
const DECK_UPGRADE_MAX = 6;

/* ===================== 营地 ===================== */
const FIRE_HEAL_RATE = 0.35; // 营地休息回复的最大生命比例

/* ===================== 状态效果 ===================== */
const STATUS = {
  str: { name: '力量', emoji: '💪', desc: '每段攻击伤害 +N', bad: false },
  dex: { name: '敏捷', emoji: '🎯', desc: '每层使获得的护甲提高 25%', bad: false },
  vuln: { name: '易伤', emoji: '🎯', desc: '受到的攻击伤害 +50%，回合结束 -1', bad: true },
  weak: { name: '虚弱', emoji: '🥴', desc: '造成的攻击伤害 -25%，回合结束 -1', bad: true },
  poison: { name: '中毒', emoji: '🧪', desc: '回合开始损失 N 生命，然后 N-1', bad: true },
  burn: { name: '灼烧', emoji: '🔥', desc: '回合结束损失 N 生命，然后 N-1', bad: true },
  regen: { name: '再生', emoji: '💚', desc: '回合开始回复 N 生命，然后 N-1', bad: false },
  thorns: { name: '荆棘', emoji: '🌵', desc: '被攻击时反弹 N 伤害', bad: false },
  stun: { name: '眩晕', emoji: '💫', desc: '跳过下一次行动', bad: true },
  assimilation: {
    name: '同化',
    emoji: '🐧',
    desc: '敌人死亡时，按层数召唤对应生命的小企鹅',
    bad: true,
  },
  contamination: {
    name: '模因污染',
    emoji: '🌀',
    desc: '每次敌人行动开始时，获得相同层数的同化',
    bad: true,
  },
};

/* ===================== B站 / 展示信息 ===================== */
const AUTHOR_NAME = '万游引力';
const VIDEO_TITLE = '撤离区：搜打撤卡牌';
const SAVE_KEY = 'extractionCards.save.v1';
const MOCK_KEY = 'extractionCards.mock';
