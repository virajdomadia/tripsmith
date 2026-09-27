/* Admin redesign · round 3 interiors for Coupons and Sign in (layouts B, C, D on top of admin-catalog.js's A).
   Chrome stays admin style A (Ink rail). Coupon rules follow docs/07-plan.md row B15 as shipped:
   flat ₹ or 1–90 % with an optional ₹ cap · valid from/to · minimum on the total after any deal · total-use limit ·
   one use per email · every package or chosen ones · on/off · a use counts on capture, a live hold reserves one ·
   once in use, code/type/amount lock and delete becomes "switch it off". v2.5: counter use (R56), discounts report (R55).
   CSS prefixes: .ad-cp- (coupons) and .ad-li- (sign in). */
(() => {
  const TS = window.TS;
  const { inr, lakh, esc, ICON } = TS;
  const V25 = '<span class="a-chip pri ad-v25" title="New in v2.5">v2.5</span>';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmt = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${+d} ${MON[+m - 1]} ${y}`; };
  const T0 = Date.UTC(2026, 8, 27);
  const dayN = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - T0) / 864e5); };
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const n0 = (n) => Number(n).toLocaleString('en-IN');
  const each = (root, sel, ev, fn) => root.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, (e) => fn(el, e)));
  const sw = (on, label, attr = '') =>
    `<button type="button" class="ad-cp-sw" role="switch" aria-checked="${on}" aria-label="${esc(label)}" ${attr}><i></i><span>${on ? 'On' : 'Off'}</span></button>`;
  const copyTxt = (t) => { try { navigator.clipboard.writeText(t); } catch (_) {} };

  /* ---------- the catalogue subset (same seed as admin-catalog.js; price = per traveller, first open departure) ---------- */
  const PKM = {
    kasol: { name: 'Kasol Riverside Weekend', img: 'img/kasol-1.jpg', price: 5999, dep: '6 Nov 2026' },
    oldgoa: { name: 'Old Goa & Dudhsagar Weekend', img: 'img/goa-6.jpg', price: 6499, dep: '6 Nov 2026' },
    munnar: { name: 'Munnar & Alleppey Houseboat', img: 'img/munnar-2.jpg', price: 22999, dep: '13 Nov 2026', deal: 2000 },
    northgoa: { name: 'North Goa Beaches', img: 'img/goa-3.jpg', price: 14999, dep: '20 Nov 2026' },
    jaipur: { name: 'Jaipur · Jodhpur · Udaipur', img: 'img/jaipur-1.jpg', price: 27999, dep: '28 Nov 2026' },
    jais: { name: 'Jaisalmer Desert Nights', img: 'img/rajasthan-1.jpg', price: 21999, dep: '12 Dec 2026' },
    hav: { name: 'Havelock Honeymoon', img: 'img/andaman-1.jpg', price: 37999, dep: '19 Dec 2026' },
    lehnp: { name: 'Leh · Nubra · Pangong', img: 'img/ladakh-1.jpg', price: 31999, dep: '12 Jun 2027' },
    leht: { name: 'Leh & Turtuk', img: 'img/nubra-1.jpg', price: 29499, dep: '26 Jun 2027' },
  };
  const DEAL_END = '2026-10-31';

  /* ---------- coupons (same five as the first pass, plus what each one did) ----------
     weekly = uses per week, weeks starting 3 Aug … 21 Sep 2026 */
  const WEEKS = ['3 Aug', '10 Aug', '17 Aug', '24 Aug', '31 Aug', '7 Sep', '14 Sep', '21 Sep'];
  const CPS = [
    { code: 'WELCOME10', kind: 'percent', val: 10, cap: 1000, min: 0, all: true, pkgs: [], start: '2026-09-15', end: '2027-09-14', uses: 37, limit: 1000, holds: 2, state: 'active', on: true,
      given: 34390, rev: 1148200, web: 32, ctr: 5, weekly: [0, 0, 0, 0, 0, 0, 15, 22],
      top: [['kasol', 12], ['northgoa', 9], ['munnar', 7], ['jaipur', 5]], more: 4,
      rec: [['Today 17:52', 'Website', 'asha.rao@customer.in · Kasol Riverside Weekend · 2 travellers · <b>−₹1,000</b>'],
        ['Today 12:10', 'In checkout', 'rahul.verma@customer.in · North Goa Beaches · holding one use until paid'],
        ['26 Sep 19:31', 'Counter', 'Walk-in, Farhan Qureshi · Jaipur · Jodhpur · Udaipur · <b>−₹1,000</b>'],
        ['26 Sep 10:05', 'Website', 'neha.pillai@customer.in · Munnar & Alleppey Houseboat · <b>−₹1,000</b>']] },
    { code: 'DIWALI1500', kind: 'flat', val: 1500, cap: 0, min: 30000, all: false, pkgs: ['jaipur', 'jais'], start: '2026-10-15', end: '2026-11-08', uses: 0, limit: 200, holds: 0, state: 'scheduled', on: true,
      given: 0, rev: 0, web: 0, ctr: 0, weekly: [0, 0, 0, 0, 0, 0, 0, 0], top: [], more: 0, rec: [] },
    { code: 'LADAKH2027', kind: 'flat', val: 2000, cap: 0, min: 0, all: false, pkgs: ['lehnp', 'leht'], start: '2026-09-01', end: '2027-03-31', uses: 4, limit: 100, holds: 0, state: 'paused', on: false,
      given: 8000, rev: 247992, web: 4, ctr: 0, weekly: [0, 0, 0, 0, 1, 2, 1, 0], top: [['lehnp', 3], ['leht', 1]], more: 0,
      rec: [['18 Sep 21:40', 'Website', 'karthik.iyer@customer.in · Leh · Nubra · Pangong · <b>−₹2,000</b>'],
        ['12 Sep 09:15', 'Website', 'ishita.chawla@customer.in · Leh & Turtuk · <b>−₹2,000</b>'],
        ['9 Sep 18:02', 'Website', 'arjun.mehta@customer.in · Leh · Nubra · Pangong · <b>−₹2,000</b>']] },
    { code: 'HONEYMOON5', kind: 'percent', val: 5, cap: 2500, min: 0, all: false, pkgs: ['hav', 'munnar'], start: '2026-08-01', end: '', uses: 25, limit: 25, holds: 0, state: 'used_up', on: true,
      given: 61300, rev: 1718900, web: 21, ctr: 4, weekly: [3, 4, 5, 4, 3, 4, 2, 0], top: [['hav', 21], ['munnar', 4]], more: 0,
      rec: [['16 Sep 20:48', 'Website', 'priya.raghavan@customer.in · Havelock Honeymoon · <b>−₹2,500</b>'],
        ['15 Sep 11:30', 'Counter', 'Walk-in, Kavya Iyer · Munnar & Alleppey Houseboat · <b>−₹2,099</b>'],
        ['12 Sep 16:22', 'Website', 'ananya.bose@customer.in · Havelock Honeymoon · <b>−₹2,500</b>']] },
    { code: 'MONSOON750', kind: 'flat', val: 750, cap: 0, min: 15000, all: true, pkgs: [], start: '2026-07-01', end: '2026-08-31', uses: 18, limit: 0, holds: 0, state: 'expired', on: true,
      given: 13500, rev: 386400, web: 18, ctr: 0, weekly: [5, 4, 6, 3, 0, 0, 0, 0], top: [['northgoa', 7], ['oldgoa', 6], ['kasol', 5]], more: 0,
      rec: [['30 Aug 22:10', 'Website', 'manoj.tiwari@customer.in · North Goa Beaches · <b>−₹750</b>'],
        ['28 Aug 14:44', 'Website', 'lakshmi.n@customer.in · Old Goa & Dudhsagar Weekend · <b>−₹750</b>'],
        ['25 Aug 09:05', 'Website', 'gaurav.bhatia@customer.in · Kasol Riverside Weekend · <b>−₹750</b>']] },
  ];
  const ST = { active: ['ok', 'Active'], paused: ['mute', 'Paused'], scheduled: ['info', 'Starts later'], expired: ['mute', 'Expired'], used_up: ['warn', 'Used up'], draft: ['pri', 'Draft'] };
  const find = (code) => CPS.find((c) => c.code === code) || CPS[0];
  const inUse = (c) => c.uses > 0 || c.holds > 0;
  const terms = (c) => (c.kind === 'flat' ? `${inr(+c.val || 0)} off` : `${+c.val || 0} % off${+c.cap ? `, up to ${inr(+c.cap)}` : ''}`);
  const trips = (c) => (c.all ? 'Every package' : c.pkgs.length ? c.pkgs.map((id) => PKM[id].name).join(', ') : 'No packages chosen yet');
  const dates = (c) => (c.end ? `${fmt(c.start)} – ${fmt(c.end)}` : `From ${fmt(c.start)}, no end`);
  const flip = (c) => {
    c.on = !c.on;
    if (c.state === 'active' && !c.on) c.state = 'paused'; else if (c.state === 'paused' && c.on) c.state = 'active';
  };
  const when = (c) => {
    if (c.state === 'scheduled') return `Opens in ${dayN(c.start)} days · ${fmt(c.start)}`;
    if (c.state === 'expired') return `Ended ${fmt(c.end)}`;
    if (c.state === 'used_up') return `All ${c.limit} uses taken`;
    return c.end ? `Ends ${fmt(c.end)} · ${dayN(c.end)} days left` : 'No end date';
  };
  const spark = (a, w = 112, h = 30) => {
    const mx = Math.max(1, ...a), step = w / (a.length - 1);
    const pts = a.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / mx) * (h - 6)).toFixed(1)}`);
    return `<svg class="ad-cp-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polygon points="0,${h} ${pts.join(' ')} ${w},${h}"/><polyline points="${pts.join(' ')}"/></svg>`;
  };
  const tot = () => CPS.reduce((a, c) => ({ u: a.u + c.uses, g: a.g + c.given, r: a.r + c.rev, h: a.h + c.holds }), { u: 0, g: 0, r: 0, h: 0 });

  /* =====================================================================
     COUPONS · B · Campaign board — each code is a ticket with what it earned
     ===================================================================== */
  const cb = { sel: 'WELCOME10', copied: '' };
  const LANES = [['Running now', ['active'], 'customers can use these today'], ['Starts later', ['scheduled'], 'switched on, waiting for the start date'],
    ['Paused', ['paused'], 'switched off by you'], ['Ended', ['used_up', 'expired'], 'past the last day or out of uses']];
  function cbCard(c) {
    const [tone, label] = ST[c.state];
    const ended = c.state === 'expired' || c.state === 'used_up';
    const soon = c.end && (c.state === 'active' || c.state === 'scheduled') && dayN(c.end) <= 45;
    const use = c.limit ? `<b class="num">${c.uses}</b> of ${n0(c.limit)} used${c.holds ? ` · <span class="hold">${c.holds} in checkout</span>` : ''}` : `<b class="num">${c.uses}</b> used · no limit`;
    return `<article class="ad-cp-tk${c.code === cb.sel ? ' sel' : ''}${ended ? ' end' : ''}" data-cb="${c.code}" tabindex="0" aria-label="${c.code}, ${label}. Open what it did">
      <div class="stub"><div class="r1"><b class="ad-cp-code big">${c.code}</b>
        <button type="button" class="ad-cp-copy" data-copy="${c.code}" aria-label="Copy ${c.code}">${ICON.copy}<span>${cb.copied === c.code ? 'Copied' : 'Copy'}</span></button></div>
        <p class="terms">${terms(c)}${c.min ? ` <small>on ${inr(c.min)} or more</small>` : ''}</p>
        <p class="trips">${esc(trips(c))}</p></div>
      <div class="perf" aria-hidden="true"></div>
      <dl class="st"><div><dt>Bookings</dt><dd class="num">${c.uses}</dd></div><div><dt>Given back</dt><dd class="num">${inr(c.given)}</dd></div>
        <div><dt>Booked per ₹1</dt><dd class="num">${c.given ? inr(Math.round(c.rev / c.given)) : '—'}</dd></div></dl>
      <div class="use"><div class="m">${c.limit ? `<span class="a-meter" style="--v:${pct(c.uses, c.limit)}%;--h:${pct(c.holds, c.limit)}%" aria-hidden="true"></span>` : ''}<span class="cap">${use}</span></div>${spark(c.weekly)}</div>
      <div class="ft"><span class="a-chip ${tone}">${label}</span>${soon ? '<span class="a-chip warn">Ends soon</span>' : ''}<span class="when">${when(c)}</span>${sw(c.on, `${c.code} on`, `data-cbon="${c.code}"`)}</div>
    </article>`;
  }
  function cbIns(c) {
    const ch = c.web + c.ctr, mx = Math.max(1, ...c.top.map((t) => t[1]));
    const body = c.uses ? `<div class="cols">
        <div class="col"><h4>Where the uses came from</h4>
          <div class="ad-cp-chbar" role="img" aria-label="${c.web} on the website, ${c.ctr} at the counter"><i style="--w:${pct(c.web, ch)}%"></i></div>
          <dl class="a-kv"><div><dt><span class="ad-cp-key w"></span>Website checkout</dt><dd>${c.web}</dd></div><div><dt><span class="ad-cp-key c"></span>Booking desk counter ${V25}</dt><dd>${c.ctr}</dd></div>
            <div><dt>Bookings value, after the code</dt><dd>${lakh(c.rev)}</dd></div><div><dt>Average given back</dt><dd>${inr(Math.round(c.given / c.uses))}</dd></div></dl></div>
        <div class="col"><h4>Trips it sold</h4><ol class="ad-cp-tops">${c.top.map(([id, n]) => `<li><span class="ph"><img src="${PKM[id].img}" alt="" loading="lazy"></span>
            <span class="nm">${esc(PKM[id].name)}<span class="bar" style="--w:${pct(n, mx)}%" aria-hidden="true"></span></span><b class="num">${n}</b></li>`).join('')}</ol>
          ${c.more ? `<p class="ad-cp-mute">+${c.more} on other trips</p>` : ''}</div>
        <div class="col"><h4>Latest uses</h4><div class="a-tl">${c.rec.map(([t, w, x]) => `<div class="a-tl-i"><span class="t">${t}</span><span class="w">${w}</span><span class="x">${x}</span></div>`).join('')}</div></div>
      </div>` : `<div class="a-empty">No uses yet. It opens on ${fmt(c.start)} for ${esc(trips(c))}; the first captured payment shows up here.</div>`;
    return `<section class="ad-cp-ins" aria-label="What ${c.code} did">
      <header><div><h3><span class="ad-cp-code">${c.code}</span> · what it did</h3><p>${terms(c)} · ${esc(trips(c))}${c.min ? ` · on ${inr(c.min)} or more` : ''} · ${dates(c)} · once per email</p></div>
        <div class="acts"><a href="#" class="a-btn ghost sm">Edit terms</a><a href="#" class="a-btn ghost sm">${ICON.chart}Discounts report ${V25}</a>
          <button type="button" class="a-btn ghost sm" data-cbx>${ICON.x}Close</button></div></header>${body}</section>`;
  }
  function cbRender() {
    const t = tot();
    const lanes = LANES.map(([title, sts, hint]) => {
      const list = CPS.filter((c) => sts.includes(c.state));
      if (!list.length) return '';
      return `<section class="ad-cp-lane" aria-label="${title}"><h2>${title} <span class="num">${list.length}</span><small>${hint}</small></h2>
        <div class="ad-cp-grid">${list.map((c) => cbCard(c) + (c.code === cb.sel ? cbIns(c) : '')).join('')}</div></section>`;
    }).join('');
    const att = [];
    CPS.forEach((c) => {
      if (c.holds) att.push(['info', 'In checkout', `<b>${c.code}</b> · ${c.holds} checkouts holding a use right now`]);
      if (c.state === 'scheduled') att.push(['info', 'Starts later', `<b>${c.code}</b> opens in ${dayN(c.start)} days, on ${c.pkgs.length || 'every'} packages`]);
      if (c.state === 'used_up') att.push(['warn', 'Used up', `<b>${c.code}</b> took all ${c.limit} uses · raise the limit to keep it going`]);
      if (c.state === 'paused') att.push(['mute', 'Paused', `<b>${c.code}</b> · ${c.uses} used${c.limit ? `, ${c.limit - c.uses} left` : ''} when you switch it on`]);
    });
    const main = `<div class="ad-cp-b">
      <div class="a-head"><h1>Coupons</h1><p class="sub">${CPS.length} codes · a use counts once the payment is captured · click a ticket to see what it did</p>
        <div class="acts"><a href="#" class="a-btn ghost">${ICON.chart}Discounts report ${V25}</a><a href="#" class="a-btn">${ICON.plus}New coupon</a></div></div>
      <div class="ad-cp-ret" aria-label="All codes, all time">
        <div><span class="k">Given back</span><b class="num">${inr(t.g)}</b><small>across ${t.u} bookings</small></div>
        <span class="ar" aria-hidden="true">${ICON.arrowR}</span>
        <div><span class="k">Bookings that came with a code</span><b class="num">${lakh(t.r)}</b><small>paid, after the discount</small></div>
        <div class="bar" role="img" aria-label="Discount is ${((t.g / (t.r + t.g)) * 100).toFixed(1)} % of list value"><i style="--w:${((t.g / (t.r + t.g)) * 100).toFixed(1)}%"></i><span>Discount is <b>${((t.g / (t.r + t.g)) * 100).toFixed(1)} %</b> of what those trips list at</span></div>
      </div>
      <ul class="ad-cp-att" aria-label="Needs a look">${att.map(([tone, w, x]) => `<li><span class="a-chip ${tone}">${w}</span><span>${x}</span></li>`).join('')}</ul>
      ${lanes}</div>`;
    return TS.adminShell('Coupons', main);
  }
  function cbMount(site, rerender) {
    const open = (code) => { cb.sel = cb.sel === code ? '' : code; rerender(); };
    each(site, '[data-cb]', 'click', (el, e) => { if (e.target.closest('button, a')) return; open(el.dataset.cb); });
    each(site, '[data-cb]', 'keydown', (el, e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); open(el.dataset.cb); } });
    each(site, '[data-cbon]', 'click', (b) => { flip(find(b.dataset.cbon)); rerender(); });
    each(site, '[data-copy]', 'click', (b) => { copyTxt(b.dataset.copy); cb.copied = b.dataset.copy; rerender(); });
    each(site, '[data-cbx]', 'click', () => { cb.sel = ''; rerender(); });
  }

  /* =====================================================================
     COUPONS · C · Quote simulator — terms as a sentence, the customer's quote beside it
     ===================================================================== */
  const NEWC = { code: 'FESTIVE1000', kind: 'flat', val: 1000, cap: 0, min: 20000, all: true, pkgs: [], start: '2026-12-20', end: '2027-01-05', uses: 0, limit: 150, holds: 0, state: 'draft', on: true };
  const cs = { sel: 'WELCOME10', t: {}, pkg: 'munnar', party: 2, ch: 'web', on: '2026-09-27', used: false, dirty: false };
  const base = (code) => (code === 'NEW' ? NEWC : find(code));
  const tOf = (code) => cs.t[code] || (cs.t[code] = { ...base(code), pkgs: base(code).pkgs.slice() });
  const BOOK_ON = [['2026-09-27', 'Today'], ['2026-10-20', '20 Oct'], ['2026-11-10', '10 Nov']];
  function quote(t, pkg = cs.pkg, party = cs.party) {
    const p = PKM[pkg];
    const dealOn = p.deal && cs.on <= DEAL_END;
    const gross = p.price * party, deal = dealOn ? p.deal * party : 0, sub = gross - deal;
    const val = +t.val || 0, cap = +t.cap || 0, min = +t.min || 0, lim = +t.limit || 0;
    const checks = [
      ['Terms', val > 0 && (t.kind === 'flat' || val <= 90), t.kind === 'flat' ? `${inr(val)} off` : `${val} % off`, val > 0 ? '1–90 % only' : 'Needs an amount'],
      ['Switched on', t.on, 'On', 'This code isn’t active right now.'],
      ['Dates', cs.on >= t.start && (!t.end || cs.on <= t.end), dates(t), cs.on < t.start ? `This code starts on ${fmt(t.start)}.` : 'This code has expired.'],
      ['Trip', t.all || t.pkgs.includes(pkg), t.all ? 'Every package' : 'Chosen package', 'This code doesn’t apply to this trip.'],
      ['Minimum', sub >= min, min ? `${inr(sub)} ≥ ${inr(min)}` : 'No minimum', `This code needs a booking of ${inr(min)} or more.`],
      ['Uses left', !lim || t.uses + t.holds < lim, lim ? `${n0(lim - t.uses - t.holds)} of ${n0(lim)} left` : 'No limit', 'This code has been fully used.'],
      ['This email', !cs.used, 'First use', 'You’ve already used this code.'],
    ];
    const fail = checks.find((c) => !c[1]);
    const raw = t.kind === 'flat' ? val : Math.floor((sub * val) / 100);
    const off = fail ? 0 : Math.max(0, Math.min(t.kind === 'percent' && cap ? Math.min(raw, cap) : raw, sub - 1));
    return { p, gross, deal, sub, off, fail, checks, capped: !fail && t.kind === 'percent' && cap && raw > cap, val, cap, min };
  }
  function csChart(t, q) {
    const W = 300, H = 118, xm = Math.max(80000, Math.ceil((q.sub * 1.25) / 10000) * 10000);
    const f = (x) => { if (x < q.min) return 0; if (t.kind === 'flat') return Math.min(q.val, x); const r = (x * q.val) / 100; return q.cap ? Math.min(r, q.cap) : r; };
    const ym = Math.max(500, f(xm) * 1.25);
    const X = (x) => ((x / xm) * W).toFixed(1), Y = (y) => (H - 4 - (y / ym) * (H - 18)).toFixed(1);
    const xs = [0, q.min - 1, q.min, ...(t.kind === 'percent' && q.cap ? [(q.cap * 100) / q.val] : []), xm].filter((x) => x >= 0 && x <= xm).sort((a, b) => a - b);
    const d = xs.map((x, i) => `${i ? 'L' : 'M'}${X(x)},${Y(f(x))}`).join(' ');
    const mx = X(Math.min(q.sub, xm)), my = Y(q.off);
    return `<figure class="ad-cp-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Discount for booking totals from ₹0 to ${inr(xm)}">
        <line x1="0" y1="${H - 4}" x2="${W}" y2="${H - 4}" class="ax"/><path d="${d}" class="ln"/>
        <line x1="${mx}" y1="${H - 4}" x2="${mx}" y2="${my}" class="gd"/><circle cx="${mx}" cy="${my}" r="5" class="pt ${q.fail ? 'no' : ''}"/></svg>
      <figcaption><span>₹0</span><span>Booking total, after any deal</span><span>${lakh(xm)}</span></figcaption></figure>`;
  }
  function csOut() {
    const t = tOf(cs.sel), q = quote(t);
    const code = t.code || 'CODE';
    const eff = q.sub ? ((q.off / q.sub) * 100).toFixed(1) : '0.0';
    const insight = q.fail ? `Refused before any money moves: the customer sees the reason under the code box and pays ${inr(q.sub)}.`
      : t.kind === 'percent' && q.cap ? `The cap takes over above ${inr((q.cap * 100) / q.val)}. On this quote the customer gets ${eff} %, not ${q.val} %.`
        : t.kind === 'flat' ? `A flat ${inr(q.val)} is ${eff} % of this quote, the same rupees on every booking that qualifies.` : `No cap: ${q.val} % grows with the booking, ${inr(q.off)} here.`;
    const all = Object.keys(PKM).map((id) => { const r = quote(t, id, 2); return `<li><span class="nm">${esc(PKM[id].name)}</span>${r.fail ? `<span class="no">${r.fail[0] === 'Trip' ? 'Not covered' : r.fail[0] === 'Minimum' ? 'Below minimum' : 'Refused'}</span>` : `<b class="num">−${inr(r.off)}</b>`}</li>`; }).join('');
    return `<div class="ad-cp-rc" aria-live="polite">
        <p class="cap">Book-now sheet · ${cs.ch === 'web' ? 'website' : 'booking desk counter'} · departs ${q.p.dep}</p>
        <div class="ln"><span>${cs.party} × ${inr(q.p.price)}</span><b class="num">${inr(q.gross)}</b></div>
        ${q.deal ? `<div class="ln dl"><span>Deal · ${inr(q.p.deal)} off per traveller</span><b class="num">−${inr(q.deal)}</b></div>` : q.p.deal ? '<div class="ln mu"><span>Deal ended 31 Oct</span><b>—</b></div>' : ''}
        ${q.fail ? `<div class="ln no" role="status"><span><span class="ad-cp-code">${esc(code)}</span> refused</span><em>${q.fail[3]}</em></div>`
          : `<div class="ln cp"><span><span class="ad-cp-cchip">${ICON.check}${esc(code)}</span>${q.capped ? ` capped at ${inr(q.cap)}` : ''}</span><b class="num">−${inr(q.off)}</b></div>`}
        <div class="ln tot"><span>They pay</span><b class="num">${inr(q.sub - q.off)}</b></div>
        <p class="rz">${cs.ch === 'web' ? `Razorpay order: <span class="num">${n0((q.sub - q.off) * 100)}</span> paise` : 'Counter: card, UPI or cash at the desk · the code shows on the receipt'}</p></div>
      <ul class="ad-cp-chk" aria-label="Rule checks">${q.checks.map(([l, ok, yes, no]) => `<li class="${ok ? '' : 'x'}"><span>${l}</span><em>${ok ? yes : no}</em><span class="a-chip ${ok ? 'ok' : 'bad'}">${ok ? 'Pass' : 'Refused'}</span></li>`).join('')}</ul>
      ${csChart(t, q)}<p class="ad-cp-ins1">${ICON.info}<span>${insight}</span></p>
      <details class="ad-cp-allp"><summary>Same code on every package · 2 travellers</summary><ul>${all}</ul></details>`;
  }
  function csRender() {
    const t = tOf(cs.sel), lock = inUse(t);
    const L = lock ? ` disabled title="Locked: in use"` : '';
    const lk = lock ? `<span class="ad-cp-lk" title="Locked: in use">${ICON.lock}<span class="ad-cp-sr">locked</span></span>` : '';
    const pills = [...CPS.map((c) => c.code), 'NEW'].map((k) => {
      const c = k === 'NEW' ? null : find(k);
      const [tone, label] = c ? ST[c.state] : ST.draft;
      return `<button type="button" class="ad-cp-pill" data-cs="${k}" aria-pressed="${cs.sel === k}">${c ? `<b class="ad-cp-code">${k}</b>` : `${ICON.plus}<b>New coupon</b>`}<span class="a-chip ${tone}">${label}</span></button>`;
    }).join('');
    const lim = +t.limit || 0;
    const sentence = `<p class="ad-cp-sent">Give
        <input class="ad-cp-blank n" data-t="val" inputmode="numeric" value="${t.val || ''}" aria-label="Amount"${L}>
        <select class="ad-cp-blank s" data-tk aria-label="Type"${L}><option value="percent"${t.kind === 'percent' ? ' selected' : ''}>% off</option><option value="flat"${t.kind === 'flat' ? ' selected' : ''}>₹ off</option></select>${lk}
        ${t.kind === 'percent' ? `, up to ₹<input class="ad-cp-blank n w" data-t="cap" inputmode="numeric" value="${t.cap || ''}" placeholder="no cap" aria-label="Cap in rupees">` : ''}
        on <select class="ad-cp-blank s" data-tall aria-label="Trips"><option value="1"${t.all ? ' selected' : ''}>every package</option><option value="0"${t.all ? '' : ' selected'}>chosen packages</option></select>,
        for bookings of ₹<input class="ad-cp-blank n w" data-t="min" inputmode="numeric" value="${t.min || ''}" placeholder="0" aria-label="Minimum booking in rupees"> or more,
        from <input class="ad-cp-blank d" type="date" data-t="start" value="${t.start}" aria-label="Starts on">
        to <input class="ad-cp-blank d" type="date" data-t="end" value="${t.end}" aria-label="Last day, blank for no end">,
        <input class="ad-cp-blank n" data-t="limit" inputmode="numeric" value="${lim || ''}" placeholder="any" aria-label="Total uses"> uses in all, once per email.</p>`;
    const chips = t.all ? '' : `<div class="ad-cp-pk" role="group" aria-label="Chosen packages">${Object.keys(PKM).map((id) =>
      `<button type="button" data-pk="${id}" aria-pressed="${t.pkgs.includes(id)}">${t.pkgs.includes(id) ? ICON.check : ICON.plus}${esc(PKM[id].name)}</button>`).join('')}</div>`;
    const lockNote = lock ? `<p class="ad-cp-lock">${ICON.lock}<span><b>Code, type and amount are locked</b> — ${t.uses} captured ${t.uses === 1 ? 'use' : 'uses'}${t.holds ? ` and ${t.holds} live holds` : ''} already carry them. Dates, cap, minimum, trips and the limit (${t.uses + t.holds} or more) can still change.</span></p>` : '';
    const editor = `<section class="a-card ad-cp-ed"><div class="a-card-b">
        <div class="ad-cp-codeln"><label for="ad-cp-code">Code</label><span class="ad-cp-cin"><input id="ad-cp-code" class="ad-cp-code" data-t="code" value="${esc(t.code)}"${L} maxlength="20" aria-describedby="ad-cp-codeh">${lk}</span>
          <small id="ad-cp-codeh">3–20 of A–Z, 0–9 and -. Customers type it in any case.</small></div>
        ${sentence}${chips}${lockNote}
        <p class="ad-cp-err" id="ad-cp-err" role="alert"${lim && lim < t.uses + t.holds ? '' : ' hidden'}>The limit can’t go below ${t.uses + t.holds}: that many are used or held.</p>
        <div class="ad-cp-sbar ${cs.dirty ? 'dirty' : ''}"><span class="st">${cs.dirty ? '<span class="a-chip warn">Unsaved</span> Changes only reach customers when you save.' : t.state === 'draft' ? '<span class="a-chip pri">Draft</span> Not live until you save it.' : '<span class="a-chip ok">Saved</span> What customers see now.'}</span>
          ${sw(t.on, 'Coupon on', 'data-con')}<button type="button" class="a-btn" data-csave>Save coupon</button>
          <button type="button" class="a-btn danger ghost" ${lock ? 'disabled' : ''}>Delete</button></div>
        ${lock ? '<p class="ad-cp-mute">In use, so it can’t be deleted — switch it off instead.</p>' : ''}</div></section>`;
    const sim = `<section class="a-card ad-cp-simc" aria-label="What the customer pays"><div class="a-card-h"><h2>What the customer pays</h2></div><div class="a-card-b">
        <div class="ad-cp-ctl">
          <label class="ad-cp-pksel"><span class="ph"><img src="${PKM[cs.pkg].img}" alt=""></span><select data-spkg aria-label="Package">${Object.keys(PKM).map((id) => `<option value="${id}"${cs.pkg === id ? ' selected' : ''}>${esc(PKM[id].name)}</option>`).join('')}</select></label>
          <div class="ad-cp-crow"><span class="lb">Travellers</span><span class="ad-cp-step"><button type="button" data-sp="-1" aria-label="One fewer"${cs.party <= 1 ? ' disabled' : ''}>${ICON.minus}</button><b class="num" aria-live="polite">${cs.party}</b><button type="button" data-sp="1" aria-label="One more"${cs.party >= 8 ? ' disabled' : ''}>${ICON.plus}</button></span></div>
          <div class="ad-cp-crow"><span class="lb">Booked on</span><div class="a-seg" role="group" aria-label="Booked on">${BOOK_ON.map(([d, l]) => `<button type="button" data-son="${d}" aria-pressed="${cs.on === d}">${l}</button>`).join('')}</div></div>
          <div class="ad-cp-crow"><span class="lb">Where</span><div class="a-seg" role="group" aria-label="Channel"><button type="button" data-sch="web" aria-pressed="${cs.ch === 'web'}">Website</button><button type="button" data-sch="ctr" aria-pressed="${cs.ch === 'ctr'}">Counter</button></div>${V25}</div>
          <label class="ad-cp-crow ad-cp-used"><input type="checkbox" data-sused ${cs.used ? 'checked' : ''}> This email used the code before</label>
        </div>
        <div id="ad-cp-out">${csOut()}</div></div></section>`;
    const main = `<div class="ad-cp-c">
      <div class="a-head"><h1>Coupons</h1><p class="sub">Edit the terms on the left; the quote on the right is exactly what the Book-now sheet would show.</p>
        <div class="acts"><a href="#" class="a-btn ghost">${ICON.chart}Discounts report ${V25}</a></div></div>
      <div class="ad-cp-pills" role="group" aria-label="Pick a coupon">${pills}</div>
      <div class="ad-cp-sim">${editor}${sim}</div></div>`;
    return TS.adminShell('Coupons', main);
  }
  function csMount(site, rerender) {
    const root = site.querySelector('.ad-cp-c');
    if (!root) return;
    const out = () => { const o = site.querySelector('#ad-cp-out'); if (o) o.innerHTML = csOut(); };
    const dirty = () => {
      if (!cs.dirty) { cs.dirty = true; const b = site.querySelector('.ad-cp-sbar'); if (b) { b.classList.add('dirty'); b.querySelector('.st').innerHTML = '<span class="a-chip warn">Unsaved</span> Changes only reach customers when you save.'; } }
    };
    root.addEventListener('input', (e) => {
      const k = e.target.dataset.t; if (!k) return;
      const t = tOf(cs.sel);
      t[k] = k === 'code' ? e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') : e.target.value;
      if (k === 'code') e.target.value = t[k];
      const err = site.querySelector('#ad-cp-err'); if (err) err.hidden = !(+t.limit && +t.limit < t.uses + t.holds);
      dirty(); out();
    });
    each(site, '[data-tk]', 'change', (s) => { tOf(cs.sel).kind = s.value; cs.dirty = true; rerender(); });
    each(site, '[data-tall]', 'change', (s) => { tOf(cs.sel).all = s.value === '1'; cs.dirty = true; rerender(); });
    each(site, '[data-pk]', 'click', (b) => { const t = tOf(cs.sel), id = b.dataset.pk; t.pkgs = t.pkgs.includes(id) ? t.pkgs.filter((x) => x !== id) : [...t.pkgs, id]; cs.dirty = true; rerender(); });
    each(site, '[data-cs]', 'click', (b) => { cs.sel = b.dataset.cs; cs.dirty = false; rerender(); });
    each(site, '[data-con]', 'click', () => { const t = tOf(cs.sel); t.on = !t.on; cs.dirty = true; rerender(); });
    each(site, '[data-csave]', 'click', () => { const t = tOf(cs.sel); if (+t.limit && +t.limit < t.uses + t.holds) return; cs.dirty = false; rerender(); });
    each(site, '[data-spkg]', 'change', (s) => { cs.pkg = s.value; rerender(); });
    each(site, '[data-sp]', 'click', (b) => { cs.party = Math.min(8, Math.max(1, cs.party + +b.dataset.sp)); rerender(); });
    each(site, '[data-son]', 'click', (b) => { cs.on = b.dataset.son; rerender(); });
    each(site, '[data-sch]', 'click', (b) => { cs.ch = b.dataset.sch; rerender(); });
    each(site, '[data-sused]', 'change', (c) => { cs.used = c.checked; out(); });
  }

  /* =====================================================================
     COUPONS · D · Templates + ledger — start from a recipe, edit in the row
     ===================================================================== */
  const TPL = [
    { id: 'welcome', name: 'Welcome 10 %', code: 'HELLO10', kind: 'percent', val: 10, cap: 1000, min: 0, all: true, start: '2026-10-01', end: '2027-09-30', limit: 1000, why: 'First trip. The cap keeps a Ladakh booking from costing you ₹6,000.' },
    { id: 'festive', name: 'Festive flat', code: 'NEWYEAR1000', kind: 'flat', val: 1000, cap: 0, min: 20000, all: true, start: '2026-12-20', end: '2027-01-05', limit: 150, why: 'Short window; a flat rupee amount reads well on a poster or reel.' },
    { id: 'group', name: 'Big group', code: 'GROUP3000', kind: 'flat', val: 3000, cap: 0, min: 60000, all: true, start: '2026-10-01', end: '', limit: 50, why: '₹60,000 or more is about six people on a weekend trip — no party-size rule needed.' },
    { id: 'counter', name: 'Walk-in at the desk', code: 'WALKIN500', kind: 'flat', val: 500, cap: 0, min: 10000, all: true, start: '2026-10-01', end: '2027-03-31', limit: 100, why: 'For the booking desk counter: staff type it when a walk-in hesitates.', v25: true },
    { id: 'honey', name: 'Couples', code: 'COUPLES5', kind: 'percent', val: 5, cap: 2500, min: 0, all: false, pkgs: ['hav', 'munnar'], start: '2026-10-01', end: '2027-03-31', limit: 50, why: 'Two romantic trips only. Rerun of HONEYMOON5, which used all 25.' },
    { id: 'back', name: 'Come back', code: 'AGAIN7', kind: 'percent', val: 7, cap: 1500, min: 0, all: true, start: '2026-10-01', end: '2026-12-31', limit: 200, why: 'Email it to past travellers after their review.' },
  ];
  const cd = { open: 'WELCOME10', f: 'all', tpl: '', saved: '' };
  const cdMatch = (c) => cd.f === 'all' || (cd.f === 'ended' ? c.state === 'expired' || c.state === 'used_up' : c.state === cd.f);
  const tplSentence = (t) => `Customers get ${terms(t)}${t.min ? ` on bookings of ${inr(t.min)} or more` : ''}, ${t.all ? 'on every package' : `on ${(t.pkgs || []).map((id) => PKM[id].name).join(' and ')}`}, ${t.end ? `${fmt(t.start)} – ${fmt(t.end)}` : `from ${fmt(t.start)}`}${+t.limit ? `, ${n0(+t.limit)} uses in all` : ''}, once per email.`;
  function cdDraft() {
    const t = TPL.find((x) => x.id === cd.tpl); if (!t) return '';
    const f = (lab, inp, cls = '') => `<label class="ad-cp-df ${cls}"><span>${lab}</span>${inp}</label>`;
    return `<section class="ad-cp-draft" aria-label="New coupon from ${esc(t.name)}">
      <header><span class="a-chip pri">Draft</span><b>New coupon from “${esc(t.name)}”</b><span class="ad-cp-mute">Nothing is live until you save.</span></header>
      <div class="ad-cp-dgrid">
        ${f('Code', `<input class="ad-cp-code" data-d="code" value="${t.code}" maxlength="20">`, 'wide')}
        ${f('Type', `<select data-d="kind"><option value="percent"${t.kind === 'percent' ? ' selected' : ''}>% off</option><option value="flat"${t.kind === 'flat' ? ' selected' : ''}>₹ off</option></select>`)}
        ${f(t.kind === 'flat' ? '₹ off' : '% off', `<input data-d="val" inputmode="numeric" value="${t.val}">`)}
        ${t.kind === 'percent' ? f('Up to ₹', `<input data-d="cap" inputmode="numeric" value="${t.cap || ''}" placeholder="no cap">`) : ''}
        ${f('Minimum ₹', `<input data-d="min" inputmode="numeric" value="${t.min || ''}" placeholder="0">`)}
        ${f('Starts', `<input type="date" data-d="start" value="${t.start}">`)}
        ${f('Last day', `<input type="date" data-d="end" value="${t.end}">`)}
        ${f('Total uses', `<input data-d="limit" inputmode="numeric" value="${t.limit || ''}" placeholder="no limit">`)}
      </div>
      <p class="ad-cp-prev" id="ad-cp-prev">${ICON.eye}<span>${esc(tplSentence(t))}</span></p>
      <div class="ad-cp-dact"><button type="button" class="a-btn" data-dsave>Save coupon</button><button type="button" class="a-btn ghost" data-dx>Discard</button>
        <span class="ad-cp-mute">${t.all ? 'Every package' : `Packages: ${(t.pkgs || []).map((id) => esc(PKM[id].name)).join(', ')}`} · switch on after saving</span></div></section>`;
  }
  function cdRow(c) {
    const [tone, label] = ST[c.state], lock = inUse(c), open = cd.open === c.code;
    const mx = Math.max(1, ...c.weekly);
    const bars = `<span class="ad-cp-mb" aria-hidden="true">${c.weekly.map((v) => `<i style="--h:${Math.max(6, pct(v, mx))}%" class="${v ? '' : 'z'}"></i>`).join('')}</span>`;
    const detail = open ? `<div class="ad-cp-xp" id="ad-cp-xp-${c.code}">
        <figure class="ad-cp-wk"><figcaption>Uses per week <small>· captured payments</small></figcaption><div class="cols">${c.weekly.map((v, i) =>
          `<div class="c"><b class="num">${v || ''}</b><i style="--h:${Math.max(2, pct(v, mx))}%"></i><small>${WEEKS[i]}</small></div>`).join('')}</div></figure>
        <dl class="a-kv ad-cp-xkv"><div><dt>Bookings value, after the code</dt><dd>${c.rev ? lakh(c.rev) : '—'}</dd></div>
          <div><dt>Booked per ₹1 given</dt><dd>${c.given ? inr(Math.round(c.rev / c.given)) : '—'}</dd></div>
          <div><dt>Website · Counter ${V25}</dt><dd>${c.web} · ${c.ctr}</dd></div>
          <div><dt>Minimum booking</dt><dd><span class="ad-cp-rs">₹<input class="ad-cp-cell" data-e="min" value="${c.min || ''}" placeholder="none" inputmode="numeric" aria-label="${c.code} minimum"></span></dd></div>
          ${c.kind === 'percent' ? `<div><dt>Cap</dt><dd><span class="ad-cp-rs">₹<input class="ad-cp-cell" data-e="cap" value="${c.cap || ''}" placeholder="none" inputmode="numeric" aria-label="${c.code} cap"></span></dd></div>` : ''}
          <div><dt>Trips</dt><dd class="wrap">${esc(trips(c))}</dd></div></dl>
        <div class="ad-cp-xact">${lock ? `<p class="ad-cp-lock">${ICON.lock}<span>Code, type and amount locked — ${c.uses} ${c.uses === 1 ? 'use' : 'uses'}${c.holds ? ` and ${c.holds} holds` : ''}. It can’t be deleted; switch it off instead.</span></p>`
          : '<p class="ad-cp-mute">Unused, so everything is editable and it can be deleted.</p>'}
          <a href="#" class="a-btn ghost sm">Edit all terms</a>${lock ? '' : '<button type="button" class="a-btn danger sm">Delete</button>'}</div></div>` : '';
    return `<div class="ad-cp-lr${open ? ' open' : ''}" data-row="${c.code}" role="listitem"${cdMatch(c) ? '' : ' hidden'}>
      <div class="ad-cp-r">
        <div class="cd"><b class="ad-cp-code">${c.code}</b>${lock ? `<span class="ad-cp-lk" title="Code, type and amount locked: in use">${ICON.lock}<span class="ad-cp-sr">locked</span></span>` : ''}<small>${esc(trips(c))}</small></div>
        <div class="gv">${terms(c)}${c.min ? `<small>on ${inr(c.min)} or more</small>` : ''}</div>
        <div class="us">${bars}<span><b class="num">${c.uses}</b>${c.limit ? `<small> / ${n0(c.limit)}</small>` : '<small> · no limit</small>'}${c.holds ? `<small class="hold">+${c.holds} held</small>` : ''}</span></div>
        <div class="gb num"><span class="ad-cp-ml">Given back</span>${inr(c.given)}</div>
        <div class="en"><span class="ad-cp-ml">Last day</span><input type="date" class="ad-cp-cell" data-e="end" value="${c.end}" aria-label="${c.code} last day"></div>
        <div class="li"><span class="ad-cp-ml">Limit</span><input class="ad-cp-cell n" data-e="limit" value="${c.limit || ''}" placeholder="none" inputmode="numeric" aria-label="${c.code} total uses"></div>
        <div class="sx"><span class="a-chip ${tone}">${label}</span>${sw(c.on, `${c.code} on`, `data-cdon="${c.code}"`)}</div>
        <button type="button" class="ad-cp-ex" data-cdx="${c.code}" aria-expanded="${open}" aria-label="${open ? 'Hide' : 'Show'} ${c.code} details">${ICON.chevD}</button>
      </div>
      <div class="ad-cp-rsave" role="status"><span class="a-chip warn">Unsaved</span><span class="msg">Row edited.</span><button type="button" class="a-btn sm" data-rsave>Save</button><button type="button" class="a-btn ghost sm" data-rundo>Undo</button></div>
      ${detail}</div>`;
  }
  function cdRender() {
    const t = tot();
    const F = [['all', 'All'], ['active', 'Active'], ['scheduled', 'Starts later'], ['paused', 'Paused'], ['ended', 'Ended']];
    const cnt = (k) => CPS.filter((c) => (k === 'all' ? true : k === 'ended' ? c.state === 'expired' || c.state === 'used_up' : c.state === k)).length;
    const tpls = TPL.map((x) => `<button type="button" class="ad-cp-tpl${cd.tpl === x.id ? ' on' : ''}" data-tpl="${x.id}" aria-pressed="${cd.tpl === x.id}">
        <span class="tk"><b class="ad-cp-code">${x.code}</b><span>${terms(x)}</span></span>
        <span class="nm">${esc(x.name)}${x.v25 ? V25 : ''}</span><span class="why">${esc(x.why)}</span><span class="go">${cd.tpl === x.id ? 'In the editor below' : 'Use this'}${ICON.arrowR}</span></button>`).join('');
    const main = `<div class="ad-cp-d">
      <div class="a-head"><h1>Coupons</h1><p class="sub">${t.u} uses · ${inr(t.g)} given back · ${lakh(t.r)} of bookings came with a code</p>
        <div class="acts"><a href="#" class="a-btn ghost">${ICON.chart}Discounts report ${V25}</a><button type="button" class="a-btn" data-tpl="welcome">${ICON.plus}New coupon</button></div></div>
      <section class="ad-cp-tpls" aria-label="Start from a template"><h2>Start from a template <small>tested recipes for a small operator; every field stays editable</small></h2><div class="row">${tpls}</div></section>
      ${cd.saved ? `<p class="ad-cp-toast" role="status">${ICON.check}<span><b>${cd.saved}</b> saved.</span></p>` : ''}
      ${cdDraft()}
      <section class="a-card flush ad-cp-led"><div class="a-card-h"><h2>All codes</h2><div class="acts"><div class="a-seg" role="group" aria-label="Filter">${F.map(([k, l]) => `<button type="button" data-cdf="${k}" aria-pressed="${cd.f === k}">${l} <span class="num">${cnt(k)}</span></button>`).join('')}</div></div></div>
        <div class="a-card-b"><div class="ad-cp-lw"><div class="ad-cp-r hd" aria-hidden="true"><span>Code</span><span>Gives</span><span>Last 8 weeks</span><span>Given back</span><span>Last day</span><span>Limit</span><span>State</span><span></span></div>
        <div role="list">${CPS.map(cdRow).join('')}</div>
        <div class="ad-cp-r ft"><span><b>${CPS.length} codes</b></span><span></span><span><b class="num">${t.u}</b> uses${t.h ? ` · ${t.h} held` : ''}</span><span class="num"><b>${inr(t.g)}</b></span><span class="ad-cp-mute">Dates and limits save per row</span></div></div></div></section>
    </div>`;
    return TS.adminShell('Coupons', main);
  }
  function cdMount(site, rerender) {
    each(site, '[data-tpl]', 'click', (b) => { cd.tpl = b.dataset.tpl; cd.saved = ''; rerender(); const i = site.querySelector('[data-d="code"]'); if (i) i.focus(); });
    each(site, '[data-dx]', 'click', () => { cd.tpl = ''; rerender(); });
    each(site, '[data-dsave]', 'click', () => { const i = site.querySelector('[data-d="code"]'); cd.saved = i ? i.value.toUpperCase() : 'Coupon'; cd.tpl = ''; rerender(); });
    const dg = site.querySelector('.ad-cp-draft');
    if (dg) dg.addEventListener('input', () => {
      const g = (k) => { const el = dg.querySelector(`[data-d="${k}"]`); return el ? el.value : ''; };
      const t = { kind: g('kind'), val: g('val'), cap: g('cap'), min: +g('min') || 0, all: TPL.find((x) => x.id === cd.tpl).all, pkgs: TPL.find((x) => x.id === cd.tpl).pkgs, start: g('start'), end: g('end'), limit: g('limit') };
      const c = dg.querySelector('[data-d="code"]'); c.value = c.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
      const p = site.querySelector('#ad-cp-prev span'); if (p && t.start) p.textContent = tplSentence(t);
    });
    each(site, '[data-d="kind"]', 'change', (s) => { const x = TPL.find((y) => y.id === cd.tpl); x.kind = s.value; rerender(); });
    each(site, '[data-cdf]', 'click', (b) => { cd.f = b.dataset.cdf; rerender(); });
    each(site, '[data-cdx]', 'click', (b) => { cd.open = cd.open === b.dataset.cdx ? '' : b.dataset.cdx; rerender(); });
    each(site, '[data-cdon]', 'click', (b) => { flip(find(b.dataset.cdon)); rerender(); });
    each(site, '.ad-cp-lr', 'input', (row, e) => {
      if (!e.target.dataset.e) return;
      const c = find(row.dataset.row);
      row.classList.add('dirty');
      const bad = e.target.dataset.e === 'limit' && e.target.value && +e.target.value < c.uses + c.holds;
      row.classList.toggle('bad', !!bad);
      row.querySelector('.ad-cp-rsave .msg').textContent = bad ? `Limit can’t go below ${c.uses + c.holds} — that many are used or held.` : 'Row edited.';
      row.querySelector('[data-rsave]').disabled = !!bad;
    });
    each(site, '[data-rsave]', 'click', (b) => {
      const row = b.closest('.ad-cp-lr'), c = find(row.dataset.row);
      row.querySelectorAll('[data-e]').forEach((i) => { const k = i.dataset.e; c[k] = k === 'end' ? i.value : +i.value || 0; });
      cd.saved = c.code; rerender();
    });
    each(site, '[data-rundo]', 'click', () => { cd.saved = ''; rerender(); });
  }

  /* ---------- coupons CSS ---------- */
  const css = `
  .ad-v25 { font-size: 10px; padding: 1px 7px; letter-spacing: .04em; vertical-align: 1px; margin-left: 4px; }
  .ad-cp-code { font-family: ui-monospace, "SF Mono", Consolas, monospace; letter-spacing: .05em; font-weight: 800; }
  .ad-cp-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .ad-cp-mute { color: var(--mute); font-size: 12.5px; margin: 0; }
  .ad-cp-sw { display: inline-flex; align-items: center; gap: 7px; border: 0; background: none; padding: 2px; cursor: pointer; font: 700 12px "DM Sans", sans-serif; color: var(--mute); }
  .ad-cp-sw i { width: 34px; height: 20px; border-radius: 99px; background: #C4CDD5; position: relative; flex: none; transition: background .2s; }
  .ad-cp-sw i::after { content: ""; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(20,32,42,.25); transition: transform .3s var(--ease); }
  .ad-cp-sw[aria-checked="true"] { color: var(--ok); } .ad-cp-sw[aria-checked="true"] i { background: var(--ok); } .ad-cp-sw[aria-checked="true"] i::after { transform: translateX(14px); }
  .ad-cp-lk { display: inline-grid; place-items: center; color: var(--mute); } .ad-cp-lk .ic { width: 13px; height: 13px; }
  .ad-cp-lock { display: flex; gap: 8px; align-items: flex-start; background: var(--bg2); border-radius: 10px; padding: 9px 12px; font-size: 13px; color: var(--ink2); margin: 0; }
  .ad-cp-lock .ic { width: 14px; height: 14px; flex: none; margin-top: 3px; color: var(--mute); }
  .ad-cp-spark { width: 112px; height: 30px; flex: none; overflow: visible; }
  .ad-cp-spark polyline { fill: none; stroke: var(--pri); stroke-width: 2; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
  .ad-cp-spark polygon { fill: color-mix(in srgb, var(--pri) 12%, transparent); }
  @keyframes ad-cp-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

  /* B · campaign board */
  .ad-cp-b { display: grid; gap: 20px; min-width: 0; }
  .ad-cp-ret { display: grid; grid-template-columns: auto auto auto minmax(0, 1fr); gap: 14px 22px; align-items: center; background: var(--ink); color: #fff; border-radius: var(--a-r); padding: 18px 22px; }
  .ad-cp-ret > div:not(.bar) { display: grid; gap: 1px; } .ad-cp-ret .k { font-size: 12px; font-weight: 700; color: var(--ink-soft); }
  .ad-cp-ret b { font-size: 28px; letter-spacing: -.03em; font-weight: 800; } .ad-cp-ret small { color: var(--ink-soft); font-size: 12px; font-weight: 600; }
  .ad-cp-ret .ar { color: var(--act); } .ad-cp-ret .ar .ic { width: 22px; height: 22px; }
  .ad-cp-ret .bar { display: grid; gap: 6px; justify-self: end; width: min(320px, 100%); }
  .ad-cp-ret .bar i { display: block; height: 10px; border-radius: 99px; background: #2A3945; position: relative; overflow: hidden; }
  .ad-cp-ret .bar i::after { content: ""; position: absolute; inset: 0 auto 0 0; width: var(--w); min-width: 4px; background: var(--act); border-radius: inherit; }
  .ad-cp-ret .bar span { font-size: 12.5px; color: var(--ink-soft); } .ad-cp-ret .bar span b { font-size: 12.5px; color: #fff; letter-spacing: 0; }
  .ad-cp-att { list-style: none; margin: 0; padding: 0 0 2px; display: flex; gap: 8px; overflow-x: auto; }
  .ad-cp-att li { flex: none; display: flex; gap: 9px; align-items: center; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 12px; padding: 8px 12px; font-size: 13px; }
  .ad-cp-lane { display: grid; gap: 10px; min-width: 0; }
  .ad-cp-lane > h2 { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--a-th); font-weight: 800; margin: 0; }
  .ad-cp-lane > h2 .num { background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 99px; padding: 0 7px; letter-spacing: 0; }
  .ad-cp-lane > h2 small { text-transform: none; letter-spacing: 0; font-weight: 600; color: var(--mute); font-size: 12.5px; }
  .ad-cp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap: 14px; }
  .ad-cp-tk { background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); display: grid; cursor: pointer; position: relative; min-width: 0;
    transition: transform .3s var(--ease), box-shadow .25s, border-color .2s; }
  .ad-cp-tk:hover { transform: translateY(-2px); box-shadow: 0 14px 30px -20px rgba(20,32,42,.4); }
  .ad-cp-tk:focus-visible { outline: 2px solid var(--pri); outline-offset: 2px; }
  .ad-cp-tk.sel { border-color: var(--pri); box-shadow: inset 0 0 0 1px var(--pri), 0 14px 30px -20px rgba(27,79,216,.55); }
  .ad-cp-tk .stub { padding: 16px 18px 14px; display: grid; gap: 4px; }
  .ad-cp-tk .r1 { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
  .ad-cp-code.big { font-size: 21px; color: var(--ink); }
  .ad-cp-tk.end .ad-cp-code.big { color: var(--mute); }
  .ad-cp-copy { display: inline-flex; gap: 5px; align-items: center; border: 1px solid var(--a-line); background: var(--a-surf); border-radius: 8px; padding: 4px 8px; font: 700 12px "DM Sans", sans-serif; color: var(--ink2); cursor: pointer; }
  .ad-cp-copy:hover { border-color: var(--ink); } .ad-cp-copy .ic { width: 13px; height: 13px; }
  .ad-cp-tk .terms { margin: 0; font-size: 16px; font-weight: 800; letter-spacing: -.01em; } .ad-cp-tk .terms small { font-size: 12.5px; color: var(--mute); font-weight: 600; }
  .ad-cp-tk .trips { margin: 0; font-size: 12.5px; color: var(--mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ad-cp-tk .perf { border-top: 2px dashed var(--a-line); margin: 0 16px; position: relative; }
  .ad-cp-tk .perf::before, .ad-cp-tk .perf::after { content: ""; position: absolute; top: -10px; width: 18px; height: 18px; border-radius: 50%; background: var(--a-bg); border: 1px solid var(--a-line); }
  .ad-cp-tk .perf::before { left: -27px; clip-path: inset(0 0 0 50%); } .ad-cp-tk .perf::after { right: -27px; clip-path: inset(0 50% 0 0); }
  .ad-cp-tk .st { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding: 14px 18px 4px; margin: 0; }
  .ad-cp-tk .st dt { font-size: 11px; font-weight: 700; color: var(--mute); letter-spacing: .02em; } .ad-cp-tk .st dd { margin: 0; font-size: 18px; font-weight: 800; letter-spacing: -.02em; }
  .ad-cp-tk .use { display: flex; gap: 12px; align-items: flex-end; padding: 8px 18px 12px; }
  .ad-cp-tk .use .m { flex: 1; display: grid; gap: 5px; min-width: 0; } .ad-cp-tk .use .cap { font-size: 12.5px; color: var(--ink2); } .ad-cp-tk .hold { color: var(--act-ink); font-weight: 700; }
  .ad-cp-tk .ft { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; border-top: 1px solid var(--a-line); padding: 10px 14px 10px 18px; }
  .ad-cp-tk .ft .when { font-size: 12.5px; color: var(--mute); flex: 1 1 120px; } .ad-cp-tk .ft .ad-cp-sw { margin-left: auto; }
  .ad-cp-ins { grid-column: 1 / -1; background: var(--a-surf); border: 1px solid var(--pri); border-radius: var(--a-r); padding: 18px 20px; display: grid; gap: 16px; animation: ad-cp-rise .4s var(--ease); min-width: 0; }
  .ad-cp-ins header { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-start; }
  .ad-cp-ins header > div:first-child { flex: 1 1 320px; } .ad-cp-ins h3 { font-size: 18px; margin: 0; letter-spacing: -.02em; } .ad-cp-ins header p { margin: 2px 0 0; color: var(--mute); font-size: 13px; }
  .ad-cp-ins .acts { display: flex; gap: 6px; flex-wrap: wrap; }
  .ad-cp-ins .cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.25fr); gap: 22px; }
  .ad-cp-ins h4 { font-size: 11.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--a-th); font-weight: 800; margin: 0 0 10px; }
  .ad-cp-chbar { height: 12px; border-radius: 99px; background: var(--act); position: relative; overflow: hidden; margin-bottom: 12px; }
  .ad-cp-chbar i { position: absolute; inset: 0 auto 0 0; width: var(--w); background: var(--pri); }
  .ad-cp-key { display: inline-block; width: 9px; height: 9px; border-radius: 3px; margin-right: 7px; background: var(--pri); } .ad-cp-key.c { background: var(--act); }
  .ad-cp-tops { list-style: none; margin: 0; padding: 0; display: grid; gap: 9px; }
  .ad-cp-tops li { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; gap: 10px; align-items: center; font-size: 13px; }
  .ad-cp-tops .ph { width: 44px; height: 32px; border-radius: 7px; } .ad-cp-tops .nm { display: grid; gap: 4px; min-width: 0; }
  .ad-cp-tops .bar { display: block; height: 5px; border-radius: 99px; background: linear-gradient(90deg, var(--pri) var(--w), var(--bg2) var(--w)); }
  .ad-cp-tops b { font-size: 15px; }
  .ad-cp-ins .a-tl-i { grid-template-columns: 84px 16px minmax(0, 1fr); } .ad-cp-ins .a-tl-i::after { left: calc(84px + 10px + 7.5px); }

  /* C · quote simulator */
  .ad-cp-c { display: grid; gap: 16px; min-width: 0; }
  .ad-cp-pills { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
  .ad-cp-pill { flex: none; display: inline-flex; gap: 8px; align-items: center; border: 1px solid var(--a-line); background: var(--a-surf); color: var(--ink); border-radius: 12px; padding: 8px 10px 8px 12px; font: 600 13px "DM Sans", sans-serif; cursor: pointer; transition: border-color .2s, background .2s; }
  .ad-cp-pill:hover { border-color: var(--ink); } .ad-cp-pill .ic { width: 14px; height: 14px; }
  .ad-cp-pill[aria-pressed="true"] { background: var(--ink); color: #fff; border-color: var(--ink); }
  .ad-cp-sim { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 16px; align-items: start; }
  .ad-cp-ed .a-card-b { display: grid; gap: 16px; padding: 20px 22px; }
  .ad-cp-codeln { display: grid; gap: 4px; } .ad-cp-codeln label { font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--a-th); }
  .ad-cp-codeln small { font-size: 12px; color: var(--mute); }
  .ad-cp-cin { display: flex; align-items: center; gap: 8px; }
  .ad-cp-cin input { font-size: 30px; border: 0; border-bottom: 2px solid var(--a-line); background: none; padding: 2px 0; width: 100%; max-width: 360px; color: var(--ink); border-radius: 0; }
  .ad-cp-cin input:focus { outline: 0; border-bottom-color: var(--pri); } .ad-cp-cin input[disabled] { color: var(--ink2); }
  .ad-cp-cin .ad-cp-lk .ic { width: 18px; height: 18px; }
  .ad-cp-sent { font-size: 19px; line-height: 2.25; font-weight: 600; letter-spacing: -.01em; margin: 0; color: var(--ink); }
  .ad-cp-blank { font: 800 18px "DM Sans", sans-serif; color: var(--pri-ink); background: var(--pri-soft); border: 0; border-bottom: 2px solid var(--pri); border-radius: 7px 7px 2px 2px; padding: 1px 6px; text-align: center; vertical-align: 1px; max-width: 100%; }
  .ad-cp-blank.n { width: 5.2ch; } .ad-cp-blank.n.w { width: 7ch; } .ad-cp-blank.d { width: 10.5em; font-size: 15px; text-align: left; } .ad-cp-blank.s { text-align: left; padding-right: 2px; cursor: pointer; }
  .ad-cp-blank:focus { outline: 2px solid var(--pri); outline-offset: 1px; }
  .ad-cp-blank[disabled] { background: var(--bg2); color: var(--ink); border-bottom-color: var(--a-line); cursor: not-allowed; }
  .ad-cp-blank::placeholder { color: color-mix(in srgb, var(--pri-ink) 45%, transparent); font-weight: 600; }
  .ad-cp-pk { display: flex; flex-wrap: wrap; gap: 6px; }
  .ad-cp-pk button { display: inline-flex; gap: 5px; align-items: center; border: 1px solid var(--a-line); background: var(--a-surf); color: var(--ink2); border-radius: 99px; padding: 5px 10px; font: 600 12.5px "DM Sans", sans-serif; cursor: pointer; }
  .ad-cp-pk button .ic { width: 12px; height: 12px; } .ad-cp-pk button[aria-pressed="true"] { background: var(--pri-soft); border-color: color-mix(in srgb, var(--pri) 40%, transparent); color: var(--pri-ink); }
  .ad-cp-err { margin: 0; font-size: 13px; font-weight: 700; color: #B42318; }
  .ad-cp-sbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; border-top: 1px solid var(--a-line); padding-top: 14px; }
  .ad-cp-sbar .st { flex: 1 1 220px; font-size: 13px; color: var(--mute); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .ad-cp-sbar.dirty .a-btn:not(.ghost) { background: var(--act); color: var(--ink); }
  .ad-cp-ctl { display: grid; gap: 10px; padding-bottom: 14px; border-bottom: 1px solid var(--a-line); margin-bottom: 14px; }
  .ad-cp-pksel { display: flex; gap: 10px; align-items: center; } .ad-cp-pksel .ph { width: 52px; height: 38px; border-radius: 8px; flex: none; }
  .ad-cp-pksel select { flex: 1; min-width: 0; font: 700 14px "DM Sans", sans-serif; border: 1px solid var(--a-line); border-radius: 10px; padding: 8px 10px; background: var(--a-surf); color: var(--ink); }
  .ad-cp-crow { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 13px; } .ad-cp-crow .lb { width: 76px; color: var(--mute); font-weight: 700; font-size: 12.5px; }
  .ad-cp-step { display: inline-flex; align-items: center; border: 1px solid var(--a-line); border-radius: 10px; overflow: hidden; }
  .ad-cp-step button { border: 0; background: var(--a-surf); padding: 6px 9px; cursor: pointer; color: var(--ink); display: grid; } .ad-cp-step button .ic { width: 14px; height: 14px; } .ad-cp-step button[disabled] { opacity: .35; cursor: default; }
  .ad-cp-step b { min-width: 30px; text-align: center; font-size: 15px; }
  .ad-cp-used { font-weight: 600; color: var(--ink2); } .ad-cp-used input { accent-color: var(--pri); width: 16px; height: 16px; margin: 0; }
  .ad-cp-rc { position: relative; background: var(--bg2); border-radius: 12px 12px 0 0; padding: 14px 16px 18px; display: grid; gap: 7px; font-size: 14px; margin-bottom: 12px; }
  .ad-cp-rc::after { content: ""; position: absolute; left: 0; right: 0; bottom: -8px; height: 8px; background: radial-gradient(circle at 6px 0, var(--bg2) 6px, transparent 6.5px) 0 0 / 12px 8px repeat-x; }
  .ad-cp-rc .cap { margin: 0 0 2px; font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--a-th); }
  .ad-cp-rc .ln { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; flex-wrap: wrap; }
  .ad-cp-rc .ln.dl b, .ad-cp-rc .ln.cp b { color: var(--ok); } .ad-cp-rc .ln.mu { color: var(--mute); font-size: 13px; }
  .ad-cp-cchip { display: inline-flex; gap: 4px; align-items: center; background: var(--ok-soft); color: var(--ok); border-radius: 99px; padding: 1px 9px 1px 6px; font: 800 12.5px ui-monospace, Consolas, monospace; letter-spacing: .04em; margin-right: 4px; }
  .ad-cp-cchip .ic { width: 12px; height: 12px; }
  .ad-cp-rc .ln.no { display: grid; gap: 2px; background: var(--warn-soft); color: var(--warn); border-radius: 8px; padding: 7px 10px; animation: ad-cp-rise .3s var(--ease); } .ad-cp-rc .ln.no em { font-style: normal; font-weight: 700; }
  .ad-cp-rc .ln.cp { animation: ad-cp-rise .3s var(--ease); }
  .ad-cp-rc .tot { border-top: 1px solid var(--a-line); padding-top: 7px; } .ad-cp-rc .tot b { font-size: 22px; letter-spacing: -.02em; }
  .ad-cp-rc .rz { margin: 0; font-size: 12px; color: var(--mute); }
  .ad-cp-chk { list-style: none; margin: 0 0 12px; padding: 0; display: grid; gap: 0; border: 1px solid var(--a-line); border-radius: 10px; overflow: hidden; }
  .ad-cp-chk li { display: grid; grid-template-columns: 84px minmax(0, 1fr) auto; gap: 10px; align-items: center; font-size: 12.5px; padding: 6px 10px; }
  .ad-cp-chk li + li { border-top: 1px solid var(--a-line); } .ad-cp-chk li > span:first-child { font-weight: 700; } .ad-cp-chk em { font-style: normal; color: var(--mute); min-width: 0; }
  .ad-cp-chk li.x { background: color-mix(in srgb, #B42318 5%, var(--a-surf)); } .ad-cp-chk li.x em { color: #B42318; font-weight: 600; }
  .ad-cp-chart { margin: 0; } .ad-cp-chart svg { width: 100%; height: 118px; display: block; }
  .ad-cp-chart .ax { stroke: var(--a-line); } .ad-cp-chart .ln { fill: none; stroke: var(--pri); stroke-width: 2.5; stroke-linejoin: round; }
  .ad-cp-chart .gd { stroke: var(--act); stroke-dasharray: 3 3; } .ad-cp-chart .pt { fill: var(--act); stroke: var(--a-surf); stroke-width: 2; } .ad-cp-chart .pt.no { fill: #B42318; }
  .ad-cp-chart figcaption { display: flex; justify-content: space-between; font-size: 11px; color: var(--mute); font-weight: 600; }
  .ad-cp-ins1 { display: flex; gap: 8px; margin: 10px 0 0; font-size: 13px; color: var(--ink2); } .ad-cp-ins1 .ic { width: 15px; height: 15px; flex: none; margin-top: 2px; color: var(--pri); }
  .ad-cp-allp { margin-top: 12px; border-top: 1px solid var(--a-line); padding-top: 10px; font-size: 13px; }
  .ad-cp-allp summary { cursor: pointer; font-weight: 700; } .ad-cp-allp ul { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 5px; }
  .ad-cp-allp li { display: flex; justify-content: space-between; gap: 10px; } .ad-cp-allp .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ad-cp-allp b { color: var(--ok); } .ad-cp-allp .no { color: var(--mute); font-weight: 600; white-space: nowrap; }

  /* D · templates + ledger */
  .ad-cp-d { display: grid; gap: 18px; min-width: 0; }
  .ad-cp-tpls { display: grid; gap: 10px; min-width: 0; }
  .ad-cp-tpls h2 { font-size: 15px; margin: 0; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; } .ad-cp-tpls h2 small { color: var(--mute); font-weight: 600; font-size: 12.5px; }
  .ad-cp-tpls .row { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(220px, 1fr); gap: 10px; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 4px; }
  .ad-cp-tpl { scroll-snap-align: start; text-align: left; display: grid; gap: 6px; align-content: start; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 14px; padding: 12px; font: inherit; color: inherit; cursor: pointer; transition: transform .3s var(--ease), border-color .2s, box-shadow .2s; }
  .ad-cp-tpl:hover { transform: translateY(-2px); border-color: var(--ink); }
  .ad-cp-tpl.on { border-color: var(--pri); box-shadow: inset 0 0 0 1px var(--pri); }
  .ad-cp-tpl .tk { display: grid; gap: 1px; background: var(--ink); color: #fff; border-radius: 9px; padding: 9px 11px; position: relative; }
  .ad-cp-tpl .tk::after { content: ""; position: absolute; right: 64px; top: 0; bottom: 0; border-left: 2px dashed rgba(255,255,255,.22); }
  .ad-cp-tpl .tk b { font-size: 14px; color: var(--act); } .ad-cp-tpl .tk span { font-size: 12px; color: var(--ink-soft); font-weight: 600; }
  .ad-cp-tpl .nm { font-weight: 800; font-size: 14px; } .ad-cp-tpl .why { font-size: 12.5px; color: var(--mute); line-height: 1.4; }
  .ad-cp-tpl .go { display: inline-flex; gap: 5px; align-items: center; color: var(--pri); font-weight: 700; font-size: 12.5px; margin-top: 2px; } .ad-cp-tpl .go .ic { width: 13px; height: 13px; }
  .ad-cp-toast { display: flex; gap: 8px; align-items: center; margin: 0; background: var(--ok-soft); color: var(--ok); border-radius: 10px; padding: 9px 12px; font-size: 13.5px; font-weight: 600; animation: ad-cp-rise .3s var(--ease); }
  .ad-cp-toast .ic { width: 15px; height: 15px; }
  .ad-cp-draft { background: var(--a-surf); border: 1.5px dashed var(--pri); border-radius: var(--a-r); padding: 16px 18px; display: grid; gap: 12px; animation: ad-cp-rise .35s var(--ease); }
  .ad-cp-draft header { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 14.5px; }
  .ad-cp-dgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 10px; }
  .ad-cp-df { display: grid; gap: 4px; min-width: 0; } .ad-cp-df.wide { grid-column: span 2; }
  .ad-cp-df span { font-size: 11.5px; font-weight: 800; letter-spacing: .04em; color: var(--a-th); }
  .ad-cp-df input, .ad-cp-df select { font: 600 13.5px "DM Sans", sans-serif; border: 1px solid var(--a-line); border-radius: 9px; padding: 8px 9px; background: var(--a-surf); color: var(--ink); width: 100%; min-width: 0; }
  .ad-cp-df input.ad-cp-code { font-family: ui-monospace, Consolas, monospace; font-size: 14px; }
  .ad-cp-prev { display: flex; gap: 8px; margin: 0; background: var(--pri-soft); color: var(--pri-ink); border-radius: 10px; padding: 9px 12px; font-size: 13.5px; font-weight: 600; } .ad-cp-prev .ic { width: 16px; height: 16px; flex: none; margin-top: 2px; }
  .ad-cp-dact { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .ad-cp-led .a-card-b { padding-top: 12px; }
  .ad-cp-lw { overflow-x: auto; }
  .ad-cp-r { display: grid; grid-template-columns: minmax(150px, 1.25fr) minmax(120px, 1fr) 150px 92px 132px 78px 128px 34px; gap: 12px; align-items: center; padding: 10px var(--a-pad); min-width: 900px; font-size: 13.5px; }
  .ad-cp-r.hd { font-size: 11.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--a-th); font-weight: 700; padding-top: 4px; padding-bottom: 8px; border-bottom: 1px solid var(--a-line); }
  .ad-cp-r.ft { border-top: 1px solid var(--a-line); background: var(--bg2); font-size: 13px; border-radius: 0 0 var(--a-r) var(--a-r); }
  .ad-cp-r.ft > span:last-child { grid-column: span 4; justify-self: end; }
  .ad-cp-lr { border-bottom: 1px solid var(--a-line); }
  .ad-cp-lr.open { background: color-mix(in srgb, var(--pri) 3%, var(--a-surf)); }
  .ad-cp-r .cd, .ad-cp-r .gv { display: grid; gap: 1px; min-width: 0; } .ad-cp-r .cd { grid-template-columns: auto 1fr; column-gap: 6px; align-items: center; }
  .ad-cp-r .cd small { grid-column: 1 / -1; } .ad-cp-r small { color: var(--mute); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ad-cp-r .gv { font-weight: 700; } .ad-cp-r .gv small { font-weight: 500; }
  .ad-cp-r .us { display: flex; gap: 10px; align-items: flex-end; } .ad-cp-r .us > span:last-child { display: grid; line-height: 1.2; } .ad-cp-r .us b { font-size: 15px; } .ad-cp-r .hold { color: var(--act-ink); font-weight: 700; }
  .ad-cp-mb { display: flex; gap: 2px; align-items: flex-end; height: 26px; width: 64px; flex: none; }
  .ad-cp-mb i { flex: 1; height: var(--h); background: var(--pri); border-radius: 2px 2px 0 0; transform-origin: bottom; animation: ad-cp-grow .5s var(--ease) both; } .ad-cp-mb i.z { background: var(--a-line); }
  @keyframes ad-cp-grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
  .ad-cp-r .gb { font-weight: 700; }
  .ad-cp-ml { display: none; }
  .ad-cp-cell { font: 600 13px "DM Sans", sans-serif; border: 1px solid transparent; border-radius: 8px; padding: 6px 7px; background: transparent; color: var(--ink); width: 100%; min-width: 0; }
  .ad-cp-cell:hover { border-color: var(--a-line); background: var(--a-surf); } .ad-cp-cell:focus { outline: 2px solid var(--pri); outline-offset: 0; background: var(--a-surf); }
  .ad-cp-cell::placeholder { color: var(--mute); font-weight: 500; }
  .ad-cp-r .sx { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .ad-cp-ex { border: 1px solid var(--a-line); background: var(--a-surf); border-radius: 8px; width: 30px; height: 30px; display: grid; place-items: center; cursor: pointer; color: var(--ink2); }
  .ad-cp-ex .ic { width: 15px; height: 15px; transition: transform .25s var(--ease); } .ad-cp-ex[aria-expanded="true"] .ic { transform: rotate(180deg); }
  .ad-cp-rsave { display: none; gap: 8px; align-items: center; flex-wrap: wrap; padding: 0 var(--a-pad) 10px; font-size: 13px; }
  .ad-cp-lr.dirty .ad-cp-rsave { display: flex; animation: ad-cp-rise .25s var(--ease); } .ad-cp-lr.bad .ad-cp-rsave .msg { color: #B42318; font-weight: 700; }
  .ad-cp-lr.bad [data-e="limit"] { border-color: #B42318; }
  .ad-cp-xp { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 14px 26px; padding: 6px var(--a-pad) 18px; animation: ad-cp-rise .3s var(--ease); }
  .ad-cp-wk { margin: 0; display: grid; gap: 8px; } .ad-cp-wk figcaption { font-size: 12.5px; font-weight: 800; } .ad-cp-wk figcaption small { color: var(--mute); font-weight: 600; }
  .ad-cp-wk .cols { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 6px; height: 132px; align-items: end; border-bottom: 1px solid var(--a-line); }
  .ad-cp-wk .c { display: grid; grid-template-rows: auto 1fr auto; height: 100%; justify-items: center; gap: 3px; }
  .ad-cp-wk .c b { font-size: 12px; min-height: 1em; } .ad-cp-wk .c i { align-self: end; width: 70%; height: var(--h); background: var(--pri); border-radius: 4px 4px 0 0; transform-origin: bottom; animation: ad-cp-grow .5s var(--ease) both; }
  .ad-cp-wk .c small { font-size: 10.5px; color: var(--mute); white-space: nowrap; transform: translateY(18px); height: 0; }
  .ad-cp-xkv { align-content: start; } .ad-cp-xkv dd.wrap { white-space: normal; max-width: 60%; font-weight: 600; }
  .ad-cp-rs { display: inline-flex; gap: 2px; align-items: center; color: var(--mute); } .ad-cp-rs .ad-cp-cell { width: 92px; text-align: right; border-color: var(--a-line); background: var(--a-surf); }
  .ad-cp-xact { grid-column: 1 / -1; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 10px; } .ad-cp-xact .ad-cp-lock, .ad-cp-xact > p { flex: 1 1 300px; }

  /* ---------- phone ---------- */
  @container site (max-width: 700px) {
    .ad-cp-ret { grid-template-columns: 1fr; gap: 10px; padding: 16px; } .ad-cp-ret .ar { display: none; } .ad-cp-ret .bar { justify-self: stretch; width: 100%; } .ad-cp-ret b { font-size: 24px; }
    .ad-cp-grid { grid-template-columns: minmax(0, 1fr); }
    .ad-cp-tk .st dd { font-size: 16px; } .ad-cp-spark { width: 80px; }
    .ad-cp-ins { padding: 14px; } .ad-cp-ins .cols { grid-template-columns: minmax(0, 1fr); gap: 18px; }
    .ad-cp-sim { grid-template-columns: minmax(0, 1fr); }
    .ad-cp-ed .a-card-b { padding: 16px; } .ad-cp-cin input { font-size: 24px; }
    .ad-cp-sent { font-size: 16px; line-height: 2.3; } .ad-cp-blank { font-size: 15px; } .ad-cp-blank.d { font-size: 13.5px; width: 9.6em; }
    .ad-cp-crow .lb { width: 100%; }
    .ad-cp-chk li { grid-template-columns: 72px minmax(0, 1fr) auto; }
    .ad-cp-tpls .row { grid-auto-columns: 78%; }
    .ad-cp-df.wide { grid-column: 1 / -1; } .ad-cp-dgrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .ad-cp-r.hd, .ad-cp-r.ft > span:nth-child(2) { display: none; }
    .ad-cp-r { min-width: 0; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 34px; gap: 8px 10px; }
    .ad-cp-r .cd { grid-column: 1 / 3; } .ad-cp-r .ad-cp-ex { grid-column: 3; grid-row: 1; }
    .ad-cp-r .gv { grid-column: 1 / 3; } .ad-cp-r .us { grid-column: 1 / -1; }
    .ad-cp-r .gb, .ad-cp-r .en, .ad-cp-r .li { display: grid; gap: 2px; } .ad-cp-r .li { grid-column: 1; } .ad-cp-r .sx { grid-column: 2 / -1; }
    .ad-cp-ml { display: block; font-size: 11px; font-weight: 700; color: var(--mute); letter-spacing: .03em; }
    .ad-cp-cell { border-color: var(--a-line); background: var(--a-surf); }
    .ad-cp-r.ft { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .ad-cp-r.ft > span:last-child { grid-column: 1 / -1; justify-self: start; }
    .ad-cp-xp { grid-template-columns: minmax(0, 1fr); }
    .ad-cp-xkv dd.wrap { max-width: 58%; }
  }
  @media (prefers-reduced-motion: reduce) {
    [class*="ad-cp-"], [class*="ad-cp-"] *, [class*="ad-cp-"]::before, [class*="ad-cp-"]::after { animation: none !important; transition: none !important; }
  }`;

  const NOTE_B = 'Campaign board. Each code is a ticket, grouped into lanes by what it is doing now (Running, Starts later, Paused, Ended), so a switch flip moves it to its lane. Each ticket shows the three numbers Razorpay Offers and Shopify Discounts lead with: bookings it brought, rupees given back and bookings per ₹1 given, plus a uses meter with checkout holds shaded, a weekly sparkline, an Ends soon flag and the on switch. A dark return band on top sets all-time ₹ given back against bookings value; a "Needs a look" strip names holds, used-up and paused codes. Click a ticket to open "what it did" in the grid below it: website vs counter (v2.5), which trips it sold and the latest uses. On a phone the lanes stack, one ticket per row, and the insight columns stack.';
  const NOTE_C = 'Quote simulator first. Pick a code from the pill row; the terms read as one sentence with fill-in blanks ("Give 10 % off, up to ₹1,000, on every package, for bookings of ₹0 or more…"). Code, type and amount turn grey with a lock once the code has a use or a live hold, and the reason is spelled out. Beside it, "What the customer pays" is the Book-now sheet: choose a package, travellers, booking date (today, 20 Oct, 10 Nov, which shows the Munnar deal ending) and website or counter (v2.5). Every keystroke redraws the quote, the seven rule checks with the customer-facing refusal, a discount-vs-booking chart showing where the cap bites, and the same code across every package. On a phone the simulator drops under the editor.';
  const NOTE_D = 'Templates plus ledger. A scrolling row of six tested recipes (Welcome 10 %, Festive flat, Big group via a ₹60,000 minimum, Walk-in at the desk for the v2.5 counter, Couples, Come back) opens a dashed draft editor with every field prefilled and a plain-English preview. Below, one dense ledger replaces list plus editor: 8-week use bars, given back, and last day and limit editable in the row. An edited row shows an Unsaved strip with Save and Undo, and a limit under uses plus holds is refused inline. The chevron opens a weekly chart, bookings value, website vs counter, minimum and cap, and the lock or delete rule. On a phone each row becomes a labelled card; the templates swipe.';

  TS.addVariants('coupons', [
    { id: 'B', name: 'Campaign board', note: NOTE_B, tradeoff: 'Best for "is this code worth it?", but editing terms is one more click away than in a list with a side editor.', render: cbRender, mount: cbMount },
    { id: 'C', name: 'Quote simulator', note: NOTE_C, tradeoff: 'Makes caps, minimums and refusals impossible to misread, but shows one code at a time, so comparing codes means switching pills.', render: csRender, mount: csMount },
    { id: 'D', name: 'Templates and ledger', note: NOTE_D, tradeoff: 'Fastest to create and tweak many codes, but the dense row asks more of a phone screen than the ticket board.', render: cdRender, mount: cdMount },
  ], css);

  /* =====================================================================
     SIGN IN · shared
     ===================================================================== */
  const LI_MSG = {
    credentials: ['warn', 'Wrong email or password.'],
    rate_limited: ['warn', 'Too many attempts — wait a few minutes and try again.'],
    signedout: ['ok', 'You’re signed out.'],
  };
  const liMsg = (st, cls = '') => { const m = LI_MSG[st]; return m ? `<p class="ad-li-msg ${m[0]} ${cls}" role="${m[0] === 'ok' ? 'status' : 'alert'}">${m[1]}</p>` : ''; };
  const liMock = (cur, opts, attr) => `<div class="ad-li-mock" role="group" aria-label="Mockup state"><span>Mockup state</span><div class="a-seg">${opts.map(([k, l]) =>
    `<button type="button" ${attr}="${k}" aria-pressed="${cur === k}">${l}</button>`).join('')}</div></div>`;
  const pwField = (id) => `<div class="a-field"><label for="${id}">Password</label><span class="ad-li-pw"><input id="${id}" type="password" autocomplete="current-password" placeholder="Your password"><button type="button" class="ad-li-show" data-show="${id}" aria-pressed="false">Show</button></span>
      <span class="hint ad-li-caps" hidden>Caps Lock is on.</span></div>`;
  const pwMount = (site) => {
    each(site, '[data-show]', 'click', (b) => {
      const i = site.querySelector('#' + b.dataset.show); if (!i) return; const show = i.type === 'password';
      i.type = show ? 'text' : 'password'; b.textContent = show ? 'Hide' : 'Show'; b.setAttribute('aria-pressed', show);
    });
    each(site, '.ad-li-pw input', 'keyup', (i, e) => { const c = i.closest('.a-field').querySelector('.ad-li-caps'); if (c && e.getModifierState) c.hidden = !e.getModifierState('CapsLock'); });
  };
  const wrap = (inner) => `<div class="adm" data-dir="${TS.adminDir}">${inner}</div>`;

  /* ---------- B · Postcard: full-bleed destination photo, form card, hand-off to today ---------- */
  const LB_PH = [['img/udaipur-1.jpg', 'Lake Pichola, Udaipur', 'Jaipur · Jodhpur · Udaipur'], ['img/ladakh-2.jpg', 'The road to Pangong, Ladakh', 'Leh · Nubra · Pangong'],
    ['img/munnar-1.jpg', 'Tea estates above Munnar', 'Munnar & Alleppey Houseboat'], ['img/goa-5.jpg', 'Evening on the North Goa coast', 'North Goa Beaches']];
  const lb = { ph: 0, st: 'normal' };
  function lbRender() {
    const [, place, pkg] = LB_PH[lb.ph];
    const form = `<form class="ad-li-bf" novalidate onsubmit="return false">
        <p class="ad-li-eb">Owner desk</p><h1>Sign in</h1>
        <p class="ad-li-demo">${ICON.info}<span>Demo: <b>owner@tripsmith.demo</b> — use the password on the portfolio case study.</span></p>
        ${liMsg(lb.st)}
        <div class="a-field"><label for="ad-li-be">Email</label><input id="ad-li-be" type="email" autocomplete="username" value="owner@tripsmith.demo"></div>
        ${pwField('ad-li-bp')}
        <button type="submit" class="a-btn act ad-li-go" data-lbgo ${lb.st === 'rate_limited' ? 'disabled' : ''}>Sign in${ICON.arrowR}</button>
        <p class="ad-li-foot">Forgot your password? Email <a href="#">tripsmith.work@gmail.com</a>.</p>
        <p class="ad-li-foot">${ICON.lock}One owner account. Sign-up is off.</p></form>`;
    const hand = `<div class="ad-li-hand" role="status">
        <span class="ok">${ICON.check}</span><p class="ad-li-eb">Signed in · owner@tripsmith.demo</p><h1>Welcome back, Viraj</h1>
        <p class="lead">Here is what is waiting on the dashboard.</p>
        <ul class="ad-li-today">
          <li><b class="num">2</b><span>departures this week<small>Kasol Riverside Weekend leaves Fri 2 Oct · 16 of 20 booked</small></span></li>
          <li><b class="num">3</b><span>holds expire today<small>seats go back on sale if unpaid</small></span></li>
          <li><b class="num">5</b><span>new enquiries<small>oldest waiting 2 days</small></span></li>
          <li><b class="num">₹1.18 L</b><span>balances due in 7 days</span></li></ul>
        <a href="#" class="a-btn act ad-li-go">Open the dashboard${ICON.arrowR}</a>
        <button type="button" class="ad-li-link" data-lb="signedout">Not you? Sign out</button></div>`;
    return wrap(`<div class="ad-li-b">
      <div class="bg" aria-hidden="true">${LB_PH.map(([src], i) => `<img src="${src}" alt="" class="${i === lb.ph ? 'on' : ''}">`).join('')}</div>
      <div class="left"><a href="#" class="logo"><i></i>Tripsmith <small>admin</small></a>
        <div class="cap"><p class="pl">${place}</p><p class="pk">On sale now · ${pkg}</p>
          <div class="thumbs" role="group" aria-label="Change the photo">${LB_PH.map(([src, p], i) => `<button type="button" data-lbph="${i}" aria-pressed="${i === lb.ph}" aria-label="${esc(p)}"><span class="ph"><img src="${src}" alt=""></span></button>`).join('')}</div>
          <a href="#" class="bk">${ICON.chevL}Back to the site</a></div></div>
      <div class="card">${lb.st === 'in' ? hand : form}</div>
      ${liMock(lb.st, [['normal', 'Default'], ['credentials', 'Wrong password'], ['rate_limited', 'Rate limited'], ['in', 'Signed in']], 'data-lb')}</div>`);
  }
  function lbMount(site, rerender) {
    each(site, '[data-lb]', 'click', (b) => { lb.st = b.dataset.lb; rerender(); });
    each(site, '[data-lbgo]', 'click', () => { lb.st = 'in'; rerender(); });
    each(site, '[data-lbph]', 'click', (b) => {
      lb.ph = +b.dataset.lbph;
      site.querySelectorAll('.ad-li-b .bg img').forEach((im, i) => im.classList.toggle('on', i === lb.ph));
      site.querySelectorAll('[data-lbph]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      const [, place, pkg] = LB_PH[lb.ph];
      site.querySelector('.ad-li-b .pl').textContent = place; site.querySelector('.ad-li-b .pk').textContent = `On sale now · ${pkg}`;
    });
    pwMount(site);
  }

  /* ---------- C · One-time code: minimal card, code by email (default) or password ---------- */
  const DEMO_CODE = '482915';
  const lc = { m: 'code', step: 'email', err: '', digits: '' };
  function lcRender() {
    let body = '';
    if (lc.m === 'pw') {
      body = `<form class="ad-li-cf" novalidate onsubmit="return false">
          <div class="a-field"><label for="ad-li-ce2">Email</label><input id="ad-li-ce2" type="email" autocomplete="username" value="owner@tripsmith.demo"></div>
          ${pwField('ad-li-cp')}
          <button type="submit" class="a-btn ad-li-go" data-lcdone>Sign in${ICON.arrowR}</button>
          <p class="ad-li-foot">Forgot it? Switch to <button type="button" class="ad-li-link" data-lcm="code">Email me a code</button> — no reset needed.</p></form>`;
    } else if (lc.step === 'email') {
      body = `<form class="ad-li-cf" novalidate onsubmit="return false">
          <div class="a-field"><label for="ad-li-ce">Email</label><input id="ad-li-ce" type="email" autocomplete="username" value="owner@tripsmith.demo">
            <span class="hint">We email a 6-digit code. It works for 10 minutes, once.</span></div>
          <button type="submit" class="a-btn ad-li-go" data-lcsend>Email me a code${ICON.arrowR}</button></form>`;
    } else if (lc.step === 'code') {
      const locked = lc.err === 'locked';
      const d = lc.digits.padEnd(6, ' ');
      body = `<form class="ad-li-cf" novalidate onsubmit="return false">
          <p class="ad-li-sent">${ICON.mail}<span>Code sent to <b>owner@tripsmith.demo</b> · <button type="button" class="ad-li-link" data-lcstep="email">change</button></span></p>
          <div class="ad-li-dstrip" role="note"><span><small>Demo address — nothing is emailed</small>Your code <b class="num">${DEMO_CODE.slice(0, 3)} ${DEMO_CODE.slice(3)}</b></span><button type="button" class="a-btn act sm" data-lcfill ${locked ? 'disabled' : ''}>Fill it in</button></div>
          <fieldset class="ad-li-otp${lc.err ? ' bad' : ''}"><legend>6-digit code</legend>${[0, 1, 2, 3, 4, 5].map((i) =>
            `<input inputmode="numeric" autocomplete="${i ? 'off' : 'one-time-code'}" maxlength="1" aria-label="Digit ${i + 1}" value="${d[i].trim()}" data-otp="${i}" ${locked ? 'disabled' : ''}>`).join('')}</fieldset>
          ${lc.err === 'wrong' ? '<p class="ad-li-msg warn" role="alert">That code isn’t right — 4 tries left.</p>' : ''}
          ${locked ? '<p class="ad-li-msg warn" role="alert">Too many tries. Ask for a new code.</p>' : ''}
          <button type="submit" class="a-btn ad-li-go" data-lcver ${locked ? 'disabled' : ''}>Verify and sign in${ICON.arrowR}</button>
          <p class="ad-li-foot"><button type="button" class="ad-li-link" data-lcsend>${locked ? 'Send a new code' : 'Resend code'}</button><span>· a new code cancels the old one</span></p></form>`;
    } else {
      body = `<div class="ad-li-done" role="status"><span class="ok">${ICON.check}</span><h2>Signed in</h2><p>Opening the dashboard…</p><span class="ad-li-prog" aria-hidden="true"><i></i></span></div>`;
    }
    const tabs = lc.step === 'done' ? '' : `<div class="a-seg ad-li-tabs" role="tablist" aria-label="Sign-in method">
        <button type="button" role="tab" data-lcm="code" aria-selected="${lc.m === 'code'}" aria-pressed="${lc.m === 'code'}">${ICON.mail}Email me a code</button>
        <button type="button" role="tab" data-lcm="pw" aria-selected="${lc.m === 'pw'}" aria-pressed="${lc.m === 'pw'}">${ICON.lock}Password</button></div>`;
    const cur = lc.step === 'done' ? 'done' : lc.m === 'pw' ? 'pw' : lc.step === 'email' ? 'email' : lc.err || 'code';
    return wrap(`<div class="ad-li-c">
      <div class="card"><a href="#" class="logo"><i></i>Tripsmith <small>admin</small></a>
        ${lc.step === 'done' ? '' : '<h1>Owner sign-in</h1><p class="ad-li-sub">One account runs the whole desk. Sign-up is off.</p>'}
        ${tabs}${body}</div>
      <p class="ad-li-under"><a href="#">${ICON.chevL}Back to the site</a><span>Codes use the same demo rule as the customer sign-in: demo addresses see the code here.</span></p>
      ${liMock(cur, [['email', 'Email'], ['code', 'Code sent'], ['wrong', 'Wrong code'], ['locked', 'Too many tries'], ['pw', 'Password'], ['done', 'Signed in']], 'data-lcs')}</div>`);
  }
  function lcMount(site, rerender) {
    const set = (o) => { Object.assign(lc, o); rerender(); };
    each(site, '[data-lcs]', 'click', (b) => {
      const k = b.dataset.lcs;
      if (k === 'pw') set({ m: 'pw', step: 'email', err: '' });
      else if (k === 'email') set({ m: 'code', step: 'email', err: '', digits: '' });
      else if (k === 'done') set({ step: 'done', err: '' });
      else set({ m: 'code', step: 'code', err: k === 'code' ? '' : k, digits: k === 'wrong' ? '482195' : '' });
    });
    each(site, '[data-lcm]', 'click', (b) => set({ m: b.dataset.lcm, step: b.dataset.lcm === 'pw' ? 'email' : lc.step, err: '' }));
    each(site, '[data-lcsend]', 'click', () => set({ m: 'code', step: 'code', err: '', digits: '' }));
    each(site, '[data-lcstep]', 'click', (b) => set({ step: b.dataset.lcstep, err: '' }));
    each(site, '[data-lcdone]', 'click', () => set({ step: 'done' }));
    each(site, '[data-lcfill]', 'click', () => set({ digits: DEMO_CODE, err: '' }));
    each(site, '[data-lcver]', 'click', () => {
      const v = [...site.querySelectorAll('[data-otp]')].map((i) => i.value).join('');
      set(v === DEMO_CODE ? { step: 'done', err: '' } : { err: 'wrong', digits: v });
    });
    const boxes = [...site.querySelectorAll('[data-otp]')];
    boxes.forEach((inp, i) => {
      inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(-1); if (inp.value && boxes[i + 1]) boxes[i + 1].focus(); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !inp.value && boxes[i - 1]) boxes[i - 1].focus(); });
      inp.addEventListener('paste', (e) => {
        const t = ((e.clipboardData && e.clipboardData.getData('text')) || '').replace(/\D/g, '').slice(0, 6); if (!t) return;
        e.preventDefault(); boxes.forEach((b, j) => { b.value = t[j] || ''; }); (boxes[Math.min(t.length, 5)]).focus();
      });
    });
    pwMount(site);
  }

  /* ---------- D · Status board: the form in the middle of the system's health ---------- */
  const ld = { st: 'normal' };
  function ldRender() {
    const mailDown = ld.st === 'mail';
    const tile = (name, sub, tone, word, text) => `<div class="ad-li-tile"><div class="h"><span class="nm">${name}<small>${sub}</small></span><span class="a-chip ${tone}"><i class="ad-li-dot ${tone}"></i>${word}</span></div><p>${text}</p></div>`;
    const left = [
      tile('Payments', 'Razorpay', 'warn', 'Test mode', 'Test cards and UPI only. No real money moves until live keys go in.'),
      mailDown ? tile('Email', 'Gmail SMTP', 'bad', 'Not sending', 'Last attempt 18:20 failed. Vouchers wait and resend when it recovers.')
        : tile('Email', 'Gmail SMTP', 'ok', 'Sending', 'Last sent 18:12 — a booking confirmation.'),
      tile('Site', 'tripsmith.vercel.app', 'ok', 'Up', 'Home page answering in 212 ms.'),
    ].join('');
    const right = [
      tile('API', 'tripsmith-api', 'ok', 'Up', 'Answering in 142 ms.'),
      tile('Database', 'Neon Postgres', 'ok', 'Connected', 'Query time 18 ms.'),
      tile('Release', 'main · dce6e41', 'info', 'Current', 'Deployed 26 Sep, 22:40 · real email (P0).'),
    ].join('');
    const summary = mailDown ? ['bad', '1 problem', 'Email is not sending'] : ['ok', 'All normal', 'Every check passed'];
    const form = `<form class="ad-li-df" novalidate onsubmit="return false">
        <a href="#" class="logo"><i></i>Tripsmith <small>admin</small></a>
        <h1>Sign in</h1>
        <p class="ad-li-demo">${ICON.info}<span>Demo: <b>owner@tripsmith.demo</b> — use the password on the portfolio case study.</span></p>
        ${mailDown ? '<p class="ad-li-msg warn" role="status">Email is down, so password reset mail would not arrive. Password sign-in still works.</p>' : ''}
        ${liMsg(ld.st)}
        <div class="a-field"><label for="ad-li-de">Email</label><input id="ad-li-de" type="email" autocomplete="username" value="owner@tripsmith.demo"></div>
        ${pwField('ad-li-dp')}
        <button type="submit" class="a-btn ad-li-go" ${ld.st === 'rate_limited' ? 'disabled' : ''}>Sign in${ICON.arrowR}</button>
        <p class="ad-li-foot">${ICON.lock}One owner account. Sign-up is off. · <a href="#">Back to the site</a></p></form>`;
    return wrap(`<div class="ad-li-d">
      <header class="top"><span class="ttl">System status</span><span class="a-chip ${summary[0]}"><i class="ad-li-dot ${summary[0]}"></i>${summary[1]}</span><span class="sm">${summary[2]}</span>
        <span class="clk">Checked Sun 27 Sep, 18:40 IST · every minute</span></header>
      <div class="board"><div class="col" aria-label="Money and messages">${left}</div>${form}<div class="col" aria-label="Servers">${right}</div></div>
      <footer class="bot"><span>Health only: this page never shows bookings, names or money before you sign in.</span></footer>
      ${liMock(ld.st, [['normal', 'All normal'], ['mail', 'Email down'], ['credentials', 'Wrong password'], ['rate_limited', 'Rate limited']], 'data-ld')}</div>`);
  }
  function ldMount(site, rerender) {
    each(site, '[data-ld]', 'click', (b) => { ld.st = b.dataset.ld; rerender(); });
    pwMount(site);
  }

  /* ---------- sign-in CSS ---------- */
  const css2 = `
  .ad-li-b, .ad-li-c, .ad-li-d { grid-column: 1 / -1; min-height: 780px; position: relative; }
  .ad-li-eb { margin: 0; font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: var(--act-ink); }
  .ad-li-demo { display: flex; gap: 8px; align-items: flex-start; background: var(--pri-soft); color: var(--pri-ink); border-radius: 10px; padding: 9px 12px; font-size: 13px; font-weight: 600; margin: 0; }
  .ad-li-demo .ic { width: 16px; height: 16px; flex: none; margin-top: 1px; }
  .ad-li-msg { border-radius: 10px; padding: 9px 12px; font-size: 14px; font-weight: 700; margin: 0; animation: ad-li-in .35s var(--ease); }
  .ad-li-msg.warn { background: var(--warn-soft); color: var(--warn); } .ad-li-msg.ok { background: var(--ok-soft); color: var(--ok); }
  .ad-li-pw { position: relative; display: block; } .ad-li-pw input { padding-right: 64px !important; }
  .ad-li-show { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); border: 0; background: none; color: var(--pri); font: 700 12.5px "DM Sans", sans-serif; cursor: pointer; padding: 6px 8px; }
  .ad-li-go { justify-content: center; padding: 12px 18px; font-size: 15px; border-radius: 12px; } .ad-li-go .ic { width: 16px; height: 16px; }
  .ad-li-foot { font-size: 12.5px; color: var(--mute); margin: 0; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; } .ad-li-foot a { color: inherit; } .ad-li-foot .ic { width: 13px; height: 13px; }
  .ad-li-link { border: 0; background: none; padding: 0; font-family: inherit; font-weight: 700; font-size: inherit; color: var(--pri); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
  .ad-li-mock { position: absolute; right: 12px; top: 12px; z-index: 5; display: flex; gap: 8px; align-items: center; background: rgba(255,255,255,.94); border: 1px dashed #AEB9C2; border-radius: 12px; padding: 5px 5px 5px 10px; font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--mute); max-width: calc(100% - 24px); }
  .ad-li-mock .a-seg { overflow-x: auto; } .ad-li-mock .a-seg button { text-transform: none; letter-spacing: 0; white-space: nowrap; }
  @keyframes ad-li-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  @keyframes ad-li-pop { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: none; } }
  @keyframes ad-li-bar { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  @keyframes ad-li-pulse { 0% { transform: scale(1); opacity: .7; } 100% { transform: scale(2.6); opacity: 0; } }

  /* B · postcard */
  .ad-li-b { display: grid; grid-template-columns: minmax(0, 1fr) minmax(360px, 430px); background: var(--ink); overflow: hidden; }
  .ad-li-b .bg { position: absolute; inset: 0; }
  .ad-li-b .bg img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transform: scale(1.04); transition: opacity .9s ease, transform 6s ease; }
  .ad-li-b .bg img.on { opacity: 1; transform: scale(1); }
  .ad-li-b .bg::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(12,20,28,.25), rgba(12,20,28,.2) 45%, rgba(12,20,28,.7)), linear-gradient(transparent 55%, rgba(12,20,28,.75)); }
  .ad-li-b .left { position: relative; z-index: 1; display: flex; flex-direction: column; justify-content: space-between; padding: 26px 30px 30px; color: #fff; min-width: 0; }
  .ad-li-b .left .logo { color: #fff; } .ad-li-b .logo small, .ad-li-c .logo small, .ad-li-df .logo small { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--act); font-weight: 800; }
  .ad-li-b .cap { display: grid; gap: 4px; justify-items: start; }
  .ad-li-b .pl { margin: 0; font-size: 34px; font-weight: 800; letter-spacing: -.03em; line-height: 1.05; max-width: 16ch; text-shadow: 0 2px 20px rgba(0,0,0,.35); }
  .ad-li-b .pk { margin: 0 0 10px; font-size: 14px; color: rgba(255,255,255,.85); font-weight: 600; }
  .ad-li-b .thumbs { display: flex; gap: 8px; }
  .ad-li-b .thumbs button { border: 2px solid rgba(255,255,255,.35); border-radius: 10px; padding: 0; background: none; cursor: pointer; width: 58px; height: 42px; overflow: hidden; transition: border-color .2s, transform .25s var(--ease); }
  .ad-li-b .thumbs button:hover { transform: translateY(-2px); } .ad-li-b .thumbs button[aria-pressed="true"] { border-color: var(--act); }
  .ad-li-b .thumbs .ph { display: block; width: 100%; height: 100%; }
  .ad-li-b .bk { margin-top: 14px; display: inline-flex; gap: 4px; align-items: center; color: rgba(255,255,255,.85); font-size: 13px; font-weight: 700; text-decoration: none; } .ad-li-b .bk .ic { width: 15px; height: 15px; } .ad-li-b .bk:hover { color: #fff; }
  .ad-li-b .card { position: relative; z-index: 1; align-self: center; margin: 70px 28px 28px 0; background: var(--a-surf); color: var(--ink); border-radius: 22px; padding: 30px 28px; box-shadow: 0 40px 80px -40px rgba(0,0,0,.7); animation: ad-li-in .5s var(--ease); }
  .ad-li-bf, .ad-li-hand { display: grid; gap: 14px; } .ad-li-bf h1, .ad-li-hand h1 { font-size: 30px; letter-spacing: -.03em; margin: -6px 0 0; }
  .ad-li-hand .ok { width: 44px; height: 44px; border-radius: 50%; background: var(--ok); color: #fff; display: grid; place-items: center; animation: ad-li-pop .45s var(--ease); } .ad-li-hand .ok .ic { width: 22px; height: 22px; }
  .ad-li-hand .lead { margin: -6px 0 0; color: var(--mute); }
  .ad-li-today { list-style: none; margin: 0; padding: 0; display: grid; border: 1px solid var(--a-line); border-radius: 14px; overflow: hidden; }
  .ad-li-today li { display: grid; grid-template-columns: 82px minmax(0, 1fr); gap: 10px; align-items: baseline; padding: 10px 14px; font-size: 14px; font-weight: 600; animation: ad-li-in .45s var(--ease) both; }
  .ad-li-today li:nth-child(2) { animation-delay: .06s; } .ad-li-today li:nth-child(3) { animation-delay: .12s; } .ad-li-today li:nth-child(4) { animation-delay: .18s; }
  .ad-li-today li + li { border-top: 1px solid var(--a-line); } .ad-li-today b { font-size: 22px; letter-spacing: -.02em; } .ad-li-today small { display: block; color: var(--mute); font-weight: 500; font-size: 12.5px; }
  .ad-li-hand .ad-li-link { justify-self: center; font-size: 13px; }

  /* C · one-time code */
  .ad-li-c { display: grid; place-content: center; justify-items: center; gap: 14px; padding: 76px 16px 40px;
    background: radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--ink) 13%, transparent) 1px, transparent 1.5px) 0 0 / 22px 22px, var(--bg2); }
  .ad-li-c .card { width: min(420px, 100%); background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 22px; padding: 28px; display: grid; gap: 16px; box-shadow: 0 30px 60px -36px rgba(20,32,42,.4); }
  .ad-li-c .card h1 { font-size: 26px; letter-spacing: -.03em; margin: 4px 0 -8px; } .ad-li-sub { margin: 0; color: var(--mute); font-size: 13.5px; }
  .ad-li-tabs { width: 100%; } .ad-li-tabs button { flex: 1; display: inline-flex; gap: 6px; justify-content: center; align-items: center; padding: 9px 8px; } .ad-li-tabs .ic { width: 14px; height: 14px; }
  .ad-li-cf { display: grid; gap: 14px; animation: ad-li-in .35s var(--ease); }
  .ad-li-sent { display: flex; gap: 8px; align-items: flex-start; margin: 0; font-size: 13.5px; color: var(--ink2); } .ad-li-sent .ic { width: 16px; height: 16px; flex: none; margin-top: 2px; color: var(--pri); }
  .ad-li-dstrip { display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap; background: var(--ink); color: #fff; border-radius: 12px; padding: 10px 12px; }
  .ad-li-dstrip span { display: grid; font-size: 13px; } .ad-li-dstrip small { font-size: 11px; color: var(--ink-soft); font-weight: 700; letter-spacing: .04em; } .ad-li-dstrip b { font: 800 20px ui-monospace, Consolas, monospace; letter-spacing: .12em; color: var(--act); }
  .ad-li-otp { border: 0; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; min-width: 0; }
  .ad-li-otp legend { font-size: 12.5px; font-weight: 700; margin-bottom: 6px; padding: 0; }
  .ad-li-otp input { width: 100%; min-width: 0; height: 54px; text-align: center; font: 800 22px ui-monospace, Consolas, monospace; border: 1.5px solid var(--a-line); border-radius: 12px; background: var(--a-surf); color: var(--ink); padding: 0; transition: border-color .2s, box-shadow .2s; }
  .ad-li-otp input:nth-of-type(3) { margin-right: 8px; }
  .ad-li-otp input:focus { outline: 0; border-color: var(--pri); box-shadow: 0 0 0 3px var(--pri-soft); }
  .ad-li-otp.bad input { border-color: var(--warn); animation: ad-li-shake .35s ease; }
  @keyframes ad-li-shake { 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
  .ad-li-otp input[disabled] { background: var(--bg2); }
  .ad-li-done { display: grid; justify-items: center; gap: 8px; text-align: center; padding: 20px 0 6px; }
  .ad-li-done .ok { width: 60px; height: 60px; border-radius: 50%; background: var(--ok); color: #fff; display: grid; place-items: center; animation: ad-li-pop .5s var(--ease); } .ad-li-done .ok .ic { width: 28px; height: 28px; }
  .ad-li-done h2 { font-size: 24px; margin: 4px 0 0; } .ad-li-done p { margin: 0; color: var(--mute); }
  .ad-li-prog { width: 160px; height: 4px; border-radius: 99px; background: var(--bg2); overflow: hidden; margin-top: 8px; }
  .ad-li-prog i { display: block; height: 100%; background: var(--pri); transform-origin: left; animation: ad-li-bar 1.6s var(--ease) both; }
  .ad-li-under { display: flex; gap: 6px 14px; flex-wrap: wrap; justify-content: center; margin: 0; font-size: 12.5px; color: var(--mute); max-width: 420px; text-align: center; }
  .ad-li-under a { display: inline-flex; gap: 3px; align-items: center; color: var(--ink2); font-weight: 700; text-decoration: none; } .ad-li-under .ic { width: 14px; height: 14px; }

  /* D · status board */
  .ad-li-d { background: var(--ink); color: #E7ECF1; display: grid; grid-template-rows: auto 1fr auto; }
  .ad-li-d .top { display: flex; gap: 10px 14px; align-items: center; flex-wrap: wrap; padding: 16px 26px; padding-right: 440px; border-bottom: 1px solid var(--ink-line); font-size: 13px; }
  .ad-li-d .ttl { font-size: 11.5px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-soft); }
  .ad-li-d .sm { font-weight: 600; } .ad-li-d .clk { color: var(--ink-soft); font-size: 12.5px; flex-basis: 100%; }
  .ad-li-d .board { display: grid; grid-template-columns: minmax(0, 1fr) minmax(340px, 400px) minmax(0, 1fr); gap: 16px; padding: 28px 26px; align-items: center; }
  .ad-li-d .col { display: grid; gap: 12px; min-width: 0; }
  .ad-li-tile { background: #1A2833; border: 1px solid var(--ink-line); border-radius: 14px; padding: 13px 14px; display: grid; gap: 6px; animation: ad-li-in .45s var(--ease) both; }
  .ad-li-d .col:last-child .ad-li-tile:nth-child(1) { animation-delay: .05s; } .ad-li-tile:nth-child(2) { animation-delay: .1s; } .ad-li-tile:nth-child(3) { animation-delay: .15s; }
  .ad-li-tile .h { display: flex; gap: 8px; justify-content: space-between; align-items: flex-start; }
  .ad-li-tile .nm { font-weight: 800; font-size: 14.5px; color: #fff; display: grid; } .ad-li-tile .nm small { font-weight: 600; font-size: 12px; color: var(--ink-soft); }
  .ad-li-tile p { margin: 0; font-size: 12.5px; color: var(--ink-soft); line-height: 1.45; }
  .ad-li-dot { position: relative; width: 7px; height: 7px; border-radius: 50%; background: currentColor; display: inline-block; flex: none; }
  .ad-li-dot.ok::after { content: ""; position: absolute; inset: 0; border-radius: 50%; background: currentColor; animation: ad-li-pulse 2.2s ease-out infinite; }
  .ad-li-df { background: var(--a-surf); color: var(--ink); border-radius: 20px; padding: 26px; display: grid; gap: 14px; box-shadow: 0 40px 80px -40px rgba(0,0,0,.8); animation: ad-li-in .5s var(--ease); }
  .ad-li-df h1 { font-size: 28px; letter-spacing: -.03em; margin: -2px 0 0; }
  .ad-li-d .bot { padding: 14px 26px 18px; border-top: 1px solid var(--ink-line); font-size: 12.5px; color: var(--ink-soft); }

  @container site (max-width: 700px) {
    .ad-li-mock { left: 8px; right: 8px; top: 8px; max-width: none; } .ad-li-mock > span { display: none; }
    .ad-li-b { grid-template-columns: minmax(0, 1fr); }
    .ad-li-b .bg { bottom: auto; height: 340px; }
    .ad-li-b .left { min-height: 340px; padding: 60px 18px 50px; }
    .ad-li-b .pl { font-size: 26px; }
    .ad-li-b .card { margin: -34px 12px 20px; padding: 24px 18px; align-self: start; }
    .ad-li-c { padding: 64px 14px 30px; place-content: start center; }
    .ad-li-c .card { padding: 22px 18px; }
    .ad-li-otp { gap: 6px; } .ad-li-otp input { height: 48px; font-size: 19px; } .ad-li-otp input:nth-of-type(3) { margin-right: 4px; }
    .ad-li-tabs button { font-size: 12px; padding: 9px 4px; }
    .ad-li-d .top { padding: 56px 14px 12px; }
    .ad-li-d .board { grid-template-columns: minmax(0, 1fr); padding: 16px 12px; gap: 12px; }
    .ad-li-df { order: -1; padding: 22px 18px; }
    .ad-li-d .col { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .ad-li-tile { padding: 10px; } .ad-li-tile .h { flex-direction: column; } .ad-li-tile p { font-size: 12px; }
    .ad-li-d .bot { padding: 12px 14px 16px; }
  }
  @media (prefers-reduced-motion: reduce) {
    [class*="ad-li-"], [class*="ad-li-"] *, [class*="ad-li-"]::before, [class*="ad-li-"]::after { animation: none !important; transition: none !important; }
  }`;

  const NOTE_LB = 'Postcard. The whole page is one real destination photo (Udaipur, Ladakh, Munnar, Goa — the thumbs cross-fade between them), with the place and the package it sells captioned bottom-left, like the storefront. The form is a solid white card floating on the right: same fields, demo notice, show-password, caps-lock hint and error copy as today. Signing in turns the same card into a hand-off instead of a blank redirect: "Welcome back, Viraj" with the four things waiting (2 departures this week, 3 holds expire today, 5 enquiries, ₹1.18 L due) and one button to the dashboard. On a phone the photo becomes a 340 px header and the card overlaps its bottom edge.';
  const NOTE_LC = 'One-time code. A minimal centred card on a dotted canvas, with two methods in one segmented control: "Email me a code" (default) and "Password". The code path is two short steps: email, then six digit boxes that auto-advance, accept a paste and shake on a wrong code. Like the live customer sign-in, a demo address gets the code printed in a dark strip with "Fill it in" and nothing is emailed. Codes last 10 minutes, a new one cancels the old, too many tries lock the boxes. Success is a check and a short progress bar into the dashboard. On a phone the card fills the width; the boxes shrink but stay 48 px tall.';
  const NOTE_LD = 'Status board. A dark operations screen with the form in the middle and six health tiles around it, every one with a word: Payments (Razorpay, Test mode), Email (Gmail SMTP, Sending), Site, API, Database and Release (main · dce6e41). A header rolls them up ("All normal" or "1 problem") with the check time. If email is down, the form says so before you try a reset. A footer promises health only: no bookings, names or money before sign-in. On a phone the form comes first and the tiles fall into a two-column grid below it.';

  TS.addVariants('login', [
    { id: 'B', name: 'Postcard', note: NOTE_LB, tradeoff: 'The warmest first impression and a useful landing, but the photo is decoration on a page only one person ever sees.', render: lbRender, mount: lbMount },
    { id: 'C', name: 'One-time code', note: NOTE_LC, tradeoff: 'No password to forget or leak, but it needs a new code-by-email endpoint for the owner and depends on email working.', render: lcRender, mount: lcMount },
    { id: 'D', name: 'Status board', note: NOTE_LD, tradeoff: 'Catches a broken payment or email setup before the day starts, but shows system facts on a public URL, so it must stay health-only.', render: ldRender, mount: ldMount },
  ], css2);
})();
