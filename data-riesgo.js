// Riesgo político por país para ciudadanos españoles (recomendación oficial del Ministerio de Asuntos Exteriores).
// nivel: "sin" (sin recomendaciones especiales) | "precaucion" | "desaconsejado" | null (sin dato todavía).
// fecha: última vez que se comprobó en la fuente oficial, formato AAAA-MM-DD.
const RIESGO_FUENTE = "https://www.exteriores.gob.es/";

const RIESGO_PAIS = {
  US: { nivel: null, nota: "", fecha: null },
  CA: { nivel: null, nota: "", fecha: null },
  MX: { nivel: null, nota: "", fecha: null },
  GT: { nivel: null, nota: "", fecha: null },
  SV: { nivel: null, nota: "", fecha: null },
  HN: { nivel: null, nota: "", fecha: null },
  NI: { nivel: null, nota: "", fecha: null },
  CR: { nivel: null, nota: "", fecha: null },
  PA: { nivel: null, nota: "", fecha: null },
  CO: { nivel: null, nota: "", fecha: null },
  PE: { nivel: null, nota: "", fecha: null },
  CL: { nivel: null, nota: "", fecha: null },
  AR: { nivel: null, nota: "", fecha: null },
  BR: { nivel: null, nota: "", fecha: null },
  JP: { nivel: null, nota: "", fecha: null },
  AU: { nivel: null, nota: "", fecha: null },
  NZ: { nivel: null, nota: "", fecha: null },
  ZA: { nivel: null, nota: "", fecha: null },
  MA: { nivel: null, nota: "", fecha: null },
  TR: { nivel: null, nota: "", fecha: null },
  TH: { nivel: null, nota: "", fecha: null },
  GB: { nivel: null, nota: "", fecha: null },
};
