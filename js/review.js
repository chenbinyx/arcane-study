/* 错字熔炉：识字错误 / 听写错误 · 按日期分组 · 按日期复习
   设计要点：
   1) 识字错误与听写错误各自独立存储（Store 中以 c|read / c|write 为键），删除/复习任一类互不影响；
   2) 错字复习采用与"字词卡牌"一致的积分(SCORE)/连击(COMBO)/正确率 HUD + 计时器；
      选错后该字会重新入队，让孩子再选一次（最多重练 3 次），纠错面板与字词卡牌一致（语音播完才亮"继续"）；
   3) 错字记录按日期永久保存、不可删除；支持多选，把勾选的错字"添加到复习"。 */
var Review = (function () {
  'use strict';
  var mode = 'read';  /* read=识字错误, write=听写错误 */
  var quiz = null;
  var selOn = false;  /* 多选模式 */
  var trashOn = false; /* 复习垃圾箱视图 */
  var MAX_RETRY = 3;  /* 同一字单局最多重练次数（含首次） */

  /* 存储键：字 + 类型，与 Store.keyOf 保持一致 */
  function mkey(m) { return m.c + '|' + (m.type === 'write' ? 'write' : 'read'); }

  /* 拼音兜底：手动添加常不填拼音，自动从识字表/词语表查补（遍历所有年级），保证卡片与复习能正常显示读音 */
  function fillPinyin(c, p) {
    if (p && p.trim()) return p.trim();
    /* 优先复用字词卡牌的全题库拼音索引（覆盖 poly、所有年级、组词首字） */
    try { if (window.Words && window.Words.lookupPinyin) { var lp = window.Words.lookupPinyin(c); if (lp) return lp; } } catch (e) {}
    /* 兜底遍历（兼容仅出现在组词/例句里的字） */
    try {
      var WB = window.WORD_BANK;
      if (WB) {
        var secs = ['shizi', 'cihui', 'idioms', 'xiezi'];
        for (var gk in WB) {
          var bank = WB[gk]; if (!bank) continue;
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
      }
    } catch (e) {}
    return '';
  }

  function bindSeg() {
    var seg = document.getElementById('reviewSeg');
    if (seg.dataset.built) return;
    seg.dataset.built = '1';
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      mode = b.dataset.m; Sfx.tick();
      seg.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
      render();
    });
  }

  function render() {
    bindSeg();
    if (trashOn) { renderTrash(); return; }
    var host = document.getElementById('reviewBody');
    var all = Store.mistakeList();
    /* 临时退出后重新点开：若上一局复习还在进行，提示可继续（进度不清零） */
    var resumeHtml = '';
    var rs = Session.get('review');
    if (rs && rs.quiz && rs.quiz.pool && rs.quiz.i < rs.quiz.pool.length) {
      var qz = rs.quiz;
      resumeHtml = '<div class="resume-card" id="rvResume">' +
        '<div class="resume-ico">⏸</div>' +
        '<div class="resume-txt"><b>检测到未完成的复习</b><span>上次停在第 ' + (qz.i + 1) + ' / ' + qz.pool.length + ' 题，点继续接着练</span></div>' +
        '<button class="btn-main" onclick="Review.resume()">继续复习 ▶</button>' +
        '<button class="btn-ghost" onclick="Review.forgetSession()">重新开始</button>' +
      '</div>';
    }
    if (!all.length) {
      host.innerHTML = resumeHtml + '<div class="empty"><span class="big">熔炉空空</span>还没有错字' +
        '<div style="margin-top:22px"><button class="btn-main" onclick="Review.showAdd()">手动添加</button></div></div>';
      return;
    }
    renderList(host, all, resumeHtml);
  }

  /* ================= 按日期分组错字列表 ================= */
  function renderList(host, all, resumeHtml) {
    var isRead = mode === 'read';
    var trashedCount = all.filter(function (m) { return m.trashed; }).length;
    var filtered = all.filter(function (m) {
      var t = m.type || (m.src === 'dictation' ? 'write' : 'read');
      return (isRead ? (t === 'read') : (t === 'write')) && !m.trashed;
    });
    if (!filtered.length) {
      host.innerHTML = '<div class="empty"><span class="big">暂无' + (isRead ? '识字' : '听写') + '错误</span>' +
        '<p>去字词卡牌或写字表练一局，错误会自动收进这里。</p></div>';
      return;
    }

    /* 按日期分组（date 字段去重，最近在前） */
    var dates = {}, dateOrder = [];
    filtered.forEach(function (m) {
      var d = m.date || m.first || '未知';
      if (!dates[d]) { dates[d] = []; dateOrder.push(d); }
      dates[d].push(m);
    });
    dateOrder.sort(function (a, b) { return a < b ? 1 : a > b ? -1 : 0; });

    var mastered = filtered.filter(function (m) { return m.right >= 3; }).length;
    var total = filtered.length;
    var typeName = isRead ? '识字错误' : '听写错误';
    var typeColor = isRead ? '#55d6ff' : '#ffa34e';

    host.innerHTML =
      (resumeHtml || '') +
      '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px">' +
        box(typeName, total, typeColor) + box('已掌握', mastered, '#7dff9b') + box('待攻克', total - mastered, '#ff4a5e') +
      '</div>' +
      '<div style="margin-bottom:14px">' +
        '<button class="btn-main" onclick="Review.reviewAll()">复习全部' + typeName + '</button> ' +
        '<button class="btn-main ghost" onclick="Review.showAdd()">手动添加</button> ' +
        '<button class="btn-ghost" onclick="Review.toggleSelect()">' + (selOn ? '退出多选' : '多选复习') + '</button> ' +
        '<button class="btn-ghost" onclick="Review.toggleTrash()">复习垃圾箱 (' + trashedCount + ')</button> ' +
        '<button class="btn-ghost" onclick="Review.showSettings()">听写设置</button>' +
      '</div>' +

      dateOrder.map(function (d) {
        var items = dates[d];
        var dateMastered = items.filter(function (m) { return m.right >= 3; }).length;
        return '<div class="date-group">' +
          '<div class="date-head">' +
            '<span class="date-label">' + d + '</span>' +
            '<span class="date-count">' + items.length + ' 字 · 已掌握 ' + dateMastered + '/' + items.length + '</span>' +
            '<button class="btn-main ghost small" onclick="Review.reviewDate(\'' + d + '\')">复习此日</button>' +
          '</div>' +
          '<div class="mistake-grid">' + items.map(cardHtml).join('') + '</div>' +
        '</div>';
      }).join('') +

      (selOn ?
        '<div class="selbar" id="rvSelbar">' +
          '<span class="sel-count" id="rvSelCount">已选 0 字</span>' +
          '<button class="btn-ghost" onclick="Review.selectAll()">全选</button>' +
          '<button class="btn-ghost" onclick="Review.clearSel()">清空</button>' +
          '<button class="btn-main" onclick="Review.addSelectedToReview()">添加到复习 ▶</button>' +
        '</div>' : '');
    bindCards(host);
    if (selOn) updateSelBar();
  }

  function box(label, n, color) {
    return '<div class="hud-box" style="min-width:90px"><i>' + label + '</i><b style="color:' + (color || '#fff') + '">' + n + '</b></div>';
  }

  function cardWords(m) {
    var ws = (m.w && m.w.length) ? m.w : (window.Words && window.Words.lookupWords ? window.Words.lookupWords(m.c) : []);
    return (ws && ws.length) ? ws.slice(0, 3) : [];
  }
  function cardHtml(m) {
    var isRead = m.type !== 'write';
    var pct = Math.min(100, Math.round(m.right / 3 * 100));
    var typeLbl = isRead ? '识字' : '听写';
    var typeColor = isRead ? '#55d6ff' : '#ffa34e';
    var mastered = m.right >= 3;
    var cws = cardWords(m);
    var wordsHtml = cws.length ? '<div class="cw">词 ' + cws.map(function (w0) { return '<span>' + w0 + '</span>'; }).join('') + '</div>' : '';
    var selHtml = selOn ? '<label class="sel" onclick="event.stopPropagation()"><input type="checkbox" class="msel" data-k="' + mkey(m) + '"></label>' : '';
    return '<div class="mcard' + (selOn ? ' selmode' : '') + '" data-k="' + mkey(m) + '">' +
      selHtml +
      '<span class="type-btn" style="color:' + typeColor + '">' + typeLbl + '</span>' +
      (mastered ? '<span class="m-mastered">已掌握</span>' : '') +
      '<div class="g' + (m.c.length > 1 ? ' small' : '') + '">' + m.c + '</div>' +
      '<div class="p">' + fillPinyin(m.c, m.p) + '</div>' +
      wordsHtml +
      '<div class="n">错 ' + m.wrong + ' 次 · 已练对 ' + m.right + '/3</div>' +
      '<div class="mdate">' + (m.date || m.first || '') + '</div>' +
      (selOn ? '' : '<button class="m-trash" onclick="Review.trash(\'' + mkey(m) + '\')">收起</button>') +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
    '</div>';
  }

  function bindCards(host) {
    host.querySelectorAll('.mcard').forEach(function (el) {
      el.addEventListener('click', function (e) {
        if (e.target.closest('.sel') || e.target.closest('.type-btn')) return;
        var k = el.dataset.k, m = Store.get().mistakes[k];
        if (m) Sfx.teacherRead([m.c], '', function () {
          if (m.s) Sfx.sentenceRead(m.c, null, function () { Sfx.say(m.c + '。' + (m.s || ''), { rate: .92 }); });
        });
      });
    });
    host.querySelectorAll('.msel').forEach(function (cb) {
      cb.addEventListener('change', updateSelBar);
    });
  }

  function updateSelBar() {
    var host = document.getElementById('reviewBody');
    if (!host) return;
    var n = host.querySelectorAll('.msel:checked').length;
    var el = document.getElementById('rvSelCount');
    if (el) el.textContent = '已选 ' + n + ' 字';
  }

  function toggleSelect(force) {
    selOn = (force === undefined) ? !selOn : !!force;
    Sfx.tick();
    render();
  }
  function selectAll() {
    var host = document.getElementById('reviewBody');
    host.querySelectorAll('.msel').forEach(function (cb) { cb.checked = true; });
    updateSelBar();
  }
  function clearSel() {
    var host = document.getElementById('reviewBody');
    host.querySelectorAll('.msel').forEach(function (cb) { cb.checked = false; });
    updateSelBar();
  }
  function addSelectedToReview() {
    var host = document.getElementById('reviewBody');
    if (!host) return;
    var ks = [];
    host.querySelectorAll('.msel:checked').forEach(function (cb) { ks.push(cb.dataset.k); });
    if (!ks.length) { App.toast('先勾选要复习的错字'); return; }
    var g = Store.get(), pool = [];
    ks.forEach(function (k) { if (g.mistakes[k]) pool.push(g.mistakes[k]); });
    if (!pool.length) { App.toast('没有可复习的错字'); return; }
    selOn = false;
    startReviewQuiz(pool);
  }

  /* ================= 复习垃圾箱 ================= */
  /* 把错字「收起」暂存到垃圾箱：记录永久保留（不删除），只是从主列表/常规复习中隐藏；
     垃圾箱内可「再次添加复习」直接开练，或「恢复」回到错字册。 */
  function toggleTrash(force) {
    trashOn = (force === undefined) ? !trashOn : !!force;
    selOn = false;
    Sfx.tick();
    render();
  }
  function trash(k) {
    var g = Store.get();
    if (g.mistakes[k]) { g.mistakes[k].trashed = true; Store.save(); Sfx.tick(); App.toast('已收起到复习垃圾箱'); render(); }
  }
  function restore(k) {
    var g = Store.get();
    if (g.mistakes[k]) { g.mistakes[k].trashed = false; Store.save(); Sfx.tick(); App.toast('已恢复到错字册'); render(); }
  }
  function reviewFromTrash(k) {
    var g = Store.get(), m = g.mistakes[k];
    if (!m) { App.toast('找不到该错字'); return; }
    startReviewQuiz([m]);   /* 从垃圾箱直接开练，记录仍保留在箱内，可反复复习 */
  }
  function renderTrash() {
    var host = document.getElementById('reviewBody');
    var all = Store.mistakeList().filter(function (m) { return m.trashed; });
    if (!all.length) {
      host.innerHTML = '<div class="empty"><span class="big">复习垃圾箱是空的</span>' +
        '<p>把暂不练的错字点「收起」放进来，记录永久保留，随时可再次添加复习。</p>' +
        '<div style="margin-top:18px"><button class="btn-main" onclick="Review.toggleTrash()">返回错字册</button></div></div>';
      return;
    }
    host.innerHTML =
      '<div style="margin-bottom:14px">' +
        '<button class="btn-main" onclick="Review.toggleTrash()">← 返回错字册</button> ' +
        '<span style="color:rgba(232,217,187,.6);font-size:13px;margin-left:8px">共 ' + all.length + ' 个收起的错字（永久保留）</span>' +
      '</div>' +
      '<div class="mistake-grid">' + all.map(trashCardHtml).join('') + '</div>';
    bindTrash(host);
  }
  function trashCardHtml(m) {
    var isRead = m.type !== 'write';
    var typeLbl = isRead ? '识字' : '听写';
    var typeColor = isRead ? '#55d6ff' : '#ffa34e';
    var cws = cardWords(m);
    var wordsHtml = cws.length ? '<div class="cw">词 ' + cws.map(function (w0) { return '<span>' + w0 + '</span>'; }).join('') + '</div>' : '';
    return '<div class="mcard trashed" data-k="' + mkey(m) + '">' +
      '<span class="type-btn" style="color:' + typeColor + '">' + typeLbl + '</span>' +
      '<div class="g' + (m.c.length > 1 ? ' small' : '') + '">' + m.c + '</div>' +
      '<div class="p">' + fillPinyin(m.c, m.p) + '</div>' +
      wordsHtml +
      '<div class="n">错 ' + m.wrong + ' 次</div>' +
      '<div class="mdate">' + (m.date || m.first || '') + '</div>' +
      '<div class="trash-acts">' +
        '<button class="btn-main ghost small" onclick="Review.reviewFromTrash(\'' + mkey(m) + '\')">再次添加复习</button> ' +
        '<button class="btn-ghost small" onclick="Review.restore(\'' + mkey(m) + '\')">恢复</button>' +
      '</div>' +
    '</div>';
  }
  function bindTrash(host) {
    host.querySelectorAll('.mcard.trashed').forEach(function (el) {
      el.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        var k = el.dataset.k, m = Store.get().mistakes[k];
        if (m) Sfx.teacherRead([m.c], '', function () {
          if (m.s) Sfx.sentenceRead(m.c, null, function () { Sfx.say(m.c + '。' + (m.s || ''), { rate: .92 }); });
        });
      });
    });
  }

  /* ================= 按日期复习 ================= */
  function reviewDate(date) {
    var isRead = mode === 'read';
    var all = Store.mistakeList().filter(function (m) {
      var t = m.type || (m.src === 'dictation' ? 'write' : 'read');
      return (isRead ? t === 'read' : t === 'write') && !m.trashed && m.right < 3 && (m.date === date || m.first === date);
    });
    if (!all.length) { App.toast('该日期没有待复习的错字'); return; }
    startReviewQuiz(all);
  }

  function reviewAll() {
    var isRead = mode === 'read';
    var all = Store.mistakeList().filter(function (m) {
      var t = m.type || (m.src === 'dictation' ? 'write' : 'read');
      return (isRead ? t === 'read' : t === 'write') && !m.trashed && m.right < 3;
    });
    if (!all.length) { App.toast('没有待复习的错字'); return; }
    startReviewQuiz(all);
  }

  /* ================= 复习测验（卡牌选读音，与字词卡牌一致） ================= */
  function startReviewQuiz(pool) {
    quiz = { pool: shuffle(pool), i: 0, score: 0, combo: 0, right: 0, wrong: 0, maxCombo: 0, kind: 'review', retried: {} };
    Session.save('review', { mode: mode, quiz: quiz });
    if (window.Timer) Timer.start('review');
    reviewStep();
  }

  function reviewStep() {
    var host = document.getElementById('reviewBody');
    if (quiz.i >= quiz.pool.length) return reviewSummary(host);
    var m = quiz.pool[quiz.i], right = fillPinyin(m.c, m.p);
    var conf = Pinyin.confuse(right);
    var opts = Math.random() < 0.5 ? [right, conf.text] : [conf.text, right];
    var acc = (quiz.right + quiz.wrong) ? Math.round(quiz.right / (quiz.right + quiz.wrong) * 100) : 100;

    host.innerHTML =
      '<div class="battle-hud">' +
        '<div class="hud-box"><i>SCORE</i><b id="rvScore" style="color:var(--gold-2)">' + quiz.score + '</b></div>' +
        '<div class="hud-box"><i>COMBO</i><b id="rvCombo" style="color:var(--zaun-2)">' + quiz.combo + '</b></div>' +
        '<div class="hud-box"><i>正确率</i><b>' + acc + '%</b></div>' +
        '<div class="hud-box hud-timer"><i>计时</i><b id="timerDisp-review">00:00</b>' +
          '<button class="hud-tbtn" id="timerStart-review" onclick="Timer.start(\'review\')">开始</button>' +
          '<button class="hud-tbtn" id="timerPause-review" style="display:none" onclick="Timer.pause(\'review\')">暂停</button>' +
          '<button class="hud-tbtn" onclick="Timer.reset(\'review\')">重置</button>' +
        '</div>' +
        '<div class="hud-box"><i>第 ' + (quiz.i + 1) + ' / ' + quiz.pool.length + ' 题</i><b>' + (quiz.right + quiz.wrong ? Math.round(quiz.right / (quiz.right + quiz.wrong) * 100) : 100) + '%</b></div>' +
      '</div>' +
      '<div class="quiz-row">' +
        '<div class="card-slot">' +
          '<div class="gcard deal" id="rvCard">' +
            '<div class="card-corner tl">✦</div><div class="card-grade">错字复习</div>' +
            '<div class="card-glyph">' + m.c + '</div>' +
            '<div class="card-hint">选出正确读音</div>' +
            '<div class="card-corner br">✦</div>' +
          '</div>' +
        '</div>' +
        '<div id="afterSlot"></div>' +
      '</div>' +
      '<div class="choices">' + opts.map(function (p) {
        return '<div class="choice" data-p="' + p + '">' + p + '</div>';
      }).join('') + '</div>' +
      /* 下方预留两行空白，让复习界面整体更居中 */
      '<div class="quiz-spacer" aria-hidden="true"></div>';

    if (window.Timer) { Timer.update('review'); Timer.sync('review'); }
    if (quiz.combo >= 3) FX.comboFire(quiz.combo);
    quiz.locked = false;
    host.querySelector('.choices').addEventListener('click', function (e) {
      var el = e.target.closest('.choice');
      if (!el || quiz.locked) return;
      quiz.locked = true;
      var ok = el.dataset.p === right;
      document.querySelectorAll('.choice').forEach(function (c) { c.classList.add('locked'); });
      if (ok) {
        el.classList.add('right');
        quiz.combo++; quiz.right++; quiz.maxCombo = Math.max(quiz.maxCombo, quiz.combo);
        var lv = quiz.combo >= 12 ? 4 : quiz.combo >= 7 ? 3 : quiz.combo >= 3 ? 2 : 1;
        var gain = 10 * lv + quiz.combo * 2; quiz.score += gain;
        Store.hitMistake(m.c, m.type);   /* 按类型独立记账 */
        var sv = document.getElementById('rvScore'), cv = document.getElementById('rvCombo');
        reviewReward(quiz.combo, document.getElementById('rvCard'), gain, sv, cv);
        FX.countTo(sv, quiz.score - gain, quiz.score, 380);
        Store.addXp(4 + lv); App.syncHud();
        setTimeout(function () { quiz.i++; reviewStep(); }, 900);
      } else {
        el.classList.add('wrong');
        document.querySelectorAll('.choice').forEach(function (c) { if (c.dataset.p === right) c.classList.add('right'); });
        quiz.combo = 0; quiz.wrong++;
        FX.comboFireReset();
        document.getElementById('rvCard').classList.add('miss');
        FX.shake('bad'); FX.strobe(true); Sfx.miss();
        /* 错题重新入队：让孩子稍后再选一次（最多重练 MAX_RETRY 次） */
        var kk = mkey(m);
        quiz.retried[kk] = (quiz.retried[kk] || 0) + 1;
        if (quiz.retried[kk] <= MAX_RETRY) quiz.pool.push(m);
        var words = (m.w && m.w.length ? m.w : (window.Words && window.Words.lookupWords ? window.Words.lookupWords(m.c) : [])).slice(0, 3);
        if (!words.length) words = [m.c];
        /* 纠错面板与字词卡牌一致：语音播完才亮"继续" */
        document.getElementById('afterSlot').innerHTML =
          '<div class="correction"><div class="ct">读音记牢</div>' +
            '<div class="cr-row">' +
              '<div class="cr-char"><span class="big-char">' + m.c + '</span><span class="big-p">' + right + '</span></div>' +
              '<div class="cr-info"><div class="words">' + words.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div></div>' +
            '</div>' +
            '<div class="acts">' +
              '<button class="btn-main ghost" onclick="Review.speakFix(\'' + m.c + '\')">听一遍</button>' +
              '<button class="btn-main disabled" id="rvNext" onclick="">听完后继续</button>' +
            '</div></div>';
        setTimeout(function () {
          var lit = false;
          function light() {
            if (lit) return; lit = true;
            var b = document.getElementById('rvNext');
            if (b) { b.classList.remove('disabled'); b.setAttribute('onclick', 'Review.reviewNext()'); b.textContent = '记住了，继续'; }
          }
          var guard = setTimeout(light, 8000);   /* 语音异常兜底，绝不卡死 */
          Sfx.teacherRead([m.c].concat(words), '', function () { clearTimeout(guard); light(); });
        }, 400);
      }
    });
    /* 稳定出题点：进度落盘（临时退出后能接着玩） */
    Session.save('review', { mode: mode, quiz: quiz });
  }

  /* ============ 进度记忆（临时退出后可接着玩） ============ */
  function resume() {
    var rs = Session.get('review');
    if (!rs || !rs.quiz) return;
    quiz = rs.quiz; quiz.locked = false;
    if (rs.mode) { mode = rs.mode; syncModeSeg(); }
    var rc = document.getElementById('rvResume'); if (rc) rc.style.display = 'none';
    if (window.Timer) Timer.start('review');
    reviewStep();
    App.toast('已恢复刚才的复习进度');
  }
  function forgetSession() {
    Session.clear('review'); render();
  }
  /* 仅在稳定（未锁定）状态补盘，避免把"答完尚未翻页"的中间态写进去 */
  function flush() {
    if (Session.has('review') && quiz && !quiz.locked) Session.save('review', { mode: mode, quiz: quiz });
  }
  function syncModeSeg() {
    var seg = document.getElementById('reviewSeg');
    if (!seg) return;
    seg.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.m === mode); });
  }

  function speakFix(c) { Sfx.teacherRead([c], '', null); }
  function reviewNext() { quiz.i++; reviewStep(); }

  function reviewReward(combo, anchor, gain, scoreEl, comboEl) {
    var lv = combo >= 12 ? 4 : combo >= 7 ? 3 : combo >= 3 ? 2 : 1;
    if (anchor) { anchor.classList.add('hit'); FX.impact(lv, anchor, '+' + gain); }
    FX.flame(anchor, combo); FX.comboFire(combo);
    Sfx.comboFx(combo);
    if (combo % 5 !== 0) Sfx.comboPraise(combo);
    if (scoreEl) { FX.pop(scoreEl); FX.flicker(scoreEl); }
    if (comboEl) { FX.pop(comboEl); comboEl.textContent = combo; }
    if (combo === 3) FX.banner('COMBO ×3', '#55d6ff', 52);
    if (combo === 5) FX.banner('太棒了 ×5', '#ffe0a3', 58);
    if (combo >= 10 && combo % 5 === 0) FX.banner('学堂之光 ×' + combo, '#ff5fd0', 72);
    return lv;
  }

  function reviewSummary(host) {
    FX.comboFireReset();
    Session.clear('review');
    if (window.Timer) Timer.reset('review');
    var total = quiz.right + quiz.wrong;
    var acc = total ? Math.round(quiz.right / total * 100) : 0;
    var rank = acc === 100 ? 'S' : acc >= 90 ? 'A' : acc >= 75 ? 'B' : acc >= 60 ? 'C' : 'D';
    var color = { S: '#ff5fd0', A: '#ffe0a3', B: '#55d6ff', C: '#7dff9b', D: '#ff4a5e' }[rank];
    Store.addXp(10); App.syncHud();
    Store.log('review', '错字复习', '完成 ' + total + ' 题 · 正确率 ' + acc + '%');
    host.innerHTML = '<div class="summary"><h3>复习完成</h3>' +
      '<div class="rank" style="color:' + color + '">' + rank + '</div>' +
      '<p>正确率 ' + acc + '% · 得分 ' + quiz.score + '</p>' +
      '<div class="sline"><div><i>正确</i><b>' + quiz.right + '</b></div><div><i>错误</i><b>' + quiz.wrong + '</b></div><div><i>连击</i><b>' + quiz.maxCombo + '</b></div></div>' +
      '<button class="btn-main" onclick="Review.render()">回到错题册</button></div>';
    Sfx.finish(); quiz = null;
  }

  /* ================= 手动添加 ================= */
  function showAdd() {
    var host = document.getElementById('reviewBody');
    host.innerHTML = '<div class="card-block"><h4>手动添加错字</h4>' +
      '<p style="font-size:12px;color:rgba(232,217,187,.55);margin:8px 0 12px">粘贴或输入一段文字，系统会按单个汉字逐个录入（重复的字只记一次）。例：<b style="color:var(--gold-2)">天地人我天地</b> → 天、地、人、我</p>' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">' +
        '<label style="color:rgba(232,217,187,.7);font-size:13px;flex:1 1 260px">汉字 / 文本' +
          '<textarea id="addChar" rows="3" placeholder="必填，可粘贴整段文字" style="width:100%;margin-top:6px;padding:10px;border:1px solid var(--line);border-radius:8px;background:rgba(20,32,51,.6);color:#fff;font-size:15px;resize:vertical"></textarea></label>' +
        '<label style="color:rgba(232,217,187,.7);font-size:13px">拼音<input class="dict-input" id="addPy" maxlength="20" placeholder="可空，统一套用" style="width:120px;margin-top:6px"></label>' +
        '<label style="color:rgba(232,217,187,.7);font-size:13px">类型<select id="addType" style="margin-top:6px;padding:8px 10px;border:1px solid var(--line);background:rgba(20,32,51,.6);color:#fff;font-size:13px">' +
          '<option value="read" selected>识字错误</option><option value="write">听写错误</option></select></label>' +
      '</div>' +
      '<div style="margin-top:12px"><label style="color:rgba(232,217,187,.7);font-size:13px">组词（/分隔，统一套用）<input class="dict-input" id="addWords" maxlength="80" style="width:260px;margin-left:6px"></label></div>' +
      '<div style="margin-top:12px"><label style="color:rgba(232,217,187,.7);font-size:13px">例句（统一套用）<input class="dict-input" id="addSent" maxlength="120" style="width:300px;margin-left:6px"></label></div>' +
      '<div style="margin-top:18px"><button class="btn-main" onclick="Review.doAdd()">确认添加</button> <button class="btn-main ghost" onclick="Review.render()">取消</button></div></div>';
    setTimeout(function () { var f = document.getElementById('addChar'); if (f) f.focus(); }, 100);
  }

  function doAdd() {
    var raw = (document.getElementById('addChar').value || '').trim();
    if (!raw) { App.toast('请先输入或粘贴文字'); return; }
    var p = (document.getElementById('addPy').value || '').trim();
    var wRaw = (document.getElementById('addWords').value || '').trim();
    var w = wRaw ? wRaw.split(/[/、，,]/) : [];
    var s = (document.getElementById('addSent').value || '').trim();
    var type = document.getElementById('addType').value;

    /* 逐字拆分：仅提取汉字，按单字去重记录 */
    var chars = {}, order = [];
    for (var i = 0; i < raw.length; i++) {
      var ch = raw.charAt(i);
      if (!/[\u4E00-\u9FA5]/.test(ch)) continue;   /* 跳过标点 / 字母 / 数字 */
      if (!chars[ch]) { chars[ch] = true; order.push(ch); }
    }
    if (!order.length) { App.toast('没有识别到汉字'); return; }
    order.forEach(function (c) {
      Store.manualAdd({ c: c, p: fillPinyin(c, p), w: w, s: s, type: type });
    });
    Sfx.tick();
    App.toast('已添加 ' + order.length + ' 个字：' + order.join(' '));
    Store.log('review', '手动添加', order.join(''));
    render(); App.syncHud();
  }

  function showSettings() {
    var host = document.getElementById('reviewBody'), s = Store.getDictSettings();
    host.innerHTML = '<div class="card-block"><h4>听写设置</h4>' +
      '<div style="margin-top:14px;display:flex;gap:18px;flex-wrap:wrap;align-items:center">' +
        '<label style="color:rgba(232,217,187,.7);font-size:13px">每日题数<input class="dict-input" id="setCount" type="number" min="1" max="50" value="' + s.dailyCount + '" style="width:70px;margin-left:6px;text-align:center"></label>' +
        '<label style="color:rgba(232,217,187,.7);font-size:13px">每轮需连对<select id="setThres" style="margin:0 4px;padding:8px 10px;border:1px solid var(--line);background:rgba(20,32,51,.6);color:#fff;font-size:13px">' +
          '<option value="1"' + (s.passThreshold === 1 ? ' selected' : '') + '>1</option>' +
          '<option value="2"' + (s.passThreshold === 2 ? ' selected' : '') + '>2</option>' +
          '<option value="3"' + (s.passThreshold === 3 ? ' selected' : '') + '>3</option>' +
        '</select>次过关</label></div>' +
      '<p style="font-size:11px;color:rgba(232,217,187,.4);margin-top:12px">听写训练需连续答对指定次数才能晋级下一轮</p>' +
      '<div style="margin-top:18px"><button class="btn-main" onclick="Review.saveSettings()">保存</button> <button class="btn-main ghost" onclick="Review.render()">取消</button></div></div>';
  }

  function saveSettings() {
    var count = parseInt(document.getElementById('setCount').value, 10) || 10;
    var threshold = parseInt(document.getElementById('setThres').value, 10) || 2;
    Store.setDictSettings({ dailyCount: count, passThreshold: threshold });
    Sfx.tick(); App.toast('已保存'); render();
  }

  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  return {
    render: render,
    showAdd: showAdd, doAdd: doAdd,
    showSettings: showSettings, saveSettings: saveSettings,
    reviewDate: reviewDate, reviewAll: reviewAll,
    speakFix: speakFix, reviewNext: reviewNext,
    resume: resume, forgetSession: forgetSession, flush: flush,
    toggleSelect: toggleSelect, selectAll: selectAll, clearSel: clearSel, addSelectedToReview: addSelectedToReview,
    toggleTrash: toggleTrash, trash: trash, restore: restore, reviewFromTrash: reviewFromTrash,
    updateSelBar: updateSelBar
  };
})();
