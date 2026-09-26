import { defineConfig } from "@neondatabase/config/v1";

export default defineConfig({
  auth: true,
  functions: {
    api: {
      name: "NTSS School API",
      source: "./functions/api.ts",
    },
  },
});
