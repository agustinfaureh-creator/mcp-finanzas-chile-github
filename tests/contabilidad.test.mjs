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
  assert.equal(f29.montoEstimado, 190_000 + 1_000); // IVA + PPM 0,1%
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

test("periodo de IVA distinto a la fecha y PPM propuesto por el SII (caso con cifras tipo F29 real)", async () => {
  const { calcularPagosSII } = await import("../dist/lib/tributario.js");
  const m = (fecha, tipo, categoria, neto, iva, documento, periodoIva) => ({ fecha, tipo, categoria, descripcion: "", neto, iva, documento, periodoIva });
  const movs = [
    m("2026-10-31", "ingreso", "ventas", 4_848_974, 921_305, "factura"),
    m("2026-10-31", "gasto", "financiero", 632_482, 120_172, "factura", "2026-11"), // credito cae en noviembre
    m("2026-10-15", "gasto", "compras", 1_195_827, 227_208, "factura"),
    m("2026-10-30", "gasto", "honorarios", 1_009_101, 0, "honorarios"),
    m("2026-11-05", "ingreso", "ventas", 2_065_670, 392_477, "factura"),
    m("2026-11-06", "gasto", "compras", 339_911, 64_583, "factura"),
    m("2026-11-06", "gasto", "costo_ventas", 1_633_606, 253_379, "factura"), // neto + ILA como costo
    m("2026-11-10", "gasto", "arriendo", 1_512_605, 287_395, "factura"),
    m("2026-11-12", "gasto", "honorarios", 619_470, 0, "honorarios"),
  ];
  const p = calcularPagosSII(movs, "14D8", 2026, { tasaPPM: 0.001 });
  const [oct, nov] = p.meses;
  assert.equal(oct.ivaAPagar, 694_097);
  assert.equal(oct.retencionHonorarios, 153_888);
  assert.equal(oct.ppm, 4_849);
  assert.equal(oct.totalF29, 852_834);
  assert.equal(nov.ivaAPagar, 0);
  assert.equal(nov.remanenteSiguiente, 333_052);
  assert.equal(nov.totalF29, 94_469 + 2_066);
});
