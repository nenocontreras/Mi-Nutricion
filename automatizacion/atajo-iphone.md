# Atajo «Registro diario» (iPhone)

El Atajo hace de interfaz: lee Salud, se lo manda a la planilla y te pregunta **sólo lo que falta**.
La lógica (qué falta, qué se puede pisar, validaciones) vive en el Apps Script, así que el Atajo no
hay que tocarlo si cambiás reglas.

> No se puede compartir un Atajo como archivo sin firmarlo desde un iPhone, por eso va paso a paso.
> Son unas 40 acciones y lleva unos 15 minutos. Los nombres están como aparecen en iOS en español,
> con el nombre en inglés entre paréntesis.

Antes de empezar necesitás la **URL de la aplicación web** y el **token** (ver README, paso 2).

---

## Parte 1 · Datos

1. **Texto** (Text) → pegá la URL de la aplicación web.
   **Definir variable** (Set Variable) → `URL`.
2. **Texto** → pegá el token. **Definir variable** → `Token`.

### Bloque de una métrica (repetilo 3 veces)

| Variable | Tipo de muestra en Salud |
|---|---|
| `Pasos` | Pasos |
| `Kcal` | Energía alimentaria (Dietary Energy) |
| `Proteina` | Proteínas (Protein) |
| `Peso` *(opcional)* | Peso (Body Mass) |
| `Agua` *(opcional)* | Agua (Water) |

3. **Buscar muestras de salud** (Find Health Samples)
   - Tipo: *Pasos*
   - Filtro: **Fecha de inicio** · *está en los últimos* · **2 días**
   - **Agrupar por: Día** ← imprescindible. Sin agrupar, si tenés Apple Watch los pasos se cuentan dos veces.
   - Ordenar por: Fecha de inicio · Límite: desactivado
4. **Repetir con cada** (Repeat with Each) elemento en *Muestras de salud*:
   - **Formatear fecha** (Format Date): fecha = *Elemento de repetición › Fecha de inicio*;
     Formato de fecha: **Personalizado** `yyyy-MM-dd`; Formato de hora: Ninguno.
   - **Texto**: `[Fecha formateada]=[Elemento de repetición › Valor]`
     (tocá *Elemento de repetición* y elegí la propiedad *Valor*).
5. **Finalizar repetición**. **Combinar texto** (Combine Text): *Resultados de repetición* con **Personalizado** `;`
6. **Definir variable** → `Pasos`.

Duplicá los pasos 3–6 para *Energía alimentaria* → `Kcal` y *Proteínas* → `Proteina`
(y si querés, *Peso* → `Peso`, *Agua* → `Agua`).

El resultado de cada bloque se ve así: `2026-10-07=10234;2026-10-08=6012`.
Se mandan **ayer y hoy** a propósito: así cada noche se cierran con el número final los pasos y las
calorías del día anterior, que a las 22:00 todavía estaban incompletos.

### Envío

7. **Obtener contenido de la URL** (Get Contents of URL)
   - URL: `URL` · Método: **POST** · Cuerpo de la solicitud: **JSON**
   - Campos (todos tipo *Texto*):

     | Clave | Valor |
     |---|---|
     | `accion` | `sincronizar` |
     | `token` | variable `Token` |
     | `pasos` | variable `Pasos` |
     | `kcal` | variable `Kcal` |
     | `proteina` | variable `Proteina` |
     | `peso` / `agua` | *(sólo si armaste esos bloques)* |

8. **Definir variable** → `Estado` (es el diccionario que devuelve la planilla).

---

## Parte 2 · La pregunta

9. **Obtener valor del diccionario** (Get Dictionary Value): clave `resumen` de `Estado` → **Definir variable** `Resumen`.
10. **Obtener valor del diccionario**: clave `estado` de `Estado`.
11. **Si** (If) *Valor del diccionario* **es** `completo`:
    - **Mostrar notificación** (Show Notification): `Resumen`.
12. **De lo contrario** (Otherwise):
    - **Elegir del menú** (Choose from Menu). Pregunta: `Resumen` + salto de línea + `¿Lo completo yo?`
      Opciones: **Sí, completalo** · **Lo cargo yo** · **Hoy no**

#### Opción «Sí, completalo»

13. **Diccionario** (Dictionary) vacío → **Definir variable** `Respuestas`.
14. **Obtener valor del diccionario**: clave `preguntas` de `Estado`.
15. **Repetir con cada** elemento en *Valor del diccionario*:
    - **Obtener valor del diccionario** `campo` de *Elemento de repetición* → **Definir variable** `Campo`
    - **Obtener valor del diccionario** `texto` de *Elemento de repetición* → **Definir variable** `TextoPregunta`
    - **Obtener valor del diccionario** `tipo` de *Elemento de repetición*
    - **Si** *Valor del diccionario* **es** `lista`:
      - **Obtener valor del diccionario** `opciones` de *Elemento de repetición*
      - **Seleccionar de la lista** (Choose from List), solicitud: `TextoPregunta`
      - **Definir variable** `Valor` = *Elemento seleccionado*
    - **De lo contrario**:
      - **Solicitar entrada** (Ask for Input): tipo **Número**, pregunta `TextoPregunta`
      - **Definir variable** `Valor` = *Entrada proporcionada*
    - **Finalizar si**
    - **Establecer valor del diccionario** (Set Dictionary Value): clave `Campo`, valor `Valor`, en `Respuestas`
    - **Definir variable** `Respuestas` = *Diccionario*
16. **Finalizar repetición**.
17. **Obtener contenido de la URL**: `URL`, **POST**, **JSON** con
    `accion` = `responder` (Texto), `token` = `Token` (Texto), `respuestas` = `Respuestas` (tipo **Diccionario**).
18. **Obtener valor del diccionario** `resumen` del resultado → **Mostrar notificación**.

#### Opción «Lo cargo yo»

19. **Obtener valor del diccionario** `form_url` de `Estado` → **Abrir URL** (Open URLs).

#### Opción «Hoy no»

20. Nada. Si quedó algo sin cargar, a las 23:30 te llega un mail con lo que falta.

Cerrá con **Finalizar menú** y **Finalizar si**.

> Cada pregunta trae la opción **Saltar** (o dejá vacío el número). Lo que saltees queda vacío:
> el sistema **no inventa** ánimo, hambre ni horas de sueño.

---

## Parte 3 · Automatización de las 22:00

Atajos → **Automatización** → **+** → **Hora del día**
- 22:00 · Repetir: **Diariamente**
- **Ejecutar inmediatamente** (no «Preguntar antes de ejecutar»)
- Atajo: **Registro diario**

La primera vez iOS te pide permiso para leer Salud: aceptá **Pasos, Energía alimentaria y Proteínas**
(y Peso/Agua si los usás).

---

## Prueba antes de dejarlo andando

1. Ejecutá el Atajo a mano. Compará los pasos de hoy en la notificación con los que muestra la app
   Salud. **Si no coinciden, falta «Agrupar por: Día»**.
2. Mirá la planilla: las celdas que escribió Salud tienen una nota `auto: Salud · dd/mm hh:mm`.
3. Si algo falla, abrí la hoja oculta `_Automatizacion` (Ver → Hojas ocultas): ahí queda cada
   pedido con lo que se escribió, lo que se protegió y lo que se rechazó.

## Si pasa esto…

| Síntoma | Causa probable |
|---|---|
| `Token inválido` | Token mal copiado (sin espacios) o volviste a crear el proyecto. `mostrarToken()` lo muestra. |
| Las calorías no llegan | MyFitnessPal no escribe en Salud. Activá la conexión primero en MFP (si no, Salud sólo muestra «Sueño») y después, en Salud → tu perfil → Apps → MyFitnessPal, verificá *Energía alimentaria* y *Proteínas*. Abrí MFP una vez: sincroniza cuando la app corre. |
| `rechazados: kcal … fuera de rango` | Salud está en kilojulios. El script convierte si el texto dice «kJ»; si no, cambiá la unidad en Salud a kcal. |
| El Atajo corre pero no lee Salud | iOS no deja leer Salud con el iPhone bloqueado. Desbloquealo y tocá la notificación. Igual, la corrida de la noche siguiente completa los pasos y las calorías de ayer. |
| Cambiaste el código y no se nota | Apps Script → Implementar → Administrar implementaciones → editar → **Nueva versión**. |
