'use strict';

/* 危险区地图界面：走格子 / 迷雾 / 战利品 / 日志 */

/* global ui, run, meta, el, btn, bar, topBar, logPanel, cardEl, potionEl, buffEl, goldText,
   CARDS, POTIONS, TILE, TILE_ACTION, ENEMIES, BUFFS, EVENTS, RARITY, canMoveTo, walkTo, tileAt,
   currentSceneTile, performSceneAction, secureCap, runTotals, POTION_SLOTS, buffDesc, buffScopeText, cardSellPrice,
   refresh, openPileView, flushBattleFx */

function deckIds() {
  const out = [];
  for (let i = 0; i < run.deck.length; i++) out.push(run.deck[i].id);
  return out;
}

function mapView() {
  const map = run.map;
  const grid = el('div', { class: 'map-grid' });
  grid.style.gridTemplateColumns = `repeat(${map.cols}, var(--tile-size))`;

  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      grid.appendChild(tileCell(tileAt(map, c, r)));
    }
  }

  const cur = tileAt(map, run.pos.c, run.pos.r);
  const curEvent = cur && cur.type === 'event' && cur.sceneData ? EVENTS[cur.sceneData.eventId] : null;
  return el('div', { class: 'screen map-screen' }, [
    topBar(),
    el('div', { class: 'map-main' }, [
      mapSidePanel(),
      el('div', { class: 'map-center' }, [
        el('div', { class: 'map-head' }, [
          el('div', { class: 'map-head-title', text: `${run.zone.emoji} ${run.zone.name}` }),
          el('div', {
            class: 'map-head-sub',
            text: `危险度 ${run.danger} · 已探索 ${countVisited()}/${map.cols * map.rows} · 已击败 ${run.kills}`,
          }),
          el('div', {
            class: 'map-head-current',
            text: cur
              ? `当前位置：${curEvent ? curEvent.title : TILE[cur.type].name} · ${cur.cleared ? '已处理' : cur.spawned ? '待处理' : '已发现'} · 战利品 ${run.loot.length + run.secure.length} · 金币 ${run.gold}`
              : '查看周边地点',
          }),
        ]),
        grid,
        tileActionBar(cur),
      ]),
      mapRightPanel(),
    ]),
  ]);
}

function sceneView() {
  const t = currentSceneTile();
  if (!t) return mapView();
  const info = TILE[t.type];
  const data = t.sceneData || {};
  const spec = TILE_ACTION[t.type] || { label: '处理地点', hint: '选择操作' };
  const event = t.type === 'event' && data.eventId ? EVENTS[data.eventId] : null;
  const rows = [];
  let detail = spec.hint;
  if (t.type === 'empty') detail = '石块间藏着一些遗物，值得仔细翻找。';
  if (t.type === 'loot') {
    detail = `箱中可见 ${data.cards.map((id) => CARDS[id].name).join('、')}，以及 ${data.gold} 金币。`;
  }
  if (t.type === 'potion') detail = `药剂箱中有「${POTIONS[data.potionId].name}」。`;
  if (t.type === 'buff') detail = '符文石浮现出三种力量，你可以选择一种带走，也可以放弃。';
  if (t.type === 'event') {
    detail = event.text;
  }
  if (t.type === 'hazard') detail = `腐化液封住了前路。穿过会损失 ${data.damage} 点生命，也可以暂时离开。`;
  if (t.type === 'shop') detail = '旅商摆出了卡牌与药剂，也愿意收购或升级你的卡牌。';
  if (t.type === 'fire') detail = `火堆尚未熄灭。你当前生命 ${run.hp}/${run.maxHp}，可休息或升级一张卡。`;
  if (t.type === 'extract') detail = '撤离法阵已经稳定。你可以带着当前战利品返回安全区，或继续探索。';
  if (data.result) detail = data.result;

  if (t.cleared) {
    rows.push(btn('返回地图', 'primary big', () => performSceneAction('leave')));
  } else if (t.type === 'empty') {
    rows.push(btn('翻找遗迹', 'primary big', () => performSceneAction('search')));
  } else if (t.type === 'loot') {
    rows.push(btn('收集物资', 'primary big', () => performSceneAction('collect')));
  } else if (t.type === 'potion') {
    rows.push(btn('拿取药剂', 'primary big', () => performSceneAction('take-potion')));
  } else if (t.type === 'buff') {
    data.buffIds.forEach((id) => {
      const b = BUFFS[id];
      rows.push(el('button', {
        class: 'scene-option',
        onclick: () => performSceneAction('take-buff:' + id),
      }, [
        el('span', { class: 'scene-option-icon', text: b.emoji }),
        el('span', { class: 'scene-option-copy' }, [
          el('strong', { text: b.name }),
          el('small', { text: buffDesc(b) }),
        ]),
        el('span', { class: 'scene-option-mark', text: '选择' }),
      ]));
    });
  } else if (t.type === 'event' && !data.result) {
    const event = EVENTS[data.eventId];
    event.options.forEach((option, index) => {
      rows.push(el('button', {
        class: 'scene-option',
        onclick: () => performSceneAction('event:' + index),
      }, [
        el('span', { class: 'scene-option-copy' }, [
          el('strong', { text: option.label }),
          el('small', { text: option.hint }),
        ]),
        el('span', { class: 'scene-option-mark', text: '选择' }),
      ]));
    });
  } else if (t.type === 'shop') {
    rows.push(btn('查看货架与交易', 'primary big', () => performSceneAction('shop')));
  } else if (t.type === 'fire') {
    rows.push(btn('休息或升级', 'primary big', () => performSceneAction('fire')));
  } else if (t.type === 'hazard') {
    rows.push(btn('穿过危险区域', 'primary big', () => performSceneAction('hazard')));
  } else if (t.type === 'extract') {
    rows.push(btn('撤离', 'primary big', () => performSceneAction('extract')));
    rows.push(btn('继续探索', 'ghost big', () => performSceneAction('leave')));
  }
  if (!t.cleared && t.type !== 'extract') {
    rows.push(btn('离开场景', 'ghost big', () => performSceneAction('leave')));
  }

  return el('div', { class: 'screen scene-screen' }, [
    topBar(),
    el('div', { class: 'scene-shell' }, [
      el('div', { class: 'scene-heading' }, [
        el('div', { class: 'scene-heading-icon', text: info.emoji }),
        el('div', { class: 'scene-heading-copy' }, [
          el('div', { class: 'scene-kicker', text: '地点场景 · 危险度 ' + run.danger }),
          el('h1', { text: event ? event.title : info.name }),
        ]),
        el('div', { class: 'scene-location', text: `第 ${run.steps} 步 · ${run.zone.name}` }),
      ]),
      el('div', { class: 'scene-content' }, [
        el('div', { class: 'scene-content-label', text: t.cleared ? '处理结果' : '场景情况' }),
        el('div', { class: 'scene-description', text: detail }),
      ]),
      el('div', { class: 'scene-actions' }, rows),
      el('div', {
        class: 'scene-footnote',
        text: t.cleared ? '此地点已处理，不会重复获得奖励。' : '离开不会处理地点；之后可以从当前位置重新进入。',
      }),
    ]),
  ]);
}

function openCurrentScene() {
  const t = currentSceneTile();
  if (!t || t.cleared || !t.spawned || t.type === 'combat' || t.type === 'elite') return;
  ui.screen = 'scene';
  refresh();
}

function countVisited() {
  let n = 0;
  for (let r = 0; r < run.map.rows; r++) {
    for (let c = 0; c < run.map.cols; c++) if (tileAt(run.map, c, r).visited) n++;
  }
  return n;
}

function tileCell(t) {
  const reach = canMoveTo(t.c, t.r);
  const isHere = run.pos.c === t.c && run.pos.r === t.r;
  const info = TILE[t.type];
  const pending = t.spawned && !t.cleared && t.type !== 'start';
  const foes = pending && t.payload ? t.payload.map((id) => ENEMIES[id].emoji).join('') : '';
  const cls = [
    'tile',
    't-' + t.type,
    t.revealed ? '' : 'fogged',
    t.visited ? 'visited' : '',
    t.cleared ? 'cleared' : '',
    pending ? 'pending' : '',
    reach ? 'reachable' : '',
    isHere ? 'here' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const kids = [];
  if (t.revealed) {
    kids.push(el('div', { class: 'tile-emoji', text: info.emoji }));
    kids.push(
      el('div', {
        class: 'tile-name',
        text: foes
          ? foes
          : t.type === 'event' && t.sceneData
            ? EVENTS[t.sceneData.eventId].title
            : t.cleared && t.type !== 'extract'
              ? '已处理'
              : info.name,
      }),
    );
  } else {
    kids.push(el('div', { class: 'tile-emoji', text: '❓' }));
    kids.push(el('div', { class: 'tile-name', text: '' }));
  }
  if (pending) kids.push(el('div', { class: 'tile-new', text: '待处理' }));
  if (reach && !isHere) kids.push(el('div', { class: 'tile-move-hint', text: '移动' }));
  if (reach && t.type === 'hazard' && !t.cleared) {
    kids.push(el('div', { class: 'tile-risk-hint', text: '进入危险场景' }));
  }
  if (isHere) kids.push(el('div', { class: 'tile-here', text: '◎ 当前位置' }));
  return el(
    'div',
    {
      class: cls,
      onclick: reach
        ? () => {
          walkTo(t.c, t.r);
          refresh();
          if (ui.screen === 'battle') flushBattleFx(120);
          }
        : isHere && pending
          ? openCurrentScene
        : null,
    },
    kids,
  );
}

/* 地图只负责显示地点与移动；当前地点的操作都在场景界面中。 */
function tileActionBar(cur) {
  if (!cur) return el('div', { class: 'tile-actions' });
  return el('div', { class: 'tile-actions' }, [
    el('div', {
      class: 'hint-text',
      text: cur.spawned && !cur.cleared
        ? '地点内容尚未处理；点击当前位置可重新进入场景。'
        : '点击相邻格子移动并进入地点场景（每移动一格危险度 +1）',
    }),
  ]);
}

function mapSidePanel() {
  const current = tileAt(run.map, run.pos.c, run.pos.r);
  const atExtract = current && current.type === 'extract';
  const kids = [
    el('div', { class: 'panel-title', text: '⌖ 当前目标' }),
    el('div', { class: 'panel-body' }, [
      el('div', {
        class: 'kv',
        text: atExtract ? '已到达 🌀 撤离法阵' : '寻找 🌀 撤离法阵',
      }),
      el('div', {
        class: 'kv',
        text: atExtract ? '确认撤离可把战利品带回安全区' : '移动会揭示地点并进入场景；操作后才会结算',
      }),
    ]),
    el('div', { class: 'panel-title', text: '🧪 消耗品' }),
    el(
      'div',
      { class: 'potion-row' },
      run.potions.length
        ? run.potions.map((id) => potionEl(id))
        : [el('div', { class: 'empty-hint', text: '无' })],
    ),
    el('div', { class: 'panel-title', text: `🎒 战利品 ${run.loot.length + run.secure.length}` }),
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
    el('div', {
      class: 'hint-text',
      text: `保险箱 ${run.secure.length}/${secureCap()}：阵亡后仍可保留`,
    }),
    el('div', { class: 'panel-title', text: '✨ 临时增益' }),
    el(
      'div',
      { class: 'buff-list' },
      run.buffs.length
        ? run.buffs.map((b) => buffEl(b, { showScope: true }))
        : [el('div', { class: 'empty-hint', text: '无' })],
    ),
  ];
  return el('div', { class: 'side-panel' }, kids);
}

function mapRightPanel() {
  return el('div', { class: 'side-panel right' }, [
    el('div', { class: 'panel-actions' }, [
      btn('🃏 卡组', 'ghost', () =>
        openPileView('🃏 当前卡组', deckIds(), '本次行动获得的新卡也在其中'),
      ),
      btn('🎒 背包', 'ghost', () => {
        ui.modal = { kind: 'bag' };
        refresh();
      }),
      btn('📖 帮助', 'ghost', () => {
        ui.modal = { kind: 'help' };
        refresh();
      }),
    ]),
    el('div', { class: 'panel-title', text: '📜 行动日志' }),
    logPanel('', run.log.slice(-6), 'tall'),
  ]);
}
