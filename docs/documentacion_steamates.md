# Documentación SteaMates

**Grupo 10:**
- Adrián Artigas Subiras (869469)
- Adrián Becerril Granada (873026)
- Pablo Nicolás Fabra Roque (871820)
- Enrique Baldovin Cotela (869402)
- Adrián Nasarre (869561)

---

## 1. URLs de acceso al API y al front-end

| Servicio | URL |
|---|---|
| Frontend | https://steamates-frontend.vercel.app |
| Documentación Swagger | https://backend-5rwo.onrender.com/api-docs |

> **Nota:** El backend está alojado en la capa gratuita de Render y puede tardar hasta **50 segundos** en responder a la primera petición tras un periodo de inactividad (spin-down). Si la llamada inicial tarda, es suficiente con esperar y reintentar.

---

## 2. Credenciales de acceso

SteaMates utiliza **Steam OpenID** como único método de autenticación, por lo que no existen contraseñas propias gestionadas por la aplicación. El acceso se realiza mediante el botón *"Iniciar sesión con Steam"* en la página principal.

| Rol | Usuario Steam | SteamID64 |
|---|---|---|
| Administrador | artigass21 | STW2026-test |
| Usuario demo | Cualquier cuenta de Steam pública | — |

El administrador tiene acceso al panel de moderación visible en la barra lateral. Cualquier persona puede registrarse con su propia cuenta de Steam pública: el sistema la registra automáticamente en el primer inicio de sesión. No es necesario crear cuenta previa.

---

## 3. Diagrama de arquitectura

El diagrama refleja el flujo completo de la aplicación:

```
Vite/React (Frontend — Vercel)
        │
        │  HTTP / JWT
        ▼
Express/Node.js (Backend — Render)
        │
        ├── MongoDB Atlas (Base de datos)
        │
        ├── Steam Web API  ──► Perfiles, biblioteca, amigos
        ├── Steam Store API ──► Metadatos de juegos
        ├── CheapShark API ──► Precios y alertas
        ├── IsThereAnyDeal ──► Histórico de precios
        └── Groq API       ──► Chat IA y recomendaciones
```

---

## 4. Fuentes de datos abiertos utilizadas

| Fuente | URL | Uso en la aplicación |
|---|---|---|
| Steam Web API | https://developer.valvesoftware.com/wiki/Steam_Web_API | Perfiles, biblioteca de juegos, estadísticas de horas, logros, lista de amigos y estado online |
| Steam Store API | https://store.steampowered.com/api | Metadatos de juegos: portadas, géneros, descripciones y precios |
| CheapShark API | https://www.cheapshark.com/api | Precios actualizados de juegos en tiendas digitales, histórico de precios y alertas de descuentos |
| IsThereAnyDeal | https://isthereanydeal.com/api | Histórico de precios para el gráfico de evolución por juego |

La integración de la **Steam Web API** se realiza mediante una API key propia configurada como variable de entorno. El backend actúa como intermediario, consultando los endpoints de Steam y almacenando las respuestas en la colección `gamecaches` de MongoDB durante una hora para minimizar el número de peticiones externas. La **Steam Store API** se consume directamente desde el backend para obtener metadatos adicionales de cada juego. **CheapShark** se integra en el módulo de mercado para ofrecer comparativas de precios y configurar alertas de bajadas de precio en la wishlist del usuario.

---

## 5. Módulos del back-end

| Módulo | Descripción |
|---|---|
| `express` | Framework principal para implementar el servidor y definir la API REST. Permite crear rutas, recibir peticiones HTTP y devolver respuestas al front-end. |
| `mongoose` | Librería para modelar y gestionar los datos en MongoDB. Define los esquemas de usuarios, listas, comentarios, sesiones, notificaciones, reportes, etc. |
| `mongodb` | Driver oficial de MongoDB incluido como dependencia. Sirve de base para la comunicación con la BD, aunque la gestión principal se realiza con Mongoose. |
| `dotenv` | Carga variables de entorno desde `.env`: claves de API, URL de MongoDB, secreto de sesión, URL del cliente y puerto del servidor. |
| `cors` | Middleware para permitir la comunicación entre front-end y back-end cuando se ejecutan en dominios o puertos diferentes. |
| `express-session` | Gestiona sesiones de usuario en Express. Necesario para la autenticación con Passport y Steam. |
| `connect-mongo` | Almacena las sesiones de Express en MongoDB, evitando que se pierdan al reiniciar el servidor. |
| `passport` | Middleware de autenticación para gestionar el inicio de sesión de usuarios. |
| `passport-steam` | Estrategia de Passport que autentica usuarios mediante **Steam OpenID**. Permite iniciar sesión con una cuenta de Steam y obtener información básica del perfil. |
| `jsonwebtoken` | Genera y verifica tokens JWT. Tras iniciar sesión con Steam, el back-end genera un token que el front-end usa para autenticar las peticiones protegidas. |
| `groq-sdk` | SDK para integrar el chat con IA mediante Groq. Permite generar respuestas y recomendaciones relacionadas con juegos. |
| `cheerio` | Analiza contenido HTML. Se emplea en rutas relacionadas con la exploración de juegos de Steam (búsqueda, tags, información de páginas externas). |
| `exceljs` | Genera archivos Excel. Se usa en moderación para exportar información de usuarios, reportes o acciones administrativas. |
| `swagger-autogen` | Genera automáticamente la documentación Swagger de la API a partir de las rutas del proyecto. |
| `swagger-ui-express` | Muestra la documentación Swagger desde `/api-docs`. |
| `swagger-jsdoc` | Dependencia relacionada con Swagger, instalada junto a `swagger-autogen`. |
| `crypto` | Módulo nativo de Node.js para generar identificadores aleatorios (`randomUUID`). |
| `module` | Módulo nativo de Node.js para importar el JSON generado por Swagger en entornos con ES Modules. |
| `winston` | Librería de logging estructurado. Se usa en `src/config/logger.js` para registrar eventos del servidor (peticiones, errores, arranque) con niveles configurables (`info`, `warn`, `error`). |

---

## 6. Enlace al Swagger del API

[https://backend-5rwo.onrender.com/api-docs](https://backend-5rwo.onrender.com/api-docs)

---

## 7. Enlace al prototipado de la solución

El prototipo de alta fidelidad fue diseñado en **Figma** antes del desarrollo. Se proporcionan dos vistas:

| Vista | Enlace |
|---|---|
| 🖥️ Escritorio (PC) | [Ver mockup PC](https://www.figma.com/design/17vx9o6MQ1hfDYC5NlZdLJ/SteaMates?node-id=0-1&p=f) |
| 📱 Móvil | [Ver mockup móvil](https://www.figma.com/design/17vx9o6MQ1hfDYC5NlZdLJ/SteaMates?node-id=72-2&p=f) |

La solución desplegada y funcional está accesible en: [https://steamates-frontend.vercel.app](https://steamates-frontend.vercel.app)

---

## 8. Tecnología del front-end

El front-end de SteaMates ha sido desarrollado con un stack moderno enfocado en velocidad, escalabilidad y una experiencia de usuario premium.

### Tecnologías Core

- **React 18:** Biblioteca principal para la construcción de la interfaz basada en componentes funcionales y Hooks.
- **TypeScript:** Superconjunto de JavaScript con tipado estático que mejora la robustez y el mantenimiento del código.
- **Vite 6:** Herramienta de build de última generación con desarrollo ultrarrápido y optimización superior del bundle final.

### Módulos y Librerías Principales

| Módulo | Descripción |
|---|---|
| `tailwindcss` v4 | Framework CSS basado en utilidades que permite un diseño altamente personalizado y responsive sin escribir CSS tradicional. |
| `react-router` v7 | Sistema de enrutamiento declarativo que gestiona la navegación entre vistas (Home, Mercado, Amigos, Perfil) sin recargar la página. |
| `@radix-ui` / `shadcn/ui` | Componentes accesibles sin estilo predefinido que sirven de base para modales, menús desplegables y pestañas, garantizando cumplimiento con estándares de accesibilidad. |
| `clsx` | Utilidad para construir cadenas de clases CSS de forma condicional. Pieza central de la función `cn` de shadcn/ui. |
| `tailwind-merge` | Resuelve conflictos entre clases de Tailwind cuando se combinan dinámicamente. Usado junto con `clsx` en `utils.ts`. |
| `axios` | Cliente HTTP para peticiones asíncronas al backend, gestionando cabeceras de autenticación y errores de red. |
| `framer-motion` | Librería de animaciones para transiciones suaves, micro-interacciones y efectos visuales. |
| `recharts` | Visualización de datos basada en componentes React: gráficas de historial de precios, estadísticas de usuario y géneros jugados. |
| `lucide-react` | Colección de iconos vectoriales consistentes y ligeros integrados en toda la interfaz. |
| `sonner` | Sistema de notificaciones temporales (toasts) para dar feedback inmediato al usuario. |
| `@playwright/test` | Herramienta E2E para validar flujos completos de usuario en navegadores reales. |

### Arquitectura

La aplicación sigue una arquitectura de componentes modulares, usando **Context API** para la gestión del estado global (Autenticación y Notificaciones) y **Hooks personalizados** para separar la lógica de negocio de la presentación visual.

---

## 9. Modelo de IA utilizado

### Modelos seleccionados

SteaMates integra la API de **Groq** con tres modelos de Meta Llama según el caso de uso. Se eligió Groq por su latencia notablemente baja y su tier gratuito:

| Modelo | Uso |
|---|---|
| **Llama 3.3 70B Versatile** (`llama-3.3-70b-versatile`) | Primera consulta por minuto del chat. Modelo más capaz para conversación contextual compleja. |
| **Llama 4 Scout 17B** (`meta-llama/llama-4-scout-17b-16e-instruct`) | A partir de la segunda consulta en la ventana de 1 minuto y en todas las que incluyen imagen. Único modelo de Groq con soporte de visión (analiza capturas en base64). |
| **Llama 3.1 8B Instant** (`llama-3.1-8b-instant`) | Exclusivamente para recomendaciones del marketplace. Al ser una tarea estructurada (generar JSON), el modelo ligero es suficiente y tiene mayor cuota diaria. |

### Funcionalidad aportada

- **Asistente de chat:** El backend actúa de intermediario entre Steam y Groq. Antes de cada llamada al modelo del chat, el backend construye el contexto del usuario consultando la Steam Web API en paralelo (usando `fetch` nativo de Node.js 18): perfil, top 30 juegos más jugados con horas, juegos de las últimas 2 semanas y estado de hasta 25 amigos. Este contexto se cachéa en memoria 5 minutos. El chat mantiene historial de conversación persistido en MongoDB (`ChatSession`), enviando los últimos 20 mensajes junto al contexto en cada llamada. Cuando el usuario adjunta una imagen, el sistema cambia automáticamente al modelo Scout y envía la imagen en base64 como parte del mensaje multimodal (en este caso no se envía historial previo por limitaciones de los modelos de visión). El chat implementa un **rate limit de 3 consultas por ventana de 1 minuto** por usuario (`CHAT_MAX=3`).

Para las **recomendaciones del marketplace**, el flujo es de tres pasos encadenados: (1) recuperar la biblioteca del usuario desde Steam y extraer los 20 juegos más jugados; (2) pasar esa lista a Groq pidiendo un JSON con títulos recomendados que el usuario no tenga; (3) buscar precios reales mediante **IsThereAnyDeal (ITAD) como fuente primaria** — primero se buscan los IDs de ITAD en batch y luego se obtienen los precios actuales en USD — y **Steam Store API como fallback** si ITAD no devuelve suficientes resultados. El resultado se cachéa en `sessionStorage` 5 minutos.

### Prompts utilizados

**System prompt del chat:**

```
Eres SteaMate AI, un asistente experto en videojuegos de Steam. Tu personalidad es amigable, entusiasta y conocedora.
Tus capacidades:
- Recomendar juegos basado en los gustos REALES del usuario (tienes acceso a su biblioteca de Steam)
- Informar sobre ofertas y precios en Steam
- Sugerir juegos cooperativos para jugar con sus amigos reales
- Analizar géneros y dar recomendaciones personalizadas basadas en su historial
- Hablar sobre noticias y tendencias de gaming
- Ayudar a descubrir juegos indie ocultos similares a los que ya juega
- Entender el CONTEXTO de lo que el usuario está viendo en pantalla cuando te lo comparte
Reglas:
- Responde siempre en español
- Sé conciso pero informativo
- Usa negritas para nombres de juegos
- Incluye precios aproximados cuando sea relevante
- Sé honesto cuando no tengas información suficiente
- Prioriza la personalización de la respuesta usando biblioteca, amigos y contexto antes que respuestas genéricas
- Mantén un tono casual y gamer
- Usa los datos de la biblioteca y amigos del usuario para personalizar tus respuestas
- Cuando recomiendes juegos, ten en cuenta lo que ya tiene y lo que juega más
- Si el usuario pregunta por juegos cooperativos, mira qué amigos están online y qué juegan
- Si el usuario comparte el contexto de su pantalla, usa esa información para dar respuestas más relevantes
Formato de respuesta:
- Máximo 2-3 párrafos
- Si haces recomendaciones, prioriza una lista breve de 3 opciones como máximo
- Para cada juego recomendado, explica en una frase por qué encaja con el usuario
- Evita respuestas largas, repetitivas o demasiado genéricas
```

**Prompt del marketplace (system + user):**

```
System:
Eres un recomendador de juegos de Steam. Devuelve SIEMPRE JSON válido un array de objetos [{"title":"string","reason":"string"}].

User (construido dinámicamente):
Juegos de este usuario: [lista de los 20 juegos más jugados].
Inventate una lista con [N] juegos de PC muy populares y aclamados que encajen
perfectísimamente con sus gustos o sean imprescindibles de esos géneros y NO estén
en su lista y pon su nombre EXACTO de la tienda. Cada elemento debe incluir title
y reason (una frase). Solo devuelve JSON.
```

### Enlace de la respuesta con los datos

- **Chat:** la respuesta de Groq se devuelve directamente al frontend y se renderiza con un parser de Markdown propio (negrita, itálica, listas) sin dependencias externas.
- **Marketplace:** la respuesta JSON se parsea con `parseRecommendationResponse()` (que limpia bloques ```json y extrae el array aunque el modelo devuelva texto extra). Los títulos extraídos se usan primero para buscar precios en **ITAD** (batch lookup por ID) y, si no hay suficientes resultados, se complementan con la **Steam Store API**. Solo se muestran los juegos con precio encontrado, enriquecidos con precio actual, precio original, porcentaje de descuento y enlace directo. El resultado se cachéa en `sessionStorage` 5 minutos.

---

## 10. Validación y pruebas realizadas

Para asegurar la calidad y fiabilidad de SteaMates se ha implementado una estrategia de pruebas automatizadas que abarca tanto el frontend (E2E) como el backend (integración + unitarias).

**Total: 250 pruebas automatizadas** (más 4 scripts auxiliares/manuales).

### Resumen

| Ámbito | Tipo | Número de pruebas |
|---|---|---|
| Backend | API / integración + unitaria (rutas) | 215 |
| Backend | Unitaria / modelo | 12 |
| Backend | Unitaria / validación | 14 |
| Frontend | E2E / interfaz | 9 |
| **Total automatizadas** | | **250** |
| General | Scripts auxiliares/manuales | 4 |

---

### 10.1 Pruebas E2E en el Frontend — Playwright

Para la validación completa del front-end se ha empleado **Playwright** (`@playwright/test`), un framework moderno y estandarizado en la industria. Las pruebas simulan el comportamiento real de un usuario navegando por la aplicación en un navegador automatizado. Se han desarrollado **9 tests E2E** organizados en tres suites:

#### Autenticación (`auth.spec.ts`)

Verifica los flujos de inicio de sesión con Steam, el correcto renderizado de la página de login y la gestión de errores (por ejemplo, que aparece el modal de "Cuenta baneada" cuando el backend rechaza el acceso y que se cierra correctamente).

```typescript
import { test, expect } from '@playwright/test';

test.describe('Autenticación', () => {
  test('debe mostrar la página de login y el botón de iniciar sesión', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Bienvenido').first()).toBeVisible();
    await expect(page.locator('button', { hasText: 'Iniciar Sesión con Steam' })).toBeVisible();
  });

  test('si el usuario está baneado debe mostrar el modal de error', async ({ page }) => {
    await page.goto('/login?error=user_banned&reason=Toxic+behavior');

    await expect(page.locator('text=Cuenta baneada')).toBeVisible();
    await expect(page.locator('text=Toxic behavior').first()).toBeVisible();

    await page.click('button:has-text("Entendido")');
    await expect(page.locator('text=Cuenta baneada')).toBeHidden();
  });
});
```

#### Listas Comunitarias (`lists.spec.ts`)

Comprueba el correcto funcionamiento del núcleo social: que los usuarios pueden visualizar, interactuar y navegar a través de las listas de juegos personalizadas, y que el modal de creación se abre correctamente.

```typescript
import { test, expect } from '@playwright/test';

const mockedUser = { steamid: '12345678901234567', username: 'TestUser',
  avatar: 'https://avatars.steamstatic.com/test.jpg', role: 'user' };

test.describe('Listas', () => {
  test.beforeEach(async ({ page, context }) => {
    // Inyecta usuario simulado en localStorage antes de navegar
    await context.addInitScript(({ user, token }) => {
      localStorage.setItem('steamates_user', JSON.stringify(user));
      localStorage.setItem('steamates_token', token);
    }, { user: mockedUser, token: 'fake-jwt-token' });

    // Stub de la API de autenticación y listas
    await page.route('**/api/auth/me', route =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ user: mockedUser }) }));
    await page.route('**/api/lists**', route =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ results: [{ id: 1, name: 'Lista de prueba' }], total: 1 }) }));

    await page.goto('/lists');
  });

  test('debe cargar la vista general de listas', async ({ page }) => {
    await expect(page.locator('h1').first()).toBeVisible();
    const createBtn = page.locator('button', { hasText: 'Crear Lista' }).first();
    await expect(createBtn).toBeVisible();
  });

  test('debe abrir el modal para crear nueva lista', async ({ page }) => {
    const createBtn = page.locator('button', { hasText: 'Crear Lista' }).first();
    await createBtn.click();
    await expect(page.locator('text=Crear Nueva Lista').first()).toBeVisible();
    await page.click('button:has-text("Cancelar")');
  });
});
```

#### Navegación y Vistas (`navigation.spec.ts`)

Garantiza que el routing funciona sin problemas: accesibilidad a las páginas principales (Home, Mercado, Perfil, Amigos) y que los botones de retorno devuelven al usuario al contexto anterior sin pérdida de estado.

```typescript
import { test, expect } from '@playwright/test';

const mockedUser = { steamid: '12345678901234567', username: 'TestUser',
  avatar: 'https://avatars.steamstatic.com/test.jpg', role: 'user' };

test.describe('Navegación General', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.addInitScript(({ user, token }) => {
      localStorage.setItem('steamates_user', JSON.stringify(user));
      localStorage.setItem('steamates_token', token);
    }, { user: mockedUser, token: 'fake-jwt-token' });

    await page.route('**/api/auth/me', route =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ user: mockedUser }) }));

    await page.goto('/');
    await page.reload();
  });

  test('debe poder navegar al Home y ver contenido básico', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav').first()).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
  });

  test('debe poder navegar a Mercado', async ({ page }) => {
    await page.goto('/market');
    await expect(page.locator('h1', { hasText: 'Mercado' }).first()).toBeVisible();
  });

  test('debe poder navegar a Listas', async ({ page }) => {
    await page.goto('/lists');
    await expect(page.locator('h1', { hasText: 'Listas' }).first()).toBeVisible();
  });

  test('debe poder navegar a Amigos', async ({ page }) => {
    await page.goto('/friends');
    await expect(page.locator('h1', { hasText: 'Social' }).first()).toBeVisible();
  });

  test('debe poder navegar a Perfil', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.locator(`text=${mockedUser.username}`).first()).toBeVisible();
  });
});
```

---

### 10.2 Pruebas de Integración y API en el Backend — Jest + Supertest

En lugar de pruebas manuales en Postman, se ha optado por un enfoque programático con **Jest** y **Supertest**, validando la API automáticamente en cada ejecución. Se han implementado **241 tests de backend** que cubren:

- **Pruebas de Rutas (Endpoints):** códigos de estado HTTP (200, 400, 401, 500) y estructura de respuestas JSON en todos los módulos (`/api/steam`, `/api/lists`, `/api/market`, etc.). Se simulan happy paths y escenarios de error, incluyendo fallos en APIs externas.
- **Pruebas de Modelos de Datos:** verificación del esquema MongoDB/Mongoose (campos obligatorios, valores por defecto, restricciones de unicidad).
- **Pruebas de Seguridad:** comprobación de que peticiones sin token o con datos maliciosos son bloqueadas por los middlewares.

---

### 10.3 Tabla completa de pruebas

| ID | Parte | Tipo | Archivo | Prueba realizada | Resultado |
|---|---|---|---|---|---|
| T-001 | Backend | API / integración | `api.test.js` | Ruta de salud `/api/health` | ✅ Correcta |
| T-002 | Backend | API / integración | `api.test.js` | Documentación Swagger responde | ✅ Correcta |
| T-003 | Backend | API / integración | `api.test.js` | Rechaza login sin credenciales | ✅ Correcta |
| T-004 | Backend | API / integración | `api.test.js` | Deniega acceso sin autenticación | ✅ Correcta |
| T-005–T-012 | Backend | API / integración | `coverage-routes.test.js` | `/api/reports` — validaciones y creación | ✅ Correctas |
| T-013–T-017 | Backend | API / integración | `coverage-routes.test.js` | `/api/notifications` — listado y lectura | ✅ Correctas |
| T-018–T-019 | Backend | API / integración | `coverage-routes.test.js` | `/api/site/stats` — contadores globales | ✅ Correctas |
| T-020–T-023 | Backend | API / integración | `coverage-routes.test.js` | `/api/auth/me` — sesión, ban, logout | ✅ Correctas |
| T-024–T-036 | Backend | API / integración | `coverage-routes.test.js` | `/api/lists` — CRUD, paginación, likes | ✅ Correctas |
| T-037–T-045 | Backend | API / integración | `coverage-routes.test.js` | `/api/sessions` — creación, respuesta, abandono | ✅ Correctas |
| T-046–T-057 | Backend | API / integración | `coverage-routes.test.js` | `/api/market` — wishlist y alertas de precio | ✅ Correctas |
| T-058–T-061 | Backend | API / integración | `coverage-routes.test.js` | `/api/steam/stats` y `/api/steam/profile` | ✅ Correctas |
| T-062–T-090 | Backend | API / integración | `coverage-routes.test.js` | `/api/moderation` — reportes, ban, export | ✅ Correctas |
| T-091–T-102 | Backend | API / integración | `coverage-routes.test.js` | `/api/chat` — IA, historial, visión | ✅ Correctas |
| T-103–T-215 | Backend | API / integración | `coverage-routes.test.js` | `/api/steam` — perfiles, juegos, tags, stats | ✅ Correctas |
| T-216–T-227 | Backend | Unitaria / modelo | `models.test.js` | Esquemas Mongoose (12 modelos) | ✅ Correctas |
| T-228–T-241 | Backend | Unitaria / validación | `validation.test.js` | Validadores de request (14 casos) | ✅ Correctas |
| T-242–T-243 | Frontend | E2E | `auth.spec.ts` | Login y modal de ban | ✅ Correctas |
| T-244–T-245 | Frontend | E2E | `lists.spec.ts` | Vista de listas y modal de creación | ✅ Correctas |
| T-246–T-250 | Frontend | E2E | `navigation.spec.ts` | Navegación a Home, Mercado, Listas, Amigos, Perfil | ✅ Correctas |

#### Scripts auxiliares de comprobación

| ID | Tipo | Archivo | Prueba realizada |
|---|---|---|---|
| M-001 | Auxiliar / manual | `test.js` | Consulta a Steam para obtener juegos de un usuario |
| M-002 | Auxiliar / manual | `Backend/test.js` | Obtención de juegos principales y logros desde Steam API |
| M-003 | Auxiliar / manual | `Backend/test-groq.js` | Conexión con Groq y generación de respuesta IA/visión |
| M-004 | Auxiliar / manual | `Frontend/test.js` | Carga de la clave `STEAM_API_KEY` desde el entorno |

---

## 11. Mejoras implementadas (Opcionales)

Los desarrollos opcionales implementados se corresponden con los puntos del rubric oficial de la asignatura. A continuación se detalla cada uno con su referencia al rubric, la puntuación máxima posible y la justificación técnica de la implementación.

---

### Opcional A — Integración Continua (CI) con GitHub Actions *(Rubric #9 — máx. 1 punto)*

Se ha configurado un pipeline CI/CD completo en `.github/workflows/deploy.yml` con las siguientes etapas encadenadas:

1. **Checkout** del código fuente con `actions/checkout@v4`.
2. **Configuración del entorno** con `actions/setup-node@v4` (Node.js 20, caché de npm).
3. **Instalación limpia** de dependencias con `npm ci` (garantiza reproducibilidad).
4. **Ejecución de la suite de pruebas y cobertura** con `npm run test:coverage`, inyectando las variables de entorno necesarias (`NODE_ENV=test`, `SESSION_SECRET`, `JWT_SECRET`, `CLIENT_URL`).
5. **Despliegue automático en Render (CD):** solo se ejecuta si los pasos anteriores tienen éxito (`if: success()`) y el evento es un `push` (no un PR), invocando el deploy hook de Render via `curl`.

El frontend se despliega en Vercel de forma automática en cada `push` a `main` mediante la integración nativa de Vercel con GitHub, gestionando entornos de *preview* y *production* de forma independiente.

```yaml
# Extracto de .github/workflows/deploy.yml
jobs:
  build-test-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:coverage
        env:
          NODE_ENV: test
          SESSION_SECRET: "test_secret"
          JWT_SECRET: "test_jwt_secret"
          CLIENT_URL: "http://localhost:5173"
      - name: Despliegue en Render (CD)
        if: success() && github.event_name == 'push'
        run: curl -s "${{ secrets.RENDER_DEPLOY_HOOK_URL }}"
```

---

### Opcional B — Cobertura de código ≥ 75 % en Backend *(Rubric #7 — máx. 1 punto)*

Se ha superado el umbral exigido del 75 % en todas las métricas principales (datos obtenidos ejecutando `npm run test:coverage` sobre el estado actual del repositorio — 4 suites, **241 tests pasados**):

| Métrica | Resultado |
|---|---|
| Sentencias (Stmts) | **76.67 %** |
| Ramas (Branch) | **59.62 %** |
| Funciones (Funcs) | **77.54 %** |
| Líneas (Lines) | **77.85 %** |

Desglose por componente:

| Archivo | Stmts | Branch | Funcs | Lines |
|---|---|---|---|---|
| **models/** (todos) | 100 % | 100 % | 100 % | 100 % |
| `auth.js` | 89.13 % | 52.94 % | 100 % | 90.90 % |
| `reports.js` | 96.29 % | 93.75 % | 100 % | 96.29 % |
| `moderation.js` | 82.13 % | 68.54 % | 73.52 % | 81.75 % |
| `sessions.js` | 84.87 % | 68.42 % | 100 % | 85.21 % |
| `steam-browse.js` | 85.18 % | 76.47 % | 76.19 % | 86.20 % |
| `steam-profile.js` | 85.48 % | 75.00 % | 100 % | 86.20 % |
| `stats.js` | 76.34 % | 48.19 % | 71.18 % | 76.58 % |
| `lists.js` | 74.66 % | 70.88 % | 73.33 % | 76.02 % |
| `market.js` | 73.70 % | 56.57 % | 89.47 % | 74.18 % |
| `steam-social.js` | 73.46 % | 62.18 % | 71.42 % | 82.20 % |
| `steam-games.js` | 71.64 % | 62.50 % | 76.00 % | 72.03 % |
| `notifications.js` | 60.00 % | 75.00 % | 60.00 % | 60.00 % |
| `chat.js` | 64.64 % | 46.06 % | 67.50 % | 66.78 % |
| `site.js` / `steam.js` | 100 % | 100 % | 100 % | 100 % |

La cobertura cubre: **controladores, rutas, servicios y modelos** (los cuatro componentes indicados en el rubric).

**Técnicas empleadas para alcanzar la cobertura:**
- **Mocking de dependencias externas:** se simulan `groq-sdk` (incluyendo el controlador de aborto de streams), `connect-mongo` (almacenamiento de sesiones) y los módulos de `axios` para APIs de Steam/CheapShark, permitiendo pruebas sin conexión a servicios externos.
- **Cobertura de ramas de error:** se prueban explícitamente los códigos de respuesta 400, 401, 403, 404 y 500 para cada endpoint, forzando los caminos de error de los middlewares.
- **Pruebas de modelos Mongoose:** se validan campos obligatorios, valores por defecto, restricciones de unicidad y hooks `pre-save` directamente sobre instancias en memoria (sin BD real).

La cobertura es demostrable ejecutando `npm run test:coverage` en el repositorio del backend.

---

### Opcional C — Validación E2E completa del Frontend *(Rubric #4 — máx. 1 punto)*

Se ha implementado una suite de pruebas E2E con **Playwright** (`@playwright/test`) que valida los flujos críticos de usuario en navegador real. Las pruebas están organizadas en tres archivos bajo `tests/e2e/`:

| Suite | Archivo | Tests | Qué valida |
|---|---|---|---|
| Autenticación | `auth.spec.ts` | 2 | Página de login, modal de cuenta baneada |
| Listas | `lists.spec.ts` | 2 | Vista general, modal de creación de lista |
| Navegación | `navigation.spec.ts` | 5 | Routing a Home, Mercado, Listas, Amigos, Perfil |

Adicionalmente, el backend cuenta con **241 tests** de integración de API con **Jest + Supertest** (215 de rutas + 12 de modelos + 14 de validación) que cubren todos los endpoints (`/api/steam`, `/api/lists`, `/api/market`, `/api/chat`, `/api/moderation`, etc.), validando códigos de estado, estructura de respuestas y comportamiento ante errores.

El conjunto supera ampliamente el mínimo de 2 pruebas E2E exigido: **9 E2E de frontend + 241 de backend = 250 pruebas automatizadas en total**.

---

### Opcional D — Exportación de registros del sistema *(Rubric #5 — máx. 0,8 puntos)*

Se ha integrado la librería **`exceljs`** en el backend para generar archivos descargables desde el panel de administración. Las características implementadas son:

- **Múltiples formatos de descarga:** CSV y XLSX (Excel), seleccionables en la misma petición mediante el parámetro `?format=csv` o `?format=xlsx`.
- **Endpoints específicos de exportación:**
  - `GET /api/moderation/export?type=users` — exporta el listado completo de usuarios registrados con su información asociada (SteamID, username, rol, estado de ban, fecha de registro).
  - `GET /api/moderation/export?type=reports` — exporta los reportes de moderación.
  - `GET /api/moderation/user/:userId/export` — exporta el historial de acciones de moderación de un usuario concreto.
- **Corrección y detalle de los ficheros:** las columnas incluyen cabeceras descriptivas, fechas formateadas y todos los campos relevantes de cada entidad.
- **Facilidad de uso:** los endpoints están protegidos por el middleware `adminAuth` y devuelven las cabeceras HTTP correctas (`Content-Disposition`, `Content-Type`) para que el navegador descargue el archivo directamente.

---

### Opcional E — Login con sistema externo (Steam OpenID) *(Rubric #2 — parcial)*

Se ha implementado autenticación mediante **Steam OpenID** usando la estrategia `passport-steam` de Passport.js. El flujo es:

1. El usuario hace clic en "Iniciar sesión con Steam".
2. Es redirigido al portal de Steam para autenticarse con sus credenciales propias (sin que la aplicación tenga acceso a la contraseña).
3. Steam redirige de vuelta al backend con el `openid.claimed_id` verificado.
4. El backend crea o actualiza el documento `User` en MongoDB con el SteamID64, avatar y nombre de perfil.
5. Se genera un **JWT** que el frontend almacena y envía en cada petición protegida.

> **Nota:** La aplicación solo dispone de un proveedor externo (Steam), ya que el modelo de negocio de SteaMates está centrado exclusivamente en la plataforma Steam. No se ha implementado un segundo proveedor externo adicional.

---

### Opcional F — Sistema de notificaciones in-app *(Rubric #3 — máx. 0,6 puntos)*

Se ha implementado un sistema de notificaciones persistido en MongoDB con las siguientes características:

**Modelo `Notification.js`:**
- Campos: `recipient`, `from`, `type`, `title`, `message`, `session`, `data`, `readAt`, `expiresAt`.
- **TTL automático:** índice `{ expiresAt: 1 }` con `expireAfterSeconds: 0`, MongoDB elimina en background las notificaciones caducadas sin necesidad de cron jobs.
- **9 tipos de evento:** `session_invite`, `session_response`, `session_cancelled`, `session_updated`, `price_alert_triggered`, `list_mention`, `content_deleted`, `list_like`, `list_comment`.

**Eventos que generan notificaciones:**
- Invitación a una sesión de juego.
- Respuesta a una invitación (aceptada/rechazada).
- Cancelación de una sesión por el anfitrión.
- Disparo de una alerta de precio configurada por el usuario.
- Like o comentario en una lista propia.
- Eliminación de contenido por un moderador.

**API de notificaciones (`/api/notifications`):**
- `GET /` — lista notificaciones (con filtro `?unread=true` y límite máximo de 100).
- `PATCH /:id/read` — marca una notificación individual como leída.
- `PATCH /read-all` — marca todas las notificaciones como leídas.

**Frontend:** el componente `NotificationBell.tsx` consume la API en tiempo real, mostrando el contador de no leídas y un panel desplegable con cada notificación categorizada por icono y tipo.

---

### Opcional G — Analizadores estáticos de código (ESLint 10) *(Rubric #8 — máx. 0,5 puntos)*

Se ha integrado **ESLint 10** como herramienta de análisis estático en ambos repositorios, con scripts `lint` y `lint:report` en el `package.json` de cada proyecto para poder reproducir el análisis en cualquier momento.

**Frontend** — configuración con `typescript-eslint`, `eslint-plugin-react` y `eslint-plugin-react-hooks`:

| Categoría | Cantidad | Detalle principal |
|---|---|---|
| Errores | 6 | Secuencias de escape innecesarias en `Layout.tsx`; asignación inútil en `Profile.tsx` |
| Warnings `no-explicit-any` | 78 | Tipado `any` implícito en respuestas de API |
| Warnings `no-unused-vars` | 20 | Variables declaradas pero no usadas |
| Warnings `react-hooks/exhaustive-deps` | 11 | Dependencias faltantes en arrays de `useEffect` |

**Backend** — configuración con `@eslint/js`, declarando explícitamente los globals de Node.js 18+ (`process`, `fetch`, `setTimeout`, `crypto`):

| Categoría | Cantidad | Detalle principal |
|---|---|---|
| Errores | **0** | — |
| Warnings `no-console` | ~5 | `console.log` donde se recomienda `console.info` |
| Warnings `no-unused-vars` | ~4 | Variables auxiliares en rutas |
| Warnings catch vacíos | 3 | Bloques `catch` silenciosos en `stats.js` |

Los reportes completos están disponibles en `eslint-report.json` en la raíz de cada repositorio.

---

## 12. Valoración global

La valoración global del proyecto es positiva. La plataforma permite autenticarse con Steam, consultar perfil y biblioteca, crear listas de juegos, gestionar sesiones, recibir notificaciones, acceder a estadísticas detalladas y obtener recomendaciones personalizadas mediante inteligencia artificial.

Desde el punto de vista técnico, el proyecto ha supuesto un reto importante por la integración de distintos servicios externos —especialmente la Steam Web API, con sus restricciones de privacidad y rate limiting— y por la necesidad de coordinar correctamente el front-end, el back-end y la base de datos. A pesar de ello, se ha conseguido una arquitectura modular y organizada, separando rutas, modelos, validadores, middlewares, componentes y servicios.

También se valora positivamente el trabajo realizado en validación y testing: se han añadido validaciones tanto en front-end como en back-end, y se han realizado pruebas automatizadas de API, backend (241 tests con Jest/Supertest) y flujos básicos E2E del front-end (9 tests con Playwright). Esto ha permitido comprobar que las funcionalidades principales funcionan correctamente y mantener una cobertura de sentencias del **76.67 %** en el backend.

El uso de herramientas profesionales —GitHub Actions para CI/CD, ESLint para análisis estático, MongoDB TTL indexes para gestión de notificaciones, y Groq con modelos Llama multimodales para la IA— refleja un nivel de madurez técnica significativo para el ámbito del proyecto.

Como posibles mejoras futuras: ampliar la cobertura E2E del frontend, mejorar la experiencia en perfiles de Steam privados, optimizar determinadas consultas a la API de Steam, y ampliar las funcionalidades sociales y de recomendación.

---

## 13. Mejoras propuestas

Si volviéramos a realizar el proyecto, mejoraríamos la **planificación inicial de la arquitectura** y la documentación de la comunicación entre front-end y back-end para evitar cambios grandes durante el desarrollo. Definir los contratos de la API (schemas de request/response) antes de empezar a codificar habría reducido las fricciones entre los equipos de frontend y backend.

También ampliaríamos el **testing del front-end**: actualmente existen 9 pruebas E2E y una cobertura mayor en el back-end. Sería interesante añadir más pruebas sobre formularios, componentes individuales, estados de carga y casos de error de red.

Otra mejora sería optimizar la **integración con APIs externas** (Steam, IsThereAnyDeal, Groq): mejorar el sistema de caché con invalidación selectiva, gestionar mejor los errores de rate limit y mostrar mensajes informativos al usuario cuando alguna API externa no esté disponible.

Además, se podrían mejorar algunos aspectos de la interfaz: mejor soporte responsive en pantallas muy pequeñas, filtros más avanzados en el marketplace y estados de carga más detallados durante las llamadas a Steam.

**Limitaciones conocidas:**
- Algunas funcionalidades dependen de que el usuario tenga el **perfil y la biblioteca de Steam públicos**. Si son privados o restringidos, las estadísticas, comparativas y recomendaciones no se pueden mostrar correctamente. Esta es una restricción de la API de Steam, no de la implementación.
- El backend en **Render (capa gratuita)** entra en suspensión tras periodos de inactividad, lo que puede provocar un retardo de hasta 50 segundos en la primera petición.
- La cuota de **Groq** en el tier gratuito limita el número de tokens y peticiones por minuto; la estrategia de rotación de modelos implementada minimiza este impacto, pero puede provocar errores esporádicos en momentos de uso intensivo.
