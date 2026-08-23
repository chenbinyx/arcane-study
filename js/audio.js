/* 音效合成 + 语音播报 + BGM（全部本地生成，无外部资源）
   ─ BGM       ：进入字词卡牌检测时紧张动感背景音乐（五声音阶 + 鼓点循环）
   ─ 范读语音 ：短语级韵律拆分，温柔富有感染力（句末降调/疑问升调/感叹高平，真人范读质感）
   ─ 激励语音 ：短语级清冷飒爽古风御姐（气息自然→句尾微降，声线明亮通透）
   ─ 器乐音效 ：玉磬/编钟/古琴泛音/竹笛/碎金铃/风铃 逐档叠加，20 档，5 的倍数强化
*/
var Sfx = (function () {
  'use strict';
  var ctx = null, master = null, reverbBus = null, muted = false;

  function ac() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.62;
      master.connect(ctx.destination);
      try {
        var conv = ctx.createConvolver();
        conv.buffer = impulse(2.2, 1.8);
        reverbBus = ctx.createGain();
        reverbBus.gain.value = 0.0;
        conv.connect(reverbBus); reverbBus.connect(master);
        window.__reverb = conv;
      } catch (e) { reverbBus = null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function impulse(sec, decay) {
    var c = ac(); if (!c) return null;
    var len = Math.floor(c.sampleRate * sec);
    var buf = c.createBuffer(2, len, c.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  function reverb(amt) {
    if (reverbBus) reverbBus.gain.value = Math.max(0, Math.min(0.5, amt || 0));
  }
  function ring(freq, t0, dur, type, vol, extraPartials) {
    var c = ac(); if (!c || muted) return;
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    var osc = c.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
    (extraPartials || []).forEach(function (pp) {
      var o2 = c.createOscillator(), g2 = c.createGain();
      o2.type = 'sine';
      o2.frequency.setValueAtTime(freq * pp[0], t0);
      g2.gain.setValueAtTime(0.0001, t0);
      g2.gain.exponentialRampToValueAtTime((vol || 0.2) * pp[1], t0 + 0.01);
      g2.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * pp[2]);
      o2.connect(g2); g2.connect(master);
      o2.start(t0); o2.stop(t0 + dur * pp[2] + 0.05);
    });
  }
  function tone(freq, start, dur, type, vol, sweepTo) {
    var c = ac(); if (!c || muted) return;
    var t0 = c.currentTime + start;
    var osc = c.createOscillator(), g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.25, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }
  function noise(start, dur, vol, hp) {
    var c = ac(); if (!c || muted) return;
    var t0 = c.currentTime + start;
    var len = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = c.createBufferSource(); src.buffer = buf;
    var f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 800;
    var g = c.createGain(); g.gain.value = vol || 0.2;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }

  /* ==================== BGM 背景音乐（中国风轻音乐） ==================== */
  /* 模拟古筝/笛/铃的宁静学习背景音乐．65 BPM，16 拍循环 */
  var bgmGain = null, bgmTimer = null, bgmFadeTimer = null, bgmActive = false;
  var PENTA = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25];  // C D E G A C' D' E'
  var PENTA_LO = [130.81, 146.83, 164.81, 196, 220];                       // 低八度
  var BPM_BGM = 65;
  var BEAT_BGM = 60 / BPM_BGM;
  var CYCLE_BEATS = 16;

  /* 古筝拨弦短音：清脆的铃铛感 */
  function guzhengPing(tAbs, freq, vol) {
    var c = ac(); if (!c || muted || !bgmActive) return;
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, tAbs);
    g.gain.exponentialRampToValueAtTime(vol * 0.22, tAbs + 0.006);
    g.gain.exponentialRampToValueAtTime(vol * 0.04, tAbs + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, tAbs + 1.2);
    var o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(freq, tAbs);
    o.connect(g); g.connect(bgmGain);
    o.start(tAbs); o.stop(tAbs + 1.3);
    /* 泛音 */
    var g2 = c.createGain();
    g2.gain.setValueAtTime(0.0001, tAbs);
    g2.gain.exponentialRampToValueAtTime(vol * 0.08, tAbs + 0.004);
    g2.gain.exponentialRampToValueAtTime(0.0001, tAbs + 0.55);
    var o2 = c.createOscillator(); o2.type = 'sine';
    o2.frequency.setValueAtTime(freq * 2.01, tAbs);
    o2.connect(g2); g2.connect(bgmGain);
    o2.start(tAbs); o2.stop(tAbs + 0.6);
  }

  /* 笛声短句 */
  function diziNote(tAbs, freq, dur, vol) {
    var c = ac(); if (!c || muted || !bgmActive) return;
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, tAbs);
    g.gain.exponentialRampToValueAtTime(vol * 0.08, tAbs + 0.04);
    g.gain.setValueAtTime(vol * 0.08, tAbs + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, tAbs + dur);
    var o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(freq, tAbs);
    o.frequency.linearRampToValueAtTime(freq * 1.015, tAbs + dur * 0.5);
    o.frequency.linearRampToValueAtTime(freq, tAbs + dur);
    o.connect(g); g.connect(bgmGain);
    o.start(tAbs); o.stop(tAbs + dur + 0.03);
  }

  /* 风铃轻响 */
  function bellChime(tAbs, vol) {
    var c = ac(); if (!c || muted || !bgmActive) return;
    var f = PENTA[4 + Math.floor(Math.random() * 3)];
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, tAbs);
    g.gain.exponentialRampToValueAtTime(vol * 0.06, tAbs + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, tAbs + 1.0);
    var o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f, tAbs);
    o.connect(g); g.connect(bgmGain);
    o.start(tAbs); o.stop(tAbs + 1.05);
  }

  /* 环境底噪（模拟自然氛围） */
  function ambience(tAbs, dur, vol) {
    var c = ac(); if (!c || muted || !bgmActive) return;
    var len = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.04;
    var src = c.createBufferSource(); src.buffer = buf;
    var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
    var g = c.createGain(); g.gain.value = vol * 0.06;
    src.connect(lp); lp.connect(g); g.connect(bgmGain);
    src.start(tAbs);
  }

  /* BGM 音源：优先 audio/bgm.mp3（用户自定义），不可用时自动降级到 Web Audio 合成 */
  var bgmAudio = null;
  var bgmSrcChecked = false;
  var bgmUseMP3 = false;
  var bgmVol = 0.00;   // BGM 音量 0~1，默认关闭

  function _startSynth(c) {
    if (!bgmGain) { bgmGain = c.createGain(); bgmGain.gain.value = 0; bgmGain.connect(master); }
    bgmGain.gain.cancelScheduledValues(c.currentTime);
    bgmGain.gain.setValueAtTime(0, c.currentTime);
    bgmGain.gain.linearRampToValueAtTime(bgmVol * 0.63, c.currentTime + 2.0);
    ambience(c.currentTime, 60, 1);
    bgmStep(c.currentTime);
  }

  function _mp3FadeIn() {
    if (!bgmAudio) return;
    var s = 0, tgt = bgmVol;
    var fi = setInterval(function () {
      if (!bgmActive || !bgmAudio) { clearInterval(fi); return; }
      s++;
      bgmAudio.volume = Math.min(tgt, s * (tgt / 14));
      if (bgmAudio.volume >= tgt) clearInterval(fi);
    }, 120);
  }

  function bgmStart() {
    var c = ac(); if (!c) return;
    bgmStop(); bgmActive = true;

    if (!bgmSrcChecked) {
      bgmSrcChecked = true;
      bgmAudio = new Audio('audio/bgm.mp3');
      bgmAudio.loop = true;
      bgmAudio.volume = 0;
      var resolved = false;
      bgmAudio.oncanplaythrough = function () {
        if (!bgmActive || resolved) return;
        resolved = true; bgmUseMP3 = true;
        bgmAudio.play().catch(function () {});
        _mp3FadeIn();
      };
      bgmAudio.onerror = function () {
        if (resolved) return;
        resolved = true; bgmUseMP3 = false;
        _startSynth(c);
      };
      bgmAudio.load();
      /* 3 秒超时：MP3 加载太慢则降级 */
      setTimeout(function () {
        if (!resolved) { resolved = true; bgmUseMP3 = false; _startSynth(c); }
      }, 3000);
    } else if (bgmUseMP3 && bgmAudio) {
      bgmAudio.currentTime = 0;
      bgmAudio.play().catch(function () {});
      _mp3FadeIn();
    } else {
      _startSynth(c);
    }
  }

  function bgmStop(fadeMs) {
    bgmActive = false;
    clearTimeout(bgmTimer);
    if (bgmAudio) {
      var a = bgmAudio, orig = a.volume, st = 0, tot = Math.ceil((fadeMs || 800) / 50);
      var fo = setInterval(function () { st++; a.volume = Math.max(0, orig * (1 - st / tot)); if (st >= tot) { a.pause(); a.currentTime = 0; clearInterval(fo); } }, 50);
      return;
    }
    if (bgmGain && ctx) {
      var t = ctx.currentTime;
      bgmGain.gain.cancelScheduledValues(t);
      bgmGain.gain.setValueAtTime(bgmGain.gain.value, t);
      bgmGain.gain.linearRampToValueAtTime(0, t + (fadeMs || 800) / 1000);
    }
    bgmTimer = null;
  }

  function bgmStep(startT) {
    var c = ac(); if (!c || !bgmActive) return;
    var cycle = BEAT_BGM * CYCLE_BEATS;
    var now = c.currentTime;
    var elapsed = now - startT;
    var loopStart = startT + Math.ceil(elapsed / cycle) * cycle;
    if (loopStart - now < 0.1) loopStart += cycle;

    /* 古筝主旋律：宁静流淌的 16 拍乐句 */
    var mel = [
      0, 0, 1, 0, 3, 0, 1, 0,     // 上行
      5, 3, 1, 0, 3, 0, 2, 0,     // 回旋
      1, 0, 3, 0, 5, 3, 1, 0,     // 发展
      3, 1, 0, 5, 3, 1, 0, 0      // 收束
    ];
    for (var bi = 0; bi < mel.length; bi++) {
      if (mel[bi] === 0) continue;
      var bt = loopStart + bi * BEAT_BGM;
      var fq = PENTA[mel[bi] - 1] || PENTA[2];
      var vol = (bi % 8 === 0 || bi % 16 === 12) ? 1.3 : (bi % 4 === 0 ? 1.1 : 1);
      guzhengPing(bt, fq, vol);
    }

    /* 低声部：简约根音 */
    var bassPat = [0, 0, 0, 0, 3, 0, 0, 0, 1, 0, 3, 0, 0, 0, 0, 0];
    for (var bj = 0; bj < bassPat.length; bj++) {
      if (bassPat[bj] === 0) continue;
      var bt2 = loopStart + bj * BEAT_BGM;
      var bf = PENTA_LO[bassPat[bj]];
      var bg2 = c.createGain();
      bg2.gain.setValueAtTime(0.0001, bt2);
      bg2.gain.exponentialRampToValueAtTime(0.08, bt2 + 0.03);
      bg2.gain.exponentialRampToValueAtTime(0.0001, bt2 + BEAT_BGM * 2.5);
      var bo2 = c.createOscillator(); bo2.type = 'sine';
      bo2.frequency.setValueAtTime(bf, bt2);
      bo2.connect(bg2); bg2.connect(bgmGain);
      bo2.start(bt2); bo2.stop(bt2 + BEAT_BGM * 2.6);
    }

    /* 笛声点缀：间歇出现 */
    var diziSeq = [0, 0, 0, 0, 4, 0, 5, 3, 0, 0, 0, 0, 5, 4, 3, 0];
    for (var dk = 0; dk < diziSeq.length; dk++) {
      if (diziSeq[dk] === 0) continue;
      var dt = loopStart + dk * BEAT_BGM;
      diziNote(dt, PENTA[diziSeq[dk] - 1] || PENTA[3], BEAT_BGM * 1.4, 1);
    }

    /* 风铃：偶尔轻轻一响 */
    [0, 7, 14].forEach(function (cb) {
      bellChime(loopStart + cb * BEAT_BGM + 0.05, 1);
    });

    /* 计划下一次循环 */
    var next = loopStart + cycle;
    var delay = Math.max(30, (next - c.currentTime) * 1000 - 50);
    bgmTimer = setTimeout(function () { bgmStep(startT); }, delay);
  }

  function bgmIsPlaying() { return bgmActive; }

  function setBgmVol(v) {
    bgmVol = Math.max(0, Math.min(1, v));
    if (bgmUseMP3 && bgmAudio) { bgmAudio.volume = bgmVol; }
    if (bgmGain && ctx && !bgmUseMP3) { bgmGain.gain.value = bgmVol * 0.63; }
  }
  function getBgmVol() { return bgmVol; }

  /* ==================== 古风乐器 ==================== */
  var YUQING = [880, 1174.66, 1318.51, 1567.98];
  var BIANZHONG = [523.25, 587.33, 659.25, 783.99];
  var GUQIN = [220, 261.63, 293.66, 329.63, 392];
  var ZHUDI = [523.25, 587.33, 659.25, 783.99, 880];
  var JINLING = [1975.5, 2637, 3135.96, 3951, 4698];

  function yuqing(t0, vol) {
    var f = YUQING[Math.floor(Math.random() * YUQING.length)];
    ring(f, t0, 1.1, 'sine', (vol || 1) * 0.32, [[2.76, 0.35, 0.5]]);
  }
  function bianzhong(t0, vol, big) {
    var f = BIANZHONG[Math.floor(Math.random() * BIANZHONG.length)] * (big ? 0.72 : 1);
    ring(f * 0.5, t0, 2.6, 'sine', (vol || 1) * 0.4, [[1, 0.5, 0.8], [2.01, 0.3, 0.5], [3.04, 0.16, 0.32], [4.75, 0.1, 0.22]]);
  }
  function guqin(t0, vol, mellow) {
    var f = GUQIN[Math.floor(Math.random() * GUQIN.length)];
    ring(f * (mellow ? 0.55 : 1), t0, 1.5, 'sine', (vol || 1) * 0.26, [[1.5, 0.4, 0.6], [2, 0.22, 0.4]]);
  }
  function zhudi(t0, vol) {
    var c = ac(); if (!c || muted) return;
    var f = ZHUDI[Math.floor(Math.random() * ZHUDI.length)];
    var t = c.currentTime + t0;
    var osc = c.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f, t);
    var vib = c.createOscillator(); vib.frequency.value = 5.5;
    var vg = c.createGain(); vg.gain.value = f * 0.012;
    vib.connect(vg); vg.connect(osc.frequency);
    var flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 2400; flt.Q.value = 4;
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime((vol || 1) * 0.24, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    osc.connect(flt); flt.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + 1);
    vib.start(t); vib.stop(t + 1);
    noise(t0, 0.12, (vol || 1) * 0.07, 3000);
  }
  function jinling(t0, vol) {
    var n = 3 + Math.floor(Math.random() * 3);
    for (var i = 0; i < n; i++) {
      var f = JINLING[Math.floor(Math.random() * JINLING.length)] * (0.92 + Math.random() * 0.16);
      ring(f, t0 + i * 0.05, 0.28, 'sine', (vol || 1) * 0.16, [[2, 0.3, 0.3]]);
    }
  }
  function fengling(t0, vol) {
    [1567.98, 1318.51, 1760, 1046.5].forEach(function (f, i) {
      ring(f * (0.96 + Math.random() * 0.08), t0 + i * 0.14, 0.7, 'sine', (vol || 1) * 0.15, [[1.5, 0.2, 0.5]]);
    });
  }

  /* 20 档位 */
  var TIERS = [
    ['yuqing'],['yuqing','zhudi'],['yuqing','zhudi','jinling'],['yuqing','zhudi','jinling','guqin'],
    ['bianzhong','yuqing','jinling'],['bianzhong','yuqing','jinling','zhudi'],
    ['bianzhong','yuqing','guqin','jinling'],['bianzhong','yuqing','guqin','jinling','zhudi'],
    ['bianzhong','yuqing','guqin','jinling','zhudi'],['bianzhong','yuqing','guqin','jinling','zhudi','fengling'],
    ['bianzhong','yuqing','guqin','jinling','zhudi','fengling'],['bianzhong','yuqing','guqin','jinling','zhudi','fengling'],
    ['bianzhong','yuqing','guqin','jinling','zhudi','fengling'],['bianzhong','yuqing','guqin','jinling','zhudi','fengling'],
    ['bianzhong','yuqing','guqin','jinling','zhudi','fengling'],['bianzhong','yuqing','guqin','jinling','zhudi','fengling'],
    ['bianzhong','yuqing','guqin','jinling','zhudi','fengling'],['bianzhong','yuqing','guqin','jinling','zhudi','fengling'],
    ['bianzhong','yuqing','guqin','jinling','zhudi','fengling'],['bianzhong','yuqing','guqin','jinling','zhudi','fengling']
  ];
  var INSTR = {yuqing:yuqing,bianzhong:bianzhong,guqin:guqin,zhudi:zhudi,jinling:jinling,fengling:fengling};
  function playTier(tierIdx, milestone) {
    ac();
    var t = 0, k = Math.min(19, Math.max(0, tierIdx));
    var insts = TIERS[k];
    var vol = 1 + k * 0.035 + (milestone ? 0.25 : 0);
    insts.forEach(function (nm, i) { INSTR[nm](t + i * 0.07, vol); });
    if (k >= 5) bianzhong(t + 0.02, vol * 0.7, k >= 10);
    if (k >= 9) fengling(t + 0.1, vol * 0.8);
    if (k >= 12) jinling(t + 0.16, vol * 0.8);
    if (k >= 15) { guqin(t + 0.2, vol * 0.7); yuqing(t + 0.24, vol * 0.9); }
    reverb(Math.min(0.34, 0.04 + k * 0.016));
    if (milestone) setTimeout(function () { reverb(0.12); }, 900);
    else setTimeout(function () { reverb(0.0); }, 1200);
  }
  function missGuqin() {
    ac();
    guqin(0, 0.9, true);
    guqin(0.18, 0.5, true);
    reverb(0.08);
    setTimeout(function () { reverb(0); }, 900);
  }

  /* 基础音效 */
  function deal() { tone(180, 0, 0.16, 'triangle', 0.2, 90); noise(0.01, 0.1, 0.1, 2400); }
  function hit(level) {
    var base = [523.25, 659.25, 783.99, 1046.5];
    tone(base[0], 0, 0.16, 'triangle', 0.24);
    tone(base[1], 0.055, 0.18, 'triangle', 0.22);
    if (level >= 2) tone(base[2], 0.11, 0.22, 'triangle', 0.24);
    if (level >= 3) { tone(base[3], 0.16, 0.3, 'square', 0.16); tone(130, 0, 0.34, 'sawtooth', 0.16, 60); }
    if (level >= 4) { tone(1318.5, 0.22, 0.36, 'triangle', 0.2); tone(1567.98, 0.28, 0.4, 'sine', 0.16); noise(0, 0.24, 0.16, 3200); tone(70, 0, 0.5, 'sine', 0.3, 40); }
    noise(0, 0.07, 0.1, 4000);
  }
  function miss() { missGuqin(); say('啊哦。', { rate: 1.08, pitch: 1.12 }); }

  /* 重击声：连击达 3 后替代古风器乐的厚重打击音（低频轰鸣 + 攻击噪声 + 中频咚） */
  function heavyStrike() {
    var c = ac(); if (!c || muted) return;
    var t = c.currentTime;
    /* 1) 低频轰鸣体：180Hz 快速下滑到 48Hz，指数衰减 */
    var osc = c.createOscillator(), g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.exponentialRampToValueAtTime(46, t + 0.24);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.95, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.44);
    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + 0.46);
    /* 2) 中频厚度：120Hz 三角波下滑 */
    var osc2 = c.createOscillator(), g2 = c.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(120, t);
    osc2.frequency.exponentialRampToValueAtTime(58, t + 0.18);
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(0.42, t + 0.01);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    osc2.connect(g2); g2.connect(master);
    osc2.start(t); osc2.stop(t + 0.34);
    /* 3) 攻击噪声 Click：短促高通噪声 */
    var len = Math.floor(c.sampleRate * 0.06);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = c.createBufferSource(); src.buffer = buf;
    var hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1100;
    var ng = c.createGain(); ng.gain.value = 0.32;
    src.connect(hp); hp.connect(ng); ng.connect(master);
    src.start(t);
  }
  function tick() { tone(880, 0, 0.045, 'square', 0.09); }
  function fanfare() {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach(function (f, i) { tone(f, i * 0.09, 0.34, 'triangle', 0.22); });
    tone(80, 0, 0.7, 'sine', 0.26, 50); noise(0.1, 0.4, 0.1, 2600);
  }
  function finish() {
    [392, 523.25, 659.25].forEach(function (f, i) { tone(f, i * 0.12, 0.5, 'triangle', 0.22); });
  }
  function examBeep() { tone(1046.5, 0, 0.18, 'sine', 0.16); tone(1046.5, 0.26, 0.18, 'sine', 0.16); }
  function examChime(up) {
    var seq = up ? [523.25, 659.25, 783.99] : [783.99, 659.25, 523.25];
    seq.forEach(function (f, i) { tone(f, i * 0.18, 0.55, 'sine', 0.18); });
    tone(131, 0, 0.9, 'sine', 0.12);
  }
  function examTick() { tone(1318.5, 0, 0.09, 'sine', 0.1); }

  /* ==================== AI 预生成语音包 ==================== */
  /* 所有激励语音和字词朗读使用预生成的 AI 语音文件（edge-tts 微软神经网络）
     文件存放在 voice/ 目录下，按类型分组：
       voice/inc/  — 激励系统语音（连击播报、鼓励台词、失败安慰、开场/结算）
       voice/sys/  — 系统提示语音（听写开场/结束/规则/题号等）
       voice/word/ — 字词朗读语音（每个字一个文件：字。词1，词2，词3。）
     当文件不存在或加载失败时，自动降级到 Web Speech API */
  var VP = (function () {
    var audio = null;
    var enabled = true;

    function stop() {
      if (audio) {
        try { audio.pause(); audio.currentTime = 0; } catch (e) {}
        audio = null;
      }
    }

    function play(path, onDone, onFail) {
      if (!enabled || muted) { if (onFail) onFail(); else if (onDone) onDone(); return false; }
      stop();
      audio = new Audio('voice/' + path + '.mp3');
      audio.volume = 1;
      var done = false;
      var succeed = function () {
        if (done) return; done = true;
        audio = null;
        if (onDone) onDone();
      };
      var fail = function () {
        if (done) return; done = true;
        audio = null;
        if (onFail) onFail();
        else if (onDone) onDone();
      };
      audio.onended = succeed;
      audio.onerror = fail;
      audio.play().then(function () {}).catch(function () { fail(); });
      /* 超时保护：15 秒还没播完就继续 */
      setTimeout(function () { if (audio && !done) succeed(); }, 15000);
      return true;
    }

    /* 播放字词朗读：根据字符查找对应语音文件，失败时调用 onFail 降级 */
    function playWord(char, onDone, onFail) {
      if (!char) { if (onFail) onFail(); else if (onDone) onDone(); return; }
      var safe = char.replace(/[/\\:]/g, '_');
      play('word/' + safe, onDone, onFail);
    }

    /* 顺序播放多个语音文件 */
    var seqTok = 0;
    function playSeq(items, onDone) {
      var my = ++seqTok;
      var i = 0;
      function step() {
        if (my !== seqTok) return;
        if (i >= items.length) { if (onDone) onDone(); return; }
        var item = items[i++];
        var gap = item.gap || 0;
        if (item.beep) { examBeep(); }
        if (item.chime) { examChime(item.chime === 'up'); }
        if (!item.vp && !item.text) { setTimeout(step, gap || 400); return; }
        if (item.vp) {
          play(item.vp, function () {
            if (my === seqTok) setTimeout(step, gap);
          });
        } else if (item.text) {
          sayFallback(item.text, {
            rate: item.rate, pitch: item.pitch, profile: item.profile || 'teacher',
            onend: function () { if (my === seqTok) setTimeout(step, gap); }
          });
        }
      }
      step();
    }

    function stopSeq() { seqTok++; stop(); }

    /* 顺序播放一组语音路径（用于数学数字+运算符拼接等） */
    var listTok = 0;
    function playList(paths, onDone) {
      var my = ++listTok;
      var i = 0;
      function step() {
        if (my !== listTok) return;
        while (i < paths.length && !paths[i]) i++;
        if (i >= paths.length) { if (onDone) onDone(); return; }
        var p = paths[i++];
        play(p, function () { if (my === listTok) step(); });
      }
      step();
    }

    function setEnabled(v) { enabled = v; if (!v) stop(); }

    return {
      play: play, playWord: playWord, playSeq: playSeq, playList: playList,
      stop: stop, stopSeq: stopSeq, setEnabled: setEnabled
    };
  })();

  /* ==================== Web Speech API（降级引擎） ==================== */
  var ttsAvailable = false;
  var ttsAudio = null;

  function ttsStop() {
    if (ttsAudio) { ttsAudio.pause(); ttsAudio.currentTime = 0; ttsAudio = null; }
  }

  /* ── Web Speech 引擎（主力） ── */

  /* 角色音色 */
  var PROFILES = {
    teacher: { pitch: 1.07, rate: 0.84, prefer: ['Xiaoxiao','晓晓','Xiaoyi','小艺','Huihui','慧慧','Ting-Ting','婷婷','Xiaoqiu','小秋','Xiaochen','Xiaomeng'] },
    yujie:   { pitch: 0.98, rate: 0.97, prefer: ['Xiaoxiao','晓晓','Xiaoyi','小艺','Yunxi','云希','Huihui','慧慧'] },
    male:    { pitch: 0.78, rate: 0.94, prefer: ['Yunxi','云希','Yunyang','云扬','Kangkang','康康','Liang','志强','Danny'] }
  };

  var voices = [], voiceReady = false, cachedVoice = {};
  function scanVoices() {
    if (!window.speechSynthesis) return;
    var vs = speechSynthesis.getVoices();
    if (!vs.length) return;
    voices = vs; voiceReady = true;
    cachedVoice = {}; /* 清除缓存重新匹配 */
  }
  if (window.speechSynthesis) { scanVoices(); speechSynthesis.onvoiceschanged = scanVoices; }

  function voiceFor(profile) {
    var key = 'v_' + profile;
    if (cachedVoice[key] !== undefined) return cachedVoice[key];
    /* 音色还未加载完成 → 不缓存，下次重试 */
    if (!voices.length) {
      if (window.speechSynthesis) { scanVoices(); }
      return null;
    }
    var pref = PROFILES[profile] || PROFILES.teacher;
    var zh = voices.filter(function (v) { return /^zh[-_]?(CN|Hans)/i.test(v.lang); });
    if (!zh.length) zh = voices.filter(function (v) { return /zh/i.test(v.lang); });
    if (!zh.length) { cachedVoice[key] = null; return null; }

    /* 按偏好顺序匹配，同时优先本地语音（localService） */
    var best = null;
    for (var i = 0; i < pref.prefer.length; i++) {
      for (var j = 0; j < zh.length; j++) {
        if (zh[j].name && zh[j].name.indexOf(pref.prefer[i]) >= 0) {
          best = zh[j];
          if (zh[j].localService) { cachedVoice[key] = best; return best; }
        }
      }
    }
    /* 偏好没命中，优先本地服务 */
    if (!best) {
      for (var k = 0; k < zh.length; k++) {
        if (zh[k].localService) { best = zh[k]; break; }
      }
    }
    cachedVoice[key] = best || zh[0];
    return cachedVoice[key];
  }

  /* ── 核心：短语韵律链 ──
     将一段文字按中文标点拆分为短语，逐短语拼接朗读，
     每句自动施加自然语调：
       · 句号结尾 → 音高微降（陈述收束）
       · 问号结尾 → 音高上翘（疑问）
       · 感叹结尾 → 音高略高（情感饱满）
       · 逗号/分号 → 平调 + 短停顿（换气感）
     彻底告别"一整句机械匀速朗读" */
  var phraseSeq = 0;
  function phraseChain(fullText, profile, baseRate, basePitch, onDone) {
    if (!fullText || !window.speechSynthesis || muted) {
      if (onDone) onDone(); return;
    }
    var my = ++phraseSeq; stopSeq();

    /* 按标点断句 */
    var re = /[^。！？，、；\n]+[。！？，、；\n]?/g;
    var raw = fullText.match(re) || [fullText];
    var phrases = [];
    raw.forEach(function (seg) {
      seg = seg.replace(/^\s+|\s+$/g, '');
      if (!seg) return;
      var last = seg[seg.length - 1];
      var type, gap, pitchShift, rateShift;
      if (last === '？' || last === '?') {
        type = 'question'; gap = 380; pitchShift = 0.06; rateShift = -0.02;
      } else if (last === '！' || last === '!') {
        type = 'exclaim'; gap = 340; pitchShift = 0.04; rateShift = 0.02;
      } else if (last === '。' || last === '.') {
        type = 'statement'; gap = 420; pitchShift = -0.05; rateShift = -0.03;
      } else {
        type = 'comma'; gap = 260; pitchShift = 0.01; rateShift = 0;
      }
      phrases.push({ text: seg, type: type, gap: gap,
        pitch: (basePitch || 1) + pitchShift,
        rate: (baseRate || 0.9) + rateShift });
    });
    if (!phrases.length) { if (onDone) onDone(); return; }

    /* 逐短语链式朗读：edge-tts 时整句一次发出，Web Speech 时逐短语 */
    var i = 0;
    /* edge-tts 可用：整句合成一次发送（微软神经网络自动处理语调） */
    if (ttsAvailable) {
      var full = phrases.map(function (p) { return p.text; }).join('');
      ttsSpeak(full, profile, onDone);
      return;
    }
    /* 降级：Web Speech 逐短语 */
    /* onend 看门狗：整句超时强制完成，避免某一短语的 onend 丢失导致整链卡死 */
    var guardedDone = watchdogDone(fullText, onDone);
    function step() {
      if (my !== phraseSeq) return;
      if (i >= phrases.length) { if (guardedDone) guardedDone(); return; }
      var p = phrases[i++];
      var voice = voiceFor(profile);
      var u = new SpeechSynthesisUtterance(p.text);
      if (voice) u.voice = voice;
      u.lang = 'zh-CN';
      u.rate = Math.max(0.5, Math.min(2, p.rate));
      u.pitch = Math.max(0.1, Math.min(2, p.pitch));
      u.volume = 1;
      u.onend = function () {
        if (my === phraseSeq) setTimeout(step, p.gap);
      };
      speechSynthesis.speak(u);
    }
    step();
  }

  /* ── onend 看门狗 ──
     iOS/Safari 的 Web Speech 经常不回调 onend（切后台后返回、语音列表未就绪、
     被其它朗读 cancel 等），依赖回调的"继续"按钮会永远不亮，界面卡死。
     按文本长度估算朗读时长，超时强制视为播完。 */
  function watchdogDone(text, onDone) {
    if (!onDone) return null;
    var done = false;
    var est = Math.max(3500, (text || '').length * 500 + 2500);
    var timer = setTimeout(function () {
      if (done) return;
      done = true; onDone();
    }, est);
    return function () {
      if (done) return;
      done = true; clearTimeout(timer); onDone();
    };
  }

  /* ── 底层 say：Web Speech API 降级引擎（供无预生成文件的文本使用） ── */
  function sayFallback(text, opt) {
    if (!window.speechSynthesis || muted || !text) { if (opt && opt.onend) opt.onend(); return; }
    opt = opt || {};
    try {
      var prof = opt.profile || 'teacher';
      if (opt.cut !== false) speechSynthesis.cancel();
      if (text.length <= 14 && !/[。！？，、；]/.test(text)) {
        var v = voiceFor(prof);
        var u2 = new SpeechSynthesisUtterance(text);
        if (v) u2.voice = v;
        u2.lang = 'zh-CN';
        u2.rate = opt.rate != null ? opt.rate : PROFILES[prof].rate;
        u2.pitch = opt.pitch != null ? opt.pitch : PROFILES[prof].pitch;
        u2.volume = opt.volume == null ? 1 : opt.volume;
        if (opt.onend) u2.onend = watchdogDone(text, opt.onend);
        speechSynthesis.speak(u2);
      } else {
        phraseChain(text, prof,
          opt.rate != null ? opt.rate : PROFILES[prof].rate,
          opt.pitch != null ? opt.pitch : PROFILES[prof].pitch,
          opt.onend);
      }
    } catch (e) { if (opt.onend) opt.onend(); }
  }

  /* ── 对外 say：有预生成文件时用 VP，否则降级 Web Speech ── */
  function say(text, opt) {
    if (muted || !text) { if (opt && opt.onend) opt.onend(); return; }
    opt = opt || {};
    /* 检查是否有匹配的预生成语音文件 */
    var vpPath = textToVP(text);
    if (vpPath) {
      VP.play(vpPath, opt.onend);
    } else {
      sayFallback(text, opt);
    }
  }

  /* 文本 → 语音文件路径映射（英语激励/系统提示/听写/熔炉/例句） */
  function textToVP(text) {
    if (!text) return null;
    var t = text.replace(/\s/g, '');
    /* ── 英语激励语音包（高亢兴奋，12 句 + 失败安慰）── */
    var engMap = {
      'Excellentperformance!': 'inc/eng_0', 'Impressive!': 'inc/eng_1',
      'Amazing!': 'inc/eng_2', 'Youareonfire!': 'inc/eng_3',
      'Fantastic!': 'inc/eng_4', 'Unbelievable!': 'inc/eng_5',
      'Outstanding!': 'inc/eng_6', 'Perfect!': 'inc/eng_7',
      'Welldone!': 'inc/eng_8', 'Nicejob!': 'inc/eng_9',
      'Goodanswer!': 'inc/eng_10', 'Great!': 'inc/eng_11',
      'Notquite,tryagain!': 'inc/eng_fail_0', 'Soclose!Keepgoing!': 'inc/eng_fail_1',
      'Almost!Onemoretry!': 'inc/eng_fail_2'
    };
    if (engMap[t]) return engMap[t];
    /* ── 开场 / 结算 / 反馈（保留中文 AI 语音，避免降级机械音）── */
    var cnInc = {
      '准备好了吗？我们开始吧。': 'inc/quiz_card',
      '多音字挑战，请做好准备。': 'inc/quiz_poly',
      '写字表听写测试，请做好准备。': 'inc/quiz_dict',
      '恭喜过关！字正腔圆，好不痛快！': 'inc/settle_win_high',
      '恭喜过关！这一局，行云流水！': 'inc/settle_win_mid',
      '过关啦！再接再厉，更上层楼！': 'inc/settle_win_low',
      '无妨。错字已入熔炉，我们一同再练。': 'inc/settle_fail',
      '太出色了，这一局几乎全对！': 'inc/sum_card_high',
      '不错，继续加油！': 'inc/sum_card_mid',
      '别灰心，去熔炉把错字练熟就好。': 'inc/sum_card_low',
      '啊哦。': 'inc/ah_oh'
    };
    if (cnInc[t]) return cnInc[t];
    /* ── 报听写提示语 ── */
    var dictMap = {
      '写字表听写测试，现在开始。': 'dict/start',
      '本次听写共': 'dict/intro_pre',
      '个生字。每个生字朗读四个词语，其中最后一个是成语。': 'dict/intro_suf',
      '每题朗读两遍，请在两遍之后写出对应的汉字。': 'dict/rule',
      '下面开始第一题。': 'dict/q1',
      '听写结束，请停止书写。': 'dict/end',
      '下面请对照答案批改，写对的打勾，写错的打叉。': 'dict/grade',
      '全部写对，非常棒！': 'dict/sum_full',
      '听写完成，表现不错，继续保持。': 'dict/sum_good',
      '听写完成，把错字再练几遍就好了。': 'dict/sum_low'
    };
    if (dictMap[t]) return dictMap[t];
    /* ── 错字熔炉提示语 ── */
    var revMap = {
      '写对了！': 'review/right',
      '再听一遍，记住它。': 'review/wrong_tip',
      '正确写法：': 'review/correct_write',
      '正确答案是': 'review/reveal',
      '点击喇叭听读音，然后写出这个字。': 'review/listen_tip',
      '听写完成！': 'review/done'
    };
    if (revMap[t]) return revMap[t];
    /* ── 题号：第X题 → sys/num_X ── */
    var numCN = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,
      '十一':11,'十二':12,'十三':13,'十四':14,'十五':15,'十六':16,'十七':17,'十八':18,'十九':19,'二十':20};
    var numMatch = t.match(/^第([一二三四五六七八九十]+)题[。.]$/);
    if (numMatch && numCN[numMatch[1]]) return 'sys/num_' + numCN[numMatch[1]];
    return null;
  }

  /* ── 字词范读：优先使用预生成 AI 语音，失败降级 Web Speech ── */
  function teacherRead(words, sentence, onDone) {
    if (words && words.length) {
      var firstWord = words[0];
      /* 尝试 VP 预生成语音文件（包含字+词完整朗读） */
      VP.playWord(firstWord, function () {
        /* VP 成功：如有造句则继续用 Web Speech 读 */
        if (sentence) {
          sayFallback(sentence, { rate: 0.86, pitch: 1.03, profile: 'teacher', onend: onDone });
        } else if (onDone) onDone();
      }, function () {
        /* VP 失败：降级 Web Speech 逐词朗读 */
        var list = [];
        (words || []).forEach(function (w, i) {
          if (!w) return;
          list.push({ text: w, rate: 0.82, pitch: i % 2 ? 1.05 : 1.02, gap: 400, profile: 'teacher' });
        });
        if (sentence) {
          var re2 = /[^。！？，、；\n]+[。！？，、；\n]?/g;
          var segs = sentence.match(re2) || [sentence];
          segs.forEach(function (seg) {
            seg = seg.replace(/^\s+|\s+$/g, '');
            if (!seg) return;
            var last = seg[seg.length - 1];
            var isEnd = (last === '。' || last === '.' || last === '！' || last === '!' || last === '？' || last === '?');
            list.push({ text: seg, rate: 0.86 + (isEnd ? -0.03 : 0), pitch: 1.03 + (isEnd ? -0.06 : 0.01),
              gap: isEnd ? 520 : 260, profile: 'teacher' });
          });
          if (list.length) list[list.length - 1].gap = 700;
        }
        speakSeq(list, onDone);
      });
      return;
    }
    if (onDone) onDone();
  }

  /* 成语范读：优先预生成 AI 浑厚男声（voice/word/<idiom>.mp3），
     缺文件时降级 Web Speech（male 浑厚音色） */
  function idiomRead(char, onDone) {
    if (!char) { if (onDone) onDone(); return; }
    var safe = char.replace(/[/\\:]/g, '_');
    VP.play('word/' + safe, onDone, function () {
      sayFallback(char, { rate: 0.9, pitch: 0.78, profile: 'male', onend: onDone });
    });
  }

  /* 顺序播报队列（支持 VP 预生成语音 + Web Speech 降级） */
  var seqToken = 0;
  function speakSeq(list, onDone) {
    var my = ++seqToken;
    var i = 0;
    function step() {
      if (my !== seqToken) return;
      if (i >= list.length) { if (onDone) onDone(); return; }
      var item = list[i++];
      if (item.beep) { examBeep(); }
      if (item.chime) { examChime(item.chime === 'up'); }
      var wait = item.gap || 0;
      if (!item.text && !item.vp && !item.vpWord) { setTimeout(step, wait || 400); return; }
      /* VP 预生成语音文件优先 */
      if (item.vp) {
        VP.play(item.vp, function () { if (my === seqToken) setTimeout(step, wait); });
        return;
      }
      if (item.vpWord) {
        VP.playWord(item.vpWord, function () { if (my === seqToken) setTimeout(step, wait); });
        return;
      }
      /* 降级 Web Speech（say 内部会先检查 textToVP） */
      if (!window.speechSynthesis || muted) {
        setTimeout(step, Math.max(600, (item.text || '').length * 260) + wait);
        return;
      }
      say(item.text, {
        cut: i === 1,
        rate: item.rate == null ? 0.88 : item.rate,
        pitch: item.pitch == null ? 1.03 : item.pitch,
        profile: item.profile || 'teacher',
        onend: function () { if (my === seqToken) setTimeout(step, wait); }
      });
    }
    step();
  }
  function stopSeq() {
    seqToken++;
    VP.stop();
    ttsStop();
    if (window.speechSynthesis) { try { speechSynthesis.cancel(); } catch (e) {} }
  }

  /* ==================== 英语高亢激励 ==================== */
  /* 12 句英语激励 + 3 句失败安慰，全部预生成 AI 语音（高亢兴奋） */
  var ENG_INC = [
    'Excellent performance!', 'Impressive!', 'Amazing!', 'You are on fire!',
    'Fantastic!', 'Unbelievable!', 'Outstanding!', 'Perfect!',
    'Well done!', 'Nice job!', 'Good answer!', 'Great!'
  ];
  var ENG_FAIL = ['Not quite, try again!', 'So close! Keep going!', 'Almost! One more try!'];
  var engLast = -1;
  function engPick() {
    var i;
    do { i = Math.floor(Math.random() * ENG_INC.length); } while (ENG_INC.length > 1 && i === engLast);
    engLast = i;
    return ENG_INC[i];
  }
  function engFailPick() { return ENG_FAIL[Math.floor(Math.random() * ENG_FAIL.length)]; }

  /* 连击 ≥ 3 后：音效换成重击声，全部激励语音统一为 "Great!"（预生成高亢英语） */
  var COMBO_HEAVY = 3;
  /* suppressSpeech=true 时只放古风器乐，不念英文（字词卡牌改用预录浑厚男声 wordsCorrect） */
  function comboFx(combo, suppressSpeech) {
    if (combo >= COMBO_HEAVY) {
      heavyStrike();
      if (!suppressSpeech) say('Great!', { rate: 1.06, pitch: 1.12 });
      return;
    }
    var k = Math.min(19, Math.floor((combo - 1) / 5));
    var milestone = (combo % 5 === 0);
    playTier(k, milestone);
    if (milestone && !suppressSpeech) {
      var idx = ((combo / 5) - 1) % ENG_INC.length;
      if (idx < 0) idx = 0;
      say(ENG_INC[idx], { rate: 1.06, pitch: 1.12 });
    }
  }

  function comboPraise(combo) {
    /* 连击 ≥ 3 时 comboFx 已每题播报 "Great!"，避免重复 */
    if (combo >= COMBO_HEAVY) return;
    if (Math.random() > 0.26) return;
    say(engPick(), { rate: 1.06, pitch: 1.12 });
  }

  /* ==================== 字词卡牌「答对」浑厚男声激励 ==================== */
  /* 预生成 AI 浑厚男声（云扬 zh-CN-YunyangNeural，微软神经网络），文件在 voice/fx/
       correct_N.mp3（N=0..7，随连击递增强度、循环取避免重复）+ milestone_N.mp3（N=0..2，combo 为 5 的倍数时更燃）
     文件缺失时降级为浑厚男声 Web Speech（male 角色） */
  var fxPraiseIdx = 0;
  function wordsCorrect(combo) {
    if (muted) return;
    var path;
    if (combo && combo % 5 === 0) {
      path = 'fx/milestone_' + (((Math.floor(combo / 5) - 1) % 3 + 3) % 3);
    } else {
      var top = Math.min(7, Math.max(0, (combo || 1) - 1));   /* 连击越高越热烈 */
      path = 'fx/correct_' + (fxPraiseIdx % (top + 1));
    }
    fxPraiseIdx++;
    VP.play(path, null, function () {
      /* 预录文件缺失 → 降级为浑厚男声 Web Speech（male 角色） */
      sayFallback('正确', { rate: 0.9, pitch: 0.78, profile: 'male' });
    });
  }

  function comboFail() {
    say(engFailPick(), { rate: 1.0, pitch: 1.06 });
  }

  function openQuiz(kind) {
    ac();
    examChime(true);
    var txt = kind === 'dict'
      ? '写字表听写测试，请做好准备。'
      : kind === 'poly' ? '多音字挑战，请做好准备。' : '准备好了吗？我们开始吧。';
    setTimeout(function () {
      say(txt, { profile: 'teacher', rate: 0.94 });
    }, 420);
  }

  function settleWin(score) {
    ac();
    playTier(8, true);
    var txt = score >= 300 ? '恭喜过关！字正腔圆，好不痛快！'
      : score >= 150 ? '恭喜过关！这一局，行云流水！'
      : '过关啦！再接再厉，更上层楼！';
    setTimeout(function () {
      say(txt, { profile: 'teacher', rate: 0.92 });
    }, 350);
  }

  function settleFail() {
    ac();
    missGuqin();
    setTimeout(function () {
      say('无妨。错字已入熔炉，我们一同再练。', { profile: 'teacher', rate: 0.86, pitch: 0.98 });
    }, 300);
  }

  function setMuted(v) { muted = v; if (v && window.speechSynthesis) speechSynthesis.cancel(); }
  function isMuted() { return muted; }

  /* ==================== 数学语音合成（数字 + 运算符拼接） ==================== */
  /* 用预生成的高亢普通话 AI 语音，把算式拼接朗读出来 */
  function mathPath(n) { return 'math/num_' + n; }
  function mathSpeak(a, op, b, opts) {
    opts = opts || {};
    var seq = [];
    /* 只念答案（加减题答错时用：直接报出正确得数，不念算式） */
    if (opts.onlyAns != null) {
      var n = opts.onlyAns;
      VP.play('math/num_' + n, opts.onDone, function () {
        /* 数字音频缺失（如 100 以上）→ 降级为语音合成直接读数字 */
        say(String(n), { rate: 0.95, onend: opts.onDone });
      });
      return;
    }
    seq.push(mathPath(a));
    if (op === '×' || op === 'x' || op === '*') seq.push('math/op_mul');
    else if (op === '−' || op === '-') seq.push('math/op_sub');
    else seq.push('math/op_add');
    seq.push(mathPath(b));
    if (opts.ask === 'mul') seq.push('math/op_de_ji');
    else if (opts.ask === 'add') seq.push('math/op_eq_ji');
    else if (opts.ans != null) {
      if (op === '×' || op === 'x' || op === '*') {
        if (opts.ans < 10) seq.push('math/op_de');
        seq.push(mathPath(opts.ans));
      } else {
        seq.push('math/op_eq');
        seq.push(mathPath(opts.ans));
      }
    }
    VP.playList(seq, opts.onDone);
  }

  /* 乘法口诀完整朗读（一句一个完整 MP3，如"二二得四"）
     onDone: 念完（或文件缺失/静音降级完成）后回调，供"念完自动下一题"使用 */
  function rhymeSpeak(a, b, onDone) {
    var lo = Math.min(a, b), hi = Math.max(a, b);
    var fired = false;
    var fin = function () { if (fired) return; fired = true; if (onDone) onDone(); };
    /* 兜底：无论播放成功与否，最多 6 秒后必回调，避免卡住不翻页 */
    var guard = setTimeout(fin, 6000);
    var done = function () { clearTimeout(guard); fin(); };
    VP.play('rhyme/' + lo + 'x' + hi, done, function () {
      /* 预录口诀缺失 → 降级为数字拼读 */
      mathSpeak(lo, '×', hi, { ans: lo * hi, onDone: done });
    });
  }

  /* 乘法口诀纠错教学：先引导"跟我念"，再把口诀念三遍
     onDone: 三遍念完（或降级完成）后回调，供"念完自动下一题"使用 */
  function rhymeTeach(a, b, onDone) {
    var lo = Math.min(a, b), hi = Math.max(a, b);
    var fired = false;
    var fin = function () { if (fired) return; fired = true; if (onDone) onDone(); };
    var guard = setTimeout(fin, 22000);   /* 兜底 22s（跟读 + 三遍口诀） */
    var done = function () { clearTimeout(guard); fin(); };
    var items = [
      { vp: 'sys/genwo_nian', gap: 350 },   /* 跟我念 */
      { vp: 'rhyme/' + lo + 'x' + hi, gap: 420 },
      { vp: 'rhyme/' + lo + 'x' + hi, gap: 420 },
      { vp: 'rhyme/' + lo + 'x' + hi, gap: 0 }
    ];
    VP.playSeq(items, done);
  }

  /* 例句朗读（错字熔炉）：按字符查找 voice/sent/<char>.mp3 */
  function sentenceRead(char, onDone, onFail) {
    if (!char) { if (onFail) onFail(); else if (onDone) onDone(); return; }
    var safe = char.replace(/[/\\:]/g, '_');
    VP.play('sent/' + safe, onDone, onFail);
  }

  /* ==================== 语音识别（读出字词，判定读音是否准确） ==================== */
  /* 使用 Web Speech API 的 SpeechRecognition，实时识别学生朗读的语音，
     与标准读音文本做匹配，从而判定是否读对。
     · 提前预热参考语音文件（preloadVoice）使"听范读"秒开，缩短对比等待；
     · 支持 interimResults 边读边反馈，识别更快。 */
  var speechRec = null, speechActive = false, speechOnResult = null, speechOnEnd = null;

  function getSR() {
    var C = window.SpeechRecognition || window.webkitSpeechRecognition;
    return C ? new C() : null;
  }
  function speechSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }
  function speechStart(onResult, onEnd) {
    /* 优先使用云端 ASR（移动端/iOS/微信通用）；不支持时回退浏览器 Web Speech */
    if (asrSupported && asrSupported()) return asrRecognize(onResult, onEnd);
    if (!speechSupported()) { if (onEnd) onEnd('unsupported'); return false; }
    try {
      var r = getSR();
      if (!r) { if (onEnd) onEnd('unsupported'); return false; }
      r.lang = 'zh-CN';
      r.interimResults = true;
      r.maxAlternatives = 6;
      r.continuous = false;
      speechRec = r;
      speechOnResult = onResult;
      speechOnEnd = onEnd;
      r.onresult = function (ev) {
        var finals = [];
        for (var i = ev.resultIndex; i < ev.results.length; i++) {
          var res = ev.results[i];
          if (res.isFinal) {
            for (var a = 0; a < res.length; a++) finals.push(res[a].transcript);
          } else if (speechOnResult) {
            speechOnResult([], [res[0].transcript]);
          }
        }
        if (finals.length && speechOnResult) speechOnResult(finals, []);
      };
      r.onerror = function (e) {
        speechActive = false; speechRec = null;
        if (speechOnEnd) speechOnEnd((e && e.error) || 'error');
      };
      r.onend = function () {
        speechActive = false; speechRec = null;
        if (speechOnEnd) speechOnEnd(null);
      };
      r.start();
      speechActive = true;
      return true;
    } catch (e) {
      speechActive = false; speechRec = null;
      if (onEnd) onEnd('error');
      return false;
    }
  }
  function speechStop() {
    try { if (speechRec) speechRec.stop(); } catch (e) {}
    speechActive = false; speechRec = null;
  }
  /* 预热参考语音（成语范读），提高试听速度 */
  var preloaded = {};
  function preloadVoice(char) {
    if (!char || preloaded[char]) return;
    var safe = char.replace(/[/\\:]/g, '_');
    try {
      var a = new Audio('voice/word/' + safe + '.mp3');
      a.preload = 'auto'; a.volume = 0; a.load();
      preloaded[char] = a;
    } catch (e) {}
  }

  /* ============== 云端语音识别（讯飞 iat WebAPI，浏览器直连 WebSocket，无 CORS，iOS/微信可用） ==============
     流程：MediaRecorder 录音 → 转 16k 单声道 PCM → 讯飞 WS 识别 → 返回文本。
     解决 iOS Safari / 微信内置浏览器不提供 SpeechRecognition 导致手机无法朗读判定的问题。 */
  function asrConfig() {
    try {
      var g = Store.get();
      var a = (g && g.asr) || {};
      return { appId: a.appId || '', apiKey: a.apiKey || '', apiSecret: a.apiSecret || '' };
    } catch (e) { return { appId: '', apiKey: '', apiSecret: '' }; }
  }
  function asrSupported() {
    var c = asrConfig();
    var hasMedia = navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
                   window.MediaRecorder && (window.AudioContext || window.webkitAudioContext);
    var hasCrypto = window.crypto && window.crypto.subtle;   /* 讯飞签名需要 HMAC-SHA256 */
    return !!(c.appId && c.apiKey && c.apiSecret && hasMedia && hasCrypto);
  }
  /* ArrayBuffer → base64 */
  function abToBase64(buf) {
    var bytes = new Uint8Array(buf);
    var bin = '', chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(bin);
  }
  /* 任意浏览器录音（webm/opus/mp4/aac）→ 16kHz 单声道 16bit PCM(Int16) */
  function audioToPcm16(blob, cb) {
    var fr = new FileReader();
    fr.onload = function () {
      var arr = fr.result;
      var AC = window.AudioContext || window.webkitAudioContext;
      try { var ac = new AC(); } catch (e) { cb('audioctx_fail'); return; }
      ac.decodeAudioData(arr).then(function (buf) {
        var targetRate = 16000;
        var OffAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        var offLen = Math.max(1, Math.ceil(buf.duration * targetRate));
        var offline = new OffAC(1, offLen, targetRate);
        var src = offline.createBufferSource();
        src.buffer = buf; src.connect(offline.destination); src.start();
        offline.startRendering().then(function (rendered) {
          var ch = rendered.getChannelData(0), len = ch.length;
          var pcm = new Int16Array(len);
          for (var i = 0; i < len; i++) {
            var s = Math.max(-1, Math.min(1, ch[i]));
            pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          cb(null, pcm);
        }).catch(function () { cb('resample_fail'); });
      }).catch(function () { cb('decode_fail'); });
    };
    fr.onerror = function () { cb('read_fail'); };
    fr.readAsArrayBuffer(blob);
  }
  /* 讯飞鉴权签名（HMAC-SHA256，使用原生 crypto.subtle） */
  function xfyunSign(apiKey, apiSecret) {
    return new Promise(function (resolve, reject) {
      try {
        var date = new Date().toUTCString();
        var host = 'iat-api.xfyun.cn';
        var sigOrigin = 'host: ' + host + '\n' + 'date: ' + date + '\n' + 'GET /v2/iat HTTP/1.1';
        var enc = new TextEncoder();
        crypto.subtle.importKey('raw', enc.encode(apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
          .then(function (key) { return crypto.subtle.sign('HMAC', key, enc.encode(sigOrigin)); })
          .then(function (sig) {
            var sigB64 = abToBase64(sig);
            var authOrigin = 'api_key="' + apiKey + '", algorithm="hmac-sha256", headers="host date request-line", signature="' + sigB64 + '"';
            var authB64 = btoa(authOrigin);
            var url = 'wss://iat-api.xfyun.cn/v2/iat?authorization=' + encodeURIComponent(authB64) +
                      '&date=' + encodeURIComponent(date) + '&host=' + host;
            resolve(url);
          }).catch(function (e) { reject(e); });
      } catch (e) { reject(e); }
    });
  }
  function decodeXfResult(r) {
    var str = '';
    if (!r || !r.ws) return str;
    for (var i = 0; i < r.ws.length; i++) {
      var ws = r.ws[i];
      if (ws && ws.cw && ws.cw.length) str += ws.cw[0].w;
    }
    return str;
  }
  /* 讯飞识别：录音 → 转 PCM → WS 分帧发送 → 返回文本 */
  function asrRecognize(onResult, onEnd) {
    if (!asrSupported()) { if (onEnd) onEnd('unsupported'); return false; }
    var cfg = asrConfig();
    var stream = null, rec = null, chunks = [], stopped = false;
    function done(err, text) { if (onEnd) onEnd(err || null, text || ''); }
    function cleanup() {
      try { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      try { if (rec && rec.state !== 'inactive') rec.stop(); } catch (e) {}
    }
    function sendFrames(ws, pcm, appId) {
      var frameSize = 1280, offset = 0, total = pcm.byteLength, frames = [];
      while (offset < total) {
        var end = Math.min(offset + frameSize, total);
        var slice = pcm.buffer.slice(pcm.byteOffset + offset, pcm.byteOffset + end);
        frames.push({ audio: abToBase64(slice), status: (end >= total) ? 2 : 1 });
        offset = end;
      }
      if (!frames.length) frames.push({ audio: '', status: 2 });
      frames.forEach(function (f, idx) {
        var frame = { data: { status: f.status, format: 'audio/L16;rate=16000', encoding: 'raw', audio: f.audio } };
        if (idx === 0) {
          frame.common = { app_id: appId };
          frame.business = { language: 'zh_cn', domain: 'iat', accent: 'mandarin', vad_eos: 1500 };
        }
        ws.send(JSON.stringify(frame));
      });
    }
    function startWS(pcm) {
      xfyunSign(cfg.apiKey, cfg.apiSecret).then(function (url) {
        var ws, finished = false;
        try { ws = new WebSocket(url); } catch (e) { done('ws_fail'); return; }
        ws.onopen = function () { sendFrames(ws, pcm, cfg.appId); };
        ws.onmessage = function (ev) {
          var data; try { data = JSON.parse(ev.data); } catch (e) { return; }
          if (data.code !== 0) { try { ws.close(); } catch (e) {} if (!finished) { finished = true; done('asr_err:' + data.code); } return; }
          var text = decodeXfResult(data.data && data.data.result);
          if (data.data && data.data.status === 2) {
            finished = true;
            try { ws.close(); } catch (e) {}
            if (text) { if (onResult) onResult([text], []); done(null, text); }
            else done('no-speech');
          } else if (text) {
            if (onResult) onResult([], [text]);
          }
        };
        ws.onerror = function () { if (!finished) { finished = true; done('ws_fail'); } };
        ws.onclose = function () { if (!finished) { finished = true; done('ws_closed'); } };
      }).catch(function () { done('sign_fail'); });
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { done('mic_denied'); return false; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
      stream = s;
      try { rec = new MediaRecorder(stream); } catch (e) { cleanup(); done('rec_fail'); return; }
      chunks = [];
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = function () {
        if (stopped) return; stopped = true;
        var blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        audioToPcm16(blob, function (err, pcm) {
          cleanup();
          if (err) { done(err); return; }
          startWS(pcm);
        });
      };
      try { rec.start(); } catch (e) { cleanup(); done('rec_start_fail'); return; }
      setTimeout(function () { try { if (rec && rec.state !== 'inactive') rec.stop(); } catch (e) {} }, 5000);
    }).catch(function () { cleanup(); done('mic_denied'); return false; });
    return true;
  }

  return {
    /* 音效 */
    deal: deal, hit: hit, miss: miss, tick: tick, fanfare: fanfare, finish: finish,
    say: say, teacherRead: teacherRead, idiomRead: idiomRead, setMuted: setMuted, isMuted: isMuted, unlock: ac,
    examBeep: examBeep, examChime: examChime, examTick: examTick,
    speakSeq: speakSeq, stopSeq: stopSeq,
    comboFx: comboFx, comboPraise: comboPraise, comboFail: comboFail,
    wordsCorrect: wordsCorrect,
    openQuiz: openQuiz, settleWin: settleWin, settleFail: settleFail,
    /* 数学 / 例句 AI 语音 */
    mathSpeak: mathSpeak, rhymeSpeak: rhymeSpeak, rhymeTeach: rhymeTeach, sentenceRead: sentenceRead,
    /* BGM */
    bgmStart: bgmStart, bgmStop: bgmStop, bgmIsPlaying: bgmIsPlaying,
    setBgmVol: setBgmVol, getBgmVol: getBgmVol,
    /* edge-tts 浏览器直连 */
    ttsCheck: function () { return true; }, ttsAvailable: function () { return true; }, ttsStop: ttsStop,
    /* 公开短语链供外部直接使用 */
    phraseChain: phraseChain,
    /* 语音识别 + 参考语音预热 */
    speechSupported: speechSupported, speechStart: speechStart, speechStop: speechStop, preloadVoice: preloadVoice,
    asrSupported: asrSupported
  };
})();
