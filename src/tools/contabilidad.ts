/**
 * Contabilidad continua: importar el Registro de Compras y Ventas (RCV) del SII,
 * recordar pagos y entregar el estado de resultados mes a mes.
 * No se conecta al SII ni usa claves: trabaja con el CSV que la persona descarga de Mi SII.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { existsSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { error, json, texto } from "../lib/respuestas.js";
import { ErrorExcel, abrirLibro, agregarFilas, escribirEERRMensual, leerEmpresa, leerMovimientos } from "../lib/excel.js";
import { claveDoc, parsearRCV } from "../lib/rcv.js";
import { eerrMensual, fmt, generarICS, proximosPagos, validarFechaISO, type Regimen } from "../lib/tributario.js";

const ruta = z.string().describe("Ruta completa al archivo Excel (.xlsx) de la empresa");
const regimenOpc = z.enum(["14A", "14D3", "14D8"]).optional().describe("Régimen tributario. Si se omite se usa el de la hoja Empresa");

async function seguro<T>(f: () => Promise<T>) {
  try {
    return await f();
  } catch (e) {
    return error(e instanceof ErrorExcel || e instanceof Error ? e.message : String(e));
  }
}

async function datos(r: string, reg?: Regimen) {
  const { wb } = await abrirLibro(r);
  const emp = leerEmpresa(wb);
  const { movimientos, advertencias } = leerMovimientos(wb);
  return { empresa: emp.nombre, regimen: (reg ?? emp.regimen) as Regimen, movimientos, advertencias };
}

export function register(server: McpServer): void {
  server.registerTool(
    "importar_rcv_sii",
    {
      title: "Importar facturas del RCV del SII",
      description:
        "Lee el CSV del Registro de Compras y Ventas descargado desde Mi SII (sii.cl, sección Registro de Compras y Ventas) y agrega a Movimientos solo las facturas NUEVAS; las que ya estaban se omiten. Avisa cuáles son nuevas. Primero se usa con simular=true. No usa claves del SII.",
      inputSchema: {
        ruta,
        archivo_csv: z.string().describe("Ruta completa al CSV descargado del RCV (.csv)"),
        tipo: z.enum(["ventas", "compras"]).describe("ventas = facturas que tú emitiste; compras = facturas que te emitieron"),
        categoria: z.string().default("compras").describe("Categoría para las filas importadas (p. ej. ventas, costo_ventas, arriendo)"),
        simular: z.boolean().default(true).describe("true = solo muestra qué facturas son nuevas; false = las escribe en Movimientos"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (a) =>
      seguro(async () => {
        const csvAbs = path.resolve(a.archivo_csv);
        if (path.extname(csvAbs).toLowerCase() !== ".csv") return error("El archivo debe ser un .csv descargado del RCV.");
        if (!existsSync(csvAbs)) return error(`No existe ${csvAbs}.`);
        if ((await stat(csvAbs)).size > 5_000_000) return error("El CSV es demasiado grande (máximo 5 MB).");
        const { movimientos: nuevosPosibles, ignoradas } = parsearRCV(await readFile(csvAbs, "utf8"), a.tipo, a.categoria);
        const c = await datos(a.ruta);
        const existentes = new Set(c.movimientos.map(claveDoc));
        const nuevas = nuevosPosibles.filter((m) => !existentes.has(claveDoc(m)));
        const resumen = {
          simulacion: a.simular,
          enElArchivo: nuevosPosibles.length,
          yaRegistradas: nuevosPosibles.length - nuevas.length,
          nuevas: nuevas.length,
          totalNetoNuevas: nuevas.reduce((x, m) => x + m.neto, 0),
          totalIvaNuevas: nuevas.reduce((x, m) => x + m.iva, 0),
          detalleNuevas: nuevas.slice(0, 30).map((m) => ({ fecha: m.fecha, descripcion: m.descripcion, neto: m.neto, iva: m.iva })),
          filasIgnoradas: ignoradas.slice(0, 10),
        };
        if (a.simular || nuevas.length === 0) return json(resumen);
        const res = await agregarFilas(a.ruta, nuevas);
        return json({ ...resumen, escritas: res.agregadas, archivo: res.abs });
      }),
  );

  server.registerTool(
    "proximos_pagos",
    {
      title: "Próximos pagos al SII",
      description:
        "Lista los próximos vencimientos (F29 mensual y declaración de renta de abril) con días restantes y el monto estimado con los datos cargados. Úsala para recordarle al usuario qué debe pagar y cuándo.",
      inputSchema: {
        ruta,
        hoy: z.string().optional().describe("Fecha de referencia AAAA-MM-DD (por defecto, hoy)"),
        regimen: regimenOpc,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ ruta: r, hoy, regimen: reg }) =>
      seguro(async () => {
        const ref = hoy ?? new Date().toISOString().slice(0, 10);
        if (!validarFechaISO(ref)) return error("Fecha inválida. Usa AAAA-MM-DD.");
        const c = await datos(r, reg);
        const recs = proximosPagos(c.movimientos, c.regimen, ref);
        const urgentes = recs.filter((x) => x.diasRestantes <= 7).map((x) => `${x.concepto}: vence en ${x.diasRestantes} días (${x.fecha})${x.montoEstimado !== null ? ", estimado " + fmt(x.montoEstimado) : ""}`);
        return json({ empresa: c.empresa, hoy: ref, urgentes, proximos: recs, aviso: "Montos estimados con tus datos; confirma en Mi SII antes de pagar." });
      }),
  );

  server.registerTool(
    "generar_calendario_pagos",
    {
      title: "Crear recordatorios de pago en el calendario",
      description:
        "Genera un archivo .ics con los vencimientos del F29 (próximos 12 meses) y la renta de abril, con alarma 3 días y 1 día antes. Se abre con doble clic en Calendario (Mac) o se importa en Google Calendar.",
      inputSchema: {
        ruta_ics: z.string().describe("Ruta completa donde guardar el calendario, terminada en .ics"),
        hoy: z.string().optional().describe("Fecha de partida AAAA-MM-DD (por defecto, hoy)"),
        confirmar: z.literal(true).optional().describe("Enviar true si el archivo .ics ya existe y se acepta sobrescribirlo"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ ruta_ics, hoy, confirmar }) =>
      seguro(async () => {
        const abs = path.resolve(ruta_ics);
        if (path.extname(abs).toLowerCase() !== ".ics") return error("La ruta debe terminar en .ics");
        if (existsSync(abs) && confirmar !== true) return error("El archivo ya existe. Repite con confirmar: true para reemplazarlo.");
        const ref = hoy ?? new Date().toISOString().slice(0, 10);
        if (!validarFechaISO(ref)) return error("Fecha inválida. Usa AAAA-MM-DD.");
        // 12 meses de F29 (sin montos) + renta
        const recs = [];
        for (let i = 0; i < 12; i++) {
          const d = new Date(Date.UTC(Number(ref.slice(0, 4)), Number(ref.slice(5, 7)) - 1 + i, 1)).toISOString().slice(0, 10);
          recs.push(...proximosPagos([], "14D8", d).filter((x) => x.concepto.startsWith("F29") && x.diasRestantes >= 0 && x.fecha >= ref));
        }
        const unicos = [...new Map(recs.map((x) => [x.fecha + x.concepto, x])).values()].filter((x) => x.fecha >= ref).slice(0, 12);
        const renta = proximosPagos([], "14D8", ref).find((x) => x.concepto.startsWith("Declaración"));
        if (renta) unicos.push(renta);
        await writeFile(abs, generarICS(unicos), "utf8");
        return texto(`Calendario creado en ${abs} con ${unicos.length} recordatorios. Ábrelo con doble clic para agregarlo a tu Calendario.`);
      }),
  );

  server.registerTool(
    "estado_resultados_mensual",
    {
      title: "Estado de resultados mes a mes",
      description:
        "Entrega el EERR de cada mes de un año (ingresos, costo de ventas, margen, gastos y resultado antes de impuesto). Con escribir_en_excel=true también lo escribe en la hoja 'EERR mensual' del libro (reemplaza esa hoja, requiere confirmar).",
      inputSchema: {
        ruta,
        anio: z.number().int().min(2020).max(2035).describe("Año comercial, p. ej. 2026"),
        regimen: regimenOpc,
        escribir_en_excel: z.boolean().default(false).describe("true para guardar el resultado en la hoja 'EERR mensual'"),
        confirmar: z.literal(true).optional().describe("Obligatorio si escribir_en_excel es true: confirma reemplazar la hoja 'EERR mensual'"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ ruta: r, anio, regimen: reg, escribir_en_excel, confirmar }) =>
      seguro(async () => {
        if (escribir_en_excel && confirmar !== true) return error("Para escribir en el Excel repite con confirmar: true (reemplaza la hoja 'EERR mensual').");
        const c = await datos(r, reg);
        const meses = eerrMensual(c.movimientos, c.regimen, anio);
        if (meses.length === 0) return error(`No hay movimientos del año ${anio}.`);
        if (escribir_en_excel) await escribirEERRMensual(r, meses, c.empresa);
        return json({ empresa: c.empresa, anio, regimen: c.regimen, meses, escritoEnExcel: escribir_en_excel, nota: "El impuesto de renta es anual: usa calcular_pagos_sii para verlo." });
      }),
  );
}
