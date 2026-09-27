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
    coupon: true, couponErr: '', pay: 'dep', rc: false, rzp: false, vals: {},
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
      const k = b.dataset.act === 'rzp-x' ? 'paybtn--' : b.dataset.k;
      if (apply(b)) repaint(k);
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
  ];
  V.forEach((v) => { v.mount = (site) => bind(site, v); });

  TS.register({ id: 'sheet', label: 'Book now', group: 'v2.5 · customer', css, variants: V });
})();
