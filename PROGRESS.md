# Finanzas por voz — progreso

App PWA (HTML/JS sin build) para registrar ingresos y gastos, con carga por voz
(Web Speech API, es-AR) y parser propio en español. Datos en localStorage del dispositivo.
Destino: GitHub Pages en la cuenta personal FelipeManrique (NO la de GH Consultora).

## Plan
- [x] parser.js (montos en palabras/números, tipo, categoría, medio, fecha, varios movimientos) + tests node
- [x] index.html / styles.css / app.js (lista, resumen mensual, análisis, ajustes, edición)
- [x] flujo de voz: grabar → transcripción → revisión editable → guardar; fallback a texto/dictado
- [x] PWA: manifest, sw.js, íconos
- [x] verificación en navegador (viewport de teléfono)
- [ ] deploy a GitHub Pages (pedir confirmación al usuario antes de publicar)
