/**
 * Horario PWA — solo lectura, datos desde Google Apps Script.
 *
 * Despliegue GitHub Pages: sube esta carpeta al repo; en manifest.json ajusta start_url si usas subruta (/nombre-repo/).
 * Prueba local: `npx --yes serve` en esta carpeta (evita file:// por CORS/service worker).
 */

const LS_URL = 'horario_api_url';
const LS_TOKEN = 'horario_api_token';

const screenConfig = document.getElementById('screen-config');
const screenApp = document.getElementById('screen-app');
const formConfig = document.getElementById('form-config');
const inputApiUrl = document.getElementById('input-api-url');
const inputToken = document.getElementById('input-token');
const btnRefresh = document.getElementById('btn-refresh');
const btnReconfig = document.getElementById('btn-reconfig');
const statusBar = document.getElementById('status-bar');
const modal = document.getElementById('modal');
const modalBackdrop = document.getElementById('modal-backdrop');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalClose = document.getElementById('modal-close');

let calendar = null;

function showStatus(message, isError) {
  statusBar.textContent = message || '';
  statusBar.classList.toggle('status-bar--error', !!isError);
}

function getStoredConfig() {
  const apiUrl = localStorage.getItem(LS_URL);
  const token = localStorage.getItem(LS_TOKEN);
  if (!apiUrl || !token) return null;
  return { apiUrl: apiUrl.trim(), token: token.trim() };
}

function showConfigScreen(prefill) {
  screenApp.hidden = true;
  screenConfig.hidden = false;
  if (prefill) {
    inputApiUrl.value = prefill.apiUrl || '';
    inputToken.value = prefill.token || '';
  }
}

function showAppScreen() {
  screenConfig.hidden = true;
  screenApp.hidden = false;
}

function buildApiUrl(base, token, startStr, endStr) {
  const u = new URL(base);
  u.searchParams.set('token', token);
  u.searchParams.set('start', startStr);
  u.searchParams.set('end', endStr);
  return u.toString();
}

async function fetchEvents(fetchInfo) {
  const cfg = getStoredConfig();
  if (!cfg) throw new Error('Sin configuración');

  const start = fetchInfo.startStr.slice(0, 10);
  const end = fetchInfo.endStr.slice(0, 10);
  const url = buildApiUrl(cfg.apiUrl, cfg.token, start, end);
  const res = await fetch(url);
  const data = await res.json();

  if (data && data.error === 'unauthorized') {
    throw new Error('Token no válido o no autorizado');
  }
  if (data && data.error) {
    throw new Error(data.message || data.error || 'Error del servidor');
  }

  const events = Array.isArray(data) ? data : data.events;
  if (!Array.isArray(events)) {
    throw new Error('Respuesta inesperada (falta events)');
  }

  return events;
}

function applyLibreColors(info) {
  const idStr = String(info.event.id);
  if (!idStr.startsWith('libre_')) return;

  let color = null;
  const tipo = info.event.extendedProps && info.event.extendedProps.tipo;
  if (typeof tipo === 'string') {
    const t = tipo.toLowerCase();
    if (t === 'personal') color = '#28a745';
    else if (t === 'recordatorio') color = '#f39c12';
    else if (t === 'urgente') color = '#e74c3c';
    else if (t === 'clase') color = '#3498db';
  }
  if (color && info.el && info.el.style) {
    info.el.style.backgroundColor = color;
  }
}

function openModal(title, html) {
  modalTitle.textContent = title;
  modalBody.innerHTML = html;
  modal.hidden = false;
  modalBackdrop.hidden = false;
  document.body.style.overflow = 'hidden';
  modalClose.focus();
}

function closeModal() {
  modal.hidden = true;
  modalBackdrop.hidden = true;
  document.body.style.overflow = '';
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function formatWhen(start) {
  if (!start) return '';
  const d = start instanceof Date ? start : new Date(start);
  if (Number.isNaN(d.getTime())) return '';
  return (
    d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  );
}

function onEventClick(info) {
  const ev = info.event;
  const idStr = String(ev.id);
  const start = ev.start;

  if (idStr.startsWith('libre_')) {
    const tipo = (ev.extendedProps && ev.extendedProps.tipo) || '';
    const nota = (ev.extendedProps && ev.extendedProps.nota) || ev.title || '';
    const isLibre = !nota || ev.title === 'LIBRE';
    const html = `
      <dl>
        <dt>Fecha y hora</dt>
        <dd>${escapeHtml(formatWhen(start))}</dd>
        <dt>Estado</dt>
        <dd>${isLibre ? 'Hora libre' : 'Nota en hora libre'}</dd>
        ${tipo ? `<dt>Tipo</dt><dd>${escapeHtml(tipo)}</dd>` : ''}
        ${nota && !isLibre ? `<dt>Texto</dt><dd>${escapeHtml(nota)}</dd>` : ''}
      </dl>`;
    openModal(isLibre ? 'Hora libre' : 'Nota', html);
    return;
  }

  const ep = ev.extendedProps || {};
  const nombre = ep.nombre_alumno || ev.title || 'Clase';
  const telefono = ep.telefono || '';
  const linkZoom = ep.link_zoom || '';
  const idBono = ep.idBono != null && ep.idBono !== '' ? String(ep.idBono) : '';
  const esUltima = ep.es_ultima_clase === true || ep.es_ultima_clase === 'true';

  let html = `
    <dl>
      <dt>Fecha y hora</dt>
      <dd>${escapeHtml(formatWhen(start))}</dd>
      <dt>Alumno</dt>
      <dd>${escapeHtml(nombre)}</dd>`;
  if (telefono) {
    html += `<dt>Teléfono</dt><dd>${escapeHtml(telefono)}</dd>`;
  }
  if (linkZoom) {
    const safe = escapeHtml(linkZoom);
    html += `<dt>Enlace</dt><dd><a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a></dd>`;
  }
  if (idBono) {
    html += `<dt>Id bono</dt><dd>${escapeHtml(idBono)}</dd>`;
  }
  if (esUltima) {
    html += `<dt>Última clase del bono</dt><dd>Sí</dd>`;
  }
  html += '</dl>';
  openModal('Clase', html);
}

function destroyCalendar() {
  if (calendar) {
    calendar.destroy();
    calendar = null;
  }
}

function initCalendar() {
  const el = document.getElementById('calendar');
  destroyCalendar();

  calendar = new FullCalendar.Calendar(el, {
    initialView: 'timeGridWeek',
    locale: 'es',
    firstDay: 1,
    nowIndicator: true,
    slotMinTime: '08:00:00',
    slotMaxTime: '22:00:00',
    scrollTime: '08:00:00',
    allDaySlot: false,
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'timeGridWeek,dayGridMonth,timeGridDay'
    },
    height: 'auto',
    editable: false,
    selectable: false,
    dayMaxEvents: true,
    events: function (fetchInfo, successCallback, failureCallback) {
      showStatus('Cargando…');
      fetchEvents(fetchInfo)
        .then((list) => {
          showStatus('');
          successCallback(list);
        })
        .catch((err) => {
          showStatus(err.message || 'Error al cargar', true);
          failureCallback(err);
        });
    },
    eventDidMount: applyLibreColors,
    eventClick: onEventClick,
    eventsSet: () => {
      showStatus('');
    }
  });

  calendar.render();
}

formConfig.addEventListener('submit', (e) => {
  e.preventDefault();
  const apiUrl = inputApiUrl.value.trim();
  const token = inputToken.value.trim();
  if (!apiUrl || !token) return;

  localStorage.setItem(LS_URL, apiUrl);
  localStorage.setItem(LS_TOKEN, token);
  showAppScreen();
  initCalendar();
});

btnRefresh.addEventListener('click', () => {
  if (calendar) {
    showStatus('Actualizando…');
    calendar.refetchEvents();
  }
});

btnReconfig.addEventListener('click', () => {
  destroyCalendar();
  showConfigScreen(getStoredConfig());
});

modalClose.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.hidden) closeModal();
});

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const isLocal =
    location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '[::1]';
  const isSecure = location.protocol === 'https:' || isLocal;
  if (!isSecure) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js', { scope: './' }).catch(() => {});
  });
}

function boot() {
  registerServiceWorker();
  const cfg = getStoredConfig();
  if (cfg) {
    showAppScreen();
    initCalendar();
  } else {
    showConfigScreen();
  }
}

boot();
