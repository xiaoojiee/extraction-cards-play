'use strict';

/* 无限世界地图：稀疏坐标缓存，只为探索过与当前视野周边创建地块。 */

/* global TILE, TILE_WEIGHTS, RNG */

const WORLD_CHUNK_SIZE = 12;
const WORLD_EXIT_OFFSET = 4;
const WORLD_BIOMES = {
  woodland: {
    name: '林地',
    emoji: '🌲',
    desc: '林间小径安全，但树墙会挡住直路。',
    moveDamage: 0,
    battleDamage: 0,
    weight: 34,
    color: '#70a85b',
  },
  volcanic: {
    name: '火山荒原',
    emoji: '🌋',
    desc: '熔岩灼热：每移动一格失去 1 点生命；战斗每回合双方全体失去 1 点生命。',
    moveDamage: 1,
    battleDamage: 1,
    weight: 18,
    color: '#ed7545',
  },
  snowfield: {
    name: '雪山',
    emoji: '🏔️',
    desc: '山脊中央无法穿越；暴雪战场每回合使双方全体失去 1 点生命。',
    moveDamage: 0,
    battleDamage: 0,
    weight: 20,
    color: '#9ed9ee',
  },
  swamp: {
    name: '沼泽',
    emoji: '🌫️',
    desc: '泥潭会拖慢脚步并伤害经过的玩家。',
    moveDamage: 0,
    battleDamage: 0,
    weight: 14,
    color: '#a2aa59',
  },
  ruins: {
    name: '古代废墟',
    emoji: '🏚️',
    desc: '倒塌石墙形成狭窄通道，废墟中更容易找到遗物。',
    moveDamage: 0,
    battleDamage: 0,
    weight: 14,
    color: '#c2a66d',
  },
};
const WORLD_BIOME_RGB = Object.fromEntries(
  Object.entries(WORLD_BIOMES).map(([id, biome]) => [
    id,
    biome.color.match(/[\da-f]{2}/gi).map((v) => parseInt(v, 16)),
  ]),
);

function coordKey(c, r) {
  return c + ',' + r;
}

function chunkAt(c, r) {
  return { c: Math.floor(c / WORLD_CHUNK_SIZE), r: Math.floor(r / WORLD_CHUNK_SIZE) };
}

function noiseHash(seed, x, y) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function smoothNoise(seed, x, y, scale, salt) {
  const px = x / scale;
  const py = y / scale;
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const fx = px - x0;
  const fy = py - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = noiseHash(seed + salt, x0, y0);
  const b = noiseHash(seed + salt, x0 + 1, y0);
  const c = noiseHash(seed + salt, x0, y0 + 1);
  const d = noiseHash(seed + salt, x0 + 1, y0 + 1);
  const top = a + (b - a) * sx;
  const bottom = c + (d - c) * sx;
  return top + (bottom - top) * sy;
}

function biomeSignal(map, x, y) {
  return (
    smoothNoise(map.biomeSeed, x, y, 14, 0) * 0.72 + smoothNoise(map.biomeSeed, x, y, 5, 1) * 0.28
  );
}

function biomeAtSignal(signal) {
  if (signal < 0.2) return 'volcanic';
  if (signal < 0.39) return 'swamp';
  if (signal < 0.61) return 'woodland';
  if (signal < 0.81) return 'ruins';
  return 'snowfield';
}

function biomeIdAt(map, x, y) {
  return biomeAtSignal(biomeSignal(map, x, y));
}

function biomeCoverage(map, c, r, samples) {
  const coverage = Object.create(null);
  const side = samples || 8;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const id = biomeAtSignal(biomeSignal(map, c + (x + 0.5) / side, r + (y + 0.5) / side));
      coverage[id] = (coverage[id] || 0) + 1;
    }
  }
  return coverage;
}

function biomeFor(map, c, r) {
  const key = coordKey(c, r);
  if (!map.biomes[key]) {
    const coverage = biomeCoverage(map, c, r);
    map.biomes[key] = Object.keys(WORLD_BIOMES).reduce(
      (best, id) => ((coverage[id] || 0) > (coverage[best] || 0) ? id : best),
      'woodland',
    );
  }
  return map.biomes[key];
}

function biomeColorAt(map, x, y) {
  return WORLD_BIOME_RGB[biomeIdAt(map, x, y)];
}

function terrainFor(map, c, r, biomeId, forceWall) {
  const chunk = chunkAt(c, r);
  const localC = c - chunk.c * WORLD_CHUNK_SIZE;
  const localR = r - chunk.r * WORLD_CHUNK_SIZE;
  let wall = false;
  let name = '';
  let emoji = '';
  let moveDamage = WORLD_BIOMES[biomeId].moveDamage;
  let battleDamage = WORLD_BIOMES[biomeId].battleDamage;

  if (biomeId === 'snowfield' && Math.abs(localC - 6) <= 1 && Math.abs(localR - 6) <= 1) {
    wall = true;
    name = '高山';
    emoji = '🏔️';
  } else if (biomeId === 'volcanic' && RNG.chance(0.07)) {
    wall = true;
    name = '黑曜石墙';
    emoji = '🪨';
  } else if (biomeId === 'woodland' && RNG.chance(0.06)) {
    wall = true;
    name = '密林';
    emoji = '🌳';
  } else if (biomeId === 'ruins' && RNG.chance(0.1)) {
    wall = true;
    name = '倒塌石墙';
    emoji = '🧱';
  } else if (biomeId === 'swamp' && RNG.chance(0.13)) {
    moveDamage = Math.max(moveDamage, 1);
    name = '深泥潭';
    emoji = '🟫';
  } else if (biomeId === 'volcanic' && RNG.chance(0.12)) {
    name = '熔岩裂隙';
    emoji = '🌋';
  } else if (biomeId === 'snowfield' && RNG.chance(0.08)) {
    name = '暴雪';
    emoji = '❄️';
    battleDamage = 1;
  }

  if (forceWall) {
    wall = true;
    name = '调试墙壁';
    emoji = '🧱';
  }
  return { blocked: wall, name, emoji, moveDamage, battleDamage };
}

function makeTile(map, c, r, type, biomeId, forceWall) {
  const environment = biomeId || biomeFor(map, c, r);
  const weights = Object.keys(TILE_WEIGHTS).map((id) => ({
    id,
    w:
      TILE_WEIGHTS[id] *
      (environment === 'ruins' && ['loot', 'empty', 'potion'].includes(id) ? 1.7 : 1),
  }));
  const tileType =
    type ||
    (isExtractionCoordinate(c, r)
      ? 'extract'
      : RNG.weighted(weights.filter((entry) => entry.id !== 'extract')).id);
  const terrain = terrainFor(map, c, r, environment, forceWall);
  if (tileType === 'extract' && terrain.blocked) {
    terrain.blocked = false;
    terrain.name = '';
    terrain.emoji = '';
  }
  return {
    c,
    r,
    type: tileType,
    environment,
    terrain,
    visited: false,
    usedExtraction: false,
    spawned: false,
    cleared: false,
    revealed: false,
    payload: null,
    sceneData: {},
  };
}

/* 每个 12×12 世界区块固定有一个撤离点，探索到区块中心附近时必定能找到。 */
function isExtractionCoordinate(c, r) {
  const chunk = chunkAt(c, r);
  return (
    c - chunk.c * WORLD_CHUNK_SIZE === WORLD_EXIT_OFFSET &&
    r - chunk.r * WORLD_CHUNK_SIZE === WORLD_EXIT_OFFSET
  );
}

function ensureTile(map, c, r) {
  if (!map || !Number.isInteger(c) || !Number.isInteger(r)) return null;
  const key = coordKey(c, r);
  if (!map.tiles[key]) map.tiles[key] = makeTile(map, c, r);
  return map.tiles[key];
}

function genMap() {
  const map = {
    zoneKey: 'world',
    tiles: {},
    biomes: {},
    biomeSeed: RNG.int(1, 0x7fffffff),
    start: { c: 0, r: 0 },
    extracts: [],
  };
  for (let i = 0; i < 40 && biomeFor(map, 0, 0) !== 'woodland'; i++) {
    map.biomeSeed = RNG.int(1, 0x7fffffff);
    map.biomes = {};
  }
  const start = ensureTile(map, 0, 0);
  start.type = 'start';
  start.revealed = true;
  start.terrain = { blocked: false, name: '', emoji: '', moveDamage: 0, battleDamage: 0 };
  revealAround(map, 0, 0);
  return map;
}

/* 只保存世界地形、地点类型与探索记录；每次出发重新结算地点内容。 */
function snapshotWorldMap(map) {
  if (!map || !map.tiles) return null;
  /* 视野外预生成的格子可以重新生成；只记录玩家已经看见的世界。 */
  const tiles = Object.values(map.tiles)
    .filter((tile) => tile.visited || tile.revealed)
    .map((tile) => {
      const flags =
        (tile.visited ? 1 : 0) | (tile.usedExtraction ? 2 : 0) | (tile.revealed ? 8 : 0);
      return [
        tile.c,
        tile.r,
        tile.type,
        tile.environment,
        tile.terrain && tile.terrain.blocked ? 1 : 0,
        (tile.terrain && tile.terrain.name) || '',
        (tile.terrain && tile.terrain.emoji) || '',
        (tile.terrain && tile.terrain.moveDamage) || 0,
        (tile.terrain && tile.terrain.battleDamage) || 0,
        flags,
      ];
    });
  return { v: 2, biomeSeed: map.biomeSeed, start: { ...map.start }, tiles };
}

/* 校验导入/本地存档的地图，只接受已知地点与环境，忽略坏 tile。 */
function normalizeWorldMap(source) {
  if (
    !source ||
    typeof source !== 'object' ||
    ![1, 2].includes(source.v) ||
    !Array.isArray(source.tiles)
  )
    return null;
  const seed = Number.isSafeInteger(source.biomeSeed) ? source.biomeSeed : null;
  if (
    seed == null ||
    !source.start ||
    !Number.isInteger(source.start.c) ||
    !Number.isInteger(source.start.r)
  )
    return null;
  const tiles = [];
  const seen = new Set();
  for (const row of source.tiles.slice(0, 10000)) {
    if (!Array.isArray(row) || row.length < 10) continue;
    const [c, r, type, environment] = row;
    const key = coordKey(c, r);
    if (
      !Number.isInteger(c) ||
      !Number.isInteger(r) ||
      Math.abs(c) > 1000000 ||
      Math.abs(r) > 1000000 ||
      !TILE[type] ||
      !WORLD_BIOMES[environment] ||
      seen.has(key)
    )
      continue;
    seen.add(key);
    let flags = Number.isInteger(row[9]) ? row[9] & 11 : 0;
    /* 旧存档只记录到达撤离点；迁移时保留之前已开放的出生位置。 */
    if (source.v === 1 && type === 'extract' && flags & 1) flags |= 2;
    if (type !== 'extract' || !(flags & 1)) flags &= ~2;
    tiles.push([
      c,
      r,
      type,
      environment,
      row[4] === 1 ? 1 : 0,
      typeof row[5] === 'string' ? row[5].slice(0, 80) : '',
      typeof row[6] === 'string' ? row[6].slice(0, 8) : '',
      Number.isFinite(row[7]) ? Math.max(0, Math.min(100000, row[7])) : 0,
      Number.isFinite(row[8]) ? Math.max(0, Math.min(100000, row[8])) : 0,
      flags,
    ]);
  }
  if (!seen.has(coordKey(source.start.c, source.start.r))) return null;
  return {
    v: 2,
    biomeSeed: seed,
    start: { c: source.start.c, r: source.start.r },
    tiles,
  };
}

function restoreWorldMap(snapshot) {
  const saved = normalizeWorldMap(snapshot);
  if (!saved) return null;
  const map = {
    zoneKey: 'world',
    tiles: {},
    biomes: {},
    biomeSeed: saved.biomeSeed,
    start: { ...saved.start },
    extracts: [],
  };
  saved.tiles.forEach((row) => {
    const [c, r, type, environment, blocked, name, emoji, moveDamage, battleDamage, flags] = row;
    map.tiles[coordKey(c, r)] = {
      c,
      r,
      type,
      environment,
      terrain: { blocked: !!blocked, name, emoji, moveDamage, battleDamage },
      visited: !!(flags & 1),
      usedExtraction: !!(flags & 2),
      spawned: false,
      cleared: false,
      revealed: !!(flags & 8),
      payload: null,
      sceneData: {},
    };
  });
  return map;
}

function worldExtracts(snapshot) {
  const saved = normalizeWorldMap(snapshot);
  if (!saved) return [];
  return saved.tiles
    .filter((row) => row[2] === 'extract' && row[9] & 2)
    .map((row) => ({ c: row[0], r: row[1], environment: row[3] }))
    .sort((a, b) => Math.hypot(a.c, a.r) - Math.hypot(b.c, b.r));
}

function worldDangerAt(c, r, origin) {
  const center = origin || { c: 0, r: 0 };
  return Math.floor(Math.hypot(c - center.c, r - center.r));
}

function tileAt(map, c, r) {
  return map && map.tiles ? map.tiles[coordKey(c, r)] || null : null;
}

function revealAround(map, c, r) {
  const radius = 2.45;
  const edgeVariation = 0.72;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const distance = Math.hypot(dx, dy);
      const edgeNoise = smoothNoise(map.biomeSeed, c + dx * 0.9, r + dy * 0.9, 2, 37) - 0.5;
      const localRadius = radius + edgeNoise * edgeVariation;
      if (distance > localRadius) continue;
      const tile = ensureTile(map, c + dx, r + dy);
      if (tile) tile.revealed = true;
    }
  }
}

function configureTileEnvironment(map, tile, biomeId, forceWall) {
  if (!map || !tile || !WORLD_BIOMES[biomeId]) return false;
  tile.environment = biomeId;
  tile.terrain = terrainFor(map, tile.c, tile.r, biomeId, forceWall);
  return true;
}

function isAdjacent(a, b) {
  return Math.abs(a.c - b.c) + Math.abs(a.r - b.r) === 1;
}
