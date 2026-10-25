const STORAGE_KEY = "300dOnEarth:v1";
const CLIMATE_KEY = "300dOnEarth:clima";
const TOTAL_DAYS = 300;
const EARTH_KM = 6371;
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const ND = "No conocido por el momento";
const LEVEL_LABEL = { alto: "Alto", medio: "Medio", bajo: "Bajo", nd: "No conocido" };
// Nombres en español para entradas del catálogo, por código de país ISO2 y nombre original.
const ES_NAMES = { "GT|Guatemala": "Ciudad de Guatemala", "US|Los Angeles": "Los Ángeles", "MX|Cancun": "Cancún" };
const WORLD_VIEW = { x: 0, y: 0, w: 360, h: 180 };
// Punto de partida del viaje. No es una base: no suma días a los 300.
const ORIGIN = { name: "Madrid", country: "España", lat: 40.42, lng: -3.70 };

const $ = (sel) => document.querySelector(sel);
const startInput = $("#startDate");
const summaryEl = $("#summary");
const timelineEl = $("#timeline");
const baseDialog = $("#baseDialog");
const sheet = $("#sheet");
const sheetBody = $("#sheetBody");
const budgetDialog = $("#budgetDialog");
const mapSvg = $("#mapSvg");
const mapRoute = $("#mapRoute");
const mapSpokes = $("#mapSpokes");
const mapMarkers = $("#mapMarkers");
const mapLegend = $("#mapLegend");
const mapStats = $("#mapStats");

// Comprueba al arrancar si el navegador deja escribir en localStorage
const storageOk = (() => {
  try {
    localStorage.setItem(STORAGE_KEY + ":prueba", "1");
    localStorage.removeItem(STORAGE_KEY + ":prueba");
    return true;
  } catch {
    return false;
  }
})();

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

let loadError = null;

// Lo que había guardado en el iPhone antes de que la app lo cargue (para la copia de seguridad)
const savedAtStart = (() => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
})();

let state = load();
// Si los datos existían pero no se pudieron leer, se guarda una copia antes de que cualquier cambio la sobrescriba
if (loadError && savedAtStart) {
  try {
    localStorage.setItem(STORAGE_KEY + ":copia", savedAtStart);
  } catch {}
}
let climateStore = loadClimate();
let openBaseId = null;
let sheetTab = "clima";
let view = { ...WORLD_VIEW };
let basePicker = null;
let destPicker = null;

// ---------- Persistencia ----------

function uid() {
  return Math.random().toString(36).slice(2, 10);
}


// Para bases guardadas antes de tener código de país: se deduce del catálogo por nombre.
function guessIso2(name) {
  const hit = CITIES.find((c) => norm(displayName(c)) === norm(name));
  return hit ? hit[2] : null;
}

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
        iso2: typeof b.iso2 === "string" ? b.iso2 : guessIso2(b.name),
        lat: num(b.lat),
        lng: num(b.lng),
        days: b.days,
        nights: num(b.nights),
        budget: {
          flight: num(b.budget?.flight),
          perNight: num(b.budget?.perNight),
          perDay: num(b.budget?.perDay),
          perDestTrip: num(b.budget?.perDestTrip),
        },
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
  } catch (e) {
    loadError = `${e.name}: ${e.message}`;
    return normalizeState({});
  }
}

function save() {
  if (!storageOk) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    alert("No se puede guardar en este navegador. Los datos se perderán al cerrar la app: usa Exportar antes de salir.");
  }
}

function loadClimate() {
  try {
    return JSON.parse(localStorage.getItem(CLIMATE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveClimate() {
  localStorage.setItem(CLIMATE_KEY, JSON.stringify(climateStore));
}

// ---------- Utilidades ----------

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmt1(n) {
  return n == null ? "—" : n.toFixed(1).replace(".", ",");
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

// Mes del calendario en el que más días cae el tramo.
function dominantMonth(from, to) {
  const months = monthBreakdown(from, to);
  if (!months) return null;
  return months.reduce((best, m) => (m.days > best.days ? m : best), months[0]);
}

// ---------- Clima ----------

const climateKeyOf = (lat, lng) => `${lat.toFixed(2)},${lng.toFixed(2)}`;

function climateFor(base) {
  if (base.lat == null || base.lng == null) return null;
  return climateStore[climateKeyOf(base.lat, base.lng)] || null;
}

// Media mensual de los últimos 10 años a partir de datos diarios de Open-Meteo (archivo histórico).
function monthlyStats(daily) {
  const acc = Array.from({ length: 12 }, () => ({ t: [], p: 0, rain: 0, hot: 0, cold: 0 }));
  daily.time.forEach((date, i) => {
    const a = acc[Number(date.slice(5, 7)) - 1];
    const tmean = daily.temperature_2m_mean[i];
    const precip = daily.precipitation_sum[i] ?? 0;
    if (tmean != null) a.t.push(tmean);
    a.p += precip;
    if (precip >= 30) a.rain++;
    if ((daily.temperature_2m_max[i] ?? -Infinity) >= 35) a.hot++;
    if ((daily.temperature_2m_min[i] ?? Infinity) <= -10) a.cold++;
  });
  const years = new Set(daily.time.map((d) => d.slice(0, 4))).size;
  const mean = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);
  return {
    years,
    months: acc.map((a) => ({
      t: mean(a.t),
      p: a.p / years,
      rain: a.rain / years,
      hot: a.hot / years,
      cold: a.cold / years,
    })),
  };
}

async function fetchClimate(lat, lng) {
  const url = "https://archive-api.open-meteo.com/v1/archive?" + new URLSearchParams({
    latitude: lat,
    longitude: lng,
    start_date: "2016-01-01",
    end_date: "2025-12-31",
    daily: "temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum",
    timezone: "auto",
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error("clima no disponible");
  return monthlyStats((await res.json()).daily);
}

const climatePending = new Set();
const climateFailed = new Set();

// Descarga el clima de las bases que aún no lo tienen, de una en una, cuando hay conexión.
function ensureClimate() {
  if (!navigator.onLine) return;
  const todo = state.bases.filter((b) => {
    if (b.lat == null) return false;
    const key = climateKeyOf(b.lat, b.lng);
    return !climateStore[key] && !climateFailed.has(key) && !climatePending.has(key);
  });
  if (!todo.length) return;
  todo.forEach((b) => climatePending.add(climateKeyOf(b.lat, b.lng)));

  (async () => {
    for (const b of todo) {
      const key = climateKeyOf(b.lat, b.lng);
      try {
        climateStore[key] = await fetchClimate(b.lat, b.lng);
        saveClimate();
      } catch {
        climateFailed.add(key);
      }
      climatePending.delete(key);
      renderTimeline();
      if (sheet.open) fillClimateSections();
    }
  })();
}

// Nivel de riesgo a partir de la media de días al mes que cumplen una condición.
function levelFrom(v, medio, alto) {
  return v >= alto ? "alto" : v >= medio ? "medio" : "bajo";
}

// Riesgos climáticos para los meses que ocupa la base, usando el peor mes del tramo.
function riskItems(stats, months) {
  const tornado = { name: "Tornados", level: "nd", detail: ND };
  if (!stats || !months) {
    return [
      { name: "Lluvias intensas", level: "nd", detail: ND },
      { name: "Calor extremo (más de 35 °C)", level: "nd", detail: ND },
      { name: "Frío extremo (menos de −10 °C)", level: "nd", detail: ND },
      tornado,
    ];
  }
  const peak = (key) => months.reduce((best, m) => {
    const v = stats.months[m.month][key];
    return !best || v > best.v ? { v, month: m.month } : best;
  }, null);
  const rain = peak("rain");
  const hot = peak("hot");
  const cold = peak("cold");
  const per = (v) => v.toFixed(1).replace(".", ",");
  return [
    { name: "Lluvias intensas", level: levelFrom(rain.v, 0.5, 2), detail: `${per(rain.v)} días al mes con más de 30 mm (pico en ${MONTHS[rain.month]})` },
    { name: "Calor extremo (más de 35 °C)", level: levelFrom(hot.v, 1, 3), detail: `${per(hot.v)} días al mes (pico en ${MONTHS[hot.month]})` },
    { name: "Frío extremo (menos de −10 °C)", level: levelFrom(cold.v, 1, 3), detail: `${per(cold.v)} días al mes (pico en ${MONTHS[cold.month]})` },
    tornado,
  ];
}

// Estación del año según el mes y el hemisferio (lat < 0 = hemisferio sur).
function seasonOf(month, lat) {
  if (lat == null) return "estación no conocida";
  const north = ["invierno", "invierno", "primavera", "primavera", "primavera", "verano", "verano", "verano", "otoño", "otoño", "otoño", "invierno"];
  return lat < 0 ? north[(month + 6) % 12] : north[month];
}

// Avisos que se muestran en la línea temporal: riesgos altos y estancia por encima del límite del país.
function alertsFor(base, from, to) {
  const alerts = riskItems(climateFor(base), monthBreakdown(from, to))
    .filter((r) => r.level === "alto")
    .map((r) => r.name);
  const req = base.iso2 ? REQUISITOS[base.iso2] : null;
  if (req?.maxDays && base.days > req.maxDays) alerts.push(`Estancia de ${base.days} días por encima del límite de ${req.maxDays}`);
  return alerts;
}

// ---------- Presupuesto ----------

const eur = (n) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

// Noches de la base: por defecto, una por cada día
const nightsOf = (base) => base.nights ?? base.days;

// Partidas del presupuesto de una base en euros (lo que no está rellenado cuenta como 0)
function budgetOf(base) {
  const b = base.budget;
  const flight = b.flight ?? 0;
  const lodging = (b.perNight ?? 0) * nightsOf(base);
  const daily = (b.perDay ?? 0) * base.days;
  const destTrips = (b.perDestTrip ?? 0) * base.destinations.length;
  return {
    flight,
    lodging,
    daily,
    destTrips,
    total: flight + lodging + daily + destTrips,
    filled: Object.values(b).some((v) => v != null),
  };
}

function readBudget(f) {
  const amount = (v) => {
    const n = toNum(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  return { flight: amount(f.flight), perNight: amount(f.perNight), perDay: amount(f.perDay), perDestTrip: amount(f.perDestTrip) };
}

// ---------- Buscador de ciudades (catálogo offline + Internet si hay conexión) ----------

function cityPicker(placeholder, onChange = () => {}) {
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
      .map((c) => ({ name: displayName(c), country: c[1], iso2: c[2], detail: c[1], lat: c[3], lng: c[4] }));
  }

  async function searchOnline() {
    status.textContent = "Buscando en Internet…";
    try {
      const url = "https://nominatim.openstreetmap.org/search?" + new URLSearchParams({
        format: "json", limit: 6, addressdetails: 1, "accept-language": "es", q: query,
      });
      const data = await (await fetch(url)).json();
      const items = data.map((d) => {
        const parts = d.display_name.split(", ");
        return {
          name: parts[0],
          country: parts[parts.length - 1],
          iso2: d.address?.country_code?.toUpperCase() ?? null,
          detail: parts.slice(1).join(", "),
          lat: Number(d.lat),
          lng: Number(d.lon),
        };
      });
      status.textContent = items.length ? "" : "Sin resultados en Internet";
      showOptions(items, { online: false });
    } catch {
      status.textContent = "No se pudo buscar en Internet";
    }
  }

  function pick(o) {
    picked = { name: o.name, country: o.country ?? null, iso2: o.iso2 ?? null, lat: o.lat ?? null, lng: o.lng ?? null };
    input.value = picked.name;
    list.hidden = true;
    status.textContent = picked.lat != null
      ? `${picked.country || ""} · ${picked.lat.toFixed(2)}, ${picked.lng.toFixed(2)}`
      : "Sin coordenadas";
    onChange();
  }

  // Enter no debe enviar el formulario que contiene el buscador
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.preventDefault();
  });

  input.addEventListener("input", () => {
    picked = null;
    status.textContent = "";
    query = input.value.trim();
    onChange();
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
      picked = { name: query, country: null, iso2: null, lat: null, lng: null };
      input.value = query;
      list.hidden = true;
      status.textContent = "Sin coordenadas";
      onChange();
      return;
    }
    pick(options[Number(btn.dataset.i)]);
  });

  return {
    el,
    value() {
      if (picked) return picked;
      const text = input.value.trim();
      return text ? { name: text, country: null, iso2: null, lat: null, lng: null } : null;
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
  ensureClimate();
}

function renderSummary() {
  const assigned = state.bases.reduce((s, b) => s + b.days, 0);
  const diff = TOTAL_DAYS - assigned;
  const balance = diff === 0
    ? "✓ Los 300 días están asignados"
    : diff > 0 ? `Faltan ${diff} días por asignar` : `Te pasas ${-diff} días`;
  let dates = "Elige la fecha de inicio";
  if (state.startDate && assigned > 0) dates = `${fmt(dayToDate(1))} → ${fmt(dayToDate(assigned))}`;
  const destinations = state.bases.reduce((s, b) => s + b.destinations.length, 0);
  const storage = storageOk
    ? `<div class="meta">Guardado en este dispositivo: ${state.bases.length} bases · ${destinations} destinos</div>`
    : `<div class="warn">⚠ Este navegador no deja guardar datos: se perderán al cerrar la app. Usa Exportar antes de salir.</div>`;
  const budgets = state.bases.map(budgetOf);
  const total = budgets.reduce((s, b) => s + b.total, 0);
  const budgetText = budgets.some((b) => b.filled) ? `<strong>${eur(total)}</strong>` : '<span class="meta">sin rellenar</span>';
  summaryEl.innerHTML = `
    <div><strong>${assigned} / ${TOTAL_DAYS}</strong> días · ${balance}</div>
    <div class="meta">${dates}</div>
    ${storage}
    <button type="button" class="budget-link" id="budgetBtn"><span>Presupuesto total</span><span>${budgetText} ›</span></button>`;
}

summaryEl.addEventListener("click", (e) => {
  if (e.target.closest("#budgetBtn")) openBudget();
});

function openBudget() {
  const sum = (key) => state.bases.reduce((s, b) => s + budgetOf(b)[key], 0);
  const rows = state.bases.map((b, i) => {
    const t = budgetOf(b);
    return `
      <li><button type="button" class="budget-row" data-base-id="${b.id}">
        <span><span class="num">${i + 1}</span> ${esc(b.name)}</span>
        <span>${t.filled ? `<strong>${eur(t.total)}</strong>` : '<span class="meta">sin rellenar</span>'} ›</span>
      </button></li>`;
  }).join("");
  $("#budgetBody").innerHTML = `
    <div class="budget-line"><span>Vuelos principales</span><strong>${eur(sum("flight"))}</strong></div>
    <div class="budget-line"><span>Alojamiento</span><strong>${eur(sum("lodging"))}</strong></div>
    <div class="budget-line"><span>Gastos diarios</span><strong>${eur(sum("daily"))}</strong></div>
    <div class="budget-line"><span>Viajes a destinos</span><strong>${eur(sum("destTrips"))}</strong></div>
    <div class="budget-line total"><span>Total</span><strong>${eur(sum("total"))}</strong></div>
    <h3>Por ciudad base</h3>
    <ul class="list">${rows || '<li class="meta">Aún no hay ciudades base.</li>'}</ul>
    <p class="meta">Toca una ciudad para rellenar su presupuesto.</p>`;
  if (!budgetDialog.open) budgetDialog.showModal();
}

// Línea de la estación y la temperatura del mes dominante de la base
function seasonLine(base, from, to) {
  if (!state.startDate) return "Elige la fecha de inicio para ver la estación";
  const dom = dominantMonth(from, to);
  const stats = climateFor(base);
  let temp = ND.toLowerCase();
  if (stats) temp = `${fmt1(stats.months[dom.month].t)} °C`;
  else if (base.lat != null && climatePending.has(climateKeyOf(base.lat, base.lng))) temp = "cargando clima…";
  return `${cap(seasonOf(dom.month, base.lat))} · ${temp} (${MONTHS[dom.month]})`;
}

function renderTimeline() {
  timelineEl.innerHTML = `
    <article class="origin">
      <strong>Salida: ${ORIGIN.name}</strong>
      <span class="meta">${ORIGIN.country} · no cuenta en los 300 días</span>
    </article>`;
  if (!state.bases.length) {
    timelineEl.insertAdjacentHTML("beforeend", '<p class="empty">Añade tu primera ciudad base con «+ Ciudad base».</p>');
    return;
  }
  layout().forEach(({ base, from, to }) => {
    const block = document.createElement("article");
    block.className = "base";

    const dates = state.startDate ? `${fmt(dayToDate(from))} → ${fmt(dayToDate(to))}` : "";
    const alerts = alertsFor(base, from, to);
    block.innerHTML = `
      <div class="handle" title="Arrastrar para reordenar">⋮⋮</div>
      <div class="info">
        <strong>${esc(base.name)}</strong>
        <span class="meta">${base.days} días · Días ${from}–${to} · ${Math.round((base.days / TOTAL_DAYS) * 100)}%</span>
        ${dates ? `<span class="meta">${dates}</span>` : ""}
        <span class="season">${esc(seasonLine(base, from, to))}</span>
        <span class="meta">${base.destinations.length} destinos</span>
      </div>
      ${alerts.length ? `<span class="alert" title="${esc(alerts.join(". "))}">⚠ ${alerts.length}</span>` : ""}
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

// Paradas del recorrido: Madrid (salida) seguida de las bases en orden
function stops() {
  return [
    { n: "S", name: ORIGIN.name, lat: ORIGIN.lat, lng: ORIGIN.lng },
    ...state.bases.map((b, i) => ({ n: i + 1, name: b.name, lat: b.lat, lng: b.lng, days: b.days })),
  ];
}

function routePoints() {
  const pts = [];
  let lon = null;
  stops().forEach((s) => {
    if (s.lat == null || s.lng == null) return;
    // Desenrollar la longitud para que el recorrido cruce el antimeridiano sin dar la vuelta al mapa
    lon = lon == null ? s.lng : lon + wrap180(s.lng - lon);
    pts.push({ ...s, lon, x: lon + 180, y: 90 - s.lat });
  });
  return pts;
}

function renderMap() {
  const pts = routePoints();
  mapRoute.setAttribute("points", pts.map((p) => `${p.x},${p.y}`).join(" "));
  drawMarkers();
  renderLegend();
}

const MAP_OFFSETS = [-720, -360, 0, 360, 720];

// Destinos de cada base con coordenadas: línea fina desde la base y punto con su nombre
function destinationItems() {
  const items = [];
  const dr = view.w / 220;
  const fs = view.w / 70;
  routePoints().forEach((p) => {
    if (typeof p.n !== "number") return;
    state.bases[p.n - 1].destinations.forEach((d) => {
      if (d.lat == null || d.lng == null) return;
      // Destino en la copia del mapa más cercana a su base
      const x = p.lon + wrap180(d.lng - p.lon) + 180;
      const y = 90 - d.lat;
      items.push(`
        <line x1="${p.x}" y1="${p.y}" x2="${x}" y2="${y}" class="spoke"></line>
        <circle cx="${x}" cy="${y}" r="${dr}" class="dest-dot"></circle>
        <text x="${x}" y="${y - dr * 1.6}" font-size="${fs}" text-anchor="middle" class="dest-name">${esc(d.name)}</text>`);
    });
  });
  return items;
}

function drawMarkers() {
  mapSvg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
  const pts = routePoints();
  const r = view.w / 90;
  const fs = view.w / 45;
  const spokes = MAP_OFFSETS.flatMap((off) =>
    destinationItems().map((s) => `<g transform="translate(${off} 0)">${s}</g>`)
  );
  mapSpokes.innerHTML = spokes.join("");
  const markers = MAP_OFFSETS.flatMap((off) =>
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
  const list = stops();
  let km = 0;
  const rows = list.map((st, i) => {
    const next = list[i + 1];
    let leg = "";
    if (next) {
      if (st.lat != null && next.lat != null) {
        const d = Math.round(haversine(st.lat, st.lng, next.lat, next.lng));
        km += d;
        leg = `<li class="leg">↓ ${d.toLocaleString("es-ES")} km</li>`;
      } else {
        leg = `<li class="leg">↓ distancia desconocida</li>`;
      }
    }
    const nd = typeof st.n === "number" ? state.bases[st.n - 1].destinations.length : 0;
    const meta = st.days ? `${st.days} días${nd ? ` · ${nd} destinos` : ""}` : "salida, no cuenta en los 300 días";
    return `
      <li><span class="num">${st.n}</span><strong>${esc(st.name)}</strong>
        <span class="meta">${meta}${st.lat == null ? " · sin coordenadas" : ""}</span></li>${leg}`;
  });
  mapLegend.innerHTML = rows.join("");
  const located = state.bases.filter((b) => b.lat != null).length;
  mapStats.textContent = `${state.bases.length} bases · ${located} con ubicación · ${km.toLocaleString("es-ES")} km en línea recta`;
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

document.querySelectorAll("[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

function showView(name) {
  document.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  $("#view-timeline").hidden = name !== "timeline";
  $("#view-map").hidden = name !== "map";
  if (name === "map") fitRoute();
}

// ---------- Ficha de ciudad base ----------

function openSheet(id, tab = "clima") {
  openBaseId = id;
  sheetTab = tab;
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
  const range = state.startDate ? ` · ${fmt(dayToDate(from))} → ${fmt(dayToDate(to))}` : "";

  destPicker = cityPicker("Buscar destino (ciudad o lugar)…", refreshManualFields);

  const panel = (name) => (sheetTab === name ? "" : "hidden");
  const tabClass = (name) => (sheetTab === name ? "tab active" : "tab");

  sheetBody.innerHTML = `
    <div class="sheet-head">
      <h2>${esc(base.name)}</h2>
      <button type="button" class="small danger" data-del>Eliminar</button>
    </div>
    <p class="meta">Días ${from}–${to}${range}</p>
    <form id="baseEdit" class="stack">
      <div class="row2">
        <label>Días
          <input name="days" type="number" inputmode="numeric" min="1" value="${base.days}" required>
        </label>
        <label>Noches
          <input name="nights" type="number" inputmode="numeric" min="0" value="${nightsOf(base)}" required>
        </label>
      </div>
      <button class="primary" type="submit">Guardar cambios</button>
    </form>

    <nav class="tabs sheet-tabs">
      <button type="button" class="${tabClass("clima")}" data-sheet-tab="clima">Clima</button>
      <button type="button" class="${tabClass("destinos")}" data-sheet-tab="destinos">Destinos</button>
      <button type="button" class="${tabClass("presupuesto")}" data-sheet-tab="presupuesto">Presupuesto</button>
    </nav>

    <div data-panel="clima" ${panel("clima")}>
      <h3>Clima</h3>
      <div id="sheetClimate"></div>

      <h3>Riesgos climáticos</h3>
      <div id="sheetRisks"></div>

      <h3>Riesgo político del país</h3>
      ${riesgoPaisHtml(base, from)}

      <h3>Requisitos de entrada (ciudadano español)</h3>
      ${requisitosHtml(base)}
    </div>

    <div data-panel="destinos" ${panel("destinos")}>
    <h3>Destinos (${base.destinations.length})</h3>
    <ul class="list">
      ${base.destinations.map((d) => destHtml(d, others)).join("") || '<li class="meta">Aún no hay destinos.</li>'}
    </ul>
    <form id="destForm" class="stack">
      <div data-picker="dest"></div>
      <div id="manualFields" class="stack" hidden>
        <p class="meta">Sin coordenadas no se puede calcular la distancia: introdúcela a mano.</p>
        <div class="row2">
          <label>Km desde la base
            <input name="km" type="number" inputmode="decimal" min="0">
          </label>
          <label>Horas de viaje
            <input name="hours" type="number" inputmode="decimal" min="0" step="0.5">
          </label>
        </div>
      </div>
      <label>Notas
        <input name="notes">
      </label>
      <button class="primary" type="submit">+ Añadir destino</button>
    </form>
    </div>

    <div data-panel="presupuesto" ${panel("presupuesto")}>
      ${budgetFormHtml(base)}
    </div>
  `;

  sheetBody.querySelector('[data-picker="dest"]').append(destPicker.el);
  fillClimateSections();
}

function budgetFormHtml(base) {
  const b = base.budget;
  const t = budgetOf(base);
  const value = (v) => (v == null ? "" : v);
  const input = (name) =>
    `<input name="${name}" type="number" inputmode="decimal" min="0" step="any" placeholder="0" value="${value(b[name])}">`;
  return `
    <form id="budgetForm" class="stack">
      <p class="meta">Todo es opcional: rellénalo cuando tengas datos. Importes en euros.</p>

      <label>Vuelo principal para llegar a ${esc(base.name)}
        ${input("flight")}
      </label>
      <div class="budget-line"><span>Vuelo principal</span><strong data-sub="flight">${eur(t.flight)}</strong></div>

      <label>Alojamiento: precio por noche
        ${input("perNight")}
      </label>
      <div class="budget-line"><span>× ${nightsOf(base)} noches</span><strong data-sub="lodging">${eur(t.lodging)}</strong></div>

      <label>Coste medio por día (comida, transporte, actividades)
        ${input("perDay")}
      </label>
      <div class="budget-line"><span>× ${base.days} días</span><strong data-sub="daily">${eur(t.daily)}</strong></div>

      <label>Precio medio de un viaje a un destino
        ${input("perDestTrip")}
      </label>
      <div class="budget-line"><span>× ${base.destinations.length} destinos</span><strong data-sub="destTrips">${eur(t.destTrips)}</strong></div>

      <div class="budget-line total"><span>Total ${esc(base.name)}</span><strong data-sub="total">${eur(t.total)}</strong></div>
      <button class="primary" type="submit">Guardar presupuesto</button>
    </form>`;
}

// Muestra km y horas a mano solo si la distancia no se puede calcular (falta alguna coordenada)
function refreshManualFields() {
  const box = sheetBody.querySelector("#manualFields");
  const base = state.bases.find((b) => b.id === openBaseId);
  if (!box || !base) return;
  const p = destPicker?.value();
  const auto = p && p.lat != null && base.lat != null;
  box.hidden = !p || auto;
}

// Solo actualiza las secciones de clima y riesgos, para no perder lo que se esté escribiendo en la ficha
function fillClimateSections() {
  const item = layout().find((x) => x.base.id === openBaseId);
  if (!item) return;
  const { base, from, to } = item;
  const climateBox = sheetBody.querySelector("#sheetClimate");
  const risksBox = sheetBody.querySelector("#sheetRisks");
  if (!climateBox || !risksBox) return;
  climateBox.innerHTML = climateHtml(base, from, to);
  risksBox.innerHTML = risksHtml(base, from, to);
}

function climateHtml(base, from, to) {
  if (!state.startDate) return '<p class="meta">Elige la fecha de inicio arriba para ver el clima de cada mes de esta base.</p>';
  const stats = climateFor(base);
  if (!stats) {
    const pending = base.lat != null && climatePending.has(climateKeyOf(base.lat, base.lng));
    const text = pending ? "Cargando clima…" : `${ND}. Se cargará cuando haya conexión.`;
    return `<p class="meta">${text}</p>`;
  }
  const months = monthBreakdown(from, to);
  const total = months.reduce((s, m) => s + m.days, 0);
  const avg = months.reduce((s, m) => s + stats.months[m.month].t * m.days, 0) / total;
  const rows = months.map((m) => `
    <div class="month-row">
      <span><strong>${cap(MONTHS[m.month])} ${m.year}</strong> · ${m.days} días</span>
      <span>${fmt1(stats.months[m.month].t)} °C</span>
    </div>`).join("");
  return `
    <p class="meta">Temperatura media del periodo: <strong>${fmt1(avg)} °C</strong> · media de ${stats.years} años</p>
    ${rows}`;
}

function risksHtml(base, from, to) {
  if (!state.startDate) return '<p class="meta">Elige la fecha de inicio para ver los riesgos de cada mes.</p>';
  const items = riskItems(climateFor(base), monthBreakdown(from, to));
  return items.map((r) => `
    <div class="risk ${r.level}"><b>${LEVEL_LABEL[r.level]}</b>${esc(r.name)}<br><span class="meta">${esc(r.detail)}</span></div>
  `).join("");
}

// Días que faltan para que empiece la base (null si no hay fecha de inicio)
function daysUntilStart(from) {
  const start = dayToDate(from);
  if (!start) return null;
  const today = new Date();
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((start - t) / 86400000);
}

function riesgoPaisHtml(base, from) {
  const days = daysUntilStart(from);
  let timing = "";
  if (days != null && days >= 0 && days <= 60) {
    timing = `<div class="risk alto"><b>Próxima</b>La base empieza en ${days} días: conviene revisar el riesgo político.</div>`;
  } else if (days != null && days > 60) {
    timing = `<p class="meta">La base empieza en ${days} días.</p>`;
  }
  const r = base.iso2 ? RIESGO_PAIS[base.iso2] : null;
  if (!r || !r.nivel) {
    return `${timing}<p class="meta">${ND}. Consulta <a href="${RIESGO_FUENTE}" target="_blank" rel="noopener">exteriores.gob.es</a>.</p>`;
  }
  const label = { sin: "Sin recomendaciones especiales", precaucion: "Precaución", desaconsejado: "Desaconsejado" }[r.nivel];
  const cls = { sin: "bajo", precaucion: "medio", desaconsejado: "alto" }[r.nivel];
  const note = r.nota ? `${esc(r.nota)} · ` : "";
  return `${timing}<div class="risk ${cls}"><b>${esc(label)}</b>${esc(base.country || "")}<br><span class="meta">${note}Revisado: ${esc(r.fecha || "sin fecha")} · verificar en exteriores.gob.es</span></div>`;
}

function requisitosHtml(base) {
  if (!base.iso2) return `<p class="meta">${ND}. Busca otra ciudad para asignar su país.</p>`;
  if (base.iso2 === "ES") return "<p>Es tu país: no necesitas ningún trámite de entrada.</p>";
  if (EU_ISO2.includes(base.iso2)) {
    return `<p>${esc(base.country || "País de la UE")}: basta tu DNI o pasaporte en vigor. Sin límite de estancia para ciudadanos de la UE.</p>`;
  }
  const r = REQUISITOS[base.iso2];
  if (!r) return `<p class="meta">${ND}. Consulta <a href="${REQUISITOS_FUENTE}" target="_blank" rel="noopener">exteriores.gob.es</a>.</p>`;
  const over = r.maxDays && base.days > r.maxDays
    ? `<div class="risk alto"><b>Aviso</b>Tu estancia (${base.days} días) supera el límite de ${r.maxDays} días por visita. Tendrías que salir del país antes.</div>`
    : "";
  return `
    <dl class="req">
      <dt>Visado o autorización</dt><dd>${esc(r.visa)}</dd>
      <dt>Estancia máxima</dt><dd>${esc(r.stay)}</dd>
      ${r.notes ? `<dt>Notas</dt><dd>${esc(r.notes)}</dd>` : ""}
    </dl>
    ${over}
    <p class="meta">Pasaporte en vigor. Información orientativa: verifica en <a href="${REQUISITOS_FUENTE}" target="_blank" rel="noopener">exteriores.gob.es</a> antes de viajar.</p>`;
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

sheetBody.addEventListener("submit", (e) => {
  e.preventDefault();
  const base = state.bases.find((b) => b.id === openBaseId);
  if (!base) return;
  const f = Object.fromEntries(new FormData(e.target));

  if (e.target.id === "baseEdit") {
    const days = Number(f.days);
    const nights = Number(f.nights);
    if (!Number.isInteger(days) || days < 1 || !Number.isInteger(nights) || nights < 0) {
      return alert("Revisa los días y las noches.");
    }
    // Las noches siguen a los días mientras no se cambien a mano
    const untouched = base.nights == null && nights === nightsOf(base);
    base.nights = untouched || nights === days ? null : nights;
    base.days = days;
  } else if (e.target.id === "budgetForm") {
    base.budget = readBudget(f);
  } else if (e.target.id === "destForm") {
    const p = destPicker.value();
    if (!p) return;
    const auto = p.lat != null && base.lat != null;
    base.destinations.push({
      id: uid(),
      name: p.name,
      km: auto ? Math.round(haversine(base.lat, base.lng, p.lat, p.lng)) : toNum(f.km),
      hours: auto ? null : toNum(f.hours),
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

  if (btn.dataset.sheetTab) {
    // Cambiar de pestaña sin volver a dibujar la ficha, para no perder lo que se esté escribiendo
    sheetTab = btn.dataset.sheetTab;
    sheetBody.querySelectorAll("[data-sheet-tab]").forEach((b) => b.classList.toggle("active", b.dataset.sheetTab === sheetTab));
    sheetBody.querySelectorAll("[data-panel]").forEach((p) => { p.hidden = p.dataset.panel !== sheetTab; });
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

// Subtotales del presupuesto actualizados mientras se escribe
sheetBody.addEventListener("input", (e) => {
  const form = e.target.closest("#budgetForm");
  const base = state.bases.find((b) => b.id === openBaseId);
  if (!form || !base) return;
  const preview = budgetOf({ ...base, budget: readBudget(Object.fromEntries(new FormData(form))) });
  form.querySelectorAll("[data-sub]").forEach((el) => {
    el.textContent = eur(preview[el.dataset.sub]);
  });
});

$("#closeSheet").addEventListener("click", () => sheet.close());

$("#closeBudget").addEventListener("click", () => budgetDialog.close());

$("#budgetBody").addEventListener("click", (e) => {
  const row = e.target.closest("[data-base-id]");
  if (!row) return;
  budgetDialog.close();
  openSheet(row.dataset.baseId, "presupuesto");
});

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
  state.bases.push({
    id: uid(),
    name: p.name,
    country: p.country,
    iso2: p.iso2,
    lat: p.lat,
    lng: p.lng,
    days,
    nights: null,
    budget: { flight: null, perNight: null, perDay: null, perDestTrip: null },
    destinations: [],
  });
  save();
  renderAll();
  baseDialog.close();
});

// ---------- Copia de seguridad ----------

$("#exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const name = `300dOnEarth-${new Date().toISOString().slice(0, 10)}.json`;
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$("#importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data?.bases)) throw new Error("formato no válido");
    if (state.bases.length && !confirm("Esto reemplazará la planificación actual por la del archivo. ¿Continuar?")) return;
    state = normalizeState(data);
    save();
    renderAll();
  } catch {
    alert("El archivo no es válido.");
  }
});

// ---------- Arranque ----------

// Pide al navegador que no borre estos datos si le falta espacio
navigator.storage?.persist?.();

// Contornos del mundo: se definen una vez y se repiten a izquierda y derecha para que el recorrido cruce el antimeridiano.
mapSvg.querySelector("defs").innerHTML = `<path id="worldShape" d="${WORLD_PATH_D}"></path>`;
$("#mapLand").innerHTML = [-1080, -720, -360, 0, 360, 720, 1080].map((x) => `<use href="#worldShape" x="${x}"></use>`).join("");

renderAll();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}
window.addEventListener("online", ensureClimate);
