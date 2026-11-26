import { beforeEach, describe, expect, test, vi } from "vitest";
import { build, createServer } from "vite";
import { buildApp, serveApp } from "./vite-commands.ts";

vi.mock("vite", () => ({
  build: vi.fn(async () => undefined),
  createServer: vi.fn(),
}));

describe("serveApp", () => {
  let server: { listen: ReturnType<typeof vi.fn>; printUrls: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    server = { listen: vi.fn(async () => undefined), printUrls: vi.fn() };
    vi.mocked(createServer)
      .mockResolvedValue(server as never);
  });

  test("serves the app in its root, listens, and prints the URLs", async () => {
    await serveApp("/app");

    expect(createServer)
      .toHaveBeenCalledWith({ root: "/app" });
    expect(server.listen)
      .toHaveBeenCalled();
    expect(server.printUrls)
      .toHaveBeenCalled();
  });
});

describe("buildApp", () => {
  test("builds the app in its root", async () => {
    await buildApp("/app");

    expect(build)
      .toHaveBeenCalledWith({ root: "/app" });
  });
});
