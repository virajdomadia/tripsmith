/* Admin redesign · operations: Dashboard, Bookings desk, Booking detail, Enquiries.
   One layout each ('A'); the global Admin style switch (A Ink rail · B Command · C Operator) is the variant.
   Content mirrors the shipped screens (web/src/app/(admin)/admin/(shell)/…) and their wording;
   v2.5 additions (R43 balances, R49 details, R51 refunds, R54 history, R56 channel) carry a "v2.5" chip.
   "Now" is Sun 27 Sep 2026, 4:20 pm IST. */
(() => {
  const TS = window.TS;
  const { inr, lakh, esc, ICON, PKGS } = TS;

  /* ---------- helpers ---------- */
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dt = ([m, d], y = 2026) => `${WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MON[m - 1]}`;
  const addDays = ([m, d], n) => { const x = new Date(Date.UTC(2026, m - 1, d + n)); return [x.getUTCMonth() + 1, x.getUTCDate()]; };
  const party = (a, c = 0) => `${a} ${a === 1 ? 'adult' : 'adults'}${c ? `, ${c} ${c === 1 ? 'child' : 'children'}` : ''}`;
  const V25 = '<span class="a-chip ops-v25" title="New in v2.5">v2.5</span>';
  const first = (n) => n.split(' ')[0];

  /* ---------- seed: departures in the next 30 days + the ones the part-paid bookings sit on ---------- */
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
  const depOf = (b) => DEPS[`${b.pkg}-${b.dep[0]}-${b.dep[1]}`];
  const left = (x) => x.seats - x.booked - x.held;
  const seatMeter = (x) => `<span class="ops-seat"><span class="a-meter" style="--v:${(x.booked / x.seats) * 100}%;--h:${(x.held / x.seats) * 100}%" aria-hidden="true"></span>
      <span class="num">${left(x) > 0 ? `${left(x)} of ${x.seats} left` : 'Sold out'}</span></span>`;

  /* ---------- seed: bookings (the desk's first page) ---------- */
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

  const stateChip = (b) => {
    if (b.st === 'pending') return b.hold ? `<span class="a-chip warn">${ICON.clock}Pending · hold live</span>` : '<span class="a-chip mute">Pending · hold lapsed</span>';
    if (b.st === 'confirmed') return `<span class="a-chip ok">${ICON.check}Confirmed</span>`;
    if (b.st === 'partially_paid') return '<span class="a-chip info">Part paid</span>';
    if (b.st === 'completed') return '<span class="a-chip mute">Completed</span>';
    return `<span class="a-chip mute">Cancelled · ${CANCEL[b.reason]}</span>`;
  };
  const flagChips = (b) => (b.refund ? '<span class="a-chip bad">Refund needed</span>' : '') + (b.creq ? '<span class="a-chip warn">Cancel requested</span>' : '');

  /* What the desk wants from the owner on this booking, in one line and one button. */
  const nextStep = (b) => {
    if (b.creq) return { tone: 'warn', t: 'Answer the cancellation request', x: 'Asked yesterday, 22 days before departure. The policy says 50% of the package price is retained. The seats stay held until you decide.', btn: 'Review request' };
    if (b.refund) return { tone: 'bad', t: `Record the ${inr(b.agreed || b.paid)} refund`, x: b.agreed ? 'The amount agreed when you approved the cancellation. Refund it in the Razorpay dashboard first, then record it here.' : 'The payment arrived after the hold lapsed and the seats had gone. Refund it in the Razorpay dashboard first, then record it here.', btn: 'Refund made' };
    if (b.st === 'pending' && b.hold) return { tone: 'info', t: `Seats held until ${b.hold}`, x: 'Checkout is open. Nothing to do: if the payment does not arrive, the seats free themselves.', btn: 'Release hold', ghost: true };
    if (b.st === 'pending') return { tone: 'mute', t: 'The hold has lapsed', x: `Its seats are free for others. If ${first(b.lead)} paid by UPI or at the office, mark ${inr(owed(b))} paid offline and the booking confirms.`, btn: 'Mark paid (offline)' };
    if (b.due) return { tone: 'info', t: `Balance ${inr(owed(b))} due by ${dt(b.due)}`, x: 'Reminders went out 7 and 3 days before. After 2 days of grace the booking cancels and the seats free.', btn: 'Mark balance paid', v25: true };
    if (b.miss) return { tone: 'info', t: `${b.miss} ${b.miss === 1 ? 'traveller is' : 'travellers are'} missing details`, x: 'ID, emergency contact and food choice lock 3 days before departure.', btn: 'Send details link', v25: true };
    return { tone: 'ok', t: 'Nothing to do here', x: b.st === 'completed' ? 'Departed and completed.' : b.st === 'cancelled' ? 'Cancelled with nothing owed either way.' : 'Paid in full, details in.', btn: '' };
  };

  /* ---------- seed: enquiries (the inbox's first page) ---------- */
  const TYPES = { standard: 'Standard', custom: 'Customise', contact: 'Contact', callback: 'Callback request', group: 'Group enquiry', chat: 'From concierge' };
  const ESTATUS = { new: ['pri', 'New'], contacted: ['warn', 'Contacted'], converted: ['ok', 'Converted'], closed: ['mute', 'Closed'] };
  const E = (ref, name, ph, em, pkg, type, month, a, c, status, recv, o = {}) => ({ ref, name, ph, em, pkg, type, month, a, c, status, recv, wait: 0, budget: 0, dates: '', changes: '', msg: '', device: 'Mobile · Chrome on Android', notes: [], related: [], booking: '', ...o });
  const ENQ = [
    E('TS-9P2LXA', 'Ritika Sharma', '98111 20457', 'ritika.sharma@customer.in', 'leh', 'callback', 'Jun 2027', 2, 0, 'new', '6 h ago', { wait: 360, msg: 'Please call after 6 pm. We want to know how the oxygen on board works and whether my mother (62) should do Khardung La.' }),
    E('TS-4MW8TE', 'Devansh Agarwal', '99300 71842', 'devansh@customer.in', 'jaipur', 'group', 'Dec 2026', 14, 0, 'new', '3 h ago', { wait: 180, dates: '11–16 Dec', budget: 30000, msg: 'Company offsite for 14. Need one coach for the whole trip, a conference room in Udaipur for half a day, and a GST invoice.', device: 'Desktop · Chrome on Windows' }),
    E('TS-7F3K2Q', 'Neha Kapoor', '98450 66120', 'neha.kapoor@customer.in', 'munnar', 'custom', 'Nov 2026', 2, 1, 'new', '48 min ago', { wait: 48, budget: 30000, dates: 'Around 14–19 Nov', changes: 'Two nights on the houseboat instead of one, and a Kochi city day at the end before our flight home.', msg: 'Our daughter is 6. Is the houseboat safe for her, and can we get a vegetarian cook on board?' }),
    E('TS-2HD6RB', 'Suresh Venkataraman', '94440 18273', 'suresh.v@customer.in', 'shimla', 'chat', 'Dec 2026', 2, 2, 'new', '21 min ago', { wait: 21, msg: 'Handed over by the concierge: wants snow almost certain in the last week of December and asked about heated rooms in Manali.' }),
    E('TS-8QK3NV', 'Aisha Khan', '98670 30491', 'aisha.khan@customer.in', 'goa', 'standard', 'Nov 2026', 2, 0, 'new', '12 min ago', { wait: 12, dates: '20–23 Nov', device: 'Mobile · Safari on iPhone' }),
    E('TS-5JT9WC', 'Manoj Tiwari', '98390 55104', 'manoj.tiwari@customer.in', 'manali', 'standard', 'Oct 2026', 3, 0, 'contacted', 'Yesterday', { notes: [['26 Sep, 11:44 am', 'Called. Wants the Kheerganga trek included; sending a revised quote with a porter.']] }),
    E('TS-6RB2YH', 'Lakshmi Narayanan', '94430 27719', 'lakshmi.n@customer.in', '', 'contact', '', 2, 0, 'contacted', '2 days ago', { msg: 'Do you run Kerala trips in the monsoon, or only from September?', notes: [['25 Sep, 5:10 pm', 'Replied by email with the Munnar dates from October.']] }),
    E('TS-3ZC7MP', 'Gaurav Bhatia', '98180 44926', 'gaurav.bhatia@customer.in', 'leh', 'custom', 'Jul 2027', 4, 0, 'contacted', '3 days ago', { changes: 'Add Tso Moriri and one extra night in Leh to acclimatise.', notes: [['24 Sep, 3:02 pm', 'Sent the Tso Moriri add-on quote. Follow up on 1 Oct.']] }),
    E('TS-2TQ8LU', 'Sana Mirza', '99200 81736', 'sana.mirza@customer.in', 'goa', 'group', 'Jan 2027', 9, 0, 'contacted', '4 days ago', { msg: 'Bachelorette trip for 9. Can we have the whole floor at the hotel?' }),
    E('TS-1XN4GS', 'Meenakshi Pillai', '94472 30918', 'meenakshi.pillai@customer.in', 'munnar', 'standard', 'Oct 2026', 2, 0, 'converted', '12 Sep', { booking: 'TB-5DC9MU', notes: [['19 Sep, 10:05 am', 'Booked 18 Oct with FESTIVE10.']] }),
    E('TS-9WE5KD', 'Pranav Hegde', '99800 16453', 'pranav.hegde@customer.in', 'kasol', 'standard', 'Oct 2026', 4, 0, 'closed', '15 Sep', { notes: [['16 Sep, 12:30 pm', 'Chose a self-drive trip instead. Closed.']] }),
    E('TS-6YH3BF', 'Harpreet Kaur', '98723 90114', 'harpreet.kaur@customer.in', 'kasol', 'callback', 'Sep 2026', 2, 0, 'converted', '2 Sep', { booking: 'TB-1ZF5WE', related: [['TS-4AA9KM', 'Leh · Nubra · Pangong', 'New', 'Today']] }),
  ];
  ENQ[0].related = [['TS-1KB7QE', 'General enquiry', 'Closed', 'Mar 2026']];

  /* ---------- screen CSS (layout only; colours and geometry come from the kit) ---------- */
  const css = `
  .ops-v25 { font-size: 10px; letter-spacing: .06em; padding: 1px 6px; background: transparent !important; color: var(--pri) !important; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--pri) 45%, transparent); vertical-align: middle; }
  .ops .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .ops .mono { font-family: ui-monospace, "SF Mono", Consolas, monospace; font-size: 12.5px; letter-spacing: .02em; }
  .ops .muted { color: var(--mute); }
  .ops .lnk { color: var(--pri); font-weight: 700; text-decoration: none; background: none; border: 0; padding: 0; font: inherit; font-weight: 700; cursor: pointer; }
  .ops .lnk:hover { text-decoration: underline; }
  .ops-g2 { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); gap: 16px; align-items: start; }
  .ops-g2.even { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ops-seat { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; font-size: 13px; }
  .ops-seat .a-meter { width: 64px; height: 6px; flex: none; }
  .ops-legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--mute); font-weight: 600; }
  .ops-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; background: var(--pri); }
  .ops-legend i.h { background: color-mix(in srgb, var(--act) 70%, #fff); } .ops-legend i.f { background: #E6EBEF; }

  /* attention queue */
  .ops-q { list-style: none; margin: 0; padding: 0; }
  .ops-q li { display: grid; grid-template-columns: 150px minmax(0, 1fr) auto; gap: 4px 14px; align-items: center; padding: 11px var(--a-pad); border-top: 1px solid var(--a-line); }
  .ops-q li:first-child { border-top: 0; }
  .ops-q li[hidden] { display: none; }
  .ops-q .who { font-weight: 700; font-size: 14px; display: block; }
  .ops-q .who .num { color: var(--mute); font-weight: 600; margin-right: 6px; }
  .ops-q .why { font-size: 13px; color: var(--mute); display: block; }
  .ops-q .age { font-size: 12px; color: var(--mute); font-weight: 600; display: block; margin-top: 3px; }
  .ops-q .a-tabs { padding: 0 var(--a-pad); }

  /* bar list (top packages / status) */
  .ops-bars { display: grid; gap: 10px; }
  .ops-bars a { display: grid; grid-template-columns: minmax(0, 1fr) 150px 52px; gap: 12px; align-items: center; text-decoration: none; color: var(--ink); font-size: 13.5px; font-weight: 600; }
  .ops-bars a:hover span:first-child { color: var(--pri); }
  .ops-bars .a-meter { height: 7px; }
  .ops-bars .num { text-align: right; font-weight: 800; }
  .ops-stack { display: flex; height: 12px; border-radius: 99px; overflow: hidden; gap: 2px; margin-bottom: 12px; }
  .ops-stack i { display: block; }

  /* money column */
  .ops-due { display: grid; gap: 0; }
  .ops-due > div { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 10px; padding: 10px 0; border-top: 1px solid var(--a-line); font-size: 13.5px; }
  .ops-due > div:first-child { border-top: 0; padding-top: 0; }
  .ops-due b { font-weight: 700; } .ops-due small { color: var(--mute); font-size: 12px; grid-column: 1; }
  .ops-due .num { font-weight: 800; text-align: right; grid-row: 1 / span 2; grid-column: 2; align-self: center; }
  .ops-total { display: flex; justify-content: space-between; align-items: baseline; border-top: 2px solid var(--ink); padding-top: 10px; margin-top: 4px; font-weight: 800; }
  .ops-total .num { font-size: 22px; letter-spacing: -.02em; }

  /* desk: attention tiles */
  .ops-flags { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  .ops-flag { text-align: left; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); padding: 12px 14px; cursor: pointer; display: grid; gap: 2px; font: inherit; color: var(--ink); position: relative; transition: border-color .2s, box-shadow .2s; }
  .ops-flag:hover { border-color: var(--ink); }
  .ops-flag .n { font-size: 24px; font-weight: 800; letter-spacing: -.03em; font-variant-numeric: tabular-nums; display: flex; align-items: center; gap: 8px; }
  .ops-flag .l { font-weight: 800; font-size: 13px; }
  .ops-flag .h { font-size: 12px; color: var(--mute); }
  .ops-flag.bad .n { color: #B42318; } .ops-flag.warn .n { color: var(--warn); }
  .ops-flag[aria-pressed="true"] { border-color: var(--pri); box-shadow: inset 0 0 0 1px var(--pri); background: color-mix(in srgb, var(--pri) 5%, var(--a-surf)); }
  .ops-flag[aria-pressed="true"] .l::after { content: " · filtering"; color: var(--pri); font-weight: 700; }
  .ops-desk .a-table tbody tr { cursor: pointer; }
  .ops-desk .a-table tr.sel td:first-child { box-shadow: inset 3px 0 0 var(--pri); }
  .ops-desk .ch { display: block; font-size: 11.5px; color: var(--mute); font-weight: 600; }
  .ops-count { font-size: 12.5px; color: var(--mute); font-weight: 600; padding: 10px var(--a-pad); border-top: 1px solid var(--a-line); display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .ops-bar-dates { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; color: var(--mute); }
  .ops-bar-dates input { width: 132px; }
  .a-bar .clear { font-weight: 700; font-size: 13px; color: var(--mute); background: none; border: 0; cursor: pointer; padding: 6px; }
  .a-bar .clear:hover { color: var(--ink); }

  /* side panel */
  .ops-ph { display: grid; gap: 6px; }
  .ops-ph .ref { font-size: 12px; font-weight: 800; letter-spacing: .06em; color: var(--mute); display: flex; justify-content: space-between; gap: 8px; }
  .ops-ph h3 { font-size: 19px; letter-spacing: -.02em; margin: 0; }
  .ops-ph .contact { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
  .ops-step { border-radius: 12px; padding: 12px; display: grid; gap: 6px; background: var(--bg2); border: 1px solid var(--a-line); }
  .ops-step.warn { background: var(--warn-soft); border-color: color-mix(in srgb, var(--warn) 25%, transparent); }
  .ops-step.bad { background: #FDECEA; border-color: #F3C9C4; }
  .ops-step.ok { background: var(--ok-soft); border-color: transparent; }
  .ops-step b { font-size: 14px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .ops-step p { margin: 0; font-size: 13px; color: var(--ink2); }
  .ops-step .acts { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px; }
  .ops-h3 { font-size: 11.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--mute); margin: 0; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .ops-panel-foot { display: flex; gap: 8px; flex-wrap: wrap; }
  .a-panel .a-tl-i { grid-template-columns: 64px 16px minmax(0, 1fr); }
  .a-panel .a-tl-i::after { left: calc(64px + 10px + 7.5px); }

  /* booking detail */
  .ops-bd { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 16px; align-items: start; }
  .ops-bd > div { display: grid; gap: 16px; min-width: 0; }
  .ops-next { background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); overflow: hidden; display: grid; grid-template-columns: 6px minmax(0, 1fr); }
  .ops-next::before { content: ""; background: var(--warn); }
  .ops-next.bad::before { background: #B42318; } .ops-next.info::before { background: var(--pri); }
  .ops-next .in { padding: 16px 18px; display: grid; gap: 12px; }
  .ops-next .eyeb { font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--warn); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .ops-next.bad .eyeb { color: #B42318; } .ops-next.info .eyeb { color: var(--pri); }
  .ops-next h2 { font-size: 20px; letter-spacing: -.02em; margin: 0; }
  .ops-next blockquote { margin: 0; background: var(--bg2); border-radius: 10px; padding: 8px 12px; font-size: 14.5px; color: var(--ink2); }
  .ops-next .policy { font-size: 13px; color: var(--ink2); }
  .ops-next .form { display: grid; gap: 12px; }
  .ops-next .form[hidden] { display: none; }
  .ops-next .foot { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .ops-next .foot .hint { font-size: 12px; color: var(--mute); margin-left: auto; }
  .ops-next .hint b { color: var(--ink); }
  .ops-strip { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 22px; }
  .ops-strip dl { display: flex; gap: 20px; margin: 0; }
  .ops-strip dt { font-size: 12px; font-weight: 700; color: var(--mute); }
  .ops-strip dd { margin: 0; font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .ops-strip .a-meter { flex: 1 1 160px; min-width: 120px; }
  .ops-lines { display: grid; gap: 7px; font-size: 13.5px; }
  .ops-lines > div { display: flex; justify-content: space-between; gap: 12px; }
  .ops-lines .num { font-variant-numeric: tabular-nums; }
  .ops-lines .tot { border-top: 1px solid var(--ink); padding-top: 8px; font-weight: 800; }
  .ops-lines .sub { color: var(--mute); }
  .ops-tlf { display: flex; gap: 6px; flex-wrap: wrap; }
  .ops-tlf button { font: 700 12px "DM Sans", sans-serif; border: 1px solid var(--a-line); background: var(--a-surf); color: var(--mute); border-radius: 999px; padding: 4px 10px; cursor: pointer; }
  .ops-tlf button[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: #fff; }
  .ops-tl .a-tl-i[hidden] { display: none; }
  .ops-tl .a-tl-i .w .k { margin-left: 6px; letter-spacing: .04em; font-weight: 700; text-transform: none; }
  .ops-demo { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 12.5px; font-weight: 700; color: var(--mute); }

  /* enquiries */
  .ops-inbox .a-table tbody tr { cursor: pointer; }
  .ops-inbox .a-table tr.sel td:first-child { box-shadow: inset 3px 0 0 var(--pri); }
  .ops-wait { font-size: 11.5px; font-weight: 800; display: block; }
  .ops-wait.long { color: #B42318; } .ops-wait.mid { color: var(--warn); }
  .ops-msg { background: var(--bg2); border-radius: 12px; padding: 10px 12px; font-size: 13.5px; color: var(--ink2); margin: 0; }
  .ops-msg b { display: block; font-size: 11.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--mute); margin-bottom: 3px; }
  .ops-notes { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; font-size: 13px; }
  .ops-notes li { border-left: 2px solid var(--a-line); padding-left: 10px; }
  .ops-notes small { display: block; color: var(--mute); font-size: 11.5px; font-weight: 700; }
  .ops-seg-wide { display: flex; } .ops-seg-wide button { flex: 1; }

  @container site (max-width: 700px) {
    .ops-g2, .ops-g2.even, .ops-bd { grid-template-columns: 1fr; }
    .ops-flags { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .ops-flag { padding: 10px 12px; } .ops-flag .n { font-size: 20px; } .ops-flag .h { display: none; }
    .ops-q li { grid-template-columns: minmax(0, 1fr) auto; }
    .ops-q li > .chips { grid-column: 1 / -1; }
    .ops-bars a { grid-template-columns: minmax(0, 1fr) 70px 44px; gap: 8px; }
    .ops .hs { display: none; }
    .ops-bar-dates { display: none; }
    .a-search { max-width: none; }
    .ops-strip dl { gap: 14px; }
    .ops-next .in { padding: 14px; } .ops-next h2 { font-size: 18px; }
    .ops-next .foot .hint { margin-left: 0; flex-basis: 100%; }
  }`;

  /* =====================================================================
     1 · DASHBOARD
     ===================================================================== */
  let dashQ = 'all', dashTop = 'enq';
  const QUEUE = [
    { k: 'bk', chip: '<span class="a-chip warn">Cancel requested</span>', who: 'Kavya Iyer', ref: 'TB-7K2M9Q', why: 'Munnar & Alleppey · Sun 18 Oct · 22 days out, policy keeps 50%', age: 'Asked yesterday, 7:42 pm', act: 'Review request', go: 'booking' },
    { k: 'bk', chip: '<span class="a-chip bad">Refund needed</span>', who: 'Sneha Kulkarni', ref: 'TB-9QW3LT', why: `${inr(57996)} paid after the hold lapsed and North Goa sold out`, age: '2 days ago', act: 'Refund made', go: 'booking' },
    { k: 'bk', chip: '<span class="a-chip bad">Refund needed</span>', who: 'Ishita Chawla', ref: 'TB-2KQ8VX', why: `${inr(55998)} agreed when you approved the cancellation`, age: 'Approved 22 Sep', act: 'Refund made', go: 'booking' },
    { k: 'enq', chip: '<span class="a-chip pri">New · Callback request</span>', who: 'Ritika Sharma', ref: 'TS-9P2LXA', why: 'Leh · Nubra · Pangong · Jun 2027 · 2 adults', age: 'Waiting 6 h · oldest in the inbox', act: 'Call', icon: 'phone', go: 'enquiries' },
    { k: 'bk', chip: `<span class="a-chip info">Balance due</span>${V25}`, who: 'Farhan Qureshi', ref: 'TB-6JN4ZC', why: `${inr(41998)} due Wed 30 Sep · booked by phone`, age: 'Reminder sent 27 Sep', act: 'Send reminder', go: 'booking' },
    { k: 'bk', chip: '<span class="a-chip mute">Hold lapsed</span>', who: 'Vikram Singh Rathore', ref: 'TB-8RT2KS', why: `Shimla–Manali · Sun 4 Oct · ${inr(36998)} unpaid, 7 seats still free`, age: 'Lapsed yesterday, 3:58 pm', act: 'Mark paid offline', go: 'booking' },
    { k: 'enq', chip: '<span class="a-chip pri">New · Group enquiry</span>', who: 'Devansh Agarwal', ref: 'TS-4MW8TE', why: 'Jaipur · Jodhpur · Udaipur · Dec 2026 · 14 adults', age: 'Waiting 3 h', act: 'Open', go: 'enquiries' },
    { k: 'rv', chip: '<span class="a-chip warn">Review waiting</span>', who: '2 reviews', ref: '', why: 'Harpreet Kaur, Kasol 25 Sep · Rahul Menon, Munnar 20 Sep', age: 'Oldest 2 days', act: 'Moderate', go: 'dash' },
  ];
  const qCount = (k) => QUEUE.filter((q) => k === 'all' || q.k === k).length;

  const DUES = BOOKINGS.filter((b) => b.due).sort((x, y) => x.due[0] * 40 + x.due[1] - (y.due[0] * 40 + y.due[1]));
  const dueTotal = DUES.reduce((s, b) => s + owed(b), 0);

  const TOP = {
    enq: [['leh', 14], ['munnar', 11], ['manali', 9], ['jaipur', 7], ['goa', 6], ['shimla', 3], ['kasol', 2]],
    views: [['goa', 3412], ['leh', 2960], ['munnar', 2318], ['manali', 1874], ['kasol', 1522], ['jaipur', 1207], ['shimla', 986]],
  };
  const BYSTATUS = [['New', 5, 'var(--pri)'], ['Contacted', 7, 'var(--act)'], ['Converted', 41, 'var(--ok)'], ['Closed', 23, '#AEB8C1']];

  const renderDash = () => {
    const upcoming = Object.values(DEPS).filter((x) => x.d[0] === 10 && x.d[1] <= 27);
    const top = TOP[dashTop], max = top[0][1];
    const all = BYSTATUS.reduce((s, x) => s + x[1], 0);
    const main = `<div class="ops ops-dash">
      <div class="a-head"><h1>Good afternoon, Viraj.</h1>
        <div class="sub">Sunday 27 September 2026 · 5 awaiting a first call · 3 bookings waiting on you</div>
        <div class="acts"><a href="#" class="a-btn ghost sm">${ICON.inbox}Open inbox</a><a href="#" class="a-btn sm">${ICON.plus}New package</a></div></div>

      <div class="ops-g2">
        <section class="a-card flush ops-q" aria-labelledby="q-h">
          <div class="a-card-h"><h2 id="q-h">Needs you now</h2><span class="muted" style="font-size:12.5px;font-weight:600">Oldest first within each kind</span></div>
          <div class="a-card-b">
            <div class="a-tabs" role="tablist" aria-label="Filter the queue">
              ${[['all', 'All'], ['bk', 'Bookings'], ['enq', 'Enquiries'], ['rv', 'Reviews']].map(([k, l]) => `<button role="tab" data-q="${k}" aria-selected="${dashQ === k}">${l} <span class="ct num">${qCount(k)}</span></button>`).join('')}
            </div>
            <ol class="ops-q">${QUEUE.map((q) => `<li data-k="${q.k}" ${dashQ !== 'all' && q.k !== dashQ ? 'hidden' : ''}>
                <span class="chips">${q.chip}</span>
                <span><span class="who">${q.ref ? `<span class="num mono">${q.ref}</span>` : ''}${esc(q.who)}</span><span class="why">${esc(q.why)}</span><span class="age">${q.age}</span></span>
                <a href="#" class="a-btn sm ${q.k === 'enq' ? '' : 'ghost'}">${q.icon ? ICON[q.icon] : ''}${q.act}</a></li>`).join('')}</ol>
          </div>
        </section>

        <div style="display:grid;gap:16px">
          <section class="a-card"><div class="a-card-h"><h2>Balances due · 7 days</h2>${V25}<div class="acts"><a href="#" class="a-btn ghost sm">Desk</a></div></div>
            <div class="a-card-b"><div class="ops-due">${DUES.map((b) => `<div><b>${b.lead}</b><small>${PKGS[b.pkg].name} · due ${dt(b.due)} · ${b.ch}</small><span class="num">${inr(owed(b))}</span></div>`).join('')}</div>
              <div class="ops-total"><span>Total due</span><span class="num">${lakh(dueTotal)}</span></div></div></section>
          <section class="a-card"><div class="a-card-h"><h2>Money · September</h2></div>
            <div class="a-card-b"><dl class="a-kv">
              <div><dt>Booked</dt><dd>${lakh(926400)}</dd></div>
              <div><dt>Collected</dt><dd>${lakh(684250)}</dd></div>
              <div><dt>Refunds to record</dt><dd style="color:#B42318">${inr(57996 + 55998)}</dd></div>
              <div><dt>Holds live now</dt><dd>3 · ${inr(21999 + 10998 + 65998)}</dd></div>
            </dl></div></section>
        </div>
      </div>

      <div class="a-kpis">
        <div class="a-kpi"><span class="k">New enquiries · this week</span><span class="v num">14</span><span class="d up">Up 5 on last week to date</span></div>
        <div class="a-kpi"><span class="k">Awaiting first call</span><span class="v num">5</span><span class="d down">Oldest waiting 6 h</span></div>
        <div class="a-kpi"><span class="k">Converted · 30 days</span><span class="v num">11</span><span class="d">of 52 received</span></div>
        <div class="a-kpi"><span class="k">Package views · 7 days</span><span class="v num">2,384</span><span class="d up">Up 12% on the previous 7 days</span></div>
        <div class="a-kpi"><span class="k">Seats sold · next 30 days</span><span class="v num">79 / 120</span><span class="d">5 more on hold</span></div>
      </div>

      <section class="a-card flush"><div class="a-card-h"><h2>Upcoming departures</h2><span class="muted" style="font-size:13px;font-weight:600">· next 30 days</span>
          <div class="acts"><span class="ops-legend"><span><i></i>Booked</span><span><i class="h"></i>On hold</span><span><i class="f"></i>Free</span></span></div></div>
        <div class="a-card-b"><div class="a-tw"><table class="a-table">
          <thead><tr><th>Date</th><th>Package</th><th>Seats</th><th class="hs">Status</th><th class="hs">Details ${V25}</th><th></th></tr></thead>
          <tbody>${upcoming.map((x) => `<tr><td><b>${dt(x.d)}</b></td><td>${PKGS[x.pkg].name}<small>${PKGS[x.pkg].nights} nights · ${PKGS[x.pkg].dest}</small></td>
            <td>${seatMeter(x)}</td><td class="hs">${BADGE[x.badge]}</td>
            <td class="hs">${x.booked === 0 ? '<span class="muted">No bookings</span>' : x.miss ? `<span class="a-chip warn">${x.miss} missing</span>` : '<span class="a-chip ok">All in</span>'}</td>
            <td class="num"><a href="#" class="lnk">Manifest</a></td></tr>`).join('')}</tbody></table></div></div></section>

      <div class="ops-g2 even">
        <section class="a-card"><div class="a-card-h"><h2>Top packages</h2><span class="muted" style="font-size:13px;font-weight:600">· 30 days</span>
            <div class="acts"><div class="a-seg" role="group" aria-label="Rank by">${[['enq', 'Enquiries'], ['views', 'Views']].map(([k, l]) => `<button data-top="${k}" aria-pressed="${dashTop === k}">${l}</button>`).join('')}</div></div></div>
          <div class="a-card-b"><div class="ops-bars">${top.map(([k, n]) => `<a href="#"><span>${PKGS[k].name}</span><span class="a-meter" style="--v:${(n / max) * 100}%" aria-hidden="true"></span><span class="num">${n.toLocaleString('en-IN')}</span></a>`).join('')}</div></div></section>
        <section class="a-card"><div class="a-card-h"><h2>Enquiries by status</h2><span class="muted" style="font-size:13px;font-weight:600">· ${all} in total</span></div>
          <div class="a-card-b"><div class="ops-stack" aria-hidden="true">${BYSTATUS.map(([, n, c]) => `<i style="flex:${n};background:${c}"></i>`).join('')}</div>
            <div class="ops-bars">${BYSTATUS.map(([l, n, c]) => `<a href="#"><span><i style="display:inline-block;width:9px;height:9px;border-radius:3px;background:${c};margin-right:8px"></i>${l}</span><span class="a-meter" style="--v:${(n / 41) * 100}%" aria-hidden="true"></span><span class="num">${n}</span></a>`).join('')}</div></div></section>
      </div>
    </div>`;
    return TS.adminShell('Dashboard', main);
  };
  const mountDash = (site, rerender) => {
    site.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { dashQ = b.dataset.q; rerender(); }));
    site.querySelectorAll('[data-top]').forEach((b) => b.addEventListener('click', () => { dashTop = b.dataset.top; rerender(); }));
  };

  /* =====================================================================
     2 · BOOKINGS DESK
     ===================================================================== */
  const desk = { status: '', flag: '', q: '', pkg: '', ch: '', sel: 'TB-7K2M9Q' };
  const FLAGS = [
    { k: 'refund', l: 'Refund needed', h: 'Money in, no seat behind it', tone: 'bad', test: (b) => b.refund },
    { k: 'cancellation', l: 'Cancellation requested', h: 'Seats held until you decide', tone: 'warn', test: (b) => b.creq },
    { k: 'balance', l: 'Balance due · 7 days', h: `${lakh(dueTotal)} to collect`, tone: '', test: (b) => !!b.due, v25: true },
    { k: 'details', l: 'Details missing', h: '9 travellers across 4 bookings', tone: '', test: (b) => b.miss > 0, v25: true },
  ];
  const STAT = [['', 'All'], ['pending', 'Pending'], ['confirmed', 'Confirmed'], ['partially_paid', 'Part paid'], ['completed', 'Completed'], ['cancelled', 'Cancelled']];
  const deskMatch = (b, ignore = '') => {
    if (ignore !== 'status' && desk.status && b.st !== desk.status) return false;
    if (ignore !== 'flag' && desk.flag && !FLAGS.find((f) => f.k === desk.flag).test(b)) return false;
    if (desk.pkg && b.pkg !== desk.pkg) return false;
    if (desk.ch && b.ch !== desk.ch) return false;
    if (desk.q) { const q = desk.q.toLowerCase(); if (![b.ref, b.lead, b.ph.replace(/\s/g, ''), b.em].some((s) => s.toLowerCase().includes(q.replace(/\s/g, '')))) return false; }
    return true;
  };

  const events = (b) => {
    const ev = [];
    if (b.st === 'completed') ev.push(['25 Sep', 'Cron', 'Departed — completed']);
    if (b.creq) ev.push(['Yesterday', 'Customer', 'Asked to cancel: “My father has surgery on 16 Oct in Chennai…”']);
    if (b.reason === 'seats_gone') ev.push(['25 Sep', 'System', 'Cancelled — paid after the hold lapsed and the seats had gone']);
    if (b.reason === 'cancellation_approved') ev.push(['22 Sep', 'Owner', `Cancellation approved · refund ${inr(b.agreed)} agreed`]);
    if (b.reason === 'hold_expired') ev.push(['Today', 'Cron', 'Cancelled by the daily tidy — the checkout was abandoned']);
    if (b.due) ev.push(['27 Sep', 'Cron', `Balance reminder sent · ${inr(owed(b))} due ${dt(b.due)}`]);
    if (b.st === 'pending' && !b.hold) ev.push(['Yesterday', 'System', 'Hold lapsed — seats released']);
    if (b.paid) ev.push([b.booked, 'Webhook', `Payment captured · ${inr(b.paid)}${b.due ? ' · 25% deposit' : ''}`]);
    ev.push([b.booked, b.ch === 'Web' || b.ch === 'Enquiry' ? 'Customer' : 'Owner', `${b.ch === 'Web' || b.ch === 'Enquiry' ? 'Booked online' : `Booked at the counter · ${b.ch}`} · ${party(b.a, b.c)} · ${inr(b.total)}`]);
    return ev.slice(0, 4);
  };

  const deskPanel = (b) => {
    if (!b) return '<section><div class="a-empty">Pick a booking to see its money, seats and next step here.</div></section>';
    const p = PKGS[b.pkg], x = depOf(b), n = nextStep(b);
    return `<section class="ops-ph"><span class="ref"><span class="mono">${b.ref}</span><span>Booked ${b.booked}</span></span>
        <h3>${esc(b.lead)}</h3><div class="chips">${stateChip(b)}${flagChips(b)}</div>
        <div class="contact"><a href="#" class="a-btn ghost sm">${ICON.phone}Call</a><a href="#" class="a-btn ghost sm">${ICON.wa}WhatsApp</a><a href="#" class="a-btn ghost sm">${ICON.mail}Email</a></div></section>
      <section><div class="ops-step ${n.tone}"><b>${n.t}${n.v25 ? V25 : ''}</b><p>${n.x}</p>${n.btn ? `<div class="acts"><button class="a-btn sm ${n.ghost ? 'ghost' : ''}">${n.btn}</button></div>` : ''}</div></section>
      <section><h4 class="ops-h3">Trip</h4><dl class="a-kv">
        <div><dt>Package</dt><dd>${p.name}</dd></div>
        <div><dt>Departs</dt><dd>${dt(b.dep)} → ${dt(addDays(b.dep, p.nights))}</dd></div>
        <div><dt>Party</dt><dd>${party(b.a, b.c)}</dd></div>
        <div><dt>Channel ${V25}</dt><dd>${b.ch}</dd></div>
        ${b.miss ? `<div><dt>Details ${V25}</dt><dd><span class="a-chip warn">${b.miss} missing</span></dd></div>` : ''}</dl>
        ${x ? `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:4px">${seatMeter(x)}<a href="#" class="lnk" style="font-size:13px">Manifest</a></div>` : ''}</section>
      <section><h4 class="ops-h3">Money</h4><dl class="a-kv">
        <div><dt>Total</dt><dd>${inr(b.total)}</dd></div>
        <div><dt>Paid</dt><dd>${inr(b.paid)}</dd></div>
        ${b.due ? `<div><dt>Balance ${V25}</dt><dd>${inr(owed(b))} · ${dt(b.due)}</dd></div>` : ''}
        ${b.coupon ? `<div><dt>Coupon</dt><dd class="mono" style="color:var(--ok)">${b.coupon}</dd></div>` : ''}
        ${b.refund ? `<div><dt>To refund</dt><dd style="color:#B42318">${inr(b.agreed || b.paid)}</dd></div>` : ''}</dl></section>
      <section><h4 class="ops-h3"><span>History ${V25}</span><span class="muted" style="text-transform:none;letter-spacing:0">latest first</span></h4>
        <div class="a-tl">${events(b).map(([t, w, tx]) => `<div class="a-tl-i"><span class="t">${t}</span><span class="w">${w}</span><span class="x">${tx}</span></div>`).join('')}</div></section>
      <section class="ops-panel-foot"><a href="#" class="a-btn sm">Open booking ${ICON.arrowR}</a>${b.st === 'confirmed' || b.st === 'completed' ? `<a href="#" class="a-btn ghost sm">${ICON.down}Voucher PDF</a>` : ''}</section>`;
  };

  const deskRow = (b) => {
    const p = PKGS[b.pkg];
    return `<tr data-ref="${b.ref}" class="${desk.sel === b.ref ? 'sel' : ''} ${b.st === 'cancelled' && !b.refund ? 'dim' : ''}" tabindex="0" aria-selected="${desk.sel === b.ref}">
      <td><b class="mono">${b.ref}</b><span class="ch">${b.ch === 'Web' ? 'Web' : `${b.ch} · counter`}</span></td>
      <td><b>${esc(b.lead)}</b><small>${b.ph}</small></td>
      <td class="hs">${p.name}<small>${dt(b.dep)} · ${party(b.a, b.c)}</small></td>
      <td class="num">${inr(b.paid)} <span class="muted">/ ${inr(b.total)}</span>${b.coupon ? `<small class="mono" style="color:var(--ok)">${b.coupon}</small>` : b.due ? `<small>Balance due ${dt(b.due)}</small>` : ''}</td>
      <td><div class="chips">${stateChip(b)}${flagChips(b)}${b.miss ? `<span class="a-chip warn">${b.miss} details missing</span>` : ''}</div></td>
      <td class="hs muted" style="white-space:nowrap">${b.booked}</td></tr>`;
  };

  const renderDesk = () => {
    const rows = BOOKINGS.filter((b) => deskMatch(b));
    const cnt = (st) => BOOKINGS.filter((b) => deskMatch(b, 'status') && (!st || b.st === st)).length;
    const fcnt = (f) => BOOKINGS.filter((b) => deskMatch(b, 'flag') && f.test(b)).length;
    const n = (st) => BOOKINGS.filter((b) => b.st === st).length;
    const waiting = BOOKINGS.filter((b) => b.refund || b.creq).length;
    const sel = rows.find((b) => b.ref === desk.sel) || null;
    const x = desk.pkg === 'munnar' ? DEPS['munnar-10-18'] : null;
    const main = `<div class="ops ops-desk">
      <div class="a-head"><h1>Bookings</h1><div class="sub">${n('confirmed')} confirmed · ${n('pending')} pending · ${n('partially_paid')} part paid · ${waiting} waiting on you</div>
        <div class="acts"><a href="#" class="a-btn ghost sm">${ICON.down}Export CSV</a><a href="#" class="a-btn act sm">${ICON.plus}New booking ${V25}</a></div></div>

      <div class="ops-flags" role="group" aria-label="Needs attention">${FLAGS.map((f) => `<button class="ops-flag ${fcnt(f) ? f.tone : ''}" data-flag="${f.k}" aria-pressed="${desk.flag === f.k}">
          <span class="n">${fcnt(f)}${f.v25 ? V25 : ''}</span><span class="l">${f.l}</span><span class="h">${f.h}</span></button>`).join('')}</div>

      <div class="a-tabs" role="tablist" aria-label="Filter by status">${STAT.map(([k, l]) => `<button role="tab" data-st="${k}" aria-selected="${desk.status === k}">${l} <span class="num muted">${cnt(k)}</span></button>`).join('')}</div>

      <div class="a-bar">
        <label class="a-search">${ICON.search}<input type="search" id="desk-q" value="${esc(desk.q)}" placeholder="Ref, name, phone or email" aria-label="Search ref, name, phone or email"></label>
        <select class="a-select" id="desk-pkg" aria-label="Package"><option value="">Any package</option>${Object.entries(PKGS).map(([k, p]) => `<option value="${k}" ${desk.pkg === k ? 'selected' : ''}>${p.name}</option>`).join('')}</select>
        <select class="a-select" aria-label="Departure"><option>Any departure</option>${Object.values(DEPS).filter((d) => d.d[0] >= 10).map((d) => `<option>${dt(d.d)} · ${PKGS[d.pkg].name}</option>`).join('')}</select>
        <select class="a-select" id="desk-ch" aria-label="Channel (v2.5)"><option value="">Any channel · v2.5</option>${['Web', 'Phone', 'Walk-in', 'WhatsApp', 'Enquiry'].map((c) => `<option ${desk.ch === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
        <span class="ops-bar-dates">Departing <input class="a-select" type="date" value="2026-09-27" aria-label="Departing from"> to <input class="a-select" type="date" aria-label="Departing to"></span>
        <button class="clear" id="desk-clear">Clear</button>
      </div>

      ${x ? `<div class="a-card"><div class="a-card-b ops-strip"><div><b>${PKGS.munnar.name}</b><div class="muted" style="font-size:13px">${dt(x.d)} 2026 · filtered to this package</div></div>
          <dl><div><dt>Seats</dt><dd>${x.seats}</dd></div><div><dt>Booked</dt><dd>${x.booked}</dd></div><div><dt>On hold</dt><dd>${x.held}</dd></div><div><dt>Left</dt><dd>${left(x)}</dd></div></dl>
          <span class="a-meter" style="--v:${(x.booked / x.seats) * 100}%;--h:${(x.held / x.seats) * 100}%" aria-hidden="true"></span><a href="#" class="a-btn ghost sm">Print manifest</a></div></div>` : ''}

      <div class="a-split">
        <div class="a-card flush"><div class="a-card-b"><div class="a-tw"><table class="a-table">
          <thead><tr><th>Ref</th><th>Lead</th><th class="hs">Trip</th><th class="num">Paid</th><th>Status</th><th class="hs">Booked</th></tr></thead>
          <tbody>${rows.map(deskRow).join('') || '<tr><td colspan="6"><div class="a-empty">No bookings match these filters.</div></td></tr>'}</tbody></table></div>
          <div class="ops-count"><span id="desk-count">Showing ${rows.length} of ${BOOKINGS.length} bookings</span><span>Page 1 of 1</span></div></div></div>
        <aside class="a-panel" id="desk-panel" aria-label="Selected booking">${deskPanel(sel)}</aside>
      </div>
    </div>`;
    return TS.adminShell('Bookings', main);
  };
  const mountDesk = (site, rerender) => {
    site.querySelectorAll('[data-flag]').forEach((b) => b.addEventListener('click', () => { desk.flag = desk.flag === b.dataset.flag ? '' : b.dataset.flag; rerender(); }));
    site.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', () => { desk.status = b.dataset.st; rerender(); }));
    const pick = (tr) => { desk.sel = tr.dataset.ref; rerender(); };
    site.querySelectorAll('tr[data-ref]').forEach((tr) => {
      tr.addEventListener('click', () => pick(tr));
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(tr); } });
    });
    const q = site.querySelector('#desk-q');
    if (q) q.addEventListener('input', () => {
      desk.q = q.value.trim();
      let shown = 0;
      site.querySelectorAll('tr[data-ref]').forEach((tr) => { const ok = deskMatch(byRef(tr.dataset.ref)); tr.hidden = !ok; if (ok) shown++; });
      const c = site.querySelector('#desk-count'); if (c) c.textContent = `Showing ${shown} of ${BOOKINGS.length} bookings`;
    });
    const pk = site.querySelector('#desk-pkg'); if (pk) pk.addEventListener('change', () => { desk.pkg = pk.value; rerender(); });
    const ch = site.querySelector('#desk-ch'); if (ch) ch.addEventListener('change', () => { desk.ch = ch.value; rerender(); });
    const cl = site.querySelector('#desk-clear'); if (cl) cl.addEventListener('click', () => { Object.assign(desk, { q: '', pkg: '', ch: '', flag: '', status: '' }); rerender(); });
  };

  /* =====================================================================
     3 · BOOKING DETAIL (three real states behind one preview switch)
     ===================================================================== */
  let bdState = 'cancel', bdDecision = 'approve', bdFilter = 'all';
  const DETAIL = {
    cancel: {
      b: byRef('TB-7K2M9Q'), bookedAt: '12 Sep 2026',
      travellers: [['Kavya Iyer', 34, 'Double sharing', 'ok'], ['Rahul Iyer', 36, 'Double sharing', 'ok'], ['Aadhya Iyer', 7, 'Child 5–11', 'ok']],
      lines: [['Double sharing · 2 × ' + inr(21999), 43998], ['Child 5–11 · 1 × ' + inr(15399), 15399]],
      history: [
        ['26 Sep', '7:43 pm', 'System', 'mail', 'Owner alert sent: cancellation requested on TB-7K2M9Q'],
        ['26 Sep', '7:42 pm', 'Customer', 'change', 'Asked to cancel: “My father has surgery on 16 Oct in Chennai, so we can’t travel that week.”'],
        ['19 Sep', '8:00 am', 'Cron', 'mail', 'Traveller details reminder sent to kavya.iyer@customer.in'],
        ['18 Sep', '10:21 pm', 'Customer', 'change', 'Traveller details completed for all 3 travellers'],
        ['12 Sep', '9:16 pm', 'System', 'mail', 'Confirmation email with voucher sent'],
        ['12 Sep', '9:16 pm', 'Webhook', 'pay', `Payment pay_P8kR7nWc93 captured · ${inr(59397)} · via Checkout`],
        ['12 Sep', '9:14 pm', 'System', 'pay', `Razorpay order order_P8kQ2mZx41 opened · ${inr(59397)}`],
        ['12 Sep', '9:14 pm', 'Customer', 'change', `Booked online · 3 travellers · ${inr(59397)}`],
      ],
    },
    hold: {
      b: byRef('TB-8RT2KS'), bookedAt: '26 Sep 2026',
      travellers: [['Vikram Singh Rathore', 41, 'Double sharing', 'na'], ['Deepa Rathore', 38, 'Double sharing', 'na']],
      lines: [['Double sharing · 2 × ' + inr(18499), 36998]],
      history: [
        ['Today', '10:05 am', 'Customer', 'mail', 'WhatsApp to the office: “Paid ₹36,998 by UPI to your HDFC account last night.”'],
        ['26 Sep', '3:58 pm', 'System', 'change', 'Hold lapsed — seats released'],
        ['26 Sep', '3:44 pm', 'Webhook', 'pay', 'Payment pay_P9aT4kLm20 failed · UPI timed out'],
        ['26 Sep', '3:43 pm', 'System', 'pay', `Razorpay order order_P9aS1hQe77 opened · ${inr(36998)}`],
        ['26 Sep', '3:43 pm', 'Customer', 'change', `Booked online · 2 travellers · ${inr(36998)}`],
      ],
    },
    refund: {
      b: byRef('TB-9QW3LT'), bookedAt: '25 Sep 2026',
      travellers: [['Sneha Kulkarni', 29, 'Double sharing', 'na'], ['Aditi Kulkarni', 27, 'Double sharing', 'na'], ['Prachi Joshi', 29, 'Double sharing', 'na'], ['Mrunal Patil', 28, 'Double sharing', 'na']],
      lines: [['Double sharing · 4 × ' + inr(14499), 57996]],
      history: [
        ['25 Sep', '11:27 am', 'System', 'mail', 'Owner alert sent: refund needed on TB-9QW3LT'],
        ['25 Sep', '11:26 am', 'System', 'change', 'Cancelled — paid after the hold lapsed and the seats had gone'],
        ['25 Sep', '11:26 am', 'Webhook', 'pay', `Payment pay_P8zD6vYu58 captured · ${inr(57996)} · via Razorpay’s webhook`],
        ['25 Sep', '11:17 am', 'System', 'change', 'Hold lapsed — seats released'],
        ['25 Sep', '11:02 am', 'System', 'pay', `Razorpay order order_P8zB3tRw12 opened · ${inr(57996)}`],
        ['25 Sep', '11:02 am', 'Customer', 'change', `Booked online · 4 travellers · ${inr(57996)}`],
      ],
    },
  };
  const KIND = { pay: 'Payment', mail: 'Email', change: 'Change' };

  const nextCard = (f) => {
    const b = f.b;
    if (bdState === 'cancel') {
      const sug = b.paid - Math.floor(b.total / 2);
      return `<section class="ops-next" aria-labelledby="nx-h"><div class="in">
        <span class="eyeb">${ICON.info}Next step · the seats stay held until you decide</span>
        <h2 id="nx-h">Kavya asked to cancel</h2>
        <blockquote>“My father has surgery on 16 Oct in Chennai, so we can’t travel that week. Could we get whatever refund the policy allows?”</blockquote>
        <p class="policy">Asked Sat 26 Sep, <b>22 days</b> before departure. The policy says: <b>50% of the package price is retained</b>.</p>
        <div class="a-seg ops-seg-wide" role="group" aria-label="Decision" style="max-width:360px">
          <button data-dec="approve" aria-pressed="${bdDecision === 'approve'}">Approve and cancel</button><button data-dec="reject" aria-pressed="${bdDecision === 'reject'}">Reject</button></div>
        <div class="form" data-form="approve" ${bdDecision === 'approve' ? '' : 'hidden'}>
          <div class="a-row2"><div class="a-field"><label for="nx-ref">Refund (₹)</label><input id="nx-ref" class="num" inputmode="numeric" value="${sug}">
            <span class="hint">Paid ${inr(b.paid)} · the tier suggests ${inr(sug)}. Take off any non-refundable tickets.</span></div>
            <div class="a-field"><label>After you approve</label><div class="a-note" style="margin:0">${ICON.info}<span>The booking cancels and its 3 seats go back on sale. The refund is flagged until you record it.</span></div></div></div>
          <div class="a-field"><label for="nx-note">Note to the customer</label><textarea id="nx-note" maxlength="500">Sorry to hear about your father, Kavya. We have cancelled TB-7K2M9Q and are refunding ${inr(sug)} to your card within 5–7 working days.</textarea>
            <span class="hint" style="display:flex;justify-content:space-between"><span>Shown in the email and on their booking page.</span><span class="num" id="nx-len">0/500</span></span></div>
          <div class="foot"><button class="a-btn">Approve and cancel ${b.ref}</button><span class="hint">The customer is emailed at once.</span></div></div>
        <div class="form" data-form="reject" ${bdDecision === 'reject' ? '' : 'hidden'}>
          <div class="a-field"><label for="nx-why">Why — to the customer</label><textarea id="nx-why" maxlength="500" placeholder="The hotel is already paid for these dates — we can move you to a later one."></textarea>
            <span class="hint">Required, at least 5 characters. The booking stays confirmed and the customer can’t ask again.</span></div>
          <div class="foot"><button class="a-btn ghost">Reject the request</button><span class="hint">Offer a date change instead ${V25}</span></div></div>
      </div></section>`;
    }
    if (bdState === 'hold') {
      const x = depOf(b);
      return `<section class="ops-next info" aria-labelledby="nx-h"><div class="in">
        <span class="eyeb">${ICON.clock}Next step · hold lapsed yesterday at 3:58 pm</span>
        <h2 id="nx-h">Mark ${inr(owed(b))} paid offline?</h2>
        <p class="policy">Vikram says he paid by UPI last night. Records the full ${inr(owed(b))}, confirms the booking and emails the voucher. The seats are re-checked first: <b>${left(x)} left, the party of 2 fits</b>.</p>
        <div class="form"><div class="a-row2"><div class="a-field"><label for="nx-utr">Reference (optional)</label><input id="nx-utr" placeholder="Bank UTR, “cash at office”…" value="UTR 426981533047"><span class="hint">Up to 80 characters.</span></div>
          <div class="a-field"><label for="nx-how">How it was paid ${V25}</label><select id="nx-how"><option>UPI</option><option>Bank transfer</option><option>Cash</option></select></div></div>
          <div class="foot"><button class="a-btn">Mark paid and confirm</button><button class="a-btn danger">Release hold</button><span class="hint">Release cancels it and frees the seats. No email is sent.</span></div></div>
      </div></section>`;
    }
    return `<section class="ops-next bad" aria-labelledby="nx-h"><div class="in">
      <span class="eyeb">${ICON.rupee}Next step · money in, no seat behind it</span>
      <h2 id="nx-h">Refund ${inr(b.paid)} to Sneha</h2>
      <p class="policy">The payment arrived 9 minutes after the hold lapsed, and North Goa on ${dt(b.dep)} had sold out by then. Refund it by hand in the Razorpay dashboard first. Recording it here drops the paid amount and clears the red flag. No email is sent.</p>
      <div class="form"><div class="a-field" style="max-width:420px"><label for="nx-rn">Note (optional)</label><input id="nx-rn" placeholder="Razorpay refund id…" value="rfnd_P9cK2wQx81"></div>
        <div class="foot"><button class="a-btn">Record refund</button><button class="a-btn ghost" title="Arrives with v2.5 R51">Refund through Razorpay ${V25}</button><span class="hint">From v2.5 one click sends it and records it.</span></div></div>
    </div></section>`;
  };

  const renderBooking = () => {
    const f = DETAIL[bdState], b = f.b, p = PKGS[b.pkg], x = depOf(b);
    const back = addDays(b.dep, p.nights);
    const main = `<div class="ops ops-bd-wrap" style="display:grid;gap:16px">
      <div class="ops-demo">Preview state <div class="a-seg" role="group" aria-label="Preview state">${[['cancel', 'Cancellation request'], ['hold', 'Lapsed hold'], ['refund', 'Refund needed']].map(([k, l]) => `<button data-bd="${k}" aria-pressed="${bdState === k}">${l}</button>`).join('')}</div></div>
      <div class="a-head"><h1><span class="mono" style="font-size:.8em">${b.ref}</span> · ${esc(b.lead)}</h1>
        <div class="sub">${p.name} · ${dt(b.dep)} 2026 · booked ${f.bookedAt}</div>
        <div class="acts"><a href="#" class="a-btn ghost sm">${ICON.phone}Call</a><a href="#" class="a-btn ghost sm">${ICON.wa}WhatsApp</a><a href="#" class="a-btn ghost sm">${ICON.mail}Email</a><a href="#" class="a-btn ghost sm">${ICON.chevL}Desk</a></div></div>

      <div class="ops-bd">
        <div>
          ${nextCard(f)}
          <section class="a-card"><div class="a-card-b ops-strip"><div><b>${p.name}</b><div class="muted" style="font-size:13px">${dt(b.dep)} 2026</div></div>
            <dl><div><dt>Seats</dt><dd>${x.seats}</dd></div><div><dt>Booked</dt><dd>${x.booked}</dd></div><div><dt>On hold</dt><dd>${x.held}</dd></div><div><dt>Left</dt><dd>${left(x)}</dd></div></dl>
            <span class="a-meter" style="--v:${(x.booked / x.seats) * 100}%;--h:${(x.held / x.seats) * 100}%" aria-hidden="true"></span><a href="#" class="a-btn ghost sm">Print manifest</a></div></section>

          <section class="a-card flush"><div class="a-card-h"><h2>Travellers</h2><span class="muted" style="font-weight:600">· ${f.travellers.length}</span></div>
            <div class="a-card-b"><div class="a-tw"><table class="a-table"><thead><tr><th>#</th><th>Name</th><th class="num">Age</th><th class="hs">Room</th><th>Details ${V25}</th></tr></thead>
              <tbody>${f.travellers.map(([nm, age, occ, st], i) => `<tr><td class="num" style="text-align:left">${i + 1}</td><td><b>${nm}</b>${i === 0 ? '<small>Lead · +91 ' + b.ph + '</small>' : ''}</td><td class="num">${age}</td><td class="hs">${occ}</td>
                <td>${st === 'ok' ? `<span class="a-chip ok">${ICON.check}Complete</span>` : '<span class="a-chip mute">Not asked · unpaid</span>'}</td></tr>`).join('')}</tbody></table></div></div></section>

          <section class="a-card"><div class="a-card-h"><h2>History</h2>${V25}<span class="muted" style="font-size:12.5px;font-weight:600">Payments, emails and changes in one log · IST · latest first</span></div>
            <div class="a-card-b" style="display:grid;gap:14px">
              <div class="ops-tlf" role="group" aria-label="Show">${[['all', 'All'], ['pay', 'Payments'], ['mail', 'Emails'], ['change', 'Changes']].map(([k, l]) => `<button data-tlf="${k}" aria-pressed="${bdFilter === k}">${l} <span class="num">${k === 'all' ? f.history.length : f.history.filter((h) => h[3] === k).length}</span></button>`).join('')}</div>
              <div class="a-tl ops-tl">${f.history.map(([d, t, w, k, tx]) => `<div class="a-tl-i" data-k="${k}" ${bdFilter !== 'all' && bdFilter !== k ? 'hidden' : ''}><span class="t">${d}<br>${t}</span><span class="w">${w}<span class="k">· ${KIND[k]}</span></span><span class="x">${esc(tx)}</span></div>`).join('')}</div>
            </div></section>
        </div>

        <div>
          <section class="a-panel" style="position:static">
            <section><h4 class="ops-h3">Status</h4><div class="chips">${stateChip(b)}${flagChips(b)}</div>
              <p class="muted" style="margin:0;font-size:13px">${bdState === 'hold' ? 'The hold has lapsed — its seats are free for others.' : bdState === 'refund' ? `Cancelled on 25 Sep. ${inr(b.paid)} sits with Tripsmith until you refund it.` : 'Confirmed and paid in full. Voucher sent 12 Sep.'}</p>
              ${bdState === 'cancel' ? `<a href="#" class="a-btn ghost sm" style="justify-self:start">${ICON.down}Voucher PDF</a>` : ''}</section>
            <section><h4 class="ops-h3">Price</h4><div class="ops-lines">
              ${f.lines.map(([l, a]) => `<div><span class="sub">${l}</span><span class="num">${inr(a)}</span></div>`).join('')}
              <div class="tot"><span>Total</span><span class="num">${inr(b.total)}</span></div>
              <div><span class="sub">Paid</span><span class="num">${inr(b.paid)}</span></div>
              <div><span class="sub">${bdState === 'refund' ? 'To refund' : 'Balance'}</span><span class="num" style="${bdState === 'refund' ? 'color:#B42318;font-weight:800' : ''}">${bdState === 'refund' ? inr(b.paid) : owed(b) ? inr(owed(b)) : 'Paid in full'}</span></div></div></section>
            <section><h4 class="ops-h3">Trip</h4><b style="font-size:14px">${p.name}</b>
              <span class="muted" style="font-size:13px">${p.nights} nights · ${p.nights + 1} days · ${dt(b.dep)} → ${dt(back)}</span>
              <a href="#" class="lnk" style="font-size:13px">View the package page</a></section>
            <section><h4 class="ops-h3">Lead</h4><dl class="a-kv">
              <div><dt>Mobile</dt><dd>+91 ${b.ph}</dd></div><div><dt>Email</dt><dd style="word-break:break-all">${b.em}</dd></div>
              <div><dt>Channel ${V25}</dt><dd>Web · by the customer</dd></div>
              <div><dt>Past trips</dt><dd>${bdState === 'cancel' ? '1 · Kerala 2025' : 'None'}</dd></div></dl></section>
          </section>
        </div>
      </div>
    </div>`;
    return TS.adminShell('Bookings', main);
  };
  const mountBooking = (site, rerender) => {
    site.querySelectorAll('[data-bd]').forEach((b) => b.addEventListener('click', () => { bdState = b.dataset.bd; bdFilter = 'all'; rerender(); }));
    site.querySelectorAll('[data-dec]').forEach((b) => b.addEventListener('click', () => {
      bdDecision = b.dataset.dec;
      site.querySelectorAll('[data-dec]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      site.querySelectorAll('[data-form]').forEach((fm) => { fm.hidden = fm.dataset.form !== bdDecision; });
    }));
    site.querySelectorAll('[data-tlf]').forEach((b) => b.addEventListener('click', () => {
      bdFilter = b.dataset.tlf;
      site.querySelectorAll('[data-tlf]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      site.querySelectorAll('.ops-tl .a-tl-i').forEach((i) => { i.hidden = bdFilter !== 'all' && i.dataset.k !== bdFilter; });
    }));
    const note = site.querySelector('#nx-note'), len = site.querySelector('#nx-len');
    if (note && len) { const upd = () => { len.textContent = `${[...note.value.trim()].length}/500`; }; upd(); note.addEventListener('input', upd); }
  };

  /* =====================================================================
     4 · ENQUIRIES
     ===================================================================== */
  const inbox = { status: '', q: '', type: '', sort: 'wait', sel: 'TS-7F3K2Q' };
  const ECOUNTS = { '': 76, new: 5, contacted: 7, converted: 41, closed: 23 };
  const eMatch = (e) => (!inbox.status || e.status === inbox.status) && (!inbox.type || e.type === inbox.type)
    && (!inbox.q || [e.name, e.ph.replace(/\s/g, ''), e.ref].some((s) => s.toLowerCase().includes(inbox.q.toLowerCase().replace(/\s/g, ''))));
  const waitChip = (e) => (e.status !== 'new' ? '' : `<span class="ops-wait ${e.wait >= 180 ? 'long' : e.wait >= 45 ? 'mid' : ''}">Waiting ${e.wait >= 60 ? `${Math.round(e.wait / 60)} h` : `${e.wait} min`}</span>`);
  const eChip = (s) => `<span class="a-chip ${ESTATUS[s][0]}">${ESTATUS[s][1]}</span>`;

  const ePanel = (e) => {
    if (!e) return '<section><div class="a-empty">Pick an enquiry to read it and reply here.</div></section>';
    const p = e.pkg ? PKGS[e.pkg] : null;
    const subj = `Your Tripsmith enquiry ${e.ref}${p ? ` — ${p.name}` : ''}`;
    return `<section class="ops-ph"><span class="ref"><span class="mono">${e.ref}</span><span>Received ${e.recv}</span></span>
        <h3>${esc(e.name)}</h3><div class="chips" id="e-chip">${eChip(e.status)}<span class="a-chip mute">${TYPES[e.type]}</span>${waitChip(e) ? `<span class="a-chip bad">${waitChip(e).replace(/<[^>]+>/g, '')}</span>` : ''}</div>
        <div class="contact"><a href="#" class="a-btn sm">${ICON.phone}Call</a><a href="#" class="a-btn ghost sm">${ICON.wa}WhatsApp</a><a href="#" class="a-btn ghost sm">${ICON.mail}Email</a></div></section>
      <section><h4 class="ops-h3">Status</h4><div class="a-seg ops-seg-wide" role="group" aria-label="Status">${Object.entries(ESTATUS).map(([k, [, l]]) => `<button data-es="${k}" aria-pressed="${e.status === k}">${l}</button>`).join('')}</div>
        ${e.booking ? `<span style="font-size:13px">Converted to <a href="#" class="lnk mono">${e.booking}</a></span>` : `<a href="#" class="a-btn act sm" style="justify-self:start">${ICON.ticket}Convert to booking ${V25}</a><span class="muted" style="font-size:12px">Pre-fills a counter booking from this enquiry and marks it converted.</span>`}</section>
      <section><h4 class="ops-h3">What they sent</h4><dl class="a-kv">
        <div><dt>Mobile</dt><dd>+91 ${e.ph}</dd></div><div><dt>Email</dt><dd style="word-break:break-all">${e.em}</dd></div>
        <div><dt>Package</dt><dd>${p ? `<a href="#" class="lnk">${p.name}</a>` : '—'}</dd></div>
        <div><dt>Travel month</dt><dd>${e.month || '—'}</dd></div><div><dt>Travellers</dt><dd>${party(e.a, e.c)}</dd></div>
        ${e.budget ? `<div><dt>Budget per person</dt><dd>${inr(e.budget)}</dd></div>` : ''}
        ${e.dates ? `<div><dt>Preferred dates</dt><dd>${e.dates}</dd></div>` : ''}
        <div><dt>Emails</dt><dd>Sent · owner and visitor</dd></div><div><dt>Source</dt><dd>${e.device}</dd></div></dl>
        ${e.changes ? `<p class="ops-msg"><b>Changes asked for</b>${esc(e.changes)}</p>` : ''}${e.msg ? `<p class="ops-msg"><b>Message</b>${esc(e.msg)}</p>` : ''}</section>
      <section><h4 class="ops-h3">Reply by email</h4>
        <div class="a-field"><label for="r-s">Subject</label><input id="r-s" value="${esc(subj)}"></div>
        <div class="a-field"><label for="r-b">Message</label><textarea id="r-b">Hi ${esc(first(e.name))}, thanks for your enquiry${p ? ` about ${p.name}` : ''}. </textarea></div>
        <div class="a-field"><label for="r-p">Attach an itinerary</label><select id="r-p"><option>No attachment</option>${p ? `<option selected>${p.name} — itinerary PDF</option>` : ''}</select></div>
        <button class="a-btn sm" style="justify-self:start">${ICON.mail}Send reply</button></section>
      <section><h4 class="ops-h3">Notes <span class="muted" style="text-transform:none;letter-spacing:0">only you see these</span></h4>
        ${e.notes.length ? `<ul class="ops-notes">${e.notes.map(([t, x]) => `<li><small>${t} · Viraj D.</small>${esc(x)}</li>`).join('')}</ul>` : '<span class="muted" style="font-size:13px">No notes yet.</span>'}
        <div class="a-field"><label for="r-n" style="position:absolute;left:-9999px">Add a note</label><input id="r-n" placeholder="Add a note — called, quoted, follow up on…"></div></section>
      <section><h4 class="ops-h3">Related enquiries</h4>${e.related.length ? e.related.map(([r, pk, st, when]) => `<div style="display:flex;gap:8px;font-size:13px;flex-wrap:wrap"><a href="#" class="lnk mono">${r}</a><span>${pk}</span><span class="muted">· ${st} · ${when}</span></div>`).join('') : '<span class="muted" style="font-size:13px">None — first enquiry.</span>'}</section>`;
  };

  const renderEnq = () => {
    let rows = ENQ.filter(eMatch);
    if (inbox.sort === 'wait') rows = [...rows].sort((a, b) => (b.status === 'new') - (a.status === 'new') || b.wait - a.wait);
    const sel = rows.find((e) => e.ref === inbox.sel) || null;
    const main = `<div class="ops ops-inbox">
      <div class="a-head"><h1>Enquiries</h1><div class="sub">${ECOUNTS.new} new · ${ECOUNTS.contacted} contacted · ${ECOUNTS.converted} converted · oldest new waiting 6 h</div>
        <div class="acts"><a href="#" class="a-btn ghost sm">${ICON.down}Export CSV</a></div></div>
      <div class="a-tabs" role="tablist" aria-label="Filter by status">${[['', 'All'], ['new', 'New'], ['contacted', 'Contacted'], ['converted', 'Converted'], ['closed', 'Closed']].map(([k, l]) => `<button role="tab" data-es-tab="${k}" aria-selected="${inbox.status === k}">${l} ${k === 'new' ? `<span class="ct num">${ECOUNTS[k]}</span>` : `<span class="num muted">${ECOUNTS[k]}</span>`}</button>`).join('')}</div>
      <div class="a-bar">
        <label class="a-search">${ICON.search}<input type="search" id="enq-q" value="${esc(inbox.q)}" placeholder="Search name or phone" aria-label="Search name or phone"></label>
        <select class="a-select" id="enq-type" aria-label="Type"><option value="">Any type</option>${Object.entries(TYPES).map(([k, l]) => `<option value="${k}" ${inbox.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select class="a-select" aria-label="Package"><option>Any package</option>${Object.values(PKGS).map((p) => `<option>${p.name}</option>`).join('')}</select>
        <span class="ops-bar-dates">Received <input class="a-select" type="date" aria-label="Received from"> to <input class="a-select" type="date" aria-label="Received to"></span>
        <div class="a-seg" role="group" aria-label="Sort"><button data-sort="wait" aria-pressed="${inbox.sort === 'wait'}">Longest waiting</button><button data-sort="new" aria-pressed="${inbox.sort === 'new'}">Newest</button></div>
      </div>
      <div class="a-split">
        <div class="a-card flush"><div class="a-card-b"><div class="a-tw"><table class="a-table">
          <thead><tr><th>Ref</th><th>Name</th><th class="hs">Package</th><th class="hs">Type</th><th class="hs">Month · pax</th><th>Status</th><th class="hs">Received</th></tr></thead>
          <tbody>${rows.map((e) => `<tr data-eref="${e.ref}" tabindex="0" class="${inbox.sel === e.ref ? 'sel' : ''} ${e.status === 'closed' ? 'dim' : ''}" aria-selected="${inbox.sel === e.ref}">
            <td><b class="mono">${e.ref}</b></td><td><b>${esc(e.name)}</b><small>${e.ph}</small></td>
            <td class="hs">${e.pkg ? PKGS[e.pkg].name : '<span class="muted">General</span>'}</td><td class="hs">${TYPES[e.type]}</td>
            <td class="hs" style="white-space:nowrap">${e.month ? `${e.month} · ${party(e.a, e.c)}` : '—'}</td>
            <td>${eChip(e.status)}${waitChip(e)}</td><td class="hs muted" style="white-space:nowrap">${e.recv}</td></tr>`).join('') || '<tr><td colspan="7"><div class="a-empty">No enquiries match these filters.</div></td></tr>'}</tbody></table></div>
          <div class="ops-count"><span id="enq-count">${rows.length} on this page</span><span>Page 1 of 7 · ${ECOUNTS['']} enquiries</span></div></div></div>
        <aside class="a-panel" aria-label="Selected enquiry">${ePanel(sel)}</aside>
      </div>
    </div>`;
    return TS.adminShell('Enquiries', main);
  };
  const mountEnq = (site, rerender) => {
    site.querySelectorAll('[data-es-tab]').forEach((b) => b.addEventListener('click', () => { inbox.status = b.dataset.esTab; rerender(); }));
    site.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => { inbox.sort = b.dataset.sort; rerender(); }));
    const pick = (tr) => { inbox.sel = tr.dataset.eref; rerender(); };
    site.querySelectorAll('tr[data-eref]').forEach((tr) => {
      tr.addEventListener('click', () => pick(tr));
      tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(tr); } });
    });
    site.querySelectorAll('[data-es]').forEach((b) => b.addEventListener('click', () => {
      const e = ENQ.find((x) => x.ref === inbox.sel); if (!e) return;
      e.status = b.dataset.es; if (e.status !== 'new') e.wait = 0; rerender();
    }));
    const ty = site.querySelector('#enq-type'); if (ty) ty.addEventListener('change', () => { inbox.type = ty.value; rerender(); });
    const q = site.querySelector('#enq-q');
    if (q) q.addEventListener('input', () => {
      inbox.q = q.value.trim(); let n = 0;
      site.querySelectorAll('tr[data-eref]').forEach((tr) => { const ok = eMatch(ENQ.find((x) => x.ref === tr.dataset.eref)); tr.hidden = !ok; if (ok) n++; });
      const c = site.querySelector('#enq-count'); if (c) c.textContent = `${n} on this page`;
    });
  };

  /* ---------- register ---------- */
  TS.register({ id: 'dash', label: 'Dashboard', group: 'Admin redesign', admin: true, css,
    variants: [{ id: 'A', name: 'Redesign', tradeoff: '', render: renderDash, mount: mountDash,
      note: 'Today the dashboard opens on four enquiry tiles and leaves bookings to the desk, so a cancellation request or a refund only shows up if you go looking. The redesign leads with one <b>Needs you now</b> queue that merges cancellation requests, refunds, lapsed holds, the longest-waiting enquiry and reviews, each with its one action, so the owner clears the day from the home page. Money sits beside it (v2.5 balances due in 7 days, refunds to record, live holds), departures gain a booked/held seat bar and a details-missing column, and the two top-package panels collapse into one with an Enquiries/Views switch.' }] });
  TS.register({ id: 'bookings', label: 'Bookings desk', group: 'Admin redesign', admin: true,
    variants: [{ id: 'A', name: 'Redesign', tradeoff: '', render: renderDesk, mount: mountDesk,
      note: 'Today the desk is two rows of tab links, a five-field form with an Apply button, and a table where every booking needs <b>Open</b> before you can see anything. The redesign turns the two waiting-on-you flags into counted attention tiles (plus v2.5 balance due and details missing), keeps status as tabs, filters live as you type, and fills a side panel when you click a row: the next step with its button, seats, money and recent history. Most bookings get handled without leaving the list. Try a tile, a tab, the package filter (Munnar shows the seat strip) or any row.' }] });
  TS.register({ id: 'booking', label: 'Booking detail', group: 'Admin redesign', admin: true,
    variants: [{ id: 'A', name: 'Redesign', tradeoff: '', render: renderBooking, mount: mountBooking,
      note: 'Today the action sits in a narrow right column behind confirm dialogs, under the seat strip, travellers and price. The redesign puts a <b>Next step</b> card first with the decision inline: the refund pre-filled from the policy tier, the note with its counter, and what happens after, so answering a cancellation is one screen instead of a dialog. Status, price, trip and lead move to the right rail; the payment timeline becomes the v2.5 merged history (payments, emails, changes) with filter chips; travellers show whose details are in. Switch the preview state to see a lapsed hold and a refund.' }] });
  TS.register({ id: 'enquiries', label: 'Enquiries', group: 'Admin redesign', admin: true,
    variants: [{ id: 'A', name: 'Redesign', tradeoff: '', render: renderEnq, mount: mountEnq,
      note: 'Today the inbox is a table with an <b>Open</b> link per row, and reply, notes and status live on a separate page. The redesign keeps the status tabs and filters but opens the enquiry in a panel beside the list: what they sent, one-click status, the reply with an itinerary attached, notes and related enquiries, plus the v2.5 <b>Convert to booking</b>. New enquiries show how long they have waited and sort longest-waiting first, so the first call goes to whoever has waited longest.' }] });
})();
