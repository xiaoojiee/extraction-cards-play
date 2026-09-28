'use strict';

/* 战斗界面：敌人 / 手牌 / 能量 / 状态 / 日志 / 选目标 */

/* global ui, run, el, btn, bar, topBar, logPanel, cardEl, potionEl, statusChips, centerOf,
   captureFlight, animateFlight, createFxScope, spawnFloat, CARDS, POTIONS, STATUS, canPlay, playCard, endTurn, usePotion, battleOver,
   aliveEnemies, intentText, intentKind, intentLabel, resolveBattle, buffDesc, buffEl, refresh,
   cardNeedsTarget, fxNeedsTarget, previewAttack, openPileView, cardText, cardCost */

/* 每场战斗拥有独立的动作队列、抽牌状态和输入锁，不保存会被 render 替换的界面节点。 */
let battleFxContext = null;

function syncBattleFxContext() {
  const b = ui.screen === 'battle' && run ? run.battle : null;
  if (battleFxContext && battleFxContext.battle === b) {
    validateBattleSelection(b);
    return battleFxContext;
  }
  if (battleFxContext) battleFxContext.scope.dispose();
  battleFxContext = null;
  ui.fxLock = false;
  ui.targeting = null;
  if (!b) return null;
  const scope = createFxScope(() => ui.screen === 'battle' && !!run && run.battle === b);
  battleFxContext = { battle: b, scope, locks: new Set(), draws: new Set(), settling: false };
  return battleFxContext;
}

function validateBattleSelection(b) {
  const selected = ui.targeting;
  if (!selected) return;
  if (!b || b.phase !== 'player') {
    ui.targeting = null;
    return;
  }
  if (selected.kind === 'card' || selected.kind === 'card-use') {
    const index = b.hand.findIndex((inst) => inst.uid === selected.uid);
    if (index < 0 || !canPlay(b, index)) ui.targeting = null;
    else selected.hand = index;
  } else if (selected.kind === 'potion' || selected.kind === 'potion-use') {
    if (b.potions[selected.i] !== selected.potionId) ui.targeting = null;
  } else ui.targeting = null;
}

function canBattleInteract(b) {
  return (
    !!b &&
    !!run &&
    run.battle === b &&
    ui.screen === 'battle' &&
    b.phase === 'player' &&
    !ui.modal &&
    !ui.fxLock
  );
}

function holdBattleInput(context) {
  const token = {};
  context.locks.add(token);
  ui.fxLock = true;
  const screen = document.querySelector('.battle-screen');
  if (screen) {
    screen.classList.add('playing-card');
    screen.setAttribute('aria-busy', 'true');
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    context.locks.delete(token);
    if (context !== battleFxContext || !context.scope.active()) return;
    ui.fxLock = context.locks.size > 0;
    if (!ui.fxLock) refresh();
  };
}

/* 挂载战斗界面后消费事件；重渲染时只续接未完成动画，不重新发牌。 */
function afterBattleRender() {
  if (!battleFxContext || !battleFxContext.scope.active()) return;
  const b = battleFxContext.battle;
  const duration = flushBattleFx();
  finishBattleWhenFxDone(b, duration + 40);
}

function endBattleTurn() {
  const b = run && run.battle;
  if (!canBattleInteract(b)) return;
  ui.targeting = null;
  endTurn(b);
  refresh();
  const duration = flushBattleFx();
  finishBattleWhenFxDone(b, duration + 40);
}

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
  support: '防守者',
  elite: '精英',
  boss: '首领',
};

function battleView() {
  const b = run.battle;
  const targeting = !!ui.targeting;
  return el(
    'div',
    {
      class:
        'screen battle-screen' +
        (targeting ? ' targeting-mode' : '') +
        (ui.fxLock ? ' playing-card' : ''),
      'aria-busy': ui.fxLock ? 'true' : 'false',
    },
    [
      topBar(),
      el('div', {
        class: 'battle-location',
        text: `${b.location || '遭遇战'} · 危险度 ${run.danger}${b.environment && b.environment.battleDamage ? ` · ${b.environment.name}：每回合双方全体 -${b.environment.battleDamage} 生命` : ''}`,
      }),
      el('div', { class: 'battle-field', role: 'presentation', onclick: playSelectedOnBlank }, [
        playerPanel(b),
        el('div', { class: 'battle-center' + (b.summons.length ? ' has-summons' : '') }, [
          el(
            'div',
            { class: 'enemies' },
            b.enemies.map((e, i) => enemyEl(e, i)),
          ),
          summonRow(b),
        ]),
        el('div', { class: 'battle-log' }, [logPanel('📜 战斗记录', battleLogLines(b), 'tall')]),
      ]),
      targeting ? targetBanner(b) : null,
      handArea(b),
    ],
  );
}

function summonRow(b) {
  if (!b.summons.length) return null;
  return el('div', { class: 'summon-row' }, [
    el('div', { class: 'summon-row-label', text: `🐧 企鹅伙伴 ${b.summons.length}` }),
    el(
      'div',
      { class: 'summon-list' },
      b.summons.map((summon) =>
        el(
          'div',
          {
            class: 'summon-unit',
            id: 'summon-' + summon.uid,
            title: `${summon.name}：${summon.attack} 攻 / ${summon.hp} 血；跟随本次行动，死亡后消失`,
          },
          [
            el('span', { class: 'summon-icon', text: summon.emoji }),
            el('span', { class: 'summon-name', text: summon.name }),
            el('span', {
              class: 'summon-stats',
              text: `⚔ ${summon.attack} · ❤️ ${summon.hp}/${summon.maxHp}`,
            }),
          ],
        ),
      ),
    ),
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
  if (!ui.targeting || !run || !run.battle) return null;
  if (['potion', 'potion-use'].includes(ui.targeting.kind)) {
    const id = run.battle.potions[ui.targeting.i];
    return id && POTIONS[id] ? { name: POTIONS[id].name, fx: POTIONS[id].fx } : null;
  }
  if (!['card', 'card-use'].includes(ui.targeting.kind)) return null;
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
  if (e.image && !dead)
    kids.push(el('img', { class: 'enemy-portrait', src: e.image, alt: e.name }));
  else kids.push(el('div', { class: 'enemy-emoji', text: dead ? '💀' : e.emoji }));
  kids.push(el('div', { class: 'enemy-name', text: e.name }));
  if (e.archetype) {
    kids.push(el('div', { class: 'enemy-role', text: ENEMY_ROLE_LABEL[e.archetype] || '敌人' }));
  }

  /* 选目标时显示预计伤害 */
  const card = pendingCard();
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
            if (!canBattleInteract(b)) return;
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
  return el('div', { class: 'player-panel', id: 'player-panel' }, [
    el('div', { class: 'player-name', text: '玩家状态' }),
    el('div', { class: 'player-stats' }, [
      bar(b.hp, b.maxHp, 'hp-bar'),
      el('div', { class: 'row' }, [
        el('span', {
          class: 'block-chip',
          title: '护甲保护玩家，敌人攻击召唤物时不会消耗玩家护甲',
          text: '🛡 护甲 ' + b.block,
        }),
        el('div', { class: 'chips' }, [
          el('span', { class: 'chip energy-chip', text: '⚡ ' + b.energy }),
          el('span', { class: 'chip', text: '回合 ' + b.turn }),
        ]),
      ]),
      statusChips(b.st),
      b.huff || b.doubleDamageCharges || b.firstAttackBonus
        ? el('div', { class: 'chips' }, [
            b.huff ? el('span', { class: 'chip', text: `😾 哈气 ${b.huff}/3` }) : null,
            b.doubleDamageCharges
              ? el('span', { class: 'chip', text: `⚡ 翻倍 ${b.doubleDamageCharges} 次` })
              : null,
            b.firstAttackBonus
              ? el('span', { class: 'chip', text: `🐕 首次攻击 +${b.firstAttackBonus}` })
              : null,
          ])
        : null,
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
        ? `已选择「${card ? card.name : '卡牌'}」`
        : card
          ? `选择「${card.name}」的目标（${alive} 个可选）`
          : '选择目标',
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
    const baseCard = CARDS[inst.id];
    const card = Object.assign({}, baseCard, { cost: cardCost(baseCard, b) });
    const ok = canPlay(b, i);
    const disabledReason = ok ? null : cardDisabledReason(b, i);
    const chosen =
      !!ui.targeting &&
      ['card', 'card-use'].includes(ui.targeting.kind) &&
      ui.targeting.uid === inst.uid;
    const drawing =
      (battleFxContext && battleFxContext.draws.has(inst.uid)) ||
      b.events.some(
        (event) => ['draw-card', 'recover-card'].includes(event.kind) && event.uid === inst.uid,
      );
    const off = i - mid;
    return cardEl(card, {
      playable: ok,
      disabled: !ok,
      selected: chosen,
      class: drawing ? 'draw-in-progress' : '',
      id: 'hand-card-' + inst.uid,
      badge: chosen
        ? ui.targeting.kind === 'card'
          ? '选择目标中…'
          : '已选择 · 再次点击打出'
        : disabledReason,
      title: disabledReason ? disabledReason + ' · ' + cardText(card) : undefined,
      style: { '--rot': off * rotStep + 'deg', '--dy': off * off * liftStep + 'px' },
      onClick: ok
        ? () => {
            pickCard(i, inst.uid);
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
          onclick: () => {
            if (canBattleInteract(b)) openPileView('🂠 抽牌堆', idsOf(b.draw), '顺序已打乱');
          },
        }),
        el('span', {
          class: 'pile clickable',
          id: 'discard-pile',
          title: '弃牌堆',
          text: '🗃️ ' + b.discard.length,
          onclick: () => {
            if (canBattleInteract(b))
              openPileView('🗃️ 弃牌堆', idsOf(b.discard), '抽牌堆空时会洗回');
          },
        }),
        el('span', {
          class: 'pile clickable',
          id: 'exhaust-pile',
          title: '消耗堆（战斗结束后移出卡组，撤离也无法恢复）',
          text: '🔥 ' + b.exhaust.length,
          onclick: () => {
            if (canBattleInteract(b))
              openPileView(
                '🔥 消耗堆',
                idsOf(b.exhaust),
                '本场打出后不再出现；战斗结束即从卡组移除',
              );
          },
        }),
      ]),
      el(
        'div',
        { class: 'potion-row' },
        b.potions.length
          ? b.potions.map((id, i) =>
              potionEl(id, {
                selected:
                  !!ui.targeting &&
                  ['potion', 'potion-use'].includes(ui.targeting.kind) &&
                  ui.targeting.i === i,
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
        ui.targeting
          ? ui.targeting.kind === 'card-use' || ui.targeting.kind === 'potion-use'
            ? '打出 / 使用所选'
            : '取消选择'
          : '结束回合',
        ui.targeting ? 'ghost big' : 'primary big',
        () => {
          if (!canBattleInteract(b)) return;
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
          endBattleTurn();
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
  const b = run && run.battle;
  if (!b) return -1;
  const cur = b.enemies[b.target];
  if (cur && cur.hp > 0) return b.target;
  return Math.max(
    0,
    b.enemies.findIndex((e) => e.hp > 0),
  );
}

/* 所有牌都先选中；单体牌随后点敌人，其他牌再次点击、点空白或按按钮打出。 */
function pickCard(i, expectedUid) {
  const b = run && run.battle;
  if (!canBattleInteract(b) || !canPlay(b, i)) return;
  const inst = b.hand[i];
  if (expectedUid && expectedUid !== inst.uid) return;
  const card = CARDS[inst.id];
  if (
    ui.targeting &&
    ['card', 'card-use'].includes(ui.targeting.kind) &&
    ui.targeting.uid === inst.uid
  ) {
    if (ui.targeting.kind === 'card-use') playHandCard(i, defaultTargetIndex());
    else cancelTargeting();
    return;
  }
  if (cardNeedsTarget(card)) {
    ui.targeting = { kind: 'card', hand: i, uid: inst.uid, ei: defaultTargetIndex() };
    refresh();
  } else {
    ui.targeting = { kind: 'card-use', hand: i, uid: inst.uid };
    refresh();
  }
}

function playHandCard(i, target) {
  const b = run && run.battle;
  if (!canBattleInteract(b) || !canPlay(b, i)) return;
  const inst = b.hand[i];
  if (
    !ui.targeting ||
    !['card', 'card-use'].includes(ui.targeting.kind) ||
    ui.targeting.uid !== inst.uid
  )
    return;
  const card = CARDS[inst.id];
  if (cardNeedsTarget(card) && (!b.enemies[target] || b.enemies[target].hp <= 0)) return;
  const context = syncBattleFxContext();
  if (!context) return;
  const source = document.getElementById('hand-card-' + inst.uid);
  const flight = captureFlight(source);
  const playerPoint = centerOf(document.getElementById('player-panel'));
  const livingBefore = b.enemies
    .map((enemy, index) => (enemy.hp > 0 ? index : -1))
    .filter((index) => index >= 0);
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
  const releaseInput = holdBattleInput(context);
  if (source) source.classList.add('draw-in-progress');
  const destination = exhaust ? playerPoint : centerOf(document.getElementById(pileId));
  const endsAtPlayer =
    Math.abs(impact.x - playerPoint.x) < 1 && Math.abs(impact.y - playerPoint.y) < 1;
  const route =
    impact && destination
      ? exhaust && endsAtPlayer
        ? [playerPoint]
        : [impact, destination]
      : [destination || impact];
  animateFlight(flight, route, {
    scope: context.scope,
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
      releaseInput();
      finishBattleWhenFxDone(b, 80);
    },
  });
}

/* 点击消耗品：需要选目标的一律先选目标 */
function pickPotion(i) {
  const b = run && run.battle;
  if (!canBattleInteract(b)) return;
  const id = b.potions[i];
  if (!id) return;
  const p = POTIONS[id];
  if (
    ui.targeting &&
    ['potion', 'potion-use'].includes(ui.targeting.kind) &&
    ui.targeting.i === i
  ) {
    if (ui.targeting.kind === 'potion-use') usePotionNow(i, defaultTargetIndex());
    else cancelTargeting();
    return;
  }
  if (fxNeedsTarget(p.fx)) {
    ui.targeting = { kind: 'potion', i, potionId: id, ei: defaultTargetIndex() };
    refresh();
    return;
  }
  ui.targeting = { kind: 'potion-use', i, potionId: id };
  refresh();
}

function usePotionNow(i, target) {
  const b = run && run.battle;
  if (!canBattleInteract(b)) return;
  const selected = ui.targeting;
  if (
    !selected ||
    !['potion', 'potion-use'].includes(selected.kind) ||
    selected.i !== i ||
    selected.potionId !== b.potions[i]
  )
    return;
  if (selected.kind === 'potion' && (!b.enemies[target] || b.enemies[target].hp <= 0)) return;
  if (!usePotion(b, i, target)) return;
  ui.targeting = null;
  refresh();
  const fxWait = flushBattleFx();
  finishBattleWhenFxDone(b, fxWait + 40);
}

/* 选择目标后立即打出待命的牌或使用消耗品。 */
function confirmTarget(ei) {
  const b = run && run.battle;
  if (!canBattleInteract(b)) return;
  validateBattleSelection(b);
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
  if (
    !canBattleInteract(run && run.battle) ||
    !ui.targeting ||
    !['card-use', 'potion-use'].includes(ui.targeting.kind)
  )
    return;
  if (event.target.closest('.enemy, .player-panel, .battle-log, .hand-area, .target-banner'))
    return;
  confirmTarget(defaultTargetIndex());
}

function pulseBattleNode(selector, className, context) {
  context = context || battleFxContext;
  if (!context || !context.scope.active()) return;
  const node = selector && selector.nodeType ? selector : document.querySelector(selector);
  if (!node) return;
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
  context.scope.later(() => {
    const current = selector && selector.nodeType ? selector : document.querySelector(selector);
    if (current) current.classList.remove(className);
  }, 650);
}

function pulseCardImpact(card, target, livingBefore) {
  const hit = (index) => {
    const enemy = document.getElementById('enemy-' + index);
    if (!enemy) return;
    pulseBattleNode('#enemy-' + index, 'enemy-card-impact');
    spawnImpactBurst(enemy);
  };
  if (card.fx.some((f) => f.k === 'dmgAll')) {
    livingBefore.forEach(hit);
  } else if (cardNeedsTarget(card)) {
    hit(target);
  }
  pulseBattleNode('.battle-screen', 'card-impact');
}

function spawnImpactBurst(target) {
  const context = battleFxContext;
  const layer = document.getElementById('fx-layer');
  if (!layer || !target || !context || !context.scope.active()) return;
  const pos = centerOf(target);
  const burst = el('div', { class: 'impact-burst', text: '✹' });
  burst.style.left = pos.x + 'px';
  burst.style.top = pos.y + 'px';
  layer.appendChild(burst);
  const untrack = context.scope.track(() => burst.remove());
  context.scope.later(() => {
    burst.remove();
    untrack();
  }, 480);
}

function cancelTargeting() {
  if (ui.fxLock) return;
  ui.targeting = null;
  refresh();
}

/* 键盘切换指向目标 */
function moveTargetCursor(delta) {
  const b = run && run.battle;
  if (!canBattleInteract(b) || !ui.targeting) return;
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
  const context = battleFxContext;
  if (
    !b ||
    !context ||
    context.battle !== b ||
    !context.scope.active() ||
    !battleOver(b) ||
    context.settling
  )
    return;
  context.settling = true;
  const finish = () => {
    if (context.locks.size) {
      context.scope.later(finish, 40);
      return;
    }
    if (battleOver(b)) resolveBattle();
  };
  context.scope.later(finish, delay == null ? 620 : Math.max(0, delay));
}

function animateDrawCard(uidv, recovered, context) {
  context = context || battleFxContext;
  if (!context) return;
  if (!context.scope.active()) return;
  const card = document.getElementById('hand-card-' + uidv);
  const pile = document.getElementById(recovered ? 'discard-pile' : 'draw-pile');
  if (!card || !pile) {
    context.draws.delete(uidv);
    if (card) card.classList.remove('draw-in-progress');
    return;
  }
  const flight = captureFlight(card, centerOf(pile));
  card.classList.add('draw-in-progress');
  const releaseInput = holdBattleInput(context);
  animateFlight(flight, [centerOf(card)], {
    scope: context.scope,
    duration: 350,
    startScale: 0.32,
    scale: 1,
    rotate: 0,
    onFinish: () => {
      context.draws.delete(uidv);
      const current = document.getElementById('hand-card-' + uidv);
      if (current) current.classList.remove('draw-in-progress');
      releaseInput();
    },
  });
}

function animateEnemyAttack(event, context) {
  context = context || battleFxContext;
  if (!context) return;
  if (!context.scope.active()) return;
  const index = event.index;
  const enemy = document.getElementById('enemy-' + index);
  const summonTarget = event.targetSummonUid
    ? document.getElementById('summon-' + event.targetSummonUid) ||
      document.querySelector('.summon-row') ||
      document.querySelector('.battle-center')
    : null;
  const target = summonTarget || document.getElementById('player-panel');
  if (!enemy || !target) return;
  const from = centerOf(enemy);
  const to = centerOf(target);
  const shiftX = summonTarget ? (to.x - from.x) * 0.55 : 0;
  const shiftY = summonTarget ? Math.min(118, Math.max(55, to.y - from.y)) : 138;
  enemy.classList.add('enemy-rushing');
  if (enemy.animate) {
    const animation = enemy.animate(
      [
        {
          transform: 'perspective(520px) translate3d(0,0,0) scale(1) rotateX(0)',
          opacity: 1,
          offset: 0,
        },
        {
          transform: `perspective(520px) translate3d(${shiftX * 0.3}px,${shiftY * 0.3}px,24px) scale(1.14) rotateX(3deg)`,
          opacity: 1,
          offset: 0.28,
        },
        {
          transform: `perspective(520px) translate3d(${shiftX}px,${shiftY}px,100px) scale(1.58) rotateX(12deg)`,
          opacity: 0.38,
          offset: 0.56,
        },
        {
          transform: `perspective(520px) translate3d(${shiftX * 0.6}px,${shiftY * 0.6}px,56px) scale(1.38) rotateX(7deg)`,
          opacity: 0.72,
          offset: 0.72,
        },
        {
          transform: 'perspective(520px) translate3d(0,0,0) scale(1) rotateX(0)',
          opacity: 1,
          offset: 1,
        },
      ],
      { duration: 460, easing: 'cubic-bezier(.18,.68,.24,1)' },
    );
    const untrack = context.scope.track(() => animation.cancel());
    const finish = () => {
      animation.onfinish = null;
      animation.oncancel = null;
      animation.cancel();
      untrack();
      const current = document.getElementById('enemy-' + index);
      if (current) current.classList.remove('enemy-rushing');
    };
    animation.onfinish = finish;
    animation.oncancel = finish;
    context.scope.later(finish, 560);
  } else {
    pulseBattleNode('#enemy-' + index, 'enemy-lunge', context);
    context.scope.later(() => {
      const current = document.getElementById('enemy-' + index);
      if (current) current.classList.remove('enemy-rushing');
    }, 520);
  }
  context.scope.later(() => {
    if (summonTarget) pulseBattleNode(summonTarget, 'summon-hit', context);
    else {
      pulseBattleNode('.battle-screen', 'enemy-attack-impact', context);
      pulseBattleNode('#player-panel', 'player-impact', context);
    }
  }, 230);
}

/* 把本回合发生的事件变成飘字和动作效果，读完后清空事件队列。 */
function flushBattleFx(initialDelay) {
  const context = battleFxContext;
  const b = context && context.battle;
  if (!b || !context.scope.active() || ui.screen !== 'battle') return 0;
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
      context.scope.later(
        () => animateDrawCard(ev.uid, ev.kind === 'recover-card', context),
        delay,
      );
      visualEnd = Math.max(visualEnd, delay + 350);
      continue;
    }
    if (ev.kind === 'enemy-attack') {
      const delay = cursor;
      context.scope.later(() => animateEnemyAttack(ev, context), delay);
      visualEnd = Math.max(visualEnd, delay + 460);
      cursor += 480;
      continue;
    }
    if (ev.kind === 'summon-attack') {
      context.scope.later(() => {
        pulseBattleNode('#summon-' + ev.uid, 'summon-attacking', context);
        pulseBattleNode('#enemy-' + ev.index, 'enemy-hit', context);
      }, cursor);
      visualEnd = Math.max(visualEnd, cursor + 380);
      cursor += 150;
      continue;
    }
    const selector =
      ev.side === 'enemy'
        ? '#enemy-' + ev.index
        : ev.side === 'summon'
          ? '#summon-' + ev.uid
          : '#player-panel';
    if (ev.kind === 'block') {
      context.scope.later(() => {
        const node = document.querySelector(selector);
        const pos = centerOf(node);
        pulseBattleNode(selector, 'shield-impact', context);
        spawnFloat('🛡 ' + ev.text, pos.x - 28, pos.y - 10, 'float-block', context.scope);
      }, cursor);
      visualEnd = Math.max(visualEnd, cursor + 520);
    } else if (ev.kind === 'block-hit') {
      context.scope.later(() => {
        const node = document.querySelector(selector);
        const pos = centerOf(node);
        pulseBattleNode(selector, 'shield-impact', context);
        spawnFloat('🛡 ' + ev.text, pos.x - 28, pos.y - 10, 'float-block', context.scope);
      }, cursor);
      visualEnd = Math.max(visualEnd, cursor + 520);
    } else if (ev.kind === 'energy') {
      context.scope.later(() => {
        const orb = document.querySelector('.energy-orb');
        const pos = centerOf(orb);
        pulseBattleNode('.energy-orb', 'energy-pulse', context);
        spawnFloat(ev.text, pos.x - 20, pos.y - 10, 'float-heal', context.scope);
      }, cursor);
      visualEnd = Math.max(visualEnd, cursor + 480);
    } else if (ev.kind === 'status') {
      context.scope.later(() => {
        const node = document.querySelector(selector);
        const pos = centerOf(node);
        pulseBattleNode(selector, ev.side === 'enemy' ? 'enemy-hit' : 'player-impact', context);
        spawnFloat(ev.text, pos.x - 28, pos.y - 10, 'float-status', context.scope);
      }, cursor);
      visualEnd = Math.max(visualEnd, cursor + 520);
    } else {
      const cls = ev.kind === 'dmg' ? 'float-dmg' : ev.kind === 'heal' ? 'float-heal' : 'float-die';
      context.scope.later(() => {
        const node =
          document.querySelector(selector) ||
          (ev.side === 'summon' ? document.querySelector('.summon-row, .battle-center') : null);
        const pos = centerOf(node);
        if (ev.side === 'summon' && ev.kind === 'dmg') pulseBattleNode(node, 'summon-hit', context);
        spawnFloat(ev.text || '💥', pos.x - 14, pos.y - 10, cls, context.scope);
      }, cursor);
      visualEnd = Math.max(visualEnd, cursor + 320);
    }
  }
  evts.length = 0;
  return visualEnd;
}
