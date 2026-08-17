/* 全屏冲击特效：震屏、频闪、飞分、冲击波、碎片、连击横幅 */
var FX = (function () {
  'use strict';
  var cam = null, layer = null, shakeTimer = null;

  function init() {
    cam = document.getElementById('camera');
    layer = document.getElementById('fx');
  }

  /* 镜头震动，level 1-4 */
  function shake(level) {
    if (!cam) init();
    var cls = level === 'bad' ? 'shakeBad' : 'shake' + Math.max(1, Math.min(4, level || 1));
    cam.classList.remove('shake1', 'shake2', 'shake3', 'shake4', 'shakeBad');
    void cam.offsetWidth;
    cam.classList.add(cls);
    clearTimeout(shakeTimer);
    shakeTimer = setTimeout(function () { cam.classList.remove(cls); }, 800);
  }

  /* 频闪 */
  function strobe(bad) {
    if (!layer) init();
    var el = document.createElement('div');
    el.className = 'flashlayer ' + (bad ? 'bad' : 'go');
    layer.appendChild(el);
    setTimeout(function () { el.remove(); }, 460);
  }

  /* 飞出的数字 */
  function floatNum(text, x, y, color, size) {
    if (!layer) init();
    if (text == null || text === '') return;   /* 无分数时不显示飞分数字 */
    var el = document.createElement('div');
    el.className = 'floatnum';
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.color = color || '#ffe0a3';
    el.style.fontSize = (size || 46) + 'px';
    layer.appendChild(el);
    setTimeout(function () { el.remove(); }, 1100);
  }

  /* 连击横幅 */
  function banner(text, color, size) {
    if (!layer) init();
    var el = document.createElement('div');
    el.className = 'comboBanner';
    el.textContent = text;
    el.style.color = color || '#ff5fd0';
    el.style.fontSize = (size || 54) + 'px';
    layer.appendChild(el);
    setTimeout(function () { el.remove(); }, 1200);
  }

  /* 冲击波 */
  function shockwave(x, y, color) {
    if (!layer) init();
    var el = document.createElement('div');
    el.className = 'shock';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.borderColor = color || '#55d6ff';
    layer.appendChild(el);
    setTimeout(function () { el.remove(); }, 760);
  }

  /* 碎片爆裂 */
  function shards(x, y, n, colors) {
    if (!layer) init();
    colors = colors || ['#55d6ff', '#ffe0a3', '#b45cff', '#ffffff'];
    for (var i = 0; i < n; i++) {
      var el = document.createElement('div');
      el.className = 'shard';
      var ang = Math.random() * Math.PI * 2;
      var dist = 120 + Math.random() * 280;
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.background = colors[i % colors.length];
      el.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      el.style.setProperty('--dy', (Math.sin(ang) * dist - 40) + 'px');
      el.style.setProperty('--rot', (Math.random() * 900 - 450) + 'deg');
      el.style.height = (12 + Math.random() * 26) + 'px';
      el.style.width = (3 + Math.random() * 7) + 'px';
      el.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)';
      layer.appendChild(el);
      (function (e) { setTimeout(function () { e.remove(); }, 950); })(el);
    }
  }

  /* 数字弹跳 */
  function pop(el) {
    if (!el) return;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }
  function flicker(el) {
    if (!el) return;
    el.classList.remove('flick'); void el.offsetWidth; el.classList.add('flick');
  }

  /* 连对火焰粒子爆发：每次答对时喷射火焰粒子 */
  var flameSeq = 0;
  function flame(anchor, combo) {
    if (!layer) init();
    var lv = Math.min(4, 1 + Math.floor(combo / 5));
    if (combo < 3) return;
    var el = anchor || document.getElementById('comboVal') || document.body;
    var r = el.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var n = Math.min(34, 6 + combo * 0.7);
    var colors = ['#ffd34d', '#ffb020', '#ff7a1a', '#ff4d00', '#fff3b0'];
    for (var i = 0; i < n; i++) {
      var p = document.createElement('div');
      p.className = 'flame';
      var spread = 26 + combo * 2.2;
      var dx = (Math.random() - 0.5) * spread * 2;
      var rise = 46 + Math.random() * (30 + combo * 2.4);
      var sway = (Math.random() - 0.5) * 36;
      p.style.left = (cx + dx) + 'px';
      p.style.top = (cy + Math.random() * r.height * 0.4) + 'px';
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      p.style.width = p.style.height = (6 + Math.random() * (7 + lv * 3)) + 'px';
      p.style.setProperty('--fr', rise + 'px');
      p.style.setProperty('--fx', sway + 'px');
      p.style.animationDuration = (0.55 + Math.random() * 0.5 - lv * 0.03) + 's';
      p.style.opacity = (0.55 + Math.random() * 0.4) * (0.7 + lv * 0.1);
      layer.appendChild(p);
      (function (e) { setTimeout(function () { e.remove(); }, 1300); })(p);
    }
  }

  /* Combo 持续燃烧效果：随连击数增强，combo 归零时熄灭 */
  var comboFireLv = 0;
  var comboFireWrap = null;
  var comboFlameLayer = null;
  function comboFire(combo) {
    if (!layer) init();
    var newLv = 0;
    if (combo >= 20) newLv = 4;
    else if (combo >= 12) newLv = 3;
    else if (combo >= 7) newLv = 2;
    else if (combo >= 3) newLv = 1;

    var comboBox = document.querySelector('.hud-box:nth-child(2)') || 
                   (document.getElementById('comboVal') && document.getElementById('comboVal').parentElement);
    if (!comboBox) return;

    /* 首次激活：包裹 combo box 并创建火焰层 */
    if (newLv > 0 && !comboFireWrap) {
      var parent = comboBox.parentElement;
      comboFireWrap = document.createElement('div');
      comboFireWrap.className = 'combo-fire-wrap';
      parent.insertBefore(comboFireWrap, comboBox);
      comboFireWrap.appendChild(comboBox);

      comboFlameLayer = document.createElement('div');
      comboFlameLayer.className = 'combo-flame-layer';
      /* 根据等级创建对应数量的火焰舌 */
      var maxTongues = 7;
      for (var i = 0; i < maxTongues; i++) {
        var t = document.createElement('div');
        t.className = 'flame-tongue';
        comboFlameLayer.appendChild(t);
      }
      comboFireWrap.appendChild(comboFlameLayer);
    }

    /* 等级变化时更新 class */
    if (newLv !== comboFireLv) {
      if (comboFireWrap) {
        comboFireWrap.classList.remove('lv1', 'lv2', 'lv3', 'lv4', 'fading');
        if (newLv > 0) {
          comboFireWrap.classList.add('lv' + newLv);
          /* 控制火焰舌可见数量 */
          if (comboFlameLayer) {
            var tongues = comboFlameLayer.querySelectorAll('.flame-tongue');
            var showCount = newLv === 1 ? 4 : newLv === 2 ? 5 : newLv === 3 ? 6 : 7;
            tongues.forEach(function (t, i) {
              t.style.display = i < showCount ? '' : 'none';
            });
          }
        } else if (comboFireLv > 0) {
          /* 熄灭动画 */
          comboFireWrap.classList.add('fading');
          var wrap = comboFireWrap;
          setTimeout(function () {
            if (wrap) {
              wrap.classList.remove('fading');
              /* 恢复 combo box 到原位置 */
              var box = wrap.querySelector('.hud-box');
              if (box && wrap.parentElement) {
                wrap.parentElement.insertBefore(box, wrap);
                wrap.remove();
              }
            }
            comboFireWrap = null;
            comboFlameLayer = null;
          }, 600);
        }
      }
      comboFireLv = newLv;
    }
  }
  function comboFireReset() {
    comboFireLv = 0;
    if (comboFireWrap) {
      comboFireWrap.classList.remove('lv1', 'lv2', 'lv3', 'lv4');
      comboFireWrap.classList.add('fading');
      var wrap = comboFireWrap;
      setTimeout(function () {
        if (wrap) {
          var box = wrap.querySelector('.hud-box');
          if (box && wrap.parentElement) {
            wrap.parentElement.insertBefore(box, wrap);
            wrap.remove();
          }
        }
      }, 600);
      comboFireWrap = null;
      comboFlameLayer = null;
    }
  }

  /* 数字滚动到目标值 */
  function countTo(el, from, to, dur) {
    if (!el) return;
    var t0 = performance.now();
    dur = dur || 420;
    function step(t) {
      var k = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
      else el.textContent = to;
    }
    requestAnimationFrame(step);
  }

  function center(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /* 命中大合集：按连击强度分级 */
  function impact(level, anchor, scoreText) {
    var c = anchor ? center(anchor) : { x: innerWidth / 2, y: innerHeight * 0.42 };
    shake(level);
    if (level >= 2) strobe(false);
    var colors = [
      { c: '#7dff9b', s: 40 },
      { c: '#55d6ff', s: 50 },
      { c: '#ffe0a3', s: 62 },
      { c: '#ff5fd0', s: 76 }
    ][Math.min(level, 4) - 1];
    floatNum(scoreText, c.x, c.y, colors.c, colors.s);
    shockwave(c.x, c.y, colors.c);
    if (level >= 2) shards(c.x, c.y, 8 + level * 7);
    if (level >= 3) setTimeout(function () { shockwave(c.x, c.y, '#ffe0a3'); }, 110);
    if (level >= 4) {
      setTimeout(function () { shockwave(c.x, c.y, '#ff5fd0'); shards(c.x, c.y, 26); }, 200);
      strobe(false);
    }
  }

  /* 清空特效层：切下一题/下一张前调用，防止上一题的飞分、冲击波、碎片残留到下一题 */
  function clearFx() {
    if (!layer) init();
    while (layer && layer.firstChild) layer.removeChild(layer.firstChild);
  }

  return {
    init: init, shake: shake, strobe: strobe, floatNum: floatNum, banner: banner,
    shockwave: shockwave, shards: shards, pop: pop, flicker: flicker, flame: flame,
    countTo: countTo, center: center, impact: impact,
    comboFire: comboFire, comboFireReset: comboFireReset,
    clearFx: clearFx
  };
})();
