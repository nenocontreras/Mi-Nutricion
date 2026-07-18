# Mi Nutrición — PWA

App de registro de comidas (estilo MyFitnessPal) conectada a tu plan nutricional, con control de objetivos y racha diaria.

## Estructura
```
mi-nutricion/
├── index.html      ← La app completa (interfaz + lógica + datos del plan)
├── manifest.json   ← Ficha de la PWA (nombre, íconos, colores)
├── sw.js           ← Service Worker: funciona sin conexión
├── icons/          ← 192, 512, maskable, apple-touch, favicon
└── screenshots/    ← Para el cartel de instalación de Android
```

## Probar localmente
```bash
cd mi-nutricion
python3 -m http.server 8080     # abre http://localhost:8080
```
(El Service Worker necesita http://localhost o HTTPS; no funciona con doble clic.)

## Publicar gratis
- **GitHub Pages:** sube la carpeta → Settings → Pages → Branch `main` → `/root`.
- **Netlify:** arrastra la carpeta en "Deploy manually".
- **Vercel:** importa el repo, preset "Other", sin build.

Las rutas son relativas, así que funciona también en subcarpetas.

## Instalar
- **Android/Chrome:** aviso "Instalar" o menú ⋮ → Instalar app.
- **iPhone (Safari):** Compartir ↑ → Añadir a inicio.
- **Windows/Mac:** ícono ⬇️ "Instalar" en la barra de direcciones.

## Actualizar
Si cambias archivos, sube la versión en `sw.js` (`mi-nutricion-v1` → `v2`) para renovar la caché.

## Datos
Todo se guarda en `localStorage` del navegador donde la instales. Usa "Exportar copia de seguridad" en Ajustes antes de cambiar de dispositivo.
