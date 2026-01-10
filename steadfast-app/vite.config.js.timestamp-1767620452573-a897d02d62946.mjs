// vite.config.js
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "file:///C:/Users/medim/OneDrive/Desktop/steadfast%20kotak/steadfast-app/node_modules/vite/dist/node/index.js";
import vue from "file:///C:/Users/medim/OneDrive/Desktop/steadfast%20kotak/steadfast-app/node_modules/@vitejs/plugin-vue/dist/index.mjs";
var __vite_injected_original_import_meta_url = "file:///C:/Users/medim/OneDrive/Desktop/steadfast%20kotak/steadfast-app/vite.config.js";
var vite_config_default = defineConfig(({ mode }) => {
  const isProduction = mode === "production";
  return {
    base: "/",
    plugins: [vue()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", __vite_injected_original_import_meta_url))
      }
    },
    server: {
      proxy: {
        "/flattradeSymbols": {
          target: isProduction ? "https://api.steadfastapp.in" : "http://localhost:3000",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/flattradeSymbols/, "/flattrade/")
        },
        "/shoonyaSymbols": {
          target: isProduction ? "https://api.steadfastapp.in" : "http://localhost:3000",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/shoonyaSymbols/, "/shoonya/")
        },
        "/flattradeApi": {
          target: "https://authapi.flattrade.in",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/flattradeApi/, "")
        },
        "/shoonyaApi": {
          target: "https://api.shoonya.com",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/shoonyaApi/, "")
        },
        "/api": {
          target: isProduction ? "https://api.steadfastapp.in" : "http://localhost:3000",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, "")
        }
      }
    },
    optimizeDeps: {
      include: ["@google/generative-ai"]
    },
    define: {
      "process.env.BASE_URL": isProduction ? JSON.stringify("https://api.steadfastapp.in") : JSON.stringify("http://localhost:3000")
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxtZWRpbVxcXFxPbmVEcml2ZVxcXFxEZXNrdG9wXFxcXHN0ZWFkZmFzdCBrb3Rha1xcXFxzdGVhZGZhc3QtYXBwXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxtZWRpbVxcXFxPbmVEcml2ZVxcXFxEZXNrdG9wXFxcXHN0ZWFkZmFzdCBrb3Rha1xcXFxzdGVhZGZhc3QtYXBwXFxcXHZpdGUuY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy9tZWRpbS9PbmVEcml2ZS9EZXNrdG9wL3N0ZWFkZmFzdCUyMGtvdGFrL3N0ZWFkZmFzdC1hcHAvdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyBmaWxlVVJMVG9QYXRoLCBVUkwgfSBmcm9tICdub2RlOnVybCdcblxuaW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSdcbmltcG9ydCB2dWUgZnJvbSAnQHZpdGVqcy9wbHVnaW4tdnVlJ1xuXG4vLyBodHRwczovL3ZpdGVqcy5kZXYvY29uZmlnL1xuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKCh7IG1vZGUgfSkgPT4ge1xuICBjb25zdCBpc1Byb2R1Y3Rpb24gPSBtb2RlID09PSAncHJvZHVjdGlvbidcblxuICByZXR1cm4ge1xuICAgIGJhc2U6ICcvJyxcbiAgICBwbHVnaW5zOiBbdnVlKCldLFxuICAgIHJlc29sdmU6IHtcbiAgICAgIGFsaWFzOiB7XG4gICAgICAgICdAJzogZmlsZVVSTFRvUGF0aChuZXcgVVJMKCcuL3NyYycsIGltcG9ydC5tZXRhLnVybCkpXG4gICAgICB9XG4gICAgfSxcbiAgICBzZXJ2ZXI6IHtcbiAgICAgIHByb3h5OiB7XG4gICAgICAgICcvZmxhdHRyYWRlU3ltYm9scyc6IHtcbiAgICAgICAgICB0YXJnZXQ6IGlzUHJvZHVjdGlvbiA/ICdodHRwczovL2FwaS5zdGVhZGZhc3RhcHAuaW4nIDogJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcsXG4gICAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgICAgICAgIHJld3JpdGU6IChwYXRoKSA9PiBwYXRoLnJlcGxhY2UoL15cXC9mbGF0dHJhZGVTeW1ib2xzLywgJy9mbGF0dHJhZGUvJylcbiAgICAgICAgfSxcbiAgICAgICAgJy9zaG9vbnlhU3ltYm9scyc6IHtcbiAgICAgICAgICB0YXJnZXQ6IGlzUHJvZHVjdGlvbiA/ICdodHRwczovL2FwaS5zdGVhZGZhc3RhcHAuaW4nIDogJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcsXG4gICAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgICAgICAgIHJld3JpdGU6IChwYXRoKSA9PiBwYXRoLnJlcGxhY2UoL15cXC9zaG9vbnlhU3ltYm9scy8sICcvc2hvb255YS8nKVxuICAgICAgICB9LFxuICAgICAgICAnL2ZsYXR0cmFkZUFwaSc6IHtcbiAgICAgICAgICB0YXJnZXQ6ICdodHRwczovL2F1dGhhcGkuZmxhdHRyYWRlLmluJyxcbiAgICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXG4gICAgICAgICAgcmV3cml0ZTogKHBhdGgpID0+IHBhdGgucmVwbGFjZSgvXlxcL2ZsYXR0cmFkZUFwaS8sICcnKVxuICAgICAgICB9LFxuICAgICAgICAnL3Nob29ueWFBcGknOiB7XG4gICAgICAgICAgdGFyZ2V0OiAnaHR0cHM6Ly9hcGkuc2hvb255YS5jb20nLFxuICAgICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcbiAgICAgICAgICByZXdyaXRlOiAocGF0aCkgPT4gcGF0aC5yZXBsYWNlKC9eXFwvc2hvb255YUFwaS8sICcnKVxuICAgICAgICB9LFxuICAgICAgICAnL2FwaSc6IHtcbiAgICAgICAgICB0YXJnZXQ6IGlzUHJvZHVjdGlvbiA/ICdodHRwczovL2FwaS5zdGVhZGZhc3RhcHAuaW4nIDogJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcsXG4gICAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgICAgICAgIHJld3JpdGU6IChwYXRoKSA9PiBwYXRoLnJlcGxhY2UoL15cXC9hcGkvLCAnJylcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgb3B0aW1pemVEZXBzOiB7XG4gICAgICBpbmNsdWRlOiBbJ0Bnb29nbGUvZ2VuZXJhdGl2ZS1haSddXG4gICAgfSxcbiAgICBkZWZpbmU6IHtcbiAgICAgICdwcm9jZXNzLmVudi5CQVNFX1VSTCc6IGlzUHJvZHVjdGlvblxuICAgICAgICA/IEpTT04uc3RyaW5naWZ5KCdodHRwczovL2FwaS5zdGVhZGZhc3RhcHAuaW4nKVxuICAgICAgICA6IEpTT04uc3RyaW5naWZ5KCdodHRwOi8vbG9jYWxob3N0OjMwMDAnKVxuICAgIH1cbiAgfVxufSlcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBeVgsU0FBUyxlQUFlLFdBQVc7QUFFNVosU0FBUyxvQkFBb0I7QUFDN0IsT0FBTyxTQUFTO0FBSCtOLElBQU0sMkNBQTJDO0FBTWhTLElBQU8sc0JBQVEsYUFBYSxDQUFDLEVBQUUsS0FBSyxNQUFNO0FBQ3hDLFFBQU0sZUFBZSxTQUFTO0FBRTlCLFNBQU87QUFBQSxJQUNMLE1BQU07QUFBQSxJQUNOLFNBQVMsQ0FBQyxJQUFJLENBQUM7QUFBQSxJQUNmLFNBQVM7QUFBQSxNQUNQLE9BQU87QUFBQSxRQUNMLEtBQUssY0FBYyxJQUFJLElBQUksU0FBUyx3Q0FBZSxDQUFDO0FBQUEsTUFDdEQ7QUFBQSxJQUNGO0FBQUEsSUFDQSxRQUFRO0FBQUEsTUFDTixPQUFPO0FBQUEsUUFDTCxxQkFBcUI7QUFBQSxVQUNuQixRQUFRLGVBQWUsZ0NBQWdDO0FBQUEsVUFDdkQsY0FBYztBQUFBLFVBQ2QsU0FBUyxDQUFDLFNBQVMsS0FBSyxRQUFRLHVCQUF1QixhQUFhO0FBQUEsUUFDdEU7QUFBQSxRQUNBLG1CQUFtQjtBQUFBLFVBQ2pCLFFBQVEsZUFBZSxnQ0FBZ0M7QUFBQSxVQUN2RCxjQUFjO0FBQUEsVUFDZCxTQUFTLENBQUMsU0FBUyxLQUFLLFFBQVEscUJBQXFCLFdBQVc7QUFBQSxRQUNsRTtBQUFBLFFBQ0EsaUJBQWlCO0FBQUEsVUFDZixRQUFRO0FBQUEsVUFDUixjQUFjO0FBQUEsVUFDZCxTQUFTLENBQUMsU0FBUyxLQUFLLFFBQVEsbUJBQW1CLEVBQUU7QUFBQSxRQUN2RDtBQUFBLFFBQ0EsZUFBZTtBQUFBLFVBQ2IsUUFBUTtBQUFBLFVBQ1IsY0FBYztBQUFBLFVBQ2QsU0FBUyxDQUFDLFNBQVMsS0FBSyxRQUFRLGlCQUFpQixFQUFFO0FBQUEsUUFDckQ7QUFBQSxRQUNBLFFBQVE7QUFBQSxVQUNOLFFBQVEsZUFBZSxnQ0FBZ0M7QUFBQSxVQUN2RCxjQUFjO0FBQUEsVUFDZCxTQUFTLENBQUMsU0FBUyxLQUFLLFFBQVEsVUFBVSxFQUFFO0FBQUEsUUFDOUM7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLElBQ0EsY0FBYztBQUFBLE1BQ1osU0FBUyxDQUFDLHVCQUF1QjtBQUFBLElBQ25DO0FBQUEsSUFDQSxRQUFRO0FBQUEsTUFDTix3QkFBd0IsZUFDcEIsS0FBSyxVQUFVLDZCQUE2QixJQUM1QyxLQUFLLFVBQVUsdUJBQXVCO0FBQUEsSUFDNUM7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
