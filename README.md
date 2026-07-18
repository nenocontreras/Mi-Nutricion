# Mi Nutrición — PWA

Diario de comidas conectado a tu plan, despensa con lista de compras, objetivos y racha.
Estética Minimal Modern. Funciona sin conexión.

## Estructura
```
mi-nutricion/
├── index.html      ← La app entera (interfaz + lógica + datos del plan)
├── manifest.json   ← Ficha de la PWA
├── sw.js           ← Service Worker (caché mi-nutricion-v2)
├── icons/
└── screenshots/
```

## Probar en tu computadora
```bash
cd mi-nutricion
python3 -m http.server 8080     # abre http://localhost:8080
```
El Service Worker necesita http://localhost o HTTPS: con doble clic no se instala.

## Publicar gratis
- **GitHub Pages:** sube la carpeta → Settings → Pages → Branch `main`.
- **Netlify:** arrastra la carpeta en "Deploy manually".
- **Vercel:** importa el repo, preset "Other", sin build.

Las rutas son relativas: funciona también dentro de una subcarpeta.

## Sincronizar con «Mi Progreso»
- **Mismo sitio web** (p. ej. `tusitio.com/mi-progreso/` y `tusitio.com/mi-nutricion/`):
  los datos se comparten solos. El navegador guarda por dominio, no por carpeta.
- **Sitios distintos o teléfono nuevo:** en Mi Progreso → Ajustes → *Exportar mis datos*;
  en Mi Nutrición → Ajustes → *Importar copia de seguridad*. La importación **fusiona**: no borra nada.

## Actualizar
Al publicar cambios, sube el número de caché en `sw.js` (`mi-nutricion-v2` → `v3`).

## Datos
Todo vive en el navegador donde la instales (`localStorage`). Exporta antes de cambiar de dispositivo.
