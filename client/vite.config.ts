import { defineConfig } from "vite"
import { resolve } from "path"

export default defineConfig({
  resolve: {
    alias: {
      "@twinky/shared": resolve(__dirname, "../shared"),
    },
  },
  server: {
    port: 5173,
  },
  test: {
    environment: "jsdom",
    globals: false,
  },
})
