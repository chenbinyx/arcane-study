/* 本地存档：等级、经验、错题、打卡、每日任务 */
var Store = (function () {
  'use strict';
  var KEY = 'arcane_academy_v1';
  var data = null;

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  /* 错字存储键：单字 + 类型，识字(read)/听写(write) 各自独立一把钥匙。
     旧版本以"字"为键（未区分两类），升级时由 migrateMistakes 按 src 归并。 */
  function keyOf(c, type) { return c + '|' + (type === 'write' ? 'write' : 'read'); }

  /* 旧版数据错字以裸字为键，未区分识字/听写 → 按 src 迁移到 c|read / c|write 两把独立钥匙，
     使删除/复习识字错字绝不会影响听写错字。obj 为待迁移的存档对象。 */
  function migrateMistakes(obj) {
    if (!obj || !obj.mistakes) return;
    var ms = obj.mistakes;
    for (var k in ms) {
      if (k.indexOf('|') >= 0) continue;             /* 已是新键，跳过 */
      var m = ms[k]; if (!m) continue;
      var canon = (m.src === 'dictation') ? 'write' : 'read';
      var nk = keyOf(k, canon);
      if (nk !== k) { ms[nk] = m; delete ms[k]; }
      m.type = canon;
    }
  }

  function defaults() {
  
  /* ============ 数学错题 ============ */
  function addMathMistake(a,b,op,ans,ua){var g=get(),k=a+op+b;if(!g.mathMistakes[k])g.mathMistakes[k]={a:a,b:b,op:op,ans:ans,wrong:0,right:0,date:today()};g.mathMistakes[k].wrong++;g.mathMistakes[k].userAns=ua;g.mathMistakes[k].date=today();save()}
  function hitMathMistake(k){var g=get();if(g.mathMistakes[k]){g.mathMistakes[k].right++;save()}}
  function mathMistakeList(){var g=get(),o=[];for(var k in g.mathMistakes)o.push(g.mathMistakes[k]);o.sort(function(a,b){return b.wrong-a.wrong||(b.date<a.date?1:-1)});return o}

  /* ============ 云存档同步 ============ */
  function getSyncCode(){var g=get();if(!g.syncCode){g.syncCode=String(Math.floor(100000+Math.random()*900000));save()}return g.syncCode}
  function exportForSync(){return JSON.stringify(get())}
  function importFromSync(j){var inc;try{inc=JSON.parse(j)}catch(e){return false}var g=get();g.lv=Math.max(g.lv,inc.lv||1);g.xp=Math.max(g.xp,inc.xp||0);g.totalWords=Math.max(g.totalWords,inc.totalWords||0);g.totalMath=Math.max(g.totalMath,inc.totalMath||0);if(inc.best){g.best.combo=Math.max(g.best.combo,inc.best.combo||0);g.best.score=Math.max(g.best.score,inc.best.score||0)}for(var k in inc.mistakes||{}){if(!g.mistakes[k])g.mistakes[k]=inc.mistakes[k];else{g.mistakes[k].wrong=Math.max(g.mistakes[k].wrong,inc.mistakes[k].wrong||0);g.mistakes[k].right=Math.max(g.mistakes[k].right,inc.mistakes[k].right||0)}}for(var k2 in inc.mathMistakes||{}){if(!g.mathMistakes[k2])g.mathMistakes[k2]=inc.mathMistakes[k2];else{g.mathMistakes[k2].wrong=Math.max(g.mathMistakes[k2].wrong,inc.mathMistakes[k2].wrong||0);g.mathMistakes[k2].right=Math.max(g.mathMistakes[k2].right,inc.mathMistakes[k2].right||0)}}if(inc.mathAttempts&&inc.mathAttempts.length){if(!g.mathAttempts)g.mathAttempts=[];var have={};g.mathAttempts.forEach(function(x){have[x.ts]=1});inc.mathAttempts.forEach(function(x){if(x&&x.ts!=null&&!have[x.ts]){have[x.ts]=1;g.mathAttempts.push(x)}});g.mathAttempts.sort(function(a,b){return a.ts-b.ts});if(g.mathAttempts.length>500)g.mathAttempts=g.mathAttempts.slice(-500)}for(var d in inc.days||{}){if(!g.days[d])g.days[d]=inc.days[d];else{g.days[d].words=Math.max(g.days[d].words||0,inc.days[d].words||0);g.days[d].mathQ=Math.max(g.days[d].mathQ||0,inc.days[d].mathQ||0)}}migrateMistakes(g);save();return true}


  return {
      lv: 1, xp: 0,
      grade: '1a', wordType: 'zi',
      user: { name: '', gender: 'girl', char: 0 },   /* 昵称 / 性别 girl|boy / 人物索引 */
      pb: {},                                        /* '1a|zi' -> best score */
      mistakes: {},           /* key -> {c,p,w,s,grade,type,wrong,right,ts,date,first,src} */
      mathMistakes: {},        /* "a*b" -> {a,b,op,ans,userAns,date,wrong,right} */
      mathAttempts: [],        /* [{ts,date,a,b,op,ans,ua}] 每次答错逐条记录（按时间升序） */
      streak: 0, lastDay: '',
      days: {},               /* '2026-08-06': {words:0, mathQ:0, review:0, xp:0, done:[]} */
      goals: { words: 20, math: 20, review: 5 },
      badges: {},
      mulMastery: {},         /* '3x7' -> {ok:n, no:n} */
      best: { combo: 0, score: 0 },
      totalWords: 0, totalMath: 0,
      eyeCare: false,          /* 护眼模式开关 */
      history: []             /* {ts,type,action,detail,meta} 按时间倒序，最新在前 */
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      data = raw ? JSON.parse(raw) : defaults();
    } catch (e) { data = defaults(); }
    var d = defaults();
    for (var k in d) if (!(k in data)) data[k] = d[k];
    migrateMistakes(data);                 /* 旧版裸键错字 → 识字/听写独立键 */
    checkStreak();
    return data;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }
  function get() { return data || load(); }

  function day(dt) {
    var t = dt || today();
    if (!data.days[t]) data.days[t] = { words: 0, mathQ: 0, review: 0, xp: 0, done: [], wrongChars: {} };
    if (!data.days[t].wrongChars) data.days[t].wrongChars = {};
    return data.days[t];
  }

  /* 错字按天统计（字词卡牌板块）：days[date].wrongChars 为当天写错的"不重复字/词"集合 */
  function addWrongChar(c) {
    var d = day();
    if (!d.wrongChars) d.wrongChars = {};
    d.wrongChars[c] = 1;
    save();
  }
  function todayWrong() {
    var d = data.days[today()];
    return d && d.wrongChars ? Object.keys(d.wrongChars).length : 0;
  }
  /* 取某天具体的错字（数组，已去重）；date 缺省取今天 */
  function wrongCharsOf(date) {
    var rec = data.days[date || today()];
    if (!rec || !rec.wrongChars) return [];
    return Object.keys(rec.wrongChars);
  }
  function wrongByDay(n) {
    n = n || 7;
    var out = [], base = new Date();
    for (var i = n - 1; i >= 0; i--) {
      var dd = new Date(base); dd.setDate(base.getDate() - i);
      var key = dd.getFullYear() + '-' + ('0' + (dd.getMonth() + 1)).slice(-2) + '-' + ('0' + dd.getDate()).slice(-2);
      var rec = data.days[key];
      out.push({
        key: key,
        md: ('0' + (dd.getMonth() + 1)).slice(-2) + '-' + ('0' + dd.getDate()).slice(-2),
        isToday: i === 0,
        count: (rec && rec.wrongChars) ? Object.keys(rec.wrongChars).length : 0
      });
    }
    return out;
  }

  function checkStreak() {
    var t = today();
    if (data.lastDay === t) return;
    if (data.lastDay) {
      var prev = new Date(data.lastDay + 'T00:00:00');
      var now = new Date(t + 'T00:00:00');
      var diff = Math.round((now - prev) / 86400000);
      if (diff > 1) data.streak = 0;
    }
  }

  /* 记录活动，返回是否升级 */
  function addXp(n) {
    var g = get();
    g.xp += n; day().xp += n;
    var up = false, need = xpNeed(g.lv);
    while (g.xp >= need) { g.xp -= need; g.lv++; up = true; need = xpNeed(g.lv); }
    markActive();
    save();
    return up;
  }
  function xpNeed(lv) { return 100 + (lv - 1) * 60; }

  function markActive() {
    var g = get(), t = today();
    if (g.lastDay !== t) {
      var prev = g.lastDay ? new Date(g.lastDay + 'T00:00:00') : null;
      var now = new Date(t + 'T00:00:00');
      if (prev && Math.round((now - prev) / 86400000) === 1) g.streak += 1;
      else g.streak = 1;
      g.lastDay = t;
      log('plan', '打卡', '第 ' + g.streak + ' 天 · ' + t, { day: t, streak: g.streak });
    }
  }

  function bump(field, n) {
    var g = get(); day()[field] = (day()[field] || 0) + (n || 1);
    if (field === 'words') g.totalWords += (n || 1);
    if (field === 'mathQ') g.totalMath += (n || 1);
    markActive(); save();
  }

  /* 错题：识字错误与听写错误按独立钥匙存储，互不影响 */
  function addMistake(item, grade, kind, src) {
    src = src || 'card';
    var canon = src === 'dictation' ? 'write'
      : src === 'manual' ? (kind === 'write' ? 'write' : 'read')
      : 'read';                              /* 字词卡牌=识字(read)，听写=write，手动按所选 */
    var k = keyOf(item.c, canon);
    var g = get();
    if (!g.mistakes[k]) {
      g.mistakes[k] = { c: item.c, p: item.p, w: item.w || [], s: item.s || '', grade: grade,
        type: canon, kind: (src === 'card') ? (kind || (item.c.length > 1 ? 'ci' : 'zi')) : (item.c.length > 1 ? 'ci' : 'zi'),
        wrong: 0, right: 0, ts: Date.now(), date: today(), first: today(), src: src };
    }
    var m = g.mistakes[k];
    m.wrong++;
    m.ts = Date.now();
    m.date = today();                       /* 最近一次写错的日期 */
    if (!m.first) m.first = today();
    if (src) m.src = src;                   /* card=卡牌 / dictation=听写 / manual=手动 */
    if (item.w && item.w.length && !(m.w || []).length) m.w = item.w;
    if (item.s && !m.s) m.s = item.s;
    if (item.lesson && !m.lesson) m.lesson = item.lesson;
    save();
  }
  function hitMistake(c, type) {
    var g = get();
    var k = keyOf(c, type);
    if (!g.mistakes[k] && g.mistakes[c]) k = c;   /* 兼容旧版裸键 */
    if (g.mistakes[k]) { g.mistakes[k].right++; save(); }
  }
  function removeMistake(c, type) {
    var g = get();
    var k = (c.indexOf('|') >= 0) ? c : keyOf(c, type);
    if (g.mistakes[k]) { delete g.mistakes[k]; save(); }
  }
  function mistakeList() {
    var g = get(), out = [];
    for (var k in g.mistakes) out.push(g.mistakes[k]);
    out.sort(function (a, b) { return (b.wrong - b.right) - (a.wrong - a.right) || b.ts - a.ts; });
    return out;
  }
  /* 手动添加错字（按所选类型独立成键） */
  function manualAdd(item) {
    var g = get();
    var canon = item.type === 'write' ? 'write' : 'read';
    var k = keyOf(item.c, canon);
    if (!g.mistakes[k]) {
      g.mistakes[k] = { c: item.c, p: item.p || '', w: item.w || [], s: item.s || '',
                        grade: item.grade || g.grade, type: canon, kind: item.c.length > 1 ? 'ci' : 'zi',
                        wrong: 1, right: 0, ts: Date.now(), date: today(), first: today(),
                        src: 'manual', remarks: item.remarks || '',
                        dictPhase: 0, dictPassCorrect: 0, dictPassTotal: 0, lastDictDate: '' };
    } else {
      g.mistakes[k].wrong++;
      g.mistakes[k].ts = Date.now(); g.mistakes[k].date = today();
      g.mistakes[k].type = canon;
    }
    save();
  }

  /* 听写周期设置 */
  function getDictSettings() {
    var g = get();
    if (!g.dictSettings) g.dictSettings = { dailyCount: 10, passThreshold: 2 };
    return g.dictSettings;
  }
  function setDictSettings(s) {
    var g = get(), cur = getDictSettings();
    if (s.dailyCount != null) cur.dailyCount = Math.max(1, s.dailyCount | 0);
    if (s.passThreshold != null) cur.passThreshold = Math.max(1, s.passThreshold | 0);
    g.dictSettings = cur; save();
  }

  /* 听写过关：答对次数累积，达到阈值进入下一轮 */
  function advanceDictPass(k) {
    var g = get(), m = g.mistakes[k];
    if (!m) return;
    m.dictPassCorrect = (m.dictPassCorrect || 0) + 1;
    m.dictPassTotal = (m.dictPassTotal || 0) + 1;
    m.lastDictDate = today();
    var threshold = getDictSettings().passThreshold;
    if (m.dictPassCorrect >= threshold) {
      m.dictPhase = (m.dictPhase || 0) + 1;
      m.dictPassCorrect = 0; m.dictPassTotal = 0;
      if (m.dictPhase >= 3) { m.right = 3; Store.log('review', '听写过关', k + '完成三轮听写已掌握'); }
    }
    save();
  }
  function failDictPass(k) {
    var g = get(), m = g.mistakes[k];
    if (!m) return;
    m.dictPassTotal = (m.dictPassTotal || 0) + 1;
    m.lastDictDate = today();
    m.wrong++;
    save();
  }

  /* 按类型筛选错字（type 恒为 read/write，兼容旧版缺 type 的兜底） */
  function mistakeByType(srcType) {
    return mistakeList().filter(function (m) {
      var t = m.type || (m.src === 'dictation' ? 'write' : 'read');
      if (srcType === 'read') return t === 'read';
      if (srcType === 'write') return t === 'write';
      return true;
    });
  }

  /* 听写待练池：取今日未练的写类型错字，按 dictPhase 排序（phase 低优先） */
  function dictPool(count) {
    count = count || getDictSettings().dailyCount;
    var pool = mistakeByType('write').filter(function (m) { return m.right < 3; });
    pool.sort(function (a, b) { return (a.dictPhase || 0) - (b.dictPhase || 0) || (b.dictPassTotal || 0) - (a.dictPassTotal || 0); });
    return pool.slice(0, count);
  }

  function pendingCount() {
    return mistakeList().filter(function (m) { return m.right < 3; }).length;
  }

  function recordMul(key, ok) {
    var g = get();
    if (!g.mulMastery[key]) g.mulMastery[key] = { ok: 0, no: 0 };
    g.mulMastery[key][ok ? 'ok' : 'no']++;
    save();
  }

  function setGoal(k, v) { var g = get(); g.goals[k] = Math.max(1, v | 0); save(); }
  function setBest(combo, score) {
    var g = get();
    if (combo > g.best.combo) g.best.combo = combo;
    if (score > g.best.score) g.best.score = score;
    save();
  }
  /* 分册分类型最高分（用于"超过多少人"排名感） */
  function setPB(grade, type, score) {
    var g = get(), k = grade + '|' + type;
    if (!g.pb) g.pb = {};
    if (score > (g.pb[k] || 0)) { g.pb[k] = score; save(); }
    return g.pb[k];
  }
  function getPB(grade, type) {
    var g = get();
    return g.pb && g.pb[grade + '|' + type] ? g.pb[grade + '|' + type] : 0;
  }
  /* "超过多少人"：由正确率与连击算出的趣味百分位 */
  function beatPercent(acc, maxCombo) {
    var p = 28 + acc * 0.42 + Math.min(50, maxCombo) * 0.6;
    return Math.max(1, Math.min(99, Math.round(p)));
  }
  function grantBadge(id) {
    var g = get();
    if (g.badges[id]) return false;
    g.badges[id] = Date.now(); save(); return true;
  }

  function weekDays() {
    var out = [], d = new Date();
    var dow = (d.getDay() + 6) % 7; /* 周一=0 */
    d.setDate(d.getDate() - dow);
    for (var i = 0; i < 7; i++) {
      var s = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      out.push({ key: s, label: '一二三四五六日'[i], data: (get().days[s] || null), isToday: s === today() });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  /* ============ 历史改动记录 ============ */
  function log(type, action, detail, meta) {
    var g = get();
    if (!g.history) g.history = [];
    g.history.push({
      ts: Date.now(),
      type: type || 'sys',
      action: action || '',
      detail: detail || '',
      meta: meta || null
    });
    if (g.history.length > 800) g.history = g.history.slice(-800);
    save();
  }

  function historyList(filter) {
    var g = get(), out = (g.history || []).slice().reverse(); /* 最新在前 */
    if (filter && filter !== 'all') out = out.filter(function (h) { return h.type === filter; });
    return out;
  }

  function clearHistory() { var g = get(); g.history = []; save(); }

  function exportAll() {
    var g = get();
    return JSON.stringify({ kind: 'arcane_academy_backup', v: 1, exportedAt: Date.now(), data: g }, null, 0);
  }

  /* 跨设备合并：历史并集去重；错题取较大练习值；等级/经验/连击取较大值 */
  function importAll(text) {
    var src; try { src = JSON.parse(text); } catch (e) { return { ok: false, msg: '文件格式不正确' }; }
    var incoming = src && src.data ? src.data : (src && src.history ? src : null);
    if (!incoming) return { ok: false, msg: '找不到可导入的数据' };
    var g = get();
    /* 历史合并 */
    var seen = {}, merged = (g.history || []).slice();
    merged.forEach(function (h) { seen[h.ts + '|' + h.detail] = 1; });
    (incoming.history || []).forEach(function (h) {
      var key = h.ts + '|' + h.detail;
      if (!seen[key]) { seen[key] = 1; merged.push(h); }
    });
    merged.sort(function (a, b) { return a.ts - b.ts; });
    if (merged.length > 800) merged = merged.slice(-800);
    g.history = merged;
    /* 错题并集 */
    var ms = incoming.mistakes || {};
    for (var k in ms) {
      if (!g.mistakes[k]) g.mistakes[k] = ms[k];
      else {
        g.mistakes[k].wrong = Math.max(g.mistakes[k].wrong, ms[k].wrong || 0);
        g.mistakes[k].right = Math.max(g.mistakes[k].right, ms[k].right || 0);
      }
    }
    /* 数值取较大 */
    g.lv = Math.max(g.lv, incoming.lv || 0);
    g.xp = Math.max(g.xp, incoming.xp || 0);
    g.streak = Math.max(g.streak, incoming.streak || 0);
    g.totalWords = Math.max(g.totalWords, incoming.totalWords || 0);
    g.totalMath = Math.max(g.totalMath, incoming.totalMath || 0);
    if (incoming.best) {
      g.best.combo = Math.max(g.best.combo, incoming.best.combo || 0);
      g.best.score = Math.max(g.best.score, incoming.best.score || 0);
    }
    /* 徽章并集 */
    if (incoming.badges) for (var b in incoming.badges) if (!g.badges[b]) g.badges[b] = incoming.badges[b];
    migrateMistakes(g);                    /* 导入数据同样归并到独立钥匙 */
    save();
  
  /* ============ 数学错题 ============ */
  function addMathMistake(a,b,op,ans,ua){var g=get(),k=a+op+b;if(!g.mathMistakes[k])g.mathMistakes[k]={a:a,b:b,op:op,ans:ans,wrong:0,right:0,date:today()};g.mathMistakes[k].wrong++;g.mathMistakes[k].userAns=ua;g.mathMistakes[k].date=today();save()}
  function hitMathMistake(k){var g=get();if(g.mathMistakes[k]){g.mathMistakes[k].right++;save()}}
  function mathMistakeList(){var g=get(),o=[];for(var k in g.mathMistakes)o.push(g.mathMistakes[k]);o.sort(function(a,b){return b.wrong-a.wrong||(b.date<a.date?1:-1)});return o}

  /* ============ 云存档同步 ============ */
  function getSyncCode(){var g=get();if(!g.syncCode){g.syncCode=String(Math.floor(100000+Math.random()*900000));save()}return g.syncCode}
  function exportForSync(){return JSON.stringify(get())}
  function importFromSync(j){var inc;try{inc=JSON.parse(j)}catch(e){return false}var g=get();g.lv=Math.max(g.lv,inc.lv||1);g.xp=Math.max(g.xp,inc.xp||0);g.totalWords=Math.max(g.totalWords,inc.totalWords||0);g.totalMath=Math.max(g.totalMath,inc.totalMath||0);if(inc.best){g.best.combo=Math.max(g.best.combo,inc.best.combo||0);g.best.score=Math.max(g.best.score,inc.best.score||0)}for(var k in inc.mistakes||{}){if(!g.mistakes[k])g.mistakes[k]=inc.mistakes[k];else{g.mistakes[k].wrong=Math.max(g.mistakes[k].wrong,inc.mistakes[k].wrong||0);g.mistakes[k].right=Math.max(g.mistakes[k].right,inc.mistakes[k].right||0)}}for(var k2 in inc.mathMistakes||{}){if(!g.mathMistakes[k2])g.mathMistakes[k2]=inc.mathMistakes[k2];else{g.mathMistakes[k2].wrong=Math.max(g.mathMistakes[k2].wrong,inc.mathMistakes[k2].wrong||0);g.mathMistakes[k2].right=Math.max(g.mathMistakes[k2].right,inc.mathMistakes[k2].right||0)}}if(inc.mathAttempts&&inc.mathAttempts.length){if(!g.mathAttempts)g.mathAttempts=[];var have={};g.mathAttempts.forEach(function(x){have[x.ts]=1});inc.mathAttempts.forEach(function(x){if(x&&x.ts!=null&&!have[x.ts]){have[x.ts]=1;g.mathAttempts.push(x)}});g.mathAttempts.sort(function(a,b){return a.ts-b.ts});if(g.mathAttempts.length>500)g.mathAttempts=g.mathAttempts.slice(-500)}for(var d in inc.days||{}){if(!g.days[d])g.days[d]=inc.days[d];else{g.days[d].words=Math.max(g.days[d].words||0,inc.days[d].words||0);g.days[d].mathQ=Math.max(g.days[d].mathQ||0,inc.days[d].mathQ||0)}}migrateMistakes(g);save();return true}


  return { ok: true, msg: '已合并 ' + merged.length + ' 条历史记录' };
  }


  /* ============ 数学错题（聚合 + 逐次明细） ============ */
  function addMathMistake(a,b,op,ans,ua){
    var g=get();
    /* 聚合：同一道题错几次 */
    var k=a+op+b;
    if(!g.mathMistakes[k])g.mathMistakes[k]={a:a,b:b,op:op,ans:ans,wrong:0,right:0,date:today()};
    g.mathMistakes[k].wrong++;
    g.mathMistakes[k].userAns=ua;
    g.mathMistakes[k].date=today();
    /* 明细：每次答错逐条记录（时间升序），保留最近 500 条 */
    if(!g.mathAttempts||!g.mathAttempts.push)g.mathAttempts=[];
    var d=new Date();
    var hh=('0'+d.getHours()).slice(-2),mm=('0'+d.getMinutes()).slice(-2),ss=('0'+d.getSeconds()).slice(-2);
    var ts=d.getTime();
    /* 同一毫秒内连错多题时，ts 会重复导致去重/排序异常 → 顺延直至唯一 */
    var has={};for(var z=0;z<g.mathAttempts.length;z++)has[g.mathAttempts[z].ts]=1;
    while(has[ts])ts++;
    g.mathAttempts.push({ts:ts,date:today(),hm:hh+':'+mm+':'+ss,a:a,b:b,op:op,ans:ans,ua:ua==null?null:ua});
    if(g.mathAttempts.length>500)g.mathAttempts=g.mathAttempts.slice(-500);
    save();
  }
  function hitMathMistake(k){var g=get();if(g.mathMistakes[k]){g.mathMistakes[k].right++;save()}}
  function mathMistakeList(){var g=get(),o=[];for(var k in g.mathMistakes)o.push(g.mathMistakes[k]);o.sort(function(a,b){return b.wrong-a.wrong||(b.date<a.date?1:-1)});return o}
  /* 逐次错题明细：按时间倒序（最新在前） */
  function mathAttemptList(){
    var g=get();
    if(!g.mathAttempts||!g.mathAttempts.length)return [];
    var o=g.mathAttempts.slice();
    o.sort(function(a,b){return b.ts-a.ts});
    return o;
  }

  /* ============ 云存档同步 ============ */
  function getSyncCode(){var g=get();if(!g.syncCode){g.syncCode=String(Math.floor(100000+Math.random()*900000));save()}return g.syncCode}
  function exportForSync(){return JSON.stringify(get())}
  function importFromSync(j){var inc;try{inc=JSON.parse(j)}catch(e){return false}var g=get();g.lv=Math.max(g.lv,inc.lv||1);g.xp=Math.max(g.xp,inc.xp||0);g.totalWords=Math.max(g.totalWords,inc.totalWords||0);g.totalMath=Math.max(g.totalMath,inc.totalMath||0);if(inc.best){g.best.combo=Math.max(g.best.combo,inc.best.combo||0);g.best.score=Math.max(g.best.score,inc.best.score||0)}for(var k in inc.mistakes||{}){if(!g.mistakes[k])g.mistakes[k]=inc.mistakes[k];else{g.mistakes[k].wrong=Math.max(g.mistakes[k].wrong,inc.mistakes[k].wrong||0);g.mistakes[k].right=Math.max(g.mistakes[k].right,inc.mistakes[k].right||0)}}for(var k2 in inc.mathMistakes||{}){if(!g.mathMistakes[k2])g.mathMistakes[k2]=inc.mathMistakes[k2];else{g.mathMistakes[k2].wrong=Math.max(g.mathMistakes[k2].wrong,inc.mathMistakes[k2].wrong||0);g.mathMistakes[k2].right=Math.max(g.mathMistakes[k2].right,inc.mathMistakes[k2].right||0)}}if(inc.mathAttempts&&inc.mathAttempts.length){if(!g.mathAttempts)g.mathAttempts=[];var have={};g.mathAttempts.forEach(function(x){have[x.ts]=1});inc.mathAttempts.forEach(function(x){if(x&&x.ts!=null&&!have[x.ts]){have[x.ts]=1;g.mathAttempts.push(x)}});g.mathAttempts.sort(function(a,b){return a.ts-b.ts});if(g.mathAttempts.length>500)g.mathAttempts=g.mathAttempts.slice(-500)}for(var d in inc.days||{}){if(!g.days[d])g.days[d]=inc.days[d];else{g.days[d].words=Math.max(g.days[d].words||0,inc.days[d].words||0);g.days[d].mathQ=Math.max(g.days[d].mathQ||0,inc.days[d].mathQ||0)}}migrateMistakes(g);save();return true}


  return {
    load: load, save: save, get: get, today: today, day: day,
    addXp: addXp, xpNeed: xpNeed, bump: bump,
    addMistake: addMistake, hitMistake: hitMistake, removeMistake: removeMistake,
    mistakeList: mistakeList, pendingCount: pendingCount, mistakeByType: mistakeByType,
    manualAdd: manualAdd, dictPool: dictPool, advanceDictPass: advanceDictPass, failDictPass: failDictPass,
    getDictSettings: getDictSettings, setDictSettings: setDictSettings,
    recordMul: recordMul,addMathMistake:addMathMistake,hitMathMistake:hitMathMistake,mathMistakeList:mathMistakeList,mathAttemptList:mathAttemptList, setGoal: setGoal, setBest: setBest,
    setPB: setPB, getPB: getPB, beatPercent: beatPercent, getSyncCode:getSyncCode,exportForSync:exportForSync,importFromSync:importFromSync,grantBadge:grantBadge,
    weekDays: weekDays,
    addWrongChar: addWrongChar, todayWrong: todayWrong, wrongByDay: wrongByDay, wrongCharsOf: wrongCharsOf,
    log: log, historyList: historyList, clearHistory: clearHistory,
    exportAll: exportAll, importAll: importAll
  };
})();
