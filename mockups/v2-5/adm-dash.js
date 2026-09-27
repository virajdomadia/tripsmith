/* Admin redesign · round 3 interiors: Dashboard B/C/D and Enquiries B/C/D.
   The shell stays style A (Ink rail); only the page inside changes. Loads after admin-ops.js and copies the
   data it needs (same refs, names, amounts). "Now" is Sun 27 Sep 2026, 4:20 pm IST. */
(() => {
  const TS = window.TS;
  const { inr, lakh, esc, ICON, PKGS } = TS;

  /* ---------- helpers ---------- */
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const wd = ([m, d]) => WD[new Date(Date.UTC(2026, m - 1, d)).getUTCDay()];
  const dt = (x) => `${wd(x)} ${x[1]} ${MON[x[0] - 1]}`;
  const addDays = ([m, d], n) => { const x = new Date(Date.UTC(2026, m - 1, d + n)); return [x.getUTCMonth() + 1, x.getUTCDate()]; };
  const dayNo = ([m, d]) => Math.round((Date.UTC(2026, m - 1, d) - Date.UTC(2026, 8, 27)) / 864e5);
  const party = (a, c = 0) => `${a} ${a === 1 ? 'adult' : 'adults'}${c ? `, ${c} ${c === 1 ? 'child' : 'children'}` : ''}`;
  const first = (n) => n.split(' ')[0];
  const V25 = '<span class="a-chip ad-v25" title="New in v2.5">v2.5</span>';
  const HUES = ['#1B4FD8', '#B0501C', '#1F7A4D', '#6B3FA0', '#0E7490', '#9D174D'];
  const hue = (n) => HUES[[...n].reduce((s, c) => s + c.charCodeAt(0), 0) % HUES.length];
  const ini = (n) => n.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('');
  const cav = (n, s = 34) => `<span class="ad-av" style="--s:${s}px;--h:${hue(n)}" aria-hidden="true">${ini(n)}</span>`;
  const hm = (min) => { const h = Math.floor(min / 60), m = min % 60; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };
  const NOW = 16 * 60 + 20;
  const TODAY = [9, 27];

  /* ---------- seed copied from admin-ops.js ---------- */
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
  };
  const left = (x) => x.seats - x.booked - x.held;
  const B = (ref, lead, ph, pkg, dep, a, c, total, paid, st, o = {}) => ({ ref, lead, ph, pkg, dep, a, c, total, paid, st, hold: '', refund: false, creq: false, ch: 'Web', due: null, miss: 0, agreed: 0, ...o });
  const BOOKINGS = [
    B('TB-3SK7DF', 'Sameer Khan', '99205 61840', 'munnar', [10, 18], 1, 0, 21999, 0, 'pending', { hold: '4:47 pm' }),
    B('TB-6GH1RP', 'Pooja Nair', '98470 22519', 'kasol', [10, 2], 2, 0, 10998, 0, 'pending', { hold: '4:41 pm' }),
    B('TB-4HX8RD', 'Arjun Mehta', '98201 44731', 'leh', [10, 11], 2, 0, 65998, 0, 'pending', { hold: '4:32 pm' }),
    B('TB-8RT2KS', 'Vikram Singh Rathore', '94140 58213', 'shimla', [10, 4], 2, 0, 36998, 0, 'pending'),
    B('TB-9QW3LT', 'Sneha Kulkarni', '97690 13382', 'goa', [10, 9], 4, 0, 57996, 57996, 'cancelled', { refund: true }),
    B('TB-7K2M9Q', 'Kavya Iyer', '98450 22110', 'munnar', [10, 18], 2, 1, 59397, 59397, 'confirmed', { creq: true }),
    B('TB-2MV6PA', 'Rohan Deshpande', '90040 88215', 'kasol', [10, 2], 3, 0, 16497, 16497, 'confirmed', { miss: 2 }),
    B('TB-4WS6GE', 'Nikhil Joshi', '98860 27403', 'manali', [10, 31], 3, 1, 72146, 18037, 'partially_paid', { ch: 'Walk-in', due: [10, 1], miss: 4 }),
    B('TB-8LM3QJ', 'Tanvi Shah', '99870 41265', 'goa', [11, 1], 2, 0, 28998, 7250, 'partially_paid', { ch: 'WhatsApp', due: [10, 2] }),
    B('TB-6JN4ZC', 'Farhan Qureshi', '98191 55670', 'jaipur', [10, 30], 2, 0, 55998, 14000, 'partially_paid', { ch: 'Phone', due: [9, 30], miss: 1 }),
    B('TB-5DC9MU', 'Meenakshi Pillai', '94472 30918', 'munnar', [10, 18], 2, 0, 39598, 39598, 'confirmed', { ch: 'Enquiry', miss: 2 }),
    B('TB-2KQ8VX', 'Ishita Chawla', '98110 70246', 'jaipur', [10, 23], 2, 0, 55998, 55998, 'cancelled', { refund: true, agreed: 55998 }),
    B('TB-3PL7YB', 'Ananya Bose', '98300 42178', 'manali', [10, 16], 2, 0, 38998, 38998, 'confirmed'),
    B('TB-9VC4KA', 'Karan Malhotra', '98115 60392', 'leh', [10, 11], 2, 0, 65998, 65998, 'confirmed'),
  ];
  const owed = (b) => b.total - b.paid;
  const bChip = (b) => {
    if (b.creq) return '<span class="a-chip warn">Cancel requested</span>';
    if (b.refund) return '<span class="a-chip bad">Refund needed</span>';
    if (b.st === 'pending') return b.hold ? `<span class="a-chip warn">${ICON.clock}Held till ${b.hold}</span>` : '<span class="a-chip mute">Hold lapsed · unpaid</span>';
    if (b.st === 'partially_paid') return '<span class="a-chip info">Part paid</span>';
    return `<span class="a-chip ok">${ICON.check}Confirmed</span>`;
  };

  const TYPES = { standard: 'Standard', custom: 'Customise', contact: 'Contact', callback: 'Callback request', group: 'Group enquiry', chat: 'From concierge' };
  const ESTATUS = { new: ['pri', 'New'], contacted: ['warn', 'Contacted'], converted: ['ok', 'Converted'], closed: ['mute', 'Closed'] };
  const eChip = (s) => `<span class="a-chip ${ESTATUS[s][0]}">${ESTATUS[s][1]}</span>`;
  const E = (ref, name, ph, em, pkg, type, month, a, c, status, recv, at, o = {}) => ({ ref, name, ph, em, pkg, type, month, a, c, status, recv, at, wait: 0, budget: 0, dates: '', changes: '', msg: '', device: 'Mobile · Chrome on Android', notes: [], out: [], booking: '', fu: '', ...o });
  const ENQ = [
    E('TS-9P2LXA', 'Ritika Sharma', '98111 20457', 'ritika.sharma@customer.in', 'leh', 'callback', 'Jun 2027', 2, 0, 'new', '6 h ago', '10:20 am', { wait: 360, msg: 'Please call after 6 pm. We want to know how the oxygen on board works and whether my mother (62) should do Khardung La.' }),
    E('TS-4MW8TE', 'Devansh Agarwal', '99300 71842', 'devansh@customer.in', 'jaipur', 'group', 'Dec 2026', 14, 0, 'new', '3 h ago', '1:20 pm', { wait: 180, dates: '11–16 Dec', budget: 30000, msg: 'Company offsite for 14. Need one coach for the whole trip, a conference room in Udaipur for half a day, and a GST invoice.', device: 'Desktop · Chrome on Windows' }),
    E('TS-7F3K2Q', 'Neha Kapoor', '98450 66120', 'neha.kapoor@customer.in', 'munnar', 'custom', 'Nov 2026', 2, 1, 'new', '48 min ago', '3:32 pm', { wait: 48, budget: 30000, dates: 'Around 14–19 Nov', changes: 'Two nights on the houseboat instead of one, and a Kochi city day at the end before our flight home.', msg: 'Our daughter is 6. Is the houseboat safe for her, and can we get a vegetarian cook on board?' }),
    E('TS-2HD6RB', 'Suresh Venkataraman', '94440 18273', 'suresh.v@customer.in', 'shimla', 'chat', 'Dec 2026', 2, 2, 'new', '21 min ago', '3:59 pm', { wait: 21, msg: 'Handed over by the concierge: wants snow almost certain in the last week of December and asked about heated rooms in Manali.' }),
    E('TS-8QK3NV', 'Aisha Khan', '98670 30491', 'aisha.khan@customer.in', 'goa', 'standard', 'Nov 2026', 2, 0, 'new', '12 min ago', '4:08 pm', { wait: 12, dates: '20–23 Nov', device: 'Mobile · Safari on iPhone' }),
    E('TS-5JT9WC', 'Manoj Tiwari', '98390 55104', 'manoj.tiwari@customer.in', 'manali', 'standard', 'Oct 2026', 3, 0, 'contacted', 'Yesterday', 'Sat 26 Sep, 9:15 am', { fu: 'Mon 28 Sep', notes: [['Sat 26 Sep, 11:44 am', 'Called. Wants the Kheerganga trek included; sending a revised quote with a porter.']] }),
    E('TS-6RB2YH', 'Lakshmi Narayanan', '94430 27719', 'lakshmi.n@customer.in', '', 'contact', '', 2, 0, 'contacted', '2 days ago', 'Fri 25 Sep, 2:40 pm', { msg: 'Do you run Kerala trips in the monsoon, or only from September?', out: [['Fri 25 Sep, 5:10 pm', 'Hi Lakshmi, we run Munnar & Alleppey every week from October to March. The monsoon months are lovely but the houseboats run a shorter loop, so we start in October. The October dates are on the package page.']] }),
    E('TS-3ZC7MP', 'Gaurav Bhatia', '98180 44926', 'gaurav.bhatia@customer.in', 'leh', 'custom', 'Jul 2027', 4, 0, 'contacted', '3 days ago', 'Thu 24 Sep, 11:05 am', { fu: 'Thu 1 Oct', changes: 'Add Tso Moriri and one extra night in Leh to acclimatise.', out: [['Thu 24 Sep, 3:02 pm', 'Hi Gaurav, the Tso Moriri add-on is 2 nights with a camp by the lake, plus the extra night in Leh. The revised quote for 4 is attached. Happy to talk it through.']], notes: [['Thu 24 Sep, 3:04 pm', 'Sent the Tso Moriri add-on quote. Follow up on 1 Oct.']] }),
    E('TS-2TQ8LU', 'Sana Mirza', '99200 81736', 'sana.mirza@customer.in', 'goa', 'group', 'Jan 2027', 9, 0, 'contacted', '4 days ago', 'Wed 23 Sep, 8:12 pm', { msg: 'Bachelorette trip for 9. Can we have the whole floor at the hotel?', out: [['Wed 23 Sep, 9:30 pm', 'Hi Sana, a whole floor at Acron Waterfront is possible for 9 in January. Which dates are you looking at?']], reply: ['Thu 24 Sep, 10:02 am', '16 to 19 January. Can you hold the floor for us? We will pay a deposit this week.'] }),
    E('TS-1XN4GS', 'Meenakshi Pillai', '94472 30918', 'meenakshi.pillai@customer.in', 'munnar', 'standard', 'Oct 2026', 2, 0, 'converted', '12 Sep', 'Sat 12 Sep, 7:48 pm', { booking: 'TB-5DC9MU', notes: [['Sat 19 Sep, 10:05 am', 'Booked 18 Oct with FESTIVE10.']] }),
    E('TS-9WE5KD', 'Pranav Hegde', '99800 16453', 'pranav.hegde@customer.in', 'kasol', 'standard', 'Oct 2026', 4, 0, 'closed', '15 Sep', 'Tue 15 Sep, 6:30 pm', { notes: [['Wed 16 Sep, 12:30 pm', 'Chose a self-drive trip instead. Closed.']] }),
    E('TS-6YH3BF', 'Harpreet Kaur', '98723 90114', 'harpreet.kaur@customer.in', 'kasol', 'callback', 'Sep 2026', 2, 0, 'converted', '2 Sep', 'Wed 2 Sep, 11:10 am', { booking: 'TB-1ZF5WE' }),
  ];
  const eBy = (r) => ENQ.find((e) => e.ref === r);
  const waitWord = (e) => (e.status !== 'new' ? '' : `Waiting ${e.wait >= 60 ? `${Math.round(e.wait / 60)} h` : `${e.wait} min`}`);
  const waitTone = (e) => (e.wait >= 180 ? 'bad' : e.wait >= 45 ? 'warn' : 'mute');
  const estValue = (e) => (e.pkg ? PKGS[e.pkg].from * (e.a + e.c) : 0);

  /* ---------- shared CSS ---------- */
  const css = `
  .ad-v25 { font-size: 10px; letter-spacing: .06em; padding: 1px 6px; background: transparent !important; color: var(--pri) !important; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--pri) 45%, transparent); vertical-align: middle; }
  .ad { display: grid; gap: 16px; min-width: 0; }
  .ad .mono { font-family: ui-monospace, "SF Mono", Consolas, monospace; font-size: 12px; letter-spacing: .02em; }
  .ad .muted { color: var(--mute); }
  .ad .lnk { color: var(--pri); font: inherit; font-weight: 700; text-decoration: none; background: none; border: 0; padding: 0; cursor: pointer; }
  .ad .lnk:hover { text-decoration: underline; }
  .ad-av { width: var(--s); height: var(--s); border-radius: 50%; display: inline-grid; place-items: center; flex: none; background: color-mix(in srgb, var(--h) 14%, #fff); color: var(--h); font: 800 calc(var(--s) * .36)/1 "DM Sans", sans-serif; }
  .ad-eyebrow { font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--mute); margin: 0; }
  .ad button { font-family: "DM Sans", sans-serif; }
  .ad :focus-visible { outline: 2px solid var(--pri); outline-offset: 2px; }
  .ad-fade { animation: ad-in .35s var(--ease) both; }
  @keyframes ad-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .ad-fade, .ad * { animation: none !important; transition: none !important; } }

  /* ===== Dashboard B · Week planner ===== */
  .ad-db-strip { display: grid; grid-template-columns: repeat(8, minmax(92px, 1fr)); gap: 8px; overflow-x: auto; padding-bottom: 2px; scroll-snap-type: x mandatory; }
  .ad-db-day { scroll-snap-align: start; text-align: left; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 14px; padding: 10px 12px; cursor: pointer; display: grid; gap: 2px; color: var(--ink); transition: transform .2s var(--ease); }
  .ad-db-day:hover { transform: translateY(-2px); }
  .ad-db-day .w { font-size: 11.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--mute); }
  .ad-db-day .n { font-size: 24px; font-weight: 800; letter-spacing: -.03em; font-variant-numeric: tabular-nums; line-height: 1.1; }
  .ad-db-day .c { font-size: 12px; font-weight: 700; color: var(--mute); }
  .ad-db-day .tags { display: flex; gap: 4px; flex-wrap: wrap; min-height: 18px; margin-top: 2px; }
  .ad-db-day .tags span { font-size: 10.5px; font-weight: 800; border-radius: 6px; padding: 1px 5px; background: var(--bg2); color: var(--ink2); white-space: nowrap; }
  .ad-db-day .tags .dep { background: var(--pri-soft); color: var(--pri-ink); }
  .ad-db-day .tags .money { background: var(--ok-soft); color: var(--ok); }
  .ad-db-day[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: #fff; }
  .ad-db-day[aria-pressed="true"] .w, .ad-db-day[aria-pressed="true"] .c { color: var(--ink-soft); }
  .ad-db-grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; align-items: start; }
  .ad-db-agenda { background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); }
  .ad-db-ah { display: flex; align-items: center; gap: 10px 14px; flex-wrap: wrap; padding: 16px var(--a-pad) 12px; border-bottom: 1px solid var(--a-line); }
  .ad-db-ah h2 { font-size: 19px; letter-spacing: -.02em; margin: 0; }
  .ad-db-ah .prog { font-size: 12.5px; font-weight: 700; color: var(--mute); display: flex; align-items: center; gap: 8px; }
  .ad-db-ah .prog .a-meter { width: 90px; height: 6px; }
  .ad-db-ah .a-seg { margin-left: auto; }
  .ad-db-sec { padding: 6px var(--a-pad) 4px; }
  .ad-db-sec + .ad-db-sec { border-top: 1px dashed var(--a-line); }
  .ad-db-sec > .ad-eyebrow { padding: 10px 0 4px; }
  .ad-db-it { display: grid; grid-template-columns: 70px 26px minmax(0, 1fr) auto; gap: 4px 12px; align-items: start; padding: 10px 0; }
  .ad-db-it + .ad-db-it { border-top: 1px solid var(--a-line); }
  .ad-db-it .tm { font-size: 12.5px; font-weight: 800; color: var(--ink2); font-variant-numeric: tabular-nums; padding-top: 3px; }
  .ad-db-it .tm small { display: block; font-weight: 600; color: var(--mute); font-size: 11px; }
  .ad-db-ck { width: 22px; height: 22px; border-radius: 7px; border: 1.5px solid var(--a-line); background: var(--a-surf); display: grid; place-items: center; cursor: pointer; padding: 0; color: transparent; margin-top: 1px; }
  .ad-db-ck .ic { width: 14px; height: 14px; }
  .ad-db-ck[aria-pressed="true"] { background: var(--ok); border-color: var(--ok); color: #fff; }
  .ad-db-ck.auto { border-style: dashed; cursor: default; color: var(--ok); }
  .ad-db-it .bd b { font-size: 14.5px; display: block; }
  .ad-db-it .bd small { display: block; color: var(--mute); font-size: 12.5px; margin-top: 1px; }
  .ad-db-it .bd .chips { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
  .ad-db-it .rt { display: grid; justify-items: end; gap: 6px; }
  .ad-db-it .amt { font-weight: 800; font-variant-numeric: tabular-nums; font-size: 14px; }
  .ad-db-it .amt.out { color: #B42318; }
  .ad-db-it.done .bd b { text-decoration: line-through; color: var(--mute); }
  .ad-db-it.done .rt .a-btn { display: none; }
  .ad-db-now { display: grid; grid-template-columns: 70px minmax(0, 1fr); gap: 12px; align-items: center; padding: 4px 0; font-size: 11.5px; font-weight: 800; color: #B42318; letter-spacing: .04em; }
  .ad-db-now i { height: 2px; background: #B42318; border-radius: 2px; position: relative; }
  .ad-db-now i::before { content: ""; position: absolute; left: -4px; top: -3px; width: 8px; height: 8px; border-radius: 50%; background: #B42318; }
  .ad-db-rail { display: grid; gap: 14px; }
  .ad-db-sum { display: grid; gap: 0; }
  .ad-db-sum > div { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding: 9px 0; border-top: 1px solid var(--a-line); font-size: 13.5px; }
  .ad-db-sum > div:first-child { border-top: 0; padding-top: 0; }
  .ad-db-sum b { font-variant-numeric: tabular-nums; font-size: 15px; }
  .ad-db-sum small { display: block; color: var(--mute); font-size: 12px; }
  .ad-db-add { display: grid; gap: 8px; }
  .ad-db-add .row { display: flex; gap: 6px; }
  .ad-db-add .row select { flex: none; }
  .ad-db-add .row input { flex: 1 1 0; min-width: 0; width: 0; }
  .ad-db-add, .ad-db-add .row { min-width: 0; }
  .ad-db-empty { padding: 26px 0; text-align: center; color: var(--mute); font-size: 13.5px; }

  /* ===== Dashboard C · Money desk ===== */
  .ad-dc-eq { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); overflow: hidden; }
  .ad-dc-eq > div { padding: 16px 18px; display: grid; gap: 2px; position: relative; }
  .ad-dc-eq > div + div { border-left: 1px solid var(--a-line); }
  .ad-dc-eq > div + div::before { position: absolute; left: -12px; top: 50%; transform: translateY(-50%); width: 22px; height: 22px; border-radius: 50%; background: var(--a-surf); border: 1px solid var(--a-line); display: grid; place-items: center; font-weight: 800; font-size: 14px; color: var(--mute); z-index: 1; }
  .ad-dc-eq > div:nth-child(2)::before { content: "−"; } .ad-dc-eq > div:nth-child(3)::before { content: "+"; } .ad-dc-eq > div:nth-child(4)::before { content: "="; }
  .ad-dc-eq .k { font-size: 12px; font-weight: 700; color: var(--mute); }
  .ad-dc-eq .v { font-size: 28px; font-weight: 800; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
  .ad-dc-eq .d { font-size: 12.5px; color: var(--mute); font-weight: 600; }
  .ad-dc-eq .out .v { color: #B42318; } .ad-dc-eq .in .v { color: var(--ok); }
  .ad-dc-eq .res { background: var(--ink); color: #fff; } .ad-dc-eq .res .k, .ad-dc-eq .res .d { color: var(--ink-soft); }
  .ad-dc-chart { padding: 6px var(--a-pad) var(--a-pad); }
  .ad-dc-scroll { overflow-x: auto; }
  .ad-dc-bars { display: grid; grid-template-columns: repeat(var(--n), minmax(14px, 1fr)); gap: 3px; min-width: 640px; position: relative; }
  .ad-dc-col { display: grid; grid-template-rows: 150px 1px 56px 18px; cursor: pointer; background: none; border: 0; padding: 0; border-radius: 6px; }
  .ad-dc-col:hover .up i, .ad-dc-col:hover .dn i { opacity: .8; }
  .ad-dc-col .up, .ad-dc-col .dn { display: flex; flex-direction: column; justify-content: flex-end; align-items: stretch; gap: 1px; }
  .ad-dc-col .dn { justify-content: flex-start; }
  .ad-dc-col .axis { background: var(--ink); opacity: .35; }
  .ad-dc-col i { display: block; border-radius: 3px 3px 0 0; background: var(--pri); min-height: 0; transition: opacity .2s; }
  .ad-dc-col i.exp { background: repeating-linear-gradient(135deg, var(--ok) 0 2px, var(--ok-soft) 2px 5px); border: 1px solid var(--ok); }
  .ad-dc-col i.hold { background: repeating-linear-gradient(135deg, var(--act) 0 2px, #FFF4E2 2px 5px); border: 1px solid var(--act-ink); }
  .ad-dc-col .dn i { border-radius: 0 0 3px 3px; background: #D9534A; }
  .ad-dc-col .dn i.owe { background: repeating-linear-gradient(135deg, #B42318 0 2px, #FDECEA 2px 5px); border: 1px solid #B42318; }
  .ad-dc-col .lb { font-size: 10px; font-weight: 700; color: var(--mute); text-align: center; font-variant-numeric: tabular-nums; padding-top: 4px; }
  .ad-dc-col.today .lb { color: #fff; background: #B42318; border-radius: 4px; }
  .ad-dc-col[aria-pressed="true"] { background: var(--pri-soft); }
  .ad-dc-col.fut .up { opacity: 1; }
  .ad-dc-leg { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--mute); font-weight: 600; }
  .ad-dc-leg i { display: inline-block; width: 11px; height: 11px; border-radius: 3px; vertical-align: -1px; margin-right: 5px; background: var(--pri); }
  .ad-dc-leg i.exp { background: repeating-linear-gradient(135deg, var(--ok) 0 2px, var(--ok-soft) 2px 5px); border: 1px solid var(--ok); }
  .ad-dc-leg i.hold { background: repeating-linear-gradient(135deg, var(--act) 0 2px, #FFF4E2 2px 5px); border: 1px solid var(--act-ink); }
  .ad-dc-leg i.out { background: #D9534A; } .ad-dc-leg i.owe { background: repeating-linear-gradient(135deg, #B42318 0 2px, #FDECEA 2px 5px); border: 1px solid #B42318; }
  .ad-dc-day { margin-top: 12px; background: var(--bg2); border-radius: 12px; padding: 12px 14px; display: grid; gap: 6px; font-size: 13.5px; }
  .ad-dc-day h3 { font-size: 14px; margin: 0; display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .ad-dc-day .ln { display: flex; justify-content: space-between; gap: 12px; }
  .ad-dc-day .ln .num { font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ad-dc-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; align-items: start; }
  .ad-dc-list { display: grid; }
  .ad-dc-list > div { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 10px; padding: 11px 0; border-top: 1px solid var(--a-line); font-size: 13.5px; align-items: center; }
  .ad-dc-list > div:first-child { border-top: 0; padding-top: 0; }
  .ad-dc-list b { font-weight: 700; } .ad-dc-list small { color: var(--mute); font-size: 12px; display: block; }
  .ad-dc-list .num { font-weight: 800; font-variant-numeric: tabular-nums; text-align: right; }
  .ad-dc-list .acts { grid-column: 1 / -1; display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
  .ad-dc-list .done { color: var(--ok); font-weight: 700; font-size: 12.5px; display: inline-flex; gap: 4px; align-items: center; }
  .ad-dc-list .done .ic { width: 14px; height: 14px; }
  .ad-dc-foot { display: flex; justify-content: space-between; font-weight: 800; border-top: 2px solid var(--ink); padding-top: 10px; margin-top: 6px; font-variant-numeric: tabular-nums; }
  .ad-dc-ch { display: flex; height: 14px; border-radius: 99px; overflow: hidden; gap: 2px; }
  .ad-dc-ch i { display: block; }
  .ad-dc-chl { display: flex; gap: 6px 16px; flex-wrap: wrap; font-size: 12.5px; margin-top: 10px; }
  .ad-dc-chl span i { display: inline-block; width: 9px; height: 9px; border-radius: 3px; margin-right: 6px; }
  .ad-dc-chl b { font-variant-numeric: tabular-nums; margin-left: 4px; }
  .ad-dc-tog { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; cursor: pointer; }
  .ad-dc-tog input { width: 16px; height: 16px; accent-color: var(--pri); }

  /* ===== Dashboard D · Departure board ===== */
  .ad-dd-ruler { background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); padding: 14px var(--a-pad) 10px; }
  .ad-dd-track { position: relative; height: 62px; min-width: 620px; }
  .ad-dd-scroll { overflow-x: auto; }
  .ad-dd-track::before { content: ""; position: absolute; left: 0; right: 0; top: 26px; height: 2px; background: var(--a-line); }
  .ad-dd-tick { position: absolute; top: 20px; font-size: 10.5px; font-weight: 700; color: var(--mute); transform: translateX(-50%); padding-top: 24px; white-space: nowrap; }
  .ad-dd-tick::before { content: ""; position: absolute; left: 50%; top: 0; width: 1px; height: 14px; background: var(--a-line); }
  .ad-dd-tick.now { color: #B42318; } .ad-dd-tick.now::before { background: #B42318; width: 2px; }
  .ad-dd-pin { position: absolute; top: 10px; transform: translateX(-50%); border: 0; background: none; padding: 0; cursor: pointer; display: grid; justify-items: center; }
  .ad-dd-pin span { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-size: 10.5px; font-weight: 800; color: var(--ink); background: var(--a-surf); border: 2px solid var(--pri); transition: transform .2s var(--ease); }
  .ad-dd-pin.warn span { border-color: var(--act-ink); background: #FFF4E2; }
  .ad-dd-pin[aria-pressed="true"] span { background: var(--pri); color: #fff; transform: scale(1.12); }
  .ad-dd-pin:hover span { transform: scale(1.12); }
  .ad-dd-off { display: flex; gap: 8px 18px; flex-wrap: wrap; align-items: center; font-size: 13px; color: var(--ink2); padding: 4px 2px; }
  .ad-dd-off b { font-variant-numeric: tabular-nums; }
  .ad-dd-off a { color: var(--pri); font-weight: 700; text-decoration: none; }
  .ad-dd-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
  .ad-dd-card { background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); overflow: hidden; display: grid; grid-template-rows: auto 1fr; cursor: pointer; text-align: left; padding: 0; color: var(--ink); font: inherit; transition: transform .25s var(--ease), box-shadow .25s; }
  .ad-dd-card:hover { transform: translateY(-3px); box-shadow: 0 14px 30px -18px rgba(20,32,42,.35); }
  .ad-dd-card[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--pri), 0 14px 30px -18px rgba(27,79,216,.45); }
  .ad-dd-ph { position: relative; height: 118px; overflow: hidden; }
  .ad-dd-ph img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .ad-dd-ph::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(10,18,26,.05) 30%, rgba(10,18,26,.72)); }
  .ad-dd-ph .when { position: absolute; left: 12px; bottom: 10px; z-index: 1; color: #fff; display: grid; line-height: 1.15; }
  .ad-dd-ph .when b { font-size: 20px; letter-spacing: -.02em; }
  .ad-dd-ph .when small { font-size: 12px; font-weight: 700; opacity: .9; }
  .ad-dd-ph .cd { position: absolute; right: 10px; top: 10px; z-index: 1; background: rgba(255,255,255,.94); color: var(--ink); font-size: 11.5px; font-weight: 800; border-radius: 999px; padding: 3px 9px; }
  .ad-dd-body { padding: 12px 14px 14px; display: grid; gap: 10px; align-content: start; }
  .ad-dd-body h3 { margin: 0; font-size: 15.5px; letter-spacing: -.01em; display: flex; justify-content: space-between; gap: 8px; align-items: center; }
  .ad-dd-seat { display: grid; gap: 5px; }
  .ad-dd-seat .row { display: flex; justify-content: space-between; font-size: 12.5px; font-weight: 700; color: var(--ink2); }
  .ad-dd-checks { list-style: none; margin: 0; padding: 0; display: grid; gap: 5px; font-size: 12.5px; }
  .ad-dd-checks li { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 6px; align-items: start; }
  .ad-dd-checks .ic { width: 16px; height: 16px; margin-top: 1px; }
  .ad-dd-checks .ok { color: var(--ok); } .ad-dd-checks .no { color: var(--warn); } .ad-dd-checks .bad { color: #B42318; }
  .ad-dd-checks li span b { font-weight: 700; color: var(--ink); }
  .ad-dd-sheet .a-card-h .ad-av, .ad-dd-sheet .a-card-h .ts-av { box-shadow: none; }
  .ad-dd-lead { display: flex; align-items: center; gap: 10px; font-size: 13px; }
  .ad-dd-lead b { display: block; font-size: 13.5px; }
  .ad-dd-acts { display: flex; gap: 6px; flex-wrap: wrap; padding: 0 var(--a-pad) 14px; }
  .ad-dd-sheet .a-table td .a-btn { white-space: nowrap; }

  /* container tweaks */
  @container site (max-width: 1100px) {
    .ad-dd-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .ad-dc-3 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @container site (max-width: 700px) {
    .ad-db-strip { grid-template-columns: repeat(8, 84px); }
    .ad-db-grid { grid-template-columns: 1fr; }
    .ad-db-it { grid-template-columns: 26px minmax(0, 1fr); }
    .ad-db-it .tm { grid-column: 2; grid-row: 1; padding: 0; }
    .ad-db-it .tm small { display: inline; margin-left: 6px; }
    .ad-db-it .ad-db-ck { grid-row: 1 / span 2; grid-column: 1; }
    .ad-db-it .bd { grid-column: 2; }
    .ad-db-it .rt { grid-column: 2; justify-items: start; grid-auto-flow: column; align-items: center; }
    .ad-db-now { grid-template-columns: auto minmax(0, 1fr); }
    .ad-db-ah .a-seg { margin-left: 0; }
    .ad-dc-eq { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .ad-dc-eq > div:nth-child(3) { border-left: 0; border-top: 1px solid var(--a-line); }
    .ad-dc-eq > div:nth-child(4) { border-top: 1px solid var(--a-line); }
    .ad-dc-eq > div::before { display: none; }
    .ad-dc-eq .v { font-size: 21px; } .ad-dc-eq > div { padding: 12px 14px; }
    .ad-dc-3 { grid-template-columns: 1fr; }
    .ad-dd-cards { grid-template-columns: repeat(6, 78%); overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 6px; }
    .ad-dd-card { scroll-snap-align: start; }
    .ad-dd-card:hover { transform: none; }
    .ad-dd-sheet .hs { display: none; }
  }`;

  /* =====================================================================
     DASHBOARD B · Week planner
     ===================================================================== */
  const KIND = {
    dep: ['pri', 'Departure', 'trips'], lock: ['mute', 'Details lock', 'trips'], hold: ['warn', 'Hold ends', 'money'],
    bal: ['info', 'Balance due', 'money'], refund: ['bad', 'Refund to record', 'money'], grace: ['bad', 'Grace ends', 'money'],
    auto: ['ok', 'Sent automatically', 'money'], req: ['warn', 'Cancel request', 'people'], call: ['pri', 'Call', 'people'],
    reply: ['pri', 'Reply', 'people'], task: ['mute', 'Task', 'people'],
  };
  let pid = 0;
  const P = (day, min, kind, t, s, o = {}) => ({ id: 'p' + (++pid), day, min, kind, t, s, amt: 0, act: '', ...o });
  const PLAN = [
    P([9, 27], -1, 'req', 'Answer Kavya Iyer’s cancellation request', 'TB-7K2M9Q · Munnar & Alleppey, Sun 18 Oct · 22 days out, the policy keeps 50% · asked yesterday, 7:42 pm', { act: 'Review' }),
    P([9, 27], -1, 'refund', 'Record Sneha Kulkarni’s refund', 'TB-9QW3LT · paid after the hold lapsed and North Goa sold out', { amt: -57996, act: 'Refund made' }),
    P([9, 27], -1, 'refund', 'Record Ishita Chawla’s refund', 'TB-2KQ8VX · agreed when you approved the cancellation on 22 Sep', { amt: -55998, act: 'Refund made' }),
    P([9, 27], -1, 'call', 'Call Devansh Agarwal · group of 14', 'TS-4MW8TE · Jaipur · Jodhpur · Udaipur, Dec 2026 · waiting 3 h', { act: 'Call' }),
    P([9, 27], -1, 'reply', 'Reply to Neha Kapoor', 'TS-7F3K2Q · Munnar, custom · is the houseboat safe for a 6-year-old · waiting 48 min', { act: 'Reply' }),
    P([9, 27], 540, 'auto', 'Balance reminder sent to Farhan Qureshi', `TB-6JN4ZC · ${inr(41998)} due Wed 30 Sep · 3 days before`, { auto: true }),
    P([9, 27], 992, 'hold', 'Arjun Mehta’s hold on 2 seats ends', `TB-4HX8RD · Leh, Sun 11 Oct · ${inr(65998)} at checkout · frees itself if unpaid`, { auto: true }),
    P([9, 27], 1001, 'hold', 'Pooja Nair’s hold on 2 seats ends', `TB-6GH1RP · Kasol, Fri 2 Oct · ${inr(10998)} at checkout`, { auto: true }),
    P([9, 27], 1007, 'hold', 'Sameer Khan’s hold on 1 seat ends', `TB-3SK7DF · Munnar, Sun 18 Oct · ${inr(21999)} at checkout`, { auto: true }),
    P([9, 27], 1080, 'call', 'Call Ritika Sharma · she asked for after 6 pm', 'TS-9P2LXA · Leh callback · how the oxygen on board works, and Khardung La for her mother (62)', { act: 'Call' }),
    P([9, 28], 540, 'auto', 'Balance reminder to Nikhil Joshi', `TB-4WS6GE · ${inr(54109)} due Thu 1 Oct · walk-in booking`, { auto: true }),
    P([9, 28], 660, 'task', 'Chase Rohan Deshpande’s 2 missing travellers', 'TB-2MV6PA · Kasol, Fri 2 Oct · details lock tomorrow night', { act: 'Send details link', v25: true }),
    P([9, 28], 1020, 'call', 'Follow up Manoj Tiwari with the Kheerganga quote', 'TS-5JT9WC · Manali · Kasol · Tosh, Oct 2026 · 3 adults · porter included', { act: 'Open' }),
    P([9, 29], 540, 'auto', 'Balance reminder to Tanvi Shah', `TB-8LM3QJ · ${inr(21748)} due Fri 2 Oct · booked on WhatsApp`, { auto: true }),
    P([9, 29], 1439, 'lock', 'Details lock for Kasol Riverside Weekend', 'Fri 2 Oct · 16 booked · 2 travellers still missing', { v25: true, auto: true }),
    P([9, 30], -1, 'bal', 'Farhan Qureshi’s balance is due', 'TB-6JN4ZC · Jaipur · Jodhpur · Udaipur, Fri 30 Oct · booked by phone', { amt: 41998, act: 'Mark paid', v25: true }),
    P([10, 1], -1, 'bal', 'Nikhil Joshi’s balance is due', 'TB-4WS6GE · Manali · Kasol · Tosh, Sat 31 Oct · walk-in', { amt: 54109, act: 'Mark paid', v25: true }),
    P([10, 1], 660, 'call', 'Follow up Gaurav Bhatia on Tso Moriri', 'TS-3ZC7MP · Leh, Jul 2027 · 4 adults · quote sent 24 Sep', { act: 'Call' }),
    P([10, 1], 1439, 'lock', 'Details lock for Shimla–Manali Classic', 'Sun 4 Oct · all 9 travellers in', { v25: true, auto: true }),
    P([10, 2], 360, 'dep', 'Kasol Riverside Weekend departs', 'Volvo from Delhi · 16 booked and 2 on hold of 20 · Tenzin Norbu leads', { act: 'Manifest' }),
    P([10, 2], -1, 'bal', 'Tanvi Shah’s balance is due', 'TB-8LM3QJ · North Goa Beaches, Sun 1 Nov · WhatsApp', { amt: 21748, act: 'Mark paid', v25: true }),
    P([10, 2], 1439, 'grace', 'Grace ends for Farhan Qureshi', `If ${inr(41998)} is still unpaid, TB-6JN4ZC cancels and 2 seats free`, { auto: true, v25: true }),
    P([10, 3], 960, 'task', 'Confirm the Chandigarh sedan for Shimla', 'Sun 4 Oct · 9 travellers · Meera Shekhawat leads', { act: 'Done' }),
    P([10, 3], 1439, 'grace', 'Grace ends for Nikhil Joshi', `If ${inr(54109)} is still unpaid, TB-4WS6GE cancels and 4 seats free`, { auto: true, v25: true }),
    P([10, 4], 420, 'dep', 'Shimla–Manali Classic departs', 'Private sedan from Chandigarh · 9 of 16 booked · Meera Shekhawat leads', { act: 'Manifest' }),
    P([10, 4], -1, 'task', 'Decide on Vikram Singh Rathore’s lapsed hold', `TB-8RT2KS · ${inr(36998)} unpaid · mark it paid if he paid at the office`, { act: 'Open' }),
    P([10, 4], 1439, 'grace', 'Grace ends for Tanvi Shah', `If ${inr(21748)} is still unpaid, TB-8LM3QJ cancels and 2 seats free`, { auto: true, v25: true }),
  ];
  const WEEK = Array.from({ length: 8 }, (_, i) => addDays(TODAY, i));
  const k = (x) => `${x[0]}-${x[1]}`;
  const db = { day: '9-27', f: 'all', done: new Set() };
  const dbOpen = (it) => !it.auto && !db.done.has(it.id);

  const dbItem = (it, today) => {
    const [tone, word] = KIND[it.kind];
    const past = today && it.min >= 0 && it.min < NOW;
    const done = db.done.has(it.id) || (it.auto && past) || (it.kind === 'auto' && today);
    return `<div class="ad-db-it ${done && !it.auto ? 'done' : ''}">
      <span class="tm">${it.min < 0 ? 'Any time' : it.min === 1439 ? 'Midnight' : hm(it.min)}${it.min >= 0 && it.min < 1439 && today ? `<small>${past ? 'earlier' : `in ${Math.floor((it.min - NOW) / 60) ? `${Math.floor((it.min - NOW) / 60)} h ` : ''}${(it.min - NOW) % 60} min`}</small>` : ''}</span>
      ${it.auto ? `<span class="ad-db-ck auto" title="Tripsmith does this">${done ? ICON.check : ''}</span>` : `<button class="ad-db-ck" data-dbx="${it.id}" aria-pressed="${done}" aria-label="Mark done: ${esc(it.t)}">${ICON.check}</button>`}
      <span class="bd"><b>${esc(it.t)}</b><small>${esc(it.s)}</small>
        <span class="chips"><span class="a-chip ${tone}">${word}</span>${it.auto ? '<span class="a-chip mute">Automatic</span>' : ''}${it.v25 ? V25 : ''}</span></span>
      <span class="rt">${it.amt ? `<span class="amt num ${it.amt < 0 ? 'out' : ''}">${it.amt < 0 ? '−' : '+'}${inr(Math.abs(it.amt))}</span>` : ''}${it.act && !done ? `<a href="#" class="a-btn sm ${it.kind === 'call' || it.kind === 'reply' ? '' : 'ghost'}">${it.kind === 'call' ? ICON.phone : ''}${it.act}</a>` : ''}</span></div>`;
  };

  const renderDashB = () => {
    const sel = WEEK.find((x) => k(x) === db.day) || TODAY;
    const isToday = k(sel) === k(TODAY);
    const items = PLAN.filter((it) => k(it.day) === db.day && (db.f === 'all' || KIND[it.kind][2] === db.f));
    const any = items.filter((it) => it.min < 0), timed = items.filter((it) => it.min >= 0).sort((a, b) => a.min - b.min);
    const mine = PLAN.filter((it) => k(it.day) === db.day && !it.auto);
    const doneN = mine.filter((it) => db.done.has(it.id)).length;
    let nowPut = !isToday;
    const timedHtml = timed.map((it) => {
      let pre = '';
      if (!nowPut && it.min > NOW) { nowPut = true; pre = '<div class="ad-db-now" aria-label="Now"><span>NOW 4:20 PM</span><i></i></div>'; }
      return pre + dbItem(it, isToday);
    }).join('') + (!nowPut ? '<div class="ad-db-now"><span>NOW 4:20 PM</span><i></i></div>' : '');
    const weekDue = PLAN.filter((it) => it.kind === 'bal').reduce((s, it) => s + it.amt, 0);
    const main = `<div class="ad ad-db ad-fade">
      <div class="a-head"><h1>Your week</h1>
        <div class="sub">Sunday 27 September, 4:20 pm · everything with a time on it for the next 8 days, in the order it happens</div>
        <div class="acts"><a href="#" class="a-btn ghost sm">${ICON.cal}Open calendar ${V25}</a><a href="#" class="a-btn sm act">${ICON.plus}New booking</a></div></div>
      <div class="ad-db-strip" role="group" aria-label="Pick a day">${WEEK.map((x, i) => {
        const its = PLAN.filter((it) => k(it.day) === k(x));
        const open = its.filter(dbOpen).length, dep = its.some((it) => it.kind === 'dep'), inAmt = its.filter((it) => it.amt > 0).reduce((s, it) => s + it.amt, 0);
        return `<button class="ad-db-day" data-dbd="${k(x)}" aria-pressed="${k(x) === db.day}"><span class="w">${i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : wd(x)}</span><span class="n">${x[1]} <small style="font-size:12px;font-weight:700">${MON[x[0] - 1]}</small></span>
          <span class="c">${open ? `${open} to do` : 'Nothing to do'}</span><span class="tags">${dep ? '<span class="dep">Departs</span>' : ''}${inAmt ? `<span class="money">+${lakh(inAmt)}</span>` : ''}</span></button>`;
      }).join('')}</div>
      <div class="ad-db-grid">
        <section class="ad-db-agenda" aria-labelledby="db-h">
          <div class="ad-db-ah"><h2 id="db-h">${isToday ? 'Today' : dt(sel)}</h2>
            <span class="prog">${mine.length ? `<span class="a-meter" style="--v:${(doneN / mine.length) * 100}%" aria-hidden="true"></span>${doneN} of ${mine.length} done` : 'Only automatic items'}</span>
            <div class="a-seg" role="group" aria-label="Show">${[['all', 'All'], ['money', 'Money'], ['people', 'People'], ['trips', 'Trips']].map(([v, l]) => `<button data-dbf="${v}" aria-pressed="${db.f === v}">${l}</button>`).join('')}</div></div>
          ${any.length ? `<div class="ad-db-sec"><p class="ad-eyebrow">${isToday ? 'Carried over · any time today' : 'Any time'}</p>${any.map((it) => dbItem(it, isToday)).join('')}</div>` : ''}
          ${timed.length || isToday ? `<div class="ad-db-sec"><p class="ad-eyebrow">By the clock</p>${timedHtml}</div>` : ''}
          ${!items.length ? '<div class="ad-db-empty">Nothing of this kind on this day.</div>' : ''}
        </section>
        <aside class="ad-db-rail">
          <section class="a-card"><div class="a-card-h"><h2>The 8 days at a glance</h2></div><div class="a-card-b"><div class="ad-db-sum">
            <div><span>Balances coming in ${V25}<small>3 part-paid bookings</small></span><b class="num" style="color:var(--ok)">+${inr(weekDue)}</b></div>
            <div><span>Refunds to record<small>Sneha Kulkarni, Ishita Chawla</small></span><b class="num" style="color:#B42318">−${inr(113994)}</b></div>
            <div><span>Departures<small>Kasol Fri 2 Oct · Shimla Sun 4 Oct</small></span><b class="num">25 travellers</b></div>
            <div><span>Holds ending today<small>3 checkouts open</small></span><b class="num">${inr(98995)}</b></div>
            <div><span>New enquiries waiting<small>oldest 6 h</small></span><b class="num">5</b></div></div></div></section>
          <section class="a-card"><div class="a-card-h"><h2>Add to ${isToday ? 'today' : dt(sel)}</h2></div><div class="a-card-b">
            <form class="ad-db-add" id="db-add"><div class="row"><select class="a-select" id="db-at" aria-label="Time"><option value="-1">Any time</option>${[600, 720, 900, 1020, 1140].map((m) => `<option value="${m}">${hm(m)}</option>`).join('')}</select>
              <input class="a-select" id="db-tx" placeholder="Call the Tosh homestay" aria-label="What to do" maxlength="80"></div>
              <button class="a-btn sm" style="justify-self:start">${ICON.plus}Add</button>
              <span class="muted" style="font-size:12px">Only you see these. Bookings, holds and balances appear here by themselves.</span></form></div></section>
        </aside>
      </div>
    </div>`;
    return TS.adminShell('Dashboard', main);
  };
  const mountDashB = (site, rerender) => {
    site.querySelectorAll('[data-dbd]').forEach((b) => b.addEventListener('click', () => { db.day = b.dataset.dbd; rerender(); }));
    site.querySelectorAll('[data-dbf]').forEach((b) => b.addEventListener('click', () => { db.f = b.dataset.dbf; rerender(); }));
    site.querySelectorAll('[data-dbx]').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.dbx; db.done.has(id) ? db.done.delete(id) : db.done.add(id); rerender(); }));
    const f = site.querySelector('#db-add');
    if (f) f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const tx = site.querySelector('#db-tx').value.trim(); if (!tx) { site.querySelector('#db-tx').focus(); return; }
      const [m, d] = db.day.split('-').map(Number);
      PLAN.push(P([m, d], Number(site.querySelector('#db-at').value), 'task', tx, 'Added by you', { act: '' }));
      db.f = 'all'; rerender();
    });
  };

  /* =====================================================================
     DASHBOARD C · Money desk
     ===================================================================== */
  const KNOWN = { 2: [['Karan Malhotra · TB-9VC4KA', 65998]], 8: [['Ananya Bose · TB-3PL7YB', 38998]], 10: [['Harpreet Kaur · TB-1ZF5WE', 10998]],
    12: [['Kavya Iyer · TB-7K2M9Q', 59397]], 19: [['Meenakshi Pillai · TB-5DC9MU', 39598]], 21: [['Farhan Qureshi · deposit', 14000], ['Nikhil Joshi · deposit', 18037]],
    22: [['Tanvi Shah · deposit', 7250]], 24: [['Rohan Deshpande · TB-2MV6PA', 16497]], 25: [['Sneha Kulkarni · TB-9QW3LT (to refund)', 57996]] };
  const FILL = { 1: 24996, 4: 32999, 5: 10998, 7: 43998, 9: 21999, 11: 18499, 14: 29998, 15: 36998, 16: 14499, 18: 27999, 20: 19499, 23: 21999, 26: 32999 };
  const COLLECTED = 684250;
  (() => { const known = Object.values(KNOWN).flat().reduce((s, x) => s + x[1], 0), fill = Object.values(FILL).reduce((s, x) => s + x, 0); FILL[27] = COLLECTED - known - fill; })();
  const REFUNDED = [[16, 'Priya Raman · cancelled 34 days out', 14499]];
  const DUE = [[[9, 30], 'Farhan Qureshi · TB-6JN4ZC', 41998, 'Phone'], [[10, 1], 'Nikhil Joshi · TB-4WS6GE', 54109, 'Walk-in'], [[10, 2], 'Tanvi Shah · TB-8LM3QJ', 21748, 'WhatsApp']];
  const HOLDS = [['Arjun Mehta · TB-4HX8RD', 65998, '4:32 pm', 'Leh 11 Oct'], ['Pooja Nair · TB-6GH1RP', 10998, '4:41 pm', 'Kasol 2 Oct'], ['Sameer Khan · TB-3SK7DF', 21999, '4:47 pm', 'Munnar 18 Oct']];
  const OWE = [{ id: 'sk', who: 'Sneha Kulkarni', ref: 'TB-9QW3LT', amt: 57996, why: 'Paid after the hold lapsed; North Goa sold out' }, { id: 'ic', who: 'Ishita Chawla', ref: 'TB-2KQ8VX', amt: 55998, why: 'Agreed when you approved the cancellation, 22 Sep' }];
  const dc = { sel: '9-27', holds: false, rec: new Set(), reminded: new Set() };
  const DAYS_C = Array.from({ length: 40 }, (_, i) => addDays([9, 1], i));
  const dayLines = (x) => {
    const L = [], day = x[1];
    if (x[0] === 9) {
      (KNOWN[day] || []).forEach(([l, a]) => L.push(['in', l, a]));
      if (FILL[day]) L.push(['in', `${Math.max(1, Math.round(FILL[day] / 16000))} other ${Math.round(FILL[day] / 16000) > 1 ? 'payments' : 'payment'} · web`, FILL[day]]);
      REFUNDED.filter((r) => r[0] === day).forEach(([, l, a]) => L.push(['out', `Refund recorded · ${l}`, -a]));
    }
    if (k(x) === '9-27') {
      OWE.forEach((o) => L.push([dc.rec.has(o.id) ? 'out' : 'owe', `${dc.rec.has(o.id) ? 'Refund recorded' : 'Refund to record'} · ${o.who}`, -o.amt]));
      if (dc.holds) HOLDS.forEach(([l, a, t]) => L.push(['hold', `Hold till ${t} · ${l}`, a]));
    }
    DUE.filter((d) => k(d[0]) === k(x)).forEach(([, l, a]) => L.push(['exp', `Balance due · ${l}`, a]));
    return L;
  };
  const renderDashC = () => {
    const toRecord = OWE.filter((o) => !dc.rec.has(o.id)).reduce((s, o) => s + o.amt, 0);
    const refunds = 14499 + 113994;
    const dueSum = DUE.reduce((s, d) => s + d[2], 0), holdSum = HOLDS.reduce((s, h) => s + h[1], 0);
    const expect = COLLECTED - refunds + dueSum + (dc.holds ? holdSum : 0);
    const MAXU = 120000, MAXD = 120000;
    const bars = DAYS_C.map((x) => {
      const L = dayLines(x), n = dayNo(x);
      const up = L.filter((l) => l[2] > 0), dn = L.filter((l) => l[2] < 0);
      return `<button class="ad-dc-col ${n === 0 ? 'today' : ''} ${n > 0 ? 'fut' : ''}" data-dcd="${k(x)}" aria-pressed="${dc.sel === k(x)}" aria-label="${dt(x)}: ${L.length ? L.map((l) => `${l[1]} ${inr(l[2])}`).join(', ') : 'nothing'}">
        <span class="up">${up.map((l) => `<i class="${l[0] === 'in' ? '' : l[0]}" style="height:${Math.max(2, (l[2] / MAXU) * 150)}px"></i>`).join('')}</span><span class="axis"></span>
        <span class="dn">${dn.map((l) => `<i class="${l[0] === 'owe' ? 'owe' : ''}" style="height:${Math.min(56, Math.max(2, (-l[2] / MAXD) * 56))}px"></i>`).join('')}</span>
        <span class="lb">${n === 0 ? 'Today' : x[1] === 1 || x[1] % 5 === 0 ? `${x[1]}${x[1] === 1 ? ' ' + MON[x[0] - 1] : ''}` : ''}</span></button>`;
    }).join('');
    const selX = DAYS_C.find((x) => k(x) === dc.sel) || TODAY, selL = dayLines(selX), selNet = selL.reduce((s, l) => s + l[2], 0);
    const CH = [['Web', 71, 'var(--pri)'], ['Enquiry', 9, 'var(--ok)'], ['Phone', 8, 'var(--act)'], ['Walk-in', 7, '#6B3FA0'], ['WhatsApp', 5, 'var(--wa)']];
    const main = `<div class="ad ad-dc ad-fade">
      <div class="a-head"><h1>Money</h1>
        <div class="sub">September so far, and what should land by Fri 2 Oct · amounts in rupees, IST</div>
        <div class="acts"><label class="ad-dc-tog"><input type="checkbox" id="dc-holds" ${dc.holds ? 'checked' : ''}>Count live holds as coming in</label><a href="#" class="a-btn ghost sm">${ICON.chart}Reports ${V25}</a></div></div>
      <div class="ad-dc-eq" aria-label="Cash equation">
        <div><span class="k">Collected in September</span><span class="v num">${lakh(COLLECTED)}</span><span class="d">${inr(COLLECTED)} · 52 payments</span></div>
        <div class="out"><span class="k">Refunds</span><span class="v num">${lakh(refunds)}</span><span class="d">${inr(14499 + (113994 - toRecord))} paid · ${inr(toRecord)} to record</span></div>
        <div class="in"><span class="k">Balances due by 2 Oct ${V25}</span><span class="v num">${lakh(dueSum + (dc.holds ? holdSum : 0))}</span><span class="d">3 balances${dc.holds ? ` + 3 live holds ${inr(holdSum)}` : ` · holds ${inr(holdSum)} not counted`}</span></div>
        <div class="res"><span class="k">Kept by Fri 2 Oct, if all goes to plan</span><span class="v num">${lakh(expect)}</span><span class="d">${inr(expect)}</span></div>
      </div>
      <section class="a-card"><div class="a-card-h"><h2>Cash by day</h2><span class="muted" style="font-size:13px;font-weight:600">· 1 Sep to 10 Oct · tap a day</span>
          <div class="acts"><span class="ad-dc-leg"><span><i></i>Collected</span><span><i class="exp"></i>Balance due</span>${dc.holds ? '<span><i class="hold"></i>Live hold</span>' : ''}<span><i class="out"></i>Refunded</span><span><i class="owe"></i>Refund to record</span></span></div></div>
        <div class="ad-dc-chart"><div class="ad-dc-scroll"><div class="ad-dc-bars" style="--n:${DAYS_C.length}">${bars}</div></div>
          <div class="ad-dc-day" aria-live="polite"><h3><span>${dt(selX)}${dayNo(selX) === 0 ? ' · today' : dayNo(selX) > 0 ? ' · expected' : ''}</span><span class="num">${selL.length ? `Net ${selNet < 0 ? '−' : '+'}${inr(Math.abs(selNet))}` : ''}</span></h3>
            ${selL.length ? selL.map(([t, l, a]) => `<div class="ln"><span>${esc(l)} <span class="a-chip ${t === 'in' ? 'ok' : t === 'exp' ? 'info' : t === 'hold' ? 'warn' : t === 'owe' ? 'bad' : 'mute'}">${{ in: 'Collected', exp: 'Due', hold: 'Held', owe: 'Owed', out: 'Refunded' }[t]}</span></span><span class="num">${a < 0 ? '−' : '+'}${inr(Math.abs(a))}</span></div>`).join('') : '<span class="muted">No money moved on this day.</span>'}</div></div></section>
      <div class="ad-dc-3">
        <section class="a-card"><div class="a-card-h"><h2>Coming in</h2>${V25}</div><div class="a-card-b"><div class="ad-dc-list">
          ${DUE.map(([d, l, a, ch]) => `<div><span><b>${l.split(' · ')[0]}</b><small>Balance due ${dt(d)} · ${ch} · ${l.split(' · ')[1]}</small></span><span class="num">${inr(a)}</span>
            <span class="acts">${dc.reminded.has(l) ? `<span class="done">${ICON.check}Reminder sent just now</span>` : `<button class="a-btn ghost sm" data-dcr="${esc(l)}">${ICON.wa}Send reminder</button>`}<button class="a-btn ghost sm">Mark paid</button></span></div>`).join('')}
          ${HOLDS.map(([l, a, t, dp]) => `<div><span><b>${l.split(' · ')[0]}</b><small>Checkout open till ${t} · ${dp}</small></span><span class="num" style="color:var(--mute)">${inr(a)}</span></div>`).join('')}</div>
          <div class="ad-dc-foot"><span>Balances</span><span>${inr(dueSum)}</span></div></div></section>
        <section class="a-card"><div class="a-card-h"><h2>Going out</h2></div><div class="a-card-b"><div class="ad-dc-list">
          ${OWE.map((o) => `<div><span><b>${o.who}</b><small><span class="mono">${o.ref}</span> · ${o.why}</small></span><span class="num" style="color:#B42318">${inr(o.amt)}</span>
            <span class="acts">${dc.rec.has(o.id) ? `<span class="done">${ICON.check}Recorded · Razorpay refund noted</span><button class="a-btn ghost sm" data-dcu="${o.id}">Undo</button>` : `<button class="a-btn sm" data-dcx="${o.id}">Refund made</button><span class="muted" style="font-size:12px;align-self:center">Refund in Razorpay first</span>`}</span></div>`).join('')}
          <div><span><b>Priya Raman</b><small>Refunded 16 Sep · cancelled 34 days out</small></span><span class="num" style="color:var(--mute)">${inr(14499)}</span></div></div>
          <div class="ad-dc-foot"><span>Still to record</span><span style="color:${toRecord ? '#B42318' : 'var(--ok)'}">${toRecord ? inr(toRecord) : 'Nothing'}</span></div></div></section>
        <section class="a-card"><div class="a-card-h"><h2>At risk</h2></div><div class="a-card-b"><div class="ad-dc-list">
          <div><span><b>Kavya Iyer · cancel request</b><small>If approved, the policy keeps 50%; ${inr(29699)} goes back</small></span><span class="num" style="color:var(--warn)">−${inr(29699)}</span></div>
          <div><span><b>Vikram Singh Rathore · hold lapsed</b><small>Shimla, Sun 4 Oct · never paid · seats already free</small></span><span class="num" style="color:var(--mute)">${inr(36998)}</span></div>
          <div><span><b>Nikhil Joshi · 4 details missing</b><small>Balance ${inr(54109)} due Thu 1 Oct, grace ends Sat 3 Oct</small></span><span class="num" style="color:var(--warn)">${inr(54109)}</span></div></div></div></section>
      </div>
      <section class="a-card"><div class="a-card-h"><h2>Where September’s money came from</h2>${V25}<span class="muted" style="font-size:12.5px;font-weight:600">by booking channel</span></div>
        <div class="a-card-b"><div class="ad-dc-ch" aria-hidden="true">${CH.map(([, p, c]) => `<i style="flex:${p};background:${c}"></i>`).join('')}</div>
          <div class="ad-dc-chl">${CH.map(([l, p, c]) => `<span><i style="background:${c}"></i>${l}<b>${p}%</b> <span class="muted num">${lakh(Math.round((COLLECTED * p) / 100))}</span></span>`).join('')}</div></div></section>
    </div>`;
    return TS.adminShell('Dashboard', main);
  };
  const mountDashC = (site, rerender) => {
    site.querySelectorAll('[data-dcd]').forEach((b) => b.addEventListener('click', () => { dc.sel = b.dataset.dcd; rerender(); }));
    site.querySelectorAll('[data-dcx]').forEach((b) => b.addEventListener('click', () => { dc.rec.add(b.dataset.dcx); rerender(); }));
    site.querySelectorAll('[data-dcu]').forEach((b) => b.addEventListener('click', () => { dc.rec.delete(b.dataset.dcu); rerender(); }));
    site.querySelectorAll('[data-dcr]').forEach((b) => b.addEventListener('click', () => { dc.reminded.add(b.dataset.dcr); rerender(); }));
    const h = site.querySelector('#dc-holds'); if (h) h.addEventListener('change', () => { dc.holds = h.checked; rerender(); });
  };

  /* =====================================================================
     DASHBOARD D · Departure board
     ===================================================================== */
  const BOARD = ['kasol-10-2', 'shimla-10-4', 'goa-10-9', 'leh-10-11', 'manali-10-16', 'munnar-10-18'];
  const PHOTO = { kasol: 'img/kasol-1.jpg', shimla: 'img/himachal-5.jpg', goa: 'img/goa-3.jpg', leh: 'img/ladakh-1.jpg', manali: 'img/himachal-1.jpg', munnar: 'img/munnar-1.jpg' };
  const dd = { sel: 'kasol-10-2', f: 'all' };
  const depBookings = (id) => { const x = DEPS[id]; return BOOKINGS.filter((b) => b.pkg === x.pkg && k(b.dep) === k(x.d)); };
  const checks = (id) => {
    const x = DEPS[id], bs = depBookings(id);
    const due = bs.filter((b) => b.due).reduce((s, b) => s + owed(b), 0);
    const refund = bs.filter((b) => b.refund), creq = bs.filter((b) => b.creq), holds = bs.filter((b) => b.st === 'pending' && b.hold);
    const lockD = addDays(x.d, -3);
    const C = [
      x.booked >= x.seats / 2 ? ['ok', `<b>${x.booked >= x.seats ? 'Sold out' : 'Runs for sure'}</b> · ${x.booked} of ${x.seats} booked`] : ['no', `<b>Below half full</b> · ${x.booked} of ${x.seats} booked`],
      due ? ['no', `<b>${inr(due)} balance</b> still to collect`] : ['ok', '<b>Paid</b> · no balances open'],
      x.miss ? ['no', `<b>${x.miss} travellers</b> missing details · lock ${dt(lockD)}`] : ['ok', '<b>Details in</b> for everyone'],
      creq.length ? ['bad', `<b>Cancel request</b> from ${creq.map((b) => b.lead).join(', ')}`] : refund.length ? ['bad', `<b>Refund to record</b> · ${refund.map((b) => b.lead).join(', ')}`] : ['ok', '<b>No open requests</b>'],
    ];
    if (holds.length) C.push(['no', `<b>${x.held} ${x.held === 1 ? 'seat' : 'seats'} on hold</b> till ${holds.map((b) => b.hold).join(', ')}`]);
    return C;
  };
  const readyN = (id) => checks(id).filter((c) => c[0] === 'ok').length;
  const needsWork = (id) => checks(id).some((c) => c[0] !== 'ok');
  const CK = { ok: ICON.check, no: ICON.clock, bad: ICON.info };
  const bNext = (b) => {
    if (b.creq) return ['Review request', ''];
    if (b.refund) return ['Refund made', ''];
    if (b.st === 'pending' && b.hold) return ['', `Frees itself at ${b.hold}`];
    if (b.st === 'pending') return ['Mark paid (offline)', ''];
    if (b.due) return ['Send reminder', ''];
    if (b.miss) return ['Send details link', ''];
    return ['', 'Nothing to do'];
  };
  const renderDashD = () => {
    const ids = BOARD.filter((id) => dd.f === 'all' || needsWork(id));
    const x = DEPS[dd.sel], p = PKGS[x.pkg], bs = depBookings(dd.sel), L = TS.LEADERS[p.leader];
    const listed = bs.filter((b) => b.st !== 'cancelled' && !(b.st === 'pending')).reduce((s, b) => s + b.a + b.c, 0);
    const rest = Math.max(0, x.booked - listed);
    const span = 22;
    const main = `<div class="ad ad-dd ad-fade">
      <div class="a-head"><h1>Departures</h1>
        <div class="sub">The next six trips out, with what each still needs before the bus leaves · today is Sun 27 Sep</div>
        <div class="acts"><div class="a-seg" role="group" aria-label="Show">${[['all', 'Next 6'], ['work', `Needs work · ${BOARD.filter(needsWork).length}`]].map(([v, l]) => `<button data-ddf="${v}" aria-pressed="${dd.f === v}">${l}</button>`).join('')}</div></div></div>
      <div class="ad-dd-off">Not tied to a trip: <span><b>5</b> new enquiries · oldest 6 h</span><span><b>2</b> reviews to moderate</span><span><b>${inr(113994)}</b> refunds to record</span><a href="#">Open enquiries ${ICON.arrowR.replace('class="ic"', 'class="ic" style="width:14px;height:14px;vertical-align:-2px"')}</a></div>
      <section class="ad-dd-ruler" aria-label="Next three weeks"><div class="ad-dd-scroll"><div class="ad-dd-track">
        ${[0, 7, 14, 21].map((n) => `<span class="ad-dd-tick ${n === 0 ? 'now' : ''}" style="left:${(n / span) * 96 + 2}%">${n === 0 ? 'Today' : dt(addDays(TODAY, n))}</span>`).join('')}
        ${BOARD.map((id) => { const dx = DEPS[id]; return `<button class="ad-dd-pin ${needsWork(id) ? 'warn' : ''}" data-dds="${id}" aria-pressed="${dd.sel === id}" style="left:${(dayNo(dx.d) / span) * 96 + 2}%" title="${PKGS[dx.pkg].name} · ${dt(dx.d)}"><span>${dx.d[1]}</span></button>`; }).join('')}
      </div></div></section>
      <div class="ad-dd-cards">${ids.map((id) => {
        const dx = DEPS[id], pk = PKGS[dx.pkg], n = dayNo(dx.d), C = checks(id), r = readyN(id);
        return `<button class="ad-dd-card" data-dds="${id}" aria-pressed="${dd.sel === id}">
          <span class="ad-dd-ph"><img src="${PHOTO[dx.pkg]}" alt="" loading="lazy"><span class="cd">${n === 1 ? 'Tomorrow' : `In ${n} days`}</span><span class="when"><small>${pk.dest} · ${pk.nights} nights</small><b>${dt(dx.d)}</b></span></span>
          <span class="ad-dd-body"><h3><span>${pk.name}</span></h3>
            <span class="ad-dd-seat"><span class="row"><span>${dx.booked} booked${dx.held ? ` · ${dx.held} held` : ''}</span><span>${left(dx) > 0 ? `${left(dx)} left` : 'Sold out'}</span></span><span class="a-meter" style="--v:${(dx.booked / dx.seats) * 100}%;--h:${(dx.held / dx.seats) * 100}%" aria-hidden="true"></span></span>
            <span><span class="a-chip ${r === C.length ? 'ok' : r >= C.length - 1 ? 'warn' : 'bad'}">${r === C.length ? `${ICON.check}Ready to go` : `${r} of ${C.length} ready`}</span></span>
            <ul class="ad-dd-checks">${C.map(([t, h]) => `<li><span class="${t}">${CK[t]}</span><span>${h}</span></li>`).join('')}</ul></span></button>`;
      }).join('') || '<div class="a-empty">Every departure is ready.</div>'}</div>
      <section class="a-card flush ad-dd-sheet" aria-live="polite"><div class="a-card-h"><h2>${p.name} · ${dt(x.d)}</h2><span class="muted" style="font-size:13px;font-weight:600">· returns ${dt(addDays(x.d, p.nights))} · ${p.transfers}</span>
          <div class="acts"><span class="ad-dd-lead">${TS.avatar(p.leader, 30)}<span><b>${L.name}</b><span class="muted">Leads · ${L.phone}</span></span></span></div></div>
        <div class="a-card-b"><div class="a-tw"><table class="a-table"><thead><tr><th>Booking</th><th class="hs">Party</th><th class="num hs">Paid</th><th class="num">Owed</th><th class="hs">Details ${V25}</th><th>State</th><th></th></tr></thead>
          <tbody>${bs.map((b) => { const [btn, txt] = bNext(b); return `<tr><td><b>${esc(b.lead)}</b><small><span class="mono">${b.ref}</span> · ${b.ch}</small></td><td class="hs">${party(b.a, b.c)}</td><td class="num hs">${inr(b.paid)}</td>
            <td class="num">${b.refund ? `<span style="color:#B42318;font-weight:800">−${inr(b.agreed || b.paid)}</span>` : owed(b) ? `<b>${inr(owed(b))}</b>${b.due ? `<small>by ${dt(b.due)}</small>` : ''}` : '<span class="muted">None</span>'}</td>
            <td class="hs">${b.st === 'pending' || b.refund ? '<span class="muted">Not asked</span>' : b.miss ? `<span class="a-chip warn">${b.miss} missing</span>` : `<span class="a-chip ok">${ICON.check}All in</span>`}</td>
            <td>${bChip(b)}</td><td class="num">${btn ? `<a href="#" class="a-btn sm ${b.creq || b.refund ? '' : 'ghost'}">${btn}</a>` : `<span class="muted" style="font-size:12.5px">${txt}</span>`}</td></tr>`; }).join('')}
            ${rest ? `<tr class="dim"><td colspan="7">${rest} more ${rest === 1 ? 'traveller' : 'travellers'} in other bookings · paid in full, details in</td></tr>` : ''}</tbody></table></div>
          <div class="ad-dd-acts" style="padding-top:12px"><a href="#" class="a-btn sm">${ICON.file}Print manifest</a><a href="#" class="a-btn ghost sm">${ICON.wa}WhatsApp the group</a>${x.miss ? `<a href="#" class="a-btn ghost sm">${ICON.link}Send details links ${V25}</a>` : ''}<a href="#" class="a-btn ghost sm">${ICON.phone}Call ${first(L.name)}</a></div></div></section>
    </div>`;
    return TS.adminShell('Dashboard', main);
  };
  const mountDashD = (site, rerender) => {
    site.querySelectorAll('[data-dds]').forEach((b) => b.addEventListener('click', () => { dd.sel = b.dataset.dds; rerender(); }));
    site.querySelectorAll('[data-ddf]').forEach((b) => b.addEventListener('click', () => { dd.f = b.dataset.ddf; rerender(); }));
  };

  TS.addVariants('dash', [
    { id: 'B', name: 'Week planner', render: renderDashB, mount: mountDashB,
      tradeoff: 'Time is the organising idea, so a refund with no date sits in “carried over” rather than competing by urgency, and the long-range numbers (conversion, views) leave the home page for Reports.',
      note: 'The dashboard stops being a set of panels and becomes <b>an agenda</b>. An 8-day strip across the top (today to Sun 4 Oct) shows how much each day holds, which days a trip departs and what money is due. Below it, the selected day reads top to bottom: <b>carried over</b> (the cancellation request, two refunds, two enquiries), then <b>by the clock</b> with a red now-line at 4:20 pm between the three holds that end at 4:32, 4:41 and 4:47 and Ritika’s 6 pm callback. Tick items off; automatic ones (balance reminders, details locks, grace deadlines) show what Tripsmith will do by itself. The right rail totals the 8 days and adds a private to-do. On a phone the strip scrolls sideways and the agenda becomes a single checklist.' },
    { id: 'C', name: 'Money desk', render: renderDashC, mount: mountDashC,
      tradeoff: 'It answers “is the business OK” in one glance but hides the enquiry pipeline behind a single link, so this suits a Monday money review more than a busy sales day.',
      note: 'For an owner who thinks in rupees first. The page opens on a <b>cash equation</b>: collected in September − refunds + balances due by 2 Oct = what the business keeps, with a switch to count the three live holds. Under it, a 40-day <b>cash-by-day</b> chart: solid bars for money collected, hatched green for v2.5 balances falling due, hatched red below the line for refunds still to record. Tap any day to see its payments by name. Three columns follow: <b>Coming in</b> (send a WhatsApp reminder), <b>Going out</b> (press Refund made and the equation updates) and <b>At risk</b>. On a phone the equation becomes a 2 × 2 grid and the chart scrolls sideways.' },
    { id: 'D', name: 'Departure board', render: renderDashD, mount: mountDashD,
      tradeoff: 'Everything is seen through a trip, so work with no departure (new enquiries, reviews) is reduced to one line at the top.',
      note: 'Built around the thing a tour operator actually runs: <b>the next departure</b>. A three-week ruler shows where the six trips fall (amber pins need work). Each trip is a photo card with a countdown, its seat bar and a <b>readiness checklist</b>: runs for sure, balances collected, traveller details in, no open requests or holds. That gives a plain “3 of 4 ready” chip. Pick a card and the sheet below lists every booking on that departure with what it owes, whose details are missing and one button each, plus the trip leader to call, the manifest and WhatsApp for the group. “Needs work” hides trips that are ready. On a phone the cards swipe sideways and the sheet drops the optional columns.' },
  ], css);

  /* =====================================================================
     ENQUIRIES · CSS
     ===================================================================== */
  const css2 = `
  /* ===== Enquiries B · Conversations ===== */
  .ad-eb-wrap { display: grid; grid-template-columns: 300px minmax(0, 1fr) 250px; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); overflow: hidden; min-height: 660px; }
  .ad-eb-list { border-right: 1px solid var(--a-line); display: grid; grid-template-rows: auto auto 1fr; min-width: 0; }
  .ad-eb-lh { padding: 12px 12px 8px; display: grid; gap: 8px; }
  .ad-eb-lh .a-seg { display: flex; } .ad-eb-lh .a-seg button { flex: 1; padding: 7px 6px; }
  .ad-eb-lh .a-search { max-width: none; min-width: 0; }
  .ad-eb-items { overflow-y: auto; max-height: 590px; }
  .ad-eb-it { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 3px 10px; padding: 11px 12px; border: 0; border-top: 1px solid var(--a-line); background: none; width: 100%; text-align: left; cursor: pointer; color: var(--ink); font: inherit; }
  .ad-eb-it[hidden] { display: none; }
  .ad-eb-it:hover { background: color-mix(in srgb, var(--pri) 4%, transparent); }
  .ad-eb-it[aria-current="true"] { background: var(--pri-soft); }
  .ad-eb-it .ad-av { grid-row: 1 / span 3; }
  .ad-eb-it .top { display: flex; justify-content: space-between; gap: 8px; font-size: 13.5px; }
  .ad-eb-it .top b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ad-eb-it .top span { font-size: 11.5px; color: var(--mute); font-weight: 600; white-space: nowrap; }
  .ad-eb-it .pv { font-size: 12.5px; color: var(--mute); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .ad-eb-it .chips { display: flex; gap: 4px; flex-wrap: wrap; }
  .ad-eb-it .unread b::before { content: ""; display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--pri); margin-right: 6px; vertical-align: 2px; }
  .ad-eb-kb { font-size: 11.5px; color: var(--mute); padding: 10px 12px; border-top: 1px solid var(--a-line); display: flex; gap: 10px; flex-wrap: wrap; }
  .ad-eb-kb kbd { font: 700 10.5px "DM Sans", sans-serif; border: 1px solid var(--a-line); border-radius: 5px; padding: 0 5px; background: var(--bg2); color: var(--ink2); }
  .ad-eb-th { display: grid; grid-template-rows: auto 1fr auto; min-width: 0; background: var(--bg2); }
  .ad-eb-thh { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 12px 16px; background: var(--a-surf); border-bottom: 1px solid var(--a-line); }
  .ad-eb-thh h2 { font-size: 17px; margin: 0; letter-spacing: -.02em; }
  .ad-eb-thh .acts { margin-left: auto; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .ad-eb-back { display: none; }
  .ad-eb-msgs { padding: 16px; display: grid; gap: 12px; align-content: start; overflow-y: auto; max-height: 440px; }
  .ad-eb-m { max-width: 82%; display: grid; gap: 4px; }
  .ad-eb-m .meta { font-size: 11.5px; color: var(--mute); font-weight: 700; }
  .ad-eb-m .bub { background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 4px 14px 14px 14px; padding: 10px 12px; font-size: 13.5px; line-height: 1.5; }
  .ad-eb-m.out { justify-self: end; } .ad-eb-m.out .meta { text-align: right; }
  .ad-eb-m.out .bub { background: var(--pri); color: #fff; border-color: var(--pri); border-radius: 14px 4px 14px 14px; }
  .ad-eb-m.note { justify-self: end; } .ad-eb-m.note .meta { text-align: right; }
  .ad-eb-m.note .bub { background: #FFF4E2; border-color: #F3DDB5; border-style: dashed; border-radius: 14px 4px 14px 14px; }
  .ad-eb-m .att { display: inline-flex; gap: 6px; align-items: center; font-size: 12px; font-weight: 700; background: rgba(255,255,255,.18); border-radius: 8px; padding: 4px 8px; margin-top: 6px; }
  .ad-eb-m .att .ic { width: 14px; height: 14px; }
  .ad-eb-sys { justify-self: center; font-size: 12px; color: var(--mute); font-weight: 600; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 999px; padding: 3px 10px; text-align: center; }
  .ad-eb-form { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 12px; margin: 0 0 8px; font-size: 13px; }
  .ad-eb-form dt { color: var(--mute); } .ad-eb-form dd { margin: 0; font-weight: 700; }
  .ad-eb-comp { background: var(--a-surf); border-top: 1px solid var(--a-line); padding: 10px 14px 12px; display: grid; gap: 8px; }
  .ad-eb-comp .tabs { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
  .ad-eb-comp .tabs button { font: 700 12.5px "DM Sans", sans-serif; border: 0; background: none; padding: 5px 10px; border-radius: 8px; color: var(--mute); cursor: pointer; }
  .ad-eb-comp .tabs button[aria-pressed="true"] { background: var(--ink); color: #fff; }
  .ad-eb-comp .tabs button.note[aria-pressed="true"] { background: #FFF4E2; color: var(--warn); }
  .ad-eb-comp .to { margin-left: auto; font-size: 12px; color: var(--mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%; }
  .ad-eb-comp textarea { font: 500 14px "DM Sans", sans-serif; border: 1px solid var(--a-line); border-radius: 10px; padding: 9px 11px; min-height: 76px; resize: vertical; width: 100%; color: var(--ink); background: var(--a-surf); }
  .ad-eb-comp.isnote textarea { background: #FFFBF3; border-color: #F3DDB5; }
  .ad-eb-snips { display: flex; gap: 6px; flex-wrap: wrap; }
  .ad-eb-snips button { font: 700 12px "DM Sans", sans-serif; border: 1px dashed var(--a-line); background: var(--a-surf); color: var(--ink2); border-radius: 999px; padding: 4px 10px; cursor: pointer; transition: transform .15s; }
  .ad-eb-snips button:hover { transform: translateY(-1px); border-color: var(--pri); color: var(--pri); }
  .ad-eb-foot { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .ad-eb-foot label { display: inline-flex; gap: 6px; align-items: center; font-size: 12.5px; font-weight: 700; cursor: pointer; }
  .ad-eb-foot label input { accent-color: var(--pri); }
  .ad-eb-foot .a-btn { margin-left: auto; }
  .ad-eb-rail { border-left: 1px solid var(--a-line); padding: 16px 14px; display: grid; gap: 16px; align-content: start; min-width: 0; }
  .ad-eb-rail .who { display: grid; justify-items: start; gap: 6px; }
  .ad-eb-rail .who b { font-size: 16px; }
  .ad-eb-rail .a-kv > div { font-size: 12.5px; }
  .ad-eb-rail .a-kv dd { word-break: break-all; }
  .ad-eb-flash { font-size: 12.5px; font-weight: 700; color: var(--ok); display: inline-flex; gap: 6px; align-items: center; }
  .ad-eb-flash .ic { width: 14px; height: 14px; }

  /* ===== Enquiries C · Pipeline ===== */
  .ad-ec-fun { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); overflow: hidden; }
  .ad-ec-fun > div { padding: 12px 16px; display: grid; gap: 2px; }
  .ad-ec-fun > div + div { border-left: 1px solid var(--a-line); }
  .ad-ec-fun .k { font-size: 12px; font-weight: 700; color: var(--mute); }
  .ad-ec-fun .v { font-size: 22px; font-weight: 800; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
  .ad-ec-fun .d { font-size: 12px; color: var(--mute); font-weight: 600; }
  .ad-ec-board { display: grid; grid-template-columns: repeat(var(--cols), minmax(250px, 1fr)); gap: 12px; overflow-x: auto; padding-bottom: 6px; align-items: start; }
  .ad-ec-col { background: color-mix(in srgb, var(--ink) 4%, var(--a-bg)); border-radius: var(--a-r); padding: 10px; display: grid; gap: 8px; align-content: start; min-height: 420px; transition: box-shadow .2s; }
  .ad-ec-col.over { box-shadow: inset 0 0 0 2px var(--pri); }
  .ad-ec-ch { display: flex; align-items: center; gap: 8px; padding: 2px 4px 4px; }
  .ad-ec-ch h2 { font-size: 13.5px; margin: 0; display: flex; gap: 6px; align-items: center; }
  .ad-ec-ch .n { font-size: 12px; font-weight: 800; color: var(--mute); }
  .ad-ec-ch .v { margin-left: auto; font-size: 12px; font-weight: 800; font-variant-numeric: tabular-nums; color: var(--ink2); }
  .ad-ec-card { background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 12px; padding: 10px 11px; display: grid; gap: 7px; cursor: grab; transition: transform .2s var(--ease), box-shadow .2s, opacity .2s; }
  .ad-ec-card:hover { box-shadow: 0 8px 20px -14px rgba(20,32,42,.4); transform: translateY(-1px); }
  .ad-ec-card.drag { opacity: .45; }
  .ad-ec-card[aria-current="true"] { box-shadow: 0 0 0 2px var(--pri); }
  .ad-ec-card .top { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; gap: 8px; align-items: center; }
  .ad-ec-card .top b { font-size: 13.5px; display: block; line-height: 1.2; }
  .ad-ec-card .top small { font-size: 11.5px; color: var(--mute); }
  .ad-ec-card .grip { color: var(--mute); display: grid; grid-template-columns: repeat(2, 3px); gap: 3px; padding: 4px; }
  .ad-ec-card .grip i { width: 3px; height: 3px; border-radius: 50%; background: currentColor; }
  .ad-ec-card .what { font-size: 12.5px; color: var(--ink2); }
  .ad-ec-card .row { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; }
  .ad-ec-card .val { margin-left: auto; font-weight: 800; font-size: 13px; font-variant-numeric: tabular-nums; }
  .ad-ec-card .mv { display: flex; gap: 4px; border-top: 1px solid var(--a-line); padding-top: 7px; }
  .ad-ec-card .mv button { font: 700 11.5px "DM Sans", sans-serif; border: 1px solid var(--a-line); background: var(--a-surf); border-radius: 8px; padding: 3px 8px; cursor: pointer; color: var(--ink2); display: inline-flex; align-items: center; gap: 3px; }
  .ad-ec-card .mv button .ic { width: 12px; height: 12px; }
  .ad-ec-card .mv button:hover { border-color: var(--ink); }
  .ad-ec-card .mv .open { margin-left: auto; border: 0; color: var(--pri); }
  .ad-ec-more { font-size: 12px; color: var(--mute); font-weight: 700; text-align: center; padding: 6px; }
  .ad-ec-drawer { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 18px; }
  .ad-ec-drawer .msg { background: var(--bg2); border-radius: 12px; padding: 10px 12px; font-size: 13.5px; margin: 0; }
  .ad-ec-drawer .msg b { display: block; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--mute); margin-bottom: 3px; }
  .ad-ec-drawer .acts { display: flex; gap: 6px; flex-wrap: wrap; }

  /* ===== Enquiries D · Call sheet ===== */
  .ad-ed-top { display: flex; gap: 10px 20px; align-items: center; flex-wrap: wrap; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); padding: 12px var(--a-pad); font-size: 13px; }
  .ad-ed-top .a-meter { flex: 1 1 160px; max-width: 300px; }
  .ad-ed-top b { font-variant-numeric: tabular-nums; }
  .ad-ed-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start; }
  .ad-ed-card { background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); overflow: hidden; }
  .ad-ed-who { padding: 18px var(--a-pad) 16px; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px 16px; align-items: center; background: color-mix(in srgb, var(--pri) 5%, var(--a-surf)); border-bottom: 1px solid var(--a-line); }
  .ad-ed-who .ad-av { grid-row: 1 / span 2; }
  .ad-ed-who h2 { font-size: 24px; letter-spacing: -.03em; margin: 0; }
  .ad-ed-who .meta { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; font-size: 13px; color: var(--ink2); }
  .ad-ed-dial { grid-column: 1 / -1; display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
  .ad-ed-dial .call { font-size: 16px; padding: 12px 18px; border-radius: 12px; }
  .ad-ed-dial .call .ic { width: 18px; height: 18px; }
  .ad-ed-dial .num { font-variant-numeric: tabular-nums; letter-spacing: .02em; }
  .ad-ed-sec { padding: 14px var(--a-pad); border-top: 1px solid var(--a-line); display: grid; gap: 10px; }
  .ad-ed-sec:first-of-type { border-top: 0; }
  .ad-ed-pts { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; font-size: 14px; }
  .ad-ed-pts li { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 6px; }
  .ad-ed-pts li::before { content: counter(list-item); font-size: 11px; font-weight: 800; width: 20px; height: 20px; border-radius: 50%; background: var(--bg2); display: grid; place-items: center; color: var(--ink2); }
  .ad-ed-quote { margin: 0; font-size: 13.5px; color: var(--ink2); background: var(--bg2); border-radius: 12px; padding: 10px 12px; }
  .ad-ed-out { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
  .ad-ed-out button, .ad-ed-fu button { font: 700 13px "DM Sans", sans-serif; border: 1px solid var(--a-line); background: var(--a-surf); color: var(--ink); border-radius: 10px; padding: 10px 8px; cursor: pointer; text-align: center; transition: transform .15s; }
  .ad-ed-out button:active, .ad-ed-fu button:active { transform: scale(.97); }
  .ad-ed-out button[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: #fff; }
  .ad-ed-out button.book[aria-pressed="true"] { background: var(--ok); border-color: var(--ok); }
  .ad-ed .a-seg button[disabled] { opacity: .4; cursor: not-allowed; }
  .ad-ed-fu { display: flex; gap: 6px; flex-wrap: wrap; }
  .ad-ed-fu button { padding: 7px 11px; font-size: 12.5px; }
  .ad-ed-fu button[aria-pressed="true"] { background: var(--pri-soft); border-color: var(--pri); color: var(--pri-ink); }
  .ad-ed-err { color: #B42318; font-size: 12.5px; font-weight: 700; }
  .ad-ed-qb { background: var(--ok-soft); border-radius: 14px; padding: 14px; display: grid; gap: 12px; }
  .ad-ed-qb h3 { margin: 0; font-size: 15px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .ad-ed-step { display: inline-flex; align-items: center; border: 1px solid var(--a-line); border-radius: 10px; background: var(--a-surf); overflow: hidden; }
  .ad-ed-step button { width: 34px; height: 36px; border: 0; background: none; cursor: pointer; display: grid; place-items: center; color: var(--ink); }
  .ad-ed-step button .ic { width: 15px; height: 15px; }
  .ad-ed-step span { min-width: 30px; text-align: center; font-weight: 800; font-variant-numeric: tabular-nums; }
  .ad-ed-pax { display: flex; gap: 16px; flex-wrap: wrap; align-items: center; font-size: 13px; font-weight: 700; }
  .ad-ed-pax > span { display: inline-flex; gap: 8px; align-items: center; }
  .ad-ed-tot { display: grid; gap: 4px; font-size: 13.5px; background: var(--a-surf); border-radius: 10px; padding: 10px 12px; }
  .ad-ed-tot div { display: flex; justify-content: space-between; gap: 10px; }
  .ad-ed-tot .num { font-variant-numeric: tabular-nums; font-weight: 700; }
  .ad-ed-tot .big { font-size: 16px; font-weight: 800; border-top: 1px solid var(--a-line); padding-top: 6px; }
  .ad-ed-save { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; padding: 14px var(--a-pad); border-top: 1px solid var(--a-line); background: var(--bg2); }
  .ad-ed-save .a-btn:first-child { margin-right: auto; }
  .ad-ed-q { display: grid; gap: 14px; }
  .ad-ed-ql { list-style: none; margin: 0; padding: 0; }
  .ad-ed-ql li + li { border-top: 1px solid var(--a-line); }
  .ad-ed-ql button { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; gap: 2px 10px; align-items: center; width: 100%; text-align: left; background: none; border: 0; padding: 9px var(--a-pad); cursor: pointer; font: inherit; color: var(--ink); }
  .ad-ed-ql button:hover { background: color-mix(in srgb, var(--pri) 4%, transparent); }
  .ad-ed-ql button[aria-current="true"] { background: var(--pri-soft); }
  .ad-ed-ql b { font-size: 13.5px; display: block; }
  .ad-ed-ql small { font-size: 12px; color: var(--mute); display: block; }
  .ad-ed-ql .when { font-size: 11.5px; font-weight: 800; color: var(--ink2); white-space: nowrap; }
  .ad-ed-ql .when.late { color: #B42318; }
  .ad-ed-done li { display: flex; justify-content: space-between; gap: 8px; padding: 8px var(--a-pad); font-size: 13px; align-items: center; }

  @container site (max-width: 1100px) {
    .ad-eb-wrap { grid-template-columns: 280px minmax(0, 1fr); }
    .ad-eb-rail { display: none; }
    .ad-ed-out { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  @container site (max-width: 700px) {
    .ad-eb-wrap { grid-template-columns: 1fr; min-height: 0; }
    .ad-eb-wrap[data-view="list"] .ad-eb-th { display: none; }
    .ad-eb-wrap[data-view="thread"] .ad-eb-list { display: none; }
    .ad-eb-list { border-right: 0; }
    .ad-eb-kb { display: none; }
    .ad-eb-back { display: inline-flex; }
    .ad-eb-thh { padding: 10px 12px; } .ad-eb-thh .acts { margin-left: 0; width: 100%; }
    .ad-eb-msgs { max-height: none; padding: 12px; }
    .ad-eb-m { max-width: 92%; }
    .ad-eb-comp .to { display: none; }
    .ad-ec-fun { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .ad-ec-fun > div:nth-child(3) { border-left: 0; }
    .ad-ec-fun > div:nth-child(n+3) { border-top: 1px solid var(--a-line); }
    .ad-ec-board { grid-template-columns: repeat(var(--cols), 82%); scroll-snap-type: x mandatory; }
    .ad-ec-col { scroll-snap-align: start; min-height: 0; }
    .ad-ec-drawer { grid-template-columns: 1fr; }
    .ad-ed-grid { grid-template-columns: 1fr; }
    .ad-ed-who h2 { font-size: 21px; }
    .ad-ed-dial .call { flex: 1 1 100%; justify-content: center; }
    .ad-ed-out { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .ad-ed-save .a-btn:first-child { margin-right: 0; flex: 1 1 100%; }
  }`;

  /* =====================================================================
     ENQUIRIES B · Conversations
     ===================================================================== */
  const eb = { g: 'you', sel: 'TS-4MW8TE', mode: 'reply', draft: {}, att: true, sent: {}, view: 'list', q: '', flash: '' };
  const thread = (e) => {
    const p = e.pkg ? PKGS[e.pkg] : null;
    const T = [];
    const rows = [['Package', p ? p.name : 'General question'], e.month ? ['Travel month', e.month] : null, ['Travellers', party(e.a, e.c)],
      e.dates ? ['Dates', e.dates] : null, e.budget ? ['Budget', `${inr(e.budget)} per person`] : null, e.changes ? ['Changes', e.changes] : null].filter(Boolean);
    T.push({ k: 'in', t: e.at, who: e.name, body: `<dl class="ad-eb-form">${rows.map(([a, b]) => `<dt>${a}</dt><dd>${esc(b)}</dd>`).join('')}</dl>${e.msg ? esc(e.msg) : `<span class="muted">No message · ${TYPES[e.type].toLowerCase()} form</span>`}` });
    T.push({ k: 'sys', body: `${e.type === 'chat' ? 'Handed over by the concierge' : `${TYPES[e.type]} form`} · confirmation emailed to ${first(e.name)} · you were alerted` });
    const ev = [...e.out.map(([t, x]) => ({ k: 'out', t, body: esc(x), att: e.ref === 'TS-3ZC7MP' ? 'Leh + Tso Moriri quote.pdf' : '' })), ...e.notes.map(([t, x]) => ({ k: 'note', t, body: esc(x) }))];
    ev.forEach((m) => T.push(m));
    if (e.reply) T.push({ k: 'in', t: e.reply[0], who: e.name, body: esc(e.reply[1]) });
    if (e.booking) T.push({ k: 'sys', body: `Converted to booking ${e.booking}` });
    if (e.status === 'closed') T.push({ k: 'sys', body: 'Marked closed' });
    (eb.sent[e.ref] || []).forEach((m) => T.push(m));
    return T;
  };
  const lastK = (e) => { const T = thread(e).filter((m) => m.k !== 'sys'); return T[T.length - 1].k; };
  const ebGroup = (e) => (e.status === 'converted' || e.status === 'closed' ? 'done' : lastK(e) === 'in' ? 'you' : 'them');
  const ebMatch = (e) => ebGroup(e) === eb.g && (!eb.q || [e.name, e.ph.replace(/\s/g, ''), e.ref].some((s) => s.toLowerCase().includes(eb.q.toLowerCase().replace(/\s/g, ''))));
  const snips = (e) => {
    const p = e.pkg ? PKGS[e.pkg] : null;
    return [
      p ? ['Price', `${p.name} starts at ${inr(p.from)} per person for ${p.nights} nights, with ${p.meals.toLowerCase()} and ${p.transfers.toLowerCase()}.`] : ['Season', 'Our Kerala trips run every week from October to March.'],
      ['Dates', 'Could you share your exact dates? I can hold seats for 24 hours while you decide.'],
      ['Deposit', 'You can reserve with 25% now and pay the balance 30 days before departure.'],
      ['Call me', 'I tried calling you just now. What time suits you for a 10-minute call?'],
    ];
  };
  const renderEnqB = () => {
    const rows = ENQ.filter(ebMatch).sort((a, b) => b.wait - a.wait);
    const cnt = (g) => ENQ.filter((e) => ebGroup(e) === g).length;
    const e = eBy(eb.sel) || rows[0] || ENQ[0];
    const p = e.pkg ? PKGS[e.pkg] : null;
    const T = thread(e);
    const draft = eb.draft[e.ref + eb.mode] ?? (eb.mode === 'reply' ? `Hi ${first(e.name)}, ` : '');
    const main = `<div class="ad ad-eb ad-fade">
      <div class="a-head"><h1>Enquiries</h1><div class="sub">Every enquiry is a conversation · sorted by who owes the next move · ${cnt('you')} waiting on you</div>
        <div class="acts"><a href="#" class="a-btn ghost sm">${ICON.down}Export CSV</a></div></div>
      <div class="ad-eb-wrap" data-view="${eb.view}">
        <div class="ad-eb-list">
          <div class="ad-eb-lh"><div class="a-seg" role="group" aria-label="Show">${[['you', 'Waiting on you'], ['them', 'Waiting on them'], ['done', 'Done']].map(([g, l]) => `<button data-ebg="${g}" aria-pressed="${eb.g === g}">${l} <span class="num">${cnt(g)}</span></button>`).join('')}</div>
            <label class="a-search">${ICON.search}<input type="search" id="eb-q" value="${esc(eb.q)}" placeholder="Name, phone or ref" aria-label="Search enquiries"></label></div>
          <div class="ad-eb-items" role="list">${rows.map((x) => { const last = thread(x).filter((m) => m.k !== 'sys').pop(); return `<button role="listitem" class="ad-eb-it" data-ebi="${x.ref}" aria-current="${x.ref === e.ref}">${cav(x.name)}
              <span class="top ${x.status === 'new' ? 'unread' : ''}"><b>${esc(x.name)}</b><span>${last.t.replace(/^\w{3} /, '')}</span></span>
              <span class="pv">${last.k === 'note' ? 'Note: ' : last.k === 'out' ? 'You: ' : ''}${esc((last.k === 'in' ? (x.reply && last.t === x.reply[0] ? x.reply[1] : x.msg || x.changes || `${x.pkg ? PKGS[x.pkg].name : 'General'} · ${party(x.a, x.c)}`) : last.body.replace(/<[^>]+>/g, '')).slice(0, 110))}</span>
              <span class="chips">${eChip(x.status)}<span class="a-chip mute">${TYPES[x.type]}</span>${waitWord(x) ? `<span class="a-chip ${waitTone(x)}">${waitWord(x)}</span>` : ''}${x.reply && x.status === 'contacted' ? '<span class="a-chip warn">Replied 24 Sep</span>' : ''}</span></button>`; }).join('') || '<div class="a-empty">Nothing here. Inbox zero.</div>'}</div>
          <div class="ad-eb-kb"><span><kbd>J</kbd> <kbd>K</kbd> next, previous</span><span><kbd>R</kbd> reply</span><span><kbd>N</kbd> note</span></div>
        </div>
        <div class="ad-eb-th">
          <div class="ad-eb-thh"><button class="a-btn ghost sm ad-eb-back" data-ebback>${ICON.chevL}Back</button>${cav(e.name, 36)}<div><h2>${esc(e.name)}</h2><span class="muted" style="font-size:12.5px"><span class="mono">${e.ref}</span> · ${p ? p.name : 'General question'}</span></div>
            <div class="acts"><select class="a-select" id="eb-st" aria-label="Status">${Object.entries(ESTATUS).map(([s, [, l]]) => `<option value="${s}" ${e.status === s ? 'selected' : ''}>${l}</option>`).join('')}</select>
              <a href="tel:+91${e.ph.replace(/\s/g, '')}" class="a-btn ghost sm">${ICON.phone}Call</a><a href="#" class="a-btn ghost sm">${ICON.wa}WhatsApp</a></div></div>
          <div class="ad-eb-msgs" aria-live="polite">${T.map((m) => m.k === 'sys' ? `<div class="ad-eb-sys">${m.body}</div>` : `<div class="ad-eb-m ${m.k}"><span class="meta">${m.k === 'in' ? esc(first(m.who)) : m.k === 'note' ? 'Note · only you see this' : 'You, by email'} · ${m.t}</span><div class="bub">${m.body}${m.att ? `<div class="att">${ICON.file}${esc(m.att)}</div>` : ''}</div></div>`).join('')}</div>
          <div class="ad-eb-comp ${eb.mode === 'note' ? 'isnote' : ''}">
            <div class="tabs"><button data-ebm="reply" aria-pressed="${eb.mode === 'reply'}">${ICON.mail.replace('class="ic"', 'class="ic" style="width:14px;height:14px;vertical-align:-2px"')} Reply by email</button><button class="note" data-ebm="note" aria-pressed="${eb.mode === 'note'}">Private note</button>
              ${eb.mode === 'reply' ? `<span class="to">To ${e.em} · Re: Your Tripsmith enquiry ${e.ref}</span>` : ''}</div>
            ${eb.mode === 'reply' ? `<div class="ad-eb-snips">${snips(e).map(([l], i) => `<button data-ebs="${i}">+ ${l}</button>`).join('')}</div>` : ''}
            <textarea id="eb-tx" aria-label="${eb.mode === 'reply' ? 'Reply' : 'Note'}" placeholder="${eb.mode === 'reply' ? 'Write your reply' : 'Called, quoted, follow up on…'}">${esc(draft)}</textarea>
            <div class="ad-eb-foot">${eb.mode === 'reply' && p ? `<label><input type="checkbox" id="eb-att" ${eb.att ? 'checked' : ''}>Attach ${p.name} itinerary PDF</label>` : ''}
              ${eb.flash ? `<span class="ad-eb-flash">${ICON.check}${eb.flash}</span>` : ''}
              <button class="a-btn sm ${eb.mode === 'note' ? 'act' : ''}" data-ebsend>${eb.mode === 'reply' ? `${ICON.mail}Send reply` : 'Save note'}</button></div>
          </div>
        </div>
        <aside class="ad-eb-rail" aria-label="About ${esc(e.name)}">
          <div class="who">${cav(e.name, 48)}<b>${esc(e.name)}</b><span class="muted" style="font-size:12.5px">${e.device}</span></div>
          <dl class="a-kv"><div><dt>Mobile</dt><dd>+91 ${e.ph}</dd></div><div><dt>Email</dt><dd>${e.em}</dd></div><div><dt>Received</dt><dd>${e.recv}</dd></div>
            ${e.fu ? `<div><dt>Follow up</dt><dd>${e.fu}</dd></div>` : ''}${p ? `<div><dt>From</dt><dd>${inr(p.from)} pp</dd></div>` : ''}${estValue(e) ? `<div><dt>Worth about</dt><dd>${inr(estValue(e))}</dd></div>` : ''}</dl>
          ${e.booking ? `<span class="a-chip ok">${ICON.check}Converted · <span class="mono">${e.booking}</span></span>` : `<div style="display:grid;gap:6px"><a href="#" class="a-btn act sm" style="justify-self:start">${ICON.ticket}Convert to booking</a>${V25}<span class="muted" style="font-size:12px">Opens the counter pre-filled with ${p ? p.name : 'this enquiry'}, ${party(e.a, e.c)}.</span></div>`}
          <div style="display:grid;gap:6px"><p class="ad-eyebrow">History with you</p><span style="font-size:12.5px">${e.ref === 'TS-9P2LXA' ? '<span class="mono">TS-1KB7QE</span> · General enquiry · Closed · Mar 2026' : e.name === 'Meenakshi Pillai' ? '1 booking · Munnar, 18 Oct' : e.name === 'Harpreet Kaur' ? '1 trip · Kasol, 25 Sep · also <span class="mono">TS-4AA9KM</span> today' : 'First enquiry'}</span></div>
        </aside>
      </div>
    </div>`;
    return TS.adminShell('Enquiries', main);
  };
  let ebKey = null;
  const mountEnqB = (site, rerender) => {
    const e = eBy(eb.sel);
    const tx = site.querySelector('#eb-tx');
    const keep = () => { if (tx && e) eb.draft[e.ref + eb.mode] = tx.value; };
    site.querySelectorAll('[data-ebg]').forEach((b) => b.addEventListener('click', () => { keep(); eb.g = b.dataset.ebg; const f = ENQ.filter(ebMatch).sort((a, c) => c.wait - a.wait)[0]; if (f) eb.sel = f.ref; eb.flash = ''; rerender(); }));
    site.querySelectorAll('[data-ebi]').forEach((b) => b.addEventListener('click', () => { keep(); eb.sel = b.dataset.ebi; eb.view = 'thread'; eb.flash = ''; rerender(); }));
    site.querySelectorAll('[data-ebm]').forEach((b) => b.addEventListener('click', () => { keep(); eb.mode = b.dataset.ebm; rerender(); }));
    const back = site.querySelector('[data-ebback]'); if (back) back.addEventListener('click', () => { keep(); eb.view = 'list'; rerender(); });
    if (tx) tx.addEventListener('input', keep);
    site.querySelectorAll('[data-ebs]').forEach((b) => b.addEventListener('click', () => {
      const s = snips(e)[Number(b.dataset.ebs)][1];
      tx.value = tx.value.replace(/\s*$/, '') + (tx.value.trim().endsWith(',') ? ' ' : tx.value.trim() ? ' ' : '') + s; keep(); tx.focus();
    }));
    const att = site.querySelector('#eb-att'); if (att) att.addEventListener('change', () => { eb.att = att.checked; });
    const st = site.querySelector('#eb-st'); if (st) st.addEventListener('change', () => { keep(); e.status = st.value; if (e.status !== 'new') e.wait = 0; eb.flash = `Marked ${ESTATUS[e.status][1].toLowerCase()}`; rerender(); });
    const send = site.querySelector('[data-ebsend]');
    if (send) send.addEventListener('click', () => {
      const body = tx.value.trim(); if (!body || body === `Hi ${first(e.name)},`) { tx.focus(); return; }
      (eb.sent[e.ref] = eb.sent[e.ref] || []).push({ k: eb.mode === 'reply' ? 'out' : 'note', t: 'Just now', body: esc(body), att: eb.mode === 'reply' && eb.att && e.pkg ? `${PKGS[e.pkg].name} itinerary.pdf` : '' });
      eb.draft[e.ref + eb.mode] = eb.mode === 'reply' ? '' : '';
      if (eb.mode === 'reply' && e.status === 'new') { e.status = 'contacted'; e.wait = 0; eb.flash = `Sent to ${first(e.name)} · marked contacted`; } else eb.flash = eb.mode === 'reply' ? `Sent to ${first(e.name)}` : 'Note saved';
      rerender();
    });
    const q = site.querySelector('#eb-q');
    if (q) q.addEventListener('input', () => { eb.q = q.value.trim(); site.querySelectorAll('[data-ebi]').forEach((b) => { b.hidden = !ebMatch(eBy(b.dataset.ebi)); }); });
    if (ebKey) site.removeEventListener('keydown', ebKey);
    ebKey = (ev) => {
      if (!site.querySelector('.ad-eb') || /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) return;
      const list = ENQ.filter(ebMatch).sort((a, c) => c.wait - a.wait), i = list.findIndex((x) => x.ref === eb.sel);
      const key = ev.key.toLowerCase();
      if (key === 'j' || key === 'k') { const n = list[Math.min(list.length - 1, Math.max(0, i + (key === 'j' ? 1 : -1)))]; if (n) { keep(); eb.sel = n.ref; rerender(); const t = site.querySelector(`[data-ebi="${n.ref}"]`); if (t) t.focus(); } }
      else if (key === 'r' || key === 'n') { ev.preventDefault(); keep(); eb.mode = key === 'r' ? 'reply' : 'note'; rerender(); const t = site.querySelector('#eb-tx'); if (t) t.focus(); }
    };
    site.addEventListener('keydown', ebKey);
  };

  /* =====================================================================
     ENQUIRIES C · Pipeline
     ===================================================================== */
  const ec = { g: 'status', sel: '', pkg: '', flash: '' };
  const ORDER = ['new', 'contacted', 'converted', 'closed'];
  const MONTHS = ['Oct 2026', 'Nov 2026', 'Dec 2026', 'Jan 2027', 'Jun 2027', 'Jul 2027'];
  const OLDER = { converted: 39, closed: 22 };
  const ecCard = (e) => {
    const p = e.pkg ? PKGS[e.pkg] : null, i = ORDER.indexOf(e.status);
    return `<article class="ad-ec-card ad-fade" draggable="${ec.g === 'status'}" data-ecc="${e.ref}" aria-current="${ec.sel === e.ref}">
      <div class="top">${cav(e.name, 30)}<span><b>${esc(e.name)}</b><small class="mono">${e.ref}</small></span>${ec.g === 'status' ? '<span class="grip" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>' : eChip(e.status)}</div>
      <div class="what">${p ? p.name : 'General question'}${e.month ? ` · ${e.month}` : ''} · ${party(e.a, e.c)}</div>
      <div class="row"><span class="a-chip mute">${TYPES[e.type]}</span>${waitWord(e) ? `<span class="a-chip ${waitTone(e)}">${waitWord(e)}</span>` : ''}${e.fu ? `<span class="a-chip info">Follow up ${e.fu}</span>` : ''}${e.reply ? '<span class="a-chip warn">They replied</span>' : ''}${e.booking ? `<span class="a-chip ok mono">${e.booking}</span>` : ''}<span class="val">${estValue(e) ? inr(estValue(e)) : '<span class="muted">No package</span>'}</span></div>
      <div class="mv">${ec.g === 'status' && i > 0 && i < 3 ? `<button data-ecm="${e.ref}" data-to="${ORDER[i - 1]}" aria-label="Move back to ${ESTATUS[ORDER[i - 1]][1]}">${ICON.chevL}${ESTATUS[ORDER[i - 1]][1]}</button>` : ''}
        ${ec.g === 'status' && i < 2 ? `<button data-ecm="${e.ref}" data-to="${ORDER[i + 1]}">${ESTATUS[ORDER[i + 1]][1]}${ICON.chevR}</button>` : ''}
        ${ec.g === 'status' && i < 2 ? `<button data-ecm="${e.ref}" data-to="closed" aria-label="Close">Close</button>` : ''}
        <button class="open" data-eco="${e.ref}">Open</button></div></article>`;
  };
  const renderEnqC = () => {
    const pool = ENQ.filter((e) => !ec.pkg || e.pkg === ec.pkg);
    let cols;
    if (ec.g === 'status') cols = ORDER.map((s) => ({ id: s, h: `${ESTATUS[s][1]}`, chip: ESTATUS[s][0], items: pool.filter((e) => e.status === s).sort((a, b) => b.wait - a.wait), more: OLDER[s] || 0 }));
    else cols = [...MONTHS.map((m) => ({ id: m, h: m, chip: 'info', items: pool.filter((e) => e.month === m && (e.status === 'new' || e.status === 'contacted')), more: 0 })), { id: 'none', h: 'No month given', chip: 'mute', items: pool.filter((e) => !e.month && (e.status === 'new' || e.status === 'contacted')), more: 0 }].filter((c) => c.items.length);
    const open = ENQ.filter((e) => e.status === 'new' || e.status === 'contacted');
    const pipe = open.reduce((s, e) => s + estValue(e), 0);
    const sel = eBy(ec.sel);
    const main = `<div class="ad ad-ec ad-fade">
      <div class="a-head"><h1>Enquiries</h1><div class="sub">A sales pipeline: drag a card to the next stage, or use its buttons · value = package price × travellers</div>
        <div class="acts"><select class="a-select" id="ec-pkg" aria-label="Package"><option value="">Every package</option>${Object.entries(PKGS).map(([k2, p]) => `<option value="${k2}" ${ec.pkg === k2 ? 'selected' : ''}>${p.name}</option>`).join('')}</select>
          <div class="a-seg" role="group" aria-label="Columns">${[['status', 'By stage'], ['month', 'By travel month']].map(([g, l]) => `<button data-ecg="${g}" aria-pressed="${ec.g === g}">${l}</button>`).join('')}</div></div></div>
      <div class="ad-ec-fun">
        <div><span class="k">Open pipeline</span><span class="v num">${lakh(pipe)}</span><span class="d">${open.length} open enquiries</span></div>
        <div><span class="k">Received · all time</span><span class="v num">76</span><span class="d">14 this week, up 5</span></div>
        <div><span class="k">Converted</span><span class="v num">41</span><span class="d">54% of those answered</span></div>
        <div><span class="k">First reply</span><span class="v num">2 h 10 min</span><span class="d">median · 30 days</span></div></div>
      ${ec.flash ? `<div class="a-note" role="status">${ICON.info}<span>${ec.flash}</span></div>` : ''}
      <div class="ad-ec-board" style="--cols:${cols.length}">${cols.map((c) => `<section class="ad-ec-col" data-ecdrop="${c.id}" aria-label="${c.h}">
          <div class="ad-ec-ch"><h2><span class="a-chip ${c.chip}">${c.h}</span></h2><span class="n num">${c.items.length + c.more}</span><span class="v">${lakh(c.items.reduce((s, e) => s + estValue(e), 0))}</span></div>
          ${c.items.map(ecCard).join('') || '<div class="ad-ec-more">Drop a card here</div>'}
          ${c.more ? `<div class="ad-ec-more">${c.more} older · <a href="#" class="lnk">show</a></div>` : ''}</section>`).join('')}</div>
      ${sel ? `<section class="a-card"><div class="a-card-h">${cav(sel.name, 32)}<h2>${esc(sel.name)}</h2>${eChip(sel.status)}<span class="muted mono">${sel.ref} · received ${sel.recv}</span><div class="acts"><button class="a-btn ghost sm" data-eco="">${ICON.x}Close</button></div></div>
        <div class="a-card-b ad-ec-drawer"><div style="display:grid;gap:10px">${sel.changes ? `<p class="msg"><b>Changes asked for</b>${esc(sel.changes)}</p>` : ''}${sel.msg ? `<p class="msg"><b>Message</b>${esc(sel.msg)}</p>` : ''}${sel.reply ? `<p class="msg"><b>Their latest · ${sel.reply[0]}</b>${esc(sel.reply[1])}</p>` : ''}${!sel.msg && !sel.changes ? '<p class="msg"><b>Message</b>No message, just the form.</p>' : ''}
            ${sel.notes.map(([t, x]) => `<span style="font-size:12.5px"><b>Note · ${t}:</b> ${esc(x)}</span>`).join('')}</div>
          <div style="display:grid;gap:10px;align-content:start"><dl class="a-kv"><div><dt>Mobile</dt><dd>+91 ${sel.ph}</dd></div><div><dt>Email</dt><dd style="word-break:break-all">${sel.em}</dd></div>${sel.dates ? `<div><dt>Dates</dt><dd>${sel.dates}</dd></div>` : ''}${sel.budget ? `<div><dt>Budget</dt><dd>${inr(sel.budget)} pp</dd></div>` : ''}</dl>
            <div class="acts"><a href="#" class="a-btn sm">${ICON.phone}Call</a><a href="#" class="a-btn ghost sm">${ICON.wa}WhatsApp</a><a href="#" class="a-btn ghost sm">${ICON.mail}Reply</a>${sel.booking ? '' : `<a href="#" class="a-btn act sm">${ICON.ticket}Convert to booking</a>${V25}`}</div></div></div></section>` : ''}
    </div>`;
    return TS.adminShell('Enquiries', main);
  };
  const ecMove = (ref, to) => {
    const e = eBy(ref); if (!e || e.status === to) return;
    e.status = to; if (to !== 'new') e.wait = 0;
    const p = e.pkg ? PKGS[e.pkg] : null;
    ec.flash = to === 'converted' ? `${esc(e.name)} moved to Converted. <b>Convert to booking</b> would open the counter pre-filled with ${p ? p.name : 'the enquiry'}, ${party(e.a, e.c)}, and link the booking here. ${V25}`
      : to === 'closed' ? `${esc(e.name)} closed. It stays searchable, and a new enquiry from the same number links back to it.`
      : `${esc(e.name)} moved to ${ESTATUS[to][1]}.`;
  };
  const mountEnqC = (site, rerender) => {
    site.querySelectorAll('[data-ecg]').forEach((b) => b.addEventListener('click', () => { ec.g = b.dataset.ecg; ec.flash = ''; rerender(); }));
    const pk = site.querySelector('#ec-pkg'); if (pk) pk.addEventListener('change', () => { ec.pkg = pk.value; rerender(); });
    site.querySelectorAll('[data-ecm]').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); ecMove(b.dataset.ecm, b.dataset.to); rerender(); }));
    site.querySelectorAll('[data-eco]').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); ec.sel = b.dataset.eco; rerender(); }));
    site.querySelectorAll('[data-ecc]').forEach((c) => {
      c.addEventListener('dragstart', (ev) => { ev.dataTransfer.setData('text/plain', c.dataset.ecc); ev.dataTransfer.effectAllowed = 'move'; c.classList.add('drag'); });
      c.addEventListener('dragend', () => c.classList.remove('drag'));
    });
    if (ec.g === 'status') site.querySelectorAll('[data-ecdrop]').forEach((col) => {
      col.addEventListener('dragover', (ev) => { ev.preventDefault(); col.classList.add('over'); });
      col.addEventListener('dragleave', () => col.classList.remove('over'));
      col.addEventListener('drop', (ev) => { ev.preventDefault(); col.classList.remove('over'); const r = ev.dataTransfer.getData('text/plain'); if (r) { ecMove(r, col.dataset.ecdrop); rerender(); } });
    });
  };

  /* =====================================================================
     ENQUIRIES D · Call sheet
     ===================================================================== */
  const CALLS = [
    { ref: 'TS-4MW8TE', when: 'Now', late: true, why: 'Group enquiry · waiting 3 h', pts: ['14 adults, 11–16 Dec, budget ₹30,000 each', 'One coach for the whole trip', 'Half-day conference room in Udaipur', 'Needs a GST invoice'] },
    { ref: 'TS-7F3K2Q', when: 'Now', late: true, why: 'Customised Munnar · waiting 48 min', pts: ['2 adults and a 6-year-old, around 14–19 Nov, ₹30,000 each', 'Two houseboat nights instead of one', 'A Kochi city day before the flight home', 'Asks if the houseboat is safe for a child, and for a vegetarian cook'] },
    { ref: 'TS-2HD6RB', when: 'Now', why: 'From the concierge · waiting 21 min', pts: ['2 adults, 2 children, last week of December', 'Wants snow almost certain', 'Asked about heated rooms in Manali'] },
    { ref: 'TS-8QK3NV', when: 'Now', why: 'Standard enquiry · waiting 12 min', pts: ['2 adults, 20–23 Nov', 'No message: ask what made them pick North Goa', 'Mention the sunset cruise and Anjuna market'] },
    { ref: 'TS-2TQ8LU', when: 'Overdue', late: true, why: 'She replied on 24 Sep, still unanswered', pts: ['Bachelorette trip for 9, 16–19 Jan', 'Wants the whole floor at Acron Waterfront', 'Ready to pay a deposit this week'] },
    { ref: 'TS-9P2LXA', when: '6:00 pm', why: 'Callback request · asked for after 6 pm', pts: ['How the oxygen on board works', 'Mother is 62: is Khardung La OK for her?', 'Enquired once before, Mar 2026 (closed)'] },
  ];
  const LATER = [['TS-5JT9WC', 'Mon 28 Sep', 'Send the Kheerganga quote with a porter'], ['TS-3ZC7MP', 'Thu 1 Oct', 'Tso Moriri add-on quote sent 24 Sep']];
  const OUTCOMES = [['reached', 'Spoke to them'], ['noans', 'No answer'], ['later', 'Call back later'], ['book', 'Ready to book'], ['no', 'Not interested']];
  const FU = ['In 2 hours', 'Tomorrow 11 am', 'Thu 1 Oct', 'Mon 5 Oct'];
  const ed = { cur: 'TS-4MW8TE', out: '', fu: '', note: '', err: '', dep: '', a: 0, c: 0, pay: 'dep', done: [] };
  const edReset = (ref) => { const e = eBy(ref); ed.cur = ref; ed.out = ''; ed.fu = ''; ed.note = ''; ed.err = ''; ed.dep = ''; ed.a = e ? e.a : 2; ed.c = e ? e.c : 0; ed.pay = 'dep'; };
  edReset('TS-4MW8TE');
  const edQueue = () => CALLS.filter((c) => !ed.done.some((d) => d.ref === c.ref));
  const renderEnqD = () => {
    const Q = edQueue(), c = CALLS.find((x) => x.ref === ed.cur) || Q[0];
    const total = CALLS.length, doneN = ed.done.length;
    let card = '<div class="ad-ed-card"><div class="a-empty"><b style="display:block;font-size:18px;color:var(--ink)">All calls done for today.</b>Next up: Manoj Tiwari on Mon 28 Sep.</div></div>';
    if (c) {
      const e = eBy(c.ref), p = e.pkg ? PKGS[e.pkg] : null;
      const deps = Object.entries(DEPS).filter(([, x]) => x.pkg === e.pkg && dayNo(x.d) > 0);
      const dep = ed.dep && DEPS[ed.dep] ? DEPS[ed.dep] : null;
      const pax = ed.a + ed.c, price = p ? p.from * pax : 0, dep25 = Math.round(price * 0.25);
      const tooMany = dep && pax > left(dep);
      const canDeposit = !dep || dayNo(dep.d) > 30;
      card = `<div class="ad-ed-card ad-fade">
        <div class="ad-ed-who">${cav(e.name, 56)}<h2>${esc(e.name)}</h2>
          <span class="meta"><span class="mono">${e.ref}</span> · ${p ? p.name : 'General'} · ${party(e.a, e.c)} ${eChip(e.status)}<span class="a-chip mute">${TYPES[e.type]}</span></span>
          <div class="ad-ed-dial"><a class="a-btn call" href="tel:+91${e.ph.replace(/\s/g, '')}">${ICON.phone}Call <span class="num">${e.ph}</span></a><a class="a-btn ghost call" href="#">${ICON.wa}WhatsApp</a><a class="a-btn ghost" href="#" style="align-self:center">${ICON.mail}Email</a></div></div>
        <div class="ad-ed-sec"><p class="ad-eyebrow">Talk about</p><ol class="ad-ed-pts">${c.pts.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
          ${e.reply ? `<p class="ad-ed-quote"><b>Her last message, ${e.reply[0]}:</b> “${esc(e.reply[1])}”</p>` : e.msg ? `<p class="ad-ed-quote">“${esc(e.msg)}”</p>` : ''}</div>
        <div class="ad-ed-sec"><p class="ad-eyebrow">How did it go?</p>
          <div class="ad-ed-out" role="group" aria-label="Call outcome">${OUTCOMES.map(([v, l]) => `<button data-edo="${v}" class="${v === 'book' ? 'book' : ''}" aria-pressed="${ed.out === v}">${l}</button>`).join('')}</div>
          ${ed.err ? `<span class="ad-ed-err" role="alert">${ed.err}</span>` : ''}
          ${ed.out && ed.out !== 'book' && ed.out !== 'no' ? `<p class="ad-eyebrow" style="margin-top:4px">Next follow-up</p><div class="ad-ed-fu" role="group" aria-label="Follow up">${FU.map((f) => `<button data-edf="${f}" aria-pressed="${ed.fu === f}">${f}</button>`).join('')}</div>` : ''}
          ${ed.out === 'book' ? `<div class="ad-ed-qb ad-fade"><h3>${ICON.ticket.replace('class="ic"', 'class="ic" style="width:18px;height:18px"')}Quote while you are on the call ${V25}</h3>
              <div class="a-row2"><div class="a-field"><label for="ed-dep">Departure</label><select id="ed-dep"><option value="">Pick a date</option>${deps.map(([id, x]) => `<option value="${id}" ${ed.dep === id ? 'selected' : ''} ${left(x) > 0 ? '' : 'disabled'}>${dt(x.d)} · ${left(x) > 0 ? `${left(x)} seats left` : 'sold out'}</option>`).join('')}<option value="custom" ${ed.dep === 'custom' ? 'selected' : ''}>Another date, on request</option></select></div>
                <div class="a-field"><label>Travellers</label><div class="ad-ed-pax"><span>Adults <span class="ad-ed-step"><button data-edq="a-" aria-label="Fewer adults">${ICON.minus}</button><span class="num">${ed.a}</span><button data-edq="a+" aria-label="More adults">${ICON.plus}</button></span></span>
                  <span>Children <span class="ad-ed-step"><button data-edq="c-" aria-label="Fewer children">${ICON.minus}</button><span class="num">${ed.c}</span><button data-edq="c+" aria-label="More children">${ICON.plus}</button></span></span></div></div></div>
              ${tooMany ? `<span class="ad-ed-err">Only ${left(dep)} seats left on ${dt(dep.d)}. Split the group or offer a private date.</span>` : ''}
              <div class="a-field"><label>Settle</label><div class="a-seg" role="group" aria-label="Settle">${[['link', 'Payment link · full'], ['dep', 'Link · 25% deposit'], ['paid', 'Paid now']].map(([v, l]) => `<button data-edp="${v}" aria-pressed="${ed.pay === v}" ${v === 'dep' && !canDeposit ? 'disabled' : ''}>${l}</button>`).join('')}</div>
                <span class="hint">${ed.pay === 'paid' ? 'Cash, UPI or bank with a reference: confirms at once and sends the receipt.' : 'Seats held 24 h. Copy the link, send it on WhatsApp or by email.'}${!canDeposit ? ' Inside 30 days only full payment is allowed.' : ''}</span></div>
              <div class="ad-ed-tot"><div><span>${p ? p.name : 'Package'} · ${pax} × ${p ? inr(p.from) : ''}</span><span class="num">${inr(price)}</span></div>
                <div class="big"><span>${ed.pay === 'dep' && canDeposit ? 'Deposit now' : 'To pay now'}</span><span class="num">${inr(ed.pay === 'dep' && canDeposit ? dep25 : price)}</span></div>
                ${ed.pay === 'dep' && canDeposit ? `<div class="muted"><span>Balance ${dep ? `due ${dt(addDays(dep.d, -30))}` : '30 days before departure'}</span><span class="num">${inr(price - dep25)}</span></div>` : ''}
                <span class="muted" style="font-size:12px">The counter recomputes the price on the server, with deals and early-bird.</span></div></div>` : ''}
          <div class="a-field"><label for="ed-note">Note <span class="muted" style="font-weight:600">· only you see this</span></label><input id="ed-note" value="${esc(ed.note)}" placeholder="What they said, what you promised"></div></div>
        <div class="ad-ed-save">${ed.out === 'book' ? `<button class="a-btn act" data-edsave ${tooMany || !ed.dep ? 'disabled' : ''}>${ICON.ticket}Convert to booking and next</button>` : `<button class="a-btn" data-edsave>${ICON.check}Save and next call</button>`}<button class="a-btn ghost sm" data-edskip>Skip for now</button></div>
      </div>`;
    }
    const qItem = (x, i) => { const e = eBy(x.ref); return `<li><button data-edpick="${x.ref}" aria-current="${c && c.ref === x.ref}">${cav(e.name, 30)}<span><b>${esc(e.name)}</b><small>${x.why}</small></span><span class="when ${x.late ? 'late' : ''}">${x.when === 'Now' && i === 0 ? 'Up next' : x.when}</span></button></li>`; };
    const main = `<div class="ad ad-ed ad-fade">
      <div class="a-head"><h1>Calls</h1><div class="sub">Enquiries as a call list, built for the phone in your hand · longest waiting first, set times in their slot</div>
        <div class="acts"><a href="#" class="a-btn ghost sm">${ICON.inbox}All enquiries</a></div></div>
      <div class="ad-ed-top"><span><b>${doneN}</b> of ${total} calls done today</span><span class="a-meter" style="--v:${(doneN / total) * 100}%" aria-hidden="true"></span>
        <span class="muted">${ed.done.filter((d) => d.out === 'book').length} converted · ${ed.done.filter((d) => d.out === 'noans').length} no answer</span></div>
      <div class="ad-ed-grid">
        ${card}
        <aside class="ad-ed-q">
          <section class="a-card flush"><div class="a-card-h"><h2>Queue</h2><span class="muted" style="font-size:12.5px;font-weight:600">${Q.length} left today</span></div>
            <div class="a-card-b"><ol class="ad-ed-ql">${Q.map(qItem).join('') || '<li><div class="a-empty">Queue empty.</div></li>'}</ol></div></section>
          <section class="a-card flush"><div class="a-card-h"><h2>Later this week</h2></div>
            <div class="a-card-b"><ol class="ad-ed-ql">${LATER.map(([r, w, why]) => { const e = eBy(r); return `<li><button tabindex="-1" style="cursor:default">${cav(e.name, 30)}<span><b>${esc(e.name)}</b><small>${why}</small></span><span class="when">${w}</span></button></li>`; }).join('')}</ol></div></section>
          ${ed.done.length ? `<section class="a-card flush"><div class="a-card-h"><h2>Done today</h2></div><div class="a-card-b"><ol class="ad-ed-ql ad-ed-done">${ed.done.map((d) => `<li><span>${esc(eBy(d.ref).name)}${d.fu ? `<small class="muted" style="display:block;font-size:12px">Follow up ${d.fu}</small>` : ''}</span><span class="a-chip ${d.out === 'book' ? 'ok' : d.out === 'no' ? 'mute' : d.out === 'noans' ? 'warn' : 'info'}">${OUTCOMES.find((o) => o[0] === d.out)[1]}</span></li>`).join('')}</ol></div></section>` : ''}
        </aside>
      </div>
    </div>`;
    return TS.adminShell('Enquiries', main);
  };
  const mountEnqD = (site, rerender) => {
    const note = site.querySelector('#ed-note'); if (note) note.addEventListener('input', () => { ed.note = note.value; });
    site.querySelectorAll('[data-edo]').forEach((b) => b.addEventListener('click', () => { ed.out = b.dataset.edo; ed.err = ''; if (ed.out === 'noans' && !ed.fu) ed.fu = 'In 2 hours'; rerender(); }));
    site.querySelectorAll('[data-edf]').forEach((b) => b.addEventListener('click', () => { ed.fu = b.dataset.edf; rerender(); }));
    site.querySelectorAll('[data-edp]').forEach((b) => b.addEventListener('click', () => { ed.pay = b.dataset.edp; rerender(); }));
    site.querySelectorAll('[data-edq]').forEach((b) => b.addEventListener('click', () => {
      const [w, s] = [b.dataset.edq[0], b.dataset.edq[1]];
      ed[w] = Math.max(w === 'a' ? 1 : 0, Math.min(20, ed[w] + (s === '+' ? 1 : -1))); rerender();
    }));
    const dep = site.querySelector('#ed-dep'); if (dep) dep.addEventListener('change', () => { ed.dep = dep.value; const x = DEPS[ed.dep]; if (x && dayNo(x.d) <= 30 && ed.pay === 'dep') ed.pay = 'link'; rerender(); });
    site.querySelectorAll('[data-edpick]').forEach((b) => b.addEventListener('click', () => { edReset(b.dataset.edpick); rerender(); }));
    const next = () => { const Q = edQueue(); const i = Q.findIndex((x) => x.ref === ed.cur); const n = Q[i + 1] || Q[0]; return n ? n.ref : ''; };
    const skip = site.querySelector('[data-edskip]'); if (skip) skip.addEventListener('click', () => { const n = next(); if (n) edReset(n); rerender(); });
    const save = site.querySelector('[data-edsave]');
    if (save) save.addEventListener('click', () => {
      if (!ed.out) { ed.err = 'Pick how the call went first.'; rerender(); return; }
      const e = eBy(ed.cur);
      e.status = ed.out === 'book' ? 'converted' : ed.out === 'no' ? 'closed' : ed.out === 'noans' ? e.status : 'contacted';
      if (e.status !== 'new') e.wait = 0;
      if (ed.note.trim()) e.notes.push(['Sun 27 Sep, 4:20 pm', ed.note.trim()]);
      ed.done.push({ ref: ed.cur, out: ed.out, fu: ed.out === 'book' || ed.out === 'no' ? '' : ed.fu });
      const n = edQueue()[0]; if (n) edReset(n.ref); else { ed.cur = ''; }
      rerender();
    });
  };

  TS.addVariants('enquiries', [
    { id: 'B', name: 'Conversations', render: renderEnqB, mount: mountEnqB,
      tradeoff: 'Reading is fast and personal, but you lose the table’s columns (month, pax, type side by side), so scanning 76 enquiries for patterns moves to Reports.',
      note: 'An email client, not a table. Enquiries are <b>conversations</b>, sorted by who owes the next move: <b>Waiting on you</b> (new ones, and Sana Mirza, who replied on 24 Sep), <b>Waiting on them</b> and <b>Done</b>. The middle pane is the thread: their form as the first message, system events as small pills, your emails on the right in cobalt and private notes in dashed marigold. The composer sits at the bottom with reply or note, one-tap snippets that know the package (price, dates, v2.5 deposit) and the itinerary attached. Sending moves a New enquiry to Contacted. J and K move through the list, R replies, N writes a note. The right rail holds contact details and <b>Convert to booking</b>. On a phone it is list then thread, with a back button.' },
    { id: 'C', name: 'Pipeline board', render: renderEnqC, mount: mountEnqC,
      tradeoff: 'Great for seeing where money is stuck, weaker for actually replying: reading and writing happen in a drawer below the board.',
      note: 'Enquiries as a <b>sales pipeline</b>, as in a CRM. Four stages (New, Contacted, Converted, Closed), each with a count and the rupee value it holds (package price × travellers), under a strip with the open pipeline, conversion rate and median first-reply time. Drag a card to the next stage, or use its buttons (they work by keyboard and on a phone). Dropping on Converted explains the v2.5 hand-off to the counter. Switch to <b>By travel month</b> to see open leads as a season plan: December is heavy with Devansh’s group of 14. Filter by package. Open shows the message and actions in a drawer. On a phone each stage is a swipeable column.' },
    { id: 'D', name: 'Call sheet', render: renderEnqD, mount: mountEnqD,
      tradeoff: 'It is the fastest way to clear first calls from a phone, but it only covers enquiries that need a call; email-only ones and history live on the full list.',
      note: 'For an owner who sells on the phone. One person fills the screen: <b>Up next</b> with a big Call button (tel: link), WhatsApp, and a numbered list of <b>what to talk about</b>, taken from their form. After the call, tap how it went (Spoke to them, No answer, Call back later, Ready to book, Not interested), pick a follow-up, add a note, then <b>Save and next call</b>. Picking <b>Ready to book</b> opens a v2.5 quote builder inside the card: departure with seats left, adult and child steppers capped at those seats, then a payment link, a 25% deposit link or paid now, with the total and balance date. On the right: the queue (longest waiting, Sana’s unanswered reply, Ritika’s 6 pm slot), later this week, and the calls done today with their outcomes. On a phone the queue drops below the card.' },
  ], css2);
})();
