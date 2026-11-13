# Guion de la demostración (3 a 4 minutos)

**Caso real:** la planilla de una empresa de eventos (ficticia en el repo; en la grabación puedes usar tus datos reales sin subirlos).

## Antes
Mostrar `ejemplos/demo-empresa.xlsx` abierto en Excel: solo la hoja Movimientos con 14 filas, sin EERR ni cálculo de impuestos.

## Pedido a la IA (opencode)
1. *"Lee ejemplos/demo-empresa.xlsx y dime si hay filas con problemas."* → `leer_movimientos_excel`
2. *"Registra un ingreso con factura de $1.190.000 el 2026-10-25 por entradas."* → `agregar_movimiento` (se ve la fila nueva al reabrir el Excel).
3. *"Calcula el EERR de 2026."* → `calcular_eerr`
4. *"¿Cuánto pago al SII por mes y cuándo vence?"* → `calcular_pagos_sii`
5. *"Escribe el informe 2026 en el Excel."* → `generar_informe_excel` (la IA pedirá confirmar)

## Después
Reabrir el Excel: aparecen las hojas **EERR** y **Pagos SII**. Resultado esperado con los datos originales del demo (sin el paso 2):

| Concepto | Valor |
|---|---|
| Ingresos netos | $12.500.000 |
| Margen bruto | $10.200.000 |
| Resultado antes de impuesto | $5.270.000 |
| Impuesto 1ª categoría (12,5%) | $668.750 |
| F29 septiembre (vence 20-10-2026) | $668.375 |
| F29 octubre (vence 20-11-2026) | $894.375 |

Cerrar mostrando `npm test` con "Prueba de humo superada." y el repositorio público en GitHub.
