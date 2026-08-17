/* 学习档案：历史改动记录 + 导出 / 导入 / 清空 */
var Archive = (function () {
  'use strict';
  var filter = 'all';

  var TYPE = {
    words: { nm: '字词', c: '#55d6ff' },
    math: { nm: '算术', c: '#ffe0a3' },
    review: { nm: '错字', c: '#ff4a5e' },
    plan: { nm: '计划', c: '#b45cff' },
    sys: { nm: '系统', c: '#7dff9b' }
  };

  function fmt(ts) {
    var d = new Date(ts), p = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function rel(ts) {
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return '刚刚';
    if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
    if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
    var d = Math.floor(s / 86400);
    if (d < 30) return d + ' 天前';
    return Math.floor(d / 30) + ' 个月前';
  }

  function render() {
    var host = document.getElementById('archiveBody');
    if (!host) return;
    var list = Store.historyList(filter);
    var all = Store.historyList('all');

    /* 概览统计 */
    var cnt = { words: 0, math: 0, review: 0, plan: 0 };
    all.forEach(function (h) { if (cnt[h.type] !== undefined) cnt[h.type]++; });
    var newMistake = all.filter(function (h) { return h.action === '新增错题'; }).length;
    var solved = all.filter(function (h) { return h.action === '攻克错字'; }).length;
    var g = Store.get();

    var seg = ['all', 'words', 'math', 'review', 'plan'].map(function (k) {
      var t = TYPE[k] || TYPE.sys;
      var n = k === 'all' ? all.length : cnt[k];
      return '<button data-f="' + k + '" class="' + (filter === k ? 'on' : '') + '">' + t.nm + ' ' + n + '</button>';
    }).join('');

    var html =
      '<div class="pagehead" style="margin-bottom:16px">' +
        '<h2>学习档案</h2><div class="spacer"></div>' +
        '<button class="btn-ghost" id="arcExport">导出数据</button>' +
        '<button class="btn-ghost" id="arcImport">导入合并</button>' +
        '<button class="btn-ghost" id="arcClear">清空记录</button>' +
        '<input type="file" id="arcFile" accept="application/json,.json" style="display:none">' +
      '</div>' +

      '<div class="arc-stats">' +
        stat('总记录', all.length, '#ffe0a3') +
        stat('字词训练', cnt.words, '#55d6ff') +
        stat('算术训练', cnt.math, '#ffe0a3') +
        stat('新增错题', newMistake, '#ff4a5e') +
        stat('攻克错字', solved, '#7dff9b') +
        stat('连续打卡', g.streak, '#b45cff') +
      '</div>' +

      '<div class="seg" id="arcSeg" style="margin:18px 0 14px">' + seg + '</div>' +

      '<div class="arc-list">' +
        (list.length ? list.map(itemHtml).join('') : '<div class="empty"><span class="big">暂无记录</span>去抽卡、算题或听写，每一次练习都会自动记在这里。</div>') +
      '</div>';

    host.innerHTML = html;

    host.querySelectorAll('#arcSeg button').forEach(function (b) {
      b.addEventListener('click', function () { filter = b.dataset.f; Sfx.tick(); render(); });
    });
    document.getElementById('arcExport').onclick = exportData;
    document.getElementById('arcImport').onclick = function () { document.getElementById('arcFile').click(); };
    document.getElementById('arcFile').onchange = importData;
    document.getElementById('arcClear').onclick = function () {
      if (confirm('确定清空全部历史记录？此操作不可恢复。')) { Store.clearHistory(); App.toast('历史记录已清空'); render(); }
    };
  }

  function stat(l, v, c) {
    return '<div class="hud-box" style="min-width:100px"><i>' + l + '</i><b style="color:' + (c || '#fff') + '">' + v + '</b></div>';
  }

  function itemHtml(h) {
    var t = TYPE[h.type] || TYPE.sys;
    return '<div class="arc-item">' +
      '<div class="arc-tag" style="border-color:' + t.c + ';color:' + t.c + '">' + t.nm + '</div>' +
      '<div class="arc-main">' +
        '<div class="arc-action">' + h.action + '</div>' +
        (h.detail ? '<div class="arc-detail">' + h.detail + '</div>' : '') +
      '</div>' +
      '<div class="arc-time"><span title="' + fmt(h.ts) + '">' + rel(h.ts) + '</span><br><i>' + fmt(h.ts) + '</i></div>' +
    '</div>';
  }

  function exportData() {
    var txt = Store.exportAll();
    var blob = new Blob([txt], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '海克斯学堂_学习档案_' + Store.today() + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    App.toast('已导出学习档案（可传到手机/平板继续使用）');
  }

  function importData(e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      var r = Store.importAll(reader.result);
      App.toast(r.ok ? r.msg : ('导入失败：' + r.msg));
      render(); App.syncHud();
    };
    reader.readAsText(f);
    e.target.value = '';
  }

  return { render: render };
})();
