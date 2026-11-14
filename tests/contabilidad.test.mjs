import test from "node:test";
import assert from "node:assert/strict";
import { parsearRCV, claveDoc } from "../dist/lib/rcv.js";
import { proximosPagos, generarICS, eerrMensual } from "../dist/lib/tributario.js";
import { readFileSync } from "node:fs";

const csv = readFileSync(new URL("../ejemplos/rcv-compras-demo.csv", import.meta.url), "utf8");

test("RCV: lee facturas y la nota de credito resta", () => {
  const { movimientos, ignoradas } = parsearRCV(csv, "compras", "costo_ventas");
  assert.equal(ignoradas.length, 0);
  assert.equal(movimientos.length, 3);
  assert.equal(movimientos[0].neto, 1_000_000);
  assert.equal(movimientos[0].iva, 190_000);
  assert.equal(movimientos[2].neto, -100_000); // nota de credito 61
  assert.equal(movimientos[2].iva, -19_000);
  assert.equal(movimientos[0].folio, "33-1001");
});

test("RCV: la clave evita duplicados aunque el RUT venga con puntos", () => {
  const a = { tipo: "gasto", rut: "76.111.111-1", folio: "33-1001" };
  const b = { tipo: "gasto", rut: "76111111-1", folio: "33-1001" };
  assert.equal(claveDoc(a), claveDoc(b));
});

test("RCV: CSV con columnas desconocidas devuelve aviso, no revienta", () => {
  const r = parsearRCV("a;b;c\n1;2;3", "ventas", "ventas");
  assert.equal(r.movimientos.length, 0);
  assert.ok(r.ignoradas[0].includes("columnas"));
});

test("proximos pagos: F29 de octubre vence el 20-11 y aparece la renta de abril", () => {
  const movs = [{ fecha: "2026-10-10", tipo: "ingreso", categoria: "ventas", descripcion: "", neto: 1_000_000, iva: 190_000, documento: "factura" }];
  const r = proximosPagos(movs, "14D8", "2026-11-14");
  const f29 = r.find((x) => x.concepto.includes("2026-10"));
  assert.equal(f29.fecha, "2026-11-20");
  assert.equal(f29.diasRestantes, 6);
  assert.equal(f29.montoEstimado, 190_000 + 2_000); // IVA + PPM 0,2%
  assert.ok(r.some((x) => x.fecha === "2027-04-30"));
});

test("calendario .ics bien formado con alarmas", () => {
  const ics = generarICS([{ fecha: "2026-11-20", concepto: "F29 de 2026-10", montoEstimado: null, diasRestantes: 6, detalle: "x, y; z" }]);
  assert.ok(ics.startsWith("BEGIN:VCALENDAR"));
  assert.ok(ics.includes("DTSTART;VALUE=DATE:20261120"));
  assert.ok(ics.includes("TRIGGER:-P3D"));
  assert.ok(ics.includes("x\\, y\\; z"));
  assert.ok(ics.trimEnd().endsWith("END:VCALENDAR"));
});

test("EERR mensual: un resultado por mes", () => {
  const m = (f, t, c, n) => ({ fecha: f, tipo: t, categoria: c, descripcion: "", neto: n, iva: 0, documento: "exento" });
  const r = eerrMensual([m("2026-09-01", "ingreso", "ventas", 100), m("2026-09-02", "gasto", "arriendo", 30), m("2026-10-01", "ingreso", "ventas", 200)], "14D3", 2026);
  assert.deepEqual(r.map((x) => [x.mes, x.resultadoAntesImpuesto]), [["2026-09", 70], ["2026-10", 200]]);
});
