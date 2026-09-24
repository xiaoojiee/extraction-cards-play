'use strict';

/* 消耗品数据：局内携带，战斗中随时可用（每瓶一次，用掉即消失）。
 * fx 与卡牌共用同一套解释器（combat.js）。 */

/* global RNG, STATUS */

const POTIONS = {};
function defPotion(p) {
  POTIONS[p.id] = p;
  return p;
}

defPotion({
  id: 'heal_shot',
  name: '治疗药水',
  emoji: '💉',
  price: 50,
  fx: [{ k: 'heal', v: 22 }],
});
defPotion({
  id: 'energy_drink',
  name: '法力药水',
  emoji: '🥤',
  price: 60,
  fx: [{ k: 'energy', v: 3 }],
});
defPotion({
  id: 'str_potion',
  name: '巨力药剂',
  emoji: '💪',
  price: 70,
  fx: [{ k: 'status', st: 'str', v: 3, target: 'self' }],
});
defPotion({
  id: 'dex_potion',
  name: '猫眼药剂',
  emoji: '🎯',
  price: 70,
  fx: [{ k: 'status', st: 'dex', v: 3, target: 'self' }],
});
defPotion({
  id: 'fire_potion',
  name: '烈焰药剂',
  emoji: '🔥',
  price: 65,
  fx: [
    { k: 'dmgAll', v: 8 },
    { k: 'status', st: 'burn', v: 3, target: 'allEnemies' },
  ],
});
defPotion({
  id: 'poison_potion',
  name: '毒雾药剂',
  emoji: '☠️',
  price: 65,
  fx: [{ k: 'status', st: 'poison', v: 6, target: 'allEnemies' }],
});
defPotion({
  id: 'grenade',
  name: '火药炸弹',
  emoji: '💣',
  price: 75,
  fx: [{ k: 'dmgAll', v: 18 }],
});
defPotion({
  id: 'smoke_bomb',
  name: '烟幕药剂',
  emoji: '💨',
  price: 55,
  fx: [
    { k: 'block', v: 12 },
    { k: 'status', st: 'weak', v: 2, target: 'allEnemies' },
  ],
});
defPotion({
  id: 'rage_potion',
  name: '狂战药剂',
  emoji: '😤',
  price: 80,
  fx: [
    { k: 'status', st: 'str', v: 2, target: 'self' },
    { k: 'status', st: 'dex', v: 2, target: 'self' },
  ],
});
defPotion({
  id: 'antidote',
  name: '解毒药剂',
  emoji: '🧼',
  price: 55,
  fx: [{ k: 'cleanse' }, { k: 'heal', v: 8 }],
});
defPotion({
  id: 'espresso',
  name: '魔力浓缩液',
  emoji: '☕',
  price: 55,
  fx: [
    { k: 'energy', v: 1 },
    { k: 'draw', v: 3 },
  ],
});

const POTION_IDS = Object.keys(POTIONS);

function potionText(p) {
  const parts = [];
  for (let i = 0; i < p.fx.length; i++) {
    const f = p.fx[i];
    switch (f.k) {
      case 'heal':
        parts.push(`回复 ${f.v} 点生命`);
        break;
      case 'energy':
        parts.push(`获得 ${f.v} 点能量`);
        break;
      case 'block':
        parts.push(`获得 ${f.v} 点护甲`);
        break;
      case 'draw':
        parts.push(`抽 ${f.v} 张牌`);
        break;
      case 'dmgAll':
        parts.push(`对所有敌人造成 ${f.v} 点伤害`);
        break;
      case 'cleanse':
        parts.push('移除自身所有负面状态');
        break;
      case 'status': {
        const who = f.target === 'allEnemies' ? '所有敌人' : f.target === 'self' ? '自身' : '目标';
        parts.push(`使${who}获得 ${f.v} 层${STATUS[f.st].name}`);
        break;
      }
      default:
        break;
    }
  }
  return parts.join('；');
}

function rollPotionId() {
  return RNG.pick(POTION_IDS);
}
