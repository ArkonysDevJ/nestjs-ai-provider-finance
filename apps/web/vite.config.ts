import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Binds to 0.0.0.0 instead of localhost-only, so a phone on the
    // same Wi-Fi network can reach the dev server via the PC's LAN IP
    // (e.g. http://192.168.1.x:5173). Dev-only convenience -- has no
    // effect on the production build.
    host: true,
  },
});
