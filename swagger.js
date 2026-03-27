import swaggerAutogen from "swagger-autogen";

const doc = {
  info: {
    title: "SteaMates API",
    description: "Auto-generated API Documentation",
  },
  // Omitimos host y schemes para que Swagger UI los coja dinámicamente según donde esté desplegado (localhost o producción)
  securityDefinitions: {
    bearerAuth: {
      type: "apiKey",
      name: "Authorization",
      in: "header",
      description: 'Format: "Bearer <token>"',
    },
  },
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
