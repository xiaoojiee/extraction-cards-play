'use strict';

/* 地图生成：矩形格子 + 迷雾。危险区大小由区域配置决定。 */

/* global ZONES, TILE, TILE_WEIGHTS, RNG */

function makeTile(c, r, type) {
  return {
    c,
    r,
    type,
    visited: false,
    spawned: false, // 走上去后内容显形（还没触发）
    cleared: false, // 内容是否已处理完
    revealed: !!TILE[type] && !TILE[type].fog,
    payload: null,
  };
}

function genMap(zoneKey) {
  const zone = ZONES[zoneKey];
  const cols = zone.cols;
  const rows = zone.rows;
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) row.push(null);
    grid.push(row);
  }

  /* 起点：最左列随机一行 */
  const start = { c: 0, r: RNG.int(0, rows - 1) };
  grid[start.r][start.c] = makeTile(start.c, start.r, 'start');

  /* 撤离点：最右列（数量由区域配置决定） */
  const rowsShuffled = [];
  for (let r = 0; r < rows; r++) rowsShuffled.push(r);
  RNG.shuffle(rowsShuffled);
  const extracts = [];
  for (let i = 0; i < Math.min(zone.extractCount || 1, rows); i++) {
    const r = rowsShuffled[i];
    grid[r][cols - 1] = makeTile(cols - 1, r, 'extract');
    extracts.push({ c: cols - 1, r });
  }

  /* 其余格子按权重填充 */
  const items = Object.keys(TILE_WEIGHTS).map((k) => ({ id: k, w: TILE_WEIGHTS[k] }));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c]) continue;
      let t = RNG.weighted(items).id;
      /* 精英在起点附近少一些 */
      if (t === 'elite' && c <= 1 && !RNG.chance(0.35)) t = 'combat';
      grid[r][c] = makeTile(c, r, t);
    }
  }

  const map = { zoneKey, cols, rows, grid, start, extracts };
  revealAround(map, start.c, start.r);
  /* 撤离点始终可见（便于规划风险） */
  for (let i = 0; i < extracts.length; i++) {
    const t = grid[extracts[i].r][extracts[i].c];
    t.revealed = true;
  }
  return map;
}

function tileAt(map, c, r) {
  if (c < 0 || r < 0 || c >= map.cols || r >= map.rows) return null;
  return map.grid[r][c];
}

function revealAround(map, c, r) {
  const t = tileAt(map, c, r);
  if (t) t.revealed = true;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let i = 0; i < dirs.length; i++) {
    const n = tileAt(map, c + dirs[i][0], r + dirs[i][1]);
    if (n) n.revealed = true;
  }
}

function isAdjacent(a, b) {
  return Math.abs(a.c - b.c) + Math.abs(a.r - b.r) === 1;
}
