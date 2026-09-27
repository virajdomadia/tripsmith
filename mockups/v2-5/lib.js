/* Tripsmith v2.5 mockups — shared kit. Every screen module calls TS.register({...}).
   Data is the real seed (api/content/packages) with prices in rupees; "today" is 27 Sep 2026 (IST). */
(() => {
  const inr = (n) => (n < 0 ? '−' : '') + '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');
  const lakh = (n) => (n >= 1e5 ? '₹' + (n / 1e5).toFixed(n >= 1e7 ? 0 : 2).replace(/\.?0+$/, '') + ' L' : inr(n));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  const svg = (d, w = 2.2) =>
    `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = {
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 2.4),
    x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    minus: svg('<path d="M5 12h14"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>'),
    lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    unlock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>'),
    down: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
    chat: svg('<path d="M4 20l1.4-4A8 8 0 1 1 8.5 19z"/>'),
    heart: svg('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>'),
    cal: svg('<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>'),
    users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6 6 0 0 1 3.5 6"/>'),
    user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    pin: svg('<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>'),
    phone: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
    mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
    link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
    filter: svg('<path d="M4 5h16l-6 8v6l-4-2v-4z"/>'),
    file: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
    chart: svg('<path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3"/>'),
    grid: svg('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
    pkg: svg('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>'),
    ticket: svg('<path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14 5v12"/>'),
    inbox: svg('<path d="M4 13l2.5-8h11L20 13v6H4z"/><path d="M4 13h5l1 2h4l1-2h5"/>'),
    quote: svg('<path d="M5 18h14M5 6h14M5 12h8"/>'),
    percent: svg('<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>'),
    eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    arrowR: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    chevL: svg('<path d="M15 6l-6 6 6 6"/>'),
    chevR: svg('<path d="M9 6l6 6-6 6"/>'),
    chevD: svg('<path d="M6 9l6 6 6-6"/>'),
    rupee: svg('<path d="M7 5h10M7 9h10M9 5c5 0 5 8 0 8H7l7 7"/>'),
    shield: svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'),
    sparkle: svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>'),
    bed: svg('<path d="M3 18V7M3 13h18v5M21 18v-3a3 3 0 0 0-3-3h-7v1"/><circle cx="7" cy="10.5" r="1.5"/>'),
    utensils: svg('<path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 2-3 5s1 4 3 4v9"/>'),
    camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
    wa: '<svg class="ic" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.9s.7-2.1 1-2.4c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.3 0 .5l-.4.6-.3.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.1 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.2z"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z"/></svg>',
  };
  const stars = (r, withNum = true) =>
    `<span class="stars" aria-label="${r} out of 5">${[1, 2, 3, 4, 5].map((i) => `<span class="${i <= Math.round(r) ? '' : 'off'}">${ICON.star}</span>`).join('')}${withNum ? `<b class="num">${r.toFixed(1)}</b>` : ''}</span>`;

  /* ---------- the seed (subset used by the screens) ---------- */
  const PKGS = {
    kasol: { slug: 'kasol-weekend-camp', name: 'Kasol Riverside Weekend', dest: 'Himachal', nights: 2, from: 5499, rating: 4.6, reviews: 38, img: 'img/kasol-1.jpg',
      places: ['Kasol', 'Chalal', 'Manikaran'], hotels: ['Riverside camp · Swiss tents'], meals: '2 breakfasts, 2 dinners', transfers: 'Volvo from Delhi (both ways)', activities: 'Chalal trail, bonfire, Manikaran gurudwara',
      excl: ['Lunches', 'Personal expenses'], leader: 'tenzin' },
    manali: { slug: 'manali-kasol-tosh', name: 'Manali · Kasol · Tosh', dest: 'Himachal', nights: 5, from: 19499, rating: 4.7, reviews: 64, img: 'img/himachal-1.jpg',
      places: ['Manali', 'Kasol', 'Tosh'], hotels: ['Snow Valley Resorts (3★)', 'Parvati Kuteer (3★)', 'Tosh homestay'], meals: 'Breakfast + dinner daily', transfers: 'Private tempo traveller from Delhi', activities: 'Solang, Hadimba, Tosh village walk, Kheerganga optional',
      excl: ['Lunches', 'Solang activities', 'GST on add-ons'], leader: 'tenzin' },
    shimla: { slug: 'shimla-manali-classic', name: 'Shimla–Manali Classic', dest: 'Himachal', nights: 4, from: 18499, rating: 4.4, reviews: 112, img: 'img/himachal-5.jpg',
      places: ['Shimla', 'Kufri', 'Manali'], hotels: ['Hotel Willow Banks (3★)', 'Snow Valley Resorts (3★)'], meals: 'Breakfast + dinner daily', transfers: 'Private sedan from Chandigarh', activities: 'Mall Road, Kufri, Solang, Rohtang permit help',
      excl: ['Lunches', 'Rohtang permit fee'], leader: 'meera' },
    munnar: { slug: 'munnar-alleppey-houseboat', name: 'Munnar & Alleppey Houseboat', dest: 'Kerala', nights: 4, from: 21999, rating: 4.8, reviews: 91, img: 'img/munnar-1.jpg',
      places: ['Munnar', 'Alleppey'], hotels: ['Tea County (4★)', 'Private houseboat (1 night)'], meals: 'All breakfasts, houseboat all meals', transfers: 'Private car from Kochi airport', activities: 'Tea estate walk, Eravikulam, backwater cruise',
      excl: ['Flights', 'Entry tickets'], leader: 'anjali' },
    leh: { slug: 'leh-nubra-pangong', name: 'Leh · Nubra · Pangong', dest: 'Ladakh', nights: 6, from: 32999, rating: 4.9, reviews: 57, img: 'img/ladakh-1.jpg',
      places: ['Leh', 'Nubra', 'Pangong'], hotels: ['The Grand Dragon (4★)', 'Nubra Organic Retreat', 'Pangong lakeside camp'], meals: 'Breakfast + dinner daily', transfers: 'Innova with driver, oxygen on board', activities: 'Khardung La, Diskit, Hunder dunes, Pangong sunrise',
      excl: ['Flights to Leh', 'Inner-line permit fee'], leader: 'rigzin' },
    goa: { slug: 'north-goa-beaches', name: 'North Goa Beaches', dest: 'Goa', nights: 3, from: 14499, rating: 4.3, reviews: 143, img: 'img/goa-3.jpg',
      places: ['Calangute', 'Anjuna', 'Vagator'], hotels: ['Acron Waterfront (4★)'], meals: 'Breakfast daily', transfers: 'Airport transfers', activities: 'Fort Aguada, Anjuna market, sunset cruise',
      excl: ['Lunches, dinners', 'Water sports'], leader: 'meera' },
    jaipur: { slug: 'jaipur-jodhpur-udaipur', name: 'Jaipur · Jodhpur · Udaipur', dest: 'Rajasthan', nights: 5, from: 27999, rating: 4.7, reviews: 76, img: 'img/jaipur-1.jpg',
      places: ['Jaipur', 'Jodhpur', 'Udaipur'], hotels: ['Umaid Mahal (heritage)', 'Ratan Vilas (heritage)', 'Lake Pichola Hotel'], meals: 'Breakfast daily', transfers: 'Private car throughout', activities: 'Amber Fort, Mehrangarh, City Palace, Pichola boat',
      excl: ['Monument tickets', 'Lunches, dinners'], leader: 'meera' },
  };
  const LEADERS = {
    tenzin: { name: 'Tenzin Norbu', mono: 'TN', hue: '#1B4FD8', years: 7, langs: 'Hindi, English, Tibetan', phone: '+91 98160 44120' },
    meera: { name: 'Meera Shekhawat', mono: 'MS', hue: '#B0501C', years: 9, langs: 'Hindi, English, Marwari', phone: '+91 94140 22871' },
    anjali: { name: 'Anjali Menon', mono: 'AM', hue: '#1F7A4D', years: 6, langs: 'Malayalam, English, Hindi', phone: '+91 94470 31562' },
    rigzin: { name: 'Rigzin Dolma', mono: 'RD', hue: '#6B3FA0', years: 5, langs: 'Ladakhi, Hindi, English', phone: '+91 94191 77305' },
  };
  const avatar = (key, size = 36) => {
    const l = LEADERS[key];
    return `<span class="ts-av" style="--s:${size}px;--h:${l.hue}" title="${esc(l.name)}" aria-hidden="true">${l.mono}</span>`;
  };

  /* ---------- chrome pieces ---------- */
  const header = (nav = 'Trips', extra = '') =>
    `<div class="wrap top"><a class="logo" href="#"><i></i>Tripsmith</a><nav><a href="#">Explore</a><a href="#" class="${nav === 'Trips' ? 'on' : ''}">Trips</a><a href="#">Enquire</a><a href="#" class="${nav === 'My trips' ? 'on' : ''}">My trips</a>${extra}</nav></div>`;

  /* ---------- registry ---------- */
  const SCREENS = [];
  const register = (screen) => {
    // screen: { id, label, group, admin?, css?, variants: [{ id:'A', name, note, tradeoff, render(root-state) -> html, mount?(site) }] }
    if (screen.css) {
      const s = document.createElement('style');
      s.textContent = screen.css;
      document.head.appendChild(s);
    }
    SCREENS.push(screen);
  };

  const baseCss = `
    .ts-av { width: var(--s); height: var(--s); border-radius: 50%; display: inline-grid; place-items: center; flex: none;
      background: radial-gradient(circle at 30% 25%, color-mix(in srgb, var(--h) 55%, #fff), var(--h)); color: #fff;
      font: 800 calc(var(--s) * .36)/1 "DM Sans", sans-serif; letter-spacing: .02em; box-shadow: 0 0 0 2px #fff; }
  `;
  const s = document.createElement('style');
  s.textContent = baseCss;
  document.head.appendChild(s);

  window.TS = { inr, lakh, esc, ICON, stars, PKGS, LEADERS, avatar, header, register, SCREENS, TODAY: '27 Sep 2026' };
})();
