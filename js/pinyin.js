/* 拼音解析 + 易混读音生成引擎 */
(function (global) {
  'use strict';

  var TONE_MAP = {
    'ā': ['a', 1], 'á': ['a', 2], 'ǎ': ['a', 3], 'à': ['a', 4],
    'ō': ['o', 1], 'ó': ['o', 2], 'ǒ': ['o', 3], 'ò': ['o', 4],
    'ē': ['e', 1], 'é': ['e', 2], 'ě': ['e', 3], 'è': ['e', 4],
    'ī': ['i', 1], 'í': ['i', 2], 'ǐ': ['i', 3], 'ì': ['i', 4],
    'ū': ['u', 1], 'ú': ['u', 2], 'ǔ': ['u', 3], 'ù': ['u', 4],
    'ǖ': ['v', 1], 'ǘ': ['v', 2], 'ǚ': ['v', 3], 'ǜ': ['v', 4], 'ü': ['v', 0]
  };

  var TONE_CHARS = {
    a: ['a', 'ā', 'á', 'ǎ', 'à'],
    o: ['o', 'ō', 'ó', 'ǒ', 'ò'],
    e: ['e', 'ē', 'é', 'ě', 'è'],
    i: ['i', 'ī', 'í', 'ǐ', 'ì'],
    u: ['u', 'ū', 'ú', 'ǔ', 'ù'],
    v: ['ü', 'ǖ', 'ǘ', 'ǚ', 'ǜ']
  };

  /* 把带调音节拆成 { base:'tian', tone:1 } */
  function parse(syllable) {
    var base = '', tone = 0;
    for (var i = 0; i < syllable.length; i++) {
      var ch = syllable[i];
      if (TONE_MAP[ch]) {
        base += TONE_MAP[ch][0];
        if (TONE_MAP[ch][1]) tone = TONE_MAP[ch][1];
      } else {
        base += ch;
      }
    }
    return { base: base, tone: tone };
  }

  /* 给无调音节标上声调，遵循 a>o>e，i/u 标后者 */
  function compose(base, tone) {
    if (!tone) return base.replace(/v/g, 'ü');
    var idx = -1;
    if (base.indexOf('a') >= 0) idx = base.indexOf('a');
    else if (base.indexOf('o') >= 0) idx = base.indexOf('o');
    else if (base.indexOf('e') >= 0) idx = base.indexOf('e');
    else {
      for (var i = base.length - 1; i >= 0; i--) {
        if ('iuv'.indexOf(base[i]) >= 0) { idx = i; break; }
      }
    }
    if (idx < 0) return base.replace(/v/g, 'ü');
    var vowel = base[idx];
    var replaced = TONE_CHARS[vowel] ? TONE_CHARS[vowel][tone] : vowel;
    return (base.slice(0, idx) + replaced + base.slice(idx + 1)).replace(/v/g, 'ü');
  }

  /* ============ 合法音节表：来自课本真实字音 ============
     生成的干扰项必须是课本里真实出现过的读音，孩子才会真的犹豫。 */
  var VALID = null;
  function buildValid() {
    try {
    VALID = {};
    var src = (typeof WORD_BANK !== 'undefined') ? WORD_BANK : null;
    if (!src) return;
    function add(p) {
      if (!p) return;
      p.split(/\s+/).forEach(function (syl) {
        var b = parse(syl).base;
        if (b) VALID[b] = 1;
      });
    }
    Object.keys(src).forEach(function (g) {
      var bk = src[g];
      /* shizi/xiezi/cihui/idioms 都是 { 课次: [item, ...], ... } 结构 */
      ['shizi', 'xiezi', 'cihui', 'idioms'].forEach(function (k) {
        var groups = bk[k];
        if (!groups) return;
        Object.keys(groups).forEach(function (lab) {
          (groups[lab] || []).forEach(function (it) { add(it.p); });
        });
      });
      /* poly 是数组 [{c, p, r: [...]}] */
      (bk.poly || []).forEach(function (it) { add(it.p); });
    });
    } catch (e) {
      window.console && console.error('Pinyin buildValid error:', e);
      /* fallback: mark VALID as non-empty dummy so confuseSyllable
         falls through to toneVariant instead of crashing */
      VALID = { __dummy: 1 };
    }
  }
  function isValid(b) { return !!(VALID && VALID[b]); }

  /* 声母表（长的排前面，保证 zh/ch/sh 先匹配） */
  var INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l',
                  'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w'];

  function split(base) {
    for (var i = 0; i < INITIALS.length; i++) {
      var ini = INITIALS[i];
      if (base.indexOf(ini) === 0 && base.length > ini.length) {
        return { i: ini, f: base.slice(ini.length) };
      }
    }
    return { i: '', f: base };
  }

  /* 韵母易混对（双向）。注意 base 里 ü 写作 v。
     weight 越大越优先——家长指定的前后鼻音 / 平翘舌 / ui-iu / ou-o / ei-ie 全部为 10。 */
  var FINAL_PAIRS = [
    ['an', 'ang', '前后鼻音 an/ang', 10],
    ['en', 'eng', '前后鼻音 en/eng', 10],
    ['in', 'ing', '前后鼻音 in/ing', 10],
    ['ian', 'iang', '前后鼻音 ian/iang', 10],
    ['uan', 'uang', '前后鼻音 uan/uang', 10],
    ['un', 'ong', '前后鼻音 un/ong', 9],
    ['vn', 'iong', '前后鼻音 ün/iong', 8],
    ['ui', 'iu', '易混韵母 ui/iu', 10],
    ['ou', 'o', '易混韵母 ou/o', 10],
    ['ei', 'ie', '易混韵母 ei/ie', 10],
    ['ie', 've', '易混韵母 ie/üe', 8],
    ['uo', 'o', '易混韵母 uo/o', 7],
    ['ai', 'ei', '易混韵母 ai/ei', 6],
    ['ao', 'ou', '易混韵母 ao/ou', 6],
    ['u', 'v', '易混韵母 u/ü', 6]
  ];

  /* 声母易混对（双向） */
  var INITIAL_PAIRS = [
    ['zh', 'z', '平翘舌 zh/z', 10],
    ['ch', 'c', '平翘舌 ch/c', 10],
    ['sh', 's', '平翘舌 sh/s', 10],
    ['n', 'l', '边鼻音 n/l', 7],
    ['f', 'h', '声母 f/h', 5],
    ['r', 'y', '声母 r/y', 4],
    ['b', 'p', '声母 b/p', 4],
    ['d', 't', '声母 d/t', 4],
    ['g', 'k', '声母 g/k', 4],
    ['j', 'q', '声母 j/q', 4]
  ];

  /* 生成一个音节的全部易混候选 [{base, kind, w}] */
  function variants(base) {
    var out = [], sp = split(base);
    function push(b, kind, w) {
      if (!b || b === base || !isValid(b)) return;
      for (var i = 0; i < out.length; i++) if (out[i].base === b) return;
      out.push({ base: b, kind: kind, w: w });
    }
    INITIAL_PAIRS.forEach(function (p) {
      if (sp.i === p[0]) push(p[1] + sp.f, p[2], p[3]);
      else if (sp.i === p[1]) push(p[0] + sp.f, p[2], p[3]);
    });
    FINAL_PAIRS.forEach(function (p) {
      if (sp.f === p[0]) push(sp.i + p[1], p[2], p[3]);
      else if (sp.f === p[1]) push(sp.i + p[0], p[2], p[3]);
    });
    return out;
  }

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* 按权重挑选：85% 的概率只在最高权重档里选，保证家长关注的易混点优先出现 */
  function pickWeighted(vs) {
    if (!vs.length) return null;
    var max = 0;
    vs.forEach(function (v) { if (v.w > max) max = v.w; });
    if (max >= 8 && Math.random() < 0.85) {
      var top = vs.filter(function (v) { return v.w === max; });
      return pick(top);
    }
    var total = 0;
    vs.forEach(function (v) { total += v.w; });
    var r = Math.random() * total;
    for (var i = 0; i < vs.length; i++) { r -= vs[i].w; if (r <= 0) return vs[i]; }
    return vs[vs.length - 1];
  }

  function toneVariant(p) {
    var tones = [1, 2, 3, 4].filter(function (t) { return t !== p.tone; });
    var near = p.tone === 1 ? [2, 4] : p.tone === 2 ? [3, 1] : p.tone === 3 ? [2, 4] : [1, 3];
    near = near.filter(function (t) { return tones.indexOf(t) >= 0; });
    var t = pick(near.length ? near : tones);
    return { text: compose(p.base, t), kind: '声调' };
  }

  /* 为一个带调音节生成一个易混音节 */
  function confuseSyllable(syl) {
    if (!VALID) buildValid();
    var p = parse(syl);
    var vs = variants(p.base);
    if (vs.length) {
      var v = pickWeighted(vs);
      /* 高优先易混点必出；低优先的留 25% 机会走声调混淆，保持题目多样 */
      if (v && (v.w >= 8 || Math.random() < 0.75)) {
        return { text: compose(v.base, p.tone), kind: v.kind };
      }
    }
    return toneVariant(p);
  }

  /* 词语：优先挑一个"能产生高优先易混点"的音节做混淆 */
  function confuse(pinyin) {
    if (!VALID) buildValid();
    var parts = pinyin.trim().split(/\s+/);
    var best = [], any = [];
    parts.forEach(function (s, idx) {
      var vs = variants(parse(s).base);
      var top = vs.filter(function (v) { return v.w >= 8; });
      if (top.length) best.push(idx);
      if (vs.length) any.push(idx);
    });
    var pool = best.length ? best : (any.length ? any : parts.map(function (_, i) { return i; }));
    var i = pick(pool);
    var r = confuseSyllable(parts[i]);
    var copy = parts.slice();
    copy[i] = r.text;
    var text = copy.join(' ');
    if (text === pinyin) {
      var p = parse(parts[i]);
      copy[i] = compose(p.base, p.tone === 4 ? 1 : p.tone + 1);
      text = copy.join(' ');
      r.kind = '声调';
    }
    return { text: text, kind: r.kind };
  }

  /* 去掉声调，用于对比 */
  function plain(pinyin) {
    return pinyin.split('').map(function (c) {
      return TONE_MAP[c] ? TONE_MAP[c][0] : c;
    }).join('');
  }

  global.Pinyin = { parse: parse, compose: compose, confuse: confuse, plain: plain };
})(window);
