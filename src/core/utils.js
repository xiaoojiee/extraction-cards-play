'use strict';

/* 通用工具：可复现随机 / 数值 / 数组。本文件禁止依赖 DOM。 */

/* ---- 可复现随机（mulberry32）：全局唯一随机源，禁止直接用 Math.random ---- */
const RNG = (() => {
  let s = 0;
  function seed(n) {
    s = n >>> 0 || 1;
  }
  seed(Math.floor(Date.now() % 2147483647));
  function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /* 闭区间整数 [a, b] */
  function int(a, b) {
    return a + Math.floor(next() * (b - a + 1));
  }
  function chance(p) {
    return next() < p;
  }
  function pick(arr) {
    return arr[Math.floor(next() * arr.length)];
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }
  /* 按权重取一项；items: [{w, ...}]，权重非正值自动跳过 */
  function weighted(items) {
    let total = 0;
    for (let i = 0; i < items.length; i++) total += Math.max(0, items[i].w || 0);
    if (total <= 0) return items.length ? items[0] : null;
    let r = next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= Math.max(0, items[i].w || 0);
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
  return { seed, next, int, chance, pick, shuffle, weighted, state: () => s };
})();

/* ---- 数值 ---- */
function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
/* 取整并保证不小于 0 */
function toInt(v) {
  return Math.max(0, Math.round(v));
}

/* ---- 唯一 id（局内卡牌实例用） ---- */
let __uid = 0;
function uid(prefix) {
  __uid++;
  return (prefix || 'u') + __uid;
}

/* ---- 数组 ---- */
function removeAt(arr, i) {
  if (i < 0 || i >= arr.length) return null;
  return arr.splice(i, 1)[0];
}
function removeItem(arr, item) {
  const i = arr.indexOf(item);
  return i < 0 ? null : removeAt(arr, i);
}
function sum(arr) {
  let n = 0;
  for (let i = 0; i < arr.length; i++) n += arr[i];
  return n;
}
function last(arr) {
  return arr.length ? arr[arr.length - 1] : null;
}
