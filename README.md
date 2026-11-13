# MCP Finanzas Chile

Servidor **MCP (Model Context Protocol)** que conecta una IA (opencode, Claude Desktop, Cursor…) con **Microsoft Excel** para llevar las finanzas de una empresa chilena: tú registras **ingresos y gastos** en una planilla y la IA te entrega el **Estado de Resultados (EERR)** y **lo que hay que pagar al SII** (IVA/F29, PPM, retención de honorarios y renta anual).

Proyecto individual del examen *"MCP para una herramienta de su computadora"*. Está construido sobre el [`mcp-starter-kit`](https://github.com/Maurichilean3d/mcp-starter-kit) del curso (rama `main`).

> ⚠️ **Son estimaciones con fines académicos.** No reemplazan a un contador ni a la declaración oficial del SII. Revisa siempre las tasas vigentes en [sii.cl](https://www.sii.cl).

## ¿Qué hace?

| Antes (a mano) | Con el MCP |
|---|---|
| Sumar facturas, separar IVA, armar el EERR y buscar qué se paga al SII en varias planillas | Le dices a la IA *"calcula el EERR y lo que debo pagar de 2026"* y lo hace sobre **tu** archivo Excel |

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

| Herramienta | Qué hace | Cambia el Excel |
|---|---|---|
| `crear_plantilla_excel` | Crea el libro con las hojas **Empresa** (nombre, régimen) y **Movimientos**. No sobrescribe sin `confirmar: true`. | Crea |
| `agregar_movimiento` | Agrega un ingreso o gasto; separa neto e IVA 19% según el documento. | Agrega fila |
| `leer_movimientos_excel` | Lee la hoja y entrega totales, filas y advertencias de datos mal escritos. | No |
| `calcular_eerr` | Estado de Resultados (mes, año o todo el libro) con impuesto de 1ª categoría estimado. | No |
| `calcular_pagos_sii` | F29 mensual (IVA, PPM, retención) con vencimiento + renta anual (F22) estimada. | No |
| `generar_informe_excel` | Escribe las hojas **EERR** y **Pagos SII** en el mismo libro (pide `confirmar: true`). | Reemplaza 2 hojas |
| `listar_aplicaciones` / `abrir_aplicacion` | Del kit: abre el Excel en la app del computador. | No |

### Formato de la hoja `Movimientos`

`Fecha (AAAA-MM-DD) · Tipo (ingreso/gasto) · Categoría · Descripción · Neto · IVA · Documento`

- **Documento**: `factura`, `boleta`, `honorarios`, `exento` o `sin_documento`.
- Categorías con tratamiento especial: `costo_ventas` (costo de ventas) y `financiero` (gastos financieros). El resto son gastos operacionales.
- Puedes escribir las filas a mano en Excel o pedirle a la IA que use `agregar_movimiento`.

## Ejemplos de uso (lo que le dices a la IA)

1. *"Crea mi planilla en `~/Documentos/mi-empresa.xlsx`, empresa Etéreo SpA, régimen 14D8."*
2. *"Registra una venta con factura de $1.190.000 el 5 de noviembre."*
3. *"Registra un gasto de $600.000 en honorarios el 9 de noviembre."*
4. *"Calcula el EERR de 2026 de `ejemplos/demo-empresa.xlsx`."*
5. *"¿Cuánto tengo que pagar al SII por mes y cuándo vence?"*
6. *"Escribe el informe 2026 en el mismo Excel."*

## Cómo calcula (resumen)

- **IVA mensual** = IVA débito (ventas) − IVA crédito (compras con factura) − remanente del mes anterior. Si da negativo, queda como remanente.
- **PPM** = tasa × ingresos netos del mes (14 D N°3: 0,125%; 14 D N°8: 0,2%; 14 A: 1% de referencia). Son parámetros de `src/lib/tributario.ts`.
- **Retención de honorarios**: 15,25% del bruto en 2026 (16% en 2027, 17% desde 2028).
- **Impuesto de 1ª categoría**: 14 A 27% (2026) / 25,5% (2027); 14 D N°3 12,5% (transitorio); 14 D N°8 no paga: la base se atribuye a los dueños (IGC).
- Los gastos `sin_documento` no dan crédito de IVA ni se aceptan como gasto tributario.
- F29 vence el día 20 del mes siguiente (declaración por internet), movido a lunes si cae en fin de semana. No considera feriados.

## Seguridad y límites

Ver [`docs/entrega/03-declaracion-ia-limites-seguridad.md`](docs/entrega/03-declaracion-ia-limites-seguridad.md). En corto: solo abre archivos `.xlsx` que tú indiques, no usa red ni claves, pide confirmación antes de sobrescribir y el repo no contiene datos reales (el Excel de ejemplo es ficticio).

## Pruebas

`npm test` compila, corre 12 pruebas unitarias (valores calculados a mano) y la prueba de humo que arranca el servidor MCP y recorre las herramientas sobre un Excel temporal.

## Estructura

```
src/index.ts            servidor MCP (carga src/tools/*)
src/tools/finanzas.ts   las 6 herramientas de finanzas
src/lib/tributario.ts   motor tributario (funciones puras y parámetros editables)
src/lib/excel.ts        lectura/escritura del .xlsx
tests/                  pruebas unitarias
scripts/                prueba de humo y generador de datos de ejemplo
docs/entrega/           documentos del examen
```

## Licencia

MIT (heredada del starter kit).
