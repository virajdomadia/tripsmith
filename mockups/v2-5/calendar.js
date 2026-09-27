/* Screen: /admin/calendar — Departure calendar (R50, P11). Also shows R43 balances, R44 waitlist, R49 readiness.
   Three layouts over one data set and one side panel:
   A Month grid · B Package timeline (Gantt, rows = packages or leaders) · C Ops board (week-by-week).
   Data: Oct–Dec 2026 departures of the seed packages, IST; today = Sun 27 Sep 2026.
   Numbers are consistent: sold + held <= seats, revenue = sold x price, collected + balances = revenue. */
(() => {
  const TS = window.TS;
  const { ICON, PKGS: P, inr, lakh, esc } = TS;

  /* ---------- leaders: the seed four plus two who cover overlapping weekends ---------- */
  const LD = Object.assign({}, TS.LEADERS, {
    kabir: { name: 'Kabir Thakur', mono: 'KT', hue: '#0F766E', phone: '+91 98170 55213' },
    sana: { name: 'Sana Qureshi', mono: 'SQ', hue: '#9D174D', phone: '+91 98290 61847' },
  });
  const av = (k, s = 28) => `<span class="ts-av" style="--s:${s}px;--h:${LD[k].hue}" aria-hidden="true">${LD[k].mono}</span>`;

  const ORDER = ['kasol', 'manali', 'shimla', 'leh', 'munnar', 'goa', 'jaipur'];
  const SEATS = { kasol: 24, manali: 14, shimla: 12, munnar: 12, leh: 10, goa: 20, jaipur: 14 };
  const SHORT = { kasol: 'Kasol', manali: 'Manali·Tosh', shimla: 'Shimla', munnar: 'Munnar', leh: 'Leh', goa: 'Goa', jaipur: 'Rajasthan' };
  const MEET = {
    kasol: 'Kashmere Gate ISBT, Delhi · gate 3 · 7:30 pm',
    manali: 'Rajiv Chowk metro, Delhi · gate 7 · 6:00 am',
    shimla: 'Chandigarh airport arrivals · 11:00 am',
    leh: 'Leh airport (IXL) arrivals · 9:00 am',
    munnar: 'Kochi airport (COK) T3 arrivals · 10:00 am',
    goa: 'Goa airport (GOI) arrivals · until 2:00 pm',
    jaipur: 'Jaipur airport arrivals · 12:00 pm',
  };

  /* ---------- dates (UTC maths, IST labels) ---------- */
  const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MF = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const D = (m, d) => new Date(Date.UTC(2026, m, d));
  const add = (dt, n) => new Date(dt.getTime() + n * 864e5);
  const key = (dt) => dt.toISOString().slice(0, 10);
  const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const same = (a, b) => a.getTime() === b.getTime();
  const f1 = (dt) => `${DN[dt.getUTCDay()]} ${dt.getUTCDate()} ${MN[dt.getUTCMonth()]}`;
  const days = (a, b) => Math.round((b - a) / 864e5);
  const TODAY = D(8, 27);
  const MIN_M = 9, MAX_M = 11;
  const monthDays = (m) => Array.from({ length: D(m + 1, 0).getUTCDate() }, (_, i) => D(m, i + 1));
  const weeks = (m) => {
    const first = D(m, 1), last = D(m + 1, 0), out = [];
    for (let s = add(first, -first.getUTCDay()); s <= last; s = add(s, 7)) out.push(Array.from({ length: 7 }, (_, i) => add(s, i)));
    return out;
  };

  /* ---------- seeded detail (bookings, waitlist) so every number adds up ---------- */
  const NAMES = ['Aarav Mehta', 'Priya Nair', 'Rohan Kapoor', 'Sneha Iyer', 'Vikram Singh', 'Ananya Das', 'Karan Malhotra', 'Ishita Rao', 'Arjun Reddy',
    'Meghna Joshi', 'Siddharth Jain', 'Neha Kulkarni', 'Aditya Verma', 'Pooja Menon', 'Rahul Bhatia', 'Tanvi Shah', 'Nikhil Gupta', 'Divya Pillai',
    'Harsh Agarwal', 'Riya Sen', 'Kunal Chawla', 'Aisha Khan', 'Varun Desai', 'Shruti Bose', 'Manav Arora', 'Kavya Hegde', 'Yash Tiwari', 'Kiran Rao'];
  const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  const rng = (a) => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

  const DEPS = [];
  function wlStates(x) {
    x.wl.forEach((w) => {
      if (w.state.startsWith('Offered')) return;
      if (x.free > 0 && w.n > x.free) { w.state = `Skipped · needs ${w.n}, ${x.free} free`; w.cls = 'warn'; }
      else if (x.free > 0) { w.state = 'Fits now'; w.cls = 'ok'; }
      else { w.state = 'Waiting'; w.cls = 'mute'; }
    });
  }
  function build([m, d, pk, ld, sold, held, wait, missing, o = {}]) {
    const p = P[pk], price = o.price || p.from, total = o.total || SEATS[pk];
    const start = D(m, d), end = add(start, p.nights);
    let id = `${pk}-${key(start)}`;
    while (DEPS.some((x) => x.id === id)) id += 'b';
    const r = rng(hash(id));
    const pick = (a) => a[Math.floor(r() * a.length)];
    const ref = () => 'TS-' + Array.from({ length: 6 }, () => ALPH[Math.floor(r() * ALPH.length)]).join('');
    const used = new Set();
    const name = () => { let n; do n = pick(NAMES); while (used.has(n) && used.size < NAMES.length); used.add(n); return n; };
    const due = add(start, -30), depOpen = due >= TODAY;
    const bk = [];
    for (let left = sold; left > 0;) {
      const n = Math.min(left, pick([2, 2, 1, 3, 2, 4, 2, 1]));
      left -= n;
      const value = n * price, deposit = depOpen && r() < 0.5;
      const paid = deposit ? Math.round(value * 0.25) + (r() < 0.3 ? 1000 * Math.ceil(r() * 2) : 0) : value;
      bk.push({ ref: ref(), who: name(), n, value, paid, bal: value - paid, missing: 0 });
    }
    let miss = missing;
    for (let i = bk.length - 1; i >= 0 && miss > 0; i--) { const k = Math.min(bk[i].n, miss); bk[i].missing = k; miss -= k; }
    const sizes = o.wl || Array.from({ length: wait }, () => pick([2, 1, 2, 3, 4]));
    const wl = sizes.map((n, i) => ({ pos: i + 1, who: name(), n, state: 'Waiting', cls: 'mute' }));
    const holds = [];
    let h = held;
    if (wl.length && h >= wl[0].n) {
      holds.push({ ref: ref(), who: wl[0].who, n: wl[0].n, value: wl[0].n * price, hold: 'Waitlist offer · 18 h left' });
      wl[0].state = 'Offered · 18 h left'; wl[0].cls = 'info'; h -= wl[0].n;
    }
    while (h > 0) { const n = Math.min(h, pick([1, 2, 2])); h -= n; holds.push({ ref: ref(), who: name(), n, value: n * price, hold: `Checkout hold · ${pick([4, 6, 8, 9])} min left` }); }
    const rev = sold * price, collected = sum(bk, (b) => b.paid);
    const paidTrav = sum(bk.filter((b) => !b.bal), (b) => b.n);
    const packTrav = Math.round(paidTrav * (depOpen ? 0.45 : 0.85));
    const pDet = sold ? (sold - Math.min(missing, sold)) / sold : 0, pPaid = sold ? paidTrav / sold : 0, pPack = sold ? packTrav / sold : 0;
    const x = {
      id, pk, ld, start, end, m, total, sold, held, free: total - sold - held, price, rev, collected, bal: rev - collected,
      balBk: bk.filter((b) => b.bal).length, due, missing, pDet, pPaid, pPack, ready: sold ? Math.round(((pDet + pPaid + pPack) / 3) * 100) : 0,
      wl, bk: holds.concat(bk.filter((b) => b.bal), bk.filter((b) => !b.bal)), meet: o.meet || MEET[pk], note: o.note || '', ref,
    };
    wlStates(x);
    return x;
  }
  // [month0, day, package, leader, sold, held, waitlist parties, travellers missing details, opts]
  [
    // October 2026
    [9, 2, 'kasol', 'kabir', 24, 0, 0, 5, { wl: [2, 1, 3, 2] }], [9, 3, 'kasol', 'tenzin', 22, 2, 0, 3], [9, 4, 'leh', 'rigzin', 10, 0, 0, 1, { wl: [2, 1] }],
    [9, 9, 'kasol', 'kabir', 20, 1, 0, 2], [9, 10, 'kasol', 'tenzin', 18, 0, 0, 1], [9, 12, 'munnar', 'anjali', 11, 1, 0, 2],
    [9, 13, 'manali', 'tenzin', 13, 0, 0, 0, { wl: [2, 1], note: 'One seat freed by a cancellation this morning. The first party on the list needs 2, so the next party that fits can take it.' }],
    [9, 15, 'jaipur', 'meera', 9, 2, 0, 1], [9, 16, 'kasol', 'kabir', 17, 0, 0, 0], [9, 17, 'kasol', 'sana', 13, 3, 0, 0], [9, 18, 'leh', 'rigzin', 6, 0, 0, 0],
    [9, 21, 'shimla', 'sana', 7, 0, 0, 0], [9, 23, 'kasol', 'kabir', 16, 0, 0, 0], [9, 24, 'kasol', 'tenzin', 12, 0, 0, 0], [9, 24, 'goa', 'meera', 15, 2, 0, 0],
    [9, 26, 'munnar', 'anjali', 9, 0, 0, 0], [9, 30, 'kasol', 'kabir', 11, 2, 0, 0], [9, 31, 'kasol', 'tenzin', 14, 0, 0, 0],
    // November 2026
    [10, 1, 'leh', 'rigzin', 6, 0, 0, 0, { price: 29999, note: 'Last Leh departure of 2026. Khardung La closes for winter after this trip.' }],
    [10, 6, 'kasol', 'tenzin', 21, 3, 0, 4, { price: 6499, wl: [2, 3, 2, 4, 1, 2], note: 'Diwali weekend fare. Sold out since 14 Sep; 2 seats are on a 24 h waitlist offer.' }],
    [10, 7, 'kasol', 'kabir', 19, 2, 0, 3, { price: 6499, note: 'Diwali weekend fare.' }],
    [10, 7, 'goa', 'meera', 17, 0, 0, 2, { price: 16999, wl: [4], note: 'Diwali. 3 seats freed by a cancellation on 25 Sep; the only waiting party needs 4.' }],
    [10, 9, 'munnar', 'anjali', 8, 2, 0, 1], [10, 10, 'manali', 'tenzin', 9, 0, 0, 2], [10, 12, 'jaipur', 'sana', 6, 1, 0, 0],
    [10, 13, 'kasol', 'kabir', 15, 2, 0, 1], [10, 14, 'kasol', 'rigzin', 11, 0, 0, 0], [10, 14, 'goa', 'meera', 12, 2, 0, 0],
    [10, 16, 'munnar', 'anjali', 12, 0, 0, 2, { wl: [2, 2, 3] }], [10, 18, 'shimla', 'meera', 5, 0, 0, 0], [10, 20, 'kasol', 'tenzin', 14, 0, 0, 0],
    [10, 21, 'kasol', 'kabir', 9, 3, 0, 0], [10, 21, 'goa', 'sana', 7, 0, 0, 0], [10, 24, 'manali', 'rigzin', 4, 0, 0, 0], [10, 25, 'shimla', 'meera', 3, 2, 0, 0],
    [10, 26, 'jaipur', 'sana', 10, 0, 0, 1], [10, 27, 'kasol', 'tenzin', 8, 0, 0, 0], [10, 28, 'kasol', 'kabir', 6, 2, 0, 0],
    // December 2026
    [11, 4, 'kasol', 'tenzin', 6, 0, 0, 0], [11, 5, 'kasol', 'kabir', 4, 0, 0, 0], [11, 11, 'kasol', 'tenzin', 3, 0, 0, 0], [11, 12, 'kasol', 'kabir', 2, 0, 0, 0],
    [11, 14, 'munnar', 'anjali', 5, 0, 0, 0], [11, 19, 'goa', 'meera', 14, 2, 0, 0, { price: 18999 }],
    [11, 24, 'goa', 'sana', 20, 0, 0, 0, { price: 21999, wl: [2, 4], note: 'Christmas fare. Sold out in 9 days.' }],
    [11, 26, 'kasol', 'tenzin', 24, 0, 0, 0, { price: 6999, wl: [2, 2, 3, 1, 2], note: 'Year-end weekend fare.' }], [11, 30, 'jaipur', 'meera', 9, 0, 0, 0],
  ].forEach((s) => DEPS.push(build(s)));

  const byId = (id) => DEPS.find((x) => x.id === id);
  const st = (x) => {
    const pct = (x.sold + x.held) / x.total;
    if (x.free <= 0) return { k: 'full', w: 'Sold out', c: 'pri' };
    if (pct >= 0.7) return { k: 'hot', w: 'Filling', c: 'ok' };
    if (pct >= 0.35) return { k: 'open', w: 'Open', c: 'mute' };
    return { k: 'low', w: 'Low', c: 'bad' };
  };
  const busy = (k, start, nights) => DEPS.find((x) => x.ld === k && x.start <= add(start, nights) && start <= x.end);
  const offerTarget = (x) => (x.free > 0 ? x.wl.find((w) => !w.state.startsWith('Offered') && w.n <= x.free) : null);
  const why = (x) => {
    const r = [], out = days(TODAY, x.start);
    if (offerTarget(x)) r.push(['ok', 'Waitlist can take free seats']);
    if (st(x).k === 'low' && out <= 70) r.push(['bad', `Low fill · ${out} days out`]);
    if (x.missing) r.push(['warn', `Details missing · ${x.missing}`]);
    if (x.bal && days(TODAY, x.due) <= 14) r.push(['warn', `${inr(x.bal)} due ${f1(x.due)}`]);
    return r;
  };
  const pc = (n, t) => Math.round((n / t) * 1000) / 10;
  const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

  /* ---------- state (shared by A/B/C so switching keeps your place) ---------- */
  const S = { m: 10, sel: null, add: null, f: { dest: '', pkg: '', ld: '' }, tab: 'bk', group: 'pkg', att: 'all', msg: '', fresh: null };
  const shown = (x) => (!S.f.dest || P[x.pk].dest === S.f.dest) && (!S.f.pkg || x.pk === S.f.pkg) && (!S.f.ld || x.ld === S.f.ld);
  const monthList = () => DEPS.filter((x) => x.m === S.m && shown(x)).sort((a, b) => a.start - b.start || ORDER.indexOf(a.pk) - ORDER.indexOf(b.pk));

  /* ---------- shared pieces ---------- */
  const lab = (x) => `${P[x.pk].name}, ${f1(x.start)}, ${st(x).w}: ${x.sold} of ${x.total} sold, ${x.held} held, ${x.free} free${x.wl.length ? `, ${x.wl.length} on waitlist` : ''}`;
  const bar = (x, i = 0) => `<span class="cal-bar" style="--s:${pc(x.sold, x.total)}%;--h:${pc(x.held, x.total)}%;--i:${i}" aria-hidden="true"><i></i><i class="h"></i></span>`;
  const wdot = (x) => (x.wl.length ? `<span class="cal-wl num" title="${plural(x.wl.length, 'party', 'parties')} on the waitlist">${x.wl.length}</span>` : '');
  const depAttrs = (x) => `data-dep="${x.id}" data-day="${key(x.start)}" aria-pressed="${S.sel === x.id}" aria-label="${esc(lab(x))}"`;
  const fresh = (x) => (S.fresh === x.id ? ' fresh' : '');

  const head = () => `<div class="a-head"><h1>Calendar</h1>
      <p class="sub">${MF[S.m]} 2026 · every departure, its seats and what needs doing. Times in IST; numbers match the bookings desk.</p>
      <div class="acts"><button class="a-btn ghost" data-act="csv">${ICON.down}Export month</button><button class="a-btn act" data-act="add-first">${ICON.plus}Add departure</button></div></div>`;

  function strip(list) {
    const seats = sum(list, (x) => x.total), sold = sum(list, (x) => x.sold), held = sum(list, (x) => x.held);
    const rev = sum(list, (x) => x.rev), col = sum(list, (x) => x.collected), bal = sum(list, (x) => x.bal), balBk = sum(list, (x) => x.balBk);
    const miss = sum(list, (x) => x.missing), missDeps = list.filter((x) => x.missing).length;
    const kas = list.filter((x) => x.pk === 'kasol').length, full = list.filter((x) => x.free <= 0).length;
    const next = list.filter((x) => x.bal).map((x) => x.due).sort((a, b) => a - b)[0];
    const pct = seats ? Math.round((sold / seats) * 100) : 0;
    const kpi = (k, v, d, extra = '') => `<div class="a-kpi"><span class="k">${k}</span><span class="v num">${v}</span>${extra}<span class="d">${d}</span></div>`;
    return `<div class="a-kpis cal-strip" aria-label="${MF[S.m]} at a glance">
      ${kpi('Departures', list.length, [kas ? `${kas} Kasol weekends` : '', `${full} sold out`].filter(Boolean).join(' · '))}
      ${kpi('Seats sold', `${pct}%`, `${sold} of ${seats} · ${held} held`, `<span class="a-meter" style="--v:${seats ? pc(sold, seats) : 0}%;--h:${seats ? pc(held, seats) : 0}%"></span>`)}
      ${kpi('Revenue booked', lakh(rev), `${lakh(col)} collected`)}
      ${kpi('Balances due', bal ? lakh(bal) : '₹0', bal && next ? `${plural(balBk, 'booking', 'bookings')} · first due ${f1(next)}` : 'All paid in full')}
      ${kpi('Details missing', miss, miss ? `${miss === 1 ? 'traveller' : 'travellers'} on ${plural(missDeps, 'departure', 'departures')}` : 'Everyone has filled in')}
    </div>`;
  }

  function filters(extra = '') {
    const dests = [...new Set(ORDER.map((k) => P[k].dest))];
    const pkgs = ORDER.filter((k) => !S.f.dest || P[k].dest === S.f.dest);
    const all = DEPS.filter((x) => x.m === S.m).length, n = monthList().length;
    const on = S.f.dest || S.f.pkg || S.f.ld;
    const opt = (v, t, cur) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${t}</option>`;
    return `<div class="a-bar cal-filters">${ICON.filter}
      <select class="a-select" data-f="dest" aria-label="Destination">${opt('', 'All destinations', S.f.dest)}${dests.map((d) => opt(d, d, S.f.dest)).join('')}</select>
      <select class="a-select" data-f="pkg" aria-label="Package">${opt('', 'All packages', S.f.pkg)}${pkgs.map((k) => opt(k, P[k].name, S.f.pkg)).join('')}</select>
      <select class="a-select" data-f="ld" aria-label="Trip leader">${opt('', 'All leaders', S.f.ld)}${Object.keys(LD).map((k) => opt(k, LD[k].name, S.f.ld)).join('')}</select>
      ${extra}<span class="cal-count">Showing <b class="num">${n}</b> of ${all} departures</span>${on ? '<button class="a-btn ghost sm" data-act="reset">Clear filters</button>' : ''}</div>`;
  }

  const legend = () => `<div class="cal-leg" aria-hidden="true"><span><i class="k st-full"></i>Sold out</span><span><i class="k st-hot"></i>Filling 70%+</span>
      <span><i class="k st-open"></i>Open</span><span><i class="k st-low"></i>Low, under 35%</span><span><i class="k hh"></i>Held</span><span><b class="cal-wl">3</b>Waitlist</span></div>`;

  const monthNav = (extra = '') => `<div class="cal-nav">
      <div class="cal-mnav"><button class="a-btn ghost sm" data-act="prev" aria-label="Previous month" ${S.m <= MIN_M ? 'disabled' : ''}>${ICON.chevL}</button>
      <h2 class="cal-mon" aria-live="polite">${MF[S.m]} 2026</h2>
      <button class="a-btn ghost sm" data-act="next" aria-label="Next month" ${S.m >= MAX_M ? 'disabled' : ''}>${ICON.chevR}</button>
      <button class="a-btn ghost sm" data-act="today">Today</button></div>
      <span class="cal-now">Today ${f1(TODAY)} · IST</span>${extra}${legend()}</div>`;

  const msg = () => (S.msg ? `<div class="a-note" role="status">${ICON.info}<span>${S.msg}</span></div>` : '');

  /* ---------- side panel: overview · departure · add ---------- */
  function overview(list) {
    const att = list.map((x) => [x, why(x)]).filter(([, r]) => r.length).slice(0, 7);
    const counts = ['full', 'hot', 'open', 'low'].map((k) => [k, list.filter((x) => st(x).k === k).length]);
    const words = { full: 'Sold out', hot: 'Filling', open: 'Open', low: 'Low' };
    return `<aside class="a-panel cal-panel" aria-label="${MF[S.m]} overview">
      <section><h3>Needs you in ${MF[S.m]}</h3>${msg()}
        ${att.length ? `<div class="cal-att">${att.map(([x, r]) => `<button class="st-${st(x).k}" data-dep="${x.id}">
            <span class="dd"><b class="num">${x.start.getUTCDate()}</b><small>${DN[x.start.getUTCDay()]}</small></span>
            <span><b>${P[x.pk].name}</b><span class="rs">${r.map(([c, t]) => `<span class="a-chip ${c}">${t}</span>`).join('')}</span></span></button>`).join('')}</div>`
          : `<div class="a-empty">Nothing needs you in ${MF[S.m]}. Every departure is paid, filled in and on track.</div>`}
      </section>
      <section><h3>Fill this month</h3><div class="cal-mix">${counts.map(([k, n]) => `<span class="st-${k}"><i></i><b class="num">${n}</b>${words[k]}</span>`).join('')}</div></section>
      <section><h3>Keyboard</h3><p class="cal-mute cal-small">Tab to a departure; arrow keys move between them (up and down jump a week); Enter opens it; Esc closes the panel. Click an empty day to add a departure there.</p></section>
    </aside>`;
  }

  function detail(x) {
    const s = st(x), off = offerTarget(x), p = P[x.pk], l = LD[x.ld];
    const why2 = [];
    if (!off) why2.push(x.free ? (x.wl.length ? `No waiting party fits ${plural(x.free, 'free seat', 'free seats')}` : 'No one is waiting') : 'No free seats to offer');
    if (x.free <= 0) why2.push('Sold out: add seats in Edit departure to take a new booking');
    const wlClose = add(x.start, -3);
    const bkRow = (b) => `<li><div><b class="num">${b.ref}</b><span>${b.who} · ${plural(b.n, 'traveller', 'travellers')} · ${inr(b.value)}</span></div><div class="r">
        ${b.hold ? `<span class="a-chip info">${b.hold}</span>` : b.bal ? `<span class="a-chip warn">${inr(b.bal)} due ${f1(x.due)}</span>` : `<span class="a-chip ok">${ICON.check}Paid</span>`}
        ${b.missing ? `<span class="a-chip bad">Details missing · ${b.missing}</span>` : ''}</div></li>`;
    const wlRow = (w) => `<li><div><b>#${w.pos} ${w.who}</b><span>Party of ${w.n}</span></div><div class="r"><span class="a-chip ${w.cls}">${w.state}</span></div></li>`;
    const list = S.tab === 'wl'
      ? `<p class="cal-mute cal-small">${wlClose > TODAY ? `Waitlist closes ${f1(wlClose)}, 3 days before departure. Offers walk the list in order; a bigger party is skipped but keeps its place.` : 'Waitlist closed.'}</p>
         ${x.wl.length ? `<ul class="cal-list">${x.wl.map(wlRow).join('')}</ul>` : `<div class="a-empty">No one is waiting. The waitlist opens when the departure sells out.</div>`}`
      : x.bk.length ? `<ul class="cal-list">${x.bk.map(bkRow).join('')}</ul>` : `<div class="a-empty">No bookings yet. New booking takes the first one at the counter.</div>`;
    return `<aside class="a-panel cal-panel" aria-label="Departure details">
      <section class="cal-ph"><div class="cal-ph-top"><span class="a-chip ${s.c}">${s.w}</span><span class="cal-mute cal-small">${p.dest} · ${p.nights} nights</span>
        <button class="a-btn ghost sm" data-act="close" aria-label="Close panel">${ICON.x}</button></div>
        <h2>${p.name}</h2><p class="cal-mute">${f1(x.start)} → ${f1(x.end)} ${x.end.getUTCFullYear()}</p></section>
      <section><div class="cal-seats"><div><b class="num">${x.sold}</b><span>sold</span></div><div><b class="num">${x.held}</b><span>held</span></div>
        <div><b class="num">${x.free}</b><span>free</span></div><div><b class="num">${x.total}</b><span>seats</span></div></div>
        <span class="a-meter" style="--v:${pc(x.sold, x.total)}%;--h:${pc(x.held, x.total)}%" aria-hidden="true"></span></section>
      <section><dl class="a-kv"><div><dt>Price per person</dt><dd>${inr(x.price)}</dd></div><div><dt>Revenue booked</dt><dd>${inr(x.rev)}</dd></div>
        <div><dt>Collected</dt><dd>${inr(x.collected)}</dd></div>
        <div><dt>Balances due</dt><dd>${x.bal ? `${inr(x.bal)} · ${plural(x.balBk, 'booking', 'bookings')} · by ${f1(x.due)}` : 'None, all paid in full'}</dd></div>
        <div><dt>Details missing</dt><dd>${x.missing ? plural(x.missing, 'traveller', 'travellers') : 'None'}</dd></div></dl></section>
      <section><div class="cal-rd"><h3>Readiness</h3><b class="num">${x.sold ? `${x.ready}%` : 'No travellers yet'}</b></div>
        <span class="a-meter" style="--v:${x.ready}%" aria-hidden="true"></span>
        <p class="cal-mute cal-small">Details ${Math.round(x.pDet * 100)}% · Balance paid ${Math.round(x.pPaid * 100)}% · Trip pack read ${Math.round(x.pPack * 100)}%</p></section>
      <section><div class="cal-who">${av(x.ld, 40)}<div><b>${l.name}</b><small>Trip leader · ${l.phone}</small></div></div>
        <div class="cal-meet">${ICON.pin}<div><b>Meeting point</b><small>${esc(x.meet)}</small></div></div>
        ${x.note ? `<div class="a-note">${ICON.info}<span>${x.note}</span></div>` : ''}</section>
      <section><div class="cal-acts">
        <button class="a-btn ghost sm" data-act="manifest">${ICON.file}Manifest</button><button class="a-btn ghost sm" data-act="edit">Edit departure</button>
        <button class="a-btn act sm wide" data-act="offer" ${off ? '' : 'disabled'}>${ICON.users}${off ? `Offer ${plural(off.n, 'seat', 'seats')} to #${off.pos} ${off.who.split(' ')[0]}` : 'Offer seats to waitlist'}</button>
        <button class="a-btn sm wide" data-act="newbk" ${x.free > 0 ? '' : 'disabled'}>${ICON.plus}New booking on this departure</button></div>
        ${why2.length ? `<p class="cal-why">${why2.join('. ')}.</p>` : ''}${msg()}</section>
      <section><div class="a-tabs" role="tablist"><button role="tab" data-tab="bk" aria-selected="${S.tab !== 'wl'}">Bookings <span class="ct num">${x.bk.length}</span></button>
        <button role="tab" data-tab="wl" aria-selected="${S.tab === 'wl'}">Waitlist <span class="ct num">${x.wl.length}</span></button></div>${list}</section>
    </aside>`;
  }

  function addDefaults(a, keepPkg) {
    const p = P[a.pk];
    if (!keepPkg) { a.seats = SEATS[a.pk]; a.price = p.from; a.meet = MEET[a.pk]; }
    const start = parse(a.day);
    if (!a.ld || busy(a.ld, start, p.nights)) a.ld = [p.leader, ...Object.keys(LD)].find((k) => !busy(k, start, p.nights)) || '';
  }
  function openAdd(day, pk) {
    const dow = parse(day).getUTCDay();
    S.add = { day, pk: pk || S.f.pkg || (dow === 5 || dow === 6 ? 'kasol' : 'manali'), ld: '' };
    addDefaults(S.add);
    S.sel = null; S.msg = '';
  }
  function addForm() {
    const a = S.add, p = P[a.pk], start = parse(a.day), end = add(start, p.nights);
    const again = DEPS.some((x) => x.pk === a.pk && same(x.start, start));
    const dayOpts = monthDays(start.getUTCMonth()).filter((d) => d >= TODAY)
      .map((d) => `<option value="${key(d)}" ${key(d) === a.day ? 'selected' : ''}>${f1(d)}${DEPS.some((x) => same(x.start, d)) ? ' · has departures' : ''}</option>`).join('');
    const ldOpts = Object.keys(LD).map((k) => {
      const b = busy(k, start, p.nights);
      return `<option value="${k}" ${a.ld === k ? 'selected' : ''} ${b ? 'disabled' : ''}>${LD[k].name}${b ? ` (on ${SHORT[b.pk]} till ${f1(b.end)})` : ''}</option>`;
    }).join('');
    return `<aside class="a-panel cal-panel" aria-label="Add departure">
      <section><div class="cal-ph-top"><span class="a-chip pri">New departure</span><button class="a-btn ghost sm" data-act="cancel" aria-label="Cancel">${ICON.x}</button></div>
        <h2>Add departure</h2><p class="cal-mute">${f1(start)} → ${f1(end)} · ${p.nights} nights. Bookable on the package page the moment you create it.</p></section>
      <section>
        <div class="a-field"><label for="cal-pk">Package</label><select id="cal-pk" data-addf="pk">${ORDER.map((k) => `<option value="${k}" ${k === a.pk ? 'selected' : ''}>${P[k].name}</option>`).join('')}</select></div>
        <div class="a-row2"><div class="a-field"><label for="cal-day">Starts</label><select id="cal-day" data-addf="day">${dayOpts}</select></div>
          <div class="a-field"><label for="cal-seats">Seats</label><input id="cal-seats" data-addf="seats" type="number" min="1" max="60" inputmode="numeric" value="${a.seats}"></div></div>
        <div class="a-field"><label for="cal-price">Price per person (₹)</label><input id="cal-price" data-addf="price" type="number" min="0" inputmode="numeric" value="${a.price}">
          <span class="hint">Package base fare is ${inr(p.from)}. Deals and early-bird apply on top.</span></div>
        <div class="a-field"><label for="cal-ld">Trip leader</label><select id="cal-ld" data-addf="ld"><option value="" ${a.ld ? '' : 'selected'}>Choose a leader</option>${ldOpts}</select>
          ${a.ld ? `<span class="hint">${LD[a.ld].name} is free ${f1(start)} → ${f1(end)}. Leaders already on a trip are greyed out.</span>` : '<span class="err">Every leader is on a trip these dates. Pick another day.</span>'}</div>
        <div class="a-field"><label for="cal-meet">Meeting point</label><input id="cal-meet" data-addf="meet" value="${esc(a.meet)}"></div>
        ${again ? `<div class="a-note">${ICON.info}<span>${p.name} already leaves on ${f1(start)}. A second bus the same day is fine for big weekends.</span></div>` : ''}
      </section>
      <section><div class="cal-acts"><button class="a-btn" data-act="create" ${a.ld ? '' : 'disabled'}>${ICON.check}Create departure</button><button class="a-btn ghost" data-act="cancel">Cancel</button></div></section>
    </aside>`;
  }
  const panel = (list) => (S.add ? addForm() : S.sel && byId(S.sel) ? detail(byId(S.sel)) : overview(list));

  /* ---------- week agenda (C's main view; A and B on a phone) ---------- */
  function agenda(list, withFree = true) {
    return `<div class="ag">${weeks(S.m).map((w) => {
      const items = list.filter((x) => w.some((d) => same(d, x.start)));
      const hasToday = w.some((d) => same(d, TODAY));
      const open = w.filter((d) => d.getUTCMonth() === S.m && d >= TODAY && !DEPS.some((x) => same(x.start, d) && shown(x)));
      const sold = sum(items, (x) => x.sold), seats = sum(items, (x) => x.total), miss = sum(items, (x) => x.missing);
      const rows = items.map((x, i) => {
        const s = st(x);
        return `<button class="ag-row st-${s.k}${fresh(x)}" ${depAttrs(x)}>
          <span class="ag-date"><small>${DN[x.start.getUTCDay()]}</small><b class="num">${x.start.getUTCDate()}</b><small>${MN[x.start.getUTCMonth()]}</small></span>
          <span class="ag-main"><b>${P[x.pk].name}</b><span class="ag-meta">${av(x.ld, 20)}${LD[x.ld].name} · ${P[x.pk].nights}N · back ${f1(x.end)}</span></span>
          <span class="ag-cap"><span class="ag-seats" aria-hidden="true">${Array.from({ length: x.total }, (_, k) => `<i class="${k < x.sold ? 's' : k < x.sold + x.held ? 'h' : 'f'}" style="--k:${k};--i:${i}"></i>`).join('')}</span>
            <span class="ag-capn"><b class="num">${x.sold}/${x.total}</b> sold${x.held ? ` · ${x.held} held` : ''} · ${x.free} free</span></span>
          <span class="ag-flags"><span class="a-chip ${s.c}">${s.w}</span>${x.wl.length ? `<span class="a-chip info">${x.wl.length} waiting</span>` : ''}${x.missing ? `<span class="a-chip bad">Details missing · ${x.missing}</span>` : ''}${x.sold ? `<span class="a-chip mute">Ready ${x.ready}%</span>` : ''}</span>
        </button>`;
      }).join('');
      return `<section class="ag-wk${hasToday ? ' now' : ''}"><header class="ag-h"><h3>${hasToday ? 'This week · ' : 'Week of '}${f1(w[0])} – ${f1(w[6])}</h3>
          <span class="num">${items.length ? `${plural(items.length, 'departure', 'departures')} · ${sold}/${seats} seats sold${miss ? ` · details missing for ${miss}` : ''}` : 'No departures'}</span></header>
        ${hasToday ? `<div class="ag-today"><span>Today · ${f1(TODAY)}</span></div>` : ''}
        ${rows || '<p class="ag-none">Nothing leaves this week.</p>'}
        ${withFree && open.length ? `<div class="ag-free"><span>Open days</span>${open.map((d) => `<button class="a-btn ghost sm" data-add="${key(d)}" aria-label="Add departure on ${f1(d)}">${ICON.plus}${DN[d.getUTCDay()]} ${d.getUTCDate()}</button>`).join('')}</div>` : ''}
      </section>`;
    }).join('')}</div>`;
  }

  /* ---------- A · month grid ---------- */
  function gridA(list) {
    let i = 0;
    const cell = (day) => {
      const inM = day.getUTCMonth() === S.m, isT = same(day, TODAY), future = day >= TODAY, we = day.getUTCDay() % 6 === 0;
      const deps = inM ? list.filter((x) => same(x.start, day)) : [];
      const chips = deps.map((x) => {
        const s = st(x);
        return `<button class="ga-chip st-${s.k}${fresh(x)}" ${depAttrs(x)}><span class="t"><b>${SHORT[x.pk]}</b>${wdot(x)}</span>${bar(x, i++)}
          <span class="n"><span class="num">${x.sold}/${x.total}</span><span class="w">${s.w}</span></span></button>`;
      }).join('');
      const addBtn = inM && future
        ? deps.length ? `<button class="ga-add" data-add="${key(day)}" tabindex="-1" aria-label="Add departure on ${f1(day)}">${ICON.plus}</button>` : ''
        : '';
      const empty = inM && future && !deps.length ? `<button class="ga-empty" data-add="${key(day)}" tabindex="-1" aria-label="Add departure on ${f1(day)}">${ICON.plus}Add departure</button>` : '';
      return `<div class="ga-c${inM ? '' : ' out'}${isT ? ' today' : ''}${we ? ' we' : ''}${inM && !future ? ' past' : ''}">
        <div class="ga-dn"><span class="num">${day.getUTCDate()}${inM ? '' : ` ${MN[day.getUTCMonth()]}`}</span>${isT ? '<em>Today</em>' : ''}${addBtn}</div>${chips}${empty}</div>`;
    };
    return `<div class="cal-scroll"><div class="ga-grid cal-view"><div class="ga-wd">${DN.map((d) => `<span>${d}</span>`).join('')}</div>
      ${weeks(S.m).map((w) => `<div class="ga-wk">${w.map(cell).join('')}</div>`).join('')}</div></div>`;
  }

  /* ---------- B · package / leader timeline ---------- */
  function gantt() {
    const n = D(S.m + 1, 0).getUTCDate(), m0 = D(S.m, 1), mEnd = D(S.m, n);
    const inView = DEPS.filter((x) => shown(x) && x.end >= m0 && x.start <= mEnd).sort((a, b) => a.start - b.start);
    const byLd = S.group === 'ld';
    const rowKeys = byLd ? Object.keys(LD).filter((k) => !S.f.ld || k === S.f.ld) : ORDER.filter((k) => (!S.f.dest || P[k].dest === S.f.dest) && (!S.f.pkg || k === S.f.pkg));
    const todayIn = TODAY >= m0 && TODAY <= mEnd;
    let bi = 0;
    const cellsFor = (rk) => monthDays(S.m).map((d, i) => {
      const we = d.getUTCDay() % 6 === 0, t = same(d, TODAY);
      const can = d >= TODAY && !(rk === 'leh' && S.m === 11);
      return `<span class="gb-cell${we ? ' we' : ''}${t ? ' today' : ''}" style="grid-column:${i + 1}"${can ? ` data-add="${key(d)}"${byLd ? '' : ` data-pkg="${rk}"`} title="Add departure on ${f1(d)}"` : ''}></span>`;
    }).join('');
    const rows = rowKeys.map((rk) => {
      const items = inView.filter((x) => (byLd ? x.ld === rk : x.pk === rk));
      const lanes = [];
      const bars = items.map((x) => {
        let ln = lanes.findIndex((end) => end < x.start);
        if (ln < 0) { lanes.push(x.end); ln = lanes.length - 1; } else lanes[ln] = x.end;
        const c0 = Math.max(0, days(m0, x.start)), c1 = Math.min(n - 1, days(m0, x.end));
        const cutL = x.start < m0, cutR = x.end > mEnd, s = st(x);
        return `<button class="gb-bar st-${s.k}${cutL ? ' cut-l' : ''}${cutR ? ' cut-r' : ''}${fresh(x)}" style="grid-column:${c0 + 1} / span ${c1 - c0 + 1};grid-row:${ln + 1};--i:${bi}" ${depAttrs(x)}>
          <span class="t">${byLd ? `${SHORT[x.pk]} ` : ''}<span class="num">${x.sold}/${x.total}</span>${wdot(x)}<span class="w">${s.w}</span></span>${bar(x, bi++)}</button>`;
      }).join('');
      const starting = items.filter((x) => x.m === S.m);
      let label;
      if (byLd) {
        const away = sum(items, (x) => Math.min(n - 1, days(m0, x.end)) - Math.max(0, days(m0, x.start)) + 1);
        label = `<div class="gb-lw">${av(rk, 30)}<div><b>${LD[rk].name}</b><small>${items.length ? `${plural(items.length, 'trip', 'trips')} · ${away} days away` : 'Free all month'}</small>
          ${lanes.length > 1 ? '<span class="a-chip bad">Clash</span>' : items.length ? '<span class="a-chip ok">No clashes</span>' : ''}</div></div>`;
      } else {
        const p = P[rk], so = sum(starting, (x) => x.sold), to = sum(starting, (x) => x.total);
        label = `<b>${p.name}</b><small>${p.dest} · ${p.nights}N · ${SEATS[rk]} seats</small>
          <small class="num">${rk === 'leh' && S.m === 11 ? 'Closed for winter' : to ? `${so}/${to} sold · ${plural(starting.length, 'departure', 'departures')}` : 'No departures · click a day'}</small>`;
      }
      return `<div class="gb-row"><div class="gb-lab">${label}</div><div class="gb-track" style="grid-template-rows:repeat(${Math.max(1, lanes.length)}, 44px)">${cellsFor(rk)}${bars}</div></div>`;
    }).join('');
    const headDays = monthDays(S.m).map((d) => `<span class="${d.getUTCDay() % 6 === 0 ? 'we' : ''}${same(d, TODAY) ? ' today' : ''}"><small>${DN[d.getUTCDay()].slice(0, 2)}</small>${d.getUTCDate()}</span>`).join('');
    return `${todayIn ? '' : `<p class="gb-edge">${ICON.clock}Today, ${f1(TODAY)}, is ${TODAY < m0 ? `${days(TODAY, m0)} days before this month` : 'after this month'}.</p>`}
      <div class="cal-scroll"><div class="gb cal-view" style="--days:${n}"><div class="gb-row gb-headrow"><div class="gb-lab"><small>${byLd ? 'Trip leader' : 'Package'}</small></div><div class="gb-track gb-days">${headDays}</div></div>
      ${rows || '<div class="a-empty">No rows match these filters.</div>'}</div></div>`;
  }

  /* ---------- page bodies ---------- */
  const shell = (v, body) => TS.adminShell('Calendar', `<div class="cal cal-${v} anim${S.sel || S.add ? ' has-sel' : ''}" data-cal="${v}">${body()}</div>`);
  const BODY = {
    A: () => { const list = monthList(); return `${head()}${strip(list)}${filters()}<div class="a-split"><div class="a-card cal-card"><div class="a-card-b">${monthNav()}
      <div class="cal-desk">${gridA(list)}</div><div class="cal-phone cal-view">${agenda(list)}</div></div></div>${panel(list)}</div>`; },
    B: () => { const list = monthList(); const seg = `<div class="a-seg" role="group" aria-label="Rows"><button data-group="pkg" aria-pressed="${S.group === 'pkg'}">By package</button><button data-group="ld" aria-pressed="${S.group === 'ld'}">By leader</button></div>`;
      return `${head()}${strip(list)}${filters()}<div class="a-split"><div class="a-card cal-card"><div class="a-card-b">${monthNav(seg)}
      <div class="cal-desk">${gantt()}</div><div class="cal-phone cal-view">${agenda(list)}</div></div></div>${panel(list)}</div>`; },
    C: () => {
      const list = monthList();
      const cnt = { all: list.length, attn: list.filter((x) => why(x).length).length, wait: list.filter((x) => x.wl.length).length };
      const shownList = S.att === 'attn' ? list.filter((x) => why(x).length) : S.att === 'wait' ? list.filter((x) => x.wl.length) : list;
      const seg = `<div class="a-seg" role="group" aria-label="Show">${[['all', 'All'], ['attn', 'Needs attention'], ['wait', 'Waitlist']].map(([k, t]) => `<button data-att="${k}" aria-pressed="${S.att === k}">${t} <span class="num">${cnt[k]}</span></button>`).join('')}</div>`;
      return `${head()}${strip(list)}${filters(seg)}<div class="a-split"><div class="a-card cal-card"><div class="a-card-b">${monthNav()}
      <div class="cal-view">${agenda(shownList, S.att === 'all')}</div></div></div>${panel(list)}</div>`;
    },
  };

  /* ---------- interaction ---------- */
  function wire(site) {
    const root = site.querySelector('[data-cal]');
    if (!root) return;
    const body = BODY[root.dataset.cal];
    const vis = (sel) => [...root.querySelectorAll(sel)].find((el) => el.offsetParent !== null && !el.closest('.cal-panel')) || root.querySelector(sel);
    const phone = () => (root.closest('.site') || root).clientWidth <= 700;
    const paint = (o = {}) => {
      const f = document.activeElement;
      let fk = null;
      if (f && root.contains(f)) for (const a of ['data-dep', 'data-act', 'data-add', 'data-f', 'data-addf', 'data-tab', 'data-att', 'data-group']) if (f.hasAttribute(a)) { fk = `[${a}="${f.getAttribute(a)}"]`; break; }
      root.className = `cal cal-${root.dataset.cal}${o.anim ? ' anim' : ''}${o.slide ? ` slide-${o.slide}` : ''}${o.pin ? ' pin' : ''}${S.sel || S.add ? ' has-sel' : ''}`;
      root.innerHTML = body();
      S.fresh = null;
      const t = (o.focus && vis(o.focus)) || (fk && (fk.startsWith('[data-dep') && !f.closest('.cal-panel') ? vis(fk) : root.querySelector(fk)));
      if (t) t.focus({ preventScroll: true });
      if (o.pin && phone()) { const pn = root.querySelector('.cal-panel'); if (pn) pn.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
    };
    const closePanel = () => { const back = S.sel; S.sel = null; S.add = null; S.msg = ''; paint({ focus: back ? `[data-dep="${back}"]` : null }); };

    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-dep],[data-add],[data-act],[data-tab],[data-att],[data-group]');
      if (!t || !root.contains(t) || t.disabled) return;
      const d = t.dataset;
      if (d.dep) { const changed = S.sel !== d.dep || S.add; S.sel = d.dep; S.add = null; S.msg = ''; if (changed) S.tab = 'bk'; return paint({ pin: !!changed }); }
      if (d.add) { openAdd(d.add, d.pkg); return paint({ pin: true, focus: '[data-addf="pk"]' }); }
      if (d.tab) { S.tab = d.tab; return paint(); }
      if (d.att) { S.att = d.att; return paint({ anim: true }); }
      if (d.group) { S.group = d.group; return paint({ anim: true }); }
      const x = S.sel && byId(S.sel);
      switch (d.act) {
        case 'prev': case 'next': {
          const nm = S.m + (d.act === 'next' ? 1 : -1);
          if (nm < MIN_M || nm > MAX_M) return;
          S.m = nm; S.sel = null; S.add = null; S.msg = '';
          return paint({ anim: true, slide: d.act, focus: `[data-act="${d.act}"]:not([disabled])` });
        }
        case 'today': { const from = S.m; S.m = MIN_M; S.sel = null; S.add = null; S.msg = ''; return paint({ anim: from !== S.m, slide: from !== S.m ? 'prev' : '' }); }
        case 'close': case 'cancel': return closePanel();
        case 'reset': S.f = { dest: '', pkg: '', ld: '' }; return paint({ anim: true });
        case 'add-first': {
          const d0 = monthDays(S.m).find((dd) => dd >= TODAY && !DEPS.some((y) => same(y.start, dd))) || monthDays(S.m).find((dd) => dd >= TODAY);
          if (!d0) return;
          openAdd(key(d0));
          return paint({ pin: true, focus: '[data-addf="pk"]' });
        }
        case 'csv': S.msg = `departures-${MN[S.m].toLowerCase()}-2026.csv downloaded: ${plural(monthList().length, 'row', 'rows')} with seats, holds, waitlist, balances and readiness. ID numbers are never in the CSV.`; return paint();
        case 'manifest': S.msg = `Manifest opens as a printable page: ${plural(x.sold, 'traveller', 'travellers')} with ID, food and emergency contact. ID numbers are unmasked there only.`; return paint();
        case 'edit': S.msg = 'Edit departure opens seats, price, leader and meeting point. Moving a traveller to another date goes through Change date, not drag.'; return paint();
        case 'newbk': S.msg = `Counter booking opens with ${P[x.pk].name} on ${f1(x.start)} locked, ${plural(x.free, 'seat', 'seats')} free.`; return paint();
        case 'offer': {
          const w = offerTarget(x);
          if (!w) return;
          w.state = 'Offered · 24 h left'; w.cls = 'info';
          x.held += w.n; x.free -= w.n;
          x.bk.unshift({ ref: x.ref(), who: w.who, n: w.n, value: w.n * x.price, hold: 'Waitlist offer · 24 h left' });
          wlStates(x);
          S.tab = 'wl';
          S.msg = `Offer sent to ${w.who} (#${w.pos}, party of ${w.n}). The ${w.n === 1 ? 'seat is' : 'seats are'} held until ${f1(add(TODAY, 1))}, 4:40 pm IST; unclaimed, it moves to the next party.`;
          return paint({ focus: '[data-tab="wl"]' });
        }
        case 'create': {
          const a = S.add;
          if (!a || !a.ld) return;
          const dd = parse(a.day);
          const nx = build([dd.getUTCMonth(), dd.getUTCDate(), a.pk, a.ld, 0, 0, 0, 0, { price: Math.max(0, +a.price) || P[a.pk].from, total: Math.max(1, Math.min(60, +a.seats || SEATS[a.pk])), meet: a.meet || MEET[a.pk] }]);
          DEPS.push(nx);
          S.m = nx.m; S.add = null; S.sel = nx.id; S.fresh = nx.id; S.tab = 'bk';
          S.msg = `Created ${P[a.pk].name} on ${f1(nx.start)}. It's live on the package page and bookable now.`;
          return paint({ pin: true, focus: `[data-dep="${nx.id}"]` });
        }
        default:
      }
    });
    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.tagName !== 'SELECT') return;
      if (t.dataset.f) {
        S.f[t.dataset.f] = t.value;
        if (t.dataset.f === 'dest' && S.f.pkg && t.value && P[S.f.pkg].dest !== t.value) S.f.pkg = '';
        return paint({ anim: true });
      }
      if (t.dataset.addf && S.add) { S.add[t.dataset.addf] = t.value; if (t.dataset.addf !== 'ld') addDefaults(S.add, t.dataset.addf === 'day'); paint(); }
    });
    root.addEventListener('input', (e) => { const t = e.target; if (t.tagName === 'INPUT' && t.dataset.addf && S.add) S.add[t.dataset.addf] = t.value; });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && (S.sel || S.add)) { e.preventDefault(); return closePanel(); }
      const t = e.target.closest && e.target.closest('[data-day]');
      if (!t || !/^Arrow(Left|Right|Up|Down)$/.test(e.key)) return;
      const items = [...root.querySelectorAll('[data-dep][data-day]')].filter((el) => el.offsetParent !== null);
      const i = items.indexOf(t);
      let j = -1;
      if (e.key === 'ArrowRight') j = i + 1;
      else if (e.key === 'ArrowLeft') j = i - 1;
      else {
        const tgt = add(parse(t.dataset.day), e.key === 'ArrowDown' ? 7 : -7);
        if (e.key === 'ArrowDown') j = items.findIndex((el) => parse(el.dataset.day) >= tgt);
        else for (let k = items.length - 1; k >= 0; k--) if (parse(items[k].dataset.day) <= tgt) { j = k; break; }
      }
      if (items[j]) { e.preventDefault(); items[j].focus(); }
    });
  }

  /* ---------- styles (layout only; chrome comes from the admin kit) ---------- */
  const css = `
  .cal { display: grid; gap: 16px; min-width: 0; --st-full: var(--pri); --st-hot: var(--ok); --st-open: #9A6412; --st-low: #B42318; }
  .cal .st-full { --c: var(--st-full); } .cal .st-hot { --c: var(--st-hot); } .cal .st-open { --c: var(--st-open); } .cal .st-low { --c: var(--st-low); }
  .cal-mute { color: var(--mute); } .cal-small { font-size: 12.5px; }
  .cal-filters > .ic { color: var(--mute); width: 16px; height: 16px; }
  .cal-count { font-size: 12.5px; color: var(--mute); font-weight: 600; margin-left: auto; } .cal-count b { color: var(--ink); }
  .cal-strip .a-meter { height: 6px; margin: 2px 0 1px; }
  .cal-card { container: calcard / inline-size; overflow: hidden; }
  .cal-nav { display: flex; align-items: center; gap: 10px 14px; flex-wrap: wrap; margin-bottom: 12px; }
  .cal-mnav { display: flex; align-items: center; gap: 6px; }
  .cal-mnav .a-btn.sm { padding: 6px 8px; } .cal-mnav .a-btn .ic { width: 16px; height: 16px; }
  .cal-mon { font-size: 18px; min-width: 8.6em; text-align: center; }
  .cal-now { font-size: 12.5px; color: var(--mute); font-weight: 700; display: inline-flex; gap: 7px; align-items: center; }
  .cal-now::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--act); box-shadow: 0 0 0 3px color-mix(in srgb, var(--act) 30%, transparent); }
  .cal-leg { margin-left: auto; display: flex; gap: 4px 12px; flex-wrap: wrap; font-size: 11.5px; color: var(--mute); font-weight: 700; }
  .cal-leg span { display: inline-flex; gap: 5px; align-items: center; }
  .cal-leg i.k { width: 12px; height: 8px; border-radius: 3px; background: var(--c); }
  .cal-leg i.hh { width: 12px; height: 8px; border-radius: 3px; background: repeating-linear-gradient(135deg, var(--mute) 0 2px, #fff 2px 4px); }
  .cal-wl { display: inline-grid; place-items: center; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 99px; background: var(--act); color: var(--ink); font-size: 10px; font-weight: 800; line-height: 1; flex: none; }

  /* fill bar: sold solid, held hatched, free = track */
  .cal-bar { position: relative; display: block; height: 6px; border-radius: 99px; background: color-mix(in srgb, var(--c) 14%, #E6EBEF); overflow: hidden; }
  .cal-bar i { position: absolute; top: 0; bottom: 0; left: 0; width: var(--s); background: var(--c); border-radius: 99px; transform-origin: left; }
  .cal-bar i.h { left: var(--s); width: var(--h); border-radius: 0; background: repeating-linear-gradient(135deg, var(--c) 0 2px, color-mix(in srgb, var(--c) 25%, #fff) 2px 4px); }
  .cal.anim .cal-bar i { animation: cal-grow .9s var(--ease) both; animation-delay: calc(var(--i, 0) * 28ms + 120ms); }
  .cal.anim .cal-bar i.h { animation-delay: calc(var(--i, 0) * 28ms + 480ms); }
  .cal.anim .a-meter::before, .cal.anim .a-meter::after { animation: cal-grow 1s var(--ease) both .15s; transform-origin: left; }
  @keyframes cal-grow { from { transform: scaleX(0); } }
  .cal.slide-next .cal-view, .cal.slide-next .cal-mon { animation: cal-in-r .5s var(--ease) both; }
  .cal.slide-prev .cal-view, .cal.slide-prev .cal-mon { animation: cal-in-l .5s var(--ease) both; }
  @keyframes cal-in-r { from { opacity: 0; transform: translateX(36px); } }
  @keyframes cal-in-l { from { opacity: 0; transform: translateX(-36px); } }
  .cal.pin .cal-panel { animation: cal-pin .4s var(--ease) both; }
  @keyframes cal-pin { from { opacity: 0; transform: translateX(14px); } }
  .cal .fresh { animation: cal-pop .7s var(--ease) both; }
  @keyframes cal-pop { 0% { transform: scale(.8); opacity: 0; } 60% { transform: scale(1.04); opacity: 1; } }
  .cal-scroll { overflow-x: auto; overscroll-behavior-x: contain; }

  /* A · month grid */
  .ga-grid { min-width: 620px; border: 1px solid var(--a-line); border-radius: min(var(--a-r), 12px); overflow: hidden; background: var(--a-surf); }
  .ga-wd, .ga-wk { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
  .ga-wd span { font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--a-th); padding: 7px 8px; background: var(--bg2); border-bottom: 1px solid var(--a-line); }
  .ga-c { min-height: 116px; padding: 6px; border-right: 1px solid var(--a-line); border-bottom: 1px solid var(--a-line); display: flex; flex-direction: column; gap: 5px; position: relative; min-width: 0; }
  .ga-wk .ga-c:last-child { border-right: 0; } .ga-wk:last-child .ga-c { border-bottom: 0; }
  .ga-c.we { background: color-mix(in srgb, var(--bg2) 60%, var(--a-surf)); }
  .ga-c.out { background: repeating-linear-gradient(135deg, transparent 0 7px, color-mix(in srgb, var(--a-line) 70%, transparent) 7px 8px); }
  .ga-c.out .ga-dn, .ga-c.past .ga-dn { color: #8995A0; }
  .ga-c.today { box-shadow: inset 0 0 0 2px var(--act); }
  .ga-dn { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 800; min-height: 22px; }
  .ga-dn em { font-style: normal; font-size: 10px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; background: var(--act); color: var(--ink); border-radius: 99px; padding: 1px 7px; }
  .ga-add { margin-left: auto; border: 0; background: none; color: var(--mute); width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center; cursor: pointer; opacity: 0; transition: opacity .2s; }
  .ga-add .ic { width: 14px; height: 14px; }
  .ga-c:hover .ga-add { opacity: 1; } .ga-add:hover { background: var(--pri-soft); color: var(--pri); }
  .ga-empty { flex: 1; min-height: 56px; border: 1.5px dashed transparent; border-radius: 8px; background: none; font: 700 11.5px "DM Sans", sans-serif; color: var(--pri); cursor: pointer; opacity: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; transition: opacity .2s, background .2s; }
  .ga-empty .ic { width: 16px; height: 16px; }
  .ga-c:hover .ga-empty { opacity: 1; border-color: color-mix(in srgb, var(--pri) 35%, transparent); background: var(--pri-soft); }
  .ga-chip { display: grid; gap: 4px; text-align: left; width: 100%; font: inherit; color: var(--ink); cursor: pointer; min-width: 0;
    border: 1px solid color-mix(in srgb, var(--c) 26%, var(--a-line)); border-left: 3px solid var(--c); background: color-mix(in srgb, var(--c) 7%, var(--a-surf));
    border-radius: 7px; padding: 5px 6px 5px 7px; transition: transform .2s var(--ease), box-shadow .2s; }
  .ga-chip:hover { transform: translateY(-1px); box-shadow: 0 6px 14px -8px color-mix(in srgb, var(--c) 70%, transparent); }
  .ga-chip .t { display: flex; align-items: center; gap: 4px; font-size: 12px; line-height: 1.2; }
  .ga-chip .t b { font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
  .ga-chip .n { display: flex; justify-content: space-between; gap: 2px 4px; flex-wrap: wrap; font-size: 11px; font-weight: 700; line-height: 1.2; }
  .ga-chip .w { color: var(--c); }
  .ga-chip[aria-pressed="true"], .gb-bar[aria-pressed="true"] { background: var(--c); border-color: var(--c); color: #fff; box-shadow: 0 8px 18px -8px color-mix(in srgb, var(--c) 80%, transparent); }
  .ga-chip[aria-pressed="true"] .w, .gb-bar[aria-pressed="true"] .w { color: #fff; }
  .ga-chip[aria-pressed="true"] .cal-bar, .gb-bar[aria-pressed="true"] .cal-bar { background: rgba(255,255,255,.28); }
  .ga-chip[aria-pressed="true"] .cal-bar i, .gb-bar[aria-pressed="true"] .cal-bar i { background: #fff; }
  .ga-chip[aria-pressed="true"] .cal-bar i.h, .gb-bar[aria-pressed="true"] .cal-bar i.h { background: repeating-linear-gradient(135deg, #fff 0 2px, rgba(255,255,255,.35) 2px 4px); }

  /* B · timeline */
  .gb { --col: 34px; --lab: 196px; min-width: max-content; font-size: 12.5px; }
  .gb-row { display: grid; grid-template-columns: var(--lab) max-content; border-bottom: 1px solid var(--a-line); }
  .gb-row:last-child { border-bottom: 0; }
  .gb-lab { position: sticky; left: 0; z-index: 3; background: var(--a-surf); padding: 8px 12px 8px 0; border-right: 1px solid var(--a-line); display: grid; gap: 1px; align-content: center; }
  .gb-lab b { font-size: 13px; line-height: 1.2; } .gb-lab small { color: var(--mute); font-size: 11.5px; font-weight: 600; }
  .gb-lab .a-chip { justify-self: start; margin-top: 3px; }
  .gb-lw { display: flex; gap: 9px; align-items: center; } .gb-lw > div { display: grid; gap: 1px; }
  .gb-track { display: grid; grid-template-columns: repeat(var(--days), var(--col)); padding: 6px 0; }
  .gb-cell { grid-row: 1 / -1; border-left: 1px solid color-mix(in srgb, var(--a-line) 70%, transparent); }
  .gb-cell.we { background: color-mix(in srgb, var(--bg2) 75%, transparent); }
  .gb-cell[data-add] { cursor: copy; } .gb-cell[data-add]:hover { background: var(--pri-soft); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--pri) 35%, transparent); }
  .gb-cell.today { background: color-mix(in srgb, var(--act) 20%, transparent); box-shadow: inset 2px 0 0 var(--act); }
  .gb-days { padding: 4px 0; }
  .gb-days span { display: grid; justify-items: center; font-size: 12px; font-weight: 800; line-height: 1.15; padding: 3px 0; font-variant-numeric: tabular-nums; }
  .gb-days span small { font-size: 10px; color: var(--mute); font-weight: 700; }
  .gb-days span.we { color: var(--warn); } .gb-days span.today { background: var(--act); color: var(--ink); border-radius: 8px; }
  .gb-headrow .gb-lab { align-content: end; } .gb-headrow .gb-lab small { font-weight: 800; letter-spacing: .08em; text-transform: uppercase; font-size: 10.5px; }
  .gb-bar { z-index: 1; margin: 3px 2px; min-width: 0; overflow: hidden; display: grid; align-content: center; gap: 4px; padding: 3px 7px; text-align: left; font: inherit; color: var(--ink); cursor: pointer;
    border: 1px solid color-mix(in srgb, var(--c) 30%, var(--a-line)); border-left: 3px solid var(--c); border-radius: 8px; background: color-mix(in srgb, var(--c) 9%, var(--a-surf)); transition: box-shadow .2s, transform .2s var(--ease); }
  .gb-bar:hover { transform: translateY(-1px); box-shadow: 0 6px 14px -8px color-mix(in srgb, var(--c) 70%, transparent); }
  .gb-bar .t { display: flex; gap: 5px; align-items: center; font-weight: 800; font-size: 11.5px; white-space: nowrap; }
  .gb-bar .w { color: var(--c); font-weight: 700; overflow: hidden; text-overflow: ellipsis; }
  .gb-bar.cut-r { margin-right: 0; border-top-right-radius: 0; border-bottom-right-radius: 0; border-right: 2px dashed var(--c); }
  .gb-bar.cut-l { margin-left: 0; border-top-left-radius: 0; border-bottom-left-radius: 0; border-left-style: dashed; }
  .cal.anim .gb-bar { animation: cal-sweep .7s var(--ease) both; animation-delay: calc(var(--i, 0) * 30ms); }
  @keyframes cal-sweep { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
  .gb-edge { display: flex; gap: 7px; align-items: center; font-size: 12.5px; font-weight: 600; color: var(--warn); margin-bottom: 8px; } .gb-edge .ic { width: 15px; height: 15px; }

  /* agenda (C, and phone for A/B) */
  .cal-phone { display: none; }
  .ag { display: grid; gap: 20px; }
  .ag-wk { display: grid; gap: 8px; }
  .ag-h { display: flex; align-items: baseline; gap: 4px 12px; flex-wrap: wrap; padding-bottom: 6px; border-bottom: 1px solid var(--a-line); }
  .ag-h h3 { font-size: 15px; } .ag-h .num { color: var(--mute); font-size: 12.5px; font-weight: 600; margin-left: auto; }
  .ag-wk.now .ag-h h3 { color: var(--warn); }
  .ag-today { display: flex; align-items: center; gap: 8px; font-size: 11.5px; font-weight: 800; color: var(--warn); letter-spacing: .04em; text-transform: uppercase; }
  .ag-today::after { content: ""; flex: 1; height: 2px; border-radius: 2px; background: var(--act); }
  .ag-row { display: grid; grid-template-columns: 52px minmax(170px, 1.2fr) minmax(190px, 1.3fr) minmax(0, 1.3fr); gap: 14px; align-items: center; width: 100%; text-align: left;
    font: inherit; color: inherit; background: var(--a-surf); border: 1px solid var(--a-line); border-left: 4px solid var(--c); border-radius: min(var(--a-r), 12px);
    padding: 9px 12px 9px 9px; cursor: pointer; transition: border-color .2s, box-shadow .2s, transform .2s var(--ease); }
  .ag-row:hover { border-color: color-mix(in srgb, var(--c) 45%, var(--a-line)); border-left-color: var(--c); transform: translateX(2px); }
  .ag-row[aria-pressed="true"] { background: color-mix(in srgb, var(--c) 6%, var(--a-surf)); box-shadow: 0 0 0 2px var(--c); }
  .ag-date { display: grid; justify-items: center; line-height: 1.05; background: var(--bg2); border-radius: 10px; padding: 6px 0; }
  .ag-date b { font-size: 21px; letter-spacing: -.03em; }
  .ag-date small { font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--mute); }
  .ag-main { min-width: 0; } .ag-main > b { display: block; font-size: 14.5px; line-height: 1.25; }
  .ag-meta { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--mute); font-weight: 600; margin-top: 4px; flex-wrap: wrap; }
  .ag-meta .ts-av { box-shadow: none; }
  .ag-cap { min-width: 0; }
  .ag-seats { display: flex; gap: 2px; height: 14px; }
  .ag-seats i { flex: 1 1 0; max-width: 13px; border-radius: 3px; background: #E3E8ED; transform-origin: bottom; }
  .ag-seats i.s { background: var(--c); }
  .ag-seats i.h { background: repeating-linear-gradient(135deg, var(--c) 0 2px, color-mix(in srgb, var(--c) 25%, #fff) 2px 4px); }
  .cal.anim .ag-seats i:not(.f) { animation: cal-seat .45s var(--ease) both; animation-delay: calc(var(--k) * 16ms + var(--i) * 45ms + 100ms); }
  @keyframes cal-seat { from { transform: scaleY(0); opacity: 0; } }
  .ag-capn { display: block; font-size: 12.5px; color: var(--mute); font-weight: 600; margin-top: 5px; } .ag-capn b { color: var(--ink); }
  .ag-flags { display: flex; flex-wrap: wrap; gap: 5px; justify-content: flex-end; }
  .ag-none { font-size: 13px; color: var(--mute); padding: 4px 0; }
  .ag-free { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 11.5px; color: var(--mute); font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
  .ag-free .a-btn { padding: 4px 9px 4px 7px; font-size: 12px; text-transform: none; letter-spacing: 0; } .ag-free .a-btn .ic { width: 13px; height: 13px; }
  @container calcard (max-width: 760px) {
    .ag-row { grid-template-columns: 48px minmax(0, 1fr) minmax(0, 1fr); gap: 8px 12px; }
    .ag-flags { grid-column: 2 / -1; justify-content: flex-start; }
  }
  @container calcard (max-width: 520px) {
    .ag-row { grid-template-columns: 46px minmax(0, 1fr); }
    .ag-cap, .ag-flags { grid-column: 2; }
    .ag-h .num { margin-left: 0; flex-basis: 100%; }
  }

  /* side panel */
  .cal-panel h2 { font-size: 19px; }
  .cal-panel h3 { font-size: 11.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--a-th); font-weight: 800; }
  .cal-ph-top { display: flex; align-items: center; gap: 8px; } .cal-ph-top .a-btn { margin-left: auto; padding: 5px; } .cal-ph-top .a-btn .ic { width: 16px; height: 16px; }
  .cal-seats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .cal-seats b { display: block; font-size: 22px; font-weight: 800; letter-spacing: -.03em; line-height: 1.1; }
  .cal-seats span { font-size: 12px; color: var(--mute); font-weight: 600; }
  .cal-rd { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; } .cal-rd b { font-size: 18px; letter-spacing: -.02em; }
  .cal-who, .cal-meet { display: flex; gap: 10px; align-items: center; font-size: 13.5px; }
  .cal-who small, .cal-meet small { display: block; color: var(--mute); font-size: 12.5px; font-weight: 500; }
  .cal-meet .ic { color: var(--pri); width: 20px; height: 20px; margin: 0 10px 0 10px; }
  .cal-acts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .cal-acts .a-btn { justify-content: center; white-space: normal; text-align: center; } .cal-acts .wide { grid-column: 1 / -1; }
  .cal-why { font-size: 12px; color: var(--mute); }
  .cal-list { list-style: none; margin: 0; padding: 0; max-height: 330px; overflow: auto; }
  .cal-list li { display: flex; justify-content: space-between; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--a-line); font-size: 13px; }
  .cal-list li:last-child { border-bottom: 0; }
  .cal-list li > div:first-child { min-width: 0; } .cal-list li > div:first-child span { display: block; color: var(--mute); font-size: 12px; }
  .cal-list .r { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex: none; max-width: 58%; }
  .cal-list .a-chip { white-space: normal; text-align: right; }
  .cal-att { display: grid; gap: 6px; }
  .cal-att button { display: grid; grid-template-columns: 38px minmax(0, 1fr); gap: 10px; align-items: center; text-align: left; font: inherit; color: inherit; cursor: pointer;
    border: 1px solid var(--a-line); border-left: 3px solid var(--c); background: var(--a-surf); border-radius: 10px; padding: 8px 10px 8px 8px; transition: border-color .2s; }
  .cal-att button:hover { border-color: var(--c); }
  .cal-att .dd { display: grid; justify-items: center; line-height: 1.05; } .cal-att .dd b { font-size: 18px; } .cal-att .dd small { font-size: 10px; font-weight: 800; text-transform: uppercase; color: var(--mute); letter-spacing: .06em; }
  .cal-att b { font-size: 13.5px; } .cal-att .rs { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
  .cal-mix { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 12px; font-size: 13px; font-weight: 600; color: var(--mute); }
  .cal-mix span { display: flex; align-items: center; gap: 7px; } .cal-mix b { color: var(--ink); font-size: 15px; }
  .cal-mix i { width: 10px; height: 10px; border-radius: 3px; background: var(--c); }
  .cal-panel .a-tabs button { padding: 7px 10px 9px; }

  @container site (max-width: 700px) {
    .cal .cal-desk { display: none; } .cal .cal-phone { display: block; }
    .cal .cal-leg { display: none; }
    .cal .cal-mon { min-width: 0; font-size: 16px; }
    .cal .cal-nav { gap: 8px; } .cal .cal-now { flex-basis: 100%; }
    .cal .a-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .cal .a-kpi { padding: 10px 12px; } .cal .a-kpi .v { font-size: 20px; }
    .cal .cal-filters .a-select { flex: 1 1 140px; min-width: 0; }
    .cal .cal-filters .a-seg { flex-basis: 100%; overflow-x: auto; }
    .cal .cal-count { margin-left: 0; flex-basis: 100%; }
    .cal.has-sel .a-split > .cal-panel { order: -1; }
    .cal .cal-acts { grid-template-columns: 1fr; }
  }
  @media (prefers-reduced-motion: reduce) {
    .cal *, .cal *::before, .cal *::after { animation: none !important; transition: none !important; }
  }`;

  const V = (id, name, note, tradeoff) => ({ id, name, note, tradeoff, render: () => shell(id, BODY[id]), mount: (site) => wire(site) });
  TS.register({
    id: 'calendar', label: 'Calendar', group: 'v2.5 · owner', admin: true, css,
    variants: [
      V('A', 'Month grid',
        'A classic Sunday-first month. Each departure is a chip coloured by how full it is, with a sold / held / free bar, the seat count, a status word and an amber waitlist count. The right panel lists what needs you this month until you pick a departure; then it shows seats, price, revenue, balances, readiness, the leader and meeting point, bookings and the waitlist, with Manifest, Edit, Offer seats and New booking. Hover an empty day to add a departure there (the Add departure button does the same by keyboard). On a phone the grid becomes a week-by-week agenda and the panel opens above it.',
        'The most familiar shape and easiest to scan by date, but cells are narrow beside the panel, so a chip only carries a short name and a count.'),
      V('B', 'Package timeline',
        'Rows are packages, or leaders with the Group by switch, and columns are the days of the month, so every departure is a bar as long as the trip. Overlapping Kasol weekends stack into lanes, trips that cross the month edge end in a dashed cut, and the leader view shows who is on the road and flags any clash. Click an empty cell in a row to add that package on that day. Same side panel as A; on a phone it becomes the same week agenda.',
        'Best for trip length, leader load and gaps per package, but it scrolls sideways on a laptop once the panel is open.'),
      V('C', 'Ops board',
        'A week-by-week board built for the morning check. Each departure is a full-width row with a seat-by-seat capacity bar, a status word, waitlist, missing details and readiness, and each week ends with its open days as one-tap Add buttons. The Needs attention switch cuts the month to departures with low fill, missing details, balances due soon or free seats the waitlist can take. Same side panel; on a phone the rows stack into a two-line list.',
        'Richest per-departure detail and the most actionable, but you lose the at-a-glance calendar shape of the month.'),
    ],
  });
})();
