/* Asistente DIGAR v4 - modulo independiente. Lee los datos del POS desde localStorage (yimi_*).
   Se activa con: <script src="asistente.js"></script> antes de </body>.
   Se abre con abrirAsistente() (opcion "Asistente" en Configuraciones). Por defecto son reglas sobre tus datos
   (gratis y sin limites); si pegas una clave de Gemini o Groq en Informe, el chat PIENSA con IA real usando tus datos. */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.__asistenteDigar) return;
  const VER = 'v5 2026-10-24';
  const D = 864e5, MEMK = 'yimi_ia_mem';
  const LS = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const esc = s => (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $m = n => '$' + ((Math.abs(n || 0) >= 100) ? Math.round(n || 0) : Math.round((n || 0) * 100) / 100).toLocaleString('es-MX', { maximumFractionDigits: 2 });
  const hora12 = h => (h % 12 || 12) + (h < 12 ? ' am' : ' pm');
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const hace = (ms, now) => { const x = new Date(ms), y = new Date(now); x.setHours(0, 0, 0, 0); y.setHours(0, 0, 0, 0); const d = Math.round((y - x) / 864e5); return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : 'hace ' + d + ' días'; };
  const NOMD = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const hoyStr = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  const lev = (a, b) => {
    if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
    let p = []; for (let j = 0; j <= b.length; j++) p[j] = j;
    for (let i = 1; i <= a.length; i++) { const c = [i]; for (let j = 1; j <= b.length; j++) c[j] = Math.min(c[j - 1] + 1, p[j] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; }
    return p[b.length];
  };
  let mem = LS(MEMK) || {};
  ['precios', 'desc', 'resp', 'cajas', 'fb', 'cal', 'noSirve'].forEach(k => { mem[k] = mem[k] || {}; });
  mem.hechas = mem.hechas || 0; mem.chat = mem.chat || []; mem.sinEntender = mem.sinEntender || []; mem.pred = mem.pred || [];
  mem.alias = mem.alias || {}; mem.aprendidas = mem.aprendidas || {}; mem.uso = mem.uso || {}; mem.ctx = mem.ctx || {};
  const save = () => { try { localStorage.setItem(MEMK, JSON.stringify(mem)); } catch (e) {} };
  const activo = (key, dias) => !(mem.desc[key] && Date.now() - mem.desc[key] < (dias || 14) * D);
  const provOk = (r, now) => { const h = mem.resp['hay:' + r.id]; return !(h && h.v === 'no' && now - h.ts < 21 * D); };

  // ---------- DATOS ----------
  function calcMg(arr) {
    let ing = 0, gan = 0, ing0 = 0; const ceros = {};
    arr.forEach(t => (t.items || []).forEach(i => {
      const pr = Number(i.precioPersonalizado != null ? i.precioPersonalizado : i.precio) || 0, q = Number(i.cant) || 0, c = Number(i.costo) || 0;
      if (c > 0.01) { ing += pr * q; gan += (pr - c) * q; } else { ing0 += pr * q; ceros[i.nombre] = 1; }
    }));
    return { ing, gan, m: ing ? gan / ing * 100 : null, ing0, ceros: Object.keys(ceros) };
  }
  function analizar() {
    const now = Date.now();
    const prods = LS('yimi_productos') || [], todas = LS('yimi_trans') || [];
    const trAll = todas.filter(t => t.tipo === 'Venta' && Number(t.id) > 1e12);
    const tr = trAll.filter(t => now - Number(t.id) <= 28 * D);
    const minId = trAll.length ? Math.min(...trAll.map(t => Number(t.id))) : now;
    const semanas = Math.max(1, Math.min(4, (now - minId) / (7 * D)));
    const P = {};
    prods.forEach(p => { const id = String(p.id); P[id] = { p, id, nombre: p.nombre || '', stock: Number(p.stock) || 0, precio: Number(p.precio) || 0, costo: Number(p.costo) || 0, caja: Number(mem.cajas[id]) || 0, u28: 0, u14: 0, u7: 0, ult: 0, uHoy: 0, dia: [0, 0, 0, 0, 0, 0, 0] }; });
    trAll.forEach(t => (t.items || []).forEach(i => { const r = P[String(i.id)]; if (r) r.ult = Math.max(r.ult, Number(t.id)); }));
    const pares = {}, horas = new Array(24).fill(0), hoyDS = new Date(now).toDateString();
    tr.forEach(t => {
      const ids = [], esHoy = new Date(Number(t.id)).toDateString() === hoyDS;
      (t.items || []).forEach(i => {
        const r = P[String(i.id)]; if (!r) return;
        const c = Number(i.cant) || 0;
        r.u28 += c; r.dia[new Date(Number(t.id)).getDay()] += c;
        if (esHoy) r.uHoy += c;
        if (now - Number(t.id) <= 7 * D) r.u7 += c;
        if (now - Number(t.id) <= 14 * D) r.u14 += c;
        if (ids.indexOf(r.id) < 0) ids.push(r.id);
      });
      horas[new Date(Number(t.id)).getHours()]++;
      for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) { const k = [ids[a], ids[b]].sort().join('|'); pares[k] = (pares[k] || 0) + 1; }
    });
    const L = Object.values(P);
    L.forEach(r => { r.sem = Math.max(r.u28 / semanas, r.u14 / 2); r.margen = r.precio > 0 && r.costo > 0 ? (r.precio - r.costo) / r.precio * 100 : null; r.gpp = r.precio - r.costo; });
    const orden = L.filter(r => r.u28 > 0).sort((a, b) => b.u28 - a.u28);
    const p75 = orden.length ? orden[Math.floor(orden.length * 0.25)].u28 : 999;
    const C = {};
    trAll.forEach(t => {
      const n = t.clienteNombre || 'Cliente General';
      const c = C[n] || (C[n] = { nombre: n, compras: 0, total: 0, ult: 0, debe: 0, desde: 0 });
      c.compras++; c.total += Number(t.monto) || 0; c.ult = Math.max(c.ult, Number(t.id));
      if (t.esCredito && Number(t.saldoPendiente) > 0.5) { c.debe += Number(t.saldoPendiente); c.desde = c.desde ? Math.min(c.desde, Number(t.id)) : Number(t.id); }
    });
    const occ = [0, 0, 0, 0, 0, 0, 0];
    for (let x = Math.max(minId, now - 28 * D); x <= now; x += D) occ[new Date(x).getDay()]++;
    for (let d = 0; d < 7; d++) occ[d] = Math.max(1, occ[d]);
    return { now, L, P, orden, p75, tr, trAll, todas, semanas, pares, horas, occ, C: Object.values(C), CL: LS('yimi_clientes') || [] };
  }
  const sumF = (arr, f) => arr.reduce((a, t) => a + (Number(t[f]) || 0), 0);
  const venEntre = (A, a, b) => A.trAll.filter(t => { const x = Number(t.id); return x >= a && x < b; });
  function periodo(n, now) {
    const d0 = new Date(now); d0.setHours(0, 0, 0, 0); const t0 = d0.getTime(), dow = (d0.getDay() + 6) % 7, lun = t0 - dow * D;
    let m;
    if (/anteayer|antier/.test(n)) return { a: t0 - 2 * D, b: t0 - D, l: 'anteayer' };
    if (/\bayer\b/.test(n)) return { a: t0 - D, b: t0, l: 'ayer' };
    if (/semana pasada|semana anterior/.test(n)) return { a: lun - 7 * D, b: lun, l: 'la semana pasada' };
    if (/mes pasado/.test(n)) { const a = new Date(d0.getFullYear(), d0.getMonth() - 1, 1).getTime(), b = new Date(d0.getFullYear(), d0.getMonth(), 1).getTime(); return { a, b, l: 'el mes pasado' }; }
    if ((m = n.match(/ultimos? (\d+) dias/))) return { a: t0 - (parseInt(m[1], 10) - 1) * D, b: t0 + D, l: 'en los últimos ' + m[1] + ' días' };
    if (/esta semana|\bsemana\b/.test(n)) return { a: lun, b: t0 + D, l: 'esta semana' };
    if (/este mes|\bmes\b/.test(n)) return { a: new Date(d0.getFullYear(), d0.getMonth(), 1).getTime(), b: t0 + D, l: 'este mes' };
    if ((m = n.match(/\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/))) {
      const idx = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'].indexOf(m[1]); const atras = (d0.getDay() - idx + 7) % 7;
      return { a: t0 - atras * D, b: t0 - atras * D + D, l: 'el ' + NOMD[idx] };
    }
    if (/\bhoy\b/.test(n)) return { a: t0, b: t0 + D, l: 'hoy' };
    return null;
  }

  // ---------- PLAN DEL DIA / PEDIDO / RUTA ----------
  function plan(A) {
    const dow = new Date(A.now).getDay(), lab = dow >= 1 && dow <= 5, ds = [];
    for (let k = 0, d = lab ? dow : 1; k < 5; k++, d = d % 5 + 1) ds.push(d);
    const filas = A.L.filter(r => r.u28 >= 2).map(r => {
      const av = d => r.dia[d] / A.occ[d];
      let e0 = 0; ds.forEach(d => { e0 += av(d); });
      const hoyEsp = lab ? av(dow) : 0;
      if (lab) e0 -= Math.min(r.uHoy, hoyEsp);
      const esp = e0 * (mem.cal[r.id] || 1);
      return { r, esp, e0, hoyEsp, falta: esp - r.stock };
    });
    const mas = filas.filter(x => x.esp >= 1.5 && x.falta >= 1 && x.r.gpp > 0 && provOk(x.r, A.now)).sort((a, b) => b.falta * b.r.gpp - a.falta * a.r.gpp);
    const vuelan = filas.filter(x => lab && x.hoyEsp >= 2 && x.r.uHoy >= x.hoyEsp * 1.5).sort((a, b) => b.r.uHoy - a.r.uHoy);
    const menos = A.L.filter(r => r.stock >= 6 && r.costo > 0 && (r.sem > 0 ? r.stock / r.sem > 4 : true)).sort((a, b) => b.stock * b.costo - a.stock * a.costo);
    return { dow, lab, dia: lab ? NOMD[dow] : 'lunes', ds, filas, mas, vuelan, menos };
  }
  function registrarPred(A, PL) {
    if (mem.predDia === hoyStr()) return;
    mem.predDia = hoyStr();
    PL.filas.filter(x => x.e0 >= 2).sort((a, b) => b.e0 - a.e0).slice(0, 40).forEach(x => mem.pred.push({ ts: A.now, id: x.r.id, esp: x.e0, st: x.r.stock }));
    mem.pred = mem.pred.slice(-400); save();
  }
  function calibrar(A) {
    if (mem.calDia === hoyStr() || !mem.pred.length) return;
    mem.calDia = hoyStr();
    const keep = [];
    mem.pred.forEach(p => {
      if (A.now - p.ts < 7 * D) { keep.push(p); return; }
      if (p.esp >= 2 && p.st >= p.esp * 0.8) {
        let real = 0;
        A.trAll.forEach(t => { const x = Number(t.id); if (x >= p.ts && x < p.ts + 7 * D) (t.items || []).forEach(i => { if (String(i.id) === p.id) real += Number(i.cant) || 0; }); });
        const old = mem.cal[p.id] || 1; mem.cal[p.id] = clamp(old * 0.6 + (real / p.esp) * 0.4, 0.6, 1.6);
      }
    });
    mem.pred = keep; save();
  }
  function pedido(A) {
    const meta = Number(mem.fleteGratis) || 20000, items = [];
    let tot = 0;
    const base = A.L.filter(r => r.u28 >= 3 && r.sem > 0 && r.costo > 0 && r.gpp > 0 && provOk(r, A.now)).sort((a, b) => b.sem * b.gpp - a.sem * a.gpp);
    const add = (r, q) => {
      q = Math.ceil(q); if (!(q >= 1)) return;
      if (r.caja > 1) q = Math.ceil(q / r.caja) * r.caja;
      const ex = items.filter(x => x.r.id === r.id)[0];
      if (ex) { ex.q += q; ex.c = ex.q * r.costo; } else items.push({ r, q, c: q * r.costo });
      tot += q * r.costo;
    };
    base.forEach(r => add(r, r.sem * 2 - r.stock));
    if (tot < meta) base.filter(r => r.gpp > 0).forEach(r => {
      if (tot >= meta) return;
      const ya = (items.filter(x => x.r.id === r.id)[0] || { q: 0 }).q;
      add(r, Math.min(r.sem * 4 - r.stock - ya, (meta - tot) / r.costo));
    });
    items.sort((a, b) => b.r.sem * b.r.gpp - a.r.sem * a.r.gpp);
    return { meta, tot, items, falta: Math.max(0, meta - tot) };
  }
  const itemTxt = x => x.r.nombre + ' x' + x.q + (x.r.caja > 1 ? ' (' + Math.round(x.q / x.r.caja) + (Math.round(x.q / x.r.caja) === 1 ? ' caja)' : ' cajas)') : '') + ' ' + $m(x.c);
  function ruta(A) {
    const dow = new Date(A.now).getDay(), hoyDS = new Date(A.now).toDateString();
    const cl = A.CL.filter(c => Array.isArray(c.dias) && c.dias.indexOf(dow) >= 0);
    const ya = {}, ult = {};
    A.trAll.forEach(t => { const k = norm(t.clienteNombre || ''); ult[k] = Math.max(ult[k] || 0, Number(t.id)); if (new Date(Number(t.id)).toDateString() === hoyDS) ya[k] = 1; });
    const pend = cl.filter(c => !ya[norm(c.nombre)]).map(c => ({ nombre: c.nombre, u: ult[norm(c.nombre)] || 0 })).sort((a, b) => a.u - b.u);
    return { dow, total: cl.length, hechos: cl.length - pend.length, pend };
  }

  // ---------- SUGERENCIAS ----------
  const PRIO = { perdida: 100, stockneg: 95, pedir: 90, caja: 70, debe: 60, sube: 55, margen: 50, sobra: 50, lento: 45, caro: 40, barato: 40, inact: 35, combo: 30, clientes: 25, hora: 20, poca: 15, 'q-hay': 12, 'q-precio': 10 };
  function insights(A) {
    const out = [], now = A.now;
    const add = (key, ico, tit, txt, preg, dias) => { if (activo(key, dias)) out.push({ key, ico, tit, txt, preg, tipo: key.split(':')[0] }); };
    if (A.trAll.length < 5) add('poca', '🌱', 'Apenas te estoy conociendo', 'Tengo ' + A.trAll.length + ' ventas registradas. Mientras más vendas, mejores consejos te doy. Mientras tanto contéstame lo que te pregunte abajo.', null, 3);
    A.L.forEach(r => {
      if (r.stock < 0) add('stockneg:' + r.id, '🧮', 'Stock negativo: ' + r.nombre, 'Aparece con ' + r.stock + ' piezas. Cuéntalo y corrige el inventario para que mis cálculos sean buenos.', null, 3);
      if (r.costo > 0 && r.precio > 0 && r.precio < r.costo && r.u28 > 0) add('perdida:' + r.id, '🚨', 'Vendes a pérdida: ' + r.nombre, 'Lo vendes en ' + $m(r.precio) + ' y te cuesta ' + $m(r.costo) + ' (pierdes ' + $m(r.costo - r.precio) + ' por pieza, ' + r.u28 + ' vendidas en 4 semanas). Sube el precio o corrige el costo.', null, 3);
      const sinProv = !provOk(r, now);
      if (r.u28 >= 2 && !sinProv) {
        const cob = r.sem > 0 ? r.stock / r.sem : 99;
        if (cob < 1) {
          const pedir = Math.max(1, Math.ceil(r.sem * 2 - r.stock));
          add('pedir:' + r.id, '📦', 'Pide más: ' + r.nombre, 'Vendes ~' + r.sem.toFixed(1) + ' por semana y te quedan ' + r.stock + '. Te sugiero pedir al menos ' + pedir + ' para dos semanas' + (r.caja > 1 ? ' (' + Math.ceil(pedir / r.caja) + ' cajas de ' + r.caja + ')' : '') + '.');
          if (!r.caja) add('caja:' + r.id, '❓', '¿Cuántas piezas trae la caja de ' + r.nombre + '?', 'Tu proveedor vende por cajas. Con ese dato te armo el pedido en cajas completas.', { tipo: 'caja', id: r.id }, 7);
        }
      }
      if (r.sem > 0 && r.stock >= 6 && r.stock / r.sem > 6)
        add('sobra:' + r.id, '🛑', 'No compres más: ' + r.nombre, 'Tienes para ~' + Math.round(r.stock / r.sem) + ' semanas (' + r.stock + ' pzas, vendes ~' + r.sem.toFixed(1) + '/semana). Guarda ese dinero para algo que sí se mueva.');
      if (A.trAll.length >= 8 && r.stock >= 3 && r.u28 <= 1 && r.costo > 0) {
        const baja = Math.max(r.costo * 1.05, r.precio * 0.9);
        add('lento:' + r.id, '🐌', 'Se vende poco: ' + r.nombre, 'Vendiste ' + r.u28 + ' en 4 semanas y tienes ' + r.stock + ' (' + $m(r.stock * r.costo) + ' parados). Te conviene bajarlo a ~' + $m(Math.round(baja)) + ' para que se vaya rápido y meter otro que sí se venda.');
      }
      if (r.margen != null && r.margen < 15 && r.u28 >= 4 && r.u28 >= A.p75) {
        const mejor = A.orden.filter(x => x.margen != null && x.margen >= 30 && x.id !== r.id)[0];
        add('margen:' + r.id, '💡', 'Poco margen pero se mueve: ' + r.nombre, 'Te deja ' + $m(r.gpp) + ' por pieza (' + Math.round(r.margen) + '%) pero lo vendes muy bien. Úsalo de gancho' + (mejor ? ' y ofrécelo junto con ' + mejor.nombre + ', que te deja ' + Math.round(mejor.margen) + '%' : '') + ', o prueba subirlo $1.');
      }
      if (r.margen != null && r.margen >= 15 && r.margen < 28 && r.u28 >= 6 && r.u28 >= A.p75 && r.precio > 0) {
        const cp = mem.precios[r.id], paso = r.precio >= 20 ? 1 : 0.5;
        if (!cp || r.precio + paso <= cp.v * 1.05) add('sube:' + r.id, '📈', 'Sube un poco: ' + r.nombre, 'Se mueve muy bien (' + r.u28 + ' en 4 semanas) y deja ' + Math.round(r.margen) + '%. Si lo subes ' + $m(paso) + ' (a ' + $m(r.precio + paso) + ') ganarías ~' + $m(r.sem * paso) + ' más por semana si vendes igual. Pruébalo una semana y vigila si baja la venta.');
      }
      const comp = mem.precios[r.id];
      if (comp && r.precio > 0) {
        if (r.precio > comp.v * 1.08) add('caro:' + r.id, '🏷️', 'Estás más caro: ' + r.nombre, 'Tú lo vendes en ' + $m(r.precio) + ' y me dijiste que en tiendas está en ' + $m(comp.v) + '. Puede frenar ventas.');
        else if (r.precio < comp.v * 0.92 && r.margen != null && r.margen < 30) add('barato:' + r.id, '🏷️', 'Puedes subirlo: ' + r.nombre, 'Lo vendes en ' + $m(r.precio) + ' y en tiendas está en ' + $m(comp.v) + '. Hay espacio para subirlo sin perder clientes.');
      }
    });
    const par = Object.keys(A.pares).sort((a, b) => A.pares[b] - A.pares[a])[0];
    if (par && A.pares[par] >= 3) { const [a, b] = par.split('|'); if (A.P[a] && A.P[b]) add('combo:' + par, '🤝', 'Se compran juntos', A.P[a].nombre + ' y ' + A.P[b].nombre + ' van juntos en ' + A.pares[par] + ' ventas. Ofrécelos como combo o usa uno de gancho para vender el otro.'); }
    const tot = A.horas.reduce((x, y) => x + y, 0);
    if (tot >= 15) {
      let mh = 0; for (let h = 0; h < 23; h++) if (A.horas[h] + A.horas[h + 1] > A.horas[mh] + A.horas[mh + 1]) mh = h;
      add('hora', '⏰', 'Tu hora fuerte', 'Vendes más entre ' + hora12(mh) + ' y ' + hora12(mh + 2) + ' (' + Math.round((A.horas[mh] + A.horas[mh + 1]) / tot * 100) + '% de tus ventas). Ten surtido y tus productos estrella a la mano a esa hora.', null, 7);
    }
    A.C.forEach(c => {
      if (c.nombre === 'Cliente General') return;
      if (c.debe > 0) add('debe:' + c.nombre, '💳', c.nombre + ' te debe ' + $m(c.debe), 'Lleva ' + Math.floor((now - c.desde) / D) + ' días sin liquidar. Cóbrale antes de fiarle de nuevo.', null, 3);
      else if (c.compras >= 3 && now - c.ult > 14 * D) add('inact:' + c.nombre, '👋', c.nombre + ' no compra hace ' + Math.floor((now - c.ult) / D) + ' días', 'Era cliente frecuente (' + c.compras + ' compras). Mándale un mensaje con una oferta o tu producto gancho.', null, 7);
    });
    const gen = A.C.filter(c => c.nombre === 'Cliente General')[0];
    if (gen && A.trAll.length >= 10 && gen.compras / A.trAll.length > 0.5) add('clientes', '➕', 'Registra más clientes', 'Más de la mitad de tus ventas van a "Cliente General". Si registras a tus clientes habituales puedo decirte quién compra más, quién se fue y a quién fiarle.', null, 10);
    A.orden.slice(0, 5).forEach(r => { if (!mem.precios[r.id] && r.precio > 0) add('q-precio:' + r.id, '❓', '¿A cuánto lo venden en las tiendas?', r.nombre + ' (tú lo vendes en ' + $m(r.precio) + '). Así te digo si estás caro o barato.', { tipo: 'precio', id: r.id }, 5); });
    A.L.forEach(r => { if (r.stock === 0 && r.u28 >= 3 && !mem.resp['hay:' + r.id]) add('q-hay:' + r.id, '❓', '¿Hay más de ' + r.nombre + '?', 'Se vende bien (' + r.u28 + ' en 4 semanas) y ya no tienes. ¿Tu proveedor todavía tiene?', { tipo: 'hay', id: r.id }, 3); });
    // lo que mas te sirve va primero; aprende de "ya lo hice" y "no me sirve"
    const score = i => (PRIO[i.tipo] || 20) * (1 + ((mem.fb[i.tipo] || {}).ok || 0)) / (1 + 0.7 * ((mem.fb[i.tipo] || {}).no || 0));
    return out.sort((a, b) => score(b) - score(a));
  }

  // ---------- INFORME ----------
  function informe(A) {
    const now = A.now, sec = [];
    const w1 = venEntre(A, now - 7 * D, now + 1), w0 = venEntre(A, now - 14 * D, now - 7 * D), c1 = calcMg(w1), c0 = calcMg(w0);
    if (w1.length) {
      let t = 'Últimos 7 días: ' + w1.length + ' ventas, ' + $m(sumF(w1, 'monto')) + ' vendidos, ganancia ' + $m(c1.gan) + (c1.m != null ? ' (margen ' + Math.round(c1.m) + '%)' : '') + '.';
      if (w0.length) { const dv = (sumF(w1, 'monto') / sumF(w0, 'monto') - 1) * 100, dg = c0.gan ? (c1.gan / c0.gan - 1) * 100 : 0; t += ' Vs la semana anterior: ventas ' + (dv >= 0 ? '+' : '') + Math.round(dv) + '%, ganancia ' + (dg >= 0 ? '+' : '') + Math.round(dg) + '%.'; if (dv > 15 && dg < dv / 2) t += ' Vendes más pero ganas proporcionalmente menos: está subiendo el peso de productos de poco margen.'; }
      sec.push({ ico: '📊', tit: 'Cómo vas', txt: t });
    }
    const perd = A.L.filter(r => r.costo > 0 && r.precio > 0 && r.precio < r.costo && r.u28 > 0);
    if (perd.length) sec.push({ ico: '🚨', tit: 'Vendes a pérdida', txt: perd.slice(0, 4).map(r => r.nombre + ' (precio ' + $m(r.precio) + ' < costo ' + $m(r.costo) + ')').join('; ') + '. Corrige el precio o el costo.' });
    const r14 = calcMg(venEntre(A, now - 14 * D, now + 1));
    if (r14.ing0 > 0) sec.push({ ico: '⚠️', tit: 'Productos con costo en $0', txt: 'En 14 días vendiste ' + $m(r14.ing0) + ' con costo $0 (' + r14.ceros.slice(0, 4).join(', ') + '). La app los cuenta como 100% de ganancia, así que tu ganancia real es menor. Corrígeles el costo.' });
    const agot = A.L.filter(r => r.stock <= 0 && r.u28 >= 3).sort((a, b) => b.sem * b.gpp - a.sem * a.gpp);
    const urg = A.L.filter(r => r.u28 >= 3 && r.stock > 0 && r.sem > 0 && r.stock / r.sem < 1).sort((a, b) => b.sem * b.gpp - a.sem * a.gpp).slice(0, 5);
    if (agot.length || urg.length) {
      let t = '';
      if (urg.length) t += 'Por acabarse: ' + urg.map(r => r.nombre + ' (vendes ~' + Math.round(r.sem) + '/semana, quedan ' + r.stock + ')').join('; ') + '. ';
      if (agot.length) t += 'Agotados que sí vendías (' + agot.length + '), los que más dejan: ' + agot.slice(0, 4).map(r => r.nombre).join(', ') + '. Dejas de ganar ~' + $m(agot.reduce((a, r) => a + r.sem * r.gpp, 0)) + ' por semana.';
      sec.push({ ico: '🔴', tit: 'Pide ya', txt: t });
    }
    if (A.trAll.length >= 8) {
      const PL = plan(A); registrarPred(A, PL);
      if (PL.mas.length || PL.vuelan.length || PL.menos.length) {
        let t = '';
        if (PL.mas.length) t += 'Carga más (para tus próximos 5 días de venta): ' + PL.mas.slice(0, 6).map(x => x.r.nombre + ' (ocupas ~' + Math.round(x.esp) + ', tienes ' + x.r.stock + ')').join('; ') + '. ';
        if (PL.vuelan.length) t += 'Hoy se están vendiendo más rápido de lo normal: ' + PL.vuelan.slice(0, 3).map(x => x.r.nombre + ' (' + x.r.uHoy + ' vs ~' + Math.round(x.hoyEsp) + ' normal)').join('; ') + '. ';
        if (PL.menos.length) t += 'Carga menos / no pidas: ' + PL.menos.slice(0, 4).map(r => r.nombre + ' (' + r.stock + ' pzas' + (r.sem > 0 ? ', ~' + Math.round(r.stock / r.sem) + ' semanas' : ', sin ventas') + ')').join('; ') + '.';
        sec.push({ ico: '🗓️', tit: PL.lab ? 'Plan de hoy (' + PL.dia + ')' : 'Plan de la semana (desde el lunes)', txt: t.trim() });
      }
      const O = pedido(A);
      if (O.items.length) sec.push({ ico: '🛒', tit: 'Pedido sugerido: ' + $m(O.tot), txt: (O.tot >= O.meta ? 'Pasas de ' + $m(O.meta) + ': flete gratis. ' : 'Te faltan ' + $m(O.meta - O.tot) + ' para flete gratis (' + $m(O.meta) + '). Completa con lo que más rota. ') + 'Incluye: ' + O.items.slice(0, 6).map(itemTxt).join('; ') + (O.items.length > 6 ? ' y ' + (O.items.length - 6) + ' más' : '') + '. ' + (O.items.some(x => x.r.caja > 1) ? '' : 'Ajusta las cantidades a cajas completas.') });
    }
    const RT = ruta(A);
    if (RT.total) sec.push({ ico: '🧭', tit: 'Ruta de hoy (' + NOMD[RT.dow] + ')', txt: RT.total + ' clientes en ruta, ya compraron ' + RT.hechos + '.' + (RT.pend.length ? ' Faltan ' + RT.pend.length + '; los que más llevan sin comprar: ' + RT.pend.slice(0, 5).map(c => c.nombre + (c.u ? ' (' + hace(c.u, now) + ')' : ' (nunca)')).join(', ') + '.' : ' ¡Ya los visitaste a todos!') });
    const sobre = A.L.filter(r => r.stock * r.costo > 500 && (r.sem > 0 ? r.stock / r.sem > 8 : r.stock > 0)).sort((a, b) => b.stock * b.costo - a.stock * a.costo);
    if (sobre.length) sec.push({ ico: '🟡', tit: 'Dinero parado', txt: $m(sobre.reduce((a, r) => a + r.stock * r.costo, 0)) + ' en productos que tardan más de 8 semanas en venderse: ' + sobre.slice(0, 3).map(r => r.nombre).join(', ') + '. No los recompres y mueve con oferta.' });
    const top = A.orden.slice(0, 3), best = A.orden.filter(r => r.margen != null && r.margen >= 35 && r.u28 >= 5)[0];
    if (top.length && top[0].margen != null && top[0].margen < 25) sec.push({ ico: '💡', tit: 'Tu gancho', txt: top[0].nombre + ' es lo que más vendes pero deja solo ' + Math.round(top[0].margen) + '%.' + (best ? ' Ofrécelo junto con ' + best.nombre + ' (' + Math.round(best.margen) + '% de margen) para subir tu ganancia por venta.' : '') });
    const dias = [0, 0, 0, 0, 0, 0, 0]; A.tr.forEach(t => dias[new Date(Number(t.id)).getDay()]++);
    const lab = [1, 2, 3, 4, 5], tl = lab.reduce((a, d) => a + dias[d], 0);
    if (tl >= 20) { const fu = lab.slice().sort((a, b) => dias[b] - dias[a]), fl = fu[fu.length - 1]; sec.push({ ico: '📅', tit: 'Tus días', txt: 'Tu día más fuerte es el ' + NOMD[fu[0]] + ' (' + Math.round(dias[fu[0]] / tl * 100) + '% de tus ventas) y el más flojo el ' + NOMD[fl] + ' (' + Math.round(dias[fl] / tl * 100) + '%). Ese día visita o ofrece más a tus clientes de ruta.' }); }
    const deben = A.C.filter(c => c.debe > 0).sort((a, b) => b.debe - a.debe);
    if (deben.length) sec.push({ ico: '💳', tit: 'Te deben ' + $m(deben.reduce((a, c) => a + c.debe, 0)), txt: deben.slice(0, 3).map(c => c.nombre + ' ' + $m(c.debe)).join(', ') + '.' });
    const inact = A.C.filter(c => c.nombre !== 'Cliente General' && c.compras >= 3 && now - c.ult > 14 * D);
    if (inact.length) sec.push({ ico: '👋', tit: 'Clientes que se fueron', txt: inact.slice(0, 4).map(c => c.nombre + ' (' + Math.floor((now - c.ult) / D) + ' días)').join(', ') + '. Mándales un mensaje con tu gancho.' });
    const meta = Number(mem.fleteGratis) || 20000, comp = A.todas.filter(t => t.tipo === 'Gasto' && t.itemsCompra && now - Number(t.id) <= 28 * D).sort((a, b) => b.id - a.id);
    if (comp.length) {
      const fl = comp.reduce((a, g) => a + (Number(g.fleteMonto) || 0), 0), sub = comp.reduce((a, g) => a + (Number(g.subtotal) || 0), 0), u = comp.filter(g => Number(g.fleteMonto) > 0)[0];
      let t = 'En 28 días pagaste ' + $m(fl) + ' de flete (' + (sub ? (fl / sub * 100).toFixed(1) : 0) + '% de tus compras).';
      if (u && Number(u.subtotal) < meta) t += ' Tu pedido del ' + u.fechaStr + ' fue de ' + $m(u.subtotal) + ' y pagó ' + $m(u.fleteMonto) + ' de flete; con ' + $m(meta) + ' o más era gratis. Arma pedidos de ' + $m(meta) + '+ con lo que sí rota.';
      sec.push({ ico: '🚚', tit: 'Flete', txt: t });
    }
    if (!sec.length) sec.push({ ico: '🌱', tit: 'Aún conociéndote', txt: 'Todavía tengo pocas ventas para armar tu informe. Sigue vendiendo.' });
    return { sec };
  }
  function kpis(A) {
    const t0 = new Date(A.now); t0.setHours(0, 0, 0, 0);
    const hoy = venEntre(A, t0.getTime(), t0.getTime() + D), s7 = venEntre(A, A.now - 7 * D, A.now + 1), s14 = venEntre(A, A.now - 14 * D, A.now - 7 * D);
    const mg = calcMg(s7), m7 = sumF(s7, 'monto'), mp = sumF(s14, 'monto');
    return { hoyN: hoy.length, hoyM: sumF(hoy, 'monto'), hoyG: sumF(hoy, 'ganancia'), s7M: m7, s7N: s7.length, dv: mp > 0 ? (m7 / mp - 1) * 100 : null, mg: mg.m, debe: A.C.reduce((a, c) => a + c.debe, 0) };
  }
  function barras(A) {
    const t0 = new Date(A.now); t0.setHours(0, 0, 0, 0); const ini = t0.getTime() - 13 * D, out = [];
    for (let i = 0; i < 14; i++) out.push({ d: new Date(ini + i * D).getDay(), m: 0 });
    A.trAll.forEach(t => { const i = Math.floor((Number(t.id) - ini) / D); if (i >= 0 && i < 14) out[i].m += Number(t.monto) || 0; });
    return out;
  }

  // ---------- REPORTE ----------
  function reporte(A) {
    const R = informe(A), O = pedido(A), RT = ruta(A), L = [], pc = n => (n == null ? '-' : Math.round(n) + '%');
    L.push('REPORTE ASISTENTE DIGAR (' + VER + ')', 'Generado: ' + new Date().toLocaleString('es-MX'));
    L.push('Ventas registradas: ' + A.trAll.length + ' (últimas 4 semanas: ' + A.tr.length + ') | Productos: ' + A.L.length + ' | Historia: ' + A.semanas.toFixed(1) + ' semanas | Clientes: ' + A.CL.length);
    L.push('', '== INFORME ==');
    R.sec.forEach(x => L.push(x.ico + ' ' + x.tit + ': ' + x.txt, ''));
    L.push('== PEDIDO SUGERIDO COMPLETO (meta flete gratis ' + $m(O.meta) + ', sugerido ' + $m(O.tot) + ') ==');
    O.items.forEach(x => L.push('- ' + x.r.nombre + ': pedir ' + x.q + ' pzas x ' + $m(x.r.costo) + ' = ' + $m(x.c) + ' (vendes ~' + x.r.sem.toFixed(1) + '/sem, stock ' + x.r.stock + (x.r.caja > 1 ? ', caja de ' + x.r.caja : '') + ')'));
    L.push('', '== TOP 30 VENDIDOS (4 semanas) ==', 'producto | 4sem | 7d | stock | costo | precio | margen | por semana | alcanza (sem)');
    A.orden.slice(0, 30).forEach(r => L.push(r.nombre + ' | ' + r.u28 + ' | ' + r.u7 + ' | ' + r.stock + ' | ' + $m(r.costo) + ' | ' + $m(r.precio) + ' | ' + pc(r.margen) + ' | ' + r.sem.toFixed(1) + ' | ' + (r.sem > 0 ? (r.stock / r.sem).toFixed(1) : '-')));
    L.push('', '== MENOR MARGEN (entre lo que sí se vende) ==');
    A.L.filter(r => r.u28 >= 3 && r.margen != null).sort((a, b) => a.margen - b.margen).slice(0, 10).forEach(r => L.push('- ' + r.nombre + ': margen ' + pc(r.margen) + ', ' + r.u28 + ' pzas en 4 sem'));
    L.push('', '== SIN MOVIMIENTO EN 4 SEMANAS (con stock) ==');
    A.L.filter(r => r.stock > 0 && r.u28 === 0).sort((a, b) => b.stock * b.costo - a.stock * a.costo).slice(0, 10).forEach(r => L.push('- ' + r.nombre + ': ' + r.stock + ' pzas, ' + $m(r.stock * r.costo) + ' parados'));
    const raros = A.L.filter(r => !(r.costo > 0) || !(r.precio > 0));
    L.push('', '== DATOS A REVISAR ==', 'Productos con costo o precio en $0: ' + raros.length + (raros.length ? ' (' + raros.slice(0, 15).map(r => r.nombre).join(', ') + ')' : ''));
    L.push('Ruta de hoy: ' + RT.total + ' clientes, ' + RT.hechos + ' ya compraron.');
    const pk = Object.keys(mem.precios), ck = Object.keys(mem.cajas), cc = Object.keys(mem.cal);
    L.push('', '== LO QUE HE APRENDIDO ==');
    L.push('Precios de otras tiendas: ' + (pk.length ? pk.map(k => (A.P[k] ? A.P[k].nombre : k) + ' $' + mem.precios[k].v).join('; ') : 'ninguno'));
    L.push('Piezas por caja: ' + (ck.length ? ck.map(k => (A.P[k] ? A.P[k].nombre : k) + ' ' + mem.cajas[k]).join('; ') : 'ninguna'));
    L.push('Meta de flete gratis: ' + $m(Number(mem.fleteGratis) || 20000));
    L.push('Ajustes de pronóstico por producto (1 = acierta): ' + (cc.length ? cc.slice(0, 15).map(k => (A.P[k] ? A.P[k].nombre : k) + ' x' + mem.cal[k].toFixed(2)).join('; ') : 'aún sin datos') + ' | pronósticos pendientes de evaluar: ' + mem.pred.length);
    L.push('', '== PREGUNTAS QUE NO SUPE CONTESTAR ==');
    if (mem.sinEntender.length) mem.sinEntender.forEach(x => L.push('- "' + x.q + '" (' + (x.n || 1) + ' vez/veces, última ' + new Date(x.ts).toLocaleDateString('es-MX') + ')')); else L.push('ninguna');
    const ns = Object.keys(mem.noSirve || {});
    L.push('', '== SUGERENCIAS QUE MARCÓ "NO ME SIRVE" ==');
    if (ns.length) ns.forEach(k => L.push('- ' + mem.noSirve[k].tit + ' (' + new Date(mem.noSirve[k].ts).toLocaleDateString('es-MX') + ')')); else L.push('ninguna');
    L.push('', 'Consejos que dijo haber aplicado: ' + mem.hechas + ' | Retroalimentación por tipo: ' + (Object.keys(mem.fb).map(k => k + ' ok' + mem.fb[k].ok + '/no' + mem.fb[k].no).join('; ') || 'ninguna'));
    L.push('Sugerencias activas ahora: ' + (insights(A).map(i => i.tit).slice(0, 20).join(' | ') || 'ninguna'));
    return L.join('\n');
  }
  function descargarReporte() {
    const t = reporte(analizar()), d = new Date(), p2 = n => String(n).padStart(2, '0');
    const nom = 'reporte-digar-' + d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + '.txt';
    try {
      const b = new Blob([t], { type: 'text/plain;charset=utf-8' }), u = URL.createObjectURL(b), a = document.createElement('a');
      a.href = u; a.download = nom; document.body.appendChild(a); a.click();
      setTimeout(() => { a.remove(); URL.revokeObjectURL(u); }, 1500);
    } catch (e) { try { prompt('Copia este reporte:', t); } catch (e2) {} }
    return t;
  }

  // ---------- CHAT ----------
  let OFF = 0, LN = 5, LT = 0;
  const lista = (arr, f, n) => { LN = n || 5; LT = arr.length; return arr.slice(OFF, OFF + LN).map((x, i) => (OFF + i + 1) + '. ' + f(x)).join('\n'); };
  const TOK = s => norm(s).split(/[^a-z0-9&]+/).filter(Boolean);
  const STOP = /^(como|cuanto|cuantos|cuantas|cual|cuales|que|vende|vendo|vendes|vendi|vendio|venden|margen|gano|gana|precio|tienda|tiendas|cuesta|cuestan|esta|estan|los|las|del|por|mas|menos|con|para|producto|productos|pedir|pido|pide|comprar|queda|quedan|stock|hay|tengo|una|uno|mis|nos|hoy|ayer|semana|mes|caja|cajas|trae|tiene|pieza|piezas|pzas|dame|dime|quiero|saber|subo|subir|bajo|bajar|ganancia|ventas|venta|cliente|clientes|debe|deuda|ruta|plan|carga|cargo|pedido|flete|reporte|el|la|un|de|en|mi|me|se|lo|es|si|no|y|o|a)$/;
  function buscarProds(A, q) {
    const ws = TOK(q).filter(w => w.length > 2 && !STOP.test(w));
    if (!ws.length) return [];
    return A.L.map(r => {
      const nt = TOK(r.nombre), nn = norm(r.nombre); let s = 0;
      ws.forEach(w => {
        if (nt.indexOf(w) >= 0) s += 3;
        else if (nn.indexOf(w) >= 0 && w.length >= 4) s += 2;
        else if (w.length >= 5 && nt.some(x => x.length >= 4 && fuzz(w, x))) s += 1.5;
      });
      return { r, s };
    }).filter(x => x.s > 0).sort((a, b) => b.s - a.s || b.r.u28 - a.r.u28);
  }
  function buscarCliente(A, q) {
    const ws = TOK(q).filter(w => w.length > 2 && !STOP.test(w));
    let best = null, bs = 0;
    A.C.forEach(c => { if (c.nombre === 'Cliente General') return; const nt = TOK(c.nombre); let s = 0; ws.forEach(w => { if (nt.indexOf(w) >= 0) s += 3; else if (w.length >= 4 && nt.some(x => x.length >= 4 && fuzz(w, x))) s += w.length >= 6 ? 3 : 1.5; }); if (s > bs) { bs = s; best = c; } });
    return bs >= 3 ? best : null;
  }
  function resumenPeriodo(A, p) {
    const sel = venEntre(A, p.a, p.b), prev = venEntre(A, p.a - (p.b - p.a), p.a);
    const m = sumF(sel, 'monto'), g = sumF(sel, 'ganancia'), mp = sumF(prev, 'monto'), cm = calcMg(sel);
    let t = cap(p.l) + ': ' + sel.length + ' ventas por ' + $m(m) + ', ganancia ' + $m(g) + (cm.m != null ? ' (margen real ' + Math.round(cm.m) + '%)' : '') + '. Ticket promedio ' + $m(sel.length ? m / sel.length : 0) + '.';
    if (mp > 0 && p.b - p.a > 1.5 * D && p.b <= A.now + D) t += ' Vs el periodo anterior de igual duración: ' + (m >= mp ? '+' : '') + Math.round((m / mp - 1) * 100) + '%.';
    const u = {}; sel.forEach(x => (x.items || []).forEach(i => { u[i.nombre] = (u[i.nombre] || 0) + (Number(i.cant) || 0); }));
    const top = Object.keys(u).sort((a, b) => u[b] - u[a]).slice(0, 3);
    return t + (top.length ? ' Lo más vendido: ' + top.map(k => k + ' (' + u[k] + ')').join(', ') + '.' : '');
  }
  function ficha(A, r, n) {
    const per = periodo(n, A.now), L = [];
    if (per) { let u = 0, v = 0; venEntre(A, per.a, per.b).forEach(t => (t.items || []).forEach(i => { if (String(i.id) === r.id) { u += Number(i.cant) || 0; v += (Number(i.cant) || 0) * (Number(i.precioPersonalizado != null ? i.precioPersonalizado : i.precio) || 0); } })); L.push('De ' + r.nombre + ' vendiste ' + u + ' pzas (' + $m(v) + ') ' + per.l + '.'); }
    const cob = r.sem > 0 ? r.stock / r.sem : null;
    L.push(r.nombre + ':', '• Vendiste ' + r.u28 + ' en 4 semanas (' + r.u7 + ' esta semana, ~' + r.sem.toFixed(1) + ' por semana)', '• Stock: ' + r.stock + (cob == null ? '' : cob < 1 ? ' — te alcanza para menos de una semana' : ' — te alcanza ~' + Math.round(cob) + ' semanas') + (r.caja > 1 ? ' | caja de ' + r.caja : ''));
    L.push('• Precio ' + $m(r.precio) + ', costo ' + $m(r.costo) + (r.margen != null ? ', margen ' + Math.round(r.margen) + '% (' + $m(r.gpp) + ' por pieza)' : '') + (mem.precios[r.id] ? ' | en tiendas ' + $m(mem.precios[r.id].v) : ''));
    const tot = r.dia.slice(1, 6).reduce((a, b) => a + b, 0);
    if (tot >= 5) { let d = 1; for (let x = 2; x <= 5; x++) if (r.dia[x] / A.occ[x] > r.dia[d] / A.occ[d]) d = x; L.push('• Se vende más los ' + NOMD[d] + (NOMD[d].slice(-1) === 's' ? '' : 's') + ' (' + Math.round(r.dia[d] / tot * 100) + '%)'); }
    let c = '';
    if (r.costo > 0 && r.precio > 0 && r.precio < r.costo) c = 'Lo vendes a pérdida: sube el precio.';
    else if (r.stock <= 0 && r.u28 >= 3) c = 'Está agotado y se vende: pídelo.';
    else if (cob != null && cob < 1 && r.u28 >= 2) c = 'Pide ~' + Math.max(1, Math.ceil(r.sem * 2 - r.stock)) + ' para dos semanas.';
    else if (cob != null && cob > 6 && r.stock >= 6) c = 'Tienes de sobra: no compres más.';
    else if (r.u28 <= 1 && r.stock >= 3) c = 'Casi no se vende: bájalo para moverlo.';
    else if (r.margen != null && r.margen < 28 && r.u28 >= A.p75 && r.u28 >= 6) c = 'Se mueve mucho con poco margen: prueba subirlo ' + $m(r.precio >= 20 ? 1 : 0.5) + '.';
    if (c) L.push('👉 ' + c);
    return L.join('\n');
  }
  function aprendido(A) {
    const pk = Object.keys(mem.precios), ck = Object.keys(mem.cajas), hk = Object.keys(mem.resp), cc = Object.keys(mem.cal);
    const nm = k => (A.P[k] ? A.P[k].nombre : k);
    return 'Esto es lo que sé de ti:\n• Ventas: ' + A.trAll.length + ' registradas\n• Precios de otras tiendas: ' + (pk.length ? pk.map(k => nm(k) + ' ' + $m(mem.precios[k].v)).join(', ') : 'ninguno') + '\n• Piezas por caja: ' + (ck.length ? ck.map(k => nm(k) + ' ' + mem.cajas[k]).join(', ') : 'ninguna') + '\n• Proveedor sin stock: ' + (hk.filter(k => mem.resp[k].v === 'no').map(k => nm(k.replace('hay:', ''))).join(', ') || 'ninguno') + '\n• Meta de flete gratis: ' + $m(Number(mem.fleteGratis) || 20000) + '\n• Pronósticos ajustados: ' + cc.length + ' productos\n• Consejos aplicados: ' + mem.hechas + '\nPuedes enseñarme: "Sabritas en tiendas cuesta 18", "la caja de Sabritas trae 24", "el proveedor ya no tiene Sabritas", "mi meta de flete es 25000".';
  }
  // Patrones de preguntas que antes no sabía contestar (los usa responder y la limpieza del reporte)
  const P_MEM = /(tienes|tiene|hay|usas|guardas) (la )?memoria|te acuerdas|recuerdas|aprendes|te acuerdas de|memoria/;
  const P_NOMINA = /nomina|sueldo|salario|empleado|trabajador|ayudante|raya\b/;
  const P_NOPREG = /(no|ni) (te )?pregunte (eso|esa|eso)|no es lo que (te )?pregunte|eso no (te )?(pregunte|es lo que)|no te (pedi|pregunte) eso|no fue lo que pregunte/;
  const P_YANO = /ya no (debo|deberia|tengo que|conviene|voy a)? ?(vender|surtir|pedir|comprar|cargar|llevar)|que (deje|dejo|debo dejar|deberia dejar) de (vender|surtir|pedir|comprar|cargar)|dejar de (vender|surtir|pedir|comprar)|que (quito|saco|elimino|descontinuo)|descontinu(ar|o)|que (productos )?no (me )?(conviene|sirve|dejan?)/;
  const P_BAJAR = /(que|cual(es)?|a que|cuales?) (le |les |lo |los )?(bajo|baje|bajarle|bajar|rebajo|rebajar)\b|\bbajo (de |el |los )?precio|bajar (de |el |los )?precio|bajarle (el )?precio|rebaj|promocion|oferta|\bmover\b/;
  mem.sinEntender = mem.sinEntender.filter(x => { const q = norm(x.q); return !(P_MEM.test(q) || P_NOMINA.test(q) || P_NOPREG.test(q) || P_YANO.test(q) || P_BAJAR.test(q)); });
  save();
  const CHIPS0 = ['¿Qué cargo hoy?', '¿Qué pido?', '¿Cómo voy hoy?', '¿Quién me debe?', '¿Qué subo de precio?', 'Ruta de hoy', 'Más vendidos', 'Menor margen'];
  function responderBase(q, A0) {
    const A = A0 || analizar(), n = norm(q).trim(), ins = insights(A);
    const nums = n.match(/\d+(?:[.,]\d+)?/g) || [], num = nums.length ? parseFloat(nums[nums.length - 1].replace(',', '.')) : null;
    const R = (t, chips) => ({ t, chips: chips || [] });
    const RANK = /agotad|sin stock|se acab|por acabar|poco stock|quedan pocos|parado|sobra|exceso|no compres|sobrante|inmovil|no se mueve|no se vende|muert|estanc|lento|menos (se )?(vend|mueve)|(vende|mueve)n? menos|mas vendid|mas se (vende|mueve)|top|estrella|popular|(vende|mueve)n? mas|margen|rentab|gano mas|deja mas|me deja/.test(n);
    const cand = buscarProds(A, q), p = cand.length && (cand[0].s >= 3 || (!RANK && cand[0].s >= 1.5)) ? cand[0].r : null;
    const otros = cand.filter(x => p && x.r.id !== p.id && x.s >= cand[0].s * 0.8).slice(0, 2);

    // --- preguntas que antes no entendía ---
    if (P_NOPREG.test(n)) {
      let prev = null; for (let i = mem.chat.length - 2; i >= 0; i--) { if (mem.chat[i] && mem.chat[i].r === 'yo') { prev = mem.chat[i].t; break; } }
      if (prev && !P_NOPREG.test(norm(prev))) { const kp = norm(prev), ex2 = mem.sinEntender.filter(x => norm(x.q) === kp)[0]; if (ex2) { ex2.n = (ex2.n || 1) + 1; ex2.ts = Date.now(); } else mem.sinEntender.push({ q: prev + ' (me contestó otra cosa)', ts: Date.now(), n: 1 }); save(); }
      return R('Perdón, te contesté otra cosa. Dime la pregunta con otras palabras (por ejemplo: \"¿qué bajo de precio?\", \"¿qué ya no debo vender?\", \"¿cuánto pagué de nómina?\") o toca una opción. Ya guardé que no te entendí para mejorarlo.', CHIPS0.slice(0, 6));
    }
    if (P_MEM.test(n) && !p) return R('Sí, tengo memoria: aprendo de tus ventas y de lo que me enseñas, y se guarda en este celular.\n\n' + aprendido(A), ['¿Qué cargo hoy?', '¿Qué pido?']);
    if (P_NOMINA.test(n)) {
      const per = periodo(n, A.now) || { a: A.now - 28 * D, b: A.now + D, l: 'en 28 días' };
      const g = A.todas.filter(t => t.tipo === 'Gasto' && Number(t.id) >= per.a && Number(t.id) < per.b && norm(t.categoria || '').indexOf('nomina') >= 0);
      const tot = sumF(g, 'monto'), vtas = sumF(venEntre(A, per.a, per.b), 'monto');
      return R(g.length ? 'De nómina ' + per.l + ' has pagado ' + $m(tot) + ' (' + g.length + ' pago' + (g.length > 1 ? 's' : '') + ')' + (vtas > 0 ? ', que es el ' + (tot / vtas * 100).toFixed(1) + '% de lo que vendiste (' + $m(vtas) + ')' : '') + '.\n' + lista(g.slice().sort((a, b) => Number(b.id) - Number(a.id)), t => (t.fecha || '') + ' — ' + (t.descripcion || 'Nómina') + ' ' + $m(t.monto), 5) : 'No encuentro pagos de nómina ' + per.l + '. Si los registras como gasto en la categoría \"Nómina\", aquí te los sumo. Esto solo cuenta lo que pagas tú; no tengo sueldos ni comisiones calculadas.', ['¿Cuánto gasté este mes?', '¿Cómo voy hoy?']);
    }
    if (P_YANO.test(n) && !p) {
      const c = [];
      A.L.forEach(r => {
        if (r.costo > 0 && r.precio > 0 && r.precio < r.costo && r.u28 >= 1) c.push({ r, pt: 100 + (r.costo - r.precio) * r.u28, why: 'lo vendes a pérdida (precio ' + $m(r.precio) + ' < costo ' + $m(r.costo) + ')' });
        else if (r.u28 === 0 && r.stock > 0 && r.costo > 0) c.push({ r, pt: 50 + r.stock * r.costo / 100, why: 'cero ventas en 4 semanas y tienes ' + r.stock + ' pzas (' + $m(r.stock * r.costo) + ' parados)' });
        else if (r.u28 > 0 && r.u28 <= 3 && r.margen != null && r.margen < 12) c.push({ r, pt: 30 + (12 - r.margen), why: 'vendes ' + r.u28 + ' en 4 semanas y deja solo ' + Math.round(r.margen) + '% de margen' });
        else if (r.stock > 0 && r.costo > 0 && r.sem > 0 && r.stock / r.sem > 12) c.push({ r, pt: 10 + r.stock * r.costo / 100, why: 'tienes para ~' + Math.round(r.stock / r.sem) + ' semanas (' + $m(r.stock * r.costo) + ' parados)' });
      });
      c.sort((a, b) => b.pt - a.pt);
      return R(c.length ? 'Yo dejaría de surtir estos (con tus últimas semanas de ventas):\n' + lista(c, x => x.r.nombre + ' — ' + x.why, 7) + '\nMuévelos con oferta y no los recompres. Tú decides: solo veo tus números.' : 'Por ahora no veo productos que convenga dejar de vender: todo lo que tienes se mueve o deja margen.', ['Productos parados', 'Menor margen']);
    }
    if (P_BAJAR.test(n) && !p) {
      const c = A.L.filter(r => r.stock > 0 && r.costo > 0 && r.precio > 0 && ((r.sem > 0 && r.stock / r.sem > 6) || r.u28 <= 1)).map(r => { const piso = Math.ceil(r.costo * 1.05 * 10) / 10; return { r, piso, v: r.stock * r.costo }; }).filter(x => x.r.precio > x.piso).sort((a, b) => b.v - a.v);
      const ca = ins.filter(i => /^caro:/.test(i.key));
      let t = '';
      if (c.length) t += 'Para mover producto, bájale a:\n' + lista(c, x => x.r.nombre + ' — ' + x.r.stock + ' pzas paradas (' + $m(x.v) + '), lo vendes en ' + $m(x.r.precio) + '; puedes llegar a ' + $m(x.piso) + ' y aún ganas', 6);
      if (ca.length) t += (t ? '\n\n' : '') + 'Y estos los tienes más caros que las tiendas:\n' + lista(ca, i => i.tit.replace(/^Estás más caro: /, '') + ' — ' + i.txt, 4);
      return R(t || 'Por ahora no veo precios que convenga bajar. Lo que se mueve bien déjalo como está.', ['¿Qué subo de precio?', 'Productos parados']);
    }

    // --- enseñar ---
    if (p && num != null && /tienda|cuesta|cuestan|cobran|venden|mercado|super|oxxo|oxo|walmart|competencia|bodega|aurrera|soriana|chedraui|abarrote|tiendita|esta a|estan a|anda en|andan en|lo dan|los dan|a como lo/.test(n) && !/caja/.test(n)) {
      mem.precios[p.id] = { v: num, ts: Date.now() }; save();
      return R('Anotado: ' + p.nombre + ' en tiendas a ' + $m(num) + '. Tú lo vendes en ' + $m(p.precio) + (p.precio > num * 1.08 ? ' (estás arriba).' : p.precio < num * 0.92 ? ' (hay espacio para subirlo).' : ' (vas parejo).') + ' Lo voy a tomar en cuenta.', ['Ficha de ' + p.nombre]);
    }
    if (p && num != null && /caja|cajas|bulto|paquete/.test(n) && /trae|tiene|vienen|son|de \d|\d+ (pz|pzas|piezas)/.test(n)) {
      mem.cajas[p.id] = Math.max(1, Math.round(num)); save();
      return R('Anotado: la caja de ' + p.nombre + ' trae ' + Math.round(num) + ' piezas. Desde ahora te armo el pedido en cajas completas.', ['¿Qué pido?']);
    }
    if (p && /ya no (hay|tiene|trae|venden|traen)|no (hay|tiene|trae)|descontinu|sin existencia/.test(n) && /proveedor|ya no|descontinu|no hay|no tiene/.test(n)) {
      mem.resp['hay:' + p.id] = { v: 'no', ts: Date.now() }; save();
      return R('Anotado: tu proveedor no tiene ' + p.nombre + '. No te lo voy a sugerir por 3 semanas.');
    }
    if (p && /(ya )?(hay|tiene|llego|llegaron)/.test(n) && /proveedor|ya hay|ya llego|si hay|si tiene/.test(n)) {
      mem.resp['hay:' + p.id] = { v: 'si', ts: Date.now() }; save();
      return R('Anotado: ' + p.nombre + ' sí está disponible con tu proveedor. Lo vuelvo a incluir en tus pedidos.');
    }
    if (num != null && num >= 1000 && /(el minimo|la meta|mi meta|el flete gratis|minimo de flete|meta de flete).*(es|ahora|cambio|son|:|de)\s*\$?\d/.test(n)) {
      mem.fleteGratis = Math.round(num); save();
      return R('Listo, tu meta para flete gratis ahora es ' + $m(num) + '.', ['¿Qué pido?']);
    }
    if (/que (has )?aprendid|que sabes de mi|que recuerdas|que has guardado|que sabes de mi negocio/.test(n)) return R(aprendido(A));
    if (/confirmo olvidar todo/.test(n)) { mem.precios = {}; mem.cajas = {}; mem.resp = {}; mem.cal = {}; mem.fb = {}; mem.noSirve = {}; mem.desc = {}; mem.pred = []; mem.alias = {}; mem.aprendidas = {}; mem.uso = {}; mem.ctx = {}; delete mem.fleteGratis; save(); return R('Listo, olvidé todo lo aprendido. Empiezo de cero con tus ventas.'); }
    if (/olvid(a|ar)|borra(r)? (lo )?(aprendido|todo)/.test(n)) return R('Si quieres que olvide lo que aprendí (precios de tiendas, cajas, pronósticos), escribe exactamente: confirmo olvidar todo');

    // --- acciones ---
    if (/reporte|exportar|descargar/.test(n)) { descargarReporte(); return R('Listo, descargué el reporte (revisa tus descargas). Súbelo a Claude para ver qué mejorar.'); }
    if (n.split(/\s+/).length <= 5 && /^(hola|buenas|buen dia|buenos dias|buenas tardes|que onda|ayuda|menu|que puedes|que haces|que sabes)/.test(n))
      return R('Hola 👋 Soy tu asistente de ventas. Puedo decirte qué cargar hoy, qué pedir (y cuánto te falta para flete gratis), qué subir o bajar de precio, tus márgenes, qué se mueve más o menos, quién te debe, a quién visitar hoy y cómo van tus ventas. También aprendo: dime precios de tiendas, piezas por caja o qué no tiene tu proveedor.', CHIPS0.slice(0, 6));
    if (/\bcarg(o|a|ar|ue|uen)\b|llevar|plan (de |del )?(hoy|dia|semana)|que hago hoy|que le meto|que surto/.test(n) && !p) {
      const s = informe(A).sec.filter(x => /^Plan/.test(x.tit))[0];
      return R(s ? s.tit + ':\n' + s.txt : 'Aún tengo pocas ventas para armar tu plan. Necesito al menos 8.', ['¿Qué pido?', 'Ruta de hoy']);
    }
    if (/flete|20 ?mil|20,?000|pedido|armar.*(pedido|orden)|completar|cuanto me falta|surtir|que (compro|pido|pedimos)|pedir|pido|pide|comprar/.test(n)) {
      if (p) {
        const need = Math.max(0, Math.ceil(p.sem * 2 - p.stock)), q2 = p.caja > 1 && need ? Math.ceil(need / p.caja) * p.caja : need;
        if (!provOk(p, A.now)) return R('Anotaste que tu proveedor no tiene ' + p.nombre + ', así que no lo incluyo. Si ya llegó, dime "ya hay ' + p.nombre + ' con el proveedor".');
        return R(need ? 'Para ' + p.nombre + ' te sugiero pedir ' + q2 + ' pzas' + (p.caja > 1 ? ' (' + Math.round(q2 / p.caja) + ' cajas)' : '') + ' (' + $m(q2 * p.costo) + '): vendes ~' + p.sem.toFixed(1) + ' por semana y tienes ' + p.stock + '.' : 'De ' + p.nombre + ' no necesitas pedir: tienes ' + p.stock + ' y vendes ~' + p.sem.toFixed(1) + ' por semana.', ['Ficha de ' + p.nombre]);
      }
      const s = informe(A).sec.filter(x => /^Pedido/.test(x.tit))[0], ya = informe(A).sec.filter(x => x.tit === 'Pide ya')[0];
      return R((ya ? ya.tit + ': ' + ya.txt + '\n\n' : '') + (s ? s.tit + ':\n' + s.txt : 'Por ahora no veo nada urgente que pedir.'), ['¿Qué cargo hoy?', 'Más vendidos']);
    }
    if (/ruta|visitar|visito|a quien (le )?(vendo|visito)|clientes de hoy|clientes (que )?(faltan|me faltan)/.test(n)) {
      const s = informe(A).sec.filter(x => /^Ruta/.test(x.tit))[0];
      return R(s ? s.tit + ':\n' + s.txt : 'No encuentro clientes asignados a hoy. Asígnales día en la sección Clientes.', ['¿Quién me debe?']);
    }
    if (/recomiend|consejo|sugier|sugerenc|que me sugieres|prioridad|urgente|importante|que hago$|que debo/.test(n)) {
      const r = ins.filter(i => !i.preg).slice(0, 4);
      return R(r.length ? 'Lo más importante ahora:\n' + lista(r, i => i.tit + ' — ' + i.txt, 4) : 'Por ahora no veo nada urgente. Sigue vendiendo.', ['¿Qué cargo hoy?', '¿Qué pido?']);
    }
    if (/\bsub(ir|o|e|irle)\b|aument(ar|o)|bajar(le)?\b|rebaj|promocion|oferta/.test(n)) {
      if (p) {
        const f = ficha(A, p, ''), tail = f.split('\n').filter(l => /^👉/.test(l))[0];
        return R(p.nombre + ': precio ' + $m(p.precio) + ', costo ' + $m(p.costo) + (p.margen != null ? ', margen ' + Math.round(p.margen) + '%' : '') + (mem.precios[p.id] ? ', en tiendas ' + $m(mem.precios[p.id].v) : '') + '.\n' + (tail || '👉 Déjalo como está por ahora.'));
      }
      const r = ins.filter(i => /^(sube|barato|margen|lento|caro|perdida):/.test(i.key));
      return R(r.length ? 'Te sugiero revisar estos precios:\n' + lista(r, i => i.tit + ' — ' + i.txt, 5) : 'Por ahora no veo precios que convenga mover.', ['Menor margen', 'Productos parados']);
    }

    // --- rankings ---
    if (/agotad|sin stock|se acab|por acabar|poco stock|quedan pocos|no tengo de/.test(n)) {
      const ag = A.L.filter(r => r.stock <= 0 && r.u28 >= 2).sort((a, b) => b.sem * b.gpp - a.sem * a.gpp), ur = A.L.filter(r => r.u28 >= 3 && r.stock > 0 && r.sem > 0 && r.stock / r.sem < 1).sort((a, b) => b.sem * b.gpp - a.sem * a.gpp);
      return R((ur.length ? 'Por acabarse:\n' + lista(ur, r => r.nombre + ' — quedan ' + r.stock + ', vendes ~' + Math.round(r.sem) + '/semana', 6) + '\n\n' : '') + (ag.length ? 'Agotados que sí vendías:\n' + lista(ag, r => r.nombre + ' — dejabas ~' + $m(r.sem * r.gpp) + '/semana', 6) : 'No tienes agotados importantes.'), ['¿Qué pido?']);
    }
    if (/parado|sobra|exceso|no compres|sobrante|inmovil|no se mueve|no se vende|muert|estanc|lento|menos (se )?(vend|mueve)|(vende|mueve)n? menos|dinero parado/.test(n)) {
      const pa = A.L.filter(r => r.stock > 0 && r.costo > 0 && (r.sem > 0 ? r.stock / r.sem > 6 : true)).sort((a, b) => b.stock * b.costo - a.stock * a.costo);
      return R(pa.length ? 'Dinero parado: ' + $m(pa.reduce((a, r) => a + r.stock * r.costo, 0)) + '\n' + lista(pa, r => r.nombre + ' — ' + r.stock + ' pzas (' + $m(r.stock * r.costo) + ')' + (r.sem > 0 ? ', ~' + Math.round(r.stock / r.sem) + ' semanas' : ', sin ventas'), 6) + '\nNo los recompres y muévelos con oferta.' : 'No veo productos parados por ahora.', ['¿Qué subo de precio?']);
    }
    if (/margen|rentab|gano mas|deja mas|me deja|ganancia por/.test(n) && !/\bhoy\b|ayer|semana|mes/.test(n)) {
      const bajo = /menos|menor|bajo|peor|poco|minimo/.test(n), L2 = A.L.filter(x => x.u28 > 0 && x.margen != null);
      if (bajo) { const r = L2.sort((a, b) => a.margen - b.margen); return R(r.length ? 'Los de menor margen (entre lo que vendes):\n' + lista(r, x => x.nombre + ' — ' + Math.round(x.margen) + '% (' + x.u28 + ' pzas)', 6) : 'Aún no tengo datos de margen.', ['¿Qué subo de precio?']); }
      const r = A.L.filter(x => x.u28 > 0).sort((a, b) => b.gpp * b.u28 - a.gpp * a.u28);
      return R(r.length ? 'Los que más ganancia te dejaron en 4 semanas:\n' + lista(r, x => x.nombre + ' — ' + $m(x.gpp * x.u28) + ' (' + x.u28 + ' pzas' + (x.margen != null ? ', ' + Math.round(x.margen) + '%' : '') + ')', 6) : 'Aún no tengo ventas para calcularlo.', ['Menor margen']);
    }
    if (/mas vendid|mas se (vende|mueve)|top|estrella|popular|(vende|mueve)n? mas|vuela|mejor(es)? producto/.test(n))
      return R(A.orden.length ? 'Tus más vendidos (4 semanas):\n' + lista(A.orden, x => x.nombre + ' — ' + x.u28 + ' pzas' + (x.margen != null ? ' (' + Math.round(x.margen) + '%)' : ''), 6) : 'Aún no tengo ventas.', ['Menor margen', 'Productos parados']);

    // --- clientes ---
    const cli = buscarCliente(A, q);
    if (cli && !p) {
      const ts = A.trAll.filter(t => (t.clienteNombre || 'Cliente General') === cli.nombre);
      return R(cli.nombre + ':\n• ' + cli.compras + ' compras por ' + $m(cli.total) + ' (ticket ~' + $m(cli.total / cli.compras) + ')\n• Última compra ' + hace(cli.ult, A.now) + '\n' + (cli.debe > 0 ? '• Te debe ' + $m(cli.debe) + ' (desde hace ' + Math.floor((A.now - cli.desde) / D) + ' días)' : '• No te debe nada') + (ts.length >= 3 && A.now - cli.ult > 14 * D ? '\n👉 Hace tiempo que no compra: mándale mensaje.' : ''));
    }
    if (/debe|deuda|fiad|credito|por cobrar|cobrar|abono|me deben/.test(n)) {
      const d = A.C.filter(c => c.debe > 0).sort((a, b) => b.debe - a.debe);
      return R(d.length ? 'Te deben ' + $m(d.reduce((a, c) => a + c.debe, 0)) + ':\n' + lista(d, c => c.nombre + ' — ' + $m(c.debe) + ' (hace ' + Math.floor((A.now - c.desde) / D) + ' días)', 6) : 'Nadie te debe por ahora. 👌', ['Mejores clientes']);
    }
    if (/mejores clientes|quien (me )?compra mas|clientes top|cliente(s)? (mas )?(fiel|bueno)|que clientes/.test(n)) {
      const t = A.C.filter(c => c.nombre !== 'Cliente General').sort((a, b) => b.total - a.total);
      return R(t.length ? 'Tus mejores clientes:\n' + lista(t, c => c.nombre + ' — ' + $m(c.total) + ' (' + c.compras + ' compras)', 6) : 'Aún no tengo clientes registrados en tus ventas.', ['¿Quién me debe?']);
    }
    if (/se fueron|inactiv|no compran|dejaron de comprar|perdid|ya no compran/.test(n)) {
      const i = A.C.filter(c => c.nombre !== 'Cliente General' && c.compras >= 3 && A.now - c.ult > 14 * D).sort((a, b) => b.total - a.total);
      return R(i.length ? 'Clientes que dejaron de comprar:\n' + lista(i, c => c.nombre + ' — ' + Math.floor((A.now - c.ult) / D) + ' días sin comprar (' + $m(c.total) + ' históricos)', 6) : 'No veo clientes frecuentes perdidos.', ['Ruta de hoy']);
    }

    // --- tiempo, combos, gastos ---
    if (/que dia|dias? (fuerte|flojo|mas)|cuando (vendo|se vende)|hora|a que hora|horario/.test(n)) {
      const h = ins.filter(i => i.key === 'hora')[0], s = informe(A).sec.filter(x => x.tit === 'Tus días')[0];
      return R((s ? s.txt : 'Necesito unas 20 ventas más para saber tus días fuertes.') + (h ? '\n' + h.txt : ''));
    }
    if (/combo|juntos|gancho|ofrecer|paquete/.test(n)) {
      const c = ins.filter(i => i.key.indexOf('combo:') === 0)[0], g = informe(A).sec.filter(x => x.tit === 'Tu gancho')[0];
      return R((g ? g.txt + '\n' : '') + (c ? c.txt : (g ? '' : 'Aún no veo un combo claro; necesito más ventas.')));
    }
    if (/gast(e|o|os|aste)|\bcompre\b|\bcompras\b|inversion|invert/.test(n)) {
      const per = periodo(n, A.now) || { a: A.now - 28 * D, b: A.now + D, l: 'en 28 días' };
      const g = A.todas.filter(t => t.tipo === 'Gasto' && Number(t.id) >= per.a && Number(t.id) < per.b), comp = g.filter(t => t.itemsCompra);
      return R(cap(per.l) + ': ' + g.length + ' gastos por ' + $m(sumF(g, 'monto')) + ', de los cuales compras de mercancía ' + $m(sumF(comp, 'monto')) + ' y flete ' + $m(sumF(comp, 'fleteMonto')) + '.');
    }
    if (/compar|contra la semana|\bvs\b|mejor que|peor que|crec(i|io)|subi(eron)? las ventas/.test(n)) {
      const s = informe(A).sec.filter(x => x.tit === 'Cómo vas')[0];
      return R(s ? s.txt : 'Aún no tengo dos semanas de ventas para comparar.');
    }
    if (/vend(i|ido|ieron)|ventas|ganancia|gane|ganado|cuanto (llevo|saque)|como voy|resumen|corte|ingreso|facture|balance|utilidad|\bhoy\b|ayer|semana|\bmes\b|lunes|martes|miercoles|jueves|viernes|sabado|domingo/.test(n) && !p) {
      const per = periodo(n, A.now);
      if (per) return R(resumenPeriodo(A, per), per.l === 'hoy' ? ['Ayer', 'Esta semana'] : ['¿Qué cargo hoy?', 'Más vendidos']);
      return R(resumenPeriodo(A, periodo('hoy', A.now)) + '\n' + resumenPeriodo(A, periodo('esta semana', A.now)), ['Ayer', 'Semana pasada', 'Este mes']);
    }

    // --- producto ---
    if (p) return R(ficha(A, p, n) + (otros.length ? '\n\nTambién encontré: ' + otros.map(x => x.r.nombre).join(', ') + '.' : ''), ['¿Cuánto pido de ' + p.nombre + '?', '¿Subo el precio de ' + p.nombre + '?']);

    if (iaOn() && !SIN_IA) return null; // lo contesta la IA en linea
    // --- no entendi: sugiero lo mas parecido y lo guardo para aprender ---
    const KW = { ventas: 'Cómo voy hoy', margen: 'Menor margen', pedido: '¿Qué pido?', flete: '¿Qué pido?', deuda: '¿Quién me debe?', clientes: 'Mejores clientes', agotados: 'Productos agotados', reporte: 'Generar reporte', ruta: 'Ruta de hoy', plan: '¿Qué cargo hoy?', precio: '¿Qué subo de precio?', combos: 'Combos', ganancia: 'Cómo voy hoy', parados: 'Productos parados' };
    const sug = []; TOK(q).forEach(w => { if (w.length < 4) return; Object.keys(KW).forEach(k => { if (lev(w, k) <= (k.length >= 7 ? 2 : 1) && sug.indexOf(KW[k]) < 0) sug.push(KW[k]); }); });
    const kq = norm(q), ex = mem.sinEntender.filter(x => norm(x.q) === kq)[0];
    if (ex) { ex.n = (ex.n || 1) + 1; ex.ts = Date.now(); } else mem.sinEntender.push({ q, ts: Date.now(), n: 1 });
    mem.sinEntender = mem.sinEntender.slice(-100); save();
    return R('Eso todavía no lo sé contestar. Lo guardé: en "Informe" toca "Generar reporte", súbelo a Claude y lo mejoramos.' + (sug.length ? ' ¿Quisiste decir alguna de estas?' : ' Mientras tanto prueba con estas:'), sug.length ? sug.slice(0, 4) : CHIPS0.slice(0, 4));
  }
  // =====================================================================
  // ENTENDIMIENTO v4 — entrenado con ~1,000 preguntas de negocio (español de México)
  // Capas: limpieza -> corrección de dedazos -> reglas por intención -> parecido con el corpus
  // -> memoria de contexto (seguimientos) -> aprendizaje de lo que no entendió.
  // =====================================================================
  const ENT = {
    saludo: "hola|buenas|buen dia|buenos dias|buenas tardes|que onda|ayuda|menu|que puedes hacer|que haces|que sabes hacer|hola asistente|holaa|buenas noches|epa|quiubo|que tal|hey|en que me puedes ayudar|como me ayudas|para que sirves|que eres",
    plan: "que cargo hoy|que debo cargar hoy|que llevo hoy|que llevo a la ruta|que le meto a la camioneta|que surto hoy|plan del dia|plan de hoy|que hago hoy|que cargo|que le cargo al carro|que cargo para la ruta de hoy|que meto al carro hoy|que debo llevar hoy|que debo llevarme hoy a vender|que llevo para hoy|plan de la semana|que cargo manana|que debo surtir hoy|que producto llevo hoy|dime que cargar|que le cargo a la unidad|que llevo en la camioneta|que le echo al carro|que debo subir al carro hoy|para hoy que cargo|cargame el plan de hoy|que meto hoy|que subo a la camioneta",
    pedido: "que pido|que debo pedir|que le pido al proveedor|armame el pedido|arma mi pedido|cuanto me falta para el flete gratis|cuanto me falta para flete gratis|cuanto me falta para los 20 mil|que compro|que debo comprar|que tengo que comprar|que compro en monterrey|que me falta pedir|hazme el pedido|pedido sugerido|que pedimos|que pido esta semana|que pido para completar el flete|que compro para llegar a 20000|que pido hoy|que necesito comprar|que tengo que pedir|dime que pedir|que le encargo al proveedor|ayudame a armar el pedido|que le pido a monterrey|que surto con el proveedor|lista de compras|que hay que comprar|cuanto necesito pedir|cuanto debo pedir para el flete|completa mi pedido|que me conviene pedir|que pido primero|que debo reponer|reponer inventario|que reabasteco|que resurto|que ocupo pedir",
    ruta: "ruta de hoy|ruta|a quien visito hoy|a quien le vendo hoy|a quien visito|que clientes visito hoy|clientes de hoy|que clientes me faltan|cuantos clientes me faltan hoy|a quien me falta visitar|quienes me faltan|que clientes tengo hoy|mi ruta|a quien le toca hoy|a quien le toca visita hoy|a quien debo visitar|que tiendas me faltan|tiendas de hoy|cual es mi ruta de hoy|que clientes toca visitar hoy|quienes faltan por visitar|que clientes me faltan de visitar|a donde voy hoy|a quien le llego hoy|que tiendas visito hoy",
    recom: "que me recomiendas|dame un consejo|dame consejos|que me sugieres|que es lo mas urgente|que es lo mas importante|prioridades|que debo hacer|que hago|sugerencias|recomendaciones|algun consejo|en que me enfoco|que debo atender primero|que es urgente|que cosas debo arreglar|que se me esta pasando|tienes algun consejo para mi negocio|que mejoro en mi negocio|como mejoro mis ventas|como vendo mas|que puedo mejorar|que me aconsejas|dime algo importante|alguna sugerencia",
    subir: "que subo de precio|que le subo de precio|que debo subir de precio|que producto subo|a cuales les subo el precio|que precios subo|que le aumento de precio|a que le subo|que le subo|que productos puedo subir|que me conviene subir de precio|cuales puedo encarecer|que subo|que productos estan baratos|en que estoy barato|que estoy vendiendo muy barato|que precios estan bajos|que precio conviene subir|subir precios|que le puedo subir|que puedo subirle",
    bajar: "que bajo de precio|que le bajo de precio|que le bajo|que debo bajar de precio|a que le bajo el precio|que productos rebajo|que pongo en oferta|que meto a promocion|que promociono|que debo poner en oferta|que ofertas hago|como muevo el producto que no se vende|que bajo|que precios bajo|que rebajo|que le hago oferta|que mando a promocion|que le pongo promo|que productos estan caros|en que estoy caro|a que le bajo|que le rebajo para venderlo|que remato",
    yano: "que ya no debo vender|que debo dejar de vender|que dejo de surtir|que dejo de comprar|que descontinuo|que productos no me convienen|que productos no me dejan|que quito del inventario|que dejo de pedir|que ya no pido|que saco del catalogo|que productos sobran|que no me conviene vender|que productos no sirven|que elimino|que producto ya no me deja nada|que no vale la pena vender|que ya no cargo|que elimino de mi inventario|que dejo de llevar|cual no me conviene seguir vendiendo",
    agotados: "que se me esta acabando|que productos estan agotados|que se me acabo|que esta por acabarse|que agotados tengo|que productos estan sin stock|que me falta|que no tengo|productos agotados|que esta agotado|que poco stock tengo|que productos quedan pocos|que ya se acabo|que se agoto|que se me termino|que no tengo en inventario|cuales estan en cero|que tengo en cero|que tengo en ceros|que productos tengo en 0|que esta en ceros|que casi no me queda|que me esta faltando|que se esta terminando|que ya casi se acaba|de que me estoy quedando sin|que productos me estan faltando|que ya no tengo|que se me va a acabar|que se va a acabar pronto",
    parados: "que productos estan parados|que no se mueve|que no se vende|que tengo parado|dinero parado|cuanto dinero tengo parado|que productos sobran|que tengo de sobra|que tengo de mas|que exceso de inventario tengo|que producto no rota|que no rota|productos sin movimiento|que productos estan muertos|que esta estancado|que se vende lento|que se vende poco|que es lo que menos vendo|que menos se vende|que vendo menos|que es lo que menos se mueve|que no compre mas|que no debo comprar|cuales no compro|que producto esta lento|que no sale|que no sale del almacen|que tengo guardado sin vender|que esta juntando polvo|que productos tienen poca salida",
    margen_bajo: "menor margen|que deja menos margen|cuales tienen menos margen|que producto deja menos|que me deja menos ganancia|que tiene el margen mas bajo|productos con poco margen|que tiene poco margen|margen mas bajo|cual deja menos ganancia|que producto es el que menos me deja|peor margen|que me deja poco|cuales dejan poco|en que gano menos|que producto gano menos|cual tiene el peor margen|que me deja menos|que margen bajo tengo|donde gano poco",
    margen_alto: "que me deja mas ganancia|que gano mas|que deja mas margen|que producto deja mas|mejor margen|en que gano mas|cuales tienen mas margen|que me deja mas|que es lo mas rentable|productos mas rentables|que produto es mas rentable|cual me deja mas dinero|con que gano mas|que producto me da mas ganancia|cual es mi producto mas rentable|donde gano mas|que margen alto tengo|que deja mas dinero|cual es el que mas ganancia deja|cual deja mas utilidad",
    top: "mas vendidos|que es lo mas vendido|que vendo mas|cuales son mis mas vendidos|que producto vendo mas|top productos|cual es mi producto estrella|productos estrella|que es lo que mas se vende|que se vende mas|lo que mas se mueve|que se mueve mas|los mas populares|que es lo que mas sale|cuales son los mejores productos|que es lo que mas vuela|mejores productos|ranking de productos|que es lo que mas vendo|que producto sale mas|cual es el que mas sale|que productos son los mas vendidos|que vendo mejor|mi top 5|top 10",
    deben: "quien me debe|quienes me deben|cuanto me deben|quien me debe dinero|quien debe|deudas|clientes que me deben|a quien le fie|a quien le he fiado|quien tiene credito|cuanto tengo por cobrar|por cobrar|que clientes deben|quien no me ha pagado|quien me falta que me pague|cuanto me adeudan|que me deben|quien me debe plata|quienes me adeudan|a quien le cobro|a quien tengo que cobrarle|cobranza|cuentas por cobrar|quien me quedo a deber|quien me quedo debiendo|quien se quedo a deber|quien tiene fiado|quienes tienen fiado|cuanto me deben en total|quien no ha abonado",
    mejores: "mejores clientes|quien me compra mas|cuales son mis mejores clientes|quien es mi mejor cliente|clientes top|que cliente me compra mas|quienes son mis clientes buenos|cliente mas fiel|quien compra mas|mi mejor cliente|quienes me compran mas|a quien le vendo mas|cual es mi cliente mas grande|top clientes|clientes que mas compran|ranking de clientes|quien es el que mas compra|que cliente deja mas dinero",
    inactivos: "que clientes se fueron|clientes inactivos|quien dejo de comprar|quienes ya no compran|que clientes ya no me compran|clientes perdidos|quien no compra hace tiempo|quienes no han comprado|quien se me perdio|que clientes perdi|quienes dejaron de comprarme|que clientes no han vuelto|quien no ha vuelto a comprar|a quien ya no le vendo|que clientes abandonaron|quien se desaparecio|que clientes estan dormidos",
    dias: "que dia vendo mas|cual es mi dia fuerte|cual es mi dia mas flojo|que dia se vende mas|dias fuertes|a que hora vendo mas|cual es mi hora fuerte|cuando vendo mas|en que horario vendo mas|que dia es el mejor|que dia vendo menos|cual es mi mejor dia|cual es mi peor dia|que dia me va mejor|a que horas se vende mas|en que dia hay mas venta|cuando se vende mas|que dia de la semana vendo mas|dias flojos|dime mi hora pico|hora pico|hora de mas ventas",
    combos: "que combos puedo hacer|que se vende junto|que productos se compran juntos|combos|que ofrezco de gancho|cual es mi gancho|que producto uso de gancho|que paquete armo|que armo de combo|que le ofrezco junto|que va junto|que se compra junto|que productos van juntos|ideas de combos|que puedo ofrecer junto con|que armo en paquete|que me recomiendas ofrecer",
    gastos: "cuanto gaste|cuanto he gastado|cuanto gaste este mes|cuanto gaste esta semana|cuanto invertí|cuanto invierto|gastos del mes|mis gastos|cuanto compre este mes|cuanto he comprado|cuanto pague de flete|cuanto gaste en mercancia|cuanto gasto en gasolina|cuanto he invertido|en que gaste|cuanto me gaste|gastos de hoy|cuanto gaste ayer|gastos de la semana|cuanto gaste en la semana pasada|cuanto fue mi inversion|total de gastos|total gastado|cuanto me costo todo este mes|cuanto saque de gastos",
    nomina: "cuanto pague de nomina|cuanto he pagado de nomina|sueldo del ayudante|cuanto le pago al empleado|nomina del mes|cuanto gaste en nomina|cuanto le he pagado al trabajador|pagos de nomina|cuanto pague de sueldos|cuanto le pago a mi empleado|cuanto pague en salarios|cuanto me cuesta el empleado|nomina de la semana|raya de la semana|cuanto pague de raya",
    comparar: "como voy contra la semana pasada|compara con la semana pasada|vendo mas que la semana pasada|estoy creciendo|han subido mis ventas|vs semana pasada|como voy comparado con la semana pasada|subieron las ventas|estoy vendiendo mejor que antes|voy mejor que la semana pasada|estoy mejor que la semana pasada|vendi mas que la semana pasada|crecieron mis ventas|estoy vendiendo mas|estoy vendiendo menos|bajaron las ventas|cayeron mis ventas|como me fue comparado con antes",
    ventas: "cuanto llevo|como voy|como voy hoy|como voy esta semana|cuanto he vendido|resumen del dia|corte|corte del dia|cuanto llevo vendido|dime como voy|como va mi negocio|como va el negocio|como va la venta|como van las ventas|cuanto he ganado|balance|estado del negocio|como estoy|como estamos|ventas|ganancia|utilidad del dia|cuanto llevo ganado hoy|como va la semana|como va el mes|cuanto llevo este mes|cuanto llevo en la semana|cuanto llevo en el mes",
    aprendido: "que has aprendido|que sabes de mi|que recuerdas|que has guardado|tienes memoria|te acuerdas de lo que te dije|que sabes de mi negocio|que aprendiste|que recuerdas de mi|que te he enseñado|que te he ensenado|recuerdas lo que te dije|aprendes|tienes memoria de lo que te digo|que te acuerdas",
    reporte: "genera el reporte|descargar reporte|exportar reporte|dame un reporte|mandame el reporte|quiero el reporte|hazme un reporte|bajar reporte|reporte",
    gracias: "gracias|muchas gracias|ok gracias|va gracias|excelente gracias|perfecto|ok|va|listo|esta bien|gracias asistente|chido|sale|muy bien",
    adios: "adios|hasta luego|nos vemos|bye|me voy|hasta manana|chao",
    explica: "que es el margen|que significa margen|como se calcula el margen|que es ganancia|que es un gancho|que es flete|que es rotacion|que significa que se alcanza para semanas|como calculas lo que debo cargar|como sacas el pedido|como funciona el asistente|como aprendes|de donde sacas los datos|como calculas el pronostico|por que me dices que pida eso|porque me recomiendas eso|como decides que cargue|explicame el margen",
    inventario: "cuanto vale mi inventario|valor del inventario|cuanto tengo en inventario|cuanto dinero tengo en mercancia|cuantos productos tengo|cuantas piezas tengo en total|cuanto capital tengo en producto|valor de mi mercancia|cuanto tengo invertido en inventario|cuantos productos manejo",
    datos_malos: "que productos no tienen costo|productos sin costo|que productos tienen costo cero|que productos no tienen precio|productos con precio en 0|que datos debo corregir|que debo corregir|hay errores en mi inventario|que productos tienen stock negativo|stock negativo|que productos estan mal capturados|productos a revisar|que revisar",
    ticket: "cual es mi ticket promedio|ticket promedio|cuanto me compran por venta|cuanto compra en promedio un cliente|venta promedio|cuantas ventas hago por dia|cuantas ventas llevo|cuantas ventas tengo|cuantos tickets hice hoy|cuantos tickets llevo",
    pronostico: "cuanto voy a vender|cuanto venderé esta semana|cuanto voy a vender manana|pronostico de ventas|cuanto espero vender|que espero vender esta semana|cuanto voy a ganar esta semana|prediccion de ventas",
    olvidar: "olvida todo|borra lo aprendido|olvida lo que te dije|reinicia tu memoria|borrar memoria",
    lista_prod: "cuantos clientes tengo|cuantos clientes registrados tengo|lista de mis clientes|cuales son mis clientes|cuantos clientes compraron hoy|cuantos clientes me compraron esta semana",
    caro_barato: "cual es mi producto mas caro|cual es el producto mas barato|que producto es el mas caro|producto mas costoso|cual es el mas barato que vendo",
    perdida: "que vendo a perdida|estoy perdiendo dinero en algun producto|que producto me hace perder|que productos estan a perdida|hay algo que vendo mas barato de lo que me cuesta|en que pierdo|donde estoy perdiendo dinero|que productos me dan perdida",
    flete: "cuanto flete pague|cuanto me costo el flete|cuanto gaste en flete|como voy con el flete|el flete me esta comiendo la ganancia|cuanto pago de flete por pedido|como bajo el flete|como evito pagar flete"
  };
  const EXTRA_VOC = 'proveedor proveedores tiene tienen tienda tiendas cuesta cuestan caja cajas trae traen vienen piezas meta flete gratis minimo oxxo walmart bodega mayoreo competencia descontinuado existencia precio precios costo costos hay ya llego llegaron sirve funciona explicame significa calcula calculas sacas decides aprendes olvida borra confirmo todo memoria nombre llamo refiero refieres quise decir ultima ultimo vez compro compra compran compraron visita visito dias dia lunes martes miercoles jueves viernes sabado domingo semana semanas mes meses ayer hoy anteayer antier manana pasada pasado ultimos ultimas este esta total promedio gaste gasto gastos gastado nomina sueldo sueldos salario raya empleado trabajador ayudante ayudas ayuda ayudame ayudar sirves sirve debe deben debo debes deuda deudas cobrar cobro cobranza abono abonos fiado fie pague pagado pagaron';
  const FILL = /\b(oye|oiga|oigame|ey|epa|hey|a ver|por favor|porfa|pf|asistente|disculpa|disculpe|una duda|tengo una duda|quiero saber|quisiera saber|me puedes decir|me podrias decir|puedes decirme|podrias decirme|digame|ahorita|pues|mira|o sea|bueno|entonces|me gustaria saber|necesito saber)\b/g;
  const limpiar = q => norm(q).replace(/[¿?¡!.,;:()"“”]/g, ' ').replace(FILL, ' ').replace(/\s+/g, ' ').trim().replace(/^(dime|dame|digame|mandame|pasame|ayudame a|ayudame|quiero saber|quiero ver|necesito) (?=\S)/, '');
  // distancia Damerau (una transposición cuenta como 1 error) y comparación tolerante a dedazos
  const dl = (a, b) => {
    if (a === b) return 0; const n = a.length, m = b.length; if (!n) return m; if (!m) return n;
    const d = []; for (let i = 0; i <= n; i++) { d[i] = [i]; } for (let j = 0; j <= m; j++) d[0][j] = j;
    for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) { const c = a[i - 1] === b[j - 1] ? 0 : 1; d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c); if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); }
    return d[n][m];
  };
  const fuzz = (w, x) => { const d = dl(w, x); if (d === 0) return true; if (w.length >= 8) return d <= 2; if (d !== 1) return false; if (w.length >= 7) return true; if (w.length === x.length) { let h = 0; for (let i = 0; i < w.length; i++) if (w[i] !== x[i]) h++; return h === 2; } return true; };
  const TKS = s => norm(s).split(/[^a-z0-9&]+/).filter(Boolean);
  const VOC = {}, FREC = {};
  const sumaVoc = txt => TKS(txt).forEach(w => { if (w.length >= 4 && !/\d/.test(w)) { VOC[w] = 1; FREC[w] = (FREC[w] || 0) + 1; } });
  Object.keys(ENT).forEach(k => sumaVoc(ENT[k].replace(/\|/g, ' ')));
  sumaVoc(EXTRA_VOC);
  const VOCL = Object.keys(VOC);
  const corrPal = (w, prot) => {
    if (w.length < 4 || VOC[w] || /\d/.test(w) || prot[w]) return w;
    for (let i = 0; i < prot.__l.length; i++) { const x = prot.__l[i]; if (Math.abs(x.length - w.length) <= 1 && w.length >= 4 && fuzz(w, x)) return w; }
    const lim = w.length >= 8 ? 2 : 1; let best = null, bd = 9, bf = 0;
    for (let i = 0; i < VOCL.length; i++) {
      const v = VOCL[i]; if (Math.abs(v.length - w.length) > lim) continue;
      const d = dl(w, v); if (d > lim) continue; if (w.length <= 5 && w.length === v.length && d === 1) { let h = 0; for (let k = 0; k < w.length; k++) if (w[k] !== v[k]) h++; if (h === 1 && w[0] !== v[0]) continue; }
      if (d < bd || (d === bd && (FREC[v] || 0) > bf)) { bd = d; best = v; bf = FREC[v] || 0; }
    }
    return best || w;
  };
  function corregir(s, A) {
    const prot = { __l: [] };
    A.L.forEach(r => TKS(r.nombre).forEach(w => { if (w.length >= 3) { prot[w] = 1; } }));
    A.C.forEach(c => TKS(c.nombre).forEach(w => { if (w.length >= 3) prot[w] = 1; }));
    Object.keys(mem.alias || {}).forEach(a => TKS(a).forEach(w => { prot[w] = 1; }));
    prot.__l = Object.keys(prot).filter(k => k !== '__l' && k.length >= 4);
    return s.split(' ').map(w => corrPal(w, prot)).join(' ');
  }
  // --- parecido con el corpus (TF-IDF por raíz de 4 letras) ---
  const RT = w => (w.length > 4 ? w.slice(0, 4) : w);
  const SW = /^(que|de|el|la|los|las|un|una|mi|me|mis|se|lo|le|les|es|en|a|y|o|por|para|con|del|al|tengo|esta|este)$/;
  const IDX = [], DF = {};
  Object.keys(ENT).forEach(k => ENT[k].split('|').forEach(f => {
    const st = TKS(f).filter(w => !SW.test(w)).map(RT); if (!st.length) return;
    IDX.push({ k, st }); st.filter((x, i) => st.indexOf(x) === i).forEach(x => { DF[x] = (DF[x] || 0) + 1; });
  }));
  const idf = x => Math.log((IDX.length + 1) / ((DF[x] || 0) + 0.5)) + 0.2;
  function parecido(s) {
    const qs = TKS(s).filter(w => !SW.test(w)).map(RT); if (!qs.length) return { k: null, sc: 0, top: [] };
    const nq = Math.sqrt(qs.reduce((a, x) => a + idf(x) * idf(x), 0)) || 1; let best = { k: null, sc: 0 }; const por = {};
    IDX.forEach(d => {
      let dot = 0; qs.forEach((x, i) => { if (d.st.indexOf(x) >= 0 && qs.indexOf(x) === i) dot += idf(x) * idf(x); });
      if (!dot) return;
      for (let i = 0; i + 1 < qs.length; i++) for (let j = 0; j + 1 < d.st.length; j++) if (qs[i] === d.st[j] && qs[i + 1] === d.st[j + 1]) dot += 0.6 * idf(qs[i]);
      const nd = Math.sqrt(d.st.reduce((a, x) => a + idf(x) * idf(x), 0)) || 1, sc = dot / (nq * nd);
      if (sc > (por[d.k] || 0)) por[d.k] = sc;
      if (sc > best.sc) best = { k: d.k, sc };
    });
    best.top = Object.keys(por).sort((x, y) => por[y] - por[x]).slice(0, 3).map(k => ({ k, sc: por[k] }));
    return best;
  }

  // --- reglas por intención (sobre texto limpio y corregido) ---
  const NOMB = /nomina|sueldo|salario|\braya\b|empleado|trabajador|ayudante/;
  const REG = [
    ['olvidar', s => /\b(olvid|borr|reinici|resete|limpi)\w*/.test(s) && /\b(todo|memoria|aprendid|dije|ensen)/.test(s)],
    ['aprendido', /\b(que|cuanto) (has |haz )?(aprendid|aprendiste|sabes de mi|recuerdas|guardad|te acuerdas|te he ensenado|te ensene|guardas)|tienes memoria|te acuerdas|\baprendes\b|recuerdas lo que|\bmemoria\b|que sabes de mi/],
    ['reporte', /\b(reporte|exportar|descargar)\b/],
    ['explica', s => /\bque (es|son|significa|quiere decir)\b/.test(s) && /\b(margen|ganancia|gancho|flete|rotacion|alcanza|pronostico|stock|pedido|costo|utilidad|ticket|inventario|asistente|credito|semanas)\b/.test(s) || /\bcomo (funciona|aprendes|calculas|sacas|decides|se calcula|se saca|se obtiene|lo calculas|haces)\b|\bexplica\w*|\bpor ?que (me )?(dices|recomiendas|sugieres|aconsejas|pides)|de donde sacas|como sabes|que significa/.test(s)],
    ['adios', /^(adios|chao|chau|bye|hasta (luego|manana|pronto)|nos vemos|me voy|cuidate|ahi nos vemos)/],
    ['gracias', s => s.split(' ').length <= 3 && /^((muchas |mil )?(gracias|grax)( .*)?|(ok|okey|okay|vale|va|sale|listo|perfecto|excelente|chido|genial|muy bien|esta bien|de acuerdo|entendido|enterado|simon|sip|oki|buenisimo|super|padre|nice|cool)( (gracias|grax|va|ok))?|(excelente|perfecto|genial|chido|listo) gracias)$/.test(s)],
    ['saludo', s => s.split(' ').length <= 6 && /^(hola+|holi|buenas( (tardes|noches|dias))?|buen(os)? dias|que onda|quiubo|que tal|epa|hey|saludos|ayuda|menu|que puedes( hacer)?|que haces|que sabes( hacer)?|en que me (puedes )?ayud\w*|como me ayud\w*|para que sirves|que eres|quien eres|que me puedes ofrecer)( .*)?$/.test(s)],
    ['nomina', s => NOMB.test(s)],
    ['perdida', /\ba perdida\b|perdiendo|\bpierdo\b|perder\b|hace perder|dan perdida|mas barato de lo que (me )?cuesta|menos de lo que (me )?cuesta|debajo del costo/],
    ['datos_malos', /(sin|no tienen?|con) (costo|precio)|(costo|precio)s? (en |a )?(0|cero)|stock negativo|negativ|mal capturad|(debo|hay que|tengo que) (corregir|revisar|arreglar)|que (corregir|revisar|arreglar)|errores?|datos (malos|incorrectos|erroneos)|a revisar|que revisar/],
    ['inventario', /(valor|vale|capital|invertido|dinero|cuanto (tengo|hay|vale)).*(inventario|mercancia|existencia|almacen|bodega|en producto)|inventario (total|valor)|\bcuantos productos\b|\bcuantas piezas\b|\bmi inventario\b/],
    ['ticket', /ticket promedio|venta promedio|promedio (por|de) venta|compra(n)? en promedio|cuantas ventas (hago|llevo|tengo|hice|he hecho)|cuantos tickets|ventas por dia/],
    ['pronostico', /cuanto (voy a|vendere|espero|podre|ganare|vamos a|se va a)|pronostico|prediccion|proyeccion|que espero vender|estimado de ventas/],
    ['caro_barato', s => /\bmas (caro|barato|costoso|economico)\b/.test(s) && /producto|articulo|vendo|tengo|manejo|cual/.test(s) && !/estan|estoy/.test(s)],
    ['lista_clientes', s => /cuantos clientes|lista de (mis )?clientes|cuales son mis clientes|mis clientes$|clientes registrados/.test(s) && !/falt|visit|toca|ruta/.test(s)],
    ['flete', s => /flete/.test(s) && !/falta|gratis|completar|llegar|pedido|pido|pedir|compro|meta/.test(s)],
    ['gastos', /gast|invert|inversion|cuanto (compre|he comprado|pague)|cuanto (me )?costo (todo|el mes)|compras (del|de este|de la)|total (de )?gastos/],
    ['inactivos', s => /cliente|quien|quienes|tienda/.test(s) && /(se fueron|se fue|se me perdio|se desaparecio|inactiv|perdid|perdi\b|abandon|dormid|ya no (me )?(compra|compran|vendo)|dej\w+ de comprar|no (ha|han) (vuelto|comprado)|no compra\w* hace|sin comprar|ya no le vendo|se perdieron)/.test(s)],
    ['yano', /ya no (debo |deberia |tengo que |conviene |voy a )?(vender|surtir|pedir|comprar|cargar|llevar|pido|cargo|llevo|compro|surto)|dej(o|ar|e|aria|amos) de (vender|surtir|pedir|comprar|cargar|llevar)|descontinu|\bquito\b|\bsaco (del|de mi)|\belimin|(no|ya no) (me )?(conviene|sirve|sirven|dejan?|vale la pena)/],
    ['bajar', /como (muevo|saco|remato|libero)|\bpromo\w*|oferta|remat/],
    ['dias', /\b(que|cual|en que|a que|cual es mi|cual es el) (dia|dias|hora|horas|horario)|dias? (fuerte|fuertes|flojo|flojos|mejor|peor)|\bhora (pico|fuerte)|cuando (se )?(vend|vuela)\w*|mejor dia|peor dia|dia de la semana|a que horas|dia (se )?vend|hora de mas|horario/],
    ['parados', /\bparados?\b|\bsobra\b|\bsobran\b|sobrante|exceso|de sobra|\bde mas\b|inmovil|\bno (se )?(mueve|vende|rota|sale|surte)\b|muert|estanc|lento|lenta|menos (se )?(vend|mueve|sale|rota)|que menos (vendo|vende|se vende|se mueve|sale)|vendo menos|poca salida|sin movimiento|no compres|no compre mas|no debo comprar|cuales no compro|juntando polvo|guardado sin vender|no pidas|no debo pedir|que no compre/],
    ['plan', s => !/cuanto|pido|pedir|proveedor/.test(s) && ((/\b(carg\w*|llev\w*|meto|echo|surto|surtir)\b/.test(s) && /\b(hoy|manana|carro|camioneta|unidad|ruta|vender|dia|semana)\b/.test(s)) || /\bsub(ir|o|e)\w* (al|a la|a el)\b/.test(s) || /\bque (debo )?(cargo|cargar)\b|\bcargar\b|plan (de |del |de la )?(hoy|dia|semana)|que hago hoy|\bcargame\b|que le (meto|cargo|echo)|que meto\b|que llevo\b/.test(s))],
    ['deben', /\bdeb(e|en|ia|ian)\b|\bdeuda|\bfia(do|dos|r|ste)\b|\bfie\b|\bcredito|por cobrar|\bcobr(ar|o|anza|ale|arle)\b|adeud|\babon|quedo (a )?deber|quedo debiendo|se quedo a deber|no (me )?(ha|han) (pagado|abonado)|me falta que me pague|pagado/],
    ['mejores', /mejor(es)? cliente|clientes? (top|fiel|fieles|buen|buenos|grande|que mas)|quien(es)? (me )?compra(n)? mas|a quien le vendo mas|que cliente (me )?(deja|compra)|top clientes|ranking de clientes|cliente mas|quien es el que mas compra|cual es mi cliente/],
    ['ruta', /\bruta\b|a quien (le )?(visito|vendo|toca|llego|debo visitar|me falta)|(clientes|tiendas|quienes)( que)? (me )?(faltan|toca|tengo hoy|visito|de hoy|por visitar|faltan de visitar)|clientes de hoy|tiendas de hoy|a donde voy|que clientes (tengo|me faltan|toca|visito)|que tiendas (me faltan|visito|toca)|me falta visitar|faltan por visitar|visitar/],
    ['pedido', /\b(pedir|pido|pide|pedido|pedimos|comprar|compro|surtir|surto|reponer|resurtir|resurto|reabastec\w*|encargo|encargarle|surtido)\b|lista de compras|hay que comprar|que ocupo|flete gratis|20 ?mil|20,?000|cuanto me falta|completa\w* (mi )?pedido|que compro|necesito comprar/],
    ['combos', /combo|\bjuntos?\b|gancho|paquete|ofrec|que va junto|(se )?(compra|vende)n? junto/],
    ['margen', /margen|rentab|utilidad (por|de)|ganancia por|\bgano (mas|menos|poco)|deja(n)? (mas|menos|poco)|\bme deja\b|\bme da mas ganancia|donde gano|en que gano|con que gano|mas ganancia|menos ganancia|mas dinero|mas utilidad/],
    ['subir', /\bsub(ir|o|e|irle|irles|irlo|irlos)\b|aument(ar|o)|encarec|\bbarato\b|\bbaratos\b|precios? bajos|estan bajos/],
    ['bajar', /\bbaj(ar|o|e|arle|arles|ando)\b|rebaj|\bcaro\b|\bcaros\b|\bcara\b/],
    ['agotados', /agotad|sin stock|sin existencia|\bacab|\btermin|\bfalt(a|an|ando|ante|antes)\b|queda(n)? (poco|pocos|nada)|casi no (me )?queda|en (cero|ceros|0)\b|(ya )?no tengo|no (me )?queda|me quede sin|quedando sin/],
    ['top', /mas vendid|\bmas (se )?(vende|vendo|mueve|sale|vuela)\b|\btop\b|estrella|popular|ranking de productos|mejores productos|vendo mejor|producto que sale mas|que (vendo|se vende) mas|lo que mas se|lo mas vend/],
    ['recom', /recomiend|consejo|sugier|sugerenc|aconsej|prioridad|urgente|importante|\bque (debo|hago|mejoro|puedo mejorar)\b|como (mejoro|vendo mas|aumento|crezco|gano mas)|en que me enfoco|se me (esta )?pasa|mejorar/],
    ['comparar', /compar|contra (la )?semana|\bvs\b|(mas|mejor|peor|menos) que (la )?(semana|antes|ayer)|\bcreci\w*|\bcrec\w*|subi(eron|do|n)? (las |mis )?ventas|bajaron|cayeron|\bcayo\b|estoy (vendiendo )?(mejor|peor|mas|menos)|voy mejor|voy peor|vendo mas que|vendi mas que/],
    ['ventas', /vend(i|ido|iste|imos)\b|\bventas?\b|\bganancia|\bgane\b|ganado|\bllevo\b|como (voy|va|vamos|estoy|estamos|me fue)|\bcorte\b|balance|resumen|ingreso|utilidad|estado del negocio|\bfacture\b|\bhoy\b|ayer|semana|\bmes\b|lunes|martes|miercoles|jueves|viernes|sabado|domingo|cuanto (saque|lleve)/]
  ];
  const CANON = { saludo: 'hola', plan: 'que cargo hoy', pedido: 'que pido', ruta: 'ruta de hoy', recom: 'que me recomiendas', subir: 'que subo de precio', bajar: 'que bajo de precio', yano: 'que ya no debo vender', agotados: 'productos agotados', parados: 'dinero parado', margen_bajo: 'menor margen', margen_alto: 'que me deja mas ganancia', top: 'mas vendidos', deben: 'quien me debe', mejores: 'mejores clientes', inactivos: 'clientes inactivos', dias: 'que dia vendo mas', combos: 'combos', comparar: 'compara con la semana pasada', aprendido: 'que has aprendido', reporte: 'reporte', olvidar: 'olvida todo' };
  const CHIP = { plan: '¿Qué cargo hoy?', pedido: '¿Qué pido?', ruta: 'Ruta de hoy', recom: '¿Qué me recomiendas?', subir: '¿Qué subo de precio?', bajar: '¿Qué bajo de precio?', yano: '¿Qué ya no debo vender?', agotados: 'Productos agotados', parados: 'Productos parados', margen_bajo: 'Menor margen', margen_alto: 'Mayor margen', top: 'Más vendidos', deben: '¿Quién me debe?', mejores: 'Mejores clientes', inactivos: 'Clientes que se fueron', dias: '¿Qué día vendo más?', combos: 'Combos', gastos: '¿Cuánto gasté este mes?', comparar: 'Comparar con la semana pasada', ventas: '¿Cómo voy hoy?', inventario: 'Valor del inventario', perdida: '¿Qué vendo a pérdida?', ticket: 'Ticket promedio', pronostico: '¿Cuánto voy a vender?', flete: '¿Cuánto pagué de flete?' };
  const esRank = n => /agotad|sin stock|se acab|por acabar|poco stock|quedan pocos|parado|sobra|exceso|no compres|sobrante|inmovil|no se mueve|no se vende|muert|estanc|lento|menos (se )?(vend|mueve)|(vende|mueve)n? menos|mas vendid|mas se (vende|mueve)|top|estrella|popular|(vende|mueve)n? mas|margen|rentab|gano mas|deja mas|me deja|cuales|que productos|que producto|mis clientes/.test(n);
  function intencion(s) {
    const ap = mem.aprendidas && mem.aprendidas[s]; if (ap) return { i: ap, via: 'aprendida', sc: 1 };
    for (let k = 0; k < REG.length; k++) { const [i, f] = REG[k]; if (typeof f === 'function' ? f(s) : f.test(s)) { return { i: i === 'margen' ? (/menos|menor|bajo|peor|poco|minim/.test(s) ? 'margen_bajo' : 'margen_alto') : i, via: 'regla', sc: 1 }; } }
    const pr = parecido(s); return pr.k && pr.sc >= 0.5 ? { i: pr.k, via: 'parecido', sc: pr.sc } : { i: null, via: null, sc: pr.sc, cerca: pr.k };
  }

  const RR = (t, chips) => ({ t, chips: chips || [] });
  const usoChips = () => { const u = mem.uso || {}, ks = Object.keys(u).filter(k => CHIP[k]).sort((a, b) => u[b] - u[a]).slice(0, 6); const base = CHIPS0.slice(); ks.slice(0, 4).reverse().forEach(k => { const c = CHIP[k], j = base.indexOf(c); if (j >= 0) base.splice(j, 1); base.unshift(c); }); return base.slice(0, 6); };
  const GLOS = [
    [/margen/, 'Margen = lo que te queda de cada peso que vendes. Se calcula (precio − costo) ÷ precio. Si vendes a $20 algo que te cuesta $15, ganas $5 y el margen es 25%. Más margen = más ganancia por pieza; menos margen necesita más volumen.'],
    [/ganancia|utilidad/, 'Ganancia = precio de venta − costo, por cada pieza que vendes. La ganancia del día suma todas las piezas vendidas. Ojo: si un producto tiene costo $0, la app lo cuenta como 100% de ganancia; por eso te aviso cuando los veo.'],
    [/gancho/, 'Gancho = un producto que atrae al cliente porque se vende mucho aunque deje poco margen. Lo usas para ofrecerle junto otro que sí te deja más. Yo busco los que más vendes con margen bajo.'],
    [/flete/, 'Flete = lo que te cobra el proveedor por mandar la mercancía. Tu proveedor lo da gratis desde la meta que me dijiste (por defecto $20,000). Por eso armo el pedido para que llegue a esa meta con productos que sí rotan.'],
    [/rotacion|alcanza|semanas|stock/, '"Te alcanza para X semanas" = piezas que tienes ÷ lo que vendes por semana (promedio de tus últimas 4 semanas, dándole más peso a las últimas 2). Menos de 1 semana = pídelo; más de 6 = ya tienes de sobra.'],
    [/pedido|pido|comprar/, 'Armo el pedido así: para cada producto que sí vendes calculo lo que vendes por semana y te sugiero cubrir 2 semanas (menos lo que ya tienes), respetando cajas completas. Si no llegas a tu meta de flete gratis, completo con lo que más rota y más te deja.'],
    [/cargar|cargo|plan/, 'El plan de carga mira qué día es hoy y cuánto vendes normalmente cada día de la semana de cada producto; suma los próximos 5 días de venta, le resta lo que ya tienes y te dice qué llevar de más. Además me calibro: comparo lo que predije contra lo que vendiste y ajusto.'],
    [/pronostico|prediccion/, 'El pronóstico toma tu venta de los últimos 4 días iguales (por ejemplo los últimos 4 jueves) y saca el promedio. Mientras más historial, más acertado.'],
    [/aprend|memoria|asistente|funciona/, 'No soy una IA generativa: soy un conjunto de reglas sobre TUS datos (ventas, inventario, clientes). Aprendo de tres formas: de cada venta que registras, de lo que me enseñas (precios de tiendas, piezas por caja, qué no tiene tu proveedor, nombres que le das a tus productos) y de tus respuestas a mis consejos (si dices "ya lo hice" o "no me sirve" ajusto qué te muestro primero). Todo se guarda en este celular.'],
    [/credito|fiado/, 'Las ventas a crédito quedan como saldo pendiente del cliente. Te aviso quién debe y desde hace cuántos días para que cobres antes de fiarle de nuevo.'],
    [/ticket/, 'Ticket promedio = lo vendido ÷ número de ventas del periodo.'],
    [/inventario/, 'El valor del inventario lo calculo con las piezas que tienes × el costo de cada producto (lo que te costó). A precio de venta sería más.']
  ];
  const POR_QUE = { plan: 'El plan de carga se basa en lo que vendes cada día de la semana, lo que ya tienes y lo que pronostico para tus próximos 5 días de venta.', pedido: 'El pedido cubre 2 semanas de venta por producto menos tu stock, en cajas completas, y completa hasta tu meta de flete gratis con lo que más rota y más deja.', agotados: 'Cuento como "por acabarse" lo que te alcanza para menos de una semana según tu ritmo de venta.', parados: 'Es dinero parado lo que tardaría más de 6 semanas en venderse a tu ritmo actual.', subir: 'Sugiero subir lo que se vende mucho (de lo más vendido) y deja entre 15% y 28% de margen, sin pasarme del precio en tiendas si me lo dijiste.', bajar: 'Sugiero bajar lo que tienes parado o casi no se vende, hasta un precio donde todavía ganes.', margen_bajo: 'Margen = (precio − costo) ÷ precio, solo de lo que sí vendiste en 4 semanas.', margen_alto: 'Ordeno por ganancia total: ganancia por pieza × piezas vendidas en 4 semanas.', top: 'Ordeno por piezas vendidas en las últimas 4 semanas.', deben: 'Sumo el saldo pendiente de las ventas a crédito de cada cliente.', ventas: 'Sumo tus ventas registradas del periodo; el margen real no cuenta productos con costo $0.', yano: 'Marco los que vendes a pérdida, los que no se han movido en 4 semanas y los de margen muy bajo con poca venta.' };
  function explicar(s, ctx) {
    const g = GLOS.filter(x => x[0].test(s))[0]; if (g) return RR(g[1], ['¿Qué cargo hoy?', '¿Qué pido?']);
    if (/por ?que|porque|como (sacaste|calculaste)|de donde sale|en que te basas/.test(s) && ctx && POR_QUE[ctx.i]) return RR(POR_QUE[ctx.i], []);
    return RR(GLOS[8][1], CHIPS0.slice(0, 4));
  }
  const RA = (k, t, c) => { const r = RR(t, c); r.attr = k; return r; };
  function atributoProd(A, p, s) {
    const ok = x => x.test(s);
    if (ok(/\bsub(ir|o|e)|\bbaj(ar|o|e)|rebaj|oferta|promo|pido|pedir|compro|comprar|surtir|ya no|proveedor|trae|caja|oxxo|tienda|walmart/)) return null;
    const cob = p.sem > 0 ? p.stock / p.sem : null, alc = cob == null ? '' : cob < 1 ? ' — te alcanza para menos de una semana' : ' — te alcanza ~' + Math.round(cob) + ' semanas';
    if (ok(/cuant(o|os|as)? (me )?(queda|quedan|tengo|hay|stock|existencia|piezas|pzas)|\btengo\b|\bhay\b|me queda|stock de|existencia|\bquedan?\b/)) return RA('stock', 'De ' + p.nombre + ' tienes ' + p.stock + ' pza' + (p.stock === 1 ? '' : 's') + alc + '. Vendes ~' + p.sem.toFixed(1) + ' por semana.' + (p.stock <= 0 && p.u28 >= 2 ? ' Está agotado y se vende: pídelo.' : ''), ['Ficha de ' + p.nombre, '¿Cuánto pido de ' + p.nombre + '?']);
    if (ok(/cuanto (me )?(cuesta|costo|pago|compro)|\bcosto\b|a cuanto (lo )?compro|a como (lo )?compro/) && !ok(/vendo|venta/)) return RA('costo', p.nombre + ': te cuesta ' + $m(p.costo) + ' y lo vendes en ' + $m(p.precio) + (p.margen != null ? ' (margen ' + Math.round(p.margen) + '%, ' + $m(p.gpp) + ' por pieza)' : '') + '.', ['Ficha de ' + p.nombre]);
    if (ok(/cuanto cuesta|cuanto vale|precio|a cuanto (lo )?vendo|a como (esta|lo vendo)/)) return RA('precio', p.nombre + ': lo vendes en ' + $m(p.precio) + ' y te cuesta ' + $m(p.costo) + (p.margen != null ? ' (margen ' + Math.round(p.margen) + '%)' : '') + (mem.precios[p.id] ? '. En tiendas está a ' + $m(mem.precios[p.id].v) : '') + '.', ['¿Subo el precio de ' + p.nombre + '?']);
    if (ok(/margen|cuanto (me )?(gano|deja|ganas)|ganancia (de|por|con)|cuanto gano/)) return RA('margen', p.nombre + ' te deja ' + $m(p.gpp) + ' por pieza' + (p.margen != null ? ' (margen ' + Math.round(p.margen) + '%)' : '') + '. En 4 semanas vendiste ' + p.u28 + ' pzas = ' + $m(p.gpp * p.u28) + ' de ganancia.', ['Ficha de ' + p.nombre]);
    return null;
  }
  function clienteResp(A, cli, s) {
    const ts = A.trAll.filter(t => (t.clienteNombre || 'Cliente General') === cli.nombre), CL = A.CL.filter(c => norm(c.nombre) === norm(cli.nombre))[0];
    const u = {}; ts.forEach(t => (t.items || []).forEach(i => { u[i.nombre] = (u[i.nombre] || 0) + (Number(i.cant) || 0); }));
    const top = Object.keys(u).sort((a, b) => u[b] - u[a]).slice(0, 3);
    if (/ultima vez|cuando (fue|compro)|hace cuanto|ultima compra/.test(s)) return RR(cli.nombre + ' compró por última vez ' + hace(cli.ult, A.now) + ' (' + new Date(cli.ult).toLocaleDateString('es-MX') + ').');
    if (/debe|deuda|adeud|fiado|credito/.test(s)) return RR(cli.debe > 0 ? cli.nombre + ' te debe ' + $m(cli.debe) + ' (desde hace ' + Math.floor((A.now - cli.desde) / D) + ' días).' : cli.nombre + ' no te debe nada. 👌');
    return RR(cli.nombre + ':\n• ' + cli.compras + ' compras por ' + $m(cli.total) + ' (ticket ~' + $m(cli.total / cli.compras) + ')\n• Última compra ' + hace(cli.ult, A.now) + (CL && CL.dias && CL.dias.length ? '\n• Lo visitas: ' + CL.dias.map(d => NOMD[d]).join(', ') : '') + '\n' + (cli.debe > 0 ? '• Te debe ' + $m(cli.debe) + ' (desde hace ' + Math.floor((A.now - cli.desde) / D) + ' días)' : '• No te debe nada') + (top.length ? '\n• Lo que más te compra: ' + top.join(', ') : '') + (ts.length >= 3 && A.now - cli.ult > 14 * D ? '\n👉 Hace tiempo que no compra: mándale mensaje.' : ''), []);
  }

  // --- manejadores de intenciones nuevas ---
  const H = {
    perdida(A) {
      const h = A.L.filter(r => r.costo > 0 && r.precio > 0 && r.precio < r.costo).sort((a, b) => (b.costo - b.precio) * b.u28 - (a.costo - a.precio) * a.u28);
      const m = A.L.filter(r => r.costo > 0 && r.precio >= r.costo && r.margen != null && r.margen < 5 && r.u28 > 0);
      if (!h.length) return RR('No vendes nada a pérdida ahora mismo. 👌' + (m.length ? ' Eso sí, estos casi no te dejan nada (menos de 5%): ' + m.slice(0, 4).map(r => r.nombre).join(', ') + '.' : ''), ['Menor margen']);
      return RR('Estos los vendes a pérdida:\n' + lista(h, r => r.nombre + ' — precio ' + $m(r.precio) + ' < costo ' + $m(r.costo) + ' (pierdes ' + $m(r.costo - r.precio) + ' por pieza' + (r.u28 ? ', ' + r.u28 + ' vendidas en 4 semanas' : '') + ')', 6) + '\nSube el precio o corrige el costo si está mal capturado.', ['¿Qué subo de precio?']);
    },
    datos_malos(A) {
      const neg = A.L.filter(r => r.stock < 0), c0 = A.L.filter(r => !(r.costo > 0)), p0 = A.L.filter(r => !(r.precio > 0)), mal = A.L.filter(r => r.costo > 0 && r.precio > 0 && r.precio < r.costo);
      const f = (arr, n) => arr.slice(0, n || 5).map(r => r.nombre).join(', ') + (arr.length > (n || 5) ? ' y ' + (arr.length - (n || 5)) + ' más' : '');
      const t = [];
      if (neg.length) t.push('Stock negativo (' + neg.length + '): ' + f(neg));
      if (c0.length) t.push('Costo en $0 (' + c0.length + '): ' + f(c0) + '. La app los cuenta como 100% de ganancia.');
      if (p0.length) t.push('Precio en $0 (' + p0.length + '): ' + f(p0));
      if (mal.length) t.push('Precio menor al costo (' + mal.length + '): ' + f(mal));
      return RR(t.length ? 'Esto conviene corregir:\n• ' + t.join('\n• ') : 'Tus datos se ven bien: sin stock negativo, sin costos ni precios en $0. 👌', ['¿Qué pido?']);
    },
    inventario(A) {
      const con = A.L.filter(r => r.stock > 0), vc = con.reduce((a, r) => a + r.stock * r.costo, 0), vp = con.reduce((a, r) => a + r.stock * r.precio, 0), pz = con.reduce((a, r) => a + r.stock, 0);
      return RR('Tu inventario: ' + A.L.length + ' productos, ' + con.length + ' con existencia, ' + pz + ' piezas.\n• A costo: ' + $m(vc) + '\n• A precio de venta: ' + $m(vp) + ' (ganancia potencial ' + $m(vp - vc) + ')', ['Productos parados', 'Productos agotados']);
    },
    ticket(A, s) {
      const per = periodo(s, A.now); if (per) return RR(resumenPeriodo(A, per), ['Ayer', 'Esta semana']);
      const n = A.tr.length, m = sumF(A.tr, 'monto'), dias = []; A.tr.forEach(t => { const k = new Date(Number(t.id)).toDateString(); if (dias.indexOf(k) < 0) dias.push(k); });
      return RR(n ? 'En 4 semanas: ' + n + ' ventas por ' + $m(m) + '.\n• Ticket promedio ' + $m(m / n) + '\n• ~' + (n / Math.max(1, dias.length)).toFixed(1) + ' ventas por día que trabajas' : 'Aún no tengo ventas para calcularlo.', ['¿Cómo voy hoy?']);
    },
    pronostico(A, s) {
      const dow = new Date(A.now).getDay(), prom = d => { const v = A.trAll.filter(t => new Date(Number(t.id)).getDay() === d && A.now - Number(t.id) <= 28 * D), dias = []; v.forEach(t => { const k = new Date(Number(t.id)).toDateString(); if (dias.indexOf(k) < 0) dias.push(k); }); return dias.length ? sumF(v, 'monto') / dias.length : 0; };
      if (A.trAll.length < 8) return RR('Todavía tengo pocas ventas para pronosticar. Con unas 8 o más ya te digo.');
      let t = '', ds = [];
      if (/manana/.test(s)) { const d = dow === 5 ? 1 : dow === 6 ? 1 : (dow + 1) % 7; return RR('El ' + (dow >= 5 || dow === 0 ? 'lunes' : 'mañana (' + NOMD[d] + ')') + ' normalmente vendes ~' + $m(prom(d >= 1 && d <= 5 ? d : 1)) + ' (promedio de tus últimos ' + NOMD[d >= 1 && d <= 5 ? d : 1] + 's).'); }
      if (/\bhoy\b/.test(s) && dow >= 1 && dow <= 5) return RR('Hoy ' + NOMD[dow] + ' normalmente vendes ~' + $m(prom(dow)) + '.');
      const lab = dow >= 1 && dow <= 5; for (let d = lab ? dow : 1; d <= 5; d++) ds.push(d);
      const tot = ds.reduce((a, d) => a + prom(d), 0);
      t = (lab ? 'Lo que resta de la semana (' + ds.map(d => NOMD[d]).join(', ') + ')' : 'La próxima semana') + ': ~' + $m(tot) + ' en ventas según tu promedio por día. Es un estimado, no una garantía.';
      return RR(t, ['¿Cómo voy hoy?']);
    },
    caro_barato(A, s) {
      const L = A.L.filter(r => r.precio > 0 && (r.stock > 0 || r.u28 > 0)), barato = /barato|economico/.test(s), o = L.slice().sort((a, b) => barato ? a.precio - b.precio : b.precio - a.precio);
      return RR(o.length ? 'Los productos más ' + (barato ? 'baratos' : 'caros') + ' que manejas:\n' + lista(o, r => r.nombre + ' — ' + $m(r.precio) + ' (costo ' + $m(r.costo) + ')', 5) : 'No encuentro productos con precio.', ['Más vendidos']);
    },
    lista_clientes(A, s) {
      const reg = A.CL.length, hoy = new Date(A.now).toDateString(), ch = {}; A.trAll.forEach(t => { if (new Date(Number(t.id)).toDateString() === hoy) ch[t.clienteNombre || 'Cliente General'] = 1; });
      const sem = {}; A.trAll.filter(t => A.now - Number(t.id) <= 7 * D).forEach(t => { sem[t.clienteNombre || 'Cliente General'] = 1; });
      if (/lista|cuales son/.test(s) && reg) return RR('Tus ' + reg + ' clientes registrados:\n' + lista(A.CL.slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre))), c => c.nombre + (Array.isArray(c.dias) && c.dias.length ? ' (' + c.dias.map(d => NOMD[d].slice(0, 3)).join('/') + ')' : ''), 15), ['Ruta de hoy']);
      return RR('Tienes ' + reg + ' clientes registrados. Hoy han comprado ' + Object.keys(ch).length + ' y en los últimos 7 días ' + Object.keys(sem).length + '.', ['Mejores clientes', 'Ruta de hoy']);
    },
    flete(A) {
      const comp = A.todas.filter(t => t.tipo === 'Gasto' && t.itemsCompra && A.now - Number(t.id) <= 28 * D).sort((a, b) => b.id - a.id), meta = Number(mem.fleteGratis) || 20000;
      if (!comp.length) return RR('No veo compras de mercancía con flete en las últimas 4 semanas. Tu meta para flete gratis es ' + $m(meta) + '.', ['¿Qué pido?']);
      const fl = comp.reduce((a, g) => a + (Number(g.fleteMonto) || 0), 0), sub = comp.reduce((a, g) => a + (Number(g.subtotal) || 0), 0), u = comp.filter(g => Number(g.fleteMonto) > 0)[0];
      return RR('En 4 semanas pagaste ' + $m(fl) + ' de flete (' + (sub ? (fl / sub * 100).toFixed(1) : 0) + '% de ' + $m(sub) + ' en compras).' + (u && Number(u.subtotal) < meta ? ' Tu pedido del ' + (u.fechaStr || 'último') + ' fue de ' + $m(u.subtotal) + ' y pagó ' + $m(u.fleteMonto) + '; con ' + $m(meta) + ' o más era gratis. Para bajar el flete arma pedidos de ' + $m(meta) + '+ con lo que sí rota.' : ' Tu meta para flete gratis es ' + $m(meta) + '.'), ['¿Qué pido?']);
    }
  };
  function aplicarAlias(s) {
    Object.keys(mem.alias || {}).sort((a, b) => b.length - a.length).forEach(a => { const p = (LS('yimi_productos') || []).filter(x => String(x.id) === String(mem.alias[a]))[0]; if (!p) return; const re = new RegExp('(^| )' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '( |$)'); if (re.test(s)) s = s.replace(re, ' ' + norm(p.nombre).split(' ').slice(0, 2).join(' ') + ' ').replace(/\s+/g, ' ').trim(); });
    return s;
  }
  const PER_RE = /\b(hoy|ayer|anteayer|antier|esta semana|la semana pasada|semana pasada|este mes|el mes pasado|mes pasado|lunes|martes|miercoles|jueves|viernes|sabado|domingo|ultimos? \d+ dias)\b/;
  const ATTR_Q = { stock: 'cuanto tengo de ', precio: 'cuanto cuesta ', costo: 'cuanto me cuesta ', margen: 'cuanto me deja ', pedir: 'cuanto pido de ', ficha: 'como va ' };
  function responder(q, viaChip) {
    const A = analizar(), raw = String(q || '');
    let s = limpiar(raw) || norm(raw).trim();
    const c0 = mem.ctx || {}, ctx = Date.now() - (c0.ts || 0) < 45 * 60 * 1000 ? c0 : {};
    OFF = 0;
    const fin = (r, i, x) => { x = x || {}; mem.ctx = { ts: Date.now(), i: i || null, pid: x.pid || null, cid: x.cid || null, attr: x.attr || null, q: x.q || s, step: LN, tot: LT, off: x.off || 0, pend: x.pend || null }; if (i && CHIP[i]) { mem.uso = mem.uso || {}; mem.uso[i] = (mem.uso[i] || 0) + 1; } save(); return r; };
    const base = (qq, i, x) => { const r = responderBase(qq, A); return fin(r, i, Object.assign({ q: qq }, x || {})); };
    if (/confirmo olvidar todo/.test(norm(raw))) return base('confirmo olvidar todo');
    // 0. nombre
    let m = s.match(/^(hola )?(me llamo|mi nombre es) ([a-z]{2,15})$/);
    if (m) { mem.nombre = cap(m[3]); save(); return fin(RR('Mucho gusto, ' + mem.nombre + ' 👋 Ya me lo aprendí. ¿Qué quieres revisar?', usoChips()), 'saludo'); }
    if (/\d{4,}/.test(s) && /flete|meta|minimo/.test(s) && /\b(es|ahora|cambio|son|de)\b|meta|minimo/.test(s) && !/\?/.test(raw)) { const r0 = responderBase(s, A); if (r0 && /meta para flete gratis ahora/.test(r0.t)) return fin(r0, 'ens', { q: s }); }
    // 1. enseñarle apodos de productos: "cuando diga papas me refiero a sabritas" / "a las sabritas les digo papas"
    m = s.match(/^(?:cuando (?:te )?(?:diga|digo|escriba|pregunte|ponga) )?(.{2,30}?) (?:me refiero a|quiero decir|es lo mismo que|se refiere a|significa) (.{2,40})$/);
    let ap = m ? { a: m[1], t: m[2] } : null;
    if (!ap) { m = s.match(/^(?:a |al |a la |a los |a las )?(.{2,40}?) (?:le digo|les digo|le llamo|les llamo|le decimos|les decimos|lo llamo|la llamo) (.{2,30})$/); if (m) ap = { a: m[2], t: m[1] }; }
    if (ap && !/\d/.test(ap.a) && ap.a.split(' ').length <= 3) {
      const cp = buscarProds(A, ap.t), pp = cp.length && (cp[0].s >= 3 || cp[0].s >= 1.5) ? cp[0].r : null;
      if (pp) { mem.alias[ap.a.trim()] = pp.id; save(); return fin(RR('Anotado: cuando me digas "' + ap.a + '" entiendo ' + pp.nombre + '.', ['Ficha de ' + pp.nombre]), 'alias', { pid: pp.id }); }
      return fin(RR('No encontré un producto parecido a "' + ap.t + '". Dime el nombre como lo tienes en tu inventario y lo aprendo.', CHIPS0.slice(0, 3)), 'alias');
    }
    // 2. corregirme: "me refería a ..."
    m = s.match(/^(?:no )?(?:me referia a|quise decir|queria decir|lo que queria era|me referia) (.+)$/);
    if (m) { const r = responder(m[1]); const i2 = intencion(corregir(limpiar(m[1]), A)).i; if (ctx.pend && i2) { mem.aprendidas[ctx.pend] = i2; save(); r.t += '\n\n(Aprendí que "' + ctx.pend + '" se refiere a eso.)'; } return r; }
    s = corregir(s, A); s = aplicarAlias(s);
    // 3. si venía de una pregunta que no entendí y ahora tocó una opción, lo aprendo
    if (viaChip && ctx.pend) { const i3 = intencion(s).i; if (i3) { mem.aprendidas[ctx.pend] = i3; const ks = Object.keys(mem.aprendidas); if (ks.length > 200) delete mem.aprendidas[ks[0]]; } }
    // 4. seguimientos
    if (ctx.i && /^(y )?(dame |dime |muestrame |ver |quiero ver )?(mas|otros|otras|siguientes?|los demas|el resto|mas productos|mas opciones|mas clientes)$/.test(s) && ctx.q) {
      OFF = (ctx.off || 0) + (ctx.step || 5);
      if (OFF >= (ctx.tot || 0)) { OFF = 0; return fin(RR('Ya no tengo más en esa lista. 👌', usoChips()), ctx.i, { q: ctx.q }); }
      const r = responderBase(ctx.q, A); const off = OFF; OFF = 0; return fin(r, ctx.i, { q: ctx.q, off, pid: ctx.pid });
    }
    if (/^(y )?(por ?que|porque|como (sacaste|calculaste|lo calculas|lo sacas|sale)|explica(me)? (eso|esto)|de donde sale( eso)?|en que te basas)( eso| esto)?$/.test(s)) return fin(explicar(s, ctx), ctx.i);
    let cand = buscarProds(A, s), p = cand.length && (cand[0].s >= 3 || (!esRank(s) && cand[0].s >= 1.5)) ? cand[0].r : null;
    const per = PER_RE.test(s);
    if (!p && ctx.pid && A.P[ctx.pid]) {
      const cp = A.P[ctx.pid], solo = s.split(' ').length <= 5;
      if (/\b(ese|esa|eso|este|esta)( producto| articulo)?\b|\bel mismo\b/.test(s) && !/cliente/.test(s)) { s = s.replace(/\b(ese|esa|eso|este|esta)( producto| articulo)?\b|\bel mismo\b/, norm(cp.nombre).split(' ').slice(0, 2).join(' ')); cand = buscarProds(A, s); p = cand.length ? cand[0].r : cp; }
      else if (solo && /^(y )?(el |la |de |su )?(margen|costo|precio|stock|existencia|ganancia|cuanto (me )?(queda|tengo|cuesta|deja|pido)|cuantos|cuantas)\b/.test(s)) p = cp;
      else if (solo && per && !intencion(s).via) p = cp;
    }
    if (p && ctx.attr && !ctx.pid && false) p = p;
    // 5. producto
    if (p) {
      const ens = /proveedor|en tiendas?|oxxo|walmart|super\b|bodega|competencia|\btrae|traen|vienen|\bcaja\b|meta de flete|ya hay|si hay|si tiene|ya no/.test(s);
      if (ens) return base(s, 'prod', { pid: p.id });
      let ss = s; if (cand.length === 0 || cand[0].r.id !== p.id) ss = s + ' ' + norm(p.nombre).split(' ').slice(0, 2).join(' ');
      const at = atributoProd(A, p, ss);
      if (at) return fin(at, 'prod', { pid: p.id, attr: at.attr });
      if (per && /\b(vend|ventas|como va|cuanto|dime)\b/.test(s)) return base(ss, 'prod', { pid: p.id, attr: 'ficha' });
      const r0 = base(ss, 'prod', { pid: p.id, attr: /\bpid|ped|compro|comprar/.test(s) ? 'pedir' : 'ficha' });
      return r0;
    }
    // 6. cliente
    const cli = buscarCliente(A, s);
    if (cli && !/mejores|top|todos|lista|cuantos|inactiv|se fueron|ruta/.test(s)) return fin(clienteResp(A, cli, s), 'cliente', { cid: cli.nombre });
    if (!cli && ctx.cid && /\b(el|ella|ese cliente|esa tienda|ese|esa)\b|^(y )?(cuanto|cuando)/.test(s) && /debe|deuda|ultima|cuando|compra|cuanto/.test(s) && s.split(' ').length <= 6) { const c2 = A.C.filter(c => c.nombre === ctx.cid)[0]; if (c2) return fin(clienteResp(A, c2, s), 'cliente', { cid: c2.nombre }); }
    // 6b. seguimiento por periodo: "y ayer?" / "esta semana"
    if (per && s.split(' ').length <= 4 && ctx.i) {
      if (ctx.i === 'gastos') return base('cuanto gaste ' + s, 'gastos');
      if (ctx.i === 'nomina') return base('nomina ' + s, 'nomina');
      if (ctx.i === 'ticket') return fin(H.ticket(A, s), 'ticket');
    }
    // 7. intención
    const it = intencion(s), i = it.i;
    if (i) {
      if (i === 'gracias') return fin(RR('¡De nada! 👌 Aquí sigo para lo que ocupes.', usoChips()), i);
      if (i === 'adios') return fin(RR('¡Hasta luego! Cuando quieras me preguntas qué cargar o qué pedir. 👋', []), i);
      if (i === 'saludo') { const g = responderBase('hola', A); if (mem.nombre) g.t = g.t.replace('Hola 👋', 'Hola ' + mem.nombre + ' 👋'); g.chips = usoChips(); return fin(g, i); }
      if (i === 'explica') return fin(explicar(s, ctx), i);
      if (H[i]) return fin(H[i](A, s), i);
      if (i === 'gastos') return base('cuanto gaste ' + s, i);
      if (i === 'nomina') return base(s + ' nomina', i);
      if (i === 'ventas') return base('resumen ' + s, i);
      if (CANON[i]) return base(CANON[i], i);
    }
    // 8. no entendí: lo intento con el cascarón viejo y si tampoco, sugiero lo más parecido y lo guardo
    const r = responderBase(s, A);
    if (r && /^Eso todavía no lo sé contestar/.test(r.t)) {
      const ch = (it.cerca ? [it.cerca] : []).concat(((parecido(s).top) || []).map(x => x.k)).filter((x, j, a) => a.indexOf(x) === j && CHIP[x]).slice(0, 3).map(k => CHIP[k]);
      r.chips = ch.length ? ch : usoChips().slice(0, 4);
      r.t = 'Eso todavía no lo sé contestar. Lo guardé para aprender' + (ch.length ? ': ¿quisiste decir alguna de estas? (si tocas una, aprendo que tu pregunta era eso)' : '. Mientras tanto prueba con estas:');
      return fin(r, null, { pend: s });
    }
    return fin(r, null, {});
  }

  // ---------- IA EN LINEA (Gemini / Groq) ----------
  function iaOn() { return !!((mem.ia && mem.ia.key) || mem.url) && navigator.onLine; }
  function iaPropia() { return !!(mem.ia && mem.ia.key); }
  const SYS = 'Eres el asistente del negocio DIGAR: venta de abarrotes/mercancía en ruta a tiendas y clientes comerciales en México. ' +
    'Hablas español de México, claro y directo, como un buen socio que revisa los números. ' +
    'Te paso los datos reales del negocio (ventas, inventario, clientes, deudas, gastos). Usa SOLO esos datos: piensa y calcula paso a paso antes de contestar, revisa los números y da cifras concretas (pesos, piezas, fechas). ' +
    'Si algo no está en los datos, dilo y di qué dato faltaría; nunca inventes cifras. Si te piden una recomendación, da una decisión concreta y por qué. ' +
    'Respuesta corta (máximo ~10 líneas), en texto plano sin markdown (sin asteriscos ni #), con saltos de línea y algún emoji ocasional.';
  function contextoIA(A) {
    const L = [], f = n => Math.round((Number(n) || 0) * 100) / 100;
    const ahora = new Date(A.now);
    L.push('FECHA: ' + ahora.toLocaleString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }));
    L.push('Llevo ' + A.trAll.length + ' ventas registradas en total; abajo van los últimos 28 días.');
    L.push('\nRESUMEN POR PERIODO:');
    ['hoy', 'ayer', 'esta semana', 'semana pasada', 'este mes', 'mes pasado'].forEach(n => { const p = periodo(n, A.now); if (p) L.push('- ' + resumenPeriodo(A, p).split('\n')[0]); });
    const dias = {};
    A.tr.forEach(t => { const d = new Date(Number(t.id)), k = d.toLocaleDateString('es-MX') + ' ' + NOMD[d.getDay()].slice(0, 3); const x = dias[k] || (dias[k] = { n: 0, m: 0, g: 0 }); x.n++; x.m += Number(t.monto) || 0; x.g += Number(t.ganancia) || 0; });
    L.push('\nVENTAS POR DÍA (ventas | monto | ganancia):');
    Object.keys(dias).forEach(k => L.push(k + ' | ' + dias[k].n + ' | $' + f(dias[k].m) + ' | $' + f(dias[k].g)));
    L.push('\nPRODUCTOS (nombre | stock | precio | costo | vendidas 7d | vendidas 28d | última venta | precio en otras tiendas):');
    const prods = A.L.filter(r => r.u28 > 0 || r.stock > 0).sort((a, b) => b.u28 - a.u28 || b.stock - a.stock).slice(0, 130);
    prods.forEach(r => { const po = mem.precios[r.id]; L.push(r.nombre + ' | ' + r.stock + ' | $' + f(r.precio) + ' | $' + f(r.costo) + ' | ' + r.u7 + ' | ' + r.u28 + ' | ' + (r.ult ? hace(r.ult, A.now) : 'nunca') + (po ? ' | otras tiendas $' + f(po.v) : '') + (r.caja ? ' | caja de ' + r.caja : '')); });
    if (A.L.length > prods.length) L.push('(+' + (A.L.length - prods.length) + ' productos sin stock y sin ventas en 28 días)');
    const cl = {}; (A.CL || []).forEach(c => { cl[norm(c.nombre)] = c; });
    const C = A.C.slice().sort((a, b) => (b.debe - a.debe) || (b.total - a.total));
    L.push('\nCLIENTES (nombre | compras | total comprado | última compra | debe | días de visita):');
    C.filter((c, i) => i < 40 || c.debe > 0).slice(0, 70).forEach(c => { const x = cl[norm(c.nombre)]; L.push(c.nombre + ' | ' + c.compras + ' | $' + f(c.total) + ' | ' + hace(c.ult, A.now) + ' | ' + (c.debe > 0 ? '$' + f(c.debe) + ' desde ' + hace(c.desde, A.now) : '$0') + ' | ' + ((x && x.dias || []).map(n => NOMD[n]).join(',') || 'sin día') + (x && x.frecuencia === 'quincenal' ? ' (cada 15 días)' : '')); });
    const otras = (A.todas || []).filter(t => t.tipo && t.tipo !== 'Venta' && A.now - Number(t.id) <= 28 * D);
    if (otras.length) {
      L.push('\nOTROS MOVIMIENTOS 28 DÍAS (gastos, pagos, etc.; fecha | tipo | monto | detalle):');
      otras.sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 40).forEach(t => L.push(new Date(Number(t.id)).toLocaleDateString('es-MX') + ' | ' + t.tipo + ' | $' + f(t.monto) + ' | ' + (t.concepto || t.descripcion || t.categoria || t.nota || t.clienteNombre || '')));
    }
    return L.join('\n');
  }
  async function preguntarIA(q, simple) {
    const ia = mem.ia || {};
    const seg = new AbortController(), to = setTimeout(() => seg.abort(), 30000);
    try {
      if (!iaPropia()) { // modo antiguo: endpoint propio (mem.url)
        const A = analizar();
        const top = A.orden.slice(0, 15).map(r => r.nombre + ': ' + r.u28 + ' pzas, stock ' + r.stock + ', margen ' + (r.margen != null ? Math.round(r.margen) + '%' : '?')).join('; ');
        const r = await fetch(mem.url, { method: 'POST', signal: seg.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pregunta: q, resumen: resumenPeriodo(A, periodo('hoy', A.now)) + '\nTop: ' + top, precios_otras_tiendas: mem.precios }) });
        const j = await r.json();
        return j.respuesta || 'No recibí respuesta de la IA en línea.';
      }
      const ctx = simple ? '' : contextoIA(analizar());
      const hist = simple ? [] : mem.chat.filter(m => m.t && m.t !== 'Pensando…').slice(-7, -1).map(m => ({ role: m.r === 'yo' ? 'user' : 'assistant', t: String(m.t).slice(0, 700) }));
      while (hist.length && hist[0].role !== 'user') hist.shift();
      const pregunta = (ctx ? 'DATOS DEL NEGOCIO:\n' + ctx + '\n\nPREGUNTA DEL DUEÑO: ' : '') + q;
      let url, init, leer;
      if (ia.prov === 'gemini') {
        const modelo = ia.modelo || 'gemini-flash-latest';
        url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent?key=' + encodeURIComponent(ia.key);
        const contents = hist.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.t }] })).concat([{ role: 'user', parts: [{ text: pregunta }] }]);
        init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: SYS }] }, contents, generationConfig: { temperature: 0.3, maxOutputTokens: 2048 } }) };
        leer = j => { const c = j.candidates && j.candidates[0]; const t = c && c.content && c.content.parts ? c.content.parts.map(x => x.text || '').join('').trim() : ''; return t || (j.promptFeedback && j.promptFeedback.blockReason ? 'La IA bloqueó la pregunta (' + j.promptFeedback.blockReason + ').' : (c && c.finishReason ? 'La IA no devolvió texto (' + c.finishReason + ').' : '')); };
      } else {
        url = 'https://api.groq.com/openai/v1/chat/completions';
        const messages = [{ role: 'system', content: SYS }].concat(hist.map(m => ({ role: m.role, content: m.t })), [{ role: 'user', content: pregunta }]);
        init = { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ia.key }, body: JSON.stringify({ model: ia.modelo || 'llama-3.3-70b-versatile', messages, temperature: 0.3, max_tokens: 1200 }) };
        leer = j => ((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
      }
      init.signal = seg.signal;
      const r = await fetch(url, init);
      let j = null; try { j = await r.json(); } catch (e) {}
      if (!r.ok) {
        const det = (j && ((j.error && (j.error.message || j.error)) || j.message)) || '';
        const pista = r.status === 400 || r.status === 401 || r.status === 403 ? ' Revisa que la clave esté bien copiada y sea de ' + (ia.prov === 'gemini' ? 'Gemini (Google AI Studio)' : 'Groq') + '.' : r.status === 429 ? ' Llegaste al límite gratis por minuto/día; espera un poco.' : r.status === 413 ? ' Son muchos datos para el plan gratis; intenta de nuevo en un minuto.' : '';
        return 'La IA respondió con error ' + r.status + '.' + pista + (det ? '\n\nDetalle: ' + String(det).slice(0, 220) : '');
      }
      return (j && leer(j)) || 'La IA no me devolvió respuesta. Intenta de nuevo.';
    } catch (e) {
      return e && e.name === 'AbortError' ? 'La IA tardó más de 30 segundos y la corté. Intenta de nuevo.' : 'No pude conectar con la IA en línea (' + ((e && e.message) || 'sin detalle') + '). Revisa tu internet.';
    } finally { clearTimeout(to); }
  }
  let SIN_IA = false;

  window.__asistenteDigar = { analizar, insights, responder, entender: s => intencion(corregir(limpiar(s), analizar())), _ent: ENT, informe, plan, pedido, ruta, reporte, kpis, calibrar, _mem: () => mem, _ctx: () => contextoIA(analizar()), version: VER };
  if (typeof document === 'undefined') return;

  // ---------- INTERFAZ ----------
  const css = document.createElement('style');
  css.textContent = '#ia-fab{position:fixed;right:14px;bottom:92px;z-index:60;width:46px;height:46px;border-radius:50%;background:#1456F0;color:#fff;font-size:22px;border:none;box-shadow:0 4px 14px rgba(0,0,0,.3)}#ia-p{position:fixed;top:0;bottom:0;left:0;right:0;max-width:28rem;margin:0 auto;z-index:200;background:#f3f4f6;display:none;flex-direction:column}#ia-p.on{display:flex}.ia-h{background:#0B1B3F;color:#fff;padding:calc(12px + env(safe-area-inset-top,0px)) 14px 12px;display:flex;justify-content:space-between;align-items:center;font-weight:800}.ia-h button{background:none;border:none;color:#fff;font-size:22px;padding:0 4px}.ia-t{display:flex;background:#fff;border-bottom:1px solid #e5e7eb}.ia-t button{flex:1;padding:10px;font-weight:700;font-size:13px;background:none;border:none;color:#6b7280;border-bottom:3px solid transparent}.ia-t button.a{color:#1456F0;border-bottom-color:#1456F0}#ia-b{flex:1;overflow-y:auto;padding:12px;overscroll-behavior:contain}.ia-c{background:#fff;border-radius:14px;padding:12px;margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,.08)}.ia-c b{display:block;font-size:14px;margin-bottom:4px}.ia-c p{font-size:13px;color:#374151;margin:0 0 8px;white-space:pre-line}.ia-r{display:flex;gap:8px;flex-wrap:wrap}.ia-r button{padding:7px 12px;border-radius:10px;font-size:12px;font-weight:700;border:1px solid #d1d5db;background:#f9fafb}.ia-r .ok{background:#1456F0;color:#fff;border-color:#1456F0}.ia-r input{width:90px;padding:7px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;text-align:center}.ia-m{max-width:88%;padding:9px 12px;border-radius:14px;margin-bottom:8px;font-size:13px;white-space:pre-wrap}.ia-m.yo{background:#1456F0;color:#fff;margin-left:auto}.ia-m.ia{background:#fff;color:#111}.ia-ch{display:flex;gap:6px;flex-wrap:wrap;margin:2px 0 10px}.ia-ch button{padding:6px 11px;border-radius:999px;font-size:12px;font-weight:700;border:1px solid #c7d2fe;background:#eef2ff;color:#3730a3}#ia-in{display:none;padding:8px 8px calc(8px + env(safe-area-inset-bottom,0px));background:#fff;border-top:1px solid #e5e7eb;gap:8px}#ia-in.on{display:flex}#ia-in input{flex:1;padding:11px;border:1px solid #d1d5db;border-radius:12px;font-size:16px}#ia-in button{padding:0 16px;background:#1456F0;color:#fff;border:none;border-radius:12px;font-weight:700}.ia-f{font-size:11px;color:#6b7280;text-align:center;margin:6px 0}.ia-k{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}.ia-k div{background:#fff;border-radius:14px;padding:10px 12px;box-shadow:0 1px 3px rgba(0,0,0,.08)}.ia-k small{display:block;font-size:11px;color:#6b7280;font-weight:600}.ia-k strong{display:block;font-size:19px;color:#0B1B3F;margin-top:2px}.ia-k em{font-style:normal;font-size:11px;font-weight:700}.ia-bar{display:flex;align-items:flex-end;gap:3px;height:74px;margin-top:6px}.ia-bar div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;font-size:9px;color:#9ca3af}.ia-bar i{display:block;width:100%;background:#1456F0;border-radius:3px 3px 0 0;min-height:2px}';
  document.head.appendChild(css);
  const pan = document.createElement('div');
  pan.id = 'ia-p';
  pan.innerHTML = '<div class="ia-h"><span>🧠 Asistente DIGAR</span><button data-a="cerrar">✕</button></div><div class="ia-t"><button class="a" data-a="tab-i">Informe</button><button data-a="tab-s">Sugerencias</button><button data-a="tab-c">Chat</button></div><div id="ia-b"></div><div id="ia-in"><input id="ia-q" placeholder="Pregúntame o enséñame algo…" autocomplete="off"><button data-a="enviar">Enviar</button></div>';
  document.body.appendChild(pan);
  let tab = 'i', cache = [], fab = null;
  const B = () => pan.querySelector('#ia-b');

  function actualizarFab() {
    if (mem.fab && !fab) { fab = document.createElement('button'); fab.id = 'ia-fab'; fab.textContent = '🧠'; fab.addEventListener('click', abrir); document.body.appendChild(fab); }
    if (!mem.fab && fab) { fab.remove(); fab = null; }
    if (fab) fab.style.display = pan.classList.contains('on') ? 'none' : '';
  }
  function badge() {
    try { const A = analizar(); calibrar(A); cache = insights(A); } catch (e) { cache = []; }
    const n = cache.length, s = document.getElementById('asistente-sub');
    if (s) s.textContent = n ? n + (n === 1 ? ' aviso' : ' avisos') + ' >' : 'Todo en orden >';
    return n;
  }
  const cerrarCapa = () => { cerrar(true); };
  function abrir() {
    pan.classList.add('on'); ponTab('i'); actualizarFab();
    (window.__capas = window.__capas || []).push(cerrarCapa);
  }
  function cerrar(desdeGesto) {
    pan.classList.remove('on');
    if (!desdeGesto && window.__capas) { const i = window.__capas.lastIndexOf(cerrarCapa); if (i >= 0) window.__capas.splice(i, 1); }
    badge(); actualizarFab();
  }
  window.abrirAsistente = abrir;
  window.__asistenteDigar.abrir = abrir;

  function pintarS() {
    badge();
    const A = analizar();
    let h = cache.map(i => {
      let acc;
      if (i.preg && (i.preg.tipo === 'precio' || i.preg.tipo === 'caja')) acc = '<input type="number" inputmode="decimal" step="' + (i.preg.tipo === 'caja' ? '1' : '0.5') + '" placeholder="' + (i.preg.tipo === 'caja' ? 'pzas' : '$') + '" data-i="' + esc(i.key) + '"><button class="ok" data-a="' + i.preg.tipo + '" data-k="' + esc(i.key) + '" data-id="' + esc(i.preg.id) + '">Guardar</button><button data-a="skip" data-k="' + esc(i.key) + '">No sé</button>';
      else if (i.preg && i.preg.tipo === 'hay') acc = '<button class="ok" data-a="hay-si" data-k="' + esc(i.key) + '" data-id="' + esc(i.preg.id) + '">Sí hay</button><button data-a="hay-no" data-k="' + esc(i.key) + '" data-id="' + esc(i.preg.id) + '">No hay</button>';
      else acc = '<button class="ok" data-a="hecho" data-k="' + esc(i.key) + '">✅ Ya lo hice</button><button data-a="skip" data-k="' + esc(i.key) + '">No me sirve</button>';
      return '<div class="ia-c"><b>' + i.ico + ' ' + esc(i.tit) + '</b><p>' + esc(i.txt) + '</p><div class="ia-r">' + acc + '</div></div>';
    }).join('');
    if (!h) h = '<div class="ia-c"><b>✨ Todo en orden</b><p>No veo nada urgente por ahora. Sigue vendiendo y vuelvo con más ideas.</p></div>';
    h += '<div class="ia-f">Llevo ' + A.trAll.length + ' ventas, ' + Object.keys(mem.precios).length + ' precios de otras tiendas, ' + Object.keys(mem.cajas).length + ' cajas y ' + mem.hechas + ' consejos que ya aplicaste. Aprendo con cada venta y cada respuesta tuya.</div>';
    B().innerHTML = h;
  }
  function pintarI() {
    const A = analizar(), R = informe(A), K = kpis(A), bars = barras(A), mx = Math.max.apply(null, bars.map(b => b.m).concat([1]));
    mem.visto = hoyStr(); save(); badge();
    const flecha = K.dv == null ? '' : '<em style="color:' + (K.dv >= 0 ? '#059669' : '#dc2626') + '">' + (K.dv >= 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(K.dv)) + '% vs semana ant.</em>';
    let h = '<div class="ia-f" style="text-align:left;font-size:12px">' + cap(new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })) + '</div>';
    h += '<div class="ia-k"><div><small>Hoy</small><strong>' + $m(K.hoyM) + '</strong><em style="color:#6b7280">' + K.hoyN + ' ventas · gana ' + $m(K.hoyG) + '</em></div><div><small>Últimos 7 días</small><strong>' + $m(K.s7M) + '</strong>' + flecha + '</div><div><small>Margen real 7 días</small><strong>' + (K.mg != null ? Math.round(K.mg) + '%' : '—') + '</strong><em style="color:#6b7280">sin contar costo $0</em></div><div><small>Por cobrar</small><strong>' + $m(K.debe) + '</strong><em style="color:#6b7280">créditos abiertos</em></div></div>';
    h += '<div class="ia-c"><b>Ventas por día (14 días)</b><div class="ia-bar">' + bars.map(b => '<div title="' + $m(b.m) + '"><i style="height:' + Math.max(2, Math.round(b.m / mx * 56)) + 'px;opacity:' + (b.m ? 1 : .25) + '"></i>' + 'DLMMJVS'.charAt(b.d) + '</div>').join('') + '</div></div>';
    h += R.sec.map(x => '<div class="ia-c"><b>' + x.ico + ' ' + esc(x.tit) + '</b><p>' + esc(x.txt) + '</p></div>').join('');
    if (mem.sinEntender.length) h += '<div class="ia-c"><b>❓ Tengo ' + mem.sinEntender.length + ' pregunta(s) que no supe contestar</b><p>Genera el reporte y súbelo a Claude para enseñarme a contestarlas.</p></div>';
    h += '<div class="ia-r"><button class="ok" data-a="reporte">📄 Generar reporte (descargar)</button><button data-a="copiar">📋 Copiar para Claude</button></div>';
    { const ia = mem.ia || {}, st = 'width:100%;box-sizing:border-box;padding:9px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;margin-bottom:8px;background:#fff';
      h += '<div class="ia-c"><b>🤖 IA en línea (Gemini / Groq)</b><p>' + (ia.key ? '✅ Activa con ' + (ia.prov === 'gemini' ? 'Gemini' : 'Groq') + '. ' + ((ia.modo || 'siempre') === 'dudas' ? 'Solo la uso cuando mis reglas no entienden.' : 'Todo lo que escribes en el Chat lo piensa la IA con tus datos (ventas, inventario, clientes, deudas). Los botones de sugerencia siguen usando mis reglas.') : 'Pega una clave gratis y el Chat podrá pensar, revisar y calcular con tus datos en vez de solo reglas. La clave se queda únicamente en este teléfono.') + '</p>' +
        '<select id="ia-prov" style="' + st + '"><option value="groq"' + (ia.prov !== 'gemini' ? ' selected' : '') + '>Groq (llama 3.3, gratis)</option><option value="gemini"' + (ia.prov === 'gemini' ? ' selected' : '') + '>Gemini (Google, gratis)</option></select>' +
        '<input id="ia-key" type="password" autocomplete="off" placeholder="' + (ia.key ? 'Clave guardada · pega otra para cambiarla' : 'Pega tu clave aquí') + '" style="' + st + '">' +
        '<div class="ia-r"><button class="ok" data-a="ia-guardar">Guardar</button>' + (ia.key ? '<button data-a="ia-probar">Probar</button><button data-a="ia-modo">' + ((ia.modo || 'siempre') === 'dudas' ? 'Usar IA siempre' : 'Solo cuando no entiendas') + '</button><button data-a="ia-quitar">Quitar</button>' : '') + '</div>' +
        '<p style="font-size:11px;color:#6b7280;margin:8px 0 0">Al preguntar se envían tus datos de ventas, inventario y clientes a ' + (ia.prov === 'gemini' ? 'Google' : 'Groq') + ' para que pueda contestar. Claves gratis: aistudio.google.com (Gemini) o console.groq.com (Groq).</p></div>'; }
    h += '<div class="ia-f">Se recalcula con tus ventas cada vez que lo abres. · ' + VER + '</div><div class="ia-r" style="justify-content:center"><button data-a="fab">' + (mem.fab ? 'Ocultar' : 'Mostrar') + ' botón flotante 🧠</button></div>';
    B().innerHTML = h;
  }
  function copiar() {
    const t = reporte(analizar());
    const ok = () => alert('Resumen copiado. Pégalo en tu chat con Claude.');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, () => prompt('Copia este texto:', t)); else prompt('Copia este texto:', t);
  }
  function pintarC() {
    const msgs = mem.chat.length ? mem.chat : [{ r: 'ia', t: 'Hola 👋 Soy tu asistente. Pregúntame lo que quieras de tu negocio o enséñame cosas (precios de tiendas, piezas por caja).', chips: usoChips() }];
    let h = msgs.map(m => '<div class="ia-m ' + m.r + '">' + esc(m.t) + '</div>').join('');
    const last = msgs[msgs.length - 1];
    if (last && last.r === 'ia' && last.chips && last.chips.length) h += '<div class="ia-ch">' + last.chips.map(c => '<button data-a="chip" data-q="' + esc(c) + '">' + esc(c) + '</button>').join('') + '</div>';
    B().innerHTML = h;
    B().scrollTop = B().scrollHeight;
  }
  function ponTab(t) {
    tab = t;
    pan.querySelectorAll('.ia-t button').forEach(b => b.classList.toggle('a', b.dataset.a === 'tab-' + t));
    pan.querySelector('#ia-in').classList.toggle('on', t === 'c');
    t === 'i' ? pintarI() : t === 's' ? pintarS() : pintarC();
  }
  async function enviar(texto) {
    const inp = pan.querySelector('#ia-q'), q = (texto || inp.value).trim();
    if (!q) return;
    inp.value = '';
    mem.chat.push({ r: 'yo', t: q });
    const directa = !texto && iaPropia() && navigator.onLine && (mem.ia.modo || 'siempre') === 'siempre';
    let r = directa ? null : responder(q, !!texto);
    if (r === null) {
      mem.chat.push({ r: 'ia', t: 'Pensando…' }); pintarC();
      const t = await preguntarIA(q); mem.chat.pop(); r = { t, chips: [] };
      if (/^(La IA respondió con error|No pude conectar|La IA tardó|La IA no )/.test(t)) { // si falla la IA, que al menos contesten las reglas
        SIN_IA = true; let r2 = null; try { r2 = responder(q, !!texto); } catch (e) {} SIN_IA = false;
        if (r2) r = { t: t + '\n\nMientras tanto, con mis reglas:\n' + r2.t, chips: r2.chips || [] };
      }
    }
    if (r.t.indexOf('Eso todavía no lo sé contestar') !== 0) { const kq2 = norm(q); mem.sinEntender = mem.sinEntender.filter(x => norm(x.q) !== kq2); }
    mem.chat.push({ r: 'ia', t: r.t, chips: r.chips }); mem.chat = mem.chat.slice(-40); save(); pintarC();
  }
  const fb = (k, campo) => { const t = k.split(':')[0]; mem.fb[t] = mem.fb[t] || { ok: 0, no: 0 }; mem.fb[t][campo]++; };
  pan.addEventListener('click', e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a, k = b.dataset.k, id = b.dataset.id;
    if (a === 'cerrar') return cerrar();
    if (a === 'tab-i') return ponTab('i');
    if (a === 'tab-s') return ponTab('s');
    if (a === 'tab-c') return ponTab('c');
    if (a === 'copiar') return copiar();
    if (a === 'reporte') { descargarReporte(); return; }
    if (a === 'enviar') return enviar();
    if (a === 'chip') return enviar(b.dataset.q);
    if (a === 'ia-guardar') { const k = (pan.querySelector('#ia-key').value || '').trim(), pv = pan.querySelector('#ia-prov').value; if (!k && !(mem.ia && mem.ia.key)) return alert('Pega primero tu clave.'); mem.ia = Object.assign({ modo: 'siempre' }, mem.ia || {}, { prov: pv }); if (k) { mem.ia.key = k; delete mem.ia.modelo; } save(); return pintarI(); }
    if (a === 'ia-quitar') { delete mem.ia; save(); return pintarI(); }
    if (a === 'ia-modo') { if (mem.ia) { mem.ia.modo = (mem.ia.modo || 'siempre') === 'siempre' ? 'dudas' : 'siempre'; save(); } return pintarI(); }
    if (a === 'ia-probar') { b.disabled = true; b.textContent = 'Probando…'; preguntarIA('Responde solo con la palabra OK', true).then(t => { b.disabled = false; b.textContent = 'Probar'; alert(/^OK/i.test(t.trim()) ? '✅ La IA responde bien.' : t); }); return; }
    if (a === 'fab') { mem.fab = !mem.fab; save(); actualizarFab(); return pintarI(); }
    if (a === 'hecho') { mem.hechas++; mem.desc[k] = Date.now(); fb(k, 'ok'); }
    if (a === 'skip') { mem.desc[k] = Date.now(); const it = cache.filter(x => x.key === k)[0]; if (it && !it.preg) { mem.noSirve[k] = { tit: it.tit, ts: Date.now() }; fb(k, 'no'); } }
    if (a === 'precio' || a === 'caja') {
      const v = parseFloat(pan.querySelector('input[data-i="' + k + '"]').value); if (!(v > 0)) return;
      if (a === 'precio') mem.precios[id] = { v, ts: Date.now() }; else mem.cajas[id] = Math.round(v);
      mem.desc[k] = Date.now();
    }
    if (a === 'hay-si') { mem.resp['hay:' + id] = { v: 'si', ts: Date.now() }; mem.desc[k] = Date.now(); }
    if (a === 'hay-no') { mem.resp['hay:' + id] = { v: 'no', ts: Date.now() }; mem.desc[k] = Date.now(); }
    save(); pintarS();
  });
  pan.querySelector('#ia-q').addEventListener('keydown', e => { if (e.key === 'Enter') enviar(); });
  actualizarFab();
  setTimeout(badge, 1500);
  setInterval(() => { if (!document.hidden) badge(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) badge(); });
})();
