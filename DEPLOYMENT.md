# Despliegue — SteaMates

Documentación de despliegue, configuración en producción y limitaciones

---

## 1. URLs en vivo

| Servicio | URL |
|---|---|
| **Aplicación (Frontend)** | `https://steamates-frontend.vercel.app` |
| **Documentación Swagger** | `https://backend-5rwo.onrender.com/api-docs` |
| **Health check** | `https://backend-5rwo.onrender.com/api/health` |


---

## 2. Arquitectura de despliegue

La aplicación está repartida en dos proveedores PaaS distintos, conectados entre sí mediante CORS y un proxy de Vercel:

```
  Usuario
    │
    ▼
  ┌──────────────────────────┐         ┌───────────────────────────┐
  │  Vercel (Frontend)       │ ──────▶ │  Render (Backend Express) │
  │  React + Vite (estático) │  proxy  │  Node.js + Mongoose       │
  └──────────────────────────┘  /api/* └─────────────┬─────────────┘
                                                     │
                                                     ▼
                                       ┌─────────────────────────────┐
                                       │  MongoDB Atlas (Free Tier)  │
                                       │  Cluster en Frankfurt       │
                                       └─────────────────────────────┘
```

### Frontend — Vercel
- **Framework:** Vite 
- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Configuración:** `Frontend/vercel.json`
- **Rewrites:** las peticiones a `/api/*` se redirigen al backend de Render para evitar problemas de CORS con cookies de sesión

### Backend — Render
- **Plan:** Free tier
- **Región:** Frankfurt
- **Runtime:** Node.js (ESM)
- **Build command:** `npm install`
- **Start command:** `npm start`
- **Configuración:** `Backend/render.yaml`

### Base de datos — MongoDB Atlas
- **Plan:** M0 (Free Tier)
- **Provider:** AWS, región eu-central-1 (Frankfurt)

---

## 3. Startup inicial

### Despliegue del backend en Render

1. Crear servicio "Web Service" en Render apuntando al repositorio `SteaMates/Backend`.
2. Render detecta `render.yaml` y aplica la configuración (`buildCommand`, `startCommand`, región).
3. Configurar las variables de entorno marcadas con `sync: false` en `render.yaml`:

| Variable | Valor |
|---|---|
| `MONGODB_URI` | URI de MongoDB Atlas (`mongodb+srv://...`) |
| `GROQ_API_KEY` | API key obtenida en https://console.groq.com/keys |
| `STEAM_API_KEY` | API key obtenida en https://steamcommunity.com/dev/apikey |
| `CLIENT_URL` | URL pública del frontend en Vercel |
| `NODE_ENV` | `production` (ya en `render.yaml`) |
| `PORT` | `3001` (ya en `render.yaml`) |

4. Render hace deploy automático. El comando `npm start` ejecuta `npm run swagger && node src/index.js`, generando la documentación Swagger antes de arrancar el servidor.
5. Verificar el arranque: el log debe mostrar `MongoDB conectado` y `Server running on port 3001`.

### Despliegue del frontend en Vercel

1. Importar el repositorio `SteaMates/Frontend` en Vercel.
2. Vercel detecta Vite automáticamente. No hace falta tocar la configuración.
3. Editar `vercel.json` y asegurarse de que el `destination` del rewrite `/api/*` apunta a la URL real del backend de Render.
4. Hacer deploy. Vercel servirá la app desde el CDN global.

### Datos iniciales

La aplicación **no requiere carga de datos iniciales**. La base de datos se puebla orgánicamente cuando los usuarios inician sesión con Steam:

- El primer usuario que entre se guarda automáticamente en la colección `users`.
- Las sesiones, listas, notificaciones y demás recursos se crean a demanda.
- La colección `gamecaches` cachea metadatos de juegos consultados a Steam.

---

## 4. CORS

CORS está configurado en `Backend/src/index.js` con una lista blanca de orígenes permitidos:

```js
const allowedOrigins = [
  process.env.CLIENT_URL,        // Vercel en producción
  "http://localhost:5173",       // Vite dev server
  "http://localhost:4173",       // Vite preview
].filter(Boolean);
```

Se usa `credentials: true` para que las cookies de sesión Passport-Steam viajen entre dominios. Adicionalmente, el `vercel.json` del frontend define un rewrite `/api/*` que actúa como proxy hacia el backend, eliminando completamente los problemas de cookies cross-origin al hacer que el navegador vea ambas como mismo origen.

**Verificación:** abriendo la consola del navegador en la app desplegada no aparecen errores de CORS, y la sesión de Steam persiste correctamente.

---

## 5. Limitaciones y costes documentados

### MongoDB Atlas (Free Tier M0)
- **Almacenamiento:** máximo 512 MB de datos
- **RAM compartida:** rendimiento variable
- **Conexiones simultáneas:** máximo 500
- **Mitigación implementada:** uso de `connect-mongo` para reutilizar conexiones en la sesión Express, y caché agresivo de respuestas Steam mediante el modelo `GameCache`.

### Render (Free Tier)
- **Cold starts:** el servicio se "duerme" tras 15 minutos sin tráfico. La primera petición después de inactividad puede tardar **30-50 segundos** en responder mientras se reinicia el contenedor.
- **Mitigación:** el frontend muestra estados de carga claros. En producción real se recomienda upgrade a plan Starter ($7/mes) que elimina los cold starts.
- **Memoria:** 512 MB RAM
- **Build minutes:** 500/mes
- **Bandwidth:** 100 GB/mes

### Steam Web API
- **Rate limit:** 100.000 peticiones/día por API key
- **Perfiles privados:** algunos endpoints (`GetOwnedGames`, `GetFriendList`) devuelven datos vacíos si el perfil de Steam del usuario es privado. La aplicación lo gestiona mostrando avisos al usuario.
- **Caché:** las respuestas se almacenan en MongoDB durante 1 hora para reducir llamadas.

### Groq API
- **Rate limit gratuito:** ~30 peticiones/minuto en el modelo `llama-3.3-70b-versatile`
- **Mitigación:** el asistente AI muestra error claro cuando se supera el límite y sugiere reintentar en unos segundos.

### Vercel (Hobby Tier)
- **Bandwidth:** 100 GB/mes
- **Build minutes:** 6000/mes
- **No tiene cold starts** (el frontend es 100% estático servido desde CDN).

---

## 6. Credenciales para el evaluador

> **Importante:** SteaMates utiliza **Steam OpenID** como único método de autenticación. No existen contraseñas propias gestionadas por la aplicación — cada usuario inicia sesión con su cuenta de Steam.

### Usuario administrador
| Campo | Valor |
|---|---|
| **Usuario Steam** | `artigass21` |
| **Contraseña** | `STW2026-test` |
| **SteamID64** | `76561199404514346` |
| **Perfil Steam** | `https://steamcommunity.com/profiles/76561199404514346` |
| **Acceso al Admin Panel** | Sí — visible en la barra lateral al iniciar sesión |
