// Datos de referencia. Los valores son APROXIMADOS y deben verificarse con
// fuentes climáticas oficiales antes de tomar decisiones de seguridad.
// temp: temperatura media diaria (°C) por mes, enero = índice 0.
// rain: precipitación media mensual (mm), enero = índice 0.
// risks.months: meses en los que aplica el riesgo (1 = enero ... 12 = diciembre).

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// Claves sin tildes y en minúsculas (ver norm() en app.js).
const CLIMATE = {
  "vancouver": {
    temp: [3, 4, 6, 8, 11, 14, 17, 17, 14, 10, 6, 4],
    rain: [165, 115, 110, 85, 65, 55, 40, 50, 90, 175, 230, 215],
    risks: [
      { name: "Lluvias intensas y vientos fuertes", level: "medio", months: [10, 11, 12, 1, 2], note: "Temporales frecuentes en otoño e invierno." },
      { name: "Incendios forestales (humo)", level: "medio", months: [7, 8, 9], note: "Humo de incendios en el interior de la Columbia Británica." },
      { name: "Sismos", level: "medio", months: ALL_MONTHS, note: "Zona sísmica (Cascadia): terremoto posible en cualquier época." },
    ],
  },
  "los angeles": {
    temp: [14, 15, 16, 17, 19, 20, 22, 23, 23, 21, 18, 15],
    rain: [80, 70, 60, 20, 5, 2, 0, 0, 5, 10, 25, 60],
    risks: [
      { name: "Incendios forestales", level: "alto", months: [9, 10, 11, 12], note: "Temporada alta con vientos Santa Ana en otoño." },
      { name: "Sismos", level: "alto", months: ALL_MONTHS, note: "Falla de San Andrés y otras fallas activas." },
      { name: "Calor extremo", level: "medio", months: [7, 8, 9], note: "Olas de calor en el interior y valles." },
      { name: "Deslizamientos", level: "medio", months: [1, 2, 3], note: "Lluvias sobre laderas afectadas por incendios." },
    ],
  },
  "cancun": {
    temp: [24, 24, 25, 26, 27, 28, 28, 28, 27, 27, 26, 25],
    rain: [50, 30, 30, 40, 100, 160, 130, 150, 190, 200, 110, 70],
    risks: [
      { name: "Huracanes", level: "alto", months: [6, 7, 8, 9, 10, 11], note: "Temporada de huracanes; pico en septiembre-octubre." },
      { name: "Calor y humedad", level: "medio", months: [4, 5, 6, 7, 8, 9], note: "Sensación térmica muy alta." },
      { name: "Sargazo en playas", level: "bajo", months: [3, 4, 5, 6, 7, 8], note: "Acumulaciones de algas según el año." },
    ],
  },
  "ciudad de guatemala": {
    temp: [16, 17, 19, 20, 20, 19, 19, 19, 19, 18, 17, 16],
    rain: [5, 8, 20, 50, 130, 250, 180, 190, 230, 170, 40, 10],
    risks: [
      { name: "Sismos", level: "alto", months: ALL_MONTHS, note: "Actividad sísmica frecuente en la región." },
      { name: "Lluvias intensas y deslizamientos", level: "alto", months: [5, 6, 7, 8, 9, 10], note: "Época lluviosa con riesgo de deslizamientos." },
      { name: "Volcanes cercanos (Fuego, Pacaya)", level: "medio", months: ALL_MONTHS, note: "Ceniza y actividad volcánica en la zona." },
      { name: "Tormentas tropicales", level: "medio", months: [6, 7, 8, 9, 10, 11], note: "Lluvias de tormentas que llegan desde el Pacífico y el Caribe." },
    ],
  },
  "sydney": {
    temp: [22, 22, 21, 19, 16, 13, 12, 13, 15, 17, 19, 21],
    rain: [90, 100, 110, 110, 110, 120, 100, 80, 70, 70, 70, 70],
    risks: [
      { name: "Incendios forestales", level: "alto", months: [10, 11, 12, 1, 2, 3], note: "Pico en diciembre-febrero (verano austral)." },
      { name: "Calor extremo", level: "medio", months: [12, 1, 2], note: "Olas de calor en verano." },
      { name: "Tormentas severas y granizo", level: "medio", months: [10, 11, 12, 1, 2, 3], note: "Tormentas de tarde con granizo." },
      { name: "Inundaciones", level: "bajo", months: [2, 3, 4, 5, 6], note: "Lluvias intensas puntuales." },
    ],
  },
};

// Ejemplo de planificación para probar la app. Se carga con el botón "Ejemplo".
const SAMPLE_BASES = [
  {
    name: "Vancouver", country: "Canadá", lat: 49.28, lng: -123.12, days: 30, destinations: [
      { name: "Whistler", lat: 50.12, lng: -122.95, km: 120, hours: 2, notes: "Aprox." },
      { name: "Victoria", lat: 48.43, lng: -123.37, km: null, hours: 4, notes: "Ferry + carretera (aprox.)" },
    ],
  },
  {
    name: "Los Ángeles", country: "Estados Unidos", lat: 34.05, lng: -118.24, days: 45, destinations: [
      { name: "San Diego", lat: 32.72, lng: -117.16, km: 190, hours: 2.5 },
      { name: "Joshua Tree", lat: 33.87, lng: -115.90, km: 200, hours: 3 },
    ],
  },
  {
    name: "Cancún", country: "México", lat: 21.16, lng: -86.85, days: 60, destinations: [
      { name: "Tulum", lat: 20.21, lng: -87.47, km: 130, hours: 2 },
      { name: "Chichén Itzá", lat: 20.68, lng: -88.57, km: 200, hours: 2.5 },
    ],
  },
  {
    name: "Ciudad de Guatemala", country: "Guatemala", lat: 14.63, lng: -90.51, days: 40, destinations: [
      { name: "Antigua Guatemala", lat: 14.56, lng: -90.73, km: 45, hours: 1 },
      { name: "Lago de Atitlán", lat: 14.69, lng: -91.20, km: 150, hours: 3.5 },
    ],
  },
];
