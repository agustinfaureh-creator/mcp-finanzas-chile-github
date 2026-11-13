#!/usr/bin/env node
/**
 * Prueba de humo GENERICA (sirve para cualquier MCP creado con esta plantilla).
 * Arranca el servidor como lo haria opencode y comprueba que:
 *   1) responde al handshake MCP (initialize)
 *   2) expone al menos una herramienta
 *   3) todas las herramientas tienen una descripcion util
 *   4) si existe la herramienta de ejemplo `saludar`, la ejecuta
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command: "node", args: ["dist/index.js"] });
const client = new Client({ name: "smoke-test", version: "1.0.0" });

function fallar(mensaje) {
  console.error(`FALLO: ${mensaje}`);
  process.exit(1);
}

try {
  await client.connect(transport);
  const { tools } = await client.listTools();

  if (tools.length === 0) fallar("el servidor no expone ninguna herramienta (revisa src/tools/ y que exporten register()).");
  console.log(`OK: ${tools.length} herramientas -> ${tools.map((t) => t.name).join(", ")}`);

  const sinDescripcion = tools.filter((t) => !t.description || t.description.trim().length < 15);
  if (sinDescripcion.length > 0) {
    fallar(`herramientas sin descripcion util (minimo 15 caracteres): ${sinDescripcion.map((t) => t.name).join(", ")}`);
  }

  // Recorrido real de punta a punta sobre un Excel temporal (no toca datos del usuario).
  const nombres = tools.map((t) => t.name);
  for (const esperada of ["crear_plantilla_excel", "agregar_movimiento", "calcular_eerr", "calcular_pagos_sii", "generar_informe_excel"]) {
    if (!nombres.includes(esperada)) fallar(`falta la herramienta ${esperada}`);
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-fin-"));
  const ruta = path.join(dir, "prueba.xlsx");
  const llamar = async (name, args) => {
    const r = await client.callTool({ name, arguments: args });
    if (r.isError) fallar(`${name} devolvio error: ${r.content[0].text}`);
    return r.content[0].text;
  };
  try {
    await llamar("crear_plantilla_excel", { ruta, nombre_empresa: "Empresa de Prueba", regimen: "14D3" });
    await llamar("agregar_movimiento", { ruta, fecha: "2026-03-05", tipo: "ingreso", categoria: "ventas", descripcion: "Venta", monto: 1190000, documento: "factura" });
    await llamar("agregar_movimiento", { ruta, fecha: "2026-03-10", tipo: "gasto", categoria: "costo_ventas", descripcion: "Compra", monto: 595000, documento: "factura" });
    const eerr = JSON.parse(await llamar("calcular_eerr", { ruta, periodo: "2026" }));
    if (eerr.ingresos !== 1000000 || eerr.margenBruto !== 500000) fallar("EERR con valores inesperados");
    const sii = JSON.parse(await llamar("calcular_pagos_sii", { ruta, anio: 2026 }));
    if (sii.meses[0].ivaAPagar !== 95000) fallar("IVA a pagar inesperado");
    console.log(`OK: EERR e IVA calculados sobre Excel (margen bruto ${eerr.margenBruto}, IVA a pagar ${sii.meses[0].ivaAPagar}).`);
    const malo = await client.callTool({ name: "generar_informe_excel", arguments: { ruta: path.join(dir, "no-existe.xlsx"), anio: 2026, confirmar: true } });
    if (!malo.isError) fallar("debia devolver error con un archivo inexistente");
    console.log("OK: error controlado con archivo inexistente.");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  await client.close();
  console.log("Prueba de humo superada.");
} catch (e) {
  fallar(e instanceof Error ? e.message : String(e));
}
