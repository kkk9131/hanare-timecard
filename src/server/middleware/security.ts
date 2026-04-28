import type { Context, MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function parseAllowedOrigins(): Set<string> {
  return new Set(
    (process.env.HANARE_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function resolveRequestOrigin(c: Context): string | null {
  try {
    return new URL(c.req.url).origin;
  } catch {
    return null;
  }
}

function resolveCorsOrigin(origin: string, c: Context): string | null {
  if (!isProduction()) {
    return origin || null;
  }

  const requestOrigin = resolveRequestOrigin(c);
  if (origin && requestOrigin && origin === requestOrigin) {
    return origin;
  }

  if (origin && parseAllowedOrigins().has(origin)) {
    return origin;
  }

  return null;
}

export function productionCorsMiddleware(): MiddlewareHandler {
  return cors({
    origin: resolveCorsOrigin,
    credentials: true,
  });
}

export function securityHeadersMiddleware(): MiddlewareHandler {
  return secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", "data:", "blob:"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
    referrerPolicy: "no-referrer",
    strictTransportSecurity: process.env.HANARE_TLS === "1",
    xContentTypeOptions: true,
    xFrameOptions: "DENY",
  });
}
