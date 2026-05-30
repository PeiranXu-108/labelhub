import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /antd\/es\/version$/,
        replacement: resolve(__dirname, "node_modules/antd/es/version/index.js"),
      },
      {
        find: resolve(__dirname, "node_modules/antd/es/version"),
        replacement: resolve(__dirname, "node_modules/antd/es/version/index.js"),
      },
    ],
  },
  server: {
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 700,
  },
  test: {
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    server: {
      deps: {
        inline: ["@ant-design/x", "antd"],
      },
    },
  },
});
