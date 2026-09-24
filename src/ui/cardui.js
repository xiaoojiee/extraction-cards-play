'use strict';

/* 卡牌 / 消耗品 / buff 的 DOM 组件 */

/* global el, ui, CARDS, POTIONS, RARITY, STATUS, CARD_TYPE_NAME, cardText, potionText, buffDesc,
   buffScopeText, cardSellPrice, refresh */

const TYPE_CLASS = { attack: 't-attack', skill: 't-skill', power: 't-power' };

function cardEl(card, opts) {
  opts = opts || {};
  const cls = [
    'card',
    'r-' + card.rarity,
    TYPE_CLASS[card.type] || 't-skill',
    opts.class || '',
    card.upgraded ? 'upgraded' : '',
    opts.disabled ? 'disabled' : '',
    opts.selected ? 'selected' : '',
    opts.playable ? 'playable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const head = [el('div', { class: 'card-cost', text: card.cost })];
  if (card.exhaust)
    head.push(
      el('div', { class: 'card-exhaust', title: '一次性：打出后从本局卡组移除', text: '消耗' }),
    );
  if (card.type === 'power') head.push(el('div', { class: 'card-power', text: '能力' }));
  if (card.upgraded) head.push(el('div', { class: 'card-up', text: '升级' }));

  const node = el(
    'div',
    {
      class: cls,
      id: opts.id,
      title: opts.title || card.quote || card.name + '：' + cardText(card),
      onclick: opts.onClick
        ? function () {
            opts.onClick(card, node);
          }
        : null,
    },
    [
      el('div', { class: 'card-head' }, head),
      el('div', { class: 'card-emoji', text: card.emoji }),
      el('div', { class: 'card-name', text: card.name }),
      el('div', { class: 'card-text', html: cardTextHtml(card) }),
      card.quote ? el('div', { class: 'card-quote', text: '“' + card.quote + '”' }) : null,
      el('div', {
        class: 'card-foot',
        text:
          (card.tags && card.tags.length ? card.tags.join(' · ') + ' · ' : '') +
          (CARD_TYPE_NAME[card.type] || '') +
          ' · ' +
          RARITY[card.rarity].name,
      }),
    ],
  );
  if (opts.badge) node.appendChild(el('div', { class: 'card-badge', text: opts.badge }));
  if (opts.style) {
    for (const k in opts.style) {
      if (k.slice(0, 2) === '--') node.style.setProperty(k, opts.style[k]);
      else node.style[k] = opts.style[k];
    }
  }
  return node;
}

/* 小卡（仓库/列表用） */
function cardMini(card, opts) {
  opts = opts || {};
  return el(
    'div',
    {
      class:
        'mini r-' +
        card.rarity +
        ' ' +
        (TYPE_CLASS[card.type] || '') +
        ' ' +
        (opts.class || '') +
        (card.upgraded ? ' upgraded' : '') +
        (opts.disabled ? ' disabled' : ''),
      title: card.name + '：' + cardText(card),
      onclick: opts.onClick
        ? function () {
            opts.onClick(card);
          }
        : null,
    },
    [
      el('span', { class: 'mini-cost', text: card.cost }),
      el('span', { class: 'mini-emoji', text: card.emoji }),
      el('span', { class: 'mini-name', text: card.name }),
    ],
  );
}

function potionEl(id, opts) {
  opts = opts || {};
  const p = POTIONS[id];
  if (!p) return null;
  return el(
    'div',
    {
      class:
        'potion' +
        (opts.class ? ' ' + opts.class : '') +
        (opts.disabled ? ' disabled' : '') +
        (opts.selected ? ' selected' : ''),
      title: p.name + '：' + potionText(p),
      onclick: opts.onClick
        ? function () {
            opts.onClick(p, id);
          }
        : null,
    },
    [
      el('div', { class: 'potion-emoji', text: p.emoji }),
      el('div', { class: 'potion-name', text: p.name }),
    ],
  );
}

function buffEl(b, opts) {
  opts = opts || {};
  return el('div', { class: 'buff' + (b.bad ? ' bad' : ''), title: b.name + '：' + buffDesc(b) }, [
    el('span', { class: 'buff-emoji', text: b.emoji }),
    el('span', { class: 'buff-name', text: b.name }),
    opts.showScope
      ? el('span', { class: 'buff-scope', text: buffScopeText(b) })
      : el('span', { class: 'buff-scope', text: buffDesc(b) }),
  ]);
}

/* 卡牌网格（仓库 / 商店 / 奖励） */
function cardGrid(list, opts) {
  opts = opts || {};
  const grid = el('div', { class: 'card-grid ' + (opts.class || '') });
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    const card = it.card || it;
    const extra = {};
    if (it.onClick) extra.onClick = it.onClick;
    if (it.disabled) extra.disabled = true;
    if (it.badge) extra.badge = it.badge;
    if (it.selected) extra.selected = true;
    const wrapper = el('div', { class: 'grid-cell' }, [cardEl(card, extra)]);
    if (it.foot) wrapper.appendChild(el('div', { class: 'grid-foot', text: it.foot }));
    grid.appendChild(wrapper);
  }
  if (!list.length) grid.appendChild(el('div', { class: 'empty-hint', text: '空空如也' }));
  return grid;
}

/* ===================== 关键词高亮 ===================== */
const CARD_KEYWORDS = [
  '消耗',
  '能力',
  '护甲',
  '力量',
  '敏捷',
  '易伤',
  '虚弱',
  '中毒',
  '灼烧',
  '再生',
  '荆棘',
  '眩晕',
  '能量',
  '生命',
  '金币',
  '卡牌',
  '弃牌堆',
  '抽牌堆',
  '手牌',
];
/* 从 cardText() 生成带高亮的 HTML：数字加粗、关键词变色 */
function cardTextHtml(card) {
  let s = cardText(card);
  s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  s = s.replace(/(\d+)/g, '<b class="num">$1</b>');
  s = s.replace(new RegExp('(' + CARD_KEYWORDS.join('|') + ')', 'g'), '<i class="kw">$1</i>');
  return s;
}

/* ===================== 排序 ===================== */
const SORT_KEYS = [
  { key: 'cost', label: '费用' },
  { key: 'type', label: '类型' },
  { key: 'rarity', label: '稀有度' },
];
const RARITY_ORDER = { epic: 0, rare: 1, common: 2, basic: 3, junk: 4 };
const TYPE_ORDER = { attack: 0, skill: 1, power: 2 };

function sortState() {
  if (!ui.sort) ui.sort = { key: 'cost', dir: 1 };
  return ui.sort;
}

/* 排序控件（仓库 / 卡组 / 牌堆查看共用） */
function sortBar() {
  const s = sortState();
  return el(
    'div',
    { class: 'sort-bar' },
    [el('span', { class: 'sort-label', text: '排序' })].concat(
      SORT_KEYS.map((k) =>
        el('span', {
          class: 'sort-btn' + (s.key === k.key ? ' active' : ''),
          text: k.label + (s.key === k.key ? (s.dir > 0 ? ' ↑' : ' ↓') : ''),
          onclick: () => {
            if (s.key === k.key) s.dir *= -1;
            else {
              s.key = k.key;
              s.dir = 1;
            }
            refresh();
          },
        }),
      ),
    ),
  );
}

function sortCardIds(ids) {
  const s = sortState();
  const arr = ids.slice();
  arr.sort((a, b) => {
    const ca = CARDS[a];
    const cb = CARDS[b];
    if (!ca || !cb) return 0;
    let d;
    if (s.key === 'type') d = TYPE_ORDER[ca.type] - TYPE_ORDER[cb.type] || ca.cost - cb.cost;
    else if (s.key === 'rarity')
      d = RARITY_ORDER[ca.rarity] - RARITY_ORDER[cb.rarity] || ca.cost - cb.cost;
    else d = ca.cost - cb.cost || RARITY_ORDER[ca.rarity] - RARITY_ORDER[cb.rarity];
    return d * (s.dir || 1);
  });
  return arr;
}

function goldText(n) {
  return el('span', { class: 'gold', text: '🪙 ' + n });
}
