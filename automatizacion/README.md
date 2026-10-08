# Registro diario automático

Actualiza la planilla **Plan_Fitness_Transformacion** (hoja `Diario`) con los pasos del iPhone y la
nutrición de MyFitnessPal. Todos los días a las 22:00 te pregunta por el registro y completa lo que
falta.

```
 MyFitnessPal ──escribe──▶ Apple Salud ◀──cuenta── iPhone / Watch (pasos)
                               │
                 22:00  Atajo «Registro diario» (automatización de iOS)
                               │ 1. lee pasos, kcal y proteína de ayer y hoy
                               │ 2. POST «sincronizar»
                               ▼
                 Apps Script (aplicación web, vinculado a la planilla)
                               │ escribe en Diario y responde qué falta
                               ▼
                 Atajo: «Ya tengo 8.432 pasos · 1.950 kcal. Falta: peso, ánimo… ¿Lo completo yo?»
                    ├─ Sí, completalo → te pregunta sólo lo que falta (1–5, Sí/No, número) → POST «responder»
                    ├─ Lo cargo yo    → abre tu formulario de Google
                    └─ Hoy no
                 Formulario de Google ──al enviar──▶ Apps Script copia la respuesta al Diario
                 23:30  Apps Script revisa el día ──si falta algo──▶ mail con lo que falta y los links
```

| Archivo | Qué es |
|---|---|
| `apps-script/Codigo.gs` | Todo el backend: aplicación web, formulario, revisión nocturna e instalación |
| `apps-script/appsscript.json` | Manifiesto (zona horaria de Argentina, V8) |
| `atajo-iphone.md` | Cómo armar el Atajo y la automatización de las 22:00 |
| `test/` | 22 pruebas con un simulador de Apps Script (`npm test`, sin dependencias) |

## Decisiones (y por qué)

- **MyFitnessPal entra por Apple Salud, no por su API.** MFP no tiene API pública (sólo para
  socios). Las librerías no oficiales leen la web con tus cookies, violan los términos y se rompen
  cada vez que MFP cambia el login. MFP sí escribe en Salud las calorías, la proteína, el peso y (según la versión) el agua. Así,
  un único Atajo trae MFP y pasos juntos, sin contraseñas ni scraping.
- **Se escribe en la Google Sheet, no en el `.xlsx`.** La que usás es la hoja de cálculo de Google
  (tu formulario carga ahí; la editaste el 07/10). Las dos `.xlsx` de Drive son copias viejas (agosto
  y septiembre). Si necesitás Excel: Archivo → Descargar → `.xlsx`.
- **«Que lo haga por mí» tiene un límite: no inventa datos.** Pasos, calorías y proteína (y peso y
  agua, si MFP los manda) se completan solos. Ánimo, energía, hambre, calidad y horas de sueño, y si
  entrenaste, no están en ningún lado: el agente te los pregunta (de 4 a 8 toques) o quedan vacíos.
  Rellenarlos con un promedio te arruinaría el análisis y el «Cumpl. %».
- **Lo tuyo manda.** Salud sólo escribe en celdas vacías o en las que ya había escrito Salud (nota
  `auto: Salud …`). Si cargás un valor a mano, por el formulario o respondiendo al Atajo, el sistema
  no lo vuelve a pisar.
- **Se mandan ayer y hoy.** A las 22:00 los pasos y las calorías de hoy están incompletos. La corrida
  de la noche siguiente los reemplaza por el total final (siguen siendo celdas `auto`).
- **Las fechas se calculan en hora argentina, con corte a las 4:00.** Un formulario enviado a las
  00:30 cuenta para el día anterior. Contra tus 20 respuestas reales, las 240 celdas caen en la misma
  fecha y con el mismo valor que cargaste a mano.

## Instalación (≈ 30 min, una sola vez)

### 1. MyFitnessPal → Salud
App **Salud** → tu foto → **Apps** → **MyFitnessPal** → activá *Energía alimentaria* y *Proteínas*
(opcional: *Peso* y *Agua*). Si no aparece, conectalo desde MFP (*Ajustes* o *Apps y dispositivos* → **Apple Salud**, según la versión).
MFP escribe en Salud cuando la app sincroniza: si cargás comidas desde la web, abrí la app del iPhone
antes de las 22:00.

### 2. Apps Script
1. Abrí la planilla **Plan_Fitness_Transformacion (Autoguardado)** → **Extensiones → Apps Script**.
2. Pegá el contenido de `apps-script/Codigo.gs` (reemplazá el `Código.gs` vacío) y guardá.
3. *(Opcional)* Configuración del proyecto → zona horaria **(GMT-03:00) Buenos Aires**. El script
   igual usa la hora argentina por su cuenta.
4. Elegí la función **`instalar`** → **Ejecutar** → aceptá los permisos. En el registro de ejecución
   aparecen el **token** y el estado de hoy. Si dice `Falta la columna «…»`, cambió un encabezado de
   la fila 3 del Diario.
5. **Implementar → Nueva implementación →** tipo **Aplicación web**.
   Ejecutar como: **Yo** · Quién tiene acceso: **Cualquier persona** → copiá la **URL** (`…/exec`).
6. Probalo desde la compu (cambiá URL y TOKEN):
   ```bash
   curl -sL -X POST 'URL' -H 'Content-Type: application/json' \
        -d '{"accion":"estado","token":"TOKEN"}'
   ```
   Tiene que devolver `"ok":true` con `faltan`, `preguntas` y `resumen` de hoy.

`instalar()` también crea dos disparadores: **al enviar el formulario**, que copia la respuesta al
Diario, y la **revisión de las 23:30**, que te manda un mail si falta algo. Para no recibir mails,
poné `AVISO_POR_MAIL: false`.

### 3. Atajo y automatización de las 22:00
Seguí [`atajo-iphone.md`](atajo-iphone.md).

### 4. Ajustes recomendados (no obligatorios, pero los aconsejo)
- **Sacá del formulario** *Pasos*, *Calorías* y *Proteína (g)* (ahora llegan solos y lo que escribas
  en el formulario manda sobre el iPhone) y la *Pregunta sin título*, que está vacía.
- **Zona horaria de la planilla:** Archivo → Configuración → *Buenos Aires*. Hoy está en Los Ángeles:
  las marcas de tiempo del formulario aparecen 4–5 h atrasadas y `HOY()` cambia de día a las 4 o 5
  de la mañana. El script no depende de esto.
- **Ponerte al día:** ejecutá `importarFormulario()` una vez. Copia las respuestas viejas del
  formulario que nunca pasaron al Diario y sólo llena celdas vacías.

## Qué hace cada regla

| Origen | Cuándo escribe | Nota en la celda | ¿Lo pisa Salud después? |
|---|---|---|---|
| Salud (Atajo, `sincronizar`) | celda vacía o con nota `auto:` · sólo ayer y hoy | `auto: Salud · 08/10 22:00` | sí (se actualiza) |
| Tu respuesta al Atajo (`responder`) | siempre · sólo ayer y hoy | `agente · 08/10 22:04` | no |
| Formulario (al enviar) | siempre que la pregunta tenga respuesta | se borra la nota `auto:` | no |
| `importarFormulario()` / revisión 23:30 | sólo celdas vacías | — | no |

Validaciones: peso 30–250 kg, agua 0,1–10 L (convierte mL), sueño 0,5–16 h, pasos 1–100.000,
kcal 1–8.000 (convierte kJ), proteína 1–500 g, escalas 1–5 enteras, Sí/No. Lo que no pasa la
validación no se escribe y queda anotado en la hoja oculta `_Automatizacion`.

## Límites y riesgos

- **iOS no deja leer Salud con el iPhone bloqueado.** Si a las 22:00 está bloqueado, el Atajo puede
  fallar o esperar a que lo toques. Hay dos redes: la corrida de la noche siguiente completa los
  números de ayer, y a las 23:30 te llega el mail.
- **Las calorías de las 22:00 son parciales** si todavía no cargaste la cena en MFP. Ese día el
  «Cumpl. %» puede salir inflado (`K ≤ Meta_Cal`) hasta la corrida siguiente. Si cenás tarde, mové la
  automatización a las 23:00.
- **La calidad del dato depende de MFP.** Si una comida no está en MFP, no está en la planilla.
- **La URL + el token permiten escribir en tu Diario.** No compartas el Atajo con el token adentro.
  Si se filtra: en Apps Script → Configuración del proyecto → Propiedades del script, borrá `TOKEN`
  y ejecutá `instalar()` otra vez.
- **Se espera que cambien tus números.** En septiembre y octubre faltan los pasos de casi la mitad de
  los días, y muchos de los que hay son redondos (10.000, 3.400). Con datos del iPhone la media
  semanal y el «Cumpl. %» van a cambiar. No es un error del sistema: es el dato real.
- **Pruebas:** la lógica está probada con un simulador (`npm test`, 22 casos) y contra tus respuestas
  reales del formulario. La parte que corre en Google y en el iPhone no se puede probar desde acá:
  validala con el `curl` del paso 2.6 y la prueba de `atajo-iphone.md`.

## Mantenimiento

- Si cambiás un encabezado de la fila 3 del Diario, actualizá `CAMPOS` en `Codigo.gs`. El script
  busca las columnas por nombre, no por letra, así que mover columnas no lo rompe.
- Después de cambiar el código: **Implementar → Administrar implementaciones → editar → Nueva versión**
  (la URL no cambia).
- `npm test` desde `automatizacion/` corre las pruebas (Node 18+).
