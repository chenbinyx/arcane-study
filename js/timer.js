/* 通用计时器（秒表）
   字词卡牌(words) 与 机械算室(math) 各持一个独立实例，互不影响。
   用法（行内 onclick 已绑定）：
     Timer.toggle(key)  打开/收起计时器面板
     Timer.start(key)   开始计时（运行中隐藏「开始」、显示「暂停」）
     Timer.pause(key)   暂停并结算已用时间
     Timer.reset(key)   清零并停止
   显示格式 mm:ss，每 250ms 刷新一次；可通过 Timer._now(fn) 注入时钟用于测试。 */
var Timer = (function () {
  'use strict';
  var now = Date.now;                       /* 可注入的时钟源（测试用） */
  var states = {};                          /* key -> { running, ms, last, tid } */

  function ensure(key) {
    if (!states[key]) states[key] = { running: false, ms: 0, last: 0, tid: 0 };
    return states[key];
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmt(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    return pad2(Math.floor(total / 60)) + ':' + pad2(total % 60);
  }
  function update(key) {
    var el = document.getElementById('timerDisp-' + key);
    if (el) el.textContent = fmt(ensure(key).ms);
  }
  /* 计时主循环：用真实时间差累加，避免 setTimeout 漂移影响总时长 */
  function tick(key) {
    var st = ensure(key);
    if (!st.running) return;
    var t = now();
    st.ms += (t - st.last);
    st.last = t;
    update(key);
    st.tid = setTimeout(function () { tick(key); }, 250);
  }
  function start(key) {
    var st = ensure(key);
    if (st.running) return;
    st.running = true;
    st.last = now();
    tick(key);
    sync(key);
  }
  function pause(key) {
    var st = ensure(key);
    if (st.running) {
      var t = now();
      st.ms += (t - st.last);             /* 结算到暂停瞬间 */
      st.running = false;
    }
    if (st.tid) { clearTimeout(st.tid); st.tid = 0; }
    update(key);
    sync(key);
  }
  function reset(key) {
    var st = ensure(key);
    st.running = false;
    if (st.tid) { clearTimeout(st.tid); st.tid = 0; }
    st.ms = 0;
    update(key);
    sync(key);
  }
  /* 打开/收起面板（不影响计时运行状态，收起后仍在后台计时） */
  function toggle(key) {
    var el = document.getElementById('timerPanel-' + key);
    if (!el) return;
    var open = el.style.display !== 'none' && el.style.display !== '';
    el.style.display = open ? 'none' : 'flex';
    var btn = document.getElementById('timerBtn-' + key);
    if (btn) btn.classList.toggle('on', !open);
  }
  /* 运行中：隐藏「开始」、显示「暂停」 */
  function sync(key) {
    var st = ensure(key);
    var s = document.getElementById('timerStart-' + key);
    var p = document.getElementById('timerPause-' + key);
    if (s) s.style.display = st.running ? 'none' : '';
    if (p) p.style.display = st.running ? '' : 'none';
  }
  return {
    start: start, pause: pause, reset: reset, toggle: toggle, sync: sync,
    fmt: fmt, update: update,
    getState: function (key) { return ensure(key); },
    setState: function (key, st) { states[key] = st; },
    _now: function (fn) { now = fn; }       /* 测试注入时钟 */
  };
})();
