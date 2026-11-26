import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { build, createServer, preview } from "vite";
import { buildApp, previewApp, serveApp } from "./vite-commands.ts";

vi.mock("vite", () => ({
  build: vi.fn(async () => undefined),
  createServer: vi.fn(),
  preview: vi.fn(),
}));

describe("serveApp", () => {
  let server: { listen: ReturnType<typeof vi.fn>; printUrls: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    server = { listen: vi.fn(async () => undefined), printUrls: vi.fn() };
    vi.mocked(createServer)
      .mockResolvedValue(server as never);
  });

  test("serves the app in its root on the default port and base, listens, and prints the URLs", async () => {
    await serveApp("/app");

    expect(createServer)
      .toHaveBeenCalledWith({ root: "/app", base: undefined, server: { port: undefined } });
    expect(server.listen)
      .toHaveBeenCalled();
    expect(server.printUrls)
      .toHaveBeenCalled();
  });

  test("serves on the given port", async () => {
    await serveApp("/app", { port: 5000 });

    expect(createServer)
      .toHaveBeenCalledWith({ root: "/app", base: undefined, server: { port: 5000 } });
  });

  test("serves under the given base", async () => {
    await serveApp("/app", { base: "/tinker/" });

    expect(createServer)
      .toHaveBeenCalledWith({ root: "/app", base: "/tinker/", server: { port: undefined } });
  });
});

describe("buildApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("builds the app in its root, at the default base", async () => {
    await buildApp("/app");

    expect(build)
      .toHaveBeenCalledWith({ root: "/app", base: undefined });
  });

  test("builds the app under the given base", async () => {
    await buildApp("/app", { base: "/tinker/" });

    expect(build)
      .toHaveBeenCalledWith({ root: "/app", base: "/tinker/" });
  });
});

describe("previewApp", () => {
  let root: string;
  let server: { printUrls: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    root = mkdtempSync(join(tmpdir(), "tinker-preview-"));
    server = { printUrls: vi.fn() };
    vi.mocked(preview)
      .mockResolvedValue(server as never);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("refuses when the app has no dist folder, and starts nothing", async () => {
    await expect(previewApp(root)).rejects.toThrow("run tinker build first");
    expect(preview).not.toHaveBeenCalled();
  });

  test("serves the built app on the given port and base, and prints the URLs", async () => {
    mkdirSync(join(root, "dist"));

    await previewApp(root, { port: 4173, base: "/app/" });

    expect(preview)
      .toHaveBeenCalledWith({ root, base: "/app/", preview: { port: 4173 } });
    expect(server.printUrls)
      .toHaveBeenCalled();
  });
});
