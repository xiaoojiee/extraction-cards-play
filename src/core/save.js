'use strict';

/* 安全区存档：保留 v1 格式，校验输入、轮换备份，并公开可供设置界面使用的状态。
 * 只持久化跨局资源，不保存行动中状态。导入预览不会修改游戏或浏览器存档。 */

/* global meta, run, SAVE_KEY, START_HP, START_GOLD, CARDS, POTIONS, normalizeWorldMap,
   SECURE_UPGRADE_MAX, DECK_UPGRADE_MAX, SAFE_SHOP_CARDS, SAFE_SHOP_POTIONS */

const SAVE_BACKUP_KEY = SAVE_KEY + '.backup';
const SAVE_CORRUPT_KEY = SAVE_KEY + '.corrupt';
/* 文件格式保护限额，不参与游戏数值平衡。 */
const SAVE_MAX_TEXT_LENGTH = 2 * 1024 * 1024;
const SAVE_MAX_ITEMS = 10000;
const SAVE_MAX_NUMBER = Number.MAX_SAFE_INTEGER;

const saveState = {
  mode: 'ready', // ready | memory | error | blocked
  message: '',
  lastSavedAt: null,
  recovered: false,
  repaired: false,
  backupAvailable: false,
  blocked: false,
};

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch (_) {
    return null;
  }
}

function saveRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function saveWarning(warnings, message) {
  if (!warnings.includes(message)) warnings.push(message);
}

function saveNumber(value, fallback, min, max, label, warnings) {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    saveWarning(warnings, `${label}格式异常，已使用默认值`);
    return fallback;
  }
  const n = Math.max(min, Math.min(max, Math.floor(value)));
  if (n !== value) saveWarning(warnings, `${label}超出范围，已修正`);
  return n;
}

function saveItemList(value, catalog, label, warnings) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    saveWarning(warnings, `${label}格式异常，已清空`);
    return [];
  }
  const ids = value.filter((id) => typeof id === 'string' && Object.hasOwn(catalog, id));
  if (ids.length !== value.length) saveWarning(warnings, `${label}中的未知物品已移除`);
  if (ids.length > SAVE_MAX_ITEMS) saveWarning(warnings, `${label}超过存档容量，已截取`);
  return ids.slice(0, SAVE_MAX_ITEMS);
}

function saveShopItems(value, catalog, limit, warnings) {
  if (!Array.isArray(value)) {
    saveWarning(warnings, '商店货架格式异常，已移除无效货架');
    return [];
  }
  const items = [];
  for (const item of value.slice(0, limit)) {
    if (
      !saveRecord(item) ||
      typeof item.id !== 'string' ||
      !Object.hasOwn(catalog, item.id) ||
      !Number.isSafeInteger(item.price) ||
      item.price < 1 ||
      typeof item.sold !== 'boolean'
    ) {
      saveWarning(warnings, '商店中的无效商品已移除');
      continue;
    }
    items.push({ id: item.id, price: item.price, sold: item.sold });
  }
  if (value.length > limit) saveWarning(warnings, '商店商品数量超出上限，已截取');
  return items;
}

/* 白名单重建对象：外部存档不能把未知字段写入全局 meta。 */
function normalizeMetaSave(source) {
  const warnings = [];
  if (!saveRecord(source)) return { ok: false, error: '存档必须是 JSON 对象。' };
  if (source.v !== 1) {
    return {
      ok: false,
      unsupported: typeof source.v === 'number' && source.v > 1,
      error: '此存档版本不受支持，当前支持 v1。',
    };
  }
  const upgrades = saveRecord(source.upgrades) ? source.upgrades : {};
  const stats = saveRecord(source.stats) ? source.stats : {};
  if (source.upgrades !== undefined && !saveRecord(source.upgrades)) {
    saveWarning(warnings, '升级数据格式异常，已重置');
  }
  if (source.stats !== undefined && !saveRecord(source.stats)) {
    saveWarning(warnings, '统计数据格式异常，已重置');
  }
  const data = {
    v: 1,
    gold: saveNumber(source.gold, START_GOLD, 0, SAVE_MAX_NUMBER, '金币', warnings),
    stash: saveItemList(source.stash, CARDS, '仓库卡牌', warnings),
    potions: saveItemList(source.potions, POTIONS, '仓库药剂', warnings),
    maxHp: saveNumber(source.maxHp, START_HP, 1, SAVE_MAX_NUMBER, '生命上限', warnings),
    secureSlots: saveNumber(source.secureSlots, 0, 0, SECURE_UPGRADE_MAX, '保险箱升级', warnings),
    upgrades: {
      deckMax: saveNumber(upgrades.deckMax, 0, 0, DECK_UPGRADE_MAX, '卡组升级', warnings),
      backpackMax: saveNumber(upgrades.backpackMax, 0, 0, SAVE_MAX_ITEMS, '背包升级', warnings),
      potionSlots: saveNumber(upgrades.potionSlots, 0, 0, SAVE_MAX_ITEMS, '药剂栏升级', warnings),
    },
    stats: {},
    seenTutorial: source.seenTutorial === true,
    worldMap: null,
  };
  if (source.worldMap != null) {
    data.worldMap = normalizeWorldMap(source.worldMap);
    if (!data.worldMap) saveWarning(warnings, '大世界地图数据异常，已重新生成地图');
  }
  for (const key of ['raids', 'extracts', 'deaths', 'kills', 'bestDepth', 'bestGold']) {
    data.stats[key] = saveNumber(stats[key], 0, 0, SAVE_MAX_NUMBER, '行动统计', warnings);
  }
  if (source.seenTutorial !== undefined && typeof source.seenTutorial !== 'boolean') {
    saveWarning(warnings, '引导状态格式异常，已重置');
  }
  if (source.savedAt !== undefined) {
    data.savedAt = saveNumber(source.savedAt, 0, 0, Date.now(), '保存时间', warnings);
  }
  if (source.safeShop !== undefined) {
    if (saveRecord(source.safeShop)) {
      const cards = saveShopItems(source.safeShop.cards, CARDS, SAFE_SHOP_CARDS, warnings);
      const potions = saveShopItems(source.safeShop.potions, POTIONS, SAFE_SHOP_POTIONS, warnings);
      if (
        Array.isArray(source.safeShop.cards) &&
        source.safeShop.cards.length === SAFE_SHOP_CARDS &&
        Array.isArray(source.safeShop.potions) &&
        source.safeShop.potions.length === SAFE_SHOP_POTIONS &&
        cards.length === SAFE_SHOP_CARDS &&
        potions.length === SAFE_SHOP_POTIONS
      ) {
        data.safeShop = {
          cards,
          potions,
          funds: saveNumber(source.safeShop.funds, 0, 0, SAVE_MAX_NUMBER, '商人资金', warnings),
        };
      } else {
        saveWarning(warnings, '商店货架不完整，将重新生成');
      }
    } else {
      saveWarning(warnings, '商店数据格式异常，将重新生成');
    }
  }
  return { ok: true, data, warnings };
}

function previewMetaImport(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: '请选择存档文件。' };
  if (text.length > SAVE_MAX_TEXT_LENGTH) return { ok: false, error: '存档文件过大，无法读取。' };
  let source;
  try {
    source = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (_) {
    return { ok: false, error: '文件不是有效的 JSON 存档。' };
  }
  const result = normalizeMetaSave(source);
  if (result.ok) {
    result.summary = {
      gold: result.data.gold,
      cards: result.data.stash.length,
      potions: result.data.potions.length,
      raids: result.data.stats.raids,
    };
  }
  return result;
}

/* 创建独立快照，调用方不能通过快照数组修改游戏状态。 */
function snapshotMeta() {
  return normalizeMetaSave({
    v: 1,
    gold: meta.gold,
    stash: meta.stash,
    potions: meta.potions,
    maxHp: meta.maxHp,
    secureSlots: meta.secureSlots,
    upgrades: meta.upgrades,
    stats: meta.stats,
    seenTutorial: meta.seenTutorial,
    safeShop: meta.safeShop,
    worldMap: meta.worldMap,
  }).data;
}

function applyMetaSave(data) {
  meta.gold = data.gold;
  meta.stash = data.stash.slice();
  meta.potions = data.potions.slice();
  meta.hp = data.maxHp;
  meta.maxHp = data.maxHp;
  meta.secureSlots = data.secureSlots;
  meta.upgrades = { ...data.upgrades };
  meta.stats = { ...data.stats };
  meta.seenTutorial = data.seenTutorial;
  meta.worldMap = data.worldMap;
  if (data.safeShop) {
    meta.safeShop = {
      cards: data.safeShop.cards.map((item) => ({ ...item })),
      potions: data.safeShop.potions.map((item) => ({ ...item })),
      funds: data.safeShop.funds,
    };
  } else {
    delete meta.safeShop;
  }
  meta.loaded = true;
}

function preserveRejectedSave(store, raw) {
  if (!raw) return;
  try {
    store.setItem(SAVE_CORRUPT_KEY, raw);
  } catch (_) {
    /* 空间不足时优先保住主存档；归档失败不会阻止玩家继续。 */
  }
}

function writeMetaSave(data, rotateBackup) {
  if (saveState.blocked) return false;
  const store = storage();
  if (!store) {
    saveState.mode = 'memory';
    saveState.message = '浏览器存储不可用，进度仅保留在当前页面。请导出存档。';
    return false;
  }
  try {
    const previous = rotateBackup ? store.getItem(SAVE_KEY) : null;
    const parsed = previous ? previewMetaImport(previous) : null;
    let backupNeeded = false;
    if (rotateBackup && parsed && parsed.ok) {
      const oldData = { ...parsed.data };
      delete oldData.savedAt;
      backupNeeded = JSON.stringify(oldData) !== JSON.stringify(data);
    }
    const savedAt = Date.now();
    /* setItem 单次写入是原子的。先写主档，避免新备份占满空间反而挡住本次保存。 */
    store.setItem(SAVE_KEY, JSON.stringify({ ...data, savedAt }));
    saveState.lastSavedAt = savedAt;
    saveState.mode = 'ready';
    saveState.message = '进度已保存在此浏览器。';
    if (!rotateBackup) return true;
    try {
      if (backupNeeded) store.setItem(SAVE_BACKUP_KEY, previous);
      else if (previous && parsed && !parsed.ok) preserveRejectedSave(store, previous);
      const backup = store.getItem(SAVE_BACKUP_KEY);
      saveState.backupAvailable = !!(backup && previewMetaImport(backup).ok);
    } catch (_) {
      /* 主档已成功保存，备份失败不应被报告为整个保存失败。 */
      saveState.message = '进度已保存，浏览器暂时无法更新备份。';
    }
    return true;
  } catch (_) {
    saveState.mode = 'error';
    saveState.message = '保存失败：浏览器空间不足或禁止写入。当前进度仍在，请导出存档。';
    return false;
  }
}

function saveMeta() {
  return writeMetaSave(snapshotMeta(), true);
}

/* 地图每移动一格会保存；跳过备份轮换，避免大地图每步重复解析两份存档。 */
function saveWorldMap(snapshot) {
  meta.worldMap = snapshot;
  return writeMetaSave(snapshotMeta(), false);
}

function loadMeta() {
  saveState.recovered = false;
  saveState.repaired = false;
  saveState.blocked = false;
  saveState.backupAvailable = false;
  const store = storage();
  if (!store) {
    meta.loaded = true;
    saveMeta();
    return;
  }
  let raw;
  let backupRaw;
  try {
    raw = store.getItem(SAVE_KEY);
    backupRaw = store.getItem(SAVE_BACKUP_KEY);
  } catch (_) {
    meta.loaded = true;
    saveState.mode = 'error';
    saveState.message = '无法读取浏览器存档，当前使用临时进度。请检查浏览器存储权限。';
    return;
  }
  const parsed = raw ? previewMetaImport(raw) : null;
  const backup = backupRaw ? previewMetaImport(backupRaw) : null;
  saveState.backupAvailable = !!(backup && backup.ok);
  if (parsed && parsed.ok) {
    applyMetaSave(parsed.data);
    saveState.lastSavedAt = parsed.data.savedAt || null;
    saveState.mode = 'ready';
    saveState.message = '已载入此浏览器的进度。';
    if (parsed.warnings.length) {
      preserveRejectedSave(store, raw);
      saveState.repaired = true;
      writeMetaSave(snapshotMeta(), false);
    }
    return;
  }
  /* 新版本存档不能被旧版本客户端启动时覆盖。 */
  if (parsed && parsed.unsupported) {
    meta.loaded = true;
    saveState.blocked = true;
    saveState.mode = 'blocked';
    saveState.message = '检测到更新版本的存档，已保留原文件。请使用对应版本或手动导入兼容存档。';
    return;
  }
  if (backup && backup.ok) {
    if (raw) preserveRejectedSave(store, raw);
    applyMetaSave(backup.data);
    saveState.recovered = true;
    saveState.repaired = backup.warnings.length > 0;
    writeMetaSave(snapshotMeta(), false);
    return;
  }
  if (raw) {
    preserveRejectedSave(store, raw);
    saveState.repaired = true;
  }
  meta.loaded = true;
  saveMeta();
}

function exportMeta() {
  return JSON.stringify({ ...snapshotMeta(), savedAt: Date.now() }, null, 2);
}

function importMeta(text) {
  if (run) return { ok: false, error: '请先结束当前行动并返回安全区，再导入存档。' };
  const result = previewMetaImport(text);
  if (!result.ok) return result;
  applyMetaSave(result.data);
  saveState.blocked = false;
  saveState.recovered = false;
  saveState.repaired = result.warnings.length > 0;
  return { ok: true, persisted: saveMeta(), warnings: result.warnings };
}

function restoreMetaBackup() {
  if (run) return { ok: false, error: '请先结束当前行动并返回安全区，再恢复备份。' };
  const store = storage();
  if (!store) return { ok: false, error: '浏览器存储不可用，无法恢复备份。' };
  let raw;
  try {
    raw = store.getItem(SAVE_BACKUP_KEY);
  } catch (_) {
    return { ok: false, error: '无法读取浏览器中的备份。' };
  }
  if (!raw) return { ok: false, error: '还没有可恢复的备份。' };
  const result = previewMetaImport(raw);
  if (!result.ok) return result;
  applyMetaSave(result.data);
  saveState.blocked = false;
  saveState.recovered = true;
  saveState.repaired = result.warnings.length > 0;
  return { ok: true, persisted: writeMetaSave(snapshotMeta(), false), warnings: result.warnings };
}

function resetMeta() {
  applyMetaSave(normalizeMetaSave({ v: 1 }).data);
  saveState.blocked = false;
  saveState.recovered = false;
  saveState.repaired = false;
  return saveMeta();
}
