/**
 * Herramientas de finanzas para una empresa chilena, operando sobre un libro Excel (.xlsx).
 * El usuario registra ingresos y gastos; el MCP calcula el Estado de Resultados (EERR)
 * y lo que corresponde pagar al SII (IVA / F29, PPM, retenciones y renta anual).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { existsSync } from "node:fs";
import { z } from "zod";
import { error, json, texto } from "../lib/respuestas.js";
import {
  ErrorExcel, abrirLibro, agregarFila, crearPlantilla, escribirInforme, leerEmpresa, leerMovimientos,
} from "../lib/excel.js";
import {
  REGIMENES, calcularEERR, calcularPagosSII, fmt, separarIVA, validarFechaISO,
  type Documento, type Regimen,
} from "../lib/tributario.js";

const ruta = z.string().describe("Ruta completa al archivo Excel (.xlsx) de la empresa");
const regimen = z.enum(["14A", "14D3", "14D8"]).describe("Régimen tributario: 14A (general), 14D3 (Pro Pyme general) o 14D8 (Pro Pyme transparente)");
const regimenOpc = regimen.optional().describe("Régimen tributario. Si se omite se usa el de la hoja Empresa del Excel");

async function contexto(r: string, reg?: Regimen) {
  const { wb } = await abrirLibro(r);
  const emp = leerEmpresa(wb);
  const { movimientos, advertencias } = leerMovimientos(wb);
  return { empresa: emp.nombre, regimen: reg ?? emp.regimen, movimientos, advertencias };
}

async function seguro<T>(f: () => Promise<T>) {
  try {
    return await f();
  } catch (e) {
    return error(e instanceof ErrorExcel || e instanceof Error ? e.message : String(e));
  }
}

export function register(server: McpServer): void {
  server.registerTool(
    "crear_plantilla_excel",
    {
      title: "Crear plantilla de finanzas en Excel",
      description:
        "Crea un libro Excel nuevo con las hojas Empresa (nombre y régimen) y Movimientos (fecha, tipo, categoría, descripción, neto, IVA, documento) listo para registrar ingresos y gastos. No sobrescribe un archivo existente salvo que se confirme.",
      inputSchema: {
        ruta,
        nombre_empresa: z.string().describe("Nombre de la empresa"),
        regimen,
        confirmar: z.literal(true).optional().describe("Enviar true solo si el archivo ya existe y se acepta sobrescribirlo"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ ruta: r, nombre_empresa, regimen: reg, confirmar }) =>
      seguro(async () => {
        if (existsSync(r) && confirmar !== true)
          return error("El archivo ya existe. Si quieres reemplazarlo, repite con confirmar: true.");
        const abs = await crearPlantilla(r, nombre_empresa, reg);
        return texto(`Plantilla creada en ${abs} (${REGIMENES[reg]}). Ya puedes registrar movimientos.`);
      }),
  );

  server.registerTool(
    "agregar_movimiento",
    {
      title: "Agregar ingreso o gasto",
      description:
        "Agrega una fila a la hoja Movimientos: un ingreso (venta) o un gasto. Calcula solo el neto y el IVA 19% según el documento (factura y boleta llevan IVA; honorarios, exento y sin_documento no).",
      inputSchema: {
        ruta,
        fecha: z.string().describe("Fecha en formato AAAA-MM-DD"),
        tipo: z.enum(["ingreso", "gasto"]).describe("ingreso = venta; gasto = compra o costo"),
        categoria: z.string().describe("Categoría, p. ej. ventas, costo_ventas, arriendo, marketing, honorarios, sueldos, financiero"),
        descripcion: z.string().describe("Detalle corto del movimiento"),
        monto: z.number().positive().describe("Monto en pesos chilenos"),
        documento: z.enum(["factura", "boleta", "honorarios", "exento", "sin_documento"]).describe("Documento que respalda el movimiento"),
        monto_incluye_iva: z.boolean().default(true).describe("true si el monto ya trae el IVA incluido (total); false si es el neto"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (a) =>
      seguro(async () => {
        if (!validarFechaISO(a.fecha)) return error("Fecha inválida. Usa el formato AAAA-MM-DD, por ejemplo 2026-11-05.");
        const { neto, iva } = separarIVA(a.monto, a.documento as Documento, a.monto_incluye_iva);
        const res = await agregarFila(a.ruta, {
          fecha: a.fecha, tipo: a.tipo, categoria: a.categoria, descripcion: a.descripcion,
          neto, iva, documento: a.documento as Documento,
        });
        return texto(`Registrado en la fila ${res.fila}: ${a.tipo} de ${fmt(neto)} neto + ${fmt(iva)} IVA (${a.documento}).`);
      }),
  );

  server.registerTool(
    "leer_movimientos_excel",
    {
      title: "Leer movimientos del Excel",
      description:
        "Lee la hoja Movimientos y devuelve totales de ingresos y gastos, la cantidad de filas y las filas con problemas. Úsala para revisar los datos antes de calcular.",
      inputSchema: {
        ruta,
        periodo: z.string().optional().describe("Filtro opcional: AAAA o AAAA-MM"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ ruta: r, periodo }) =>
      seguro(async () => {
        const c = await contexto(r);
        const lista = periodo ? c.movimientos.filter((m) => m.fecha.startsWith(periodo)) : c.movimientos;
        const suma = (t: string) => lista.filter((m) => m.tipo === t).reduce((a, m) => a + m.neto, 0);
        return json({
          empresa: c.empresa,
          regimen: c.regimen,
          filas: lista.length,
          ingresosNetos: suma("ingreso"),
          gastosNetos: suma("gasto"),
          advertencias: c.advertencias,
          movimientos: lista.slice(0, 100),
          nota: lista.length > 100 ? "Se muestran las primeras 100 filas." : undefined,
        });
      }),
  );

  server.registerTool(
    "calcular_eerr",
    {
      title: "Calcular Estado de Resultados (EERR)",
      description:
        "Calcula el Estado de Resultados desde la hoja Movimientos: ingresos, costo de ventas, margen bruto, gastos por categoría, resultado operacional, impuesto de primera categoría estimado y resultado neto. Estimación, no asesoría tributaria.",
      inputSchema: {
        ruta,
        periodo: z.string().optional().describe("AAAA o AAAA-MM. Si se omite se usa todo el libro"),
        regimen: regimenOpc,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ ruta: r, periodo, regimen: reg }) =>
      seguro(async () => {
        const c = await contexto(r, reg);
        if (c.movimientos.length === 0) return error("No hay movimientos válidos en la hoja Movimientos.");
        return json({ empresa: c.empresa, ...calcularEERR(c.movimientos, c.regimen, periodo), advertencias: c.advertencias });
      }),
  );

  server.registerTool(
    "calcular_pagos_sii",
    {
      title: "Calcular lo que hay que pagar al SII",
      description:
        "Calcula por mes el F29 (IVA débito − crédito − remanente, PPM y retención de boletas de honorarios) con su fecha de vencimiento, y la renta anual estimada (F22). Para Pro Pyme Transparente (14D8) entrega la base que tributa en los dueños. Estimación, no asesoría tributaria.",
      inputSchema: {
        ruta,
        anio: z.number().int().min(2020).max(2035).describe("Año comercial, p. ej. 2026"),
        regimen: regimenOpc,
        uta: z.number().positive().optional().describe("Valor de la UTA en pesos (opcional; solo para estimar el IGC en 14D8)"),
        valor_uf: z.number().positive().optional().describe("Valor de la UF en pesos (opcional; define la tasa de PPM según 50.000 UF de ingresos)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ ruta: r, anio, regimen: reg, uta, valor_uf }) =>
      seguro(async () => {
        const c = await contexto(r, reg);
        const res = calcularPagosSII(c.movimientos, c.regimen, anio, { uta, valorUF: valor_uf });
        if (res.meses.length === 0) return error(`No hay movimientos del año ${anio}.`);
        return json({ empresa: c.empresa, ...res, advertencias: c.advertencias });
      }),
  );

  server.registerTool(
    "generar_informe_excel",
    {
      title: "Escribir EERR y pagos SII en el Excel",
      description:
        "Escribe en el mismo libro Excel las hojas EERR y Pagos SII con el resultado del año indicado. Reemplaza esas dos hojas si ya existían (no toca Movimientos), por eso pide confirmación.",
      inputSchema: {
        ruta,
        anio: z.number().int().min(2020).max(2035).describe("Año comercial a informar"),
        regimen: regimenOpc,
        confirmar: z.literal(true).describe("Debe ser true: confirma que se reemplazarán las hojas EERR y Pagos SII"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ ruta: r, anio, regimen: reg }) =>
      seguro(async () => {
        const c = await contexto(r, reg);
        if (c.movimientos.length === 0) return error("No hay movimientos para informar.");
        const eerr = calcularEERR(c.movimientos, c.regimen, String(anio));
        const pagos = calcularPagosSII(c.movimientos, c.regimen, anio);
        const abs = await escribirInforme(r, eerr, pagos, c.empresa);
        return texto(`Listo: hojas "EERR" y "Pagos SII" escritas en ${abs}. Resultado neto ${fmt(eerr.resultadoNeto)}; total F29 del año ${fmt(pagos.totalF29)}.`);
      }),
  );
}
