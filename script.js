/**
 * Horario PWA — solo lectura, datos desde Google Apps Script.
 *
 * Despliegue GitHub Pages: sube esta carpeta al repo; en manifest.json ajusta start_url si usas subruta (/nombre-repo/).
 * Prueba local: `npx --yes serve` en esta carpeta (evita file:// por CORS/service worker).
 */

const LS_URL = 'horario_api_url';
const LS_TOKEN = 'horario_api_token';

const screenConfig = document.getElementById('screen-config');
const modalConfigBackdrop = document.getElementById('modal-config-backdrop');
const btnConfigClose = document.getElementById('btn-config-close');
const btnConfigCancel = document.getElementById('btn-config-cancel');
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

function openConfigModal(isEditing) {
  const cfg = getStoredConfig();
  if (cfg) {
    inputApiUrl.value = cfg.apiUrl || '';
    inputToken.value = cfg.token || '';
  }
  if (isEditing) {
    if (btnConfigClose) btnConfigClose.hidden = false;
    if (btnConfigCancel) btnConfigCancel.hidden = false;
  } else {
    if (btnConfigClose) btnConfigClose.hidden = true;
    if (btnConfigCancel) btnConfigCancel.hidden = true;
  }
  screenConfig.hidden = false;
  if (modalConfigBackdrop) modalConfigBackdrop.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeConfigModal() {
  screenConfig.hidden = true;
  if (modalConfigBackdrop) modalConfigBackdrop.hidden = true;
  document.body.style.overflow = '';
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

function linkify(text) {
  if (!text) return '';
  const escaped = escapeHtml(text);
  const urlRegex = /(https?:\/\/[^\s<]+|(?:www\.)[^\s<]+|[a-zA-Z0-9.-]+\.(?:com|org|net|es|edu|io|app|us|me)(?:\/[^\s<]*)?)/gi;
  return escaped.replace(urlRegex, function(matched) {
    let url = matched;
    let trailing = '';
    const punctMatch = matched.match(/[.,;:)\]]+$/);
    if (punctMatch) {
      trailing = punctMatch[0];
      url = matched.slice(0, -trailing.length);
    }
    const href = /^https?:\/\//i.test(url) ? url : ('https://' + url);
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>${trailing}`;
  }).replace(/\n/g, '<br>');
}

function onEventClick(info) {
  const ev = info.event;
  const idStr = String(ev.id);
  const start = ev.start;
  const ep = ev.extendedProps || {};

  if (idStr.startsWith('libre_')) {
    const tipo = ep.tipo || '';
    const nota = ep.nota || ev.title || '';
    const isLibre = !nota || ev.title === 'LIBRE';
    const html = `
      <dl>
        <dt>Fecha y hora</dt>
        <dd>${escapeHtml(formatWhen(start))}</dd>
        <dt>Estado</dt>
        <dd>${isLibre ? 'Hora libre' : 'Nota en hora libre'}</dd>
        ${tipo ? `<dt>Tipo</dt><dd>${escapeHtml(tipo)}</dd>` : ''}
        ${nota && !isLibre ? `<dt>Texto</dt><dd>${linkify(nota)}</dd>` : ''}
      </dl>`;
    openModal(isLibre ? 'Hora libre' : 'Nota', html);
    return;
  }

  // Casilla compartida (división horizontal en 2, 3 o más partes)
  if (idStr.startsWith('compartido_') || ep.es_compartido) {
    let items = ep.items || [];
    if (!items.length) {
      if (ep.evento_alumno) items.push({ tipo: 'alumno', titulo: ep.evento_alumno.nombre_alumno || ep.evento_alumno.title, datos: ep.evento_alumno });
      if (ep.evento_profesor) items.push({ tipo: 'profesor', titulo: ep.evento_profesor.titulo, datos: ep.evento_profesor });
    }
    const total = items.length || 2;

    let itemsHtml = items.map((it, idx) => {
      const isAlumno = it.tipo === 'alumno';
      const icon = isAlumno ? '👤' : '🎓';
      const d = it.datos || {};
      const ext = d.extendedProps || d;

      if (isAlumno) {
        const nombre = it.nombre_alumno || it.titulo || ext.nombre_alumno || d.title || 'Alumno';
        const tel = ext.telefono || d.telefono || '';
        const zoom = ext.link_zoom || d.link_zoom || '';
        const idBono = ext.idBono != null && ext.idBono !== '' ? String(ext.idBono) : '';
        const esUltima = ext.es_ultima_clase === true || ext.es_ultima_clase === 'true';

        return `
          <div style="background: rgba(30, 112, 191, 0.15); border: 1px solid rgba(0, 242, 255, 0.35); border-radius: 8px; padding: 10px; margin-bottom: 10px;">
            <div style="font-weight: 700; color: #00f2ff; margin-bottom: 5px;">👤 Parte ${idx + 1}: ${escapeHtml(nombre)}</div>
            ${tel ? `<div style="font-size: 0.85rem; margin-bottom: 4px;"><strong>Teléfono:</strong> <a href="tel:${escapeHtml(tel)}">${escapeHtml(tel)}</a></div>` : ''}
            ${zoom ? `<div style="font-size: 0.85rem; margin-bottom: 4px;"><strong>Zoom:</strong> <a href="${escapeHtml(zoom)}" target="_blank" rel="noopener noreferrer">Abrir reunión Zoom</a></div>` : ''}
            ${idBono ? `<div style="font-size: 0.82rem; color: #a0aec0;"><strong>Bono:</strong> #${escapeHtml(idBono)}${esUltima ? ' <span style="color: var(--neon-magenta); font-weight: 700;">(Última clase)</span>' : ''}</div>` : ''}
          </div>
        `;
      } else {
        const titulo = it.titulo || ext.titulo || d.title || 'Evento Profesor';
        const desc = ext.descripcion || d.descripcion || '';
        return `
          <div style="background: rgba(197, 155, 39, 0.15); border: 1px solid rgba(255, 215, 0, 0.4); border-radius: 8px; padding: 10px; margin-bottom: 10px;">
            <div style="font-weight: 700; color: #ffd700; margin-bottom: 5px;">🎓 Parte ${idx + 1}: ${escapeHtml(titulo)}</div>
            ${desc ? `<div style="font-size: 0.85rem; line-height: 1.4;">${linkify(desc)}</div>` : '<div style="font-size: 0.8rem; color: #889;"><em>Sin notas adicionales</em></div>'}
          </div>
        `;
      }
    }).join('');

    let html = `
      <div style="margin-bottom: 14px;">
        <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--neon-cyan); font-weight: 700; margin-bottom: 4px;">Fecha y hora</div>
        <div style="font-size: 0.95rem; font-weight: 500;">${escapeHtml(formatWhen(start))}</div>
      </div>
      ${itemsHtml}
    `;
    openModal(`⚡ Casilla Compartida (${total} partes)`, html);
    return;
  }

  // Evento privado del profesor
  if (idStr.startsWith('propia_') || ep.es_evento_profesor || ep.es_clase_propia) {
    const titulo = ep.titulo || ev.title || 'Evento Profesor';
    const desc = ep.descripcion || '';
    const html = `
      <dl>
        <dt>Fecha y hora</dt>
        <dd>${escapeHtml(formatWhen(start))}</dd>
        <dt>Título</dt>
        <dd style="color: #ffd700; font-weight: 700;">${escapeHtml(titulo)}</dd>
        ${desc ? `<dt>Detalles / Enlaces</dt><dd style="line-height: 1.4;">${linkify(desc)}</dd>` : ''}
      </dl>`;
    openModal('🎓 Evento Profesor', html);
    return;
  }

  // Clase normal de alumno
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
    html += `<dt>Teléfono</dt><dd><a href="tel:${escapeHtml(telefono)}">${escapeHtml(telefono)}</a></dd>`;
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
    slotMaxTime: '24:00:00', // Permite ver clases y eventos de las 22:00 y más allá
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
    eventContent: function (arg) {
      if (arg.event.extendedProps && arg.event.extendedProps.es_compartido) {
        let items = arg.event.extendedProps.items || [];
        if (!items.length) {
          if (arg.event.extendedProps.evento_alumno) items.push({ tipo: 'alumno', titulo: arg.event.extendedProps.evento_alumno.nombre_alumno || arg.event.extendedProps.evento_alumno.title, datos: arg.event.extendedProps.evento_alumno });
          if (arg.event.extendedProps.evento_profesor) items.push({ tipo: 'profesor', titulo: arg.event.extendedProps.evento_profesor.titulo, datos: arg.event.extendedProps.evento_profesor });
        }
        const total = items.length || 2;
        const partsHtml = items.map((it, idx) => {
          const isAlumno = it.tipo === 'alumno';
          const icon = isAlumno ? '👤' : '🎓';
          const name = it.titulo || (isAlumno ? (it.nombre_alumno || 'Alumno') : 'Evento');
          const partClass = isAlumno ? 'fc-part-alumno' : 'fc-part-profesor';
          const dividerHtml = idx < items.length - 1 ? '<div class="fc-split-divider"></div>' : '';
          return `
            <div class="fc-split-part ${partClass}" title="${icon} ${escapeHtml(name)}">
              <span class="fc-split-icon">${icon}</span>
              <span class="fc-split-text">${escapeHtml(name)}</span>
            </div>
            ${dividerHtml}
          `;
        }).join('');

        const summaryTitle = items.map(it => (it.tipo === 'alumno' ? '👤 ' : '🎓 ') + (it.titulo || '')).join(' | ');

        return {
          html: `
            <div class="fc-split-event-wrapper fc-partes-${total}" title="${escapeHtml(summaryTitle)}">
              ${partsHtml}
            </div>
          `
        };
      }
      return undefined;
    },
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
  closeConfigModal();
  screenApp.hidden = false;
  if (!calendar) {
    initCalendar();
  } else {
    showStatus('Actualizando con nueva configuración…');
    calendar.refetchEvents();
  }
});

btnRefresh.addEventListener('click', () => {
  if (calendar) {
    showStatus('Actualizando…');
    calendar.refetchEvents();
  }
});

btnReconfig.addEventListener('click', () => {
  openConfigModal(true);
});

if (btnConfigClose) {
  btnConfigClose.addEventListener('click', closeConfigModal);
}
if (btnConfigCancel) {
  btnConfigCancel.addEventListener('click', closeConfigModal);
}
if (modalConfigBackdrop) {
  modalConfigBackdrop.addEventListener('click', () => {
    if (getStoredConfig()) {
      closeConfigModal();
    }
  });
}

modalClose.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!modal.hidden) closeModal();
    else if (!screenConfig.hidden && getStoredConfig()) closeConfigModal();
  }
});

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const isLocal =
    location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '[::1]';
  const isSecure = location.protocol === 'https:' || isLocal;
  if (!isSecure) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js', { scope: './' }).catch(() => { });
  });
}

function boot() {
  registerServiceWorker();
  const cfg = getStoredConfig();
  if (cfg) {
    closeConfigModal();
    screenApp.hidden = false;
    initCalendar();
  } else {
    screenApp.hidden = true;
    openConfigModal(false);
  }
}

boot();
