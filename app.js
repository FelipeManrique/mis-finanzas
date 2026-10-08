/* Mis Finanzas — app de una página, sin dependencias. Datos en localStorage de este dispositivo. */
(function () {
  'use strict';

  const KEY = 'finanzas-voz:v1';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayIso = () => isoDate(new Date());
  const monthOf = (iso) => iso.slice(0, 7);
  const parseIso = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d || 1); };
  const clone = (o) => JSON.parse(JSON.stringify(o));

  const ICON = {
    google: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#fff" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#fff" opacity=".85" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#fff" opacity=".7" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14z"/><path fill="#fff" opacity=".85" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.3 3-4.1 5.6-4.1z"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.1 4.75 4.75 0 0 0 7 18.5z"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M7 7l10 10M17 7 7 17"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 10v4M12 17v.01"/></svg>',
    quote: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/></svg>'
  };

  // ---------- Estado ----------
  const DEFAULT_SETTINGS = () => ({
    lang: 'es-AR',
    autoSave: false,
    defaultMethod: 'Efectivo',
    defaultCurrency: 'ARS',
    budget: 0,
    theme: 'auto',
    methods: ['Efectivo', 'Débito', 'Crédito', 'Transferencia', 'Mercado Pago'],
    initialBalances: {},
    categories: clone(Parser.DEFAULT_CATEGORIES),
    lastBackup: null
  });

  let db = load();
  const ui = { tab: 'movs', month: monthOf(todayIso()), q: '', type: 'all', cat: null };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        return { movs: Array.isArray(d.movs) ? d.movs : [], settings: Object.assign(DEFAULT_SETTINGS(), d.settings || {}) };
      }
    } catch (e) { console.warn('No pude leer los datos guardados', e); }
    return { movs: [], settings: DEFAULT_SETTINGS() };
  }
  let persistAsked = false;
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (e) {
      toast('No pude guardar en este dispositivo. Exportá una copia desde Ajustes.');
      return false;
    }
    if (!persistAsked && navigator.storage && navigator.storage.persist) { persistAsked = true; navigator.storage.persist().catch(() => {}); }
    scheduleSync();
    return true;
  }
  const S = () => db.settings;

  // ---------- Formato ----------
  const fmtCache = {};
  function money(v, cur = 'ARS', signed = false) {
    const k = cur + (v % 1 ? 'd' : 'i');
    if (!fmtCache[k]) {
      fmtCache[k] = new Intl.NumberFormat('es-AR', { style: 'currency', currency: cur, minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
    }
    const s = fmtCache[k].format(Math.abs(v)).replace(/ /g, ' ').replace('US$', 'US$ ').replace('  ', ' ');
    if (signed && v) return (v < 0 ? '−' : '+') + s;
    return v < 0 ? '−' + s : s;
  }
  const monthName = (ym) => { const d = parseIso(ym + '-01'); return d.toLocaleDateString('es-AR', { month: 'long' }) + ' ' + d.getFullYear(); };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const monthShort = (ym) => parseIso(ym + '-01').toLocaleDateString('es-AR', { month: 'short' }).replace('.', '');
  function dayLabel(iso) {
    const t = todayIso();
    if (iso === t) return 'Hoy';
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (iso === isoDate(y)) return 'Ayer';
    const d = parseIso(iso);
    const opts = { weekday: 'short', day: 'numeric', month: 'short' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString('es-AR', opts).replace(/[.,]/g, '');
  }
  function shiftMonth(ym, n) { const d = parseIso(ym + '-01'); d.setMonth(d.getMonth() + n); return monthOf(isoDate(d)); }
  function parseAmount(s) {
    if (typeof s === 'number') return s;
    s = String(s || '').replace(/[^\d.,]/g, '');
    if (!s) return NaN;
    const v = Parser.parseDigits(s);
    return v === null ? NaN : v;
  }
  function amountInputValue(v) {
    if (!v && v !== 0) return '';
    return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(v);
  }

  function catInfo(type, name) {
    const list = S().categories[type] || [];
    return list.find((c) => c.name === name) || { name: name || 'Sin categoría', color: '#8E8E93', kw: [] };
  }

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg, undo) {
    const el = $('#toast');
    $('#toast-msg').textContent = msg;
    const b = $('#toast-btn');
    b.hidden = !undo;
    b.onclick = () => { if (undo) undo(); el.classList.remove('show'); };
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), undo ? 5000 : 3000);
  }

  // ---------- Hoja inferior ----------
  const sheet = { onClose: null };
  function openSheet({ title, left = 'Cancelar', right = '', onLeft, onRight, render, onClose }) {
    const sh = $('#sheet'), sc = $('#scrim');
    $('#sheet-title').textContent = title;
    const l = $('#sheet-left'), r = $('#sheet-right');
    l.textContent = left; l.hidden = !left;
    r.textContent = right; r.hidden = !right; r.disabled = false;
    l.onclick = () => (onLeft ? onLeft() : closeSheet());
    r.onclick = () => onRight && onRight();
    if (sheet.onClose && sheet.onClose !== onClose) { const f = sheet.onClose; sheet.onClose = null; f(); }
    sheet.onClose = onClose || null;
    const body = $('#sheet-body');
    body.innerHTML = '';
    body.scrollTop = 0;
    render(body);
    if (sh.hidden) {
      sh.hidden = false; sc.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => { sh.classList.add('open'); sc.classList.add('open'); }));
      document.body.style.overflow = 'hidden';
    }
  }
  function closeSheet() {
    const sh = $('#sheet'), sc = $('#scrim');
    if (sheet.onClose) { const f = sheet.onClose; sheet.onClose = null; f(); }
    sh.classList.remove('open'); sc.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(() => { if (!sh.classList.contains('open')) { sh.hidden = true; sc.hidden = true; $('#sheet-body').innerHTML = ''; } }, 380);
  }
  const sheetOpen = () => !$('#sheet').hidden && $('#sheet').classList.contains('open');

  // ---------- Cálculos ----------
  function totals(movs) {
    const t = { ARS: { in: 0, out: 0 }, USD: { in: 0, out: 0 } };
    for (const m of movs) {
      const c = t[m.currency] || (t[m.currency] = { in: 0, out: 0 });
      if (m.type === 'ingreso') c.in += m.amount; else c.out += m.amount;
    }
    return t;
  }
  const movsOfMonth = (ym) => db.movs.filter((m) => monthOf(m.date) === ym);
  const sortMovs = (arr) => arr.sort((a, b) => (b.date.localeCompare(a.date)) || (b.createdAt || 0) - (a.createdAt || 0));

  // ---------- Render: selector de mes ----------
  function renderMonthSwitch() {
    const cur = monthOf(todayIso());
    $$('[data-month-switch]').forEach((el) => {
      el.innerHTML = `<button data-m="-1" aria-label="Mes anterior">${ICON.left}</button>
        <span class="label">${esc(cap(monthName(ui.month)))}</span>
        <button data-m="1" aria-label="Mes siguiente" ${ui.month >= cur ? 'disabled' : ''}>${ICON.right}</button>
        ${ui.month !== cur ? '<button class="today-link" data-m="0">Este mes</button>' : ''}`;
    });
  }

  // ---------- Render: movimientos ----------
  function renderSummary() {
    const t = totals(movsOfMonth(ui.month));
    const bal = t.ARS.in - t.ARS.out;
    let html = `<div><div class="caption">Balance de ${esc(monthName(ui.month).split(' ')[0])}</div>
      <div class="balance num ${bal < 0 ? 'neg' : ''}">${money(Math.round(bal))}</div></div>
      <div class="split">
        <div class="in"><span class="caption">Ingresos</span><span class="v num">${money(Math.round(t.ARS.in))}</span></div>
        <div class="out"><span class="caption">Gastos</span><span class="v num">${money(Math.round(t.ARS.out))}</span></div>
      </div>`;
    if (t.USD.in || t.USD.out) html += `<div class="usd-line num">Dólares: ingresos ${money(t.USD.in, 'USD')} · gastos ${money(t.USD.out, 'USD')}</div>`;
    const b = +S().budget;
    if (b > 0) {
      const pct = Math.min(100, (t.ARS.out / b) * 100);
      const left = b - t.ARS.out;
      html += `<div class="budget"><div class="row"><span>Presupuesto ${money(b)}</span><span class="num">${left >= 0 ? 'Quedan ' + money(left) : 'Te pasaste ' + money(-left)}</span></div>
        <div class="bar"><i class="${left < 0 ? 'over' : ''}" style="width:${pct}%"></i></div></div>`;
    }
    $('#summary').innerHTML = html;
  }

  function renderBackupBanner() {
    const el = $('#backup-banner');
    if (driveOn()) {
      const st = driveState();
      if (st.level === 'error') {
        el.innerHTML = `<div class="banner">${ICON.warn}<div>Copia en Drive: ${esc(st.text)} <button id="bk-fix">Revisar</button></div></div>`;
        $('#bk-fix').onclick = () => go('settings');
      } else el.innerHTML = '';
      return;
    }
    const n = db.movs.length;
    const last = S().lastBackup ? new Date(S().lastBackup) : null;
    const stale = !last || (Date.now() - last.getTime()) > 30 * 864e5;
    if (n >= 15 && stale) {
      el.innerHTML = `<div class="banner">${ICON.warn}<div>Tus datos viven sólo en este dispositivo. ${last ? 'Tu última copia es de hace más de un mes.' : 'Todavía no hiciste una copia.'} <button id="bk-now">Exportar copia</button></div></div>`;
      $('#bk-now').onclick = exportJSON;
    } else el.innerHTML = '';
  }

  function filteredMovs() {
    const q = Parser.norm(ui.q.trim());
    let arr = q ? db.movs.slice() : movsOfMonth(ui.month);
    if (ui.type !== 'all') arr = arr.filter((m) => m.type === ui.type);
    if (ui.cat) arr = arr.filter((m) => m.category === ui.cat);
    if (q) {
      arr = arr.filter((m) => {
        const hay = Parser.norm([m.description, m.category, m.method, m.amount, amountInputValue(m.amount)].join(' '));
        return q.split(/\s+/).every((w) => hay.includes(w));
      });
    }
    return sortMovs(arr);
  }

  function rowHtml(m) {
    const c = catInfo(m.type, m.category);
    const sub = [m.category, m.method, m.installments ? m.installments + ' cuotas' : null].filter(Boolean).join(' · ');
    return `<button class="row" data-id="${esc(m.id)}">
      <span class="badge" style="background:${esc(c.color)}" aria-hidden="true">${esc((m.category || '?').charAt(0).toUpperCase())}</span>
      <span class="mid"><span class="t">${esc(m.description || m.category)}</span>
      <span class="s">${m.source === 'voz' ? `<span class="mic-tag" title="Cargado con la voz">${ICON.quote}</span>` : ''}${esc(sub)}</span></span>
      <span class="amt num ${m.type === 'ingreso' ? 'in' : ''}">${money(m.type === 'ingreso' ? m.amount : -m.amount, m.currency, m.type === 'ingreso')}</span>
    </button>`;
  }

  function renderList() {
    const list = $('#list');
    const cf = $('#cat-filter');
    if (ui.cat) { cf.hidden = false; cf.innerHTML = `Categoría: <strong>${esc(ui.cat)}</strong> <button id="clear-cat">Quitar filtro</button>`; $('#clear-cat').onclick = () => { ui.cat = null; renderMovs(); }; }
    else cf.hidden = true;

    const arr = filteredMovs();
    if (!db.movs.length) {
      const ex = ['Gasté 12 mil en nafta con débito', 'Cobré 850 mil de sueldo por transferencia', 'Ayer pagué 4.500 de colectivo y 9 mil en la farmacia'];
      list.innerHTML = `<div class="empty"><h2>Contale a la app en qué se fue la plata</h2>
        <p>Tocá el micrófono y hablá como le hablarías a alguien. La app entiende el monto, si es gasto o ingreso, la categoría, el medio de pago y la fecha.</p>
        <div class="examples">${ex.map((e) => `<button data-ex="${esc(e)}">${ICON.quote}<span>“${esc(e)}”</span></button>`).join('')}</div>
        <p class="hint">Tocá un ejemplo para ver cómo lo interpreta. No se guarda nada hasta que confirmes.</p></div>`;
      $$('[data-ex]', list).forEach((b) => (b.onclick = () => openReview(b.dataset.ex, 'ejemplo')));
      return;
    }
    if (!arr.length) {
      list.innerHTML = `<div class="empty"><p>${ui.q ? 'Ningún movimiento coincide con la búsqueda.' : 'No hay movimientos en ' + esc(monthName(ui.month)) + '.'}</p></div>`;
      return;
    }
    const days = new Map();
    for (const m of arr) { if (!days.has(m.date)) days.set(m.date, []); days.get(m.date).push(m); }
    let html = ui.q ? `<p class="footnote">${arr.length} resultado${arr.length === 1 ? '' : 's'} en todos los meses</p>` : '';
    for (const [d, ms] of days) {
      const net = ms.filter((m) => m.currency === 'ARS').reduce((s, m) => s + (m.type === 'ingreso' ? m.amount : -m.amount), 0);
      html += `<div class="day"><div class="day-head"><span>${esc(dayLabel(d))}</span><span class="num">${net ? money(net, 'ARS', true) : ''}</span></div>
        <div class="group">${ms.map(rowHtml).join('')}</div></div>`;
    }
    list.innerHTML = html;
    $$('.row', list).forEach((r) => (r.onclick = () => openEditor(db.movs.find((m) => m.id === r.dataset.id))));
  }

  function renderMovs() {
    renderMonthSwitch(); renderSummary(); renderBackupBanner(); renderList();
    $$('#type-filter button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === ui.type)));
  }

  // ---------- Render: análisis ----------
  function renderStats() {
    renderMonthSwitch();
    const el = $('#stats');
    const ms = movsOfMonth(ui.month).filter((m) => m.currency === 'ARS');
    const t = totals(ms).ARS;
    const prevT = totals(movsOfMonth(shiftMonth(ui.month, -1)).filter((m) => m.currency === 'ARS')).ARS;
    const cur = monthOf(todayIso());
    const d0 = parseIso(ui.month + '-01');
    const daysInMonth = new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate();
    const daysElapsed = ui.month === cur ? new Date().getDate() : ui.month < cur ? daysInMonth : 0;
    const expenses = ms.filter((m) => m.type === 'gasto');
    const biggest = expenses.slice().sort((a, b) => b.amount - a.amount)[0];
    const byMethod = {};
    expenses.forEach((m) => (byMethod[m.method] = (byMethod[m.method] || 0) + m.amount));
    const topMethod = Object.entries(byMethod).sort((a, b) => b[1] - a[1])[0];
    let cmp = '—';
    if (prevT.out && t.out) {
      const p = Math.round(((t.out - prevT.out) / prevT.out) * 100);
      cmp = (p > 0 ? '+' : '') + p + '%';
    }

    let html = `<div class="stats">
      <div class="stat"><span class="k">Gasto por día</span><span class="v num">${daysElapsed ? money(Math.round(t.out / daysElapsed)) : '—'}</span><span class="d">promedio del mes</span></div>
      <div class="stat"><span class="k">Vs. mes anterior</span><span class="v num">${cmp}</span><span class="d">en gastos (${esc(monthShort(shiftMonth(ui.month, -1)))}: ${money(prevT.out)})</span></div>
      <div class="stat"><span class="k">Mayor gasto</span><span class="v num">${biggest ? money(biggest.amount) : '—'}</span><span class="d">${biggest ? esc(biggest.description || biggest.category) : 'sin gastos'}</span></div>
      <div class="stat"><span class="k">Medio más usado</span><span class="v">${topMethod ? esc(topMethod[0]) : '—'}</span><span class="d num">${topMethod ? money(topMethod[1]) : 'sin gastos'}</span></div>
    </div>`;

    const block = (type, title) => {
      const items = ms.filter((m) => m.type === type);
      const total = items.reduce((s, m) => s + m.amount, 0);
      if (!total) return `<h2 class="section-title">${title}</h2><div class="card"><p class="footnote" style="margin:0">Sin ${title.toLowerCase()} en ${esc(monthName(ui.month))}.</p></div>`;
      const by = {};
      items.forEach((m) => (by[m.category] = (by[m.category] || 0) + m.amount));
      const rows = Object.entries(by).sort((a, b) => b[1] - a[1]);
      const max = rows[0][1];
      return `<h2 class="section-title">${title}</h2><div class="card catbars">${rows.map(([name, v]) => {
        const c = catInfo(type, name);
        return `<button class="catbar" data-cat="${esc(name)}" data-type="${type}">
          <span class="n"><span class="dot" style="background:${esc(c.color)}"></span><span>${esc(name)}</span></span>
          <span class="v num">${money(v)}<small>${Math.round((v / total) * 100)}%</small></span>
          <span class="track"><i style="width:${(v / max) * 100}%;background:${esc(c.color)}"></i></span></button>`;
      }).join('')}</div>`;
    };
    html += block('gasto', 'Gastos por categoría');
    html += block('ingreso', 'Ingresos por categoría');
    html += `<h2 class="section-title">Últimos 6 meses</h2><div class="card chart">${barChart()}
      <div class="legend"><span><i style="background:var(--income)"></i>Ingresos</span><span><i style="background:var(--expense)"></i>Gastos</span></div></div>
      <p class="footnote">Montos en pesos. Los movimientos en dólares se muestran aparte en el resumen.</p>`;
    el.innerHTML = html;
    $$('.catbar', el).forEach((b) => (b.onclick = () => { ui.cat = b.dataset.cat; ui.type = b.dataset.type; ui.q = ''; $('#q').value = ''; go('movs'); }));
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  function shortMoney(v) {
    if (v >= 1e6) return '$' + (v / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' M';
    if (v >= 1e3) return '$' + (v / 1e3).toLocaleString('es-AR', { maximumFractionDigits: 0 }) + ' mil';
    return '$' + v;
  }
  function barChart() {
    const months = [];
    for (let i = 5; i >= 0; i--) months.push(shiftMonth(ui.month, -i));
    const data = months.map((ym) => ({ ym, ...totals(movsOfMonth(ym).filter((m) => m.currency === 'ARS')).ARS }));
    const max = niceMax(Math.max(...data.map((d) => Math.max(d.in, d.out))));
    const W = 340, H = 180, L = 52, B = 22, T = 8, R = 4;
    const ch = H - B - T, cw = (W - L - R) / months.length;
    const bw = Math.min(16, cw / 3);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos y gastos de los últimos 6 meses">`;
    [0, 0.5, 1].forEach((f) => {
      const y = T + ch - ch * f;
      s += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="var(--separator)" stroke-width="${f === 0 ? 1 : 0.5}"/>`;
      s += `<text x="${L - 6}" y="${y + 4}" text-anchor="end">${esc(shortMoney(max * f))}</text>`;
    });
    data.forEach((d, i) => {
      const cx = L + cw * i + cw / 2;
      const hi = (d.in / max) * ch, ho = (d.out / max) * ch;
      if (hi > 0) s += `<rect x="${cx - bw - 1}" y="${T + ch - hi}" width="${bw}" height="${hi}" rx="3" fill="var(--income)"><title>${esc(monthName(d.ym))} · ingresos ${esc(money(d.in))}</title></rect>`;
      if (ho > 0) s += `<rect x="${cx + 1}" y="${T + ch - ho}" width="${bw}" height="${ho}" rx="3" fill="var(--expense)"><title>${esc(monthName(d.ym))} · gastos ${esc(money(d.out))}</title></rect>`;
      s += `<text x="${cx}" y="${H - 6}" text-anchor="middle" style="${d.ym === ui.month ? 'font-weight:600;fill:var(--label)' : ''}">${esc(monthShort(d.ym))}</text>`;
    });
    return s + '</svg>';
  }

  // ---------- Render: cuentas ----------
  function renderAccounts() {
    const el = $('#accounts');
    const st = S();
    const ym = monthOf(todayIso());
    const rows = st.methods.map((name) => {
      const all = db.movs.filter((m) => m.method === name && m.currency === 'ARS');
      const net = all.reduce((s, m) => s + (m.type === 'ingreso' ? m.amount : -m.amount), 0);
      const month = all.filter((m) => monthOf(m.date) === ym).reduce((s, m) => s + (m.type === 'ingreso' ? m.amount : -m.amount), 0);
      const init = +st.initialBalances[name] || 0;
      return { name, bal: init + net, month, init };
    });
    const total = rows.reduce((s, r) => s + r.bal, 0);
    const usd = db.movs.filter((m) => m.currency === 'USD').reduce((s, m) => s + (m.type === 'ingreso' ? m.amount : -m.amount), 0) + (+st.initialBalances.__USD || 0);
    el.innerHTML = `<div class="summary"><div><div class="caption">Saldo total en pesos</div><div class="balance num ${total < 0 ? 'neg' : ''}">${money(total)}</div></div>
      <div class="usd-line num">Dólares: ${money(usd, 'USD')}</div></div>
      <h2 class="section-title">Por medio de pago</h2>
      <div class="list">${rows.map((r) => `<button class="item" data-acc="${esc(r.name)}"><span class="grow">${esc(r.name)}<span class="sub num">Este mes ${money(r.month, 'ARS', true)}${r.init ? ' · inicial ' + money(r.init) : ''}</span></span>
        <span class="val num" style="color:${r.bal < 0 ? 'var(--expense)' : 'var(--label)'}">${money(r.bal)}</span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m9 5 7 7-7 7"/></svg></button>`).join('')}
        <button class="item" data-acc="__USD"><span class="grow">Dólares<span class="sub">Todos los movimientos en USD</span></span><span class="val num">${money(usd, 'USD')}</span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m9 5 7 7-7 7"/></svg></button></div>
      <p class="footnote">Saldo = saldo inicial + ingresos − gastos cargados con ese medio. Tocá una cuenta para fijar con cuánto arrancaste. En Crédito, un saldo negativo es lo que debés de la tarjeta.</p>`;
    $$('[data-acc]', el).forEach((b) => (b.onclick = () => editInitial(b.dataset.acc)));
  }

  function editInitial(name) {
    const isUsd = name === '__USD';
    openSheet({
      title: isUsd ? 'Dólares' : name, right: 'Guardar',
      render(body) {
        body.innerHTML = `<p class="footnote">¿Cuánto tenías en ${isUsd ? 'dólares' : esc(name)} antes de empezar a registrar? Los movimientos se suman a este número.</p>
          <div class="field-group"><div class="field"><label for="init-amt">Saldo inicial</label><input id="init-amt" inputmode="decimal" placeholder="0" value="${esc(amountInputValue(+S().initialBalances[name] || 0))}"></div></div>
          <label class="field-group field" style="justify-content:space-between"><span>Es negativo (deuda)</span><span class="switch"><input type="checkbox" id="init-neg" ${(+S().initialBalances[name] || 0) < 0 ? 'checked' : ''}><span></span></span></label>`;
      },
      onRight() {
        let v = parseAmount($('#init-amt').value) || 0;
        v = Math.abs(v) * ($('#init-neg').checked ? -1 : 1);
        S().initialBalances[name] = v; save(); closeSheet(); renderAccounts(); toast('Saldo inicial actualizado');
      }
    });
  }

  // ---------- Render: ajustes ----------
  function renderSettings() {
    const st = S();
    const el = $('#settings');
    const last = st.lastBackup ? new Date(st.lastBackup).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'nunca';
    const sr = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    el.innerHTML = `
      <h2 class="section-title">Voz</h2>
      <div class="list">
        <label class="item"><span class="grow">Acento del reconocimiento</span>
          <select id="set-lang">${[['es-AR', 'Argentina'], ['es-UY', 'Uruguay'], ['es-CL', 'Chile'], ['es-MX', 'México'], ['es-ES', 'España'], ['es-US', 'EE. UU.'], ['es-CO', 'Colombia']].map(([v, n]) => `<option value="${v}" ${st.lang === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="item"><span class="grow">Guardar sin revisar<span class="sub">Si la app entendió todo bien, guarda directo</span></span><span class="switch"><input type="checkbox" id="set-auto" ${st.autoSave ? 'checked' : ''}><span></span></span></label>
        <button class="item link" id="set-try">Probar escribiendo una frase</button>
      </div>
      <p class="footnote">${sr ? 'El reconocimiento de voz lo hace tu navegador y necesita conexión a internet.' : 'Este navegador no reconoce voz directamente. Usá el micrófono del teclado para dictar: la app interpreta el texto igual. En iPhone funciona en Safari y en Android en Chrome.'}</p>

      <h2 class="section-title">Preferencias</h2>
      <div class="list">
        <label class="item"><span class="grow">Medio por defecto<span class="sub">Si no decís con qué pagaste</span></span>
          <select id="set-method">${st.methods.map((m) => `<option ${st.defaultMethod === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
        <label class="item"><span class="grow">Presupuesto mensual<span class="sub">Tope de gastos en pesos, 0 para no usar</span></span>
          <input type="text" class="inline num" id="set-budget" inputmode="decimal" value="${esc(amountInputValue(+st.budget || 0))}"></label>
        <label class="item"><span class="grow">Apariencia</span>
          <select id="set-theme"><option value="auto" ${st.theme === 'auto' ? 'selected' : ''}>Automática</option><option value="light" ${st.theme === 'light' ? 'selected' : ''}>Clara</option><option value="dark" ${st.theme === 'dark' ? 'selected' : ''}>Oscura</option></select></label>
      </div>

      <h2 class="section-title">Categorías y medios</h2>
      <div class="list">
        <button class="item" id="set-cat-g"><span class="grow">Categorías de gastos</span><span class="val">${st.categories.gasto.length}</span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m9 5 7 7-7 7"/></svg></button>
        <button class="item" id="set-cat-i"><span class="grow">Categorías de ingresos</span><span class="val">${st.categories.ingreso.length}</span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m9 5 7 7-7 7"/></svg></button>
        <button class="item" id="set-methods"><span class="grow">Medios de pago</span><span class="val">${st.methods.length}</span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m9 5 7 7-7 7"/></svg></button>
      </div>
      <p class="footnote">Cada categoría tiene palabras clave. Si decís una de esas palabras, el movimiento cae en esa categoría.</p>

      ${driveSettingsHtml()}

      <h2 class="section-title">Tus datos</h2>
      <div class="list">
        <button class="item link" id="set-export-json">Exportar copia de seguridad</button>
        <button class="item link" id="set-export-csv">Exportar a planilla (CSV)</button>
        <button class="item link" id="set-import">Importar copia o CSV</button>
        <button class="item danger" id="set-wipe">Borrar todos los datos</button>
      </div>
      <p class="footnote">${db.movs.length} movimientos guardados sólo en este dispositivo y navegador. Última copia: ${esc(last)}. Si borrás los datos del navegador o cambiás de teléfono, los recuperás importando una copia.</p>
      <p class="footnote" style="text-align:center;margin-top:24px">Mis Finanzas · v${APP_VERSION}</p>`;

    $('#set-lang').onchange = (e) => { st.lang = e.target.value; save(); };
    $('#set-auto').onchange = (e) => { st.autoSave = e.target.checked; save(); };
    $('#set-method').onchange = (e) => { st.defaultMethod = e.target.value; save(); };
    $('#set-budget').onchange = (e) => { st.budget = Math.max(0, parseAmount(e.target.value) || 0); e.target.value = amountInputValue(st.budget); save(); };
    $('#set-theme').onchange = (e) => { st.theme = e.target.value; save(); applyTheme(); };
    $('#set-try').onclick = () => openVoice({ textMode: true });
    $('#set-cat-g').onclick = () => manageCategories('gasto');
    $('#set-cat-i').onclick = () => manageCategories('ingreso');
    $('#set-methods').onclick = manageMethods;
    $('#set-export-json').onclick = exportJSON;
    $('#set-export-csv').onclick = exportCSV;
    $('#set-import').onclick = () => $('#import-file').click();
    bindDriveSettings();
    $('#set-wipe').onclick = wipeAll;
  }

  function applyTheme() {
    const t = S().theme;
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }

  // ---------- Categorías ----------
  function manageCategories(type) {
    const list = S().categories[type];
    openSheet({
      title: type === 'gasto' ? 'Categorías de gastos' : 'Categorías de ingresos', left: 'Listo', right: 'Nueva',
      onLeft() { closeSheet(); renderAll(); },
      onRight() { editCategory(type, null); },
      render(body) {
        body.innerHTML = `<div class="list">${list.map((c, i) => `<button class="item" data-i="${i}"><span class="badge" style="background:${esc(c.color)};width:28px;height:28px;border-radius:8px;font-size:13px">${esc(c.name.charAt(0))}</span>
          <span class="grow">${esc(c.name)}<span class="sub">${c.kw.length ? esc(c.kw.slice(0, 6).join(', ')) + (c.kw.length > 6 ? '…' : '') : 'Sin palabras clave'}</span></span>
          <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m9 5 7 7-7 7"/></svg></button>`).join('')}</div>
          <p class="footnote">La última categoría de la lista se usa cuando la app no reconoce ninguna palabra clave.</p>`;
        $$('[data-i]', body).forEach((b) => (b.onclick = () => editCategory(type, +b.dataset.i)));
      }
    });
  }

  function editCategory(type, idx) {
    const list = S().categories[type];
    const c = idx === null ? { name: '', color: '#5856D6', kw: [] } : list[idx];
    const usedBy = idx === null ? 0 : db.movs.filter((m) => m.type === type && m.category === c.name).length;
    openSheet({
      title: idx === null ? 'Nueva categoría' : c.name, left: 'Atrás', right: 'Guardar',
      onLeft: () => manageCategories(type),
      render(body) {
        body.innerHTML = `<div class="field-group">
            <div class="field"><label for="c-name">Nombre</label><input id="c-name" value="${esc(c.name)}" placeholder="Ej: Gimnasio" autocomplete="off"></div>
            <div class="field"><label for="c-color">Color</label><input id="c-color" type="color" value="${esc(c.color)}" style="flex:none;width:44px;height:30px;padding:0;border-radius:8px"></div>
          </div>
          <p class="label-sm">Palabras clave</p>
          <div class="text-entry"><textarea id="c-kw" placeholder="Separadas por coma. Ej: gimnasio, gym, pileta">${esc(c.kw.join(', '))}</textarea></div>
          <p class="footnote" style="margin-top:-8px">Si en lo que dictás aparece alguna de estas palabras, el movimiento va a esta categoría.</p>
          ${idx !== null && list.length > 1 ? `<button class="btn danger" id="c-del">Eliminar categoría</button><p class="footnote" style="margin-top:-8px">${usedBy ? `Sus ${usedBy} movimientos pasan a “${esc(list[list.length - 1] === c ? list[list.length - 2].name : list[list.length - 1].name)}”.` : 'No tiene movimientos.'}</p>` : ''}`;
        const del = $('#c-del', body);
        if (del) del.onclick = () => {
          if (!del.classList.contains('armed')) { del.classList.add('armed'); del.textContent = 'Tocá de nuevo para eliminar'; return; }
          const fallback = list[list.length - 1] === c ? list[list.length - 2] : list[list.length - 1];
          db.movs.forEach((m) => { if (m.type === type && m.category === c.name) m.category = fallback.name; });
          list.splice(idx, 1); save(); toast('Categoría eliminada'); manageCategories(type);
        };
      },
      onRight() {
        const name = $('#c-name').value.trim();
        if (!name) { $('#c-name').focus(); toast('Poné un nombre para la categoría'); return; }
        if (list.some((x, i) => i !== idx && x.name.toLowerCase() === name.toLowerCase())) { toast('Ya existe una categoría con ese nombre'); return; }
        const kw = $('#c-kw').value.split(/[,\n;]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
        const color = $('#c-color').value;
        if (idx === null) list.splice(Math.max(0, list.length - 1), 0, { name, color, kw });
        else {
          if (c.name !== name) db.movs.forEach((m) => { if (m.type === type && m.category === c.name) m.category = name; });
          Object.assign(c, { name, color, kw });
        }
        save(); toast('Categoría guardada'); manageCategories(type);
      }
    });
  }

  // ---------- Medios de pago ----------
  function manageMethods() {
    const st = S();
    openSheet({
      title: 'Medios de pago', left: 'Listo', right: '',
      onLeft() { closeSheet(); renderAll(); },
      render(body) {
        const draw = () => {
          body.innerHTML = `<div class="list">${st.methods.map((m, i) => `<div class="item"><input class="grow" style="text-align:left;color:var(--label);max-width:none" data-i="${i}" value="${esc(m)}" aria-label="Nombre del medio">
            ${st.methods.length > 1 ? `<button class="icon-btn" data-del="${i}" aria-label="Eliminar ${esc(m)}" style="width:30px;height:30px;color:var(--expense)">${ICON.close}</button>` : ''}</div>`).join('')}</div>
            <div class="field-group"><div class="field"><input id="new-method" placeholder="Agregar otro (ej: Ualá, Naranja X)" style="text-align:left" autocomplete="off"><button class="link-btn" id="add-method">Agregar</button></div></div>
            <p class="footnote">Si decís el nombre de un medio (por ejemplo “con Ualá”), la app lo elige. Al borrar uno, sus movimientos pasan al medio por defecto.</p>`;
          $$('input[data-i]', body).forEach((inp) => (inp.onchange = () => {
            const i = +inp.dataset.i, old = st.methods[i], nw = inp.value.trim();
            if (!nw || st.methods.some((x, j) => j !== i && x === nw)) { inp.value = old; return; }
            st.methods[i] = nw;
            db.movs.forEach((m) => { if (m.method === old) m.method = nw; });
            if (st.defaultMethod === old) st.defaultMethod = nw;
            if (old in st.initialBalances) { st.initialBalances[nw] = st.initialBalances[old]; delete st.initialBalances[old]; }
            save();
          }));
          $$('[data-del]', body).forEach((b) => (b.onclick = () => {
            if (!b.classList.contains('armed')) { b.classList.add('armed'); b.style.background = 'var(--expense)'; b.style.color = '#fff'; return; }
            const i = +b.dataset.del, old = st.methods[i];
            st.methods.splice(i, 1);
            if (st.defaultMethod === old) st.defaultMethod = st.methods[0];
            db.movs.forEach((m) => { if (m.method === old) m.method = st.defaultMethod; });
            delete st.initialBalances[old];
            save(); draw();
          }));
          const add = () => {
            const v = $('#new-method').value.trim();
            if (!v || st.methods.includes(v)) return;
            st.methods.push(v); save(); draw();
          };
          $('#add-method').onclick = add;
          $('#new-method').onkeydown = (e) => { if (e.key === 'Enter') add(); };
        };
        draw();
      }
    });
  }

  // ---------- Editor de movimiento ----------
  function movFields(m, prefix) {
    const st = S();
    const cats = st.categories[m.type] || [];
    const methods = st.methods.includes(m.method) ? st.methods : st.methods.concat(m.method ? [m.method] : []);
    return `<div class="field"><label for="${prefix}desc">Detalle</label><input id="${prefix}desc" value="${esc(m.description)}" placeholder="Ej: Supermercado" autocomplete="off"></div>
      <div class="field"><label for="${prefix}cat">Categoría</label><select id="${prefix}cat">${cats.map((c) => `<option ${c.name === m.category ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}${cats.some((c) => c.name === m.category) ? '' : `<option selected>${esc(m.category)}</option>`}</select></div>
      <div class="field"><label for="${prefix}method">Medio</label><select id="${prefix}method">${methods.map((x) => `<option ${x === m.method ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="field"><label for="${prefix}date">Fecha</label><input id="${prefix}date" type="date" value="${esc(m.date)}" max="${todayIso()}"></div>
      <div class="field"><label for="${prefix}inst">Cuotas</label><input id="${prefix}inst" inputmode="numeric" placeholder="—" value="${m.installments || ''}"></div>`;
  }
  function readFields(prefix, root) {
    const v = (id) => $('#' + prefix + id, root).value;
    const inst = parseInt(v('inst'), 10);
    return { description: v('desc').trim(), category: v('cat'), method: v('method'), date: v('date') || todayIso(), installments: inst > 1 ? inst : null };
  }
  function refillCats(select, type, keep) {
    const cats = S().categories[type];
    const guess = cats.find((c) => c.name === keep) ? keep : cats[cats.length - 1].name;
    select.innerHTML = cats.map((c) => `<option ${c.name === guess ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  }

  function openEditor(existing) {
    const st = S();
    const m = existing ? clone(existing) : { type: 'gasto', amount: 0, currency: st.defaultCurrency, category: st.categories.gasto[st.categories.gasto.length - 1].name, method: st.defaultMethod, date: todayIso(), description: '', installments: null };
    if (!existing && ui.month !== monthOf(todayIso())) m.date = ui.month + '-01';
    openSheet({
      title: existing ? 'Movimiento' : 'Nuevo movimiento', right: 'Guardar',
      render(body) {
        body.innerHTML = `<div class="segmented" id="e-type"><button data-t="gasto" aria-pressed="${m.type === 'gasto'}">Gasto</button><button data-t="ingreso" aria-pressed="${m.type === 'ingreso'}">Ingreso</button></div>
          <div class="amount-field ${m.type === 'ingreso' ? 'in' : 'out'}" id="e-amt-wrap"><button class="cur-btn" id="e-cur" aria-label="Cambiar moneda">${m.currency === 'USD' ? 'US$' : '$'}</button>
            <input id="e-amt" inputmode="decimal" placeholder="0" value="${esc(amountInputValue(m.amount || ''))}" aria-label="Monto" autocomplete="off"></div>
          <div class="field-group">${movFields(m, 'e-')}</div>
          ${existing && existing.transcript ? `<div class="said"><span>Lo que dijiste</span><q>${esc(existing.transcript)}</q></div>` : ''}
          ${existing ? '<button class="btn tinted" id="e-dup">Duplicar con fecha de hoy</button><button class="btn danger" id="e-del">Eliminar movimiento</button>' : ''}`;
        $$('#e-type button', body).forEach((b) => (b.onclick = () => {
          m.type = b.dataset.t;
          $$('#e-type button', body).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          $('#e-amt-wrap').className = 'amount-field ' + (m.type === 'ingreso' ? 'in' : 'out');
          refillCats($('#e-cat'), m.type, $('#e-cat').value);
        }));
        $('#e-cur').onclick = () => { m.currency = m.currency === 'USD' ? 'ARS' : 'USD'; $('#e-cur').textContent = m.currency === 'USD' ? 'US$' : '$'; };
        if (!existing) setTimeout(() => $('#e-amt') && $('#e-amt').focus(), 420);
        const del = $('#e-del');
        if (del) del.onclick = () => {
          if (!del.classList.contains('armed')) { del.classList.add('armed'); del.textContent = 'Tocá de nuevo para eliminar'; return; }
          const i = db.movs.findIndex((x) => x.id === existing.id);
          const [removed] = db.movs.splice(i, 1);
          save(); closeSheet(); renderAll();
          toast('Movimiento eliminado', () => { db.movs.push(removed); save(); renderAll(); });
        };
        const dup = $('#e-dup');
        if (dup) dup.onclick = () => {
          const copy = Object.assign(clone(existing), { id: uid(), date: todayIso(), createdAt: Date.now(), source: 'manual', transcript: '' });
          db.movs.push(copy); save(); closeSheet(); ui.month = monthOf(copy.date); renderAll();
          toast('Movimiento duplicado', () => { db.movs = db.movs.filter((x) => x.id !== copy.id); save(); renderAll(); });
        };
      },
      onRight() {
        const amount = parseAmount($('#e-amt').value);
        if (!(amount > 0)) { $('#e-amt').focus(); toast('Ingresá un monto mayor a cero'); return; }
        const f = readFields('e-', $('#sheet-body'));
        const rec = Object.assign(m, f, { amount });
        if (!rec.description) rec.description = rec.category;
        if (existing) {
          const i = db.movs.findIndex((x) => x.id === existing.id);
          db.movs[i] = Object.assign(existing, rec);
        } else {
          Object.assign(rec, { id: uid(), createdAt: Date.now(), source: 'manual' });
          db.movs.push(rec);
        }
        save(); closeSheet(); ui.month = monthOf(rec.date); renderAll();
        toast(existing ? 'Cambios guardados' : 'Movimiento guardado');
      }
    });
  }

  // ---------- Voz ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;

  function mergeFinal(acc, t) {
    t = t.trim();
    if (!acc) return t;
    const a = Parser.norm(acc), b = Parser.norm(t);
    if (b.startsWith(a)) return t;      // Chrome Android a veces repite el texto acumulado
    if (a.endsWith(b)) return acc;
    return acc + ' ' + t;
  }

  function openVoice(opts = {}) {
    const textMode = opts.textMode || !SR;
    let state = { finalText: '', interim: '', error: null, cancelled: false, listening: false };
    let silenceTimer, capTimer;

    const stopRec = (abort) => { clearTimeout(silenceTimer); clearTimeout(capTimer); if (rec) { try { abort ? rec.abort() : rec.stop(); } catch (e) { /* ya detenido */ } } };

    openSheet({
      title: textMode ? 'Escribí el movimiento' : 'Cargar con la voz', left: 'Cancelar', right: '',
      onLeft() { state.cancelled = true; stopRec(true); closeSheet(); },
      onClose() { state.cancelled = true; stopRec(true); },
      render(body) {
        if (textMode) return renderText(body, opts.note || (!SR ? 'Este navegador no reconoce voz. Tocá el micrófono del teclado para dictar, o escribí.' : ''), opts.text || '');
        body.innerHTML = `<div class="listen">
            <button class="orb" id="orb" aria-label="Empezar o terminar de escuchar">${ICON.mic}</button>
            <div class="status" id="v-status">Preparando el micrófono…</div>
            <div class="transcript" id="v-text" aria-live="polite"></div>
            <div class="hint" id="v-hint">Decí el monto, en qué y con qué pagaste. Ej: “Gasté 12 mil en nafta con débito y 3.500 en un café”.</div>
          </div>
          <div class="btn-row"><button class="btn tinted" id="v-type">Escribir</button><button class="btn" id="v-done">Listo</button></div>`;
        $('#v-type').onclick = () => { state.cancelled = true; stopRec(true); openVoice({ textMode: true, text: (state.finalText + ' ' + state.interim).trim() }); };
        $('#v-done').onclick = () => { if (state.listening) stopRec(false); else finish(); };
        $('#orb').onclick = () => { if (state.listening) stopRec(false); else start(); };
        start();
      }
    });

    function setStatus(s) { const el = $('#v-status'); if (el) el.textContent = s; }
    function draw() {
      const el = $('#v-text'); if (!el) return;
      el.innerHTML = esc(state.finalText) + (state.interim ? ' <span class="interim">' + esc(state.interim) + '</span>' : '');
    }
    function setOrb(live) { const o = $('#orb'); if (o) { o.classList.toggle('live', live); o.classList.toggle('idle', !live); } }

    function start() {
      state.error = null;
      try {
        rec = new SR();
        rec.lang = S().lang || 'es-AR';
        rec.interimResults = true;
        rec.continuous = true;
        rec.maxAlternatives = 1;
      } catch (e) { return renderTextFallback('No pude iniciar el reconocimiento de voz en este navegador.'); }
      rec.onstart = () => { state.listening = true; setOrb(true); setStatus('Escuchando… tocá Listo cuando termines'); };
      rec.onresult = (e) => {
        let fin = '', interim = '';
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) fin = mergeFinal(fin, r[0].transcript); else interim += r[0].transcript;
        }
        // en algunos navegadores cada sesión arranca de cero: no perder lo anterior
        state.finalText = state.base ? mergeFinal(state.base, fin) : fin;
        state.interim = interim.trim();
        draw();
        clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => stopRec(false), 2600);
      };
      rec.onerror = (e) => { state.error = e.error; };
      rec.onend = () => {
        state.listening = false; setOrb(false);
        clearTimeout(silenceTimer); clearTimeout(capTimer);
        if (state.cancelled) return;
        const text = (state.finalText + ' ' + state.interim).trim();
        if (text && !['not-allowed', 'service-not-allowed'].includes(state.error)) return finish();
        const msg = {
          'not-allowed': 'El navegador no me dejó usar el micrófono. Permitilo para este sitio (ícono del candado o “aA” en la barra de direcciones) o dictá con el teclado.',
          'service-not-allowed': 'El reconocimiento de voz no está disponible acá. Dictá con el micrófono del teclado o escribí.',
          'network': 'El reconocimiento de voz necesita internet. Sin conexión podés dictar con el micrófono del teclado.',
          'audio-capture': 'No encontré un micrófono en este dispositivo.',
          'language-not-supported': 'Este navegador no reconoce el acento elegido. Cambialo en Ajustes.'
        }[state.error];
        if (msg) return renderTextFallback(msg);
        setStatus('No te escuché. Tocá el micrófono para intentar de nuevo.');
      };
      try {
        state.base = state.finalText;
        rec.start();
        capTimer = setTimeout(() => stopRec(false), 45000);
      } catch (e) {
        setOrb(false);
        setStatus('Tocá el micrófono para empezar a hablar.');
      }
    }

    function finish() {
      const text = (state.finalText + ' ' + state.interim).trim();
      if (!text) { setStatus('No te escuché. Tocá el micrófono para intentar de nuevo.'); return; }
      state.cancelled = true;
      openReview(text, 'voz');
    }

    function renderTextFallback(note) {
      state.cancelled = true;
      openVoice({ textMode: true, note, text: (state.finalText + ' ' + state.interim).trim() });
    }

    function renderText(body, note, text) {
      body.innerHTML = `${note ? `<div class="banner" style="margin:0">${ICON.warn}<div>${esc(note)}</div></div>` : ''}
        <div class="text-entry"><textarea id="t-in" placeholder="Ej: Ayer pagué 4.500 de colectivo y 9 mil en la farmacia con débito">${esc(text)}</textarea>
        <button class="btn" id="t-go">Interpretar</button></div>
        <p class="hint" style="margin:0">Podés cargar varios movimientos juntos separándolos con “y”. La app detecta monto, tipo, categoría, medio de pago y fecha (“ayer”, “el lunes”, “el 3 de octubre”).</p>`;
      const ta = $('#t-in', body);
      setTimeout(() => ta.focus(), 420);
      const go = () => { const t = ta.value.trim(); if (!t) { ta.focus(); return; } openReview(t, 'manual'); };
      $('#t-go', body).onclick = go;
      ta.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } };
    }
  }

  // ---------- Revisión ----------
  function parseText(text) {
    const st = S();
    return Parser.parse(text, { categories: st.categories, methods: st.methods, defaultMethod: st.defaultMethod, defaultCurrency: st.defaultCurrency });
  }

  function openReview(text, source) {
    let items = parseText(text);
    const st = S();
    if (source !== 'ejemplo' && st.autoSave && items.length && items.every((i) => i.confidence >= 0.8)) {
      return commit(items, text, source);
    }
    openSheet({
      title: items.length > 1 ? `Revisar ${items.length} movimientos` : 'Revisar', right: source === 'ejemplo' ? '' : 'Guardar',
      onRight() {
        const out = readReview();
        if (!out) return;
        commit(out, text, source);
      },
      render(body) { draw(body); }
    });

    function draw(body) {
      body = body || $('#sheet-body');
      const right = $('#sheet-right');
      right.textContent = items.length > 1 ? `Guardar ${items.length}` : 'Guardar';
      right.disabled = !items.length;
      right.hidden = source === 'ejemplo';
      body.innerHTML = `<div class="said"><span>${source === 'ejemplo' ? 'Ejemplo' : 'Entendí'}</span><q id="r-said">${esc(text)}</q>
          <div id="r-edit" hidden class="text-entry"><textarea id="r-text">${esc(text)}</textarea><button class="btn tinted" id="r-reparse">Volver a interpretar</button></div>
          <div style="display:flex;gap:12px"><button class="link-btn" id="r-toggle" style="padding:0">Corregir el texto</button>${SR ? '<button class="link-btn" id="r-again" style="padding:0">Hablar de nuevo</button>' : ''}</div></div>
        ${items.length ? '' : '<div class="banner" style="margin:0">' + ICON.warn + '<div>No encontré ningún monto. Probá con algo como “gasté 5 mil en el super”.</div></div>'}
        ${items.map((it, i) => reviewCard(it, i)).join('')}
        ${source === 'ejemplo' ? '<p class="hint" style="margin:0">Así se vería tu movimiento. Tocá el micrófono para cargar uno de verdad.</p><button class="btn" id="r-try">' + 'Probar con mi voz' + '</button>' : ''}`;
      $('#r-toggle').onclick = () => { $('#r-edit').hidden = !$('#r-edit').hidden; $('#r-said').hidden = !$('#r-edit').hidden; if (!$('#r-edit').hidden) $('#r-text').focus(); };
      $('#r-reparse').onclick = () => { text = $('#r-text').value.trim(); items = parseText(text); $('#sheet-title').textContent = items.length > 1 ? `Revisar ${items.length} movimientos` : 'Revisar'; draw(); };
      const again = $('#r-again'); if (again) again.onclick = () => openVoice();
      const tryBtn = $('#r-try'); if (tryBtn) tryBtn.onclick = () => openVoice();
      $$('.review-card', body).forEach((card) => {
        const i = +card.dataset.i;
        $$('.segmented button', card).forEach((b) => (b.onclick = () => {
          syncAll();
          const it = items[i];
          if (it.type === b.dataset.t) return;
          it.type = b.dataset.t;
          const cats = st.categories[it.type];
          it.category = Parser.detectCategory(Parser.norm(it.description || ''), it.type, st.categories) ||
            Parser.detectCategory(Parser.norm(text), it.type, st.categories) || cats[cats.length - 1].name;
          draw();
        }));
        $('.rm', card).onclick = () => { syncAll(); items.splice(i, 1); $('#sheet-title').textContent = items.length > 1 ? `Revisar ${items.length} movimientos` : 'Revisar'; draw(); };
        $('.cur-btn', card).onclick = () => { syncAll(); items[i].currency = items[i].currency === 'USD' ? 'ARS' : 'USD'; draw(); };
      });
    }
    function syncItem(i) {
      const card = $(`.review-card[data-i="${i}"]`); if (!card) return;
      const it = items[i];
      const a = parseAmount($('.rc-amount input', card).value);
      it.amount = a > 0 ? a : 0;
      Object.assign(it, readFields(`r${i}-`, card));
    }
    function syncAll() { items.forEach((_, i) => syncItem(i)); }
    function readReview() {
      syncAll();
      const bad = items.findIndex((it) => !(it.amount > 0));
      if (bad >= 0) { toast('Falta el monto de un movimiento'); $(`.review-card[data-i="${bad}"] .rc-amount input`).focus(); return null; }
      return items;
    }
  }

  function reviewCard(it, i) {
    return `<div class="review-card ${it.type === 'ingreso' ? 'in' : 'out'}" data-i="${i}">
      <div class="rc-head"><div class="segmented"><button data-t="gasto" aria-pressed="${it.type === 'gasto'}">Gasto</button><button data-t="ingreso" aria-pressed="${it.type === 'ingreso'}">Ingreso</button></div>
        <span class="grow"></span><button class="icon-btn rm" aria-label="Quitar este movimiento" style="width:30px;height:30px;color:var(--label-2)">${ICON.close}</button></div>
      <div class="rc-amount"><button class="cur-btn" aria-label="Cambiar moneda">${it.currency === 'USD' ? 'US$' : '$'}</button>
        <input inputmode="decimal" value="${esc(amountInputValue(it.amount))}" aria-label="Monto"></div>
      ${it.confidence < 0.7 ? '<div class="low-conf">Revisá estos datos: no estoy seguro de haber entendido todo.</div>' : ''}
      ${movFields(it, `r${i}-`)}
    </div>`;
  }

  function commit(items, text, source) {
    const now = Date.now();
    const recs = items.map((it, k) => ({
      id: uid(), type: it.type, amount: it.amount, currency: it.currency || 'ARS', category: it.category, method: it.method,
      date: it.date, description: it.description || it.category, installments: it.installments || null,
      createdAt: now + k, source: source === 'manual' ? 'texto' : 'voz', transcript: text
    }));
    db.movs.push(...recs);
    save(); closeSheet();
    ui.month = monthOf(recs[0].date); ui.q = ''; $('#q').value = ''; ui.cat = null;
    go('movs');
    const ids = new Set(recs.map((r) => r.id));
    const msg = recs.length === 1
      ? `Guardado: ${recs[0].description} ${money(recs[0].type === 'ingreso' ? recs[0].amount : -recs[0].amount, recs[0].currency, recs[0].type === 'ingreso')}`
      : `${recs.length} movimientos guardados`;
    toast(msg, () => { db.movs = db.movs.filter((m) => !ids.has(m.id)); save(); renderAll(); });
  }

  // ---------- Exportar / importar ----------
  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function exportJSON() {
    const data = { app: 'mis-finanzas', version: 1, exportedAt: new Date().toISOString(), movs: db.movs, settings: db.settings };
    download(`finanzas-copia-${todayIso()}.json`, JSON.stringify(data, null, 1), 'application/json');
    S().lastBackup = new Date().toISOString(); save(); renderAll();
    toast('Copia exportada. Guardala en Drive o en tus archivos.');
  }
  const CSV_COLS = ['Fecha', 'Tipo', 'Monto', 'Moneda', 'Categoría', 'Medio', 'Detalle', 'Cuotas', 'Origen', 'Texto dictado'];
  function exportCSV() {
    const q = (s) => { s = String(s ?? ''); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = sortMovs(db.movs.slice()).map((m) => [m.date, m.type === 'ingreso' ? 'Ingreso' : 'Gasto', String(m.amount).replace('.', ','), m.currency, m.category, m.method, m.description, m.installments || '', m.source || '', m.transcript || ''].map(q).join(';'));
    download(`finanzas-${todayIso()}.csv`, '﻿' + [CSV_COLS.join(';')].concat(rows).join('\r\n'), 'text/csv;charset=utf-8');
    toast('Planilla exportada');
  }
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const sep = (text.split('\n')[0].match(/;/g) || []).length >= (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cell = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; } else cell += ch; }
      else if (ch === '"') inQ = true;
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const head = rows.shift().map((h) => Parser.norm(h.trim()));
    const col = (n) => head.indexOf(Parser.norm(n));
    const iF = col('Fecha'), iT = col('Tipo'), iM = col('Monto');
    if (iF < 0 || iM < 0) throw new Error('El CSV necesita al menos las columnas Fecha y Monto.');
    return rows.filter((r) => r.length > 1 && r[iF]).map((r, k) => {
      let date = r[iF].trim();
      const dm = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (dm) date = `${dm[3].length === 2 ? '20' + dm[3] : dm[3]}-${pad(dm[2])}-${pad(dm[1])}`;
      let amount = parseAmount(r[iM]);
      let type = iT >= 0 && /ingreso/i.test(r[iT]) ? 'ingreso' : 'gasto';
      if (/^-/.test(r[iM].trim()) && iT < 0) type = 'gasto';
      const g = (n) => (col(n) >= 0 ? (r[col(n)] || '').trim() : '');
      return { id: uid(), type, amount, currency: g('Moneda') || 'ARS', category: g('Categoría') || (type === 'ingreso' ? 'Otros ingresos' : 'Otros gastos'),
        method: g('Medio') || S().defaultMethod, date, description: g('Detalle') || g('Descripción'), installments: parseInt(g('Cuotas'), 10) || null,
        createdAt: Date.now() + k, source: 'importado', transcript: g('Texto dictado') };
    }).filter((m) => m.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(m.date));
  }
  function onImportFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let movs = [], settings = null;
      try {
        if (/\.json$/i.test(file.name) || /^\s*\{/.test(reader.result)) {
          const d = JSON.parse(reader.result);
          if (!Array.isArray(d.movs)) throw new Error('El archivo no es una copia de Mis Finanzas.');
          movs = d.movs.filter((m) => m && m.amount > 0 && m.date && m.type);
          settings = d.settings || null;
        } else movs = parseCSV(reader.result);
      } catch (e) { toast(e.message || 'No pude leer el archivo'); return; }
      if (!movs.length) { toast('El archivo no tiene movimientos para importar'); return; }
      const existing = new Set(db.movs.map((m) => m.id));
      const fresh = movs.filter((m) => !existing.has(m.id));
      openSheet({
        title: 'Importar', right: '',
        render(body) {
          body.innerHTML = `<p class="footnote" style="font-size:15px;color:var(--label)">El archivo tiene <strong>${movs.length}</strong> movimientos${settings ? ' y tus ajustes' : ''}. ${fresh.length < movs.length ? `${movs.length - fresh.length} ya están cargados.` : ''}</p>
            <button class="btn" id="imp-add" ${fresh.length ? '' : 'disabled'}>Agregar ${fresh.length} a los actuales</button>
            <button class="btn danger" id="imp-rep">Reemplazar todo por el archivo</button>
            <p class="footnote" style="margin-top:-6px">Reemplazar borra los ${db.movs.length} movimientos actuales de este dispositivo.</p>`;
          $('#imp-add').onclick = () => { if (settings && !db.movs.length) db.settings = Object.assign(DEFAULT_SETTINGS(), settings); db.movs.push(...fresh); save(); applyTheme(); closeSheet(); renderAll(); toast(`${fresh.length} movimientos importados`); };
          const rep = $('#imp-rep');
          rep.onclick = () => {
            if (!rep.classList.contains('armed')) { rep.classList.add('armed'); rep.textContent = 'Tocá de nuevo para reemplazar'; return; }
            db.movs = movs; if (settings) db.settings = Object.assign(DEFAULT_SETTINGS(), settings);
            save(); applyTheme(); closeSheet(); renderAll(); toast('Datos reemplazados');
          };
        }
      });
    };
    reader.readAsText(file);
  }
  function wipeAll() {
    openSheet({
      title: 'Borrar todo', right: '',
      render(body) {
        body.innerHTML = `<p class="footnote" style="font-size:15px;color:var(--label)">Se borran los ${db.movs.length} movimientos y tus ajustes de este dispositivo. No se puede deshacer. Si querés conservarlos, exportá una copia antes.${driveOn() ? ' La copia en Drive no se borra.' : ''}</p>
          <button class="btn tinted" id="w-bk">Exportar copia primero</button>
          <button class="btn danger" id="w-go">Borrar todos los datos</button>`;
        $('#w-bk').onclick = exportJSON;
        const b = $('#w-go');
        b.onclick = () => {
          if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Tocá de nuevo para borrar todo'; return; }
          db = { movs: [], settings: DEFAULT_SETTINGS() }; save(); applyTheme(); closeSheet(); renderAll(); toast('Datos borrados');
        };
      }
    });
  }

  // ---------- Copia cifrada en el Google Drive de cada persona ----------
  // Cada usuario entra con su cuenta de Google desde el teléfono. Permiso mínimo (drive.appdata): la app sólo ve
  // su propia carpeta oculta, no el resto del Drive. Lo que sube va cifrado con la contraseña de copias (vault.js).
  // El intermediario (Apps Script) sólo canjea el inicio de sesión porque el "client secret" no puede ir en una app pública;
  // nunca recibe los datos financieros.
  const GOOGLE_CLIENT_ID = '872037994128-cjgsu37c3mh7cdlsk9ic9l9f03f75agf.apps.googleusercontent.com';
  const BROKER_URL = 'https://script.google.com/macros/s/AKfycbzqMyt30WtQnaUyPxk6SOzmhvmL7Dzp_A6Y1QLTYwAUdyH89j1SoiD54lMbqLWtX_Sv/exec';
  const REDIRECT_URI = 'https://felipemanrique.github.io/mis-finanzas/oauth.html'; // registrada en Google Cloud y en el intermediario
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const DRIVE_KEY = 'finanzas-voz:cloud';
  const MAIN_FILE = 'finanzas.enc.json';
  const DAILY_KEEP = 60;
  try { localStorage.removeItem('finanzas-voz:drive'); } catch (e) { /* versión anterior sin cifrar */ }

  let drive = loadDrive();
  let access = null; // {token, exp} sólo en memoria
  let syncTimer = null, retryTimer = null, syncing = false, syncAgain = false, claimTimer = null;
  let vaultKey = null; // {key, salt, iter}

  function loadDrive() { try { return JSON.parse(localStorage.getItem(DRIVE_KEY)) || {}; } catch (e) { return {}; } }
  function saveDrive() {
    try { localStorage.setItem(DRIVE_KEY, JSON.stringify(drive)); } catch (e) { /* sin almacenamiento */ }
    renderDriveStatus();
  }
  const driveOn = () => !!drive.refreshToken;
  const driveReady = () => !!GOOGLE_CLIENT_ID;
  const backupPayload = () => ({ app: 'mis-finanzas', version: 1, exportedAt: new Date().toISOString(), movs: db.movs, settings: db.settings });
  const randomId = () => btoa(String.fromCharCode.apply(null, crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  // --- clave de cifrado guardada en el teléfono (IndexedDB, no exportable) ---
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('mis-finanzas', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('keys');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function idbDo(mode, fn) {
    const d = await idb();
    return new Promise((res, rej) => {
      const tx = d.transaction('keys', mode);
      const req = fn(tx.objectStore('keys'));
      tx.oncomplete = () => res(req && req.result);
      tx.onerror = () => rej(tx.error);
    });
  }
  async function getVaultKey() {
    if (vaultKey) return vaultKey;
    try { vaultKey = (await idbDo('readonly', (s) => s.get('vault'))) || null; } catch (e) { vaultKey = null; }
    return vaultKey;
  }
  async function setVaultKey(k) { vaultKey = k; try { await idbDo('readwrite', (s) => (k ? s.put(k, 'vault') : s.delete('vault'))); } catch (e) { /* queda en memoria */ } }

  // --- tokens ---
  async function broker(action, extra) {
    const res = await fetch(BROKER_URL, { method: 'POST', body: JSON.stringify(Object.assign({ action }, extra || {})) });
    try { return JSON.parse(await res.text()); } catch (e) { throw new Error('broker'); }
  }
  async function getToken() {
    if (access && access.exp - Date.now() > 60000) return access.token;
    const r = await broker('refresh', { refresh_token: drive.refreshToken });
    if (!r.ok) {
      if (r.error === 'invalid_grant') { drive.lastError = 'reauth'; saveDrive(); throw new Error('reauth'); }
      throw new Error('broker');
    }
    access = { token: r.access_token, exp: Date.now() + (r.expires_in || 3600) * 1000 };
    return access.token;
  }
  async function gfetch(method, url, body, headers, retried) {
    const t = await getToken();
    const res = await fetch(url, { method, headers: Object.assign({ Authorization: 'Bearer ' + t }, headers || {}), body });
    if (res.status === 401 && !retried) { access = null; return gfetch(method, url, body, headers, true); }
    if (!res.ok) { const e = new Error('drive_' + res.status); e.status = res.status; throw e; }
    if (res.status === 204) return null;
    const txt = await res.text();
    try { return JSON.parse(txt); } catch (e) { return txt; }
  }

  // --- archivos en la carpeta oculta de la app ---
  const API = 'https://www.googleapis.com/drive/v3/files';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  async function listFiles(q) {
    const u = `${API}?spaces=appDataFolder&pageSize=1000&fields=files(id,name,modifiedTime)&q=${encodeURIComponent(q || 'trashed=false')}`;
    return ((await gfetch('GET', u)) || {}).files || [];
  }
  async function findFile(name) { return (await listFiles(`name='${name}' and trashed=false`))[0] || null; }
  async function createFile(name, content) {
    const b = 'mf' + Math.random().toString(36).slice(2);
    const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: ['appDataFolder'] })}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${b}--`;
    return gfetch('POST', `${UPLOAD}?uploadType=multipart&fields=id`, body, { 'Content-Type': 'multipart/related; boundary=' + b });
  }
  const updateFile = (id, content) => gfetch('PATCH', `${UPLOAD}/${id}?uploadType=media&fields=id`, content, { 'Content-Type': 'application/json' });
  const readFile = (id) => gfetch('GET', `${API}/${id}?alt=media`);
  const deleteFile = (id) => gfetch('DELETE', `${API}/${id}`);

  async function writeMain(content) {
    if (drive.fileId) {
      try { await updateFile(drive.fileId, content); return; } catch (e) { if (e.status !== 404) throw e; drive.fileId = null; }
    }
    const f = await findFile(MAIN_FILE);
    if (f) { drive.fileId = f.id; await updateFile(f.id, content); } else drive.fileId = (await createFile(MAIN_FILE, content)).id;
  }
  async function readMain() {
    const f = drive.fileId ? { id: drive.fileId } : await findFile(MAIN_FILE);
    if (!f) return null;
    try { const env = await readFile(f.id); drive.fileId = f.id; return env; } catch (e) {
      if (e.status === 404 && drive.fileId) { drive.fileId = null; return readMain(); }
      throw e;
    }
  }
  async function writeDaily(content) {
    const day = todayIso();
    if (drive.lastDaily === day) return;
    const name = `finanzas-${day}.enc.json`;
    const f = await findFile(name);
    if (f) await updateFile(f.id, content); else await createFile(name, content);
    drive.lastDaily = day;
    // borrar copias diarias viejas
    const limit = isoDate(new Date(Date.now() - DAILY_KEEP * 864e5));
    const old = (await listFiles("name contains 'finanzas-2' and trashed=false")).filter((x) => (x.name.match(/\d{4}-\d{2}-\d{2}/) || [''])[0] < limit);
    for (const x of old) { try { await deleteFile(x.id); } catch (e) { /* se reintenta otro día */ } }
  }

  // --- sincronización ---
  function scheduleSync(delay = 2500) {
    if (!driveOn()) return;
    if (!drive.pending) { drive.pending = true; saveDrive(); }
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow(), delay);
  }

  async function syncNow(force) {
    if (!driveOn() || (!drive.pending && !force)) return;
    if (!navigator.onLine) { drive.lastError = 'offline'; saveDrive(); return; }
    if (syncing) { syncAgain = true; return; }
    const k = await getVaultKey();
    if (!k) { drive.lastError = 'nokey'; drive.pending = true; saveDrive(); return; }
    // no pisar una copia con datos usando una app vacía
    if (!db.movs.length && drive.lastCount > 0 && !force) { drive.lastError = 'would_empty'; saveDrive(); return; }
    syncing = true; clearTimeout(retryTimer);
    drive.pending = false; renderDriveStatus();
    try {
      const env = await Vault.seal(k, backupPayload());
      env.savedAt = new Date().toISOString();
      const content = JSON.stringify(env);
      await writeMain(content);
      await writeDaily(content);
      drive.lastAt = env.savedAt; drive.lastCount = db.movs.length; drive.lastError = null;
    } catch (e) {
      drive.pending = true;
      drive.lastError = e.message === 'reauth' ? 'reauth' : navigator.onLine ? 'server' : 'offline';
    }
    syncing = false; saveDrive();
    if (syncAgain) { syncAgain = false; scheduleSync(500); }
    else if (drive.pending && drive.lastError === 'server') retryTimer = setTimeout(() => syncNow(), 60000);
  }

  function retryDrive() {
    if (drive.pendingSession) claimSession();
    if (!driveOn()) return;
    if (drive.pending || drive.lastError === 'server') syncNow();
  }

  function relTime(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'recién';
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', '');
  }
  function driveState() {
    if (!driveOn()) return { level: 'off', text: '' };
    if (syncing) return { level: 'busy', text: 'Subiendo copia cifrada…' };
    const e = drive.lastError;
    if (e === 'reauth') return { level: 'error', text: 'Google cerró el acceso. Volvé a conectar tu cuenta.' };
    if (e === 'nokey') return { level: 'error', text: 'Falta tu contraseña de copias en este teléfono.' };
    if (e === 'would_empty') return { level: 'error', text: 'La app está vacía y tu Drive tiene datos: no subí nada. Restaurá desde Drive.' };
    if (drive.pending && e === 'offline') return { level: 'pending', text: 'Sin conexión. Se sube sola cuando vuelva internet.' };
    if (drive.pending && e === 'server') return { level: 'pending', text: 'No se pudo subir. Reintento en un minuto.' };
    if (drive.pending) return { level: 'pending', text: 'Hay cambios por subir.' };
    if (drive.lastAt) return { level: 'ok', text: `Copia cifrada al día · ${relTime(drive.lastAt)}` };
    return { level: 'ok', text: 'Conectado. La copia se sube con el próximo cambio.' };
  }
  function renderDriveStatus() {
    const st = driveState();
    const b = $('#btn-cloud');
    if (b) {
      b.hidden = st.level === 'off';
      b.dataset.level = st.level;
      b.setAttribute('aria-label', 'Copia en Drive: ' + st.text);
      b.title = st.text;
    }
    const s = $('#drv-status');
    if (s) s.textContent = st.text;
  }

  // --- conectar ---
  function authUrl(session) {
    const p = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', scope: SCOPE,
      access_type: 'offline', prompt: 'consent', state: session
    });
    return 'https://accounts.google.com/o/oauth2/v2/auth?' + p;
  }

  let pendingPassword = null; // sólo en memoria mientras se completa la conexión

  function passwordFields(confirm) {
    return `<div class="field-group">
        <div class="field"><label for="pw1">Contraseña</label><input id="pw1" type="password" autocomplete="${confirm ? 'new-password' : 'current-password'}" placeholder="mínimo 8 caracteres"></div>
        ${confirm ? '<div class="field"><label for="pw2">Repetila</label><input id="pw2" type="password" autocomplete="new-password"></div>' : ''}
      </div>`;
  }

  function openDriveConnect() {
    if (!driveReady()) { toast('La conexión con Google todavía no está configurada.'); return; }
    openSheet({
      title: 'Copia en Google Drive', right: '',
      render(body) {
        body.innerHTML = `<p class="footnote" style="font-size:15px;color:var(--label);margin:0">Cada cambio se guarda solo en tu Google Drive, cifrado con una contraseña que elegís vos. Sin la contraseña nadie puede leer esas copias, ni siquiera Google.</p>
          <p class="label-sm">Contraseña de copias</p>
          ${passwordFields(true)}
          <label class="field-group field" style="justify-content:space-between;gap:12px"><span style="font-size:15px">Entiendo que si la olvido, las copias no se pueden recuperar</span><span class="switch"><input type="checkbox" id="pw-ok"><span></span></span></label>
          <p class="footnote" style="margin-top:-8px">Guardala en el administrador de contraseñas del teléfono. Si ya tenés copias de otro teléfono, poné la misma contraseña.</p>
          <a class="btn" id="g-go" href="#" role="button" style="display:flex;align-items:center;justify-content:center;gap:10px;text-decoration:none">${ICON.google}Continuar con Google</a>
          <p class="footnote" style="margin-top:-6px">Google te va a pedir permiso para que la app guarde sus propios datos en tu Drive. La app no puede ver tus otros archivos.</p>`;
        $('#g-go').onclick = (e) => {
          const p1 = $('#pw1').value, p2 = $('#pw2').value;
          let msg = '';
          if (p1.length < 8) msg = 'La contraseña tiene que tener al menos 8 caracteres.';
          else if (p1 !== p2) msg = 'Las contraseñas no coinciden.';
          else if (!$('#pw-ok').checked) msg = 'Confirmá que entendés que la contraseña no se puede recuperar.';
          if (msg) { e.preventDefault(); toast(msg); return; }
          pendingPassword = p1;
          drive.pendingSession = randomId(); drive.sessionAt = Date.now(); saveDrive();
          e.currentTarget.href = authUrl(drive.pendingSession);
          e.currentTarget.target = '_blank'; e.currentTarget.rel = 'noopener';
          setTimeout(waitingSheet, 400);
          startClaimLoop();
        };
      }
    });
  }

  function waitingSheet() {
    openSheet({
      title: 'Conectando con Google', right: '',
      onLeft() { stopClaim(); drive.pendingSession = null; saveDrive(); closeSheet(); },
      render(body) {
        body.innerHTML = `<div class="listen"><div class="orb live" style="width:72px;height:72px">${ICON.cloud}</div>
          <div class="status">Elegí tu cuenta y tocá “Continuar” en la pantalla de Google. Después volvé a esta app.</div>
          <a class="link-btn" href="${esc(authUrl(drive.pendingSession))}" target="_blank" rel="noopener">Abrir Google de nuevo</a></div>`;
      }
    });
  }

  function stopClaim() { clearInterval(claimTimer); claimTimer = null; }
  function startClaimLoop() {
    stopClaim();
    claimTimer = setInterval(claimSession, 2500);
  }
  let claiming = false;
  async function claimSession() {
    if (!drive.pendingSession || claiming) return;
    if (Date.now() - (drive.sessionAt || 0) > 15 * 60000) { stopClaim(); drive.pendingSession = null; saveDrive(); return; }
    claiming = true;
    try {
      const r = await broker('claim', { session: drive.pendingSession });
      if (r.ok) {
        stopClaim();
        drive = { refreshToken: r.refresh_token };
        access = { token: r.access_token, exp: Date.now() + (r.expires_in || 3600) * 1000 };
        saveDrive();
        await afterGoogle();
      }
    } catch (e) { /* sigue esperando */ }
    claiming = false;
  }

  async function afterGoogle() {
    try {
      const about = await gfetch('GET', 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)');
      drive.email = about && about.user && about.user.emailAddress; saveDrive();
    } catch (e) { /* el mail es sólo informativo */ }
    let env = null;
    try { env = await readMain(); } catch (e) { toast('No pude leer tu Drive. Probá de nuevo.'); return; }
    if (!env) {
      if (!pendingPassword) return askPassword(null);
      await setVaultKey(await Vault.newKey(pendingPassword));
      pendingPassword = null;
      toast('Copia en Drive activada');
      closeSheet(); go('settings');
      if (db.movs.length) scheduleSync(200);
      return;
    }
    if (!pendingPassword) return askPassword(env);
    const k = await Vault.keyForEnvelope(pendingPassword, env);
    pendingPassword = null;
    try {
      const remote = await Vault.open(k, env);
      await setVaultKey(k);
      chooseData(remote, env.savedAt);
    } catch (e) { askPassword(env, true); }
  }

  // Pide la contraseña cuando ya hay copias (teléfono nuevo) o cuando se perdió la clave en este teléfono.
  function askPassword(env, wrong) {
    openSheet({
      title: env ? 'Tu contraseña de copias' : 'Elegí una contraseña', right: 'Continuar',
      onLeft() { closeSheet(); go('settings'); },
      render(body) {
        body.innerHTML = `${wrong ? `<div class="banner" style="margin:0">${ICON.warn}<div>Esa contraseña no abre tus copias. Probá de nuevo.</div></div>` : ''}
          <p class="footnote" style="font-size:15px;color:var(--label);margin:0">${env ? `Tu Drive ya tiene copias${env.savedAt ? ' (la última del ' + esc(new Date(env.savedAt).toLocaleDateString('es-AR')) + ')' : ''}. Ingresá la contraseña con la que las creaste.` : 'Elegí la contraseña con la que se cifran tus copias.'}</p>
          ${passwordFields(!env)}
          ${env ? '<button class="link-btn" id="pw-reset" style="justify-self:start;padding:0;color:var(--expense)">La olvidé: empezar de cero</button>' : ''}`;
        setTimeout(() => $('#pw1') && $('#pw1').focus(), 420);
        const reset = $('#pw-reset');
        if (reset) reset.onclick = () => resetCopies();
      },
      async onRight() {
        const p1 = $('#pw1').value;
        if (p1.length < 8) { toast('Mínimo 8 caracteres'); return; }
        if (!env) {
          if (p1 !== $('#pw2').value) { toast('Las contraseñas no coinciden'); return; }
          await setVaultKey(await Vault.newKey(p1));
          drive.lastError = null; saveDrive(); closeSheet(); go('settings'); scheduleSync(200);
          toast('Contraseña guardada');
          return;
        }
        $('#sheet-right').disabled = true;
        const k = await Vault.keyForEnvelope(p1, env);
        try {
          const remote = await Vault.open(k, env);
          await setVaultKey(k);
          if (drive.lastError === 'nokey') drive.lastError = null;
          saveDrive();
          chooseData(remote, env.savedAt);
        } catch (e) { askPassword(env, true); }
      }
    });
  }

  function resetCopies() {
    openSheet({
      title: 'Empezar de cero', right: '',
      onLeft() { closeSheet(); go('settings'); },
      render(body) {
        body.innerHTML = `<p class="footnote" style="font-size:15px;color:var(--label);margin:0">Se borran todas las copias de tu Drive (no se pueden abrir sin la contraseña) y se crea una nueva con los ${db.movs.length} movimientos de este teléfono.</p>
          <p class="label-sm">Nueva contraseña de copias</p>${passwordFields(true)}
          <button class="btn danger" id="rs-go">Borrar copias y empezar de cero</button>`;
        const b = $('#rs-go');
        b.onclick = async () => {
          const p1 = $('#pw1').value;
          if (p1.length < 8 || p1 !== $('#pw2').value) { toast(p1.length < 8 ? 'Mínimo 8 caracteres' : 'Las contraseñas no coinciden'); return; }
          if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Tocá de nuevo para borrar las copias'; return; }
          b.disabled = true; b.textContent = 'Borrando…';
          try {
            for (const f of await listFiles()) await deleteFile(f.id);
            drive.fileId = null; drive.lastDaily = null; drive.lastCount = 0;
            await setVaultKey(await Vault.newKey(p1));
            drive.lastError = null; saveDrive();
            await syncNow(true);
            closeSheet(); go('settings'); toast('Copias nuevas creadas');
          } catch (e) { b.disabled = false; b.textContent = 'Borrar copias y empezar de cero'; toast('No pude borrar las copias. Revisá internet.'); }
        };
      }
    });
  }

  // Tras abrir una copia: decidir qué datos quedan en el teléfono.
  function chooseData(remote, savedAt) {
    const rm = Array.isArray(remote.movs) ? remote.movs : [];
    const apply = (movs, settings, msg) => {
      db = { movs, settings: Object.assign(DEFAULT_SETTINGS(), settings || db.settings) };
      try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* sin espacio */ }
      drive.lastCount = rm.length;
      applyTheme(); closeSheet(); go('movs'); toast(msg);
      scheduleSync(300);
    };
    if (!db.movs.length) return apply(rm, remote.settings, `${rm.length} movimientos recuperados de Drive`);
    const local = db.movs.length;
    const ids = new Set(db.movs.map((m) => m.id));
    const extra = rm.filter((m) => !ids.has(m.id)).length;
    openSheet({
      title: 'Ya tenés datos en los dos lados', right: '',
      render(body) {
        body.innerHTML = `<p class="footnote" style="font-size:15px;color:var(--label);margin:0">Este teléfono tiene <strong>${local}</strong> movimientos y tu Drive <strong>${rm.length}</strong>${savedAt ? ' (copia del ' + esc(new Date(savedAt).toLocaleDateString('es-AR')) + ')' : ''}.</p>
          <button class="btn" id="cd-merge">Combinar (quedan ${local + extra})</button>
          <button class="btn tinted" id="cd-remote">Usar sólo los de Drive</button>
          <button class="btn tinted" id="cd-local">Usar sólo los de este teléfono</button>`;
        $('#cd-merge').onclick = () => apply(db.movs.concat(rm.filter((m) => !ids.has(m.id))), db.settings, 'Datos combinados');
        $('#cd-remote').onclick = () => apply(rm, remote.settings, 'Datos de Drive restaurados');
        $('#cd-local').onclick = () => { drive.lastCount = local; closeSheet(); go('settings'); syncNow(true); toast('Se usan los datos de este teléfono'); };
      }
    });
  }

  async function restoreFromDrive() {
    const k = await getVaultKey();
    let env;
    try { env = await readMain(); } catch (e) { toast(e.message === 'reauth' ? 'Volvé a conectar tu cuenta de Google.' : 'No pude leer tu Drive. Revisá internet.'); return; }
    if (!env) { toast('Todavía no hay copias en tu Drive.'); return; }
    if (!k) return askPassword(env);
    try { chooseData(await Vault.open(k, env), env.savedAt); } catch (e) { askPassword(env, true); }
  }

  function changePassword() {
    openSheet({
      title: 'Cambiar contraseña', right: 'Guardar',
      render(body) {
        body.innerHTML = `<p class="footnote" style="font-size:15px;color:var(--label);margin:0">Las copias se vuelven a cifrar con la contraseña nueva. Las copias diarias anteriores se borran, porque usan la vieja.</p>
          <p class="label-sm">Nueva contraseña</p>${passwordFields(true)}`;
      },
      async onRight() {
        const p1 = $('#pw1').value;
        if (p1.length < 8 || p1 !== $('#pw2').value) { toast(p1.length < 8 ? 'Mínimo 8 caracteres' : 'Las contraseñas no coinciden'); return; }
        $('#sheet-right').disabled = true;
        try {
          for (const f of await listFiles("name contains 'finanzas-2' and trashed=false")) await deleteFile(f.id);
          drive.lastDaily = null;
          await setVaultKey(await Vault.newKey(p1));
          await syncNow(true);
          closeSheet(); renderSettings(); toast('Contraseña cambiada');
        } catch (e) { $('#sheet-right').disabled = false; toast('No pude cambiarla. Revisá internet.'); }
      }
    });
  }

  async function disconnectDrive() {
    const rt = drive.refreshToken;
    drive = {}; access = null; saveDrive(); await setVaultKey(null);
    if (rt) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(rt), { method: 'POST', mode: 'no-cors' }).catch(() => {});
  }

  function driveSettingsHtml() {
    if (!driveOn()) {
      return `<h2 class="section-title">Copia en Google Drive</h2>
        <div class="list"><button class="item link" id="drv-connect">Conectar con Google</button></div>
        <p class="footnote">Cada cambio se guarda solo en tu Google Drive, cifrado con tu contraseña. Si no hay internet, se sube cuando vuelva. Cada persona usa su propia cuenta.</p>`;
    }
    return `<h2 class="section-title">Copia en Google Drive</h2>
      <div class="list">
        <div class="item"><span class="grow">${esc(drive.email || 'Cuenta de Google')}<span class="sub" id="drv-status" style="white-space:normal"></span></span></div>
        <button class="item link" id="drv-now">Subir copia ahora</button>
        <button class="item link" id="drv-restore">Restaurar desde Drive</button>
        <button class="item link" id="drv-pass">Cambiar contraseña de copias</button>
        <button class="item danger" id="drv-off">Desconectar</button>
      </div>
      <p class="footnote">Las copias van cifradas a una carpeta oculta de tu Drive que sólo usa esta app: una siempre actualizada y una por día (últimos ${DAILY_KEEP} días). Para borrarlas: Drive → Configuración → Administrar apps → Mis Finanzas → Borrar datos ocultos.</p>`;
  }
  function bindDriveSettings() {
    const c = $('#drv-connect'); if (c) c.onclick = openDriveConnect;
    const n = $('#drv-now'); if (n) n.onclick = async () => {
      if (drive.lastError === 'reauth') { openDriveConnect(); return; }
      if (drive.lastError === 'nokey') { restoreFromDrive(); return; }
      drive.pending = true;
      await syncNow();
      toast(drive.lastError ? driveState().text : 'Copia subida a Drive');
    };
    const r = $('#drv-restore'); if (r) r.onclick = restoreFromDrive;
    const p = $('#drv-pass'); if (p) p.onclick = changePassword;
    const o = $('#drv-off'); if (o) o.onclick = async () => {
      if (!o.classList.contains('armed')) { o.classList.add('armed'); o.textContent = 'Tocá de nuevo para desconectar'; return; }
      await disconnectDrive(); renderSettings(); toast('Desconectado. Tus copias siguen en tu Drive.');
    };
    renderDriveStatus();
  }

  // ---------- Navegación ----------
  function go(tab) {
    ui.tab = tab;
    $$('[data-view]').forEach((v) => (v.hidden = v.dataset.view !== tab));
    $$('.tab').forEach((t) => (t.dataset.tab === tab ? t.setAttribute('aria-current', 'page') : t.removeAttribute('aria-current')));
    try { history.replaceState(null, '', tab === 'movs' ? location.pathname : '#' + tab); } catch (e) { /* sin historial */ }
    renderAll();
    window.scrollTo(0, 0);
  }
  function renderAll() {
    if (ui.tab === 'movs') renderMovs();
    else if (ui.tab === 'stats') renderStats();
    else if (ui.tab === 'accounts') renderAccounts();
    else if (ui.tab === 'settings') renderSettings();
  }

  // ---------- Inicio ----------
  const APP_VERSION = '1.2.0';
  function init() {
    applyTheme();
    $$('.tab').forEach((t) => (t.onclick = () => go(t.dataset.tab)));
    $('#btn-mic').onclick = () => openVoice();
    $('#btn-add').onclick = () => openEditor(null);
    $('#scrim').onclick = closeSheet;
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetOpen()) closeSheet(); });
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]');
      if (!b) return;
      const n = +b.dataset.m;
      ui.month = n === 0 ? monthOf(todayIso()) : shiftMonth(ui.month, n);
      renderAll();
    });
    $('#q').addEventListener('input', (e) => { ui.q = e.target.value; renderList(); });
    $$('#type-filter button').forEach((b) => (b.onclick = () => { ui.type = b.dataset.f; renderMovs(); }));
    $('#import-file').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) onImportFile(f); };
    window.addEventListener('storage', (e) => { if (e.key === KEY) { db = load(); renderAll(); } if (e.key === DRIVE_KEY) { drive = loadDrive(); renderDriveStatus(); } });
    $('#btn-cloud').onclick = () => go('settings');
    window.addEventListener('online', () => retryDrive());
    window.addEventListener('offline', () => renderDriveStatus());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') retryDrive(); });
    setInterval(renderDriveStatus, 60000);

    const hash = location.hash.slice(1);
    go(['stats', 'accounts', 'settings'].includes(hash) ? hash : 'movs');
    renderDriveStatus();
    retryDrive();
    if (new URLSearchParams(location.search).get('voz') === '1') setTimeout(() => openVoice(), 300);

    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  window.__app = { get db() { return db; }, openReview, parseText };
  init();
})();
