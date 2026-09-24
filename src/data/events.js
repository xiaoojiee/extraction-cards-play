'use strict';

/* 随机事件：每个选项返回一段结果文本（由 run.js 的 helper 改状态）。
 * 文案里的数字必须与 helper 实参一致。 */

/* global RNG, CARDS, runGiveCard, runGivePotion, runGainGold, runLoseGold, runHeal,
   runDamage, runAddBuff, runAddBadBuff, runRaiseDanger, runRemoveJunk, runGold,
   runHasJunk, rollCardId, rollPotionId, rollBadBuffId, runZone, runDanger,
   cardPoolByRarity, runLoseMaxHp */

const EVENTS = {};
function defEvent(e) {
  EVENTS[e.id] = e;
  return e;
}

defEvent({
  id: 'med_station',
  title: '旅人营火',
  emoji: '🏥',
  text: '一位旅人留下的营火还没熄，旁边有些草药和半开的木箱。',
  options: [
    {
      label: '搜刮药品',
      hint: '回复 15 生命，可能找到消耗品',
      run() {
        runHeal(15);
        if (RNG.chance(0.5)) {
          const p = runGivePotion(rollPotionId());
          return `回复了 15 点生命，还翻出一瓶「${p.name}」。`;
        }
        return '回复了 15 点生命，药品柜里只剩空瓶。';
      },
    },
    {
      label: '撬开保险柜',
      hint: '得 60 金币，有 50% 概率受伤',
      run() {
        if (RNG.chance(0.5)) {
          runDamage(9);
          const g = runGainGold(60);
          return `防盗电击让你失去 9 点生命，但拿到 ${g} 金币。`;
        }
        const g = runGainGold(60);
        return `顺利撬开，获得 ${g} 金币。`;
      },
    },
    { label: '离开', hint: '什么也不做', run: () => '你悄悄退了出去。' },
  ],
});

defEvent({
  id: 'corpse',
  title: '倒下的冒险者',
  emoji: '🪦',
  text: '一名冒险者倒在路边，背包还系在身上。',
  options: [
    {
      label: '搜刮背包',
      hint: '获得一张随机卡牌',
      run() {
        const id = rollCardId(runDanger(), runZone().lootMul);
        const c = runGiveCard(id);
        return `你从他背包里拿走了「${c.name}」。`;
      },
    },
    {
      label: '就地掩埋',
      hint: '回复 8 生命，获得 20 金币',
      run() {
        runHeal(8);
        const g = runGainGold(20);
        return `你在坟前放了块石头，心里踏实了些（+8 生命，+${g} 金币）。`;
      },
    },
  ],
});

defEvent({
  id: 'black_market',
  title: '行脚旅商',
  emoji: '🧙',
  text: '一位背着大包的旅商问你要不要换些卡牌和药剂。',
  options: [
    {
      label: '买一张卡（50 金币）',
      hint: '随机卡牌',
      run() {
        if (runGold() < 50) return '你摸了摸口袋，转身走了。';
        runLoseGold(50);
        const c = runGiveCard(RNG.pick(cardPoolByRarity('rare')));
        return `你付了 50 金币，换到「${c.name}」。`;
      },
    },
    {
      label: '买一瓶消耗品（35 金币）',
      hint: '随机消耗品',
      run() {
        if (runGold() < 35) return '你摸了摸口袋，转身走了。';
        runLoseGold(35);
        const p = runGivePotion(rollPotionId());
        return `你付了 35 金币，换到「${p.name}」。`;
      },
    },
    { label: '离开', hint: '不交易', run: () => '你摇了摇头走开了。' },
  ],
});

defEvent({
  id: 'radiation_leak',
  title: '腐化泉眼',
  emoji: '☢️',
  text: '通道尽头的泉眼泛着紫光，绕路要多走一段，直接穿过会受伤。',
  options: [
    {
      label: '冲过去',
      hint: '失去 7 生命，获得一张卡牌',
      run() {
        runDamage(7);
        const c = runGiveCard(rollCardId(runDanger(), runZone().lootMul));
        return `你屏住呼吸冲了过去（-7 生命），在对面捡到「${c.name}」。`;
      },
    },
    {
      label: '绕路',
      hint: '危险度 +1',
      run() {
        runRaiseDanger(1);
        return '你绕了远路，安全，但也惊动了什么东西（危险度 +1）。';
      },
    },
  ],
});

defEvent({
  id: 'ammo_crate',
  title: '骑士遗箱',
  emoji: '🧰',
  text: '一只刻着褪色纹章的木箱，锁扣已经锈坏。',
  options: [
    {
      label: '撬开',
      hint: '获得两张随机卡牌',
      run() {
        const a = runGiveCard(rollCardId(runDanger(), runZone().lootMul));
        const b = runGiveCard(rollCardId(runDanger(), runZone().lootMul));
        return `里面是「${a.name}」和「${b.name}」。`;
      },
    },
    {
      label: '整个卖掉',
      hint: '获得 45 金币',
      run() {
        const g = runGainGold(45);
        return `你把箱子拖回商店换了 ${g} 金币。`;
      },
    },
  ],
});

defEvent({
  id: 'trap',
  title: '地精陷阱',
  emoji: '🧨',
  text: '一根细线横在路中，另一头连着一只装满火药的陶罐。',
  options: [
    {
      label: '直接趟过去',
      hint: '失去 8 生命，获得一瓶消耗品',
      run() {
        runDamage(8);
        const p = runGivePotion(rollPotionId());
        return `爆炸把你掀翻（-8 生命），但震出了一个箱子，里面有「${p.name}」。`;
      },
    },
    {
      label: '小心拆解',
      hint: '50% 得 70 金币，50% 失去 11 生命',
      run() {
        if (RNG.chance(0.5)) {
          const g = runGainGold(70);
          return `你剪断了引线，在装置里摸到 ${g} 金币。`;
        }
        runDamage(11);
        return '引线剪错了，你被炸得耳鸣（-11 生命）。';
      },
    },
  ],
});

defEvent({
  id: 'survivor',
  title: '迷路旅人',
  emoji: '📨',
  text: '一名迷路旅人向你求助，手边还剩些补给。',
  options: [
    {
      label: '救助（20 金币）',
      hint: '获得一张卡与一个 buff',
      run() {
        if (runGold() < 20) return '你想帮忙，但身上连 20 金币都没有。';
        runLoseGold(20);
        const c = runGiveCard(RNG.pick(cardPoolByRarity('rare')));
        const b = runAddBuff();
        return `他塞给你「${c.name}」和「${b.name}」作为谢礼。`;
      },
    },
    {
      label: '无视',
      hint: '获得 15 金币',
      run() {
        const g = runGainGold(15);
        return `你从他身边走过，顺手摸走了他口袋里的 ${g} 金币。`;
      },
    },
  ],
});

defEvent({
  id: 'smuggler',
  title: '黑市行脚商',
  emoji: '📦',
  text: '一名行脚商掀开斗篷，露出几件稀有货物，价格不低。',
  options: [
    {
      label: '买一张卡（110 金币）',
      hint: '随机卡牌',
      run() {
        if (runGold() < 110) return '价格让你望而却步。';
        runLoseGold(110);
        const c = runGiveCard(RNG.pick(cardPoolByRarity('epic')));
        return `你咬牙付了 110 金币，拿到「${c.name}」。`;
      },
    },
    {
      label: '买 buff（60 金币）',
      hint: '随机增益',
      run() {
        if (runGold() < 60) return '价格让你望而却步。';
        runLoseGold(60);
        const b = runAddBuff();
        return `你付了 60 金币，装上「${b.name}」。`;
      },
    },
    { label: '离开', hint: '不交易', run: () => '你没敢碰这种来路不明的东西。' },
  ],
});

defEvent({
  id: 'altar',
  title: '许愿神龛',
  emoji: '🕯️',
  text: '神龛上摆着三张奇异卡牌，石座上刻着模糊的符文。',
  options: [
    {
      label: '献祭 6 点生命上限',
      hint: '获得 3 张随机卡牌',
      run() {
        const lost = runLoseMaxHp(6);
        const a = runGiveCard(rollCardId(runDanger() + 4, runZone().lootMul));
        const b = runGiveCard(rollCardId(runDanger() + 4, runZone().lootMul));
        const c = runGiveCard(rollCardId(runDanger() + 4, runZone().lootMul));
        return `你献出了 ${lost} 点生命上限，神龛显出「${a.name}」「${b.name}」「${c.name}」。`;
      },
    },
    {
      label: '喝下池水',
      hint: '随机获得一个诅咒',
      run() {
        const b = runAddBadBuff();
        return `池水腥得发苦，你获得了「${b.name}」。`;
      },
    },
    { label: '离开', hint: '什么也不做', run: () => '你后退两步，离开了神龛。' },
  ],
});

defEvent({
  id: 'armory',
  title: '骑士军械库',
  emoji: '🔐',
  text: '军械库的门敞开着，里面还有备用装备——安静得反常。',
  options: [
    {
      label: '全部搬走',
      hint: '获得 2 卡 + 1 消耗品，但危险度 +3',
      run() {
        const a = runGiveCard(rollCardId(runDanger() + 3, runZone().lootMul));
        const b = runGiveCard(rollCardId(runDanger() + 3, runZone().lootMul));
        const p = runGivePotion(rollPotionId());
        runRaiseDanger(3);
        return `你搬走了「${a.name}」「${b.name}」和「${p.name}」，但警报响了（危险度 +3）。`;
      },
    },
    {
      label: '只拿一样',
      hint: '获得 1 随机卡牌，危险度 +1',
      run() {
        const a = runGiveCard(rollCardId(runDanger(), runZone().lootMul));
        runRaiseDanger(1);
        return `你抓起「${a.name}」就跑（危险度 +1）。`;
      },
    },
    { label: '离开', hint: '什么也不做', run: () => '直觉告诉你别进去。' },
  ],
});

defEvent({
  id: 'polluted_pool',
  title: '腐化池',
  emoji: '🫧',
  text: '池水泛着暗紫色泡沫，底下似乎有东西在移动。',
  options: [
    {
      label: '浸泡清洗',
      hint: '回复 8 生命（有废料牌时会顺手丢掉一张）',
      run() {
        const n = runRemoveJunk();
        runHeal(8);
        return n ? '你顺手把废料扔进水潭，手上轻了不少（+8 生命）。' : '你洗了洗手（+8 生命）。';
      },
    },
    {
      label: '打捞',
      hint: '有 40% 概率获得优质卡牌，否则受伤',
      run() {
        if (RNG.chance(0.4)) {
          const c = runGiveCard(RNG.pick(cardPoolByRarity('epic')));
          return `你从潭底摸出「${c.name}」。`;
        }
        runDamage(10);
        const b = runAddBadBuff();
        return `水面下钻出什么东西咬了你一口（-10 生命），你染上了「${b.name}」。`;
      },
    },
    { label: '离开', hint: '什么也不做', run: () => '你决定不碰这潭水。' },
  ],
});

const EVENT_IDS = Object.keys(EVENTS);
function rollEventId() {
  return RNG.pick(EVENT_IDS);
}
