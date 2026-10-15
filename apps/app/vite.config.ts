import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const api = process.env.API_ORIGIN ?? "http://127.0.0.1:8300";

export default defineConfig({
  plugins: [
    sveltekit({
      // Every screen of the app is drawn in the browser. One shell page serves
      // all of them; nginx sends the app's addresses to it.
      adapter: adapter({ pages: "build", fallback: "app-shell.html", precompress: false }),
      appDir: "_app",
      output: { bundleStrategy: "split" },
      version: { pollInterval: 0 },
    }),
  ],
  server: {
    proxy: {
      "/api": { target: api, changeOrigin: false },
      "/socket.io": { target: api, ws: true, changeOrigin: false },
      "/media": { target: "http://127.0.0.1:4321", changeOrigin: true },
    },
  },
  build: {
    target: "es2022",
  },
});
