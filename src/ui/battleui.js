'use strict';

/* 战斗界面：敌人 / 手牌 / 能量 / 状态 / 日志 / 选目标 */

/* global ui, run, el, btn, bar, topBar, logPanel, cardEl, potionEl, statusChips, centerOf,
   captureFlight, animateFlight, spawnFloat, CARDS, POTIONS, STATUS, canPlay, playCard, endTurn, usePotion, battleOver,
   aliveEnemies, intentText, intentKind, intentLabel, resolveBattle, buffDesc, buffEl, refresh,
   cardNeedsTarget, fxNeedsTarget, previewAttack, openPileView, cardText */

/* 意图图标 */
function intentIcon(kind) {
  if (kind === 'attack' || kind === 'attack-debuff') return '🗡';
  if (kind === 'block') return '🛡';
  if (kind === 'heal') return '💚';
  if (kind === 'buff') return '⬆️';
  if (kind === 'debuff') return '⬇️';
  return '·';
}

const ENEMY_ROLE_LABEL = {
  scavenger: '掠夺者',
  disruptor: '咒术师',
  attacker: '战士',
  elite: '精英',
  boss: '首领',
};

function battleView() {
  const b = run.battle;
  const targeting = !!ui.targeting;
  return el('div', {
    class: 'screen battle-screen' + (targeting ? ' targeting-mode' : '') + (ui.fxLock ? ' playing-card' : ''),
  }, [
    topBar(),
    el('div', { class: 'battle-location', text: `${b.location || '遭遇战'} · 危险度 ${run.danger}` }),
    el('div', { class: 'battle-field', onclick: playSelectedOnBlank }, [
      playerPanel(b),
      el(
        'div',
        { class: 'enemies' },
        b.enemies.map((e, i) => enemyEl(e, i)),
      ),
      el('div', { class: 'battle-log' }, [logPanel('📜 战斗记录', battleLogLines(b), 'tall')]),
    ]),
    targeting ? targetBanner(b) : null,
    handArea(b),
  ]);
}

function battleLogLines(b) {
  const out = [];
  const src = b.log.slice(-5);
  for (let i = 0; i < src.length; i++) out.push({ text: src[i], kind: '' });
  return out;
}

/* 选目标时当前指向的敌人下标；未选目标时用上次的目标 */
function pointerIndex() {
  const b = run.battle;
  if (ui.targeting) {
    if (!['card', 'potion'].includes(ui.targeting.kind)) return -1;
    const e = b.enemies[ui.targeting.ei];
    if (e && e.hp > 0) return ui.targeting.ei;
  }
  return b.target;
}

/* 当前待打的牌（用于伤害预览） */
function pendingCard() {
  if (!ui.targeting) return null;
  if (ui.targeting.kind === 'potion') {
    const id = run.battle.potions[ui.targeting.i];
    return id ? { name: POTIONS[id].name, fx: POTIONS[id].fx } : null;
  }
  if (ui.targeting.kind !== 'card') return null;
  const inst = run.battle.hand[ui.targeting.hand];
  return inst ? CARDS[inst.id] : null;
}

function enemyEl(e, i) {
  const b = run.battle;
  const dead = e.hp <= 0;
  const ptr = pointerIndex() === i && !dead;
  const cls = [
    'enemy',
    'tier-' + e.tier,
    dead ? 'dead' : '',
    ptr ? 'targeted' : '',
    ui.targeting && ['card', 'potion'].includes(ui.targeting.kind) && !dead ? 'pickable' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const kids = [];
  if (!dead) {
    const kind = intentKind(e);
    kids.push(
      el('div', { class: 'enemy-intent intent-' + kind, title: intentLabel(e) }, [
        el('span', { class: 'intent-icon', text: intentIcon(kind) }),
        el('span', { class: 'intent-value', text: intentText(e, b.st) }),
      ]),
    );
    kids.push(el('div', { class: 'enemy-intent-name', text: '下回合：' + e.intent.label }));
  }
  kids.push(el('div', { class: 'enemy-emoji', text: dead ? '💀' : e.emoji }));
  kids.push(el('div', { class: 'enemy-name', text: e.name }));
  if (e.archetype) {
    kids.push(
      el('div', { class: 'enemy-role', text: ENEMY_ROLE_LABEL[e.archetype] || '敌人' }),
    );
  }

  /* 选目标时显示预计伤害 */
  const card = ui.targeting && ['card', 'potion'].includes(ui.targeting.kind) ? pendingCard() : null;
  let ghost = 0;
  if (card && !dead) {
    const pv = previewAttack(b, card, i);
    if (pv) {
      ghost = pv.total;
      kids.push(
        el('div', { class: 'preview ' + (pv.lethal ? 'lethal' : '') }, [
          el('span', { text: (pv.hits > 1 ? pv.hits + ' 段 ' : '') + '预计 ' + pv.total }),
          pv.lethal ? el('span', { class: 'preview-kill', text: '可击杀' }) : null,
        ]),
      );
    }
  }

  kids.push(bar(e.hp, e.maxHp, 'enemy-hp', ghost));
  if (e.block > 0) kids.push(el('div', { class: 'enemy-block', text: '🛡 ' + e.block }));
  kids.push(statusChips(e.st, { bad: true }));
  if (ptr) {
    kids.push(
      el('div', {
        class: 'target-marker',
        text: ui.targeting && ['card', 'potion'].includes(ui.targeting.kind) ? '🎯' : '▾',
      }),
    );
  }
  return el(
    'div',
    {
      class: cls,
      id: 'enemy-' + i,
      onclick: dead
        ? null
        : () => {
            if (ui.targeting && ['card', 'potion'].includes(ui.targeting.kind)) confirmTarget(i);
            else {
              b.target = i;
              refresh();
            }
          },
    },
    kids,
  );
}

function playerPanel(b) {
  const buffs = run.buffs.length
    ? el(
        'div',
        { class: 'player-buffs' },
        run.buffs.map((bf) => buffEl(bf, { showScope: true })),
      )
    : null;
  return el('div', { class: 'player-panel pov-panel', id: 'player-panel' }, [
    el('div', { class: 'player-name', text: '第一视角 · 玩家状态' }),
    el('div', { class: 'pov-sight' }, [
      el('span', { class: 'pov-reticle', text: '⊕' }),
      el('span', { class: 'pov-sight-label', text: '瞄准视野' }),
    ]),
    el('div', { class: 'player-stats' }, [
      bar(b.hp, b.maxHp, 'hp-bar'),
      el('div', { class: 'row' }, [
        el('span', { class: 'block-chip', text: '🛡 ' + b.block }),
        el('div', { class: 'chips' }, [
          el('span', { class: 'chip energy-chip', text: '⚡ ' + b.energy }),
          el('span', { class: 'chip', text: '回合 ' + b.turn }),
        ]),
      ]),
      statusChips(b.st),
    ]),
    buffs,
  ]);
}

function targetBanner(b) {
  const card = pendingCard();
  const alive = aliveEnemies(b).length;
  const useSelected = ui.targeting.kind === 'card-use' || ui.targeting.kind === 'potion-use';
  return el('div', { class: 'target-banner' }, [
    el('span', {
      class: 'target-banner-icon',
      text: useSelected ? (ui.targeting.kind === 'card-use' ? '🃏' : '⚗️') : '🎯',
    }),
    el('span', {
      class: 'target-banner-text',
      text: useSelected
        ? `已选择「${ui.targeting.kind === 'card-use' ? CARDS[b.hand[ui.targeting.hand].id].name : POTIONS[b.potions[ui.targeting.i]].name}」`
        : card ? `选择「${card.name}」的目标（${alive} 个可选）` : '选择目标',
    }),
    el('span', {
      class: 'target-banner-hint',
      text: useSelected
        ? '再次点击所选卡牌、点击战场空白或按“打出 / 使用所选”'
        : '← → / A D 切换 · 点击或回车选择 · 右键 / Esc 取消',
    }),
    btn('取消', 'ghost small', cancelTargeting),
  ]);
}

function handArea(b) {
  const hand = b.hand;
  const n = hand.length;
  const mid = (n - 1) / 2;
  const rotStep = n > 1 ? Math.min(4.2, 26 / n) : 0;
  const liftStep = n > 1 ? Math.min(3.2, 24 / n) : 0;
  const kids = hand.map((inst, i) => {
    const card = CARDS[inst.id];
    const ok = canPlay(b, i);
    const disabledReason = ok ? null : cardDisabledReason(b, i);
    const chosen = !!ui.targeting && ['card', 'card-use'].includes(ui.targeting.kind) && ui.targeting.hand === i;
    const off = i - mid;
    return cardEl(card, {
      playable: ok,
      disabled: !ok,
      selected: chosen,
      id: 'hand-card-' + inst.uid,
      badge: chosen ? (ui.targeting.kind === 'card' ? '选择目标中…' : '已选择 · 再次点击打出') : disabledReason,
      title: disabledReason ? disabledReason + ' · ' + cardText(card) : undefined,
      style: { '--rot': off * rotStep + 'deg', '--dy': off * off * liftStep + 'px' },
      onClick: ok
        ? () => {
            pickCard(i);
          }
        : null,
    });
  });
  return el('div', { class: 'hand-area' }, [
    el('div', { class: 'hand-left' }, [
      el('div', { class: 'pile-row' }, [
        el('span', {
          class: 'pile clickable',
          id: 'draw-pile',
          title: '抽牌堆（顺序随机）',
          text: '🂠 ' + b.draw.length,
          onclick: () => openPileView('🂠 抽牌堆', idsOf(b.draw), '顺序已打乱'),
        }),
        el('span', {
          class: 'pile clickable',
          id: 'discard-pile',
          title: '弃牌堆',
          text: '🗃️ ' + b.discard.length,
          onclick: () => openPileView('🗃️ 弃牌堆', idsOf(b.discard), '抽牌堆空时会洗回'),
        }),
        el('span', {
          class: 'pile clickable',
          id: 'exhaust-pile',
          title: '消耗堆（战斗结束后移出卡组，撤离也无法恢复）',
          text: '🔥 ' + b.exhaust.length,
          onclick: () =>
            openPileView('🔥 消耗堆', idsOf(b.exhaust), '本场打出后不再出现；战斗结束即从卡组移除'),
        }),
      ]),
      el(
        'div',
        { class: 'potion-row' },
        b.potions.length
          ? b.potions.map((id, i) =>
              potionEl(id, {
                selected: !!ui.targeting && ['potion', 'potion-use'].includes(ui.targeting.kind) && ui.targeting.i === i,
                onClick: () => pickPotion(i),
              }),
            )
          : [el('div', { class: 'empty-hint', text: '无消耗品' })],
      ),
    ]),
    el('div', { class: 'hand' + (hand.length > 6 ? ' crowded' : '') }, kids),
    el('div', { class: 'hand-right' }, [
      el('div', { class: 'energy-orb', text: b.energy }),
      btn(
        ui.targeting ? (ui.targeting.kind === 'card-use' || ui.targeting.kind === 'potion-use' ? '打出 / 使用所选' : '取消选择') : '结束回合',
        ui.targeting ? 'ghost big' : 'primary big',
        () => {
          if (ui.targeting && ['card-use', 'potion-use'].includes(ui.targeting.kind)) {
            const selected = ui.targeting;
            if (selected.kind === 'card-use') playHandCard(selected.hand, defaultTargetIndex());
            else usePotionNow(selected.i, defaultTargetIndex());
            return;
          }
          if (ui.targeting) {
            cancelTargeting();
            return;
          }
          ui.targeting = null;
          endTurn(b);
          refresh();
          const fxWait = flushBattleFx();
          finishBattleWhenFxDone(b, fxWait + 40);
        },
      ),
    ]),
  ]);
}

function cardDisabledReason(b, i) {
  const inst = b.hand[i];
  if (!inst) return '卡牌不可用';
  const card = CARDS[inst.id];
  if (b.phase !== 'player') return '等待你的回合';
  if (b.energy < card.cost) return `能量不足：需要 ${card.cost} 点`;
  return '当前无法打出';
}

function idsOf(pile) {
  const out = [];
  for (let i = 0; i < pile.length; i++) out.push(pile[i].id);
  return out;
}

/* ===================== 出牌 / 选目标 ===================== */
function defaultTargetIndex() {
  const b = run.battle;
  const cur = b.enemies[b.target];
  if (cur && cur.hp > 0) return b.target;
  return Math.max(
    0,
    b.enemies.findIndex((e) => e.hp > 0),
  );
}

/* 所有牌都先选中；单体牌随后点敌人，其他牌再次点击、点空白或按按钮打出。 */
function pickCard(i) {
  const b = run.battle;
  if (!b || !canPlay(b, i)) return;
  const card = CARDS[b.hand[i].id];
  if (ui.targeting && ['card', 'card-use'].includes(ui.targeting.kind) && ui.targeting.hand === i) {
    if (ui.targeting.kind === 'card-use') playHandCard(i, defaultTargetIndex());
    else cancelTargeting();
    return;
  }
  if (cardNeedsTarget(card)) {
    ui.targeting = { kind: 'card', hand: i, ei: defaultTargetIndex() };
    refresh();
  } else {
    ui.targeting = { kind: 'card-use', hand: i };
    refresh();
  }
}

function playHandCard(i, target) {
  const b = run.battle;
  if (!b || !canPlay(b, i)) return;
  const inst = b.hand[i];
  const card = CARDS[inst.id];
  const source = document.getElementById('hand-card-' + inst.uid);
  const flight = captureFlight(source);
  const playerPoint = centerOf(document.getElementById('player-panel'));
  const livingBefore = b.enemies.map((enemy, index) => (enemy.hp > 0 ? index : -1)).filter((index) => index >= 0);
  let impact = playerPoint;
  if (card.fx.some((f) => f.k === 'dmgAll')) impact = centerOf(document.querySelector('.enemies'));
  else if (cardNeedsTarget(card)) impact = centerOf(document.getElementById('enemy-' + target));
  const exhaust = !!card.exhaust;
  const attack = card.fx.some((f) => f.k === 'dmg' || f.k === 'dmgAll');
  const pileId = exhaust || card.type === 'power' ? 'exhaust-pile' : 'discard-pile';
  if (!playCard(b, i, target)) {
    if (flight) flight.node.remove();
    return;
  }
  ui.targeting = null;
  if (!flight) {
    refresh();
    const fxWait = flushBattleFx();
    finishBattleWhenFxDone(b, fxWait + 40);
    return;
  }
  ui.fxLock = true;
  const screen = document.querySelector('.battle-screen');
  if (screen) screen.classList.add('playing-card');
  if (source) source.classList.add('draw-in-progress');
  const destination = exhaust ? playerPoint : centerOf(document.getElementById(pileId));
  const endsAtPlayer = Math.abs(impact.x - playerPoint.x) < 1 && Math.abs(impact.y - playerPoint.y) < 1;
  const route = impact && destination
    ? exhaust && endsAtPlayer ? [playerPoint] : [impact, destination]
    : [destination || impact];
  animateFlight(flight, route, {
    duration: attack ? 220 : 250,
    pauseAfterSegment: route.length ? 1 : 0,
    pauseDuration: attack ? 230 : 180,
    shatter: exhaust,
    impactPunch: attack,
    pauseClass: attack ? 'fx-impact-hold' : null,
    onPause: () => {
      refresh();
      if (attack) pulseCardImpact(card, target, livingBefore);
      flushBattleFx();
    },
    onFinish: () => {
      ui.fxLock = false;
      refresh();
      finishBattleWhenFxDone(b, 80);
    },
  });
}

/* 点击消耗品：需要选目标的一律先选目标 */
function pickPotion(i) {
  const b = run.battle;
  const id = b.potions[i];
  if (!id) return;
  const p = POTIONS[id];
  if (ui.targeting && ['potion', 'potion-use'].includes(ui.targeting.kind) && ui.targeting.i === i) {
    if (ui.targeting.kind === 'potion-use') usePotionNow(i, defaultTargetIndex());
    else cancelTargeting();
    return;
  }
  if (fxNeedsTarget(p.fx)) {
    ui.targeting = { kind: 'potion', i, ei: defaultTargetIndex() };
    refresh();
    return;
  }
  ui.targeting = { kind: 'potion-use', i };
  refresh();
}

function usePotionNow(i, target) {
  const b = run.battle;
  if (!usePotion(b, i, target)) return;
  ui.targeting = null;
  refresh();
  const fxWait = flushBattleFx();
  finishBattleWhenFxDone(b, fxWait + 40);
}

/* 选择目标后立即打出待命的牌或使用消耗品。 */
function confirmTarget(ei) {
  if (!ui.targeting) return;
  const t = ui.targeting;
  if (t.kind === 'card-use') {
    playHandCard(t.hand, defaultTargetIndex());
    return;
  }
  if (t.kind === 'potion-use') {
    usePotionNow(t.i, defaultTargetIndex());
    return;
  }
  const e = run.battle.enemies[ei];
  if (!e || e.hp <= 0) return;
  run.battle.target = ei;
  if (t.kind === 'potion') usePotionNow(t.i, ei);
  else if (t.kind === 'card') playHandCard(t.hand, ei);
}

function playSelectedOnBlank(event) {
  if (!ui.targeting || ui.targeting.kind !== 'card-use') return;
  if (event.target.closest('.enemy, .player-panel, .battle-log, .hand-area, .target-banner')) return;
  playHandCard(ui.targeting.hand, defaultTargetIndex());
}

function pulseBattleNode(node, className) {
  if (!node) return;
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
  setTimeout(() => node.classList.remove(className), 650);
}

function pulseCardImpact(card, target, livingBefore) {
  const hit = (index) => {
    const enemy = document.getElementById('enemy-' + index);
    if (!enemy) return;
    pulseBattleNode(enemy, 'enemy-card-impact');
    spawnImpactBurst(enemy);
  };
  if (card.fx.some((f) => f.k === 'dmgAll')) {
    livingBefore.forEach(hit);
  } else if (cardNeedsTarget(card)) {
    hit(target);
  }
  pulseBattleNode(document.querySelector('.battle-screen'), 'card-impact');
}

function spawnImpactBurst(target) {
  const layer = document.getElementById('fx-layer');
  if (!layer || !target) return;
  const pos = centerOf(target);
  const burst = el('div', { class: 'impact-burst', text: '✹' });
  burst.style.left = pos.x + 'px';
  burst.style.top = pos.y + 'px';
  layer.appendChild(burst);
  setTimeout(() => burst.remove(), 480);
}

function cancelTargeting() {
  ui.targeting = null;
  refresh();
}

/* 键盘切换指向目标 */
function moveTargetCursor(delta) {
  const b = run.battle;
  if (!ui.targeting) return;
  if (!['card', 'potion'].includes(ui.targeting.kind)) return;
  const alive = [];
  for (let i = 0; i < b.enemies.length; i++) if (b.enemies[i].hp > 0) alive.push(i);
  if (!alive.length) return;
  let k = alive.indexOf(ui.targeting.ei);
  if (k < 0) k = 0;
  k = (k + delta + alive.length) % alive.length;
  ui.targeting.ei = alive[k];
  b.target = alive[k];
  refresh();
}

function finishBattleWhenFxDone(b, delay) {
  if (!battleOver(b)) return;
  setTimeout(() => {
    if (run.battle === b && battleOver(b)) resolveBattle();
  }, delay == null ? 620 : Math.max(0, delay));
}

function animateDrawCard(uidv, recovered) {
  const card = document.getElementById('hand-card-' + uidv);
  const pile = document.getElementById(recovered ? 'discard-pile' : 'draw-pile');
  if (!card || !pile) return;
  const flight = captureFlight(card, centerOf(pile));
  card.classList.add('draw-in-progress');
  animateFlight(flight, [centerOf(card)], {
    duration: 350,
    startScale: 0.32,
    scale: 1,
    rotate: 0,
    onFinish: () => card.classList.remove('draw-in-progress'),
  });
}

function animateEnemyAttack(index) {
  const enemy = document.getElementById('enemy-' + index);
  const player = document.getElementById('player-panel');
  if (!enemy || !player) return;
  enemy.classList.add('enemy-rushing');
  if (enemy.animate) {
    const animation = enemy.animate(
      [
        { transform: 'perspective(520px) translate3d(0,0,0) scale(1) rotateX(0)', opacity: 1, offset: 0 },
        { transform: 'perspective(520px) translate3d(-4px,42px,24px) scale(1.14) rotateX(3deg)', opacity: 1, offset: 0.28 },
        { transform: 'perspective(520px) translate3d(0,138px,100px) scale(1.58) rotateX(12deg)', opacity: 0.38, offset: 0.56 },
        { transform: 'perspective(520px) translate3d(2px,82px,56px) scale(1.38) rotateX(7deg)', opacity: 0.72, offset: 0.72 },
        { transform: 'perspective(520px) translate3d(0,0,0) scale(1) rotateX(0)', opacity: 1, offset: 1 },
      ],
      { duration: 460, easing: 'cubic-bezier(.18,.68,.24,1)' },
    );
    animation.onfinish = () => {
      animation.cancel();
      enemy.classList.remove('enemy-rushing');
    };
  } else pulseBattleNode(enemy, 'enemy-lunge');
  if (!enemy.animate) setTimeout(() => enemy.classList.remove('enemy-rushing'), 520);
  setTimeout(() => {
    pulseBattleNode(document.querySelector('.battle-screen'), 'enemy-attack-impact');
    pulseBattleNode(player, 'player-impact');
  }, 230);
}

/* 把本回合发生的事件变成飘字和动作效果，读完后清空事件队列。 */
function flushBattleFx(initialDelay) {
  const b = run.battle;
  if (!b) return 0;
  const evts = b.events;
  let cursor = initialDelay || 0;
  let drawCount = 0;
  let visualEnd = 0;
  /* 同一帧先藏起新牌，再逐张从牌堆飞入，避免整手牌先闪现。 */
  for (let i = 0; i < evts.length; i++) {
    const ev = evts[i];
    if (ev.kind !== 'draw-card' && ev.kind !== 'recover-card') continue;
    const card = document.getElementById('hand-card-' + ev.uid);
    if (card) card.classList.add('draw-in-progress');
  }
  for (let i = 0; i < evts.length; i++) {
    const ev = evts[i];
    if (ev.kind === 'draw-card' || ev.kind === 'recover-card') {
      const delay = cursor + drawCount++ * 80;
      setTimeout(() => animateDrawCard(ev.uid, ev.kind === 'recover-card'), delay);
      visualEnd = Math.max(visualEnd, delay + 350);
      continue;
    }
    if (ev.kind === 'enemy-attack') {
      const delay = cursor;
      setTimeout(() => animateEnemyAttack(ev.index), delay);
      visualEnd = Math.max(visualEnd, delay + 460);
      cursor += 480;
      continue;
    }
    const node =
      ev.side === 'enemy'
        ? document.getElementById('enemy-' + ev.index)
        : document.getElementById('player-panel');
    const pos = centerOf(node);
    if (ev.kind === 'block') {
      setTimeout(() => {
        pulseBattleNode(node, 'shield-impact');
        spawnFloat('🛡 ' + ev.text, pos.x - 28, pos.y - 10, 'float-block');
      }, cursor);
      visualEnd = Math.max(visualEnd, cursor + 520);
    } else if (ev.kind === 'block-hit') {
      setTimeout(() => {
        pulseBattleNode(node, 'shield-impact');
        spawnFloat('🛡 ' + ev.text, pos.x - 28, pos.y - 10, 'float-block');
      }, cursor);
      visualEnd = Math.max(visualEnd, cursor + 520);
    } else if (ev.kind === 'energy') {
      setTimeout(() => {
        const orb = document.querySelector('.energy-orb');
        pulseBattleNode(orb, 'energy-pulse');
        spawnFloat(ev.text, pos.x - 20, pos.y - 10, 'float-heal');
      }, cursor);
      visualEnd = Math.max(visualEnd, cursor + 480);
    } else if (ev.kind === 'status') {
      setTimeout(() => {
        pulseBattleNode(node, ev.side === 'enemy' ? 'enemy-hit' : 'player-impact');
        spawnFloat(ev.text, pos.x - 28, pos.y - 10, 'float-status');
      }, cursor);
      visualEnd = Math.max(visualEnd, cursor + 520);
    } else {
      const cls = ev.kind === 'dmg' ? 'float-dmg' : ev.kind === 'heal' ? 'float-heal' : 'float-die';
      setTimeout(() => spawnFloat(ev.text || '💥', pos.x - 14, pos.y - 10, cls), cursor);
      visualEnd = Math.max(visualEnd, cursor + 320);
    }
  }
  evts.length = 0;
  return visualEnd;
}
