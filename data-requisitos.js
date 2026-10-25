// Requisitos de entrada para ciudadanos españoles con pasaporte en vigor.
// Información ORIENTATIVA, no garantizada: las normas cambian. Verificar siempre en la web oficial antes de viajar.
// maxDays: estancia máxima por visita para turismo, en días (null = no recogido aquí).
const REQUISITOS_FUENTE = "https://www.exteriores.gob.es/";

// Países de la UE (sin España), que no tienen restricción de estancia para un ciudadano español.
const EU_ISO2 = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "SE"];

const REQUISITOS = {
  US: {
    visa: "Sin visado con ESTA (autorización electrónica de viaje), que hay que tramitar antes de volar.",
    stay: "Hasta 90 días por visita",
    maxDays: 90,
    notes: "Las normas de entrada en EE. UU. han cambiado en los últimos años. Revisa siempre la web oficial.",
  },
  CA: {
    visa: "Sin visado, pero necesitas eTA (autorización electrónica) si llegas en avión.",
    stay: "Hasta 6 meses por visita",
    maxDays: 180,
  },
  MX: {
    visa: "Sin visado para turismo. Al entrar se tramita la FMM (forma migratoria), que se puede rellenar en línea.",
    stay: "Hasta 180 días",
    maxDays: 180,
  },
  GT: {
    visa: "Sin visado.",
    stay: "Hasta 90 días",
    maxDays: 90,
    notes: "Comprueba la validez mínima que exige el pasaporte.",
  },
  SV: {
    visa: "Sin visado.",
    stay: "Hasta 90 días, compartidos entre Guatemala, El Salvador, Honduras y Nicaragua",
    maxDays: 90,
  },
  HN: {
    visa: "Sin visado.",
    stay: "Hasta 90 días, compartidos entre Guatemala, El Salvador, Honduras y Nicaragua",
    maxDays: 90,
  },
  NI: {
    visa: "Sin visado.",
    stay: "Hasta 90 días, compartidos entre Guatemala, El Salvador, Honduras y Nicaragua",
    maxDays: 90,
  },
  CR: { visa: "Sin visado.", stay: "Hasta 90 días", maxDays: 90 },
  PA: { visa: "Sin visado.", stay: "Hasta 180 días", maxDays: 180 },
  CO: { visa: "Sin visado.", stay: "Hasta 90 días", maxDays: 90 },
  PE: { visa: "Sin visado.", stay: "Hasta 183 días", maxDays: 183 },
  CL: { visa: "Sin visado.", stay: "Hasta 90 días", maxDays: 90 },
  AR: { visa: "Sin visado.", stay: "Hasta 90 días", maxDays: 90 },
  BR: { visa: "Sin visado.", stay: "Hasta 90 días", maxDays: 90 },
  JP: { visa: "Sin visado para turismo.", stay: "Hasta 90 días", maxDays: 90 },
  AU: {
    visa: "Autorización ETA obligatoria, que se tramita con la aplicación ETA antes del viaje.",
    stay: "Hasta 3 meses por visita",
    maxDays: 90,
  },
  NZ: {
    visa: "NZeTA (autorización electrónica de viaje) obligatoria.",
    stay: "Hasta 3 meses por visita",
    maxDays: 90,
  },
  ZA: { visa: "Sin visado.", stay: "Hasta 90 días", maxDays: 90 },
  MA: { visa: "Sin visado.", stay: "Hasta 90 días", maxDays: 90 },
  TR: { visa: "Sin visado para turismo.", stay: "Hasta 90 días", maxDays: 90 },
  TH: {
    visa: "Exención de visado para turismo.",
    stay: "60 días",
    maxDays: 60,
    notes: "Rellena la tarjeta de llegada digital antes de entrar.",
  },
  GB: {
    visa: "Autorización electrónica ETA obligatoria para ciudadanos de la UE.",
    stay: "Hasta 6 meses por visita",
    maxDays: 180,
  },
};
