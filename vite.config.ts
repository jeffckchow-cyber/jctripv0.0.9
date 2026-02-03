
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY),
    'process.env.SYNC_URL': JSON.stringify(process.env.SYNC_URL || 'https://script.google.com/macros/s/AKfycbzNWiondifG_ttagkAGglP2WX1hxVNWRxOna-O7Rq5F38J-PrM2asdTodQY-a2HE29X/exec'),
    'process.env': process.env
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './index.html',
      },
    },
  },
});
