/* /admin/reports (R55 · P12). Three layouts over one seeded year (Oct 2025 – Sep 2026, IST):
   A Ledger (one long report + sticky index) · B Cockpit (KPI tiles, small multiples, drill-in panel)
   · C Monthly review (the story in sentences beside each chart).
   Charts are hand-built inline SVG standing in for shadcn charts (Recharts): faint grid, one scale per chart,
   emphasised endpoint, hover tooltip, Chart/Table toggle and CSV on every chart, dark-mode preview. */
(() => {
  const TS = window.TS;
  const { inr, lakh, esc, ICON, PKGS } = TS;

  /* ================= seed history ================= */
  const MON = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
  const MONTH = ['October', 'November', 'December', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September'];
  const YR = [2025, 2025, 2025, 2026, 2026, 2026, 2026, 2026, 2026, 2026, 2026, 2026];
  const ML = (i) => `${MON[i]} ${YR[i]}`;
  const BK = [11, 13, 20, 19, 9, 10, 14, 21, 20, 8, 9, 12]; // bookings made (166)
  const BOOKED = [262400, 318300, 521200, 486100, 213900, 236800, 343200, 552400, 518300, 186200, 214100, 301900]; // ₹41,54,800
  const CXN = [1, 1, 1, 2, 0, 1, 1, 1, 1, 1, 0, 0];
  const CXV = [21800, 19500, 33600, 54200, 0, 28400, 17900, 31200, 26800, 22400, 0, 0];
  const PAID = [1, 1, 1, 1, 1, 1, 1, 0.96, 0.88, 0.71, 0.58, 0.43]; // share of live value collected
  const VIEWS = [1620, 1880, 2710, 2590, 1410, 1520, 2050, 2890, 2760, 1330, 1390, 1740];
  const ENQ = [34, 39, 58, 55, 27, 30, 41, 61, 57, 24, 27, 36];
  const HOLDS = [19, 22, 33, 31, 15, 17, 23, 35, 33, 13, 15, 20];

  const r100 = (n) => Math.round(n / 100) * 100;
  const lr = (total, w) => { // largest remainder: integer split that always sums to total
    const s = w.reduce((x, y) => x + y, 0);
    if (!total || !s) return w.map(() => 0);
    const raw = w.map((x) => (x / s) * total), out = raw.map(Math.floor);
    const left = total - out.reduce((x, y) => x + y, 0);
    raw.map((x, i) => [x - Math.floor(x), i]).sort((p, q) => q[0] - p[0]).slice(0, left).forEach(([, i]) => { out[i]++; });
    return out;
  };
  const pc = (a, b, d = 0) => (b ? ((a / b) * 100).toFixed(d) : (0).toFixed(d)) + '%';

  const MM = MON.map((_, i) => {
    const live = BOOKED[i] - CXV[i], colLive = r100(live * PAID[i]), cxPaid = r100(CXV[i] * 0.6), refunded = r100(cxPaid * 0.7);
    return { live, colLive, balance: live - colLive, cxPaid, refunded, collected: colLive + cxPaid };
  });

  const PK = ['kasol', 'manali', 'shimla', 'munnar', 'leh', 'goa', 'jaipur'];
  const SHORT = { kasol: 'Kasol weekend', manali: 'Manali · Kasol · Tosh', shimla: 'Shimla–Manali', munnar: 'Munnar & Alleppey', leh: 'Leh · Nubra · Pangong', goa: 'North Goa', jaipur: 'Rajasthan circuit' };
  const PLACE = { kasol: 'Kasol', manali: 'Manali', shimla: 'Shimla', munnar: 'Munnar', leh: 'Leh', goa: 'Goa', jaipur: 'Rajasthan' };
  const WIN = [0.22, 0.08, 0.14, 0.17, 0.03, 0.2, 0.16], SUM = [0.3, 0.2, 0.12, 0.06, 0.2, 0.04, 0.08];
  const TICKET = [0.45, 1.25, 1.1, 1.35, 1.9, 0.95, 1.6];
  const prof = (i) => (i <= 5 ? WIN : SUM);
  const PKC = MON.map((_, i) => lr(BK[i], prof(i)));
  const PKR = MON.map((_, i) => lr(BOOKED[i] / 100, PKC[i].map((c, k) => c * TICKET[k])).map((x) => x * 100)); // revenue follows the bookings

  /* departures that ran (48) — seeded, deterministic */
  const DEPC = { kasol: [1, 1, 1, 1, 0, 1, 1, 2, 2, 1, 1, 1], manali: [0, 0, 0, 0, 0, 0, 1, 1, 2, 1, 0, 1], shimla: [1, 0, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1],
    munnar: [1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 0], leh: [1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], goa: [1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], jaipur: [0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0] };
  const CAP = { kasol: 10, manali: 12, shimla: 12, munnar: 10, leh: 10, goa: 12, jaipur: 10 };
  const FILLB = { kasol: [0.88, 1], manali: [0.62, 0.92], shimla: [0.55, 0.86], munnar: [0.62, 0.95], leh: [0.52, 0.92], goa: [0.48, 0.86], jaipur: [0.56, 0.9] };
  let seed = 20251001;
  const rng = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MJS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DEPS = [];
  MON.forEach((_, i) => PK.forEach((k) => {
    const n = DEPC[k][i], mo = (i + 9) % 12;
    for (let j = 0; j < n; j++) {
      let day;
      if (k === 'kasol') { const d1 = new Date(Date.UTC(YR[i], mo, 1)).getUTCDay(); const sat = 1 + ((6 - d1 + 7) % 7); day = n === 1 ? sat + 7 : sat + j * 14; }
      else day = 4 + Math.floor(rng() * 8) + j * 13;
      const [lo, hi] = FILLB[k], cap = CAP[k];
      DEPS.push({ m: i, k, date: new Date(Date.UTC(YR[i], mo, day)), cap, seats: Math.min(cap, Math.round(cap * (lo + rng() * (hi - lo)))) });
    }
  }));
  DEPS.sort((p, q) => p.date - q.date);
  const fd = (d, y) => `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MJS[d.getUTCMonth()]}${y ? ' ' + d.getUTCFullYear() : ''}`;
  const UPC = [ // next four weeks (today = Sun 27 Sep 2026)
    { k: 'kasol', d: 'Sat 3 Oct', seats: 9, cap: 10 }, { k: 'leh', d: 'Sat 3 Oct', seats: 4, cap: 10 }, { k: 'shimla', d: 'Thu 8 Oct', seats: 8, cap: 12 },
    { k: 'kasol', d: 'Sat 10 Oct', seats: 10, cap: 10 }, { k: 'leh', d: 'Sat 10 Oct', seats: 3, cap: 10 }, { k: 'manali', d: 'Mon 12 Oct', seats: 7, cap: 12 },
    { k: 'munnar', d: 'Fri 16 Oct', seats: 6, cap: 10 }, { k: 'goa', d: 'Sat 24 Oct', seats: 5, cap: 12 },
  ];
  const EMPTIEST = UPC.slice().sort((p, q) => p.seats / p.cap - q.seats / q.cap).slice(0, 3);

  const REASONS = ['Change of plans', 'Medical', 'Change of plans', 'Work leave', 'Weather / road closure', 'Change of plans', 'Medical', 'Found another trip', 'Work leave', 'Weather / road closure'];
  const CXL = [];
  MON.forEach((_, i) => { for (let j = 0; j < CXN[i]; j++) { const half = r100(MM[i].refunded / CXN[i]); CXL.push({ m: i, reason: REASONS[CXL.length], refund: j < CXN[i] - 1 ? half : MM[i].refunded - half * (CXN[i] - 1) }); } });

  const DISC = [{ name: 'Deals', give: 0.03, bk: 0.21, rev: 0.19 }, { name: 'Coupons', give: 0.013, bk: 0.1, rev: 0.09 }, { name: 'Early-bird', give: 0.021, bk: 0.17, rev: 0.18 }];
  const ADD = [{ name: 'Travel insurance', price: 699, rate: 0.29, u: 2.9, per: 'per traveller' }, { name: 'Airport pickup', price: 1800, rate: 0.22, u: 1, per: 'per booking' },
    { name: 'River rafting', price: 1200, rate: 0.18, u: 2.9, per: 'per traveller' }, { name: 'Solang activity pack', price: 2400, rate: 0.11, u: 2.9, per: 'per traveller' },
    { name: 'Extra night', price: 4500, rate: 0.08, u: 1, per: 'per room' }, { name: 'Houseboat upgrade', price: 6000, rate: 0.05, u: 1, per: 'per booking' }];
  const CH = [['Web', 0.71, 1], ['Phone', 0.1, 1.15], ['WhatsApp', 0.09, 1.05], ['Walk-in', 0.05, 1.2], ['Enquiry', 0.05, 1.3]];
  const PARTY = [['Solo', 0.12, 1], ['2', 0.43, 2], ['3–4', 0.31, 3.4], ['5+', 0.14, 5.8]];
  const LEAD = [['Under 7 d', 0.09], ['7–30 d', 0.34], ['31–60 d', 0.33], ['60+ d', 0.24]];

  const ALL = MON.map((_, i) => i);
  const PRESETS = [
    { id: 'this', label: 'This month', m: [11], range: '1 – 27 Sep 2026', from: '2026-09-01', to: '2026-09-27', prev: [10], title: 'September 2026, so far' },
    { id: 'last', label: 'Last month', m: [10], range: '1 – 31 Aug 2026', from: '2026-08-01', to: '2026-08-31', prev: [9], title: 'August 2026' },
    { id: 'season', label: 'Season (Oct–Mar)', m: [0, 1, 2, 3, 4, 5], range: '1 Oct 2025 – 31 Mar 2026', from: '2025-10-01', to: '2026-03-31', prev: null, title: 'Winter season 2025–26' },
    { id: '12m', label: '12 months', m: ALL, range: '1 Oct 2025 – 27 Sep 2026', from: '2025-10-01', to: '2026-09-27', prev: null, title: 'The first year' },
    { id: 'custom', label: 'Custom', m: [6, 7, 8], range: '1 Apr – 30 Jun 2026', from: '2026-04-01', to: '2026-06-30', prev: [3, 4, 5], title: 'Summer peak, Apr – Jun 2026' },
  ];

  function aggMonths(ms) {
    const S = (arr) => ms.reduce((s, i) => s + arr[i], 0);
    const a = { ms, N: S(BK), booked: S(BOOKED), cxN: S(CXN), cxv: S(CXV), views: S(VIEWS), enq: S(ENQ), holds: S(HOLDS) };
    ['live', 'colLive', 'balance', 'cxPaid', 'refunded', 'collected'].forEach((k) => { a[k] = ms.reduce((s, i) => s + MM[i][k], 0); });
    a.net = a.collected - a.refunded;
    a.deps = DEPS.filter((d) => ms.includes(d.m));
    a.seats = a.deps.reduce((s, d) => s + d.seats, 0); a.cap = a.deps.reduce((s, d) => s + d.cap, 0);
    a.pk = PK.map((k, j) => {
      const deps = a.deps.filter((d) => d.k === k), seats = deps.reduce((s, d) => s + d.seats, 0), cap = deps.reduce((s, d) => s + d.cap, 0);
      return { k, n: ms.reduce((s, i) => s + PKC[i][j], 0), rev: ms.reduce((s, i) => s + PKR[i][j], 0), deps: deps.length, seats, cap };
    }).filter((p) => p.n || p.deps).sort((p, q) => q.rev - p.rev);
    const cx = CXL.filter((c) => ms.includes(c.m));
    a.reasons = [...new Set(cx.map((c) => c.reason))].map((r) => ({ name: r, n: cx.filter((c) => c.reason === r).length, refund: cx.filter((c) => c.reason === r).reduce((s, c) => s + c.refund, 0) })).sort((p, q) => q.n - p.n || q.refund - p.refund);
    a.disc = DISC.map((d) => ({ name: d.name, given: r100(a.booked * d.give), n: Math.round(a.N * d.bk), by: r100(a.booked * d.rev) }));
    a.add = ADD.map((x) => { const n = Math.round(a.N * x.rate); return { ...x, n, rev: r100(n * x.price * x.u) }; }).sort((p, q) => q.rev - p.rev);
    a.addRev = a.add.reduce((s, x) => s + x.rev, 0); a.attach = Math.round(a.N * 0.58);
    const chN = lr(a.N, CH.map((c) => c[1])), chR = lr(a.booked / 100, CH.map((c, i) => chN[i] * c[2])).map((x) => x * 100);
    a.ch = CH.map((c, i) => ({ name: c[0], n: chN[i], rev: chR[i] }));
    const pN = lr(a.N, PARTY.map((p) => p[1]));
    a.party = PARTY.map((p, i) => ({ name: p[0], n: pN[i] }));
    a.trav = Math.round(PARTY.reduce((s, p, i) => s + pN[i] * p[2], 0));
    const lN = lr(a.N, LEAD.map((p) => p[1]));
    a.lead = LEAD.map((p, i) => ({ name: p[0], n: lN[i] }));
    a.repeat = Math.round(a.N * 0.16);
    return a;
  }
  const CACHE = {};
  const agg = (pid) => {
    if (CACHE[pid]) return CACHE[pid];
    const P = PRESETS.find((p) => p.id === pid);
    const a = aggMonths(P.m); a.P = P; a.prev = P.prev ? aggMonths(P.prev) : null;
    return (CACHE[pid] = a);
  };

  /* ================= state ================= */
  const S = { preset: '12m', dark: false, view: {}, csv: null, drill: 'money', q: 'money', anim: true, lastV: '' };

  /* ================= chart primitives ================= */
  const HEX = { c1: '#1B4FD8', c2: '#C98314', cw: '#B0501C' };
  const SPEC = {}, TIPS = {};
  const niceStep = (max, n) => { const raw = max / n, mag = 10 ** Math.floor(Math.log10(raw)); for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= raw) return m * mag; return 10 * mag; };
  const ticks = (max, n = 4) => { if (max <= 0) return [0]; const st = niceStep(max, n), t = []; for (let v = 0; v <= max + 1e-9; v += st) t.push(Math.round(v * 1000) / 1000); return t; };
  const barPath = (x, y0, w, h) => {
    if (h <= 0.4) return `M${x.toFixed(1)},${y0}h${w.toFixed(1)}`;
    const r = Math.min(4, w / 2, h);
    return `M${x.toFixed(2)},${y0}v${(-(h - r)).toFixed(2)}q0,${-r} ${r},${-r}h${(w - 2 * r).toFixed(2)}q${r},0 ${r},${r}v${(h - r).toFixed(2)}z`;
  };
  const yMoney = (v) => (v === 0 ? '₹0' : v >= 1e5 ? lakh(v) : '₹' + Math.round(v / 1000) + 'k');

  function draw(s, W = 640) {
    const H = s.h, L = s.pl ?? 54, R = s.pr ?? 12, T = 22, B = s.xsub ? 44 : 30;
    const pw = W - L - R, ph = H - T - B, n = s.labels.length, band = pw / n;
    const dmax = Math.max(1, ...s.series.flatMap((x) => x.vals));
    const top = s.top || dmax * 1.14;
    const y = (v) => T + ph - (v / top) * ph;
    const X = (i) => L + (i + 0.5) * band;
    const hi = new Set(s.hi || s.labels.map((_, i) => i));
    const fmt = s.fmt || String;
    let o = '';
    if (s.type === 'area' && s.hi && s.hi.length < n) {
      const a = Math.min(...s.hi), b = Math.max(...s.hi);
      o += `<rect class="rb" x="${(L + a * band).toFixed(1)}" y="${T - 8}" width="${((b - a + 1) * band).toFixed(1)}" height="${ph + 8}" rx="6" fill="#EEF3FF"/>`;
    }
    ticks(dmax, s.nt || 4).forEach((v) => {
      const yy = y(v).toFixed(1);
      o += `<line class="${v === 0 ? 'bl' : 'gl'}" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="#E9EDF1"/><text class="tx" x="${L - 8}" y="${yy}" dy="4" text-anchor="end" fill="#5E6B76">${fmt(v)}</text>`;
    });
    s.labels.forEach((_, i) => {
      const ys = s.type === 'area' ? ` data-ys="${s.series.map((se) => y(se.vals[i]).toFixed(1)).join(',')}"` : '';
      o += `<rect class="hit" data-i="${i}" data-x="${X(i).toFixed(1)}"${ys} x="${(L + i * band).toFixed(1)}" y="${T}" width="${band.toFixed(2)}" height="${ph}" fill="transparent"/>`;
    });
    let lastX = -99;
    s.labels.forEach((lab, i) => {
      const t = s.xl ? s.xl[i] : lab, cx = X(i);
      if (t && cx - lastX >= (s.gap || 34)) { lastX = cx; o += `<text class="tx${hi.has(i) && s.hi && s.hi.length < n ? ' on' : ''}" x="${cx.toFixed(1)}" y="${T + ph + 18}" text-anchor="middle" fill="#5E6B76">${t}</text>`; }
      if (s.xsub && s.xsub[i]) o += `<text class="tx sub" x="${cx.toFixed(1)}" y="${T + ph + 34}" text-anchor="middle" fill="#5E6B76">${s.xsub[i]}</text>`;
    });
    if (s.type === 'bar') {
      const m = s.series.length;
      let bw = Math.max(1.5, Math.min(28, (band * (m > 1 ? 0.72 : 0.62) - (m - 1) * 2) / m));
      const inner = bw * m + (m - 1) * 2;
      s.series.forEach((se, j) => se.vals.forEach((v, i) => {
        const cls = (s.clsOf && s.clsOf(i, j)) || se.cls;
        o += `<path class="bar ${cls}${hi.has(i) ? '' : ' dim'}" style="--i:${i}" d="${barPath(L + i * band + (band - inner) / 2 + j * (bw + 2), T + ph, bw, (v / top) * ph)}" fill="${HEX[cls]}"/>`;
      }));
    }
    if (s.type === 'area') {
      o += '<g class="wipe">';
      s.series.forEach((se, j) => {
        const pts = se.vals.map((v, i) => `${X(i).toFixed(1)},${y(v).toFixed(1)}`).join(' L');
        if (j === 0) o += `<path class="ar ${se.cls}" d="M${X(0).toFixed(1)},${T + ph} L${pts} L${X(n - 1).toFixed(1)},${T + ph} Z" fill="${HEX[se.cls]}" fill-opacity=".14"/>`;
        o += `<path class="ln ${se.cls}" d="M${pts}" fill="none" stroke="${HEX[se.cls]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      });
      o += '</g>';
    }
    if (s.ref) { const yy = y(s.ref.v).toFixed(1); o += `<line class="ref" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="#5E6B76"/><text class="tx" x="${W - R}" y="${yy - 5}" text-anchor="end" fill="#5E6B76">${s.ref.label}</text>`; }
    if (s.type === 'area') {
      const e = Math.max(...hi), v = s.series[0].vals[e], ex = X(e), ey = y(v);
      const anchor = ex > W - R - 44 ? 'end' : ex < L + 44 ? 'start' : 'middle';
      o += `<circle class="ept c1" cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="5" fill="#1B4FD8" stroke="#fff" stroke-width="2"/>`;
      o += `<text class="tx ep-l" x="${(anchor === 'end' ? ex + 6 : anchor === 'start' ? ex - 6 : ex).toFixed(1)}" y="${(ey - 12).toFixed(1)}" text-anchor="${anchor}" fill="#14202A">${fmt(v)}</text>`;
      o += `<line class="xh" x1="0" x2="0" y1="${T}" y2="${T + ph}" stroke="#5E6B76" visibility="hidden"/>`;
      s.series.forEach((se, j) => { o += `<circle class="hd ${se.cls}" data-j="${j}" cx="0" cy="0" r="4" fill="${HEX[se.cls]}" stroke="#fff" stroke-width="2" visibility="hidden"/>`; });
    }
    return `<svg class="rsvg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(s.aria || '')}">${o}</svg>`;
  }
  const chartBox = (spec, tips) => {
    SPEC[spec.id] = spec; TIPS[spec.id] = tips;
    return `<div class="rc" data-chart="${spec.id}"><div class="rsw">${draw(spec)}</div><div class="rtip" hidden></div></div>`;
  };
  const tip = (title, lines, foot) => `<b>${title}</b>${lines.map(([k, l, v]) => `<span>${k ? `<i class="sw ${k}"></i>` : ''}${l}<b class="num">${v}</b></span>`).join('')}${foot ? `<small>${foot}</small>` : ''}`;
  const legend = (items, note) => `<div class="rleg">${items.map(([k, l]) => `<span><i class="sw ${k}"></i>${l}</span>`).join('')}${note ? `<small>${note}</small>` : ''}</div>`;
  const hbars = (rows, o = {}) => {
    const max = o.max || Math.max(1, ...rows.map((r) => r.v));
    return `<div class="hb${o.x ? ' x' : ''}">${rows.map((r, i) => `<div class="hb-r"${r.tip ? ` title="${esc(r.tip)}"` : ''}><span class="hb-l">${r.label}${r.sub ? `<small>${r.sub}</small>` : ''}</span><span class="hb-t"><i class="${r.k || o.k || 'k1'}" style="--w:${((r.v / max) * 100).toFixed(1)}%;--i:${i}"></i></span><b class="hb-v num">${r.txt}</b>${o.x ? `<span class="hb-x">${r.x || ''}</span>` : ''}</div>`).join('')}</div>`;
  };
  const vcols = (rows, k = 'k1') => {
    const max = Math.max(1, ...rows.map((r) => r.v));
    return `<div class="vc">${rows.map((r, i) => `<div class="vc-c"><b class="num">${r.txt}</b><span class="vc-t"><i class="${k}" style="--h:${((r.v / max) * 100).toFixed(1)}%;--i:${i}"></i></span><small>${r.label}</small></div>`).join('')}</div>`;
  };
  const miniCols = (vals, hi, clsOf) => {
    const W = 120, H = 40, n = vals.length, band = W / n, max = Math.max(1, ...vals), bw = band * 0.64;
    return `<svg class="rsvg mini" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${vals.map((v, i) => {
      const h = Math.max(1, (v / max) * (H - 2)), c = (clsOf && clsOf(i)) || 'c1';
      return `<rect class="bar ${c}${hi && !hi.has(i) ? ' dim' : ''}" style="--i:${i}" x="${(i * band + (band - bw) / 2).toFixed(2)}" y="${(H - h).toFixed(2)}" width="${bw.toFixed(2)}" height="${h.toFixed(2)}" rx="1" fill="${HEX[c]}"/>`;
    }).join('')}</svg>`;
  };
  const miniArea = (vals, hi) => {
    const W = 120, H = 40, n = vals.length, max = Math.max(...vals) * 1.08, X = (i) => (i / (n - 1)) * W, Y = (v) => H - (v / max) * (H - 2);
    const pts = vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' L');
    const a = Math.min(...hi), b = Math.max(...hi);
    return `<svg class="rsvg mini" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${hi.length < n ? `<rect class="rb" x="${Math.max(0, X(a) - 4).toFixed(1)}" y="0" width="${(X(b) - X(a) + 8).toFixed(1)}" height="${H}" fill="#EEF3FF"/>` : ''}<g class="wipe"><path class="ar c1" d="M0,${H} L${pts} L${W},${H} Z" fill="#1B4FD8" fill-opacity=".14"/><path class="ln c1" d="M${pts}" fill="none" stroke="#1B4FD8" stroke-width="2" vector-effect="non-scaling-stroke"/></g></svg>`;
  };
  const miniBars = (vals, k = 'k1', max) => { const m = max || Math.max(1, ...vals); return `<div class="mbars">${vals.map((v, i) => `<span><i class="${Array.isArray(k) ? k[i] : k}" style="--w:${((v / m) * 100).toFixed(1)}%;--i:${i}"></i></span>`).join('')}</div>`; };
  const table = (cols, rows, foot) => `<div class="a-tw"><table class="a-table"><thead><tr>${cols.map((c) => `<th class="${c.n ? 'num' : ''}">${c.t}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v, i) => `<td class="${cols[i].n ? 'num' : ''}">${v}</td>`).join('')}</tr>`).join('')}</tbody>${foot ? `<tfoot><tr>${foot.map((v, i) => `<td class="${cols[i].n ? 'num' : ''}">${v}</td>`).join('')}</tr></tfoot>` : ''}</table></div>`;
  const delta = (a, b, name) => {
    if (!b) return '';
    const d = Math.round(((a - b) / b) * 100);
    return d === 0 ? `level with ${name}` : `${d > 0 ? 'up' : 'down'} ${Math.abs(d)}% on ${name}`;
  };

  /* ================= the nine sections ================= */
  function sections(a) {
    const P = a.P, hiSet = new Set(a.ms), prevName = P.prev ? (P.prev.length === 1 ? MONTH[P.prev[0]] : 'Jan – Mar') : '';
    const peak = a.ms.reduce((b, i) => (BOOKED[i] > BOOKED[b] ? i : b), a.ms[0]);
    const out = [];

    /* 1 · Money */
    {
      const moneyRows = a.ms.map((i) => [ML(i), BK[i], inr(BOOKED[i]), inr(MM[i].collected), inr(MM[i].refunded), inr(MM[i].collected - MM[i].refunded), inr(MM[i].balance)]);
      const dl = a.prev ? delta(a.booked, a.prev.booked, prevName) : '';
      out.push({
        id: 'money', title: 'Money', idx: lakh(a.booked),
        facts: [['Booked', lakh(a.booked)], ['Collected', lakh(a.collected)], ['Refunded', lakh(a.refunded)], ['Net', lakh(a.net)], ['Balances due', lakh(a.balance)]],
        chart: (o = {}) => {
          const spec = { id: 'money', type: o.money || 'area', h: o.h || 260, labels: MON, xsub: ['2025', '', '', '2026', '', '', '', '', '', '', '', ''], hi: a.ms, fmt: yMoney, pr: 16,
            series: [{ cls: 'c1', vals: BOOKED }, { cls: 'c2', vals: MM.map((m) => m.collected) }], aria: 'Booked and collected by month, October 2025 to September 2026' };
          const tips = MON.map((_, i) => tip(ML(i), [['k1', 'Booked', lakh(BOOKED[i])], ['k2', 'Collected', lakh(MM[i].collected)]], `${BK[i]} bookings${hiSet.has(i) ? '' : ' · outside range'}`));
          return legend([['k1', 'Booked'], ['k2', 'Collected']], a.ms.length < 12 ? 'Selected range highlighted; other months for context' : 'By month the booking was made') + chartBox(spec, tips)
            + `<p class="recon num">Booked ${inr(a.booked)} = live ${inr(a.live)} + cancelled ${inr(a.cxv)} · live = collected ${inr(a.colLive)} + balances due ${inr(a.balance)}</p>`;
        },
        table: () => table([{ t: 'Month' }, { t: 'Bookings', n: 1 }, { t: 'Booked', n: 1 }, { t: 'Collected', n: 1 }, { t: 'Refunded', n: 1 }, { t: 'Net', n: 1 }, { t: 'Balance due', n: 1 }], moneyRows,
          ['Total', a.N, inr(a.booked), inr(a.collected), inr(a.refunded), inr(a.net), inr(a.balance)]),
        rows: moneyRows.length + 1,
        tile: { v: lakh(a.booked), sub: `${a.N} bookings · ${pc(a.collected, a.booked)} collected`, mini: miniArea(BOOKED, a.ms) },
        head: a.prev ? `${lakh(a.booked)} booked, ${dl}.` : `${lakh(a.booked)} booked; ${MONTH[peak]} was the peak.`,
        story: [
          `${a.N} bookings came to ${lakh(a.booked)}, and ${pc(a.collected, a.booked)} of it is already collected.`,
          a.ms.length > 1 ? `${MONTH[peak]} was the biggest month at ${lakh(BOOKED[peak])}.` : `That is ${dl} (${lakh(a.prev.booked)}).`,
          a.balance ? `${lakh(a.balance)} in balances is still due before departure.` : 'Every live booking in this range is paid in full.',
        ],
        next: a.balance ? `Balance reminders go out 14 and 3 days before each departure; ${inr(a.balance)} is scheduled.` : '',
      });
    }

    /* 2 · Packages */
    {
      const pk = a.pk.map((p) => ({ ...p, fill: p.cap ? Math.round((p.seats / p.cap) * 100) : null }));
      const top = pk[0], ran = pk.filter((p) => p.cap).sort((p, q) => q.fill - p.fill), best = ran[0], worst = ran[ran.length - 1];
      const rows = pk.map((p) => [`<b>${PKGS[p.k].name}</b>`, p.n, inr(p.rev), p.deps, p.cap ? `${p.seats}/${p.cap}` : '—', p.fill === null ? 'No departures' : p.fill + '%']);
      out.push({
        id: 'packages', title: 'Packages', idx: SHORT[top.k],
        facts: [['Top earner', SHORT[top.k]], ['Its share', pc(top.rev, a.booked)], ['Fullest', best ? `${SHORT[best.k]} · ${best.fill}%` : '—']],
        chart: () => legend([['k1', 'Revenue']], 'Meter: seats filled on departures that ran in the range')
          + hbars(pk.map((p) => ({ label: SHORT[p.k], sub: `${p.n} booking${p.n === 1 ? '' : 's'}`, v: p.rev, txt: lakh(p.rev), tip: `${PKGS[p.k].name}: ${inr(p.rev)} from ${p.n} bookings`,
            x: p.fill === null ? '<span class="nofill">No departures</span>' : `<span class="a-meter" style="--v:${p.fill}%"></span><span class="num">${p.fill}%</span>` })), { x: 1 }),
        table: () => table([{ t: 'Package' }, { t: 'Bookings', n: 1 }, { t: 'Revenue', n: 1 }, { t: 'Departures', n: 1 }, { t: 'Seats', n: 1 }, { t: 'Fill', n: 1 }], rows,
          ['Total', a.N, inr(a.booked), a.deps.length, `${a.seats}/${a.cap}`, pc(a.seats, a.cap)]),
        rows: rows.length + 1,
        tile: { v: SHORT[top.k], sub: `${lakh(top.rev)} · ${pc(top.rev, a.booked)} of booked`, mini: miniBars(pk.slice(0, 4).map((p) => p.rev)) },
        head: best ? `${SHORT[top.k]} earned the most; ${SHORT[best.k]} ran fullest.` : `${SHORT[top.k]} earned the most.`,
        story: [
          `${PKGS[top.k].name} brought in ${lakh(top.rev)}, ${pc(top.rev, a.booked)} of everything booked.`,
          best && worst && best !== worst ? `${SHORT[best.k]} ran fullest at ${best.fill}%; ${SHORT[worst.k]} averaged ${worst.fill}%.` : best ? `${SHORT[best.k]} ran at ${best.fill}% full.` : '',
        ].filter(Boolean),
        next: worst && worst.fill < 70 ? `Put a deal on ${SHORT[worst.k]} before its next date.` : '',
      });
    }

    /* 3 · Occupancy */
    {
      const deps = a.deps, fills = deps.map((d) => Math.round((d.seats / d.cap) * 100));
      const single = a.ms.length === 1;
      const kas = deps.filter((d) => d.k === 'kasol'), kasFill = kas.length ? pc(kas.reduce((s, d) => s + d.seats, 0), kas.reduce((s, d) => s + d.cap, 0)) : '';
      const lehU = UPC.filter((u) => u.k === 'leh');
      const rows = deps.map((d, i) => [fd(d.date, true), PKGS[d.k].name, d.seats, d.cap, fills[i] + '%']);
      const upc = UPC.map((u) => [`${u.d} 2026 · upcoming`, PKGS[u.k].name, u.seats, u.cap, pc(u.seats, u.cap)]);
      out.push({
        id: 'occupancy', title: 'Occupancy', idx: pc(a.seats, a.cap) + ' full',
        facts: [['Departures run', deps.length], ['Average fill', pc(a.seats, a.cap)], ['Seats sold', `${a.seats} of ${a.cap}`]],
        chart: (o = {}) => {
          let prevM = -1;
          const xl = deps.map((d) => { if (single) return `${d.date.getUTCDate()}`; if (d.m === prevM) return ''; prevM = d.m; return MON[d.m]; });
          const spec = { id: 'occ', type: 'bar', h: o.h || 230, labels: deps.map((d) => fd(d.date)), xl, gap: single ? 22 : 30, top: 100, fmt: (v) => v + '%', nt: 4,
            series: [{ cls: 'c1', vals: fills }], clsOf: (i) => (fills[i] < 50 ? 'cw' : 'c1'), ref: { v: 50, label: 'Half full' }, aria: 'Seats filled per departure in the range' };
          const tips = deps.map((d, i) => tip(PKGS[d.k].name, [['', fd(d.date, true), ''], [fills[i] < 50 ? 'kw' : 'k1', `${d.seats} of ${d.cap} seats`, fills[i] + '%']]));
          return legend([['k1', 'Seats filled per departure'], ['kw', 'Under half full']]) + chartBox(spec, tips)
            + `<div class="upc"><h3>Next four weeks <span class="a-chip warn">${EMPTIEST.length} emptiest flagged</span></h3>${UPC.map((u) => {
              const f = Math.round((u.seats / u.cap) * 100), flag = EMPTIEST.includes(u);
              return `<div class="upc-r${flag ? ' flag' : ''}"><span class="num">${u.d}</span><span>${SHORT[u.k]}</span><span class="a-meter" style="--v:${f}%"></span><span class="num">${u.seats}/${u.cap}</span>${flag ? '<span class="a-chip warn">Emptiest</span>' : f === 100 ? '<span class="a-chip ok">Full</span>' : '<span></span>'}</div>`;
            }).join('')}</div>`;
        },
        table: () => table([{ t: 'Departure' }, { t: 'Package' }, { t: 'Seats sold', n: 1 }, { t: 'Capacity', n: 1 }, { t: 'Fill', n: 1 }], rows.concat(upc), ['Ran in range', `${deps.length} departures`, a.seats, a.cap, pc(a.seats, a.cap)]),
        rows: rows.length + upc.length + 1,
        tile: { v: pc(a.seats, a.cap), sub: `${deps.length} departures · Leh 10 Oct at 30%`, mini: miniCols(fills, null, (i) => (fills[i] < 50 ? 'cw' : 'c1')) },
        head: kasFill ? `${PLACE.kasol} weekends filled ${kasFill}; Leh's October dates are the worry.` : `Departures ran ${pc(a.seats, a.cap)} full.`,
        story: [
          `${deps.length} departure${deps.length === 1 ? '' : 's'} ran at ${pc(a.seats, a.cap)} average fill${kasFill ? `, and Kasol weekends filled ${kasFill}` : ''}.`,
          `Looking ahead, Leh's ${lehU.map((u) => u.d.replace('Sat ', '')).join(' and ')} dates sit at ${lehU.map((u) => pc(u.seats, u.cap)).join(' and ')}, the emptiest of the next four weeks.`,
        ],
        next: 'Merge the two Leh groups into 3 Oct, or push both dates on WhatsApp this week.',
      });
    }

    /* 4 · Funnel */
    {
      const st = [['Package views', a.views], ['Enquiries', a.enq], ['Holds', a.holds], ['Paid bookings', a.N]];
      const rows = st.map(([l, v], i) => [l, v.toLocaleString('en-IN'), i ? pc(v, st[i - 1][1], 1) : '—', pc(v, a.views, 2)]);
      out.push({
        id: 'funnel', title: 'Funnel', idx: pc(a.N, a.views, 2) + ' view → paid',
        facts: [['Views → paid', pc(a.N, a.views, 2)], ['Holds → paid', pc(a.N, a.holds)], ['Lapsed holds', a.holds - a.N]],
        chart: () => `<div class="fn">${st.map(([l, v], i) => `${i ? `<span class="fn-a" aria-hidden="true">${ICON.arrowR}</span>` : ''}<div class="fn-s"><small>${l}</small><b class="num">${v.toLocaleString('en-IN')}</b><span class="hb-t"><i class="k1" style="--w:${i ? ((v / st[i - 1][1]) * 100).toFixed(1) : 100}%;--i:${i}"></i></span><em class="num">${i ? `${pc(v, st[i - 1][1], 1)} of ${st[i - 1][0].toLowerCase()}` : 'Starting point'}</em></div>`).join('')}</div>`
          + '<p class="rfine">Each bar is the share of the stage before it (0–100%). Counted from page views, enquiries and holds already stored; no new tracking.</p>',
        table: () => table([{ t: 'Stage' }, { t: 'Count', n: 1 }, { t: 'Of previous', n: 1 }, { t: 'Of views', n: 1 }], rows),
        rows: rows.length,
        tile: { v: pc(a.N, a.views, 2), sub: 'of package views became paid bookings', mini: miniBars([100, (a.enq / a.views) * 100, (a.holds / a.enq) * 100, (a.N / a.holds) * 100], 'k1', 100) },
        head: `${pc(a.N, a.holds)} of holds turned into paid bookings.`,
        story: [`${a.views.toLocaleString('en-IN')} package views led to ${a.enq} enquiries and ${a.holds} holds; ${a.N} of those holds were paid.`, `${a.holds - a.N} holds lapsed or were released, which is where the next rupee is.`],
        next: '',
      });
    }

    /* 5 · Cancellations */
    {
      const kept = a.cxPaid - a.refunded;
      const rows = a.reasons.map((r) => [r.name, r.n, inr(r.refund)]);
      out.push({
        id: 'cancellations', title: 'Cancellations', idx: pc(a.cxN, a.N, 1) + ' rate',
        facts: [['Rate', pc(a.cxN, a.N, 1)], ['Refunded', inr(a.refunded)], ['Fees kept', inr(kept)]],
        chart: () => (a.cxN ? legend([['k2', 'Cancellations by reason']], 'Refund shown at the right') + hbars(a.reasons.map((r) => ({ label: r.name, v: r.n, txt: String(r.n), k: 'k2', x: `<span class="num">${inr(r.refund)}</span>` })), { x: 1 })
          : '<div class="a-empty">No cancellations on bookings made in this range.</div>'),
        table: () => (a.cxN ? table([{ t: 'Reason' }, { t: 'Cancellations', n: 1 }, { t: 'Refunded', n: 1 }], rows, ['Total', a.cxN, inr(a.refunded)]) : '<div class="a-empty">No cancellations on bookings made in this range.</div>'),
        rows: rows.length + 1,
        tile: { v: pc(a.cxN, a.N, 1), sub: `${a.cxN} cancelled · ${inr(a.refunded)} refunded`, mini: miniCols(CXN, hiSet, () => 'c2') },
        head: a.cxN ? `${a.cxN} of ${a.N} bookings cancelled; ${a.reasons[0].name.toLowerCase()} leads.` : 'No cancellations in this range.',
        story: a.cxN ? [`${a.cxN} of ${a.N} bookings were cancelled (${pc(a.cxN, a.N, 1)}); the most common reason was ${a.reasons[0].name.toLowerCase()}.`, `${inr(a.refunded)} went back to travellers and ${inr(kept)} was kept as cancellation fees.`]
          : ['Nobody who booked in this range has cancelled.'],
        next: '',
      });
    }

    /* 6 · Discounts */
    {
      const given = a.disc.reduce((s, d) => s + d.given, 0), brought = a.disc.reduce((s, d) => s + d.n, 0);
      const best = a.disc.slice().sort((p, q) => q.by / q.given - p.by / p.given)[0], worst = a.disc.slice().sort((p, q) => p.by / p.given - q.by / q.given)[0];
      const rows = a.disc.map((d) => [d.name, inr(d.given), d.n, inr(d.by), '₹' + Math.round(d.by / d.given)]);
      out.push({
        id: 'discounts', title: 'Discounts', idx: inr(given) + ' given',
        facts: [['Given', inr(given)], ['Bookings brought', brought], ['Share of booked', pc(given, a.booked, 1)]],
        chart: () => `<div class="fac2"><div><h3>₹ given</h3>${hbars(a.disc.map((d) => ({ label: d.name, v: d.given, txt: inr(d.given) })))}</div><div><h3>Bookings they brought</h3>${hbars(a.disc.map((d) => ({ label: d.name, v: d.n, txt: String(d.n), sub: `${inr(d.by)} booked`, k: 'k2' })))}</div></div>`,
        table: () => table([{ t: 'Type' }, { t: '₹ given', n: 1 }, { t: 'Bookings', n: 1 }, { t: 'Booked by them', n: 1 }, { t: 'Booked per ₹1 given', n: 1 }], rows, ['Total', inr(given), brought, inr(a.disc.reduce((s, d) => s + d.by, 0)), '₹' + Math.round(a.disc.reduce((s, d) => s + d.by, 0) / given)]),
        rows: rows.length + 1,
        tile: { v: inr(given), sub: `given · ${brought} bookings brought`, mini: miniBars(a.disc.map((d) => d.given)) },
        head: `${best.name} returned ₹${Math.round(best.by / best.given)} for every ₹1 given.`,
        story: [`${inr(given)} went out in discounts, ${pc(given, a.booked, 1)} of booked, across ${brought} bookings.`, `${best.name} returned ₹${Math.round(best.by / best.given)} of bookings per ₹1 given; ${worst.name.toLowerCase()} returned ₹${Math.round(worst.by / worst.given)}.`],
        next: '',
      });
    }

    /* 7 · Add-ons */
    {
      const rows = a.add.map((x) => [x.name, inr(x.price) + ' ' + x.per, x.n, pc(x.n, a.N), inr(x.rev)]);
      out.push({
        id: 'addons', title: 'Add-ons', idx: lakh(a.addRev),
        facts: [['Add-on revenue', inr(a.addRev)], ['Attach rate', pc(a.attach, a.N)], ['Top add-on', a.add[0].name]],
        chart: () => legend([['k1', 'Revenue']], 'Right: share of bookings that took it') + hbars(a.add.map((x) => ({ label: x.name, sub: `${inr(x.price)} ${x.per}`, v: x.rev, txt: inr(x.rev), x: `<span class="num">${pc(x.n, a.N)}</span>` })), { x: 1 }),
        table: () => table([{ t: 'Add-on' }, { t: 'Price' }, { t: 'Bookings', n: 1 }, { t: 'Attach', n: 1 }, { t: 'Revenue', n: 1 }], rows, ['All add-ons', '', a.attach + ' with one or more', pc(a.attach, a.N), inr(a.addRev)]),
        rows: rows.length + 1,
        tile: { v: inr(a.addRev), sub: `${pc(a.attach, a.N)} of bookings took an extra`, mini: miniBars(a.add.slice(0, 4).map((x) => x.rev)) },
        head: `${pc(a.attach, a.N)} of bookings added an extra.`,
        story: [`${a.attach} of ${a.N} bookings added at least one extra, worth ${inr(a.addRev)} (included in booked).`, `${a.add[0].name} earned the most at ${inr(a.add[0].rev)}.`],
        next: '',
      });
    }

    /* 8 · Channels */
    {
      const web = a.ch[0], counter = a.ch.slice(1), cN = counter.reduce((s, c) => s + c.n, 0), cR = counter.reduce((s, c) => s + c.rev, 0);
      const topC = counter.slice().sort((p, q) => q.n - p.n || q.rev - p.rev)[0];
      const rows = a.ch.map((c) => [c.name + (c.name === 'Web' ? '' : ' (counter)'), c.n, inr(c.rev), pc(c.n, a.N)]);
      out.push({
        id: 'channels', title: 'Channels', idx: pc(web.n, a.N) + ' web',
        facts: [['Web', `${web.n} bookings`], ['Counter', `${cN} bookings`], ['Counter booked', lakh(cR)]],
        chart: () => legend([['k1', 'Web'], ['k2', 'Counter (phone, WhatsApp, walk-in, enquiry)']])
          + `<div class="stk">${a.ch.filter((c) => c.n).map((c, i) => `<i class="${i ? 'k2' : 'k1'}" style="flex:${c.n} 1 0;--i:${i}" title="${c.name}: ${c.n} bookings"></i>`).join('')}</div>`
          + `<div class="stk-l">${a.ch.map((c, i) => `<span><i class="sw ${i ? 'k2' : 'k1'}"></i>${c.name}<b class="num">${c.n}</b><small class="num">${pc(c.n, a.N)} · ${lakh(c.rev)}</small></span>`).join('')}</div>`,
        table: () => table([{ t: 'Channel' }, { t: 'Bookings', n: 1 }, { t: 'Booked', n: 1 }, { t: 'Share', n: 1 }], rows, ['Total', a.N, inr(a.booked), '100%']),
        rows: rows.length + 1,
        tile: { v: pc(web.n, a.N), sub: `web · counter ${cN} bookings`, mini: `<div class="stk sm">${a.ch.filter((c) => c.n).map((c, i) => `<i class="${i ? 'k2' : 'k1'}" style="flex:${c.n} 1 0;--i:${i}"></i>`).join('')}</div>` },
        head: `The counter added ${cN} bookings worth ${lakh(cR)}.`,
        story: [`Web took ${web.n} of ${a.N} bookings; the counter added ${cN}, worth ${lakh(cR)}.`, topC.n > 1 ? `${topC.name} is the busiest counter channel with ${topC.n}.` : 'No counter channel brought more than one booking.'],
        next: '',
      });
    }

    /* 9 · Customers */
    {
      const two = a.party[1].n, far = a.lead[3].n + a.lead[2].n;
      const rows = a.party.map((p) => ['Party size', p.name, p.n, pc(p.n, a.N)]).concat(a.lead.map((p) => ['Booked ahead', p.name, p.n, pc(p.n, a.N)]), [['Customers', 'Repeat', a.repeat, pc(a.repeat, a.N)], ['Customers', 'First trip', a.N - a.repeat, pc(a.N - a.repeat, a.N)]]);
      out.push({
        id: 'customers', title: 'Customers', idx: (a.trav / a.N).toFixed(1) + ' per party',
        facts: [['Travellers', a.trav], ['Average party', (a.trav / a.N).toFixed(1)], ['Repeat', `${a.repeat} (${pc(a.repeat, a.N)})`]],
        chart: () => `<div class="fac3"><div><h3>Party size</h3>${vcols(a.party.map((p) => ({ label: p.name, v: p.n, txt: String(p.n) })))}</div><div><h3>Booked ahead</h3>${vcols(a.lead.map((p) => ({ label: p.name, v: p.n, txt: String(p.n) })))}</div>`
          + `<div><h3>Repeat customers</h3><p class="big num">${pc(a.repeat, a.N)}</p><div class="stk sm"><i class="k2" style="flex:${a.repeat} 1 0"></i><i class="k1" style="flex:${a.N - a.repeat} 1 0;--i:1"></i></div><div class="rleg"><span><i class="sw k2"></i>Repeat ${a.repeat}</span><span><i class="sw k1"></i>First trip ${a.N - a.repeat}</span></div></div></div>`,
        table: () => table([{ t: 'Measure' }, { t: 'Group' }, { t: 'Bookings', n: 1 }, { t: 'Share', n: 1 }], rows),
        rows: rows.length,
        tile: { v: (a.trav / a.N).toFixed(1), sub: `travellers per booking · ${a.repeat} repeat`, mini: miniCols(a.party.map((p) => p.n)) },
        head: `Couples lead, and ${pc(far, a.N)} book a month or more ahead.`,
        story: [`${two} of ${a.N} bookings were for two; the average party was ${(a.trav / a.N).toFixed(1)} travellers.`, `${pc(far, a.N)} booked more than 30 days out, and ${a.repeat} came back for another trip.`],
        next: '',
      });
    }
    out.forEach((s, i) => { s.n = String(i + 1).padStart(2, '0'); });
    return out;
  }

  /* ================= shared chrome ================= */
  const csvNote = (key, rows, a) => `<div class="a-note rcsv" role="status">${ICON.check}<span><b>tripsmith-${key}_${a.P.from}_${a.P.to}.csv</b> is ready: ${rows} rows, same totals as the desk CSV for this range. Downloads are off in this preview.</span></div>`;
  const cardActs = (s) => {
    const v = S.view[s.id] || 'chart';
    return `<div class="acts"><div class="a-seg" role="group" aria-label="${s.title} view"><button data-view="chart" data-sec="${s.id}" aria-pressed="${v === 'chart'}">Chart</button><button data-view="table" data-sec="${s.id}" aria-pressed="${v === 'table'}">Table</button></div><button class="a-btn ghost sm" data-csv="${s.id}">${ICON.down}CSV</button></div>`;
  };
  const body = (s, a, o) => `${S.csv === s.id ? csvNote(s.id, s.rows, a) : ''}${(S.view[s.id] || 'chart') === 'table' ? s.table() : s.chart(o)}`;
  const facts = (s) => `<dl class="rfacts">${s.facts.map(([k, v]) => `<div><dt>${k}</dt><dd class="num">${v}</dd></div>`).join('')}</dl>`;

  const head = (a, v) => `<div class="a-head"><h1>Reports</h1><span class="sub">${v === 'C' ? a.P.title + ' · ' : ''}${a.P.range} · IST · from confirmed bookings, refunds and departures</span>
      <div class="acts"><button class="a-btn ghost sm" data-dark aria-pressed="${S.dark}">${ICON.eye}Dark preview</button><button class="a-btn ghost sm" data-csv="all">${ICON.down}Export all (CSV)</button></div></div>
    <div class="a-bar rbar"><div class="a-seg" role="group" aria-label="Date range">${PRESETS.map((p) => `<button data-preset="${p.id}" aria-pressed="${p.id === S.preset}">${p.label}</button>`).join('')}</div>
      ${S.preset === 'custom' ? `<label class="rdate">From <input class="a-select num" type="date" value="${a.P.from}" aria-label="From date"></label><label class="rdate">To <input class="a-select num" type="date" value="${a.P.to}" aria-label="To date"></label>` : ''}
      <span class="a-chip mute" title="Oct 2025 – Sep 2026 comes from the seed, not real customers">${ICON.info}Includes seed history</span></div>
    ${S.csv === 'all' ? csvNote('all-sections', 9 * 12, a) : ''}`;
  const kpis = (a) => {
    const d = (x, y) => (a.prev ? `<span class="d ${x >= y ? 'up' : 'down'}">${delta(x, y, a.P.prev.length === 1 ? MON[a.P.prev[0]] : 'Jan – Mar')}</span>` : '<span class="d">first season on record</span>');
    return `<div class="a-kpis">
      <div class="a-kpi"><span class="k">Booked</span><span class="v num">${lakh(a.booked)}</span>${d(a.booked, a.prev && a.prev.booked)}</div>
      <div class="a-kpi"><span class="k">Collected</span><span class="v num">${lakh(a.collected)}</span><span class="d">${pc(a.collected, a.booked)} of booked</span></div>
      <div class="a-kpi"><span class="k">Net after refunds</span><span class="v num">${lakh(a.net)}</span><span class="d">${inr(a.refunded)} refunded</span></div>
      <div class="a-kpi"><span class="k">Bookings</span><span class="v num">${a.N}</span>${d(a.N, a.prev && a.prev.N)}</div>
      <div class="a-kpi"><span class="k">Seats filled</span><span class="v num">${pc(a.seats, a.cap)}</span><span class="d">${a.deps.length} departures ran</span></div>
      <div class="a-kpi"><span class="k">Balances due</span><span class="v num">${lakh(a.balance)}</span><span class="d">on live bookings</span></div></div>`;
  };
  const wrap = (v, inner) => {
    const anim = S.anim || S.lastV !== v;
    S.anim = false; S.lastV = v;
    return TS.adminShell('Reports', `<div class="rpt rpt-${v}${S.dark ? ' dark' : ''}${anim ? ' anim' : ''}">${inner}</div>`);
  };

  /* ================= variants ================= */
  const renderA = () => {
    const a = agg(S.preset), secs = sections(a);
    return wrap('A', `${head(a, 'A')}<div class="ra"><nav class="ra-ix" aria-label="Report sections"><span class="eyebrow">In this report</span>${secs.map((s) => `<a href="#rs-${s.id}" data-jump="${s.id}"><span class="n num">${s.n}</span><span class="t">${s.title}<small class="num">${s.idx}</small></span></a>`).join('')}</nav>
      <div class="ra-b">${kpis(a)}${secs.map((s) => `<section class="a-card rs" id="rs-${s.id}"><div class="a-card-h"><span class="rs-n num">${s.n}</span><h2>${s.title}</h2>${cardActs(s)}</div><div class="a-card-b">${facts(s)}${body(s, a, { money: 'area' })}</div></section>`).join('')}</div></div>`);
  };

  const renderB = () => {
    const a = agg(S.preset), secs = sections(a), s = secs.find((x) => x.id === S.drill) || secs[0];
    return wrap('B', `${head(a, 'B')}${kpis(a)}<div class="a-split rb-split"><div class="rb-grid" role="group" aria-label="Report sections">${secs.map((x) => `<button class="rb-tile" data-drill="${x.id}" aria-pressed="${x.id === s.id}"><span class="eyebrow">${x.n} · ${x.title}</span><b class="v num">${x.tile.v}</b><small>${x.tile.sub}</small><span class="mini-w">${x.tile.mini}</span></button>`).join('')}</div>
      <aside class="a-panel rb-panel" aria-label="${s.title} detail"><section><div class="a-card-h rb-ph"><span class="eyebrow">Drill-in</span><h2>${s.title}</h2>${cardActs(s)}</div>${facts(s)}</section><section>${body(s, a, { money: 'bar', h: 250 })}</section>
        <section><span class="eyebrow">What it says</span><ul class="rb-say">${s.story.map((t) => `<li>${t}</li>`).join('')}</ul></section></aside></div>`);
  };

  const renderC = () => {
    const a = agg(S.preset), secs = sections(a), m = secs[0];
    return wrap('C', `${head(a, 'C')}<div class="rv-lead"><span class="eyebrow">${a.P.title}</span><p class="rv-h">${m.head} ${secs[2].head}</p>
        <dl class="rfacts big">${[['Booked', lakh(a.booked)], ['Collected', lakh(a.collected)], ['Bookings', a.N], ['Seats filled', pc(a.seats, a.cap)], ['Cancelled', pc(a.cxN, a.N, 1)]].map(([k, v]) => `<div><dt>${k}</dt><dd class="num">${v}</dd></div>`).join('')}</dl></div>
      ${secs.map((s) => `<section class="rv" id="rs-${s.id}"><div class="rv-t"><span class="rv-n num">${s.n} · ${s.title}</span><h2>${s.head}</h2>${s.story.map((t) => `<p>${t}</p>`).join('')}${s.next ? `<p class="rv-do"><b>Next</b>${s.next}</p>` : ''}</div>
        <div class="a-card rv-c"><div class="a-card-h"><h2>${s.title}</h2>${cardActs(s)}</div><div class="a-card-b">${body(s, a, { money: 'area', h: 240 })}</div></div></section>`).join('')}`);
  };

  /* ================= behaviour ================= */
  const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };
  function wireCharts(root) {
    root.querySelectorAll('.rc').forEach((rc) => {
      const id = rc.dataset.chart, spec = SPEC[id], holder = rc.querySelector('.rsw'), tipEl = rc.querySelector('.rtip');
      if (!spec || !holder) return;
      const redraw = () => { const w = Math.round(holder.clientWidth); if (w > 60 && w !== rc._w) { rc._w = w; holder.innerHTML = draw(spec, w); } };
      if (window.ResizeObserver) new ResizeObserver(redraw).observe(holder); else redraw();
      const hide = () => {
        tipEl.hidden = true;
        rc.querySelectorAll('.hit.on').forEach((h) => h.classList.remove('on'));
        rc.querySelectorAll('.xh, .hd').forEach((n) => n.setAttribute('visibility', 'hidden'));
      };
      rc.addEventListener('pointermove', (e) => {
        const h = e.target.closest && e.target.closest('.hit');
        if (!h) { hide(); return; }
        const html = (TIPS[id] || [])[+h.dataset.i];
        if (!html) { hide(); return; }
        rc.querySelectorAll('.hit.on').forEach((x) => x !== h && x.classList.remove('on'));
        h.classList.add('on');
        const x = h.dataset.x;
        const xh = rc.querySelector('.xh');
        if (xh) { xh.setAttribute('x1', x); xh.setAttribute('x2', x); xh.setAttribute('visibility', 'visible'); }
        const ys = (h.dataset.ys || '').split(',');
        rc.querySelectorAll('.hd').forEach((d) => { d.setAttribute('cx', x); d.setAttribute('cy', ys[+d.dataset.j] || 0); d.setAttribute('visibility', 'visible'); });
        tipEl.innerHTML = html; tipEl.hidden = false;
        const rb = rc.getBoundingClientRect(), hb = h.getBoundingClientRect(), tw = tipEl.offsetWidth;
        let left = hb.left + hb.width / 2 - rb.left;
        left = Math.max(tw / 2 + 4, Math.min(rb.width - tw / 2 - 4, left));
        tipEl.style.left = left + 'px';
      });
      rc.addEventListener('pointerleave', hide);
    });
  }
  const mount = (v) => (site, rerender) => {
    const root = site.querySelector('.rpt');
    if (!root) return;
    root.addEventListener('click', (e) => {
      const t = e.target.closest('button, a');
      if (!t || !root.contains(t)) return;
      if (t.dataset.preset) { S.preset = t.dataset.preset; S.csv = null; S.anim = true; rerender(); }
      else if (t.hasAttribute('data-dark')) { S.dark = !S.dark; root.classList.toggle('dark', S.dark); t.setAttribute('aria-pressed', String(S.dark)); }
      else if (t.dataset.view) { S.view[t.dataset.sec] = t.dataset.view; S.csv = null; if (t.dataset.view === 'chart') S.anim = true; rerender(); }
      else if (t.dataset.csv) { S.csv = S.csv === t.dataset.csv ? null : t.dataset.csv; rerender(); }
      else if (t.dataset.drill) { S.drill = t.dataset.drill; S.csv = null; S.anim = true; rerender(); }
      else if (t.dataset.jump) {
        e.preventDefault();
        const sec = root.querySelector('#rs-' + t.dataset.jump);
        if (sec) sec.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
      }
    });
    wireCharts(root);
    if (root.classList.contains('anim')) setTimeout(() => root.classList.remove('anim'), 2200);
    if (v === 'A' && window.IntersectionObserver) {
      const links = root.querySelectorAll('.ra-ix a');
      const io = new IntersectionObserver((ents) => ents.forEach((en) => {
        if (!en.isIntersecting) return;
        links.forEach((l) => l.classList.toggle('on', l.dataset.jump === en.target.id.slice(3)));
      }), { rootMargin: '-20% 0px -65% 0px' });
      root.querySelectorAll('.rs').forEach((s) => io.observe(s));
      if (links[0]) links[0].classList.add('on');
    }
  };

  /* ================= D · Money river · E · Question explorer ================= */
  const RIV = {}; // custom SVG charts: id -> { fn(width) -> svg, tips }
  const custBox = (id, fn, tips, W) => { RIV[id] = { fn, tips }; return `<div class="rc rx" data-cust="${id}"><div class="rxw">${fn(W)}</div><div class="rtip" hidden></div></div>`; };
  const FILL = { c1: '#1B4FD8', c2: '#C98314', cw: '#B0501C', cn: '#C9D1D9' };
  const f1 = (n) => n.toFixed(1);
  const kOf = (cls) => (cls === 'cn' ? 'kn' : 'k' + cls.slice(1));

  /* the river: one px-per-rupee scale for every band, so band widths are exact shares of booked */
  function riverParts(a) {
    const N = [], L = [], kept = a.cxPaid - a.refunded;
    const node = (id, c, label, v, cls) => { if (v > 0) N.push({ id, c, label, v, cls }); };
    const link = (s, t, v) => { if (v > 0) L.push({ s, t, v }); };
    a.pk.filter((p) => p.rev > 0).forEach((p) => { node('p' + p.k, 0, SHORT[p.k], p.rev, 'c1'); link('p' + p.k, 'bk', p.rev); });
    node('bk', 1, 'Booked', a.booked, 'c1');
    node('live', 2, 'Live', a.live, 'c1'); node('cx', 2, 'Cancelled', a.cxv, 'cw');
    node('due', 3, 'Balances due', a.balance, 'c2'); node('col', 3, 'Collected', a.colLive, 'c1');
    node('cxp', 3, 'Paid, then cancelled', a.cxPaid, 'cw'); node('cxu', 3, 'Never charged', a.cxv - a.cxPaid, 'cn');
    node('net', 4, 'Net kept', a.net, 'c1'); node('ref', 4, 'Refunded', a.refunded, 'cw');
    link('bk', 'live', a.live); link('bk', 'cx', a.cxv); link('live', 'due', a.balance); link('live', 'col', a.colLive);
    link('cx', 'cxp', a.cxPaid); link('cx', 'cxu', a.cxv - a.cxPaid); link('col', 'net', a.colLive); link('cxp', 'net', kept); link('cxp', 'ref', a.refunded);
    [['due', a.balance], ['col', a.colLive], ['cxp', a.cxPaid], ['cxu', a.cxv - a.cxPaid]].forEach(([t, v]) => { if (v > 0) L.push({ s: 'bk', t, v, nar: 1 }); }); // phone: Booked straight to outcomes
    const why = { bk: `${a.N} bookings made in the range`, live: 'Still travelling', cx: `${a.cxN} bookings cancelled`, due: 'Balance reminders go out 14 and 3 days before departure', col: 'Paid on live bookings',
      cxp: `${inr(kept)} kept as fees, ${inr(a.refunded)} refunded`, cxu: 'Balance never charged before the cancel', net: 'Collected minus refunds', ref: 'Back to travellers' };
    const tips = N.map((n) => {
      const p = a.pk.find((q) => 'p' + q.k === n.id);
      if (p) return tip(PKGS[p.k].name, [['k1', 'Booked', inr(p.rev)], ['', 'Bookings', String(p.n)], ['', 'Share of booked', pc(p.rev, a.booked, 1)]]);
      return tip(n.label, [[kOf(n.cls), 'Amount', inr(n.v)], ['', 'Share of booked', pc(n.v, a.booked, 1)]], why[n.id]);
    }).concat(L.map((l) => {
      const s = N.find((n) => n.id === l.s), t = N.find((n) => n.id === l.t);
      return tip(`${s.label} to ${t.label}`, [[kOf(t.cls), 'Flow', inr(l.v)], ['', 'Share of booked', pc(l.v, a.booked, 1)]]);
    }));
    return { N, L, tips };
  }
  function riverSvg(a, W) {
    const { N, L } = riverParts(a), narrow = W < 840;
    const COLN = [-1, 0, -1, 1, 2]; // phone keeps Booked, outcomes, ends
    const nodes = N.filter((n) => !narrow || COLN[n.c] >= 0).map((n) => ({ ...n, c: narrow ? COLN[n.c] : n.c, label: narrow && n.id === 'cxp' ? 'Paid, cancelled' : n.label }));
    const keep = new Set(nodes.map((n) => n.id));
    const links = L.filter((l) => (narrow ? keep.has(l.s) && keep.has(l.t) : !l.nar));
    const H = narrow ? 360 : 420, T = 34, B = 12, nw = narrow ? 10 : 14, g = narrow ? 8 : 10;
    const cols = narrow ? 3 : 5, padL = narrow ? 2 : 150, padR = narrow ? 84 : 124;
    const byC = [...Array(cols)].map((_, c) => nodes.filter((n) => n.c === c));
    const maxG = Math.max(0, ...byC.map((x) => x.length - 1));
    const k = (H - T - B - maxG * g) / Math.max(1, a.booked);
    const colX = (c) => padL + (c * (W - padL - padR - nw)) / (cols - 1);
    const M = {};
    byC.forEach((col, c) => {
      const tot = col.reduce((s, n) => s + n.v * k, 0) + Math.max(0, col.length - 1) * g;
      let y = T + (H - T - B - tot) / 2;
      col.forEach((n) => { Object.assign(n, { x: colX(c), y, h: n.v * k, so: 0, to: 0 }); y += n.h + g; M[n.id] = n; });
    });
    let o = '';
    const HEADS = narrow ? ['Booked', 'Paid so far', 'Ends as'] : ['From packages', 'Booked', 'Live or cancelled', 'Paid so far', 'Where it ends'];
    HEADS.forEach((h, c) => {
      const first = c === 0, last = c === cols - 1;
      const x = first ? (narrow ? colX(0) : colX(0) + nw) : last ? colX(c) : colX(c) + nw / 2;
      const an = first ? (narrow ? 'start' : 'end') : last ? 'start' : 'middle';
      o += `<text class="rv-h" x="${f1(x)}" y="14" text-anchor="${an}" fill="#5E6B76">${h.toUpperCase()}</text>`;
    });
    links.forEach((l) => {
      const s = M[l.s], t = M[l.t], h = l.v * k, x1 = s.x + nw, x2 = t.x, y1 = s.y + s.so, y2 = t.y + t.to, xm = (x1 + x2) / 2;
      s.so += h; t.to += h;
      o += `<path class="rv-l ${t.cls}" data-t="${N.length + L.indexOf(l)}" style="--c:${s.c}" d="M${f1(x1)},${f1(y1)} C${f1(xm)},${f1(y1)} ${f1(xm)},${f1(y2)} ${f1(x2)},${f1(y2)} L${f1(x2)},${f1(y2 + h)} C${f1(xm)},${f1(y2 + h)} ${f1(xm)},${f1(y1 + h)} ${f1(x1)},${f1(y1 + h)} Z" fill="${FILL[t.cls]}" fill-opacity=".26"/>`;
    });
    nodes.forEach((n) => { o += `<rect class="rv-n ${n.cls}" data-t="${N.findIndex((q) => q.id === n.id)}" style="--c:${n.c}" x="${f1(n.x)}" y="${f1(n.y)}" width="${nw}" height="${f1(Math.max(1.5, n.h))}" rx="2" fill="${FILL[n.cls]}"/>`; });
    byC.forEach((col, c) => {
      const left = !narrow && c === 0;
      const ys = col.map((n) => n.y + n.h / 2);
      for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + 28);
      const over = ys.length ? ys[ys.length - 1] + 16 - H : 0;
      if (over > 0) for (let i = 0; i < ys.length; i++) ys[i] -= over;
      col.forEach((n, i) => {
        const x = left ? n.x - 6 : n.x + nw + 6, an = left ? 'end' : 'start', y = Math.max(T + 10, ys[i]);
        const val = narrow || (!narrow && c === 0) ? lakh(n.v) : `${lakh(n.v)} · ${pc(n.v, a.booked)}`;
        o += `<text class="rv-t${narrow ? ' sm' : ''}" x="${f1(x)}" y="${f1(y - 2)}" text-anchor="${an}" fill="#14202A">${esc(n.label)}</text><text class="rv-v" x="${f1(x)}" y="${f1(y + 12)}" text-anchor="${an}" fill="#5E6B76">${val}</text>`;
      });
    });
    return `<svg class="rvsvg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Money flow: ${esc(lakh(a.booked))} booked, split into collected, balances due, cancelled and refunded, ending at ${esc(lakh(a.net))} net">${o}</svg>`;
  }

  /* packages: revenue against fill (E) */
  const pkPoints = (a) => a.pk.filter((p) => p.cap).map((p) => ({ ...p, fill: Math.round((p.seats / p.cap) * 100) }));
  function pkScatter(a, W) {
    const pts = pkPoints(a), narrow = W < 520, H = narrow ? 290 : 330, L = narrow ? 46 : 58, R = narrow ? 8 : 20, T = 26, B = 44;
    const pw = W - L - R, ph = H - T - B, avg = Math.round((a.seats / Math.max(1, a.cap)) * 100);
    const minF = Math.min(...pts.map((p) => p.fill)), lo = Math.min(50, Math.max(0, Math.floor((minF - 6) / 10) * 10)), st = narrow ? 20 : 10;
    const maxR = Math.max(1, ...pts.map((p) => p.rev)), top = maxR * 1.18;
    const X = (f) => L + ((f - lo) / (100 - lo)) * pw, Y = (v) => T + ph - (v / top) * ph;
    let o = '';
    ticks(maxR, 4).forEach((v) => { const yy = f1(Y(v)); o += `<line class="${v === 0 ? 'bl' : 'gl'}" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="#E9EDF1"/><text class="tx" x="${L - 8}" y="${yy}" dy="4" text-anchor="end" fill="#5E6B76">${yMoney(v)}</text>`; });
    for (let f = lo; f <= 100; f += st) o += `<line class="gl" x1="${f1(X(f))}" x2="${f1(X(f))}" y1="${T}" y2="${T + ph}" stroke="#E9EDF1"/><text class="tx" x="${f1(X(f))}" y="${T + ph + 17}" text-anchor="middle" fill="#5E6B76">${f}%</text>`;
    o += `<text class="tx" x="${f1(L + pw / 2)}" y="${H - 4}" text-anchor="middle" fill="#5E6B76">Seats filled on departures that ran</text>`;
    const ax = X(avg);
    o += `<line class="ref" x1="${f1(ax)}" x2="${f1(ax)}" y1="${T - 6}" y2="${T + ph}" stroke="#5E6B76"/><text class="tx" x="${f1(ax)}" y="${T - 10}" text-anchor="${ax > W - R - 70 ? 'end' : 'middle'}" fill="#5E6B76">Average ${avg}%</text>`;
    const placed = [];
    pts.slice().sort((p, q) => Y(p.rev) - Y(q.rev)).forEach((p) => {
      const i = pts.indexOf(p), cx = X(p.fill), cy = Y(p.rev), r = 5 + Math.sqrt(p.n) * (narrow ? 1.2 : 1.6), cls = p.fill < 70 ? 'cw' : 'c1';
      o += `<circle class="sc-d ${cls}" data-t="${i}" style="--i:${i}" cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" fill="${FILL[cls]}" fill-opacity=".82" stroke="#fff" stroke-width="1.5"/>`;
      const right = cx + r + (narrow ? 70 : 120) < W - R, lx = right ? cx + r + 5 : cx - r - 5;
      let ly = cy + 4;
      placed.filter((q) => Math.abs(q.x - lx) < 120).forEach((q) => { if (Math.abs(q.y - ly) < 14) ly = q.y + 14; });
      placed.push({ x: lx, y: ly });
      o += `<text class="sc-l" x="${f1(lx)}" y="${f1(Math.min(T + ph - 4, ly))}" text-anchor="${right ? 'start' : 'end'}" fill="#14202A">${esc(narrow ? PLACE[p.k] : SHORT[p.k])}</text>`;
    });
    return `<svg class="rvsvg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Revenue against seats filled, one dot per package">${o}</svg>`;
  }

  const QS = { money: 'Is the money actually coming in?', packages: 'Which packages earn, and which fill?', occupancy: 'Which departures need seats?', funnel: 'Where do browsers drop off?',
    cancellations: 'Why do people cancel?', discounts: 'Do discounts pay for themselves?', addons: 'What do travellers add on?', channels: 'Is the counter worth running?', customers: 'Who travels with us?' };
  const XSUB = ['2025', '', '', '2026', '', '', '', '', '', '', '', ''];
  const reconLine = (a) => `<p class="recon num">Booked ${inr(a.booked)} = live ${inr(a.live)} + cancelled ${inr(a.cxv)} · live = collected ${inr(a.colLive)} + balances due ${inr(a.balance)} · net ${inr(a.net)} = collected ${inr(a.collected)} − refunded ${inr(a.refunded)}</p>`;

  function answerChart(s, a) {
    if (s.id === 'money') {
      let cb = 0, cc = 0;
      const cumB = BOOKED.map((v) => (cb += v)), cumC = MM.map((m) => (cc += m.collected));
      const spec = { id: 'moneyE', type: 'area', h: 300, labels: MON, xsub: XSUB, hi: a.ms, fmt: yMoney, pr: 16,
        series: [{ cls: 'c1', vals: cumB }, { cls: 'c2', vals: cumC }], aria: 'Running total of booked and collected, October 2025 to September 2026' };
      const tips = MON.map((_, i) => tip(`By end of ${ML(i)}`, [['k1', 'Booked so far', lakh(cumB[i])], ['k2', 'Collected so far', lakh(cumC[i])]], `Gap ${inr(cumB[i] - cumC[i])}: balances due and cancelled value`));
      return legend([['k1', 'Booked, running total'], ['k2', 'Collected, running total']], 'The gap between the lines is money not yet in') + chartBox(spec, tips) + reconLine(a);
    }
    if (s.id === 'packages') {
      const pts = pkPoints(a);
      if (!pts.length) return s.chart();
      const none = a.pk.filter((p) => !p.cap).map((p) => SHORT[p.k]);
      const tips = pts.map((p) => tip(PKGS[p.k].name, [['k1', 'Booked', inr(p.rev)], ['', 'Bookings', String(p.n)], [p.fill < 70 ? 'kw' : 'k1', 'Seats filled', `${p.seats}/${p.cap} · ${p.fill}%`]], `${p.deps} departure${p.deps === 1 ? '' : 's'} ran`));
      return legend([['k1', '70% full or more'], ['kw', 'Under 70% full']], 'Dot size = bookings · up = revenue · across = fill') + custBox('pkE', (w) => pkScatter(a, w), tips, 760)
        + (none.length ? `<p class="rfine">Booked, but no departure ran in the range: ${none.join(', ')}.</p>` : '');
    }
    if (s.id === 'discounts') {
      const given = a.disc.reduce((x, d) => x + d.given, 0);
      return legend([['k1', 'Booked per ₹1 given']], `${pc(given, a.booked, 1)} of booked went out as discounts`)
        + hbars(a.disc.map((d) => ({ label: d.name, sub: `${inr(d.given)} given · ${d.n} bookings`, v: d.by / d.given, txt: '₹' + (d.by / d.given).toFixed(1), tip: `${d.name}: ${inr(d.by)} booked for ${inr(d.given)} given` })));
    }
    return s.chart({ h: 290, money: 'area' });
  }

  const renderD = () => {
    const a = agg(S.preset), secs = sections(a), m = secs[0], tbl = (S.view.money || 'chart') === 'table';
    const { tips } = riverParts(a);
    const spec = { id: 'moneyD', type: 'bar', h: 170, labels: MON, xsub: XSUB, hi: a.ms, fmt: yMoney, nt: 3, series: [{ cls: 'c1', vals: BOOKED }], aria: 'Booked by month, October 2025 to September 2026' };
    const mtips = MON.map((_, i) => tip(ML(i), [['k1', 'Booked', lakh(BOOKED[i])], ['k2', 'Collected', lakh(MM[i].collected)], ['kw', 'Refunded', inr(MM[i].refunded)]], `${BK[i]} bookings${a.ms.includes(i) ? '' : ' · outside range'}`));
    const river = legend([['k1', 'Kept'], ['k2', 'Still to collect'], ['kw', 'Cancelled or refunded'], ['kn', 'Never charged']], 'Hover a band for the rupees')
      + custBox('river', (w) => riverSvg(a, w), tips, 960) + reconLine(a)
      + `<div class="rd-month"><h3>Booked by month <small>${a.ms.length < 12 ? 'range lit, other months for context' : 'by the month the booking was made'}</small></h3>${chartBox(spec, mtips)}</div>`;
    const hero = `<section class="a-card rd-hero" id="rs-money"><div class="a-card-h"><span class="rs-n num">01</span><h2>Where the money went</h2>${cardActs(m)}</div>
      <div class="a-card-b"><p class="rd-lede">${m.head} Every band is drawn to one scale: follow ${lakh(a.booked)} from the packages that earned it to the ${lakh(a.net)} that stays.</p>${facts(m)}
      ${S.csv === 'money' ? csvNote('money', m.rows, a) : ''}${tbl ? m.table() : river}</div></section>`;
    const down = secs.slice(1).map((s) => `<section class="a-card rd-c${s.id === 'occupancy' ? ' wide' : ''}" id="rs-${s.id}"><div class="a-card-h"><span class="rs-n num">${s.n}</span><h2>${s.title}</h2>${cardActs(s)}</div>
      <div class="a-card-b"><p class="rd-say">${s.head}</p>${body(s, a, { h: 220 })}</div></section>`).join('');
    return wrap('D', `${head(a, 'D')}${hero}<div class="rd-dh"><span class="eyebrow">Downstream</span><span>What moved the river: eight sections, each with Chart/Table and CSV</span></div><div class="rd-down">${down}</div>`);
  };

  const renderE = () => {
    const a = agg(S.preset), secs = sections(a);
    const s = secs.find((x) => x.id === S.q) || secs[0], i = secs.indexOf(s), prev = secs[(i + secs.length - 1) % secs.length], next = secs[(i + 1) % secs.length];
    const bodyE = `${S.csv === s.id ? csvNote(s.id, s.rows, a) : ''}${(S.view[s.id] || 'chart') === 'table' ? s.table() : answerChart(s, a)}`;
    return wrap('E', `${head(a, 'E')}<div class="re"><nav class="re-q" aria-label="Questions"><span class="eyebrow">Ask the report</span>${secs.map((x) => `<button data-q="${x.id}" aria-pressed="${x === s}"><span class="n num">${x.n}</span><span class="t">${QS[x.id]}<small class="num">${x.title} · ${x.idx}</small></span></button>`).join('')}</nav>
      <article class="a-card re-a" aria-live="polite"><div class="re-top"><span class="eyebrow">Question ${s.n} of ${String(secs.length).padStart(2, '0')} · ${s.title}</span><h2 class="re-qt">${QS[s.id]}</h2><p class="re-ans">${s.head}</p></div>
        <div class="a-card-h re-bar"><span class="eyebrow">The answer, charted</span>${cardActs(s)}</div>
        <div class="a-card-b">${facts(s)}${bodyE}</div>
        <div class="re-why"><div><span class="eyebrow">Why we say so</span><ul>${s.story.map((t) => `<li>${t}</li>`).join('')}</ul></div>${s.next ? `<p class="rv-do"><b>Next</b>${s.next}</p>` : ''}</div>
        <div class="re-nav"><button class="a-btn ghost sm" data-q="${prev.id}">${ICON.chevL}<span>${QS[prev.id]}</span></button><button class="a-btn sm" data-q="${next.id}"><span>${QS[next.id]}</span>${ICON.chevR}</button></div></article></div>`);
  };

  function wireCust(root) {
    root.querySelectorAll('.rx').forEach((rc) => {
      const R = RIV[rc.dataset.cust], holder = rc.querySelector('.rxw'), tipEl = rc.querySelector('.rtip');
      if (!R || !holder) return;
      const redraw = () => { const w = Math.round(holder.clientWidth); if (w > 60 && w !== rc._w) { rc._w = w; holder.innerHTML = R.fn(w); } };
      if (window.ResizeObserver) new ResizeObserver(redraw).observe(holder); else redraw();
      const hide = () => { tipEl.hidden = true; rc.classList.remove('hov'); rc.querySelectorAll('.on').forEach((n) => n.classList.remove('on')); };
      rc.addEventListener('pointermove', (e) => {
        const h = e.target.closest && e.target.closest('[data-t]');
        const html = h && R.tips[+h.dataset.t];
        if (!html) { hide(); return; }
        rc.querySelectorAll('.on').forEach((n) => n !== h && n.classList.remove('on'));
        h.classList.add('on'); rc.classList.add('hov');
        tipEl.innerHTML = html; tipEl.hidden = false;
        const rb = rc.getBoundingClientRect(), tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
        const left = Math.max(tw / 2 + 4, Math.min(rb.width - tw / 2 - 4, e.clientX - rb.left));
        let top = e.clientY - rb.top + 18;
        if (top + th > rb.height) top = e.clientY - rb.top - th - 14;
        tipEl.style.left = left + 'px'; tipEl.style.top = Math.max(0, top) + 'px';
      });
      rc.addEventListener('pointerleave', hide);
    });
  }
  const mountX = (v) => (site, rerender) => {
    mount(v)(site, rerender);
    const root = site.querySelector('.rpt');
    if (!root) return;
    wireCust(root);
    if (v === 'E') root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-q]');
      if (!t || !root.contains(t)) return;
      S.q = t.dataset.q; S.csv = null; S.anim = true; rerender();
      const q = site.querySelector('.re-q [aria-pressed="true"]');
      if (q && q.scrollIntoView) q.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    });
  };

  /* ================= styles ================= */
  const css = `
  .rpt { --c1: #1B4FD8; --c2: #C98314; --rg: #EBEEF2; --rbase: #C9D1D9; --rband: #EEF3FF; --rhov: rgba(20,32,42,.05); --rtrack: #EDF0F3;
    display: grid; gap: 18px; min-width: 0; color: var(--ink); border-radius: var(--a-r); transition: background .3s, padding .3s; }
  .rpt.dark { --a-surf: #141D26; --a-line: #26323D; --bg2: #18222C; --ink: #E6EBF0; --ink2: #C3CCD5; --mute: #98A6B3; --a-th: #98A6B3;
    --pri: #5B84F5; --pri-ink: #B9CBFF; --pri-soft: #1B2A4A; --ok: #5CC08A; --ok-soft: #16301F; --warn: #F0A064; --warn-soft: #3A2616;
    --c1: #5B84F5; --c2: #C0801A; --rg: #202C36; --rbase: #3A4854; --rband: #182439; --rhov: rgba(255,255,255,.05); --rtrack: #22303B;
    background: #0D141B; padding: 18px; }
  .rpt.dark .a-seg button[aria-pressed="true"] { color: #0D141B; }
  .rpt.dark .a-chip { background: #22303B; color: var(--ink2); } .rpt.dark .a-chip.warn { background: var(--warn-soft); color: var(--warn); } .rpt.dark .a-chip.ok { background: var(--ok-soft); color: var(--ok); }
  .rpt.dark .a-kpi .d.down { color: #F29B92; } .rpt.dark .a-meter { background: var(--rtrack); }
  .rpt.dark .a-table th { background: transparent; } .rpt.dark .a-table tfoot td { border-top-color: var(--ink2); }
  .rpt.dark .rsvg .ar { fill-opacity: .22; }
  .rpt .eyebrow { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--mute); font-weight: 800; }
  .rpt .a-head .acts .a-btn[aria-pressed="true"] { border-color: var(--pri); color: var(--pri); }
  .rpt .rbar .a-seg { max-width: 100%; overflow-x: auto; }
  .rpt .rbar .a-seg button { white-space: nowrap; }
  .rpt .rdate { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; color: var(--mute); }
  .rpt .rdate input { color-scheme: light; } .rpt.dark .rdate input { color-scheme: dark; }
  .rpt .rbar .a-chip .ic { width: 12px; height: 12px; }
  .rpt .rcsv { align-items: flex-start; } .rpt .rcsv b { word-break: break-all; }
  .rpt .a-table tfoot td { font-weight: 800; border-top: 1.5px solid var(--ink); border-bottom: 0; }
  .rpt .rfine { font-size: 12.5px; color: var(--mute); margin-top: 10px; }

  /* chart pieces */
  .rpt .rc { position: relative; min-width: 0; }
  .rpt .rsw { min-width: 0; }
  .rpt .rsvg { display: block; width: 100%; height: auto; font: 600 11.5px "DM Sans", sans-serif; font-variant-numeric: tabular-nums; overflow: visible; }
  .rsvg :not(.hit) { pointer-events: none; }
  .rsvg .gl { stroke: var(--rg); } .rsvg .bl { stroke: var(--rbase); }
  .rsvg .tx { fill: var(--mute); } .rsvg .tx.on { fill: var(--ink); font-weight: 800; } .rsvg .tx.sub { font-size: 10.5px; font-weight: 500; }
  .rsvg .ep-l { fill: var(--ink); font-weight: 800; font-size: 12.5px; }
  .rsvg .c1 { fill: var(--c1); } .rsvg .c2 { fill: var(--c2); } .rsvg .cw { fill: var(--warn); }
  .rsvg path.ln { fill: none; } .rsvg .ln.c1 { stroke: var(--c1); } .rsvg .ln.c2 { stroke: var(--c2); }
  .rsvg .dim { opacity: .3; }
  .rsvg .rb { fill: var(--rband); }
  .rsvg .hit { fill: transparent; } .rsvg .hit.on { fill: var(--rhov); }
  .rsvg .ept, .rsvg .hd { stroke: var(--a-surf); }
  .rsvg .xh { stroke: var(--mute); stroke-dasharray: 3 3; }
  .rsvg .ref { stroke: var(--mute); stroke-dasharray: 4 4; opacity: .7; }
  .rpt .rsvg.mini { height: 40px; }
  .rpt .rtip { position: absolute; top: 4px; transform: translateX(-50%); z-index: 4; pointer-events: none; display: grid; gap: 3px; min-width: 168px;
    background: var(--a-surf); color: var(--ink); border: 1px solid var(--a-line); border-radius: 10px; padding: 9px 11px; font-size: 12.5px; box-shadow: 0 10px 30px -12px rgba(0,0,0,.35); }
  .rpt .rtip span { display: flex; align-items: center; gap: 7px; color: var(--mute); }
  .rpt .rtip span b { margin-left: auto; color: var(--ink); padding-left: 12px; }
  .rpt .rtip small { color: var(--mute); font-size: 11.5px; }
  .rpt .sw { width: 9px; height: 9px; border-radius: 3px; flex: none; display: inline-block; }
  .rpt .k1 { background: var(--c1); } .rpt .k2 { background: var(--c2); } .rpt .kw { background: var(--warn); }
  .rpt .rleg { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; font-size: 12.5px; font-weight: 700; margin-bottom: 8px; }
  .rpt .rleg span { display: inline-flex; align-items: center; gap: 6px; }
  .rpt .rleg small { color: var(--mute); font-weight: 600; margin-left: auto; }
  .rpt .recon { font-size: 12px; color: var(--mute); border-top: 1px dashed var(--a-line); padding-top: 9px; margin-top: 6px; }
  .rpt .rfacts { display: flex; flex-wrap: wrap; gap: 8px 26px; margin: 0 0 14px; }
  .rpt .rfacts dt { font-size: 11.5px; font-weight: 700; color: var(--mute); }
  .rpt .rfacts dd { margin: 0; font-size: 16px; font-weight: 800; letter-spacing: -.02em; }

  .rpt .hb { display: grid; gap: 9px; }
  .rpt .hb-r { display: grid; grid-template-columns: minmax(96px, 190px) minmax(40px, 1fr) 82px; gap: 12px; align-items: center; font-size: 13.5px; }
  .rpt .hb.x .hb-r { grid-template-columns: minmax(96px, 190px) minmax(40px, 1fr) 82px 128px; }
  .rpt .hb-l { font-weight: 700; min-width: 0; line-height: 1.25; } .rpt .hb-l small { display: block; color: var(--mute); font-weight: 500; font-size: 11.5px; }
  .rpt .hb-t { height: 12px; border-radius: 4px; background: var(--rtrack); overflow: hidden; display: block; }
  .rpt .hb-t i { display: block; height: 100%; width: var(--w); border-radius: 0 4px 4px 0; }
  .rpt .hb-v { text-align: right; font-weight: 800; }
  .rpt .hb-x { display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 700; color: var(--mute); justify-content: flex-end; }
  .rpt .hb-x .a-meter { flex: 1; height: 6px; } .rpt .hb-x .nofill { font-weight: 600; }
  .rpt .vc { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 10px; align-items: end; }
  .rpt .vc-c { display: grid; gap: 5px; justify-items: center; text-align: center; }
  .rpt .vc-c b { font-size: 13px; } .rpt .vc-c small { font-size: 11.5px; color: var(--mute); font-weight: 700; white-space: nowrap; }
  .rpt .vc-t { height: 96px; width: 100%; max-width: 44px; display: flex; align-items: flex-end; border-bottom: 1px solid var(--rbase); }
  .rpt .vc-t i { display: block; width: 100%; height: var(--h); border-radius: 4px 4px 0 0; }
  .rpt .stk { display: flex; gap: 2px; height: 22px; border-radius: 6px; overflow: hidden; margin: 4px 0 12px; }
  .rpt .stk.sm { height: 12px; margin: 8px 0; border-radius: 4px; }
  .rpt .stk i { display: block; min-width: 3px; }
  .rpt .stk-l { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px 16px; }
  .rpt .stk-l span { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 2px 7px; font-size: 13px; font-weight: 700; }
  .rpt .stk-l small { grid-column: 2 / -1; color: var(--mute); font-weight: 600; font-size: 12px; }
  .rpt .mbars { display: grid; gap: 4px; padding-top: 4px; } .rpt .mbars span { height: 6px; border-radius: 3px; background: var(--rtrack); overflow: hidden; display: block; }
  .rpt .mbars i { display: block; height: 100%; width: var(--w); border-radius: 3px; }
  .rpt .fac2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .rpt .fac3 { display: grid; grid-template-columns: 1.2fr 1.2fr 1fr; gap: 24px; }
  .rpt .fac2 h3, .rpt .fac3 h3, .rpt .upc h3 { font-size: 12.5px; font-weight: 800; margin-bottom: 10px; color: var(--ink2); letter-spacing: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .rpt .fac3 .big { font-size: 40px; font-weight: 800; letter-spacing: -.04em; line-height: 1; }
  .rpt .fn { display: flex; align-items: stretch; gap: 8px; }
  .rpt .fn-s { flex: 1; min-width: 0; display: grid; gap: 6px; padding: 12px; border: 1px solid var(--a-line); border-radius: 12px; background: var(--a-surf); }
  .rpt .fn-s small { font-size: 12px; font-weight: 700; color: var(--mute); } .rpt .fn-s b { font-size: 22px; font-weight: 800; letter-spacing: -.03em; }
  .rpt .fn-s em { font-style: normal; font-size: 12px; color: var(--mute); font-weight: 600; }
  .rpt .fn-a { display: grid; place-items: center; color: var(--mute); } .rpt .fn-a .ic { width: 16px; height: 16px; }
  .rpt .upc { margin-top: 16px; border-top: 1px solid var(--a-line); padding-top: 14px; }
  .rpt .upc-r { display: grid; grid-template-columns: 86px minmax(0, 1fr) minmax(60px, 140px) 44px 76px; gap: 12px; align-items: center; font-size: 13px; padding: 5px 0; }
  .rpt .upc-r.flag { font-weight: 700; } .rpt .upc-r.flag .a-meter::after { background: var(--warn); }

  /* A · Ledger */
  .rpt .ra { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 20px; align-items: start; }
  .rpt .ra-ix { position: sticky; top: 64px; display: grid; gap: 2px; }
  .adm[data-dir="A"] .rpt .ra-ix { top: 16px; }
  .rpt .ra-ix .eyebrow { padding: 0 10px 8px; }
  .rpt .ra-ix a { display: grid; grid-template-columns: 26px 1fr; gap: 4px; padding: 8px 10px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 13.5px; color: var(--ink2); border-left: 2px solid transparent; transition: background .2s, border-color .2s; }
  .rpt .ra-ix a .n { color: var(--mute); font-size: 12px; padding-top: 1px; }
  .rpt .ra-ix a small { display: block; color: var(--mute); font-weight: 600; font-size: 11.5px; }
  .rpt .ra-ix a:hover { background: var(--a-surf); }
  .rpt .ra-ix a.on { background: var(--a-surf); border-left-color: var(--pri); color: var(--ink); box-shadow: 0 0 0 1px var(--a-line); }
  .rpt .ra-b { display: grid; gap: 16px; min-width: 0; }
  .rpt .rs { scroll-margin-top: 70px; }
  .rpt .rs-n { font-size: 12px; font-weight: 800; color: var(--pri); }

  /* B · Cockpit */
  .adm .rpt .a-split.rb-split { grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); }
  .rpt .rb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
  .rpt .rb-tile { font: inherit; color: inherit; text-align: left; cursor: pointer; display: grid; gap: 3px; align-content: start; padding: 12px 13px; border-radius: var(--a-r);
    background: var(--a-surf); border: 1px solid var(--a-line); transition: border-color .2s, box-shadow .2s, transform .25s var(--ease); min-width: 0; }
  .rpt .rb-tile:hover { border-color: var(--mute); transform: translateY(-1px); }
  .rpt .rb-tile[aria-pressed="true"] { border-color: var(--pri); box-shadow: 0 0 0 2px var(--pri-soft); }
  .rpt .rb-tile .v { font-size: 20px; font-weight: 800; letter-spacing: -.03em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rpt .rb-tile small { color: var(--mute); font-size: 12px; font-weight: 600; line-height: 1.35; }
  .rpt .rb-tile .mini-w { display: block; margin-top: 6px; }
  .rpt .rb-panel { top: 64px; }
  .adm[data-dir="A"] .rpt .rb-panel { top: 12px; }
  .rpt .rb-ph { padding: 0 !important; border: 0 !important; }
  .rpt .rb-ph .eyebrow { flex-basis: 100%; }
  .rpt .rb-panel .rfacts { margin: 4px 0 0; }
  .rpt .rb-say { margin: 0; padding-left: 18px; display: grid; gap: 6px; font-size: 13.5px; color: var(--ink2); }

  /* C · Monthly review */
  .rpt .rv-lead { display: grid; gap: 12px; padding: 22px 24px; border-radius: var(--a-r); background: var(--a-surf); border: 1px solid var(--a-line); border-left: 4px solid var(--act); }
  .rpt .rv-h { font-size: 24px; font-weight: 800; letter-spacing: -.03em; line-height: 1.25; max-width: 44ch; text-wrap: balance; }
  .rpt .rfacts.big { margin: 4px 0 0; } .rpt .rfacts.big dd { font-size: 22px; }
  .rpt .rv { display: grid; grid-template-columns: minmax(240px, 330px) minmax(0, 1fr); gap: 24px; align-items: start; scroll-margin-top: 70px; padding-top: 18px; border-top: 1px solid var(--a-line); }
  .rpt .rv-t { display: grid; gap: 9px; position: sticky; top: 70px; }
  .rpt .rv-n { font-size: 12px; font-weight: 800; color: var(--pri); letter-spacing: .04em; }
  .rpt .rv-t h2 { font-size: 20px; line-height: 1.2; }
  .rpt .rv-t p { font-size: 14px; color: var(--ink2); line-height: 1.55; }
  .rpt .rv-do { display: grid; gap: 2px; background: var(--warn-soft); color: var(--ink) !important; border-radius: 10px; padding: 9px 12px; font-size: 13px !important; }
  .rpt .rv-do b { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--warn); }
  .adm[data-dir="C"] .rpt .rv-c .a-card-h h2 { display: none; }

  /* custom SVG charts (D river, E scatter) */
  .rpt .kn { background: var(--rbase); }
  .rpt .rx .rtip { top: 0; }
  .rpt .rvsvg { display: block; width: 100%; height: auto; font: 600 11.5px "DM Sans", sans-serif; font-variant-numeric: tabular-nums; overflow: visible; }
  .rvsvg text, .rvsvg line { pointer-events: none; }
  .rvsvg .gl { stroke: var(--rg); } .rvsvg .bl { stroke: var(--rbase); } .rvsvg .ref { stroke: var(--mute); stroke-dasharray: 4 4; opacity: .7; }
  .rvsvg .tx { fill: var(--mute); }
  .rvsvg .c1 { fill: var(--c1); } .rvsvg .c2 { fill: var(--c2); } .rvsvg .cw { fill: var(--warn); } .rvsvg .cn { fill: var(--rbase); }
  .rvsvg .rv-l { fill-opacity: .26; cursor: default; transition: fill-opacity .2s; }
  .rpt .rx.hov .rv-l { fill-opacity: .12; } .rpt .rx.hov .rv-l.on { fill-opacity: .55; }
  .rvsvg .rv-n.on, .rvsvg .sc-d.on { stroke: var(--ink); stroke-width: 2; }
  .rvsvg .rv-h { fill: var(--mute); font-size: 10.5px; font-weight: 800; letter-spacing: .1em; }
  .rvsvg .rv-t, .rvsvg .rv-v, .rvsvg .sc-l { paint-order: stroke; stroke: var(--a-surf); stroke-width: 4px; stroke-linejoin: round; }
  .rvsvg .rv-t { fill: var(--ink); font-size: 12.5px; font-weight: 800; }
  .rvsvg .rv-v { fill: var(--mute); font-size: 11.5px; } .rvsvg .rv-t.sm { font-size: 11.5px; }
  .rvsvg .sc-l { fill: var(--ink); font-size: 12px; font-weight: 700; }
  .rvsvg .sc-d { stroke: var(--a-surf); }

  /* D · Money river */
  .rpt .rd-hero .a-card-h h2 { font-size: 20px; }
  .rpt .rd-lede { font-size: 15px; color: var(--ink2); max-width: 70ch; margin-bottom: 12px; text-wrap: pretty; }
  .rpt .rd-month { margin-top: 16px; border-top: 1px solid var(--a-line); padding-top: 14px; }
  .rpt .rd-month h3 { font-size: 12.5px; font-weight: 800; color: var(--ink2); margin-bottom: 4px; display: flex; gap: 8px; flex-wrap: wrap; align-items: baseline; }
  .rpt .rd-month h3 small { color: var(--mute); font-weight: 600; }
  .rpt .rd-dh { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; font-size: 13px; color: var(--mute); font-weight: 600; margin-top: 6px; }
  .rpt .rd-down { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 440px), 1fr)); gap: 16px; align-items: start; }
  .rpt .rd-c.wide { grid-column: 1 / -1; }
  .rpt .rd-say { font-size: 15px; font-weight: 700; letter-spacing: -.01em; line-height: 1.35; margin-bottom: 12px; text-wrap: balance; }
  .rpt .rd-c { border-top: 3px solid color-mix(in srgb, var(--c1) 30%, var(--a-line)); }

  /* E · Question explorer */
  .rpt .re { display: grid; grid-template-columns: 270px minmax(0, 1fr); gap: 18px; align-items: start; }
  .rpt .re-q { position: sticky; top: 12px; display: grid; gap: 2px; }
  .rpt .re-q .eyebrow { padding: 0 10px 8px; }
  .rpt .re-q button { font: inherit; color: var(--ink2); text-align: left; cursor: pointer; display: grid; grid-template-columns: 26px 1fr; gap: 4px; padding: 9px 10px; border-radius: 10px; background: none; border: 1px solid transparent; font-weight: 700; font-size: 13.5px; line-height: 1.3; transition: background .2s, border-color .2s; }
  .rpt .re-q button .n { color: var(--mute); font-size: 12px; padding-top: 1px; }
  .rpt .re-q button small { display: block; color: var(--mute); font-weight: 600; font-size: 11.5px; margin-top: 2px; }
  .rpt .re-q button:hover { background: var(--a-surf); }
  .rpt .re-q button[aria-pressed="true"] { background: var(--a-surf); border-color: var(--a-line); color: var(--ink); box-shadow: inset 3px 0 0 var(--pri); }
  .rpt .re-q button[aria-pressed="true"] .n { color: var(--pri); }
  .rpt .re-a { min-width: 0; }
  .rpt .re-top { display: grid; gap: 8px; padding: 22px var(--a-pad) 4px; }
  .rpt .re-qt { font-size: 30px; line-height: 1.12; letter-spacing: -.035em; text-wrap: balance; }
  .rpt .re-ans { font-size: 18px; font-weight: 700; color: var(--pri); letter-spacing: -.01em; max-width: 52ch; text-wrap: pretty; }
  .rpt.dark .re-ans { color: var(--pri-ink); }
  .rpt .re-bar { border-top: 1px solid var(--a-line); margin-top: 14px; padding-top: 12px; }
  .rpt .re-why { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 300px); gap: 16px; align-items: start; padding: 14px var(--a-pad); border-top: 1px solid var(--a-line); }
  .rpt .re-why ul { margin: 6px 0 0; padding-left: 18px; display: grid; gap: 6px; font-size: 14px; color: var(--ink2); }
  .rpt .re-nav { display: flex; justify-content: space-between; gap: 10px; padding: 12px var(--a-pad) var(--a-pad); border-top: 1px solid var(--a-line); }
  .rpt .re-nav .a-btn { min-width: 0; max-width: 48%; } .rpt .re-nav .a-btn span { overflow: hidden; text-overflow: ellipsis; }

  /* motion: grow once */
  .rpt.anim .rsvg .bar { transform-box: fill-box; transform-origin: 50% 100%; animation: r-grow .8s var(--ease) both; animation-delay: calc(min(var(--i), 24) * 22ms); }
  .rpt.anim .rsvg .wipe { animation: r-wipe 1.2s var(--ease) both; }
  .rpt.anim .rsvg .ept, .rpt.anim .rsvg .ep-l { animation: r-fade .4s .95s both; }
  .rpt.anim .hb-t i, .rpt.anim .mbars i, .rpt.anim .stk i { transform-origin: left; animation: r-grow-x .8s var(--ease) both; animation-delay: calc(var(--i, 0) * 60ms); }
  .rpt.anim .vc-t i { transform-origin: bottom; animation: r-grow .8s var(--ease) both; animation-delay: calc(var(--i, 0) * 60ms); }
  @keyframes r-grow { from { transform: scaleY(0); } }
  @keyframes r-grow-x { from { transform: scaleX(0); } }
  @keyframes r-wipe { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
  @keyframes r-fade { from { opacity: 0; } }
  .rpt.anim .rvsvg .rv-n { transform-box: fill-box; transform-origin: 50% 50%; animation: r-grow .7s var(--ease) both; animation-delay: calc(var(--c) * 160ms); }
  .rpt.anim .rvsvg .rv-l { animation: r-flow .9s var(--ease) both; animation-delay: calc(var(--c) * 160ms + 120ms); }
  .rpt.anim .rvsvg .sc-d { transform-box: fill-box; transform-origin: 50% 50%; animation: r-pop .6s var(--ease) both; animation-delay: calc(var(--i) * 70ms); }
  @keyframes r-flow { from { opacity: 0; clip-path: inset(0 100% 0 0); } to { opacity: 1; clip-path: inset(0 0 0 0); } }
  @keyframes r-pop { from { transform: scale(0); } }
  @media (prefers-reduced-motion: reduce) { .rpt *, .rpt { animation: none !important; transition: none !important; } }

  @container site (max-width: 900px) {
    .rpt .ra { grid-template-columns: 1fr; }
    .rpt .ra-ix { position: sticky; top: 0; z-index: 3; display: flex; overflow-x: auto; gap: 4px; background: var(--a-bg); padding: 6px 0; margin: 0 -2px; }
    .rpt.dark .ra-ix { background: #0D141B; }
    .rpt .ra-ix .eyebrow, .rpt .ra-ix a small { display: none; }
    .rpt .ra-ix a { display: flex; gap: 6px; white-space: nowrap; border-left: 0; border-bottom: 2px solid transparent; border-radius: 8px; padding: 6px 10px; }
    .rpt .ra-ix a.on { border-bottom-color: var(--pri); }
    .rpt .fac3 { grid-template-columns: 1fr 1fr; } .rpt .fac3 > div:last-child { grid-column: 1 / -1; }
    .rpt .rv { grid-template-columns: 1fr; gap: 14px; } .rpt .rv-t { position: static; }
    .rpt .re { grid-template-columns: 1fr; }
    .rpt .re-q { position: static; display: flex; overflow-x: auto; gap: 6px; padding-bottom: 4px; }
    .rpt .re-q .eyebrow, .rpt .re-q button small { display: none; }
    .rpt .re-q button { display: flex; gap: 6px; white-space: nowrap; flex: none; border-color: var(--a-line); background: var(--a-surf); }
    .rpt .re-q button[aria-pressed="true"] { box-shadow: inset 0 -2px 0 var(--pri); }
  }
  @container site (max-width: 700px) {
    .rpt.dark { padding: 12px; }
    .rpt .hb-r, .rpt .hb.x .hb-r { grid-template-columns: minmax(0, 1fr) 76px; gap: 4px 10px; }
    .rpt .hb-l { grid-column: 1 / -1; }
    .rpt .hb.x .hb-r { grid-template-columns: minmax(0, 1fr) 70px; } .rpt .hb-x { grid-column: 1 / -1; justify-content: flex-start; } .rpt .hb-x .a-meter { max-width: 160px; }
    .rpt .fac2, .rpt .fac3 { grid-template-columns: 1fr; }
    .rpt .fn { display: grid; grid-template-columns: 1fr 1fr; } .rpt .fn-a { display: none; }
    .rpt .upc-r { grid-template-columns: 76px minmax(0, 1fr) 40px; row-gap: 4px; } .rpt .upc-r .a-meter { grid-column: 1 / 3; grid-row: 2; } .rpt .upc-r > :last-child { grid-row: 2; grid-column: 3; justify-self: end; }
    .rpt .upc-r > span:nth-child(4) { grid-row: 1; grid-column: 3; text-align: right; }
    .rpt .rb-grid { grid-template-columns: 1fr 1fr; } .rpt .rb-tile .v { font-size: 17px; }
    .rpt .rv-h { font-size: 20px; } .rpt .rv-lead { padding: 16px; }
    .rpt .rfacts { gap: 8px 18px; }
    .rpt .rleg small { margin-left: 0; flex-basis: 100%; }
    .rpt .rd-hero .a-card-h h2 { font-size: 17px; } .rpt .rd-lede, .rpt .rd-say { font-size: 14px; }
    .rpt .re-top { padding-top: 16px; } .rpt .re-qt { font-size: 23px; } .rpt .re-ans { font-size: 16px; }
    .rpt .re-why { grid-template-columns: 1fr; }
    .rpt .re-nav .a-btn { max-width: 49%; }
  }`;

  TS.register({
    id: 'reports', label: 'Reports', group: 'v2.5 · owner', admin: true, css,
    variants: [
      { id: 'A', name: 'Ledger with index', render: renderA, mount: mount('A'),
        note: 'One long report in R55 order: a KPI strip, then nine section cards (Money, Packages, Occupancy, Funnel, Cancellations, Discounts, Add-ons, Channels, Customers), each with its key figures, a chart, a Chart/Table toggle and CSV. A sticky index on the left names every section with its headline number and tracks where you are. Money is an area chart of the whole year with the chosen range lit up and its endpoint labelled; hover any month for the figures. On a phone the index turns into a sticky scrolling chip row above the cards, bars stack their labels, and tables scroll sideways inside their card.',
        tradeoff: 'Everything is on one page and easy to print or scan, but it is long and the owner has to scroll for the one number they came for.' },
      { id: 'B', name: 'KPI cockpit', render: renderB, mount: mount('B'),
        note: 'A KPI strip, then all nine sections as small-multiple tiles, each with a headline number and a mini chart that shows the chosen range. Clicking a tile opens it in the drill-in panel on the right: full chart (Money as monthly bars), key figures, Chart/Table and CSV, and a few plain sentences on what it says. It reads as a control room: scan the tiles, then drill into the odd one. On a phone the tiles sit two across and the panel drops below them.',
        tradeoff: 'Fastest to scan and the densest, but only one full chart is open at a time and the mini charts carry no axes.' },
      { id: 'C', name: 'Monthly review', render: renderC, mount: mount('C'),
        note: 'Reads like a written review of the chosen period. A lead block states the month in one or two sentences with five figures; then each section puts its story on the left ("Kasol weekends filled 94%; Leh\'s 3 and 10 Oct dates sit at 40% and 30%") and the chart on the right, with a marigold "Next" note where there is something to do. All sentences are generated from the same numbers as the charts, so switching the range rewrites them. On a phone the text sits above each chart.',
        tradeoff: 'Best for the owner who wants the story rather than the dashboard, but the sentences need care as data changes and it takes the most vertical space.' },
      { id: 'D', name: 'Money river', render: renderD, mount: mountX('D'),
        note: 'The page opens on one hand-drawn flow chart: every package pours its revenue into Booked, which splits into live and cancelled, then into collected, balances due, paid-then-cancelled and never charged, and ends as net kept and refunded. Every band is drawn to one rupee scale, so widths are exact shares, and the reconciliation line under it spells out the sums. Hover any band or node for the rupees; the Chart/Table toggle and CSV sit on it like every other chart, with booked-by-month underneath. The other eight sections follow as "downstream" cards, two across, each led by its one-line finding, with occupancy full width so the emptiest upcoming departures stay flagged. On a phone (and tablet) the river redraws in three columns, Booked straight to its outcomes and then to net and refunded (packages stay in the Packages card), labels keep a halo over the bands, and the cards stack.',
        tradeoff: 'Shows in one picture where every rupee went and why net is lower than booked, which no table does as fast; but a flow chart takes a moment to learn, and everything below it is a plainer card grid.' },
      { id: 'E', name: 'Question explorer', render: renderE, mount: mountX('E'),
        note: 'The report is a list of nine plain questions on the left ("Is the money actually coming in?", "Which departures need seats?", "Do discounts pay for themselves?"), each with its headline number. Pick one and the right side answers it: the question in large type, the answer in one sentence, the key figures, one big answer chart (a running-total chart where the gap is money not yet in; packages as dots of revenue against fill; return per ₹1 of discount), then "Why we say so" and a Next note. Chart/Table and CSV sit on every answer; previous/next buttons walk through all nine. On a phone the questions become a scrolling chip row above the answer.',
        tradeoff: 'The friendliest way in for an owner who is not a numbers person, and each answer gets a full-size chart; but only one section is on screen at a time, so it is the slowest to scan end to end or print.' },
    ],
  });
})();
