const STORAGE_KEY = "300dOnEarth:v1";
const TOTAL_DAYS = 300;
const EARTH_KM = 6371;
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const LEVEL_LABEL = { alto: "Alto", medio: "Medio", bajo: "Bajo" };
// Nombres en español para entradas del catálogo, por código de país ISO2 y nombre original.
const ES_NAMES = { "GT|Guatemala": "Ciudad de Guatemala", "US|Los Angeles": "Los Ángeles", "MX|Cancun": "Cancún" };
const WORLD_VIEW = { x: 0, y: 0, w: 360, h: 180 };

const $ = (sel) => document.querySelector(sel);
const startInput = $("#startDate");
const summaryEl = $("#summary");
const timelineEl = $("#timeline");
const baseDialog = $("#baseDialog");
const sheet = $("#sheet");
const sheetBody = $("#sheetBody");
const mapSvg = $("#mapSvg");
const mapRoute = $("#mapRoute");
const mapMarkers = $("#mapMarkers");
const mapLegend = $("#mapLegend");
const mapStats = $("#mapStats");

let state = load();
let openBaseId = null;
let view = { ...WORLD_VIEW };
let basePicker = null;
let destPicker = null;
let locPicker = null;

// ---------- Persistencia ----------

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function normalizeState(raw) {
  const bases = Array.isArray(raw?.bases) ? raw.bases : [];
  return {
    startDate: typeof raw?.startDate === "string" ? raw.startDate : "",
    bases: bases
      .filter((b) => b && typeof b.name === "string" && Number.isInteger(b.days) && b.days > 0)
      .map((b) => ({
        id: b.id || uid(),
        name: b.name,
        country: typeof b.country === "string" ? b.country : null,
        lat: num(b.lat),
        lng: num(b.lng),
        days: b.days,
        destinations: (Array.isArray(b.destinations) ? b.destinations : [])
          .filter((d) => d && typeof d.name === "string")
          .map((d) => ({
            id: d.id || uid(),
            name: d.name,
            km: num(d.km),
            hours: num(d.hours),
            notes: d.notes || "",
            lat: num(d.lat),
            lng: num(d.lng),
          })),
      })),
  };
}

function load() {
  try {
    return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return normalizeState({});
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------- Utilidades ----------

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function toNum(v) {
  return v === "" || v == null ? null : Number(v);
}

function norm(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// Nombre a mostrar para una fila del catálogo [nombre, país, ISO2, lat, lng, población].
function displayName(row) {
  return ES_NAMES[row[2] + "|" + row[0]] || row[0];
}

function climateOf(name) {
  return CLIMATE[norm(name)] || null;
}

// Distancia en línea recta entre dos coordenadas (km).
function haversine(lat1, lng1, lat2, lng2) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a));
}

const wrap180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

// Fecha del día n del viaje (1 = fecha de inicio). Usa UTC para evitar desfases por horario de verano.
function dayToDate(n) {
  if (!state.startDate) return null;
  const d = new Date(state.startDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n - 1);
  return d;
}

function fmt(d) {
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

// Bases en orden con sus días globales (secuencia continua de 1 a N).
function layout() {
  let cursor = 0;
  return state.bases.map((base) => {
    const from = cursor + 1;
    cursor += base.days;
    return { base, from, to: cursor };
  });
}

// Cuántos días de un tramo caen en cada mes del calendario.
function monthBreakdown(from, to) {
  if (!state.startDate) return null;
  const map = new Map();
  for (let n = from; n <= to; n++) {
    const d = dayToDate(n);
    const key = d.getUTCFullYear() * 12 + d.getUTCMonth();
    if (!map.has(key)) map.set(key, { year: d.getUTCFullYear(), month: d.getUTCMonth(), days: 0 });
    map.get(key).days++;
  }
  return [...map.values()];
}

// Riesgos de nivel alto que coinciden con los meses del tramo.
function highRisks(name, from, to) {
  const climate = climateOf(name);
  const months = monthBreakdown(from, to);
  if (!climate || !months) return [];
  const found = new Set();
  months.forEach((m) => {
    climate.risks
      .filter((r) => r.level === "alto" && r.months.includes(m.month + 1))
      .forEach((r) => found.add(r.name));
  });
  return [...found];
}

// ---------- Buscador de ciudades (catálogo offline + Internet si hay conexión) ----------

function cityPicker(placeholder) {
  const el = document.createElement("div");
  el.className = "picker";
  el.innerHTML = `
    <input type="search" autocomplete="off" autocorrect="off" placeholder="${esc(placeholder)}">
    <ul class="results" hidden></ul>
    <div class="meta picker-status"></div>`;
  const input = el.querySelector("input");
  const list = el.querySelector("ul");
  const status = el.querySelector(".picker-status");
  let picked = null;
  let query = "";
  let options = [];

  function showOptions(items, { online }) {
    options = items;
    const rows = items.map((o, i) =>
      `<li><button type="button" data-i="${i}"><strong>${esc(o.name)}</strong> <span class="meta">${esc(o.detail || "")}</span></button></li>`
    );
    rows.push(`<li><button type="button" data-manual>Usar «${esc(query)}» sin coordenadas</button></li>`);
    if (online) rows.push(`<li><button type="button" data-online>Buscar «${esc(query)}» en Internet</button></li>`);
    list.innerHTML = rows.join("");
    list.hidden = false;
  }

  function localMatches(q) {
    const key = norm(q);
    return CITIES
      .filter((c) => norm(displayName(c)).includes(key))
      .sort((a, b) => Number(!norm(displayName(a)).startsWith(key)) - Number(!norm(displayName(b)).startsWith(key)))
      .slice(0, 8)
      .map((c) => ({ name: displayName(c), country: c[1], detail: c[1], lat: c[3], lng: c[4] }));
  }

  async function searchOnline() {
    status.textContent = "Buscando en Internet…";
    try {
      const url = "https://nominatim.openstreetmap.org/search?format=json&limit=6&accept-language=es&q=" + encodeURIComponent(query);
      const data = await (await fetch(url)).json();
      const items = data.map((d) => {
        const parts = d.display_name.split(", ");
        return { name: parts[0], country: parts[parts.length - 1], detail: parts.slice(1).join(", "), lat: Number(d.lat), lng: Number(d.lon) };
      });
      status.textContent = items.length ? "" : "Sin resultados en Internet";
      showOptions(items, { online: false });
    } catch {
      status.textContent = "No se pudo buscar en Internet";
    }
  }

  function pick(o) {
    picked = { name: o.name, country: o.country ?? null, lat: o.lat ?? null, lng: o.lng ?? null };
    input.value = picked.name;
    list.hidden = true;
    status.textContent = picked.lat != null
      ? `${picked.country || ""} · ${picked.lat.toFixed(2)}, ${picked.lng.toFixed(2)}`
      : "Sin coordenadas";
  }

  // Enter no debe enviar el formulario que contiene el buscador
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.preventDefault();
  });

  input.addEventListener("input", () => {
    picked = null;
    status.textContent = "";
    query = input.value.trim();
    if (!query) {
      list.hidden = true;
      list.innerHTML = "";
      return;
    }
    showOptions(localMatches(query), { online: true });
  });

  list.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.dataset.online !== undefined) return searchOnline();
    if (btn.dataset.manual !== undefined) {
      picked = { name: query, country: null, lat: null, lng: null };
      input.value = query;
      list.hidden = true;
      status.textContent = "Sin coordenadas";
      return;
    }
    pick(options[Number(btn.dataset.i)]);
  });

  return {
    el,
    value() {
      if (picked) return picked;
      const text = input.value.trim();
      return text ? { name: text, country: null, lat: null, lng: null } : null;
    },
    reset() {
      input.value = "";
      picked = null;
      query = "";
      list.hidden = true;
      list.innerHTML = "";
      status.textContent = "";
    },
    focus() {
      input.focus();
    },
  };
}

// ---------- Render: resumen y línea temporal ----------

function renderAll() {
  startInput.value = state.startDate;
  renderSummary();
  renderTimeline();
  renderMap();
  if (sheet.open) renderSheet();
}

function renderSummary() {
  const assigned = state.bases.reduce((s, b) => s + b.days, 0);
  const diff = TOTAL_DAYS - assigned;
  const balance = diff === 0
    ? "✓ Los 300 días están asignados"
    : diff > 0 ? `Faltan ${diff} días por asignar` : `Te pasas ${-diff} días`;
  let dates = "Elige la fecha de inicio";
  if (state.startDate && assigned > 0) dates = `${fmt(dayToDate(1))} → ${fmt(dayToDate(assigned))}`;
  summaryEl.innerHTML = `<div><strong>${assigned} / ${TOTAL_DAYS}</strong> días · ${balance}</div><div class="meta">${dates}</div>`;
}

function renderTimeline() {
  timelineEl.innerHTML = "";
  if (!state.bases.length) {
    timelineEl.innerHTML = '<p class="empty">Añade tu primera ciudad base con «+ Ciudad base».</p>';
    return;
  }
  layout().forEach(({ base, from, to }) => {
    const block = document.createElement("article");
    block.className = "base";
    block.style.flex = `${base.days} 1 0px`;

    const dates = state.startDate ? `${fmt(dayToDate(from))} → ${fmt(dayToDate(to))}` : "";
    const alerts = highRisks(base.name, from, to);
    block.innerHTML = `
      <div class="handle" title="Arrastrar para reordenar">⋮⋮</div>
      <div class="info">
        <strong>${esc(base.name)}</strong>
        <span class="meta">${base.days} días · Días ${from}–${to} · ${Math.round((base.days / TOTAL_DAYS) * 100)}%</span>
        ${dates ? `<span class="meta">${dates}</span>` : ""}
        <span class="meta">${base.destinations.length} destinos${base.lat == null ? " · sin coordenadas" : ""}</span>
      </div>
      ${alerts.length ? `<span class="alert" title="${esc(alerts.join(", "))}">⚠ ${alerts.length}</span>` : ""}
    `;

    const handle = block.querySelector(".handle");
    handle.addEventListener("pointerdown", startDrag);
    handle.addEventListener("click", (e) => e.stopPropagation());
    block.addEventListener("click", () => openSheet(base.id));

    timelineEl.appendChild(block);
  });
}

// ---------- Arrastrar para reordenar (funciona con dedo) ----------

function startDrag(e) {
  const handle = e.currentTarget;
  const block = handle.closest(".base");
  const blocks = [...timelineEl.querySelectorAll(".base")];
  const from = blocks.indexOf(block);
  const startY = e.clientY;
  let to = from;

  handle.setPointerCapture(e.pointerId);
  block.classList.add("dragging");

  const onMove = (ev) => {
    const y = ev.clientY;
    block.style.transform = `translateY(${y - startY}px)`;
    to = blocks
      .filter((b) => b !== block)
      .filter((b) => {
        const r = b.getBoundingClientRect();
        return r.top + r.height / 2 < y;
      }).length;
  };

  const onUp = () => {
    handle.removeEventListener("pointermove", onMove);
    handle.removeEventListener("pointerup", onUp);
    handle.removeEventListener("pointercancel", onUp);
    block.classList.remove("dragging");
    block.style.transform = "";
    if (to !== from) {
      const [moved] = state.bases.splice(from, 1);
      state.bases.splice(to, 0, moved);
      save();
    }
    renderAll();
  };

  handle.addEventListener("pointermove", onMove);
  handle.addEventListener("pointerup", onUp);
  handle.addEventListener("pointercancel", onUp);
}

// ---------- Mapa ----------

function routePoints() {
  const pts = [];
  let lon = null;
  state.bases.forEach((b, i) => {
    if (b.lat == null || b.lng == null) return;
    // Desenrollar la longitud para que el recorrido cruce el antimeridiano sin dar la vuelta al mapa
    lon = lon == null ? b.lng : lon + wrap180(b.lng - lon);
    pts.push({ n: i + 1, name: b.name, lat: b.lat, lon, x: lon + 180, y: 90 - b.lat });
  });
  return pts;
}

function renderMap() {
  const pts = routePoints();
  mapRoute.setAttribute("points", pts.map((p) => `${p.x},${p.y}`).join(" "));
  drawMarkers();
  renderLegend();
}

function drawMarkers() {
  mapSvg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
  const pts = routePoints();
  const r = view.w / 90;
  const fs = view.w / 45;
  const markers = [-720, -360, 0, 360, 720].flatMap((off) =>
    pts.map((p) => `
      <g transform="translate(${p.x + off} ${p.y})">
        <circle r="${r}" class="pin"></circle>
        <text y="${r * 0.35}" font-size="${r * 1.1}" text-anchor="middle" class="pin-num">${p.n}</text>
        <text y="${-r * 1.5}" font-size="${fs}" text-anchor="middle" class="pin-name">${esc(p.name)}</text>
      </g>`)
  );
  mapMarkers.innerHTML = markers.join("");
}

function renderLegend() {
  const total = routePoints().length;
  const bases = state.bases;
  let km = 0;
  const rows = bases.map((b, i) => {
    const next = bases[i + 1];
    let leg = "";
    if (next) {
      if (b.lat != null && next.lat != null) {
        const d = Math.round(haversine(b.lat, b.lng, next.lat, next.lng));
        km += d;
        leg = `<li class="leg">↓ ${d.toLocaleString("es-ES")} km</li>`;
      } else {
        leg = `<li class="leg">↓ distancia desconocida</li>`;
      }
    }
    return `
      <li><span class="num">${i + 1}</span><strong>${esc(b.name)}</strong>
        <span class="meta">${b.days} días${b.lat == null ? " · sin coordenadas" : ""}</span></li>${leg}`;
  });
  mapLegend.innerHTML = rows.join("") || '<li class="meta">Añade ciudades base para ver el recorrido.</li>';
  mapStats.textContent = `${bases.length} bases · ${total} con ubicación · ${km.toLocaleString("es-ES")} km en línea recta`;
}

function setView(v) {
  view = v;
  drawMarkers();
  mapSvg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
}

function fitRoute() {
  const pts = routePoints();
  if (!pts.length) return setView({ ...WORLD_VIEW });
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const pad = 15;
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  let w = Math.max(maxX - minX + pad * 2, 60);
  let h = w / 2;
  const needH = maxY - minY + pad * 2;
  if (h < needH) {
    h = needH;
    w = h * 2;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  setView({ x: cx - w / 2, y: cy - h / 2, w, h });
}

function zoomBy(factor) {
  const w = Math.min(1080, Math.max(20, view.w * factor));
  const h = w / 2;
  const cx = view.x + view.w / 2;
  const cy = view.y + view.h / 2;
  setView({ x: cx - w / 2, y: cy - h / 2, w, h });
}

// Pan con un dedo y zoom con dos (pellizco). En ordenador: rueda del ratón.
const pointers = new Map();
let pinchDist = null;
const pt = (e) => ({ x: e.clientX, y: e.clientY });

mapSvg.addEventListener("pointerdown", (e) => {
  mapSvg.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, pt(e));
  pinchDist = null;
});

mapSvg.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId);
  const cur = pt(e);
  pointers.set(e.pointerId, cur);
  const rect = mapSvg.getBoundingClientRect();
  // Unidades del mapa por píxel de pantalla (el SVG mantiene la proporción, así que se toma el eje limitante)
  const unitsPerPx = Math.max(view.w / rect.width, view.h / rect.height);

  if (pointers.size === 1) {
    setView({
      ...view,
      x: view.x - (cur.x - prev.x) * unitsPerPx,
      y: view.y - (cur.y - prev.y) * unitsPerPx,
    });
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDist) zoomBy(pinchDist / dist);
    pinchDist = dist;
  }
});

const releasePointer = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchDist = null;
};
mapSvg.addEventListener("pointerup", releasePointer);
mapSvg.addEventListener("pointercancel", releasePointer);

mapSvg.addEventListener("wheel", (e) => {
  e.preventDefault();
  zoomBy(e.deltaY > 0 ? 1.1 : 1 / 1.1);
}, { passive: false });

$("#fitBtn").addEventListener("click", fitRoute);
$("#worldBtn").addEventListener("click", () => setView({ ...WORLD_VIEW }));
$("#zoomIn").addEventListener("click", () => zoomBy(1 / 1.5));
$("#zoomOut").addEventListener("click", () => zoomBy(1.5));

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

function showView(name) {
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  $("#view-timeline").hidden = name !== "timeline";
  $("#view-map").hidden = name !== "map";
  if (name === "map") fitRoute();
}

// ---------- Ficha de ciudad base ----------

function openSheet(id) {
  openBaseId = id;
  renderSheet();
  if (!sheet.open) sheet.showModal();
}

function renderSheet() {
  const item = layout().find((x) => x.base.id === openBaseId);
  if (!item) {
    sheet.close();
    return;
  }
  const { base, from, to } = item;
  const others = state.bases.filter((b) => b.id !== base.id);
  const months = monthBreakdown(from, to);
  const range = state.startDate ? ` · ${fmt(dayToDate(from))} → ${fmt(dayToDate(to))}` : "";
  const location = base.lat != null
    ? `${esc(base.country || "")} · ${base.lat.toFixed(2)}, ${base.lng.toFixed(2)}`
    : "Sin coordenadas: no aparece en el mapa ni se calculan distancias.";

  locPicker = cityPicker("Buscar otra ciudad…");
  destPicker = cityPicker("Buscar destino (ciudad o lugar)…");

  sheetBody.innerHTML = `
    <h2>${esc(base.name)}</h2>
    <form id="baseEdit" class="stack">
      <div class="row2">
        <label>Nombre
          <input name="name" value="${esc(base.name)}" required>
        </label>
        <label>Días
          <input name="days" type="number" inputmode="numeric" min="1" value="${base.days}" required>
        </label>
      </div>
      <button class="primary" type="submit">Guardar cambios</button>
    </form>
    <p class="meta">Días ${from}–${to}${range}</p>
    <div class="row">
      <button type="button" data-move="-1">↑ Subir</button>
      <button type="button" data-move="1">↓ Bajar</button>
      <button type="button" class="danger" data-del>Eliminar</button>
    </div>

    <h3>Ubicación</h3>
    <p class="meta">${location}</p>
    <form id="locForm" class="stack">
      <div data-picker="loc"></div>
      <button class="small" type="submit">Cambiar ubicación</button>
    </form>

    <h3>Clima y riesgos</h3>
    ${climateHtml(base, months)}

    <h3>Destinos (${base.destinations.length})</h3>
    <ul class="list">
      ${base.destinations.map((d) => destHtml(d, others)).join("") || '<li class="meta">Aún no hay destinos.</li>'}
    </ul>
    <form id="destForm" class="stack">
      <div data-picker="dest"></div>
      <div class="row2">
        <label>Km desde la base
          <input name="km" type="number" inputmode="decimal" min="0">
        </label>
        <label>Horas de viaje
          <input name="hours" type="number" inputmode="decimal" min="0" step="0.5">
        </label>
      </div>
      <label>Notas
        <input name="notes">
      </label>
      <p class="meta">Si dejas los km vacíos y hay coordenadas, se calcula la distancia en línea recta.</p>
      <button class="primary" type="submit">+ Añadir destino</button>
    </form>
  `;

  sheetBody.querySelector('[data-picker="loc"]').append(locPicker.el);
  sheetBody.querySelector('[data-picker="dest"]').append(destPicker.el);
}

function climateHtml(base, months) {
  if (!state.startDate) {
    return '<p class="meta">Elige la fecha de inicio arriba para ver el clima de cada mes de esta base.</p>';
  }
  const climate = climateOf(base.name);
  if (!climate) {
    return `<p class="meta">Sin datos climáticos todavía para «${esc(base.name)}». Se añadirán más adelante.</p>`;
  }
  const total = months.reduce((s, m) => s + m.days, 0);
  const avg = months.reduce((s, m) => s + climate.temp[m.month] * m.days, 0) / total;

  const rows = months.map((m) => {
    const risks = climate.risks.filter((r) => r.months.includes(m.month + 1));
    const riskHtml = risks.map((r) => `
      <div class="risk ${r.level}"><b>${LEVEL_LABEL[r.level]}</b>${esc(r.name)}<br><span class="meta">${esc(r.note)}</span></div>
    `).join("") || '<div class="meta">Sin riesgos destacados.</div>';
    return `
      <div class="month">
        <div class="month-head">
          <strong>${cap(MONTHS[m.month])} ${m.year}</strong>
          <span>${m.days} días · ${climate.temp[m.month]} °C · ${climate.rain[m.month]} mm</span>
        </div>
        ${riskHtml}
      </div>`;
  }).join("");

  return `<p class="meta">Temperatura media ponderada: <strong>${avg.toFixed(1)} °C</strong></p>${rows}`;
}

function destHtml(d, others) {
  const meta = [d.km != null ? `${d.km} km` : null, d.hours != null ? `${d.hours} h` : null].filter(Boolean).join(" · ");
  const options = others.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("");
  return `
    <li>
      <div><strong>${esc(d.name)}</strong> <span class="meta">${meta}</span>${d.notes ? `<div class="meta">${esc(d.notes)}</div>` : ""}</div>
      <div class="row">
        ${others.length ? `<select data-dest-move="${d.id}"><option value="">Mover a…</option>${options}</select>` : ""}
        <button type="button" class="small danger" data-dest-del="${d.id}">Quitar</button>
      </div>
    </li>`;
}

function moveBase(id, dir) {
  const i = state.bases.findIndex((b) => b.id === id);
  const j = i + dir;
  if (j < 0 || j >= state.bases.length) return;
  [state.bases[i], state.bases[j]] = [state.bases[j], state.bases[i]];
  save();
  renderAll();
}

sheetBody.addEventListener("submit", (e) => {
  e.preventDefault();
  const base = state.bases.find((b) => b.id === openBaseId);
  if (!base) return;
  const f = Object.fromEntries(new FormData(e.target));

  if (e.target.id === "baseEdit") {
    const name = f.name.trim();
    const days = Number(f.days);
    if (!name || !Number.isInteger(days) || days < 1) return alert("Revisa el nombre y los días.");
    base.name = name;
    base.days = days;
  } else if (e.target.id === "locForm") {
    const p = locPicker.value();
    if (!p) return;
    base.name = p.name;
    base.country = p.country;
    base.lat = p.lat;
    base.lng = p.lng;
  } else if (e.target.id === "destForm") {
    const p = destPicker.value();
    if (!p) return;
    let km = toNum(f.km);
    if (km == null && p.lat != null && base.lat != null) {
      km = Math.round(haversine(base.lat, base.lng, p.lat, p.lng));
    }
    base.destinations.push({
      id: uid(),
      name: p.name,
      km,
      hours: toNum(f.hours),
      notes: f.notes.trim(),
      lat: p.lat,
      lng: p.lng,
    });
  }
  save();
  renderAll();
});

sheetBody.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  const base = state.bases.find((b) => b.id === openBaseId);
  if (!btn || !base) return;

  if (btn.dataset.move !== undefined) {
    moveBase(base.id, Number(btn.dataset.move));
  } else if ("del" in btn.dataset) {
    if (!confirm(`¿Eliminar «${base.name}» y sus destinos?`)) return;
    state.bases = state.bases.filter((b) => b.id !== base.id);
    openBaseId = null;
    sheet.close();
    save();
    renderAll();
  } else if (btn.dataset.destDel !== undefined) {
    base.destinations = base.destinations.filter((d) => d.id !== btn.dataset.destDel);
    save();
    renderAll();
  }
});

sheetBody.addEventListener("change", (e) => {
  const sel = e.target;
  if (sel.dataset.destMove === undefined || !sel.value) return;
  const from = state.bases.find((b) => b.id === openBaseId);
  const to = state.bases.find((b) => b.id === sel.value);
  const dest = from?.destinations.find((d) => d.id === sel.dataset.destMove);
  if (!from || !to || !dest) return;
  from.destinations = from.destinations.filter((d) => d !== dest);
  to.destinations.push(dest);
  save();
  renderAll();
});

$("#closeSheet").addEventListener("click", () => sheet.close());

// ---------- Cabecera, barra inferior y diálogo de nueva base ----------

startInput.addEventListener("change", () => {
  state.startDate = startInput.value;
  save();
  renderAll();
});

basePicker = cityPicker("Ciudad base (ej.: Vancouver)");
$("#basePickerHost").append(basePicker.el);

$("#addBase").addEventListener("click", () => {
  $("#baseForm").reset();
  basePicker.reset();
  baseDialog.showModal();
  basePicker.focus();
});

$("#cancelBase").addEventListener("click", () => baseDialog.close());

$("#baseForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const p = basePicker.value();
  const days = Number(f.days);
  if (!p || !Number.isInteger(days) || days < 1) return;
  state.bases.push({ id: uid(), name: p.name, country: p.country, lat: p.lat, lng: p.lng, days, destinations: [] });
  save();
  renderAll();
  baseDialog.close();
});

$("#exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: "300dOnEarth.json" });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$("#importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    state = normalizeState(JSON.parse(await file.text()));
    save();
    renderAll();
  } catch {
    alert("El archivo no es válido.");
  }
});

$("#sampleBtn").addEventListener("click", () => {
  if (state.bases.length && !confirm("Esto reemplazará tu planificación actual. ¿Continuar?")) return;
  state = normalizeState({ startDate: state.startDate, bases: SAMPLE_BASES });
  save();
  renderAll();
});

// ---------- Arranque ----------

// Contornos del mundo: se definen una vez y se repiten a izquierda y derecha para que el recorrido cruce el antimeridiano.
mapSvg.querySelector("defs").innerHTML = `<path id="worldShape" d="${WORLD_PATH_D}"></path>`;
$("#mapLand").innerHTML = [-1080, -720, -360, 0, 360, 720, 1080].map((x) => `<use href="#worldShape" x="${x}"></use>`).join("");

renderAll();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}
