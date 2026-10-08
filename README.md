# Mis Finanzas

App web (PWA) para registrar ingresos y gastos hablando. Sin servidor ni cuentas:
los datos quedan en el teléfono (localStorage) y se respaldan exportando una copia.

## Cómo se usa
- Tocá el micrófono y decí, por ejemplo: “ayer pagué 4.500 de colectivo y 9 mil en la farmacia con débito”.
- La app detecta monto (en cifras o palabras: “cinco mil quinientos”, “35 lucas”, “1,5 millones”),
  gasto o ingreso, categoría, medio de pago, fecha (“ayer”, “el lunes”, “el 3 de octubre”, “hace 2 días”),
  cuotas y dólares. Varios movimientos en una frase se separan con “y”.
- Revisás, corregís lo que haga falta y guardás. En Ajustes se puede activar “Guardar sin revisar”.
- Si el navegador no reconoce voz, se usa el micrófono del teclado y la app interpreta el texto igual.

## Archivos
- `parser.js` — intérprete de frases en español (puro, testeable con Node).
- `app.js` — interfaz, almacenamiento, voz, exportar/importar.
- `sw.js` — cache offline. **Subí `VERSION` en cada deploy.**
- `test/parser.test.js` — `node test/parser.test.js`
- `test/voice.html` — flujo de voz con reconocimiento simulado (abrir con un servidor local).

## Correr local
python3 -m http.server 8791   →  http://localhost:8791
