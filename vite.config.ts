import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true
  },
  build: {
    // O Firestore é carregado sob demanda; o chunk comprimido permanece
    // pequeno e não deve bloquear o build por causa do tamanho minificado bruto.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/');
          if (normalized.includes('/firebase/firestore') || normalized.includes('/@firebase/firestore')) return 'firebase-firestore';
          if (normalized.includes('/firebase/auth') || normalized.includes('/@firebase/auth')) return 'firebase-auth';
          if (normalized.includes('/firebase/app') || normalized.includes('/@firebase/app')) return 'firebase-app';
          if (normalized.includes('/node_modules/leaflet/') || normalized.includes('/node_modules/react-leaflet/')) return 'maps';
          if (normalized.includes('/node_modules/tesseract.js/')) return 'ocr';
          if (normalized.includes('/node_modules/three/')) return 'three';
          return undefined;
        },
      },
    },
  }
})
