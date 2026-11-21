import { fileURLToPath } from "node:url";

const turnstileOrigin = "https://challenges.cloudflare.com";
const scriptSources = "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
const contentSecurityPolicy = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];
const cspHeader = (directives) => ({ key: "Content-Security-Policy", value: directives.join("; ") });
const loginCsp = cspHeader([...contentSecurityPolicy, `${scriptSources} ${turnstileOrigin}`, `frame-src ${turnstileOrigin}`]);

/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  cspHeader([...contentSecurityPolicy, scriptSources]),
];

const nextConfig = {
  agentRules: false,
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/", headers: [loginCsp] },
      { source: "/login", headers: [loginCsp] },
    ];
  },
  outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url)),
  serverExternalPackages: ["@prisma/client", "pdfkit"],
};

export default nextConfig;
