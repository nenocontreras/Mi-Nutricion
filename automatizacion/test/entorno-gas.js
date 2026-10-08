/* Simulador mínimo de Google Apps Script para probar Codigo.gs en Node.
   Reproduce la estructura real de la planilla: hoja «Diario» con encabezados
   en la fila 3, fechas desde el 06/07/2026 en la zona de la planilla
   (America/Los_Angeles) y la hoja de respuestas del formulario. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const CODIGO = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Codigo.gs'), 'utf8');

const ENCABEZADOS_DIARIO = ['Fecha', 'Día', 'Ini.Sem', 'Mes', 'Peso (kg)', 'Agua (L)', 'Sueño (h)', 'Cal.Sueño', 'Pasos',
  'Cardio (min)', 'Calorías', 'Proteína (g)', 'Ánimo', 'Energía', 'Hambre', 'Entrené', 'Cumpl. %', 'MM7 peso', 'Racha'];
const ENCABEZADOS_FORM = ['Marca temporal', 'Pregunta sin título', 'Peso (kg)', 'Agua (L)', 'Sueño (h)', 'Calidad de sueño (1-5)',
  'Pasos', 'Cardio (min)', 'Calorías', 'Proteína (g)', 'Ánimo (1-5)', 'Energía (1-5)', 'Hambre (1-5)', '¿Entrenaste hoy?'];

function partes(fecha, zona) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  const p = {};
  for (const x of f.formatToParts(fecha)) p[x.type] = x.value;
  return p;
}

function formatDate(fecha, zona, formato) {
  const p = partes(fecha, zona);
  const t = { yyyy: p.year, MM: p.month, dd: p.day, HH: p.hour, mm: p.minute, ss: p.second };
  return formato.replace(/yyyy|MM|dd|HH|mm|ss/g, (k) => t[k]);
}

/* Medianoche de y-m-d en una zona (lo que guarda Sheets en una celda de fecha). */
function medianoche(y, m, d, zona, DateCtor) {
  let t = Date.UTC(y, m - 1, d);
  for (let i = 0; i < 3; i++) {
    const p = partes(new Date(t), zona);
    const comoUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    t -= comoUTC - Date.UTC(y, m - 1, d);
  }
  return new DateCtor(t);
}

class Rango {
  constructor(hoja, fila, col, nf = 1, nc = 1) { Object.assign(this, { hoja, fila, col, nf, nc }); }
  getSheet() { return this.hoja; }
  getRow() { return this.fila; }
  getValues() { return this._mapa((f, c) => this.hoja._val(f, c)); }
  getNotes() { return this._mapa((f, c) => this.hoja._nota(f, c)); }
  getValue() { return this.hoja._val(this.fila, this.col); }
  getNote() { return this.hoja._nota(this.fila, this.col); }
  setValue(v) { this.hoja._set(this.fila, this.col, v); return this; }
  setNote(n) { this.hoja.notas[this.fila + ',' + this.col] = n; return this; }
  _mapa(fn) {
    const out = [];
    for (let i = 0; i < this.nf; i++) {
      const fila = [];
      for (let j = 0; j < this.nc; j++) fila.push(fn(this.fila + i, this.col + j));
      out.push(fila);
    }
    return out;
  }
}

class Hoja {
  constructor(nombre, id, formUrl = null) {
    this.nombre = nombre; this.id = id; this.formUrl = formUrl;
    this.celdas = {}; this.notas = {}; this.oculta = false;
  }
  getName() { return this.nombre; }
  getSheetId() { return this.id; }
  getFormUrl() { return this.formUrl; }
  getRange(f, c, nf, nc) { return new Rango(this, f, c, nf, nc); }
  getLastRow() { return Math.max(0, ...Object.keys(this.celdas).filter((k) => this.celdas[k] !== '').map((k) => +k.split(',')[0])); }
  getLastColumn() { return Math.max(0, ...Object.keys(this.celdas).filter((k) => this.celdas[k] !== '').map((k) => +k.split(',')[1])); }
  appendRow(valores) { const f = this.getLastRow() + 1; valores.forEach((v, j) => this._set(f, j + 1, v)); return this; }
  hideSheet() { this.oculta = true; }
  _val(f, c) { const v = this.celdas[f + ',' + c]; return v === undefined ? '' : v; }
  _nota(f, c) { return this.notas[f + ',' + c] || ''; }
  _set(f, c, v) { this.celdas[f + ',' + c] = v; }
}

class Planilla {
  constructor(zona) { this.zona = zona; this.hojas = []; }
  getSheetByName(n) { return this.hojas.find((h) => h.nombre === n) || null; }
  getSheets() { return this.hojas.slice(); }
  insertSheet(n) { const h = new Hoja(n, 1000 + this.hojas.length); this.hojas.push(h); return h; }
  getSpreadsheetTimeZone() { return this.zona; }
  getFormUrl() { return 'https://docs.google.com/forms/d/FORM/viewform'; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/PLANILLA/edit'; }
}

/* Crea un contexto con la planilla de prueba y Codigo.gs cargado.
   ahoraISO: instante «actual» que ve el script. */
function crearEntorno({ ahoraISO = '2026-10-09T01:00:00Z', token = 'secreto', zonaHoja = 'America/Los_Angeles' } = {}) {
  const enviados = [], disparadores = [], logs = [];
  const props = token ? { TOKEN: token } : {};
  const ss = new Planilla(zonaHoja);

  const ctx = vm.createContext({ console });
  const DateCtx = vm.runInContext('Date', ctx);

  const diario = new Hoja('Diario', 568593370);
  ss.hojas.push(diario);
  diario._set(1, 1, 'REGISTRO DIARIO');
  ENCABEZADOS_DIARIO.forEach((h, j) => diario._set(3, j + 1, h));
  for (let i = 0; i < 367; i++) {
    diario._set(4 + i, 1, medianoche(2026, 7, 6 + i, zonaHoja, DateCtx));
  }
  const form = new Hoja('Respuestas de formulario 1', 1663931106, 'https://docs.google.com/forms/d/FORM/viewform');
  ss.hojas.push(form);
  ENCABEZADOS_FORM.forEach((h, j) => form._set(1, j + 1, h));

  const constructorDisparador = (handler) => {
    const t = { handler, getHandlerFunction: () => handler };
    const b = {
      forSpreadsheet: () => b, onFormSubmit: () => b, timeBased: () => b, everyDays: (n) => { t.cadaDias = n; return b; },
      atHour: (h) => { t.hora = h; return b; }, nearMinute: (m) => { t.minuto = m; return b; },
      inTimezone: (z) => { t.zona = z; return b; }, create: () => { disparadores.push(t); return t; }
    };
    return b;
  };

  Object.assign(ctx, {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush: () => {} },
    Utilities: { formatDate, getUuid: () => crypto.randomUUID() },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (s) => ({ contenido: s, setMimeType() { return this; }, getContent() { return this.contenido; } })
    },
    MailApp: { sendEmail: (to, asunto, cuerpo) => enviados.push({ to, asunto, cuerpo }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'yo@example.com' }) },
    ScriptApp: {
      getProjectTriggers: () => disparadores.slice(),
      deleteTrigger: (t) => disparadores.splice(disparadores.indexOf(t), 1),
      newTrigger: constructorDisparador
    },
    Logger: { log: (...a) => logs.push(a) }
  });

  vm.runInContext(CODIGO, ctx, { filename: 'Codigo.gs' });
  const ahora = { iso: ahoraISO };
  ctx.ahora_ = () => new DateCtx(ahora.iso);

  const filaDe = (ymd) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return 4 + Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2026, 6, 6)) / 86400000);
  };
  const col = (encabezado) => ENCABEZADOS_DIARIO.indexOf(encabezado) + 1;

  return {
    ctx, ss, diario, form, enviados, disparadores, logs, props, ahora,
    run: (codigo) => vm.runInContext(codigo, ctx),
    fecha: (iso) => new DateCtx(iso),
    filaDe,
    celda: (ymd, encabezado) => diario._val(filaDe(ymd), col(encabezado)),
    nota: (ymd, encabezado) => diario._nota(filaDe(ymd), col(encabezado)),
    poner: (ymd, encabezado, v, nota) => {
      diario._set(filaDe(ymd), col(encabezado), v);
      if (nota !== undefined) diario.notas[filaDe(ymd) + ',' + col(encabezado)] = nota;
    },
    post: (body) => JSON.parse(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).getContent()),
    responderFormulario: (iso, respuestas) => {
      const f = form.getLastRow() + 1;
      form._set(f, 1, new DateCtx(iso));
      for (const [k, v] of Object.entries(respuestas)) form._set(f, ENCABEZADOS_FORM.indexOf(k) + 1, v);
      return f;
    }
  };
}

module.exports = { crearEntorno, ENCABEZADOS_DIARIO, ENCABEZADOS_FORM };
