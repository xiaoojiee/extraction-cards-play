'use strict';

/* B站 Toy JS SDK 封装：非 Toy 环境自动降级（返回 null / 全部解锁）。
 * 本地预览可用 ?mock=1 注入假的 window.toy。 */

/* global refreshUnlocks, AUTHOR_NAME, VIDEO_TITLE, MOCK_KEY */

const Toy = (() => {
  const VIDEO_BVID = ''; // 绑定视频 BV 号（发布后填入）
  const AUTHOR_UID = ''; // UP 主 uid（发布后填入）

  /* ---- 本地模拟：注入假的 window.toy，便于普通浏览器测试 ---- */
  let mockState = null;
  function installMock() {
    let raw = {};
    try {
      raw = JSON.parse(localStorage.getItem(MOCK_KEY) || '{}');
    } catch (_) {}
    mockState = {
      liked: !!raw.liked,
      coin: !!raw.coin,
      fav: !!raw.fav,
      following: !!raw.following,
    };
    const save = () => {
      try {
        localStorage.setItem(MOCK_KEY, JSON.stringify(mockState));
      } catch (_) {}
    };
    const myScore = () => Number(localStorage.getItem(MOCK_KEY + '.score') || 0);
    const fakeList = () => {
      const base = [
        { rank: 1, score: 128400, nickname: '撤离大师' },
        { rank: 2, score: 96200, nickname: '拾荒之王' },
        { rank: 3, score: 71800, nickname: '全军覆没' },
        { rank: 4, score: 52300, nickname: '一枪一个' },
        { rank: 5, score: 31100, nickname: '贪心必死' },
      ];
      const my = myScore();
      if (my > 0) {
        base.push({ rank: 0, score: my, nickname: '我' });
        base.sort((a, b) => b.score - a.score);
        base.forEach((it, i) => (it.rank = i + 1));
      }
      return base;
    };
    window.toy = {
      isSupport: () => Promise.resolve(true),
      getVideoUserActions: () =>
        Promise.resolve({
          items: [
            {
              status: 'ok',
              liked: mockState.liked,
              coinCount: mockState.coin ? 2 : 0,
              favorited: mockState.fav,
            },
          ],
        }),
      getAuthorRelation: () =>
        Promise.resolve({ status: 'ok', data: { isFollowing: mockState.following } }),
      submitScore: (req) => {
        const my = myScore();
        if (req.score > my) localStorage.setItem(MOCK_KEY + '.score', String(req.score));
        return Promise.resolve({ score: Math.max(my, req.score) });
      },
      getRankList: () => Promise.resolve(fakeList()),
      getMyRank: () => {
        const my = myScore();
        const me = fakeList().find((it) => it.nickname === '我');
        return Promise.resolve({ ranked: !!me, rank: me ? me.rank : 0, score: my });
      },
      getAuthorProfile: () => Promise.resolve({ status: 'ok', data: { nickname: AUTHOR_NAME } }),
      getAuthorVideos: () => Promise.resolve({ items: [{ bvid: VIDEO_BVID, title: VIDEO_TITLE }] }),
      navigate: () => Promise.resolve(),
    };
    window.__toyMock = {
      state: mockState,
      toggle(k) {
        mockState[k] = !mockState[k];
        save();
      },
    };
  }
  const mockMode = typeof location !== 'undefined' && location.search.indexOf('mock') >= 0;
  if (typeof window !== 'undefined' && !window.toy && mockMode) installMock();

  /* 异步动态加载真 SDK：不阻塞页面；加载完刷新一次解锁状态 */
  function loadSdk() {
    if (mockMode || typeof document === 'undefined') return;
    const s = document.createElement('script');
    s.src = '//s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js';
    s.async = true;
    s.onerror = () => {};
    s.onload = () => {
      if (typeof refreshUnlocks === 'function') refreshUnlocks();
    };
    document.head.appendChild(s);
  }
  loadSdk();

  function sdk() {
    return typeof window !== 'undefined' && window.toy ? window.toy : null;
  }
  function available() {
    return !!sdk();
  }

  /* 当前用户对该视频的 点赞/投币/收藏 */
  async function getVideoActions() {
    const t = sdk();
    if (!t || typeof t.getVideoUserActions !== 'function' || !VIDEO_BVID) return null;
    try {
      const res = await t.getVideoUserActions({ videos: [{ bvid: VIDEO_BVID }] });
      const item = res && res.items && res.items[0];
      if (!item || item.status !== 'ok') return null;
      return { liked: !!item.liked, coin: (item.coinCount || 0) > 0, fav: !!item.favorited };
    } catch (_) {
      return null;
    }
  }
  /* 当前用户是否关注了作者 */
  async function getAuthorRelation() {
    const t = sdk();
    if (!t || typeof t.getAuthorRelation !== 'function') return null;
    try {
      const res = await t.getAuthorRelation();
      if (!res || res.status !== 'ok' || !res.data) return null;
      return { following: !!res.data.isFollowing };
    } catch (_) {
      return null;
    }
  }
  /* 上报分数：board 1 = 金币榜，board 2 = 最远深度榜 */
  async function submitScore(board, score) {
    const t = sdk();
    if (!t || typeof t.submitScore !== 'function') return null;
    try {
      return await t.submitScore({ board, score: Math.round(score) });
    } catch (_) {
      return null;
    }
  }
  async function getRankList(board, limit) {
    const t = sdk();
    if (!t || typeof t.getRankList !== 'function') return null;
    try {
      return await t.getRankList({ board, period: 'all', limit: limit || 20 });
    } catch (_) {
      return null;
    }
  }
  async function getMyRank(board) {
    const t = sdk();
    if (!t || typeof t.getMyRank !== 'function') return null;
    try {
      return await t.getMyRank({ board, period: 'all' });
    } catch (_) {
      return null;
    }
  }
  function navigate(type, id) {
    const t = sdk();
    if (!t || typeof t.navigate !== 'function' || !id) return;
    try {
      const p = t.navigate({ type, id });
      if (p && p.catch) p.catch(() => {});
    } catch (_) {}
  }
  function openVideo() {
    navigate('video', VIDEO_BVID);
  }
  function openAuthor() {
    navigate('space', AUTHOR_UID);
  }

  return {
    VIDEO_BVID,
    AUTHOR_UID,
    available,
    isMock: () => mockState !== null,
    getVideoActions,
    getAuthorRelation,
    submitScore,
    getRankList,
    getMyRank,
    navigate,
    openVideo,
    openAuthor,
  };
})();
