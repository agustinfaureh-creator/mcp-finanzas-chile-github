# Utilidad académica: MCP Finanzas Chile

**Problema que resuelve.** En una empresa pequeña los números viven en planillas Excel, y armar el Estado de Resultados (EERR) y saber qué se paga al SII cada mes exige varios pasos manuales: separar el IVA, sumar créditos y débitos, arrastrar remanentes, calcular el PPM y la retención de honorarios, y estimar la renta anual según el régimen. Es fácil equivocarse y es difícil ver *por qué* sale cada número.

**Qué hace el MCP.** Conecta a la IA con el archivo Excel de la empresa. La persona registra ingresos y gastos (a mano o pidiéndoselo a la IA) y el MCP calcula el EERR y los pagos al SII (F29 mensual con su vencimiento y renta anual estimada para los regímenes 14 A, 14 D N°3 y 14 D N°8), y deja el resultado escrito en hojas del mismo libro. Los cálculos no los inventa el modelo: los hace código determinista con pruebas, y el modelo solo entiende la petición y explica el resultado.

**Para quién.** Estudiantes de kinesiología, ingeniería o administración que emprenden y no son contadores; socios de emprendimientos que quieren entender sus números antes de hablar con el contador; y compañeros del curso, que pueden clonar el repositorio y usarlo con su propia planilla.

**Dimensión de aprendizaje.**
- *Finanzas:* relación entre ingresos, costos, margen y resultado; diferencia entre resultado contable y base imponible; cómo funcionan IVA, PPM, retenciones y renta por régimen.
- *Ingeniería y uso responsable de IA:* diseñar herramientas MCP con descripciones claras, validación de entradas, confirmación antes de sobrescribir y pruebas automáticas; separar lo que calcula el código de lo que redacta la IA.
- *Pensamiento crítico:* cada tasa es un parámetro visible y editable, con sus fuentes y límites, de modo que la persona puede discutir el supuesto en vez de aceptar una caja negra.

**Evidencia.** 12 pruebas unitarias con valores calculados a mano, una prueba de punta a punta del servidor MCP sobre un Excel real y una verificación independiente en Python que coincide al peso con los resultados del demo.
