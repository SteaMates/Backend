import swaggerAutogen from "swagger-autogen";

const doc = {
  info: {
    title: "SteaMates API",
    description:
      "API REST de SteaMates — plataforma social para jugadores de Steam. Permite consultar perfiles, bibliotecas, estadísticas, precios de juegos, listas de la comunidad, sesiones de juego y moderación.",
    version: "1.0.0",
  },
  host: "backend-5rwo.onrender.com",
  schemes: ["https"],
  securityDefinitions: {
    bearerAuth: {
      type: "apiKey",
      name: "Authorization",
      in: "header",
      description: 'JWT obtenido al iniciar sesión con Steam. Formato: "Bearer <token>"',
    },
  },
  tags: [
    { name: "Auth",            description: "Autenticación mediante Steam OpenID y gestión de sesión" },
    { name: "Steam - Profile", description: "steam-profile.js — Perfil público, fondo de perfil y perfil del usuario autenticado" },
    { name: "Steam - Games",   description: "steam-games.js — Biblioteca de juegos, juegos recientes, juegos en común e info de juegos" },
    { name: "Steam - Browse",  description: "steam-browse.js — Búsqueda, juegos gratuitos, filtrado por tags, más jugados, detalles de apps y jugadores activos" },
    { name: "Steam - Social",  description: "steam-social.js — Lista de amigos e historial de precios (IsThereAnyDeal)" },
    { name: "Stats",           description: "Estadísticas de juego: géneros, logros y tiempo" },
    { name: "Market",          description: "Wishlist y alertas de precio (CheapShark + Steam Store)" },
    { name: "Lists",           description: "Listas de juegos de la comunidad" },
    { name: "Sessions",        description: "Sesiones de juego entre amigos" },
    { name: "Notifications",   description: "Notificaciones de usuario" },
    { name: "Reports",         description: "Reportes de contenido" },
    { name: "Moderation",      description: "Panel de moderación y administración (solo admins)" },
    { name: "Chat",            description: "Chat con IA para recomendaciones (Groq)" },
    { name: "Site",            description: "Estadísticas globales de la plataforma" },
  ],
};

const outputFile = "./swagger-output.json";
const routes = ["./src/index.js"];

swaggerAutogen()(outputFile, routes, doc)
  .then(() => {
    console.log("Swagger documentation generated successfully!");
  })
  .catch((e) => {
    console.error("Error:", e);
  });
