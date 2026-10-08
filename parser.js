/* Intérprete de frases habladas → movimientos de dinero.
   Puro (sin DOM), se usa en el navegador (window.Parser) y en los tests de Node. */
(function (root) {
  'use strict';

  const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ñ/g, 'n');
  const norm = (s) => strip(String(s).toLowerCase());

  // ---------- Números ----------
  const UNITS = {
    cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
    diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
    dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22,
    veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28,
    veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80,
    noventa: 90, cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300,
    cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600,
    setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900
  };
  const THOUSAND = new Set(['mil', 'luca', 'lucas', 'k']);
  const MILLION = new Set(['millon', 'millones', 'palo', 'palos', 'mill', 'm']);

  // "5.500" → 5500 · "5,500" → 5500 · "1,5" → 1.5 · "12.500,50" → 12500.5
  function parseDigits(t) {
    const m = t.match(/^\d+(?:[.,]\d+)*$/);
    if (!m) return null;
    const dots = (t.match(/\./g) || []).length, commas = (t.match(/,/g) || []).length;
    if (dots && commas) {
      const dec = t.lastIndexOf('.') > t.lastIndexOf(',') ? '.' : ',';
      const th = dec === '.' ? ',' : '.';
      return parseFloat(t.split(th).join('').replace(dec, '.'));
    }
    const sep = dots ? '.' : commas ? ',' : null;
    if (!sep) return parseInt(t, 10);
    const parts = t.split(sep);
    if (parts.length > 2 || parts[parts.length - 1].length === 3) return parseInt(parts.join(''), 10);
    return parseFloat(parts.join('.'));
  }

  function trailingZeros(n) {
    if (!n || n % 1) return 0;
    let z = 0;
    while (n % 10 === 0) { n /= 10; z++; }
    return z;
  }

  // ---------- Tokenizado ----------
  function tokenize(text) {
    const out = [];
    String(text)
      .replace(/(u\$s|us\$|\$)\s*/gi, ' $1 ')
      .replace(/(\d)(k|mil|m)\b/gi, '$1 $2')
      .split(/\s+/)
      .filter(Boolean)
      .forEach((raw) => {
        const brk = /[.,;:!?]$/.test(raw) && !/\d[.,]$/.test(raw.slice(-2)) ? true : /[;:!?]$/.test(raw);
        const clean = raw.replace(/^[¿¡("'«]+|[.,;:!?)"'»]+$/g, '');
        if (!clean) return;
        out.push({ orig: clean, n: norm(clean), brk: brk || /[.,;]$/.test(raw) });
      });
    return out;
  }

  // Detecta números (en cifras o en palabras) y devuelve spans {start,end,value}
  function findNumbers(toks) {
    const spans = [];
    let i = 0;
    while (i < toks.length) {
      const isNum = (k) => k < toks.length && (parseDigits(toks[k].n) !== null || toks[k].n in UNITS || toks[k].n === 'mil');
      if (!isNum(i)) { i++; continue; }
      let total = 0, current = 0, j = i, lastMult = 1, end = i;
      while (j < toks.length) {
        const t = toks[j].n;
        const d = parseDigits(t);
        const small = d !== null ? d : (t in UNITS ? UNITS[t] : null);
        if (small !== null) {
          if (current && !(small < Math.pow(10, trailingZeros(current)))) break;
          current += small; end = j; j++;
          if (toks[j - 1].brk) break;
          continue;
        }
        if (THOUSAND.has(t) && (current || j === i || total)) {
          total += (current || 1) * 1000; current = 0; lastMult = 1000; end = j; j++;
          if (toks[j - 1].brk) break;
          continue;
        }
        if (MILLION.has(t) && (current || total) && (t.length > 1 || d === null)) {
          total = (total + (current || 1)) * 1e6; current = 0; lastMult = 1e6; end = j; j++;
          if (toks[j - 1].brk) break;
          continue;
        }
        if (t === 'y' && j + 1 < toks.length) {
          const nx = toks[j + 1].n;
          if ((nx === 'medio' || nx === 'media') && lastMult > 1) {
            total += lastMult / 2; end = j + 1; j += 2; break;
          }
          if (nx in UNITS && UNITS[nx] < 10 && current >= 20 && current % 10 === 0 && current < 100) { j++; continue; }
        }
        break;
      }
      const value = total + current;
      spans.push({ start: i, end, value });
      i = end + 1;
    }
    return spans;
  }

  // ---------- Diccionarios ----------
  const MONTHS = { enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7,
    septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11 };
  const WEEKDAYS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };

  const INCOME_WORDS = ['cobre', 'cobro', 'cobramos', 'me pagaron', 'me pago', 'me depositaron', 'me transfirieron',
    'me transfirio', 'me mandaron', 'me mando', 'me devolvieron', 'me dieron', 'me regalaron', 'recibi', 'ingreso',
    'ingresaron', 'ingreso de', 'entro', 'entraron', 'gane', 'vendi', 'sueldo', 'aguinaldo', 'salario', 'honorarios',
    'reintegro', 'cobranza', 'facture', 'me entraron', 'me ingresaron', 'deposito de'];
  const EXPENSE_WORDS = ['gaste', 'gasto', 'pague', 'pagamos', 'compre', 'compramos', 'abone', 'me cobraron',
    'transferi', 'le pague', 'le di', 'cargue', 'saque', 'invite', 'gastamos', 'pago de', 'egreso', 'salida'];

  const METHOD_WORDS = [
    ['Mercado Pago', ['mercado pago', 'mercadopago', 'con mp', 'por mp', 'el mp']],
    ['Débito', ['debito', 'tarjeta de debito']],
    ['Crédito', ['credito', 'tarjeta de credito', 'con la visa', 'con visa', 'con master', 'mastercard', 'amex', 'en cuotas', 'cuotas', 'con tarjeta', 'con la tarjeta']],
    ['Transferencia', ['transferencia', 'transferi', 'me transfirieron', 'me transfirio', 'por banco', 'cbu', 'alias']],
    ['Efectivo', ['efectivo', 'cash', 'en mano', 'billete']]
  ];

  const DEFAULT_CATEGORIES = {
    gasto: [
      { name: 'Supermercado', color: '#34C759', kw: ['super', 'supermercado', 'mercado', 'almacen', 'chino', 'verduleria', 'carniceria', 'carne', 'verdura', 'fruta', 'coto', 'dia', 'carrefour', 'jumbo', 'disco', 'changomas', 'vea', 'walmart', 'mayorista', 'diarco', 'vital', 'makro', 'kiosco', 'panaderia', 'pan', 'comestibles', 'mercaderia', 'fiambreria', 'dietetica'] },
      { name: 'Comida y salidas', color: '#FF9500', kw: ['restaurante', 'restaurant', 'resto', 'bar', 'cena', 'almuerzo', 'desayuno', 'merienda', 'cafe', 'cafeteria', 'pizza', 'empanadas', 'hamburguesa', 'helado', 'delivery', 'pedidos ya', 'pedidosya', 'rappi', 'comida', 'birra', 'cerveza', 'parrilla', 'sushi', 'salida', 'boliche', 'tragos', 'vino', 'asado', 'facturas', 'sandwich', 'milanesa', 'lomito'] },
      { name: 'Transporte', color: '#30B0C7', kw: ['colectivo', 'bondi', 'subte', 'tren', 'sube', 'uber', 'cabify', 'didi', 'taxi', 'remis', 'peaje', 'estacionamiento', 'cochera', 'pasaje', 'micro', 'omnibus', 'avion', 'vuelo'] },
      { name: 'Auto', color: '#5856D6', kw: ['nafta', 'combustible', 'gasoil', 'gnc', 'ypf', 'shell', 'axion', 'puma', 'cargue', 'mecanico', 'taller', 'service', 'gomeria', 'lavadero', 'patente', 'seguro del auto', 'vtv', 'repuesto', 'aceite'] },
      { name: 'Servicios', color: '#007AFF', kw: ['luz', 'gas', 'agua', 'internet', 'wifi', 'celular', 'telefono', 'cable', 'edenor', 'edesur', 'metrogas', 'aysa', 'personal', 'claro', 'movistar', 'telecentro', 'fibertel', 'flow', 'factura de', 'abono', 'electricidad', 'emsa', 'epec', 'edea'] },
      { name: 'Vivienda', color: '#A2845E', kw: ['alquiler', 'expensas', 'hipoteca', 'inmobiliaria', 'departamento', 'depto', 'casa', 'arreglo', 'plomero', 'electricista', 'pintura', 'ferreteria', 'materiales', 'corralon'] },
      { name: 'Salud', color: '#FF3B30', kw: ['farmacia', 'remedio', 'remedios', 'medicamento', 'medicamentos', 'medico', 'doctor', 'dentista', 'odontologo', 'prepaga', 'obra social', 'osde', 'swiss medical', 'galeno', 'psicologo', 'terapia', 'analisis', 'consulta', 'kinesiologo', 'oculista', 'anteojos', 'clinica', 'hospital', 'gimnasio', 'gym'] },
      { name: 'Educación', color: '#AF52DE', kw: ['facultad', 'universidad', 'colegio', 'escuela', 'curso', 'cuota del colegio', 'libro', 'libros', 'apunte', 'apuntes', 'fotocopias', 'matricula', 'clase', 'clases', 'profesor', 'maestria', 'posgrado', 'ingles', 'utiles'] },
      { name: 'Ocio', color: '#FF2D55', kw: ['cine', 'teatro', 'recital', 'show', 'entrada', 'entradas', 'juego', 'juegos', 'futbol', 'cancha', 'padel', 'viaje', 'vacaciones', 'hotel', 'airbnb', 'excursion', 'museo', 'steam', 'playstation'] },
      { name: 'Suscripciones', color: '#64D2FF', kw: ['netflix', 'spotify', 'disney', 'hbo', 'max', 'amazon prime', 'prime video', 'youtube', 'icloud', 'google one', 'chatgpt', 'claude', 'suscripcion', 'apple', 'paramount', 'star plus'] },
      { name: 'Ropa', color: '#FFCC00', kw: ['ropa', 'zapatillas', 'zapatos', 'remera', 'pantalon', 'campera', 'buzo', 'jean', 'vestido', 'camisa', 'medias', 'indumentaria', 'shopping'] },
      { name: 'Hogar', color: '#8E8E93', kw: ['muebles', 'mueble', 'electrodomestico', 'heladera', 'lavarropas', 'limpieza', 'articulos de limpieza', 'bazar', 'decoracion', 'sabanas', 'toallas', 'mercadolibre', 'mercado libre', 'garrafa'] },
      { name: 'Impuestos', color: '#636366', kw: ['impuesto', 'impuestos', 'afip', 'arca', 'monotributo', 'ingresos brutos', 'rentas', 'abl', 'inmobiliario', 'tasa', 'municipal', 'ganancias', 'bienes personales', 'comision', 'mantenimiento de cuenta'] },
      { name: 'Mascotas', color: '#D4A017', kw: ['veterinaria', 'veterinario', 'perro', 'gato', 'alimento balanceado', 'balanceado', 'mascota', 'pet shop', 'petshop'] },
      { name: 'Regalos', color: '#FF6482', kw: ['regalo', 'regalos', 'cumpleanos', 'cumple', 'donacion', 'colecta'] },
      { name: 'Otros gastos', color: '#AEAEB2', kw: [] }
    ],
    ingreso: [
      { name: 'Sueldo', color: '#34C759', kw: ['sueldo', 'salario', 'aguinaldo', 'recibo', 'quincena', 'haberes', 'bono'] },
      { name: 'Trabajos y honorarios', color: '#007AFF', kw: ['honorarios', 'factura', 'facture', 'cliente', 'trabajo', 'changa', 'proyecto', 'consultoria', 'medicion', 'mediciones', 'auditoria', 'informe', 'servicio'] },
      { name: 'Ventas', color: '#FF9500', kw: ['vendi', 'venta', 'ventas', 'mercadolibre', 'mercado libre'] },
      { name: 'Inversiones', color: '#5856D6', kw: ['plazo fijo', 'intereses', 'interes', 'dividendos', 'rendimiento', 'fondo comun', 'cedears', 'acciones', 'bonos', 'cripto'] },
      { name: 'Reintegros y regalos', color: '#FF2D55', kw: ['reintegro', 'devolucion', 'me devolvieron', 'regalo', 'me regalaron', 'cashback'] },
      { name: 'Otros ingresos', color: '#AEAEB2', kw: [] }
    ]
  };

  const STOP_EDGE = new Set(['en', 'de', 'del', 'por', 'para', 'el', 'la', 'los', 'las', 'un', 'una', 'y', 'al', 'a', 'con', 'que', 'mi', 'mis', 'o']);
  const SPLIT_WORDS = new Set(['y', 'despues', 'ademas', 'tambien', 'luego', 'otro', 'otra', 'mas']);
  const CURRENCY_AFTER = new Set(['pesos', 'peso', 'mangos', 'dolares', 'dolar', 'usd', 'verdes', 'lucas', 'luca', 'mil', 'palos']);

  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };

  function hasPhrase(text, phrase) {
    return new RegExp('(^|\\s)' + phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)').test(text);
  }

  // ---------- Fechas ----------
  // Devuelve {date, used:Set<idx>}
  function findDate(toks, numSpans, today) {
    const used = new Set();
    const n = toks.map((t) => t.n);
    for (let i = 0; i < n.length; i++) {
      const w = n[i];
      if (w === 'hoy') { used.add(i); return { date: iso(today), used }; }
      if (w === 'anteayer' || w === 'antier') { used.add(i); return { date: iso(addDays(today, -2)), used }; }
      if (w === 'antes' && n[i + 1] === 'de' && n[i + 2] === 'ayer') { [i, i + 1, i + 2].forEach((k) => used.add(k)); return { date: iso(addDays(today, -2)), used }; }
      if (w === 'ayer') { used.add(i); return { date: iso(addDays(today, -1)), used }; }
      if (w === 'hace') {
        const sp = numSpans.find((s) => s.start === i + 1);
        const unit = sp ? n[sp.end + 1] : n[i + 1];
        const qty = sp ? sp.value : 1;
        if (/^dias?$/.test(unit || '')) {
          used.add(i); if (sp) { for (let k = sp.start; k <= sp.end; k++) used.add(k); used.add(sp.end + 1); } else used.add(i + 1);
          sp && (sp.isDate = true);
          return { date: iso(addDays(today, -qty)), used };
        }
        if (/^semanas?$/.test(unit || '')) {
          used.add(i); if (sp) { for (let k = sp.start; k <= sp.end; k++) used.add(k); used.add(sp.end + 1); } else used.add(i + 1);
          sp && (sp.isDate = true);
          return { date: iso(addDays(today, -7 * qty)), used };
        }
      }
      if (w in WEEKDAYS) {
        let diff = (today.getDay() - WEEKDAYS[w] + 7) % 7;
        if (diff === 0) diff = 7;
        used.add(i);
        if (n[i - 1] === 'el' || n[i - 1] === 'este') used.add(i - 1);
        if (n[i + 1] === 'pasado') used.add(i + 1);
        return { date: iso(addDays(today, -diff)), used };
      }
      // "3/10" o "3/10/2026"
      const m = w.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
      if (m) {
        let y = m[3] ? +m[3] : today.getFullYear();
        if (y < 100) y += 2000;
        let d = new Date(y, +m[2] - 1, +m[1]);
        if (!m[3] && d > today) d = new Date(y - 1, +m[2] - 1, +m[1]);
        used.add(i);
        return { date: iso(d), used };
      }
    }
    // "el 3 de octubre", "el día 5", "el 5"
    for (const sp of numSpans) {
      const v = sp.value;
      if (v < 1 || v > 31 || v % 1) continue;
      const before = n[sp.start - 1], before2 = n[sp.start - 2];
      const after = n[sp.end + 1], after2 = n[sp.end + 2];
      const monthIdx = after === 'de' && after2 in MONTHS ? MONTHS[after2] : (after in MONTHS ? MONTHS[after] : null);
      const dayWord = before === 'dia' || (before === 'el' && monthIdx !== null) || (before === 'el' && before2 !== 'en');
      if (monthIdx === null && !(before === 'dia')) continue;
      if (!dayWord && monthIdx === null) continue;
      let y = today.getFullYear();
      let mo = monthIdx !== null ? monthIdx : today.getMonth();
      let d = new Date(y, mo, v);
      if (d > today) d = monthIdx !== null ? new Date(y - 1, mo, v) : new Date(y, mo - 1, v);
      for (let k = sp.start; k <= sp.end; k++) used.add(k);
      if (before === 'dia') { used.add(sp.start - 1); if (before2 === 'el') used.add(sp.start - 2); }
      else if (before === 'el') used.add(sp.start - 1);
      if (monthIdx !== null) { if (after === 'de') { used.add(sp.end + 1); used.add(sp.end + 2); } else used.add(sp.end + 1); }
      sp.isDate = true;
      return { date: iso(d), used };
    }
    return { date: null, used };
  }

  // ---------- Elección del monto ----------
  function scoreSpan(sp, toks) {
    const n = toks.map((t) => t.n);
    let s = 0;
    const before = n[sp.start - 1], after = n[sp.end + 1];
    if (before === '$' || before === 'u$s' || before === 'us$') s += 50;
    if (after && CURRENCY_AFTER.has(after)) s += 40;
    if (sp.value >= 100) s += 10;
    if (after && /^cuotas?$/.test(after)) s -= 100;
    if (after && /^(unidades|kilos?|kg|litros?|personas|cafes|veces|horas|dias|meses|anos|metros)$/.test(after)) s -= 30;
    return s + Math.log10(sp.value + 1);
  }

  function detectType(text) {
    let best = null, pos = Infinity;
    for (const w of INCOME_WORDS) { const m = text.search(new RegExp('(^|\\s)' + w + '(\\s|$)')); if (m >= 0 && m < pos) { pos = m; best = 'ingreso'; } }
    for (const w of EXPENSE_WORDS) { const m = text.search(new RegExp('(^|\\s)' + w + '(\\s|$)')); if (m >= 0 && m < pos) { pos = m; best = 'gasto'; } }
    return best;
  }

  function detectMethod(text, methods) {
    for (const [name, kws] of METHOD_WORDS) {
      if (methods && !methods.includes(name)) continue;
      if (kws.some((k) => hasPhrase(text, k))) return name;
    }
    if (methods) {
      for (const m of methods) if (hasPhrase(text, norm(m))) return m;
      // medios propios ("Ualá", "Débito Galicia"): alcanza con una palabra distintiva del nombre
      const generic = new Set(['tarjeta', 'cuenta', 'banco', 'debito', 'credito', 'pago', 'billetera', 'virtual']);
      for (const m of methods) {
        if (norm(m).split(/\s+/).some((w) => w.length >= 3 && !generic.has(w) && hasPhrase(text, w))) return m;
      }
      // "con débito" cuando el medio se llama distinto ("Débito Galicia")
      for (const [name, kws] of METHOD_WORDS) {
        if (!kws.some((k) => hasPhrase(text, k))) continue;
        const key = norm(name).split(' ')[0];
        const hit = methods.find((m) => norm(m).includes(key));
        if (hit) return hit;
      }
    }
    return null;
  }

  function detectCategory(text, type, categories) {
    const list = (categories || DEFAULT_CATEGORIES)[type] || [];
    let best = null, bestLen = 0;
    for (const c of list) {
      const words = [norm(c.name)].concat((c.kw || []).map(norm));
      for (const k of words) {
        if (k && k.length > bestLen && (hasPhrase(text, k) || (k.length > 4 && hasPhrase(text, k + 's')))) { best = c.name; bestLen = k.length; }
      }
    }
    return best;
  }

  function cleanDescription(toks, used) {
    // reconstruir respetando el orden original, sacando conectores en los bordes
    let words = toks.map((t, i) => (used.has(i) ? null : t)).filter(Boolean);
    words = words.filter((t) => !(/^[\d.,$]+$/.test(t.n)) && !['pesos', 'peso', 'dolares', 'dolar', 'usd', 'u$s', 'us$', '$', 'mangos', 'verdes'].includes(t.n));
    const verbs = new Set(['gaste', 'pague', 'pagamos', 'compre', 'compramos', 'abone', 'cobre', 'cobramos', 'recibi', 'gane', 'gastamos',
      'transferi', 'cargue', 'gaste', 'ingrese', 'registra', 'registrar', 'anota', 'anotar', 'agrega', 'agregar', 'carga', 'cargar', 'gasto', 'ingreso', 'egreso',
      'tambien', 'despues', 'ademas', 'luego', 'otro', 'otra', 'fueron', 'fue', 'son', 'eran', 'aprox', 'aproximadamente', 'total', 'monto']);
    const me = new Set(['pagaron', 'pago', 'depositaron', 'transfirieron', 'transfirio', 'mandaron', 'mando', 'dieron', 'devolvieron', 'regalaron', 'cobraron', 'entraron', 'ingresaron']);
    words = words.filter((t, i, arr) => {
      if (verbs.has(t.n)) return false;
      if (t.n === 'me' && arr[i + 1] && me.has(arr[i + 1].n)) return false;
      if (me.has(t.n) && arr[i - 1] && arr[i - 1].n === 'me') return false;
      if ((t.n === 'entro' || t.n === 'entraron') && i === 0) return false;
      return true;
    });
    while (words.length && STOP_EDGE.has(words[0].n)) words.shift();
    while (words.length && STOP_EDGE.has(words[words.length - 1].n)) words.pop();
    let s = words.map((t) => t.orig).join(' ').replace(/\s+/g, ' ').trim();
    if (s) s = s.charAt(0).toUpperCase() + s.slice(1);
    return s;
  }

  function methodTokens(toks) {
    const used = new Set();
    const n = toks.map((t) => t.n);
    for (const [, kws] of METHOD_WORDS) {
      for (const k of kws) {
        const parts = k.split(' ');
        for (let i = 0; i + parts.length <= n.length; i++) {
          if (parts.every((p, j) => n[i + j] === p)) {
            for (let j = 0; j < parts.length; j++) used.add(i + j);
            // conectores antes: "con", "con la", "por", "en", "con tarjeta de"
            let b = i - 1;
            while (b >= 0 && ['con', 'la', 'el', 'por', 'en', 'tarjeta', 'de', 'una', 'mi'].includes(n[b]) && i - b <= 3) { used.add(b); b--; }
          }
        }
      }
    }
    return used;
  }

  // ---------- Principal ----------
  /**
   * @param {string} text frase dictada
   * @param {object} opts {today: Date, categories, methods: string[], defaultMethod, defaultCurrency}
   * @returns {Array<{type, amount, currency, category, method, date, description, installments, confidence}>}
   */
  function parse(text, opts = {}) {
    const today = opts.today ? new Date(opts.today) : new Date();
    const toks = tokenize(text);
    if (!toks.length) return [];
    const spans = findNumbers(toks);

    // fecha global (se aplica a todos los movimientos si se menciona una vez)
    const dateInfo = findDate(toks, spans, today);
    // cuotas
    spans.forEach((sp) => { if (/^cuotas?$/.test(toks[sp.end + 1] ? toks[sp.end + 1].n : '')) sp.isInstallments = true; });
    const candidates = spans.filter((s) => !s.isDate && !s.isInstallments && s.value > 0);
    const instSpan = spans.find((s) => s.isInstallments);

    // ¿varios movimientos? separar entre montos que tengan un separador entre medio
    let segments = [{ from: 0, to: toks.length - 1 }];
    const strong = candidates.filter((s) => scoreSpan(s, toks) >= 10 || s.value >= 100);
    if (strong.length > 1) {
      segments = [];
      let from = 0;
      for (let k = 0; k < strong.length - 1; k++) {
        const a = strong[k], b = strong[k + 1];
        let cut = -1;
        for (let i = b.start - 1; i > a.end; i--) {
          if (SPLIT_WORDS.has(toks[i].n)) { cut = i; break; }
          if (toks[i - 1] && toks[i - 1].brk && i - 1 >= a.end) { cut = i; break; }
        }
        if (cut === -1 && toks[a.end].brk) cut = a.end + 1;
        if (cut === -1) {
          // "café 2000 nafta 5000": sin separador, cortar justo después del monto si lo que sigue tiene sustantivo propio
          const descA = a.start > from;
          if (descA) cut = a.end + 1; else continue;
        }
        segments.push({ from, to: cut - 1 });
        from = cut;
      }
      segments.push({ from, to: toks.length - 1 });
      segments = segments.filter((s) => s.to >= s.from);
    }

    const results = [];
    let prevType = null, prevMethod = null;
    const fullText = toks.map((t) => t.n).join(' ');
    const globalType = detectType(fullText);
    const globalMethod = detectMethod(fullText, opts.methods);

    for (const seg of segments) {
      const segToks = toks.slice(seg.from, seg.to + 1);
      const segText = segToks.map((t) => t.n).join(' ');
      const segSpans = candidates.filter((s) => s.start >= seg.from && s.end <= seg.to);
      if (!segSpans.length) {
        // segmento sin monto: si hay un resultado previo, agregar descripción
        continue;
      }
      const amountSpan = segSpans.slice().sort((x, y) => scoreSpan(y, toks) - scoreSpan(x, toks))[0];

      const used = new Set();
      for (let k = amountSpan.start; k <= amountSpan.end; k++) used.add(k);
      const after = toks[amountSpan.end + 1];
      if (after && CURRENCY_AFTER.has(after.n) && !['mil', 'lucas', 'luca', 'palos'].includes(after.n)) used.add(amountSpan.end + 1);
      dateInfo.used.forEach((k) => used.add(k));
      if (instSpan) { for (let k = instSpan.start; k <= instSpan.end + 1; k++) used.add(k); if (toks[instSpan.start - 1] && toks[instSpan.start - 1].n === 'en') used.add(instSpan.start - 1); }
      methodTokens(toks).forEach((k) => used.add(k));
      // otros números del segmento (cantidades) se quedan en la descripción

      const segUsed = new Set([...used].filter((k) => k >= seg.from && k <= seg.to).map((k) => k - seg.from));

      let type = detectType(segText) || prevType || globalType || 'gasto';
      let currency = opts.defaultCurrency || 'ARS';
      if (/(^|\s)(dolares|dolar|usd|u\$s|us\$|verdes)(\s|$)/.test(segText) || /(^|\s)(dolares|dolar|usd|u\$s|us\$|verdes)(\s|$)/.test(fullText) && segments.length === 1) currency = 'USD';
      else if (/(^|\s)(pesos|peso|ars|mangos|lucas)(\s|$)/.test(segText)) currency = 'ARS';

      const method = detectMethod(segText, opts.methods) || prevMethod || globalMethod || opts.defaultMethod || 'Efectivo';
      const category = detectCategory(segText, type, opts.categories) ||
        (type === 'ingreso' ? 'Otros ingresos' : 'Otros gastos');
      const description = cleanDescription(segToks, segUsed);

      let confidence = 0.5;
      if (scoreSpan(amountSpan, toks) >= 40) confidence += 0.2;
      if (detectType(segText)) confidence += 0.15;
      if (detectCategory(segText, type, opts.categories)) confidence += 0.15;

      results.push({
        type,
        amount: Math.round(amountSpan.value * 100) / 100,
        currency,
        category,
        method,
        date: dateInfo.date || iso(today),
        description: description || category,
        installments: instSpan ? instSpan.value : null,
        confidence: Math.min(1, confidence)
      });
      prevType = type;
      prevMethod = detectMethod(segText, opts.methods) || prevMethod;
    }
    return results;
  }

  const api = { parse, detectCategory, tokenize, findNumbers, parseDigits, DEFAULT_CATEGORIES, METHODS: METHOD_WORDS.map((m) => m[0]), norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Parser = api;
})(typeof window !== 'undefined' ? window : globalThis);
