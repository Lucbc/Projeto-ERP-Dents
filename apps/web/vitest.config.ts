import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(viteConfig, defineConfig({
  test: { environment: "jsdom", setupFiles: ["tests/dialog-environment.ts"], include: ["tests/**/*.test.tsx"] },
}));
