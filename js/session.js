/* 跨板块的"一局进度"暂存
   ─ 用户开始一局任务（字词卡牌 / 错字复习 / 机械算室）后，若临时退出 app 或切换界面，
     本模块把当前这一局的进度快照写入 localStorage；下次重新点开对应板块时，
     调用方读取快照并原样恢复，做到"进度不清零、不重新开始"。
   ─ 按板块分键存储：words（字词卡牌，含卡片/听写两种子会话）、review（错字复习）、math（计算）。
   ─ 对 opaque-origin（headless/部分测试环境）与读写异常做容错，失败即静默降级为"不记忆"。 */
var Session = (function () {
  'use strict';
  var KEY = 'arcane_academy_session_v1';

  function readAll() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function writeAll(obj) {
    try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) {}
  }

  /* 保存某板块的当前进度快照（snap 为任意可序列化对象） */
  function save(board, snap) {
    var all = readAll();
    snap = snap || {};
    snap.ts = Date.now();
    all[board] = snap;
    writeAll(all);
  }
  /* 读取某板块快照；无则返回 null */
  function get(board) {
    var all = readAll();
    return all[board] || null;
  }
  /* 删除某板块快照（一局结束 / 用户主动重开） */
  function clear(board) {
    var all = readAll();
    if (all[board]) { delete all[board]; writeAll(all); }
  }
  /* 某板块是否还有未完成的一局 */
  function has(board) {
    var all = readAll();
    return !!(all[board] && all[board].ts);
  }

  return {
    save: save,
    get: get,
    clear: clear,
    has: has
  };
})();
