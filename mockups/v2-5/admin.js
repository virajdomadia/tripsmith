/* Admin kit + three admin styles (A Ink rail · B Command · C Operator).
   Every admin screen is written ONCE with the kit classes below and TS.adminShell(active, html);
   the global "Admin style" switch sets data-dir on .adm and restyles all of them.

   KIT (use only these for admin chrome; screen-specific CSS may add layout on top):
   .a-head > h1 + .sub + .acts            page header (title, one-line context, actions)
   .a-btn[.act|.ghost|.sm|.danger]         buttons: cobalt primary · marigold action · ghost · small · danger
   .a-card > .a-card-h (h2 + .acts) + .a-card-b     a surface; .a-card.flush has no body padding (tables)
   .a-kpis > .a-kpi > .k (label) .v (value, .num) .d(.up|.down) (delta/context)
   .a-tw > table.a-table   th/td; td.num / th.num right-aligned; tr.sel selected; tr.dim muted
   .a-chip.ok|.warn|.bad|.info|.mute|.pri  status pill (always with a word, never colour alone)
   .a-tabs > button[aria-selected=true] (+ .ct count)
   .a-bar > .a-search (input + icon) .a-select .a-seg (segmented: button[aria-pressed])
   .a-field > label + input|select|textarea + .hint|.err ; .a-row2 / .a-row3 field grids
   .a-split  list (left) + .a-panel detail (right, sticky)
   .a-tl > .a-tl-i (.t time, .w who, .x text)   timeline
   .a-meter[style="--v:62%"] (+ .held segment via --h)   fill bar
   .a-kv > div > dt + dd                    label/value list
   .a-empty                                 empty state
   .a-note                                  inline notice (info)
*/
(() => {
  const { ICON } = window.TS;
  const NAV = [
    ['Dashboard', 'grid'], ['Calendar', 'cal', 'new'], ['Bookings', 'ticket', 3], ['Enquiries', 'inbox', 5],
    ['Packages', 'pkg'], ['Destinations', 'pin'], ['Reviews', 'quote', 2], ['Coupons', 'percent'], ['Reports', 'chart', 'new'],
  ];
  const badge = (c) => (c === 'new' ? '<span class="nw">NEW</span>' : c ? `<span class="ct num">${c}</span>` : '');
  const TODAY_STRIP = `<div class="a-today" aria-label="Today">
      <span class="lab">Sun 27 Sep</span>
      <span><b class="num">2</b> departures this week</span>
      <span><b class="num">3</b> holds expire today</span>
      <span><b class="num">₹1.18 L</b> balances due in 7 days</span>
      <span><b class="num">9</b> travellers missing details</span>
      <span class="live"><i></i>Live</span></div>`;

  const shells = {
    A: (active, main) => `<aside class="sb"><a class="logo" href="#"><i></i>Tripsmith</a><nav>${NAV.map(([l, ic, c]) =>
        `<a href="#" class="nv ${l === active ? 'on' : ''}">${ICON[ic]}<span class="lbl">${l}</span>${badge(c)}</a>`).join('')}</nav>
        <a href="#" class="nv view">${ICON.eye}<span class="lbl">View site</span></a>
        <div class="who"><i>VD</i><span><b>Viraj D.</b>Owner</span></div></aside><div class="main">${main}</div>`,
    B: (active, main) => `<aside class="sb"><a class="logo" href="#" aria-label="Tripsmith"><i></i></a><nav>${NAV.map(([l, ic, c]) =>
        `<a href="#" class="nv ${l === active ? 'on' : ''}" title="${l}">${ICON[ic]}<span class="lbl">${l}</span>${c && c !== 'new' ? `<span class="dot num">${c}</span>` : ''}</a>`).join('')}</nav>
        <div class="who"><i>VD</i></div></aside>
        <div class="col"><div class="tb"><div class="crumb">Admin <span>/</span> <b>${active}</b></div>
          <label class="gsearch">${ICON.search}<input id="adm-gsearch" placeholder="Search bookings, people, packages" aria-label="Search"><kbd>Ctrl K</kbd></label>
          <a href="#" class="a-btn sm act">${ICON.plus}New booking</a><span class="bell" aria-label="3 alerts">${ICON.info}<i></i></span></div>
          <div class="main">${main}</div></div>`,
    C: (active, main) => `<div class="col"><header class="tn"><a class="logo" href="#"><i></i>Tripsmith <small>Operator</small></a><nav>${NAV.map(([l, ic, c]) =>
        `<a href="#" class="nv ${l === active ? 'on' : ''}">${l}${c && c !== 'new' ? ` <span class="ct num">${c}</span>` : ''}</a>`).join('')}</nav>
        <span class="who"><i>VD</i></span></header>${TODAY_STRIP}<div class="main">${main}</div></div>`,
  };

  window.TS.adminDir = 'A';
  window.TS.adminShell = (active, main) => {
    const d = window.TS.adminDir;
    return `<div class="adm" data-dir="${d}">${shells[d](active, main)}</div>`;
  };

  const css = `
  /* ---------- kit: shared geometry ---------- */
  .adm { --a-bg: var(--bg2); --a-surf: #fff; --a-line: var(--line); --a-r: 16px; --a-pad: 18px; --a-fs: 14px; --a-th: #5E6B76;
    --ink-soft: #B9C3CC; --ink-line: #2A3945; min-height: 780px; background: var(--a-bg); font-size: var(--a-fs); }
  .adm .main { padding: 22px 28px 44px; display: grid; gap: 18px; align-content: start; min-width: 0; }
  .adm .logo i { width: 26px; height: 26px; }
  .a-head { display: flex; align-items: end; gap: 10px 16px; flex-wrap: wrap; }
  .a-head h1 { font-size: 26px; }
  .a-head .sub { color: var(--mute); font-size: 14px; font-weight: 600; flex-basis: 100%; order: 3; margin-top: -4px; }
  .a-head .acts { margin-left: auto; display: flex; gap: 8px; flex-wrap: wrap; }
  .a-btn { display: inline-flex; align-items: center; gap: 7px; padding: 9px 15px; border-radius: 10px; font: 700 13.5px "DM Sans", sans-serif; border: 1.5px solid transparent;
    background: var(--pri); color: #fff; text-decoration: none; cursor: pointer; white-space: nowrap; transition: background .2s, border-color .2s, transform .2s var(--ease); }
  .a-btn:hover { background: var(--pri-ink); }
  .a-btn:active { transform: translateY(1px); }
  .a-btn .ic { width: 16px; height: 16px; }
  .a-btn.act { background: var(--act); color: var(--ink); } .a-btn.act:hover { background: var(--act-ink); }
  .a-btn.ghost { background: var(--a-surf); color: var(--ink); border-color: var(--a-line); } .a-btn.ghost:hover { border-color: var(--ink); }
  .a-btn.danger { background: var(--a-surf); color: #B42318; border-color: #F3C9C4; }
  .a-btn.sm { padding: 6px 11px; font-size: 12.5px; border-radius: 8px; }
  .a-btn[disabled] { opacity: .45; pointer-events: none; }
  .a-card { background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); min-width: 0; }
  .a-card-h { display: flex; align-items: center; gap: 10px; padding: 14px var(--a-pad) 0; flex-wrap: wrap; }
  .a-card-h h2 { font-size: 16px; letter-spacing: -.02em; }
  .a-card-h .acts { margin-left: auto; display: flex; gap: 6px; flex-wrap: wrap; }
  .a-card-b { padding: 14px var(--a-pad) var(--a-pad); }
  .a-card.flush .a-card-b { padding: 10px 0 0; }
  .a-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
  .a-kpi { background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); padding: 14px 16px; display: grid; gap: 4px; }
  .a-kpi .k { font-size: 12px; font-weight: 700; color: var(--mute); letter-spacing: .02em; }
  .a-kpi .v { font-size: 26px; font-weight: 800; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
  .a-kpi .d { font-size: 12.5px; font-weight: 600; color: var(--mute); } .a-kpi .d.up { color: var(--ok); } .a-kpi .d.down { color: #B42318; }
  .a-tw { overflow-x: auto; }
  .a-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  .a-table th { text-align: left; font-size: 11.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--a-th); font-weight: 700; padding: 8px 12px; border-bottom: 1px solid var(--a-line); white-space: nowrap; }
  .a-table td { padding: 11px 12px; border-bottom: 1px solid var(--a-line); vertical-align: middle; }
  .a-table th:first-child, .a-table td:first-child { padding-left: var(--a-pad); } .a-table th:last-child, .a-table td:last-child { padding-right: var(--a-pad); }
  .a-table tr:last-child td { border-bottom: 0; }
  .a-table tbody tr:hover { background: color-mix(in srgb, var(--pri) 4%, transparent); }
  .a-table tr.sel { background: var(--pri-soft); } .a-table tr.dim td { color: var(--mute); }
  .a-table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .a-table td b { font-weight: 700; } .a-table td small { display: block; color: var(--mute); font-size: 12px; }
  .a-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 800; padding: 3px 9px; border-radius: 999px; white-space: nowrap; background: #EEF0F2; color: #4D5A65; }
  .a-chip.ok { background: var(--ok-soft); color: var(--ok); } .a-chip.warn { background: var(--warn-soft); color: var(--warn); }
  .a-chip.bad { background: #FDECEA; color: #B42318; } .a-chip.info, .a-chip.pri { background: var(--pri-soft); color: var(--pri-ink); }
  .a-chip .ic { width: 12px; height: 12px; }
  .a-tabs { display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid var(--a-line); }
  .a-tabs button { font: 700 13.5px "DM Sans", sans-serif; background: none; border: 0; padding: 9px 12px 11px; color: var(--mute); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; display: inline-flex; gap: 6px; align-items: center; }
  .a-tabs button[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--pri); }
  .a-tabs .ct { background: var(--act); color: var(--ink); border-radius: 999px; font-size: 11px; padding: 0 6px; }
  .a-bar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .a-search { display: flex; align-items: center; gap: 8px; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 10px; padding: 0 10px; min-width: 220px; flex: 1 1 220px; max-width: 360px; }
  .a-search .ic { width: 16px; height: 16px; color: var(--mute); }
  .a-search input { border: 0; outline: 0; font: 500 13.5px "DM Sans", sans-serif; padding: 9px 0; width: 100%; background: transparent; color: var(--ink); }
  .a-select { font: 600 13px "DM Sans", sans-serif; border: 1px solid var(--a-line); background: var(--a-surf); border-radius: 10px; padding: 8px 10px; color: var(--ink); }
  .a-seg { display: inline-flex; border: 1px solid var(--a-line); border-radius: 10px; overflow: hidden; background: var(--a-surf); }
  .a-seg button { font: 700 12.5px "DM Sans", sans-serif; background: none; border: 0; padding: 7px 11px; cursor: pointer; color: var(--mute); }
  .a-seg button + button { border-left: 1px solid var(--a-line); }
  .a-seg button[aria-pressed="true"] { background: var(--ink); color: #fff; }
  .a-field { display: grid; gap: 5px; min-width: 0; }
  .a-field label { font-size: 12.5px; font-weight: 700; }
  .a-field input, .a-field select, .a-field textarea { font: 500 14px "DM Sans", sans-serif; border: 1px solid var(--a-line); border-radius: 10px; padding: 9px 11px; background: var(--a-surf); color: var(--ink); width: 100%; }
  .a-field textarea { min-height: 84px; resize: vertical; }
  .a-field input:focus, .a-field select:focus, .a-field textarea:focus { outline: 2px solid var(--pri); outline-offset: 0; border-color: transparent; }
  .a-field .hint { font-size: 12px; color: var(--mute); } .a-field .err { font-size: 12px; color: #B42318; font-weight: 600; }
  .a-row2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .a-row3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .a-split { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 16px; align-items: start; }
  .a-panel { background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); position: sticky; top: 12px; display: grid; }
  .a-panel > section { padding: 14px var(--a-pad); border-top: 1px solid var(--a-line); display: grid; gap: 8px; }
  .a-panel > section:first-child { border-top: 0; }
  .a-tl { display: grid; gap: 0; }
  .a-tl-i { display: grid; grid-template-columns: 74px 16px minmax(0, 1fr); gap: 0 10px; font-size: 13px; padding-bottom: 12px; position: relative; }
  .a-tl-i::before { content: ""; grid-column: 2; grid-row: 1 / span 2; width: 9px; height: 9px; border-radius: 50%; background: var(--pri); margin: 5px auto 0; box-shadow: 0 0 0 3px var(--pri-soft); }
  .a-tl-i::after { content: ""; position: absolute; left: calc(74px + 10px + 7.5px); top: 18px; bottom: 0; width: 1px; background: var(--a-line); }
  .a-tl-i:last-child::after { display: none; }
  .a-tl-i .t { color: var(--mute); font-size: 12px; font-variant-numeric: tabular-nums; grid-row: 1 / span 2; }
  .a-tl-i .w { font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--mute); }
  .a-tl-i .x { grid-column: 3; }
  .a-meter { --v: 50%; --h: 0%; height: 8px; border-radius: 99px; background: #E6EBEF; position: relative; overflow: hidden; }
  .a-meter::before { content: ""; position: absolute; inset: 0 auto 0 0; width: calc(var(--v) + var(--h)); background: color-mix(in srgb, var(--act) 70%, #fff); border-radius: inherit; }
  .a-meter::after { content: ""; position: absolute; inset: 0 auto 0 0; width: var(--v); background: var(--pri); border-radius: inherit; }
  .a-kv { display: grid; gap: 8px; margin: 0; }
  .a-kv > div { display: flex; justify-content: space-between; gap: 12px; font-size: 13.5px; }
  .a-kv dt { color: var(--mute); } .a-kv dd { margin: 0; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }
  .a-empty { text-align: center; color: var(--mute); padding: 30px 16px; font-size: 14px; }
  .a-note { display: flex; gap: 10px; background: var(--pri-soft); color: var(--pri-ink); border-radius: 12px; padding: 10px 12px; font-size: 13px; }
  .a-note .ic { width: 16px; height: 16px; margin-top: 2px; }

  /* ---------- A · Ink rail (evolved from today's shell) ---------- */
  .adm[data-dir="A"] { display: grid; grid-template-columns: 236px minmax(0, 1fr); }
  .adm[data-dir="A"] .sb { background: var(--ink); color: var(--ink-soft); padding: 18px 14px; display: flex; flex-direction: column; gap: 3px; }
  .adm[data-dir="A"] .sb nav { display: grid; gap: 2px; }
  .adm[data-dir="A"] .sb .logo { color: #fff; margin: 0 8px 18px; font-size: 18px; }
  .adm[data-dir="A"] .sb a.nv { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 10px; font-size: 14px; font-weight: 600; text-decoration: none; color: var(--ink-soft); }
  .adm[data-dir="A"] .sb a.nv:hover { background: rgba(255,255,255,.06); color: #fff; }
  .adm[data-dir="A"] .sb a.nv.on { background: var(--pri); color: #fff; }
  .adm[data-dir="A"] .sb a.nv .ct { margin-left: auto; background: var(--act); color: var(--ink); border-radius: 999px; font-size: 11px; font-weight: 800; padding: 1px 7px; }
  .adm[data-dir="A"] .sb a.nv .nw { margin-left: auto; font-size: 10px; font-weight: 800; letter-spacing: .08em; color: var(--act); }
  .adm[data-dir="A"] .sb .view { margin-top: auto; }
  .adm[data-dir="A"] .sb .who { border-top: 1px solid var(--ink-line); padding: 12px 10px 0; display: flex; gap: 10px; align-items: center; font-size: 13px; }
  .adm .who i { width: 32px; height: 32px; border-radius: 50%; background: var(--act); color: var(--ink); display: inline-grid; place-items: center; font-style: normal; font-weight: 800; font-size: 12px; flex: none; }
  .adm[data-dir="A"] .sb .who b { color: #fff; display: block; }

  /* ---------- B · Command (icon rail + top bar, dense) ---------- */
  .adm[data-dir="B"] { --a-bg: #fff; --a-surf: #fff; --a-r: 10px; --a-pad: 14px; --a-fs: 13.5px; --a-line: #E6EAEE;
    display: grid; grid-template-columns: 76px minmax(0, 1fr); }
  .adm[data-dir="B"] .sb { background: var(--bg2); border-right: 1px solid var(--a-line); display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 14px 6px; }
  .adm[data-dir="B"] .sb .logo { margin-bottom: 14px; }
  .adm[data-dir="B"] .sb nav { display: grid; gap: 2px; width: 100%; }
  .adm[data-dir="B"] .sb a.nv { display: grid; justify-items: center; gap: 3px; padding: 8px 2px; border-radius: 10px; text-decoration: none; color: var(--mute); font-size: 10.5px; font-weight: 700; position: relative; }
  .adm[data-dir="B"] .sb a.nv .ic { width: 20px; height: 20px; }
  .adm[data-dir="B"] .sb a.nv:hover { color: var(--ink); background: #fff; }
  .adm[data-dir="B"] .sb a.nv.on { color: var(--pri); background: #fff; box-shadow: 0 1px 0 var(--a-line), 0 0 0 1px var(--a-line); }
  .adm[data-dir="B"] .sb .dot { position: absolute; top: 3px; right: 12px; background: var(--act); color: var(--ink); font-size: 10px; font-weight: 800; border-radius: 99px; padding: 0 5px; }
  .adm[data-dir="B"] .sb .who { margin-top: auto; }
  .adm[data-dir="B"] .col { display: grid; grid-template-rows: auto 1fr; min-width: 0; }
  .adm[data-dir="B"] .tb { display: flex; align-items: center; gap: 12px; padding: 10px 24px; border-bottom: 1px solid var(--a-line); position: sticky; top: 0; background: rgba(255,255,255,.92); backdrop-filter: blur(8px); z-index: 5; }
  .adm[data-dir="B"] .crumb { font-size: 13px; color: var(--mute); white-space: nowrap; } .adm[data-dir="B"] .crumb b { color: var(--ink); } .adm[data-dir="B"] .crumb span { margin: 0 4px; }
  .adm[data-dir="B"] .gsearch { margin-left: auto; display: flex; align-items: center; gap: 8px; background: var(--bg2); border: 1px solid var(--a-line); border-radius: 10px; padding: 0 8px 0 10px; width: min(420px, 40%); }
  .adm[data-dir="B"] .gsearch .ic { width: 16px; height: 16px; color: var(--mute); }
  .adm[data-dir="B"] .gsearch input { border: 0; background: none; outline: 0; font: 500 13px "DM Sans", sans-serif; padding: 8px 0; width: 100%; color: var(--ink); }
  .adm[data-dir="B"] .gsearch kbd { font: 700 11px "DM Sans", sans-serif; color: var(--mute); border: 1px solid var(--a-line); border-radius: 6px; padding: 1px 5px; background: #fff; white-space: nowrap; }
  .adm[data-dir="B"] .bell { position: relative; color: var(--mute); display: grid; } .adm[data-dir="B"] .bell i { position: absolute; top: -1px; right: -1px; width: 7px; height: 7px; border-radius: 50%; background: var(--act); }
  .adm[data-dir="B"] .main { padding: 18px 24px 40px; gap: 14px; }
  .adm[data-dir="B"] .a-head h1 { font-size: 22px; }
  .adm[data-dir="B"] .a-kpi { padding: 10px 14px; } .adm[data-dir="B"] .a-kpi .v { font-size: 22px; }
  .adm[data-dir="B"] .a-table td { padding: 8px 10px; } .adm[data-dir="B"] .a-table th { padding: 7px 10px; background: var(--bg2); }
  .adm[data-dir="B"] .a-card { box-shadow: none; }
  .adm[data-dir="B"] .a-split { grid-template-columns: minmax(0, 1fr) 400px; }

  /* ---------- C · Operator (top nav + live Today strip, hairline sections) ---------- */
  .adm[data-dir="C"] { --a-bg: #fff; --a-surf: #fff; --a-r: 8px; --a-pad: 0px; --a-line: #E1E6EA; }
  .adm[data-dir="C"] .col { display: grid; min-width: 0; align-content: start; }
  .adm[data-dir="C"] .tn { background: var(--ink); color: var(--ink-soft); display: flex; align-items: center; gap: 18px; padding: 0 24px; min-height: 54px; flex-wrap: wrap; }
  .adm[data-dir="C"] .tn .logo { color: #fff; font-size: 17px; } .adm[data-dir="C"] .tn .logo small { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--act); font-weight: 800; margin-left: 4px; }
  .adm[data-dir="C"] .tn nav { display: flex; gap: 2px; flex-wrap: wrap; }
  .adm[data-dir="C"] .tn a.nv { color: var(--ink-soft); text-decoration: none; font-weight: 700; font-size: 13.5px; padding: 17px 10px 15px; border-bottom: 3px solid transparent; }
  .adm[data-dir="C"] .tn a.nv:hover { color: #fff; } .adm[data-dir="C"] .tn a.nv.on { color: #fff; border-bottom-color: var(--act); }
  .adm[data-dir="C"] .tn .ct { color: var(--act); font-weight: 800; }
  .adm[data-dir="C"] .tn .who { margin-left: auto; }
  .adm[data-dir="C"] .a-today { display: flex; gap: 8px 22px; flex-wrap: wrap; align-items: center; padding: 9px 24px; background: #FFF7EA; border-bottom: 1px solid #F3DDB5; font-size: 13px; color: var(--ink2); }
  .adm[data-dir="C"] .a-today .lab { font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--warn); }
  .adm[data-dir="C"] .a-today b { color: var(--ink); }
  .adm[data-dir="C"] .a-today .live { margin-left: auto; display: inline-flex; gap: 6px; align-items: center; font-weight: 700; color: var(--ok); }
  .adm[data-dir="C"] .a-today .live i { width: 7px; height: 7px; border-radius: 50%; background: var(--ok); animation: a-pulse 2s infinite; }
  @keyframes a-pulse { 50% { opacity: .3; } }
  .adm[data-dir="C"] .main { padding: 22px 24px 44px; gap: 26px; }
  .adm[data-dir="C"] .a-head { border-bottom: 1px solid var(--a-line); padding-bottom: 14px; }
  .adm[data-dir="C"] .a-head h1 { font-size: 24px; }
  .adm[data-dir="C"] .a-card { border: 0; border-radius: 0; }
  .adm[data-dir="C"] .a-card-h { border-bottom: 2px solid var(--ink); padding: 0 0 8px; }
  .adm[data-dir="C"] .a-card-h h2 { font-size: 12px; letter-spacing: .12em; text-transform: uppercase; }
  .adm[data-dir="C"] .a-card-b { padding: 12px 0 0; }
  .adm[data-dir="C"] .a-kpis { gap: 0; border: 1px solid var(--a-line); border-radius: 8px; overflow: hidden; }
  .adm[data-dir="C"] .a-kpi { border: 0; border-radius: 0; border-left: 1px solid var(--a-line); margin-left: -1px; }
  .adm[data-dir="C"] .a-table th { padding-left: 8px; padding-right: 8px; } .adm[data-dir="C"] .a-table td { padding: 10px 8px; }
  .adm[data-dir="C"] .a-table th:first-child, .adm[data-dir="C"] .a-table td:first-child { padding-left: 0; }
  .adm[data-dir="C"] .a-panel { border-radius: 8px; --a-pad: 16px; }

  /* ---------- phone (all styles) ---------- */
  @container site (max-width: 700px) {
    .adm[data-dir="A"], .adm[data-dir="B"] { grid-template-columns: 1fr; }
    .adm[data-dir="A"] .sb { flex-direction: row; flex-wrap: wrap; padding: 10px; }
    .adm[data-dir="A"] .sb nav { display: flex; flex-wrap: wrap; }
    .adm[data-dir="A"] .sb .logo { margin: 0 6px 0 4px; }
    .adm[data-dir="A"] .sb a.nv { padding: 6px 9px; font-size: 12.5px; }
    .adm[data-dir="A"] .sb a.nv:not(.on) .lbl, .adm[data-dir="A"] .sb .who, .adm[data-dir="A"] .sb .view { display: none; }
    .adm[data-dir="B"] .sb { order: 2; flex-direction: row; position: sticky; bottom: 0; padding: 4px; border-right: 0; border-top: 1px solid var(--a-line); z-index: 6; }
    .adm[data-dir="B"] .sb .logo, .adm[data-dir="B"] .sb .who { display: none; }
    .adm[data-dir="B"] .sb nav { display: flex; overflow-x: auto; }
    .adm[data-dir="B"] .sb a.nv { min-width: 64px; }
    .adm[data-dir="B"] .tb { padding: 8px 12px; } .adm[data-dir="B"] .gsearch { width: auto; flex: 1; } .adm[data-dir="B"] .gsearch kbd, .adm[data-dir="B"] .crumb, .adm[data-dir="B"] .tb .a-btn { display: none; }
    .adm[data-dir="C"] .tn { padding: 8px 12px; gap: 6px; } .adm[data-dir="C"] .tn nav { overflow-x: auto; flex-wrap: nowrap; width: 100%; order: 3; }
    .adm[data-dir="C"] .tn a.nv { padding: 8px; white-space: nowrap; } .adm[data-dir="C"] .a-today { padding: 8px 12px; gap: 4px 14px; }
    .adm .main, .adm[data-dir="B"] .main, .adm[data-dir="C"] .main { padding: 16px 14px 30px; }
    .a-split { grid-template-columns: 1fr !important; } .a-panel { position: static; }
    .a-row2, .a-row3 { grid-template-columns: 1fr; }
    .a-head h1 { font-size: 22px !important; }
  }`;
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
})();
