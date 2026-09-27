/* Book now · v2.5 — the shipped Book-now sheet (B0 variant B) extended with:
   R47 early-bird tiers (labels on each date + a price ladder), R46 "Make it yours" add-ons,
   R43 pay in full vs reserve with 25 % now. The quote is worked out here to the rupee in the
   order the api will use: fares → deal → early-bird → coupon → add-ons (never discounted) → total.
   "Today" is Sun 27 Sep 2026, IST. Dates are handled as UTC midnights so no timezone can shift them. */
(() => {
  const TS = window.TS;
  const { inr, esc, ICON } = TS;
  const P = TS.PKGS.munnar;

  /* ---------------- dates (IST calendar days) ---------------- */
  const DAY = 864e5;
  const D = (y, m, d) => Date.UTC(y, m - 1, d);
  const TODAY = D(2026, 9, 27);
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dt = (t, o = {}) => {
    const x = new Date(t);
    return `${o.wd ? WD[x.getUTCDay()] + ' ' : ''}${x.getUTCDate()} ${MO[x.getUTCMonth()]}${o.yr ? ' ' + x.getUTCFullYear() : ''}`;
  };
  const daysBetween = (a, b) => Math.round((b - a) / DAY);

  /* ---------------- the package's pricing, as the owner set it ---------------- */
  const NIGHTS = P.nights; // 4
  const DEAL = { label: 'Festive deal', off: 1000, ends: D(2026, 12, 31) };
  const TIERS = [ // longest lead first: the first tier that fits is the one that applies
    { n: 90, off: 1500, name: 'Tier 1' },
    { n: 45, off: 750, name: 'Tier 2' },
  ];
  const COUPON = { code: 'WELCOME10', pct: 10, cap: 1000 };
  const DEPOSIT_PCT = 25, BALANCE_DAYS = 30, MAX_PARTY = 12;
  const DEPS = [
    { id: 'o16', t: D(2026, 10, 16), double: 22999, triple: 20999, child: 13499, sup: 9500, left: 5 },
    { id: 'n13', t: D(2026, 11, 13), double: 22999, triple: 20999, child: 13499, sup: 9500, left: 7, g: true },
    { id: 'n27', t: D(2026, 11, 27), double: 22999, triple: 20999, child: 13499, sup: 9500, left: 0 },
    { id: 'd18', t: D(2026, 12, 18), double: 25999, triple: 23999, child: 15499, sup: 11000, left: 3 },
    { id: 'j15', t: D(2027, 1, 15), double: 21999, triple: 19999, child: 12999, sup: 9000, left: 9, g: true },
    { id: 'f12', t: D(2027, 2, 12), double: 0, triple: 0, child: 0, sup: 0, left: 12 },
  ];
  const ADDONS = [
    { id: 'boat', per: 'booking', price: 4500, name: 'AC premium houseboat', img: 'img/kerala-1.jpg',
      alt: 'A kettuvallam houseboat moored on the Alleppey backwaters',
      blurb: 'Swap the standard boat for a premium one: AC bedrooms all night and an upper-deck lounge.' },
    { id: 'canoe', per: 'traveller', price: 900, name: 'Sunrise canoe, Kuttanad', img: 'img/kerala-2.jpg',
      alt: 'Palm-lined canal on the Alleppey backwaters at first light',
      blurb: 'Two hours at 6:30 am in a country canoe, down canals the houseboat can’t enter. Tea on board.' },
    { id: 'night', per: 'night', price: 3200, max: 2, name: 'Extra night in Munnar', img: 'img/munnar-2.jpg',
      alt: 'Tea gardens in Munnar seen from above',
      blurb: 'Stay on at Tea County with breakfast, for your whole party. Your return moves by the same nights.' },
    { id: 'jeep', per: 'booking', price: 3600, name: 'Kolukkumalai sunrise jeep', img: 'img/munnar-1.jpg',
      alt: 'Rows of tea bushes on a Munnar hillside',
      blurb: 'A private jeep at 4 am up to the highest tea estate in the world. Seats up to 6.' },
  ];
  const UNIT = { booking: 'per booking', traveller: 'per traveller', night: 'per traveller, per night' };

  /* ---------------- state ---------------- */
  const S = {
    dep: 'j15', rooms: { double: 1, triple: 0, single: 0 }, children: 1,
    add: { boat: 1, canoe: 2, night: 0, jeep: 0 },
    coupon: true, couponErr: '', pay: 'dep', rc: false, rzp: false, vals: {}, dq: 0,
  };
  const depById = (id) => DEPS.find((d) => d.id === id);
  const adults = () => S.rooms.double * 2 + S.rooms.triple * 3 + S.rooms.single;
  const party = () => adults() + S.children;
  const why = (d) => (d.double === 0 ? 'on' : d.left === 0 ? 'sold' : null);
  const tierFor = (d, bookDay) => TIERS.find((t) => daysBetween(bookDay, d.t) >= t.n) || null;
  const clampAdds = () => { S.add.canoe = Math.min(S.add.canoe, party()); };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  /* ---------------- the quote (to the rupee) ---------------- */
  function quote(bookDay = TODAY) {
    const d = depById(S.dep);
    const n = party();
    const fares = [], units = [];
    const add = (id, label, count, unit) => {
      if (!count) return;
      fares.push({ id, label: `${label} · ${count} × ${inr(unit)}`, amt: count * unit });
    };
    add('f-dbl', 'Double sharing', S.rooms.double * 2, d.double);
    add('f-tpl', 'Triple sharing', S.rooms.triple * 3, d.triple);
    add('f-sgl', 'Single room', S.rooms.single, d.double);
    add('f-sup', 'Single supplement', S.rooms.single, d.sup);
    add('f-chd', 'Child 5–11', S.children, d.child);
    for (let i = 0; i < S.rooms.double * 2; i++) units.push(d.double);
    for (let i = 0; i < S.rooms.triple * 3; i++) units.push(d.triple);
    for (let i = 0; i < S.rooms.single; i++) units.push(d.double + d.sup);
    for (let i = 0; i < S.children; i++) units.push(d.child);
    const sub = fares.reduce((a, l) => a + l.amt, 0);
    // Per traveller, never below ₹1 each: deal first, then early-bird on what is left.
    const dealOn = bookDay <= DEAL.ends;
    const dealEach = units.map((u) => (dealOn ? Math.min(DEAL.off, u - 1) : 0));
    const dealOff = dealEach.reduce((a, b) => a + b, 0);
    const tier = tierFor(d, bookDay);
    const ebOff = tier ? units.reduce((a, u, i) => a + Math.min(tier.off, u - dealEach[i] - 1), 0) : 0;
    const fare = sub - dealOff - ebOff;
    const cpn = S.coupon ? Math.min(COUPON.cap, Math.round((fare * COUPON.pct) / 100)) : 0;
    const fareNet = fare - cpn;
    const adds = ADDONS.map((a) => {
      const q = S.add[a.id];
      if (!q) return null;
      if (a.per === 'booking') return { id: 'ad-' + a.id, label: `${a.name} · per booking`, amt: a.price };
      if (a.per === 'traveller') return { id: 'ad-' + a.id, label: `${a.name} · ${q} × ${inr(a.price)}`, amt: q * a.price };
      return { id: 'ad-' + a.id, label: `${a.name} · ${n} × ${plural(q, 'night', 'nights')} × ${inr(a.price)}`, amt: n * q * a.price };
    }).filter(Boolean);
    const addSum = adds.reduce((a, l) => a + l.amt, 0);
    const total = fareNet + addSum;
    const daysOut = daysBetween(TODAY, d.t);
    const depositOk = daysOut > BALANCE_DAYS;
    const deposit = Math.round((total * DEPOSIT_PCT) / 100);
    const byDeposit = S.pay === 'dep' && depositOk;
    return {
      d, n, fares, sub, dealOn, dealOff, tier, ebOff, fare, cpn, fareNet, adds, addSum, total,
      daysOut, depositOk, deposit, balance: total - deposit, due: d.t - BALANCE_DAYS * DAY,
      byDeposit, payNow: byDeposit ? deposit : total,
      back: d.t + (NIGHTS + S.add.night) * DAY,
      ok: adults() > 0 && n <= d.left,
    };
  }

  /* The ladder: the trip fare (after deal, early-bird and coupon; add-ons excluded) on each day a tier ends. */
  function ladderData(q) {
    const rungs = [{ key: 'now', when: 'Book today', sub: `${dt(TODAY, { wd: 1 })} · ${q.tier ? `early bird −${inr(q.tier.off)} each` : 'no early bird'}`, fare: q.fareNet, now: true }];
    const ended = [];
    TIERS.forEach((t) => {
      const end = q.d.t - t.n * DAY;
      if (end >= TODAY) {
        const from = end + DAY, qq = quote(from);
        rungs.push({ key: t.name, when: `From ${dt(from)}`, sub: `${t.name} ends ${dt(end)} · ${qq.tier ? `−${inr(qq.tier.off)} each after` : 'no early bird after'}`, fare: qq.fareNet });
      } else ended.push(`${t.name} (−${inr(t.off)}) ended ${dt(end)}`);
    });
    return { rungs, ended };
  }

  /* ---------------- small builders ---------------- */
  const act = (a, id = '', v = '') => `data-act="${a}" data-id="${id}" data-v="${v}" data-k="${a}-${id}-${v}"`;
  const val = (id, dflt) => esc(S.vals[id] !== undefined ? S.vals[id] : dflt);
  const cnt = (key, v) => `<span class="num" data-count="${key}" data-v="${v}">${inr(v)}</span>`;
  const EB = (t, by) => `<span class="eb">${ICON.clock}Early bird −${inr(t.off)} · book by ${dt(by)}</span>`;

  function depRows() {
    return `<div class="deps" role="group" aria-label="Departure dates">${DEPS.map((d) => {
      const w = why(d);
      if (w === 'sold') return `<div class="dep off"><span class="d">${dt(d.t, { wd: 1, yr: 1 })}</span><span class="badge sold why">Sold out</span><span class="m">Fully booked</span><span></span></div>`;
      if (w === 'on') return `<div class="dep off"><span class="d">${dt(d.t, { wd: 1, yr: 1 })}</span><a class="why" href="#enquire">Price on request</a><span class="m">Date set, price not yet — we’ll quote you</span><span></span></div>`;
      const t = tierFor(d, TODAY), days = daysBetween(TODAY, d.t);
      const pp = d.double - DEAL.off - (t ? t.off : 0);
      const seats = d.left <= 4 ? `<span class="badge fill">${plural(d.left, 'seat', 'seats')} left</span>` : d.g ? `<span class="badge sure">Guaranteed</span> ${d.left} seats left` : `${d.left} seats left`;
      return `<button class="dep" ${act('dep', d.id)} aria-pressed="${S.dep === d.id}"><span class="d">${dt(d.t, { wd: 1, yr: 1 })}</span><span class="p num">${inr(pp)}<small><s>${inr(d.double)}</s> per person, double</small></span><span class="m">${seats}${t ? EB(t, d.t - t.n * DAY) : ''}${days <= BALANCE_DAYS ? `<span class="pif">${days} days away · pay in full only</span>` : ''}</span><span></span></button>`;
    }).join('')}</div><span class="live">Live availability · checked just now</span>`;
  }

  function ladderList(q) {
    const { rungs, ended } = ladderData(q);
    const base = rungs[0].fare;
    const none = rungs.length === 1 && !q.tier;
    return `<div class="lad" aria-label="Price ladder for ${dt(q.d.t, { yr: 1 })}"><div class="lad-h"><b>${ICON.chart} Price ladder</b><span>Trip fare for ${plural(q.n, 'traveller', 'travellers')}, add-ons extra</span></div>${none
      ? `<p class="lad-none">No early bird left on ${dt(q.d.t)} — both tiers have ended. The price below won’t go up before departure.</p>`
      : `<ol>${rungs.map((r) => `<li class="${r.now ? 'now' : ''}"><span class="w"><b>${r.when}</b><small>${r.sub}</small></span><span class="pp"><b class="num">${inr(r.fare)}</b>${r.now ? '<em class="you">Your price</em>' : `<em class="up num">+${inr(r.fare - base)}</em>`}</span></li>`).join('')}</ol>`}<p class="fine">Tiers are counted in IST from the day you pay. Early bird never applies to add-ons.${ended.length ? ' ' + ended.join('; ') + '.' : ''}</p></div>`;
  }

  function ladderStairs(q) {
    const { rungs, ended } = ladderData(q);
    const base = rungs[0].fare;
    const max = Math.max(...rungs.map((r) => r.fare)), min = Math.min(...rungs.map((r) => r.fare));
    const h = (f) => Math.round(54 + (max === min ? 0 : (46 * (f - min)) / (max - min)));
    return `<div class="stairs-w" aria-label="Price ladder for ${dt(q.d.t, { yr: 1 })}"><div class="lad-h"><b>${ICON.chart} What waiting costs</b><span>Trip fare for ${plural(q.n, 'traveller', 'travellers')}, add-ons extra</span></div><div class="stairs" style="--n:${rungs.length}">${rungs.map((r) => `<div class="stair ${r.now ? 'now' : ''}"><div class="bar" style="--h:${h(r.fare)}px"><span class="num">${inr(r.fare)}</span></div><b>${r.when}</b><small>${r.now ? (q.tier ? `Early bird −${inr(q.tier.off)} each` : 'No early bird left') : `+${inr(r.fare - base)} · ${r.sub.split(' · ')[0]}`}</small></div>`).join('')}</div><p class="fine">${rungs.length === 1 ? `No early bird left on ${dt(q.d.t)}; this is the price until departure. ` : ''}Counted in IST from the day you pay; never on add-ons.${ended.length ? ' ' + ended.join('; ') + '.' : ''}</p></div>`;
  }

  function roomsBlock(q) {
    const full = party();
    const row = (k, t, s, size) => `<div class="room"><div><b>${t}</b><small>${s}</small></div><div class="ctr"><button ${act('room', k, -1)} aria-label="Fewer: ${t}" ${S.rooms[k] === 0 || (S.children > 0 && adults() - size <= 0) ? 'disabled' : ''}>−</button><output class="num" aria-live="polite">${S.rooms[k]}</output><button ${act('room', k, 1)} aria-label="More: ${t}" ${full + size > MAX_PARTY ? 'disabled' : ''}>+</button></div></div>`;
    const short = full > q.d.left ? `<div class="warnline" role="status">Only ${plural(q.d.left, 'seat', 'seats')} left on ${dt(q.d.t, { yr: 1 })}, and your party needs ${full}. Pick another date or fewer travellers.</div>` : '';
    return `<div class="rooms">${row('double', 'Double room', '2 adults, twin sharing', 2)}${row('triple', 'Triple room', '3 adults, with an extra bed', 3)}${row('single', 'Single room', `1 adult, +${inr(q.d.sup)} supplement`, 1)}<div class="room"><div><b>Children 5–11</b><small>Share a parent’s room, child rate</small></div><div class="ctr"><button ${act('kid', '', -1)} aria-label="Fewer: children" ${S.children === 0 ? 'disabled' : ''}>−</button><output class="num" aria-live="polite">${S.children}</output><button ${act('kid', '', 1)} aria-label="More: children" ${full + 1 > MAX_PARTY || adults() === 0 ? 'disabled' : ''}>+</button></div></div></div>${short}<p class="fine">${plural(adults(), 'adult', 'adults')}, ${plural(S.children, 'child', 'children')} · up to ${MAX_PARTY} per booking.</p>`;
  }

  const ADULT_NAMES = [['Ananya Rao', '34'], ['Vikram Rao', '36']];
  const KID_NAMES = [['Mira Rao', '8']];
  function names() {
    const slots = [];
    let ai = 0;
    const room = (k, size, label) => { for (let r = 0; r < S.rooms[k]; r++) for (let i = 0; i < size; i++) slots.push({ key: `${k}-${r}-${i}`, room: `${label} ${r + 1}`, dflt: ADULT_NAMES[ai++] || ['', ''] }); };
    room('double', 2, 'Double room'); room('triple', 3, 'Triple room'); room('single', 1, 'Single room');
    for (let c = 0; c < S.children; c++) slots.push({ key: `child-${c}`, room: 'Child 5–11', dflt: KID_NAMES[c] || ['', ''] });
    return `<fieldset class="names"><legend class="eyebrow">Names, as on their ID</legend>${slots.map((s, i) => `${i === 0 || slots[i - 1].room !== s.room ? `<span class="rm">${s.room}</span>` : ''}<div class="nm"><label class="sr" for="t-${s.key}">Traveller ${i + 1} name</label><input id="t-${s.key}" placeholder="Traveller ${i + 1}" value="${val('t-' + s.key, s.dflt[0])}"><label class="sr" for="a-${s.key}">Traveller ${i + 1} age</label><input id="a-${s.key}" inputmode="numeric" placeholder="Age" value="${val('a-' + s.key, s.dflt[1])}"></div>`).join('')}</fieldset>`;
  }

  function contact() {
    return `<div class="fields"><div class="fld full"><label for="c-name">Lead traveller</label><input id="c-name" value="${val('c-name', 'Ananya Rao')}" autocomplete="name"></div><div class="fld"><label for="c-phone">Mobile</label><input id="c-phone" value="${val('c-phone', '98450 12345')}" inputmode="tel"></div><div class="fld"><label for="c-email">Email</label><input id="c-email" value="${val('c-email', 'ananya.rao@example.com')}" type="email"></div></div><p class="fine">Your voucher, receipts and balance reminders go to this email.</p>`;
  }

  /* one control per add-on kind */
  function addCtl(a, q) {
    const v = S.add[a.id];
    if (a.per === 'booking') return `<button class="tg" role="switch" aria-checked="${!!v}" ${act('tg', a.id)} aria-label="${esc(a.name)}, ${inr(a.price)} per booking"><i></i></button>`;
    if (a.per === 'traveller') return `<div class="ctr sm" role="group" aria-label="${esc(a.name)}: travellers"><button ${act('qty', a.id, -1)} aria-label="One fewer traveller for ${esc(a.name)}" ${v === 0 ? 'disabled' : ''}>−</button><output class="num" aria-live="polite">${v}</output><button ${act('qty', a.id, 1)} aria-label="One more traveller for ${esc(a.name)}" ${v >= q.n ? 'disabled' : ''}>+</button></div>`;
    const opts = [0]; for (let i = 1; i <= a.max; i++) opts.push(i);
    return `<div class="seg" role="group" aria-label="${esc(a.name)}: nights">${opts.map((i) => `<button ${act('nights', a.id, i)} aria-pressed="${v === i}">${i === 0 ? 'None' : plural(i, 'night', 'nights')}</button>`).join('')}</div>`;
  }
  const addAmt = (a, q) => {
    const v = S.add[a.id];
    const amt = !v ? 0 : a.per === 'booking' ? a.price : a.per === 'traveller' ? v * a.price : q.n * v * a.price;
    return amt ? `<span class="amt num">+${inr(amt)}</span>` : `<span class="amt off">Not added</span>`;
  };
  const addUnit = (a) => `${inr(a.price)} ${UNIT[a.per]}${a.max ? ` · up to ${a.max}` : ''}`;

  function breakdown(q) {
    const L = (id, label, amt, cls = '') => `<div class="l ${cls}" data-line="${id}"><span>${label}</span><span class="num">${inr(amt)}</span></div>`;
    return `<div class="brk">${q.fares.map((l) => L(l.id, l.label, l.amt)).join('')}${q.dealOff ? L('deal', `${DEAL.label} · ${q.n} × −${inr(DEAL.off)}`, -q.dealOff, 'deal') : ''}${q.ebOff ? L('eb', `Early bird · ${q.n} × −${inr(q.tier.off)} · ${q.daysOut} days ahead`, -q.ebOff, 'deal') : ''}${q.cpn ? L('cpn', `Coupon <span class="cc">${COUPON.code}</span> · ${COUPON.pct}%, up to ${inr(COUPON.cap)}`, -q.cpn, 'deal') : ''}${L('fare', 'Trip fare', q.fareNet, 'sub')}${q.adds.length ? `<div class="gh">Add-ons · no discounts apply</div>${q.adds.map((l) => L(l.id, l.label, l.amt)).join('')}` : ''}<div class="tot"><span>Total</span><b>${cnt('total', q.total)}</b></div><div class="pp num">${inr(q.total / Math.max(q.n, 1))} per traveller, add-ons included</div></div>`;
  }

  function couponUI(q) {
    if (S.coupon) return `<div class="cpn"><span class="chip-ok">${ICON.check}<span class="cc">${COUPON.code}</span> applied · <span class="num">−${inr(q.cpn)}</span></span><button class="lnk" ${act('cpn-rm')}>Remove</button></div>`;
    return `<form class="cpnf" data-coupon><label for="cpn-in" class="sr">Coupon code</label><input id="cpn-in" value="${val('cpn-in', COUPON.code)}" autocomplete="off" spellcheck="false" maxlength="20" ${S.couponErr ? 'aria-invalid="true" aria-describedby="cpn-err"' : ''}><button type="submit" class="btn line sm" data-k="cpn-apply">Apply</button></form>${S.couponErr ? `<p class="err" id="cpn-err" role="alert">${S.couponErr}</p>` : ''}`;
  }

  function payUI(q) {
    const full = `<button class="po" role="radio" aria-checked="${!q.byDeposit}" ${act('pay', '', 'full')}><span class="rd"></span><b>Pay in full</b><span class="amt">${cnt('opt-full', q.total)}</span><small>Nothing more to pay. Your voucher is ready straight away.</small></button>`;
    const dep = q.depositOk
      ? `<button class="po" role="radio" aria-checked="${q.byDeposit}" ${act('pay', '', 'dep')}><span class="rd"></span><b>Reserve with ${DEPOSIT_PCT}% now</b><span class="amt">${cnt('opt-dep', q.deposit)}</span><small>Balance <span class="num">${inr(q.balance)}</span> due by ${dt(q.due, { wd: 1, yr: 1 })} — 30 days before departure. Pay it in parts from My trips.</small><span class="split" aria-hidden="true"><i></i></span></button>`
      : `<div class="po off" role="radio" aria-checked="false" aria-disabled="true"><span class="rd"></span><b>Reserve with ${DEPOSIT_PCT}% now</b><span class="amt">Not for this date</span><small>${dt(q.d.t)} is ${q.daysOut} days away. A balance would be due 30 days before departure, which has passed — so this date is paid in full.</small></div>`;
    return `<div class="payo" role="radiogroup" aria-label="How you pay">${full}${dep}</div>${q.byDeposit ? `<p class="fine">We remind you 7 and 3 days before ${dt(q.due)}. Unpaid 2 days after that, the booking is cancelled under the <a href="#">cancellation policy</a>.</p>` : ''}`;
  }

  const payBtn = (q, cls = 'btn') => `<button class="${cls}" ${act('paybtn')} ${q.ok ? '' : 'disabled'}>Pay ${cnt('paynow', q.payNow)}${q.byDeposit ? ' now' : ''}</button>`;
  const lock = `<div class="lock">${ICON.lock} Seats held for 10 minutes once you press Pay</div>`;
  const demo = `<div class="demo">${ICON.info}<span><b>Demo site.</b> Payments run in Razorpay test mode — no real money moves. Use a test card or UPI ID <b>success@razorpay</b>.</span></div>`;

  function rzp(q) {
    if (!S.rzp) return '';
    return `<div class="rzp"><div class="box" role="dialog" aria-modal="true" aria-label="Razorpay Checkout"><div class="hd"><b>Razorpay Checkout</b><span class="badge muted">Test mode</span></div><div class="amt num">${inr(q.payNow)}</div><p class="fine">${q.byDeposit ? `Deposit, ${DEPOSIT_PCT}% of ${inr(q.total)}. Balance ${inr(q.balance)} due by ${dt(q.due, { yr: 1 })}.` : `Paid in full for ${plural(q.n, 'traveller', 'travellers')}, ${dt(q.d.t, { wd: 1, yr: 1 })}.`}</p><div class="ph2">Razorpay’s own card / UPI / netbanking window opens here. It isn’t ours to style.</div><button class="btn line sm" ${act('rzp-x')}>Close the window</button></div></div>`;
  }

  /* the package page behind the sheet (inert) */
  function behind() {
    const hotel = (n, s, img) => `<div class="hotel"><div class="ph"><img src="${img}" alt=""></div><div><b>${n}</b><span>${s}</span></div></div>`;
    return `<div class="behind" inert>${TS.header()}<div class="wrap"><div class="crumbs"><a href="#">Home</a> / <a href="#">${P.dest}</a> / <span>${P.name}</span></div><div class="phead"><div class="ph"><img src="img/munnar-1.jpg" alt="Tea estates rolling over the hills of Munnar"></div><div class="ph"><img src="img/kerala-1.jpg" alt="A houseboat on the Alleppey backwaters"></div></div><div class="ptitle"><div><h1>${P.name}</h1><div class="sub"><span>${NIGHTS}N / ${NIGHTS + 1}D</span><span>${P.places.join(' · ')}</span><span>${TS.stars(P.rating)} · ${P.reviews} reviews</span></div></div><div class="deal"><s class="num">${inr(P.from)}</s><b class="num" style="font-size:26px;letter-spacing:-.03em">${inr(P.from - DEAL.off)}</b><span class="tag">${DEAL.label} · ends ${dt(DEAL.ends)}</span><span class="tag eb-tag">Early-bird savings</span></div></div></div><div class="wrap pgrid"><div style="display:grid;gap:26px"><div><h2>Overview</h2><p class="lede">Three nights among Munnar’s tea estates, then a night on a private houseboat on the Alleppey backwaters. ${P.meals}; ${P.transfers.toLowerCase()}.</p></div><div><h2>Where you stay</h2><div class="hotels">${hotel(P.hotels[0], 'Munnar · 3 nights', 'img/munnar-2.jpg')}${hotel(P.hotels[1], 'Alleppey', 'img/kerala-2.jpg')}</div></div></div><aside><div class="cardA"><b class="num" style="font-size:30px">${inr(P.from - DEAL.off)}</b><span class="fine">per traveller, twin sharing, from</span><button class="btn block">Book now</button><button class="btn line block">Enquire</button></div></aside></div></div>`;
  }

  /* ---------------- Variant A — the shipped sheet, two steps longer ---------------- */
  function renderA() {
    const q = quote();
    const anyAdd = q.adds.length;
    const Step = (n, title, done, body, extra = '') => `<section class="st step" aria-labelledby="bnsA-${n}"><header><span class="n ${done ? 'done' : ''}" aria-hidden="true">${done ? ICON.check : n}</span><h3 id="bnsA-${n}">${title}</h3>${extra}</header>${body}</section>`;
    const ads = `<div class="ads">${ADDONS.map((a) => `<div class="ad ${S.add[a.id] ? 'on' : ''}"><div class="ph"><img src="${a.img}" alt="${esc(a.alt)}"></div><div class="tx"><b>${a.name}</b><p>${a.blurb}</p></div><div class="ctl"><span class="u">${addUnit(a)}</span>${addAmt(a, q)}${addCtl(a, q)}</div></div>`).join('')}</div>${S.add.night ? `<p class="fine">You now return ${dt(q.back, { wd: 1, yr: 1 })}.</p>` : ''}`;
    const sheet = `<div class="sheetwrap"><div class="sheet ${painting ? '' : 'in'}" role="dialog" aria-modal="true" aria-label="Book ${esc(P.name)}"><header><div class="ph"><img src="img/munnar-2.jpg" alt=""></div><div><b>${P.name}</b><small>${NIGHTS}N / ${NIGHTS + 1}D · Book now</small></div><button aria-label="Close">×</button></header><div class="scroll" data-keep="a">${
      Step(1, 'Pick a date', true, depRows() + ladderList(q))
    }${Step(2, 'Who’s travelling', q.n <= q.d.left, roomsBlock(q) + names())
    }${Step(3, 'Make it yours', anyAdd > 0, ads, `<span class="opt">${anyAdd ? `${plural(anyAdd, 'extra', 'extras')} · +${inr(q.addSum)}` : 'Optional'}</span>`)
    }${Step(4, 'Price', q.ok, breakdown(q) + couponUI(q))
    }${Step(5, 'How you pay', true, payUI(q))
    }${Step(6, 'Contact', true, contact())}${demo}</div><footer><div class="row"><div><span class="fine">${plural(q.n, 'traveller', 'travellers')} · ${dt(q.d.t, { wd: 1, yr: 1 })}</span><br><b>${cnt('total', q.total)}</b></div>${payBtn(q)}</div>${q.byDeposit ? `<div class="lock">${ICON.cal} Balance <span class="num">${inr(q.balance)}</span> due by ${dt(q.due, { wd: 1, yr: 1 })} · seats held 10 min at Pay</div>` : lock}</footer></div></div>`;
    return `<div class="bns bns-a">${behind()}${sheet}${rzp(q)}</div>`;
  }

  /* ---------------- Variant B — wide sheet, live receipt ---------------- */
  function renderB() {
    const q = quote();
    const Step = (n, title, body, extra = '') => `<section class="step" aria-labelledby="bnsB-${n}"><header><span class="n" aria-hidden="true">${n}</span><h3 id="bnsB-${n}">${title}</h3>${extra}</header>${body}</section>`;
    const menu = `<div class="menu">${ADDONS.map((a) => `<div class="mi ${S.add[a.id] ? 'on' : ''}"><div class="ph"><img src="${a.img}" alt="${esc(a.alt)}"></div><div class="tx"><b>${a.name}</b><small>${addUnit(a)}</small></div><div class="c">${addCtl(a, q)}</div><p>${a.blurb}</p></div>`).join('')}</div>`;
    const sheet = `<div class="sheetwrap"><div class="sheet ${painting ? '' : 'in'}" role="dialog" aria-modal="true" aria-label="Book ${esc(P.name)}"><header><div class="ph"><img src="img/munnar-2.jpg" alt=""></div><div><b>${P.name}</b><small>${NIGHTS}N / ${NIGHTS + 1}D · Book now</small></div><button aria-label="Close">×</button></header><div class="cols"><div class="scroll" data-keep="b1">${
      Step(1, 'Pick a date', depRows() + ladderStairs(q))
    }${Step(2, 'Who’s travelling', `<div class="two">${roomsBlock(q)}${names()}</div>`)
    }${Step(3, 'Make it yours', menu, `<span class="opt">Optional · priced as you tap</span>`)
    }${Step(4, 'Contact', contact())}${demo}</div><aside class="rc ${S.rc ? 'open' : ''}" aria-label="Your price"><div class="rc-h"><div><span class="fine">${plural(q.n, 'traveller', 'travellers')} · ${dt(q.d.t, { wd: 1, yr: 1 })}</span><b class="big">${cnt('total', q.total)}</b><b class="ttl">Your price</b></div><button class="rc-t lnk" ${act('rc')} aria-expanded="${S.rc}" aria-controls="bns-rcb">${S.rc ? 'Hide details' : 'Price and payment'} ${ICON.chevD}</button></div><div class="rc-b" id="bns-rcb" data-keep="b2">${breakdown(q)}${couponUI(q)}<div class="pay-h"><span class="eyebrow">How you pay</span></div>${payUI(q)}</div><div class="rc-f">${payBtn(q, 'btn block')}${q.byDeposit ? `<div class="lock">${ICON.cal} Then <span class="num">${inr(q.balance)}</span> by ${dt(q.due, { wd: 1, yr: 1 })}</div>` : lock}</div></aside></div></div></div>`;
    return `<div class="bns bns-b">${behind()}${sheet}${rzp(q)}</div>`;
  }

  /* ---------------- Variant C — build your trip ---------------- */
  function renderC() {
    const q = quote();
    const dcards = `<div class="dcards" role="group" aria-label="Departure dates" data-keep="c3">${DEPS.map((d) => {
      const w = why(d), x = new Date(d.t);
      const head = `<span class="dd">${WD[x.getUTCDay()]} · ${MO[x.getUTCMonth()]} ${x.getUTCFullYear()}</span><span class="dn num">${x.getUTCDate()}</span>`;
      if (w) return `<div class="dc off">${head}<span class="pr">${w === 'sold' ? 'Sold out' : 'Price on request'}</span><span class="mt">${w === 'sold' ? 'Fully booked' : '<a href="#enquire">Enquire</a>'}</span></div>`;
      const t = tierFor(d, TODAY), days = daysBetween(TODAY, d.t);
      return `<button class="dc" ${act('dep', d.id)} aria-pressed="${S.dep === d.id}">${head}<span class="pr num">${inr(d.double - DEAL.off - (t ? t.off : 0))} <s>${inr(d.double)}</s></span><span class="mt">${d.left <= 4 ? `<span class="badge fill">${d.left} left</span>` : d.g ? `<span class="badge sure">Guaranteed</span>` : `${d.left} seats left`}</span>${t ? EB(t, d.t - t.n * DAY) : `<span class="pif">${days <= BALANCE_DAYS ? 'Pay in full only' : 'No early bird left'}</span>`}</button>`;
    }).join('')}</div>`;
    const gal = `<div class="gal" data-keep="c4">${ADDONS.map((a) => `<article class="gc ${S.add[a.id] ? 'on' : ''}" aria-label="${esc(a.name)}"><div class="ph"><img src="${a.img}" alt="${esc(a.alt)}"><span class="tag num">${addUnit(a)}</span>${S.add[a.id] ? `<span class="chk" aria-hidden="true">${ICON.check}</span>` : ''}</div><div class="gb"><b>${a.name}</b><p>${a.blurb}</p><div class="ctl">${addCtl(a, q)}${addAmt(a, q)}</div></div></article>`).join('')}</div>`;
    const steps = [['Date', true], ['Travellers', q.n <= q.d.left], ['Extras', q.adds.length > 0], ['Pay', false]];
    const ticket = `<div class="tk"><div class="ph"><img src="img/munnar-2.jpg" alt="Munnar tea gardens from above"><div class="cap"><span class="eyebrow">Your trip</span><b>${P.name}</b></div></div><div class="tb"><div class="kv2"><div><small>Leave</small><b>${dt(q.d.t, { wd: 1, yr: 1 })}</b></div><div><small>Back</small><b>${dt(q.back, { wd: 1, yr: 1 })}</b></div><div><small>Nights</small><b class="num">${NIGHTS + S.add.night}</b></div><div><small>Travellers</small><b class="num">${q.n}</b></div></div></div><div class="perf" aria-hidden="true"></div><div class="tb">${breakdown(q)}${couponUI(q)}</div><div class="perf" aria-hidden="true"></div><div class="tb"><span class="eyebrow">How you pay</span>${payUI(q)}<div class="paywrap">${payBtn(q, 'btn block')}${lock}</div></div></div>`;
    const ovl = `<div class="veil"></div><div class="ovl ${painting ? '' : 'in'}" role="dialog" aria-modal="true" aria-label="Build your trip: ${esc(P.name)}"><div class="oh"><button class="back" aria-label="Back to the package">${ICON.chevL}</button><div class="ttl"><b>Build your trip</b><small>${P.name}</small></div><ol class="prog">${steps.map(([s, d]) => `<li class="${d ? 'ok' : ''}">${d ? ICON.check : ''}${s}</li>`).join('')}</ol><button class="x" aria-label="Close">×</button></div><div class="cbody" data-keep="c0"><div class="cl" data-keep="c1"><section class="sec"><header><span class="k">01</span><h2>Pick your date</h2></header>${dcards}<span class="live">Live availability · checked just now</span>${ladderStairs(q)}</section><section class="sec"><header><span class="k">02</span><h2>Who’s travelling</h2></header><div class="two">${roomsBlock(q)}${names()}</div></section><section class="sec"><header><span class="k">03</span><h2>Make it yours</h2><span class="opt">${q.adds.length ? `${plural(q.adds.length, 'extra', 'extras')} · +${inr(q.addSum)}` : 'Optional'}</span></header>${gal}</section><section class="sec"><header><span class="k">04</span><h2>Lead traveller</h2></header>${contact()}${demo}</section></div><aside class="cr" data-keep="c2" aria-label="Your trip">${ticket}</aside><div class="cbar"><div><b>${cnt('total', q.total)}</b><small>${q.byDeposit ? `${inr(q.deposit)} now · rest by ${dt(q.due)}` : `${plural(q.n, 'traveller', 'travellers')} · paid in full`}</small></div>${payBtn(q)}</div></div></div>`;
    return `<div class="bns bns-c">${behind()}${ovl}${rzp(q)}</div>`;
  }

  /* ---------------- Variant D — one question at a time ---------------- */
  const DQ = [
    { q: 'When do you want to go?', hint: 'Each date shows today’s price per person, twin sharing. Earlier dates keep more of the early-bird saving.', next: 'Next: who’s coming', lab: 'Date' },
    { q: 'Who’s coming?', hint: 'Rooms first, then names exactly as they appear on each ID.', next: 'Next: extras', lab: 'Travellers' },
    { q: 'Want to make it yours?', hint: 'Optional. Extras are priced as you tap, and no deal, early bird or coupon applies to them.', next: 'See my price', lab: 'Extras' },
    { q: 'Here’s your price, line by line', hint: 'Deal first, then early bird, then your coupon. Extras are added last, at full price.', next: 'Next: how you pay', lab: 'Price' },
    { q: 'How would you like to pay?', hint: 'Pay it all now, or hold your seats with a quarter of it and pay the rest later.', next: '', lab: 'Pay' },
  ];
  let dLastI = 30, dLastH = 130, dLastQ = -1;

  /* The ladder as a line from today to departure, with each early-bird cut-off marked on it. */
  function ladderLine(q) {
    const { rungs, ended } = ladderData(q);
    const base = rungs[0].fare;
    const span = Math.max(q.d.t - TODAY, DAY);
    const pos = (t) => Math.max(0, Math.min(100, ((t - TODAY) / span) * 100));
    const ends = TIERS.map((t) => q.d.t - t.n * DAY).filter((e) => e >= TODAY);
    const cuts = [TODAY, ...ends.map((e) => e + DAY), q.d.t];
    const zone = (t) => { const tr = tierFor(q.d, t); return tr ? (tr === TIERS[0] ? 'z1' : 'z2') : 'z0'; };
    const segs = cuts.slice(0, -1).map((s, i) => `<i class="sg ${zone(s)}" style="left:${pos(s).toFixed(1)}%;width:${(pos(cuts[i + 1]) - pos(s)).toFixed(1)}%"></i>`).join('');
    const marks = ends.map((e, i) => `<b class="mk" style="left:${pos(e).toFixed(1)}%">${i + 1}</b>`).join('');
    return `<div class="ll" aria-label="Price ladder for ${dt(q.d.t, { yr: 1 })}"><div class="lad-h"><b>${ICON.chart} Book sooner, pay less</b><span>Trip fare for ${plural(q.n, 'traveller', 'travellers')}, add-ons extra</span></div><div class="trk" aria-hidden="true"><div class="bar">${segs}</div>${marks}${q.depositOk ? `<b class="mk due" style="left:${pos(q.due).toFixed(1)}%"></b>` : ''}</div><div class="trk-l" aria-hidden="true"><span>Today, ${dt(TODAY)}</span><span>Departs ${dt(q.d.t)}</span></div><ol class="rg">${rungs.map((r, i) => `<li class="${r.now ? 'now' : ''}"><small>${i ? `<em>${i}</em>` : ''}${r.when}</small><b class="num">${inr(r.fare)}</b><span>${r.now ? (q.tier ? `Early bird −${inr(q.tier.off)} each` : 'No early bird left') : `+${inr(r.fare - base)}`}</span></li>`).join('')}</ol><p class="fine">${rungs.length === 1 ? `No early bird left on ${dt(q.d.t)}, so this price holds until departure. ` : 'Numbered marks are the last day of each tier. '}${q.depositOk ? `The dark orange tick is ${dt(q.due)}, when a deposit’s balance falls due. ` : 'Inside 30 days of departure: pay in full only. '}Counted in IST from the day you pay.${ended.length ? ' ' + ended.join('; ') + '.' : ''}</p></div>`;
  }

  function renderD() {
    const q = quote();
    const dq = Math.max(0, Math.min(4, S.dq || 0));
    const grew = dq > dLastQ;
    const i = [22, 17, 12, 6, 0][dq], i0 = dLastI, sh = 150 + 22 * dq, sh0 = dLastH;
    dLastI = i; dLastH = sh; dLastQ = dq;
    const chosen = ADDONS.filter((a) => S.add[a.id]);
    const ans = [
      `${dt(q.d.t, { wd: 1, yr: 1 })} to ${dt(q.back, { wd: 1 })}${q.tier ? ` · early bird −${inr(q.tier.off)} each` : ''}`,
      `${plural(adults(), 'adult', 'adults')}, ${plural(S.children, 'child', 'children')} · ${['double', 'triple', 'single'].filter((k) => S.rooms[k]).map((k) => `${S.rooms[k]} ${k}`).join(', ')}`,
      chosen.length ? `${chosen.map((a) => a.name).join(', ')} · +${inr(q.addSum)}` : 'No extras',
      `${inr(q.total)} for ${plural(q.n, 'traveller', 'travellers')}${q.cpn ? ` · ${COUPON.code} on` : ''}`,
    ];
    const nw = (k) => (grew && k === dq - 1 ? 'nw' : '');
    const tags = [
      dq > 0 ? `<span class="t ${nw(0)}">${ICON.cal}${dt(q.d.t, { wd: 1 })} – ${dt(q.back, { wd: 1 })}</span>` : '',
      dq > 1 ? `<span class="t ${nw(1)}">${ICON.users}${plural(q.n, 'traveller', 'travellers')}</span>` : '',
      dq > 2 ? (chosen.length ? `<span class="pol ${nw(2)}">${chosen.map((a) => `<span class="ph"><img src="${a.img}" alt="${esc(a.name)}"></span>`).join('')}</span>` : `<span class="t ${nw(2)}">No extras</span>`) : '',
      dq > 3 ? `<span class="t big ${nw(3)}">${cnt('stage', q.total)}</span>` : '',
    ].join('');
    const dcards = `<div class="dcs" role="group" aria-label="Departure dates">${DEPS.map((d) => {
      const w = why(d);
      if (w) return `<div class="dcd off"><b class="dd">${dt(d.t, { wd: 1, yr: 1 })}</b><span class="pr">${w === 'sold' ? 'Sold out' : 'Price on request'}</span><span class="mt">${w === 'sold' ? 'Fully booked' : '<a href="#enquire">Ask us for a quote</a>'}</span></div>`;
      const t = tierFor(d, TODAY), days = daysBetween(TODAY, d.t);
      return `<button class="dcd" ${act('dep', d.id)} aria-pressed="${S.dep === d.id}"><b class="dd">${dt(d.t, { wd: 1, yr: 1 })}</b><span class="pr num">${inr(d.double - DEAL.off - (t ? t.off : 0))} <s>${inr(d.double)}</s></span><span class="mt">${d.left <= 4 ? `<span class="badge fill">${plural(d.left, 'seat', 'seats')} left</span>` : d.g ? `<span class="badge sure">Guaranteed</span>` : `${d.left} seats left`}${t ? EB(t, d.t - t.n * DAY) : ''}${days <= BALANCE_DAYS ? `<span class="pif">${days} days away · pay in full only</span>` : ''}</span></button>`;
    }).join('')}</div><span class="live">Live availability · checked just now</span>`;
    const tiles = `<div class="dts">${ADDONS.map((a) => `<div class="dtl ${S.add[a.id] ? 'on' : ''}"><div class="ph"><img src="${a.img}" alt="${esc(a.alt)}"></div><div class="tx"><b>${a.name}</b><p>${a.blurb}</p><span class="u">${addUnit(a)}</span></div><div class="ctl">${addCtl(a, q)}${addAmt(a, q)}</div></div>`).join('')}</div>${S.add.night ? `<p class="fine">You now return ${dt(q.back, { wd: 1, yr: 1 })}.</p>` : ''}`;
    const body = [
      dcards + ladderLine(q),
      `<div class="two">${roomsBlock(q)}${names()}</div>`,
      tiles,
      breakdown(q) + couponUI(q),
      `${payUI(q)}<h3 class="sub">Where we send your voucher</h3>${contact()}${demo}`,
    ][dq];
    const nextOk = dq !== 1 || q.n <= q.d.left;
    const foot = dq < 4
      ? `<div class="fr"><div><small>${dq < 3 ? 'Your trip so far' : 'Total'}</small><b>${cnt('total', q.total)}</b></div><button class="btn pri" ${act('dq', '', dq + 1)} ${nextOk ? '' : 'disabled'}>${DQ[dq].next} ${ICON.arrowR}</button></div>`
      : `<div class="fr"><div><small>${q.byDeposit ? `Then ${inr(q.balance)} by ${dt(q.due)}` : 'Paid in full today'}</small><b>${cnt('total', q.total)}</b></div>${payBtn(q)}</div>${lock}`;
    const stage = `<div class="stg" style="--i:${i};--i0:${i0};--sh:${sh}px;--sh0:${sh0}px"><div class="pic"><img src="img/munnar-2.jpg" alt="Tea gardens in Munnar seen from above"></div><div class="sh"><button class="x" aria-label="Close">×</button><div><b>${P.name}</b><small>${NIGHTS}N / ${NIGHTS + 1}D · ${P.places.join(' · ')}</small></div></div><div class="lk" aria-label="Locked in so far">${tags}</div></div>`;
    const conv = `<div class="cv"><div class="cvh"><span class="eyebrow">Question ${dq + 1} of 5</span>${dq ? `<button class="lnk" ${act('dq', '', dq - 1)}>${ICON.chevL} Back</button>` : ''}<ol class="dots" aria-hidden="true">${DQ.map((x, k) => `<li class="${k <= dq ? 'on' : ''}"></li>`).join('')}</ol></div><div class="cvs" data-keep="d1">${dq ? `<ol class="ans" aria-label="Your answers">${ans.slice(0, dq).map((a, k) => `<li class="an"><span class="k" aria-hidden="true">${ICON.check}</span><div><small>${DQ[k].q}</small><b>${a}</b></div><button class="lnk" ${act('dq', '', k)}>Change</button></li>`).join('')}</ol>` : ''}<section class="qa ${grew ? 'nw' : ''}" aria-labelledby="bnsD-q"><h2 id="bnsD-q" tabindex="-1">${DQ[dq].q}</h2><p class="hint">${DQ[dq].hint}</p>${body}</section>${dq < 4 ? `<p class="soon">Still to come: ${DQ.slice(dq + 1).map((x) => x.lab).join(' · ')}</p>` : ''}</div><div class="cvf">${foot}</div></div>`;
    return `<div class="bns bns-d">${behind()}<div class="dx ${painting ? '' : 'in'}" role="dialog" aria-modal="true" aria-label="Book ${esc(P.name)}">${stage}${conv}</div>${rzp(q)}</div>`;
  }

  /* ---------------- Variant E — plan it on the page: calendar + itinerary ---------------- */
  const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  let eLastDep = null;
  function renderE() {
    const q = quote(), d = q.d;
    const paint = eLastDep !== d.id; eLastDep = d.id;
    const zone = (t) => { const tr = tierFor(d, t); return tr ? (tr === TIERS[0] ? 'z1' : 'z2') : 'z0'; };
    const depAt = {}; DEPS.forEach((x) => { depAt[x.t] = x; });
    let k = 0;
    const cell = (t) => {
      const x = depAt[t], cls = [], lab = dt(t, { wd: 1, yr: 1 }), n = new Date(t).getUTCDate();
      if (t < TODAY) cls.push('past');
      else if (t < d.t) {
        cls.push(zone(t));
        if (daysBetween(t, d.t) <= BALANCE_DAYS) cls.push('pif');
        TIERS.forEach((tt, i) => { if (t === d.t - tt.n * DAY) cls.push('cut'); });
        if (q.depositOk && t === q.due) cls.push('due');
      } else if (t === d.t) cls.push('go');
      else if (t <= q.back) cls.push('trip');
      if (t === TODAY) cls.push('today');
      const st = t >= TODAY && t <= q.back ? ` style="--k:${k++}"` : '';
      if (x === d) return `<button class="c ${cls.join(' ')}"${st} ${act('dep', x.id)} aria-pressed="true" aria-label="Depart ${lab}, chosen">${n}</button>`;
      if (x) {
        const w = why(x);
        if (w) return `<span class="c dd x ${cls.join(' ')}"${st} title="${lab}: ${w === 'sold' ? 'sold out' : 'price on request'}">${n}</span>`;
        return `<button class="c dd ${cls.join(' ')}"${st} ${act('dep', x.id)} aria-pressed="false" aria-label="Depart ${lab}">${n}</button>`;
      }
      return `<span class="c ${cls.join(' ')}"${st}>${n}</span>`;
    };
    const month = ([y, m]) => {
      const days = new Date(Date.UTC(y, m, 0)).getUTCDate(), lead = (new Date(D(y, m, 1)).getUTCDay() + 6) % 7;
      let h = '';
      for (let i = 0; i < lead; i++) h += '<span class="c pad"></span>';
      for (let i = 1; i <= days; i++) h += cell(D(y, m, i));
      return `<div class="mo"><h4>${MONL[m - 1]} ${y}</h4><div class="wk" aria-hidden="true">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x) => `<span>${x}</span>`).join('')}</div><div class="cells">${h}</div></div>`;
    };
    const cal = `<div class="cal ${paint ? 'paint' : ''}" aria-label="Departures and booking days, September 2026 to February 2027">${[[2026, 9], [2026, 10], [2026, 11], [2026, 12], [2027, 1], [2027, 2]].map(month).join('')}</div>`;
    const strip = `<div class="dstrip" role="group" aria-label="All departures">${DEPS.map((x) => {
      const w = why(x);
      if (w) return `<span class="dp off"><b>${dt(x.t, { wd: 1 })}</b><small>${w === 'sold' ? 'Sold out' : 'Price on request'}</small></span>`;
      const t = tierFor(x, TODAY), days = daysBetween(TODAY, x.t);
      return `<button class="dp" ${act('dep', x.id, 's')} aria-pressed="${x === d}"><b>${dt(x.t, { wd: 1 })}</b><span class="num">${inr(x.double - DEAL.off - (t ? t.off : 0))} <small>per person</small></span>${t ? EB(t, x.t - t.n * DAY) : `<small class="pif">${days <= BALANCE_DAYS ? 'Pay in full only' : 'No early bird left'}</small>`}${x.left <= 4 ? `<small class="lf">${plural(x.left, 'seat', 'seats')} left</small>` : ''}</button>`;
    }).join('')}</div>`;
    const { rungs, ended } = ladderData(q);
    const base = rungs[0].fare;
    const ends = TIERS.map((t) => d.t - t.n * DAY).filter((e) => e >= TODAY);
    const rows = rungs.map((r, i) => {
      const from = i ? ends[i - 1] + DAY : TODAY, to = i < rungs.length - 1 ? ends[i] : d.t - DAY;
      const tr = tierFor(d, from);
      const head = rungs.length === 1 ? 'Book any day before you go' : i ? `Book ${dt(from)} – ${dt(to)}` : `Book by ${dt(to)}`;
      return `<li class="${r.now ? 'now' : ''}"><i class="sw ${zone(from)}"></i><span><b>${head}</b><small>${tr ? `Early bird −${inr(tr.off)} each` : 'No early bird'}</small></span><span class="pp"><b class="num">${inr(r.fare)}</b><em>${r.now ? 'Your price today' : `+${inr(r.fare - base)}`}</em></span></li>`;
    }).join('');
    const keyx = `<li><i class="sw cut"></i><span><b>Early-bird cut-off</b><small>The last day a tier applies</small></span></li><li><i class="sw pif"></i><span><b>${q.depositOk ? `From ${dt(q.due)}: pay in full only` : 'Pay in full only'}</b><small>${q.depositOk ? `Book before it and you can reserve with ${DEPOSIT_PCT}%; the balance is due ${dt(q.due)}.` : `${dt(d.t)} is ${q.daysOut} days away, inside the 30-day window.`}</small></span></li><li><i class="sw go"></i><span><b>${dt(d.t, { wd: 1 })} – ${dt(q.back, { wd: 1, yr: 1 })}</b><small>Your trip, ${plural(NIGHTS + S.add.night, 'night', 'nights')}</small></span></li>`;
    const key = `<div class="ekey" aria-label="Price ladder for ${dt(d.t, { yr: 1 })}"><div class="lad-h"><b>${ICON.chart} What each shaded day costs</b><span>Trip fare for ${plural(q.n, 'traveller', 'travellers')}, add-ons extra</span></div><ol>${rows}</ol><ul>${keyx}</ul><p class="fine">Counted in IST from the day you pay. Early bird never applies to add-ons.${ended.length ? ' ' + ended.join('; ') + '.' : ''}</p></div>`;
    const slot = (id) => { const a = ADDONS.find((x) => x.id === id); return `<div class="slot ${S.add[id] ? 'on' : ''}"><div class="ph"><img src="${a.img}" alt="${esc(a.alt)}"></div><div class="tx"><span class="eyebrow">Make it yours · ${addUnit(a)}</span><b>${a.name}</b><p>${a.blurb}</p></div><div class="ctl">${addCtl(a, q)}${addAmt(a, q)}</div></div>`; };
    const days = [
      ['a', 'Kochi to Munnar', 'Pick-up at Kochi airport, then four hours up through cardamom country to Tea County.'],
      ['b', 'Munnar', 'Tea estate walk in the morning, Eravikulam National Park after lunch.', 'jeep'],
      ['c', 'Munnar', 'A free day among the estates, with Mattupetty dam if you want it.', 'night'],
      ...Array.from({ length: S.add.night }, (_, i) => ['x' + i, 'Munnar · extra night', 'Another slow day at Tea County, breakfast included.', null, true]),
      ['d', 'Munnar to Alleppey', 'Down to the backwaters by noon and onto your houseboat. All meals on board.', 'boat'],
      ['e', 'Alleppey to Kochi', 'Off the boat after breakfast, at Kochi airport by 2 pm.', 'canoe'],
    ];
    const it = `<ol class="it">${days.map(([id, t, p, s, x], i) => `<li class="${x ? 'xtra' : ''}" data-line="dy-${id}"><div class="dn"><b>Day ${i + 1}</b><small>${dt(d.t + i * DAY, { wd: 1 })}</small></div><div class="db"><b>${t}${x ? ' <span class="badge new">Added</span>' : ''}</b><p>${p}</p>${s ? slot(s) : ''}</div></li>`).join('')}</ol>`;
    const Sec = (n, title, sub, body) => `<section class="es" aria-labelledby="bnsE-${n}"><header><span class="k" aria-hidden="true">${n}</span><div><h2 id="bnsE-${n}">${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div></header>${body}</section>`;
    const card = `<aside class="eq" id="bns-eq" aria-label="Your price" data-keep="e1"><div class="eqh"><div class="ph"><img src="img/munnar-2.jpg" alt=""></div><div><span class="eyebrow">Your trip</span><b>${dt(d.t, { wd: 1 })} – ${dt(q.back, { wd: 1, yr: 1 })}</b><small>${plural(q.n, 'traveller', 'travellers')} · ${plural(NIGHTS + S.add.night, 'night', 'nights')}</small></div></div>${breakdown(q)}${couponUI(q)}<span class="eyebrow">How you pay</span>${payUI(q)}${payBtn(q, 'btn block')}${q.byDeposit ? `<div class="lock">${ICON.cal} Then <span class="num">${inr(q.balance)}</span> by ${dt(q.due, { wd: 1, yr: 1 })}</div>` : lock}</aside>`;
    const pill = `<div class="fl" role="region" aria-label="Your total"><button class="flq" data-act="ejump" data-k="ejump" aria-controls="bns-eq"><b>${cnt('total', q.total)}</b><small>${q.byDeposit ? `${inr(q.deposit)} today · ` : ''}See the quote</small></button>${payBtn(q)}</div>`;
    const head = `<div class="wrap"><div class="crumbs"><a href="#">Home</a> / <a href="#">${P.dest}</a> / <span>${P.name}</span></div><div class="phead"><div class="ph"><img src="img/munnar-1.jpg" alt="Tea estates rolling over the hills of Munnar"></div><div class="ph"><img src="img/kerala-1.jpg" alt="A houseboat on the Alleppey backwaters"></div></div><div class="ptitle"><div><h1>${P.name}</h1><div class="sub"><span>${NIGHTS}N / ${NIGHTS + 1}D</span><span>${P.places.join(' · ')}</span><span>${TS.stars(P.rating)} · ${P.reviews} reviews</span></div></div><div class="deal"><s class="num">${inr(P.from)}</s><b class="num" style="font-size:26px;letter-spacing:-.03em">${inr(P.from - DEAL.off)}</b><span class="tag">${DEAL.label} · ends ${dt(DEAL.ends)}</span><span class="tag eb-tag">Early-bird savings</span></div></div></div>`;
    const main = `<div class="em">${
      Sec(1, 'Pick a date on the calendar', 'Tap a ringed day to depart on it. The shaded days before it show what you pay if you book on that day, so each early-bird cut-off is a line you can see.', strip + cal + '<span class="live">Live availability · checked just now</span>' + key)
    }${Sec(2, 'Who’s travelling', '', `<div class="two">${roomsBlock(q)}${names()}</div>`)
    }${Sec(3, 'Make it yours, day by day', 'Each extra sits on the day it happens. Extra nights add days to the trip and move your return.', it)
    }${Sec(4, 'Lead traveller', '', contact() + demo)}</div>`;
    return `<div class="bns bns-e"><div class="pg" data-keep="e0">${TS.header()}${head}<div class="wrap eg">${main}${card}</div></div>${pill}${rzp(q)}</div>`;
  }

  /* ---------------- interaction ---------------- */
  let painting = false, off = null, prevLines = null;
  const shown = {};
  function snapshot(site) {
    prevLines = new Set([...site.querySelectorAll('[data-line]')].map((n) => n.dataset.line));
    site.querySelectorAll('[data-count]').forEach((n) => { shown[n.dataset.count] = +n.dataset.v; });
  }
  function countTo(node, from, to) {
    const t0 = performance.now(), dur = 450;
    const tick = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); node.textContent = inr(from + (to - from) * e); if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  function motion(site) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const before = { ...shown };
    if (!reduce && prevLines) site.querySelectorAll('[data-line]').forEach((n) => { if (!prevLines.has(n.dataset.line)) n.classList.add('nw'); });
    if (!reduce) site.querySelectorAll('[data-count]').forEach((n) => { const f = before[n.dataset.count], to = +n.dataset.v; if (f !== undefined && f !== to) countTo(n, f, to); });
    snapshot(site);
  }
  function apply(b) {
    const { act: a, id, v } = b.dataset;
    if (a === 'dep') S.dep = id;
    else if (a === 'room') { S.rooms[id] = Math.max(0, S.rooms[id] + +v); if (adults() === 0) S.children = 0; clampAdds(); }
    else if (a === 'kid') { S.children = Math.max(0, S.children + +v); clampAdds(); }
    else if (a === 'tg') S.add[id] = S.add[id] ? 0 : 1;
    else if (a === 'qty') S.add[id] = Math.max(0, Math.min(party(), S.add[id] + +v));
    else if (a === 'nights') S.add[id] = +v;
    else if (a === 'pay') S.pay = v;
    else if (a === 'cpn-rm') { S.coupon = false; S.couponErr = ''; }
    else if (a === 'rc') S.rc = !S.rc;
    else if (a === 'dq') S.dq = Math.max(0, Math.min(4, +v));
    else if (a === 'paybtn') S.rzp = true;
    else if (a === 'rzp-x') S.rzp = false;
    else return false;
    return true;
  }
  function bind(site, variant) {
    if (off) off();
    const repaint = (focusKey) => {
      const keep = {};
      site.querySelectorAll('[data-keep]').forEach((n) => { keep[n.dataset.keep] = [n.scrollTop, n.scrollLeft]; });
      painting = true;
      site.innerHTML = variant.render();
      painting = false;
      site.querySelectorAll('[data-keep]').forEach((n) => { const k = keep[n.dataset.keep]; if (k) { n.scrollTop = k[0]; n.scrollLeft = k[1]; } });
      const f = focusKey && site.querySelector(`[data-k="${focusKey}"]`);
      if (f && !f.disabled) f.focus({ preventScroll: true });
      else if (S.rzp) { const x = site.querySelector('[data-act="rzp-x"]'); if (x) x.focus({ preventScroll: true }); }
      motion(site);
    };
    const onClick = (e) => {
      if (!site.querySelector('.bns')) return;
      const b = e.target.closest('[data-act]');
      if (!b || !site.contains(b) || b.disabled) return;
      if (b.dataset.act === 'ejump') {
        const t = site.querySelector('#bns-eq');
        if (t) t.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        return;
      }
      const k = b.dataset.act === 'rzp-x' ? 'paybtn--' : b.dataset.k;
      if (apply(b)) {
        repaint(k);
        if (b.dataset.act === 'dq') {
          const sc = site.querySelector('[data-keep="d1"]'); if (sc) sc.scrollTop = 0;
          const h = site.querySelector('#bnsD-q'); if (h) h.focus({ preventScroll: true });
        }
      }
    };
    const onInput = (e) => { const t = e.target; if (t.id && t.closest && t.closest('.bns')) S.vals[t.id] = t.value; };
    const onSubmit = (e) => {
      if (!e.target.matches || !e.target.matches('[data-coupon]')) return;
      e.preventDefault();
      const code = (S.vals['cpn-in'] !== undefined ? S.vals['cpn-in'] : COUPON.code).trim().toUpperCase();
      if (code === COUPON.code) { S.coupon = true; S.couponErr = ''; } else S.couponErr = code ? `${esc(code)} isn’t a live code. Check the spelling, or try ${COUPON.code}.` : 'Type a code first.';
      repaint('cpn-rm--');
    };
    const onKey = (e) => {
      if (e.key !== 'Escape' || !site.querySelector('.bns')) return;
      if (S.rzp) { S.rzp = false; repaint('paybtn--'); } else if (S.rc) { S.rc = false; repaint('rc--'); }
    };
    site.addEventListener('click', onClick);
    site.addEventListener('input', onInput);
    site.addEventListener('submit', onSubmit);
    site.addEventListener('keydown', onKey);
    off = () => { site.removeEventListener('click', onClick); site.removeEventListener('input', onInput); site.removeEventListener('submit', onSubmit); site.removeEventListener('keydown', onKey); };
    snapshot(site);
  }

  /* ---------------- styles (scoped to .bns) ---------------- */
  const css = `
  .bns { position: relative; height: 920px; overflow: hidden; }
  .bns .behind { height: 100%; overflow: hidden; }
  .bns .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .bns .eb-tag { background: #FFF3DC; color: #7A4A05; }
  .bns .sheet { animation: none; position: relative; min-height: 0; }
  .bns .sheet.in { animation: slide .45s var(--ease); }
  .bns .sheet > header .ph { width: 48px; height: 48px; }
  .bns .sheet .scroll { gap: 26px; overscroll-behavior: contain; min-height: 0; }
  .bns .step > header .opt { margin-left: auto; font-size: 12.5px; font-weight: 700; color: var(--mute); text-align: right; }
  .bns .step > header .n.done { background: var(--ok); }
  .bns .step > header .n .ic { width: 14px; height: 14px; }
  .bns .dep .m { row-gap: 6px; }
  .bns .eb { display: inline-flex; gap: 5px; align-items: center; background: #FFF3DC; color: #7A4A05; border-radius: 999px; padding: 3px 9px 3px 7px; font-size: 12px; font-weight: 800; white-space: nowrap; }
  .bns .eb .ic { width: 13px; height: 13px; }
  .bns .pif { font-size: 12px; font-weight: 700; color: var(--warn); }
  .bns .lad-h { display: flex; justify-content: space-between; gap: 4px 10px; align-items: baseline; flex-wrap: wrap; }
  .bns .lad-h b { font-size: 14px; display: inline-flex; gap: 6px; align-items: center; }
  .bns .lad-h b .ic { width: 16px; height: 16px; color: var(--pri); }
  .bns .lad-h span { font-size: 12.5px; color: var(--mute); font-weight: 600; }
  .bns .lad { border: 1px solid #D6E0F5; border-radius: 14px; padding: 12px 14px; display: grid; gap: 8px; background: var(--bg2); }
  .bns .lad ol { list-style: none; margin: 0; padding: 0; display: grid; }
  .bns .lad li { display: grid; grid-template-columns: 14px 1fr auto; gap: 10px; align-items: center; padding: 8px 0; }
  .bns .lad li::before { content: ""; width: 10px; height: 10px; border-radius: 50%; background: #fff; border: 2px solid #9FB0C4; }
  .bns .lad li.now::before { background: var(--pri); border-color: var(--pri); box-shadow: 0 0 0 4px #D3DEFB; }
  .bns .lad li + li { border-top: 1px dashed #CBD6E6; }
  .bns .lad .w b { display: block; font-size: 14px; }
  .bns .lad .w small { font-size: 12px; color: var(--mute); font-weight: 600; }
  .bns .lad .pp { text-align: right; display: grid; }
  .bns .lad .pp b { font-size: 15px; }
  .bns .lad .pp em { font-style: normal; font-size: 12px; font-weight: 800; }
  .bns .lad em.you { color: var(--pri); } .bns .lad em.up { color: var(--warn); }
  .bns .lad-none { font-size: 13.5px; color: var(--ink2); }
  .bns .stairs-w { border: 1px solid #D6E0F5; border-radius: 14px; padding: 12px 14px; display: grid; gap: 10px; background: var(--bg2); }
  .bns .stairs { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 8px; align-items: end; }
  .bns .stair { display: grid; gap: 2px; align-content: end; min-width: 0; }
  .bns .stair .bar { height: var(--h); border-radius: 10px 10px 4px 4px; background: #D8E1F4; color: var(--ink); display: flex; justify-content: center; padding-top: 8px; font-weight: 800; font-size: 14px; margin-bottom: 6px; }
  .bns .stair.now .bar { background: var(--pri); color: #fff; }
  .bns .stair b { font-size: 13px; }
  .bns .stair small { font-size: 11.5px; color: var(--mute); font-weight: 600; line-height: 1.35; }
  .bns .stair:not(.now) small { color: var(--warn); }
  .bns .names { border: 0; padding: 0; margin: 0; display: grid; gap: 6px; min-width: 0; }
  .bns .names .rm { font-size: 12px; font-weight: 700; color: var(--ink2); margin-top: 4px; }
  .bns .nm { display: grid; grid-template-columns: minmax(0, 1fr) 72px; gap: 8px; }
  .bns .nm input, .bns .cpnf input { border: 1.5px solid var(--line); border-radius: 10px; padding: 9px 11px; font: 500 14px "DM Sans", sans-serif; width: 100%; color: var(--ink); background: #fff; min-width: 0; }
  .bns .nm input:focus, .bns .cpnf input:focus { border-color: var(--pri); outline: none; box-shadow: 0 0 0 3px var(--pri-soft); }
  .bns .ctr.sm button { width: 34px; height: 34px; }
  .bns .tg { position: relative; width: 46px; height: 28px; border-radius: 999px; border: 0; background: #C3CCD6; cursor: pointer; flex: none; transition: background .2s; padding: 0; }
  .bns .tg i { position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: transform .3s var(--ease); }
  .bns .tg[aria-checked="true"] { background: var(--pri); }
  .bns .tg[aria-checked="true"] i { transform: translateX(18px); }
  .bns .seg { display: inline-flex; border: 1.5px solid var(--line); border-radius: 10px; overflow: hidden; flex: none; }
  .bns .seg button { border: 0; background: #fff; padding: 8px 10px; font: 700 13px "DM Sans", sans-serif; cursor: pointer; color: var(--ink); }
  .bns .seg button + button { border-left: 1.5px solid var(--line); }
  .bns .seg button[aria-pressed="true"] { background: var(--ink); color: #fff; }
  .bns .amt { font-weight: 800; font-size: 14px; }
  .bns .amt.off { color: var(--mute); font-weight: 600; font-size: 12.5px; }
  /* A: add-on rows */
  .bns .ads { display: grid; gap: 10px; }
  .bns .ad { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 10px 12px; border: 1.5px solid var(--line); border-radius: 14px; padding: 10px; transition: border-color .2s, background .2s; }
  .bns .ad.on { border-color: var(--pri); background: #F6F8FF; }
  .bns .ad .ph { width: 64px; height: 64px; border-radius: 10px; }
  .bns .ad .tx b { font-size: 15px; display: block; }
  .bns .ad .tx p { font-size: 12.5px; color: var(--ink2); line-height: 1.4; margin-top: 2px; }
  .bns .ctl { display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap; }
  .bns .ad .ctl { grid-column: 1 / -1; border-top: 1px dashed var(--line); padding-top: 8px; }
  .bns .ad .ctl .u { font-size: 12.5px; font-weight: 700; color: var(--mute); margin-right: auto; }
  /* price */
  .bns .brk .l.sub { border-top: 1px solid var(--line); padding-top: 7px; margin-top: 2px; font-weight: 700; }
  .bns .brk .l.sub span:first-child { color: var(--ink); }
  .bns .brk .gh { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--mute); font-weight: 700; margin-top: 8px; }
  .bns .brk .l { border-radius: 6px; }
  .bns .brk .l.nw { animation: bnsIn .9s var(--ease); }
  @keyframes bnsIn { 0% { opacity: 0; transform: translateY(-6px); background: #FFE7B8; } 35% { opacity: 1; transform: none; background: #FFE7B8; } 100% { background: transparent; } }
  .bns .cc { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .03em; font-size: .95em; }
  .bns .cpn { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 13px; }
  .bns .chip-ok { display: inline-flex; gap: 6px; align-items: center; background: var(--ok-soft); color: var(--ok); border-radius: 999px; padding: 5px 11px; font-weight: 700; }
  .bns .chip-ok .ic { width: 14px; height: 14px; }
  .bns .lnk { border: 0; background: none; font: 600 13px "DM Sans", sans-serif; color: var(--mute); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; padding: 6px 4px; display: inline-flex; gap: 4px; align-items: center; }
  .bns .lnk:hover { color: var(--ink); }
  .bns .cpnf { display: flex; gap: 8px; }
  .bns .cpnf input { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; text-transform: uppercase; }
  .bns .err { font-size: 13px; font-weight: 700; color: var(--warn); }
  /* pay choice */
  .bns .payo { display: grid; gap: 8px; }
  .bns .po { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; gap: 3px 10px; align-items: center; text-align: left; width: 100%; border: 1.5px solid var(--line); background: #fff; border-radius: 12px; padding: 12px; cursor: pointer; font: inherit; color: inherit; transition: border-color .2s, background .2s; }
  .bns .po:hover { border-color: var(--ink); }
  .bns .po[aria-checked="true"] { border-color: var(--pri); background: var(--pri-soft); box-shadow: inset 0 0 0 1px var(--pri); }
  .bns .po .rd { width: 18px; height: 18px; border-radius: 50%; border: 2px solid #8C99A6; background: #fff; transition: border-width .2s; }
  .bns .po[aria-checked="true"] .rd { border: 6px solid var(--pri); }
  .bns .po b { font-size: 15px; }
  .bns .po .amt { text-align: right; font-size: 15px; }
  .bns .po small { grid-column: 2 / -1; font-size: 12.5px; color: var(--ink2); font-weight: 500; line-height: 1.45; }
  .bns .po .split { grid-column: 2 / -1; display: flex; height: 6px; border-radius: 99px; overflow: hidden; background: #D8E1F4; margin-top: 6px; }
  .bns .po .split i { width: ${DEPOSIT_PCT}%; background: var(--act); }
  .bns .po.off { cursor: not-allowed; background: #F7F8FA; border-style: dashed; }
  .bns .po.off:hover { border-color: var(--line); }
  .bns .po.off b, .bns .po.off .amt { color: #6E7A85; }
  .bns .po.off .amt { font-size: 12.5px; font-weight: 700; }
  .bns .sheet > footer .lock .ic { color: var(--pri); }
  /* B: wide sheet, live receipt */
  .bns-b .sheet { width: min(920px, 100%); grid-template-rows: auto minmax(0, 1fr); }
  .bns-b .cols { display: grid; grid-template-columns: minmax(0, 1fr) 340px; min-height: 0; }
  .bns-b .two { display: grid; gap: 14px; }
  .bns-b .menu { display: grid; border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
  .bns-b .mi { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; gap: 4px 12px; align-items: center; padding: 12px 14px; transition: background .2s; }
  .bns-b .mi + .mi { border-top: 1px solid var(--line); }
  .bns-b .mi.on { background: #F6F8FF; box-shadow: inset 3px 0 0 var(--pri); }
  .bns-b .mi .ph { width: 40px; height: 40px; border-radius: 50%; }
  .bns-b .mi .tx b { display: block; font-size: 15px; }
  .bns-b .mi .tx small { font-size: 12.5px; color: var(--mute); font-weight: 700; }
  .bns-b .mi p { grid-column: 2 / -1; font-size: 12.5px; color: var(--ink2); line-height: 1.4; }
  .bns-b .rc { border-left: 1px solid var(--line); display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-height: 0; background: #FBFCFE; }
  .bns-b .rc-h { padding: 16px 18px 4px; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .bns-b .rc-h .big { display: none; font-size: 22px; letter-spacing: -.03em; }
  .bns-b .rc-h .ttl { display: block; font-size: 17px; margin-top: 2px; }
  .bns-b .rc-t { display: none; }
  .bns-b .rc-t .ic { width: 16px; height: 16px; transition: transform .3s var(--ease); }
  .bns-b .rc.open .rc-t .ic { transform: rotate(180deg); }
  .bns-b .rc-b { overflow: auto; padding: 12px 18px 16px; display: grid; gap: 14px; align-content: start; overscroll-behavior: contain; }
  .bns-b .pay-h { border-top: 1px solid var(--line); padding-top: 12px; }
  .bns-b .rc-f { padding: 12px 18px; border-top: 1px solid var(--line); display: grid; gap: 8px; background: #fff; }
  /* C: build your trip */
  .bns-c .veil { position: absolute; inset: 0; background: rgba(15,25,35,.5); z-index: 9; }
  .bns-c .ovl { position: absolute; inset: 16px; z-index: 10; background: #fff; border-radius: 20px; overflow: hidden; display: grid; grid-template-rows: auto minmax(0, 1fr); box-shadow: 0 40px 100px -30px rgba(0,0,0,.55); }
  .bns-c .ovl.in { animation: bnsUp .5s var(--ease); }
  @keyframes bnsUp { from { transform: translateY(26px); opacity: .4; } }
  .bns-c .oh { display: flex; align-items: center; gap: 14px; padding: 12px 18px; border-bottom: 1px solid var(--line); }
  .bns-c .oh .back, .bns-c .oh .x { width: 38px; height: 38px; border-radius: 10px; border: 1.5px solid var(--line); background: #fff; cursor: pointer; display: grid; place-items: center; font-size: 18px; flex: none; color: var(--ink); }
  .bns-c .oh .ttl b { display: block; font-size: 17px; letter-spacing: -.02em; }
  .bns-c .oh .ttl small { color: var(--mute); font-weight: 600; font-size: 13px; }
  .bns-c .prog { list-style: none; margin: 0 0 0 auto; padding: 0; display: flex; gap: 6px; }
  .bns-c .prog li { display: inline-flex; align-items: center; gap: 4px; font-size: 12.5px; font-weight: 700; color: var(--mute); background: var(--bg2); padding: 5px 10px; border-radius: 999px; }
  .bns-c .prog li.ok { color: var(--ok); background: var(--ok-soft); }
  .bns-c .prog .ic { width: 13px; height: 13px; }
  .bns-c .cbody { display: grid; grid-template-columns: minmax(0, 1fr) 390px; min-height: 0; }
  .bns-c .cl { overflow: auto; padding: 24px 28px 40px; display: grid; gap: 34px; align-content: start; overscroll-behavior: contain; }
  .bns-c .cr { overflow: auto; padding: 22px; background: var(--bg2); border-left: 1px solid var(--line); overscroll-behavior: contain; }
  .bns-c .sec { display: grid; gap: 12px; min-width: 0; }
  .bns-c .sec > header { display: flex; align-items: baseline; gap: 10px; }
  .bns-c .sec > header .k { font-size: 13px; font-weight: 800; color: var(--pri); font-variant-numeric: tabular-nums; }
  .bns-c .sec > header h2 { font-size: 22px; }
  .bns-c .sec > header .opt { margin-left: auto; font-size: 13px; font-weight: 700; color: var(--mute); }
  .bns-c .dcards { display: grid; grid-auto-flow: column; grid-auto-columns: 168px; gap: 10px; overflow-x: auto; scroll-snap-type: x mandatory; padding: 2px 2px 8px; }
  .bns-c .dc { scroll-snap-align: start; display: grid; gap: 5px; align-content: start; justify-items: start; text-align: left; border: 1.5px solid var(--line); border-radius: 14px; padding: 12px; background: #fff; font: inherit; color: inherit; cursor: pointer; transition: border-color .2s, background .2s, transform .3s var(--ease); }
  .bns-c .dc:hover { border-color: var(--ink); }
  .bns-c .dc[aria-pressed="true"] { border-color: var(--pri); background: var(--pri-soft); box-shadow: inset 0 0 0 1px var(--pri); }
  .bns-c .dc.off { cursor: default; background: #F7F8FA; border-style: dashed; color: #6E7A85; }
  .bns-c .dc .dd { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; font-weight: 700; color: var(--mute); }
  .bns-c .dc .dn { font-size: 32px; font-weight: 800; letter-spacing: -.04em; line-height: 1; }
  .bns-c .dc .pr { font-weight: 800; font-size: 15px; }
  .bns-c .dc .pr s { color: var(--mute); font-weight: 600; font-size: 12px; }
  .bns-c .dc .mt { font-size: 12px; font-weight: 600; color: var(--mute); }
  .bns-c .dc .eb { white-space: normal; }
  .bns-c .dc a { color: var(--pri); font-weight: 700; text-decoration: none; }
  .bns-c .two { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start; }
  .bns-c .gal { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
  .bns-c .gc { display: grid; grid-template-rows: auto 1fr; border: 1.5px solid var(--line); border-radius: 16px; overflow: hidden; background: #fff; transition: border-color .25s, box-shadow .25s; min-width: 0; }
  .bns-c .gc.on { border-color: var(--pri); box-shadow: 0 0 0 1px var(--pri), 0 24px 40px -28px rgba(27,79,216,.7); }
  .bns-c .gc .ph { aspect-ratio: 16 / 10; }
  .bns-c .gc .ph img { transition: transform .8s var(--ease); }
  .bns-c .gc.on .ph img { transform: scale(1.04); }
  .bns-c .gc .tag { position: absolute; left: 10px; bottom: 10px; background: rgba(20,32,42,.82); color: #fff; font-size: 12px; font-weight: 700; padding: 4px 9px; border-radius: 8px; }
  .bns-c .gc .chk { position: absolute; right: 10px; top: 10px; width: 30px; height: 30px; border-radius: 50%; background: var(--pri); color: #fff; display: grid; place-items: center; box-shadow: 0 0 0 3px #fff; }
  .bns-c .gc .chk .ic { width: 16px; height: 16px; }
  .bns-c .gb { padding: 12px 14px 14px; display: grid; gap: 8px; align-content: start; }
  .bns-c .gb b { font-size: 16px; letter-spacing: -.01em; }
  .bns-c .gb p { font-size: 13px; color: var(--ink2); line-height: 1.45; }
  .bns-c .gb .ctl { justify-content: space-between; margin-top: auto; }
  .bns-c .tk { background: #fff; border-radius: 18px; overflow: hidden; box-shadow: 0 30px 60px -40px rgba(20,32,42,.45); border: 1px solid var(--line); }
  .bns-c .tk > .ph { aspect-ratio: 16 / 8; }
  .bns-c .tk .cap { position: absolute; inset: auto 0 0; padding: 30px 16px 12px; background: linear-gradient(transparent, rgba(10,20,30,.78)); color: #fff; display: grid; }
  .bns-c .tk .cap .eyebrow { color: #D6DEE6; }
  .bns-c .tk .cap b { font-size: 18px; letter-spacing: -.02em; }
  .bns-c .tb { padding: 14px 16px; display: grid; gap: 12px; }
  .bns-c .kv2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; }
  .bns-c .kv2 small { display: block; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--mute); font-weight: 700; }
  .bns-c .kv2 b { font-size: 14.5px; }
  .bns-c .perf { position: relative; border-top: 2px dashed var(--line); margin: 0 14px; }
  .bns-c .perf::before, .bns-c .perf::after { content: ""; position: absolute; top: -10px; width: 18px; height: 18px; border-radius: 50%; background: var(--bg2); }
  .bns-c .perf::before { left: -24px; } .bns-c .perf::after { right: -24px; }
  .bns-c .paywrap { display: grid; gap: 8px; }
  .bns-c .cbar { display: none; }
  @container site (max-width: 700px) {
    .bns { height: 800px; }
    .bns .sheet > header { padding: 10px 14px; }
    .bns .sheet .scroll { padding: 14px; }
    .bns .sheet > footer { padding: 10px 14px; }
    .bns .sheet > footer .row b { font-size: 22px; }
    .bns .ad { grid-template-columns: 52px minmax(0, 1fr); }
    .bns .ad .ph { width: 52px; height: 52px; }
    .bns .ad .ctl .u { flex-basis: 100%; }
    .bns .ad .ctl .amt { margin-right: auto; }
    .bns .seg button { padding: 8px 8px; font-size: 12.5px; }
    .bns .stair .bar { font-size: 12.5px; }
    .bns-b .cols { grid-template-columns: 1fr; position: relative; }
    .bns-b .sheet .scroll { padding-bottom: 150px; }
    .bns-b .rc { position: absolute; left: 0; right: 0; bottom: 0; z-index: 5; max-height: 88%; border-left: 0; border-top: 1px solid var(--line); border-radius: 18px 18px 0 0; background: #fff; box-shadow: 0 -18px 40px -22px rgba(0,0,0,.4); }
    .bns-b .rc:not(.open) .rc-b { display: none; }
    .bns-b .rc-h { padding: 12px 14px 4px; }
    .bns-b .rc-h .big { display: block; }
    .bns-b .rc-h .ttl { display: none; }
    .bns-b .rc-t { display: inline-flex; }
    .bns-b .rc-b { padding: 8px 14px 14px; }
    .bns-b .rc-f { padding: 10px 14px; }
    .bns-b .mi { grid-template-columns: 40px minmax(0, 1fr); }
    .bns-b .mi .c { grid-column: 2; grid-row: 3; }
    .bns-c .veil { display: none; }
    .bns-c .ovl { inset: 0; border-radius: 0; }
    .bns-c .oh { padding: 10px 12px; gap: 10px; }
    .bns-c .prog { display: none; }
    .bns-c .oh .x { margin-left: auto; }
    .bns-c .cbody { display: block; overflow: auto; }
    .bns-c .cl, .bns-c .cr { overflow: visible; padding: 16px; }
    .bns-c .cl { gap: 28px; }
    .bns-c .cr { border-left: 0; border-top: 1px solid var(--line); }
    .bns-c .sec > header h2 { font-size: 20px; }
    .bns-c .two { grid-template-columns: 1fr; gap: 14px; }
    .bns-c .gal { grid-auto-flow: column; grid-template-columns: none; grid-auto-columns: 80%; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 6px; }
    .bns-c .gc { scroll-snap-align: start; }
    .bns-c .paywrap { display: none; }
    .bns-c .cbar { display: flex; position: sticky; bottom: 0; z-index: 3; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 14px; background: #fff; border-top: 1px solid var(--line); box-shadow: 0 -10px 30px -20px rgba(0,0,0,.35); }
    .bns-c .cbar b { display: block; font-size: 21px; letter-spacing: -.03em; }
    .bns-c .cbar small { color: var(--mute); font-weight: 600; font-size: 12px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .bns .sheet.in, .bns-c .ovl.in, .bns .brk .l.nw { animation: none; }
    .bns .tg i, .bns-c .gc .ph img { transition: none; }
  }
  /* D: one question at a time — the trip photo grows as answers lock in */
  .bns-d .dx { position: absolute; inset: 0; z-index: 10; display: grid; grid-template-columns: minmax(0, 1fr) 600px; background: #0E1A24; }
  .bns-d .dx.in { animation: bnsDFade .5s var(--ease); }
  @keyframes bnsDFade { from { opacity: 0; } }
  .bns-d .stg { position: relative; overflow: hidden; min-height: 0; }
  .bns-d .pic { position: absolute; inset: 0; clip-path: inset(calc(var(--i) * 1%) round 26px); animation: bnsDGrow .9s var(--ease); }
  @keyframes bnsDGrow { from { clip-path: inset(calc(var(--i0) * 1%) round 26px); } }
  .bns-d .pic img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .bns-d .lk { position: absolute; inset: calc(var(--i) * 1%); padding: 22px; display: flex; flex-direction: column; justify-content: flex-end; align-items: flex-start; gap: 8px; border-radius: 26px; background: linear-gradient(transparent 50%, rgba(8,16,24,.7)); animation: bnsDInset .9s var(--ease); }
  @keyframes bnsDInset { from { inset: calc(var(--i0) * 1%); } }
  @keyframes bnsDH { from { height: var(--sh0); } }
  .bns-d .lk .t { display: inline-flex; gap: 7px; align-items: center; background: rgba(255,255,255,.95); color: var(--ink); border-radius: 999px; padding: 7px 13px; font-weight: 800; font-size: 13.5px; box-shadow: 0 8px 20px -10px rgba(0,0,0,.5); }
  .bns-d .lk .t .ic { width: 15px; height: 15px; color: var(--pri); }
  .bns-d .lk .t.big { font-size: 24px; letter-spacing: -.03em; padding: 8px 18px; background: var(--act); }
  .bns-d .lk .nw { animation: bnsDPop .6s var(--ease) .35s both; }
  @keyframes bnsDPop { from { opacity: 0; transform: translateY(12px) scale(.92); } }
  .bns-d .pol { display: flex; gap: 8px; }
  .bns-d .pol .ph { width: 62px; height: 62px; border-radius: 8px; border: 3px solid #fff; box-shadow: 0 10px 20px -10px rgba(0,0,0,.6); transform: rotate(-4deg); }
  .bns-d .pol .ph:nth-child(even) { transform: rotate(3deg); }
  .bns-d .sh { position: absolute; top: 18px; left: 22px; right: 22px; display: flex; gap: 12px; align-items: center; color: #fff; z-index: 2; }
  .bns-d .sh .x { width: 38px; height: 38px; border-radius: 10px; border: 1.5px solid rgba(255,255,255,.45); background: rgba(8,16,24,.45); color: #fff; font-size: 18px; cursor: pointer; flex: none; }
  .bns-d .sh b { display: block; font-size: 16px; letter-spacing: -.02em; text-shadow: 0 1px 8px rgba(0,0,0,.6); }
  .bns-d .sh small { font-size: 12.5px; color: #D6DEE6; font-weight: 600; text-shadow: 0 1px 8px rgba(0,0,0,.6); }
  .bns-d .cv { background: #fff; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-height: 0; min-width: 0; }
  .bns-d .cvh { display: flex; align-items: center; gap: 10px; padding: 12px 24px; border-bottom: 1px solid var(--line); }
  .bns-d .cvh .eyebrow { margin-right: auto; }
  .bns-d .cvh .lnk .ic { width: 15px; height: 15px; }
  .bns-d .dots { display: flex; gap: 5px; list-style: none; margin: 0; padding: 0; }
  .bns-d .dots li { width: 24px; height: 5px; border-radius: 99px; background: var(--line); }
  .bns-d .dots li.on { background: var(--pri); }
  .bns-d .cvs { overflow: auto; padding: 18px 24px 28px; display: grid; gap: 18px; align-content: start; overscroll-behavior: contain; min-width: 0; }
  .bns-d .ans { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .bns-d .an { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; gap: 10px; align-items: center; background: var(--bg2); border-radius: 12px; padding: 7px 6px 7px 10px; }
  .bns-d .an .k { width: 24px; height: 24px; border-radius: 50%; background: var(--ok); color: #fff; display: grid; place-items: center; }
  .bns-d .an .k .ic { width: 13px; height: 13px; }
  .bns-d .an small { display: block; font-size: 12px; color: var(--mute); font-weight: 600; }
  .bns-d .an b { font-size: 14px; }
  .bns-d .qa { display: grid; gap: 14px; min-width: 0; }
  .bns-d .qa.nw { animation: bnsDQ .55s var(--ease); }
  @keyframes bnsDQ { from { opacity: 0; transform: translateY(16px); } }
  .bns-d .qa h2 { font-size: 30px; letter-spacing: -.035em; outline: none; }
  .bns-d .qa .hint { color: var(--ink2); font-size: 14.5px; margin-top: -6px; }
  .bns-d .qa h3.sub { font-size: 16px; margin-top: 6px; }
  .bns-d .soon { font-size: 13px; color: var(--mute); font-weight: 600; border-top: 1px dashed var(--line); padding-top: 12px; }
  .bns-d .two { display: grid; gap: 16px; }
  .bns-d .dcs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .bns-d .dcd { display: grid; gap: 4px; align-content: start; justify-items: start; text-align: left; border: 1.5px solid var(--line); background: #fff; border-radius: 14px; padding: 12px; font: inherit; color: inherit; cursor: pointer; transition: border-color .2s, background .2s; min-width: 0; }
  .bns-d .dcd:hover { border-color: var(--ink); }
  .bns-d .dcd[aria-pressed="true"] { border-color: var(--pri); background: var(--pri-soft); box-shadow: inset 0 0 0 1px var(--pri); }
  .bns-d .dcd .dd { font-size: 15px; }
  .bns-d .dcd .pr { font-weight: 800; font-size: 18px; letter-spacing: -.02em; }
  .bns-d .dcd .pr s { color: var(--mute); font-weight: 600; font-size: 12px; letter-spacing: 0; }
  .bns-d .dcd .mt { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12.5px; color: var(--mute); font-weight: 600; }
  .bns-d .dcd .eb { white-space: normal; }
  .bns-d .dcd.off { cursor: default; background: #F7F8FA; border-style: dashed; color: #6E7A85; }
  .bns-d .dcd.off:hover { border-color: var(--line); }
  .bns-d .dcd a { color: var(--pri); font-weight: 700; text-decoration: none; }
  .bns-d .ll { border: 1px solid #D6E0F5; border-radius: 14px; padding: 14px; display: grid; gap: 10px; background: var(--bg2); }
  .bns-d .trk { position: relative; height: 12px; margin: 10px 11px 0; }
  .bns-d .trk .bar { position: absolute; inset: 0; border-radius: 99px; overflow: hidden; background: #C9D4E6; }
  .bns-d .trk .sg { position: absolute; top: 0; bottom: 0; }
  .bns-d .sg.z1 { background: var(--act); } .bns-d .sg.z2 { background: #FBD89A; } .bns-d .sg.z0 { background: #C9D4E6; }
  .bns-d .mk { position: absolute; top: 50%; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%; background: #fff; border: 2px solid var(--ink); display: grid; place-items: center; font-size: 11px; font-weight: 800; }
  .bns-d .mk.due { width: 4px; height: 24px; margin: -12px 0 0 -2px; border: 0; border-radius: 2px; background: var(--warn); }
  .bns-d .trk-l { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; color: var(--mute); font-weight: 700; }
  .bns-d .rg { list-style: none; margin: 0; padding: 0; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 8px; }
  .bns-d .rg li { background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; display: grid; gap: 1px; min-width: 0; }
  .bns-d .rg li.now { border-color: var(--pri); box-shadow: inset 0 0 0 1px var(--pri); }
  .bns-d .rg small { display: flex; gap: 5px; align-items: center; font-size: 11.5px; color: var(--mute); font-weight: 700; }
  .bns-d .rg small em { font-style: normal; width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid var(--ink); display: inline-grid; place-items: center; font-size: 9.5px; color: var(--ink); flex: none; }
  .bns-d .rg b { font-size: 16px; letter-spacing: -.02em; }
  .bns-d .rg span { font-size: 12px; font-weight: 800; color: var(--warn); }
  .bns-d .rg li.now span { color: var(--pri); }
  .bns-d .dts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .bns-d .dtl { display: grid; grid-template-rows: auto 1fr auto; border: 1.5px solid var(--line); border-radius: 16px; overflow: hidden; transition: border-color .2s, box-shadow .2s; min-width: 0; }
  .bns-d .dtl.on { border-color: var(--pri); box-shadow: inset 0 0 0 1px var(--pri); }
  .bns-d .dtl .ph { aspect-ratio: 16 / 9; }
  .bns-d .dtl .tx { padding: 10px 12px 0; display: grid; gap: 4px; align-content: start; }
  .bns-d .dtl .tx b { font-size: 15px; }
  .bns-d .dtl .tx p { font-size: 12.5px; color: var(--ink2); line-height: 1.4; }
  .bns-d .dtl .u { font-size: 12px; color: var(--mute); font-weight: 700; }
  .bns-d .dtl .ctl { padding: 10px 12px 12px; justify-content: space-between; }
  .bns-d .cvf { border-top: 1px solid var(--line); padding: 12px 24px; display: grid; gap: 6px; background: #fff; }
  .bns-d .fr { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .bns-d .fr small { display: block; font-size: 12px; color: var(--mute); font-weight: 600; }
  .bns-d .fr b { font-size: 26px; letter-spacing: -.03em; }
  .bns-d .fr .btn .ic { width: 16px; height: 16px; }
  /* E: plan it on the page — calendar with the ladder painted on, extras on the itinerary */
  .bns-e .pg { height: 100%; overflow: auto; overscroll-behavior: contain; }
  .bns-e .phead .ph { height: 190px; }
  .bns-e .eg { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 40px; align-items: start; margin-top: 24px; padding-bottom: 60px; }
  .bns-e .em { display: grid; gap: 40px; min-width: 0; }
  .bns-e .es { display: grid; gap: 14px; min-width: 0; }
  .bns-e .es > header { display: flex; gap: 12px; align-items: flex-start; }
  .bns-e .es > header .k { width: 30px; height: 30px; border-radius: 50%; background: var(--ink); color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 14px; flex: none; }
  .bns-e .es > header h2 { font-size: 24px; }
  .bns-e .es > header p { color: var(--ink2); font-size: 14px; margin-top: 4px; max-width: 66ch; }
  .bns-e .dstrip { display: flex; flex-wrap: wrap; gap: 8px; }
  .bns-e .dp { display: grid; gap: 3px; justify-items: start; align-content: start; text-align: left; border: 1.5px solid var(--line); background: #fff; border-radius: 12px; padding: 9px 12px; font: inherit; color: inherit; cursor: pointer; transition: border-color .2s, background .2s; max-width: 100%; }
  .bns-e .dp:hover { border-color: var(--ink); }
  .bns-e .dp[aria-pressed="true"] { border-color: var(--pri); background: var(--pri-soft); box-shadow: inset 0 0 0 1px var(--pri); }
  .bns-e .dp b { font-size: 14px; }
  .bns-e .dp .num { font-weight: 800; font-size: 15px; }
  .bns-e .dp small { font-size: 12px; font-weight: 700; color: var(--mute); }
  .bns-e .dp .num small { font-weight: 600; }
  .bns-e .dp .lf { color: var(--warn); }
  .bns-e .dp .eb { white-space: normal; }
  .bns-e .dp.off { background: #F7F8FA; border-style: dashed; color: #6E7A85; cursor: default; }
  .bns-e .dp.off:hover { border-color: var(--line); }
  .bns-e .cal { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px 22px; border: 1px solid var(--line); border-radius: 18px; padding: 18px; }
  .bns-e .mo { min-width: 0; }
  .bns-e .mo h4 { font-size: 14px; letter-spacing: -.01em; margin-bottom: 6px; }
  .bns-e .wk, .bns-e .cells { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; }
  .bns-e .wk span { font-size: 10.5px; font-weight: 700; color: var(--mute); text-align: center; padding-bottom: 2px; }
  .bns-e .c { aspect-ratio: 1; display: grid; place-items: center; font: 700 12px "DM Sans", sans-serif; border-radius: 6px; position: relative; color: var(--ink); border: 0; background: none; padding: 0; min-width: 0; }
  .bns-e .c.past { color: #AAB3BC; }
  .bns-e .c.z1, .bns-e .sw.z1 { background: #F7C66E; }
  .bns-e .c.z2, .bns-e .sw.z2 { background: #FCE3B4; }
  .bns-e .c.z0, .bns-e .sw.z0 { background: #DCE4F1; }
  .bns-e .c.pif, .bns-e .sw.pif { background: repeating-linear-gradient(135deg, #F3C9AE 0 3px, #FFF5EE 3px 7px); }
  .bns-e .c.cut, .bns-e .sw.cut { box-shadow: inset -3px 0 0 var(--ink); }
  .bns-e .c.due { box-shadow: inset -3px 0 0 var(--warn); }
  .bns-e .c.today { outline: 2px solid var(--ink); outline-offset: -2px; }
  .bns-e .c.go { background: var(--pri); color: #fff; border-radius: 50%; box-shadow: 0 0 0 3px var(--pri-soft); }
  .bns-e .c.trip { background: var(--pri-soft); color: var(--pri); }
  .bns-e button.c { cursor: pointer; }
  .bns-e .c.dd { box-shadow: inset 0 0 0 2px var(--pri); border-radius: 50%; color: var(--pri); }
  .bns-e button.c.dd:hover { background: var(--pri-soft); }
  .bns-e .c.dd.x { box-shadow: inset 0 0 0 2px #C3C9CF; color: #7D8994; text-decoration: line-through; cursor: default; }
  .bns-e .cal.paint .c[style] { animation: bnsEPaint .5s var(--ease) both; animation-delay: calc(var(--k) * 5ms); }
  @keyframes bnsEPaint { from { opacity: 0; transform: scale(.55); } }
  .bns-e .ekey { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 14px 24px; background: var(--bg2); border: 1px solid #D6E0F5; border-radius: 16px; padding: 14px 16px; }
  .bns-e .ekey .lad-h, .bns-e .ekey .fine { grid-column: 1 / -1; }
  .bns-e .ekey ol, .bns-e .ekey ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; align-content: start; }
  .bns-e .ekey li { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; gap: 10px; align-items: center; }
  .bns-e .ekey ul li { grid-template-columns: 18px minmax(0, 1fr); }
  .bns-e .ekey li b { display: block; font-size: 13.5px; }
  .bns-e .ekey li small { display: block; font-size: 12px; color: var(--mute); font-weight: 600; }
  .bns-e .ekey .pp { text-align: right; display: grid; }
  .bns-e .ekey .pp b { font-size: 15px; }
  .bns-e .ekey .pp em { font-style: normal; font-size: 12px; font-weight: 800; color: var(--warn); }
  .bns-e .ekey li.now .pp em { color: var(--pri); }
  .bns-e .sw { width: 18px; height: 18px; border-radius: 5px; display: block; }
  .bns-e .sw.cut { background: #fff; border: 1px solid var(--line); }
  .bns-e .sw.go { background: var(--pri); border-radius: 50%; }
  .bns-e .two { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start; }
  .bns-e .it { list-style: none; margin: 0; padding: 0; display: grid; }
  .bns-e .it li { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 16px; }
  .bns-e .it li.nw { animation: bnsEDay .7s var(--ease); }
  @keyframes bnsEDay { from { opacity: 0; transform: translateY(-8px); } }
  .bns-e .it .dn b { display: block; font-size: 14px; }
  .bns-e .it .dn small { font-size: 12px; color: var(--mute); font-weight: 600; }
  .bns-e .it .db { border-left: 2px solid var(--line); padding: 0 0 22px 18px; display: grid; gap: 6px; position: relative; min-width: 0; }
  .bns-e .it li:last-child .db { border-left-color: transparent; }
  .bns-e .it .db::before { content: ""; position: absolute; left: -7px; top: 3px; width: 12px; height: 12px; border-radius: 50%; background: #fff; border: 2px solid var(--pri); }
  .bns-e .it li.xtra .db::before { background: var(--act); border-color: var(--act-ink); }
  .bns-e .it .db > b { font-size: 16px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .bns-e .it .db > p { font-size: 14px; color: var(--ink2); }
  .bns-e .slot { display: grid; grid-template-columns: 88px minmax(0, 1fr) auto; gap: 12px; align-items: center; border: 1.5px dashed #C4CFDE; border-radius: 14px; padding: 10px; margin-top: 4px; background: #fff; transition: border-color .2s, background .2s; }
  .bns-e .slot.on { border-style: solid; border-color: var(--pri); background: #F6F8FF; }
  .bns-e .slot .ph { width: 88px; height: 66px; border-radius: 10px; }
  .bns-e .slot .eyebrow { color: var(--pri); letter-spacing: .08em; }
  .bns-e .slot .tx b { display: block; font-size: 15px; }
  .bns-e .slot .tx p { font-size: 12.5px; color: var(--ink2); line-height: 1.4; }
  .bns-e .slot .ctl { flex-direction: column; align-items: flex-end; gap: 6px; }
  .bns-e .eq { position: sticky; top: 16px; max-height: 888px; overflow: auto; border: 1px solid var(--line); border-radius: 18px; padding: 16px; display: grid; gap: 14px; align-content: start; background: #fff; box-shadow: 0 30px 60px -40px rgba(20,32,42,.35); overscroll-behavior: contain; scroll-margin-top: 12px; }
  .bns-e .eqh { display: grid; grid-template-columns: 56px minmax(0, 1fr); gap: 12px; align-items: center; }
  .bns-e .eqh .ph { width: 56px; height: 56px; border-radius: 12px; }
  .bns-e .eqh b { display: block; font-size: 16px; letter-spacing: -.02em; }
  .bns-e .eqh small { color: var(--mute); font-size: 12.5px; font-weight: 600; }
  .bns-e .fl { display: none; }
  @container site (max-width: 700px) {
    .bns-d .dx { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
    .bns-d .stg { height: var(--sh); animation: bnsDH .9s var(--ease); }
    .bns-d .pic { clip-path: none; animation: none; }
    .bns-d .lk { inset: 0; border-radius: 0; animation: none; padding: 12px 14px; flex-direction: row; flex-wrap: wrap; align-items: flex-end; align-content: flex-end; gap: 6px; }
    .bns-d .lk .t { font-size: 12px; padding: 5px 10px; }
    .bns-d .lk .t.big { font-size: 16px; padding: 5px 12px; }
    .bns-d .pol .ph { width: 38px; height: 38px; border-width: 2px; }
    .bns-d .sh { top: 10px; left: 12px; right: 12px; }
    .bns-d .sh small { display: none; }
    .bns-d .cvh, .bns-d .cvs, .bns-d .cvf { padding-left: 16px; padding-right: 16px; }
    .bns-d .cvs { padding-top: 14px; }
    .bns-d .dots li { width: 14px; }
    .bns-d .qa h2 { font-size: 24px; }
    .bns-d .dcs, .bns-d .dts { grid-template-columns: 1fr; }
    .bns-d .rg b { font-size: 14px; }
    .bns-d .fr b { font-size: 22px; }
    .bns-d .fr .btn { padding: 12px 14px; }
    .bns-e .phead .ph { height: 170px; }
    .bns-e .eg { grid-template-columns: 1fr; gap: 32px; padding-bottom: 120px; }
    .bns-e .em { gap: 32px; }
    .bns-e .eq { position: static; max-height: none; overflow: visible; }
    .bns-e .es > header h2 { font-size: 20px; }
    .bns-e .cal { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 12px; gap: 14px 12px; }
    .bns-e .c { font-size: 11px; border-radius: 4px; }
    .bns-e .ekey { grid-template-columns: 1fr; padding: 12px; }
    .bns-e .two { grid-template-columns: 1fr; gap: 14px; }
    .bns-e .it li { grid-template-columns: 56px minmax(0, 1fr); gap: 10px; }
    .bns-e .it .db { padding-left: 14px; }
    .bns-e .slot { grid-template-columns: 56px minmax(0, 1fr); }
    .bns-e .slot .ph { width: 56px; height: 56px; }
    .bns-e .slot .ctl { grid-column: 1 / -1; flex-direction: row; justify-content: space-between; align-items: center; }
    .bns-e .fl { display: flex; position: absolute; left: 10px; right: 10px; bottom: 10px; z-index: 20; align-items: center; gap: 8px; background: var(--ink); color: #fff; border-radius: 18px; padding: 8px 8px 8px 6px; box-shadow: 0 20px 40px -16px rgba(0,0,0,.6); }
    .bns-e .flq { margin-right: auto; min-width: 0; text-align: left; border: 0; background: none; color: #fff; font: inherit; cursor: pointer; padding: 4px 8px; border-radius: 10px; }
    .bns-e .flq b { display: block; font-size: 20px; letter-spacing: -.03em; }
    .bns-e .flq small { display: block; font-size: 11.5px; color: #C9D2DB; font-weight: 600; text-decoration: underline; text-underline-offset: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bns-e .fl .btn { padding: 11px 14px; flex: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .bns-d .dx.in, .bns-d .pic, .bns-d .lk, .bns-d .stg, .bns-d .qa.nw, .bns-d .lk .nw, .bns-e .cal.paint .c[style], .bns-e .it li.nw { animation: none; }
  }`;

  const V = [
    {
      id: 'A', name: 'Sheet, two new steps',
      note: 'The shipped side sheet, extended in place. Step 1 keeps the date list and adds an early-bird label to each date, with a price ladder under it (today, after tier 1 ends, after tier 2 ends). “Make it yours” arrives as step 3 after travellers: a photo row per add-on with a switch, a traveller stepper or a nights picker. Price keeps the coupon chip and adds one undiscounted line per add-on; a new “How you pay” step comes before Contact, and the footer’s Pay button carries what you pay today. On desktop it is the 480px sheet over the package page; on a phone it is full screen, one scroll, with total and Pay pinned. Try Fri 16 Oct (pay in full only) and the coupon Remove.',
      tradeoff: 'Closest to what ships and least new UI, but six steps make a long scroll and the price sits a step below the add-ons that change it.',
      render: renderA,
    },
    {
      id: 'B', name: 'Wide sheet, live receipt',
      note: 'The sheet widens to 920px on desktop: steps scroll on the left (dates with a staircase ladder showing what waiting costs, travellers beside their names, a compact add-on menu), and a receipt column on the right holds every quote line, the coupon, the pay choice and Pay, so each tap shows its effect beside it. On a phone it becomes one column; the receipt is a bar pinned to the bottom with the total and Pay, and “Price and payment” slides the full receipt and the pay choice up over the steps.',
      tradeoff: 'The price never leaves view on desktop, but the sheet hides most of the package page, and on a phone the pay choice is one tap away.',
      render: renderB,
    },
    {
      id: 'C', name: 'Build your trip',
      note: 'Book now opens a trip builder over the package page. Dates are cards across the top with the early-bird label on each and the ladder beneath; travellers and names sit side by side; add-ons are a photo gallery where a chosen card lifts, gets a tick, and drops its line into the ticket on the right. The ticket shows leave and back dates (extra nights move the return), every quote line, the pay choice and Pay. On a phone the dates and add-on gallery swipe sideways, the ticket follows below, and a bar with the total (or deposit today) and Pay stays pinned.',
      tradeoff: 'Sells add-ons hardest and looks the most distinct, but it is the biggest step away from the shipped sheet and the most new code.',
      render: renderC,
    },
    {
      id: 'D', name: 'One question at a time',
      note: 'Book now turns the page into a conversation: one question fills the right-hand column (when, who, extras, price, pay) and each answer collapses into a line you can change. On the left the trip photo starts as a framed postcard and grows toward full bleed with every answer, collecting what you locked in on top of it: dates, travellers, a photo of each extra, then the total. The date question pairs big date cards (early-bird label on each) with a line from today to departure, the tier cut-offs and the balance due date marked on it, and the three ladder prices beneath. The footer always carries the running total, counting as it changes. On a phone the photo becomes a band that grows from 150px to 240px above the question, and Next or Pay stays pinned. Try Back, then Change on an answer.',
      tradeoff: 'Calmest and most memorable, and each step fits a phone screen, but it takes five taps to reach Pay and the price sits on its own step instead of beside the add-ons that change it.',
      render: renderD,
    },
    {
      id: 'E', name: 'Plan it on the calendar',
      note: 'No sheet: booking happens on the package page itself. Departures are ringed days on a six-month calendar; pick one and every day from today to it is painted with what you would pay if you booked that day, with a line at each early-bird cut-off, a hatch from the balance due date (inside 30 days: pay in full only), and the trip days in blue. A key under it reads the ladder out in rupees. “Make it yours” sits inside the day-by-day itinerary, each extra on the day it happens; adding extra nights inserts new days and moves the return. On desktop the quote, coupon, pay choice and Pay stay in a sticky card on the right; on a phone the months go two across, the quote follows the itinerary, and a floating dark pill holds the total and Pay, and scrolls to the quote on tap. Try 13 Nov (tier 2 ends in two days) and 16 Oct.',
      tradeoff: 'The only layout that shows why a date costs what it does and where the extras fall in the trip, but it is a long page, the calendar needs care on small phones, and it is a different flow from every other screen in the shipped app.',
      render: renderE,
    },
  ];
  V.forEach((v) => { v.mount = (site) => bind(site, v); });

  TS.register({ id: 'sheet', label: 'Book now', group: 'v2.5 · customer', css, variants: V });
})();
