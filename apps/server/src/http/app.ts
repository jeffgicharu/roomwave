import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";

import { authRoutes } from "../auth/routes.ts";
import { config } from "../config.ts";
import { accountRoutes } from "../routes/account.ts";
import { presentationRoutes } from "../routes/presentations.ts";
import { publicRoutes } from "../routes/public.ts";
import { sessionRoutes } from "../routes/sessions.ts";
import { staffRoutes } from "../routes/staff.ts";
import { HttpError } from "./errors.ts";

const allowedOrigin = new URL(config.SITE_URL).origin;

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    // nginx already logs every request; the application logs only what goes wrong.
    logger: {
      level: "warn",
      redact: ["req.headers.cookie", "req.headers.authorization"],
    },
    // nginx on the same machine is the only client; it passes the visitor's address.
    trustProxy: "127.0.0.1",
    bodyLimit: 256 * 1024,
  });

  await app.register(cookie);

  // Every response says which release made it, so a deploy can prove the switch.
  app.addHook("onSend", async (_request, reply) => {
    reply.header("x-release", config.RELEASE);
    reply.header("cache-control", "no-store");
  });

  // Requests that change something must come from the site's own pages. With
  // SameSite cookies this closes the door on cross-site request forgery.
  app.addHook("onRequest", async (request) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
    const origin = request.headers.origin;
    if (origin !== allowedOrigin) {
      throw new HttpError(403, "bad_origin", "This request did not come from Roomwave.");
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.status).send({ error: error.code, message: error.message, fields: error.fields });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status < 500) {
      return reply.code(status).send({ error: "bad_request", message: "That request could not be read." });
    }
    request.log.error(error);
    return reply.code(500).send({ error: "server", message: "Something went wrong on our side. Please try again." });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: "not_found", message: "Not found." });
  });

  await app.register(publicRoutes);
  await app.register(authRoutes);
  await app.register(accountRoutes);
  await app.register(presentationRoutes);
  await app.register(sessionRoutes);
  await app.register(staffRoutes);
  return app;
}
