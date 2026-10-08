'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno } = require('./entorno-gas');

const T = 'secreto';
// 22:00 del jueves 08/10/2026 en Argentina = 01:00 UTC del 09/10
const AHORA = '2026-10-09T01:00:00Z';

test('el día se calcula en hora argentina, con corte a las 4:00', () => {
  const E = crearEntorno();
  E.ahora.iso = '2026-10-09T01:00:00Z'; // 22:00 ART
  assert.equal(E.run('fechaHoy_()'), '2026-10-08');
  E.ahora.iso = '2026-10-09T05:30:00Z'; // 02:30 ART → todavía es el 08
  assert.equal(E.run('fechaHoy_()'), '2026-10-08');
  E.ahora.iso = '2026-10-09T08:00:00Z'; // 05:00 ART → ya es el 09
  assert.equal(E.run('fechaHoy_()'), '2026-10-09');
});

test('encuentra la fila por fecha aunque la planilla esté en hora de Los Ángeles', () => {
  const E = crearEntorno();
  const D = E.run('D = diario_(); D');
  assert.equal(E.run('filaDeFecha_(D, "2026-07-06")'), 4);
  // En la planilla real, el 06/10/2026 está en la fila 96
  assert.equal(E.run('filaDeFecha_(D, "2026-10-06")'), 96);
  assert.equal(E.run('filaDeFecha_(D, "2030-01-01")'), 0);
  assert.equal(D.cols.pasos, 9);   // columna I
  assert.equal(D.cols.kcal, 11);   // columna K
  assert.equal(D.cols.entreno, 16); // columna P
});

test('lee números en cualquier formato que pueda mandar el iPhone', () => {
  const E = crearEntorno();
  const casos = [
    ['8432', 'pasos', 8432], ['8.432', 'pasos', 8432], ['8,432', 'pasos', 8432], ['6012 pasos', 'pasos', 6012],
    ['1.950,5', 'kcal', 1950.5], ['1950.5 kcal', 'kcal', 1950.5], ['1,950.5', 'kcal', 1950.5],
    ['80,5', 'peso', 80.5], ['7.5', 'sueno', 7.5], ['2,5', 'agua', 2.5], ['—', 'pasos', null], ['', 'pasos', null]
  ];
  for (const [crudo, campo, esperado] of casos) {
    assert.equal(E.run(`aNumero_(${JSON.stringify(crudo)}, ${JSON.stringify(campo)})`), esperado, crudo);
  }
});

test('convierte unidades y rechaza valores absurdos', () => {
  const E = crearEntorno();
  const conv = (campo, crudo) => JSON.parse(E.run(`JSON.stringify(convertir_(${JSON.stringify(campo)}, ${JSON.stringify(crudo)}))`));
  const val = (campo, v) => JSON.parse(E.run(`JSON.stringify(validar_(${JSON.stringify(campo)}, ${v}))`));
  assert.equal(Math.round(conv('kcal', '8368 kJ').valor), 2000);
  assert.equal(conv('agua', '1500 mL').valor, 1.5);
  assert.equal(conv('agua', '2500').valor, 2.5);
  assert.equal(conv('entreno', 'si').valor, 'Sí');
  assert.ok(conv('entreno', 'quizás').error);
  assert.ok(conv('animo', 'Saltar').vacio);
  assert.ok(val('kcal', 9000).error, 'kcal fuera de rango (¿kJ?)');
  assert.ok(val('animo', 7).error);
  assert.equal(val('peso', 80.44).valor, 80.4);
});

test('rechaza pedidos sin token o con token equivocado', () => {
  const E = crearEntorno({ ahoraISO: AHORA });
  assert.equal(E.post({ accion: 'estado' }).ok, false);
  assert.equal(E.post({ accion: 'estado', token: 'otro' }).ok, false);
  assert.equal(E.post('esto no es json').ok, false);
  assert.equal(E.post({ accion: 'borrar', token: T }).ok, false);
  const sinToken = crearEntorno({ token: null });
  assert.equal(sinToken.post({ accion: 'estado', token: '' }).ok, false);
});

test('sincronizar escribe pasos y nutrición de hoy y ayer, con nota auto', () => {
  const E = crearEntorno({ ahoraISO: AHORA });
  const r = E.post({
    accion: 'sincronizar', token: T,
    pasos: '2026-10-06=9000;2026-10-07=10234;2026-10-08=6012',
    kcal: '2026-10-07=1.950,5;2026-10-08=1200',
    proteina: '2026-10-08=95 g'
  });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.fecha, '2026-10-08');
  assert.equal(E.celda('2026-10-06', 'Pasos'), '', 'antes de ayer no se toca');
  assert.equal(E.celda('2026-10-07', 'Pasos'), 10234);
  assert.equal(E.celda('2026-10-07', 'Calorías'), 1951);
  assert.equal(E.celda('2026-10-08', 'Pasos'), 6012);
  assert.equal(E.celda('2026-10-08', 'Proteína (g)'), 95);
  assert.match(E.nota('2026-10-08', 'Pasos'), /^auto: Salud · 08\/10 22:00/);
  assert.deepEqual(r.sincronizado.ignorados, ['pasos 2026-10-06']);
  assert.equal(r.estado, 'incompleto');
  assert.ok(!r.faltan.includes('pasos') && !r.faltan.includes('kcal') && !r.faltan.includes('proteina'));
  assert.ok(r.faltan.includes('peso') && r.faltan.includes('animo'));
  assert.equal(r.preguntas.length, r.faltan.length);
  assert.match(r.resumen, /Ya tengo: 6\.012 pasos · 1\.200 kcal · 95 g proteína/);
  assert.match(r.resumen, /Ayer quedó sin: peso/);
});

test('Salud actualiza lo que escribió Salud, pero nunca pisa lo que cargaste vos', () => {
  const E = crearEntorno({ ahoraISO: AHORA });
  E.post({ accion: 'sincronizar', token: T, pasos: '2026-10-08=6012' });
  E.poner('2026-10-07', 'Pasos', 11000); // cargado a mano, sin nota
  const r = E.post({ accion: 'sincronizar', token: T, pasos: '2026-10-07=10234;2026-10-08=7400' });
  assert.equal(E.celda('2026-10-08', 'Pasos'), 7400, 'el parcial de las 22:00 se actualiza');
  assert.equal(E.celda('2026-10-07', 'Pasos'), 11000, 'lo manual se respeta');
  assert.deepEqual(r.sincronizado.protegidos, ['pasos 2026-10-07=10234']);
});

test('suma muestras repetidas del mismo día (pasos) y toma la última del peso', () => {
  const E = crearEntorno({ ahoraISO: AHORA });
  E.post({ accion: 'sincronizar', token: T, pasos: ['2026-10-08=3000', '2026-10-08=3012'], peso: { '2026-10-08': '80,6', '2026-10-8': '80,4' } });
  assert.equal(E.celda('2026-10-08', 'Pasos'), 6012);
  assert.equal(E.celda('2026-10-08', 'Peso (kg)'), 80.4);
});

test('un número suelto se toma como de hoy', () => {
  const E = crearEntorno({ ahoraISO: AHORA });
  E.post({ accion: 'sincronizar', token: T, pasos: 4321, kcal: '1800' });
  assert.equal(E.celda('2026-10-08', 'Pasos'), 4321);
  assert.equal(E.celda('2026-10-08', 'Calorías'), 1800);
});

test('responder: escribe tus respuestas, saltea lo vacío y rechaza lo inválido', () => {
  const E = crearEntorno({ ahoraISO: AHORA });
  E.post({ accion: 'sincronizar', token: T, pasos: '2026-10-08=6012' });
  const r = E.post({
    accion: 'responder', token: T,
    respuestas: { peso: '80,4', animo: '4', entreno: 'Sí', hambre: 'Saltar', sueno: '', agua: '0', inventado: 3 }
  });
  assert.equal(r.ok, true, r.error);
  assert.equal(E.celda('2026-10-08', 'Peso (kg)'), 80.4);
  assert.equal(E.celda('2026-10-08', 'Ánimo'), 4);
  assert.equal(E.celda('2026-10-08', 'Entrené'), 'Sí');
  assert.equal(E.celda('2026-10-08', 'Hambre'), '');
  assert.equal(E.celda('2026-10-08', 'Agua (L)'), '', 'agua 0 no es un dato');
  assert.match(E.nota('2026-10-08', 'Peso (kg)'), /^agente · /);
  assert.equal(r.respondido.rechazados.length, 1);
  assert.deepEqual(r.respondido.ignorados, ['inventado']);
  // Después, Salud no pisa el peso que diste vos
  E.post({ accion: 'sincronizar', token: T, peso: '2026-10-08=81' });
  assert.equal(E.celda('2026-10-08', 'Peso (kg)'), 80.4);
});

test('respuestas como texto JSON (así puede llegar un diccionario del Atajo)', () => {
  const E = crearEntorno({ ahoraISO: AHORA });
  E.post({ accion: 'responder', token: T, respuestas: JSON.stringify({ energia: '3' }) });
  assert.equal(E.celda('2026-10-08', 'Energía'), 3);
});

test('no deja responder por días viejos', () => {
  const E = crearEntorno({ ahoraISO: AHORA });
  const r = E.post({ accion: 'responder', token: T, fecha: '2026-10-01', respuestas: { animo: 3 } });
  assert.equal(r.ok, false);
  assert.equal(E.celda('2026-10-01', 'Ánimo'), '');
});

test('día completo: estado «completo», sin preguntas y con cumplimiento', () => {
  const E = crearEntorno({ ahoraISO: AHORA });
  E.post({ accion: 'sincronizar', token: T, pasos: '2026-10-08=10500', kcal: '2026-10-08=2100', proteina: '2026-10-08=165' });
  E.poner('2026-10-08', 'Cumpl. %', 0.8333);
  E.poner('2026-10-08', 'Racha', 2);
  const r = E.post({
    accion: 'responder', token: T,
    respuestas: { peso: '80', agua: '3', sueno: '7,5', calSueno: '4', animo: '4', energia: '3', hambre: '2', entreno: 'Sí' }
  });
  assert.equal(r.estado, 'completo');
  assert.deepEqual(r.preguntas, []);
  assert.match(r.resumen, /completo ✔ · cumplimiento 83% · racha 2/);
});

test('las preguntas que arma para el Atajo', () => {
  const E = crearEntorno({ ahoraISO: AHORA });
  const r = E.post({ accion: 'estado', token: T });
  const porCampo = Object.fromEntries(r.preguntas.map((p) => [p.campo, p]));
  assert.deepEqual(porCampo.animo.opciones, ['1', '2', '3', '4', '5', 'Saltar']);
  assert.equal(porCampo.animo.tipo, 'lista');
  assert.deepEqual(porCampo.entreno.opciones, ['Sí', 'No', 'Saltar']);
  assert.equal(porCampo.peso.tipo, 'numero');
  assert.ok(!('cardio' in porCampo), 'cardio no es obligatorio');
  assert.match(r.resumen, /Ayer \(mié 07\/10\) no tiene registro/);
  assert.equal(r.form_url, 'https://docs.google.com/forms/d/FORM/viewform');
  assert.equal(r.hoja_url, 'https://docs.google.com/spreadsheets/d/PLANILLA/edit#gid=568593370&range=A98');
});

test('formulario: pasado medianoche cuenta para el día anterior y pisa lo automático', () => {
  const E = crearEntorno({ ahoraISO: AHORA });
  E.post({ accion: 'sincronizar', token: T, pasos: '2026-10-08=6012', kcal: '2026-10-08=1200' });
  // 00:10 del 09/10 en Argentina
  const fila = E.responderFormulario('2026-10-09T03:10:00Z', {
    'Peso (kg)': '80,5', 'Agua (L)': '3', 'Sueño (h)': '7.5', 'Calidad de sueño (1-5)': '4',
    'Pasos': '', 'Calorías': '2100', 'Ánimo (1-5)': '4', '¿Entrenaste hoy?': 'No'
  });
  E.ctx.__e = { range: E.form.getRange(fila, 1, 1, 14) };
  E.run('alEnviarFormulario(__e)');
  assert.equal(E.celda('2026-10-08', 'Peso (kg)'), 80.5);
  assert.equal(E.celda('2026-10-08', 'Sueño (h)'), 7.5);
  assert.equal(E.celda('2026-10-08', 'Cal.Sueño'), 4);
  assert.equal(E.celda('2026-10-08', 'Entrené'), 'No');
  assert.equal(E.celda('2026-10-08', 'Pasos'), 6012, 'pregunta vacía: queda lo de Salud');
  assert.equal(E.celda('2026-10-08', 'Calorías'), 2100, 'lo que contestaste manda');
  assert.equal(E.nota('2026-10-08', 'Calorías'), '', 'deja de ser automático');
  assert.equal(E.celda('2026-10-09', 'Peso (kg)'), '');
});

test('importarFormulario sólo llena celdas vacías', () => {
  const E = crearEntorno({ ahoraISO: AHORA });
  E.poner('2026-09-10', 'Peso (kg)', 81);
  E.responderFormulario('2026-09-10T22:00:00Z', { 'Peso (kg)': '82', 'Pasos': '5000', 'Ánimo (1-5)': '4' });
  E.responderFormulario('2026-09-11T22:00:00Z', { 'Peso (kg)': '80', 'Hambre (1-5)': '9' });
  const r = E.run('importarFormulario()');
  assert.equal(E.celda('2026-09-10', 'Peso (kg)'), 81, 'no pisa');
  assert.equal(E.celda('2026-09-10', 'Pasos'), 5000);
  assert.equal(E.celda('2026-09-11', 'Peso (kg)'), 80);
  assert.equal(E.celda('2026-09-11', 'Hambre'), '', 'hambre 9 es inválido');
  assert.equal(r.respuestas, 2);
  assert.equal(r.celdas, 3);
});

test('revisión nocturna: manda mail sólo si falta algo', () => {
  const E = crearEntorno({ ahoraISO: '2026-10-09T02:30:00Z' }); // 23:30 ART
  E.run('revisionNocturna()');
  assert.equal(E.enviados.length, 1);
  assert.equal(E.enviados[0].to, 'yo@example.com');
  assert.match(E.enviados[0].asunto, /jue 08\/10: falta 11/);
  assert.match(E.enviados[0].cuerpo, /forms\/d\/FORM/);
  assert.doesNotMatch(E.enviados[0].cuerpo, /\n\n\n/);

  E.post({ accion: 'sincronizar', token: T, pasos: 9000, kcal: 2000, proteina: 160 });
  E.post({ accion: 'responder', token: T, respuestas: { peso: 80, agua: 3, sueno: 7, calSueno: 4, animo: 4, energia: 4, hambre: 2, entreno: 'Sí' } });
  E.run('revisionNocturna()');
  assert.equal(E.enviados.length, 1, 'día completo: no molesta');
});

test('revisión nocturna: rescata una respuesta del formulario que no se copió', () => {
  const E = crearEntorno({ ahoraISO: '2026-10-09T02:30:00Z' });
  E.responderFormulario('2026-10-09T01:40:00Z', { 'Peso (kg)': '80,2' });
  E.run('revisionNocturna()');
  assert.equal(E.celda('2026-10-08', 'Peso (kg)'), 80.2);
});

test('instalar: crea token y disparadores sin duplicarlos', () => {
  const E = crearEntorno({ token: null, ahoraISO: AHORA });
  const token = E.run('instalar()');
  assert.match(token, /^[0-9a-f]{32}$/);
  assert.equal(E.props.TOKEN, token);
  E.run('instalar()');
  assert.equal(E.disparadores.length, 2);
  const noche = E.disparadores.find((t) => t.handler === 'revisionNocturna');
  assert.deepEqual([noche.hora, noche.minuto, noche.zona], [23, 30, 'America/Argentina/Buenos_Aires']);
  assert.ok(E.disparadores.some((t) => t.handler === 'alEnviarFormulario'));
  assert.equal(E.props.TOKEN, token, 'reinstalar no cambia el token');
});

test('falla con un mensaje claro si cambian un encabezado del Diario', () => {
  const E = crearEntorno({ ahoraISO: AHORA });
  E.diario._set(3, 9, 'Pasos diarios');
  const r = E.post({ accion: 'estado', token: T });
  assert.equal(r.ok, false);
  assert.match(r.error, /Falta la columna «Pasos»/);
});

test('deja un registro oculto de cada operación', () => {
  const E = crearEntorno({ ahoraISO: AHORA });
  E.post({ accion: 'sincronizar', token: T, pasos: 100 });
  const h = E.ss.getSheetByName('_Automatizacion');
  assert.ok(h && h.oculta);
  assert.equal(h.getRange(2, 2).getValue(), 'sincronizar');
});

test('si la planilla está ocupada, el Atajo recibe un error en JSON (no una página HTML)', () => {
  const E = crearEntorno({ ahoraISO: AHORA });
  E.ctx.LockService = { getScriptLock: () => ({ waitLock() { throw new Error('Timeout del lock'); }, releaseLock() {} }) };
  const r = E.post({ accion: 'sincronizar', token: T, pasos: 100 });
  assert.equal(r.ok, false);
  assert.match(r.error, /Timeout/);
  assert.equal(E.celda('2026-10-08', 'Pasos'), '');
});
