'use strict';

/* 战斗核心：纯逻辑，不碰 DOM，可在 Node 里跑自测。
 * 由 run.js 调用，结果写回 run.hp / run.spent。 */

/* global BASE_ENERGY, BASE_DRAW, HAND_LIMIT, WEAK_MUL, VULN_MUL, BLOCK_RESET, POISON_DECAY,
   BURN_DECAY, REGEN_DECAY, STATUS, CARDS, POTIONS, RNG, clamp, uid, removeItem, buffTotals,
   rollIntent, intentText */

/* ===================== 创建战斗 ===================== */
/* opts: { hp, maxHp, deck:[{uid,id}], buffs:[], enemies:[] } */
function newBattle(opts) {
  const b = {
    hp: opts.hp,
    maxHp: opts.maxHp,
    block: 0,
    st: {},
    power: { block: 0, heal: 0, energy: 0, str: 0 },
    enemies: opts.enemies,
    draw: RNG.shuffle(opts.deck.slice()),
    hand: [],
    discard: [],
    exhaust: [],
    energy: 0,
    turn: 0,
    phase: 'player', // player | win | lose
    target: 0,
    buffs: opts.buffs || [],
    totals: buffTotals(opts.buffs || []),
    log: [],
    potions: (opts.potions || []).slice(),
    events: [], // 给 UI 做飘字用：{kind, text, target}
  };
  b.sourceDeck = opts.deck;

  /* 战前 buff 结算 */
  if (b.totals.startBlock) b.block += b.totals.startBlock;
  if (b.totals.thornsStart) addStatus(b, 'player', 'thorns', b.totals.thornsStart);
  if (b.totals.hurtPerBattle) hitPlayer(b, b.totals.hurtPerBattle, { raw: true });
  b.log.push(`⚔️ 遭遇 ${b.enemies.map((e) => e.name).join('、')}`);
  if (b.totals.hurtPerBattle) {
    b.log.push(`☢️ 辐射病发作，失去 ${b.totals.hurtPerBattle} 点生命`);
  }
  startPlayerTurn(b);
  return b;
}

function aliveEnemies(b) {
  return b.enemies.filter((e) => e.hp > 0);
}
function battleOver(b) {
  return b.phase === 'win' || b.phase === 'lose';
}

/* ===================== 状态 ===================== */
function addStatus(b, who, st, v) {
  if (!v) return;
  if (who === 'player') {
    b.st[st] = (b.st[st] || 0) + v;
    b.log.push(`${STATUS[st].emoji} 你获得 ${v} 层${STATUS[st].name}`);
    b.events.push({ kind: 'status', text: `${STATUS[st].emoji} +${v} ${STATUS[st].name}`, side: 'player' });
  } else {
    const e = b.enemies[who];
    if (!e || e.hp <= 0) return;
    e.st[st] = (e.st[st] || 0) + v;
    b.log.push(`${STATUS[st].emoji} ${e.name} 获得 ${v} 层${STATUS[st].name}`);
    b.events.push({ kind: 'status', text: `${STATUS[st].emoji} +${v} ${STATUS[st].name}`, side: 'enemy', index: who });
  }
}

/* ===================== 伤害 ===================== */
/* 对玩家造成伤害（damage 已由调用方算好；吃护甲 + 荆棘反伤） */
function hitPlayer(b, d, opts) {
  opts = opts || {};
  if (!opts.raw) {
    const absorbed = Math.min(b.block, d);
    b.block -= absorbed;
    d -= absorbed;
    if (absorbed > 0) b.events.push({ kind: 'block-hit', text: '抵挡 ' + absorbed, amount: absorbed, side: 'player' });
    if (absorbed > 0) b.log.push(`🛡️ 护甲抵挡 ${absorbed} 点`);
  }
  if (d > 0) {
    b.hp -= d;
    b.log.push(`💥 你受到 ${d} 点伤害`);
    b.events.push({ kind: 'dmg', text: '-' + d, side: 'player' });
  }
  /* 荆棘反伤 */
  if (opts.fromEnemy && !opts.raw && b.st.thorns) {
    damageEnemy(b, opts.fromEnemy, b.st.thorns, { raw: true, reflect: true });
  }
  if (b.hp <= 0) {
    b.hp = 0;
    b.phase = 'lose';
  }
}

/* 对敌人造成伤害 */
function damageEnemy(b, ei, amount, opts) {
  opts = opts || {};
  const e = b.enemies[ei];
  if (!e || e.hp <= 0) return;
  let d = amount;
  if (!opts.raw) {
    const absorbed = Math.min(e.block, d);
    e.block -= absorbed;
    d -= absorbed;
  }
  if (d > 0) {
    e.hp -= d;
    b.events.push({ kind: 'dmg', text: '-' + d, side: 'enemy', index: ei });
  }
  if (e.hp <= 0) {
    e.hp = 0;
    b.log.push(`☠️ ${e.name} 被击倒`);
    b.events.push({ kind: 'die', index: ei });
    if (!aliveEnemies(b).length) b.phase = 'win';
  }
}

/* 检查某敌人是否已倒下（用于中毒/灼烧这类直接改 hp 的结算） */
function tryKill(b, ei) {
  const e = b.enemies[ei];
  if (!e || e.hp > 0) return false;
  e.hp = 0;
  b.log.push(`☠️ ${e.name} 被击倒`);
  b.events.push({ kind: 'die', index: ei });
  if (!aliveEnemies(b).length) b.phase = 'win';
  return true;
}

/* 统一攻击计算：力量 → 虚弱 → 增伤 → 易伤 */
function calcAttack(base, attackerSt, defenderSt, dmgMul) {
  let d = base + (attackerSt.str || 0);
  if (attackerSt.weak) d = Math.floor(d * WEAK_MUL);
  d = Math.floor(d * (dmgMul || 1));
  if (defenderSt.vuln) d = Math.floor(d * VULN_MUL);
  return Math.max(0, d);
}

/* ===================== 回合流程 ===================== */
function startPlayerTurn(b) {
  b.turn++;
  if (BLOCK_RESET && b.turn > 1) b.block = 0;
  /* 能力：每回合护甲 */
  if (b.power.block) b.block += b.power.block;
  if (b.power.str) {
    b.st.str = (b.st.str || 0) + b.power.str;
    b.log.push(`💪 力量 +${b.power.str}`);
  }
  /* 中毒 / 再生 */
  if (b.st.poison) {
    b.hp -= b.st.poison;
    b.log.push(`🧪 中毒损失 ${b.st.poison} 点生命`);
    b.events.push({ kind: 'dmg', text: '-' + b.st.poison, side: 'player' });
    b.st.poison = Math.max(0, b.st.poison - POISON_DECAY);
    if (b.hp <= 0) {
      b.hp = 0;
      b.phase = 'lose';
      return;
    }
  }
  if (b.st.regen) {
    const h = Math.min(b.st.regen, b.maxHp - b.hp);
    if (h > 0) {
      b.hp += h;
      b.log.push(`💚 再生回复 ${h} 点生命`);
      b.events.push({ kind: 'heal', text: '+' + h, side: 'player' });
    }
    b.st.regen = Math.max(0, b.st.regen - REGEN_DECAY);
  }
  /* 能量 / 抽牌 */
  b.energy = BASE_ENERGY + (b.totals.energy || 0) + (b.power.energy || 0);
  if (b.turn === 1 && b.totals.firstTurnEnergy) b.energy += b.totals.firstTurnEnergy;
  const n = BASE_DRAW + (b.totals.draw || 0);
  drawCards(b, n);
  b.log.push(`— 第 ${b.turn} 回合 —`);
  b.phase = 'player';
}

function drawCards(b, n) {
  for (let i = 0; i < n; i++) {
    if (b.hand.length >= HAND_LIMIT) break;
    if (!b.draw.length) {
      if (!b.discard.length) break;
      b.draw = RNG.shuffle(b.discard);
      b.discard = [];
      b.log.push('♻️ 弃牌堆洗回抽牌堆');
    }
    b.hand.push(b.draw.pop());
    b.events.push({ kind: 'draw-card', uid: b.hand[b.hand.length - 1].uid });
  }
}

/* 结束玩家回合 → 敌人行动 → 新回合 */
function endTurn(b) {
  if (battleOver(b)) return;
  /* 灼烧 / 手牌丢弃 */
  if (b.st.burn) {
    b.hp -= b.st.burn;
    b.log.push(`🔥 灼烧损失 ${b.st.burn} 点生命`);
    b.events.push({ kind: 'dmg', text: '-' + b.st.burn, side: 'player' });
    b.st.burn = Math.max(0, b.st.burn - BURN_DECAY);
    if (b.hp <= 0) {
      b.hp = 0;
      b.phase = 'lose';
      return;
    }
  }
  if (b.power.heal) {
    const h = Math.min(b.power.heal, b.maxHp - b.hp);
    if (h > 0) {
      b.hp += h;
      b.log.push(`⛑️ 回复 ${h} 点生命`);
      b.events.push({ kind: 'heal', text: '+' + h, side: 'player' });
    }
  }
  if (b.totals.healPerTurn) {
    const h = Math.min(b.totals.healPerTurn, b.maxHp - b.hp);
    if (h > 0) {
      b.hp += h;
      b.log.push(`💚 再生血清回复 ${h} 点生命`);
      b.events.push({ kind: 'heal', text: '+' + h, side: 'player' });
    }
  }
  /* 弃手牌 */
  while (b.hand.length) b.discard.push(b.hand.pop());

  enemyTurn(b);
}

function enemyTurn(b) {
  b.phase = 'enemy';
  const list = b.enemies;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.hp <= 0) continue;
    if (battleOver(b)) return;
    /* 状态结算：眩晕 */
    if (e.st.stun) {
      e.st.stun--;
      b.log.push(`💫 ${e.name} 眩晕，跳过行动`);
      rollIntent(e);
      continue;
    }
    if (e.st.poison) {
      e.hp -= e.st.poison;
      b.log.push(`🧪 ${e.name} 中毒损失 ${e.st.poison} 点生命`);
      b.events.push({ kind: 'dmg', text: '-' + e.st.poison, side: 'enemy', index: i });
      e.st.poison = Math.max(0, e.st.poison - POISON_DECAY);
      if (tryKill(b, i)) {
        if (b.phase === 'win') return;
        continue;
      }
    }
    if (e.st.regen) {
      e.hp = Math.min(e.maxHp, e.hp + e.st.regen);
      e.st.regen = Math.max(0, e.st.regen - REGEN_DECAY);
    }
    const m = e.intent || rollIntent(e);
    const label = `${e.emoji} ${e.name} 使用「${m.label}」`;
    /* 护甲 */
    if (m.block) {
      e.block = (e.block || 0) + Math.round(m.block * (1 + (e.st.dex || 0) * 0.25));
    }
    /* 回血 */
    if (m.heal) {
      const h = Math.min(m.heal, e.maxHp - e.hp);
      if (h > 0) e.hp += h;
    }
    /* 自身状态 */
    if (m.self) {
      for (let k = 0; k < m.self.length; k++)
        e.st[m.self[k].st] = (e.st[m.self[k].st] || 0) + m.self[k].v;
    }
    /* 攻击 */
    if (m.dmg) {
      const times = m.times || 1;
      for (let t = 0; t < times; t++) {
        if (battleOver(b)) return;
        const dmg = calcAttack(m.dmg, e.st, b.st, e.dmgMul);
        b.log.push(`${label}，造成 ${dmg} 点伤害`);
        b.events.push({ kind: 'enemy-attack', index: i });
        hitPlayer(b, dmg, { fromEnemy: i });
        if (b.phase === 'lose') return;
      }
    } else {
      b.log.push(label);
    }
    /* 对玩家施加状态 */
    if (m.player) {
      for (let k = 0; k < m.player.length; k++) {
        b.st[m.player[k].st] = (b.st[m.player[k].st] || 0) + m.player[k].v;
        b.log.push(
          `${STATUS[m.player[k].st].emoji} 你获得 ${m.player[k].v} 层${STATUS[m.player[k].st].name}`,
        );
      }
    }
    /* 灼烧 */
    if (e.st.burn) {
      e.hp -= e.st.burn;
      b.log.push(`🔥 ${e.name} 灼烧损失 ${e.st.burn} 点生命`);
      b.events.push({ kind: 'dmg', text: '-' + e.st.burn, side: 'enemy', index: i });
      e.st.burn = Math.max(0, e.st.burn - BURN_DECAY);
      if (tryKill(b, i)) {
        if (b.phase === 'win') return;
      }
    }
    /* 易伤/虚弱衰减 */
    for (const key of ['vuln', 'weak']) {
      if (e.st[key]) e.st[key] = Math.max(0, e.st[key] - 1);
    }
    e.block = 0; /* 敌人护甲在其回合结束后清空 */
    rollIntent(e);
  }
  if (battleOver(b)) return;
  /* 玩家易伤/虚弱衰减 */
  for (const key of ['vuln', 'weak']) {
    if (b.st[key]) b.st[key] = Math.max(0, b.st[key] - 1);
  }
  startPlayerTurn(b);
}

/* ===================== 出牌 ===================== */
function cardCost(card) {
  return card.cost;
}

function canPlay(b, idx) {
  const inst = b.hand[idx];
  if (!inst) return false;
  const card = CARDS[inst.id];
  return b.energy >= cardCost(card) && b.phase === 'player';
}

/* 效果组是否必须指定一个敌方目标（dmg / 单体 status） */
function fxNeedsTarget(fx) {
  for (let i = 0; i < fx.length; i++) {
    const f = fx[i];
    if (f.k === 'dmg') return true;
    if (f.k === 'status' && (f.target === 'enemy' || f.target === undefined)) return true;
  }
  return false;
}
function cardNeedsTarget(card) {
  return fxNeedsTarget(card.fx);
}

/* 伤害预览：用于选目标时显示"预计造成 X 点伤害 / 可击杀" */
function previewAttack(b, card, ei) {
  const e = b.enemies[ei];
  if (!e || e.hp <= 0) return null;
  let total = 0;
  let hits = 0;
  for (let i = 0; i < card.fx.length; i++) {
    const f = card.fx[i];
    if (f.k !== 'dmg' && f.k !== 'dmgAll') continue;
    const times = f.times || 1;
    total += calcAttack(f.v, b.st, e.st, b.totals.damageMul) * times;
    hits += times;
  }
  if (!total) return null;
  const left = e.hp + e.block - total;
  return { total, hits, left, lethal: left <= 0 };
}

function playCard(b, idx, target) {
  if (!canPlay(b, idx)) return false;
  const inst = b.hand[idx];
  const card = CARDS[inst.id];
  /* 默认目标 */
  if (target == null || !b.enemies[target] || b.enemies[target].hp <= 0) {
    target = b.enemies.findIndex((e) => e.hp > 0);
  }
  b.target = target < 0 ? 0 : target;
  b.energy -= cardCost(card);
  removeItem(b.hand, inst);
  b.log.push(`▶️ 你使用了「${card.name}」`);
  applyFx(b, card.fx, target);
  /* 归属：能力牌本场已生效不再出现；「消耗」牌进消耗区（战斗结束后由 run.js
   * 从局内卡组里永久移除）；其余进弃牌堆，抽牌堆空了会洗回来。 */
  if (card.type === 'power') b.exhaust.push(inst);
  else if (card.exhaust) b.exhaust.push(inst);
  else b.discard.push(inst);
  checkWin(b);
  return true;
}

function applyFx(b, fx, _target) {
  for (let i = 0; i < fx.length; i++) {
    const f = fx[i];
    switch (f.k) {
      case 'dmg': {
        const times = f.times || 1;
        for (let t = 0; t < times; t++) {
          if (battleOver(b)) return;
          const ti =
            b.enemies[b.target] && b.enemies[b.target].hp > 0
              ? b.target
              : b.enemies.findIndex((e) => e.hp > 0);
          if (ti < 0) break;
          const e = b.enemies[ti];
          const d = calcAttack(f.v, b.st, e.st, b.totals.damageMul);
          damageEnemy(b, ti, d, {});
        }
        break;
      }
      case 'dmgAll': {
        const times = f.times || 1;
        for (let t = 0; t < times; t++) {
          for (let ei = 0; ei < b.enemies.length; ei++) {
            const e = b.enemies[ei];
            if (e.hp <= 0) continue;
            const d = calcAttack(f.v, b.st, e.st, b.totals.damageMul);
            damageEnemy(b, ei, d, {});
          }
          if (battleOver(b)) return;
        }
        break;
      }
      case 'block': {
        const v = Math.round(f.v * (1 + (b.st.dex || 0) * 0.25) * (b.totals.blockMul || 1));
        b.block += v;
        b.log.push(`🛡️ 你获得 ${v} 点护甲`);
        b.events.push({ kind: 'block', text: '+' + v, amount: v, side: 'player' });
        break;
      }
      case 'draw':
        drawCards(b, f.v);
        break;
      case 'energy':
        b.energy += f.v;
        b.log.push(`⚡ 获得 ${f.v} 点能量`);
        b.events.push({ kind: 'energy', text: '⚡ +' + f.v, side: 'player' });
        break;
      case 'heal': {
        const h = Math.min(f.v, b.maxHp - b.hp);
        if (h > 0) {
          b.hp += h;
          b.log.push(`💚 回复 ${h} 点生命`);
          b.events.push({ kind: 'heal', text: '+' + h, side: 'player' });
        }
        break;
      }
      case 'loseHp':
        b.hp -= f.v;
        b.log.push(`🩸 失去 ${f.v} 点生命`);
        if (b.hp <= 0) {
          b.hp = 0;
          b.phase = 'lose';
        }
        break;
      case 'gold':
        b.goldGain = (b.goldGain || 0) + f.v;
        b.log.push(`🪙 获得 ${f.v} 金币`);
        break;
      case 'status': {
        if (f.target === 'self') addStatus(b, 'player', f.st, f.v);
        else if (f.target === 'allEnemies') {
          for (let ei = 0; ei < b.enemies.length; ei++) {
            if (b.enemies[ei].hp > 0) addStatus(b, ei, f.st, f.v);
          }
        } else addStatus(b, b.target, f.st, f.v);
        break;
      }
      case 'recover': {
        for (let n = 0; n < f.v && b.discard.length; n++) {
          const i = RNG.int(0, b.discard.length - 1);
          const inst = b.discard.splice(i, 1)[0];
          b.hand.push(inst);
          b.events.push({ kind: 'recover-card', uid: inst.uid });
        }
        b.log.push(`♻️ 回收了 ${f.v} 张牌`);
        break;
      }
      case 'addCard': {
        const n = f.n || 1;
        for (let k = 0; k < n; k++) {
          const inst = { uid: uid('tmp'), id: f.card };
          if (f.to === 'draw') {
            b.draw.push(inst);
            b.draw = RNG.shuffle(b.draw);
          } else if (f.to === 'discard') b.discard.push(inst);
          else b.hand.push(inst);
        }
        break;
      }
      case 'powerBlock':
        b.power.block += f.v;
        b.log.push(`🧱 能力生效：每回合 +${f.v} 护甲`);
        break;
      case 'powerHeal':
        b.power.heal += f.v;
        b.log.push(`⛑️ 能力生效：每回合回复 ${f.v} 点生命`);
        break;
      case 'powerEnergy':
        b.power.energy += f.v;
        b.log.push(`❤️‍🔥 能力生效：每回合 +${f.v} 能量`);
        break;
      case 'powerStr':
        b.power.str += f.v;
        b.log.push(`💪 能力生效：每回合 +${f.v} 力量`);
        break;
      default:
        break;
    }
    if (battleOver(b)) return;
  }
}

function checkWin(b) {
  if (!aliveEnemies(b).length && b.phase !== 'lose') b.phase = 'win';
}

/* ===================== 消耗品 ===================== */
function usePotion(b, index, target) {
  if (b.phase !== 'player') return false;
  const id = b.potions[index];
  if (!id) return false;
  const p = POTIONS[id];
  if (target == null || !b.enemies[target] || b.enemies[target].hp <= 0) {
    target = Math.max(
      0,
      b.enemies.findIndex((e) => e.hp > 0),
    );
  }
  b.target = target;
  b.potions.splice(index, 1);
  b.log.push(`🧪 你饮下「${p.name}」`);
  if (p.fx) applyFx(b, p.fx, target);
  if (p.fx && p.fx.some((f) => f.k === 'cleanse')) {
    const keep = {};
    for (const k in b.st) if (!STATUS[k].bad) keep[k] = b.st[k];
    b.st = keep;
    b.log.push('🧼 负面状态被净化');
  }
  return true;
}

/* ===================== 结算 ===================== */
/* 返回 { result:'win'|'lose', hp, spent:[uid...], goldGain } */
function battleResult(b) {
  /* 只有「消耗」牌才算真的一次性开销（能力牌进消耗区只是本场不再出现） */
  const spent = b.exhaust.filter((c) => CARDS[c.id].exhaust).map((c) => c.uid);
  return {
    result: b.phase === 'win' ? 'win' : 'lose',
    hp: b.hp,
    spent,
    goldGain: b.goldGain || 0,
  };
}
