# Declaración de uso de IA, límites y seguridad

## Uso de IA (declaración)
- Este proyecto se desarrolló con ayuda de **Claude (Anthropic)** como asistente de programación y redacción: propuso la arquitectura, escribió la mayor parte del código TypeScript, las pruebas y los documentos, y buscó en fuentes públicas las tasas tributarias.
- Yo definí el problema (finanzas de una empresa con ingresos, gastos, EERR y pagos al SII), elegí Excel como aplicación, revisé y ejecuté el código y debo responder por el resultado.
- Los cálculos no dependen de la IA en tiempo de uso: los realiza código determinista (`src/lib/tributario.ts`). La IA que use el MCP solo invoca las herramientas y explica los resultados.
- Las tasas se verificaron en fuentes públicas (SII, Ley 21.755 y Ley 21.850, publicaciones de estudios jurídicos y contables); no fueron validadas por un contador.

## Límites conocidos
- **No es asesoría tributaria**: son estimaciones. El contador y el SII son la fuente oficial.
- PPM del 14 A es una tasa de referencia (en la práctica la fija el SII por empresa); el PPM de Pro Pyme puede variar con el valor de la UF y el nivel de ingresos.
- La tasa de impuesto de 1ª categoría cambia según la ley: se modelan 2026 y 2027 y supuestos para años posteriores. Los efectos de la Ley 21.850 sobre el año comercial 2026 deben confirmarse.
- No modela: reajuste del remanente de IVA, IVA no recuperable, activo fijo y depreciación, pérdidas tributarias de años anteriores, gastos rechazados distintos de "sin documento", impuesto único a los trabajadores, cotizaciones ni feriados al calcular vencimientos.
- El IGC de los dueños (14 D N°8) es una aproximación que trata toda la base como de un solo dueño y requiere ingresar el valor de la UTA.
- Exige el formato de la hoja `Movimientos`; las filas mal escritas se ignoran y se informan como advertencia.

## Consideraciones de seguridad y permisos
- **Alcance mínimo**: solo lee y escribe archivos `.xlsx` cuya ruta indica el usuario; rechaza cualquier otra extensión. No ejecuta comandos con shell, no usa red y no lee variables de entorno.
- **Confirmación explícita** (`confirmar: true`) para crear sobre un archivo existente y para reemplazar las hojas EERR y Pagos SII. La hoja `Movimientos` nunca se borra.
- **Sin secretos**: el repositorio no contiene claves, tokens, `.env` ni datos personales. `.gitignore` excluye `.env` y todos los `.xlsx` salvo el ejemplo ficticio `ejemplos/demo-empresa.xlsx`.
- **Datos reales**: no subas la planilla de tu empresa al repositorio ni la pegues en chats públicos; contiene información financiera. Los datos del demo son inventados.
- Los errores se devuelven como mensajes controlados, sin detalles internos.
- El servidor registra solo mensajes de arranque en stderr; stdout queda reservado para el protocolo MCP.
- La herramienta `abrir_aplicacion` (del starter kit) valida nombres y se puede limitar con `MCP_ALLOWED_APPS`.
