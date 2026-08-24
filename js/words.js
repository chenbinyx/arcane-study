/* 字词卡牌板块
   ─ 识字表 / 词语表 / 成语：卡片选拼音（识字检测）
   ─ 多音字            ：词语/句子语境选读音，错误后展示释义+组词+造句
   ─ 写字表            ：高考英语听力风格听写测试 + 批改答题卡
*/
var Words = (function () {
  'use strict';
  var DICT_N = 10;         // 听写每套字数
  var state = null;        // 卡片模式
  var dict = null;         // 听写模式

  var TYPES = [
    { t: 'zi',    label: '识字表', sec: 'shizi' },
    { t: 'ci',    label: '词语表', sec: 'cihui' },
    { t: 'idiom', label: '成语',   sec: 'idioms' },
    { t: 'poly',  label: '多音字', sec: null },
    { t: 'xie',   label: '写字表·听写', sec: 'xiezi' }
  ];

  function typeDef(t) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].t === t) return TYPES[i];
    return TYPES[0];
  }
  function gradeBank() {
    var g = Store.get();
    return WORD_BANK[g.grade] || WORD_BANK['1a'];
  }

  /* 全题库拼音索引：扫描全部年级所有 section（含 poly 多音字），建立 字→拼音 映射。
     同一字多音时取首个读音。用于错字拼音兜底，覆盖率接近 100%，避免任何错字显示空白。 */
  var _pyIndex = null;
  function buildPinyinIndex() {
    if (_pyIndex) return _pyIndex;
    var map = {};
    var WB = window.WORD_BANK;
    if (!WB) return map;
    function set(c, p) {
      if (!c || !p) return;
      if (!map[c]) map[c] = p;  // 首见读音优先
    }
    for (var gk in WB) {
      var bank = WB[gk]; if (!bank) continue;
      ['shizi', 'cihui', 'idioms', 'xiezi'].forEach(function (sec) {
        var groups = bank[sec] || {};
        for (var lab in groups) {
          var arr = groups[lab];
          if (!arr || !arr.length) continue;
          arr.forEach(function (s) {
            if (!s || typeof s !== 'object') return;
            set(s.c, s.p);
            if (Array.isArray(s.w)) s.w.forEach(function (ww) { if (ww && ww.length === 1) set(ww, s.p); });
          });
        }
      });
      /* 多音字：每个读音都建索引（同字多音首个优先，其余也记录） */
      var poly = bank.poly;
      if (poly && poly.length) {
        poly.forEach(function (it) {
          if (!it || !it.c) return;
          (it.r || []).forEach(function (rd) { if (rd && rd.p) set(it.c, rd.p); });
        });
      }
    }
    _pyIndex = map;
    return map;
  }
  function indexPinyin(c) {
    var idx = buildPinyinIndex();
    return idx[c] || '';
  }

  /* 多音字提示表：字 → 该字的全部正确读音（去调后的"声韵"集合）。
     用于判断"干扰项是不是该字另一个正确读音"——若是，则这道拼音题
     会撞上多音字（两个选项都正确），需替换为纯声调区分题。
     字库 poly 表里的多音字会自动并入，这里只补充字库未单列的常见多音字。 */
  var _charPy = null;
  var POLY_HINTS = { '似': ['sì', 'shì'], '的': ['de', 'dí', 'dì'], '地': ['dì', 'de'], '得': ['de', 'dé', 'děi'], '长': ['cháng', 'zhǎng'], '重': ['zhòng', 'chóng'], '行': ['xíng', 'háng'], '都': ['dōu', 'dū'], '好': ['hǎo', 'hào'], '了': ['le', 'liǎo'] };
  function buildCharPinyins() {
    if (_charPy) return _charPy;
    var map = {};
    function add(c, p) {
      if (!c || !p) return;
      var base = Pinyin.plain(p);
      if (!base) return;
      var arr = map[c] || (map[c] = []);
      if (arr.indexOf(base) < 0) arr.push(base);
    }
    var WB = window.WORD_BANK;
    if (WB) {
      for (var gk in WB) {
        var bank = WB[gk]; if (!bank) continue;
        ['shizi', 'cihui', 'idioms', 'xiezi'].forEach(function (sec) {
          var groups = bank[sec] || {};
          for (var lab in groups) {
            (groups[lab] || []).forEach(function (s) {
              if (s && typeof s === 'object' && s.c) add(s.c, s.p);
            });
          }
        });
        /* 多音字表：每个读音都并入该字 */
        (bank.poly || []).forEach(function (it) {
          if (!it || !it.c) return;
          add(it.c, it.p);
          (it.r || []).forEach(function (rd) { if (rd && rd.p) add(it.c, rd.p); });
        });
      }
    }
    /* 并入提示表（去调后比较，故存 plain 形式） */
    for (var c in POLY_HINTS) {
      (POLY_HINTS[c] || []).forEach(function (p) { add(c, p); });
    }
    _charPy = map;
    return map;
  }
  function charPinyins(c) {
    var m = buildCharPinyins();
    return m[c] || [];
  }

  /* 组词索引：字 → 组词数组（从全题库 shizi/cihui/idioms 收集），用于错字卡片/复习题
     在 m.w 为空时反查词语，保证"错字板块里始终有语音对应的词语" */
  var _wordIndex = null;
  function buildWordIndex() {
    if (_wordIndex) return _wordIndex;
    var map = {};
    var WB = window.WORD_BANK;
    if (!WB) { _wordIndex = map; return map; }
    function add(c, ws) {
      if (!c || !Array.isArray(ws) || !ws.length) return;
      var arr = map[c] || (map[c] = []);
      ws.forEach(function (w0) { if (w0 && arr.indexOf(w0) < 0) arr.push(w0); });
    }
    for (var gk in WB) {
      var bank = WB[gk]; if (!bank) continue;
      ['shizi', 'cihui', 'idioms'].forEach(function (sec) {
        var groups = bank[sec] || {};
        for (var lab in groups) {
          var arr = groups[lab];
          if (!arr || !arr.length) continue;
          arr.forEach(function (s) {
            if (!s || typeof s !== 'object') return;
            if (s.c) add(s.c, s.w || []);
            /* 词语表里的词，也把每个单字挂上该词，便于"只读错其中一个字"时反查 */
            if (s.c && s.c.length > 1 && Array.isArray(s.w)) {
              s.w.forEach(function (w0) { if (w0 && w0.length > 1) add(s.c, [w0]); });
            }
          });
        }
      });
    }
    _wordIndex = map;
    return map;
  }
  function lookupWords(c) {
    if (!c) return [];
    var idx = buildWordIndex();
    if (idx[c] && idx[c].length) return idx[c].slice();
    /* 多字错字：逐字反查，拼接词语 */
    if (c.length > 1) {
      var out = [];
      for (var i = 0; i < c.length; i++) {
        var one = lookupPinyin(c.charAt(i));
        var ws = idx[c.charAt(i)];
        if (ws && ws.length) { ws.forEach(function (w0) { if (out.indexOf(w0) < 0) out.push(w0); }); }
      }
      if (out.length) return out;
    }
    return [];
  }

  /* ---------- 取题库（按类型 + 课次 + 单元） ---------- */
  function lessonsOf(t) {
    var b = gradeBank(), def = typeDef(t);
    if (!def.sec) return [];
    return Object.keys(b[def.sec] || {});
  }
  function unitOf(t, lab) {
    var b = gradeBank(), def = typeDef(t);
    if (!def.sec || !b || !b.units) return 0;
    var secUnits = b.units[def.sec];
    if (!secUnits) return 0;
    return secUnits[lab] || 0;
  }
  function unitsOf(t) {
    var seen = [], set = {};
    lessonsOf(t).forEach(function (l) {
      var u = unitOf(t, l);
      if (u && !set[u]) { set[u] = 1; seen.push(u); }
    });
    return seen.sort(function (a, b) { return a - b; });
  }

  /* 多音字：每个读音出一题（语境取该读音的一个组词） */
  function bankPoly() {
    var b = gradeBank(), out = [];
    (b.poly || []).forEach(function (it) {
      it.r.forEach(function (rd) {
        var ctx = (rd.w && rd.w[0]) || it.c;
        out.push({
          c: it.c, ctx: ctx, p: rd.p, kind: 'poly', lesson: '多音字',
          w: (rd.w || []).slice(), opts: it.r.map(function (x) { return x.p; }),
          def: rd.d || '', mw: (rd.w || []).slice(), ms: rd.s || '',
          reads: it.r.slice()          // 全部读音（含各自组词），用于双读音展示
        });
      });
    });
    return out;
  }

  function bank(t, lesson) {
    var b, def, out, g;
    try { b = gradeBank(); } catch (e) { console.error('bank gradeBank error:', e); return []; }
    try { def = typeDef(t); } catch (e) { console.error('bank typeDef error:', e); return []; }
    out = [];
    try { g = Store.get(); } catch (e) { console.error('bank Store.get error:', e); return []; }
    if (t === 'poly') return bankPoly();
    if (t === 'idiom') {
      try {
      var groups = b.idioms;
      if (!groups || typeof groups !== 'object') {
        console.warn('bank idiom: b.idioms is', typeof groups, 'for grade', g.grade);
        return [];
      }
      var sel = g.selectedUnits || [];
      Object.keys(groups).forEach(function (lab) {
        if (lesson && lesson !== '__all__' && lab !== lesson) return;
        if (sel.length > 0 && sel.indexOf(unitOf(t, lab)) < 0) return;
        var arr = groups[lab];
        if (!arr || !Array.isArray(arr)) return;
        arr.forEach(function (it) {
          out.push({ c: it.c, p: it.p || '', w: [], s: it.s || '', d: it.d || '', lesson: lab, kind: 'idiom' });
        });
      });
      } catch (e) { console.error('bank idiom branch error:', e, 'grade=', g.grade, 'lesson=', lesson); return []; }
      return out;
    }
    try {
    var sel = g.selectedUnits || [];
    var groups = b[def.sec] || {};
    Object.keys(groups).forEach(function (lab) {
      if (lesson && lesson !== '__all__' && lab !== lesson) return;
      if (sel.length > 0 && sel.indexOf(unitOf(t, lab)) < 0) return;
      var arr = groups[lab];
      if (!arr || !Array.isArray(arr)) return;
      arr.forEach(function (it) {
        out.push({ c: it.c, p: it.p, w: (it.w || []).slice(), s: it.s || '',
                   d: (it.d || []).slice(), idiom: it.i || '', lesson: lab, kind: t });
      });
    });
    } catch (e) { console.error('bank non-idiom error:', e, 'grade=', g.grade, 'type=', t, 'lesson=', lesson); return []; }
    return out;
  }

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------- 顶部选择器（年级 / 类型 / 单元 / 课次） ---------- */
  function buildSegs() {
    var seg = document.getElementById('gradeSeg');
    if (seg && !seg.dataset.built) {
      var keys = ['1a', '1b', '2a', '2b', '3a', '3b'];
      seg.innerHTML = keys.map(function (k) {
        return '<button data-g="' + k + '">' + WORD_BANK[k].name.replace('年级', '') + '</button>';
      }).join('');
      seg.dataset.built = '1';
      seg.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        Store.get().grade = b.dataset.g; Store.get().lesson = '__all__'; Store.get().selectedUnits = []; Store.save();
        Sfx.tick(); start();
      });
    }
    var ts = document.getElementById('typeSeg');
    if (ts && !ts.dataset.built) {
      ts.innerHTML = TYPES.map(function (x) {
        return '<button data-t="' + x.t + '">' + x.label + '</button>';
      }).join('');
      ts.dataset.built = '1';
      ts.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        Store.get().wordType = b.dataset.t; Store.get().lesson = '__all__'; Store.get().selectedUnits = []; Store.save();
        Sfx.tick(); start();
      });
    }
    var us = document.getElementById('unitCbs');
    if (us && !us.dataset.built) {
      us.dataset.built = '1';
      us.addEventListener('click', function (e) {
        var cb = e.target.closest('.unit-cb');
        if (!cb) return;
        var u = parseInt(cb.dataset.u, 10);
        var sel = (Store.get().selectedUnits || []);
        var idx = sel.indexOf(u);
        if (idx >= 0) sel.splice(idx, 1); else sel.push(u);
        Store.get().selectedUnits = sel; Store.get().lesson = '__all__'; Store.save();
        Sfx.tick(); start();
      });
    }
    var ls = document.getElementById('lessonSel');
    if (ls && !ls.dataset.built) {
      ls.dataset.built = '1';
      ls.addEventListener('change', function () {
        Store.get().lesson = ls.value; Store.save();
        Sfx.tick(); start();
      });
    }
  }

  function syncSegs() {
    var g = Store.get();
    document.querySelectorAll('#gradeSeg button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.g === g.grade);
    });
    document.querySelectorAll('#typeSeg button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.t === g.wordType);
    });
    var us = document.getElementById('unitCbs');
    var ls = document.getElementById('lessonSel');
    var def = typeDef(g.wordType);
    if (!us || !ls) return;
    var hasUnit = !!def.sec && unitsOf(g.wordType).length > 0;
    us.style.display = hasUnit ? '' : 'none';
    if (hasUnit) {
      var unis = unitsOf(g.wordType);
      var sel = g.selectedUnits || [];
      us.innerHTML = unis.map(function (u) {
        return '<span class="unit-cb' + (sel.indexOf(u) >= 0 ? ' on' : '') + '" data-u="' + u + '"><i class="cb-mark">' + (sel.indexOf(u) >= 0 ? '☑' : '☐') + '</i>第' + '一二三四五六七八'[u - 1] + '单元</span>';
      }).join('');
    }
    var selectedUnits = g.selectedUnits || [];
    var filterUnit = selectedUnits.length > 0;
    var labs = lessonsOf(g.wordType);
    if (filterUnit) {
      labs = labs.filter(function (l) { return selectedUnits.indexOf(unitOf(g.wordType, l)) >= 0; });
    }
    if (!labs.length) { ls.style.display = 'none'; return; }
    ls.style.display = '';
    var cur = g.lesson || '__all__';
    if (cur !== '__all__' && labs.indexOf(cur) < 0) cur = '__all__';
    ls.innerHTML = '<option value="__all__">全部课次</option>' +
      labs.map(function (l) { return '<option value="' + l + '">' + l + '</option>'; }).join('');
    ls.value = cur;
    g.lesson = cur;
  }

  /* ================= 入口 ================= */
  function start(fresh) {
    buildSegs(); syncSegs();
    renderStats();                 /* 进入板块即显示"按天错字统计"面板 */
    if (dict) { Sfx.stopSeq(); dict = null; }
    /* 先尝试恢复上次未完成的进度（点"重新开局"则强制 fresh） */
    if (!fresh && maybeResume()) return;
    if (fresh) Session.clear('words');
    var g = Store.get();
    if (g.wordType === 'xie') { Sfx.bgmStop(); return dictIntro(); }
    return startCards();
  }

  /* ================= 一、识字检测 / 多音字（卡片选读音） ================= */
  function startCards() {
    FX.comboFireReset();
    var g = Store.get();
    var pool;
    try {
      pool = bank(g.wordType, g.lesson);
    } catch (e) {
      window.console && console.error('Words bank error:', e);
      document.getElementById('wordStage').innerHTML =
        '<div class="summary"><h3>数据加载出错</h3><p class="muted">' + (e && e.message ? e.message : String(e)) + '</p><p class="muted">请尝试切换年级或刷新页面</p></div>';
      return;
    }
    if (!pool || !pool.length) {
      document.getElementById('wordStage').innerHTML =
        '<div class="summary"><h3>这一课暂无内容</h3><p class="muted">换个课次或类型试试。</p>' +
        '<p class="muted" style="font-size:10px">年级:' + g.grade + ' 类型:' + g.wordType + ' 课次:' + (g.lesson || '无') + '</p></div>';
      return;
    }
    state = { queue: shuffle(pool), i: 0, score: 0, combo: 0,
              maxCombo: 0, right: 0, wrong: 0, marks: [], locked: false, extraCount: 0,
              forcePinyin: false };

    /* 错字熔炉的识字错误：打乱次序，额外插入今日卡牌游戏（不占原题数） */
    if (g.wordType !== 'poly' && g.wordType !== 'xie') {
      var extras = Store.mistakeByType('read').filter(function (m) { return m.right < 3; });
      if (extras.length > 0) {
        extras = shuffle(extras).slice(0, 5);
        extras.forEach(function (m) {
          state.queue.push({
            c: m.c, p: lookupPinyin(m.c) || m.p, w: (m.w && m.w.length ? m.w : lookupWords(m.c)), s: m.s || '',
            kind: m.c.length > 1 ? 'ci' : 'zi', lesson: '熔炉复习',
            isReview: true
          });
        });
        state.extraCount = extras.length;
      }
    }
    Sfx.openQuiz(g.wordType === 'poly' ? 'poly' : 'card');
    persistCards();
    render();
  }

  /* ============ 进度记忆（临时退出后可接着玩） ============ */
  function persistCards() {
    var g = Store.get();
    if (state) Session.save('words', { sub: 'cards', wordType: g.wordType, grade: g.grade,
      lesson: g.lesson, units: (g.selectedUnits || []).slice(), state: state });
  }
  function persistDict() {
    if (!dict) return;
    var g = Store.get();
    var d = {}; for (var k in dict) if (k !== 'timer') d[k] = dict[k];
    Session.save('words', { sub: 'dict', lesson: g.lesson, dict: d });
  }
  /* 两次选择是否一致（年级/类型已在外层比对，这里只比课次与单元） */
  function sameUnits(a, b) {
    a = a || []; b = b || [];
    if (a.length !== b.length) return false;
    var s = {}; a.forEach(function (x) { s[x] = 1; });
    for (var i = 0; i < b.length; i++) if (!s[b[i]]) return false;
    return true;
  }
  /* 重新点开时恢复：仅当年级/类型/课次/单元与上次一致才续上，否则旧进度作废并按当前选择重建 */
  function maybeResume() {
    var s = Session.get('words');
    if (!s) return false;
    var g = Store.get();
    if (s.sub === 'dict' && g.wordType === 'xie') {
      /* 课次变了，旧进度作废，按当前选择重建 */
      if (s.lesson !== g.lesson) { Session.clear('words'); return false; }
      dict = s.dict; dict.timer = null; dict.playing = false;
      Sfx.openQuiz('dict');
      if (dict.phase === 'grade') renderSheet(); else renderPlayer();
      App.toast('已恢复刚才的听写进度');
      return true;
    }
    if (s.sub === 'cards' && s.wordType === g.wordType && s.grade === g.grade && s.state && s.state.queue) {
      /* 课次/单元选择变了，旧进度作废，按当前选择重建（卡牌数量随之变化） */
      var selMatch = s.lesson === g.lesson && sameUnits(s.units, g.selectedUnits);
      if (!selMatch) { Session.clear('words'); return false; }
      state = s.state; state.locked = false;
      render();
      App.toast('已恢复刚才的识字进度');
      return true;
    }
    /* 选择不匹配（换了年级/类型），旧进度作废 */
    Session.clear('words');
    return false;
  }
  /* 仅在稳定（未锁定）状态补盘，避免把"答完尚未翻页"的中间态写进去 */
  function flush() {
    var s = Session.get('words');
    if (!s) return;
    if (s.sub === 'dict' && dict) persistDict();
    else if (s.sub === 'cards' && state && !state.locked) persistCards();
  }
  function comboLevel(c) {
    if (c >= 12) return 4;
    if (c >= 7) return 3;
    if (c >= 3) return 2;
    return 1;
  }

  /* 按天错字统计面板（顶部常驻，游戏过程中实时刷新）；点日期格可展开看具体是哪些字 */
  var statsSel = null;                       /* 当前展开的日期 key（null=收起） */
  function lookupPinyin(c) {
    /* 优先走全题库索引（覆盖 poly 多音字、所有年级、组词首字），覆盖率最高 */
    var idx = indexPinyin(c);
    if (idx) return idx;
    /* 兜底：原遍历逻辑（兼容仅出现在组词/例句里的字） */
    try {
      var WB = window.WORD_BANK;
      if (!WB) return '';
      var secs = ['shizi', 'cihui', 'idioms', 'xiezi'];
      for (var gk in WB) {
        var bank = WB[gk];
        if (!bank) continue;
        for (var s = 0; s < secs.length; s++) {
          var groups = bank[secs[s]] || {};
          for (var lab in groups) {
            var arr = groups[lab];
            if (!arr || !arr.length) continue;
            for (var i = 0; i < arr.length; i++) {
              if (!arr[i] || typeof arr[i] !== 'object') continue;
              if (arr[i].c === c) return arr[i].p || '';
              var ww = Array.isArray(arr[i].w) ? arr[i].w : [];
              for (var k = 0; k < ww.length; k++) if (ww[k] === c) return arr[i].p || '';
            }
          }
        }
      }
    } catch (e) {}
    return '';
  }
  function renderStats() {
    var host = document.getElementById('wordStats');
    if (!host) return;
    host.classList.add('word-stats-foot');
    var rows = Store.wrongByDay(7);
    var todayN = Store.todayWrong();
    var chips = rows.map(function (r) {
      var clickable = r.count > 0;
      var cls = 'wc-chip' + (r.isToday ? ' today' : '') + (clickable ? ' click' : '') +
        (statsSel === r.key ? ' sel' : '');
      var attr = clickable ? (' onclick="Words.toggleStats(\'' + r.key + '\')"') : '';
      return '<div class="' + cls + '"' + attr + '>' +
        '<span class="wc-d">' + r.md + (clickable ? ' ▾' : '') + '</span>' +
        '<span class="wc-n">' + r.count + '</span>' +
        '<span class="wc-u">个</span>' +
      '</div>';
    }).join('');

    var detail = '';
    if (statsSel) {
      var selRow = null;
      for (var i = 0; i < rows.length; i++) if (rows[i].key === statsSel) { selRow = rows[i]; break; }
      var chars = Store.wrongCharsOf(statsSel);
      var tiles = (chars && chars.length)
        ? chars.map(function (c) {
            var py = lookupPinyin(c);
            return '<div class="wc-glyph"><span class="wc-g">' + c + '</span>' +
              (py ? '<span class="wc-py">' + py + '</span>' : '') + '</div>';
          }).join('')
        : '<div class="wc-empty">这一天还没有错字记录</div>';
      var label = selRow ? selRow.md : statsSel;
      detail = '<div class="wc-detail">' +
        '<div class="wc-detail-head"><span>' + label + ' · 写错的字（' + chars.length + '）</span>' +
        '<span class="wc-close" onclick="Words.toggleStats()">收起 ✕</span></div>' +
        '<div class="wc-glyphs">' + tiles + '</div>' +
      '</div>';
    }

    host.innerHTML =
      '<div class="wc-head">' +
        '<span class="wc-title">错字统计 · 按天</span>' +
        '<span class="wc-today' + (todayN ? ' has' : '') + '">今日 ' + todayN + ' 个</span>' +
      '</div>' +
      '<div class="wc-row">' + chips + '</div>' + detail;
  }
  /* 点击日期格展开/收起具体错字 */
  function toggleStats(key) {
    if (key === undefined || key === null || key === '') statsSel = null;
    else statsSel = (statsSel === key) ? null : key;
    renderStats();
  }

  /* 成语范读：播放预录 AI 浑厚男声，播完 1 秒后自动下一张 */
  var fanTok = 0;
  function playIdiom(item) {
    if (!state || state.locked) return;
    state.locked = true;
    var tok = ++fanTok;
    var fanBtn = document.getElementById('fanBtn');
    var tip = document.getElementById('voiceTip');
    if (fanBtn) { fanBtn.classList.add('playing'); fanBtn.textContent = '🔊 朗读中…'; }
    if (tip) tip.textContent = '正在播放标准范读…';
    Sfx.idiomRead(item.c, function () {
      if (tok !== fanTok) return;
      state.locked = false; /* 播完即解锁：范读可重听，不会卡死 */
      if (fanBtn) { fanBtn.classList.remove('playing'); fanBtn.textContent = '🔊 听范读'; }
      if (tip) tip.textContent = '1 秒后自动下一张…';
      setTimeout(function () {
        if (tok !== fanTok) return;
        next();
      }, 1000);
    });
  }
  function skipIdiom() {
    fanTok++;                 /* 取消待触发的自动下一张 */
    state.locked = false;
    next();
  }

  function render() {
    var host = document.getElementById('wordStage');
    /* 清掉上一张残留的特效（飞分/冲击波/碎片），避免遗留到下一张 */
    if (FX.clearFx) FX.clearFx();
    try {
    if (!state || !state.queue) {
      host.innerHTML = '<div class="summary"><h3>游戏未初始化</h3><p class="muted">请重新选择课次或刷新页面</p></div>';
      return;
    }
    if (state.i >= state.queue.length) return summary(host);

    var item = state.queue[state.i];
    if (!item) {
      host.innerHTML = '<div class="summary"><h3>卡牌数据异常</h3><p class="muted">当前题目数据读取失败，请刷新页面重试</p></div>';
      return;
    }
    var right = item.p || '';
    var isPoly = item.kind === 'poly';
    var isIdiom = item.kind === 'idiom';
    var opts, conf = { text: '', kind: '' };
    if (!isIdiom) {
      if (isPoly) opts = shuffle((item.opts || []).slice());
      else {
        /* 拼音补全：单字直接查；词组(多字错字)拆成单字逐个查，取首个能查到的字读音
           这样既支持"天空"这类词组错字，也保证一定能出拼音选项，绝不退化成显示汉字 */
        if (!right && item.c) right = lookupPinyin(item.c);
        if (!right && item.c && item.c.length > 1) {
          for (var ci = 0; ci < item.c.length; ci++) {
            var one = lookupPinyin(item.c.charAt(ci));
            if (one) { right = one; break; }
          }
        }
        conf = right ? Pinyin.confuse(right) : { text: '', kind: '' };
        /* 多音字保护：若干扰项 conf.text 恰好是该字另一个正确读音（如"似"的 sì/shì），
           两个选项都正确会让孩子困惑。此时丢弃易混维度，改为纯声调区分（同声韵换声调）。 */
        if (right && conf.text && item.c && conf.text !== right) {
          var cps = charPinyins(item.c);
          if (cps.length > 1 && cps.indexOf(Pinyin.plain(conf.text)) >= 0) {
            var pObj = Pinyin.parse(right);
            var tones = [1, 2, 3, 4].filter(function (t) { return t !== pObj.tone; });
            var nt = tones[Math.floor(Math.random() * tones.length)];
            conf = { text: Pinyin.compose(pObj.base, nt), kind: '声调' };
          }
        }
        opts = Math.random() < 0.5 ? [right, conf.text] : [conf.text, right];
      }
    }
    var glyph = isPoly ? (item.ctx || item.c) : (item.c || '');
    var glyphCls = glyph.length >= 4 ? 'w4' : glyph.length === 3 ? 'w3' : glyph.length === 2 ? 'w2' : '';
    var g = Store.get();
    if (typeof window !== 'undefined' && window.__WORDS_DBG) console.log('DBG', JSON.stringify({c:item.c,p:item.p,right:right,kind:item.kind,isReview:item.isReview,opts:opts,conf:conf&&conf.kind,gt:g.wordType}));
    var gradeInfo = WORD_BANK[g.grade] || WORD_BANK['1a'];
    var typeName = { zi: '识字表', ci: '词语表', idiom: '成语', poly: '多音字' }[item.kind] || '识字表';
    if (isIdiom) Sfx.preloadVoice && Sfx.preloadVoice(item.c);

    var cardInner = isIdiom
      ? '<div class="card-corner tl">✦</div>' +
        '<div class="card-grade">' + gradeInfo.name + '</div>' +
        '<div class="card-glyph ' + glyphCls + '">' + glyph + '</div>' +
        '<div class="card-hint">点击 🔊 听标准范读</div>' +
        '<div class="card-meta">' +
          '<span class="card-type">' + typeName + '</span>' +
          (item.lesson ? '<span class="card-lesson">' + item.lesson + '</span>' : '') +
        '</div>' +
        (item.d ? '<div class="card-def"><span class="cd-tag">释义</span><span>' + item.d + '</span></div>' : '') +
        (item.s ? '<div class="card-sent"><span class="cs-tag">例句</span><span>' + item.s + '</span></div>' : '') +
        '<div class="card-corner br">✦</div>'
      : '<div class="card-corner tl">✦</div>' +
        '<div class="card-grade">' + gradeInfo.name + '</div>' +
        '<div class="card-glyph ' + glyphCls + '">' + glyph + '</div>' +
        '<div class="card-hint">' + (isPoly ? '「' + (item.c || '') + '」在这个词语里读什么？' : '选出正确读音') + '</div>' +
        '<div class="card-meta">' +
          '<span class="card-type">' + typeName + '</span>' +
          (item.lesson ? '<span class="card-lesson">' + item.lesson + '</span>' : '') +
        '</div>' +
        '<div class="card-corner br">✦</div>';

    var controlsHtml;
    if (isIdiom) {
      controlsHtml =
        '<div class="voice-ctl" id="voiceCtl">' +
          '<button class="listen-btn big" id="fanBtn">🔊 听范读</button>' +
          '<button class="next-btn ghost" id="nextBtn">下一张 ›</button>' +
          '<div class="voice-tip" id="voiceTip">点击🔊听标准范读，播完 1 秒后自动下一张</div>' +
        '</div>';
    } else {
      controlsHtml =
        '<div class="choices" id="choices">' +
          (opts || []).map(function (p, idx) {
            return '<div class="choice" data-p="' + (p || '') + '" data-i="' + idx + '">' + (p || '') + '</div>';
          }).join('') +
        '</div>';
    }

    host.innerHTML =
      '<div class="quiz-wrap">' +
        '<div class="battle-hud">' +
          '<div class="hud-box"><i>SCORE</i><b id="scoreVal">' + state.score + '</b></div>' +
          '<div class="hud-box"><i>COMBO</i><b id="comboVal">' + state.combo + '</b></div>' +
          '<div class="hud-box"><i>第 ' + (state.i + 1) + ' / ' + state.queue.length + ' 张' + (state.extraCount ? '<span style="color:var(--gold-2);font-size:10px;margin-left:4px">含熔炉复习</span>' : '') + '</i><b id="accVal">' +
            (state.right + state.wrong ? Math.round(state.right / (state.right + state.wrong) * 100) : 100) + '%</b></div>' +
          '<div class="hud-box"><i>剩余</i><b id="remainVal">' + (state.queue.length - state.i) + '</b><span style="font-size:10px;color:rgba(232,217,187,.55);margin-left:3px">张</span></div>' +
          '<div class="hud-box hud-timer"><i>计时</i><b id="timerDisp-words">00:00</b>' +
            '<span class="hud-timer-ctrls">' +
              '<button class="hud-tbtn" id="timerStart-words" onclick="Timer.start(\'words\')">开始</button>' +
              '<button class="hud-tbtn" id="timerPause-words" style="display:none" onclick="Timer.pause(\'words\')">暂停</button>' +
              '<button class="hud-tbtn" onclick="Timer.reset(\'words\')">重置</button>' +
            '</span>' +
          '</div>' +
        '</div>' +
        '<div class="quiz-row">' +
          '<div class="card-slot">' +
            '<div class="gcard deal" id="theCard">' + cardInner + '</div>' +
          '</div>' +
          '<div id="afterSlot"></div>' +
        '</div>' +
        controlsHtml +
        '<div class="word-stats" id="wordStats"></div>' +
      '</div>';

    if (window.Timer) { Timer.update('words'); Timer.sync('words'); }
    renderStats(); /* 每帧把错字统计渲染到选项下方 */
    Sfx.deal();
    state.locked = false;
    persistCards();
    if (state.combo >= 3 && FX && FX.comboFire) FX.comboFire(state.combo);
    if (isIdiom) {
      var fanBtn = document.getElementById('fanBtn');
      var nextBtn = document.getElementById('nextBtn');
      if (fanBtn) fanBtn.addEventListener('click', function () { playIdiom(item); });
      if (nextBtn) nextBtn.addEventListener('click', function () { skipIdiom(); });
    } else {
      var choicesEl = document.getElementById('choices');
      if (choicesEl) {
        choicesEl.addEventListener('click', function (e) {
          var el = e.target.closest('.choice');
          if (!el || state.locked) return;
          answer(el, el.dataset.p === right, item, right);
        });
      }
    }
  } catch (e) {
    window.console && console.error('Words render error:', e);
    host.innerHTML = '<div class="summary"><h3>卡牌渲染出错</h3><p class="muted">' + (e && e.message ? e.message : String(e)) + '</p><p class="muted">请刷新页面重试</p></div>';
  }
  }


  /* 多音字：两个读音 + 各自组词 展示面板 */
  function polyReadsHtml(item) {
    if (!item.reads || !item.reads.length) return '';
    var rows = item.reads.map(function (rd) {
      var ws = (rd.w || []).slice(0, 3).join('、');
      return '<div class="poly-read' + (rd.p === item.p ? ' cur' : '') + '">' +
        '<span class="pr-p">' + rd.p + '</span>' +
        '<span class="pr-words">' + (ws || '—') + '</span>' +
      '</div>';
    }).join('');
    return '<div class="poly-reads">' +
      '<div class="poly-reads-title">「' + item.c + '」有两个读音</div>' +
      '<div class="poly-read-list">' + rows + '</div>' +
    '</div>';
  }

    /* 连击奖励动画 + 语音（卡片答对 与 听写打勾 共用） */
  function reward(combo, anchor, gain, scoreEl, comboEl, sayText) {
    var lv = comboLevel(combo);
    if (anchor) { anchor.classList.add('hit'); FX.impact(lv, anchor, ''); }  /* 不显示积分数字 */
    FX.flame(anchor, combo);                    // 连对火焰粒子爆发
    FX.comboFire(combo);                        // Combo 持续燃烧效果
    Sfx.comboFx(combo, true);                   // 20 档古风器乐音效（不念英文，改用预录浑厚男声）
    Sfx.wordsCorrect(combo);                     // 答对激励：预录 AI 浑厚男声（云扬）
    if (scoreEl) { FX.pop(scoreEl); FX.flicker(scoreEl); }
    if (comboEl) { FX.pop(comboEl); comboEl.textContent = combo; }
    if (combo === 3) FX.banner('COMBO ×3', '#55d6ff', 52);
    if (combo === 5) FX.banner('太棒了 ×5', '#ffe0a3', 58);
    if (combo === 7) FX.banner('势不可挡 ×7', '#ff5fd0', 64);
    if (combo >= 10 && combo % 5 === 0) FX.banner('学堂之光 ×' + combo, '#ff5fd0', 72);
    if (sayText && combo < 3 && combo % 5 !== 0) setTimeout(function () {
      /* 做对只读生字 */
      Sfx.say(sayText.c || sayText, { rate: 0.9, pitch: 1.05 });
    }, 260);
    return lv;
  }

  function answer(el, ok, item, rightP) {
    state.locked = true;
    var g = Store.get();
    document.querySelectorAll('.choice').forEach(function (c) { c.classList.add('locked'); });

    if (ok) {
      el.classList.add('right');
      state.combo++; state.right++;
      state.maxCombo = Math.max(state.maxCombo, state.combo);
      state.marks[state.i] = 1;

      var lv = comboLevel(state.combo);
      var gain = 10 * lv + state.combo * 2;
      var prev = state.score;
      state.score += gain;

      /* 音效/动画/存档统一兜底：任何异常都不影响"出下一张" */
      try {
        var sv = document.getElementById('scoreVal'), cv = document.getElementById('comboVal');
        reward(state.combo, document.getElementById('theCard'), gain, sv, cv, item);
        FX.countTo(sv, prev, state.score, 380);
        Store.bump('words');
        Store.hitMistake(item.c);
        if (Store.addXp(4 + lv)) {
          Sfx.fanfare(); FX.banner('LEVEL UP  ' + Store.get().lv, '#ffe0a3', 60);
          App.toast('等级提升！现在是 ' + Store.get().lv + ' 级');
        }
        App.syncHud();
      } catch (err) { if (window.console) console.error('reward err', err); }
      setTimeout(next, 900);
    } else {
      el.classList.add('wrong');
      document.querySelectorAll('.choice').forEach(function (c) {
        if (c.dataset.p === rightP) c.classList.add('right');
      });
      state.combo = 0; state.wrong++;
      state.marks[state.i] = 0;
      document.getElementById('theCard').classList.add('miss');
      FX.shake('bad'); FX.strobe(true);
      FX.comboFireReset();                    // 火焰熄灭
      Sfx.miss();                               // 答错只保留"啊哦"音效
      document.getElementById('comboVal').textContent = 0;
      var isNew = !Store.get().mistakes[item.c];
      Store.addMistake(item, g.grade, item.kind === 'poly' ? 'poly' : (item.c.length > 1 ? 'ci' : 'zi'), 'card');
      Store.addWrongChar(item.c); renderStats();   /* 实时更新按天错字统计 */
      if (isNew) Store.log('words', '新增错题', item.c + '（' + rightP + '）· ' + WORD_BANK[g.grade].name + ' · ' + (item.lesson || ''), { c: item.c, p: rightP });
      App.syncHud();
      showCorrection(item, rightP);
    }
  }

  function showCorrection(item, rightP) {
    var words = (item.w && item.w.length ? item.w : lookupWords(item.c)).slice(0, 3);
    if (!words.length) words = [item.c];
    var polyInfo = '';
    if (item.kind === 'poly') {
      /* 展示两个读音 + 各自组词 */
      var reads = (item.reads && item.reads.length ? item.reads : [{ p: rightP, d: item.def, w: item.mw }]);
      var readRows = reads.map(function (rd) {
        var ws = (rd.w || []).slice(0, 3).join('、');
        return '<div class="poly-read' + (rd.p === rightP ? ' cur' : '') + '">' +
          '<span class="pr-p">' + rd.p + '</span>' +
          (rd.d ? '<span class="pr-def">' + rd.d + '</span>' : '') +
          '<span class="pr-words">' + (ws || '—') + '</span>' +
        '</div>';
      }).join('');
      polyInfo = '<div class="poly-reads">' +
        '<div class="poly-reads-title">「' + item.c + '」有两个读音</div>' +
        '<div class="poly-read-list all">' + readRows + '</div>' +
      '</div>';
    }
    var ct = item.kind === 'poly' ? '多音字 · 两个读音都记牢'
           : item.kind === 'idiom' ? '成语读音 · 听范读记牢'
           : '读音记牢 · 组词';
    var body;
    if (item.kind === 'poly') {
      body = polyInfo;
    } else if (item.kind === 'idiom') {
      body = '<div class="idiom-fix">' +
        '<div class="cr-char"><span class="big-char">' + item.c + '</span><span class="big-p">' + rightP + '</span></div>' +
        (item.d ? '<div class="idiom-def"><b>释义</b><span>' + item.d + '</span></div>' : '') +
        (item.s ? '<div class="idiom-sent"><b>例句</b><span>' + item.s + '</span></div>' : '') +
      '</div>';
    } else {
      body = '<div class="cr-row">' +
        '<div class="cr-char"><span class="big-char">' + item.c + '</span><span class="big-p">' + rightP + '</span></div>' +
        '<div class="cr-info">' +
          '<div class="words">' + words.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>' +
        '</div>' +
      '</div>';
    }
    document.getElementById('afterSlot').innerHTML =
      '<div class="correction">' +
        '<div class="ct">' + ct + '</div>' +
        body +
        '<div class="acts">' +
          '<button class="btn-main ghost" onclick="Words.speakFix(\'' + item.c + '\')">听一遍</button>' +
          '<button class="btn-main disabled" id="corrNext" onclick="">播放完语音后继续</button>' +
        '</div>' +
      '</div>';
    setTimeout(function () {
      /* 用预生成 AI 语音（edge-tts 微软神经网络）朗读：字 + 组词 + 成语，
         有感情的语调，播完才亮起"继续"按钮 */
      var lit = false;
      function lightNext() {
        if (lit) return; lit = true;
        var btn = document.getElementById("corrNext");
        if (btn) { btn.classList.remove("disabled"); btn.setAttribute("onclick", "Words.next()"); btn.textContent = "记住了，继续"; }
      }
      /* 稳定性兜底：语音回调 8 秒内未到（网络慢 / 语音引擎异常）也强制放行，
         绝不让孩子卡死在"播放完语音后继续" */
      var guard = setTimeout(lightNext, 8000);
      Sfx.teacherRead([item.c], "", function () { clearTimeout(guard); lightNext(); });
    }, 400);
  }

  function speakFix(c) { Sfx.teacherRead([c], '', null); }
  function next() { state.i++; render(); }

  function summary(host) {
    FX.comboFireReset();
    Session.clear('words');
    Sfx.bgmStop();
    var total = state.right + state.wrong;
    var acc = total ? Math.round(state.right / total * 100) : 0;
    var rank = acc === 100 ? 'S' : acc >= 90 ? 'A' : acc >= 75 ? 'B' : acc >= 60 ? 'C' : 'D';
    var color = { S: '#ff5fd0', A: '#ffe0a3', B: '#55d6ff', C: '#7dff9b', D: '#ff4a5e' }[rank];
    Store.setBest(state.maxCombo, state.score);
    var g = Store.get();
    Store.setPB(g.grade, g.wordType, state.score);
    var pct = Store.beatPercent(acc, state.maxCombo);
    Store.addXp(state.score >= 200 ? 20 : 10);
    Store.log('words', '识字检测', '完成 ' + total + ' 题 · 正确率 ' + acc + '% · 得分 ' + state.score + ' 分',
      { right: state.right, wrong: state.wrong, score: state.score, acc: acc, maxCombo: state.maxCombo });
    App.syncHud();
    Sfx.finish();
    if (acc === 100) { Store.grantBadge('perfect'); FX.banner('PERFECT', '#ff5fd0', 74); }
    if (state.maxCombo >= 10) Store.grantBadge('combo10');
    if (acc >= 90) Sfx.settleWin(state.score); else if (acc < 60) Sfx.settleFail(); else Sfx.settleWin(state.score);

    host.innerHTML =
      '<div class="summary">' +
        '<h3>回合结算</h3>' +
        User.settleStage(rank, color) +
        '<div class="rank" style="color:' + color + '">' + rank + '</div>' +
        '<div class="rank-sub">正确率 ' + acc + '%</div>' +
        '<div class="sline">' +
          '<div><i>得分</i><b>' + state.score + '</b></div>' +
          '<div><i>正确</i><b>' + state.right + '/' + total + '</b></div>' +
          '<div><i>最高连击</i><b>' + state.maxCombo + '</b></div>' +
          '<div><i>正确率</i><b>' + acc + '%</b></div>' +
        '</div>' +
        '<div class="beat-box"><span class="beat-num">' + pct + '%</span>' +
          '<span class="beat-txt">超过全国 ' + pct + '% 的小朋友</span>' +
          '<span class="beat-bar"><i style="width:' + pct + '%"></i></span></div>' +
        '<div class="sum-acts">' +
          '<button class="btn-main" onclick="Words.start()">再来一局</button>' +
          (state.wrong ? '<button class="btn-main ghost" onclick="App.go(\'review\')">去熔炉复习错字</button>' : '') +
          '<button class="btn-main ghost" onclick="App.go(\'home\')">返回大厅</button>' +
        '</div>' +
      '</div>';
    setTimeout(function () {
      Sfx.say(acc >= 90 ? '太出色了，这一局几乎全对！' : acc >= 70 ? '不错，继续加油！' : '别灰心，去熔炉把错字练熟就好。', { rate: 1 });
    }, 500);
  }

  /* ================= 二、写字表听写（高考听力风格） ================= */

  function num(n) {
    var cn = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
    if (n <= 10) return cn[n];
    if (n < 20) return '十' + cn[n - 10];
    return cn[Math.floor(n / 10)] + '十' + (n % 10 ? cn[n % 10] : '');
  }

  /* 每题的朗读词串：字 + 四个组词（最后一个是成语） */
  function readingOf(it) {
    var ws = (it.d && it.d.length ? it.d : it.w) || [];
    ws = ws.slice(0, 4);
    return it.c + '。' + (ws.length ? ws.join('，') + '。' : '');
  }

  function dictIntro() {
    FX.comboFireReset();
    var g = Store.get();
    var pool = bank('xie', g.lesson, g.unit);
    var host = document.getElementById('wordStage');
    if (!pool.length) {
      host.innerHTML = '<div class="summary"><h3>本册暂无写字表数据</h3>' +
        '<p class="muted">换一个年级试试。</p></div>';
      return;
    }
    var n = Math.min(DICT_N, pool.length);
    dict = { queue: shuffle(pool).slice(0, n), i: 0, phase: 'intro', playing: false,
             marks: [], score: 0, combo: 0, maxCombo: 0, right: 0, wrong: 0,
             pause: (g.dictPause || 6), repeat: 2 };

    persistDict();
    host.innerHTML =
      '<div class="exam-paper">' +
        '<div class="exam-head">' +
          '<div class="exam-seal">听写</div>' +
          '<h3>' + WORD_BANK[g.grade].name + ' · 写字表听写测试</h3>' +
          '<div class="exam-sub">' + (g.lesson && g.lesson !== '__all__' ? g.lesson + ' · ' : '') +
            '共 ' + n + ' 个生字 · 每题朗读两遍' + '</div>' +
        '</div>' +
        '<ol class="exam-notice">' +
          '<li>请先准备好纸和笔，坐姿端正。</li>' +
          '<li>每个生字会朗读四个词语，最后一个是成语，请据此写出对应的汉字。</li>' +
          '<li>每题朗读两遍，两遍之后有 <b id="pauseTxt">' + dict.pause + '</b> 秒书写时间。</li>' +
          '<li>全部听写结束后，请对照答案自行批改。</li>' +
        '</ol>' +
        '<div class="exam-set">' +
          '<span>书写时间</span>' +
          '<div class="seg small" id="pauseSeg">' +
            [4, 6, 8, 12].map(function (s) {
              return '<button data-s="' + s + '"' + (s === dict.pause ? ' class="on"' : '') + '>' + s + '秒</button>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<div class="sum-acts">' +
          '<button class="btn-main" id="examStart">开始听写</button>' +
          '<button class="btn-main ghost" onclick="Words.dictSkipToSheet()">直接看答案</button>' +
        '</div>' +
      '</div>';

    document.getElementById('pauseSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      dict.pause = parseInt(b.dataset.s, 10);
      Store.get().dictPause = dict.pause; Store.save();
      document.getElementById('pauseTxt').textContent = dict.pause;
      this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
      Sfx.tick();
    });
    document.getElementById('examStart').addEventListener('click', function () {
      Sfx.unlock(); Sfx.openQuiz('dict'); dictRun();
    });
  }

  function dictRun() {
    dict.phase = 'reading';
    dict.i = 0;
    renderPlayer();
    var n = dict.queue.length;
    Sfx.speakSeq([
      { chime: 'up', gap: 500 },
      { vp: 'dict/start', gap: 500 },
      { vp: 'dict/intro_pre', gap: 200 },
      { vp: 'math/num_' + n, gap: 200 },
      { vp: 'dict/intro_suf', gap: 400 },
      { vp: 'dict/rule', gap: 400 },
      { vp: 'dict/q1', gap: 700 }
    ], function () { speakItem(0); });
  }

  /* 组词逐个朗读（女教师范读：词间停顿 0.4 秒，重读饱满） */
  function wordSeq(it, lead) {
    var seq = [];
    var ws = (it.d && it.d.length ? it.d : it.w) || [];
    ws = ws.slice(0, 4);
    seq.push({ text: (lead || '') + it.c + '。', rate: 0.86, pitch: 1.04, gap: 320 });
    ws.forEach(function (w, i) {
      seq.push({ text: w, rate: 0.84, pitch: (i % 2 ? 1.06 : 1.03), gap: 400 });
    });
    seq.push({ text: '', gap: 300 });
    return seq;
  }

  function speakItem(idx) {
    if (!dict || dict.phase !== 'reading') return;
    if (idx >= dict.queue.length) return dictFinish();
    dict.i = idx;
    dict.playing = true;
    renderPlayer();
    var it = dict.queue[idx];
    /* 使用预生成 AI 语音：第X题 → 字词朗读 → 再读一遍 → 字词朗读 */
    var seq = [
      { beep: true, gap: 320 },
      { text: '第' + num(idx + 1) + '题。', gap: 260 },
      { vpWord: it.c, gap: 320 },
      { text: '再读一遍。', gap: 260 },
      { vpWord: it.c, gap: 500 }
    ];
    Sfx.speakSeq(seq, function () {
      if (!dict || dict.phase !== 'reading') return;
      countdownWrite(function () { speakItem(idx + 1); });
    });
  }

  /* 书写倒计时 */
  function countdownWrite(done) {
    var left = dict.pause;
    var el = document.getElementById('examCount');
    var ring = document.getElementById('examRing');
    if (el) el.textContent = left;
    if (ring) ring.classList.add('writing');
    var st = document.getElementById('examStatus');
    if (st) st.textContent = '书写时间';
    dict.timer = setInterval(function () {
      if (!dict || dict.phase !== 'reading') { clearInterval(dict && dict.timer); return; }
      left--;
      if (el) el.textContent = Math.max(0, left);
      if (left <= 0) {
        clearInterval(dict.timer); dict.timer = null;
        if (ring) ring.classList.remove('writing');
        Sfx.examTick();
        done();
      }
    }, 1000);
  }

  function renderPlayer() {
    var host = document.getElementById('wordStage');
    var g = Store.get();
    var n = dict.queue.length, cur = dict.i + 1;
    host.innerHTML =
      '<div class="exam-player">' +
        '<div class="exam-topbar">' +
          '<span class="exam-tag">听写进行中</span>' +
          '<span class="exam-grade">' + WORD_BANK[g.grade].name + ' · 写字表</span>' +
        '</div>' +
        '<div class="exam-ring" id="examRing">' +
          '<div class="exam-wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
          '<div class="exam-qno">第 ' + cur + ' 题</div>' +
          '<div class="exam-status" id="examStatus">正在播报…</div>' +
          '<div class="exam-count" id="examCount">·</div>' +
        '</div>' +
        '<div class="exam-bar"><i style="width:' + Math.round(cur / n * 100) + '%"></i></div>' +
        '<div class="exam-progress">' + cur + ' / ' + n + '</div>' +
        '<div class="exam-hint">请在纸上写出听到的汉字，不要看屏幕提示。</div>' +
        '<div class="sum-acts">' +
          '<button class="btn-main ghost" onclick="Words.dictReplay()">重播本题</button>' +
          '<button class="btn-main ghost" onclick="Words.dictNext()">下一题</button>' +
          '<button class="btn-main" onclick="Words.dictSkipToSheet()">结束并批改</button>' +
        '</div>' +
      '</div>';
    persistDict();
  }

  function clearTimer() { if (dict && dict.timer) { clearInterval(dict.timer); dict.timer = null; } }
  function dictReplay() { if (!dict) return; Sfx.stopSeq(); clearTimer(); speakItem(dict.i); }
  function dictNext() { if (!dict) return; Sfx.stopSeq(); clearTimer(); speakItem(dict.i + 1); }

  function dictFinish() {
    Sfx.stopSeq(); clearTimer();
    dict.phase = 'grade';
    Sfx.speakSeq([
      { vp: 'dict/end', gap: 400 },
      { vp: 'dict/grade', gap: 200 },
      { chime: 'down' }
    ]);
    renderSheet();
  }

  function dictSkipToSheet() {
    if (!dict) return;
    Sfx.stopSeq(); clearTimer();
    dict.phase = 'grade';
    renderSheet();
  }

  /* ---------- 批改答题卡 ---------- */
  function renderSheet() {
    var host = document.getElementById('wordStage');
    var g = Store.get();
    host.innerHTML =
      '<div class="battle-hud">' +
        '<div class="hud-box"><i>SCORE</i><b id="scoreVal">' + dict.score + '</b></div>' +
        '<div class="hud-box"><i>COMBO</i><b id="comboVal">' + dict.combo + '</b></div>' +
        '<div class="hud-box"><i>已批改</i><b id="doneVal">' + gradedCount() + ' / ' + dict.queue.length + '</b></div>' +
        '<div class="hud-box hud-timer"><i>计时</i><b id="timerDisp-words">00:00</b>' +
          '<span class="hud-timer-ctrls">' +
            '<button class="hud-tbtn" id="timerStart-words" onclick="Timer.start(\'words\')">开始</button>' +
            '<button class="hud-tbtn" id="timerPause-words" style="display:none" onclick="Timer.pause(\'words\')">暂停</button>' +
            '<button class="hud-tbtn" onclick="Timer.reset(\'words\')">重置</button>' +
          '</span>' +
        '</div>' +
      '</div>' +
      '<div class="sheet-head">' +
        '<h3>听写答案 · 请逐个批改</h3>' +
        '<p class="muted">写对了点 <b class="ok-t">✓</b>，写错了点 <b class="no-t">✗</b>。打叉的字会自动进入错字熔炉，并记录今天的日期。</p>' +
      '</div>' +
      '<div class="sheet" id="sheet">' +
        dict.queue.map(function (it, i) { return sheetRow(it, i); }).join('') +
      '</div>' +
      '<div class="sum-acts">' +
        '<button class="btn-main ghost" onclick="Words.dictAllRight()">全部写对</button>' +
        '<button class="btn-main" id="sheetDone" onclick="Words.dictSummary()">完成批改</button>' +
      '</div>';
    if (window.Timer) { Timer.update('words'); Timer.sync('words'); }
    document.getElementById('sheet').addEventListener('click', function (e) {
      var b = e.target.closest('.mk'); if (!b) return;
      mark(parseInt(b.dataset.i, 10), b.dataset.v === '1', b);
    });
    persistDict();
  }

  function sheetRow(it, i) {
    var mk = dict.marks[i];
    var ws = (it.d && it.d.length ? it.d : it.w) || [];
    return '<div class="srow ' + (mk === 1 ? 'is-ok' : mk === 0 ? 'is-no' : '') + '" id="srow' + i + '">' +
      '<div class="sno">' + (i + 1) + '</div>' +
      '<div class="sglyph">' + it.c + '</div>' +
      '<div class="sinfo">' +
        '<div class="spy">' + it.p + '</div>' +
        '<div class="sws">' + ws.map(function (w, k) {
          return '<span' + (k === ws.length - 1 && it.idiom ? ' class="idm"' : '') + '>' + w + '</span>';
        }).join('') + '</div>' +
      '</div>' +
      '<div class="smarks">' +
        '<button class="mk ok' + (mk === 1 ? ' on' : '') + '" data-i="' + i + '" data-v="1">✓</button>' +
        '<button class="mk no' + (mk === 0 ? ' on' : '') + '" data-i="' + i + '" data-v="0">✗</button>' +
      '</div>' +
      '<button class="sspk" onclick="Words.dictSay(' + i + ')">🔊</button>' +
    '</div>';
  }

  function gradedCount() {
    return dict.marks.filter(function (m) { return m === 0 || m === 1; }).length;
  }

  function mark(i, ok, btn) {
    if (dict.marks[i] === (ok ? 1 : 0)) return;
    var g = Store.get(), it = dict.queue[i];
    var prevMark = dict.marks[i];
    if (prevMark === 1) { dict.right--; }
    if (prevMark === 0) { dict.wrong--; }
    dict.marks[i] = ok ? 1 : 0;

    var row = document.getElementById('srow' + i);
    row.classList.toggle('is-ok', ok);
    row.classList.toggle('is-no', !ok);
    row.querySelectorAll('.mk').forEach(function (b) {
      b.classList.toggle('on', (b.dataset.v === '1') === ok);
    });

    if (ok) {
      dict.right++;
      dict.combo++;
      dict.maxCombo = Math.max(dict.maxCombo, dict.combo);
      var lv = comboLevel(dict.combo);
      var gain = 12 * lv + dict.combo * 2;
      var prev = dict.score;
      dict.score += gain;
      try {
        var sv = document.getElementById('scoreVal'), cv = document.getElementById('comboVal');
        reward(dict.combo, row, gain, sv, cv, it.c);
        FX.countTo(sv, prev, dict.score, 380);
        Store.bump('words');
        Store.hitMistake(it.c);
        if (Store.addXp(5 + lv)) {
          Sfx.fanfare(); FX.banner('LEVEL UP  ' + Store.get().lv, '#ffe0a3', 60);
          App.toast('等级提升！现在是 ' + Store.get().lv + ' 级');
        }
      } catch (err) { if (window.console) console.error('mark ok err', err); }
    } else {
      dict.wrong++;
      dict.combo = 0;
      FX.comboFireReset();
      document.getElementById('comboVal').textContent = 0;
      row.classList.add('shake-no');
      setTimeout(function () { row.classList.remove('shake-no'); }, 420);
      FX.shake('bad');
      Sfx.miss();
      var isNew = !Store.get().mistakes[it.c];
      Store.addMistake(it, g.grade, 'zi', 'dictation');
      Store.addWrongChar(it.c); renderStats();     /* 实时更新按天错字统计 */
      Store.log('words', '听写错字', it.c + '（' + it.p + '）· ' + WORD_BANK[g.grade].name +
        ' · ' + (it.lesson || '') + ' · ' + Store.today(), { c: it.c, p: it.p, date: Store.today(), src: 'dictation' });
      setTimeout(function () { Sfx.teacherRead([it.c], '', null); }, 260);
    }
    document.getElementById('doneVal').textContent = gradedCount() + ' / ' + dict.queue.length;
    persistDict();
    App.syncHud();
  }

  function dictAllRight() {
    dict.queue.forEach(function (it, i) {
      if (dict.marks[i] !== 1) {
        var b = document.querySelector('.mk.ok[data-i="' + i + '"]');
        if (b) mark(i, true, b);
      }
    });
  }

  function dictSay(i) {
    var it = dict.queue[i];
    Sfx.teacherRead([it.c], '', null);
  }

  function dictSummary() {
    FX.comboFireReset();
    Session.clear('words');
    var host = document.getElementById('wordStage');
    var g = Store.get();
    var total = dict.queue.length;
    var graded = gradedCount();
    if (!graded) { App.toast('先给每个字打勾或打叉吧'); return; }
    var acc = graded ? Math.round(dict.right / graded * 100) : 0;
    var rank = acc === 100 ? 'S' : acc >= 90 ? 'A' : acc >= 75 ? 'B' : acc >= 60 ? 'C' : 'D';
    var color = { S: '#ff5fd0', A: '#ffe0a3', B: '#55d6ff', C: '#7dff9b', D: '#ff4a5e' }[rank];
    Store.setBest(dict.maxCombo, dict.score);
    Store.setPB(g.grade, 'xie', dict.score);
    var pct = Store.beatPercent(acc, dict.maxCombo);
    Store.addXp(dict.score >= 200 ? 24 : 12);
    Store.log('words', '写字表听写',
      '听写 ' + total + ' 字 · 写对 ' + dict.right + ' · 写错 ' + dict.wrong + ' · 正确率 ' + acc + '% · ' + Store.today(),
      { right: dict.right, wrong: dict.wrong, acc: acc, score: dict.score, grade: g.grade, date: Store.today() });
    App.syncHud();
    Sfx.finish();
    if (acc === 100 && graded === total) { Store.grantBadge('perfect'); FX.banner('PERFECT', '#ff5fd0', 74); }
    if (dict.maxCombo >= 10) Store.grantBadge('combo10');
    if (acc >= 90) Sfx.settleWin(dict.score); else if (acc < 60) Sfx.settleFail(); else Sfx.settleWin(dict.score);

    var wrongs = dict.queue.filter(function (it, i) { return dict.marks[i] === 0; });
    host.innerHTML =
      '<div class="summary">' +
        '<h3>听写结算</h3>' +
        User.settleStage(rank, color) +
        '<div class="rank" style="color:' + color + '">' + rank + '</div>' +
        '<div class="rank-sub">正确率 ' + acc + '%</div>' +
        '<div class="sline">' +
          '<div><i>得分</i><b>' + dict.score + '</b></div>' +
          '<div><i>写对</i><b>' + dict.right + '/' + graded + '</b></div>' +
          '<div><i>最高连击</i><b>' + dict.maxCombo + '</b></div>' +
          '<div><i>正确率</i><b>' + acc + '%</b></div>' +
        '</div>' +
        '<div class="beat-box"><span class="beat-num">' + pct + '%</span>' +
          '<span class="beat-txt">超过全国 ' + pct + '% 的小朋友</span>' +
          '<span class="beat-bar"><i style="width:' + pct + '%"></i></span></div>' +
        (wrongs.length ?
          '<div class="wrong-wrap"><div class="ct">今日错字（已存入错字熔炉 · ' + Store.today() + '）</div>' +
          '<div class="wrong-chips">' + wrongs.map(function (it) {
            return '<span><b>' + it.c + '</b><i>' + it.p + '</i></span>';
          }).join('') + '</div></div>' : '<p class="muted">全部写对，太棒了！</p>') +
        '<div class="sum-acts">' +
          '<button class="btn-main" onclick="Words.start()">再来一套</button>' +
          (wrongs.length ? '<button class="btn-main ghost" onclick="App.go(\'review\')">去熔炉练错字</button>' : '') +
          '<button class="btn-main ghost" onclick="App.go(\'home\')">返回大厅</button>' +
        '</div>' +
      '</div>';
  }
  function stop() { Sfx.stopSeq(); clearTimer(); }

  return {
    start: start, next: next, speakFix: speakFix, stop: stop,
    dictReplay: dictReplay, dictNext: dictNext, dictSkipToSheet: dictSkipToSheet,
    dictAllRight: dictAllRight, dictSay: dictSay, dictSummary: dictSummary,
    flush: flush, toggleStats: toggleStats,
    lookupPinyin: lookupPinyin,  // 暴露给错字熔炉复用，保证两端拼音补全逻辑一致
    lookupWords: lookupWords,     // 暴露给错字熔炉复用，错字 m.w 为空时反查组词
    charPinyins: charPinyins      // 暴露给 render：判断某字的多音集合，避免干扰项撞多音字
  };
})();
