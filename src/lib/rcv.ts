/**
 * Lector del CSV del Registro de Compras y Ventas (RCV) que se descarga desde Mi SII.
 * No usa claves ni se conecta al SII: trabaja solo con el archivo que descarga la persona.
 * Reconoce las columnas por su nombre (sin tildes ni mayusculas), asi tolera pequenos cambios de formato.
 */
import type { Movimiento } from "./tributario.js";

export type TipoRCV = "ventas" | "compras";

const norm = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

function partirLinea(l: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (const ch of l) {
    if (ch === '"') q = !q;
    else if (ch === sep && !q) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

const num = (v: string | undefined): number => {
  if (!v) return 0;
  const n = Number(v.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function fechaISO(v: string): string {
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(v.trim());
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const n = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  return n ? `${n[1]}-${n[2]}-${n[3]}` : "";
}

const NOMBRES_DOC: Record<string, string> = {
  "33": "Factura", "34": "Factura exenta", "46": "Factura de compra", "56": "Nota de débito", "61": "Nota de crédito", "39": "Boleta", "41": "Boleta exenta",
};

export interface ResultadoRCV {
  movimientos: Movimiento[];
  ignoradas: string[];
}

export function parsearRCV(csv: string, tipo: TipoRCV, categoria: string): ResultadoRCV {
  const lineas = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lineas.length < 2) return { movimientos: [], ignoradas: ["El archivo no tiene filas de datos."] };
  const sep = (lineas[0].match(/;/g)?.length ?? 0) >= (lineas[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const cab = partirLinea(lineas[0], sep).map(norm);
  const col = (...opciones: string[]): number => cab.findIndex((c) => opciones.some((o) => c === o || c.startsWith(o)));
  const iTipo = col("tipo doc");
  const iRut = col("rut proveedor", "rut cliente", "rut");
  const iRazon = col("razon social");
  const iFolio = col("folio");
  const iFecha = col("fecha docto", "fecha documento");
  const iExento = col("monto exento");
  const iNeto = col("monto neto");
  const iIva = col("monto iva recuperable", "monto iva");
  const iTotal = col("monto total");
  if (iTipo < 0 || iFolio < 0 || iFecha < 0 || iNeto < 0 || iTotal < 0)
    return { movimientos: [], ignoradas: ["No reconozco las columnas del CSV. Descarga el detalle del RCV (compras o ventas) desde Mi SII."] };

  const movimientos: Movimiento[] = [];
  const ignoradas: string[] = [];
  lineas.slice(1).forEach((l, idx) => {
    const c = partirLinea(l, sep);
    const tipoDoc = (c[iTipo] ?? "").trim();
    const fecha = fechaISO(c[iFecha] ?? "");
    const folio = (c[iFolio] ?? "").trim();
    if (!fecha || !folio || !tipoDoc) {
      ignoradas.push(`Fila ${idx + 2}: faltan fecha, folio o tipo de documento.`);
      return;
    }
    const signo = tipoDoc === "61" ? -1 : 1; // la nota de credito resta
    const exento = num(c[iExento]);
    const neto = num(c[iNeto]) + exento;
    const iva = iIva >= 0 ? num(c[iIva]) : Math.max(0, num(c[iTotal]) - neto);
    movimientos.push({
      fecha,
      tipo: tipo === "ventas" ? "ingreso" : "gasto",
      categoria,
      descripcion: `${NOMBRES_DOC[tipoDoc] ?? "Doc " + tipoDoc} ${folio}${iRazon >= 0 && c[iRazon] ? " - " + c[iRazon] : ""}`,
      neto: signo * neto,
      iva: signo * iva,
      documento: exento > 0 && num(c[iNeto]) === 0 ? "exento" : "factura",
      folio: `${tipoDoc}-${folio}`,
      rut: iRut >= 0 ? c[iRut] : undefined,
    });
  });
  return { movimientos, ignoradas };
}

/** Clave para no duplicar: tipo de movimiento + RUT + tipo-folio. */
export const claveDoc = (m: Pick<Movimiento, "tipo" | "rut" | "folio">): string => `${m.tipo}|${(m.rut ?? "").replace(/[.\s]/g, "").toLowerCase()}|${m.folio ?? ""}`;
