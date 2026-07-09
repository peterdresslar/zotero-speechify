import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const appRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        popup: resolve(appRoot, "src/popup/index.html"),
        options: resolve(appRoot, "src/options/index.html"),
        offscreen: resolve(appRoot, "src/offscreen/index.html"),
        "service-worker": resolve(appRoot, "src/background/service-worker.ts"),
        "reader-control": resolve(appRoot, "src/content/reader-control.ts")
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  }
});
