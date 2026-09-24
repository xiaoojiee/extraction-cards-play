'use strict';

/* DOM 渲染辅助：所有界面都用 el() 生成真实节点，全量重渲染。 */

/* global ui, VIEW_W, VIEW_H, STATUS */

/* 创建元素：el('div', { class:'x', text:'y', onclick: fn }, [child, 'text']) */
function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else node.setAttribute(k, v);
    }
  }
  appendChildren(node, children);
  return node;
}

function appendChildren(node, children) {
  if (children == null) return;
  if (Array.isArray(children)) {
    for (let i = 0; i < children.length; i++) appendOne(node, children[i]);
  } else appendOne(node, children);
}
function appendOne(node, child) {
  if (child == null || child === false) return;
  if (typeof child === 'string' || typeof child === 'number') {
    node.appendChild(document.createTextNode(String(child)));
  } else node.appendChild(child);
}

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}
function mount(root, node) {
  clearNode(root);
  if (node) root.appendChild(node);
}

/* 按钮 */
function btn(label, cls, onClick, extra) {
  const attrs = { class: 'btn ' + (cls || ''), text: label, onclick: onClick };
  if (extra) Object.assign(attrs, extra);
  return el('button', attrs);
}

/* 进度条；ghost 为「预计将失去的量」，会画成一段红色预告区（选目标时用） */
function bar(cur, max, cls, ghost) {
  const r = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0;
  const kids = [el('div', { class: 'bar-fill', style: { width: r * 100 + '%' } })];
  if (ghost > 0) {
    const left = Math.max(0, cur - ghost);
    const rl = max > 0 ? Math.max(0, Math.min(1, left / max)) : 0;
    const g = el('div', {
      class: 'bar-ghost',
      style: { left: rl * 100 + '%', width: (r - rl) * 100 + '%' },
    });
    if (ghost >= cur) g.classList.add('lethal');
    kids.push(g);
  }
  kids.push(
    el('span', { class: 'bar-text', text: `${Math.max(0, Math.round(cur))} / ${Math.round(max)}` }),
  );
  return el('div', { class: 'bar ' + (cls || '') }, kids);
}

/* 漂浮数字（战斗用）：独立图层，不参与全量重渲染 */
function spawnFloat(text, x, y, cls) {
  const layer = document.getElementById('fx-layer');
  if (!layer) return;
  const n = el('div', { class: 'float ' + (cls || ''), text });
  n.style.left = x + 'px';
  n.style.top = y + 'px';
  layer.appendChild(n);
  setTimeout(() => {
    if (n.parentNode) n.parentNode.removeChild(n);
  }, 900);
}

/* 元素在舞台内的相对位置（用于飘字定位） */
function centerOf(node) {
  const stage = document.getElementById('stage');
  if (!stage || !node) return { x: VIEW_W / 2, y: VIEW_H / 2 };
  const a = node.getBoundingClientRect();
  const b = stage.getBoundingClientRect();
  const sx = b.width / VIEW_W;
  return {
    x: (a.left + a.width / 2 - b.left) / sx,
    y: (a.top + a.height / 2 - b.top) / (b.height / VIEW_H),
  };
}

/* 捕获当前节点作为飞行动画副本。start 可覆盖起点，坐标均为舞台逻辑像素。 */
function captureFlight(node, start) {
  const layer = document.getElementById('fx-layer');
  if (!node || !layer) return null;
  const rect = node.getBoundingClientRect();
  const stage = document.getElementById('stage');
  const bounds = stage ? stage.getBoundingClientRect() : { width: VIEW_W, height: VIEW_H };
  const sx = bounds.width / VIEW_W || 1;
  const sy = bounds.height / VIEW_H || 1;
  const clone = node.cloneNode(true);
  clone.removeAttribute('id');
  clone.classList.remove('draw-in-progress');
  clone.classList.add('fx-flight-card');
  clone.style.position = 'absolute';
  clone.style.pointerEvents = 'none';
  clone.style.margin = '0';
  clone.style.left = '0';
  clone.style.top = '0';
  clone.style.width = rect.width / sx + 'px';
  clone.style.height = rect.height / sy + 'px';
  clone.style.zIndex = '100';
  clone.style.transformOrigin = 'center center';
  const origin = start || centerOf(node);
  const size = { width: rect.width / sx, height: rect.height / sy };
  clone.style.left = origin.x - size.width / 2 + 'px';
  clone.style.top = origin.y - size.height / 2 + 'px';
  layer.appendChild(clone);
  return { node: clone, origin, size };
}

/* 沿途点依次飞行，最后可做碎裂收尾。 */
function animateFlight(flight, points, opts) {
  opts = opts || {};
  if (!flight || !flight.node) return;
  const node = flight.node;
  const start = flight.origin;
  const targets = (points || []).filter(Boolean);
  let previous = start;
  let previousScale = opts.startScale || 1;
  let segment = 0;
  const moveNext = () => {
    if (segment >= targets.length) {
      if (opts.shatter) {
        if (node.getAnimations) node.getAnimations().forEach((animation) => animation.cancel());
        node.style.left = previous.x - flight.size.width / 2 + 'px';
        node.style.top = previous.y - flight.size.height / 2 + 'px';
        node.style.transform = 'none';
        node.classList.add('fx-shatter');
        setTimeout(() => {
          node.remove();
          if (opts.onFinish) opts.onFinish();
        }, 300);
        return;
      }
      node.remove();
      if (opts.onFinish) opts.onFinish();
      return;
    }
    const target = targets[segment++];
    const fromX = previous.x - start.x;
    const fromY = previous.y - start.y;
    const toX = target.x - start.x;
    const toY = target.y - start.y;
    const duration = opts.duration || 260;
    const endScale = opts.impactPunch && segment === 1 ? 1.12 : opts.scale || 0.78;
    const frames = opts.impactPunch && segment === 1
      ? [
          { transform: `translate(${fromX}px, ${fromY}px) scale(${previousScale}) rotate(0deg)`, offset: 0 },
          { transform: `translate(${toX * 0.88}px, ${toY * 0.88}px) scale(0.9) rotate(-5deg)`, offset: 0.72 },
          { transform: `translate(${toX * 1.04}px, ${toY * 1.04}px) scale(1.18) rotate(5deg)`, offset: 0.9 },
          { transform: `translate(${toX}px, ${toY}px) scale(${endScale}) rotate(0deg)`, offset: 1 },
        ]
      : [
          { transform: `translate(${fromX}px, ${fromY}px) scale(${previousScale}) rotate(0deg)` },
          { transform: `translate(${toX}px, ${toY}px) scale(${endScale}) rotate(${opts.rotate || 7}deg)` },
        ];
    const pauseAfter = () => {
      if (opts.pauseAfterSegment !== segment) {
        moveNext();
        return;
      }
      if (opts.pauseClass) node.classList.add(opts.pauseClass);
      if (opts.onPause) opts.onPause(target);
      setTimeout(() => {
        if (opts.pauseClass) node.classList.remove(opts.pauseClass);
        moveNext();
      }, opts.pauseDuration || 120);
    };
    if (node.animate) {
      const animation = node.animate(
        frames,
        {
          duration,
          easing: opts.impactPunch && segment === 1 ? 'cubic-bezier(.28,.05,.52,1.25)' : 'cubic-bezier(.2,.72,.25,1)',
          fill: 'forwards',
        },
      );
      animation.onfinish = () => {
        previous = target;
        previousScale = endScale;
        pauseAfter();
      };
    } else {
      node.style.transform = `translate(${toX}px, ${toY}px) scale(${endScale})`;
      setTimeout(() => {
        previous = target;
        previousScale = endScale;
        pauseAfter();
      }, duration);
    }
  };
  if (!targets.length) {
    node.remove();
    if (opts.onFinish) opts.onFinish();
  } else {
    if (!node.animate && opts.startScale) node.style.transform = `scale(${opts.startScale})`;
    moveNext();
  }
}

function statusChips(st, opts) {
  const out = [];
  const keys = Object.keys(st || {});
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const v = st[k];
    if (!v) continue;
    out.push(
      el('span', {
        class: 'chip' + (opts && opts.bad ? ' chip-bad' : ''),
        title: k,
        text: `${statusEmoji(k)}${v}`,
      }),
    );
  }
  return el('div', { class: 'chips' }, out);
}
function statusEmoji(k) {
  return (typeof STATUS !== 'undefined' && STATUS[k] && STATUS[k].emoji) || '•';
}
