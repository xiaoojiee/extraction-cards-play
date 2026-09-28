'use strict';

/* 顶栏 / 日志 / 弹窗 / 提示条 */

/* global ui, run, meta, el, btn, bar, cardEl, cardGrid, potionEl, buffEl, statusChips, goldText, cardText,
   potionText, buffDesc, buffScopeText, RARITY, CARDS, POTIONS, BUFFS, ZONES, STATUS, VIEW_W,
   closeModal, chooseBuff, chooseEventOption, closeEvent, closeShop, shopBuyCard, shopBuyPotion,
   shopSellCard, doExtract, secureAdd, cardSellPrice, potionSlots, deckMax, runTotals,
   secureCap, runGiveCard, runLog, markTileCleared, canUpgradeCard, upgradedId, pickUpgrade,
   shopUpgrade, shopPayout, FIRE_HEAL_RATE, SHOP_UPGRADE_COST, fireRest, fireSmith,
   upgradableCount, sortBar, sortCardIds, refresh, claimBattleReward, settingsModal */

/* ===================== 顶栏 ===================== */
function topBar(opts) {
  opts = opts || {};
  const battle = run && run.mode === 'battle' ? run.battle : null;
  const hp = battle ? battle.hp : run ? run.hp : meta.maxHp;
  const maxHp = battle ? battle.maxHp : run ? run.maxHp : meta.maxHp;
  const left = el('div', { class: 'top-left' }, [
    el('div', { class: 'hp-wrap' }, [
      el('span', { class: 'hp-emoji', text: '❤️' }),
      bar(hp, maxHp, 'hp-bar'),
    ]),
  ]);
  if (run) {
    if (battle) {
      left.appendChild(
        el('span', {
          class: 'stat',
          title: '玩家护甲只保护玩家，召唤物受击不会消耗此护甲',
          text: '🛡 护甲 ' + battle.block,
        }),
      );
      if (Object.values(battle.st).some((value) => value > 0)) {
        const statuses = statusChips(battle.st);
        statuses.classList.add('top-status');
        left.appendChild(statuses);
      }
    } else {
      left.appendChild(el('span', { class: 'stat', text: '⚠️ 危险度 ' + run.danger }));
      left.appendChild(el('span', { class: 'stat', text: '⌖ 步数 ' + run.steps }));
    }
  }
  const right = el('div', { class: 'top-right' });
  if (run) {
    right.appendChild(el('span', { class: 'stat', text: '🪙 ' + run.gold + ' 金币' }));
    if (!battle)
      right.appendChild(el('span', { class: 'stat', text: run.zone.emoji + ' ' + run.zone.name }));
    right.appendChild(
      el(
        'div',
        { class: 'buff-row' },
        run.buffs.map((b) => buffEl(b)),
      ),
    );
  } else {
    right.appendChild(el('span', { class: 'stat', text: '🪙 ' + meta.gold + ' 金币' }));
  }
  if (opts.right) right.appendChild(opts.right);
  return el('div', { class: 'topbar' }, [left, right]);
}

/* ===================== 日志 ===================== */
function logPanel(title, lines, cls) {
  return el('div', { class: 'log-panel ' + (cls || '') }, [
    el('div', { class: 'log-title', text: title }),
    el(
      'div',
      { class: 'log-body' },
      lines.map((l) => el('div', { class: 'log-line ' + (l.kind || ''), text: l.text })),
    ),
  ]);
}

/* ===================== 弹窗 ===================== */
function modalView() {
  const m = ui.modal;
  if (!m) return null;
  let body = null;
  if (m.kind === 'reward') body = rewardModal(m);
  else if (m.kind === 'buff') body = buffModal(m);
  else if (m.kind === 'event') body = eventModal(m);
  else if (m.kind === 'shop') body = shopModal(m);
  else if (m.kind === 'extract') body = extractModal(m);
  else if (m.kind === 'fire') body = fireModal(m);
  else if (m.kind === 'upgrade') body = upgradeModal(m);
  else if (m.kind === 'pile') body = pileModal(m);
  else if (m.kind === 'help') body = helpModal(m);
  else if (m.kind === 'bag') body = bagModal(m);
  else if (m.kind === 'settings') body = settingsModal(m);
  if (!body) return null;
  const wide = m.kind === 'pile' || m.kind === 'upgrade' || m.kind === 'shop';
  return el('div', { class: 'modal-mask' }, [
    el(
      'div',
      {
        class: 'modal ' + (m.kind || '') + (wide ? ' wide' : ''),
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': m.title || '游戏菜单',
      },
      body,
    ),
  ]);
}

/* ---- 牌堆查看 ---- */
function openPileView(title, ids, hint) {
  ui.modal = { kind: 'pile', title, ids: ids.slice(), hint };
  refresh();
}

function pileModal(m) {
  const list = sortCardIds(m.ids || []).map((id) => ({ card: CARDS[id] }));
  return [
    el('div', { class: 'modal-title', text: m.title }),
    el('div', { class: 'modal-sub', text: `${list.length} 张${m.hint ? ' · ' + m.hint : ''}` }),
    sortBar(),
    cardGrid(list.length ? list : []),
    btn('关闭', 'primary', closeModal),
  ];
}

/* ---- 营地 ---- */
function fireModal() {
  const want = Math.max(1, Math.round(run.maxHp * FIRE_HEAL_RATE));
  return [
    el('div', { class: 'modal-title', text: '🔥 营地' }),
    el('div', {
      class: 'modal-text',
      text: '营地只够做一件事。休息能回复体力，打铁能让一张卡永久变强。',
    }),
    el('div', { class: 'opt-list' }, [
      el('div', { class: 'opt', onclick: fireRest }, [
        el('div', { class: 'opt-label', text: `😴 休息（回复 ${want} 点生命）` }),
        el('div', { class: 'opt-hint', text: `当前 ${run.hp} / ${run.maxHp}` }),
      ]),
      el('div', { class: 'opt', onclick: fireSmith }, [
        el('div', { class: 'opt-label', text: '🔨 打铁（免费升级一张牌）' }),
        el('div', { class: 'opt-hint', text: `可升级 ${upgradableCount(run.deck)} 张` }),
      ]),
      el('div', { class: 'opt', onclick: closeModal }, [
        el('div', { class: 'opt-label', text: '返回地点场景' }),
        el('div', { class: 'opt-hint', text: '暂不休息或升级' }),
      ]),
    ]),
  ];
}

/* ---- 升级选牌 ---- */
function upgradeModal(m) {
  const deck = run ? run.deck : [];
  const cards = deck
    .map((inst) => ({ inst, card: CARDS[inst.id] }))
    .sort((a, b) => Number(canUpgradeCard(b.inst.id)) - Number(canUpgradeCard(a.inst.id)));
  const afford = run.gold >= m.cost;
  return [
    el('div', { class: 'modal-title', text: m.title }),
    el('div', {
      class: 'modal-sub',
      text: m.cost > 0 ? `费用 🪙 ${m.cost}（当前 🪙 ${run.gold}）` : '免费',
    }),
    el(
      'div',
      { class: 'card-grid scroll' },
      cards.map(({ inst, card }) => {
        const up = upgradedId(inst.id);
        const ok = !!up && afford;
        return el('div', { class: 'grid-cell' }, [
          cardEl(card, {
            onClick: ok ? () => pickUpgrade(inst.uid) : null,
            disabled: !ok,
            badge: up ? (afford ? '升级 → ' + CARDS[up].name : '金币不足') : '不可升级',
          }),
        ]);
      }),
    ),
    btn('取消', 'ghost', closeModal),
  ];
}

function rewardModal(m) {
  const rewards = m.rewards || {};
  const potion = rewards.potionId ? POTIONS[rewards.potionId] : null;
  const summary = [`${rewards.gold || 0} 金币`];
  if (potion) summary.push(`消耗品「${potion.name}」`);
  const kids = [
    el('div', { class: 'modal-title', text: '🏆 ' + (m.title || '战利品') }),
    el('div', {
      class: 'modal-sub',
      text: `待认领：${summary.join('、')}。选一张卡牌也会一并领取。`,
    }),
    cardGrid(
      m.ids.map((id, i) => ({
        card: CARDS[id],
        badge: `领取并选牌 ${i + 1}`,
        onClick: () => claimBattleReward(id),
      })),
    ),
  ];
  if (m.allowSkip)
    kids.push(btn('领取金币与消耗品（跳过卡牌）', 'ghost', () => claimBattleReward(null)));
  return kids;
}

function buffModal(m) {
  return [
    el('div', { class: 'modal-title', text: '🔮 ' + m.title }),
    el('div', { class: 'modal-sub', text: '符文石只允许你选择一项增益' }),
    el(
      'div',
      { class: 'buff-grid' },
      m.ids.map((id) => {
        const b = BUFFS[id];
        return el(
          'div',
          {
            class: 'buff-card' + (b.bad ? ' bad' : ''),
            onclick: () => chooseBuff(id),
          },
          [
            el('div', { class: 'buff-card-emoji', text: b.emoji }),
            el('div', { class: 'buff-card-name', text: b.name }),
            el('div', { class: 'buff-card-scope', text: buffScopeText(b) }),
            el('div', { class: 'buff-card-desc', text: buffDesc(b) }),
          ],
        );
      }),
    ),
    btn('放弃', 'ghost', closeModal),
  ];
}

function eventModal(m) {
  const e = m.event;
  const kids = [
    el('div', { class: 'modal-title', text: e.emoji + ' ' + e.title }),
    el('div', { class: 'modal-text', text: e.text }),
  ];
  if (m.step === 'choice') {
    kids.push(
      el(
        'div',
        { class: 'opt-list' },
        e.options.map((o, i) => {
          const enabled = !o.canChoose || o.canChoose();
          return el(
            'div',
            {
              class: 'opt' + (enabled ? '' : ' disabled'),
              onclick: enabled ? () => chooseEventOption(i) : null,
              title: enabled ? '' : o.disabledHint || '当前条件不满足',
            },
            [
              el('div', { class: 'opt-label', text: o.label }),
              el('div', {
                class: 'opt-hint',
                text: enabled ? o.hint : o.disabledHint || o.hint + '（条件不满足）',
              }),
            ],
          );
        }),
      ),
    );
    if (m.fromWorld) kids.push(btn('离开事件', 'ghost', closeEvent));
  } else {
    kids.push(el('div', { class: 'event-result', text: m.result }));
    kids.push(btn('继续', 'primary', closeEvent));
  }
  return kids;
}

function shopModal(m) {
  const st = m.stock;
  const discount = (runTotals().shopDiscount || 0) > 0;
  const kids = [
    el('div', { class: 'modal-title', text: '🏪 商店' }),
    el('div', {
      class: 'modal-sub',
      text: `金币 🪙 ${run.gold} · 商人现金 🪙 ${st.funds}` + (discount ? '（幸运硬币 -30%）' : ''),
    }),
    el('div', {
      class: 'modal-note',
      text: '商人的收购额度受现有金币限制；先买入可以增加他的现金。',
    }),
    el('div', { class: 'shop-cols' }, [
      el('div', { class: 'shop-col' }, [
        el('div', { class: 'col-title', text: '出售中' }),
        el(
          'div',
          { class: 'shop-cards' },
          st.cards.map((it, i) =>
            el('div', { class: 'shop-item' + (it.sold ? ' sold' : '') }, [
              cardEl(CARDS[it.id], {
                onClick: it.sold ? null : () => shopBuyCard(i),
                disabled: it.sold || run.gold < it.price,
              }),
              el('div', {
                class: 'price',
                text: it.sold ? '已售出' : '🪙 ' + it.price,
              }),
            ]),
          ),
        ),
        el('div', { class: 'col-title', text: '消耗品' }),
        el(
          'div',
          { class: 'shop-potions' },
          st.potions.map((it, i) =>
            el('div', { class: 'shop-item' + (it.sold ? ' sold' : '') }, [
              potionEl(it.id, {
                onClick: it.sold ? null : () => shopBuyPotion(i),
                disabled: it.sold || run.gold < it.price,
              }),
              el('div', { class: 'price', text: it.sold ? '已售出' : '🪙 ' + it.price }),
            ]),
          ),
        ),
      ]),
      el('div', { class: 'shop-col' }, [
        el('div', { class: 'col-title', text: '我的卡牌（卖出 / 升级）' }),
        el(
          'div',
          { class: 'sell-list' },
          run.deck
            .slice()
            .sort((a, b) => Number(canUpgradeCard(b.id)) - Number(canUpgradeCard(a.id)))
            .map((inst) => {
              const c = CARDS[inst.id];
              const up = upgradedId(inst.id);
              const po = shopPayout(c);
              return el('div', { class: 'sell-row' }, [
                cardMiniRow(c),
                up
                  ? btn('🔨 ' + SHOP_UPGRADE_COST, 'ghost small', () => shopUpgrade(inst.uid))
                  : el('span', { class: 'tag-muted', text: '不可升级' }),
                btn(
                  po.pay > 0 ? '卖 +' + po.pay : '商人没钱',
                  'ghost small' + (po.pay > 0 ? '' : ' disabled'),
                  po.pay > 0 ? () => shopSellCard(inst.uid) : null,
                ),
              ]);
            }),
        ),
      ]),
    ]),
    btn('离开', 'primary', closeShop),
  ];
  return kids;
}

function cardMiniRow(c) {
  return el('div', { class: 'mini-row r-' + c.rarity }, [
    el('span', { class: 'mini-cost', text: c.cost }),
    el('span', { class: 'mini-emoji', text: c.emoji }),
    el('span', { class: 'mini-name', text: c.name }),
    el('span', { class: 'mini-text', text: cardText(c) }),
  ]);
}

function extractModal(m) {
  const kids = [
    el('div', { class: 'modal-title', text: '🌀 撤离确认' }),
    el('div', {
      class: 'modal-sub',
      text: '撤离后，战利品会带回安全区；本次消耗的卡牌不会恢复。',
    }),
  ];
  if (m.bonus)
    kids.push(el('div', { class: 'event-result', text: `撤离奖励：额外 +${m.bonus} 金币` }));
  kids.push(
    el('div', { class: 'bag-preview' }, [
      el('div', {
        class: 'col-title',
        text: `本次战利品 ${run.loot.length + run.secure.length} 张`,
      }),
      el('div', {
        class: 'modal-sub',
        text: `预计带回 ${run.gold + (m.bonus || 0)} 金币 · ${run.potions.length} 份消耗品`,
      }),
      el(
        'div',
        { class: 'loot-row' },
        run.loot.concat(run.secure.map((id) => ({ id, secure: true }))).map((it) =>
          el('span', {
            class: 'loot-chip' + (it.secure ? ' secure' : ''),
            text: CARDS[it.id].emoji + CARDS[it.id].name,
          }),
        ),
      ),
    ]),
  );
  kids.push(
    el('div', { class: 'modal-actions' }, [
      btn('确认撤离', 'primary', doExtract),
      btn('继续探索', 'ghost', closeModal),
    ]),
  );
  return kids;
}

function bagModal() {
  const cap = secureCap();
  return [
    el('div', { class: 'modal-title', text: '🎒 背包与保险箱' }),
    el('div', {
      class: 'modal-sub',
      text: `保险箱 ${run.secure.length}/${cap}：阵亡后仍能保留`,
    }),
    el('div', { class: 'col-title', text: '背包战利品（点击移入保险箱）' }),
    el(
      'div',
      { class: 'loot-row' },
      run.loot.length
        ? run.loot.map((it) =>
            el('span', {
              class: 'loot-chip clickable',
              text: CARDS[it.id].emoji + CARDS[it.id].name,
              onclick: () => secureAdd(it.uid),
            }),
          )
        : el('span', { class: 'empty-hint', text: '背包还是空的' }),
    ),
    el('div', { class: 'col-title', text: '保险箱' }),
    el(
      'div',
      { class: 'loot-row' },
      run.secure.length
        ? run.secure.map((id) =>
            el('span', { class: 'loot-chip secure', text: CARDS[id].emoji + CARDS[id].name }),
          )
        : el('span', { class: 'empty-hint', text: '空' }),
    ),
    btn('关闭', 'primary', closeModal),
  ];
}

function helpModal() {
  return [
    el('div', { class: 'modal-title', text: '📖 玩法说明' }),
    el('div', { class: 'help-body' }, [
      el('p', {
        text: '1. 点击相邻格移动并进入地点场景。敌人格进入后立即开战；其他地点要在场景中选择操作才会结算。',
      }),
      el('p', {
        text: '2. 未处理场景可以离开后再回来；已处理地点重走只会移动，不会重复发放奖励。危险区域要选择穿过后才会受伤。',
      }),
      el('p', { text: '3. 每回合抽 5 张牌并获得 3 点能量；护甲会在你的下回合开始时清空。' }),
      el('p', {
        text: '4. 所有卡牌都要先点选。单体牌再点击敌人立即打出；无需目标的牌再次点击所选牌、点战场空白或按“打出 / 使用所选”。',
      }),
      el('p', {
        text: '5. 选目标会预览预计效果；出牌前不扣能量。可点击取消、按 Esc 或右键取消，也可用方向键切换目标。',
      }),
      el('p', {
        text: '6. 手牌变暗时查看提示，可看到能量不足等原因。手牌右侧按钮用于取消选目标或结束回合。',
      }),
      el('p', {
        text: '7. 抽牌堆、弃牌堆和消耗堆可点击查看；已消耗的卡牌在战斗结束后会从卡组移除。',
      }),
      el('p', { text: '8. 营地可恢复生命或免费升级一张牌；商店也能购买、出售和升级卡牌。' }),
      el('p', {
        text: '9. 阵亡会丢失背包中的战利品；放进保险箱的物品可以保留。消耗卡牌不会恢复。',
      }),
      el('p', {
        text: '10. 已探索地图会保存；每片区域都有撤离法阵。越远离世界中心，危险度越高。下次出发可选择使用过的撤离点。',
      }),
      el('p', {
        text: '11. 召唤物会跟随本次行动并在每回合攻击，生命值跨战斗保留；敌人攻击优先随机命中召唤物，溢出的伤害会继续传递。',
      }),
      el('p', { text: '12. 到达 🌀 撤离法阵后，可确认撤离并把战利品带回安全区。' }),
      el('p', {
        text: '13. 快捷键：数字键选牌、空格/回车确认、←→ 切目标、Esc/右键取消、N 结束回合。',
      }),
    ]),
    btn('知道了', 'primary', closeModal),
  ];
}

/* ===================== 提示条 ===================== */
function toastView() {
  if (!ui.toast) return null;
  return el('div', { class: 'toast', text: ui.toast.text, role: 'status', 'aria-live': 'polite' });
}
