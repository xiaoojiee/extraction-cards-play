'use strict';

/* 安全区界面：仓库 / 出击准备 / 商店 / 排行榜，以及撤离结算界面 */

/* global ui, run:writable, meta, el, btn, bar, cardEl, cardMini, cardMiniRow, potionEl, buffEl,
   logPanel, topBar, CARDS, POTIONS, RARITY, STATUS, deckMax, potionSlots, stashList,
   autoLoadout, ensureStarter, safeShopRefresh, safeShopBuyCard,
   safeShopBuyPotion, metaSellCard, metaSellPotion, buySecureSlot, buyDeckSlot, loadRank,
   rankState, startRun, refreshSafeShop, refreshUnlocks, cardText, cardSellPrice,
   DECK_MIN, SECURE_COST, DECK_SLOT_COST, REFRESH_COST, SMITH_COST, refresh, toast,
   upgradedId, metaUpgradeCard, sortBar, sortCardIds, shopFunds, metaPayout,
   toggleLoadout, prepareSafeZone, openSettings, SECURE_UPGRADE_MAX, DECK_UPGRADE_MAX,
   worldExtracts, worldDangerAt, WORLD_BIOMES */

const TABS = [
  { key: 'zones', label: '🌍 大世界' },
  { key: 'stash', label: '📦 仓库' },
  { key: 'shop', label: '🏪 商店' },
  { key: 'rank', label: '🏆 排行榜' },
];

function safeView() {
  return el('div', { class: 'screen safe-screen' }, [
    topBar({
      right: el('div', { class: 'toolbar-actions' }, [
        btn('📖 帮助', 'ghost', openHelp),
        btn('⚙ 设置与存档', 'ghost', openSettings),
      ]),
    }),
    el(
      'div',
      { class: 'safe-tabs' },
      TABS.map((t) =>
        el('div', {
          class: 'tab' + (ui.safeTab === t.key ? ' active' : ''),
          text: t.label,
          onclick: () => {
            ui.safeTab = t.key;
            if (t.key === 'rank') loadRank();
            refresh();
          },
        }),
      ),
    ),
    el('div', { class: 'safe-body' }, safeBody()),
  ]);
}

function openHelp() {
  ui.modal = { kind: 'help' };
  refresh();
}

function safeBody() {
  if (ui.safeTab === 'zones') return zonesTab();
  if (ui.safeTab === 'stash') return stashTab();
  if (ui.safeTab === 'shop') return shopTab();
  if (ui.safeTab === 'rank') return rankTab();
  return el('div');
}

/* 根据牌名排序显示时仍保留每一张重复卡自己的仓库下标。 */
function sortedStashEntries() {
  const nextIndex = Object.create(null);
  return sortCardIds(meta.stash)
    .map((id) => {
      const index = meta.stash.indexOf(id, nextIndex[id] || 0);
      nextIndex[id] = index + 1;
      return { id, index, card: CARDS[id] };
    })
    .filter((entry) => entry.index >= 0 && entry.card);
}

/* ===================== 出击 ===================== */
function zonesTab() {
  const load = ui.loadout || [];
  const byIndex = {};
  for (let i = 0; i < meta.stash.length; i++) {
    byIndex[i] = { id: meta.stash[i], i, card: CARDS[meta.stash[i]] };
  }

  const selected = el(
    'div',
    { class: 'loadout-chips' },
    load.map((idx) => {
      const e = byIndex[idx];
      if (!e) return null;
      return cardMini(e.card, {
        class: 'loadout-mini',
        onClick: () => toggleLoadout(idx),
      });
    }),
  );

  const available = el(
    'div',
    { class: 'card-grid scroll' },
    sortedStashEntries()
      .filter((e) => !e.card.junk)
      .map((e) =>
        el('div', { class: 'grid-cell' }, [
          cardEl(e.card, {
            onClick: () => toggleLoadout(e.index),
            disabled: load.length >= deckMax() && !load.includes(e.index),
            selected: load.includes(e.index),
            badge: load.includes(e.index) ? '已携带 · 点击移除' : '点击加入',
          }),
        ]),
      ),
  );

  const canStart = load.length >= DECK_MIN;
  const startLabel =
    load.length < DECK_MIN ? `还差 ${DECK_MIN - load.length} 张卡` : '🌍 进入大世界';
  return el('div', { class: 'zones-layout' }, [
    el('div', { class: 'zones-left' }, [
      el('div', { class: 'col-title', text: '无尽大世界' }),
      el('div', { class: 'zone-selected-summary' }, [
        el('strong', { text: '🌍 世界会随着探索持续延伸' }),
        el('span', {
          text: '已探索的地图会保存。每片区域都有固定撤离点；离世界中心越远，敌人越强。',
        }),
      ]),
      el('div', {
        class: 'hint-text',
        text: '完成配装后选择出生点。成功使用过的撤离点会成为下次出发位置。',
      }),
    ]),
    el('div', { class: 'zones-right' }, [
      el('div', { class: 'loadout-dock' }, [
        el('div', { class: 'loadout-dock-head' }, [
          el('div', {
            class: 'col-title',
            text: `携带卡组 ${load.length} / ${deckMax()} · 至少 ${DECK_MIN} 张`,
          }),
          el('div', { class: 'loadout-dock-actions' }, [
            btn('自动配装', 'ghost small', () => {
              ui.loadout = autoLoadout();
              refresh();
            }),
            btn('清空', 'ghost small', () => {
              ui.loadout = [];
              refresh();
            }),
            btn('🧪 消耗品 ' + meta.potions.length, 'ghost small', () => {
              toast('消耗品会按腰带容量自动带入（' + potionSlots() + ' 格）');
            }),
            btn(startLabel, canStart ? 'primary big' : 'ghost big', () => {
              if (canStart) openSpawnChoice();
            }),
          ]),
        ]),
        load.length
          ? selected
          : el('div', { class: 'empty-hint', text: '还没选择卡牌。点击下方仓库卡牌即可配装。' }),
        !canStart && load.length < DECK_MIN
          ? el('div', {
              class: 'loadout-warning',
              text: `还需要选择 ${DECK_MIN - load.length} 张卡才能出发。`,
            })
          : null,
      ]),
      el('div', { class: 'col-title', text: '仓库 · 点击卡牌加入携带卡组' }),
      sortBar(),
      available,
    ]),
  ]);
}

/* 点击进入大世界后先选出生点；确认前不扣金币或消耗品。 */
function openSpawnChoice() {
  if (run || ui.screen !== 'safe' || (ui.loadout || []).length < DECK_MIN) return;
  const exits = worldExtracts(meta.worldMap);
  if (!exits.some((point) => `${point.c},${point.r}` === ui.worldSpawnChoice)) {
    ui.worldSpawnChoice = 'origin';
  }
  ui.screen = 'spawn';
  refresh();
}

function confirmSpawnChoice() {
  if (run || ui.screen !== 'spawn') return;
  const exits = worldExtracts(meta.worldMap);
  const selected = exits.find((point) => `${point.c},${point.r}` === ui.worldSpawnChoice);
  if (ui.worldSpawnChoice !== 'origin' && !selected) {
    ui.worldSpawnChoice = 'origin';
    toast('该撤离点已不可用，请重新选择出生点');
    refresh();
    return;
  }
  const picks = (ui.loadout || []).map((index) => ({ id: meta.stash[index], stashIndex: index }));
  if (!startRun('world', picks, selected || null)) {
    ui.screen = 'safe';
    refresh();
    return;
  }
  refreshSafeShop(false);
  ui.loadout = null;
  refresh();
}

function spawnView() {
  const exits = worldExtracts(meta.worldMap);
  const selected = exits.find((point) => `${point.c},${point.r}` === ui.worldSpawnChoice);
  const chosen = selected || null;
  const entries = [
    {
      key: 'origin',
      title: '🏕 世界中心',
      location: '坐标 (0, 0)',
      environment: '初始营地',
      danger: 0,
    },
    ...exits.map((point) => ({
      key: `${point.c},${point.r}`,
      title: '🌀 已使用的撤离点',
      location: `坐标 (${point.c}, ${point.r})`,
      environment: (WORLD_BIOMES[point.environment] || {}).name || '野外',
      danger: worldDangerAt(point.c, point.r),
    })),
  ];
  const selectedEntry = entries.find((entry) => entry.key === ui.worldSpawnChoice) || entries[0];
  const load = ui.loadout || [];
  return el('div', { class: 'screen spawn-screen' }, [
    topBar(),
    el('div', { class: 'spawn-stage-head' }, [
      el('div', { class: 'col-title', text: '选择出生点' }),
      el('div', {
        class: 'hint-text',
        text: '已使用过的撤离点可作为新行动的起点。选择后确认出发。',
      }),
    ]),
    el('div', { class: 'spawn-stage-body' }, [
      el('div', { class: 'spawn-stage-list' }, [
        el('div', { class: 'spawn-list-title', text: `可用位置 ${entries.length} 处` }),
        el(
          'div',
          { class: 'spawn-stage-options' },
          entries.map((entry) =>
            el(
              'button',
              {
                class: 'spawn-stage-option' + (entry.key === selectedEntry.key ? ' active' : ''),
                type: 'button',
                'aria-pressed': entry.key === selectedEntry.key ? 'true' : 'false',
                onclick: () => {
                  ui.worldSpawnChoice = entry.key;
                  refresh();
                },
              },
              [
                el('strong', { text: entry.title }),
                el('span', { text: `${entry.location} · ${entry.environment}` }),
                el('span', { class: 'spawn-danger', text: `⚠️ 初始危险度 ${entry.danger}` }),
              ],
            ),
          ),
        ),
        !exits.length
          ? el('div', {
              class: 'spawn-stage-hint',
              text: '目前还没有使用过的撤离点。从世界中心出发，成功撤离后即可解锁对应位置。',
            })
          : null,
      ]),
      el('div', { class: 'spawn-stage-detail' }, [
        el('div', { class: 'col-title', text: '本次出发' }),
        el('div', { class: 'spawn-stage-location', text: selectedEntry.title }),
        el('div', { class: 'spawn-stage-location-sub', text: selectedEntry.location }),
        el('div', { class: 'spawn-stage-stats' }, [
          el('div', { text: `🌿 环境：${selectedEntry.environment}` }),
          el('div', { text: `⚠️ 初始危险度：${selectedEntry.danger}` }),
          el('div', { text: `🃏 携带卡牌：${load.length} 张` }),
          el('div', { text: `❤️ 初始生命：${meta.maxHp}` }),
          el('div', { text: `🧪 携带消耗品：${Math.min(potionSlots(), meta.potions.length)} 件` }),
        ]),
        el('div', {
          class: 'hint-text',
          text: chosen
            ? '从该撤离点进入后，可以继续探索或再次选择撤离。'
            : '从世界中心进入，向周围探索新的地块。',
        }),
      ]),
    ]),
    el('div', { class: 'spawn-stage-actions' }, [
      btn('← 返回配装', 'ghost', () => {
        ui.screen = 'safe';
        refresh();
      }),
      btn('从此处出发 →', 'primary big', confirmSpawnChoice, {
        disabled: load.length < DECK_MIN,
      }),
    ]),
  ]);
}

/* ===================== 仓库 ===================== */
/* ===================== 仓库（纯查看/整理） ===================== */
function stashTab() {
  const ids = sortCardIds(meta.stash);
  const cards = ids.map((id) => ({ id, card: CARDS[id] }));
  const potions = meta.potions.map((id, i) => ({ id, i }));
  return el('div', { class: 'stash-layout' }, [
    el('div', { class: 'stash-main' }, [
      el('div', { class: 'col-title', text: `卡牌 ${cards.length} 张` }),
      sortBar(),
      el(
        'div',
        { class: 'card-grid scroll' },
        cards.map((e) =>
          el('div', { class: 'grid-cell' }, [
            cardEl(e.card),
            el('div', { class: 'grid-foot', text: '卖价 🪙' + cardSellPrice(e.card) }),
          ]),
        ),
      ),
    ]),
    el('div', { class: 'stash-side' }, [
      el('div', { class: 'col-title', text: `消耗品 ${potions.length} 瓶` }),
      el(
        'div',
        { class: 'potion-row' },
        potions.length
          ? potions.map((p) => potionEl(p.id))
          : [el('div', { class: 'empty-hint', text: '无' })],
      ),
      el('div', {
        class: 'hint-text',
        text: '仓库只用来查看与整理。要卖卡/卖消耗品，请去「🏪 商店」找商人。',
      }),
      el('div', { class: 'col-title', text: '统计' }),
      el('div', { class: 'stat-list' }, [
        el('div', { class: 'kv', text: `行动次数 ${meta.stats.raids}` }),
        el('div', { class: 'kv', text: `撤离 ${meta.stats.extracts} 次` }),
        el('div', { class: 'kv', text: `阵亡 ${meta.stats.deaths}` }),
        el('div', { class: 'kv', text: `击杀 ${meta.stats.kills}` }),
        el('div', { class: 'kv', text: `最远深度 ${meta.stats.bestDepth}` }),
      ]),
    ]),
  ]);
}

/* ===================== 商店 ===================== */
function shopTab() {
  const shop = meta.safeShop;
  const funds = shopFunds();
  const sellList = sortedStashEntries().filter((e) => e.index >= 0);
  return el('div', { class: 'shop-layout' }, [
    el('div', { class: 'shop-main' }, [
      el('div', {
        class: 'col-title',
        text: `出售中（金币 🪙 ${meta.gold} · 商人现金 🪙 ${funds}）`,
      }),
      el('div', {
        class: 'modal-note',
        text: '卖出只能拿到商人手上的现金，现金不足时他只能出更少的价。',
      }),
      el(
        'div',
        { class: 'card-grid' },
        shop.cards.map((it, i) =>
          el('div', { class: 'grid-cell' + (it.sold ? ' sold' : '') }, [
            cardEl(CARDS[it.id], {
              onClick: it.sold ? null : () => safeShopBuyCard(i),
              disabled: it.sold || meta.gold < it.price,
            }),
            el('div', { class: 'grid-foot', text: it.sold ? '已售出' : '🪙 ' + it.price }),
          ]),
        ),
      ),
      el('div', { class: 'col-title', text: '消耗品' }),
      el(
        'div',
        { class: 'potion-row' },
        shop.potions.map((it, i) =>
          el('div', { class: 'shop-potion' + (it.sold ? ' sold' : '') }, [
            potionEl(it.id, {
              onClick: it.sold ? null : () => safeShopBuyPotion(i),
              disabled: it.sold || meta.gold < it.price,
            }),
            el('div', { class: 'grid-foot', text: it.sold ? '已售出' : '🪙 ' + it.price }),
          ]),
        ),
      ),
      btn('刷新货架（🪙 ' + REFRESH_COST + '）', 'ghost', safeShopRefresh),
    ]),
    el('div', { class: 'shop-side' }, [
      el('div', { class: 'col-title', text: `消耗品（点一下卖 🪙40% 价）` }),
      el(
        'div',
        { class: 'potion-row' },
        meta.potions.length
          ? meta.potions.map((id, i) =>
              potionEl(id, { onClick: () => metaSellPotion(i), class: 'sellable' }),
            )
          : [el('div', { class: 'empty-hint', text: '无' })],
      ),
      el('div', { class: 'col-title', text: '卖卡（只能卖仓库里的，非消耗品）' }),
      el(
        'div',
        { class: 'sell-list' },
        sellList.length
          ? sellList.map((e) => {
              const po = metaPayout(CARDS[e.id]);
              return el('div', { class: 'sell-row' }, [
                cardMiniRow(CARDS[e.id]),
                btn(
                  po.pay > 0 ? '卖 +' + po.pay : '商人没钱',
                  'ghost small' + (po.pay > 0 ? '' : ' disabled'),
                  po.pay > 0 ? () => metaSellCard(e.index, e.id) : null,
                ),
              ]);
            })
          : [el('div', { class: 'empty-hint', text: '仓库里没有卡牌' })],
      ),
      el('div', { class: 'col-title', text: `🔨 铁匠铺（升级一张牌 🪙 ${SMITH_COST}）` }),
      el(
        'div',
        { class: 'sell-list' },
        (function () {
          const rows = [];
          for (let i = 0; i < meta.stash.length; i++) {
            if (!upgradedId(meta.stash[i])) continue;
            rows.push(
              el('div', { class: 'sell-row' }, [
                cardMiniRow(CARDS[meta.stash[i]]),
                btn('升级', 'ghost small', () => metaUpgradeCard(i, meta.stash[i])),
              ]),
            );
          }
          return rows.length ? rows : [el('div', { class: 'empty-hint', text: '没有可升级的牌' })];
        })(),
      ),
      el('div', { class: 'col-title', text: '永久升级' }),
      el('div', { class: 'upgrade-list' }, [
        upgradeRow(
          '🔒 保险箱扩容',
          `${meta.secureSlots} / ${SECURE_UPGRADE_MAX}（阵亡后保留更多战利品）`,
          SECURE_COST,
          meta.secureSlots >= SECURE_UPGRADE_MAX,
          buySecureSlot,
        ),
        upgradeRow(
          '🃏 卡组容量',
          `+${meta.upgrades.deckMax || 0} / ${DECK_UPGRADE_MAX}（出发可多带牌）`,
          DECK_SLOT_COST,
          meta.upgrades.deckMax >= DECK_UPGRADE_MAX,
          buyDeckSlot,
        ),
      ]),
      el('div', { class: 'col-title', text: '说明' }),
      el('div', {
        class: 'hint-text',
        text: '每次出发都会自动刷新货架与商人现金。升级项永久生效并存档。',
      }),
      el('div', {
        class: 'hint-text',
        text: '所有行动区域均可出发；排行榜登录仅影响榜单显示。',
      }),
    ]),
  ]);
}

function upgradeRow(name, desc, cost, maxed, fn) {
  return el('div', { class: 'upgrade-row' }, [
    el('div', {}, [
      el('div', { class: 'up-name', text: name }),
      el('div', { class: 'up-desc', text: desc }),
    ]),
    btn(maxed ? '已满级' : '🪙 ' + cost, maxed ? 'ghost' : 'primary', fn, {
      disabled: maxed || meta.gold < cost,
    }),
  ]);
}

/* ===================== 排行榜 ===================== */
function rankTab() {
  if (rankState.loading) return el('div', { class: 'empty-hint', text: '加载中…' });
  if (!rankState.list) {
    return el('div', { class: 'rank-wrap' }, [
      el('div', { class: 'empty-hint', text: rankState.error || '暂无数据' }),
      btn('重新加载', 'ghost', loadRank),
    ]);
  }
  return el('div', { class: 'rank-wrap' }, [
    el('div', { class: 'col-title', text: '🏆 排行榜' }),
    el(
      'div',
      { class: 'rank-list' },
      rankState.list.map((it) =>
        el('div', { class: 'rank-row' }, [
          el('span', { class: 'rank-no', text: '#' + it.rank }),
          el('span', { class: 'rank-name', text: it.nickname || '匿名' }),
          el('span', { class: 'rank-score', text: '🪙 ' + it.score }),
        ]),
      ),
    ),
    rankState.my
      ? el('div', {
          class: 'hint-text',
          text: rankState.my.ranked
            ? `我的排名：#${rankState.my.rank}（🪙 ${rankState.my.score}）`
            : '我还没有上榜',
        })
      : null,
    btn('刷新', 'ghost', loadRank),
  ]);
}

/* ===================== 结算 ===================== */
function resultView() {
  const r = run.result || {
    extracted: false,
    gainedCards: [],
    lostCards: [],
    lostStash: [],
    gold: 0,
    depth: 0,
    steps: 0,
    kills: 0,
    pots: [],
    lostPotions: [],
  };
  const ok = r.extracted;
  return el('div', { class: 'screen result-screen' }, [
    el('div', { class: 'result-head ' + (ok ? 'good' : 'bad') }, [
      el('div', { class: 'result-emoji', text: ok ? '🌀' : '💀' }),
      el('div', { class: 'result-title', text: ok ? '成功撤离' : '行动失败' }),
      el('div', {
        class: 'result-sub',
        text: ok
          ? `战利品已带回安全区 · 危险度 ${r.depth} · 行进 ${r.steps} 步`
          : `本次战利品遗失 · ${r.reason || '你在行动中阵亡'}`,
      }),
    ]),
    el('div', { class: 'result-stats' }, [
      statCard('🪙 带回金币', ok ? r.gold : 0),
      statCard('⚠️ 危险度', r.depth),
      statCard('⌖ 行进步数', r.steps),
      statCard('⚔️ 击败敌人', r.kills),
      statCard('🃏 带出卡牌', r.gainedCards.length),
      statCard(ok ? '🧪 带回消耗品' : '🧪 遗失消耗品', (ok ? r.pots : r.lostPotions).length),
    ]),
    el('div', { class: 'result-cols' }, [
      el('div', { class: 'result-col' }, [
        el('div', { class: 'col-title', text: ok ? '带回的战利品' : '保险箱保住' }),
        el(
          'div',
          { class: 'loot-row' },
          r.gainedCards.length
            ? r.gainedCards.map((id) =>
                el('span', { class: 'loot-chip good', text: CARDS[id].emoji + CARDS[id].name }),
              )
            : [
                el('span', {
                  class: 'empty-hint',
                  text: ok ? '本次没有带回卡牌' : '保险箱为空',
                }),
              ],
        ),
      ]),
      (ok ? r.pots : r.lostPotions).length
        ? el('div', { class: 'result-col' }, [
            el('div', { class: 'col-title', text: ok ? '带回的消耗品' : '遗失的消耗品' }),
            el(
              'div',
              { class: 'loot-row' },
              (ok ? r.pots : r.lostPotions).map((id) =>
                el('span', {
                  class: 'loot-chip' + (ok ? ' good' : ' bad'),
                  text: POTIONS[id].emoji + POTIONS[id].name,
                }),
              ),
            ),
          ])
        : null,
      el('div', { class: 'result-col' }, [
        el('div', { class: 'col-title', text: ok ? '本次消耗' : '遗失物品' }),
        el(
          'div',
          { class: 'loot-row' },
          r.lostCards.length + r.lostStash.length
            ? r.lostCards
                .concat(r.lostStash)
                .map((id) =>
                  el('span', { class: 'loot-chip bad', text: CARDS[id].emoji + CARDS[id].name }),
                )
            : [el('span', { class: 'empty-hint', text: ok ? '没有遗失卡牌' : '没有额外遗失卡牌' })],
        ),
      ]),
    ]),
    el('div', { class: 'result-actions' }, [
      btn('返回安全区', 'primary big', () => {
        run = null;
        ui.screen = 'safe';
        ui.safeTab = 'zones';
        ui.loadout = autoLoadout();
        ui.modal = null;
        prepareSafeZone();
        refresh();
      }),
    ]),
  ]);
}

function statCard(label, value) {
  return el('div', { class: 'stat-card' }, [
    el('div', { class: 'stat-label', text: label }),
    el('div', { class: 'stat-value', text: String(value) }),
  ]);
}
