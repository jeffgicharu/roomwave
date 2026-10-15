import sitemap from "@astrojs/sitemap";
import svelte from "@astrojs/svelte";
import { defineConfig } from "astro/config";

const api = process.env.API_ORIGIN ?? "http://127.0.0.1:8300";

export default defineConfig({
  site: "https://roomwave.jeffgicharu.com",
  trailingSlash: "never",
  build: { format: "directory", assets: "_astro" },
  // Keep the spaces between inline elements, as written.
  compressHTML: true,
  devToolbar: { enabled: false },
  integrations: [
    svelte(),
    sitemap({
      filter: (page) => !/\/(404|unavailable)\/?$/.test(page),
    }),
  ],
  vite: {
    server: {
      proxy: {
        "/api": { target: api },
        "/socket.io": { target: api, ws: true },
      },
    },
  },
});
