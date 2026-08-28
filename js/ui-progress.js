/* =========================================================
   LE SYSTEME - onglet "Progression"
   Les chiffres, la tendance, le calendrier, la regularite.
   ========================================================= */

App.views = App.views || {};

App.views.progress = (function () {
  'use strict';

  var S = App.store;
  var range = '30';   // 7 | 30 | year | all

  function U() { return App.ui; }
  var SVGNS = 'http://www.w3.org/2000/svg';

  function svg(tag, attrs, children) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    (children || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }

  function rangeBounds() {
    var t = S.today();
    if (range === '7') return [S.addDays(t, -6), t];
    if (range === '30') return [S.addDays(t, -29), t];
    if (range === 'year') return [S.parseISO(t).getFullYear() + '-01-01', t];
    var f = S.firstDay();
    return [f < t ? f : t, t];
  }

  // ---------- les 4 cases + la serie ----------
  function statsBlock() {
    var el = U().el, u = U();
    var t = S.today();
    var d = S.dayStats(t);
    var wk = S.averageOver(S.startOfWeek(t), t);
    var mo = S.averageOver(S.startOfMonth(t), t);
    var all = S.averageOver(S.firstDay(), t);
    var goal = S.state.settings.dailyGoal;

    function stat(value, key) {
      return el('div', { class: 'stat' }, [
        el('div', { class: 'v' }, value === null
          ? [document.createTextNode('—')]
          : [document.createTextNode(u.pct(value)), el('small', { text: '%' })]),
        el('div', { class: 'k', text: key })
      ]);
    }

    var streak = S.streak();
    var filled = all.days;

    return el('div', { class: 'stats' }, [
      stat(d.filled && d.score !== null ? d.score : null, 'aujourd’hui'),
      stat(wk.avg, 'cette semaine'),
      stat(mo.avg, 'ce mois'),
      stat(all.avg, 'depuis le début'),
      el('div', { class: 'stat streak' }, [
        el('div', {}, [
          el('div', { class: 'v' }, [
            document.createTextNode(String(streak)),
            el('small', { text: ' jour' + (streak > 1 ? 's' : '') })
          ]),
          el('div', { class: 'k', text: 'série en cours ≥ ' + goal + ' %' })
        ]),
        el('div', { class: 'right' }, [
          el('div', { class: 'v', text: String(filled) }),
          el('div', { class: 'k', text: 'jours renseignés' })
        ])
      ])
    ]);
  }

  // ---------- selecteur de periode ----------
  function rangeBar() {
    var el = U().el;
    var opts = [['7', '7 j'], ['30', '30 j'], ['year', 'Année'], ['all', 'Tout']];
    return el('div', { class: 'rangebar' }, opts.map(function (o) {
      return el('button', {
        text: o[1], 'aria-pressed': String(range === o[0]),
        onclick: function () { range = o[0]; App.render(); }
      });
    }));
  }

  // ---------- graphique de tendance ----------
  function chart(from, to) {
    var el = U().el;
    var goal = S.state.settings.dailyGoal;
    var dates = S.rangeDates(from, to);
    var pts = dates.map(function (d, i) {
      var s = S.dayStats(d);
      return { i: i, d: d, v: (s.filled && s.score !== null) ? s.score : null };
    });
    var have = pts.filter(function (p) { return p.v !== null; });

    var W = 600, H = 160, PT = 12, PB = 12;
    var g = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none' });
    function x(i) { return dates.length < 2 ? W / 2 : (i / (dates.length - 1)) * W; }
    function y(v) { return PT + (1 - v / 100) * (H - PT - PB); }

    // ligne d'objectif
    g.appendChild(svg('line', {
      x1: 0, x2: W, y1: y(goal), y2: y(goal),
      stroke: '#61616b', 'stroke-width': 1, 'stroke-dasharray': '5 5',
      'vector-effect': 'non-scaling-stroke'
    }));

    if (have.length) {
      // aire + courbe reliant les jours renseignes
      var dPath = have.map(function (p, k) { return (k ? 'L' : 'M') + x(p.i) + ' ' + y(p.v); }).join(' ');
      var area = dPath + ' L' + x(have[have.length - 1].i) + ' ' + H + ' L' + x(have[0].i) + ' ' + H + ' Z';
      g.appendChild(svg('path', { d: area, fill: 'rgba(217,164,65,.10)' }));
      g.appendChild(svg('path', {
        d: dPath, fill: 'none', stroke: '#d9a441', 'stroke-width': 2,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round',
        'vector-effect': 'non-scaling-stroke'
      }));
      have.forEach(function (p) {
        g.appendChild(svg('circle', {
          cx: x(p.i), cy: y(p.v), r: have.length > 60 ? 0 : 2.5,
          fill: p.v >= goal ? '#5aa877' : '#e0574a',
          'vector-effect': 'non-scaling-stroke'
        }));
      });
    }

    var box = el('div', { class: 'card chartbox' }, [g]);
    if (!have.length) {
      U().clear(box);
      box.appendChild(el('div', {
        class: 'faint', style: 'text-align:center;padding:38px 10px;font-size:13.5px',
        text: 'Rien à afficher pour l’instant — remplis une journée et la courbe apparaît.'
      }));
      return box;
    }
    box.appendChild(el('div', {
      style: 'display:flex;justify-content:space-between;font-family:var(--mono);font-size:9.5px;color:#61616b;margin-top:6px'
    }, [
      el('span', { text: S.shortDate(from) }),
      el('span', { text: S.shortDate(to) })
    ]));
    box.appendChild(el('div', { class: 'chartlegend' }, [
      el('span', { style: 'color:#61616b' }, [el('i'), document.createTextNode('objectif ' + goal + ' %')]),
      el('span', { style: 'color:#d9a441' }, [el('i'), document.createTextNode('score quotidien')])
    ]));
    return box;
  }

  // ---------- calendrier en damier ----------
  function calendar(from, to) {
    var el = U().el;
    var goal = S.state.settings.dailyGoal;
    var mid = goal > 70 ? 70 : Math.round(goal * 0.8);

    var start = S.startOfWeek(from);
    var end = S.addDays(S.startOfWeek(to), 6);
    var weeks = [];
    var c = start, guard = 0;
    while (c <= end && guard++ < 800) {
      weeks.push(S.rangeDates(c, S.addDays(c, 6)));
      c = S.addDays(c, 7);
    }

    var head = el('div', { class: 'colhd' }, [1, 2, 3, 4, 5, 6, 7].map(function (w) {
      return el('span', { text: (w % 2 === 1) ? S.ISO_SHORT[w] : '' });
    }));
    var cols = weeks.map(function (w) {
      return el('div', { class: 'wk' }, w.map(function (d) {
        if (d < from || d > to) return el('div', { class: 'cell out' });
        var s = S.dayStats(d);
        var cls = 'cell';
        if (s.filled && s.score !== null) {
          cls += s.score >= goal ? ' g' : (s.score >= mid ? ' o' : ' r');
        }
        var title = S.longDate(d) + (s.filled && s.score !== null
          ? ' — ' + U().pct(s.score, 0) + ' %' : ' — non renseigné');
        return el('div', { class: cls, title: title });
      }));
    });

    return el('div', { class: 'card calbox' }, [
      el('div', { class: 'cal' }, [head].concat(cols)),
      el('div', { class: 'callegend' }, [
        el('span', {}, [el('i', { style: 'background:var(--green)' }), document.createTextNode('≥ ' + goal + ' %')]),
        el('span', {}, [el('i', { style: 'background:var(--orange)' }), document.createTextNode(mid + '–' + (goal - 1) + ' %')]),
        el('span', {}, [el('i', { style: 'background:var(--red)' }), document.createTextNode('< ' + mid + ' %')]),
        el('span', {}, [el('i', { style: 'background:#1a1a1f' }), document.createTextNode('non renseigné')])
      ])
    ]);
  }

  // ---------- regularite par habitude ----------
  function regs(from, to) {
    var el = U().el, u = U();
    var list = S.regularity(from, to);
    if (!list.length) {
      return el('div', { class: 'empty-note' }, [
        el('div', { text: 'Pas encore de journée renseignée sur cette période.' })
      ]);
    }
    return el('div', { class: 'regs' }, list.map(function (r) {
      return el('div', { class: 'reg' }, [
        el('div', { class: 'top' }, [
          el('span', { text: r.habit.name, style: 'color:var(--gold-soft);font-weight:600' }),
          el('span', { class: 'p', text: u.pct(r.pct, 0) + ' %' })
        ]),
        el('div', { class: 'rbar' }, [
          el('div', { style: 'width:' + Math.max(1, r.pct) + '%' })
        ]),
        el('div', {
          class: 'sub', style: 'font-family:var(--mono);font-size:9.5px;color:#61616b;margin-top:6px',
          text: r.ok + ' fois sur ' + r.total + ' jours concernés'
        })
      ]);
    }));
  }

  // ---------- rendu ----------
  function render(root) {
    var el = U().el;
    U().clear(root);
    var b = rangeBounds(), from = b[0], to = b[1];

    root.appendChild(statsBlock());
    root.appendChild(rangeBar());

    root.appendChild(el('div', { class: 'section-label' }, [el('span', { text: 'tendance' })]));
    root.appendChild(chart(from, to));

    root.appendChild(el('div', { class: 'section-label' }, [el('span', { text: 'calendrier' })]));
    root.appendChild(calendar(from, to));

    root.appendChild(el('div', { class: 'section-label' }, [el('span', { text: 'régularité par habitude' })]));
    root.appendChild(regs(from, to));
  }

  return { render: render };
})();
