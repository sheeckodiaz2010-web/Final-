/* Asistente DIGAR - modulo independiente. Lee los datos del POS desde localStorage.
   Se activa con: <script src="asistente.js"></script> antes de </body> */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.__asistenteDigar) return;
  const D = 864e5, MEMK = 'yimi_ia_mem';
  const LS = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const esc = s => (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $m = n => '$' + ((Math.abs(n || 0) >= 100) ? Math.round(n || 0) : Math.round((n || 0) * 100) / 100).toLocaleString('es-MX', { maximumFractionDigits: 2 });
  const hora12 = h => (h % 12 || 12) + (h < 12 ? ' am' : ' pm');
  let mem = LS(MEMK) || {};
  mem.precios = mem.precios || {}; mem.desc = mem.desc || {}; mem.resp = mem.resp || {};
  mem.hechas = mem.hechas || 0; mem.chat = mem.chat || []; mem.sinEntender = mem.sinEntender || [];
  const save = () => { try { localStorage.setItem(MEMK, JSON.stringify(mem)); } catch (e) {} };
  const activo = (key, dias) => !(mem.desc[key] && Date.now() - mem.desc[key] < (dias || 14) * D);

  // ---------- ANALISIS ----------
  function analizar() {
    const now = Date.now();
    const prods = LS('yimi_productos') || [];
    const trAll = (LS('yimi_trans') || []).filter(t => t.tipo === 'Venta' && Number(t.id) > 1e12);
    const tr = trAll.filter(t => now - Number(t.id) <= 28 * D);
    const minId = trAll.length ? Math.min(...trAll.map(t => Number(t.id))) : now;
    const semanas = Math.max(1, Math.min(4, (now - minId) / (7 * D)));
    const P = {};
    prods.forEach(p => { P[String(p.id)] = { p, id: String(p.id), nombre: p.nombre || '', stock: Number(p.stock) || 0, precio: Number(p.precio) || 0, costo: Number(p.costo) || 0, u28: 0, u14: 0, u7: 0, ult: 0, uHoy: 0, dia: [0, 0, 0, 0, 0, 0, 0] }; });
    trAll.forEach(t => (t.items || []).forEach(i => { const r = P[String(i.id)]; if (r) r.ult = Math.max(r.ult, Number(t.id)); }));
    const pares = {}, horas = new Array(24).fill(0), hoyDS = new Date(now).toDateString();
    tr.forEach(t => {
      const ids = [], esHoy = new Date(Number(t.id)).toDateString() === hoyDS;
      (t.items || []).forEach(i => {
        const r = P[String(i.id)]; if (!r) return;
        r.u28 += Number(i.cant) || 0;
        r.dia[new Date(Number(t.id)).getDay()] += Number(i.cant) || 0;
        if (esHoy) r.uHoy += Number(i.cant) || 0;
        if (now - Number(t.id) <= 7 * D) r.u7 += Number(i.cant) || 0;
        if (now - Number(t.id) <= 14 * D) r.u14 += Number(i.cant) || 0;
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
    return { now, L, P, orden, p75, tr, trAll, semanas, pares, horas, occ, C: Object.values(C) };
  }

  function insights(A) {
    const out = [], now = A.now;
    const add = (key, ico, tit, txt, preg, dias) => { if (activo(key, dias)) out.push({ key, ico, tit, txt, preg }); };
    if (A.trAll.length < 5) add('poca', '🌱', 'Apenas te estoy conociendo', 'Tengo ' + A.trAll.length + ' ventas registradas. Mientras más vendas, mejores consejos te doy. Mientras tanto contéstame lo que te pregunte abajo.', null, 3);
    A.L.forEach(r => {
      const hay = mem.resp['hay:' + r.id];
      const sinProv = hay && hay.v === 'no' && now - hay.ts < 21 * D;
      if (r.u28 >= 2 && !sinProv) {
        const cob = r.sem > 0 ? r.stock / r.sem : 99;
        if (cob < 1) {
          const pedir = Math.max(1, Math.ceil(r.sem * 2 - r.stock));
          add('pedir:' + r.id, '📦', 'Pide más: ' + r.nombre, 'Vendes ~' + r.sem.toFixed(1) + ' por semana y te quedan ' + r.stock + '. Te sugiero pedir al menos ' + pedir + ' para dos semanas.');
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
    // preguntas para aprender
    A.orden.slice(0, 5).forEach(r => { if (!mem.precios[r.id] && r.precio > 0) add('q-precio:' + r.id, '❓', '¿A cuánto lo venden en las tiendas?', r.nombre + ' (tú lo vendes en ' + $m(r.precio) + '). Así te digo si estás caro o barato.', { tipo: 'precio', id: r.id }, 5); });
    A.L.forEach(r => { if (r.stock === 0 && r.u28 >= 3 && !mem.resp['hay:' + r.id]) add('q-hay:' + r.id, '❓', '¿Hay más de ' + r.nombre + '?', 'Se vende bien (' + r.u28 + ' en 4 semanas) y ya no tienes. ¿Tu proveedor todavía tiene?', { tipo: 'hay', id: r.id }, 3); });
    return out;
  }

  // ---------- CHAT ----------
  const lista = (arr, f, n) => arr.slice(0, n || 5).map((x, i) => (i + 1) + '. ' + f(x)).join('\n');
  function buscarProd(A, q) {
    const ws = norm(q).split(/[^a-z0-9]+/).filter(w => w.length > 2 && !/^(como|cuanto|cuantos|vende|vendo|vendes|margen|gano|gana|precio|tienda|tiendas|cuesta|venden|esta|que|los|las|del|por|mas|con|para|producto|pedir|comprar)$/.test(w));
    let best = null, bs = 0;
    A.L.forEach(r => { const n = norm(r.nombre); const s = ws.filter(w => n.indexOf(w) >= 0).length; if (s > bs) { bs = s; best = r; } });
    return bs ? best : null;
  }
  function resumenTxt(A) {
    const hoy = new Date().toDateString();
    const vh = A.trAll.filter(t => new Date(Number(t.id)).toDateString() === hoy);
    const v7 = A.trAll.filter(t => A.now - Number(t.id) <= 7 * D);
    const s = (arr, f) => arr.reduce((a, t) => a + (Number(t[f]) || 0), 0);
    return 'Hoy: ' + vh.length + ' ventas por ' + $m(s(vh, 'monto')) + ' (ganancia ' + $m(s(vh, 'ganancia')) + ').\nÚltimos 7 días: ' + v7.length + ' ventas por ' + $m(s(v7, 'monto')) + ' (ganancia ' + $m(s(v7, 'ganancia')) + ').';
  }
  function responder(q) {
    const A = analizar(), n = norm(q), ins = insights(A), p = buscarProd(A, q);
    const m = n.match(/(\d+(?:\.\d+)?)/);
    if (p && m && /tienda|cuesta|venden|cobran|mercado|super/.test(n)) {
      mem.precios[p.id] = { v: parseFloat(m[1]), ts: Date.now() }; save();
      return 'Anotado: ' + p.nombre + ' en tiendas a ' + $m(parseFloat(m[1])) + '. Tú lo vendes en ' + $m(p.precio) + '. Lo voy a tomar en cuenta.';
    }
    if (/reporte|descargar|exportar/.test(n)) { descargarReporte(); return 'Listo, descargué el reporte (revisa tus descargas). Súbelo a Claude para ver qué mejorar.'; }
    if (/carg|llev[oa]\b|plan (de )?(hoy|dia)|que hago hoy/.test(n)) { const s = informe(A).sec.filter(x => /^Plan/.test(x.tit))[0]; return s ? s.tit + ':\n' + s.txt : 'Aún tengo pocas ventas para armar tu plan. Necesito al menos 8.'; }
    if (/flete|20 ?mil|20,?000|pedido grande|armar.*pedido|completar/.test(n)) { const s = informe(A).sec.filter(x => /^Pedido/.test(x.tit))[0]; return s ? s.tit + ':\n' + s.txt : 'Por ahora no veo nada urgente que pedir.'; }
    if (p) {
      const cob = p.sem > 0 ? (p.stock / p.sem < 1 ? ' Te alcanza para menos de una semana.' : ' Te alcanza para ~' + Math.round(p.stock / p.sem) + ' semanas.') : '';
      return p.nombre + ':\n• Vendiste ' + p.u28 + ' en 4 semanas (' + p.u7 + ' esta semana)\n• Stock: ' + p.stock + '.' + cob + '\n• Precio ' + $m(p.precio) + ', costo ' + $m(p.costo) + (p.margen != null ? ', margen ' + Math.round(p.margen) + '% (' + $m(p.gpp) + ' por pieza)' : '') + (mem.precios[p.id] ? '\n• En tiendas: ' + $m(mem.precios[p.id].v) : '');
    }
    if (/\bsub(ir|o|e|irle)\b|aument/.test(n)) { const r = ins.filter(i => /^(sube|barato|margen):/.test(i.key)); return r.length ? 'Te sugiero revisar estos precios:\n' + lista(r, i => i.tit + ' — ' + i.txt, 5) : 'Por ahora no veo productos que convenga subir.'; }
    if (/pedir|pido|pide|comprar|compro|surtir|falta|acaba/.test(n)) { const r = ins.filter(i => /^pedir:/.test(i.key)); return r.length ? 'Te sugiero pedir:\n' + lista(r, i => i.tit.replace('Pide más: ', '') + ' — ' + i.txt, 6) : 'Por ahora nada urgente de pedir.'; }
    if (/lento|no se vende|muert|estanc|parado|sobra/.test(n)) { const r = ins.filter(i => /^(lento|sobra):/.test(i.key)); return r.length ? lista(r, i => i.tit + ' — ' + i.txt, 5) : 'No veo productos parados por ahora.'; }
    if (/margen|rentable|deja mas|gano mas/.test(n)) { const r = A.L.filter(x => x.u28 > 0).sort((a, b) => b.gpp * b.u28 - a.gpp * a.u28); return r.length ? 'Los que más ganancia te dejaron en 4 semanas:\n' + lista(r, x => x.nombre + ' — ' + $m(x.gpp * x.u28) + ' (' + x.u28 + ' pzas)', 5) : 'Aún no tengo ventas para calcularlo.'; }
    if (/cliente|debe|fia|cobrar/.test(n)) { const d = A.C.filter(c => c.debe > 0).sort((a, b) => b.debe - a.debe); const t = A.C.filter(c => c.nombre !== 'Cliente General').sort((a, b) => b.total - a.total); return (d.length ? 'Te deben:\n' + lista(d, c => c.nombre + ' — ' + $m(c.debe), 5) + '\n\n' : 'Nadie te debe por ahora.\n\n') + (t.length ? 'Tus mejores clientes:\n' + lista(t, c => c.nombre + ' — ' + $m(c.total), 5) : ''); }
    if (/mejor|mas se vende|top|estrella|popular/.test(n)) return A.orden.length ? 'Tus más vendidos (4 semanas):\n' + lista(A.orden, x => x.nombre + ' — ' + x.u28 + ' pzas', 5) : 'Aún no tengo ventas.';
    if (/hora|cuando|momento/.test(n)) { const h = insights(A).filter(i => i.key === 'hora')[0]; return h ? h.txt : 'Necesito unas 15 ventas más para saber tu hora fuerte.'; }
    if (/resumen|como voy|hoy|semana|ventas|ganancia/.test(n)) return resumenTxt(A);
    if (/hola|ayuda|que puedes|que haces/.test(n)) return 'Pregúntame por un producto (ej. "¿cómo se vende Sabritas?"), "qué pido", "qué no se vende", "mis mejores clientes", "quién me debe", "cómo voy hoy" o dime "Sabritas en tiendas cuesta 18" para que aprenda precios.';
    if (mem.url && navigator.onLine) return null; // lo contesta la IA en linea
    const kq = norm(q), ex = mem.sinEntender.filter(x => norm(x.q) === kq)[0];
    if (ex) { ex.n = (ex.n || 1) + 1; ex.ts = Date.now(); } else mem.sinEntender.push({ q, ts: Date.now(), n: 1 });
    mem.sinEntender = mem.sinEntender.slice(-100); save();
    return 'Eso todavía no lo sé contestar. Lo guardé: en "Informe" toca "Generar reporte", súbelo a Claude y lo mejoramos. Mientras tanto prueba con un producto, "qué cargo hoy", "qué pido" o "quién me debe".';
  }
  async function preguntarIA(q) {
    try {
      const A = analizar();
      const top = A.orden.slice(0, 15).map(r => r.nombre + ': ' + r.u28 + ' pzas, stock ' + r.stock + ', margen ' + (r.margen != null ? Math.round(r.margen) + '%' : '?')).join('; ');
      const r = await fetch(mem.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pregunta: q, resumen: resumenTxt(A) + '\nTop: ' + top, precios_otras_tiendas: mem.precios }) });
      const j = await r.json();
      return j.respuesta || 'No recibí respuesta de la IA en línea.';
    } catch (e) { return 'No pude conectar con la IA en línea. Revisa tu wifi.'; }
  }


  // ---------- INFORME DEL DIA ----------
  const hoyStr = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  function informe(A) {
    const now = A.now, sec = [];
    const S = (arr, f) => arr.reduce((a, t) => a + (Number(t[f]) || 0), 0);
    const calc = arr => { let ing = 0, gan = 0, ing0 = 0; const ceros = {}; arr.forEach(t => (t.items || []).forEach(i => { const pr = Number(i.precioPersonalizado != null ? i.precioPersonalizado : i.precio) || 0, q = Number(i.cant) || 0, c = Number(i.costo) || 0; if (c > 0.01) { ing += pr * q; gan += (pr - c) * q; } else { ing0 += pr * q; ceros[i.nombre] = 1; } })); return { ing, gan, m: ing ? gan / ing * 100 : null, ing0, ceros: Object.keys(ceros) }; };
    const ven = (a, b) => A.trAll.filter(t => { const x = now - Number(t.id); return x >= a * D && x < b * D; });
    const w1 = ven(0, 7), w0 = ven(7, 14), c1 = calc(w1), c0 = calc(w0);
    if (w1.length) {
      let t = 'Últimos 7 días: ' + w1.length + ' ventas, ' + $m(S(w1, 'monto')) + ' vendidos, ganancia ' + $m(c1.gan) + (c1.m != null ? ' (margen ' + Math.round(c1.m) + '%)' : '') + '.';
      if (w0.length) { const dv = (S(w1, 'monto') / S(w0, 'monto') - 1) * 100, dg = c0.gan ? (c1.gan / c0.gan - 1) * 100 : 0; t += ' Vs la semana anterior: ventas ' + (dv >= 0 ? '+' : '') + Math.round(dv) + '%, ganancia ' + (dg >= 0 ? '+' : '') + Math.round(dg) + '%.'; if (dv > 15 && dg < dv / 2) t += ' Vendes más pero ganas proporcionalmente menos: está subiendo el peso de productos de poco margen.'; }
      sec.push({ ico: '📊', tit: 'Cómo vas', txt: t });
    }
    const r14 = calc(ven(0, 14));
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
      const PL = plan(A);
      if (PL.mas.length || PL.vuelan.length || PL.menos.length) {
        let t = '';
        if (PL.mas.length) t += 'Carga más (para tus próximos 5 días de venta): ' + PL.mas.slice(0, 6).map(x => x.r.nombre + ' (ocupas ~' + Math.round(x.esp) + ', tienes ' + x.r.stock + ')').join('; ') + '. ';
        if (PL.vuelan.length) t += 'Hoy se están vendiendo más rápido de lo normal: ' + PL.vuelan.slice(0, 3).map(x => x.r.nombre + ' (' + x.r.uHoy + ' vs ~' + Math.round(x.hoyEsp) + ' normal)').join('; ') + '. ';
        if (PL.menos.length) t += 'Carga menos / no pidas: ' + PL.menos.slice(0, 4).map(r => r.nombre + ' (' + r.stock + ' pzas' + (r.sem > 0 ? ', ~' + Math.round(r.stock / r.sem) + ' semanas' : ', sin ventas') + ')').join('; ') + '.';
        sec.push({ ico: '🗓️', tit: PL.lab ? 'Plan de hoy (' + PL.dia + ')' : 'Plan de la semana (desde el lunes)', txt: t.trim() });
      }
      const O = pedido(A);
      if (O.items.length) sec.push({ ico: '🛒', tit: 'Pedido sugerido: ' + $m(O.tot), txt: (O.tot >= O.meta ? 'Pasas de ' + $m(O.meta) + ': flete gratis. ' : 'Te faltan ' + $m(O.meta - O.tot) + ' para flete gratis (' + $m(O.meta) + '). Completa con lo que más rota. ') + 'Incluye: ' + O.items.slice(0, 6).map(x => x.r.nombre + ' x' + x.q + ' (' + $m(x.c) + ')').join('; ') + (O.items.length > 6 ? ' y ' + (O.items.length - 6) + ' más' : '') + '. Ajusta las cantidades a cajas completas.' });
    }
    const sobre = A.L.filter(r => r.stock * r.costo > 500 && (r.sem > 0 ? r.stock / r.sem > 8 : r.stock > 0)).sort((a, b) => b.stock * b.costo - a.stock * a.costo);
    if (sobre.length) sec.push({ ico: '🟡', tit: 'Dinero parado', txt: $m(sobre.reduce((a, r) => a + r.stock * r.costo, 0)) + ' en productos que tardan más de 8 semanas en venderse: ' + sobre.slice(0, 3).map(r => r.nombre).join(', ') + '. No los recompres y mueve con oferta.' });
    const top = A.orden.slice(0, 3), best = A.orden.filter(r => r.margen != null && r.margen >= 35 && r.u28 >= 5)[0];
    if (top.length && top[0].margen != null && top[0].margen < 25) sec.push({ ico: '💡', tit: 'Tu gancho', txt: top[0].nombre + ' es lo que más vendes pero deja solo ' + Math.round(top[0].margen) + '%.' + (best ? ' Ofrécelo junto con ' + best.nombre + ' (' + Math.round(best.margen) + '% de margen) para subir tu ganancia por venta.' : '') });
    const dias = [0, 0, 0, 0, 0, 0, 0]; A.tr.forEach(t => dias[new Date(Number(t.id)).getDay()]++);
    const nom = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'], lab = [1, 2, 3, 4, 5], tl = lab.reduce((a, d) => a + dias[d], 0);
    if (tl >= 20) { const fu = lab.slice().sort((a, b) => dias[b] - dias[a]), fl = fu[fu.length - 1]; sec.push({ ico: '📅', tit: 'Tus días', txt: 'Tu día más fuerte es el ' + nom[fu[0]] + ' (' + Math.round(dias[fu[0]] / tl * 100) + '% de tus ventas) y el más flojo el ' + nom[fl] + ' (' + Math.round(dias[fl] / tl * 100) + '%). Ese día visita o ofrece más a tus clientes de ruta.' }); }
    const deben = A.C.filter(c => c.debe > 0).sort((a, b) => b.debe - a.debe);
    if (deben.length) sec.push({ ico: '💳', tit: 'Te deben ' + $m(deben.reduce((a, c) => a + c.debe, 0)), txt: deben.slice(0, 3).map(c => c.nombre + ' ' + $m(c.debe)).join(', ') + '.' });
    const inact = A.C.filter(c => c.nombre !== 'Cliente General' && c.compras >= 3 && now - c.ult > 14 * D);
    if (inact.length) sec.push({ ico: '👋', tit: 'Clientes que se fueron', txt: inact.slice(0, 4).map(c => c.nombre + ' (' + Math.floor((now - c.ult) / D) + ' días)').join(', ') + '. Mándales un mensaje con tu gancho.' });
    const meta = mem.fleteGratis || 20000, comp = (LS('yimi_trans') || []).filter(t => t.tipo === 'Gasto' && t.itemsCompra && now - Number(t.id) <= 28 * D).sort((a, b) => b.id - a.id);
    if (comp.length) {
      const fl = comp.reduce((a, g) => a + (Number(g.fleteMonto) || 0), 0), sub = comp.reduce((a, g) => a + (Number(g.subtotal) || 0), 0), u = comp.filter(g => Number(g.fleteMonto) > 0)[0];
      let t = 'En 28 días pagaste ' + $m(fl) + ' de flete (' + (sub ? (fl / sub * 100).toFixed(1) : 0) + '% de tus compras).';
      if (u && Number(u.subtotal) < meta) t += ' Tu pedido del ' + u.fechaStr + ' fue de ' + $m(u.subtotal) + ' y pagó ' + $m(u.fleteMonto) + ' de flete; con ' + $m(meta) + ' o más era gratis. Arma pedidos de ' + $m(meta) + '+ con lo que sí rota.';
      sec.push({ ico: '🚚', tit: 'Flete', txt: t });
    }
    if (!sec.length) sec.push({ ico: '🌱', tit: 'Aún conociéndote', txt: 'Todavía tengo pocas ventas para armar tu informe. Sigue vendiendo.' });
    const preg = insights(A).filter(i => i.preg).length;
    const plano = 'INFORME DIGAR ' + new Date().toLocaleDateString('es-MX') + '\n\n' + sec.map(x => x.ico + ' ' + x.tit + ': ' + x.txt).join('\n\n') + '\n\nTop vendidos (4 sem): ' + A.orden.slice(0, 8).map(r => r.nombre + ' ' + r.u28 + 'pz stock ' + r.stock + (r.margen != null ? ' mg ' + Math.round(r.margen) + '%' : '')).join('; ') + '\nPrecios de otras tiendas que me dijo: ' + (Object.keys(mem.precios).length ? Object.keys(mem.precios).map(k => (A.P[k] ? A.P[k].nombre : k) + ' $' + mem.precios[k].v).join('; ') : 'ninguno') + '\nPreguntas pendientes por responderle: ' + preg;
    return { sec, plano };
  }

  // ---------- PLAN DEL DIA / PEDIDO / REPORTE ----------
  const NOMD = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const provOk = (r, now) => { const h = mem.resp['hay:' + r.id]; return !(h && h.v === 'no' && now - h.ts < 21 * D); };
  function plan(A) {
    const dow = new Date(A.now).getDay(), lab = dow >= 1 && dow <= 5, ds = [];
    for (let k = 0, d = lab ? dow : 1; k < 5; k++, d = d % 5 + 1) ds.push(d);
    const filas = A.L.filter(r => r.u28 >= 2).map(r => {
      const av = d => r.dia[d] / A.occ[d];
      let esp = 0; ds.forEach(d => { esp += av(d); });
      const hoyEsp = lab ? av(dow) : 0;
      if (lab) esp -= Math.min(r.uHoy, hoyEsp);
      return { r, esp, hoyEsp, falta: esp - r.stock };
    });
    const mas = filas.filter(x => x.esp >= 1.5 && x.falta >= 1 && provOk(x.r, A.now)).sort((a, b) => b.falta * b.r.gpp - a.falta * a.r.gpp);
    const vuelan = filas.filter(x => lab && x.hoyEsp >= 2 && x.r.uHoy >= x.hoyEsp * 1.5).sort((a, b) => b.r.uHoy - a.r.uHoy);
    const menos = A.L.filter(r => r.stock >= 6 && r.costo > 0 && (r.sem > 0 ? r.stock / r.sem > 4 : true)).sort((a, b) => b.stock * b.costo - a.stock * a.costo);
    return { dow, lab, dia: lab ? NOMD[dow] : 'lunes', ds, mas, vuelan, menos };
  }
  function pedido(A) {
    const meta = Number(mem.fleteGratis) || 20000, items = [];
    let tot = 0;
    const base = A.L.filter(r => r.u28 >= 3 && r.sem > 0 && r.costo > 0 && provOk(r, A.now)).sort((a, b) => b.sem * b.gpp - a.sem * a.gpp);
    const add = (r, q) => { q = Math.ceil(q); if (!(q >= 1)) return; const ex = items.filter(x => x.r.id === r.id)[0]; if (ex) { ex.q += q; ex.c = ex.q * r.costo; } else items.push({ r, q, c: q * r.costo }); tot += q * r.costo; };
    base.forEach(r => add(r, r.sem * 2 - r.stock));
    if (tot < meta) base.filter(r => r.gpp > 0).forEach(r => {
      if (tot >= meta) return;
      const ya = (items.filter(x => x.r.id === r.id)[0] || { q: 0 }).q;
      add(r, Math.min(r.sem * 4 - r.stock - ya, (meta - tot) / r.costo));
    });
    items.sort((a, b) => b.r.sem * b.r.gpp - a.r.sem * a.r.gpp);
    return { meta, tot, items, falta: Math.max(0, meta - tot) };
  }
  function reporte(A) {
    const R = informe(A), O = pedido(A), L = [], pc = n => (n == null ? '-' : Math.round(n) + '%');
    L.push('REPORTE ASISTENTE DIGAR');
    L.push('Generado: ' + new Date().toLocaleString('es-MX'));
    L.push('Ventas registradas: ' + A.trAll.length + ' (últimas 4 semanas: ' + A.tr.length + ') | Productos: ' + A.L.length + ' | Historia: ' + A.semanas.toFixed(1) + ' semanas');
    L.push('', '== INFORME ==');
    R.sec.forEach(x => L.push(x.ico + ' ' + x.tit + ': ' + x.txt, ''));
    L.push('== PEDIDO SUGERIDO COMPLETO (meta flete gratis ' + $m(O.meta) + ', sugerido ' + $m(O.tot) + ') ==');
    O.items.forEach(x => L.push('- ' + x.r.nombre + ': pedir ' + x.q + ' pzas x ' + $m(x.r.costo) + ' = ' + $m(x.c) + ' (vendes ~' + x.r.sem.toFixed(1) + '/sem, stock ' + x.r.stock + ')'));
    L.push('', '== TOP 30 VENDIDOS (4 semanas) ==', 'producto | 4sem | 7d | stock | costo | precio | margen | por semana | alcanza (sem)');
    A.orden.slice(0, 30).forEach(r => L.push(r.nombre + ' | ' + r.u28 + ' | ' + r.u7 + ' | ' + r.stock + ' | ' + $m(r.costo) + ' | ' + $m(r.precio) + ' | ' + pc(r.margen) + ' | ' + r.sem.toFixed(1) + ' | ' + (r.sem > 0 ? (r.stock / r.sem).toFixed(1) : '-')));
    L.push('', '== MENOR MARGEN (entre lo que sí se vende) ==');
    A.L.filter(r => r.u28 >= 3 && r.margen != null).sort((a, b) => a.margen - b.margen).slice(0, 10).forEach(r => L.push('- ' + r.nombre + ': margen ' + pc(r.margen) + ', ' + r.u28 + ' pzas en 4 sem'));
    L.push('', '== SIN MOVIMIENTO EN 4 SEMANAS (con stock) ==');
    A.L.filter(r => r.stock > 0 && r.u28 === 0).sort((a, b) => b.stock * b.costo - a.stock * a.costo).slice(0, 10).forEach(r => L.push('- ' + r.nombre + ': ' + r.stock + ' pzas, ' + $m(r.stock * r.costo) + ' parados'));
    const raros = A.L.filter(r => !(r.costo > 0) || !(r.precio > 0));
    L.push('', '== DATOS A REVISAR ==', 'Productos con costo o precio en $0: ' + raros.length + (raros.length ? ' (' + raros.slice(0, 15).map(r => r.nombre).join(', ') + ')' : ''));
    const pk = Object.keys(mem.precios);
    L.push('', '== PRECIOS DE OTRAS TIENDAS QUE ME DIJO ==', pk.length ? pk.map(k => (A.P[k] ? A.P[k].nombre : k) + ' $' + mem.precios[k].v).join('; ') : 'ninguno');
    L.push('', '== PREGUNTAS QUE NO SUPE CONTESTAR ==');
    if (mem.sinEntender.length) mem.sinEntender.forEach(x => L.push('- "' + x.q + '" (' + (x.n || 1) + ' vez/veces, última ' + new Date(x.ts).toLocaleDateString('es-MX') + ')')); else L.push('ninguna');
    const ns = Object.keys(mem.noSirve || {});
    L.push('', '== SUGERENCIAS QUE MARCÓ "NO ME SIRVE" ==');
    if (ns.length) ns.forEach(k => L.push('- ' + mem.noSirve[k].tit + ' (' + new Date(mem.noSirve[k].ts).toLocaleDateString('es-MX') + ')')); else L.push('ninguna');
    L.push('', 'Consejos que dijo haber aplicado: ' + mem.hechas);
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
    } catch (e) { prompt('Copia este reporte:', t); }
    return t;
  }

  window.__asistenteDigar = { analizar, insights, responder, informe, plan, pedido, reporte, _mem: () => mem };
  if (typeof document === 'undefined') return;

  // ---------- INTERFAZ ----------
  const css = document.createElement('style');
  css.textContent = '#ia-fab{position:fixed;right:14px;bottom:92px;z-index:60;width:52px;height:52px;border-radius:50%;background:#1456F0;color:#fff;font-size:24px;border:none;box-shadow:0 4px 14px rgba(0,0,0,.3)}#ia-badge{position:absolute;top:-4px;right:-4px;background:#ef4444;color:#fff;font-size:11px;font-weight:800;min-width:20px;height:20px;border-radius:10px;line-height:20px;text-align:center}#ia-p{position:fixed;inset:0;z-index:200;background:#f3f4f6;display:none;flex-direction:column}#ia-p.on{display:flex}.ia-h{background:#0B1B3F;color:#fff;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;font-weight:800}.ia-h button{background:none;border:none;color:#fff;font-size:22px}.ia-t{display:flex;background:#fff;border-bottom:1px solid #e5e7eb}.ia-t button{flex:1;padding:10px;font-weight:700;font-size:13px;background:none;border:none;color:#6b7280;border-bottom:3px solid transparent}.ia-t button.a{color:#1456F0;border-bottom-color:#1456F0}#ia-b{flex:1;overflow-y:auto;padding:12px}.ia-c{background:#fff;border-radius:14px;padding:12px;margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,.08)}.ia-c b{display:block;font-size:14px;margin-bottom:4px}.ia-c p{font-size:13px;color:#374151;margin:0 0 8px}.ia-r{display:flex;gap:8px;flex-wrap:wrap}.ia-r button{padding:7px 12px;border-radius:10px;font-size:12px;font-weight:700;border:1px solid #d1d5db;background:#f9fafb}.ia-r .ok{background:#1456F0;color:#fff;border-color:#1456F0}.ia-r input{width:90px;padding:7px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;text-align:center}.ia-m{max-width:85%;padding:9px 12px;border-radius:14px;margin-bottom:8px;font-size:13px;white-space:pre-wrap}.ia-m.yo{background:#1456F0;color:#fff;margin-left:auto}.ia-m.ia{background:#fff;color:#111}#ia-in{display:none;padding:8px;background:#fff;border-top:1px solid #e5e7eb;gap:8px}#ia-in.on{display:flex}#ia-in input{flex:1;padding:11px;border:1px solid #d1d5db;border-radius:12px;font-size:14px}#ia-in button{padding:0 16px;background:#1456F0;color:#fff;border:none;border-radius:12px;font-weight:700}.ia-f{font-size:11px;color:#6b7280;text-align:center;margin:6px 0}';
  document.head.appendChild(css);
  const fab = document.createElement('button');
  fab.id = 'ia-fab'; fab.innerHTML = '🧠<span id="ia-badge" style="display:none"></span>';
  const pan = document.createElement('div');
  pan.id = 'ia-p';
  pan.innerHTML = '<div class="ia-h"><span>🧠 Asistente DIGAR</span><button data-a="cerrar">✕</button></div><div class="ia-t"><button class="a" data-a="tab-i">Informe</button><button data-a="tab-s">Sugerencias</button><button data-a="tab-c">Chat</button></div><div id="ia-b"></div><div id="ia-in"><input id="ia-q" placeholder="Pregúntame algo de tu negocio…"><button data-a="enviar">Enviar</button></div>';
  document.body.appendChild(fab); document.body.appendChild(pan);
  let tab = 's', cache = [];
  const B = () => pan.querySelector('#ia-b');

  function badge() {
    try { cache = insights(analizar()); } catch (e) { cache = []; }
    const n = cache.length + (mem.visto !== hoyStr() ? 1 : 0), b = fab.querySelector('#ia-badge');
    b.style.display = n ? 'block' : 'none'; b.textContent = n > 9 ? '9+' : n;
  }
  function pintarS() {
    badge();
    const A = analizar();
    let h = cache.map(i => {
      let acc;
      if (i.preg && i.preg.tipo === 'precio') acc = '<input type="number" step="0.5" placeholder="$" data-i="' + esc(i.key) + '"><button class="ok" data-a="precio" data-k="' + esc(i.key) + '" data-id="' + esc(i.preg.id) + '">Guardar</button><button data-a="skip" data-k="' + esc(i.key) + '">No sé</button>';
      else if (i.preg && i.preg.tipo === 'hay') acc = '<button class="ok" data-a="hay-si" data-k="' + esc(i.key) + '" data-id="' + esc(i.preg.id) + '">Sí hay</button><button data-a="hay-no" data-k="' + esc(i.key) + '" data-id="' + esc(i.preg.id) + '">No hay</button>';
      else acc = '<button class="ok" data-a="hecho" data-k="' + esc(i.key) + '">✅ Ya lo hice</button><button data-a="skip" data-k="' + esc(i.key) + '">No me sirve</button>';
      return '<div class="ia-c"><b>' + i.ico + ' ' + esc(i.tit) + '</b><p>' + esc(i.txt) + '</p><div class="ia-r">' + acc + '</div></div>';
    }).join('');
    if (!h) h = '<div class="ia-c"><b>✨ Todo en orden</b><p>No veo nada urgente por ahora. Sigue vendiendo y vuelvo con más ideas.</p></div>';
    h += '<div class="ia-f">Llevo ' + A.trAll.length + ' ventas, ' + Object.keys(mem.precios).length + ' precios de otras tiendas y ' + mem.hechas + ' consejos que ya aplicaste. Aprendo con cada venta y cada respuesta tuya.</div>';
    B().innerHTML = h;
  }
  function pintarI() {
    const A = analizar(), R = informe(A);
    mem.visto = hoyStr(); save(); badge();
    B().innerHTML = '<div class="ia-f" style="text-align:left;font-size:12px">Informe de hoy · ' + new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }) + '</div>' + R.sec.map(x => '<div class="ia-c"><b>' + x.ico + ' ' + esc(x.tit) + '</b><p>' + esc(x.txt) + '</p></div>').join('') + (mem.sinEntender.length ? '<div class="ia-c"><b>❓ Tengo ' + mem.sinEntender.length + ' pregunta(s) que no supe contestar</b><p>Genera el reporte y súbelo a Claude para enseñarme a contestarlas.</p></div>' : '') + '<div class="ia-r"><button class="ok" data-a="reporte">📄 Generar reporte (descargar)</button><button data-a="copiar">📋 Copiar para Claude</button></div><div class="ia-f">Se recalcula con tus ventas cada vez que lo abres.</div>';
  }
  function copiar() {
    const t = reporte(analizar());
    const ok = () => alert('Resumen copiado. Pégalo en tu chat con Claude.');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, () => prompt('Copia este texto:', t)); else prompt('Copia este texto:', t);
  }
  function pintarC() {
    const msgs = mem.chat.length ? mem.chat : [{ r: 'ia', t: 'Hola 👋 Soy tu asistente. Pregúntame por un producto, "qué pido", "qué no se vende" o "quién me debe".' }];
    B().innerHTML = msgs.map(m => '<div class="ia-m ' + m.r + '">' + esc(m.t) + '</div>').join('');
    B().scrollTop = B().scrollHeight;
  }
  function ponTab(t) {
    tab = t;
    pan.querySelectorAll('.ia-t button').forEach(b => b.classList.toggle('a', b.dataset.a === 'tab-' + t));
    pan.querySelector('#ia-in').classList.toggle('on', t === 'c');
    t === 'i' ? pintarI() : t === 's' ? pintarS() : pintarC();
  }
  async function enviar() {
    const inp = pan.querySelector('#ia-q'), q = inp.value.trim();
    if (!q) return;
    inp.value = '';
    mem.chat.push({ r: 'yo', t: q });
    let r = responder(q);
    if (r === null) { mem.chat.push({ r: 'ia', t: 'Pensando…' }); pintarC(); r = await preguntarIA(q); mem.chat.pop(); }
    mem.chat.push({ r: 'ia', t: r }); mem.chat = mem.chat.slice(-40); save(); pintarC();
  }
  fab.addEventListener('click', () => { pan.classList.add('on'); ponTab('i'); });
  pan.addEventListener('click', e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a, k = b.dataset.k, id = b.dataset.id;
    if (a === 'cerrar') { pan.classList.remove('on'); badge(); return; }
    if (a === 'tab-i') return ponTab('i');
    if (a === 'copiar') return copiar();
    if (a === 'reporte') { descargarReporte(); return; }
    if (a === 'tab-s') return ponTab('s');
    if (a === 'tab-c') return ponTab('c');
    if (a === 'enviar') return enviar();
    if (a === 'hecho') { mem.hechas++; mem.desc[k] = Date.now(); }
    if (a === 'skip') { mem.desc[k] = Date.now(); const it = cache.filter(x => x.key === k)[0]; if (it) { mem.noSirve = mem.noSirve || {}; mem.noSirve[k] = { tit: it.tit, ts: Date.now() }; } }
    if (a === 'precio') { const v = parseFloat(pan.querySelector('input[data-i="' + k + '"]').value); if (!(v > 0)) return; mem.precios[id] = { v, ts: Date.now() }; mem.desc[k] = Date.now(); }
    if (a === 'hay-si') { mem.resp['hay:' + id] = { v: 'si', ts: Date.now() }; mem.desc[k] = Date.now(); }
    if (a === 'hay-no') { mem.resp['hay:' + id] = { v: 'no', ts: Date.now() }; mem.desc[k] = Date.now(); }
    save(); pintarS();
  });
  pan.querySelector('#ia-q').addEventListener('keydown', e => { if (e.key === 'Enter') enviar(); });
  setTimeout(badge, 1500);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) badge(); });
})();
