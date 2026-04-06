import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";

export interface ErrorBody {
  error: string;
  message: string;
  details?: unknown;
}

/**
 * Hono error handler producing a unified JSON error shape.
 */
export const errorHandler: ErrorHandler = (err, c: Context) => {
  if (err instanceof HTTPException) {
    const res = err.getResponse();
    // If the thrown exception already carries a JSON response, pass it through.
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return res;
    }
    const body: ErrorBody = {
      error: mapStatusToCode(err.status),
      message: err.message || "エラーが発生しました",
    };
    return c.json(body, err.status);
  }

  console.error("[server] unhandled error:", err);
  const body: ErrorBody = {
    error: "internal_error",
    message: "サーバー内部エラーが発生しました",
  };
  return c.json(body, 500);
};

export const notFoundHandler: NotFoundHandler = (c: Context) => {
  const body: ErrorBody = {
    error: "not_found",
    message: "リソースが見つかりません",
  };
  return c.json(body, 404);
};

function mapStatusToCode(status: number): string {
  switch (status) {
    case 400:
      return "bad_request";
    case 401:
      return "unauthenticated";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 422:
      return "unprocessable";
    case 423:
      return "locked";
    default:
      return `http_${status}`;
  }
}
