import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { apiDelete, apiPost, apiPut, fetcher } from "../client";

const originalFetch = globalThis.fetch;

describe("client API", () => {
  beforeEach(() => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("fetcher", () => {
    test("fetches data from API", async () => {
      const mockData = { id: "1", name: "Test" };
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockData),
        } as Response),
      ) as unknown as typeof fetch;

      const result = await fetcher("/test");

      expect(result).toEqual(mockData);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:49382/v1/test",
      );
    });

    test("throws error on failed request", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          json: () => Promise.reject(new Error("No JSON")),
        } as Response),
      ) as unknown as typeof fetch;

      await expect(fetcher("/test")).rejects.toThrow(
        "HTTP 500: Internal Server Error",
      );
    });

    test("throws ApiError with structured error response", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: "Not Found",
          json: () =>
            Promise.resolve({
              error: { code: "NOT_FOUND", message: "Resource not found" },
            }),
        } as Response),
      ) as unknown as typeof fetch;

      await expect(fetcher("/test")).rejects.toThrow("Resource not found");
    });
  });

  describe("apiPost", () => {
    test("sends POST request with body", async () => {
      const mockResponse = { id: "1", created: true };
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        } as Response),
      ) as unknown as typeof fetch;

      const result = await apiPost("/items", { name: "New Item" });

      expect(result).toEqual(mockResponse);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:49382/v1/items",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "New Item" }),
        },
      );
    });

    test("throws error on failed POST request", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          statusText: "Bad Request",
          json: () =>
            Promise.resolve({
              error: { code: "BAD_REQUEST", message: "Invalid input" },
            }),
        } as Response),
      ) as unknown as typeof fetch;

      await expect(apiPost("/items", {})).rejects.toThrow("Invalid input");
    });
  });

  describe("apiPut", () => {
    test("sends PUT request with body", async () => {
      const mockResponse = { id: "1", updated: true };
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        } as Response),
      ) as unknown as typeof fetch;

      const result = await apiPut("/items/1", { name: "Updated Item" });

      expect(result).toEqual(mockResponse);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:49382/v1/items/1",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Updated Item" }),
        },
      );
    });

    test("throws error on failed PUT request", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: "Not Found",
          json: () =>
            Promise.resolve({
              error: { code: "NOT_FOUND", message: "Item not found" },
            }),
        } as Response),
      ) as unknown as typeof fetch;

      await expect(apiPut("/items/999", {})).rejects.toThrow("Item not found");
    });
  });

  describe("apiDelete", () => {
    test("sends DELETE request", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
        } as Response),
      ) as unknown as typeof fetch;

      await apiDelete("/items/1");

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:49382/v1/items/1",
        {
          method: "DELETE",
        },
      );
    });

    test("throws error on failed DELETE request", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 403,
          statusText: "Forbidden",
          json: () =>
            Promise.resolve({
              error: { code: "BAD_REQUEST", message: "Permission denied" },
            }),
        } as Response),
      ) as unknown as typeof fetch;

      await expect(apiDelete("/items/1")).rejects.toThrow("Permission denied");
    });
  });
});
