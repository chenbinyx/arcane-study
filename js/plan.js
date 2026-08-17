/* 学徒计划：每日任务、打卡、进度环、徽章 */
var Plan = (function () {
  'use strict';

  var BADGES = [
    { id: 'first', ic: '✦', nm: '初入学堂', test: function (g) { return g.totalWords >= 1; } },
    { id: 'combo10', ic: '⚡', nm: '十连击', test: function (g) { return g.best.combo >= 10; } },
    { id: 'perfect', ic: '◆', nm: '字词全对', test: function (g) { return !!g.badges.perfect; } },
    { id: 'mathPerfect', ic: '⊕', nm: '算术全对', test: function (g) { return !!g.badges.mathPerfect; } },
    { id: 'w100', ic: '❖', nm: '百字达人', test: function (g) { return g.totalWords >= 100; } },
    { id: 'm100', ic: '✷', nm: '百题算师', test: function (g) { return g.totalMath >= 100; } },
    { id: 'streak3', ic: '☾', nm: '连续三日', test: function (g) { return g.streak >= 3; } },
    { id: 'streak7', ic: '☀', nm: '一周不断', test: function (g) { return g.streak >= 7; } },
    { id: 'lv5', ic: '♜', nm: '五级学徒', test: function (g) { return g.lv >= 5; } },
    { id: 'forge', ic: '⚒', nm: '熔炉工匠', test: function (g) { return (Store.day().review || 0) >= 5; } }
  ];

  function tasks() {
    var g = Store.get(), d = Store.day();
    return [
      { k: 'words', nm: '字词卡牌训练', sub: '认读并选对读音', cur: d.words || 0, goal: g.goals.words, xp: 30, go: 'words' },
      { k: 'mathQ', nm: '算术闯关', sub: '乘法口诀 / 加减法', cur: d.mathQ || 0, goal: g.goals.math, xp: 30, go: 'math' },
      { k: 'review', nm: '错字熔炉听写', sub: '把错字练到掌握', cur: d.review || 0, goal: g.goals.review, xp: 40, go: 'review' }
    ];
  }

  function progress() {
    var t = tasks(), done = 0, sum = 0;
    t.forEach(function (x) {
      var r = Math.min(1, x.cur / x.goal);
      sum += r;
      if (r >= 1) done++;
    });
    return { pct: Math.round(sum / t.length * 100), done: done, total: t.length };
  }

  function render() {
    var g = Store.get(), p = progress(), host = document.getElementById('planBody');
    checkBadges();

    host.innerHTML =
      '<div class="plan-wrap">' +
        '<div>' +
          '<div class="card-block" style="margin-bottom:20px">' +
            '<h4>今日任务</h4>' +
            tasks().map(questHtml).join('') +
            '<div style="margin-top:16px;font-size:12px;color:rgba(232,217,187,.45);letter-spacing:1px">完成全部任务可获得额外经验与打卡记录</div>' +
          '</div>' +
          '<div class="card-block">' +
            '<h4>本周打卡</h4>' +
            '<div class="week">' + Store.weekDays().map(function (d) {
              var active = d.data && ((d.data.words || 0) + (d.data.mathQ || 0) + (d.data.review || 0)) > 0;
              return '<div><div class="d">' + d.label + '</div><div class="box ' + (active ? 'on ' : '') + (d.isToday ? 'today' : '') + '">' +
                (active ? '✓' : '·') + '</div></div>';
            }).join('') + '</div>' +
            '<div style="display:flex;gap:14px;margin-top:18px;flex-wrap:wrap">' +
              stat('连续天数', g.streak + ' 天', '#ff5fd0') +
              stat('累计字词', g.totalWords, '#55d6ff') +
              stat('累计算题', g.totalMath, '#ffe0a3') +
              stat('最高连击', g.best.combo, '#7dff9b') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div>' +
          '<div class="card-block" style="margin-bottom:20px">' +
            '<h4>今日完成度</h4>' +
            '<div class="ringwrap">' + ring(p.pct) + '</div>' +
            '<div style="text-align:center;margin-top:14px;font-size:12.5px;color:rgba(232,217,187,.6);letter-spacing:1px">' +
              '已完成 ' + p.done + ' / ' + p.total + ' 项任务</div>' +
          '</div>' +
          '<div class="card-block" style="margin-bottom:20px">' +
            '<h4>荣誉徽章</h4>' +
            '<div class="badges">' + BADGES.map(function (b) {
              return '<div class="badge ' + (g.badges[b.id] ? 'got' : '') + '"><div class="ic">' + b.ic + '</div><div class="nm">' + b.nm + '</div></div>';
            }).join('') + '</div>' +
          '</div>' +
          '<div class="card-block">' +
            '<h4>每日目标设置</h4>' +
            goalRow('字词卡牌（张）', 'words', g.goals.words) +
            goalRow('算术题（道）', 'math', g.goals.math) +
            goalRow('错字听写（个）', 'review', g.goals.review) +
            '<div class="setting-row"><label>音效与语音</label>' +
              '<button class="btn-ghost" id="muteBtn">' + (Sfx.isMuted() ? '已静音' : '已开启') + '</button></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    host.querySelectorAll('.quest').forEach(function (el) {
      el.addEventListener('click', function () { Sfx.tick(); App.go(el.dataset.go); });
    });
    host.querySelectorAll('input[data-goal]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        Store.setGoal(inp.dataset.goal, +inp.value);
        var label = { words: '字词卡牌', math: '算术题', review: '错字听写' }[inp.dataset.goal] || inp.dataset.goal;
        Store.log('plan', '调整目标', label + ' · 每日 ' + (+inp.value) + ' 个');
        App.toast('目标已更新'); render(); App.syncHud();
      });
    });
    document.getElementById('muteBtn').onclick = function () {
      Sfx.setMuted(!Sfx.isMuted());
      this.textContent = Sfx.isMuted() ? '已静音' : '已开启';
      if (!Sfx.isMuted()) Sfx.tick();
    };
  }

  function questHtml(t) {
    var done = t.cur >= t.goal;
    return '<div class="quest ' + (done ? 'done' : '') + '" data-go="' + t.go + '">' +
      '<div class="tick"><i></i></div>' +
      '<div class="info"><b>' + t.nm + '</b><span>' + t.sub + '</span></div>' +
      '<div class="prog">' + Math.min(t.cur, t.goal) + ' / ' + t.goal + '</div>' +
      '<div class="rw">+' + t.xp + ' XP</div>' +
    '</div>';
  }

  function stat(l, v, c) {
    return '<div class="hud-box" style="min-width:96px"><i>' + l + '</i><b style="color:' + (c || '#fff') + '">' + v + '</b></div>';
  }

  function goalRow(label, key, val) {
    return '<div class="setting-row"><label>' + label + '</label>' +
      '<input type="number" min="1" max="200" value="' + val + '" data-goal="' + key + '"></div>';
  }

  function ring(pct) {
    var r = 66, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
    return '<div class="ring">' +
      '<svg width="158" height="158" viewBox="0 0 158 158">' +
        '<circle cx="79" cy="79" r="' + r + '" fill="none" stroke="rgba(232,217,187,.12)" stroke-width="11"/>' +
        '<circle cx="79" cy="79" r="' + r + '" fill="none" stroke="#55d6ff" stroke-width="11" stroke-linecap="butt" ' +
          'stroke-dasharray="' + c + '" stroke-dashoffset="' + off + '" style="filter:drop-shadow(0 0 10px rgba(85,214,255,.7))"/>' +
      '</svg>' +
      '<div class="mid"><b>' + pct + '%</b><span>今日进度</span></div>' +
    '</div>';
  }

  function checkBadges() {
    var g = Store.get(), got = [];
    BADGES.forEach(function (b) {
      if (!g.badges[b.id] && b.test(g)) { if (Store.grantBadge(b.id)) got.push(b); }
    });
    if (got.length) {
      Sfx.fanfare();
      FX.banner('获得徽章 · ' + got[0].nm, '#ffe0a3', 46);
      App.toast('解锁徽章：' + got.map(function (b) { return b.nm; }).join('、'));
      got.forEach(function (b) { Store.log('plan', '获得徽章', b.nm); });
    }
  }

  return { render: render, progress: progress, checkBadges: checkBadges };
})();
