import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["sql.js"],
  outputFileTracingIncludes: {
    "*": ["./node_modules/sql.js/dist/sql-wasm.wasm"],
  },
  webpack: (config) => {
    config.resolve.alias["@"] = path.join(root, "src");
    return config;
  },
};

export default nextConfig;
