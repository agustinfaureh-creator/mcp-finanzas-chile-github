# Utilidad académica: MCP Finanzas Chile

**Problema que resuelve.** En una empresa pequeña los números viven en planillas Excel y en el portal del SII. Armar el Estado de Resultados (EERR) y saber qué se paga cada mes exige varios pasos manuales: separar el IVA, sumar débitos y créditos, arrastrar remanentes, calcular el PPM y la retención de honorarios, revisar qué facturas nuevas llegaron y acordarse de cuándo vence el F29. Es fácil equivocarse y es difícil ver *por qué* sale cada número.

**Qué hace el MCP.** Conecta a la IA con el libro Excel de la empresa mediante 13 herramientas. La persona registra ingresos y gastos (a mano, pidiéndoselo a la IA o importando el CSV del Registro de Compras y Ventas del SII, sin duplicar facturas) y el MCP calcula el EERR mensual y anual, el F29 de cada mes con su vencimiento, la renta anual estimada según el régimen (14 A, 14 D N°3 o 14 D N°8), lleva un registro de lo pagado y lo pendiente, y genera recordatorios para el calendario. Los cálculos no los inventa el modelo: los hace código determinista con pruebas; el modelo entiende el pedido y explica el resultado.

**Caso real.** Se usó con los datos de una productora de eventos (pyme en régimen Pro Pyme Transparente). El F29 que calculó el MCP para un mes ya declarado coincidió al peso con el total pagado en el SII. En una prueba anterior, un modelo de IA sin el MCP calculó la retención de honorarios por su cuenta y se equivocó: esa diferencia es el aporte concreto de la herramienta.

**Para quién.** Emprendedores y estudiantes que llevan las cuentas de su propio negocio sin ser contadores; socios que quieren entender sus números antes de declarar o de hablar con un contador; y compañeros del curso, que pueden clonar el repositorio y usarlo con su planilla.

**Dimensión de aprendizaje.**

- *Finanzas:* relación entre ingresos, costos, margen y resultado; diferencia entre resultado contable y base imponible; cómo funcionan IVA, remanente, PPM, retenciones y renta por régimen.
- *Ingeniería y uso responsable de IA:* diseñar herramientas MCP con descripciones claras, validación de entradas, confirmación antes de sobrescribir y pruebas automáticas; separar lo que calcula el código de lo que redacta la IA.
- *Pensamiento crítico:* cada tasa es un parámetro visible y editable con sus fuentes y límites, de modo que la persona puede discutir el supuesto en vez de aceptar una caja negra.

**Evidencia.** 20 pruebas unitarias con valores calculados a mano (una reproduce un F29 real), una prueba de punta a punta que arranca el servidor y recorre las herramientas sobre un Excel temporal, y la validación contra el SII descrita arriba.
