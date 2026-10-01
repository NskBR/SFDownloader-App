import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
    watch: {
      ignored: ["**/src-tauri/target/**", "**/target/**", "**/dist/**", "**/src-tauri/resources/media-tools/**", "**/scratch/media-tools/**", "**/scratch/media-test-target/**", "**/release/**"],
    },
  },
});
