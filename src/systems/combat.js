'use strict';

/* 战斗核心：纯逻辑，不碰 DOM，可在 Node 里跑自测。
 * 由 run.js 调用，结果写回 run.hp / run.spent。 */

/* global BASE_ENERGY, BASE_DRAW, HAND_LIMIT, WEAK_MUL, VULN_MUL, BLOCK_RESET, POISON_DECAY,
   BURN_DECAY, REGEN_DECAY, STATUS, CARDS, POTIONS, RNG, clamp, uid, removeItem, buffTotals,
   rollIntent, intentText, SUMMONS */

/* ===================== 创建战斗 ===================== */
/* opts: { hp, maxHp, deck:[{uid,id}], buffs:[], enemies:[], summons:[] } */
function newBattle(opts) {
  const b = {
    hp: opts.hp,
    maxHp: opts.maxHp,
    block: 0,
    st: {},
    power: {
      block: 0,
      heal: 0,
      energy: 0,
      str: 0,
      goldPerHit: 0,
      vulnerableDamage: 0,
      attackEchoChance: 0,
      penguinGroup: 0,
    },
    nextAttackCostDiscount: 0,
    pendingAttackBonus: 0,
    firstAttackBonus: 0,
    activeAttackBonus: 0,
    huff: 0,
    doubleDamageCharges: 0,
    environment: opts.environment || null,
    enemies: opts.enemies,
    summons: opts.summons || [], // 与 run 共用数组；伤亡和强化在大世界中保留
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

function livingSummons(b) {
  return b.summons.filter((summon) => summon.hp > 0);
}

function summonPenguin(b, id, n, attack, hp) {
  const def = SUMMONS[id];
  if (!def) return;
  for (let i = 0; i < n; i++) {
    const summon = {
      uid: uid('s'),
      id,
      name: def.name,
      emoji: def.emoji,
      image: def.image,
      hp,
      maxHp: hp,
      attack,
    };
    b.summons.push(summon);
    if (b.power.penguinGroup) {
      b.summons.forEach((ally) => {
        ally.attack += b.power.penguinGroup;
      });
    }
    b.log.push(`🐧 ${summon.name}加入队伍（${summon.attack} 攻 / ${summon.hp} 血）`);
    b.events.push({ kind: 'summon', text: '+1 ' + summon.name, side: 'summon', uid: summon.uid });
  }
}

function summonStrike(b, summon, ei) {
  const enemy = b.enemies[ei];
  if (!summon || summon.hp <= 0 || !enemy || enemy.hp <= 0) return;
  const amount = calcAttack(summon.attack, {}, enemy.st, 1);
  b.log.push(`🐧 ${summon.name}攻击${enemy.name}，造成 ${amount} 点伤害`);
  b.events.push({ kind: 'summon-attack', uid: summon.uid, index: ei });
  damageEnemy(b, ei, amount, { source: 'summonAttack' });
}

function summonTurn(b) {
  for (const summon of b.summons.slice()) {
    if (battleOver(b)) return;
    const living = aliveEnemies(b);
    if (!living.length) return;
    const enemy = RNG.pick(living);
    summonStrike(b, summon, b.enemies.indexOf(enemy));
  }
}

/* 一段敌方伤害先随机命中一只企鹅；溢伤反复随机转移，最后才由玩家承受。 */
function hitParty(b, amount, enemyIndex) {
  let remaining = amount;
  let firstSummonUid = null;
  while (remaining > 0) {
    const living = livingSummons(b);
    if (!living.length) break;
    const summon = RNG.pick(living);
    if (!firstSummonUid) firstSummonUid = summon.uid;
    const dealt = Math.min(remaining, summon.hp);
    summon.hp -= dealt;
    remaining -= dealt;
    b.log.push(`🐧 ${summon.name}承受 ${dealt} 点伤害`);
    b.events.push({ kind: 'dmg', text: '-' + dealt, side: 'summon', uid: summon.uid });
    if (summon.hp <= 0) {
      b.summons.splice(b.summons.indexOf(summon), 1);
      b.log.push(`☠️ ${summon.name}倒下，已从本次行动移除`);
      b.events.push({ kind: 'summon-die', text: '☠️', side: 'summon', uid: summon.uid });
    }
  }
  if (remaining > 0) hitPlayer(b, remaining, { fromEnemy: enemyIndex });
  return firstSummonUid;
}

function defeatEnemy(b, ei) {
  const enemy = b.enemies[ei];
  if (!enemy || enemy.deathResolved) return;
  enemy.deathResolved = true;
  enemy.hp = 0;
  b.log.push(`☠️ ${enemy.name} 被击倒`);
  b.events.push({ kind: 'die', index: ei });
  const stacks = enemy.st.assimilation || 0;
  if (stacks > 0) summonPenguin(b, 'penguin', 1, 1, stacks);
  if (!aliveEnemies(b).length) b.phase = 'win';
}

/* ===================== 状态 ===================== */
function addStatus(b, who, st, v) {
  if (!v) return;
  if (who === 'player') {
    b.st[st] = (b.st[st] || 0) + v;
    b.log.push(`${STATUS[st].emoji} 你获得 ${v} 层${STATUS[st].name}`);
    b.events.push({
      kind: 'status',
      text: `${STATUS[st].emoji} +${v} ${STATUS[st].name}`,
      side: 'player',
    });
  } else {
    const e = b.enemies[who];
    if (!e || e.hp <= 0) return;
    e.st[st] = (e.st[st] || 0) + v;
    b.log.push(`${STATUS[st].emoji} ${e.name} 获得 ${v} 层${STATUS[st].name}`);
    b.events.push({
      kind: 'status',
      text: `${STATUS[st].emoji} +${v} ${STATUS[st].name}`,
      side: 'enemy',
      index: who,
    });
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
    if (absorbed > 0)
      b.events.push({
        kind: 'block-hit',
        text: '抵挡 ' + absorbed,
        amount: absorbed,
        side: 'player',
      });
    if (absorbed > 0) b.log.push(`🛡️ 护甲抵挡 ${absorbed} 点`);
  }
  if (d > 0) {
    b.hp -= d;
    b.log.push(`💥 你受到 ${d} 点伤害`);
    b.events.push({ kind: 'dmg', text: '-' + d, side: 'player' });
  }
  /* 荆棘反伤 */
  if (opts.fromEnemy != null && !opts.raw && b.st.thorns) {
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
    if (absorbed > 0) {
      b.log.push(`🛡️ ${e.name}的护甲抵挡 ${absorbed} 点伤害`);
      b.events.push({
        kind: 'block-hit',
        text: '抵挡 ' + absorbed,
        amount: absorbed,
        side: 'enemy',
        index: ei,
      });
    }
  }
  const beforeHp = e.hp;
  if (d > 0) {
    e.hp -= d;
    b.events.push({ kind: 'dmg', text: '-' + d, side: 'enemy', index: ei });
  }
  const healthDamage = Math.max(0, beforeHp - Math.max(0, e.hp));
  if (healthDamage > 0 && opts.source === 'playerAttack' && b.power.goldPerHit) {
    b.goldGain = (b.goldGain || 0) + b.power.goldPerHit;
    b.log.push(`🪙 有效攻击获得 ${b.power.goldPerHit} 金币`);
  }
  if (e.hp <= 0) {
    defeatEnemy(b, ei);
  }
  return healthDamage;
}

/* 检查某敌人是否已倒下（用于中毒/灼烧这类直接改 hp 的结算） */
function tryKill(b, ei) {
  const e = b.enemies[ei];
  if (!e || e.hp > 0) return false;
  defeatEnemy(b, ei);
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

function playerCardDamage(b, base, enemy) {
  const attackBase = base + b.activeAttackBonus;
  let amount = calcAttack(attackBase, b.st, enemy.st, b.totals.damageMul);
  if (b.st.weak) {
    const withoutWeak = calcAttack(attackBase, { ...b.st, weak: 0 }, enemy.st, b.totals.damageMul);
    if (amount < withoutWeak) b.log.push(`🥴 虚弱使你的攻击伤害 ${withoutWeak} → ${amount}`);
  }
  if (enemy.st.vuln) {
    const withoutVulnerable = calcAttack(
      attackBase,
      b.st,
      { ...enemy.st, vuln: 0 },
      b.totals.damageMul,
    );
    if (amount > withoutVulnerable)
      b.log.push(`🎯 ${enemy.name}易伤使攻击伤害 ${withoutVulnerable} → ${amount}`);
  }
  if (enemy.st.vuln && b.power.vulnerableDamage) amount += b.power.vulnerableDamage;
  if (amount > 0 && b.doubleDamageCharges > 0) {
    amount *= 2;
    b.doubleDamageCharges--;
    b.log.push('😾 哈气触发：本次伤害翻倍');
  }
  return amount;
}

function applyEnvironmentTurnDamage(b) {
  const amount = b.environment && b.environment.battleDamage;
  if (!amount) return;
  b.hp = Math.max(0, b.hp - amount);
  b.events.push({ kind: 'dmg', text: '-' + amount, side: 'player' });
  for (let i = 0; i < b.enemies.length; i++) {
    const enemy = b.enemies[i];
    if (enemy.hp <= 0) continue;
    enemy.hp = Math.max(0, enemy.hp - amount);
    b.events.push({ kind: 'dmg', text: '-' + amount, side: 'enemy', index: i });
    if (enemy.hp <= 0) tryKill(b, i);
  }
  b.log.push(`🌋 ${b.environment.name}环境侵蚀：双方全体失去 ${amount} 点生命`);
  if (b.hp <= 0) b.phase = 'lose';
  else if (!aliveEnemies(b).length) b.phase = 'win';
}

/* ===================== 回合流程 ===================== */
function startPlayerTurn(b) {
  b.turn++;
  b.nextAttackCostDiscount = 0;
  b.firstAttackBonus = b.pendingAttackBonus;
  b.pendingAttackBonus = 0;
  b.enemies.forEach((enemy) => {
    enemy.attackedThisTurn = false;
  });
  if (BLOCK_RESET && b.turn > 1) b.block = 0;
  /* 符文与能力的回合护甲在每次玩家行动开始时生效。 */
  const turnBlock = (b.totals.startBlock || 0) + b.power.block;
  if (turnBlock) {
    b.block += turnBlock;
    b.log.push(`🛡️ 回合开始获得 ${turnBlock} 点护甲`);
    b.events.push({ kind: 'block', text: '+' + turnBlock, amount: turnBlock, side: 'player' });
  }
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
  applyEnvironmentTurnDamage(b);
  if (battleOver(b)) return;
  if (b.st.stun) {
    b.st.stun--;
    b.energy = 0;
    b.log.push('💫 你眩晕，跳过本回合');
    b.events.push({ kind: 'status', text: '💫 眩晕：跳过回合', side: 'player' });
    b.phase = 'player';
    endTurn(b);
    return;
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
  if (!b || b.phase !== 'player') return;
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
  summonTurn(b);
  if (battleOver(b)) return;
  enemyTurn(b);
}

function enemyTurn(b) {
  b.phase = 'enemy';
  const list = b.enemies;
  const playerTimedBefore = { weak: b.st.weak || 0, vuln: b.st.vuln || 0 };
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.hp <= 0) continue;
    if (battleOver(b)) return;
    /* 旧护甲在敌人下一次行动开始时失效；本次新获得的护甲留给玩家处理。 */
    e.block = 0;
    if (e.st.contamination) addStatus(b, i, 'assimilation', e.st.contamination);
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
      const gained = Math.round(m.block * (1 + (e.st.dex || 0) * 0.25));
      e.block += gained;
      b.events.push({ kind: 'block', text: '+' + gained, amount: gained, side: 'enemy', index: i });
    }
    /* 回血 */
    if (m.heal) {
      const h = Math.min(m.heal, e.maxHp - e.hp);
      if (h > 0) e.hp += h;
    }
    /* 自身状态 */
    if (m.self) {
      for (let k = 0; k < m.self.length; k++) addStatus(b, i, m.self[k].st, m.self[k].v);
    }
    /* 攻击 */
    if (m.dmg) {
      const times = m.times || 1;
      for (let t = 0; t < times; t++) {
        if (battleOver(b)) return;
        const dmg = calcAttack(m.dmg, e.st, b.st, e.dmgMul);
        if (e.st.weak) {
          const normal = calcAttack(m.dmg, { ...e.st, weak: 0 }, b.st, e.dmgMul);
          if (dmg < normal) b.log.push(`🥴 ${e.name}虚弱：攻击伤害 ${normal} → ${dmg}`);
        }
        if (b.st.vuln) {
          const normal = calcAttack(m.dmg, e.st, { ...b.st, vuln: 0 }, e.dmgMul);
          if (dmg > normal) b.log.push(`🎯 你受到易伤影响：攻击伤害 ${normal} → ${dmg}`);
        }
        b.log.push(`${label}，造成 ${dmg} 点伤害`);
        const attackEvent = { kind: 'enemy-attack', index: i };
        b.events.push(attackEvent);
        attackEvent.targetSummonUid = hitParty(b, dmg, i);
        if (b.phase === 'lose') return;
      }
    } else {
      b.log.push(label);
    }
    /* 对玩家施加状态 */
    if (m.player) {
      for (let k = 0; k < m.player.length; k++)
        addStatus(b, 'player', m.player[k].st, m.player[k].v);
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
    rollIntent(e);
  }
  if (battleOver(b)) return;
  /* 只衰减本轮开始前已有的层数，保留敌人本轮新施加的异常。 */
  for (const key of ['vuln', 'weak']) {
    if (playerTimedBefore[key] > 0 && b.st[key]) b.st[key] = Math.max(0, b.st[key] - 1);
  }
  startPlayerTurn(b);
}

/* ===================== 出牌 ===================== */
function cardCost(card, battle) {
  const discount = battle && card.type === 'attack' ? battle.nextAttackCostDiscount || 0 : 0;
  return Math.max(0, card.cost - discount);
}

function canPlay(b, idx) {
  if (!b || !Array.isArray(b.hand) || b.phase !== 'player') return false;
  const inst = b.hand[idx];
  if (!inst) return false;
  const card = CARDS[inst.id];
  return !!card && Number.isFinite(card.cost) && card.cost >= 0 && b.energy >= cardCost(card, b);
}

/* 效果组是否必须指定一个敌方目标（dmg / 单体 status） */
function fxNeedsTarget(fx) {
  for (let i = 0; i < fx.length; i++) {
    const f = fx[i];
    if (f.k === 'dmg') return true;
    if (f.k === 'status' && (f.target === 'enemy' || f.target === undefined)) return true;
    if (f.k === 'assimilationAura' || f.k === 'summonAttack') return true;
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
  let block = e.block || 0;
  let hits = 0;
  let attacked = !!e.attackedThisTurn;
  let doubleCharges = b.doubleDamageCharges;
  const attackBonus = card.type === 'attack' ? b.firstAttackBonus : 0;
  for (let i = 0; i < card.fx.length; i++) {
    const f = card.fx[i];
    if (f.k !== 'dmg' && f.k !== 'dmgAll') continue;
    const times = f.times || 1;
    for (let hit = 0; hit < times; hit++) {
      if (f.k === 'dmgAll') {
        for (let target = 0; target < b.enemies.length; target++) {
          const enemy = b.enemies[target];
          if (enemy.hp <= 0) continue;
          const base = f.v;
          let damage = calcAttack(base + attackBonus, b.st, enemy.st, b.totals.damageMul);
          if (enemy.st.vuln && b.power.vulnerableDamage) damage += b.power.vulnerableDamage;
          if (damage > 0 && doubleCharges > 0) {
            damage *= 2;
            doubleCharges--;
          }
          if (target === ei) {
            const absorbed = Math.min(block, damage);
            block -= absorbed;
            total += damage - absorbed;
          }
        }
        hits++;
      } else {
        let base = f.v;
        if (f.bonusFirstHit && !attacked) base += f.bonusFirstHit;
        if (f.bonusIfVulnerable && e.st.vuln) base += f.bonusIfVulnerable;
        if (f.bonusIfWeak && e.st.weak) base += f.bonusIfWeak;
        let damage = calcAttack(base + attackBonus, b.st, e.st, b.totals.damageMul);
        if (e.st.vuln && b.power.vulnerableDamage) damage += b.power.vulnerableDamage;
        if (damage > 0 && doubleCharges > 0) {
          damage *= 2;
          doubleCharges--;
        }
        attacked = true;
        const absorbed = Math.min(block, damage);
        block -= absorbed;
        total += damage - absorbed;
        hits++;
      }
    }
  }
  if (!total) return null;
  const left = e.hp - total;
  return { total, hits, left, lethal: left <= 0 };
}

function playCard(b, idx, target) {
  if (!canPlay(b, idx)) return false;
  const inst = b.hand[idx];
  const card = CARDS[inst.id];
  const needsTarget = cardNeedsTarget(card);
  if (needsTarget) {
    if (!Number.isInteger(target) || !b.enemies[target] || b.enemies[target].hp <= 0) return false;
  } else if (target == null || !b.enemies[target] || b.enemies[target].hp <= 0) {
    target = b.enemies.findIndex((e) => e.hp > 0);
  }
  b.target = target < 0 ? 0 : target;
  const cost = cardCost(card, b);
  b.energy -= cost;
  if (card.type === 'attack' && b.nextAttackCostDiscount > 0) b.nextAttackCostDiscount = 0;
  removeItem(b.hand, inst);
  b.log.push(`▶️ 你使用了「${card.name}」`);
  if (card.type === 'attack') {
    b.activeAttackBonus = b.firstAttackBonus;
    b.firstAttackBonus = 0;
  }
  applyFx(b, card.fx, target);
  if (
    card.type === 'attack' &&
    !battleOver(b) &&
    b.power.attackEchoChance &&
    RNG.chance(b.power.attackEchoChance)
  ) {
    b.log.push('🐉 脊背龙形态触发：攻击牌效果再次生效');
    applyFx(b, card.fx, target);
  }
  b.activeAttackBonus = 0;
  /* 归属：能力牌本场已生效不再出现；「消耗」牌进消耗区（战斗结束后由 run.js
   * 从局内卡组里永久移除）；其余进弃牌堆，抽牌堆空了会洗回来。 */
  if (card.type === 'power') b.exhaust.push(inst);
  else if (card.exhaust) b.exhaust.push(inst);
  else b.discard.push(inst);
  checkWin(b);
  return true;
}

function applyFx(b, fx, target, allowAfterEnd) {
  for (let i = 0; i < fx.length; i++) {
    if (battleOver(b) && !allowAfterEnd) return;
    const f = fx[i];
    switch (f.k) {
      case 'dmg': {
        const times = f.times || 1;
        for (let t = 0; t < times; t++) {
          if (battleOver(b)) return;
          /* 单体攻击锁定玩家选中的对象；击倒后剩余连击不转移给别的敌人。 */
          const ti = target;
          if (!Number.isInteger(ti) || !b.enemies[ti] || b.enemies[ti].hp <= 0) break;
          const e = b.enemies[ti];
          let base = f.v;
          if (f.bonusFirstHit && !e.attackedThisTurn) base += f.bonusFirstHit;
          if (f.bonusIfVulnerable && e.st.vuln) base += f.bonusIfVulnerable;
          if (f.bonusIfWeak && e.st.weak) base += f.bonusIfWeak;
          const beforeHp = e.hp;
          const d = playerCardDamage(b, base, e);
          e.attackedThisTurn = true;
          const dealt = damageEnemy(b, ti, d, { source: 'playerAttack' }) || 0;
          if (f.blockEqualDamage && dealt > 0) {
            b.block += dealt;
            b.log.push(`🛡️ 偷家获得 ${dealt} 点护甲`);
            b.events.push({ kind: 'block', text: '+' + dealt, amount: dealt, side: 'player' });
          }
          if (beforeHp > 0 && e.hp <= 0 && f.onKillHealMaxFraction) {
            const heal = Math.min(Math.floor(e.maxHp * f.onKillHealMaxFraction), b.maxHp - b.hp);
            if (heal > 0) {
              b.hp += heal;
              b.log.push(`💚 击杀${e.name}，回复 ${heal} 点生命`);
              b.events.push({ kind: 'heal', text: '+' + heal, side: 'player' });
            }
          }
          if (beforeHp > 0 && e.hp <= 0 && f.onKill) applyFx(b, f.onKill, ti, true);
          else if (e.hp > 0 && f.onSurvive) applyFx(b, f.onSurvive, ti);
        }
        break;
      }
      case 'dmgAll': {
        const times = f.times || 1;
        for (let t = 0; t < times; t++) {
          for (let ei = 0; ei < b.enemies.length; ei++) {
            const e = b.enemies[ei];
            if (e.hp <= 0) continue;
            let base = f.v;
            if (f.bonusFirstHit && !e.attackedThisTurn) base += f.bonusFirstHit;
            if (f.bonusIfVulnerable && e.st.vuln) base += f.bonusIfVulnerable;
            if (f.bonusIfWeak && e.st.weak) base += f.bonusIfWeak;
            const d = playerCardDamage(b, base, e);
            e.attackedThisTurn = true;
            damageEnemy(b, ei, d, { source: 'playerAttack' });
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
        if (f.ifTargetVulnerable && !(b.enemies[target] && b.enemies[target].st.vuln)) break;
        if (f.target === 'self') addStatus(b, 'player', f.st, f.v);
        else if (f.target === 'allEnemies') {
          for (let ei = 0; ei < b.enemies.length; ei++) {
            if (b.enemies[ei].hp > 0) addStatus(b, ei, f.st, f.v);
          }
        } else addStatus(b, target, f.st, f.v);
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
      case 'goldPerHit':
        b.power.goldPerHit += f.v;
        b.log.push(`🪙 能力生效：每次有效攻击获得 ${f.v} 金币`);
        break;
      case 'nextAttackDiscount':
        b.nextAttackCostDiscount += f.v;
        b.log.push(`🍉 本回合下一张攻击牌费用降低 ${f.v}`);
        break;
      case 'vulnerableDamage':
        b.power.vulnerableDamage += f.v;
        b.log.push(`⚔️ 能力生效：攻击易伤敌人时额外造成 ${f.v} 点伤害`);
        break;
      case 'summon':
        summonPenguin(b, f.id, f.n, f.attack, f.hp);
        break;
      case 'summonAttackAll':
        b.summons.forEach((summon) => {
          summon.attack += f.v;
        });
        b.log.push(`🐧 所有小企鹅攻击力 +${f.v}`);
        break;
      case 'summonAttack': {
        const living = livingSummons(b);
        if (living.length && b.enemies[target] && b.enemies[target].hp > 0)
          summonStrike(b, RNG.pick(living), target);
        break;
      }
      case 'assimilationAura': {
        const enemy = b.enemies[target];
        if (enemy && enemy.hp > 0) {
          addStatus(b, target, 'contamination', f.v);
          b.log.push(`🐧 ${enemy.name}每回合将获得 ${enemy.st.contamination} 层同化`);
        }
        break;
      }
      case 'powerPenguinGroup':
        b.power.penguinGroup += f.v;
        b.log.push(`🐧 企鹅群生效：每召唤1只小企鹅，所有企鹅攻击力 +${f.v}`);
        break;
      case 'huff': {
        b.huff += f.v;
        const charges = Math.floor(b.huff / 3);
        b.huff %= 3;
        b.doubleDamageCharges += charges;
        b.log.push(`😾 哈气 ${b.huff}/3${charges ? '，下一次伤害翻倍' : ''}`);
        break;
      }
      case 'powerAttackEcho':
        b.power.attackEchoChance = Math.min(1, b.power.attackEchoChance + f.chance);
        b.log.push(`🐉 攻击牌额外触发概率 +${Math.round(f.chance * 100)}%`);
        break;
      case 'nextTurnAttackBonus':
        b.pendingAttackBonus += f.v;
        b.log.push(`🐕 下回合首次攻击伤害 +${f.v}`);
        break;
      default:
        break;
    }
    if (battleOver(b) && !allowAfterEnd) return;
  }
}

function checkWin(b) {
  if (!aliveEnemies(b).length && b.phase !== 'lose') b.phase = 'win';
}

/* ===================== 消耗品 ===================== */
function usePotion(b, index, target) {
  if (!b || b.phase !== 'player' || !Array.isArray(b.potions)) return false;
  const id = b.potions[index];
  if (!id) return false;
  const p = POTIONS[id];
  if (!p) return false;
  if (
    p.fx &&
    fxNeedsTarget(p.fx) &&
    (!Number.isInteger(target) || !b.enemies[target] || b.enemies[target].hp <= 0)
  )
    return false;
  if (target == null || !b.enemies[target] || b.enemies[target].hp <= 0) {
    target = Math.max(
      0,
      b.enemies.findIndex((e) => e.hp > 0),
    );
  }
  b.target = target;
  if (!applyPotionEffects(b, p, target)) return false;
  b.potions.splice(index, 1);
  b.log.push(`🧪 你饮下「${p.name}」`);
  return true;
}

function applyPotionEffects(b, p, target) {
  if (p.fx) {
    const effects = p.fx.filter((f) => f.k !== 'cleanse');
    applyFx(b, effects, target);
  }
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
