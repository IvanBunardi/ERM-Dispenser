import { buildApp } from "./app.js";

const { app, config } = await buildApp();

app.setErrorHandler((error: unknown, _request, reply) => {
  reply.code(500).send({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
    },
  });
});

await app.listen({
  port: config.BACKEND_PORT,
  host: "0.0.0.0",
});
// trigger restart
// trigger midtrans restart
// trigger midtrans sandbox restart
