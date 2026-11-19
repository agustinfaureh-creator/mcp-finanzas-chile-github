# MCP Finanzas Chile

Servidor **MCP (Model Context Protocol)** que conecta una IA (opencode, Claude Desktop, Cursor…) con **Excel** (archivos `.xlsx`) para llevar la contabilidad de una empresa chilena: registras **ingresos y gastos** (a mano o importando las facturas del Registro de Compras y Ventas del SII) y la IA te entrega el **Estado de Resultados (EERR)** mensual y anual, **lo que hay que pagar al SII** (IVA/F29, PPM, retención de honorarios y renta anual) y los **próximos vencimientos**.

Los cálculos los hace código con pruebas, no el modelo: la IA entiende el pedido, llama a la herramienta y explica el resultado. Se validó contra un F29 real ya declarado de una pyme: el MCP calculó el mismo total que el SII, al peso.

Proyecto individual del examen *"MCP para una herramienta de su computadora"*. Está construido sobre el [`mcp-starter-kit`](https://github.com/Maurichilean3d/mcp-starter-kit) del curso (rama `main`).

> ⚠️ **Son estimaciones con fines académicos.** No reemplazan a un contador ni a la declaración oficial del SII. Revisa siempre las tasas vigentes en [sii.cl](https://www.sii.cl).

## ¿Qué hace?

| Antes (a mano) | Con el MCP |
|---|---|
| Sumar facturas, separar IVA, armar el EERR y buscar qué se paga al SII en varias planillas | Le dices a la IA *"calcula el EERR y lo que debo pagar de 2026"* y lo hace sobre **tu** archivo Excel |
| Revisar a mano qué facturas nuevas llegaron al SII | Descargas el CSV del RCV y la IA importa solo las nuevas y te avisa cuáles son |
| Acordarse de cuándo vence el F29 | La IA lista lo que vence y crea recordatorios en tu Calendario |

Regímenes soportados: **14 A** (general), **14 D N°3** (Pro Pyme general) y **14 D N°8** (Pro Pyme transparente).

## Requisitos

- [Node.js](https://nodejs.org) **18 o superior** (probado con 22) y npm.
- Un cliente MCP: [opencode](https://opencode.ai), Claude Desktop, Cursor o similar.
- Excel, LibreOffice o cualquier programa que abra `.xlsx` (el servidor no necesita tener Excel abierto; **cierra el archivo antes de escribir** en él).

## Instalación paso a paso

```bash
git clone https://github.com/TU-USUARIO/mcp-finanzas-chile.git
cd mcp-finanzas-chile
npm install
npm run build
npm test          # debe terminar con: "Prueba de humo superada."
npm run demo      # crea ejemplos/demo-empresa.xlsx con datos ficticios
```

En Mac también puedes hacer doble clic en `Iniciar.command` (instala Node y opencode la primera vez) y después en `Contador.command` (compila y abre opencode con el MCP conectado).

### Conectarlo a opencode

El repo ya trae `opencode.json`. Desde esta carpeta ejecuta `opencode` y listo. Si lo quieres en otra carpeta, agrega a tu `opencode.json`:

```json
{
  "mcp": {
    "finanzas-chile": {
      "type": "local",
      "command": ["node", "/RUTA/COMPLETA/mcp-finanzas-chile/dist/index.js"],
      "enabled": true
    }
  }
}
```

### Conectarlo a Claude Desktop

En `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "finanzas-chile": {
      "command": "node",
      "args": ["/RUTA/COMPLETA/mcp-finanzas-chile/dist/index.js"]
    }
  }
}
```

Reinicia el cliente. No hay claves, tokens ni variables de entorno que configurar.

## Herramientas

13 herramientas de finanzas, en dos archivos (`finanzas.ts`: libro y cálculos; `contabilidad.ts`: rutina mensual), más 2 del starter kit.

| Herramienta | Qué hace | Cambia el Excel |
|---|---|---|
| `crear_plantilla_excel` | Crea el libro con las hojas **Empresa** (nombre, régimen) y **Movimientos**. No sobrescribe sin `confirmar: true`. | Crea |
| `preparar_libro_existente` | Agrega las hojas Empresa y Movimientos a un Excel que ya tienes (p. ej. la planilla de un evento) sin tocar tus otras hojas. | Agrega 2 hojas |
| `importar_gastos_desde_hoja` | Copia gastos desde otra hoja (p. ej. Honorarios), convirtiendo líquido a bruto si corresponde. Primero simula (`simular: true`). | Agrega filas |
| `importar_rcv_sii` | Lee el CSV del Registro de Compras y Ventas descargado de Mi SII y agrega solo las facturas **nuevas** (no duplica). Avisa cuáles llegaron. | Agrega filas |
| `proximos_pagos` | Próximos vencimientos (F29 y renta) con días restantes y monto estimado. | No |
| `registrar_pago_sii` | Anota pagos hechos o pendientes (F29, giros, multas) en la hoja "Pagos registrados"; así no se avisa lo ya pagado. | Agrega/actualiza fila |
| `generar_calendario_pagos` | Crea un `.ics` con recordatorios de pago para el Calendario. | Crea archivo |
| `estado_resultados_mensual` | EERR de cada mes del año; opcionalmente lo escribe en la hoja "EERR mensual". | Reemplaza 1 hoja |
| `agregar_movimiento` | Agrega un ingreso o gasto; separa neto e IVA 19% según el documento. | Agrega fila |
| `leer_movimientos_excel` | Lee la hoja y entrega totales, filas y advertencias de datos mal escritos. | No |
| `calcular_eerr` | Estado de Resultados (mes, año o todo el libro) con impuesto de 1ª categoría estimado. | No |
| `calcular_pagos_sii` | F29 mensual (IVA, PPM, retención) con vencimiento + renta anual (F22) estimada. | No |
| `generar_informe_excel` | Escribe las hojas **EERR** y **Pagos SII** en el mismo libro (pide `confirmar: true`). | Reemplaza 2 hojas |
| `listar_aplicaciones` / `abrir_aplicacion` | Del kit: abre el Excel en la app del computador. | No |

### Formato de la hoja `Movimientos`

`Fecha (AAAA-MM-DD) · Tipo (ingreso/gasto) · Categoría · Descripción · Neto · IVA · Documento · Folio · RUT contraparte · Período IVA`

- **Documento**: `factura`, `boleta`, `honorarios`, `exento` o `sin_documento`.
- Categorías con tratamiento especial: `costo_ventas` (costo de ventas) y `financiero` (gastos financieros). El resto son gastos operacionales.
- `Folio`, `RUT contraparte` y `Período IVA` son opcionales. El folio (p. ej. `33-1234`) evita duplicar facturas al importar el RCV.
- En la hoja **Empresa**, la fila `PPM %` guarda la tasa de PPM que te propone el SII.
- Puedes escribir las filas a mano en Excel o pedirle a la IA que use `agregar_movimiento`.

## Ejemplos de uso (lo que le dices a la IA)

1. *"Crea mi planilla en `~/Documentos/mi-empresa.xlsx`, empresa Etéreo SpA, régimen 14D8."*
2. *"Registra una venta con factura de $1.190.000 el 5 de noviembre."*
3. *"Registra un gasto de $600.000 en honorarios el 9 de noviembre."*
4. *"Calcula el EERR de 2026 de `ejemplos/demo-empresa.xlsx`."*
5. *"¿Cuánto tengo que pagar al SII por mes y cuándo vence?"*
6. *"Escribe el informe 2026 en el mismo Excel."*
7. *"Importa las compras de `ejemplos/rcv-compras-demo.csv`"* (CSV ficticio con el formato del RCV).
8. *"¿Qué vence en los próximos días?"* y *"ya pagué el F29 de octubre, $850.000"*.
9. *"Dame el estado de resultados mes a mes de 2026."*

## Rutina mensual (llevar la contabilidad al día)

1. En Mi SII (sii.cl) entra a **Registro de Compras y Ventas** y descarga el detalle en CSV de compras y de ventas del mes.
2. Pídele a la IA: *"importa las compras de este CSV"* y luego las ventas. Te avisa las facturas nuevas.
3. Clasifica las compras nuevas y registra los gastos sin factura.
4. Pídele el **EERR del mes** y los **próximos pagos**.
5. Una vez: *"genera el calendario de pagos"* y abre el `.ics` para recibir alarmas en tu Calendario.

**Importante: el MCP no se conecta directamente al SII.** El SII no ofrece una API abierta para empresas pequeñas, y automatizar el ingreso a Mi SII exigiría guardar la clave tributaria, lo que es un riesgo de seguridad. Por eso trabaja con el CSV que descargas tú. Tampoco envía notificaciones por sí solo: los recordatorios salen del calendario `.ics`.

## Cómo calcula (resumen)

- **IVA mensual** = IVA débito (ventas) − IVA crédito (compras con factura) − remanente del mes anterior. Si da negativo, queda como remanente.
- **PPM** = tasa × ingresos netos del mes (14 D N°3: 0,125%; 14 D N°8: 0,1%; 14 A: 1% de referencia). Si el SII te propone otra tasa, escríbela en la fila `PPM %` de la hoja Empresa.
- **Período de IVA**: si el SII incluye una factura en un mes distinto al de su fecha (acuse de recibo, Pendientes), indícalo en la columna `Período IVA` (AAAA-MM).
- **Retención de honorarios**: 15,25% del bruto en 2026 (16% en 2027, 17% desde 2028).
- **Impuesto de 1ª categoría**: 14 A 27% (2026) / 25,5% (2027); 14 D N°3 12,5% (transitorio); 14 D N°8 no paga: la base se atribuye a los dueños (IGC).
- Los gastos `sin_documento` no dan crédito de IVA ni se aceptan como gasto tributario.
- F29 vence el día 20 del mes siguiente (declaración por internet), movido a lunes si cae en fin de semana. No considera feriados.

## Seguridad y límites

Ver [`docs/entrega/03-declaracion-ia-limites-seguridad.md`](docs/entrega/03-declaracion-ia-limites-seguridad.md). En corto: solo abre los archivos `.xlsx`, `.csv` e `.ics` que tú indiques, no usa red ni claves, no se conecta al SII, pide confirmación antes de sobrescribir y el repo no contiene datos reales (el Excel de ejemplo es ficticio).

## Pruebas

`npm test` compila, corre 20 pruebas unitarias (valores calculados a mano, incluido un caso que reproduce un F29 real) y la prueba de humo que arranca el servidor MCP y recorre las herramientas sobre un Excel temporal: crea el libro, registra movimientos, calcula EERR e IVA, importa el RCV dos veces sin duplicar, lista próximos pagos, crea el calendario y el EERR mensual.

## Estructura

```
src/index.ts            servidor MCP (carga src/tools/*)
src/tools/finanzas.ts       libro Excel, EERR y pagos SII (8 herramientas)
src/tools/contabilidad.ts   RCV, próximos pagos, pagos registrados, calendario, EERR mensual (5)
src/tools/aplicaciones.ts   del starter kit: listar y abrir apps
src/lib/tributario.ts       motor tributario (funciones puras y parámetros editables)
src/lib/excel.ts            lectura/escritura del .xlsx
src/lib/rcv.ts              lector del CSV del Registro de Compras y Ventas
ejemplos/                   Excel y CSV ficticios para probar
tests/                  pruebas unitarias
scripts/                prueba de humo y generador de datos de ejemplo
docs/entrega/           documentos del examen
```

## Licencia

MIT (heredada del starter kit).
