/**
 * Lectura y escritura del libro Excel (.xlsx) del usuario con exceljs.
 * Hojas: "Movimientos" (los datos), "Empresa" (nombre y regimen), y las hojas de informe.
 */
import ExcelJS from "exceljs";
import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import type { Documento, EERR, Movimiento, PagosSII, Regimen, TipoMov } from "./tributario.js";

export const HOJA_MOVS = "Movimientos";
export const HOJA_EMPRESA = "Empresa";
export const HOJA_EERR = "EERR";
export const HOJA_SII = "Pagos SII";
export const ENCABEZADOS = ["Fecha", "Tipo", "Categoría", "Descripción", "Neto", "IVA", "Documento", "Folio", "RUT contraparte"];
const DOCS: Documento[] = ["factura", "boleta", "honorarios", "exento", "sin_documento"];

export class ErrorExcel extends Error {}

/** Solo se permiten archivos .xlsx (evita leer o escribir archivos que no son planillas). */
export function validarRuta(ruta: string): string {
  const abs = path.resolve(ruta);
  if (path.extname(abs).toLowerCase() !== ".xlsx") throw new ErrorExcel("La ruta debe terminar en .xlsx");
  return abs;
}

export async function abrirLibro(ruta: string): Promise<{ wb: ExcelJS.Workbook; abs: string }> {
  const abs = validarRuta(ruta);
  if (!existsSync(abs)) throw new ErrorExcel(`No existe el archivo ${abs}. Créalo antes con crear_plantilla_excel.`);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(abs);
  } catch {
    throw new ErrorExcel("No pude abrir el archivo. ¿Está abierto en Excel o no es un .xlsx válido? Ciérralo e intenta de nuevo.");
  }
  return { wb, abs };
}

function celdaTexto(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v && v.result !== undefined) return celdaTexto(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String((v as { text: unknown }).text);
  }
  return String(v).trim();
}

function celdaNumero(v: ExcelJS.CellValue): number {
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "result" in v && typeof v.result === "number") return v.result;
  const t = celdaTexto(v).replace(/\$/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

function normalizarFecha(v: ExcelJS.CellValue): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const t = celdaTexto(v);
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

export interface LecturaMovs {
  movimientos: Movimiento[];
  advertencias: string[];
}

export function leerMovimientos(wb: ExcelJS.Workbook): LecturaMovs {
  const hoja = wb.getWorksheet(HOJA_MOVS);
  if (!hoja) throw new ErrorExcel(`El libro no tiene la hoja "${HOJA_MOVS}".`);
  const movimientos: Movimiento[] = [];
  const advertencias: string[] = [];
  hoja.eachRow((row, n) => {
    if (n === 1) return;
    const fecha = normalizarFecha(row.getCell(1).value);
    const tipoRaw = celdaTexto(row.getCell(2).value).toLowerCase();
    if (!fecha && !tipoRaw && !celdaTexto(row.getCell(5).value)) return; // fila vacia
    const tipo: TipoMov | "" = tipoRaw.startsWith("ing") ? "ingreso" : tipoRaw.startsWith("gas") ? "gasto" : "";
    const neto = celdaNumero(row.getCell(5).value);
    const ivaCelda = celdaTexto(row.getCell(6).value) === "" ? 0 : celdaNumero(row.getCell(6).value);
    const doc = celdaTexto(row.getCell(7).value).toLowerCase().replace(" ", "_") as Documento;
    if (!fecha || !tipo || !Number.isFinite(neto) || !Number.isFinite(ivaCelda)) {
      advertencias.push(`Fila ${n} ignorada: revisa fecha (AAAA-MM-DD), tipo (ingreso/gasto) y neto.`);
      return;
    }
    movimientos.push({
      fecha,
      tipo,
      categoria: celdaTexto(row.getCell(3).value) || "sin_categoria",
      descripcion: celdaTexto(row.getCell(4).value),
      neto,
      iva: ivaCelda,
      documento: DOCS.includes(doc) ? doc : "exento",
      folio: celdaTexto(row.getCell(8).value) || undefined,
      rut: celdaTexto(row.getCell(9).value) || undefined,
    });
    if (!DOCS.includes(doc)) advertencias.push(`Fila ${n}: documento "${doc}" no reconocido, se trató como exento.`);
  });
  return { movimientos, advertencias };
}

export function leerEmpresa(wb: ExcelJS.Workbook): { nombre: string; regimen: Regimen } {
  const h = wb.getWorksheet(HOJA_EMPRESA);
  const nombre = h ? celdaTexto(h.getCell("B1").value) : "";
  const reg = h ? celdaTexto(h.getCell("B2").value).toUpperCase().replace(/\s/g, "") : "";
  const regimen: Regimen = reg === "14A" || reg === "14D3" || reg === "14D8" ? reg : "14D3";
  return { nombre: nombre || "Mi empresa", regimen };
}

const AZUL = "FF1F3864";
function estiloEncabezado(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
}

export async function crearPlantilla(ruta: string, nombre: string, regimen: Regimen): Promise<string> {
  const abs = validarRuta(ruta);
  await mkdir(path.dirname(abs), { recursive: true });
  const wb = new ExcelJS.Workbook();
  const em = wb.addWorksheet(HOJA_EMPRESA);
  em.addRow(["Empresa", nombre]);
  em.addRow(["Régimen", regimen]);
  em.addRow(["Regímenes válidos", "14A (general), 14D3 (Pro Pyme general), 14D8 (Pro Pyme transparente)"]);
  em.getColumn(1).width = 20;
  em.getColumn(2).width = 40;
  em.getColumn(1).font = { bold: true };

  const h = wb.addWorksheet(HOJA_MOVS);
  h.addRow(ENCABEZADOS);
  estiloEncabezado(h.getRow(1));
  [14, 10, 22, 36, 14, 12, 16, 14, 16].forEach((w, i) => (h.getColumn(i + 1).width = w));
  h.views = [{ state: "frozen", ySplit: 1 }];
  h.getColumn(5).numFmt = "#,##0";
  h.getColumn(6).numFmt = "#,##0";
  await wb.xlsx.writeFile(abs);
  return abs;
}

export async function agregarFila(ruta: string, m: Movimiento): Promise<{ abs: string; fila: number }> {
  const { wb, abs } = await abrirLibro(ruta);
  const h = wb.getWorksheet(HOJA_MOVS);
  if (!h) throw new ErrorExcel(`El libro no tiene la hoja "${HOJA_MOVS}".`);
  asegurarEncabezados(h);
  const fila = h.addRow([m.fecha, m.tipo === "ingreso" ? "Ingreso" : "Gasto", m.categoria, m.descripcion, m.neto, m.iva, m.documento, m.folio ?? "", m.rut ?? ""]);
  fila.getCell(5).numFmt = "#,##0";
  fila.getCell(6).numFmt = "#,##0";
  await wb.xlsx.writeFile(abs);
  return { abs, fila: fila.number };
}

function hojaNueva(wb: ExcelJS.Workbook, nombre: string): ExcelJS.Worksheet {
  const previa = wb.getWorksheet(nombre);
  if (previa) wb.removeWorksheet(previa.id);
  return wb.addWorksheet(nombre);
}

export async function escribirInforme(ruta: string, eerr: EERR, pagos: PagosSII | null, empresa: string): Promise<string> {
  const { wb, abs } = await abrirLibro(ruta);
  const h = hojaNueva(wb, HOJA_EERR);
  h.getColumn(1).width = 44;
  h.getColumn(2).width = 18;
  h.addRow([`Estado de Resultados — ${empresa}`]).font = { bold: true, size: 14 };
  h.addRow([`Período: ${eerr.periodo} · Régimen ${eerr.regimen}`]);
  h.addRow([]);
  const filas: [string, number, boolean][] = [
    ["Ingresos netos", eerr.ingresos, true],
    ["(-) Costo de ventas", -eerr.costoVentas, false],
    ["Margen bruto", eerr.margenBruto, true],
    ...eerr.detalleGastos.map((l): [string, number, boolean] => [`(-) ${l.categoria}`, -l.monto, false]),
    ["Resultado operacional", eerr.resultadoOperacional, true],
    ["(-) Gastos financieros", -eerr.gastosFinancieros, false],
    ["Resultado antes de impuesto", eerr.resultadoAntesImpuesto, true],
    [`(-) Impuesto 1ª categoría (${(eerr.tasaIDPC * 100).toFixed(1)}%)`, -eerr.impuestoPrimeraCategoria, false],
    ["Resultado neto", eerr.resultadoNeto, true],
  ];
  for (const [etq, val, negrita] of filas) {
    const r = h.addRow([etq, val]);
    r.getCell(2).numFmt = "#,##0;[Red]-#,##0";
    if (negrita) r.font = { bold: true };
  }
  h.addRow([]);
  for (const n of eerr.notas) h.addRow([n]);

  if (pagos) {
    const s = hojaNueva(wb, HOJA_SII);
    s.addRow(["Mes", "IVA débito", "IVA crédito", "Remanente ant.", "IVA a pagar", "Ingresos netos", "PPM", "Retención honorarios", "Total F29", "Vence"]);
    estiloEncabezado(s.getRow(1));
    s.columns.forEach((c) => (c.width = 18));
    for (const l of pagos.meses) {
      const r = s.addRow([l.mes, l.ivaDebito, l.ivaCredito, l.remanenteAnterior, l.ivaAPagar, l.ingresosNetos, l.ppm, l.retencionHonorarios, l.totalF29, l.vence]);
      for (let c = 2; c <= 9; c++) r.getCell(c).numFmt = "#,##0";
    }
    const t = s.addRow(["TOTAL", "", "", "", pagos.totalIVA, "", pagos.totalPPM, pagos.totalRetenciones, pagos.totalF29, ""]);
    t.font = { bold: true };
    for (let c = 2; c <= 9; c++) t.getCell(c).numFmt = "#,##0";
    s.addRow([]);
    const r = pagos.renta;
    s.addRow([`Renta anual (${r.fechaDeclaracion})`]).font = { bold: true };
    s.addRow(["Base imponible estimada", r.baseImponible]);
    s.addRow([`Impuesto 1ª categoría (${(r.tasa * 100).toFixed(1)}%)`, r.impuestoPrimeraCategoria]);
    s.addRow(["(-) PPM pagados", r.creditoPPM]);
    s.addRow(["Impuesto anual a pagar", r.impuestoAnualAPagar]);
    s.addRow(["Devolución estimada", r.devolucionPPM]);
    if (pagos.regimen === "14D8") s.addRow(["Base atribuida a los dueños (IGC)", r.baseAtribuidaADuenos]);
    s.addRow([]);
    for (const n of pagos.notas) s.addRow([n]);
  }
  await wb.xlsx.writeFile(abs);
  return abs;
}

/** Agrega las hojas Empresa y Movimientos a un libro que ya existe, sin tocar las demas hojas. */
export async function prepararLibroExistente(ruta: string, nombre: string, regimen: Regimen): Promise<string> {
  const { wb, abs } = await abrirLibro(ruta);
  if (wb.getWorksheet(HOJA_MOVS) || wb.getWorksheet(HOJA_EMPRESA))
    throw new ErrorExcel(`El libro ya tiene las hojas "${HOJA_EMPRESA}" o "${HOJA_MOVS}". No se modificó nada.`);
  const em = wb.addWorksheet(HOJA_EMPRESA);
  em.addRow(["Empresa", nombre]);
  em.addRow(["Régimen", regimen]);
  em.getColumn(1).width = 20;
  em.getColumn(2).width = 40;
  em.getColumn(1).font = { bold: true };
  const h = wb.addWorksheet(HOJA_MOVS);
  h.addRow(ENCABEZADOS);
  estiloEncabezado(h.getRow(1));
  [14, 10, 22, 36, 14, 12, 16, 14, 16].forEach((w, i) => (h.getColumn(i + 1).width = w));
  h.views = [{ state: "frozen", ySplit: 1 }];
  await wb.xlsx.writeFile(abs);
  return abs;
}

export interface FilaOrigen {
  fila: number;
  descripcion: string;
  categoria: string;
  monto: number;
}

/** Lee filas (descripcion, categoria opcional, monto) de otra hoja del libro. Salta vacias, subtotales y montos <= 0. */
export async function leerHojaOrigen(
  ruta: string,
  hoja: string,
  colDescripcion: string,
  colMonto: string,
  colCategoria: string | undefined,
  desde: number,
  hasta: number,
): Promise<FilaOrigen[]> {
  const { wb } = await abrirLibro(ruta);
  const ws = wb.getWorksheet(hoja);
  if (!ws) throw new ErrorExcel(`No existe la hoja "${hoja}". Hojas: ${wb.worksheets.map((w) => w.name).join(", ")}`);
  const out: FilaOrigen[] = [];
  for (let n = desde; n <= hasta; n++) {
    const desc = celdaTexto(ws.getCell(`${colDescripcion}${n}`).value);
    const monto = celdaNumero(ws.getCell(`${colMonto}${n}`).value);
    if (!desc || desc === "-" || /^(sub)?total/i.test(desc) || !Number.isFinite(monto) || monto <= 0) continue;
    out.push({ fila: n, descripcion: desc, categoria: colCategoria ? celdaTexto(ws.getCell(`${colCategoria}${n}`).value) : "", monto });
  }
  return out;
}

/** Agrega varias filas de una vez (un solo guardado del archivo). */
export async function agregarFilas(ruta: string, movs: Movimiento[]): Promise<{ abs: string; agregadas: number }> {
  const { wb, abs } = await abrirLibro(ruta);
  const h = wb.getWorksheet(HOJA_MOVS);
  if (!h) throw new ErrorExcel(`El libro no tiene la hoja "${HOJA_MOVS}". Usa preparar_libro_existente primero.`);
  asegurarEncabezados(h);
  for (const m of movs) {
    const f = h.addRow([m.fecha, m.tipo === "ingreso" ? "Ingreso" : "Gasto", m.categoria, m.descripcion, m.neto, m.iva, m.documento, m.folio ?? "", m.rut ?? ""]);
    f.getCell(5).numFmt = "#,##0";
    f.getCell(6).numFmt = "#,##0";
  }
  await wb.xlsx.writeFile(abs);
  return { abs, agregadas: movs.length };
}

/** Libros creados antes de agregar Folio y RUT: completa los titulos que falten. */
function asegurarEncabezados(h: ExcelJS.Worksheet): void {
  ENCABEZADOS.forEach((t, i) => {
    if (!celdaTexto(h.getRow(1).getCell(i + 1).value)) {
      const c = h.getRow(1).getCell(i + 1);
      c.value = t;
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    }
  });
}

export async function escribirEERRMensual(ruta: string, filas: import("./tributario.js").EERRMes[], empresa: string): Promise<string> {
  const { wb, abs } = await abrirLibro(ruta);
  const h = hojaNueva(wb, "EERR mensual");
  h.addRow([`EERR mensual — ${empresa}`]).font = { bold: true, size: 14 };
  const enc = h.addRow(["Mes", "Ingresos netos", "Costo de ventas", "Margen bruto", "Gastos operacionales", "Gastos financieros", "Resultado antes de impuesto"]);
  estiloEncabezado(enc);
  h.columns.forEach((c) => (c.width = 22));
  for (const f of filas) {
    const r = h.addRow([f.mes, f.ingresos, f.costoVentas, f.margenBruto, f.gastosOperacionales, f.gastosFinancieros, f.resultadoAntesImpuesto]);
    for (let c = 2; c <= 7; c++) r.getCell(c).numFmt = "#,##0;[Red]-#,##0";
  }
  const suma = (k: "ingresos" | "costoVentas" | "margenBruto" | "gastosOperacionales" | "gastosFinancieros" | "resultadoAntesImpuesto") =>
    filas.reduce((a, f) => a + f[k], 0);
  const t = h.addRow(["TOTAL", suma("ingresos"), suma("costoVentas"), suma("margenBruto"), suma("gastosOperacionales"), suma("gastosFinancieros"), suma("resultadoAntesImpuesto")]);
  t.font = { bold: true };
  for (let c = 2; c <= 7; c++) t.getCell(c).numFmt = "#,##0;[Red]-#,##0";
  h.addRow([]);
  h.addRow(["El impuesto de renta se calcula una vez al año: ver la hoja EERR (año completo)."]);
  await wb.xlsx.writeFile(abs);
  return abs;
}
