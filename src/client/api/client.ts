import type { ZodType } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
};

async function request<T>(
  path: string,
  schema: ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, signal } = options;

  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  const text = await res.text();
  const json: unknown = text.length > 0 ? JSON.parse(text) : undefined;

  if (!res.ok) {
    throw new ApiError(res.status, `API ${method} ${path} failed (${res.status})`, json);
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError(res.status, `API ${method} ${path} response schema mismatch`, parsed.error);
  }
  return parsed.data;
}

export const apiClient = {
  get: <T>(path: string, schema: ZodType<T>, signal?: AbortSignal) =>
    request(path, schema, { method: "GET", signal }),
  post: <T>(path: string, schema: ZodType<T>, body?: unknown, signal?: AbortSignal) =>
    request(path, schema, { method: "POST", body, signal }),
  put: <T>(path: string, schema: ZodType<T>, body?: unknown, signal?: AbortSignal) =>
    request(path, schema, { method: "PUT", body, signal }),
  patch: <T>(path: string, schema: ZodType<T>, body?: unknown, signal?: AbortSignal) =>
    request(path, schema, { method: "PATCH", body, signal }),
  delete: <T>(path: string, schema: ZodType<T>, signal?: AbortSignal) =>
    request(path, schema, { method: "DELETE", signal }),
};
