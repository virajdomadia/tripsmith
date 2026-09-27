/* Admin redesign · round 3 · new INTERIORS for Bookings desk and Booking detail (layouts B, C, D each).
   Admin style A (Ink rail) is fixed; these change the page structure, not the chrome.
   Desk:   B Departure board (the departure is the object) · C Triage queue (the next action is the object) · D Money ledger (the rupee is the object)
   Detail: B Case file (one chronological thread) · C Lifecycle (a state machine with only valid next moves) · D Document (the voucher/invoice is the editor)
   Data mirrors admin-ops.js (same refs, names, amounts). "Now" is Sun 27 Sep 2026, 4:20 pm IST. Loads after admin-ops.js. */
(() => {
  const TS = window.TS;
  const { inr, lakh, esc, ICON, PKGS } = TS;

  /* ---------- helpers (as admin-ops.js) ---------- */
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dt = ([m, d], y = 2026) => `${WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MON[m - 1]}`;
  const wd = ([m, d]) => WD[new Date(Date.UTC(2026, m - 1, d)).getUTCDay()];
  const addDays = ([m, d], n) => { const x = new Date(Date.UTC(2026, m - 1, d + n)); return [x.getUTCMonth() + 1, x.getUTCDate()]; };
  const daysTo = ([m, d]) => Math.round((Date.UTC(2026, m - 1, d) - Date.UTC(2026, 8, 27)) / 864e5);
  const ord = ([m, d]) => m * 40 + d;
  const party = (a, c = 0) => `${a} ${a === 1 ? 'adult' : 'adults'}${c ? `, ${c} ${c === 1 ? 'child' : 'children'}` : ''}`;
  const V25 = '<span class="a-chip ops-v25" title="New in v2.5">v2.5</span>';
  const first = (n) => n.split(' ')[0];
  const paise = (n) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const RM = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return true; } };

  /* ---------- seed (copied from admin-ops.js; keep in step) ---------- */
  const DEPS = {
    'kasol-10-2': { pkg: 'kasol', d: [10, 2], seats: 20, booked: 16, held: 2, badge: 'ff', miss: 2 },
    'shimla-10-4': { pkg: 'shimla', d: [10, 4], seats: 16, booked: 9, held: 0, badge: 'g', miss: 0 },
    'goa-10-9': { pkg: 'goa', d: [10, 9], seats: 24, booked: 24, held: 0, badge: 'so', miss: 0 },
    'leh-10-11': { pkg: 'leh', d: [10, 11], seats: 12, booked: 8, held: 2, badge: 'ff', miss: 0 },
    'manali-10-16': { pkg: 'manali', d: [10, 16], seats: 14, booked: 6, held: 0, badge: 'g', miss: 0 },
    'munnar-10-18': { pkg: 'munnar', d: [10, 18], seats: 16, booked: 11, held: 1, badge: 'ff', miss: 2 },
    'jaipur-10-23': { pkg: 'jaipur', d: [10, 23], seats: 18, booked: 5, held: 0, badge: '', miss: 0 },
    'jaipur-10-30': { pkg: 'jaipur', d: [10, 30], seats: 18, booked: 7, held: 0, badge: '', miss: 1 },
    'manali-10-31': { pkg: 'manali', d: [10, 31], seats: 14, booked: 4, held: 0, badge: '', miss: 4 },
    'goa-11-1': { pkg: 'goa', d: [11, 1], seats: 24, booked: 10, held: 0, badge: '', miss: 0 },
    'kasol-9-25': { pkg: 'kasol', d: [9, 25], seats: 20, booked: 18, held: 0, badge: '', miss: 0 },
  };
  const BADGE = { ff: '<span class="a-chip warn">Filling fast</span>', so: '<span class="a-chip mute">Sold out</span>', g: '<span class="a-chip ok">Guaranteed departure</span>', '': '<span class="a-chip mute">Open</span>' };
  const keyOf = (b) => `${b.pkg}-${b.dep[0]}-${b.dep[1]}`;
  const depOf = (b) => DEPS[keyOf(b)];
  const left = (x) => x.seats - x.booked - x.held;
  const meter = (x) => `<span class="a-meter" style="--v:${(x.booked / x.seats) * 100}%;--h:${(x.held / x.seats) * 100}%" aria-hidden="true"></span>`;

  const CANCEL = { hold_expired: 'Hold expired', payment_failed: 'Payment failed', seats_gone: 'Seats gone', cancellation_approved: 'Cancellation approved', owner_released: 'Released by owner' };
  const B = (ref, lead, ph, em, pkg, dep, a, c, total, paid, st, o = {}) => ({ ref, lead, ph, em, pkg, dep, a, c, total, paid, st, hold: '', reason: '', refund: false, creq: false, booked: '', ch: 'Web', due: null, miss: 0, coupon: '', agreed: 0, ...o });
  const BOOKINGS = [
    B('TB-3SK7DF', 'Sameer Khan', '99205 61840', 'sameer.khan@customer.in', 'munnar', [10, 18], 1, 0, 21999, 0, 'pending', { hold: '4:47 pm', booked: 'Just now' }),
    B('TB-6GH1RP', 'Pooja Nair', '98470 22519', 'pooja.nair@customer.in', 'kasol', [10, 2], 2, 0, 10998, 0, 'pending', { hold: '4:41 pm', booked: '3 min ago' }),
    B('TB-4HX8RD', 'Arjun Mehta', '98201 44731', 'arjun.mehta@customer.in', 'leh', [10, 11], 2, 0, 65998, 0, 'pending', { hold: '4:32 pm', booked: '12 min ago' }),
    B('TB-8RT2KS', 'Vikram Singh Rathore', '94140 58213', 'vikram.rathore@customer.in', 'shimla', [10, 4], 2, 0, 36998, 0, 'pending', { booked: 'Yesterday' }),
    B('TB-9QW3LT', 'Sneha Kulkarni', '97690 13382', 'sneha.kulkarni@customer.in', 'goa', [10, 9], 4, 0, 57996, 57996, 'cancelled', { reason: 'seats_gone', refund: true, booked: '2 days ago' }),
    B('TB-7K2M9Q', 'Kavya Iyer', '98450 22110', 'kavya.iyer@customer.in', 'munnar', [10, 18], 2, 1, 59397, 59397, 'confirmed', { creq: true, booked: '12 Sep' }),
    B('TB-2MV6PA', 'Rohan Deshpande', '90040 88215', 'rohan.d@customer.in', 'kasol', [10, 2], 3, 0, 16497, 16497, 'confirmed', { miss: 2, booked: '3 days ago' }),
    B('TB-4WS6GE', 'Nikhil Joshi', '98860 27403', 'nikhil.joshi@customer.in', 'manali', [10, 31], 3, 1, 72146, 18037, 'partially_paid', { ch: 'Walk-in', due: [10, 1], miss: 4, booked: '6 days ago' }),
    B('TB-8LM3QJ', 'Tanvi Shah', '99870 41265', 'tanvi.shah@customer.in', 'goa', [11, 1], 2, 0, 28998, 7250, 'partially_paid', { ch: 'WhatsApp', due: [10, 2], booked: '5 days ago' }),
    B('TB-6JN4ZC', 'Farhan Qureshi', '98191 55670', 'farhan.q@customer.in', 'jaipur', [10, 30], 2, 0, 55998, 14000, 'partially_paid', { ch: 'Phone', due: [9, 30], miss: 1, booked: '21 Sep' }),
    B('TB-5DC9MU', 'Meenakshi Pillai', '94472 30918', 'meenakshi.pillai@customer.in', 'munnar', [10, 18], 2, 0, 39598, 39598, 'confirmed', { ch: 'Enquiry', coupon: 'FESTIVE10', miss: 2, booked: '19 Sep' }),
    B('TB-2KQ8VX', 'Ishita Chawla', '98110 70246', 'ishita.chawla@customer.in', 'jaipur', [10, 23], 2, 0, 55998, 55998, 'cancelled', { reason: 'cancellation_approved', refund: true, agreed: 55998, booked: '28 Aug' }),
    B('TB-7YB2NH', 'Aditya Rao', '70214 85563', 'aditya.rao@customer.in', 'leh', [10, 11], 1, 0, 32999, 0, 'cancelled', { reason: 'hold_expired', booked: 'Yesterday' }),
    B('TB-3PL7YB', 'Ananya Bose', '98300 42178', 'ananya.bose@customer.in', 'manali', [10, 16], 2, 0, 38998, 38998, 'confirmed', { booked: '8 Sep' }),
    B('TB-9VC4KA', 'Karan Malhotra', '98115 60392', 'karan.malhotra@customer.in', 'leh', [10, 11], 2, 0, 65998, 65998, 'confirmed', { booked: '2 Sep' }),
    B('TB-1ZF5WE', 'Harpreet Kaur', '98723 90114', 'harpreet.kaur@customer.in', 'kasol', [9, 25], 2, 0, 10998, 10998, 'completed', { booked: '10 Sep' }),
  ];
  const byRef = (r) => BOOKINGS.find((b) => b.ref === r);
  const owed = (b) => b.total - b.paid;
  const seatsOf = (b) => b.a + b.c;

  const stateChip = (b) => {
    if (b.st === 'pending') return b.hold ? `<span class="a-chip warn">${ICON.clock}Pending · hold live</span>` : '<span class="a-chip mute">Pending · hold lapsed</span>';
    if (b.st === 'confirmed') return `<span class="a-chip ok">${ICON.check}Confirmed</span>`;
    if (b.st === 'partially_paid') return '<span class="a-chip info">Part paid</span>';
    if (b.st === 'completed') return '<span class="a-chip mute">Completed</span>';
    return `<span class="a-chip mute">Cancelled · ${CANCEL[b.reason]}</span>`;
  };
  const flagChips = (b) => (b.refund ? '<span class="a-chip bad">Refund needed</span>' : '') + (b.creq ? '<span class="a-chip warn">Cancel requested</span>' : '');
  /* the one thing the owner does next on a booking (short form) */
  const nextAct = (b) => {
    if (b.creq) return ['Review request', 'warn'];
    if (b.refund) return [`Refund ${inr(b.agreed || b.paid)}`, 'bad'];
    if (b.st === 'pending' && b.hold) return [`Held until ${b.hold}`, 'wait'];
    if (b.st === 'pending') return ['Mark paid offline', 'mute'];
    if (b.due) return [`Collect ${inr(owed(b))}`, 'info'];
    if (b.miss) return ['Send details link', 'info'];
    return ['', ''];
  };
  const needsYou = (b) => { const t = nextAct(b)[1]; return t && t !== 'wait'; };

  /* ---------- seed: money movements (September; one row per payment, refund or claim) ---------- */
  // [date, time, ref, kind, method, amount (+ in, − out), reference, receipt, state]
  const MOVES = [
    [[9, 27], '10:05 am', 'TB-8RT2KS', 'Claimed by customer', 'UPI to HDFC · per WhatsApp', 36998, 'UTR 426981533047', '', 'claim'],
    [[9, 26], '3:44 pm', 'TB-8RT2KS', 'Full payment', 'Razorpay · UPI', 36998, 'pay_P9aT4kLm20', '', 'failed'],
    [[9, 25], '11:26 am', 'TB-9QW3LT', 'Refund owed', 'Razorpay · to the card', -57996, 'Seats gone before it arrived', '', 'owe'],
    [[9, 25], '11:26 am', 'TB-9QW3LT', 'Full payment', 'Razorpay · card', 57996, 'pay_P8zD6vYu58', 'RC/2026-27/0151', 'late'],
    [[9, 24], '6:12 pm', 'TB-2MV6PA', 'Full payment', 'Razorpay · UPI', 16497, 'pay_P8vN3sKe04', 'RC/2026-27/0150', 'ok'],
    [[9, 22], '1:37 pm', 'TB-8LM3QJ', 'Deposit 25%', 'Payment link · UPI', 7250, 'pay_P8nX5bTe66', 'RC/2026-27/0149', 'ok'],
    [[9, 22], '11:02 am', 'TB-2KQ8VX', 'Refund owed', 'Razorpay · to the card', -55998, 'Cancellation approved', '', 'owe'],
    [[9, 21], '4:52 pm', 'TB-6JN4ZC', 'Deposit 25%', 'Bank transfer', 14000, 'UTR 426514098772', 'RC/2026-27/0148', 'ok'],
    [[9, 21], '11:20 am', 'TB-4WS6GE', 'Deposit 25%', 'Cash at office', 18037, 'Cash · receipt book 0412', 'RC/2026-27/0147', 'ok'],
    [[9, 19], '10:05 am', 'TB-5DC9MU', 'Full payment', 'Razorpay · card', 39598, 'pay_P8hL0aWq35', 'RC/2026-27/0146', 'ok'],
    [[9, 12], '9:16 pm', 'TB-7K2M9Q', 'Full payment', 'Razorpay · card', 59397, 'pay_P8kR7nWc93', 'RC/2026-27/0139', 'ok'],
    [[9, 10], '8:41 am', 'TB-1ZF5WE', 'Full payment', 'Razorpay · UPI', 10998, 'pay_P7wE2cHs19', 'RC/2026-27/0137', 'ok'],
    [[9, 8], '7:55 pm', 'TB-3PL7YB', 'Full payment', 'Razorpay · card', 38998, 'pay_P7rT9yLa82', 'RC/2026-27/0135', 'ok'],
    [[9, 2], '12:30 pm', 'TB-9VC4KA', 'Full payment', 'Razorpay · netbanking', 65998, 'pay_P7dF4mQo27', 'RC/2026-27/0131', 'ok'],
  ];
  const MSTATE = {
    ok: ['ok', 'Captured'], late: ['warn', 'Captured · late'], failed: ['mute', 'Failed'],
    owe: ['bad', 'Refund to send'], claim: ['warn', 'Claimed · not recorded'], done: ['ok', 'Refunded'], rec: ['ok', 'Recorded'],
  };

  /* ---------- shared CSS bits ---------- */
  const common = `
  .ad-bk, .ad-bd { display: grid; gap: 16px; min-width: 0; }
  .ad-bk .mono, .ad-bd .mono { font-family: ui-monospace, "SF Mono", Consolas, monospace; font-size: 12.5px; letter-spacing: .02em; }
  .ad-bk .muted, .ad-bd .muted { color: var(--mute); }
  .ad-bk .lnk, .ad-bd .lnk { color: var(--pri); font: inherit; font-weight: 700; text-decoration: none; background: none; border: 0; padding: 0; cursor: pointer; }
  .ad-bk .lnk:hover, .ad-bd .lnk:hover { text-decoration: underline; }
  .ad-bk .chips, .ad-bd .chips { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .ad-bk .eyeb, .ad-bd .eyeb { font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--mute); }
  .ad-bk .ic, .ad-bd .ic { width: 16px; height: 16px; flex: none; }
  .ad-bk kbd, .ad-bd kbd { font: 700 11px "DM Sans", sans-serif; border: 1px solid var(--a-line); border-bottom-width: 2px; border-radius: 6px; padding: 0 5px; background: var(--a-surf); color: var(--ink2); }
  .ad-bk [hidden], .ad-bd [hidden] { display: none !important; }
  @keyframes ad-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .ad-bk *, .ad-bd * { animation: none !important; transition: none !important; } }`;

  /* =====================================================================
     BOOKINGS DESK · B · Departure board
     ===================================================================== */
  const bb = { mode: 'all', q: '', sel: new Set(), past: false, focus: '' };
  const DEPKEYS = Object.keys(DEPS).filter((k) => DEPS[k].d[0] >= 10).sort((a, b) => ord(DEPS[a].d) - ord(DEPS[b].d));
  const inDep = (k) => BOOKINGS.filter((b) => keyOf(b) === k);
  const others = (k) => {
    const x = DEPS[k];
    const listed = inDep(k).filter((b) => b.st === 'confirmed' || b.st === 'partially_paid').reduce((s, b) => s + seatsOf(b), 0);
    const seats = Math.max(0, x.booked - listed);
    return { seats, n: seats ? Math.max(1, Math.round(seats / 2.5)) : 0 };
  };
  const bbMatch = (b) => {
    if (bb.mode === 'act' && !needsYou(b)) return false;
    if (bb.q) { const q = bb.q.toLowerCase().replace(/\s/g, ''); if (![b.ref, b.lead, b.ph, b.em].some((s) => s.toLowerCase().replace(/\s/g, '').includes(q))) return false; }
    return true;
  };

  const bbRow = (b) => {
    const [act, tone] = nextAct(b);
    const dim = b.st === 'cancelled' && !b.refund;
    return `<div class="ad-bk-row ${dim ? 'dim' : ''}" data-ref="${b.ref}">
      <label class="ck"><input type="checkbox" data-pick="${b.ref}" ${bb.sel.has(b.ref) ? 'checked' : ''} ${dim ? 'disabled' : ''} aria-label="Select ${b.ref}"></label>
      <span class="who"><b>${esc(b.lead)}</b><small><span class="mono">${b.ref}</span> · ${b.ch === 'Web' ? 'Web' : `${b.ch} · counter`}</small></span>
      <span class="pax"><b class="num">${seatsOf(b)}</b> <small>${b.c ? `${b.a} + ${b.c} child` : b.a === 1 ? 'adult' : 'adults'}</small></span>
      <span class="money"><b class="num">${inr(b.paid)}</b><small>of ${inr(b.total)}${b.due ? ` · due ${dt(b.due)}` : ''}</small></span>
      <span class="chips st">${stateChip(b)}${flagChips(b)}${b.miss ? `<span class="a-chip warn">${b.miss} details missing</span>` : ''}</span>
      <span class="go">${act ? (tone === 'wait' ? `<span class="wait">${ICON.clock}${act}</span>` : `<button class="a-btn sm ${tone === 'bad' || tone === 'warn' ? '' : 'ghost'}">${act}</button>`) : '<span class="muted ok">Nothing to do</span>'}</span>
    </div>`;
  };

  const bbSection = (k) => {
    const x = DEPS[k], p = PKGS[x.pkg], list = inDep(k), rows = list.filter(bbMatch), o = others(k);
    const todo = list.filter(needsYou).length;
    if (bb.mode === 'act' && !rows.length) return '';
    if (bb.q && !rows.length) return '';
    const ready = x.booked ? Math.round(((x.booked - x.miss) / x.booked) * 100) : 100;
    const collect = list.filter((b) => b.due).reduce((s, b) => s + owed(b), 0);
    const d = daysTo(x.d);
    return `<section class="ad-bk-dep a-card ${bb.focus === k ? 'focus' : ''}" id="dep-${k}" aria-labelledby="h-${k}">
      <header class="dh">
        <div class="date" aria-hidden="true"><b class="num">${x.d[1]}</b><span>${wd(x.d)}<br>${MON[x.d[0] - 1]}</span></div>
        <div class="ttl"><h2 id="h-${k}">${p.name}</h2>
          <span class="muted">${dt(x.d)} → ${dt(addDays(x.d, p.nights))} · departs in ${d} days · ${p.dest}</span>
          <span class="chips">${BADGE[x.badge]}${todo ? `<span class="a-chip warn">${todo} to do</span>` : '<span class="a-chip ok">Nothing to do</span>'}</span></div>
        <dl class="stats">
          <div class="seat"><dt>Seats</dt><dd>${meter(x)}<span class="num">${x.booked} booked · ${x.held} held · ${left(x)} left</span></dd></div>
          <div><dt>Ready ${V25}</dt><dd><span class="num">${ready}%</span><small>${x.miss ? `${x.miss} travellers missing details` : 'All details in'}</small></dd></div>
          <div><dt>To collect</dt><dd><span class="num">${collect ? inr(collect) : '—'}</span><small>${collect ? 'balance due' : 'nothing owed'}</small></dd></div>
        </dl>
        <div class="acts"><button class="a-btn ghost sm" data-all="${k}">Select all</button><a href="#" class="a-btn ghost sm">${ICON.file}Manifest</a><a href="#" class="a-btn ghost sm">${ICON.plus}Add booking ${V25}</a></div>
      </header>
      <div class="rows" role="list">${rows.map(bbRow).join('')}
        ${o.n && bb.mode === 'all' && !bb.q ? `<div class="ad-bk-rest"><span>${ICON.check}<b>${o.n} more ${o.n === 1 ? 'booking' : 'bookings'} · ${o.seats} seats</b> · paid in full, details in, nothing to do</span><a href="#" class="lnk">Show them</a></div>` : ''}
      </div>
    </section>`;
  };

  const renderDeskB = () => {
    const act = BOOKINGS.filter(needsYou).length;
    const past = DEPS['kasol-9-25'];
    const main = `<div class="ad-bk ad-bk-b">
      <div class="a-head"><h1>Bookings</h1><div class="sub">By departure · next 5 weeks · ${DEPKEYS.length} departures · ${act} bookings need you</div>
        <div class="acts"><a href="#" class="a-btn ghost sm">${ICON.down}Export CSV</a><a href="#" class="a-btn act sm">${ICON.plus}New booking ${V25}</a></div></div>

      <nav class="ad-bk-ruler" aria-label="Jump to a departure">${DEPKEYS.map((k) => {
        const x = DEPS[k], n = inDep(k).filter(needsYou).length;
        return `<button data-jump="${k}" aria-pressed="${bb.focus === k}"><small>${wd(x.d)} ${x.d[1]} ${MON[x.d[0] - 1]}</small><b>${PKGS[x.pkg].dest}</b>${meter(x)}<em class="${n ? 'todo' : ''}">${n ? `${n} to do` : left(x) ? `${left(x)} left` : 'Sold out'}</em></button>`;
      }).join('')}</nav>

      <div class="a-bar">
        <div class="a-seg" role="group" aria-label="Show"><button data-mode="all" aria-pressed="${bb.mode === 'all'}">Everything</button><button data-mode="act" aria-pressed="${bb.mode === 'act'}">Needs you <span class="num">${act}</span></button></div>
        <label class="a-search">${ICON.search}<input type="search" id="bb-q" value="${esc(bb.q)}" placeholder="Ref, name, phone or email" aria-label="Search bookings"></label>
        <select class="a-select" aria-label="Channel (v2.5)"><option>Any channel · v2.5</option><option>Web</option><option>Phone</option><option>Walk-in</option><option>WhatsApp</option><option>Enquiry</option></select>
        <span class="ad-bk-legend"><span><i></i>Booked</span><span><i class="h"></i>Held</span><span><i class="f"></i>Free</span></span>
      </div>

      <div class="ad-bk-deps" id="bb-deps">${DEPKEYS.map(bbSection).join('') || '<div class="a-card"><div class="a-empty">No bookings match. Clear the search or show everything.</div></div>'}</div>

      <section class="ad-bk-past a-card">
        <button class="ph" data-past aria-expanded="${bb.past}"><span>${ICON.chevD}<b>Departed</b> · last 7 days</span><span class="muted">${PKGS.kasol.name} · ${dt(past.d)} · ${past.booked} travellers · <span class="a-chip mute">Completed</span></span></button>
        <div class="rows" ${bb.past ? '' : 'hidden'}>${inDep('kasol-9-25').map(bbRow).join('')}<div class="ad-bk-rest"><span>${ICON.check}<b>6 more bookings · 16 seats</b> · completed</span><a href="#" class="lnk">Review requests went out ${V25}</a></div></div>
      </section>

      <div class="ad-bk-batch" id="bb-batch" ${bb.sel.size ? '' : 'hidden'} role="region" aria-label="Selected bookings">
        <b id="bb-n">${bb.sel.size} selected</b>
        <button class="a-btn sm act">${ICON.link}Send details link ${V25}</button>
        <button class="a-btn sm ghost">${ICON.rupee}Balance reminder ${V25}</button>
        <button class="a-btn sm ghost">${ICON.wa}WhatsApp</button>
        <button class="a-btn sm ghost">${ICON.down}CSV</button>
        <button class="lnk" id="bb-clear">Clear</button>
      </div>
    </div>`;
    return TS.adminShell('Bookings', main);
  };
  const mountDeskB = (site, rerender) => {
    site.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { bb.mode = b.dataset.mode; rerender(); }));
    const past = site.querySelector('[data-past]'); if (past) past.addEventListener('click', () => { bb.past = !bb.past; rerender(); });
    const sync = () => {
      const bar = site.querySelector('#bb-batch'), n = site.querySelector('#bb-n');
      if (bar) bar.hidden = !bb.sel.size; if (n) n.textContent = `${bb.sel.size} selected`;
      site.querySelectorAll('[data-pick]').forEach((c) => { c.checked = bb.sel.has(c.dataset.pick); c.closest('.ad-bk-row').classList.toggle('sel', c.checked); });
    };
    site.querySelectorAll('[data-pick]').forEach((c) => c.addEventListener('change', () => { if (c.checked) bb.sel.add(c.dataset.pick); else bb.sel.delete(c.dataset.pick); sync(); }));
    site.querySelectorAll('[data-all]').forEach((b) => b.addEventListener('click', () => {
      const refs = inDep(b.dataset.all).filter((x) => needsYou(x) || x.st === 'confirmed' || x.st === 'partially_paid').map((x) => x.ref);
      const all = refs.every((r) => bb.sel.has(r));
      refs.forEach((r) => (all ? bb.sel.delete(r) : bb.sel.add(r))); sync();
    }));
    const cl = site.querySelector('#bb-clear'); if (cl) cl.addEventListener('click', () => { bb.sel.clear(); sync(); });
    site.querySelectorAll('[data-jump]').forEach((b) => b.addEventListener('click', () => {
      bb.focus = b.dataset.jump;
      site.querySelectorAll('[data-jump]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      site.querySelectorAll('.ad-bk-dep').forEach((s) => s.classList.toggle('focus', s.id === `dep-${bb.focus}`));
      const s = site.querySelector(`#dep-${bb.focus}`);
      if (s && s.scrollIntoView) s.scrollIntoView({ behavior: RM() ? 'auto' : 'smooth', block: 'start' });
    }));
    const q = site.querySelector('#bb-q');
    if (q) q.addEventListener('input', () => {
      bb.q = q.value.trim();
      const box = site.querySelector('#bb-deps');
      if (box) { box.innerHTML = DEPKEYS.map(bbSection).join('') || '<div class="a-card"><div class="a-empty">No bookings match. Clear the search or show everything.</div></div>'; mountRowsB(); }
    });
    const mountRowsB = () => {
      site.querySelectorAll('#bb-deps [data-pick]').forEach((c) => c.addEventListener('change', () => { if (c.checked) bb.sel.add(c.dataset.pick); else bb.sel.delete(c.dataset.pick); sync(); }));
      site.querySelectorAll('#bb-deps [data-all]').forEach((b) => b.addEventListener('click', () => {
        const refs = inDep(b.dataset.all).filter((x) => needsYou(x) || x.st === 'confirmed' || x.st === 'partially_paid').map((x) => x.ref);
        const all = refs.every((r) => bb.sel.has(r)); refs.forEach((r) => (all ? bb.sel.delete(r) : bb.sel.add(r))); sync();
      }));
      sync();
    };
    sync();
  };

  /* =====================================================================
     BOOKINGS DESK · C · Triage queue
     ===================================================================== */
  const LANES = { decide: 'Decide', out: 'Money out', collect: 'Collect', chase: 'Chase details' };
  const TRI = [
    { ref: 'TB-7K2M9Q', lane: 'decide', h: 'Kavya asked to cancel', age: 'Asked yesterday, 7:42 pm · 22 days before departure', stake: 'Seats held until you decide · 3 seats', kind: 'cancel', done: 'Approved · refund sent' },
    { ref: 'TB-9QW3LT', lane: 'out', h: `Refund ${inr(57996)} to Sneha`, age: 'Since Fri 25 Sep · paid 9 minutes after the hold lapsed', stake: 'Money in, no seat behind it', kind: 'refund', done: 'Refunded through Razorpay' },
    { ref: 'TB-2KQ8VX', lane: 'out', h: `Refund ${inr(55998)} to Ishita`, age: 'Approved Tue 22 Sep · agreed in full', stake: 'Promised 5 days ago', kind: 'refund', done: 'Refunded through Razorpay' },
    { ref: 'TB-8RT2KS', lane: 'decide', h: `Vikram says he paid ${inr(36998)} by UPI`, age: 'WhatsApp today, 10:05 am · hold lapsed yesterday', stake: 'Shimla 4 Oct has 7 seats left, the party of 2 fits', kind: 'offline', done: 'Marked paid · confirmed' },
    { ref: 'TB-6JN4ZC', lane: 'collect', h: `Collect ${inr(41998)} from Farhan`, age: 'Balance due Wed 30 Sep · 3 days', stake: 'Booked by phone · reminder sent today', kind: 'balance', done: 'Payment link sent' },
    { ref: 'TB-4WS6GE', lane: 'collect', h: `Collect ${inr(54109)} from Nikhil`, age: 'Balance due Thu 1 Oct · 4 days', stake: 'Walk-in · paid the deposit in cash', kind: 'balance', done: 'Payment link sent' },
    { ref: 'TB-8LM3QJ', lane: 'collect', h: `Collect ${inr(21748)} from Tanvi`, age: 'Balance due Fri 2 Oct · 5 days', stake: 'WhatsApp booking · deposit by payment link', kind: 'balance', done: 'Payment link sent' },
    { ref: 'TB-2MV6PA', lane: 'chase', h: '2 of Rohan’s travellers have no details', age: 'Departs Fri 2 Oct · details lock Tue 29 Sep', stake: 'ID, emergency contact and food missing', kind: 'details', done: 'Details link sent' },
    { ref: 'TB-5DC9MU', lane: 'chase', h: '2 of Meenakshi’s travellers have no details', age: 'Departs Sun 18 Oct · details lock Thu 15 Oct', stake: 'Reminder went out 19 Sep', kind: 'details', done: 'Details link sent' },
  ];
  const tq = { i: 0, st: {}, dec: 'approve', kb: false };
  const triOpen = () => TRI.filter((t) => !tq.st[t.ref]);

  const triForm = (t, b) => {
    if (t.kind === 'cancel') {
      const sug = b.paid - Math.floor(b.total / 2);
      return `<blockquote class="q">“My father has surgery on 16 Oct in Chennai, so we can’t travel that week. Could we get whatever refund the policy allows?”</blockquote>
        <p class="pol">Policy at 22 days out: <b>50% of the package price is retained</b>. Paid ${inr(b.paid)}.</p>
        <div class="a-seg" role="group" aria-label="Decision"><button data-dec="approve" aria-pressed="${tq.dec === 'approve'}">Approve</button><button data-dec="reject" aria-pressed="${tq.dec === 'reject'}">Reject</button><button data-dec="date" aria-pressed="${tq.dec === 'date'}">Offer a date change</button></div>
        <div class="a-row2" data-d="approve" ${tq.dec === 'approve' ? '' : 'hidden'}><div class="a-field"><label for="t-r">Refund (₹)</label><input id="t-r" class="num" inputmode="numeric" value="${sug}"><span class="hint">The tier suggests ${inr(sug)}.</span></div>
          <div class="a-field"><label for="t-n">Note to Kavya</label><input id="t-n" value="Sorry to hear about your father. Refunding ${inr(sug)} within 5–7 working days."></div></div>
        <div class="a-field" data-d="reject" ${tq.dec === 'reject' ? '' : 'hidden'}><label for="t-w">Why, to the customer</label><input id="t-w" placeholder="The houseboat is already paid for these dates…"><span class="hint">Required. The booking stays confirmed.</span></div>
        <div class="a-field" data-d="date" ${tq.dec === 'date' ? '' : 'hidden'}><label for="t-dd">Move to ${V25}</label><select id="t-dd"><option>Sun 1 Nov · 9 left · same fare</option><option>Sun 15 Nov · 12 left · same fare</option></select><span class="hint">Fee ₹1,000 per traveller at 15–29 days, which you can waive.</span></div>`;
    }
    if (t.kind === 'refund') return `<p class="pol">${b.reason === 'seats_gone' ? `North Goa on ${dt(b.dep)} sold out while the payment was in flight.` : 'You approved the cancellation on 22 Sep and agreed a full refund.'} The money goes back to the card it came from.</p>
        <div class="a-row2"><div class="a-field"><label for="t-ra">Amount</label><input id="t-ra" class="num" value="${b.agreed || b.paid}" inputmode="numeric"><span class="hint">Split across payments, newest first.</span></div>
          <div class="a-field"><label>What the customer gets</label><div class="a-note" style="margin:0">${ICON.mail}<span>Refund email now, and again when Razorpay says processed.</span></div></div></div>`;
    if (t.kind === 'offline') return `<blockquote class="q">“Paid ₹36,998 by UPI to your HDFC account last night.”</blockquote>
        <div class="a-row2"><div class="a-field"><label for="t-u">Reference</label><input id="t-u" value="UTR 426981533047"><span class="hint">Check it against the bank app first.</span></div>
          <div class="a-field"><label for="t-h">How it was paid ${V25}</label><select id="t-h"><option>UPI</option><option>Bank transfer</option><option>Cash</option></select></div></div>`;
    if (t.kind === 'balance') return `<div class="ad-bk-pay"><span class="a-meter" style="--v:${(b.paid / b.total) * 100}%" aria-hidden="true"></span><span class="num"><b>${inr(b.paid)}</b> paid of ${inr(b.total)} · <b>${inr(owed(b))}</b> to go</span></div>
        <p class="pol">Reminders went out 7 days before and today. After 2 days’ grace the booking cancels and the seats free themselves.</p>
        <div class="a-row2"><div class="a-field"><label for="t-l">Send a payment link for ${V25}</label><select id="t-l"><option>${inr(owed(b))} · the full balance</option><option>${inr(Math.round(owed(b) / 2))} · half now</option></select><span class="hint">Parts from ₹1,000; each settles like a web payment.</span></div>
          <div class="a-field"><label for="t-v">Send by</label><select id="t-v"><option>WhatsApp · +91 ${b.ph}</option><option>Email · ${b.em}</option></select></div></div>`;
    return `<p class="pol">ID, emergency contact and food choice are required for this package. The link opens their booking page at the details step.</p>
        <div class="ad-bk-trav">${[[b.lead, 'Complete'], ['Traveller 2', 'Missing'], ['Traveller 3', 'Missing']].slice(0, b.a + b.c).map(([n, s]) => `<span class="a-chip ${s === 'Complete' ? 'ok' : 'warn'}">${esc(n)} · ${s}</span>`).join('')}</div>`;
  };
  const triPrimary = (t, b) => ({ cancel: tq.dec === 'approve' ? `Approve · refund ${inr(b.paid - Math.floor(b.total / 2))}` : tq.dec === 'reject' ? 'Reject the request' : 'Offer the new date', refund: `Refund ${inr(b.agreed || b.paid)} through Razorpay`, offline: 'Mark paid and confirm', balance: 'Send the payment link', details: 'Send details link' })[t.kind];
  const triSecondary = (t) => ({ cancel: '', refund: 'Record a refund made offline', offline: 'Release hold', balance: 'Mark balance paid', details: 'Fill in from a call' })[t.kind];

  const renderDeskC = () => {
    const open = triOpen(), all = TRI.length, doneN = Object.values(tq.st).filter((s) => s === 'done').length;
    if (tq.i >= all) tq.i = 0;
    let cur = TRI[tq.i];
    if (tq.st[cur.ref]) cur = open[0] || null;
    const b = cur ? byRef(cur.ref) : null;
    const pos = cur ? TRI.indexOf(cur) : -1;
    const p = b ? PKGS[b.pkg] : null;
    const holds = BOOKINGS.filter((x) => x.st === 'pending' && x.hold);
    const main = `<div class="ad-bk ad-bk-c" tabindex="-1" id="tri">
      <div class="a-head"><h1>Bookings</h1><div class="sub">Triage · one booking at a time, most urgent first · ${open.length} left of ${all}</div>
        <div class="acts"><a href="#" class="a-btn ghost sm">${ICON.grid}All bookings</a><a href="#" class="a-btn act sm">${ICON.plus}New booking ${V25}</a></div></div>

      <div class="ad-bk-prog" aria-label="Progress"><span class="bar"><i style="transform:scaleX(${(all - open.length) / all})"></i></span>
        <span class="num"><b>${all - open.length}</b> of ${all} cleared · ${doneN} done · ${all - open.length - doneN} snoozed</span>
        <span class="keys"><kbd>J</kbd><kbd>K</kbd> move <kbd>E</kbd> do it <kbd>S</kbd> snooze</span></div>

      <div class="ad-bk-tri">
        <ol class="ad-bk-qlist" aria-label="Queue">${Object.keys(LANES).map((ln) => {
          const items = TRI.filter((t) => t.lane === ln);
          return `<li class="lane"><span class="eyeb">${LANES[ln]} · ${items.filter((t) => !tq.st[t.ref]).length}</span><ol>${items.map((t) => {
            const x = byRef(t.ref), s = tq.st[t.ref];
            return `<li><button data-go="${TRI.indexOf(t)}" aria-current="${cur === t}" class="${s ? 'off' : ''}"><b>${esc(x.lead)}</b><small>${s === 'done' ? `Done · ${t.done}` : s === 'snz' ? 'Snoozed to Mon 28 Sep' : t.age.split(' · ')[0]}</small></button></li>`;
          }).join('')}</ol></li>`;
        }).join('')}</ol>

        ${cur ? `<article class="ad-bk-focus" aria-labelledby="tri-h">
          <div class="top"><span class="eyeb">${LANES[cur.lane]} · ${pos + 1} of ${all}</span><span class="nav"><button class="a-btn ghost sm" data-step="-1" aria-label="Previous">${ICON.chevL}</button><button class="a-btn ghost sm" data-step="1" aria-label="Next">${ICON.chevR}</button></span></div>
          <h2 id="tri-h">${cur.h}</h2>
          <p class="age">${cur.age}</p>
          <div class="ctx"><span><small>Trip</small><b>${p.name}</b><em>${dt(b.dep)} · ${party(b.a, b.c)}</em></span>
            <span><small>Booking</small><b class="mono">${b.ref}</b><em>${b.ch === 'Web' ? 'Web · by the customer' : `${b.ch} · by Viraj D.`}</em></span>
            <span><small>Status</small><span class="chips">${stateChip(b)}</span><em>${cur.stake}</em></span></div>
          <div class="body">${triForm(cur, b)}</div>
          <div class="foot"><button class="a-btn" data-do>${triPrimary(cur, b)} <kbd>E</kbd></button>
            ${triSecondary(cur) ? `<button class="a-btn ghost">${triSecondary(cur)}</button>` : ''}
            <button class="lnk" data-snz>Snooze to tomorrow <kbd>S</kbd></button></div>
        </article>` : `<article class="ad-bk-focus clear"><span class="eyeb">Queue clear</span><h2>Nothing needs you right now.</h2><p class="age">New cancellation requests, refunds, lapsed holds and balances land here as they happen. Snoozed items come back tomorrow at 9 am.</p><div class="foot"><button class="a-btn ghost" data-reset>Start the demo again</button></div></article>`}

        <aside class="ad-bk-side" aria-label="Context">
          ${b ? `<section><span class="eyeb">${esc(b.lead)}</span>
            <div class="contact"><a href="#" class="a-btn ghost sm">${ICON.phone}Call</a><a href="#" class="a-btn ghost sm">${ICON.wa}WhatsApp</a><a href="#" class="a-btn ghost sm">${ICON.mail}Email</a></div>
            <dl class="a-kv"><div><dt>Mobile</dt><dd>+91 ${b.ph}</dd></div><div><dt>Paid</dt><dd>${inr(b.paid)} of ${inr(b.total)}</dd></div><div><dt>Seats</dt><dd>${left(depOf(b))} left on this date</dd></div></dl>
            <a href="#" class="lnk">Open the full booking ${ICON.arrowR}</a></section>` : ''}
          <section><span class="eyeb">Watching · not your move</span>
            ${holds.map((h) => `<div class="w"><b>${esc(h.lead)}</b><span class="muted">${PKGS[h.pkg].dest} · ${inr(h.total)}</span><span class="a-chip warn">${ICON.clock}Held until ${h.hold}</span></div>`).join('')}
            <p class="muted" style="margin:0;font-size:12.5px">Live checkouts free their own seats if payment doesn’t arrive.</p></section>
        </aside>
      </div>
    </div>`;
    return TS.adminShell('Bookings', main);
  };
  const mountDeskC = (site, rerender) => {
    const again = (kb) => { tq.kb = kb; rerender(); if (kb) { const w = site.querySelector('#tri'); if (w) w.focus({ preventScroll: true }); } };
    const next = (dir) => { const n = TRI.length; let i = tq.i; for (let k = 0; k < n; k++) { i = (i + dir + n) % n; if (!tq.st[TRI[i].ref]) break; } tq.i = i; };
    const settle = (s, kb) => { const open = triOpen(); if (!open.length) return; const cur = tq.st[TRI[tq.i].ref] ? open[0] : TRI[tq.i]; tq.st[cur.ref] = s; tq.i = TRI.indexOf(cur); tq.dec = 'approve'; next(1); again(kb); };
    site.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { tq.i = +b.dataset.go; if (tq.st[TRI[tq.i].ref]) delete tq.st[TRI[tq.i].ref]; again(false); }));
    site.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => { next(+b.dataset.step); again(false); }));
    const d = site.querySelector('[data-do]'); if (d) d.addEventListener('click', () => settle('done', false));
    const s = site.querySelector('[data-snz]'); if (s) s.addEventListener('click', () => settle('snz', false));
    const r = site.querySelector('[data-reset]'); if (r) r.addEventListener('click', () => { tq.st = {}; tq.i = 0; again(false); });
    site.querySelectorAll('[data-dec]').forEach((b) => b.addEventListener('click', () => {
      tq.dec = b.dataset.dec;
      site.querySelectorAll('[data-dec]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      site.querySelectorAll('[data-d]').forEach((f) => { f.hidden = f.dataset.d !== tq.dec; });
      const cur = TRI[tq.i], bk = byRef(cur.ref); if (d) d.innerHTML = `${triPrimary(cur, bk)} <kbd>E</kbd>`;
    }));
    const w = site.querySelector('#tri');
    if (w) w.addEventListener('keydown', (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'j') { e.preventDefault(); next(1); again(true); }
      else if (k === 'k') { e.preventDefault(); next(-1); again(true); }
      else if (k === 'e') { e.preventDefault(); settle('done', true); }
      else if (k === 's') { e.preventDefault(); settle('snz', true); }
    });
  };

  /* =====================================================================
     BOOKINGS DESK · D · Money ledger
     ===================================================================== */
  const lg = { view: 'mov', f: 'all', open: '', done: {} };
  const mvState = (m, i) => lg.done[i] || m[8];
  const LF = [['all', 'All'], ['in', 'Money in'], ['out', 'Money out'], ['match', 'To match']];
  const lgMatch = (m, i) => {
    const s = mvState(m, i);
    if (lg.f === 'in') return m[5] > 0 && s !== 'claim';
    if (lg.f === 'out') return m[5] < 0;
    if (lg.f === 'match') return s === 'claim' || s === 'owe' || s === 'late';
    return true;
  };
  const RECON = () => BOOKINGS.map((b) => {
    const refunded = MOVES.some((m, i) => m[2] === b.ref && m[5] < 0 && lg.done[i] === 'done') ? (b.agreed || b.paid) : 0;
    const owe = b.refund && !refunded ? (b.agreed || b.paid) : 0;
    const due = b.st === 'partially_paid' ? owed(b) : 0;
    let s;
    if (owe) s = ['bad', 'We owe a refund'];
    else if (due) s = ['info', 'Balance owed'];
    else if (b.st === 'pending' && b.hold) s = ['warn', 'Checkout open'];
    else if (b.st === 'pending') s = ['warn', 'Unpaid · UPI claimed'];
    else if (b.st === 'cancelled' && !b.paid) s = ['mute', 'Nothing paid'];
    else s = ['ok', 'Settled'];
    return { b, refunded, owe, due, s };
  });

  const lgDetail = (m) => {
    const b = byRef(m[2]), chain = MOVES.map((x, i) => [x, i]).filter(([x]) => x[2] === b.ref).reverse();
    return `<div class="ad-bk-x"><div class="chain">${chain.map(([x, i]) => `<span class="lk ${mvState(x, i)}"><small>${dt(x[0])} · ${x[1]}</small><b>${x[3]}</b><span class="num">${x[5] < 0 ? '−' : ''}${inr(Math.abs(x[5]))}</span><span class="a-chip ${MSTATE[mvState(x, i)][0]}">${MSTATE[mvState(x, i)][1]}</span></span>`).join(`<span class="ar" aria-hidden="true">${ICON.arrowR}</span>`)}</div>
      <div class="sum"><span><b>${esc(b.lead)}</b> · ${PKGS[b.pkg].name} · ${dt(b.dep)}</span><span>Total ${inr(b.total)} · paid ${inr(b.paid)}${b.due ? ` · ${inr(owed(b))} due ${dt(b.due)}` : ''}</span>
        <span class="acts">${m[8] === 'claim' && !lg.done[MOVES.indexOf(m)] ? `<button class="a-btn sm" data-rec="${MOVES.indexOf(m)}">Record ${inr(m[5])} as paid</button>` : ''}${m[8] === 'owe' && !lg.done[MOVES.indexOf(m)] ? `<button class="a-btn sm" data-rec="${MOVES.indexOf(m)}">Refund through Razorpay ${V25}</button><button class="a-btn ghost sm">Refund made (offline)</button>` : ''}${m[7] ? `<a href="#" class="a-btn ghost sm">${ICON.down}Receipt ${V25}</a>` : ''}<a href="#" class="a-btn ghost sm">Open booking</a></span></div></div>`;
  };

  const renderDeskD = () => {
    const inSum = MOVES.reduce((s, m, i) => s + (m[5] > 0 && ['ok', 'late', 'rec'].includes(mvState(m, i)) ? m[5] : 0), 0);
    const outOwed = MOVES.reduce((s, m, i) => s + (m[5] < 0 && mvState(m, i) === 'owe' ? -m[5] : 0), 0);
    const outDone = MOVES.reduce((s, m, i) => s + (m[5] < 0 && mvState(m, i) === 'done' ? -m[5] : 0), 0);
    const dues = BOOKINGS.filter((b) => b.due), dueSum = dues.reduce((s, b) => s + owed(b), 0);
    const b3 = dues.filter((b) => daysTo(b.due) <= 3).reduce((s, b) => s + owed(b), 0), b7 = dueSum - b3;
    const claims = MOVES.filter((m, i) => mvState(m, i) === 'claim');
    const rows = MOVES.map((m, i) => [m, i]).filter(([m, i]) => lgMatch(m, i));
    const rc = RECON();
    const main = `<div class="ad-bk ad-bk-d">
      <div class="a-head"><h1>Bookings</h1><div class="sub">Ledger · September 2026 · every rupee in and out, matched to its booking</div>
        <div class="acts"><select class="a-select" aria-label="Month"><option>September 2026</option><option>August 2026</option></select><a href="#" class="a-btn ghost sm">${ICON.down}Export for the CA</a></div></div>

      <section class="ad-bk-stmt a-card"><div class="a-card-b">
        <div class="fig"><small>Collected</small><b class="num">${inr(inSum)}</b><em>${MOVES.filter((m, i) => m[5] > 0 && ['ok', 'late', 'rec'].includes(mvState(m, i))).length} payments</em></div>
        <span class="op" aria-hidden="true">−</span>
        <div class="fig bad"><small>Refunds to send</small><b class="num">${inr(outOwed)}</b><em>${outDone ? `${inr(outDone)} already sent` : '2 bookings · none sent yet'}</em></div>
        <span class="op" aria-hidden="true">=</span>
        <div class="fig"><small>Yours to keep</small><b class="num">${inr(inSum - outOwed - outDone)}</b><em>before gateway fees</em></div>
        <div class="recv"><small>Still to come in ${V25}</small><b class="num">${inr(dueSum)}</b>
          <span class="age"><i style="flex:${b3}"></i><i class="l" style="flex:${Math.max(b7, 1)}"></i></span>
          <em><span class="k"></span>${inr(b3)} due in 3 days · <span class="k l"></span>${inr(b7)} in 4–7 days · nothing overdue</em></div>
      </div></section>

      ${claims.length ? `<div class="ad-bk-claim">${ICON.info}<span><b>${claims.length} payment ${claims.length === 1 ? 'claim' : 'claims'} to match.</b> Vikram Singh Rathore says he sent ${inr(36998)} by UPI (UTR 426981533047). Find it in the bank app, then record it: the booking confirms and a receipt is issued.</span><button class="a-btn sm" data-rec="0">Record as paid</button></div>` : ''}

      <div class="a-bar">
        <div class="a-seg" role="group" aria-label="View"><button data-v="mov" aria-pressed="${lg.view === 'mov'}">Movements</button><button data-v="bk" aria-pressed="${lg.view === 'bk'}">By booking</button></div>
        ${lg.view === 'mov' ? `<div class="a-tabs" role="tablist" aria-label="Filter">${LF.map(([k, l]) => `<button role="tab" data-lf="${k}" aria-selected="${lg.f === k}">${l} <span class="num muted">${MOVES.filter((m, i) => { const o = lg.f; lg.f = k; const r = lgMatch(m, i); lg.f = o; return r; }).length}</span></button>`).join('')}</div>` : '<span class="muted" style="font-size:13px;font-weight:600">Each booking’s total against what came in and went out</span>'}
      </div>

      ${lg.view === 'mov' ? `<div class="a-card flush"><div class="a-card-b"><div class="a-tw"><table class="a-table ad-bk-lt">
        <thead><tr><th>When</th><th>Booking</th><th>What</th><th class="hs">Method · reference</th><th class="hs">Receipt ${V25}</th><th class="num">In</th><th class="num">Out</th><th>State</th></tr></thead>
        <tbody>${rows.map(([m, i]) => {
          const b = byRef(m[2]), s = mvState(m, i), op = lg.open === String(i);
          return `<tr data-row="${i}" tabindex="0" aria-expanded="${op}" class="${op ? 'sel' : ''} ${s === 'failed' ? 'dim' : ''}">
            <td style="white-space:nowrap"><b>${dt(m[0])}</b><small>${m[1]}</small></td>
            <td><b>${esc(b.lead)}</b><small class="mono">${b.ref}</small></td>
            <td>${m[3]}<small>${PKGS[b.pkg].dest} · ${dt(b.dep)}</small></td>
            <td class="hs">${m[4]}<small class="mono">${m[6]}</small></td>
            <td class="hs mono">${m[7] || '<span class="muted">—</span>'}</td>
            <td class="num">${m[5] > 0 ? `<b class="${s === 'claim' || s === 'failed' ? 'muted' : 'in'}">${inr(m[5])}</b>` : ''}</td>
            <td class="num">${m[5] < 0 ? `<b class="out">${inr(-m[5])}</b>` : ''}</td>
            <td><span class="a-chip ${MSTATE[s][0]}">${MSTATE[s][1]}</span></td></tr>
            ${op ? `<tr class="ad-bk-xr"><td colspan="8">${lgDetail(m)}</td></tr>` : ''}`;
        }).join('') || '<tr><td colspan="8"><div class="a-empty">Nothing here. Every movement is matched.</div></td></tr>'}</tbody></table></div>
        <div class="ad-bk-foot"><span>${rows.length} movements · ${MOVES.filter((m, i) => mvState(m, i) === 'failed').length} failed attempts kept for the record</span><span>Razorpay settles to HDFC ••4471 on T+2</span></div></div></div>`
      : `<div class="a-card flush"><div class="a-card-b"><div class="a-tw"><table class="a-table ad-bk-lt">
        <thead><tr><th>Booking</th><th class="hs">Trip</th><th class="num">Total</th><th class="num">Paid in</th><th class="num">Refunded</th><th class="num">They owe</th><th class="num">We owe</th><th>Reconciled</th></tr></thead>
        <tbody>${rc.map(({ b, refunded, owe, due, s }) => `<tr class="${s[1] === 'Nothing paid' ? 'dim' : ''}"><td><b>${esc(b.lead)}</b><small class="mono">${b.ref} · ${b.ch}</small></td>
          <td class="hs">${PKGS[b.pkg].name}<small>${dt(b.dep)}</small></td><td class="num">${inr(b.total)}</td><td class="num">${b.paid ? inr(b.paid) : '—'}</td><td class="num">${refunded ? inr(refunded) : '—'}</td>
          <td class="num">${due ? `<b>${inr(due)}</b><small>by ${dt(b.due)}</small>` : '—'}</td><td class="num">${owe ? `<b class="out">${inr(owe)}</b>` : '—'}</td>
          <td><span class="a-chip ${s[0]}">${s[1]}</span></td></tr>`).join('')}
          <tr class="tot"><td><b>${rc.length} bookings</b></td><td class="hs"></td><td class="num">${inr(rc.reduce((s, r) => s + r.b.total, 0))}</td><td class="num">${inr(rc.reduce((s, r) => s + r.b.paid, 0))}</td><td class="num">${inr(rc.reduce((s, r) => s + r.refunded, 0))}</td><td class="num">${inr(rc.reduce((s, r) => s + r.due, 0))}</td><td class="num">${inr(rc.reduce((s, r) => s + r.owe, 0))}</td><td></td></tr></tbody></table></div></div></div>`}
    </div>`;
    return TS.adminShell('Bookings', main);
  };
  const mountDeskD = (site, rerender) => {
    site.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { lg.view = b.dataset.v; rerender(); }));
    site.querySelectorAll('[data-lf]').forEach((b) => b.addEventListener('click', () => { lg.f = b.dataset.lf; lg.open = ''; rerender(); }));
    const tog = (tr) => { lg.open = lg.open === tr.dataset.row ? '' : tr.dataset.row; rerender(); };
    site.querySelectorAll('tr[data-row]').forEach((tr) => {
      tr.addEventListener('click', (e) => { if (e.target.closest('button,a')) return; tog(tr); });
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tog(tr); } });
    });
    site.querySelectorAll('[data-rec]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation(); const i = +b.dataset.rec; lg.done[i] = MOVES[i][5] < 0 ? 'done' : 'rec'; rerender();
    }));
  };

  /* ---------- desk CSS ---------- */
  const cssDesk = common + `
  /* B · departure board */
  .ad-bk-ruler { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin; }
  .ad-bk-ruler button { flex: 0 0 132px; display: grid; gap: 4px; text-align: left; font: inherit; color: var(--ink); background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 12px; padding: 9px 11px; cursor: pointer; transition: border-color .2s, background .2s; }
  .ad-bk-ruler button:hover { border-color: var(--ink); }
  .ad-bk-ruler button[aria-pressed="true"] { border-color: var(--pri); background: var(--pri-soft); }
  .ad-bk-ruler small { font-size: 11.5px; font-weight: 700; color: var(--mute); } .ad-bk-ruler b { font-size: 14px; }
  .ad-bk-ruler .a-meter { height: 5px; } .ad-bk-ruler em { font-style: normal; font-size: 11.5px; font-weight: 700; color: var(--mute); } .ad-bk-ruler em.todo { color: var(--warn); }
  .ad-bk-legend { display: flex; gap: 12px; font-size: 12px; font-weight: 600; color: var(--mute); margin-left: auto; }
  .ad-bk-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; background: var(--pri); }
  .ad-bk-legend i.h { background: color-mix(in srgb, var(--act) 70%, #fff); } .ad-bk-legend i.f { background: #E6EBEF; }
  .ad-bk-deps { display: grid; gap: 14px; }
  .ad-bk-dep { overflow: hidden; scroll-margin-top: 12px; transition: box-shadow .3s; animation: ad-in .4s var(--ease) both; }
  .ad-bk-dep.focus { box-shadow: 0 0 0 2px var(--pri); }
  .ad-bk-dep .dh { display: grid; grid-template-columns: 56px minmax(0, 1.2fr) minmax(0, 1.5fr) auto; gap: 12px 18px; align-items: center; padding: 14px var(--a-pad); border-bottom: 1px solid var(--a-line); background: color-mix(in srgb, var(--bg2) 60%, var(--a-surf)); }
  .ad-bk-dep .date { display: grid; justify-items: center; background: var(--ink); color: #fff; border-radius: 12px; padding: 6px 0 7px; line-height: 1.05; }
  .ad-bk-dep .date b { font-size: 22px; letter-spacing: -.03em; } .ad-bk-dep .date span { font-size: 10.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; text-align: center; color: var(--ink-soft); }
  .ad-bk-dep .ttl { display: grid; gap: 4px; min-width: 0; } .ad-bk-dep h2 { font-size: 16.5px; letter-spacing: -.02em; margin: 0; } .ad-bk-dep .ttl > .muted { font-size: 12.5px; font-weight: 600; }
  .ad-bk-dep .stats { display: grid; grid-template-columns: minmax(0, 1.4fr) repeat(2, minmax(0, 1fr)); gap: 14px; margin: 0; }
  .ad-bk-dep .stats dt { font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--mute); display: flex; gap: 6px; align-items: center; }
  .ad-bk-dep .stats dd { margin: 4px 0 0; display: grid; gap: 3px; font-size: 13px; } .ad-bk-dep .stats dd .num { font-weight: 800; font-variant-numeric: tabular-nums; }
  .ad-bk-dep .stats dd small { color: var(--mute); font-size: 11.5px; font-weight: 600; } .ad-bk-dep .stats .a-meter { height: 7px; }
  .ad-bk-dep .acts { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; max-width: 260px; }
  .ad-bk-row { display: grid; grid-template-columns: 22px minmax(0, 1.3fr) 70px minmax(0, 1fr) minmax(0, 1.6fr) auto; gap: 6px 14px; align-items: center; padding: 10px var(--a-pad); border-top: 1px solid var(--a-line); font-size: 13.5px; transition: background .2s; }
  .ad-bk-row:first-child { border-top: 0; } .ad-bk-row:hover { background: color-mix(in srgb, var(--pri) 4%, transparent); } .ad-bk-row.sel { background: var(--pri-soft); }
  .ad-bk-row.dim { color: var(--mute); } .ad-bk-row.dim b { font-weight: 600; }
  .ad-bk-row small { display: block; color: var(--mute); font-size: 12px; } .ad-bk-row .ck input { width: 16px; height: 16px; accent-color: var(--pri); }
  .ad-bk-row .pax b, .ad-bk-row .money b { font-variant-numeric: tabular-nums; } .ad-bk-row .go { justify-self: end; }
  .ad-bk-row .wait { display: inline-flex; gap: 5px; align-items: center; font-size: 12.5px; font-weight: 700; color: var(--warn); white-space: nowrap; }
  .ad-bk-row .ok { font-size: 12.5px; font-weight: 600; }
  .ad-bk-rest { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; align-items: center; padding: 10px var(--a-pad) 12px 52px; border-top: 1px dashed var(--a-line); font-size: 13px; color: var(--mute); }
  .ad-bk-rest span { display: inline-flex; gap: 6px; align-items: center; } .ad-bk-rest .ic { color: var(--ok); } .ad-bk-rest b { color: var(--ink2); }
  .ad-bk-past .ph { width: 100%; display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; align-items: center; font: inherit; font-size: 13.5px; background: none; border: 0; padding: 12px var(--a-pad); cursor: pointer; color: var(--ink); text-align: left; }
  .ad-bk-past .ph > span:first-child { display: inline-flex; gap: 6px; align-items: center; } .ad-bk-past .ph .ic { transition: transform .2s; }
  .ad-bk-past .ph[aria-expanded="true"] .ic { transform: rotate(180deg); } .ad-bk-past .ph .muted { font-size: 12.5px; font-weight: 600; }
  .ad-bk-batch { position: sticky; bottom: 12px; z-index: 4; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; background: var(--ink); color: #fff; border-radius: 14px; padding: 10px 14px; box-shadow: 0 18px 40px -18px rgba(20,32,42,.6); animation: ad-in .25s var(--ease) both; }
  .ad-bk-batch b { margin-right: 6px; } .ad-bk-batch .a-btn.ghost { background: transparent; color: #fff; border-color: var(--ink-line); } .ad-bk-batch .a-btn.ghost:hover { border-color: #fff; }
  .ad-bk-batch .lnk { color: var(--ink-soft); margin-left: auto; }

  /* C · triage */
  .ad-bk-c { outline: 0; }
  .ad-bk-prog { display: flex; gap: 10px 16px; align-items: center; flex-wrap: wrap; font-size: 13px; color: var(--mute); font-weight: 600; }
  .ad-bk-prog .bar { flex: 1 1 200px; height: 6px; border-radius: 99px; background: #E6EBEF; overflow: hidden; }
  .ad-bk-prog .bar i { display: block; height: 100%; background: var(--ok); transform-origin: left; transition: transform .5s var(--ease); }
  .ad-bk-prog b { color: var(--ink); } .ad-bk-prog .keys { display: inline-flex; gap: 4px; align-items: center; }
  .ad-bk-tri { display: grid; grid-template-columns: 220px minmax(0, 1fr) 260px; gap: 16px; align-items: start; }
  .ad-bk-qlist, .ad-bk-qlist ol { list-style: none; margin: 0; padding: 0; } .ad-bk-qlist { display: grid; gap: 14px; }
  .ad-bk-qlist .lane { display: grid; gap: 4px; } .ad-bk-qlist ol { display: grid; gap: 2px; }
  .ad-bk-qlist button { width: 100%; text-align: left; font: inherit; background: none; border: 1px solid transparent; border-radius: 10px; padding: 7px 10px; cursor: pointer; color: var(--ink); display: grid; gap: 1px; transition: background .2s, border-color .2s; }
  .ad-bk-qlist button:hover { background: var(--a-surf); border-color: var(--a-line); }
  .ad-bk-qlist button[aria-current="true"] { background: var(--a-surf); border-color: var(--pri); box-shadow: 0 0 0 1px var(--pri); }
  .ad-bk-qlist button b { font-size: 13.5px; } .ad-bk-qlist button small { font-size: 11.5px; color: var(--mute); font-weight: 600; }
  .ad-bk-qlist button.off b { color: var(--mute); text-decoration: line-through; text-decoration-color: var(--a-line); }
  .ad-bk-focus { background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); padding: 20px 22px; display: grid; gap: 12px; box-shadow: 0 18px 40px -28px rgba(20,32,42,.35); animation: ad-in .35s var(--ease) both; }
  .ad-bk-focus .top { display: flex; justify-content: space-between; align-items: center; gap: 8px; } .ad-bk-focus .nav { display: flex; gap: 4px; }
  .ad-bk-focus .top .eyeb { color: var(--pri); }
  .ad-bk-focus h2 { font-size: 24px; letter-spacing: -.03em; margin: 0; } .ad-bk-focus .age { margin: -6px 0 0; font-size: 13.5px; color: var(--mute); font-weight: 600; }
  .ad-bk-focus .ctx { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; background: var(--bg2); border-radius: 12px; padding: 12px 14px; }
  .ad-bk-focus .ctx > span { display: grid; gap: 2px; min-width: 0; font-size: 13.5px; } .ad-bk-focus .ctx small { font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--mute); }
  .ad-bk-focus .ctx em { font-style: normal; font-size: 12px; color: var(--mute); }
  .ad-bk-focus .body { display: grid; gap: 12px; }
  .ad-bk-focus .q { margin: 0; background: var(--bg2); border-radius: 10px; padding: 9px 12px; font-size: 14.5px; color: var(--ink2); }
  .ad-bk-focus .pol { margin: 0; font-size: 13.5px; color: var(--ink2); }
  .ad-bk-focus .foot { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; padding-top: 4px; border-top: 1px solid var(--a-line); padding-top: 14px; }
  .ad-bk-focus .foot .a-btn kbd { background: transparent; color: inherit; border-color: color-mix(in srgb, currentColor 35%, transparent); }
  .ad-bk-focus .foot .lnk { margin-left: auto; display: inline-flex; gap: 6px; align-items: center; color: var(--mute); }
  .ad-bk-focus.clear h2 { font-size: 22px; }
  .ad-bk-pay { display: grid; gap: 6px; font-size: 13.5px; } .ad-bk-pay .a-meter { height: 9px; }
  .ad-bk-trav { display: flex; gap: 6px; flex-wrap: wrap; }
  .ad-bk-side { display: grid; gap: 12px; }
  .ad-bk-side section { background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); padding: 14px; display: grid; gap: 10px; }
  .ad-bk-side .contact { display: flex; gap: 6px; flex-wrap: wrap; }
  .ad-bk-side .w { display: grid; gap: 3px; font-size: 13px; padding-top: 8px; border-top: 1px solid var(--a-line); } .ad-bk-side .w .a-chip { justify-self: start; }
  .ad-bk-side .lnk { display: inline-flex; gap: 6px; align-items: center; font-size: 13px; }

  /* D · ledger */
  .ad-bk-stmt .a-card-b { display: flex; flex-wrap: wrap; gap: 14px 18px; align-items: center; }
  .ad-bk-stmt .fig { display: grid; gap: 2px; } .ad-bk-stmt small { font-size: 11.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--mute); }
  .ad-bk-stmt .fig b { font-size: 26px; letter-spacing: -.03em; font-variant-numeric: tabular-nums; } .ad-bk-stmt .fig.bad b { color: #B42318; }
  .ad-bk-stmt em { font-style: normal; font-size: 12.5px; color: var(--mute); font-weight: 600; }
  .ad-bk-stmt .op { font-size: 22px; color: var(--mute); font-weight: 300; }
  .ad-bk-stmt .recv { margin-left: auto; display: grid; gap: 4px; min-width: 250px; padding-left: 18px; border-left: 1px solid var(--a-line); }
  .ad-bk-stmt .recv b { font-size: 20px; font-variant-numeric: tabular-nums; }
  .ad-bk-stmt .age { display: flex; height: 8px; border-radius: 99px; overflow: hidden; gap: 2px; } .ad-bk-stmt .age i { background: var(--warn); } .ad-bk-stmt .age i.l { background: var(--pri); }
  .ad-bk-stmt .k { display: inline-block; width: 8px; height: 8px; border-radius: 2px; background: var(--warn); margin-right: 4px; } .ad-bk-stmt .k.l { background: var(--pri); }
  .ad-bk-claim { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; background: var(--warn-soft); color: var(--ink2); border-radius: 12px; padding: 10px 14px; font-size: 13.5px; }
  .ad-bk-claim > .ic { color: var(--warn); } .ad-bk-claim > span { flex: 1 1 300px; } .ad-bk-claim .a-btn { margin-left: auto; }
  .ad-bk-d .a-bar .a-tabs { border-bottom: 0; }
  .ad-bk-lt tbody tr[data-row] { cursor: pointer; }
  .ad-bk-lt b.in { color: var(--ok); } .ad-bk-lt b.out { color: #B42318; }
  .ad-bk-lt tr.tot td { border-top: 2px solid var(--ink); font-weight: 800; }
  .ad-bk-xr td { background: var(--bg2); padding-top: 0 !important; }
  .ad-bk-x { display: grid; gap: 12px; padding: 12px 0 6px; animation: ad-in .3s var(--ease) both; }
  .ad-bk-x .chain { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .ad-bk-x .lk { display: grid; gap: 2px; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 10px; padding: 8px 10px; min-width: 150px; font-size: 13px; }
  .ad-bk-x .lk small { font-size: 11.5px; color: var(--mute); } .ad-bk-x .lk .a-chip { justify-self: start; }
  .ad-bk-x .ar { color: var(--mute); display: grid; }
  .ad-bk-x .sum { display: flex; gap: 8px 16px; flex-wrap: wrap; align-items: center; font-size: 13px; } .ad-bk-x .sum .acts { margin-left: auto; display: flex; gap: 6px; flex-wrap: wrap; }
  .ad-bk-foot { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 10px var(--a-pad); border-top: 1px solid var(--a-line); font-size: 12.5px; color: var(--mute); font-weight: 600; }

  @container site (max-width: 700px) {
    .ad-bk .hs { display: none; }
    .ad-bk-legend { display: none; }
    .ad-bk-dep .dh { grid-template-columns: 48px minmax(0, 1fr); }
    .ad-bk-dep .stats { grid-column: 1 / -1; grid-template-columns: 1fr 1fr; } .ad-bk-dep .stats .seat { grid-column: 1 / -1; }
    .ad-bk-dep .acts { grid-column: 1 / -1; justify-content: flex-start; max-width: none; }
    .ad-bk-row { grid-template-columns: 22px minmax(0, 1fr) auto; grid-template-areas: "ck who money" ". st st" ". go go"; }
    .ad-bk-row .ck { grid-area: ck; } .ad-bk-row .who { grid-area: who; } .ad-bk-row .money { grid-area: money; text-align: right; }
    .ad-bk-row .pax { display: none; } .ad-bk-row .st { grid-area: st; } .ad-bk-row .go { grid-area: go; justify-self: start; }
    .ad-bk-rest { padding-left: var(--a-pad); }
    .ad-bk-batch .a-btn .ops-v25 { display: none; }
    .ad-bk-tri { grid-template-columns: 1fr; }
    .ad-bk-qlist { order: 2; } .ad-bk-side { order: 3; }
    .ad-bk-focus { padding: 16px; } .ad-bk-focus h2 { font-size: 20px; }
    .ad-bk-focus .ctx { grid-template-columns: 1fr; }
    .ad-bk-prog .keys { display: none; } .ad-bk-focus .foot kbd { display: none; } .ad-bk-focus .foot .lnk { margin-left: 0; }
    .ad-bk-stmt .op { display: none; } .ad-bk-stmt .fig b { font-size: 22px; }
    .ad-bk-stmt .recv { margin-left: 0; padding-left: 0; border-left: 0; min-width: 0; flex-basis: 100%; }
    .ad-bk-d .a-bar .a-tabs { overflow-x: auto; flex-wrap: nowrap; max-width: 100%; } .ad-bk-d .a-bar .a-tabs button { white-space: nowrap; }
  }`;

  /* =====================================================================
     BOOKING DETAIL · shared seed (three preview states, as admin-ops.js)
     ===================================================================== */
  const bs = { st: 'cancel', tab: {}, notes: { cancel: [], hold: [], refund: [] }, stage: {}, move: '', doc: 'work', ed: '', done: {} };
  const DET = {
    cancel: {
      b: byRef('TB-7K2M9Q'), bookedAt: [9, 12], state: 'Karnataka', city: 'Bengaluru', past: '1 trip · Kerala, 2025',
      travellers: [['Kavya Iyer', 34, 'Double sharing', 'ok'], ['Rahul Iyer', 36, 'Double sharing', 'ok'], ['Aadhya Iyer', 7, 'Child 5–11', 'ok']],
      lines: [['Double sharing', 2, 21999, 43998], ['Child 5–11', 1, 15399, 15399]],
      receipt: 'RC/2026-27/0139', invoice: 'TS/2026-27/0061',
      ev: [
        [[9, 12], '9:14 pm', 'Customer', 'book', `Booked online · 3 travellers · ${inr(59397)}`],
        [[9, 12], '9:14 pm', 'System', 'sys', `Razorpay order order_P8kQ2mZx41 opened · ${inr(59397)}`],
        [[9, 12], '9:16 pm', 'Webhook', 'pay', `Payment captured · ${inr(59397)} · card · pay_P8kR7nWc93 · receipt RC/2026-27/0139`],
        [[9, 12], '9:16 pm', 'System', 'mail', 'Confirmation email with voucher and tax invoice TS/2026-27/0061 sent'],
        [[9, 18], '10:21 pm', 'Customer', 'sys', 'Traveller details completed for all 3 travellers'],
        [[9, 19], '8:00 am', 'Cron', 'mail', 'Traveller details reminder skipped: all details already in'],
        [[9, 26], '7:42 pm', 'Customer', 'msg', 'My father has surgery on 16 Oct in Chennai, so we can’t travel that week. Could we get whatever refund the policy allows?'],
        [[9, 26], '7:43 pm', 'System', 'mail', 'Owner alert sent: cancellation requested on TB-7K2M9Q'],
      ],
    },
    hold: {
      b: byRef('TB-8RT2KS'), bookedAt: [9, 26], state: 'Rajasthan', city: 'Jaipur', past: 'None',
      travellers: [['Vikram Singh Rathore', 41, 'Double sharing', 'na'], ['Deepa Rathore', 38, 'Double sharing', 'na']],
      lines: [['Double sharing', 2, 18499, 36998]],
      receipt: '', invoice: '',
      ev: [
        [[9, 26], '3:43 pm', 'Customer', 'book', `Booked online · 2 travellers · ${inr(36998)}`],
        [[9, 26], '3:43 pm', 'System', 'sys', `Razorpay order order_P9aS1hQe77 opened · ${inr(36998)} · seats held 15 min`],
        [[9, 26], '3:44 pm', 'Webhook', 'fail', 'Payment pay_P9aT4kLm20 failed · UPI timed out'],
        [[9, 26], '3:58 pm', 'System', 'sys', 'Hold lapsed · 2 seats released'],
        [[9, 27], '8:30 am', 'Cron', 'mail', `“Still thinking about ${PKGS.shimla.name}?” sent to vikram.rathore@customer.in`],
        [[9, 27], '10:05 am', 'Customer', 'msg', 'Paid ₹36,998 by UPI to your HDFC account last night. UTR 426981533047. Please confirm.'],
      ],
    },
    refund: {
      b: byRef('TB-9QW3LT'), bookedAt: [9, 25], state: 'Maharashtra', city: 'Pune', past: 'None',
      travellers: [['Sneha Kulkarni', 29, 'Double sharing', 'na'], ['Aditi Kulkarni', 27, 'Double sharing', 'na'], ['Prachi Joshi', 29, 'Double sharing', 'na'], ['Mrunal Patil', 28, 'Double sharing', 'na']],
      lines: [['Double sharing', 4, 14499, 57996]],
      receipt: 'RC/2026-27/0151', invoice: '',
      ev: [
        [[9, 25], '11:02 am', 'Customer', 'book', `Booked online · 4 travellers · ${inr(57996)}`],
        [[9, 25], '11:02 am', 'System', 'sys', `Razorpay order order_P8zB3tRw12 opened · ${inr(57996)} · seats held 15 min`],
        [[9, 25], '11:17 am', 'System', 'sys', 'Hold lapsed · 4 seats released'],
        [[9, 25], '11:19 am', 'System', 'sys', 'The last 4 seats on North Goa 9 Oct were booked by TB-5RN2QA'],
        [[9, 25], '11:26 am', 'Webhook', 'pay', `Payment captured · ${inr(57996)} · card · pay_P8zD6vYu58 · receipt RC/2026-27/0151`],
        [[9, 25], '11:26 am', 'System', 'fail', 'Cancelled · paid after the hold lapsed and the seats had gone'],
        [[9, 25], '11:27 am', 'System', 'mail', 'Owner alert sent: refund needed on TB-9QW3LT'],
      ],
    },
  };
  const STATES = [['cancel', 'Cancellation request'], ['hold', 'Lapsed hold'], ['refund', 'Refund needed']];
  const preview = () => `<div class="ad-bd-demo">Preview state <div class="a-seg" role="group" aria-label="Preview state">${STATES.map(([k, l]) => `<button data-bs="${k}" aria-pressed="${bs.st === k}">${l}</button>`).join('')}</div></div>`;
  const sug = (b) => b.paid - Math.floor(b.total / 2);
  const WHO = { Customer: 'user', Webhook: 'rupee', System: 'info', Cron: 'clock', Owner: 'user' };
  const statusWord = (k) => {
    const b = DET[k].b;
    if (bs.done[k]) return { cancel: ['mute', 'Cancelled · Cancellation approved'], hold: ['ok', 'Confirmed'], refund: ['mute', 'Cancelled · refunded'] }[k];
    if (k === 'cancel') return ['ok', 'Confirmed · cancel requested'];
    if (k === 'hold') return ['mute', 'Pending · hold lapsed'];
    return ['mute', `Cancelled · ${CANCEL[b.reason]}`];
  };
  const mountPreview = (site, rerender) => site.querySelectorAll('[data-bs]').forEach((b) => b.addEventListener('click', () => { bs.st = b.dataset.bs; bs.move = ''; bs.ed = ''; rerender(); }));

  /* =====================================================================
     BOOKING DETAIL · B · Case file (one thread, oldest first, act at the bottom)
     ===================================================================== */
  const COMPOSE = {
    cancel: [['approve', 'Approve and refund'], ['reject', 'Reject'], ['date', 'Offer a date change', 1], ['note', 'Note']],
    hold: [['paid', 'Mark paid offline'], ['link', 'Send payment link', 1], ['release', 'Release hold'], ['note', 'Note']],
    refund: [['rzp', 'Refund through Razorpay', 1], ['offline', 'Refund made (offline)'], ['note', 'Note']],
  };
  const composeBody = (k, t, b) => {
    const x = depOf(b);
    const B_ = {
      approve: `<div class="a-row2"><div class="a-field"><label for="cf-r">Refund (₹)</label><input id="cf-r" class="num" value="${sug(b)}" inputmode="numeric"><span class="hint">Paid ${inr(b.paid)} · 22 days out keeps 50%.</span></div>
        <div class="a-field"><label>Then</label><div class="a-note" style="margin:0">${ICON.info}<span>3 seats go back on sale. Razorpay refunds the card and a credit note is issued ${V25}.</span></div></div></div>
        <div class="a-field"><label for="cf-m">Message to Kavya</label><textarea id="cf-m">Sorry to hear about your father, Kavya. We have cancelled TB-7K2M9Q and are refunding ${inr(sug(b))} to your card within 5–7 working days.</textarea></div>`,
      reject: `<div class="a-field"><label for="cf-w">Why, to the customer</label><textarea id="cf-w" placeholder="The houseboat is already paid for these dates. We can move you to a later one."></textarea><span class="hint">Required. The booking stays confirmed and they can’t ask again.</span></div>`,
      date: `<div class="a-row2"><div class="a-field"><label for="cf-d">Move to</label><select id="cf-d"><option>Sun 1 Nov · same fare · 9 seats left</option><option>Sun 15 Nov · same fare · 12 seats left</option></select></div>
        <div class="a-field"><label for="cf-f">Fee</label><select id="cf-f"><option>${inr(3000)} · ₹1,000 × 3 travellers</option><option>Waive the fee</option></select><span class="hint">15–29 days before the original date.</span></div></div>`,
      paid: `<div class="a-row2"><div class="a-field"><label for="cf-u">Reference</label><input id="cf-u" value="UTR 426981533047"></div><div class="a-field"><label for="cf-h">How it was paid ${V25}</label><select id="cf-h"><option>UPI</option><option>Bank transfer</option><option>Cash</option></select></div></div>
        <p class="hint">${inr(owed(b))} recorded, the booking confirms and the voucher goes out. Seats are re-checked first: ${left(x)} left, the party of 2 fits.</p>`,
      link: `<div class="a-row2"><div class="a-field"><label for="cf-l">Amount</label><select id="cf-l"><option>${inr(b.total)} · pay in full</option><option>${inr(Math.round(b.total / 4))} · 25% deposit</option></select></div><div class="a-field"><label for="cf-s">Send by</label><select id="cf-s"><option>WhatsApp · +91 ${b.ph}</option><option>Email</option></select></div></div><p class="hint">Holds the 2 seats for 24 h. An unpaid link releases them and logs it.</p>`,
      release: `<p class="hint">Cancels the booking with reason “Released by owner”. The seats are already free. No email is sent.</p>`,
      rzp: `<div class="a-row2"><div class="a-field"><label for="cf-ra">Amount</label><input id="cf-ra" class="num" value="${b.paid}"></div><div class="a-field"><label>Goes to</label><div class="a-note" style="margin:0">${ICON.info}<span>The card behind pay_P8zD6vYu58. Sneha is emailed now and when it’s processed.</span></div></div></div>`,
      offline: `<div class="a-field"><label for="cf-rn">Note (optional)</label><input id="cf-rn" placeholder="Razorpay refund id…" value="rfnd_P9cK2wQx81"></div><p class="hint">Refund it in the Razorpay dashboard first. Recording it clears the flag. No email is sent.</p>`,
      note: `<div class="a-field"><label for="cf-n">Note · only you see it</label><textarea id="cf-n" placeholder="Called, agreed, follow up on…"></textarea></div>`,
    };
    return B_[t];
  };
  const composeBtn = { approve: 'Approve and cancel', reject: 'Reject the request', date: 'Offer the new date', paid: 'Mark paid and confirm', link: 'Send the link', release: 'Release hold', rzp: `Refund ${inr(57996)}`, offline: 'Record refund', note: 'Add note' };
  const doneEv = { cancel: `Cancellation approved by Viraj D. · refund ${inr(29699)} sent through Razorpay`, hold: `Marked paid offline by Viraj D. · ${inr(36998)} · UPI · UTR 426981533047 · booking confirmed`, refund: `Refund ${inr(57996)} sent through Razorpay by Viraj D. · rfnd_P9cK2wQx81` };

  const renderDetB = () => {
    const f = DET[bs.st], b = f.b, p = PKGS[b.pkg], x = depOf(b), tabs = COMPOSE[bs.st];
    const tab = bs.tab[bs.st] || tabs[0][0];
    const ev = [...f.ev, ...bs.notes[bs.st].map((n) => [[9, 27], n[0], 'Owner', 'note', n[1]]), ...(bs.done[bs.st] ? [[[9, 27], '4:21 pm', 'Owner', 'pay', doneEv[bs.st]]] : [])];
    let last = '';
    const sw = statusWord(bs.st);
    const main = `<div class="ad-bd ad-bd-b">
      ${preview()}
      <div class="a-head"><h1><span class="mono" style="font-size:.8em">${b.ref}</span> · ${esc(b.lead)}</h1>
        <div class="sub">Case file · everything that happened, oldest first · you act at the bottom</div>
        <div class="acts"><a href="#" class="a-btn ghost sm">${ICON.chevL}Desk</a><a href="#" class="a-btn ghost sm">${ICON.down}Voucher PDF</a></div></div>
      <div class="ad-bd-case">
        <div class="thread">
          <ol class="ad-bd-tl" aria-label="History ${V25}">${ev.map(([d, t, w, k, tx]) => {
            const day = dt(d) === last ? '' : `<li class="day"><span>${d[0] === 9 && d[1] === 27 ? 'Today' : dt(d)}</span></li>`; last = dt(d);
            if (k === 'msg') return `${day}<li class="ev msg"><span class="t">${t}</span><div class="bub"><b>${esc(first(b.lead))} · ${bs.st === 'hold' ? 'WhatsApp' : 'from My trips'}</b><p>“${esc(tx)}”</p></div></li>`;
            return `${day}<li class="ev ${k}"><span class="t">${t}</span><span class="dot" aria-hidden="true">${ICON[k === 'pay' ? 'rupee' : k === 'mail' ? 'mail' : k === 'fail' ? 'x' : k === 'note' ? 'quote' : k === 'book' ? 'ticket' : WHO[w] || 'info']}</span><span class="x"><b>${w === 'Owner' ? 'Viraj D.' : w}</b> ${esc(tx)}</span></li>`;
          }).join('')}
            <li class="now"><span>Now · Sun 27 Sep, 4:20 pm</span></li></ol>

          ${bs.done[bs.st] ? `<div class="ad-bd-closed">${ICON.check}<span><b>Done.</b> ${bs.st === 'hold' ? 'The booking is confirmed and the voucher is on its way.' : 'Nothing is owed either way. The case is closed.'}</span><button class="lnk" data-undo>Undo the demo</button></div>` : `<section class="ad-bd-comp a-card" aria-label="Act on this booking">
            <div class="tabs" role="tablist">${tabs.map(([k, l, v]) => `<button role="tab" data-tab="${k}" aria-selected="${tab === k}">${l}${v ? ` ${V25}` : ''}</button>`).join('')}</div>
            <div class="in">${composeBody(bs.st, tab, b)}
              <div class="foot"><button class="a-btn ${tab === 'release' || tab === 'reject' ? 'danger' : ''}" data-send="${tab}">${composeBtn[tab]}</button><span class="hint">${tab === 'note' ? 'Notes join the thread; the customer never sees them.' : 'Lands in the thread above and in the history log.'}</span></div></div>
          </section>`}
        </div>

        <aside class="ad-bd-props" aria-label="Properties">
          <details open><summary><span class="a-chip ${sw[0]}">${sw[1]}</span><span class="muted">Properties</span></summary>
          <dl>
            <div><dt>Trip</dt><dd>${p.name}<small>${dt(b.dep)} → ${dt(addDays(b.dep, p.nights))}</small></dd></div>
            <div><dt>Party</dt><dd>${party(b.a, b.c)}</dd></div>
            <div><dt>Seats on date</dt><dd><span class="a-meter" style="--v:${(x.booked / x.seats) * 100}%;--h:${(x.held / x.seats) * 100}%" aria-hidden="true"></span><small>${x.booked} booked · ${x.held} held · ${left(x)} left</small></dd></div>
            <div><dt>Total</dt><dd class="num">${inr(b.total)}</dd></div>
            <div><dt>Paid</dt><dd class="num">${inr(b.paid)}</dd></div>
            <div><dt>${bs.st === 'refund' ? 'To refund' : 'Balance'}</dt><dd class="num ${bs.st === 'refund' && !bs.done.refund ? 'bad' : ''}">${bs.st === 'refund' ? (bs.done.refund ? 'Refunded' : inr(b.paid)) : owed(b) ? inr(owed(b)) : 'Paid in full'}</dd></div>
            <div><dt>Channel ${V25}</dt><dd>Web<small>by the customer · ${dt(f.bookedAt)}</small></dd></div>
          </dl></details>
          <section><span class="eyeb">Lead</span><b>${esc(b.lead)}</b><span class="muted">+91 ${b.ph}<br>${b.em}<br>${f.city}, ${f.state} · ${f.past === 'None' ? 'first trip' : f.past}</span>
            <div class="row"><a href="#" class="a-btn ghost sm">${ICON.phone}Call</a><a href="#" class="a-btn ghost sm">${ICON.wa}WhatsApp</a></div></section>
          <section><span class="eyeb">Travellers ${V25}</span>${f.travellers.map(([n, a, , s]) => `<span class="tr"><span>${esc(n)} <small class="muted">${a}</small></span><span class="a-chip ${s === 'ok' ? 'ok' : 'mute'}">${s === 'ok' ? 'Details in' : 'After payment'}</span></span>`).join('')}</section>
          <section><span class="eyeb">Documents ${V25}</span>${f.receipt ? `<a href="#" class="lnk">${ICON.file}Receipt ${f.receipt}</a>` : '<span class="muted">No receipt · nothing paid</span>'}${f.invoice ? `<a href="#" class="lnk">${ICON.file}Tax invoice ${f.invoice}</a>` : '<span class="muted">No tax invoice · not fully paid</span>'}</section>
        </aside>
      </div>
    </div>`;
    return TS.adminShell('Bookings', main);
  };
  const mountDetB = (site, rerender) => {
    mountPreview(site, rerender);
    site.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { bs.tab[bs.st] = b.dataset.tab; rerender(); }));
    const s = site.querySelector('[data-send]');
    if (s) s.addEventListener('click', () => {
      const t = s.dataset.send;
      if (t === 'note') { const n = site.querySelector('#cf-n'); const v = n && n.value.trim(); if (!v) { if (n) n.focus(); return; } bs.notes[bs.st].push(['4:21 pm', v]); rerender(); return; }
      if (t === 'reject' || t === 'date' || t === 'link' || t === 'release') { bs.notes[bs.st].push(['4:21 pm', `${composeBtn[t]} · sent (demo)`]); rerender(); return; }
      bs.done[bs.st] = true; rerender();
    });
    const u = site.querySelector('[data-undo]'); if (u) u.addEventListener('click', () => { bs.done[bs.st] = false; rerender(); });
    const tl = site.querySelector('.ad-bd-tl'); if (tl) tl.scrollTop = tl.scrollHeight;
  };

  /* =====================================================================
     BOOKING DETAIL · C · Lifecycle (state machine; only valid moves)
     ===================================================================== */
  const LIFE = {
    cancel: [['Booked', [9, 12], 'done'], ['Paid in full', [9, 12], 'done'], ['Details in', [9, 18], 'done'], ['Cancel requested', [9, 26], 'now'], ['Departs', [10, 18], 'todo'], ['Completed', [10, 22], 'todo']],
    hold: [['Booked', [9, 26], 'done'], ['Payment failed', [9, 26], 'bad'], ['Hold lapsed', [9, 26], 'now'], ['Paid', null, 'todo'], ['Details in', null, 'todo'], ['Departs', [10, 4], 'todo']],
    refund: [['Booked', [9, 25], 'done'], ['Hold lapsed', [9, 25], 'done'], ['Paid late', [9, 25], 'done'], ['Cancelled · seats gone', [9, 25], 'now'], ['Refunded', null, 'todo'], ['Closed', null, 'todo']],
  };
  const MOVESTO = {
    cancel: [
      { k: 'approve', t: 'Approve and refund', to: 'Cancelled · refund sent', tone: '', fx: [['Seats', `3 back on sale · Munnar 18 Oct goes from ${left(DEPS['munnar-10-18'])} to ${left(DEPS['munnar-10-18']) + 3} left`], ['Money', `${inr(29699)} back to the card through Razorpay ${V25}`], ['Documents', `Credit note CN/2026-27/0009 against TS/2026-27/0061 ${V25}`], ['Email', 'Kavya at once, and again when the refund lands']] },
      { k: 'date', t: 'Offer a date change', to: 'Confirmed · new date', tone: 'ghost', v: 1, fx: [['Seats', '3 move to Sun 1 Nov in one swap'], ['Money', `${inr(3000)} fee, or waive it`], ['Email', 'New voucher and the change in the history']] },
      { k: 'reject', t: 'Reject the request', to: 'Confirmed', tone: 'ghost', fx: [['Seats', 'Stay booked'], ['Money', 'Nothing changes'], ['Email', 'Kavya gets your reason; she can’t ask again']] },
    ],
    hold: [
      { k: 'paid', t: 'Mark paid offline', to: 'Confirmed', tone: '', fx: [['Seats', `Re-checked: ${left(DEPS['shimla-10-4'])} left, the 2 fit`], ['Money', `${inr(36998)} recorded · receipt and tax invoice ${V25}`], ['Email', 'Voucher to Vikram']] },
      { k: 'link', t: 'Send a payment link', to: 'Pending · link live 24 h', tone: 'ghost', v: 1, fx: [['Seats', '2 held for 24 h'], ['Money', 'Full or 25% deposit'], ['Email', 'WhatsApp or email with the link']] },
      { k: 'release', t: 'Release hold', to: 'Cancelled · released by owner', tone: 'danger', fx: [['Seats', 'Already free'], ['Money', 'Nothing was paid'], ['Email', 'None']] },
    ],
    refund: [
      { k: 'rzp', t: 'Refund through Razorpay', to: 'Cancelled · refunded', tone: '', v: 1, fx: [['Money', `${inr(57996)} back to the card · written before the API call, so never twice`], ['Documents', 'No credit note: no tax invoice was issued'], ['Email', 'Sneha now, and when it’s processed']] },
      { k: 'offline', t: 'Record a refund made offline', to: 'Cancelled · refunded', tone: 'ghost', fx: [['Money', 'Drops the paid amount to ₹0'], ['Email', 'None']] },
    ],
  };
  const BLOCKED = {
    cancel: [['Mark completed', 'Departs Sun 18 Oct'], ['Record a refund', 'Answer the request first'], ['Send the trip pack', 'Goes out 3 days before departure, Thu 15 Oct']],
    hold: [['Change date', 'The booking isn’t paid'], ['Send details link', 'Details are collected after payment'], ['Approve a cancellation', 'No request, and nothing to refund']],
    refund: [['Re-instate', `North Goa ${dt([10, 9])} is sold out · 0 of 24 left`], ['Offer from the waitlist', 'Needs a freed seat first'], ['Change date', 'Cancelled bookings can’t move']],
  };
  const stageBody = (k, name) => {
    const f = DET[k], b = f.b, p = PKGS[b.pkg];
    const priceT = `<div class="ad-bd-lines">${f.lines.map(([l, n, u, a]) => `<div><span>${l} · ${n} × ${inr(u)}</span><span class="num">${inr(a)}</span></div>`).join('')}<div class="tot"><span>Total</span><span class="num">${inr(b.total)}</span></div></div>`;
    const trav = `<div class="a-tw"><table class="a-table"><thead><tr><th>Traveller</th><th class="num">Age</th><th>Room</th><th>Details ${V25}</th></tr></thead><tbody>${f.travellers.map(([n, a, r, s]) => `<tr><td><b>${esc(n)}</b></td><td class="num">${a}</td><td>${r}</td><td><span class="a-chip ${s === 'ok' ? 'ok' : 'mute'}">${s === 'ok' ? 'Complete · ID, contact, food' : 'Not asked · unpaid'}</span></td></tr>`).join('')}</tbody></table></div>`;
    const msgOf = () => (f.ev.find((e) => e[3] === 'msg') || [0, 0, 0, 0, ''])[4];
    const evs = (kinds) => `<ul class="ad-bd-evs">${f.ev.filter((e) => kinds.includes(e[3])).map(([d, t, w, , tx]) => `<li><small>${dt(d)} · ${t} · ${w}</small>${esc(tx)}</li>`).join('')}</ul>`;
    const S = {
      Booked: () => `<p>${b.ch === 'Web' ? 'Online, by the customer' : b.ch} · ${party(b.a, b.c)} · ${p.name}, ${dt(b.dep)}.</p>${priceT}`,
      'Paid in full': () => evs(['pay']) + `<p class="muted">Receipt ${f.receipt} · tax invoice ${f.invoice} ${V25}</p>`,
      'Details in': () => trav,
      'Cancel requested': () => `<blockquote>“${esc(msgOf())}”</blockquote><p>Asked Sat 26 Sep, <b>22 days</b> before departure. Policy: <b>50% of the package price is retained</b>, so ${inr(sug(b))} of ${inr(b.paid)} goes back.</p>`,
      'Payment failed': () => evs(['fail']),
      'Hold lapsed': () => (k === 'hold' ? `<p>Seats released at 3:58 pm. This morning Vikram wrote:</p><blockquote>“${esc(msgOf())}”</blockquote>` : `<p>Checkout stayed open past the 15-minute hold, so the 4 seats were released at 11:17 am. Two minutes later another booking took them.</p>${evs(['sys'])}`),
      'Paid late': () => evs(['pay']) + `<p class="muted">Arrived 9 minutes after the hold lapsed. Receipt ${f.receipt} was issued automatically ${V25}.</p>`,
      'Cancelled · seats gone': () => `<p>The system cancelled the booking the moment the payment arrived: the last 4 seats had gone to TB-5RN2QA two minutes after the hold lapsed. ${inr(b.paid)} sits with Tripsmith until it’s refunded.</p>${evs(['fail', 'mail'])}`,
      Departs: () => `<p>${dt(b.dep)} · ${p.nights} nights. The trip pack goes 3 days before; details lock then too ${V25}.</p>`,
      Completed: () => '<p>Marked by the daily tidy after return. The review request goes 2 days later.</p>',
      Paid: () => '<p>Reached by marking the UPI payment, or when a payment link is paid.</p>',
      Refunded: () => '<p>Reached when the refund is sent through Razorpay or recorded as made offline.</p>',
      Closed: () => '<p>Nothing owed either way. The booking stays in the ledger and the history.</p>',
    };
    return S[name] ? S[name]() : '<p class="muted">Nothing recorded at this step yet.</p>';
  };

  const renderDetC = () => {
    const f = DET[bs.st], b = f.b, p = PKGS[b.pkg];
    const life = LIFE[bs.st].map((s) => [...s]);
    if (bs.done[bs.st]) { const i = life.findIndex((s) => s[2] === 'now'); life[i][2] = 'done'; if (life[i + 1]) { life[i + 1][2] = 'now'; life[i + 1][1] = [9, 27]; if (bs.st === 'cancel') life[i + 1][0] = 'Cancelled · refund sent'; } }
    const nowI = life.findIndex((s) => s[2] === 'now');
    const stage = bs.stage[bs.st] != null ? bs.stage[bs.st] : nowI;
    const moves = bs.done[bs.st] ? [] : MOVESTO[bs.st];
    const sw = statusWord(bs.st);
    const main = `<div class="ad-bd ad-bd-c">
      ${preview()}
      <div class="a-head"><h1><span class="mono" style="font-size:.8em">${b.ref}</span> · ${esc(b.lead)}</h1>
        <div class="sub">${p.name} · ${dt(b.dep)} · ${party(b.a, b.c)} · ${inr(b.total)} · <span class="a-chip ${sw[0]}">${sw[1]}</span></div>
        <div class="acts"><a href="#" class="a-btn ghost sm">${ICON.phone}Call</a><a href="#" class="a-btn ghost sm">${ICON.wa}WhatsApp</a><a href="#" class="a-btn ghost sm">${ICON.chevL}Desk</a></div></div>

      <ol class="ad-bd-life" aria-label="Lifecycle">${life.map(([n, d, s], i) => `<li class="${s} ${i === stage ? 'on' : ''}"><button data-stage="${i}" aria-pressed="${i === stage}">
          <span class="nd" aria-hidden="true">${s === 'done' ? ICON.check : s === 'bad' ? ICON.x : s === 'now' ? '' : i + 1}</span>
          <b>${n}</b><small>${s === 'now' ? `Now · ${d ? dt(d) : ''}` : d ? dt(d) : s === 'todo' ? 'Not yet' : ''}</small></button></li>`).join('')}</ol>

      <div class="ad-bd-cgrid">
        <section class="ad-bd-moves" aria-labelledby="mv-h">
          <h2 id="mv-h" class="eyeb">${moves.length ? `From “${life[nowI][0]}” you can` : 'Done'}</h2>
          ${moves.length ? moves.map((m) => `<article class="ad-bd-mv ${bs.move === m.k ? 'open' : ''}">
            <button class="mh" data-mv="${m.k}" aria-expanded="${bs.move === m.k}"><span><b>${m.t}${m.v ? ` ${V25}` : ''}</b><small>becomes <span class="a-chip ${m.tone === 'danger' ? 'bad' : m.to.startsWith('Confirmed') ? 'ok' : 'mute'}">${m.to}</span></small></span>${ICON.chevD}</button>
            <dl class="fx">${m.fx.map(([a, t]) => `<div><dt>${a}</dt><dd>${t}</dd></div>`).join('')}</dl>
            ${bs.move === m.k ? `<div class="mf">${composeBody(bs.st, m.k, b) || ''}<div class="foot"><button class="a-btn ${m.tone === 'danger' ? 'danger' : ''}" data-commit="${m.k}">${m.t}</button><button class="lnk" data-mv="${m.k}">Cancel</button></div></div>` : ''}
          </article>`).join('') : `<div class="ad-bd-closed">${ICON.check}<span><b>Moved to “${life[nowI][0]}”.</b> Logged in the history with the before and after.</span><button class="lnk" data-undo>Undo the demo</button></div>`}
          <details class="ad-bd-blocked"><summary>Not available now · ${BLOCKED[bs.st].length}</summary><ul>${BLOCKED[bs.st].map(([t, r]) => `<li><b>${t}</b><span>${r}</span></li>`).join('')}</ul></details>
        </section>

        <section class="ad-bd-stage a-card" aria-labelledby="st-h">
          <div class="a-card-h"><h2 id="st-h">${life[stage][0]}</h2><span class="muted" style="font-size:12.5px;font-weight:600">${life[stage][2] === 'todo' ? 'Ahead' : life[stage][2] === 'now' ? 'Where it stands' : 'What happened'}</span>
            <div class="acts"><button class="a-btn ghost sm" data-sstep="-1" ${stage === 0 ? 'disabled' : ''} aria-label="Earlier step">${ICON.chevL}</button><button class="a-btn ghost sm" data-sstep="1" ${stage === life.length - 1 ? 'disabled' : ''} aria-label="Later step">${ICON.chevR}</button></div></div>
          <div class="a-card-b">${stageBody(bs.st, LIFE[bs.st][stage][0])}</div>
          <div class="ad-bd-money"><div><small>Total</small><b class="num">${inr(b.total)}</b></div><div><small>Paid</small><b class="num">${inr(bs.done.hold && bs.st === 'hold' ? b.total : bs.done.refund && bs.st === 'refund' ? 0 : b.paid)}</b></div>
            <div><small>${bs.st === 'refund' ? 'To refund' : 'Balance'}</small><b class="num">${bs.st === 'refund' ? (bs.done.refund ? '₹0' : inr(b.paid)) : bs.st === 'hold' ? (bs.done.hold ? '₹0' : inr(owed(b))) : '₹0'}</b></div>
            <div><small>Channel ${V25}</small><b>Web</b></div></div>
        </section>
      </div>
    </div>`;
    return TS.adminShell('Bookings', main);
  };
  const mountDetC = (site, rerender) => {
    mountPreview(site, rerender);
    site.querySelectorAll('[data-stage]').forEach((b) => b.addEventListener('click', () => { bs.stage[bs.st] = +b.dataset.stage; rerender(); }));
    site.querySelectorAll('[data-sstep]').forEach((b) => b.addEventListener('click', () => {
      const life = LIFE[bs.st], cur = bs.stage[bs.st] != null ? bs.stage[bs.st] : life.findIndex((s) => s[2] === 'now');
      bs.stage[bs.st] = Math.max(0, Math.min(life.length - 1, cur + +b.dataset.sstep)); rerender();
    }));
    site.querySelectorAll('[data-mv]').forEach((b) => b.addEventListener('click', () => { bs.move = bs.move === b.dataset.mv ? '' : b.dataset.mv; rerender(); }));
    site.querySelectorAll('[data-commit]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.commit, first_ = MOVESTO[bs.st][0].k;
      if (k === first_ || (bs.st === 'refund')) { bs.done[bs.st] = true; bs.stage[bs.st] = null; delete bs.stage[bs.st]; }
      bs.move = ''; rerender();
    }));
    const u = site.querySelector('[data-undo]'); if (u) u.addEventListener('click', () => { bs.done[bs.st] = false; delete bs.stage[bs.st]; rerender(); });
  };

  /* =====================================================================
     BOOKING DETAIL · D · Document (the voucher / invoice is the editor)
     ===================================================================== */
  const ADDONS = {
    munnar: [['Kathakali show, front rows', 'per traveller', 600], ['Premium houseboat upgrade', 'per booking', 4500], ['Late-night airport pickup', 'per booking', 1200]],
    shimla: [['Rohtang permit handled for you', 'per traveller', 550], ['Paragliding at Solang', 'per traveller', 3000], ['Heated room upgrade', 'per traveller per night', 700]],
    goa: [['Sunset cruise upper deck', 'per traveller', 900], ['Scuba at Grande Island', 'per traveller', 3500], ['Late checkout', 'per booking', 1500]],
  };
  const ALT = { munnar: [[11, 1], [11, 15]], shimla: [[10, 11], [10, 18]], goa: [[11, 1], [11, 8]] };
  const DOCS = [['work', 'Working copy'], ['receipt', 'Receipt'], ['invoice', 'Tax invoice'], ['credit', 'Credit note']];
  const docAvail = (k, d) => {
    const f = DET[k];
    if (d === 'work') return [true, 'Editable'];
    if (d === 'receipt') return f.receipt ? [true, f.receipt] : [false, 'No payment yet'];
    if (d === 'invoice') return f.invoice ? [true, f.invoice] : [false, k === 'refund' ? 'Cancelled before it confirmed' : 'Issued when fully paid'];
    return k === 'cancel' ? [true, bs.done.cancel ? 'CN/2026-27/0009' : 'Draft · on refund'] : [false, k === 'refund' ? 'No invoice to credit' : 'Only after an invoice'];
  };
  const gst = (total, state) => {
    const taxable = Math.round((total / 1.05) * 100) / 100, tax = Math.round((total - taxable) * 100) / 100;
    return state === 'Karnataka' ? [['Taxable value', taxable], ['CGST 2.5%', Math.round((tax / 2) * 100) / 100], ['SGST 2.5%', Math.round((tax - Math.round((tax / 2) * 100) / 100) * 100) / 100]] : [['Taxable value', taxable], ['IGST 5%', tax]];
  };
  const edBtn = (k, label) => (bs.doc === 'work' ? `<button class="ed" data-ed="${k}" aria-expanded="${bs.ed === k}">${label}<span class="pen">${ICON.chevD}Edit</span></button>` : `<span>${label}</span>`);

  const editor = (k, b) => {
    const p = PKGS[b.pkg], alt = ALT[b.pkg] || [];
    if (k === 'date') {
      const days = daysTo(b.dep), fee = days >= 30 ? 0 : 1000 * seatsOf(b);
      return `<div class="ad-bd-edp" role="group" aria-label="Change date ${V25}"><span class="eyeb">Change date ${V25} · owner can move any booking</span>
        <div class="alts">${alt.map((d, i) => `<label><input type="radio" name="alt" ${i === 0 ? 'checked' : ''}><span><b>${dt(d)}</b><small>same fare · ${9 + i * 3} seats left</small></span></label>`).join('')}</div>
        <div class="rq"><span>New fare − current fare</span><span class="num">₹0</span><span>Change fee · ${days} days out</span><span class="num">${fee ? inr(fee) : 'Free'}</span><span><label><input type="checkbox"> Waive the fee</label></span><span></span><b>Customer pays</b><b class="num">${fee ? inr(fee) : '₹0'}</b></div>
        <div class="foot"><button class="a-btn sm">Move the booking</button><button class="lnk" data-ed="date">Cancel</button><span class="hint">New voucher goes out; the history records old → new.</span></div></div>`;
    }
    if (k === 'party') return `<div class="ad-bd-edp" role="group" aria-label="Change party"><span class="eyeb">Change party ${V25}</span>
        <div class="steps">${[['Adults', b.a], ['Children 5–11', b.c]].map(([l, n]) => `<span class="stp"><span>${l}</span><button class="a-btn ghost sm" aria-label="Fewer ${l}">${ICON.minus}</button><b class="num">${n}</b><button class="a-btn ghost sm" aria-label="More ${l}">${ICON.plus}</button></span>`).join('')}</div>
        <p class="hint">Capped at the seats left on ${dt(b.dep)} (${left(depOf(b))}). The server re-prices the sheet.</p>
        <div class="foot"><button class="a-btn sm">Re-quote</button><button class="lnk" data-ed="party">Cancel</button></div></div>`;
    return `<div class="ad-bd-edp" role="group" aria-label="Add-ons"><span class="eyeb">Add an add-on ${V25} · never discounted</span>
        ${(ADDONS[b.pkg] || []).map(([n, per, pr], i) => `<label class="ao"><input type="checkbox" ${i === 0 && bs.st === 'cancel' ? '' : ''}><span><b>${n}</b><small>${per}</small></span><span class="num">${inr(pr)}</span></label>`).join('')}
        <div class="foot"><button class="a-btn sm">Add to the booking</button><button class="lnk" data-ed="addon">Cancel</button><span class="hint">${p.name} · the customer pays the difference by link.</span></div></div>`;
  };

  const marginNote = (k, b) => {
    if (bs.done[k]) return `<div class="ad-bd-mn ok"><span class="eyeb">${ICON.check}Resolved</span><p>${doneEv[k]}.</p><button class="lnk" data-undo>Undo the demo</button></div>`;
    if (k === 'cancel') return `<div class="ad-bd-mn warn"><span class="eyeb">Decision · on “Status”</span><b>Kavya asked to cancel</b><p>“My father has surgery on 16 Oct in Chennai…” · 22 days out, policy keeps 50%.</p>
      <div class="a-field"><label for="mn-r">Refund (₹)</label><input id="mn-r" class="num" value="${sug(b)}"></div>
      <div class="row"><button class="a-btn sm" data-resolve>Approve and refund</button><button class="a-btn ghost sm">Reject</button></div></div>`;
    if (k === 'hold') return `<div class="ad-bd-mn warn"><span class="eyeb">Decision · on “Payments”</span><b>UPI payment claimed</b><p>Vikram: “Paid ₹36,998 by UPI… UTR 426981533047.” The hold lapsed yesterday; 7 seats are still free.</p>
      <div class="row"><button class="a-btn sm" data-resolve>Mark paid and confirm</button><button class="a-btn danger sm">Release hold</button></div></div>`;
    return `<div class="ad-bd-mn bad"><span class="eyeb">Decision · on “Payments”</span><b>Refund ${inr(b.paid)}</b><p>Paid 9 minutes after the hold lapsed; North Goa ${dt(b.dep)} had sold out.</p>
      <div class="row"><button class="a-btn sm" data-resolve>Refund through Razorpay ${V25}</button><button class="a-btn ghost sm">Made offline</button></div></div>`;
  };

  const renderDetD = () => {
    const f = DET[bs.st], b = f.b, p = PKGS[b.pkg], [ok, why] = docAvail(bs.st, bs.doc);
    const doc = bs.doc, done = bs.done[bs.st];
    const title = { work: 'Booking', receipt: 'Payment receipt', invoice: 'Tax invoice', credit: 'Credit note' }[doc];
    const num = { work: b.ref, receipt: f.receipt, invoice: f.invoice, credit: 'CN/2026-27/0009' }[doc];
    const amt = doc === 'credit' ? sug(b) : b.total;
    const paidRows = f.ev.filter((e) => e[3] === 'pay' || (e[3] === 'fail' && e[4].startsWith('Payment')));
    const stamp = doc === 'work' ? statusWord(bs.st) : doc === 'credit' && !done ? ['warn', 'Draft'] : ['ok', 'Issued'];
    const paper = !ok ? `<div class="ad-bd-paper empty"><span class="eyeb">${title}</span><h2>Not issued</h2><p>${why}. ${doc === 'invoice' ? 'Invoices are numbered TS/2026-27/NNNN per financial year and never skip.' : doc === 'receipt' ? 'Every payment gets a receipt RC/2026-27/NNNN the moment it lands.' : 'A credit note is issued for each refund once an invoice exists.'}</p><button class="a-btn ghost sm" data-doc="work">Back to the working copy</button></div>`
      : `<article class="ad-bd-paper" aria-label="${title}">
        <header class="lh"><div><span class="logo"><i></i>Tripsmith</span><small>Tripsmith Holidays · Indiranagar, Bengaluru 560038<br>GSTIN 29ABCDE1234F1Z5 <em>(demo number)</em></small></div>
          <div class="dn"><span class="eyeb">${title}</span><b class="mono">${num}</b><span class="a-chip ${stamp[0]}">${stamp[1]}</span></div></header>
        <div class="two"><div><span class="eyeb">Billed to</span><b>${esc(b.lead)}</b><span>+91 ${b.ph} · ${b.em}</span><span>${f.city}, ${f.state} ${V25}</span></div>
          <div><span class="eyeb">Issued</span><b>${doc === 'work' ? 'Sun 27 Sep 2026 · live' : doc === 'credit' ? 'On refund' : dt(f.bookedAt) + ' 2026'}</b><span>Booking ${b.ref} · Web · by the customer</span></div></div>
        <section class="blk"><span class="eyeb">Trip</span>
          <div class="trip"><img src="${p.img}" alt="${esc(p.name)}"><div><b>${p.name}</b>
            <span class="edl">${edBtn('date', `${dt(b.dep)} → ${dt(addDays(b.dep, p.nights))} · ${p.nights} nights`)}</span>
            <span class="edl">${edBtn('party', party(b.a, b.c))}</span></div></div>
          ${bs.ed === 'date' || bs.ed === 'party' ? editor(bs.ed, b) : ''}</section>
        ${doc === 'work' ? `<section class="blk"><span class="eyeb">Travellers ${V25}</span><ol class="trv">${f.travellers.map(([n, a, r, s]) => `<li><span>${esc(n)}<small>${a} · ${r}</small></span><span class="a-chip ${s === 'ok' ? 'ok' : 'mute'}">${s === 'ok' ? 'Details in' : 'Asked after payment'}</span></li>`).join('')}</ol></section>` : ''}
        <section class="blk"><table class="ln"><thead><tr><th>${doc === 'credit' ? 'Credited' : 'Item'}</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>
          ${doc === 'credit' ? `<tr><td>Refund on cancellation · 50% retained per policy<small>Against invoice ${f.invoice}</small></td><td class="num">1</td><td class="num">${inr(amt)}</td><td class="num">${inr(amt)}</td></tr>`
            : f.lines.map(([l, n, u, a]) => `<tr><td>${p.name} · ${l}<small>SAC 998555</small></td><td class="num">${n}</td><td class="num">${inr(u)}</td><td class="num">${inr(a)}</td></tr>`).join('')}
          ${doc === 'work' ? `<tr class="add"><td colspan="4">${edBtn('addon', `${ICON.plus}Add-ons · none yet ${V25}`)}</td></tr>` : ''}
          </tbody></table>
          ${bs.ed === 'addon' ? editor('addon', b) : ''}
          <dl class="tt">${gst(amt, f.state).map(([l, v]) => `<div><dt>${l}</dt><dd class="num">${paise(v)}</dd></div>`).join('')}
            <div class="g"><dt>${doc === 'credit' ? 'Total credited' : 'Total · GST included'}</dt><dd class="num">${inr(amt)}</dd></div></dl></section>
        ${doc !== 'credit' ? `<section class="blk"><span class="eyeb">Payments</span>
          <ul class="pays">${paidRows.map(([d, t, , k, tx]) => `<li class="${k}"><span>${dt(d)} · ${t}</span><span>${esc(tx.split(' · ').slice(0, 1).join(''))}${k === 'fail' ? '' : ` · ${esc(tx.split(' · ')[2] || '')}`}</span><span class="num">${k === 'fail' ? 'Failed' : inr(b.paid)}</span></li>`).join('') || '<li><span>No payments</span></li>'}
            ${done && bs.st === 'hold' ? `<li class="pay"><span>Sun 27 Sep · 4:21 pm</span><span>Marked paid offline · UPI</span><span class="num">${inr(b.total)}</span></li>` : ''}
            ${done && bs.st === 'refund' ? `<li class="fail"><span>Sun 27 Sep · 4:21 pm</span><span>Refund through Razorpay</span><span class="num">−${inr(b.paid)}</span></li>` : ''}
            ${done && bs.st === 'cancel' ? `<li class="fail"><span>Sun 27 Sep · 4:21 pm</span><span>Refund through Razorpay</span><span class="num">−${inr(sug(b))}</span></li>` : ''}</ul>
          <div class="bal"><span>${bs.st === 'refund' ? (done ? 'Refunded · nothing owed' : 'Owed to the customer') : bs.st === 'hold' ? (done ? 'Paid in full' : 'Balance due') : done ? 'Retained under policy' : 'Paid in full'}</span><b class="num">${bs.st === 'refund' ? (done ? '₹0' : inr(b.paid)) : bs.st === 'hold' ? (done ? '₹0' : inr(owed(b))) : done ? inr(b.paid - sug(b)) : '₹0'}</b></div></section>` : ''}
        <footer class="fp">Prices include GST at 5%. ${f.state === 'Karnataka' ? 'Intra-state supply: CGST + SGST.' : `Inter-state supply to ${f.state}: IGST.`} Cancellation: 30+ days full refund less fees · 15–29 days 50% retained · under 15 days no refund.</footer>
      </article>`;
    const main = `<div class="ad-bd ad-bd-d">
      ${preview()}
      <div class="a-head"><h1><span class="mono" style="font-size:.8em">${b.ref}</span> · ${esc(b.lead)}</h1>
        <div class="sub">Document view · the booking as the customer and the CA see it · ${doc === 'work' ? 'click an underlined field to change it' : 'issued documents never change; a change issues a new one'}</div>
        <div class="acts"><a href="#" class="a-btn ghost sm">${ICON.down}Download PDF</a><a href="#" class="a-btn ghost sm">${ICON.mail}Email to ${esc(first(b.lead))}</a><a href="#" class="a-btn ghost sm">${ICON.chevL}Desk</a></div></div>
      <div class="ad-bd-dtabs" role="tablist" aria-label="Document">${DOCS.map(([k, l]) => { const [a, w] = docAvail(bs.st, k); return `<button role="tab" data-doc="${k}" aria-selected="${bs.doc === k}" class="${a ? '' : 'na'}"><b>${l}${k === 'work' ? '' : ` ${V25}`}</b><small>${w}</small></button>`; }).join('')}</div>
      <div class="ad-bd-docw">
        <div class="ad-bd-desk">${paper}</div>
        <aside class="ad-bd-margin" aria-label="Margin notes">
          ${marginNote(bs.st, b)}
          <div class="ad-bd-mn"><span class="eyeb">Contact</span><b>${esc(b.lead)}</b><span class="muted">${f.city} · ${f.past === 'None' ? 'first trip' : f.past}</span><div class="row"><a href="#" class="a-btn ghost sm">${ICON.phone}Call</a><a href="#" class="a-btn ghost sm">${ICON.wa}WhatsApp</a></div></div>
          <div class="ad-bd-mn"><span class="eyeb">Latest in the history ${V25}</span>${f.ev.slice(-3).reverse().map(([d, t, w, , tx]) => `<p class="h"><small>${dt(d)} · ${t} · ${w}</small>${esc(tx.length > 90 ? tx.slice(0, 88) + '…' : tx)}</p>`).join('')}<a href="#" class="lnk">All ${f.ev.length} entries</a></div>
        </aside>
      </div>
    </div>`;
    return TS.adminShell('Bookings', main);
  };
  const mountDetD = (site, rerender) => {
    mountPreview(site, rerender);
    site.querySelectorAll('[data-doc]').forEach((b) => b.addEventListener('click', () => { bs.doc = b.dataset.doc; bs.ed = ''; rerender(); }));
    site.querySelectorAll('[data-ed]').forEach((b) => b.addEventListener('click', () => { bs.ed = bs.ed === b.dataset.ed ? '' : b.dataset.ed; rerender(); }));
    const r = site.querySelector('[data-resolve]'); if (r) r.addEventListener('click', () => { bs.done[bs.st] = true; rerender(); });
    const u = site.querySelector('[data-undo]'); if (u) u.addEventListener('click', () => { bs.done[bs.st] = false; rerender(); });
  };

  /* ---------- detail CSS ---------- */
  const cssDet = common + `
  .ad-bd-demo { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 12.5px; font-weight: 700; color: var(--mute); }
  .ad-bd .hint { font-size: 12px; color: var(--mute); margin: 0; }
  .ad-bd .foot { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .ad-bd-closed { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; background: var(--ok-soft); color: var(--ok); border-radius: 12px; padding: 12px 14px; font-size: 13.5px; animation: ad-in .35s var(--ease) both; }
  .ad-bd-closed span { color: var(--ink2); flex: 1 1 240px; } .ad-bd-closed b { color: var(--ok); }

  /* B · case file */
  .ad-bd-case { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 18px; align-items: start; }
  .ad-bd-case .thread { display: grid; gap: 14px; min-width: 0; }
  .ad-bd-tl { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; position: relative; }
  .ad-bd-tl::before { content: ""; position: absolute; left: 83px; top: 8px; bottom: 8px; width: 1px; background: var(--a-line); }
  .ad-bd-tl .day { display: flex; padding: 12px 0 6px 96px; } .ad-bd-tl .day span { font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--mute); background: var(--a-bg); padding-right: 8px; }
  .ad-bd-tl .ev { display: grid; grid-template-columns: 70px 28px minmax(0, 1fr); gap: 0 12px; align-items: start; padding: 5px 0; font-size: 13.5px; position: relative; }
  .ad-bd-tl .t { font-size: 12px; color: var(--mute); text-align: right; font-variant-numeric: tabular-nums; padding-top: 5px; }
  .ad-bd-tl .dot { width: 28px; height: 28px; border-radius: 50%; background: var(--a-surf); border: 1px solid var(--a-line); display: grid; place-items: center; color: var(--mute); position: relative; z-index: 1; }
  .ad-bd-tl .dot .ic { width: 14px; height: 14px; }
  .ad-bd-tl .ev.pay .dot { background: var(--ok-soft); border-color: transparent; color: var(--ok); }
  .ad-bd-tl .ev.fail .dot { background: #FDECEA; border-color: transparent; color: #B42318; }
  .ad-bd-tl .ev.book .dot { background: var(--pri); border-color: var(--pri); color: #fff; }
  .ad-bd-tl .ev.note .dot { background: var(--act); border-color: var(--act); color: var(--ink); }
  .ad-bd-tl .x { padding-top: 4px; color: var(--ink2); } .ad-bd-tl .x b { color: var(--ink); margin-right: 4px; }
  .ad-bd-tl .ev.mail .x, .ad-bd-tl .ev.sys .x { color: var(--mute); font-size: 13px; }
  .ad-bd-tl .ev.note .x { background: var(--warn-soft); border-radius: 10px; padding: 6px 10px; }
  .ad-bd-tl .msg { grid-template-columns: 70px minmax(0, 1fr); padding-left: 0; }
  .ad-bd-tl .msg .bub { margin-left: 40px; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 4px 16px 16px 16px; padding: 10px 14px; max-width: 540px; box-shadow: 0 8px 20px -16px rgba(20,32,42,.4); position: relative; z-index: 1; }
  .ad-bd-tl .msg .bub b { font-size: 11.5px; letter-spacing: .04em; color: var(--mute); display: block; margin-bottom: 3px; }
  .ad-bd-tl .msg .bub p { margin: 0; font-size: 14.5px; color: var(--ink); }
  .ad-bd-tl .now { padding: 14px 0 0 96px; } .ad-bd-tl .now span { font-size: 11.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--pri); background: var(--pri-soft); padding: 3px 10px; border-radius: 99px; }
  .ad-bd-tl li { animation: ad-in .35s var(--ease) both; }
  .ad-bd-comp { overflow: hidden; box-shadow: 0 18px 40px -26px rgba(20,32,42,.35); margin-left: 82px; }
  .ad-bd-comp .tabs { display: flex; gap: 2px; flex-wrap: wrap; border-bottom: 1px solid var(--a-line); padding: 6px 8px 0; background: var(--bg2); }
  .ad-bd-comp .tabs button { font: 700 13px "DM Sans", sans-serif; background: none; border: 0; padding: 8px 12px 10px; color: var(--mute); cursor: pointer; border-radius: 8px 8px 0 0; display: inline-flex; gap: 6px; align-items: center; }
  .ad-bd-comp .tabs button[aria-selected="true"] { background: var(--a-surf); color: var(--ink); box-shadow: 0 1px 0 var(--a-surf), 0 0 0 1px var(--a-line); }
  .ad-bd-comp .in { padding: 14px var(--a-pad) var(--a-pad); display: grid; gap: 12px; }
  .ad-bd-props { display: grid; gap: 12px; position: sticky; top: 12px; }
  .ad-bd-props > details, .ad-bd-props > section { background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); padding: 12px 14px; display: grid; gap: 6px; font-size: 13.5px; }
  .ad-bd-props summary { display: flex; justify-content: space-between; gap: 8px; align-items: center; cursor: pointer; list-style: none; font-size: 12.5px; font-weight: 700; }
  .ad-bd-props summary::-webkit-details-marker { display: none; }
  .ad-bd-props dl { margin: 10px 0 0; display: grid; gap: 9px; }
  .ad-bd-props dl > div { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 8px; }
  .ad-bd-props dt { color: var(--mute); font-size: 12.5px; display: flex; gap: 4px; align-items: center; flex-wrap: wrap; } .ad-bd-props dd { margin: 0; font-weight: 700; display: grid; gap: 3px; }
  .ad-bd-props dd small { color: var(--mute); font-weight: 600; font-size: 12px; } .ad-bd-props dd.bad { color: #B42318; } .ad-bd-props dd .a-meter { height: 6px; margin-top: 5px; }
  .ad-bd-props .row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
  .ad-bd-props .tr { display: flex; justify-content: space-between; gap: 8px; align-items: center; flex-wrap: wrap; }
  .ad-bd-props .lnk { display: inline-flex; gap: 6px; align-items: center; font-size: 13px; } .ad-bd-props section > .muted { font-size: 13px; }

  /* C · lifecycle */
  .ad-bd-life { list-style: none; margin: 0; padding: 4px 0 2px; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(118px, 1fr); overflow-x: auto; counter-reset: s; }
  .ad-bd-life li { position: relative; }
  .ad-bd-life li::before { content: ""; position: absolute; top: 20px; left: -50%; width: 100%; height: 2px; background: var(--a-line); }
  .ad-bd-life li:first-child::before { display: none; }
  .ad-bd-life li.done::before, .ad-bd-life li.now::before, .ad-bd-life li.bad::before { background: var(--pri); }
  .ad-bd-life button { position: relative; width: 100%; display: grid; justify-items: center; gap: 4px; background: none; border: 0; font: inherit; color: var(--ink); cursor: pointer; padding: 4px 6px 8px; border-radius: 12px; transition: background .2s; }
  .ad-bd-life button:hover { background: var(--a-surf); } .ad-bd-life button[aria-pressed="true"] { background: var(--a-surf); box-shadow: 0 0 0 1px var(--a-line); }
  .ad-bd-life .nd { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; font-size: 13px; background: var(--a-surf); border: 2px solid var(--a-line); color: var(--mute); }
  .ad-bd-life .nd .ic { width: 15px; height: 15px; }
  .ad-bd-life .done .nd { background: var(--pri); border-color: var(--pri); color: #fff; }
  .ad-bd-life .bad .nd { background: #FDECEA; border-color: #F3C9C4; color: #B42318; }
  .ad-bd-life .now .nd { background: var(--act); border-color: var(--act); box-shadow: 0 0 0 5px color-mix(in srgb, var(--act) 28%, transparent); }
  .ad-bd-life b { font-size: 13px; text-align: center; line-height: 1.25; } .ad-bd-life small { font-size: 11.5px; color: var(--mute); font-weight: 600; }
  .ad-bd-life .now small { color: var(--warn); font-weight: 800; } .ad-bd-life .todo b { color: var(--mute); }
  .ad-bd-cgrid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 16px; align-items: start; }
  .ad-bd-moves { display: grid; gap: 10px; } .ad-bd-moves h2 { margin: 0; }
  .ad-bd-mv { background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); overflow: hidden; transition: border-color .2s, box-shadow .2s; }
  .ad-bd-mv:hover { border-color: color-mix(in srgb, var(--ink) 40%, var(--a-line)); } .ad-bd-mv.open { border-color: var(--pri); box-shadow: 0 0 0 1px var(--pri); }
  .ad-bd-mv .mh { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 10px; background: none; border: 0; font: inherit; text-align: left; color: var(--ink); padding: 12px 14px 6px; cursor: pointer; }
  .ad-bd-mv .mh > span { display: grid; gap: 4px; } .ad-bd-mv .mh b { font-size: 15px; display: flex; gap: 6px; align-items: center; } .ad-bd-mv .mh small { font-size: 12.5px; color: var(--mute); font-weight: 600; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .ad-bd-mv .mh > .ic { color: var(--mute); transition: transform .2s; } .ad-bd-mv.open .mh > .ic { transform: rotate(180deg); }
  .ad-bd-mv .fx { margin: 0; padding: 4px 14px 12px; display: grid; gap: 4px; }
  .ad-bd-mv .fx > div { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 8px; font-size: 12.5px; }
  .ad-bd-mv .fx dt { color: var(--mute); font-weight: 700; } .ad-bd-mv .fx dd { margin: 0; color: var(--ink2); }
  .ad-bd-mv .mf { border-top: 1px solid var(--a-line); padding: 12px 14px 14px; display: grid; gap: 12px; background: color-mix(in srgb, var(--bg2) 55%, var(--a-surf)); animation: ad-in .3s var(--ease) both; }
  .ad-bd-blocked { font-size: 13px; color: var(--mute); } .ad-bd-blocked summary { cursor: pointer; font-weight: 700; padding: 4px 0; }
  .ad-bd-blocked ul { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 6px; }
  .ad-bd-blocked li { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 8px 12px; border: 1px dashed var(--a-line); border-radius: 10px; }
  .ad-bd-blocked li b { color: var(--ink2); }
  .ad-bd-stage { position: sticky; top: 12px; overflow: hidden; }
  .ad-bd-stage .a-card-b { display: grid; gap: 10px; font-size: 13.5px; animation: ad-in .3s var(--ease) both; }
  .ad-bd-stage p { margin: 0; color: var(--ink2); }
  .ad-bd-stage blockquote { margin: 0; background: var(--bg2); border-radius: 10px; padding: 9px 12px; font-size: 14.5px; color: var(--ink2); }
  .ad-bd-stage .a-card.flush, .ad-bd-stage .a-tw { margin: 0 calc(var(--a-pad) * -1); }
  .ad-bd-lines { display: grid; gap: 6px; } .ad-bd-lines > div { display: flex; justify-content: space-between; gap: 10px; } .ad-bd-lines .tot { border-top: 1px solid var(--ink); padding-top: 7px; font-weight: 800; }
  .ad-bd-evs { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; } .ad-bd-evs li { display: grid; gap: 1px; } .ad-bd-evs small { color: var(--mute); font-size: 11.5px; font-weight: 700; }
  .ad-bd-money { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-top: 1px solid var(--a-line); background: var(--bg2); }
  .ad-bd-money > div { padding: 10px 14px; display: grid; gap: 2px; } .ad-bd-money > div + div { border-left: 1px solid var(--a-line); }
  .ad-bd-money small { font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--mute); display: flex; gap: 4px; align-items: center; } .ad-bd-money b { font-size: 16px; }

  /* D · document */
  .ad-bd-dtabs { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
  .ad-bd-dtabs button { flex: 0 0 auto; display: grid; gap: 1px; text-align: left; font: inherit; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 12px; padding: 8px 14px; cursor: pointer; color: var(--ink); transition: border-color .2s; }
  .ad-bd-dtabs button b { font-size: 13.5px; display: flex; gap: 6px; align-items: center; } .ad-bd-dtabs button small { font-size: 11.5px; color: var(--mute); font-weight: 600; font-family: ui-monospace, "SF Mono", Consolas, monospace; }
  .ad-bd-dtabs button.na b { color: var(--mute); } .ad-bd-dtabs button.na small { font-family: inherit; }
  .ad-bd-dtabs button[aria-selected="true"] { border-color: var(--ink); box-shadow: inset 0 0 0 1px var(--ink); }
  .ad-bd-docw { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 18px; align-items: start; }
  .ad-bd-desk { background: color-mix(in srgb, var(--ink) 6%, var(--a-bg)); border-radius: var(--a-r); padding: 24px; min-width: 0; }
  .ad-bd-paper { background: #fff; color: var(--ink); max-width: 720px; margin: 0 auto; padding: 32px 36px 26px; border-radius: 4px; box-shadow: 0 1px 2px rgba(20,32,42,.08), 0 24px 50px -30px rgba(20,32,42,.45); display: grid; gap: 20px; font-size: 13.5px; animation: ad-in .35s var(--ease) both; }
  .ad-bd-paper.empty { text-align: center; justify-items: center; padding: 60px 30px; gap: 10px; } .ad-bd-paper.empty h2 { margin: 0; font-size: 22px; } .ad-bd-paper.empty p { margin: 0; color: var(--mute); max-width: 420px; }
  .ad-bd-paper .lh { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding-bottom: 16px; border-bottom: 2px solid var(--ink); }
  .ad-bd-paper .lh .logo { display: flex; gap: 8px; align-items: center; font: 800 19px "DM Sans", sans-serif; letter-spacing: -.03em; color: var(--pri); }
  .ad-bd-paper .lh .logo i { width: 22px; height: 22px; border-radius: 6px; background: var(--pri); display: block; }
  .ad-bd-paper .lh small { display: block; color: var(--mute); font-size: 11.5px; margin-top: 6px; line-height: 1.5; } .ad-bd-paper .lh em { font-style: normal; color: var(--warn); font-weight: 700; }
  .ad-bd-paper .dn { display: grid; justify-items: end; gap: 4px; text-align: right; } .ad-bd-paper .dn b { font-size: 16px; }
  .ad-bd-paper .two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; } .ad-bd-paper .two > div { display: grid; gap: 2px; } .ad-bd-paper .two span:not(.eyeb):not(.a-chip) { color: var(--ink2); font-size: 13px; }
  .ad-bd-paper .blk { display: grid; gap: 8px; }
  .ad-bd-paper .trip { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 14px; align-items: center; }
  .ad-bd-paper .trip img { width: 96px; height: 72px; object-fit: cover; border-radius: 8px; display: block; } .ad-bd-paper .trip > div { display: grid; gap: 3px; } .ad-bd-paper .trip b { font-size: 16px; }
  .ad-bd-paper .ed { font: inherit; color: var(--ink); background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline dashed color-mix(in srgb, var(--pri) 55%, transparent); text-underline-offset: 4px; display: inline-flex; gap: 8px; align-items: center; text-align: left; }
  .ad-bd-paper .ed .pen { font-size: 11px; font-weight: 800; color: var(--pri); display: inline-flex; align-items: center; gap: 2px; opacity: 0; transition: opacity .2s; text-decoration: none; }
  .ad-bd-paper .ed:hover .pen, .ad-bd-paper .ed:focus-visible .pen, .ad-bd-paper .ed[aria-expanded="true"] .pen { opacity: 1; } .ad-bd-paper .ed .pen .ic { width: 12px; height: 12px; }
  .ad-bd-paper .ed:hover { background: var(--pri-soft); }
  .ad-bd-edp { background: var(--bg2); border: 1px solid var(--a-line); border-radius: 12px; padding: 12px 14px; display: grid; gap: 10px; animation: ad-in .3s var(--ease) both; }
  .ad-bd-edp .eyeb { color: var(--pri); display: flex; gap: 6px; align-items: center; }
  .ad-bd-edp .alts { display: flex; gap: 8px; flex-wrap: wrap; }
  .ad-bd-edp .alts label, .ad-bd-edp .ao { display: flex; gap: 8px; align-items: center; background: #fff; border: 1px solid var(--a-line); border-radius: 10px; padding: 8px 12px; cursor: pointer; }
  .ad-bd-edp .alts label span, .ad-bd-edp .ao > span:nth-child(2) { display: grid; } .ad-bd-edp small { color: var(--mute); font-size: 12px; } .ad-bd-edp .ao .num { margin-left: auto; font-weight: 800; }
  .ad-bd-edp .rq { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 16px; font-size: 13px; max-width: 380px; } .ad-bd-edp .rq .num { text-align: right; }
  .ad-bd-edp .steps { display: flex; gap: 14px; flex-wrap: wrap; } .ad-bd-edp .stp { display: inline-flex; gap: 8px; align-items: center; } .ad-bd-edp .stp b { min-width: 18px; text-align: center; }
  .ad-bd-paper .trv { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; }
  .ad-bd-paper .trv li { display: flex; justify-content: space-between; gap: 10px; align-items: center; padding: 7px 0; border-bottom: 1px dotted var(--a-line); } .ad-bd-paper .trv small { color: var(--mute); margin-left: 8px; }
  .ad-bd-paper .ln { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  .ad-bd-paper .ln th { text-align: left; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--mute); padding: 6px 0; border-bottom: 1px solid var(--ink); }
  .ad-bd-paper .ln td { padding: 9px 0; border-bottom: 1px solid var(--a-line); vertical-align: top; } .ad-bd-paper .ln td small { display: block; color: var(--mute); font-size: 11.5px; }
  .ad-bd-paper .ln .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; padding-left: 12px; } .ad-bd-paper .ln tr.add td { color: var(--pri); font-weight: 700; }
  .ad-bd-paper .tt { margin: 0 0 0 auto; width: min(320px, 100%); display: grid; gap: 4px; }
  .ad-bd-paper .tt > div { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; color: var(--ink2); } .ad-bd-paper .tt dd { margin: 0; font-variant-numeric: tabular-nums; }
  .ad-bd-paper .tt .g { border-top: 2px solid var(--ink); padding-top: 7px; margin-top: 3px; font-weight: 800; color: var(--ink); font-size: 15px; }
  .ad-bd-paper .pays { list-style: none; margin: 0; padding: 0; display: grid; }
  .ad-bd-paper .pays li { display: grid; grid-template-columns: 150px minmax(0, 1fr) auto; gap: 10px; padding: 7px 0; border-bottom: 1px dotted var(--a-line); font-size: 13px; }
  .ad-bd-paper .pays li > span:first-child { color: var(--mute); } .ad-bd-paper .pays li.fail .num { color: #B42318; font-weight: 700; } .ad-bd-paper .pays .num { text-align: right; font-weight: 700; }
  .ad-bd-paper .bal { display: flex; justify-content: space-between; gap: 10px; background: var(--bg2); border-radius: 8px; padding: 10px 12px; font-weight: 800; }
  .ad-bd-paper .fp { font-size: 11.5px; color: var(--mute); border-top: 1px solid var(--a-line); padding-top: 12px; }
  .ad-bd-margin { display: grid; gap: 12px; position: sticky; top: 12px; }
  .ad-bd-mn { background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); padding: 12px 14px; display: grid; gap: 6px; font-size: 13px; }
  .ad-bd-mn p { margin: 0; color: var(--ink2); } .ad-bd-mn .row { display: flex; gap: 6px; flex-wrap: wrap; } .ad-bd-mn b { font-size: 14.5px; }
  .ad-bd-mn.warn { background: var(--warn-soft); border-color: color-mix(in srgb, var(--warn) 25%, transparent); } .ad-bd-mn.warn .eyeb { color: var(--warn); }
  .ad-bd-mn.bad { background: #FDECEA; border-color: #F3C9C4; } .ad-bd-mn.bad .eyeb { color: #B42318; }
  .ad-bd-mn.ok { background: var(--ok-soft); border-color: transparent; } .ad-bd-mn.ok .eyeb { color: var(--ok); display: flex; gap: 6px; align-items: center; }
  .ad-bd-mn .h { display: grid; gap: 1px; font-size: 12.5px; } .ad-bd-mn .h small { color: var(--mute); font-weight: 700; font-size: 11px; }

  @container site (max-width: 700px) {
    .ad-bd-demo .a-seg { overflow-x: auto; max-width: 100%; } .ad-bd-demo .a-seg button { white-space: nowrap; }
    .ad-bd-case { grid-template-columns: 1fr; } .ad-bd-props { order: -1; position: static; }
    .ad-bd-props > details:not([open]) dl { display: none; }
    .ad-bd-tl::before { left: 13px; } .ad-bd-tl .day, .ad-bd-tl .now { padding-left: 38px; }
    .ad-bd-tl .ev { grid-template-columns: 28px minmax(0, 1fr); gap: 0 10px; } .ad-bd-tl .ev .t { grid-column: 2; grid-row: 2; text-align: left; padding-top: 0; font-size: 11.5px; } .ad-bd-tl .ev .dot { grid-row: 1 / span 2; }
    .ad-bd-tl .msg { grid-template-columns: minmax(0, 1fr); } .ad-bd-tl .msg .t { grid-row: 2; padding-left: 38px; } .ad-bd-tl .msg .bub { margin-left: 38px; }
    .ad-bd-comp { margin-left: 0; } .ad-bd-comp .tabs { flex-wrap: nowrap; overflow-x: auto; } .ad-bd-comp .tabs button { white-space: nowrap; }
    .ad-bd-life { grid-auto-columns: 104px; }
    .ad-bd-cgrid { grid-template-columns: 1fr; } .ad-bd-stage { position: static; order: -1; }
    .ad-bd-money { grid-template-columns: 1fr 1fr; } .ad-bd-money > div:nth-child(3) { border-left: 0; } .ad-bd-money > div:nth-child(n+3) { border-top: 1px solid var(--a-line); }
    .ad-bd-docw { grid-template-columns: 1fr; } .ad-bd-margin { order: -1; position: static; } .ad-bd-margin > .ad-bd-mn:nth-child(n+3) { display: none; }
    .ad-bd-desk { padding: 8px; } .ad-bd-paper { padding: 20px 16px; gap: 16px; }
    .ad-bd-paper .two { grid-template-columns: 1fr; } .ad-bd-paper .trip { grid-template-columns: 72px minmax(0, 1fr); } .ad-bd-paper .trip img { width: 72px; height: 56px; }
    .ad-bd-paper .ln th:nth-child(2), .ad-bd-paper .ln td:nth-child(2), .ad-bd-paper .ln th:nth-child(3), .ad-bd-paper .ln td:nth-child(3) { display: none; }
    .ad-bd-paper .pays li { grid-template-columns: minmax(0, 1fr) auto; } .ad-bd-paper .pays li > span:first-child { grid-column: 1 / -1; font-size: 11.5px; }
    .ad-bd-paper .ed .pen { opacity: 1; }
  }`;

  /* ---------- register ---------- */
  TS.addVariants('bookings', [
    { id: 'B', name: 'Departure board', render: renderDeskB, mount: mountDeskB,
      tradeoff: 'Finding one booking by name means searching, not scanning a flat list, and cancelled bookings sit under dates that no longer matter to them.',
      note: 'The desk is organised the way a small operator actually works: by <b>departure</b>. A ruler across the top shows the next five weeks of dates with a seat bar and a “to do” count; each departure below is a section with its seats (booked, held, free), a v2.5 <b>readiness</b> figure (details in) and the balance still to collect, then only the bookings that are not settled. Settled ones fold into one line (“5 more bookings · 13 seats · nothing to do”). The owner first looks at the nearest date with a “to do” count, ticks rows and uses the batch bar at the bottom (details link, balance reminder, WhatsApp, CSV). “Needs you” hides every quiet row. On a phone the ruler scrolls sideways, section headers stack and rows become two-line cards.' },
    { id: 'C', name: 'Triage queue', render: renderDeskC, mount: mountDeskC,
      tradeoff: 'Great for clearing the day, poor for browsing or answering “what does next week look like”; the list view is one click away rather than the default.',
      note: 'The desk becomes an inbox-zero queue: <b>one booking at a time</b>, with its next action already open. Items are sorted into lanes (Decide, Money out, Collect, Chase details) and ordered by urgency; the big card in the middle shows why it is here, the context in one strip, and the complete form (refund pre-filled from the policy, the UTR the customer sent, the payment link amount). <kbd>E</kbd> does it, <kbd>S</kbd> snoozes to tomorrow, <kbd>J</kbd>/<kbd>K</kbd> move; the progress bar fills as the day clears, and live checkouts sit in a “Watching” box because they are not the owner’s move. Click the card, then try the keys. On a phone the card comes first and the queue follows as a list.' },
    { id: 'D', name: 'Money ledger', render: renderDeskD, mount: mountDeskD,
      tradeoff: 'Money-first means trip logistics (seats, details, dates) take a back seat; this works as a second tab beside a board, not the only desk.',
      note: 'The desk read as a <b>ledger</b>: every payment, deposit, refund owed, failed attempt and customer claim is a row, matched to its booking, with its v2.5 receipt number. A statement band on top does the maths (collected − refunds to send = yours to keep) beside an ageing bar of balances still to come in. A claim like Vikram’s “I paid by UPI” shows up as <b>to match</b> until it is recorded. Click any row to open its payment chain inline with the right action (record, refund through Razorpay, receipt). “By booking” flips it into a reconciliation table: total, paid in, refunded, owed each way, and a word for the state. On a phone the wide columns scroll inside the card.' },
  ], cssDesk);

  TS.addVariants('booking', [
    { id: 'B', name: 'Case file', render: renderDetB, mount: mountDetB,
      tradeoff: 'Reading top to bottom is natural for a story but slower for a quick “how much is still owed”, which lives in the side properties instead.',
      note: 'Built like a support ticket or a Linear issue: the booking is <b>one chronological thread</b>, oldest first, with day breaks, payments, emails, system events and the customer’s own words as a message bubble. The thread ends at a <b>Now</b> marker, and under it a composer holds only the actions valid for this state as tabs (approve and refund, reject, offer a date change, note). Acting adds an entry to the thread, so the page is also the v2.5 history. A properties column on the right (status, trip, seats, money, channel, travellers, GST documents) answers the facts. On a phone the properties collapse into one summary at the top, and the thread and composer run full width.' },
    { id: 'C', name: 'Lifecycle', render: renderDetC, mount: mountDetC,
      tradeoff: 'The stepper is clearest for the common paths; unusual histories (a date change after a part payment) need more nodes than fit one line.',
      note: 'The booking as a <b>state machine</b>. A stepper across the top shows where it has been and where it stands (Booked → Paid → Details in → Cancel requested → Departs → Completed; a lapsed hold or a late payment bends the path). Below it, “From here you can” lists only the <b>valid moves</b>, each spelling out what it becomes and what it does to seats, money, documents and email before you commit; the moves that are not allowed are listed with the reason. Click any step to see what happened there (the payment, the traveller details, the customer’s request). On a phone the stepper scrolls sideways and the step panel sits above the moves.' },
    { id: 'D', name: 'Document', render: renderDetD, mount: mountDetD,
      tradeoff: 'Editing on a document feels exact but hides that a change can re-price the booking; the inline re-quote has to carry that weight.',
      note: 'The booking <b>is the document</b>: the working copy looks like the voucher and GST invoice the customer and the CA receive, and underlined fields are the editor. Click the dates to move the booking with a live re-quote and fee (v2.5 change date), the party to re-quote, or “Add-ons” to add extras. Tabs switch to the issued documents (receipt, tax invoice, credit note), which cannot be edited and say plainly when one does not exist yet and why. The decision the booking waits on sits in the margin, pinned to the line it affects, with contact and the latest history below. On a phone the margin decision comes first and the paper runs edge to edge.' },
  ], cssDet);
})();
