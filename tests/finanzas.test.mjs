// Pruebas unitarias (node:test) del motor tributario y de la lectura/escritura de Excel.
// Los valores esperados estan calculados a mano (ver comentarios).
import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { calcularEERR, calcularPagosSII, separarIVA, tasaRetencion, fechaVencimiento, igcPorBase } from "../dist/lib/tributario.js";
import { crearPlantilla, agregarFila, abrirLibro, leerMovimientos, escribirInforme, validarRuta, leerEmpresa } from "../dist/lib/excel.js";

const mov = (fecha, tipo, categoria, neto, iva, documento) => ({ fecha, tipo, categoria, descripcion: "", neto, iva, documento });
const base = [
  mov("2026-03-05", "ingreso", "ventas", 1_000_000, 190_000, "factura"),
  mov("2026-03-10", "gasto", "costo_ventas", 500_000, 95_000, "factura"),
  mov("2026-03-12", "gasto", "arriendo", 100_000, 19_000, "factura"),
  mov("2026-03-15", "gasto", "honorarios", 200_000, 0, "honorarios"),
];

test("separarIVA: total con IVA incluido y neto", () => {
  assert.deepEqual(separarIVA(1_190_000, "factura", true), { neto: 1_000_000, iva: 190_000 });
  assert.deepEqual(separarIVA(1_000_000, "boleta", false), { neto: 1_000_000, iva: 190_000 });
  assert.deepEqual(separarIVA(200_000, "honorarios", true), { neto: 200_000, iva: 0 });
});

test("retencion de honorarios por ano", () => {
  assert.equal(tasaRetencion(2026), 0.1525);
  assert.equal(tasaRetencion(2027), 0.16);
  assert.equal(tasaRetencion(2030), 0.17);
});

test("EERR Pro Pyme General 2026", () => {
  const e = calcularEERR(base, "14D3", "2026");
  assert.equal(e.ingresos, 1_000_000);
  assert.equal(e.margenBruto, 500_000);
  assert.equal(e.gastosOperacionales, 300_000);
  assert.equal(e.resultadoAntesImpuesto, 200_000);
  assert.equal(e.impuestoPrimeraCategoria, 25_000); // 12,5%
  assert.equal(e.resultadoNeto, 175_000);
});

test("EERR 14A usa 27% en 2026 y 14D8 no paga impuesto de empresa", () => {
  assert.equal(calcularEERR(base, "14A", "2026").impuestoPrimeraCategoria, 54_000);
  const t = calcularEERR(base, "14D8", "2026");
  assert.equal(t.impuestoPrimeraCategoria, 0);
  assert.equal(t.baseImponibleEstimada, 200_000);
});

test("gasto sin documento baja el resultado pero se suma a la base imponible", () => {
  const e = calcularEERR([...base, mov("2026-03-20", "gasto", "varios", 50_000, 0, "sin_documento")], "14D3", "2026");
  assert.equal(e.resultadoAntesImpuesto, 150_000);
  assert.equal(e.baseImponibleEstimada, 200_000);
});

test("F29: IVA 190.000-95.000-19.000 = 76.000; PPM 0,125% = 1.250; retencion 15,25% de 200.000 = 30.500", () => {
  const p = calcularPagosSII(base, "14D3", 2026);
  const m = p.meses[0];
  assert.equal(m.ivaAPagar, 76_000);
  assert.equal(m.ppm, 1_250);
  assert.equal(m.retencionHonorarios, 30_500);
  assert.equal(m.totalF29, 107_750);
});

test("remanente de IVA se arrastra al mes siguiente", () => {
  const movs = [
    mov("2026-01-10", "ingreso", "ventas", 100_000, 19_000, "factura"),
    mov("2026-01-11", "gasto", "costo_ventas", 400_000, 76_000, "factura"), // credito 76.000 > debito
    mov("2026-02-10", "ingreso", "ventas", 500_000, 95_000, "factura"),
  ];
  const p = calcularPagosSII(movs, "14D3", 2026);
  assert.equal(p.meses[0].ivaAPagar, 0);
  assert.equal(p.meses[0].remanenteSiguiente, 57_000);
  assert.equal(p.meses[1].ivaAPagar, 95_000 - 57_000);
});

test("renta anual: impuesto menos PPM; 14D8 no paga IDPC", () => {
  const p = calcularPagosSII(base, "14D3", 2026);
  assert.equal(p.renta.impuestoPrimeraCategoria, 25_000);
  assert.equal(p.renta.impuestoAnualAPagar, 25_000 - 1_250);
  const t = calcularPagosSII(base, "14D8", 2026, { uta: 800_000 });
  assert.equal(t.renta.impuestoAnualAPagar, 0);
  assert.equal(t.renta.baseAtribuidaADuenos, 200_000);
  assert.equal(t.renta.igcEstimado, 0); // 0,25 UTA, tramo exento
});

test("IGC: tramo 4% y rebaja", () => {
  // base = 20 UTA con UTA=1.000.000 -> 20M*4% - 0,54 UTA = 800.000-540.000 = 260.000
  assert.equal(igcPorBase(20_000_000, 1_000_000), 260_000);
});

test("vencimiento F29 el dia 20 del mes siguiente, movido a lunes si es fin de semana", () => {
  assert.equal(fechaVencimiento("2026-11"), "2026-12-21"); // 20-dic-2026 es domingo
  assert.equal(fechaVencimiento("2026-10"), "2026-11-20"); // viernes
});

test("Excel: crear, agregar, leer y escribir informe", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "fin-"));
  const f = path.join(dir, "empresa.xlsx");
  try {
    await crearPlantilla(f, "Empresa de Prueba", "14D3");
    for (const m of base) await agregarFila(f, m);
    const { wb } = await abrirLibro(f);
    const { movimientos, advertencias } = leerMovimientos(wb);
    assert.equal(movimientos.length, 4);
    assert.equal(advertencias.length, 0);
    assert.equal(movimientos[0].neto, 1_000_000);
    await escribirInforme(f, calcularEERR(movimientos, "14D3", "2026"), calcularPagosSII(movimientos, "14D3", 2026), "Empresa de Prueba");
    const { wb: wb2 } = await abrirLibro(f);
    assert.ok(wb2.getWorksheet("EERR"));
    assert.ok(wb2.getWorksheet("Pagos SII"));
    assert.equal(leerMovimientos(wb2).movimientos.length, 4); // Movimientos intacta
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("solo acepta archivos .xlsx", () => {
  assert.throws(() => validarRuta("/tmp/secreto.txt"));
});

test("hoja Empresa: PPM % vacio usa la tasa del regimen; con valor usa ese valor", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "fin-"));
  try {
    const a = path.join(dir, "a.xlsx");
    await crearPlantilla(a, "Vacia", "14D3");
    assert.equal(leerEmpresa((await abrirLibro(a)).wb).tasaPPM, undefined);
    const b = path.join(dir, "b.xlsx");
    await crearPlantilla(b, "Con PPM", "14D8", 0.1);
    assert.equal(leerEmpresa((await abrirLibro(b)).wb).tasaPPM, 0.001);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
