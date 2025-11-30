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
    );
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
      );

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
        } as Response),
      );

      await expect(fetcher("/test")).rejects.toThrow("API error: 500");
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
      );

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
        } as Response),
      );

      await expect(apiPost("/items", {})).rejects.toThrow("API error: 400");
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
      );

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
        } as Response),
      );

      await expect(apiPut("/items/999", {})).rejects.toThrow("API error: 404");
    });
  });

  describe("apiDelete", () => {
    test("sends DELETE request", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
        } as Response),
      );

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
        } as Response),
      );

      await expect(apiDelete("/items/1")).rejects.toThrow("API error: 403");
    });
  });
});
