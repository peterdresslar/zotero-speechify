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
      // MV3 entrypoints (src/entries/*). Each output has platform
      // constraints: the content script must stay import-free (classic
      // script), the service worker and pages may import chunks.
      input: {
        popup: resolve(appRoot, "src/entries/popup/index.html"),
        options: resolve(appRoot, "src/entries/options/index.html"),
        offscreen: resolve(appRoot, "src/entries/offscreen/index.html"),
        "service-worker": resolve(
          appRoot,
          "src/entries/background/service-worker.ts"
        ),
        "reader-control": resolve(
          appRoot,
          "src/entries/content/reader-control.ts"
        )
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  }
});
