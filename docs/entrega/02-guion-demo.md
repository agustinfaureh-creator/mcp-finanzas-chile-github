# Guion de la demostración (4 a 5 minutos)

**Usa solo los archivos de ejemplo** (`ejemplos/demo-empresa.xlsx` y `ejemplos/rcv-compras-demo.csv`): son ficticios. Si muestras tu Excel real, tapa nombres, RUT y montos.

## 0. Preparación (antes de grabar)
- `npm run demo` para dejar `ejemplos/demo-empresa.xlsx` limpio.
- Abrir opencode con `Contador.command` (o `opencode` en la carpeta del proyecto).
- Grabar pantalla con Cmd+Shift+5 (Mac).

## 1. Antes
Mostrar `ejemplos/demo-empresa.xlsx` abierto (Numbers, Excel o LibreOffice): solo la hoja Movimientos con 14 filas, sin EERR ni cálculo de impuestos. Cerrar el archivo.

## 2. Pedidos a la IA (opencode)
Pegar la ruta completa del archivo en el primer pedido.
1. *"¿Qué herramientas tienes del MCP de finanzas?"* → se ven las 13 herramientas.
2. *"Calcula el EERR de 2026 de ejemplos/demo-empresa.xlsx"* → `calcular_eerr`.
3. *"¿Cuánto pago al SII por mes y cuándo vence?"* → `calcular_pagos_sii`.
4. *"Importa las compras de ejemplos/rcv-compras-demo.csv como costo de ventas"* → `importar_rcv_sii` (primero simula y avisa 3 facturas nuevas; luego las escribe). Repetir el pedido: avisa 0 nuevas, no duplica.
5. *"¿Qué vence en los próximos días?"* → `proximos_pagos`.
6. *"Escribe el informe 2026 y el EERR mensual en el Excel"* → `generar_informe_excel` y `estado_resultados_mensual` (la IA pide confirmar).

## 3. Después
Reabrir el Excel: aparecen las hojas **EERR**, **Pagos SII** y **EERR mensual**, y las 3 facturas importadas en Movimientos.

Resultado esperado con los datos del demo **antes** del paso 4:

| Concepto | Valor |
|---|---|
| Ingresos netos | $12.500.000 |
| Margen bruto | $10.200.000 |
| Resultado antes de impuesto | $5.270.000 |
| Impuesto 1ª categoría (12,5%) | $668.750 |
| F29 septiembre (vence 20-10-2026) | $668.375 |
| F29 octubre (vence 20-11-2026) | $894.375 |

## 4. Cierre
Mostrar `npm test` terminando en "Prueba de humo superada." y el repositorio público en GitHub con su historial de commits.
