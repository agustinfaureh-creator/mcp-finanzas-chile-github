/**
 * Motor tributario y contable (funciones puras, sin acceso a archivos).
 * Todo lo que es una tasa o un parametro esta en PARAMETROS para poder revisarlo y editarlo.
 *
 * AVISO: son ESTIMACIONES con fines academicos. No reemplazan a un contador
 * ni a la declaracion oficial del SII. Verificar siempre las tasas vigentes en sii.cl.
 */

export type Regimen = "14A" | "14D3" | "14D8";
export type TipoMov = "ingreso" | "gasto";
export type Documento = "factura" | "boleta" | "honorarios" | "exento" | "sin_documento";

export interface Movimiento {
  fecha: string; // YYYY-MM-DD
  tipo: TipoMov;
  categoria: string;
  descripcion: string;
  neto: number;
  iva: number;
  documento: Documento;
  /** Ej. "33-1234" (tipo de documento SII + folio). Sirve para no duplicar facturas. */
  folio?: string;
  rut?: string;
  /** AAAA-MM en que el IVA de este documento entra al F29, si es distinto al mes de la fecha (lo define el SII con el acuse). */
  periodoIva?: string;
}

/** Parametros editables. Fuentes: SII, Ley 21.755, Ley 21.850 (revisadas nov 2026). */
export const PARAMETROS = {
  iva: 0.19,
  /** Retencion de boletas de honorarios por ano comercial (Ley 21.133). */
  retencionHonorarios: { 2025: 0.145, 2026: 0.1525, 2027: 0.16, 2028: 0.17 } as Record<number, number>,
  retencionHonorariosDesde2028: 0.17,
  /** Tasa del impuesto de primera categoria por regimen y ano comercial. */
  idpc: {
    "14A": { 2026: 0.27, 2027: 0.255 } as Record<number, number>,
    "14D3": { 2026: 0.125, 2027: 0.125 } as Record<number, number>,
    "14D8": {} as Record<number, number>,
  },
  idpcPorDefecto: { "14A": 0.255, "14D3": 0.25, "14D8": 0 },
  /** PPM sobre ingresos netos del mes. Valores aproximados: verificar en el SII. */
  ppm: {
    "14A": 0.01, // variable por empresa (IDPC / ingresos del ano anterior); 1% = referencia del primer ano
    "14D3": { hasta50000UF: 0.00125, sobre50000UF: 0.0025 },
    "14D8": { hasta50000UF: 0.001, sobre50000UF: 0.0025 }, // tasa transitoria rebajada; el SII la propone en el F29
  },
  uf50000: 50000,
  /** Impuesto Global Complementario: tramos en multiplos de UTA (limite superior, tasa, rebaja en UTA). */
  igc: [
    { hasta: 13.5, tasa: 0, rebaja: 0 },
    { hasta: 30, tasa: 0.04, rebaja: 0.54 },
    { hasta: 50, tasa: 0.08, rebaja: 1.74 },
    { hasta: 70, tasa: 0.135, rebaja: 4.49 },
    { hasta: 90, tasa: 0.23, rebaja: 11.14 },
    { hasta: 120, tasa: 0.304, rebaja: 17.8 },
    { hasta: 310, tasa: 0.35, rebaja: 23.32 },
    { hasta: Infinity, tasa: 0.4, rebaja: 37.82 },
  ],
  /** Dia limite de pago del F29 (dia 12; dia 20 si se declara por internet). */
  diaVencimientoF29: 20,
};

export const REGIMENES: Record<Regimen, string> = {
  "14A": "Régimen General (14 A, semi integrado)",
  "14D3": "Pro Pyme General (14 D N°3)",
  "14D8": "Pro Pyme Transparente (14 D N°8)",
};

/** Categorias que el EERR trata como costo de ventas. El resto de los gastos son operacionales. */
export const CATEGORIAS_COSTO = ["costo_ventas", "costo de ventas", "costos", "mercaderia", "produccion", "producción"];
export const CATEGORIAS_FINANCIERAS = ["financiero", "intereses", "comisiones bancarias"];

export const redondear = (n: number): number => Math.round(n);

export function tasaRetencion(anio: number): number {
  const p = PARAMETROS;
  if (anio >= 2028) return p.retencionHonorariosDesde2028;
  return p.retencionHonorarios[anio] ?? p.retencionHonorarios[2025];
}

export function tasaIDPC(reg: Regimen, anio: number): number {
  const t = PARAMETROS.idpc[reg][anio];
  if (t !== undefined) return t;
  if (reg === "14D3" && anio >= 2028) return 0.25;
  return PARAMETROS.idpcPorDefecto[reg];
}

export function tasaPPM(reg: Regimen, ingresosAnualesUF?: number): number {
  if (reg === "14A") return PARAMETROS.ppm["14A"];
  const t = PARAMETROS.ppm[reg];
  return (ingresosAnualesUF ?? 0) > PARAMETROS.uf50000 ? t.sobre50000UF : t.hasta50000UF;
}

/**
 * Convierte un monto ingresado por el usuario en neto + IVA segun el tipo de documento.
 * - factura / boleta: lleva IVA 19% (si `conIvaIncluido`, el monto es el total).
 * - honorarios: el monto es el bruto de la boleta, sin IVA.
 * - exento / sin_documento: sin IVA.
 */
export function separarIVA(monto: number, documento: Documento, conIvaIncluido: boolean): { neto: number; iva: number } {
  if (documento === "factura" || documento === "boleta") {
    if (conIvaIncluido) {
      const neto = redondear(monto / (1 + PARAMETROS.iva));
      return { neto, iva: monto - neto };
    }
    return { neto: monto, iva: redondear(monto * PARAMETROS.iva) };
  }
  return { neto: monto, iva: 0 };
}

export function mesDe(fecha: string): string {
  return fecha.slice(0, 7);
}
export function anioDe(fecha: string): number {
  return Number(fecha.slice(0, 4));
}

export function filtrarPeriodo(movs: Movimiento[], periodo?: string): Movimiento[] {
  if (!periodo) return movs;
  return movs.filter((m) => m.fecha.startsWith(periodo));
}

const esCosto = (cat: string) => CATEGORIAS_COSTO.includes(cat.trim().toLowerCase());
const esFinanciero = (cat: string) => CATEGORIAS_FINANCIERAS.includes(cat.trim().toLowerCase());

export interface LineaCategoria {
  categoria: string;
  monto: number;
}

export interface EERR {
  periodo: string;
  regimen: Regimen;
  ingresos: number;
  costoVentas: number;
  margenBruto: number;
  gastosOperacionales: number;
  detalleGastos: LineaCategoria[];
  resultadoOperacional: number;
  gastosFinancieros: number;
  resultadoAntesImpuesto: number;
  /** Gastos sin documento: no son aceptados como gasto tributario (art. 31 LIR). */
  gastosNoAceptados: number;
  baseImponibleEstimada: number;
  impuestoPrimeraCategoria: number;
  tasaIDPC: number;
  resultadoNeto: number;
  notas: string[];
}

export function calcularEERR(movs: Movimiento[], regimen: Regimen, periodo?: string): EERR {
  const lista = filtrarPeriodo(movs, periodo);
  const anio = periodo ? Number(periodo.slice(0, 4)) : lista.length ? anioDe(lista[0].fecha) : new Date().getFullYear();
  const ingresos = lista.filter((m) => m.tipo === "ingreso").reduce((a, m) => a + m.neto, 0);
  const gastos = lista.filter((m) => m.tipo === "gasto");

  let costoVentas = 0;
  let gastosFinancieros = 0;
  let gastosNoAceptados = 0;
  const porCategoria = new Map<string, number>();
  for (const g of gastos) {
    if (g.documento === "sin_documento") gastosNoAceptados += g.neto;
    if (esCosto(g.categoria)) costoVentas += g.neto;
    else if (esFinanciero(g.categoria)) gastosFinancieros += g.neto;
    else porCategoria.set(g.categoria, (porCategoria.get(g.categoria) ?? 0) + g.neto);
  }
  const detalleGastos = [...porCategoria.entries()]
    .map(([categoria, monto]) => ({ categoria, monto }))
    .sort((a, b) => b.monto - a.monto);
  const gastosOperacionales = detalleGastos.reduce((a, l) => a + l.monto, 0);

  const margenBruto = ingresos - costoVentas;
  const resultadoOperacional = margenBruto - gastosOperacionales;
  const resultadoAntesImpuesto = resultadoOperacional - gastosFinancieros;
  const baseImponibleEstimada = Math.max(0, resultadoAntesImpuesto + gastosNoAceptados);
  const tasa = tasaIDPC(regimen, anio);
  const impuesto = redondear(baseImponibleEstimada * tasa);

  const notas: string[] = [];
  if (gastosNoAceptados > 0)
    notas.push(`Hay ${gastosNoAceptados} en gastos sin documento: bajan tu resultado contable pero el SII no los acepta como gasto, por eso se suman a la base imponible.`);
  if (regimen === "14D8")
    notas.push("En Pro Pyme Transparente la empresa no paga impuesto de primera categoría: la base imponible se atribuye a los dueños, que tributan por Impuesto Global Complementario (IGC) en su declaración personal.");
  if (resultadoAntesImpuesto < 0) notas.push("El período tiene pérdida: no hay impuesto de primera categoría (la pérdida tributaria puede arrastrarse a años siguientes).");

  return {
    periodo: periodo ?? String(anio),
    regimen,
    ingresos,
    costoVentas,
    margenBruto,
    gastosOperacionales,
    detalleGastos,
    resultadoOperacional,
    gastosFinancieros,
    resultadoAntesImpuesto,
    gastosNoAceptados,
    baseImponibleEstimada,
    impuestoPrimeraCategoria: impuesto,
    tasaIDPC: tasa,
    resultadoNeto: resultadoAntesImpuesto - impuesto,
    notas,
  };
}

export interface F29Mes {
  mes: string; // YYYY-MM
  ivaDebito: number;
  ivaCredito: number;
  remanenteAnterior: number;
  ivaAPagar: number;
  remanenteSiguiente: number;
  ingresosNetos: number;
  ppm: number;
  retencionHonorarios: number;
  totalF29: number;
  vence: string; // YYYY-MM-DD
}

/** Ultimo dia habil aproximado: si cae sabado/domingo se mueve al lunes (no considera feriados). */
export function fechaVencimiento(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, PARAMETROS.diaVencimientoF29)); // mes siguiente (m es 1-based => indice m)
  const dow = d.getUTCDay();
  if (dow === 6) d.setUTCDate(d.getUTCDate() + 2);
  if (dow === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export interface PagosSII {
  anio: number;
  regimen: Regimen;
  meses: F29Mes[];
  totalIVA: number;
  totalPPM: number;
  totalRetenciones: number;
  totalF29: number;
  remanenteFinal: number;
  renta: {
    baseImponible: number;
    tasa: number;
    impuestoPrimeraCategoria: number;
    creditoPPM: number;
    impuestoAnualAPagar: number;
    devolucionPPM: number;
    baseAtribuidaADuenos: number;
    igcEstimado: number | null;
    notaIGC: string;
    fechaDeclaracion: string;
  };
  notas: string[];
}

export function igcPorBase(baseEnPesos: number, uta: number): number {
  const enUTA = baseEnPesos / uta;
  const tramo = PARAMETROS.igc.find((t) => enUTA <= t.hasta)!;
  return Math.max(0, redondear((enUTA * tramo.tasa - tramo.rebaja) * uta));
}

export function calcularPagosSII(movs: Movimiento[], regimen: Regimen, anio: number, opts: { uta?: number; valorUF?: number; tasaPPM?: number } = {}): PagosSII {
  const delAnio = movs.filter((m) => anioDe(m.fecha) === anio);
  const mesIva = (m: Movimiento) => m.periodoIva ?? mesDe(m.fecha);
  const paraIva = movs.filter((m) => Number(mesIva(m).slice(0, 4)) === anio);
  const meses = [...new Set([...delAnio.map((m) => mesDe(m.fecha)), ...paraIva.map(mesIva)])].sort();
  const ingresosAnio = delAnio.filter((m) => m.tipo === "ingreso").reduce((a, m) => a + m.neto, 0);
  const ingresosUF = opts.valorUF ? ingresosAnio / opts.valorUF : undefined;
  const tasaP = opts.tasaPPM ?? tasaPPM(regimen, ingresosUF);
  const tasaRet = tasaRetencion(anio);

  const lineas: F29Mes[] = [];
  let remanente = 0;
  for (const mes of meses) {
    const mm = delAnio.filter((m) => mesDe(m.fecha) === mes);
    const mi = paraIva.filter((m) => mesIva(m) === mes);
    const ivaDebito = mi.filter((m) => m.tipo === "ingreso").reduce((a, m) => a + m.iva, 0);
    const ivaCredito = mi.filter((m) => m.tipo === "gasto" && m.documento !== "sin_documento").reduce((a, m) => a + m.iva, 0);
    const ingresosNetos = mm.filter((m) => m.tipo === "ingreso").reduce((a, m) => a + m.neto, 0);
    const retencion = redondear(
      mm.filter((m) => m.tipo === "gasto" && m.documento === "honorarios").reduce((a, m) => a + m.neto, 0) * tasaRet,
    );
    const saldo = ivaDebito - ivaCredito - remanente;
    const ivaAPagar = Math.max(0, saldo);
    const remanenteSiguiente = Math.max(0, -saldo);
    const ppm = redondear(ingresosNetos * tasaP);
    lineas.push({
      mes,
      ivaDebito,
      ivaCredito,
      remanenteAnterior: remanente,
      ivaAPagar,
      remanenteSiguiente,
      ingresosNetos,
      ppm,
      retencionHonorarios: retencion,
      totalF29: ivaAPagar + ppm + retencion,
      vence: fechaVencimiento(mes),
    });
    remanente = remanenteSiguiente;
  }

  const eerr = calcularEERR(delAnio, regimen, String(anio));
  const totalPPM = lineas.reduce((a, l) => a + l.ppm, 0);
  const idpc = eerr.impuestoPrimeraCategoria;
  const saldoRenta = idpc - totalPPM;

  let igc: number | null = null;
  let notaIGC = "";
  if (regimen === "14D8") {
    if (opts.uta) {
      igc = igcPorBase(eerr.baseImponibleEstimada, opts.uta);
      notaIGC = "IGC calculado sobre toda la base como si fuera de un solo dueño. Si hay varios socios, se reparte según su participación y cada uno tributa con sus otras rentas.";
    } else {
      notaIGC = "Para estimar el IGC de los dueños indica el valor de la UTA vigente (parámetro `uta`).";
    }
  }

  const notas = [
    "Estimación académica: no reemplaza al contador ni al SII. Verifica tasas en sii.cl.",
    `PPM aplicado: ${(tasaP * 100).toFixed(3)}% de los ingresos netos del mes (tasa de referencia; el SII fija la tuya).`,
    `Retención de boletas de honorarios: ${(tasaRet * 100).toFixed(2)}% del bruto (año comercial ${anio}).`,
    "El IVA a favor (remanente) se arrastra al mes siguiente sin reajuste en este modelo.",
    "Las fechas de vencimiento mueven al lunes si caen en fin de semana; no consideran feriados.",
  ];
  if (eerr.gastosNoAceptados > 0) notas.push("Gastos sin documento no dan crédito de IVA ni se aceptan como gasto tributario.");

  return {
    anio,
    regimen,
    meses: lineas,
    totalIVA: lineas.reduce((a, l) => a + l.ivaAPagar, 0),
    totalPPM,
    totalRetenciones: lineas.reduce((a, l) => a + l.retencionHonorarios, 0),
    totalF29: lineas.reduce((a, l) => a + l.totalF29, 0),
    remanenteFinal: remanente,
    renta: {
      baseImponible: eerr.baseImponibleEstimada,
      tasa: eerr.tasaIDPC,
      impuestoPrimeraCategoria: idpc,
      creditoPPM: totalPPM,
      // En 14 D N°8 no hay IDPC: los PPM pagados son credito contra el IGC de los duenos.
      impuestoAnualAPagar: regimen === "14D8" ? 0 : Math.max(0, saldoRenta),
      devolucionPPM: regimen === "14D8" ? 0 : Math.max(0, -saldoRenta),
      baseAtribuidaADuenos: regimen === "14D8" ? eerr.baseImponibleEstimada : 0,
      igcEstimado: igc,
      notaIGC,
      fechaDeclaracion: `Abril ${anio + 1} (Formulario 22, Año Tributario ${anio + 1})`,
    },
    notas,
  };
}

export const fmt = (n: number): string => "$" + Math.round(n).toLocaleString("es-CL");

export function validarFechaISO(f: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  const d = new Date(f + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
}

export interface EERRMes {
  mes: string;
  ingresos: number;
  costoVentas: number;
  margenBruto: number;
  gastosOperacionales: number;
  gastosFinancieros: number;
  resultadoAntesImpuesto: number;
}

/** EERR mes a mes de un ano (sin impuesto: el impuesto de renta es anual). */
export function eerrMensual(movs: Movimiento[], regimen: Regimen, anio: number): EERRMes[] {
  const meses = [...new Set(movs.filter((m) => anioDe(m.fecha) === anio).map((m) => mesDe(m.fecha)))].sort();
  return meses.map((mes) => {
    const e = calcularEERR(movs, regimen, mes);
    return {
      mes,
      ingresos: e.ingresos,
      costoVentas: e.costoVentas,
      margenBruto: e.margenBruto,
      gastosOperacionales: e.gastosOperacionales,
      gastosFinancieros: e.gastosFinancieros,
      resultadoAntesImpuesto: e.resultadoAntesImpuesto,
    };
  });
}

export interface Recordatorio {
  fecha: string;
  concepto: string;
  montoEstimado: number | null;
  diasRestantes: number;
  detalle: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const sumaMes = (mes: string, n: number): string => {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

/** Proximos vencimientos (F29 de los ultimos meses con movimientos y F22 de abril) desde `hoy` (AAAA-MM-DD). */
export function proximosPagos(movs: Movimiento[], regimen: Regimen, hoy: string, opts: { uta?: number; tasaPPM?: number } = {}): Recordatorio[] {
  const out: Recordatorio[] = [];
  const hoyD = new Date(hoy + "T00:00:00Z");
  const dias = (f: string) => Math.round((new Date(f + "T00:00:00Z").getTime() - hoyD.getTime()) / 86_400_000);
  const anios = [...new Set(movs.map((m) => anioDe(m.fecha)))];
  const mesesF29 = new Map<string, number>();
  for (const a of anios) {
    for (const l of calcularPagosSII(movs, regimen, a, opts).meses) mesesF29.set(l.mes, l.totalF29);
  }
  // F29 de los meses recientes + los proximos 3 meses aunque aun no tengan datos
  const mesActual = hoy.slice(0, 7);
  for (let i = -2; i <= 3; i++) {
    const mes = sumaMes(mesActual, i - 1); // el F29 del mes M se paga en M+1
    const vence = fechaVencimiento(mes);
    if (vence < hoy) continue;
    const monto = mesesF29.get(mes);
    out.push({
      fecha: vence,
      concepto: `F29 de ${mes} (IVA, PPM y retenciones)`,
      montoEstimado: monto ?? null,
      diasRestantes: dias(vence),
      detalle: monto === undefined ? "Aún no hay movimientos de ese mes; el monto se calcula al cargar las facturas." : "Monto estimado con los movimientos cargados.",
    });
  }
  const anioRenta = Number(hoy.slice(0, 4)) + (hoy.slice(5, 7) > "04" ? 1 : 0);
  out.push({
    fecha: `${anioRenta}-04-30`,
    concepto: `Declaración de renta F22 (año comercial ${anioRenta - 1})`,
    montoEstimado: null,
    diasRestantes: dias(`${anioRenta}-04-30`),
    detalle: "Fecha referencial (fin de abril): confirma el plazo exacto en sii.cl. En 14 D N°8 el impuesto lo pagan los socios.",
  });
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Calendario .ics con recordatorios (3 dias y 1 dia antes) para importar en Calendario o Google Calendar. */
export function generarICS(recs: Recordatorio[]): string {
  const esc = (t: string) => t.replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  const lineas = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//mcp-finanzas-chile//ES", "CALSCALE:GREGORIAN"];
  for (const r of recs) {
    const d = r.fecha.replace(/-/g, "");
    const fin = iso(new Date(new Date(r.fecha + "T00:00:00Z").getTime() + 86_400_000)).replace(/-/g, "");
    lineas.push(
      "BEGIN:VEVENT",
      `UID:${d}-${Buffer.from(r.concepto).toString("hex").slice(0, 16)}@mcp-finanzas-chile`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
      `DTSTART;VALUE=DATE:${d}`,
      `DTEND;VALUE=DATE:${fin}`,
      `SUMMARY:${esc("Pagar al SII: " + r.concepto)}`,
      `DESCRIPTION:${esc(r.detalle + " Revisa el monto en Mi SII antes de pagar.")}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Vence en 3 dias", "TRIGGER:-P3D", "END:VALARM",
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Vence manana", "TRIGGER:-P1D", "END:VALARM",
      "END:VEVENT",
    );
  }
  lineas.push("END:VCALENDAR");
  return lineas.join("\r\n") + "\r\n";
}
