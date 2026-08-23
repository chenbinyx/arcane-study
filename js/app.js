/* 主控制器：路由、HUD 同步、提示 */
var App = (function () {
  'use strict';
  var cur = 'home';
  var SYNC = ''; // 云同步服务器地址

  /* ============ 页面记忆：刷新 / 误触下拉刷新 / 重开 app 不再踢回首页 ============ */
  var VIEW_KEY = 'arcane_last_view';
  function saveView(v) {
    try { localStorage.setItem(VIEW_KEY, JSON.stringify({ v: v, ts: Date.now() })); } catch (e) {}
  }
  function restoreView() {
    try {
      var raw = localStorage.getItem(VIEW_KEY);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (!o || !o.v || o.v === 'home' || o.v === cur) return;
      /* 只恢复 6 小时内的上次页面，避免隔天打开直接跳进训练页 */
      if (Date.now() - (o.ts || 0) > 6 * 3600 * 1000) return;
      if (!document.getElementById('v-' + o.v)) return;
      go(o.v);
    } catch (e) {}
  }

  function go(v) {
    document.onkeydown = null;
    /* 离开字词页时停掉听写 */
    if (cur === 'words' && v !== 'words') {
      if (window.Words && Words.stop) Words.stop();
    }
    document.querySelectorAll('.view').forEach(function (el) { el.classList.remove('on'); });
    var target = document.getElementById('v-' + v);
    if (!target) v = 'home', target = document.getElementById('v-home');
    target.classList.add('on');
    cur = v;
    saveView(v); /* 记住当前页面：刷新后接着回来 */
    window.scrollTo({ top: 0, behavior: 'smooth' });
    Sfx.unlock();

    if (v === 'words') Words.start();
    if (v === 'review') Review.render();
    if (v === 'math') MathLab.home();
    if (v === 'plan') Plan.render();
    if (v === 'archive') Archive.render();
    if (v === 'user') User.render();
    if (v === 'home') syncHome();
    syncHud();
  }

  function syncHud() {
    var g = Store.get();
    var need = Store.xpNeed(g.lv);
    document.getElementById('hudLv').textContent = g.lv;
    document.getElementById('hudXp').style.width = Math.min(100, Math.round(g.xp / need * 100)) + '%';
    document.getElementById('hudXpTxt').textContent = g.xp + '/' + need;
    document.getElementById('hudStreak').textContent = g.streak;
    var nameEl = document.getElementById('hudName');
    if (nameEl) nameEl.textContent = (g.user && g.user.name) || '小学童';
    if (cur === 'home') syncHome();
  }

  function syncHome() {
    var d = Store.day(), p = Plan.progress();
    var set = function (id, v) { var e = document.getElementById(id); if (e) e.textContent = v; };
    set('s1', d.words || 0);
    set('s2', Store.pendingCount());
    set('s3', d.mathQ || 0);
    set('s4', p.done + '/' + p.total);
    var bar = document.getElementById('dailyBar');
    if (bar) bar.style.width = p.pct + '%';
    set('dailyTxt', p.pct + '%　已完成 ' + p.done + ' / ' + p.total + ' 项任务');
  }

  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('on'); }, 2400);
  }

  /* ============ 云同步 ============ */
  function setSyncUrl(u) { SYNC = u; }

  function showSync() {
    var el = document.getElementById('syncOverlay');
    el.style.display = 'flex';
    document.getElementById('mySyncCode').textContent = Store.getSyncCode();
  }

  function copySyncCode() {
    var code = Store.getSyncCode();
    navigator.clipboard.writeText(code).then(function () { toast('已复制同步码：' + code); });
  }

  function syncMsg(t) { document.getElementById('syncMsg').textContent = t; }

  function syncUpload() {
    var code = Store.getSyncCode();
    var data = Store.exportForSync();
    syncMsg('上传中...');
    fetch(SYNC + '/sync/save?code=' + code, { method: 'POST', body: data })
      .then(function (r) { return r.json(); })
      .then(function () { syncMsg('上传成功！在另一设备输入 ' + code + ' 即可下载'); })
      .catch(function () { syncMsg('同步失败，请检查网络'); });
  }

  function syncDownload() {
    var code = document.getElementById('syncCodeInput').value.trim();
    if (!/^\d{6}$/.test(code)) { syncMsg('请输入六位数字同步码'); return; }
    syncMsg('下载中...');
    fetch(SYNC + '/sync/load?code=' + code)
      .then(function (r) { if (!r.ok) throw new Error(); return r.text(); })
      .then(function (data) { Store.importFromSync(data); syncMsg('下载成功！存档已合并'); syncHud(); })
      .catch(function () { syncMsg('未找到该同步码的存档'); });
  }

  /* ============ 护眼模式 ============ */
  function applyEye() {
    var on = !!(Store.get() && Store.get().eyeCare);
    document.body.classList.toggle('eye', on);
    var b = document.getElementById('eyeBtn');
    if (b) { b.classList.toggle('on', on); b.textContent = on ? '👁 护眼中' : '👁 护眼'; }
  }
  function toggleEye() {
    var g = Store.get();
    g.eyeCare = !g.eyeCare;
    Store.save();
    applyEye();
    toast(g.eyeCare ? '已开启护眼模式，柔光护眼 🌿' : '已关闭护眼模式');
  }

  function boot() {
    Store.load();
    FX.init();
    Plan.checkBadges();
    Sfx.setGender(Store.get().user && Store.get().user.gender === 'boy' ? 'boy' : 'girl');
    syncHud();
    syncHome();
    applyEye();
    restoreView(); /* 回到上次训练的页面（6 小时内有效） */

    /* 首次交互解锁音频 */
    var unlock = function () { Sfx.unlock(); document.removeEventListener('pointerdown', unlock); };
    document.addEventListener('pointerdown', unlock);

    /* 临时退出（切后台 / 关闭页面）时把进行中的一局进度补盘，重开能接着玩 */
    var flushSessions = function () {
      try {
        if (window.MathLab && MathLab.flush) MathLab.flush();
        if (window.Words && Words.flush) Words.flush();
        if (window.Review && Review.flush) Review.flush();
      } catch (e) {}
    };
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flushSessions();
    });
    window.addEventListener('pagehide', flushSessions);
  }

  document.addEventListener('DOMContentLoaded', boot);

  return {
    go: go,
    syncHud: syncHud,
    toast: toast,
    syncHome: syncHome,
    boot: boot,
    showSync: showSync,
    copySyncCode: copySyncCode,
    syncUpload: syncUpload,
    syncDownload: syncDownload,
    setSyncUrl: setSyncUrl,
    toggleEye: toggleEye
  };
})();
