export function getAppOrigin() {
  try {
    const url = new URL(process.env.APP_ORIGIN ?? "");
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    if (url.protocol === "https:") return url;
    if (process.env.NODE_ENV !== "production" && url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return url;
  } catch {
    // Malformed or missing APP_ORIGIN disables sign-in until it is configured.
  }
  return null;
}

export function isSameOriginMutation(request: Request, origin: string) {
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") return false;
  const requestOrigin = request.headers.get("origin");
  return requestOrigin === null || requestOrigin === origin;
}
