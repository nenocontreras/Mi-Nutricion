/**
 * Registro diario automático — Plan Fitness Transformación
 * ------------------------------------------------------------------
 * Script vinculado a la planilla de Google «Plan_Fitness_Transformacion».
 *
 *  · Recibe de un Atajo de iPhone los datos de Apple Salud: pasos y la
 *    nutrición que MyFitnessPal escribe en Salud (calorías, proteína; peso
 *    y agua opcionales) y los vuelca en la hoja «Diario».
 *  · Le contesta al Atajo qué falta del día, para que te pregunte sólo eso.
 *  · Copia cada respuesta del formulario al Diario (antes lo hacías a mano).
 *  · A las 23:30 revisa el día y, si quedó algo sin cargar, te manda un mail.
 *
 * Regla de oro: lo que cargás vos (a mano, por el formulario o respondiendo
 * al Atajo) nunca se pisa. Los datos de Salud sólo ocupan celdas vacías o
 * celdas que ya había escrito Salud (llevan una nota «auto:»).
 *
 * Instalación: automatizacion/README.md
 */

const CONFIG = {
  ZONA: 'America/Argentina/Buenos_Aires',
  HOJA_DIARIO: 'Diario',
  FILA_ENCABEZADOS: 3,
  HOJA_REGISTRO: '_Automatizacion',
  HORA_CORTE: 4,                      // antes de las 4:00 todavía cuenta como el día anterior
  REVISION: { hora: 23, minuto: 30 }, // revisión nocturna (± 15 min, lo decide Google)
  AVISO_POR_MAIL: true
};

/* Columnas del Diario que maneja el sistema.
   col: encabezado exacto de la fila 3 · form: inicio de la pregunta del formulario
   salud: puede llegar del iPhone · aditivo: varias muestras del mismo día se suman
   req: hace falta para dar el día por completo */
const CAMPOS = {
  peso:     { col: 'Peso (kg)',    nombre: 'peso',              form: 'peso',           tipo: 'numero', dec: 1, min: 30,  max: 250,    salud: true,  req: true, texto: '¿Cuánto pesaste hoy? (kg)' },
  agua:     { col: 'Agua (L)',     nombre: 'agua',              form: 'agua',           tipo: 'numero', dec: 1, min: 0.1, max: 10,     salud: true,  aditivo: true, req: true, texto: '¿Cuántos litros de agua tomaste?' },
  sueno:    { col: 'Sueño (h)',    nombre: 'horas de sueño',    form: 'suenoh',         tipo: 'numero', dec: 1, min: 0.5, max: 16,     req: true, texto: '¿Cuántas horas dormiste anoche?' },
  calSueno: { col: 'Cal.Sueño',    nombre: 'calidad del sueño', form: 'calidaddesueno', tipo: 'escala', req: true, texto: 'Calidad del sueño (1 = muy mala · 5 = muy buena)' },
  pasos:    { col: 'Pasos',        nombre: 'pasos',             form: 'pasos',          tipo: 'numero', dec: 0, min: 1,   max: 100000, salud: true,  aditivo: true, req: true, texto: '¿Cuántos pasos hiciste hoy?' },
  cardio:   { col: 'Cardio (min)', nombre: 'cardio',            form: 'cardio',         tipo: 'numero', dec: 0, min: 1,   max: 600,    req: false, texto: '¿Cuántos minutos de cardio hiciste?' },
  kcal:     { col: 'Calorías',     nombre: 'calorías',          form: 'calorias',       tipo: 'numero', dec: 0, min: 1,   max: 8000,   salud: true,  aditivo: true, req: true, texto: '¿Cuántas calorías comiste? (MyFitnessPal)' },
  proteina: { col: 'Proteína (g)', nombre: 'proteína',          form: 'proteina',       tipo: 'numero', dec: 0, min: 1,   max: 500,    salud: true,  aditivo: true, req: true, texto: '¿Cuántos gramos de proteína comiste?' },
  animo:    { col: 'Ánimo',        nombre: 'ánimo',             form: 'animo',          tipo: 'escala', req: true, texto: 'Ánimo de hoy (1 = muy bajo · 5 = muy bueno)' },
  energia:  { col: 'Energía',      nombre: 'energía',           form: 'energia',        tipo: 'escala', req: true, texto: 'Energía de hoy (1 = muy baja · 5 = muy alta)' },
  hambre:   { col: 'Hambre',       nombre: 'hambre',            form: 'hambre',         tipo: 'escala', req: true, texto: 'Hambre de hoy (1 = nada · 5 = mucha)' },
  entreno:  { col: 'Entrené',      nombre: 'entrené',           form: 'entrenaste',     tipo: 'sino',   req: true, texto: '¿Entrenaste hoy?' }
};

const MARCA_AUTO = 'auto:';
const SALTAR = 'Saltar';

/* ======================= ENTRADA WEB (Atajo) ======================= */

function doGet() {
  return json_({ ok: true, servicio: 'registro-diario', hoy: fechaHoy_() });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'El cuerpo no es JSON válido' });
  }
  if (!tokenValido_(body.token)) return json_({ ok: false, error: 'Token inválido' });

  try {
    return json_(conLock_(() => {
      let r;
      if (body.accion === 'sincronizar') r = sincronizar_(body);
      else if (body.accion === 'responder') r = responder_(body);
      else if (body.accion === 'estado') r = estado_(diario_(), body.fecha ? normalizarFecha_(body.fecha) : fechaHoy_());
      else return { ok: false, error: 'Acción desconocida: ' + body.accion };
      registrar_(body.accion, r.fecha, { faltan: r.faltan, sincronizado: r.sincronizado, respondido: r.respondido });
      return r;
    }));
  } catch (err) {
    registrar_('error', '', String(err && err.stack || err));
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/* Datos de Salud. Cada campo admite:
   "2026-10-07=10234;2026-10-08=6012"  ·  ["2026-10-07=10234", …]  ·  {"2026-10-07": 10234}  ·  6012 (= hoy)
   Sólo se aceptan hoy y ayer: así cada noche se cierra el día anterior con los números finales. */
function sincronizar_(body) {
  const D = diario_();
  const hoy = fechaHoy_(), ayer = sumarDias_(hoy, -1);
  const informe = { escritos: [], protegidos: [], rechazados: [], ignorados: [] };
  const acum = {};

  for (const campo in CAMPOS) {
    if (!CAMPOS[campo].salud || body[campo] == null) continue;
    for (const par of serie_(body[campo])) {
      const fecha = par[0];
      if (fecha !== hoy && fecha !== ayer) { informe.ignorados.push(campo + ' ' + fecha); continue; }
      const c = convertir_(campo, par[1]);
      if (c.vacio) continue;
      if (c.error) { informe.rechazados.push(campo + ' ' + fecha + ': ' + c.error); continue; }
      const k = fecha + '|' + campo;
      acum[k] = (k in acum && CAMPOS[campo].aditivo) ? acum[k] + c.valor : c.valor;
    }
  }

  for (const k in acum) {
    const fecha = k.split('|')[0], campo = k.split('|')[1];
    const v = validar_(campo, acum[k]);
    if (v.error) { informe.rechazados.push(campo + ' ' + fecha + ': ' + v.error); continue; }
    const fila = filaDeFecha_(D, fecha);
    if (!fila) { informe.ignorados.push(campo + ' ' + fecha + ' (no está en el Diario)'); continue; }
    const res = escribir_(D, fila, campo, v.valor, 'salud', 'Salud');
    (res === 'protegido' ? informe.protegidos : informe.escritos).push(campo + ' ' + fecha + '=' + v.valor);
  }

  SpreadsheetApp.flush();
  const r = estado_(D, hoy);
  r.sincronizado = informe;
  return r;
}

/* Respuestas que diste en el Atajo: {"peso": "80,4", "animo": "4", "entreno": "Sí", …} */
function responder_(body) {
  const D = diario_();
  const hoy = fechaHoy_();
  const fecha = body.fecha ? normalizarFecha_(body.fecha) : hoy;
  if (fecha !== hoy && fecha !== sumarDias_(hoy, -1)) throw new Error('Sólo se responde por hoy o ayer, no por ' + body.fecha);
  const fila = filaDeFecha_(D, fecha);
  if (!fila) throw new Error('La fecha ' + fecha + ' no está en la hoja ' + CONFIG.HOJA_DIARIO);

  let resp = body.respuestas || {};
  if (typeof resp === 'string') resp = JSON.parse(resp || '{}');
  const informe = { escritos: [], rechazados: [], ignorados: [] };

  for (const campo in resp) {
    if (!CAMPOS[campo]) { informe.ignorados.push(campo); continue; }
    const c = convertir_(campo, resp[campo]);
    if (c.vacio) continue;
    const v = c.error ? c : validar_(campo, c.valor);
    if (v.error) { informe.rechazados.push(campo + ': ' + v.error); continue; }
    escribir_(D, fila, campo, v.valor, 'usuario', 'agente');
    informe.escritos.push(campo + '=' + v.valor);
  }

  SpreadsheetApp.flush();
  const r = estado_(D, fecha);
  r.respondido = informe;
  return r;
}

/* ======================= ESTADO DEL DÍA ======================= */

function estado_(D, fecha) {
  if (!fecha) throw new Error('Fecha inválida');
  const dia = faltantes_(D, fecha);
  if (!dia) throw new Error('La fecha ' + fecha + ' no está en la hoja ' + CONFIG.HOJA_DIARIO);

  const etiqueta = diaCorto_(fecha);
  const formUrl = urlFormulario_(D.ss);
  const cumpl = D.extra.cumpl ? dia.valores[D.extra.cumpl - 1] : '';
  const racha = D.extra.racha ? dia.valores[D.extra.racha - 1] : '';
  const cargado = ['pasos', 'kcal', 'proteina', 'peso']
    .filter(k => k in dia.tiene)
    .map(k => k === 'pasos' ? miles_(dia.tiene[k]) + ' pasos'
      : k === 'kcal' ? miles_(dia.tiene[k]) + ' kcal'
      : k === 'proteina' ? miles_(dia.tiene[k]) + ' g proteína'
      : decimal_(dia.tiene[k]) + ' kg');

  let resumen;
  if (!dia.faltan.length) {
    resumen = 'Registro del ' + etiqueta + ' completo ✔';
    if (typeof cumpl === 'number') resumen += ' · cumplimiento ' + Math.round(cumpl * 100) + '%';
    if (racha !== '' && racha != null) resumen += ' · racha ' + racha;
  } else {
    resumen = (cargado.length ? 'Ya tengo: ' + cargado.join(' · ') + '.\n' : '') +
      'Falta: ' + dia.faltan.map(k => CAMPOS[k].nombre).join(', ') + '.';
  }

  const ayer = sumarDias_(fecha, -1);
  const diaAyer = faltantes_(D, ayer);
  if (diaAyer && diaAyer.faltan.length) {
    resumen += Object.keys(diaAyer.tiene).length
      ? '\nAyer quedó sin: ' + diaAyer.faltan.map(k => CAMPOS[k].nombre).join(', ') + '.'
      : '\nAyer (' + diaCorto_(ayer) + ') no tiene registro.';
  }

  return {
    ok: true,
    fecha: fecha,
    estado: dia.faltan.length ? 'incompleto' : 'completo',
    faltan: dia.faltan,
    preguntas: dia.faltan.map(pregunta_),
    resumen: resumen,
    form_url: formUrl,
    hoja_url: D.ss.getUrl() + '#gid=' + D.hoja.getSheetId() + '&range=A' + dia.fila
  };
}

function faltantes_(D, fecha) {
  const fila = filaDeFecha_(D, fecha);
  if (!fila) return null;
  const valores = D.hoja.getRange(fila, 1, 1, D.ultimaCol).getValues()[0];
  const tiene = {}, faltan = [];
  for (const k in CAMPOS) {
    const v = valores[D.cols[k] - 1];
    if (v !== '' && v != null) tiene[k] = v;
    else if (CAMPOS[k].req) faltan.push(k);
  }
  return { fila: fila, valores: valores, tiene: tiene, faltan: faltan };
}

function pregunta_(campo) {
  const c = CAMPOS[campo];
  if (c.tipo === 'escala') return { campo: campo, texto: c.texto, tipo: 'lista', opciones: ['1', '2', '3', '4', '5', SALTAR] };
  if (c.tipo === 'sino') return { campo: campo, texto: c.texto, tipo: 'lista', opciones: ['Sí', 'No', SALTAR] };
  return { campo: campo, texto: c.texto + ' (vacío = saltar)', tipo: 'numero', opciones: [] };
}

/* ======================= FORMULARIO ======================= */

/* Disparador «al enviar formulario»: lo que contestás manda, pisa lo que hubiera. */
function alEnviarFormulario(e) {
  conLock_(() => {
    const hojaResp = e.range.getSheet();
    const encabezados = hojaResp.getRange(1, 1, 1, hojaResp.getLastColumn()).getValues()[0];
    const fila = hojaResp.getRange(e.range.getRow(), 1, 1, encabezados.length).getValues()[0];
    const r = volcarRespuesta_(diario_(), encabezados, fila, 'usuario');
    registrar_('formulario', r.fecha, r);
  });
}

/* Copia al Diario las respuestas del formulario que nunca se pasaron.
   Sólo llena celdas vacías. Ejecutala a mano una vez para ponerte al día. */
function importarFormulario() {
  const r = importarFormulario_(diario_(), null);
  Logger.log('Respuestas revisadas: %s · celdas completadas: %s', r.respuestas, r.celdas);
  return r;
}

function importarFormulario_(D, soloFechas) {
  const total = { respuestas: 0, celdas: 0 };
  for (const hojaResp of D.ss.getSheets().filter(h => h.getFormUrl && h.getFormUrl())) {
    const n = hojaResp.getLastRow();
    if (n < 2) continue;
    const datos = hojaResp.getRange(1, 1, n, hojaResp.getLastColumn()).getValues();
    for (let i = 1; i < datos.length; i++) {
      if (!esFecha_(datos[i][0])) continue;
      if (soloFechas && soloFechas.indexOf(fechaDelDia_(datos[i][0])) < 0) continue;
      const r = volcarRespuesta_(D, datos[0], datos[i], 'relleno');
      total.respuestas++;
      total.celdas += r.escritos.length;
    }
  }
  return total;
}

function volcarRespuesta_(D, encabezados, fila, modo) {
  const r = { fecha: '', escritos: [], rechazados: [] };
  if (!esFecha_(fila[0])) return r;
  r.fecha = fechaDelDia_(fila[0]);
  const filaDiario = filaDeFecha_(D, r.fecha);
  if (!filaDiario) { r.rechazados.push('fecha fuera del Diario'); return r; }

  for (let j = 1; j < encabezados.length; j++) {
    const campo = campoDeFormulario_(encabezados[j]);
    if (!campo) continue;
    const c = convertir_(campo, fila[j]);
    if (c.vacio) continue;
    const v = c.error ? c : validar_(campo, c.valor);
    if (v.error) { r.rechazados.push(campo + ': ' + v.error); continue; }
    if (escribir_(D, filaDiario, campo, v.valor, modo, '') === 'escrito') r.escritos.push(campo + '=' + v.valor);
  }
  return r;
}

function campoDeFormulario_(encabezado) {
  const h = norm_(encabezado);
  for (const k in CAMPOS) if (h.indexOf(CAMPOS[k].form) === 0) return k;
  return null;
}

function urlFormulario_(ss) {
  try { return ss.getFormUrl() || ''; } catch (err) { return ''; }
}

/* ======================= REVISIÓN NOCTURNA ======================= */

/* Disparador diario (23:30). Si el Atajo no corrió o quedó algo sin cargar, te avisa por mail. */
function revisionNocturna() {
  const hoy = fechaHoy_();
  const est = conLock_(() => {
    const D = diario_();
    importarFormulario_(D, [hoy, sumarDias_(hoy, -1)]); // por si falló el disparador del formulario
    SpreadsheetApp.flush();
    return estado_(D, hoy);
  });
  registrar_('revision', hoy, { faltan: est.faltan });
  if (est.estado === 'completo' || !CONFIG.AVISO_POR_MAIL) return est;

  const cuerpo = [
    'Hoy (' + diaCorto_(hoy) + ') el registro quedó incompleto.',
    '',
    est.resumen,
    '',
    est.form_url ? 'Cargalo en el formulario: ' + est.form_url : '',
    'O directo en la planilla: ' + est.hoja_url,
    '',
    'Mañana a las 22:00 el Atajo vuelve a traer los pasos y las calorías de hoy desde Salud.'
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Registro del ' + diaCorto_(hoy) + ': falta ' + est.faltan.length, cuerpo);
  return est;
}

/* ======================= INSTALACIÓN ======================= */

/* Ejecutar UNA vez desde el editor. Crea el token y los disparadores. */
function instalar() {
  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty('TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('TOKEN', token);
  }

  const D = diario_(); // valida que existan todas las columnas
  const propios = ['alEnviarFormulario', 'revisionNocturna'];
  ScriptApp.getProjectTriggers()
    .filter(t => propios.indexOf(t.getHandlerFunction()) >= 0)
    .forEach(t => ScriptApp.deleteTrigger(t));
  if (urlFormulario_(D.ss)) ScriptApp.newTrigger('alEnviarFormulario').forSpreadsheet(D.ss).onFormSubmit().create();
  ScriptApp.newTrigger('revisionNocturna').timeBased()
    .everyDays(1).atHour(CONFIG.REVISION.hora).nearMinute(CONFIG.REVISION.minuto)
    .inTimezone(CONFIG.ZONA).create();

  const est = estado_(D, fechaHoy_());
  Logger.log('Listo. Token para el Atajo: %s', token);
  Logger.log('Hoy (%s): %s', est.fecha, est.resumen);
  return token;
}

function mostrarToken() {
  Logger.log(PropertiesService.getScriptProperties().getProperty('TOKEN') || 'Todavía no hay token: ejecutá instalar()');
}

/* ======================= HOJA DIARIO ======================= */

function diario_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(CONFIG.HOJA_DIARIO);
  if (!hoja) throw new Error('No encuentro la hoja «' + CONFIG.HOJA_DIARIO + '»');
  const ultimaCol = hoja.getLastColumn();
  const encabezados = hoja.getRange(CONFIG.FILA_ENCABEZADOS, 1, 1, ultimaCol).getValues()[0].map(norm_);
  const cols = {};
  for (const k in CAMPOS) {
    const i = encabezados.indexOf(norm_(CAMPOS[k].col));
    if (i < 0) throw new Error('Falta la columna «' + CAMPOS[k].col + '» en la fila ' + CONFIG.FILA_ENCABEZADOS + ' de ' + CONFIG.HOJA_DIARIO);
    cols[k] = i + 1;
  }
  return {
    ss: ss, hoja: hoja, cols: cols, ultimaCol: ultimaCol,
    extra: { cumpl: encabezados.indexOf('cumpl') + 1, racha: encabezados.indexOf('racha') + 1 },
    zonaHoja: ss.getSpreadsheetTimeZone(),
    filas: null
  };
}

/* La columna A tiene las fechas (fórmulas A_anterior + 1). Se busca por fecha, no se calcula la fila. */
function filaDeFecha_(D, ymd) {
  if (!D.filas) {
    D.filas = {};
    const primera = CONFIG.FILA_ENCABEZADOS + 1;
    const n = D.hoja.getLastRow() - primera + 1;
    if (n > 0) {
      const fechas = D.hoja.getRange(primera, 1, n, 1).getValues();
      for (let i = 0; i < n; i++) {
        if (esFecha_(fechas[i][0])) D.filas[Utilities.formatDate(fechas[i][0], D.zonaHoja, 'yyyy-MM-dd')] = primera + i;
      }
    }
  }
  return D.filas[ymd] || 0;
}

/* modo «salud»: sólo celdas vacías o escritas antes por Salud
   modo «relleno»: sólo celdas vacías
   modo «usuario»: siempre (es tu respuesta) */
function escribir_(D, fila, campo, valor, modo, origen) {
  const celda = D.hoja.getRange(fila, D.cols[campo]);
  const actual = celda.getValue();
  const nota = String(celda.getNote() || '');
  const vacia = actual === '' || actual == null;
  const esAuto = nota.indexOf(MARCA_AUTO) === 0;

  if (modo === 'salud' && !vacia && !esAuto) return 'protegido';
  if (modo === 'relleno' && !vacia) return 'protegido';
  if (actual === valor && (modo === 'salud' || !esAuto)) return 'igual';

  celda.setValue(valor);
  const sello = Utilities.formatDate(ahora_(), CONFIG.ZONA, 'dd/MM HH:mm');
  let nuevaNota;
  if (modo === 'salud') nuevaNota = MARCA_AUTO + ' ' + origen + ' · ' + sello + (nota && !esAuto ? '\n' + nota : '');
  else if (origen) nuevaNota = origen + ' · ' + sello;
  else nuevaNota = esAuto ? '' : nota;
  if (nuevaNota !== nota) celda.setNote(nuevaNota);
  return 'escrito';
}

/* ======================= VALORES ======================= */

/* Texto/número crudo → valor en la unidad de la planilla (sin validar rango). */
function convertir_(campo, crudo) {
  const c = CAMPOS[campo];
  if (crudo == null) return { vacio: true };
  const texto = String(crudo).trim();
  if (texto === '' || norm_(texto) === norm_(SALTAR)) return { vacio: true };

  if (c.tipo === 'sino') {
    const t = norm_(texto);
    if (t === 'si' || t === 's' || t === 'true') return { valor: 'Sí' };
    if (t === 'no' || t === 'n' || t === 'false') return { valor: 'No' };
    return { error: 'esperaba Sí o No y llegó «' + texto + '»' };
  }

  let n = aNumero_(crudo, campo);
  if (n == null) return { error: 'no es un número: «' + texto + '»' };
  const unidad = texto.toLowerCase();
  if (campo === 'kcal' && /kj/.test(unidad)) n = n / 4.184;
  if (campo === 'agua' && (/ml/.test(unidad) || n > 20)) n = n / 1000;
  if (campo === 'peso' && /lb/.test(unidad)) n = n * 0.45359237;
  return { valor: n };
}

function validar_(campo, valor) {
  const c = CAMPOS[campo];
  if (c.tipo === 'sino') return { valor: valor };
  if (c.tipo === 'escala') {
    return (valor >= 1 && valor <= 5 && Math.round(valor) === valor) ? { valor: valor } : { error: 'tiene que ser de 1 a 5 (llegó ' + valor + ')' };
  }
  const f = Math.pow(10, c.dec);
  const v = Math.round(valor * f) / f;
  if (v < c.min || v > c.max) return { error: 'fuera de rango (' + c.min + '–' + c.max + '): ' + v + '. ¿Unidades?' };
  return { valor: v };
}

/* Acepta 8432 · "8.432" · "8,432" · "1.950,5" · "1950.5 kcal" · "80,5". */
function aNumero_(valor, campo) {
  if (valor == null || valor === '') return null;
  if (typeof valor === 'number') return isFinite(valor) ? valor : null;
  let s = String(valor).replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return null;
  const punto = s.indexOf('.') >= 0, coma = s.indexOf(',') >= 0;
  if (punto && coma) {
    const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    s = s.split(dec === '.' ? ',' : '.').join('').replace(',', '.');
  } else if (punto || coma) {
    const sep = coma ? ',' : '.';
    const miles = new RegExp('^-?\\d{1,3}(\\' + sep + '\\d{3})+$').test(s);
    const entero = campo && CAMPOS[campo] && CAMPOS[campo].dec === 0;
    s = (miles && (sep === '.' || entero)) ? s.split(sep).join('') : s.replace(sep, '.');
  }
  const n = Number(s);
  return isFinite(n) ? n : null;
}

function serie_(valor) {
  if (valor == null || valor === '') return [];
  if (Array.isArray(valor)) return valor.reduce((a, v) => a.concat(serie_(v)), []);
  if (typeof valor === 'number') return [[fechaHoy_(), valor]];
  if (typeof valor === 'object') return Object.keys(valor).map(k => [normalizarFecha_(k), valor[k]]);
  const s = String(valor).trim();
  if (s.indexOf('=') < 0) return [[fechaHoy_(), s]];
  return s.split(/[;\n|]+/).map(p => p.trim()).filter(Boolean).map(p => {
    const i = p.indexOf('=');
    return [normalizarFecha_(p.slice(0, i)), p.slice(i + 1).trim()];
  });
}

/* ======================= FECHAS ======================= */

function ahora_() { return new Date(); }

function fechaHoy_() { return fechaDelDia_(ahora_()); }

/* Día al que pertenece un instante: lo que pasa antes de HORA_CORTE es del día anterior. */
function fechaDelDia_(instante) {
  const p = Utilities.formatDate(instante, CONFIG.ZONA, 'yyyy-MM-dd|HH').split('|');
  return Number(p[1]) < CONFIG.HORA_CORTE ? sumarDias_(p[0], -1) : p[0];
}

function sumarDias_(ymd, n) {
  const p = ymd.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10);
}

function normalizarFecha_(s) {
  if (esFecha_(s)) return Utilities.formatDate(s, CONFIG.ZONA, 'yyyy-MM-dd');
  s = String(s == null ? '' : s).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + pad2_(m[2]) + '-' + pad2_(m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + pad2_(m[2]) + '-' + pad2_(m[1]);
  return null;
}

function diaCorto_(ymd) {
  const p = ymd.split('-').map(Number);
  const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  return dias[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()] + ' ' + pad2_(p[2]) + '/' + pad2_(p[1]);
}

/* ======================= AUXILIARES ======================= */

function esFecha_(v) { return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime()); }

function pad2_(n) { return String(n).padStart(2, '0'); }

function norm_(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function miles_(n) { return String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

function decimal_(n) { return String(Math.round(Number(n) * 10) / 10).replace('.', ','); }

function tokenValido_(t) {
  const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  return !!token && typeof t === 'string' && t === token;
}

/* Atajo, formulario y revisión nocturna escriben en las mismas filas: de a uno por vez. */
function conLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function registrar_(accion, fecha, detalle) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let h = ss.getSheetByName(CONFIG.HOJA_REGISTRO);
    if (!h) {
      h = ss.insertSheet(CONFIG.HOJA_REGISTRO);
      h.appendRow(['Cuándo', 'Acción', 'Día', 'Detalle']);
      h.hideSheet();
    }
    h.appendRow([ahora_(), accion, fecha || '', typeof detalle === 'string' ? detalle : JSON.stringify(detalle)]);
  } catch (err) {
    console.error(err);
  }
}
