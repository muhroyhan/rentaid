import { fileURLToPath } from "node:url";
const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:8080";
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
};
export default nextConfig;
