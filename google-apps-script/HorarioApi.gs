/**
 * Horario PWA — Web App (doGet) & Sincronización Privada (doPost)
 *
 * CONFIGURACIÓN:
 * - SPREADSHEET_ID: ID de la hoja de Google Sheets privada.
 * - API_TOKEN: token secreto de autenticación.
 *
 * HOJAS Y CABECERAS:
 * - Alumno: IdAlumno, Nombre_alumno
 * - Clases: IdClase, IdAlumno, Dia_clase, Hora_clase, IdBono, Telefono, Link_zoom
 * - NotasHorasLibres: fecha, hora, nota, tipo
 * - EventosProfesor: id, fecha, hora, titulo, descripcion, color
 */

var SPREADSHEET_ID = '1vFnxKFSDxJGodQgH2hEjEcQfMCILxJPaqO4bhG9tdus';
var API_TOKEN = '212012Oscar10092015Ilovefalconry26losteletubbies666';

var SHEET_ALUMNO = 'Alumno';
var SHEET_CLASES = 'Clases';
var SHEET_NOTAS = 'NotasHorasLibres';
var SHEET_EVENTOS_PROFESOR = 'EventosProfesor';

var HOUR_START = 8;
var HOUR_END = 21; // Franja base de huecos libres (8:00 a 21:00). Las clases de las 22:00+ se muestran siempre.

var CLASS_COLOR = '#3498db';
var PROF_COLOR = '#c59b27';

function doGet(e) {
  e = e || {};
  var p = e.parameter || {};
  var token = String(p.token || '');
  var startStr = String(p.start || '');
  var endStr = String(p.end || '');

  if (!token || token !== API_TOKEN) {
    return jsonOut({ error: 'unauthorized' });
  }

  if (!startStr || !endStr) {
    return jsonOut({ error: 'start_and_end_required', hint: 'Use YYYY-MM-DD' });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr) || !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
    return jsonOut({ error: 'invalid_date_format' });
  }

  try {
    var events = buildEvents_(startStr, endStr);
    return jsonOut({ events: events });
  } catch (err) {
    return jsonOut({ error: 'server_error', message: String(err && err.message ? err.message : err) });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Recibe volcado desde PHP local (sync_privado.php) y reemplaza el contenido de las hojas privadas.
 */
function doPost(e) {
  e = e || {};
  var raw = e.postData && e.postData.contents ? e.postData.contents : '{}';
  var body;
  try {
    body = JSON.parse(raw);
  } catch (err1) {
    return jsonOut({ error: 'invalid_json' });
  }
  if (!body.token || body.token !== API_TOKEN) {
    return jsonOut({ error: 'unauthorized' });
  }
  try {
    writePrivateSheets_(body);
    return jsonOut({ ok: true });
  } catch (err2) {
    return jsonOut({ error: 'server_error', message: String(err2.message || err2) });
  }
}

function ensureSheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }
  return sh;
}

function writeSheetFromRows_(sheet, headers, rows) {
  sheet.clear();
  var nCols = headers.length;
  if (nCols === 0) return;
  sheet.getRange(1, 1, 1, nCols).setValues([headers]);
  if (!rows || rows.length === 0) return;
  var numRows = rows.length;
  sheet.getRange(2, 1, numRows, nCols).setValues(rows);
}

function writePrivateSheets_(body) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var al = body.alumnos;
  var cl = body.clases;
  var nt = body.notas;
  var ep = body.eventos_profesor;

  if (al === undefined && cl === undefined && nt === undefined && ep === undefined) {
    throw new Error('Missing data in JSON body');
  }

  if (al !== undefined) {
    writeSheetFromRows_(
      ensureSheet_(ss, SHEET_ALUMNO),
      ['IdAlumno', 'Nombre_alumno'],
      al || []
    );
  }
  if (cl !== undefined) {
    writeSheetFromRows_(
      ensureSheet_(ss, SHEET_CLASES),
      ['IdClase', 'IdAlumno', 'Dia_clase', 'Hora_clase', 'IdBono', 'Telefono', 'Link_zoom'],
      cl || []
    );
  }
  if (nt !== undefined) {
    writeSheetFromRows_(
      ensureSheet_(ss, SHEET_NOTAS),
      ['fecha', 'hora', 'nota', 'tipo'],
      nt || []
    );
  }
  if (ep !== undefined) {
    writeSheetFromRows_(
      ensureSheet_(ss, SHEET_EVENTOS_PROFESOR),
      ['id', 'fecha', 'hora', 'titulo', 'descripcion', 'color'],
      ep || []
    );
  }
}

function buildEvents_(startStr, endStr) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var alumnoMap = readAlumnoMap_(ss.getSheetByName(SHEET_ALUMNO));
  var clasesRows = readTable_(ss.getSheetByName(SHEET_CLASES));
  var notasMap = readNotasMap_(ss.getSheetByName(SHEET_NOTAS), startStr, endStr);
  var profSheet = ss.getSheetByName(SHEET_EVENTOS_PROFESOR);
  var profEvents = profSheet ? buildProfEvents_(profSheet, startStr, endStr) : [];

  var classEvents = buildClassEvents_(clasesRows, alumnoMap, startStr, endStr);

  // Agrupar todos los eventos coincidentes por fecha y hora (permite división en 2, 3 o más partes)
  var itemsPorHora = {};
  for (var i = 0; i < classEvents.length; i++) {
    var dt = classEvents[i].start;
    if (!itemsPorHora[dt]) itemsPorHora[dt] = [];
    var evA = classEvents[i];
    itemsPorHora[dt].push({
      tipo: 'alumno',
      id: evA.id,
      titulo: evA.title,
      nombre_alumno: evA.extendedProps ? evA.extendedProps.nombre_alumno : evA.title,
      color: evA.color || CLASS_COLOR,
      datos: evA
    });
  }

  for (var j = 0; j < profEvents.length; j++) {
    var dtP = profEvents[j].start;
    if (!itemsPorHora[dtP]) itemsPorHora[dtP] = [];
    var evP = profEvents[j];
    itemsPorHora[dtP].push({
      tipo: 'profesor',
      id: evP.extendedProps ? evP.extendedProps.id_propia : j,
      titulo: evP.extendedProps ? evP.extendedProps.titulo : evP.title,
      color: evP.color || PROF_COLOR,
      datos: evP
    });
  }

  var combinedEvents = [];
  for (var dtKey in itemsPorHora) {
    var itemsEnHora = itemsPorHora[dtKey];
    var total = itemsEnHora.length;
    if (total === 1) {
      combinedEvents.push(itemsEnHora[0].datos);
    } else {
      var ids = itemsEnHora.map(function (it) { return it.tipo.charAt(0) + it.id; });
      var titulos = itemsEnHora.map(function (it) { return it.titulo; });
      combinedEvents.push({
        id: 'compartido_' + ids.join('_'),
        title: titulos.join(' | '),
        start: dtKey,
        classNames: ['fc-evento-dividido', 'fc-partes-' + total],
        extendedProps: {
          es_compartido: true,
          total_partes: total,
          items: itemsEnHora
        }
      });
    }
  }

  // Conjunto de horas ocupadas (alumnos + profesor) para no duplicar horas libres
  var horasAgendadasSet = {};
  for (var m = 0; m < classEvents.length; m++) {
    horasAgendadasSet[classEvents[m].start] = true;
  }
  for (var n = 0; n < profEvents.length; n++) {
    horasAgendadasSet[profEvents[n].start] = true;
  }

  var libreEvents = buildLibreEvents_(startStr, endStr, horasAgendadasSet, notasMap);
  var allEvents = combinedEvents.concat(libreEvents);
  allEvents.sort(function (e1, e2) {
    return new Date(e1.start).getTime() - new Date(e2.start).getTime();
  });
  return allEvents;
}

function buildProfEvents_(sheet, startStr, endStr) {
  if (!sheet) return [];
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = normalizeHeaders_(values[0]);
  var idxId = headers.indexOf('id');
  var idxFecha = headers.indexOf('fecha');
  var idxHora = headers.indexOf('hora');
  var idxTitulo = headers.indexOf('titulo');
  var idxDesc = headers.indexOf('descripcion');
  var idxColor = headers.indexOf('color');
  if (idxFecha < 0 || idxHora < 0 || idxTitulo < 0) return [];

  var startD = parseYmd_(startStr);
  var endD = parseYmd_(endStr);
  var out = [];

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var fecha = formatDateCell_(row[idxFecha]);
    if (!fecha) continue;
    var d = parseYmd_(fecha);
    if (d < startD || d > endD) continue;

    var hora = normalizeTimeToHms_(row[idxHora]);
    var startIso = fecha + 'T' + hora;
    var idVal = idxId >= 0 ? row[idxId] : r;
    var titulo = String(row[idxTitulo] == null ? 'Evento' : row[idxTitulo]);
    var desc = idxDesc >= 0 && row[idxDesc] != null ? String(row[idxDesc]) : '';
    var color = idxColor >= 0 && row[idxColor] ? String(row[idxColor]) : PROF_COLOR;
    if (color === '#9b59b6' || color === '#8e44ad') color = PROF_COLOR;

    out.push({
      id: 'propia_' + idVal,
      title: '🎓 ' + titulo,
      start: startIso,
      color: color,
      classNames: ['fc-evento-profesor'],
      extendedProps: {
        es_evento_profesor: true,
        es_clase_propia: true,
        id_propia: idVal,
        titulo: titulo,
        descripcion: desc,
        fecha: fecha,
        hora: hora.substring(0, 5),
        color: color
      }
    });
  }
  return out;
}

function readAlumnoMap_(sheet) {
  if (!sheet) throw new Error('Missing sheet: ' + SHEET_ALUMNO);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return {};
  var headers = normalizeHeaders_(values[0]);
  var idxId = headers.indexOf('idalumno');
  var idxNombre = headers.indexOf('nombre_alumno');
  if (idxId < 0 || idxNombre < 0) {
    throw new Error('Alumno sheet must have IdAlumno and Nombre_alumno headers');
  }
  var map = {};
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var id = row[idxId];
    var nombre = row[idxNombre];
    if (id === '' || id === null) continue;
    map[String(id)] = nombre == null ? '' : String(nombre);
  }
  return map;
}

function readTable_(sheet) {
  if (!sheet) throw new Error('Missing sheet: ' + SHEET_CLASES);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return { headers: [], rows: [] };
  var headers = normalizeHeaders_(values[0]);
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    rows.push(values[r]);
  }
  return { headers: headers, rows: rows };
}

function readNotasMap_(sheet, startStr, endStr) {
  var map = {};
  if (!sheet) return map;
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return map;
  var headers = normalizeHeaders_(values[0]);
  var idxFecha = headers.indexOf('fecha');
  var idxHora = headers.indexOf('hora');
  var idxNota = headers.indexOf('nota');
  var idxTipo = headers.indexOf('tipo');
  if (idxFecha < 0 || idxHora < 0 || idxNota < 0) {
    throw new Error('NotasHorasLibres must have fecha, hora, nota');
  }
  var startD = parseYmd_(startStr);
  var endD = parseYmd_(endStr);
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var fecha = formatDateCell_(row[idxFecha]);
    if (!fecha) continue;
    var fd = parseYmd_(fecha);
    if (fd < startD || fd > endD) continue;
    var hora = normalizeTimeToHms_(row[idxHora]);
    var key = fecha + ' ' + hora;
    var tipo = idxTipo >= 0 && row[idxTipo] !== '' && row[idxTipo] != null
      ? String(row[idxTipo]).trim().toLowerCase()
      : 'recordatorio';
    map[key] = {
      nota: String(row[idxNota] == null ? '' : row[idxNota]),
      tipo: tipo
    };
  }
  return map;
}

function buildClassEvents_(table, alumnoMap, startStr, endStr) {
  var headers = table.headers;
  var rows = table.rows;
  var idxIdClase = headers.indexOf('idclase');
  var idxIdAlumno = headers.indexOf('idalumno');
  var idxDia = headers.indexOf('dia_clase');
  var idxHora = headers.indexOf('hora_clase');
  var idxTel = headers.indexOf('telefono');
  var idxZoom = headers.indexOf('link_zoom');
  var idxBono = headers.indexOf('idbono');
  if (idxIdAlumno < 0 || idxDia < 0 || idxHora < 0) {
    throw new Error('Clases sheet must have IdAlumno, Dia_clase, Hora_clase');
  }
  var startD = parseYmd_(startStr);
  var endD = parseYmd_(endStr);
  var maxPerBono = computeMaxDtPerBono_(headers, rows);
  var out = [];

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var dia = formatDateCell_(row[idxDia]);
    if (!dia) continue;
    var d = parseYmd_(dia);
    if (d < startD || d > endD) continue;

    var idAlumno = row[idxIdAlumno];
    var nombre = alumnoMap[String(idAlumno)] || 'Alumno';
    var hora = normalizeTimeToHms_(row[idxHora]);
    var startIso = dia + 'T' + hora;

    var idClase = idxIdClase >= 0 ? row[idxIdClase] : null;
    var idBono = idxBono >= 0 ? row[idxBono] : null;
    var telefono = idxTel >= 0 ? row[idxTel] : null;
    var linkZoom = idxZoom >= 0 ? row[idxZoom] : null;

    var esUltima = false;
    if (idBono !== null && idBono !== '' && maxPerBono[String(idBono)]) {
      var maxDt = maxPerBono[String(idBono)];
      esUltima = (dia + ' ' + hora) === maxDt;
    }

    var ext = {
      nombre_alumno: nombre,
      idBono: idBono,
      es_ultima_clase: esUltima
    };
    if (telefono !== null && telefono !== '') ext.telefono = String(telefono);
    if (linkZoom !== null && linkZoom !== '') ext.link_zoom = String(linkZoom);

    var idNum = idClase !== null && idClase !== '' ? Number(idClase) : NaN;
    var ev = {
      id: !isNaN(idNum) ? idNum : startIso,
      title: nombre,
      start: startIso,
      color: CLASS_COLOR,
      extendedProps: ext
    };

    if (esUltima) ev.classNames = ['fc-ultima-clase-bono'];

    out.push(ev);
  }
  return out;
}

function computeMaxDtPerBono_(headers, rows) {
  var idxBono = headers.indexOf('idbono');
  var idxDia = headers.indexOf('dia_clase');
  var idxHora = headers.indexOf('hora_clase');
  if (idxBono < 0) return {};
  var maxMap = {};
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var bono = row[idxBono];
    if (bono === null || bono === '') continue;
    var dia = formatDateCell_(row[idxDia]);
    if (!dia) continue;
    var hora = normalizeTimeToHms_(row[idxHora]);
    var dt = dia + ' ' + hora;
    var key = String(bono);
    if (!maxMap[key] || dt > maxMap[key]) maxMap[key] = dt;
  }
  return maxMap;
}

function buildLibreEvents_(startStr, endStr, horasAgendadasSet, notasMap) {
  var list = [];
  var cur = parseYmd_(startStr);
  var end = parseYmd_(endStr);
  while (cur <= end) {
    var fechaFormateada = formatYmd_(cur);
    for (var h = HOUR_START; h <= HOUR_END; h++) {
      var horaFormateada = pad2_(h) + ':00:00';
      var fechaHora = fechaFormateada + 'T' + horaFormateada;
      if (horasAgendadasSet[fechaHora]) continue;

      var key = fechaFormateada + ' ' + horaFormateada;
      var tieneNota = notasMap[key];
      var tipo = tieneNota ? tieneNota.tipo : null;
      var color = null;
      if (tieneNota) {
        color = colorForTipo_(tipo);
      }
      var classes = tieneNota ? ['fc-hora-libre-con-nota'] : ['fc-hora-libre'];
      if (tipo) classes.push('fc-' + tipo);

      list.push({
        id: 'libre_' + fechaHora,
        title: tieneNota ? tieneNota.nota : 'LIBRE',
        start: fechaHora,
        color: color,
        classNames: classes,
        extendedProps: {
          nota: tieneNota ? tieneNota.nota : null,
          tipo: tipo
        }
      });
    }
    cur.setDate(cur.getDate() + 1);
  }
  return list;
}

function colorForTipo_(tipo) {
  if (tipo === 'personal') return '#28a745';
  if (tipo === 'recordatorio') return '#f39c12';
  if (tipo === 'urgente') return '#e74c3c';
  if (tipo === 'clase') return CLASS_COLOR;
  return '#95a5a6';
}

function normalizeHeaders_(row) {
  var out = [];
  for (var i = 0; i < row.length; i++) {
    var h = String(row[i] == null ? '' : row[i])
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    out.push(h);
  }
  return out;
}

function formatDateCell_(cell) {
  if (cell instanceof Date) {
    return formatYmd_(cell);
  }
  if (cell === null || cell === '') return '';
  var s = String(cell).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  return s;
}

function formatYmd_(d) {
  return d.getFullYear() + '-' + pad2_(d.getMonth() + 1) + '-' + pad2_(d.getDate());
}

function parseYmd_(s) {
  var parts = s.split('-');
  var y = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10) - 1;
  var day = parseInt(parts[2], 10);
  var d = new Date(y, m, day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function pad2_(n) {
  return n < 10 ? '0' + n : String(n);
}

function normalizeTimeToHms_(cell) {
  if (cell instanceof Date) {
    return pad2_(cell.getHours()) + ':' + pad2_(cell.getMinutes()) + ':00';
  }
  var s = String(cell == null ? '' : cell).trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
    var parts = s.split(':');
    var hh = pad2_(parseInt(parts[0], 10));
    var mm = pad2_(parseInt(parts[1], 10));
    var ss = parts[2] != null ? pad2_(parseInt(parts[2], 10)) : '00';
    return hh + ':' + mm + ':' + ss;
  }
  return '09:00:00';
}
