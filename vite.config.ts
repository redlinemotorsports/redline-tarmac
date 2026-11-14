import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "/redline-tarmac/",
  build: {
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), "index.html"),
        rallyControl: resolve(process.cwd(), "rally-control.html")
      }
    }
  }
});
