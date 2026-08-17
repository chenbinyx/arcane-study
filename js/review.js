/* 错字熔炉：识字错误 / 听写错误 · 按日期分组 · 按日期复习 */
var Review = (function () {
  'use strict';
  var mode = 'read';  /* read=识字错误, write=听写错误 */
  var quiz = null;

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
    var filtered = all.filter(function (m) {
      if (isRead) return m.type === 'read' || (!m.type && m.src !== 'dictation' && m.src !== 'manual');
      return m.type === 'write' || m.src === 'dictation' || m.src === 'manual';
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
      }).join('');
    bindCards(host);
  }

  function box(label, n, color) {
    return '<div class="hud-box" style="min-width:90px"><i>' + label + '</i><b style="color:' + (color || '#fff') + '">' + n + '</b></div>';
  }

  function cardHtml(m) {
    var isRead = m.type === 'read' || (!m.type && m.src !== 'dictation' && m.src !== 'manual');
    var pct = Math.min(100, Math.round(m.right / 3 * 100));
    var typeLbl = isRead ? '识字' : '听写';
    var typeColor = isRead ? '#55d6ff' : '#ffa34e';
    return '<div class="mcard" data-k="' + m.c + '">' +
      '<button class="del" onclick="Review.del(event,\'' + m.c + '\')">✕</button>' +
      '<button class="type-btn" onclick="Review.toggleType(event,\'' + m.c + '\')" style="color:' + typeColor + '">' + typeLbl + '</button>' +
      '<div class="g' + (m.c.length > 1 ? ' small' : '') + '">' + m.c + '</div>' +
      '<div class="p">' + m.p + '</div>' +
      '<div class="n">错 ' + m.wrong + ' 次 · 已练对 ' + m.right + '/3</div>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
    '</div>';
  }

  function bindCards(host) {
    host.querySelectorAll('.mcard').forEach(function (el) {
      el.addEventListener('click', function (e) {
        if (e.target.closest('.del') || e.target.closest('.type-btn')) return;
        var k = el.dataset.k, m = Store.get().mistakes[k];
        if (m) Sfx.teacherRead([m.c], '', function () {
          if (m.s) Sfx.sentenceRead(m.c, null, function () { Sfx.say(m.c + '。' + (m.s || ''), { rate: .92 }); });
        });
      });
    });
  }

  function del(e, k) { e.stopPropagation(); Store.removeMistake(k); Sfx.tick(); render(); App.syncHud(); }
  function toggleType(e, k) {
    e.stopPropagation();
    var m = Store.get().mistakes[k]; if (!m) return;
    m.type = m.type === 'read' ? 'write' : 'read';
    if (m.type === 'write') { m.dictPhase = m.dictPhase || 0; m.dictPassCorrect = m.dictPassCorrect || 0; }
    Store.save(); Sfx.tick(); render();
  }

  /* ================= 按日期复习 ================= */
  function reviewDate(date) {
    var all = Store.mistakeList().filter(function (m) {
      var isRead = mode === 'read';
      var typeMatch = isRead ? (m.type === 'read' || (!m.type && m.src !== 'dictation' && m.src !== 'manual'))
        : (m.type === 'write' || m.src === 'dictation' || m.src === 'manual');
      return typeMatch && m.right < 3 && (m.date === date || m.first === date);
    });
    if (!all.length) { App.toast('该日期没有待复习的错字'); return; }
    startReviewQuiz(all);
  }

  function reviewAll() {
    var all = Store.mistakeList().filter(function (m) {
      var isRead = mode === 'read';
      return isRead ? (m.type === 'read' || (!m.type && m.src !== 'dictation' && m.src !== 'manual'))
        : (m.type === 'write' || m.src === 'dictation' || m.src === 'manual');
    }).filter(function (m) { return m.right < 3; });
    if (!all.length) { App.toast('没有待复习的错字'); return; }
    startReviewQuiz(all);
  }

  /* ================= 复习测验（卡牌选读音） ================= */
  function startReviewQuiz(pool) {
    quiz = { pool: shuffle(pool), i: 0, score: 0, combo: 0, right: 0, wrong: 0, maxCombo: 0, kind: 'review' };
    Session.save('review', { mode: mode, quiz: quiz });
    reviewStep();
  }

  function reviewStep() {
    var host = document.getElementById('reviewBody');
    if (quiz.i >= quiz.pool.length) return reviewSummary(host);
    var m = quiz.pool[quiz.i], right = m.p;
    var conf = Pinyin.confuse(right);
    var opts = Math.random() < 0.5 ? [right, conf.text] : [conf.text, right];

    host.innerHTML =
      '<div class="battle-hud">' +
        '<div class="hud-box"><i>SCORE</i><b id="rvScore" style="color:var(--gold-2)">' + quiz.score + '</b></div>' +
        '<div class="hud-box"><i>COMBO</i><b id="rvCombo" style="color:var(--zaun-2)">' + quiz.combo + '</b></div>' +
        '<div class="hud-box"><i>第 ' + (quiz.i + 1) + ' / ' + quiz.pool.length + ' 题</i><b>' +
          (quiz.right + quiz.wrong ? Math.round(quiz.right / (quiz.right + quiz.wrong) * 100) : 100) + '%</b></div>' +
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
      }).join('') + '</div>';

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
        Store.hitMistake(m.c);
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
        var words = (m.w && m.w.length ? m.w : [m.c]).slice(0, 3);
        document.getElementById('afterSlot').innerHTML =
          '<div class="correction"><div class="ct">读音记牢</div>' +
            '<div class="cr-row">' +
              '<div class="cr-char"><span class="big-char">' + m.c + '</span><span class="big-p">' + right + '</span></div>' +
              '<div class="cr-info"><div class="words">' + words.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div></div>' +
            '</div>' +
            '<div class="acts">' +
              '<button class="btn-main ghost" onclick="Review.speakFix(\'' + m.c + '\')">听一遍</button>' +
              '<button class="btn-main" onclick="Review.reviewNext()">记住了，继续</button>' +
            '</div></div>';
        setTimeout(function () { Sfx.teacherRead([m.c].concat(words), '', null); }, 400);
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
      '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:14px">' +
        '<label style="color:rgba(232,217,187,.7);font-size:13px">汉字<input class="dict-input" id="addChar" maxlength="3" placeholder="必填" style="width:100px;margin-left:6px"></label>' +
        '<label style="color:rgba(232,217,187,.7);font-size:13px">拼音<input class="dict-input" id="addPy" maxlength="20" style="width:120px;margin-left:6px"></label>' +
        '<label style="color:rgba(232,217,187,.7);font-size:13px">类型<select id="addType" style="margin-left:6px;padding:8px 10px;border:1px solid var(--line);background:rgba(20,32,51,.6);color:#fff;font-size:13px">' +
          '<option value="read" selected>识字错误</option><option value="write">听写错误</option></select></label>' +
      '</div>' +
      '<div style="margin-top:12px"><label style="color:rgba(232,217,187,.7);font-size:13px">组词（/分隔）<input class="dict-input" id="addWords" maxlength="80" style="width:260px;margin-left:6px"></label></div>' +
      '<div style="margin-top:12px"><label style="color:rgba(232,217,187,.7);font-size:13px">例句<input class="dict-input" id="addSent" maxlength="120" style="width:300px;margin-left:6px"></label></div>' +
      '<div style="margin-top:18px"><button class="btn-main" onclick="Review.doAdd()">确认</button> <button class="btn-main ghost" onclick="Review.render()">取消</button></div></div>';
    setTimeout(function () { var f = document.getElementById('addChar'); if (f) f.focus(); }, 100);
  }

  function doAdd() {
    var c = (document.getElementById('addChar').value || '').trim();
    if (!c) { App.toast('请输入汉字'); return; }
    var p = (document.getElementById('addPy').value || '').trim();
    var wRaw = (document.getElementById('addWords').value || '').trim();
    var w = wRaw ? wRaw.split(/[/、，,]/) : [];
    var s = (document.getElementById('addSent').value || '').trim();
    var type = document.getElementById('addType').value;
    Store.manualAdd({ c: c, p: p, w: w, s: s, type: type });
    Sfx.tick(); App.toast('已添加：' + c);
    Store.log('review', '手动添加', c);
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

  function clearMastered() {
    var list = Store.mistakeList().filter(function (m) { return m.right >= 3; });
    if (!list.length) { App.toast('还没有已掌握的字'); return; }
    list.forEach(function (m) { Store.removeMistake(m.c); });
    Store.log('review', '清空已掌握', '清除 ' + list.length + ' 个字');
    App.toast('清除了 ' + list.length + ' 个字');
    Sfx.tick(); render(); App.syncHud();
  }

  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  return {
    render: render, del: del, clearMastered: clearMastered,
    showAdd: showAdd, doAdd: doAdd, toggleType: toggleType,
    showSettings: showSettings, saveSettings: saveSettings,
    reviewDate: reviewDate, reviewAll: reviewAll,
    speakFix: speakFix, reviewNext: reviewNext,
    resume: resume, forgetSession: forgetSession, flush: flush
  };
})();
