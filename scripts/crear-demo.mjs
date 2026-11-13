#!/usr/bin/env node
// Crea ejemplos/demo-empresa.xlsx con datos FICTICIOS (empresa inventada) para probar el MCP.
import { mkdirSync } from "node:fs";
import { crearPlantilla, agregarFila } from "../dist/lib/excel.js";
import { separarIVA } from "../dist/lib/tributario.js";

const ruta = "ejemplos/demo-empresa.xlsx";
mkdirSync("ejemplos", { recursive: true });
await crearPlantilla(ruta, "Eventos Demo SpA (ficticia)", "14D3");

// [fecha, tipo, categoria, descripcion, monto, documento, incluyeIVA]
const datos = [
  ["2026-09-04", "ingreso", "ventas", "Entradas fiesta septiembre", 4760000, "factura"],
  ["2026-09-12", "ingreso", "ventas", "Barra y consumos", 1785000, "factura"],
  ["2026-09-06", "gasto", "costo_ventas", "Bebidas y hielo", 1190000, "factura"],
  ["2026-09-08", "gasto", "arriendo", "Arriendo del recinto", 1428000, "factura"],
  ["2026-09-09", "gasto", "honorarios", "DJ y sonido (boleta de honorarios)", 600000, "honorarios"],
  ["2026-09-15", "gasto", "marketing", "Publicidad en redes", 357000, "factura"],
  ["2026-09-20", "gasto", "varios", "Propinas sin boleta", 80000, "sin_documento"],
  ["2026-10-10", "ingreso", "ventas", "Entradas fiesta octubre", 5950000, "factura"],
  ["2026-10-17", "ingreso", "ventas", "Mesas VIP", 2380000, "factura"],
  ["2026-10-08", "gasto", "costo_ventas", "Bebidas y hielo", 1547000, "factura"],
  ["2026-10-09", "gasto", "arriendo", "Arriendo del recinto", 1428000, "factura"],
  ["2026-10-11", "gasto", "honorarios", "Fotografía (boleta de honorarios)", 450000, "honorarios"],
  ["2026-10-14", "gasto", "sueldos", "Sueldos de staff", 900000, "exento"],
  ["2026-10-22", "gasto", "financiero", "Comisiones de la pasarela de pago", 238000, "factura"],
];
for (const [fecha, tipo, categoria, descripcion, monto, documento] of datos) {
  const { neto, iva } = separarIVA(monto, documento, true);
  await agregarFila(ruta, { fecha, tipo, categoria, descripcion, neto, iva, documento });
}
console.error(`Listo: ${ruta} (${datos.length} movimientos ficticios).`);
