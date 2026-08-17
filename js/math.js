/* 机械算室：乘法闯关 / 100以内加减 / 听算 */
var MathLab = (function () {
  'use strict';
  var quiz = null;

  function home() {
    var host = document.getElementById('mathBody');
    var g = Store.get();
    /* 临时退出后重新点开：若上一局还在进行，提示可继续（进度不清零） */
    var resumeCard = '';
    if (Session.has('math')) {
      resumeCard = '<div class="resume-card" id="mathResume">' +
        '<div class="resume-ico">⏸</div>' +
        '<div class="resume-txt"><b>检测到未完成的闯关</b><span>进度已帮你保留，点继续就能接着玩</span></div>' +
        '<button class="btn-main" onclick="MathLab.resume()">继续上局 ▶</button>' +
        '<button class="btn-ghost" onclick="MathLab.forgetSession()">重新开始</button>' +
      '</div>';
    }
    host.innerHTML =
      resumeCard +
      '<div class="mode-cards">' +
        mode('mul', '乘法闯关', '三关连闯：算得数 → 算乘数 → 混合，每关30题，错1加5', '×') +
        mode('addsub', '100以内加减', '进位退位混合练习，越答越快', '±') +
        mode('listen', '听算模式', '学堂语音报题，可选 20/100 以内口算或乘法口诀', '耳') +
      '</div>' +
      '<div id="mathStage"></div>' +
      '<div style="margin-top:24px;display:flex;gap:14px;flex-wrap:wrap">' +
        '<div class="hud-box"><i>今日题数</i><b>' + (Store.day().mathQ || 0) + '</b></div>' +
        '<div class="hud-box"><i>累计</i><b>' + (g.totalMath || 0) + '</b></div>' +
      '</div>' +
      '<div style="margin-top:18px"><button class="btn-main ghost" onclick="MathLab.showMistakes()">计算错题本</button></div>';
    host.querySelectorAll('.mode').forEach(function (el) {
      el.addEventListener('click', function () { Sfx.tick(); open(el.dataset.m); });
    });
  }

  function mode(k, t, d, n) {
    return '<div class="mode" data-m="' + k + '"><h4>' + t + '</h4><p>' + d + '</p><div class="n">' + n + '</div></div>';
  }

  function open(m) {
    document.querySelectorAll('.mode').forEach(function (e) { e.classList.toggle('on', e.dataset.m === m); });
    if (m === 'listen') return pickListen();
    startQuiz(m);
  }

  var CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  function chin(n) { return CN[n]; }
  function numCn(n) {
    if (n < 10) return CN[n];
    if (n < 20) return '十' + (n % 10 ? CN[n % 10] : '');
    return CN[Math.floor(n / 10)] + '十' + (n % 10 ? CN[n % 10] : '');
  }

  /* ---------- 题目生成 ---------- */
  function mulProduct() {
    var a = 1 + Math.floor(Math.random() * 9), b = 1 + Math.floor(Math.random() * 9);
    return {
      a: a, b: b, op: '×', ans: a * b, key: Math.min(a, b) + 'x' + Math.max(a, b),
      expr: a + ' <span class="op">×</span> ' + b + ' <span class="eq">=</span> <span class="blank">?</span>',
      plain: a + ' × ' + b, read: chin(a) + chin(b) + '相乘等于几', span: 8, kind: 'prod'
    };
  }
  function mulAddSame() {
    var a = 2 + Math.floor(Math.random() * 8), b = 1 + Math.floor(Math.random() * 9);
    var parts = []; for (var i = 0; i < a; i++) parts.push(chin(b));
    return {
      a: a, b: b, op: '+', ans: a * b, key: Math.min(a, b) + 'x' + Math.max(a, b),
      expr: parts.join('<span class="op">+</span>') + ' <span class="eq">=</span> <span class="blank">?</span>',
      plain: a + ' 个 ' + b + ' 相加', read: a + '个' + chin(b) + '相加等于几', span: 8, kind: 'add'
    };
  }
  function mulFactor1() {
    var a = 1 + Math.floor(Math.random() * 9), b = 1 + Math.floor(Math.random() * 9), ans = a * b;
    return {
      a: a, b: b, op: '×', ans: a, key: Math.min(a, b) + 'x' + Math.max(a, b),
      expr: '<span class="blank">?</span> <span class="op">×</span> ' + b + ' <span class="eq">=</span> ' + ans,
      plain: '? × ' + b + ' = ' + ans, read: '几乘' + chin(b) + '等于' + numCn(ans), span: 4, min: 1, kind: 'f1'
    };
  }
  function mulFactor2() {
    var a = 1 + Math.floor(Math.random() * 9), b = 1 + Math.floor(Math.random() * 9), ans = a * b;
    return {
      a: a, b: b, op: '×', ans: b, key: Math.min(a, b) + 'x' + Math.max(a, b),
      expr: a + ' <span class="op">×</span> <span class="blank">?</span> <span class="eq">=</span> ' + ans,
      plain: a + ' × ? = ' + ans, read: chin(a) + '乘几等于' + numCn(ans), span: 4, min: 1, kind: 'f2'
    };
  }
  /* 2~9 乘法口诀全集：36 句（a≤b），第一/二/三关每句都要考到 */
  var MUL_ALL = (function () {
    var o = [];
    for (var a = 2; a <= 9; a++) for (var b = a; b <= 9; b++) o.push({ a: a, b: b });
    return o;
  })();
  function shuffleArr(arr) {
    var o = arr.slice();
    for (var i = o.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = o[i]; o[i] = o[j]; o[j] = t;
    }
    return o;
  }
  /* 昨天日期字符串（今日出题参考昨天的错题情况） */
  function yesterdayStr() {
    var d = new Date(Date.now() - 86400000);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  /* 昨日错题计数：按口诀/算式去重统计（date 字段来自逐条错题明细） */
  function yesterdayMistakeCount(opFilter) {
    var out = {};
    try {
      var atts = (Store.mathAttemptList ? Store.mathAttemptList() : []);
      var y = yesterdayStr();
      atts.forEach(function (a) {
        if (a && a.date === y && (!opFilter || a.op === opFilter) && a.a != null && a.b != null) {
          var k;
          if (opFilter === '×') k = Math.min(a.a, a.b) + 'x' + Math.max(a.a, a.b);
          else k = a.a + a.op + a.b;
          out[k] = (out[k] || 0) + 1;
        }
      });
    } catch (e) {}
    return out;
  }
  /* 每关题量：30 道（昨日错题优先入选，其余从 2~9 口诀随机补足） */
  var MUL_DECK_SIZE = 30;
  function buildMulDeck() {
    var deck = [], added = {};
    try {
      var cnt = yesterdayMistakeCount('×');
      /* 1) 昨日错题优先入选：错几次 → 该句占 1 + min(n,2) 个位置 */
      for (var k in cnt) {
        var p = k.split('x');
        var n = 1 + Math.min(cnt[k], 2);
        for (var i = 0; i < n && deck.length < MUL_DECK_SIZE; i++) {
          deck.push({ a: +p[0], b: +p[1] });
        }
        added[k] = 1;
      }
    } catch (e) {}
    /* 2) 其余从 36 句随机补足到 30 */
    var rest = shuffleArr(MUL_ALL);
    for (var j = 0; j < rest.length && deck.length < MUL_DECK_SIZE; j++) {
      var c = rest[j];
      var ck = c.a + 'x' + c.b;
      if (added[ck]) continue;
      deck.push({ a: c.a, b: c.b });
      added[ck] = 1;
    }
    return shuffleArr(deck);
  }
  /* 指定算式出题：求得数 / 求乘数（2~9 全覆盖用） */
  function mulProductAB(a, b) {
    return {
      a: a, b: b, op: '×', ans: a * b, key: Math.min(a, b) + 'x' + Math.max(a, b),
      expr: a + ' <span class="op">×</span> ' + b + ' <span class="eq">=</span> <span class="blank">?</span>',
      plain: a + ' × ' + b, read: chin(a) + chin(b) + '相乘等于几', span: 8, kind: 'prod'
    };
  }
  function mulFactorAB(a, b) {
    var ans = a * b;
    if (Math.random() < 0.5) {
      return {
        a: a, b: b, op: '×', ans: a, key: Math.min(a, b) + 'x' + Math.max(a, b),
        expr: '<span class="blank">?</span> <span class="op">×</span> ' + b + ' <span class="eq">=</span> ' + ans,
        plain: '? × ' + b + ' = ' + ans, read: '几乘' + chin(b) + '等于' + numCn(ans), span: 4, min: 1, kind: 'f1'
      };
    }
    return {
      a: a, b: b, op: '×', ans: b, key: Math.min(a, b) + 'x' + Math.max(a, b),
      expr: a + ' <span class="op">×</span> <span class="blank">?</span> <span class="eq">=</span> ' + ans,
      plain: a + ' × ? = ' + ans, read: chin(a) + '乘几等于' + numCn(ans), span: 4, min: 1, kind: 'f2'
    };
  }
  function genMulStage(stage) {
    if (stage === 0) return mulProduct();
    if (stage === 1) return Math.random() < 0.5 ? mulFactor1() : mulFactor2();
    var t = Math.floor(Math.random() * 3);
    if (t === 0) return mulProduct();
    if (t === 1) return mulFactor1();
    return mulFactor2();
  }
  function genAddSub(max) {
    var a, b, op, ans;
    /* 今日复习昨日错题：约 40% 概率优先出昨天做错的加减题（范围不超本次上限才用） */
    try {
      var cnt = yesterdayMistakeCount();
      var pool = [];
      for (var k in cnt) {
        var m = k.match(/^(\d+)([+−])(\d+)$/);
        if (!m) continue;
        var pa = +m[1], pb = +m[3], po = m[2];
        if (max && (pa > max || pb > max)) continue;
        pool.push({ a: pa, b: pb, op: po, ans: po === '+' ? pa + pb : pa - pb, n: cnt[k] });
      }
      if (pool.length && Math.random() < 0.4) {
        pool.sort(function (x, y) { return y.n - x.n; });
        var pick = pool[0];
        return {
          a: pick.a, b: pick.b, op: pick.op, ans: pick.ans, key: '',
          expr: pick.a + ' <span class="op">' + pick.op + '</span> ' + pick.b + ' <span class="eq">=</span> <span class="blank">?</span>',
          read: numCn(pick.a) + (pick.op === '+' ? '加' : '减') + numCn(pick.b) + '等于几',
          span: max && max <= 20 ? 6 : 12, kind: 'as', fromMistake: true
        };
      }
    } catch (e) {}
    if (max && max <= 20) {
      if (Math.random() < 0.5) { a = 1 + Math.floor(Math.random() * max); b = 1 + Math.floor(Math.random() * (max - a)); op = '+'; ans = a + b; }
      else { a = 1 + Math.floor(Math.random() * max); b = 1 + Math.floor(Math.random() * a); op = '−'; ans = a - b; }
    } else {
      if (Math.random() < 0.5) {
        a = 10 + Math.floor(Math.random() * 80);
        b = 2 + Math.floor(Math.random() * Math.min(90, 100 - a));
        op = '+'; ans = a + b;
      } else {
        a = 20 + Math.floor(Math.random() * 80);
        b = 2 + Math.floor(Math.random() * (a - 1));
        op = '−'; ans = a - b;
      }
    }
    return {
      a: a, b: b, op: op, ans: ans, key: '',
      expr: a + ' <span class="op">' + op + '</span> ' + b + ' <span class="eq">=</span> <span class="blank">?</span>',
      read: numCn(a) + (op === '+' ? '加' : '减') + numCn(b) + '等于几', span: max && max <= 20 ? 6 : 12, kind: 'as'
    };
  }
  function genListen(sub) {
    if (sub === 'mul') return mulProduct();
    return genAddSub(sub === 'add20' ? 20 : 100);
  }

  function options(ans, span, min) {
    min = min || 0;
    var set = [ans], guard = 0;
    while (set.length < 4 && guard++ < 60) {
      var d = Math.round((Math.random() - .5) * span * 2);
      var v = ans + (d === 0 ? 1 : d);
      if (v >= min && set.indexOf(v) < 0) set.push(v);
    }
    for (var i = set.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = set[i]; set[i] = set[j]; set[j] = t; }
    return set;
  }

  /* ---------- 关卡描述 ---------- */
  function stageDesc(s) {
    return s === 0 ? '算得数' : s === 1 ? '算第一个 / 第二个乘数' : '混合训练';
  }

  function startQuiz(kind, sub) {
    var rc = document.getElementById('mathResume'); if (rc) rc.style.display = 'none';
    quiz = {
      kind: kind, sub: sub || null,
      stage: 0, stageTotal: 0, stageWrong: 0, stageI: 0,
      i: 0, total: kind === 'mul' ? 0 : 12,
      right: 0, wrong: 0, combo: 0, maxCombo: 0, score: 0, input: '', t0: Date.now(),
      /* 乘法闯关牌组：主牌组（2~9 全口诀 + 昨日错题补量）+ 错题重练队列 */
      mDeck: kind === 'mul' ? buildMulDeck() : [],
      mRetry: [], mRetryCnt: {}
    };
    var host = document.getElementById('mathStage');
    if (kind === 'mul') {
      host.innerHTML = '<div class="stage-banner"><h2>第 1 关</h2><p>' + stageDesc(0) + '</p></div>';
      Sfx.tick();
      setTimeout(stepQuiz, 1300);
    } else {
      stepQuiz();
    }
  }

  /* 把当前这一题渲染出来（稳定的"出题点"检查站，在此落盘保存进度） */
  function paintQuestion() {
    var host = document.getElementById('mathStage');
    var q = quiz.q, listen = quiz.kind === 'listen', exprHtml = q.expr;

    var hud;
    if (quiz.kind === 'mul') {
      hud =
        '<div class="hud-box"><i>第 ' + (quiz.stage + 1) + ' 关</i><b style="color:#f2b74e;font-size:12px">' + stageDesc(quiz.stage) + '</b></div>' +
        '<div class="hud-box"><i>剩</i><b id="mProg">' + (quiz.mDeck.length + quiz.mRetry.length + 1) + '</b></div>' +
        '<div class="hud-box"><i>重练</i><b id="mRetry" style="color:#ff9d5c">' + quiz.mRetry.length + '</b></div>' +
        '<div class="hud-box"><i>SCORE</i><b id="mScore">' + quiz.score + '</b></div>' +
        '<div class="hud-box"><i>COMBO</i><b id="mCombo" style="color:#ff5fd0">' + quiz.combo + '</b></div>';
    } else {
      hud =
        '<div class="hud-box"><i>SCORE</i><b id="mScore">' + quiz.score + '</b></div>' +
        '<div class="hud-box"><i>COMBO</i><b id="mCombo" style="color:#ff5fd0">' + quiz.combo + '</b></div>' +
        '<div class="hud-box"><i>进度</i><b>' + (quiz.i + 1) + '/' + quiz.total + '</b></div>';
    }

    host.innerHTML =
      '<div class="battle-hud">' + hud + '</div>' +
      '<div class="quiz-stage">' +
        (listen
          ? '<div class="speaker" id="spk" style="margin-bottom:16px"><svg viewBox="0 0 24 24" fill="none" stroke="#7fe6ff" stroke-width="1.8"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="rgba(85,214,255,.3)"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg></div>' +
            '<div style="font-size:12px;letter-spacing:3px;color:rgba(232,217,187,.5)">听清题目后作答，可点喇叭重听</div>' +
            '<div class="answer-slot" id="slot">_</div>' + numpad()
          : '<div class="q-expr">' + exprHtml + '</div>' +
            '<div class="q-opts" id="qopts">' + options(q.ans, q.span || (quiz.kind === 'mul' ? 8 : 12), q.min || 0).map(function (v) {
              return '<div class="q-opt" data-v="' + v + '">' + v + '</div>';
            }).join('') + '</div>'
        ) +
      '</div>';
    /* render 重绘后重新挂载持续火焰 */
    if (quiz.combo >= 3) FX.comboFire(quiz.combo);

    if (listen) {
      var speak = function () {
        var el = document.getElementById('spk');
        el.classList.add('playing');
        Sfx.mathSpeak(q.a, q.op, q.b, { ask: q.op === '×' ? 'mul' : 'add' });
        setTimeout(function () { el.classList.remove('playing'); }, 2200);
      };
      document.getElementById('spk').onclick = speak;
      setTimeout(speak, 300);
      bindPad();
    } else {
      document.getElementById('qopts').addEventListener('click', function (e) {
        var el = e.target.closest('.q-opt'); if (!el || quiz.locked) return;
        judge(+el.dataset.v === q.ans, el, q, +el.dataset.v);
      });
    }
    /* 稳定出题点：进度落盘（临时退出后能接着玩） */
    persist();
  }

  function stepQuiz() {
    var host = document.getElementById('mathStage');
    /* 先清掉上一题残留的特效（飞分/冲击波/碎片），避免遗留到下一题 */
    if (FX.clearFx) FX.clearFx();
    if (quiz.kind === 'mul') {
      /* 主牌组与错题重练队列都答完 → 本关结束 */
      if (!quiz.mDeck.length && !quiz.mRetry.length) {
        if (quiz.stage >= 2) return quizSummary(host);
        quiz.stage++; quiz.stageI = 0; quiz.stageWrong = 0;
        quiz.mDeck = buildMulDeck(); quiz.mRetry = []; quiz.mRetryCnt = {};
        host.innerHTML = '<div class="stage-banner"><h2>第 ' + (quiz.stage + 1) + ' 关</h2><p>' + stageDesc(quiz.stage) + '</p></div>';
        Sfx.tick();
        setTimeout(stepQuiz, 1300);
        return;
      }
    } else {
      if (quiz.i >= quiz.total) return quizSummary(host);
    }

    var q;
    if (quiz.kind === 'mul') {
      /* 先出主牌组，主牌组出完后出错题重练队列（错题后面会再次出现） */
      var mc = quiz.mDeck.length ? quiz.mDeck.pop() : quiz.mRetry.pop();
      if (quiz.stage === 0) q = mulProductAB(mc.a, mc.b);
      else if (quiz.stage === 1) q = mulFactorAB(mc.a, mc.b);
      else q = Math.random() < 0.5 ? mulProductAB(mc.a, mc.b) : mulFactorAB(mc.a, mc.b);
    }
    else if (quiz.kind === 'addsub') q = genAddSub(100);
    else q = genListen(quiz.sub);
    quiz.q = q; quiz.input = '';
    paintQuestion();
  }

  function numpad() {
    var b = '';
    [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(function (n) { b += '<button data-k="' + n + '">' + n + '</button>'; });
    b += '<button data-k="del" class="act">←</button><button data-k="0">0</button><button data-k="ok" class="act">✓</button>';
    return '<div class="numpad" id="pad">' + b + '</div>';
  }

  function bindPad() {
    var pad = document.getElementById('pad');
    var slot = document.getElementById('slot');
    function paint() { slot.textContent = quiz.input || '_'; FX.pop(slot); }
    pad.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || quiz.locked) return;
      var k = b.dataset.k;
      Sfx.tick();
      if (k === 'del') quiz.input = quiz.input.slice(0, -1);
      else if (k === 'ok') { if (quiz.input) judge(+quiz.input === quiz.q.ans, slot, quiz.q, +quiz.input); return; }
      else if (quiz.input.length < 4) quiz.input += k;
      paint();
    });
    var keyHandler = function (e) {
      if (quiz.locked) return;
      if (/^[0-9]$/.test(e.key) && quiz.input.length < 4) { quiz.input += e.key; Sfx.tick(); paint(); }
      else if (e.key === 'Backspace') { quiz.input = quiz.input.slice(0, -1); paint(); }
      else if (e.key === 'Enter' && quiz.input) judge(+quiz.input === quiz.q.ans, slot, quiz.q, +quiz.input);
    };
    document.onkeydown = keyHandler;
  }

  /* 完整正确算式（不论题目挖空在哪一项，都还原成完整式子） */
  function fullEq(q) {
    if (q.op === '×' || q.op === 'x' || q.op === '*') return q.a + ' × ' + q.b + ' = ' + (q.a * q.b);
    if (q.op === '−' || q.op === '-') return q.a + ' − ' + q.b + ' = ' + (q.a - q.b);
    return q.a + ' + ' + q.b + ' = ' + (q.a + q.b);
  }
  /* 乘法口诀文字：小数在前，积小于 10 加"得"，10 读"一十"（二五一十） */
  function rhymeCn(n) { return n === 10 ? '一十' : numCn(n); }
  function rhymeText(a, b) {
    var lo = Math.min(a, b), hi = Math.max(a, b), p = lo * hi;
    return chin(lo) + chin(hi) + (p < 10 ? '得' : '') + rhymeCn(p);
  }

  /* 自动翻页令牌：手动点"继续"后作废待执行的自动跳转，避免连跳两题 */
  var advTok = 0;

  function judge(ok, el, q, chosen) {
    quiz.locked = true;
    if (q.key) Store.recordMul(q.key, ok);
    Store.bump('mathQ');

    if (ok) {
      quiz.combo++; quiz.right++; quiz.stageI++; quiz.i++;
      quiz.maxCombo = Math.max(quiz.maxCombo, quiz.combo);
      var lv = quiz.combo >= 10 ? 4 : quiz.combo >= 6 ? 3 : quiz.combo >= 3 ? 2 : 1;
      var gain = 10 * lv + quiz.combo;
      var prev = quiz.score; quiz.score += gain;
      el.classList.add('right');
      try {
        FX.impact(lv, el, '');               /* 答对只保留击打反馈，不显示积分数字 */
        if (quiz.combo < 3) Sfx.hit(lv);
        Sfx.comboFx(quiz.combo);
        FX.countTo(document.getElementById('mScore'), prev, quiz.score, 360);
        var cv = document.getElementById('mCombo'); cv.textContent = quiz.combo; FX.pop(cv);
        if (quiz.combo === 5) FX.banner('神算 ×5', '#ffe0a3', 56);
        if (quiz.combo === 10) FX.banner('心算大师 ×10', '#ff5fd0', 66);
      } catch (e) {}
      Store.addXp(3 + lv); App.syncHud();
      setTimeout(nextQ, 780);
    } else {
      quiz.combo = 0; quiz.wrong++; quiz.stageWrong++; quiz.stageI++; quiz.i++;
      el.classList.add('wrong');
      try { FX.shake('bad'); FX.strobe(true); Sfx.miss(); } catch (e) {}
      try { Store.addMathMistake(q.a, q.b, q.op, q.ans, chosen); } catch (e) {}
      var mcv = document.getElementById('mCombo'); if (mcv) mcv.textContent = 0;

      /* 1) 标明正确答案：选项模式高亮正确项 */
      var opts = document.getElementById('qopts');
      if (opts) opts.querySelectorAll('.q-opt').forEach(function (o) {
        if (+o.dataset.v === q.ans) o.classList.add('right');
      });
      /* 听算模式没有选项，直接把答题格填成正确答案 */
      var slotEl = document.getElementById('slot');
      if (slotEl) slotEl.textContent = q.ans;

      var isMul = !!q.key;                 /* 乘法题（含求乘数）都带 key */
      var tok = ++advTok;

      /* 乘法闯关：错一道补两道复习，进重练队列（同一句最多累计补 4 道，防无限循环） */
      if (quiz.kind === 'mul' && q.key) {
        quiz.mRetryCnt[q.key] = (quiz.mRetryCnt[q.key] || 0) + 1;
        if (quiz.mRetryCnt[q.key] <= 2) {
          quiz.mRetry.push({ a: q.a, b: q.b });
          quiz.mRetry.push({ a: q.a, b: q.b });
        }
        var rEl = document.getElementById('mRetry');
        if (rEl) rEl.textContent = quiz.mRetry.length;
        var pEl = document.getElementById('mProg');
        if (pEl) pEl.textContent = quiz.mDeck.length + quiz.mRetry.length + 1;
      }

      /* 2) 正确答案面板：完整算式 + 乘法口诀 */
      var stage = document.querySelector('.quiz-stage');
      if (stage) {
        var tip = document.createElement('div');
        tip.className = 'wrong-tip';
        tip.innerHTML =
          '<div class="wt-head">正确答案是 <b>' + q.ans + '</b>' +
            (chosen != null ? '　你答了 <span class="wt-ua">' + chosen + '</span>' : '') +
            '<span class="wt-date">' + Store.today() + '</span></div>' +
          '<div class="wt-eq">' + fullEq(q) + '</div>' +
          (isMul ? '<div class="wt-rhyme">' + rhymeText(q.a, q.b) + '</div>' : '') +
          '<div class="wt-act">' +
            '<button class="btn-main" onclick="MathLab.nextQ()">继续 ›</button>' +
            '<span class="wt-hint" id="wtHint">' + (isMul ? '跟我念，口诀念三遍…' : '正在说答案…') + '</span>' +
          '</div>';
        stage.appendChild(tip);
      }

      /* 3) 念完 → 停 1 秒 → 自动下一题
         乘法：先"跟我念"，再把正确口诀念三遍
         加减：直接念答案，不念算式 */
      var goNext = function () {
        if (tok !== advTok) return;        /* 用户已手动点"继续" */
        var h = document.getElementById('wtHint');
        if (h) h.textContent = '1 秒后进入下一题…';
        setTimeout(function () { if (tok === advTok) nextQ(); }, 1000);
      };
      /* 稍等 450ms，让答错音效"啊哦"说完再教学，避免两路语音叠在一起 */
      setTimeout(function () {
        if (tok !== advTok) return;
        try {
          if (isMul) Sfx.rhymeTeach(q.a, q.b, goNext);
          else Sfx.mathSpeak(q.a, q.op, q.b, { onlyAns: q.ans, onDone: goNext });
        } catch (e) { setTimeout(goNext, 1200); }
      }, 450);
      App.syncHud();
    }
  }

  /* 注意：quiz.i 已在 judge() 中自增，这里不能再加，否则每题跳 2 格 */
  function nextQ() { advTok++; quiz.locked = false; stepQuiz(); }

  function quizSummary(host) {
    document.onkeydown = null;
    /* 一局结束，清除进度暂存（下次进入从模式选择开始） */
    Session.clear('math');
    var total = quiz.right + quiz.wrong;
    var acc = total ? Math.round(quiz.right / total * 100) : 0;
    var sec = Math.round((Date.now() - quiz.t0) / 1000);
    var rank = acc === 100 ? 'S' : acc >= 90 ? 'A' : acc >= 75 ? 'B' : acc >= 60 ? 'C' : 'D';
    var color = { S: '#ff5fd0', A: '#ffe0a3', B: '#55d6ff', C: '#7dff9b', D: '#ff4a5e' }[rank];
    Store.addXp(acc >= 90 ? 20 : 12); App.syncHud(); Sfx.finish();
    if (acc === 100) Store.grantBadge('mathPerfect');
    var modeName = quiz.kind === 'mul' ? '乘法闯关' : quiz.kind === 'addsub' ? '100以内加减'
      : (quiz.sub === 'add20' ? '20以内口算' : quiz.sub === 'add100' ? '100以内口算' : '乘法口诀');
    var sub = quiz.kind === 'mul' ? '（三关连闯 · 最高连击 ' + quiz.maxCombo + '）' : '';
    Store.log('math', '算术训练', modeName + sub + ' · 正确 ' + quiz.right + '/' + total + ' · 最高连击 ' + quiz.maxCombo + ' · 用时 ' + sec + 's', { kind: quiz.kind, right: quiz.right, wrong: quiz.wrong, maxCombo: quiz.maxCombo, sec: sec });
    host.innerHTML =
      '<div class="summary"><h3>算室结算</h3>' +
        '<div class="rank" style="color:' + color + '">' + rank + '</div>' +
        '<div class="sline">' +
          '<div><i>得分</i><b>' + quiz.score + '</b></div>' +
          '<div><i>正确</i><b>' + quiz.right + '/' + total + '</b></div>' +
          '<div><i>最高连击</i><b>' + quiz.maxCombo + '</b></div>' +
          '<div><i>用时</i><b>' + sec + 's</b></div>' +
        '</div>' +
        '<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">' +
          '<button class="btn-main" onclick="MathLab.again()">再来一组</button>' +
          '<button class="btn-main ghost" onclick="MathLab.home()">换个模式</button>' +
        '</div>' +
      '</div>';
  }

  function again() { startQuiz(quiz.kind, quiz.sub); }

  /* ============ 进度记忆（临时退出后可接着玩） ============ */
  function persist() {
    if (quiz) Session.save('math', { quiz: quiz });
  }
  /* 仅在稳定（未锁定）状态落盘，避免把"答完尚未翻页"的中间态写进去 */
  function flush() {
    if (Session.has('math') && quiz && !quiz.locked) Session.save('math', { quiz: quiz });
  }
  /* 重新点开后恢复上一局：直接渲染当时那道题（进度/得分/连击/牌组全部还原） */
  function resume() {
    var s = Session.get('math');
    if (!s || !s.quiz) return;
    quiz = s.quiz;
    quiz.locked = false;
    if (!quiz.t0) quiz.t0 = Date.now();
    var rc = document.getElementById('mathResume'); if (rc) rc.style.display = 'none';
    paintQuestion();
    App.toast('已恢复刚才的闯关进度，继续加油！');
  }
  function forgetSession() {
    Session.clear('math');
    home();
  }

  /* ---------- 听算内容选择 ---------- */
  function pick(s, t, d) {
    return '<div class="pick" data-s="' + s + '"><h4>' + t + '</h4><p>' + d + '</p></div>';
  }
  function pickListen() {
    var host = document.getElementById('mathStage');
    host.innerHTML =
      '<div class="pick-title">选择听算内容</div>' +
      '<div class="pick-cards">' +
        pick('add20', '20以内口算', '不超 20 的加减，打好基础') +
        pick('add100', '100以内口算', '100 以内进退位混合') +
        pick('mul', '乘法口诀', '听算乘法口诀') +
      '</div>' +
      '<div style="margin-top:18px"><button class="btn-ghost" onclick="MathLab.home()">返回</button></div>';
    host.querySelectorAll('.pick').forEach(function (el) {
      el.onclick = function () { Sfx.tick(); startQuiz('listen', el.dataset.s); };
    });
  }

  /* 按日期分组渲染某类错题（mul 乘法 / as 加减） */
  function renderMistakeGroup(attempts, limit) {
    var groups = {}, order = [];
    attempts.forEach(function (a) {
      if (!groups[a.date]) { groups[a.date] = []; order.push(a.date); }
      groups[a.date].push(a);
    });
    order.sort(function (x, y) { return x < y ? 1 : -1; });
    var shown = 0, html = '';
    for (var gi = 0; gi < order.length && shown < limit; gi++) {
      var date = order[gi];
      var arr = groups[date];
      html += '<div class="mhist-day"><span class="mhist-d">' + date + '</span><span class="mhist-c">' + arr.length + ' 次</span></div>';
      for (var j = 0; j < arr.length && shown < limit; j++, shown++) {
        var a = arr[j];
        var isMul = a.op === '×';
        html +=
          '<div class="mhist-row" data-k="' + a.a + a.op + a.b + '">' +
            '<div class="mhist-q">' +
              '<span class="mhist-time">' + (a.hm || '') + '</span>' +
              '<span class="mhist-expr">' + a.a + ' ' + a.op + ' ' + a.b + ' = <b class="ok">' + a.ans + '</b></span>' +
            '</div>' +
            '<div class="mhist-ua">你答 <span class="no">' + (a.ua == null ? '未作答' : a.ua) + '</span></div>' +
            (isMul ? '<div class="mhist-rhyme">口诀：' + rhymeText(a.a, a.b) + '</div>' : '') +
          '</div>';
      }
      if (shown >= limit) break;
    }
    if (attempts.length > limit) html += '<div class="mhist-more">仅显示最近 ' + limit + ' 条，更早的已被归档</div>';
    return html;
  }

  /* 计算错题历史：乘法 / 加减 分栏，各自按日期分组 */
  function showMistakes() {
    var host = document.getElementById("mathStage");
    var attempts = Store.mathAttemptList ? Store.mathAttemptList() : [];
    var agg = Store.mathMistakeList();

    if (!attempts.length && !agg.length) {
      host.innerHTML = '<div class="empty"><span class="big">没有计算错题</span>去闯几关就会有记录。</div>';
      return;
    }
    if (!attempts.length) {
      /* 老存档没有逐次明细：退化为按题聚合展示 */
      host.innerHTML = '<div class="card-block"><h4>计算错题本</h4>' +
        '<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px">' +
        agg.slice(0, 20).map(function (m) {
          return '<div class="mcard" style="padding:12px 16px;text-align:center;cursor:pointer" data-k="' + m.a + m.op + m.b + '">' +
            '<div style="font-size:22px;color:#fff">' + m.a + ' ' + m.op + ' ' + m.b + ' = ' + m.ans + '</div>' +
            '<div style="font-size:11px;color:rgba(232,217,187,.5);margin-top:4px">' + m.wrong + ' 次</div>' +
          '</div>';
        }).join('') +
        '</div>' +
        '<div style="margin-top:12px"><button class="btn-main" onclick="MathLab.home()">返回</button></div></div>';
      return;
    }

    /* 乘法 / 加减 分开 */
    var mulA = [], asA = [];
    attempts.forEach(function (a) { (a.op === '×' ? mulA : asA).push(a); });
    var limit = 150;

    var html = '<div class="card-block mhist"><h4>计算错题本 <span class="mhist-sub">按日期整理</span></h4>' +
      '<div style="font-size:11px;color:rgba(232,217,187,.5);margin-top:4px">每次答错都会记录：你选的答案 → 正确答案；点条目可再练一次。</div>' +
      /* 分栏页签 */
      '<div class="mhist-tabs">' +
        '<div class="mhist-tab' + (mulA.length ? ' on' : '') + '" data-t="mul">乘法 <b>' + mulA.length + '</b></div>' +
        '<div class="mhist-tab' + (!mulA.length ? ' on' : '') + '" data-t="as">加减 <b>' + asA.length + '</b></div>' +
      '</div>' +
      '<div class="mhist-panel" data-t="mul"' + (mulA.length ? '' : ' style="display:none"') + '>' +
        (mulA.length ? renderMistakeGroup(mulA, limit)
          : '<div class="mhist-empty">还没有乘法错题，去「乘法闯关」试试吧</div>') +
      '</div>' +
      '<div class="mhist-panel" data-t="as"' + (mulA.length ? ' style="display:none"' : '') + '>' +
        (asA.length ? renderMistakeGroup(asA, limit)
          : '<div class="mhist-empty">还没有加减错题</div>') +
      '</div>' +
      '<div style="margin-top:14px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
        '<button class="btn-main" onclick="MathLab.retryTopWrong()">再练最易错</button>' +
        '<button class="btn-main ghost" onclick="MathLab.home()">返回</button>' +
      '</div></div>';
    host.innerHTML = html;

    /* 页签切换 */
    host.querySelectorAll('.mhist-tab').forEach(function (tab) {
      tab.onclick = function () {
        host.querySelectorAll('.mhist-tab').forEach(function (t) { t.classList.toggle('on', t === tab); });
        host.querySelectorAll('.mhist-panel').forEach(function (p) {
          p.style.display = (p.dataset.t === tab.dataset.t) ? '' : 'none';
        });
        Sfx.tick();
      };
    });
    host.querySelectorAll('.mhist-row[data-k]').forEach(function (el) {
      el.onclick = function () { MathLab.retryMath(this.dataset.k); };
    });
  }

  /* 从聚合错题里挑出错得最多的题，进入加减模式练习 */
  function retryTopWrong() {
    var agg = Store.mathMistakeList();
    if (!agg.length) return;
    var top = agg.slice().sort(function (a, b) { return b.wrong - a.wrong; })[0];
    App.go('math');
    setTimeout(function () { MathLab.open(top.op === '×' ? 'mul' : 'addsub'); }, 200);
  }

  function retryMath(k) { App.go("math"); setTimeout(function() { MathLab.open("addsub"); }, 200); }
  return { home: home, again: again, showMistakes: showMistakes, retryMath: retryMath, retryTopWrong: retryTopWrong, nextQ: nextQ, open: open,
    resume: resume, forgetSession: forgetSession, flush: flush };
})();
