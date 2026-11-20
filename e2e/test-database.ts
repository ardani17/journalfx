export function requireLocalTestDatabase() {
  const raw = process.env.DATABASE_URL ?? "";
  const database = URL.canParse(raw) ? new URL(raw) : null;
  if (
    !database ||
    !["postgresql:", "postgres:"].includes(database.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) ||
    !database.pathname.endsWith("_test") ||
    database.searchParams.has("host")
  ) {
    throw new Error("Browser test fixtures require a local PostgreSQL database ending in _test.");
  }
}
