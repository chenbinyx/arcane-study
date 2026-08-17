/* 用户系统：昵称 / 性别(决定激励音色) / 人物选择（5 位古风诗人） */
var User = (function () {
  'use strict';

  /* 原创古风诗人角色（《剑来》动画风格渲染，非原作角色） */
  var CHARS = [
    { name: '李白',  dyn: '唐', tag: '诗仙', desc: '潇洒豪放 · 仗剑行吟', color: '#e8c15a' },
    { name: '苏轼',  dyn: '宋', tag: '词圣', desc: '豁达旷朗 · 一蓑烟雨', color: '#9ad0e6' },
    { name: '王维',  dyn: '唐', tag: '诗佛', desc: '诗中有画 · 山水清音', color: '#9fd9a8' },
    { name: '李清照', dyn: '宋', tag: '易安', desc: '清丽温婉 · 才情卓绝', color: '#f2a7c0' },
    { name: '辛弃疾', dyn: '宋', tag: '词龙', desc: '剑气纵横 · 挑灯看剑', color: '#c9b3ff' }
  ];

  function imgPath(i) { return 'img/char' + (i + 1) + '.png'; }

  function render() {
    var host = document.getElementById('userBody');
    var g = Store.get();
    var u = g.user || (g.user = { name: '', gender: 'girl', char: 0 });
    host.innerHTML =
      '<div class="user-wrap">' +
        '<div class="user-card">' +
          '<div class="uc-head"><span class="uc-seal">书</span>' +
            '<h3>我的书房</h3><p class="muted">先认识一下你，再选一位陪你读书的诗友。</p></div>' +
          '<div class="uc-row">' +
            '<label>我的昵称</label>' +
            '<input id="userName" maxlength="8" placeholder="输入昵称，例如：小书童" value="' +
              esc(u.name || '') + '">' +
            '<button class="btn-main small" id="nameSave">保存</button>' +
          '</div>' +
          '<div class="uc-row">' +
            '<label>我的性别</label>' +
            '<div class="seg small" id="genderSeg">' +
              '<button data-g="girl"' + (u.gender === 'boy' ? '' : ' class="on"') + '>女生</button>' +
              '<button data-g="boy"' + (u.gender === 'boy' ? ' class="on"' : '') + '>男生</button>' +
            '</div>' +
            '<span class="muted" id="genderTip">' + (u.gender === 'boy' ? '将以男声为主' : '将以女生语音为主') + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="char-head"><h3>选择伴读诗人</h3><p class="muted">结算与激励时，他会为你登场（国风 3D 立绘）。</p></div>' +
        '<div class="char-grid">' + CHARS.map(function (c, i) {
          var on = u.char === i;
          return '<div class="char-card' + (on ? ' on' : '') + '" data-i="' + i + '">' +
            '<div class="char-img' + (on ? ' on' : '') + '">' +
              '<img src="' + imgPath(i) + '" alt="' + c.name + '" loading="lazy" onerror="this.style.display=\'none\';this.parentNode.classList.add(\'noimg\')">' +
              '<span class="char-fb">' + c.name[0] + '</span>' +
              '<span class="char-tag">' + c.tag + '</span>' +
            '</div>' +
            '<div class="char-meta">' +
              '<b>' + c.name + '</b><i>' + c.dyn + ' · ' + c.desc + '</i>' +
            '</div>' +
            '<span class="char-radio">' + (on ? '✓' : '') + '</span>' +
          '</div>';
        }).join('') + '</div>' +
        '<div class="sum-acts">' +
          '<button class="btn-main ghost" id="voiceTry">试听激励语音</button>' +
          '<button class="btn-main" onclick="App.go(\'home\')">回大厅</button>' +
        '</div>' +
      '</div>';

    host.querySelector('#nameSave').addEventListener('click', saveName);
    host.querySelector('#userName').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') saveName();
    });
    host.querySelector('#genderSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      u.gender = b.dataset.g;
      Store.save(); Sfx.setGender(u.gender);
      this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
      document.getElementById('genderTip').textContent =
        u.gender === 'boy' ? '将以男声为主' : '将以女生语音为主';
      Sfx.say(u.gender === 'boy' ? '好的，接下来由我来陪你读书。' : '好呀，我们一起好好读书。',
        { profile: u.gender === 'boy' ? 'male' : 'yujie', rate: .92 });
    });
    host.querySelectorAll('.char-card').forEach(function (el) {
      el.addEventListener('click', function () {
        var i = parseInt(el.dataset.i, 10);
        u.char = i; Store.save();
        host.querySelectorAll('.char-card').forEach(function (x) {
          x.classList.toggle('on', x.dataset.i === String(i));
          x.querySelector('.char-img').classList.toggle('on', x.dataset.i === String(i));
          x.querySelector('.char-radio').textContent = x.dataset.i === String(i) ? '✓' : '';
        });
        Sfx.tick();
        var c = CHARS[i];
        Sfx.say('我是' + c.dyn + ' · ' + c.name + '，' + c.desc + '。今日，我为你伴读。',
          { profile: u.gender === 'boy' ? 'male' : 'yujie', rate: .9 });
      });
    });
    host.querySelector('#voiceTry').addEventListener('click', function () {
      Sfx.comboFx(6);
      setTimeout(function () {
        Sfx.say('漂亮！状态起来了！乘胜追击！', { profile: u.gender === 'boy' ? 'male' : 'yujie', rate: .98 });
      }, 300);
      setTimeout(function () { Sfx.teacherRead(['天空', '雪花'], '雪花一片一片地飘落下来，大地安静极了。'); }, 2200);
    });
  }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

  function saveName() {
    var g = Store.get();
    var v = document.getElementById('userName').value.trim();
    if (!g.user) g.user = { name: '', gender: 'girl', char: 0 };
    if (v && v !== g.user.name) {
      Store.log('user', '设置昵称', '昵称 → ' + v);
    }
    g.user.name = v;
    Store.save(); App.syncHud();
    Sfx.tick();
    App.toast(v ? '你好，' + v + '！' : '昵称已清空');
  }

  /* 结算舞台：评级 + 诗人称号标签（取代人物图片） */
  function settleStage(rating, color) {
    var g = Store.get();
    var i = (g.user && g.user.char != null) ? g.user.char : 0;
    var c = CHARS[i] || CHARS[0];
    return '<div class="settle-stage noimg">' +
      '<div class="settle-bg"></div>' +
      '<div class="settle-rating" style="color:' + color + '">' + rating + '</div>' +
      '<div class="settle-label"><b>' + c.dyn + '</b><span>·</span><i>' + c.name + '</i></div>' +
      '<div class="settle-title">' + c.tag + '</div>' +
    '</div>';
  }

  function current() {
    var g = Store.get();
    return CHARS[(g.user && g.user.char != null) ? g.user.char : 0] || CHARS[0];
  }

  return { render: render, settleStage: settleStage, current: current, CHARS: CHARS };
})();
