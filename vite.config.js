import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    watch: {
      ignored: [
        "**/extensions.json",
        "**/.docs/**",
        "**/sandbox_data/chrome_profile/**",
        "**/sandbox_data/extensions/**",
        "**/sandbox_data/temp/**",
        "**/sandbox_data/screenshots/**",
        "**/sandbox_data/components/**",
        "**/sandbox_data/inspirations.json",
        "**/src/showcase/nt-bookmarks/icons/**",
      ]
    },
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/extensions": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
})
