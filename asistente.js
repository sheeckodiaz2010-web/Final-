/* Asistente DIGAR v3 - modulo independiente. Lee los datos del POS desde localStorage (yimi_*).
   Se activa con: <script src="asistente.js"></script> antes de </body>.
   Se abre con abrirAsistente() (opcion "Asistente" en Configuraciones). No es IA generativa:
   son reglas sobre tus datos que aprenden de tus ventas y de lo que le respondes. Gratis y sin limites. */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.__asistenteDigar) return;
  const VER = 'v3 2026-10-22';
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
  const lista = (arr, f, n) => arr.slice(0, n || 5).map((x, i) => (i + 1) + '. ' + f(x)).join('\n');
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
        else if (w.length >= 5 && nt.some(x => x.length >= 4 && lev(w, x) <= (w.length >= 8 ? 2 : 1))) s += 1.5;
      });
      return { r, s };
    }).filter(x => x.s > 0).sort((a, b) => b.s - a.s || b.r.u28 - a.r.u28);
  }
  function buscarCliente(A, q) {
    const ws = TOK(q).filter(w => w.length > 2 && !STOP.test(w));
    let best = null, bs = 0;
    A.C.forEach(c => { if (c.nombre === 'Cliente General') return; const nt = TOK(c.nombre); let s = 0; ws.forEach(w => { if (nt.indexOf(w) >= 0) s += 3; else if (w.length >= 4 && nt.some(x => lev(w, x) <= 1)) s += 1.5; }); if (s > bs) { bs = s; best = c; } });
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
  const CHIPS0 = ['¿Qué cargo hoy?', '¿Qué pido?', '¿Cómo voy hoy?', '¿Quién me debe?', '¿Qué subo de precio?', 'Ruta de hoy', 'Más vendidos', 'Menor margen'];
  function responder(q) {
    const A = analizar(), n = norm(q).trim(), ins = insights(A);
    const nums = n.match(/\d+(?:[.,]\d+)?/g) || [], num = nums.length ? parseFloat(nums[nums.length - 1].replace(',', '.')) : null;
    const R = (t, chips) => ({ t, chips: chips || [] });
    const RANK = /agotad|sin stock|se acab|por acabar|poco stock|quedan pocos|parado|sobra|exceso|no compres|sobrante|inmovil|no se mueve|no se vende|muert|estanc|lento|menos (se )?(vend|mueve)|(vende|mueve)n? menos|mas vendid|mas se (vende|mueve)|top|estrella|popular|(vende|mueve)n? mas|margen|rentab|gano mas|deja mas|me deja/.test(n);
    const cand = buscarProds(A, q), p = cand.length && (cand[0].s >= 3 || (!RANK && cand[0].s >= 1.5)) ? cand[0].r : null;
    const otros = cand.filter(x => p && x.r.id !== p.id && x.s >= cand[0].s * 0.8).slice(0, 2);

    // --- enseñar ---
    if (p && num != null && /tienda|cuesta|cuestan|cobran|venden|mercado|super|oxxo|walmart|competencia|bodega/.test(n) && !/caja/.test(n)) {
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
    if (/confirmo olvidar todo/.test(n)) { mem.precios = {}; mem.cajas = {}; mem.resp = {}; mem.cal = {}; mem.fb = {}; mem.noSirve = {}; mem.desc = {}; mem.pred = []; delete mem.fleteGratis; save(); return R('Listo, olvidé todo lo aprendido. Empiezo de cero con tus ventas.'); }
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

    if (mem.url && navigator.onLine) return null; // lo contesta la IA en linea
    // --- no entendi: sugiero lo mas parecido y lo guardo para aprender ---
    const KW = { ventas: 'Cómo voy hoy', margen: 'Menor margen', pedido: '¿Qué pido?', flete: '¿Qué pido?', deuda: '¿Quién me debe?', clientes: 'Mejores clientes', agotados: 'Productos agotados', reporte: 'Generar reporte', ruta: 'Ruta de hoy', plan: '¿Qué cargo hoy?', precio: '¿Qué subo de precio?', combos: 'Combos', ganancia: 'Cómo voy hoy', parados: 'Productos parados' };
    const sug = []; TOK(q).forEach(w => { if (w.length < 4) return; Object.keys(KW).forEach(k => { if (lev(w, k) <= (k.length >= 7 ? 2 : 1) && sug.indexOf(KW[k]) < 0) sug.push(KW[k]); }); });
    const kq = norm(q), ex = mem.sinEntender.filter(x => norm(x.q) === kq)[0];
    if (ex) { ex.n = (ex.n || 1) + 1; ex.ts = Date.now(); } else mem.sinEntender.push({ q, ts: Date.now(), n: 1 });
    mem.sinEntender = mem.sinEntender.slice(-100); save();
    return R('Eso todavía no lo sé contestar. Lo guardé: en "Informe" toca "Generar reporte", súbelo a Claude y lo mejoramos.' + (sug.length ? ' ¿Quisiste decir alguna de estas?' : ' Mientras tanto prueba con estas:'), sug.length ? sug.slice(0, 4) : CHIPS0.slice(0, 4));
  }
  async function preguntarIA(q) {
    try {
      const A = analizar();
      const top = A.orden.slice(0, 15).map(r => r.nombre + ': ' + r.u28 + ' pzas, stock ' + r.stock + ', margen ' + (r.margen != null ? Math.round(r.margen) + '%' : '?')).join('; ');
      const r = await fetch(mem.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pregunta: q, resumen: resumenPeriodo(A, periodo('hoy', A.now)) + '\nTop: ' + top, precios_otras_tiendas: mem.precios }) });
      const j = await r.json();
      return j.respuesta || 'No recibí respuesta de la IA en línea.';
    } catch (e) { return 'No pude conectar con la IA en línea. Revisa tu wifi.'; }
  }

  window.__asistenteDigar = { analizar, insights, responder, informe, plan, pedido, ruta, reporte, kpis, calibrar, _mem: () => mem, version: VER };
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
    h += '<div class="ia-f">Se recalcula con tus ventas cada vez que lo abres. · ' + VER + '</div><div class="ia-r" style="justify-content:center"><button data-a="fab">' + (mem.fab ? 'Ocultar' : 'Mostrar') + ' botón flotante 🧠</button></div>';
    B().innerHTML = h;
  }
  function copiar() {
    const t = reporte(analizar());
    const ok = () => alert('Resumen copiado. Pégalo en tu chat con Claude.');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, () => prompt('Copia este texto:', t)); else prompt('Copia este texto:', t);
  }
  function pintarC() {
    const msgs = mem.chat.length ? mem.chat : [{ r: 'ia', t: 'Hola 👋 Soy tu asistente. Pregúntame lo que quieras de tu negocio o enséñame cosas (precios de tiendas, piezas por caja).', chips: CHIPS0 }];
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
    let r = responder(q);
    if (r === null) { mem.chat.push({ r: 'ia', t: 'Pensando…' }); pintarC(); const t = await preguntarIA(q); mem.chat.pop(); r = { t, chips: [] }; }
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
