import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "/redline-tarmac/",
  build: {
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), "index.html"),
        standings: resolve(process.cwd(), "standings.html"),
        rallyControl: resolve(process.cwd(), "rally-control.html"),
        newsroom: resolve(process.cwd(), "newsroom.html"),
        onboard: resolve(process.cwd(), "onboard.html")
      }
    }
  }
});
