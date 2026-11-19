import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "horizon_session";
const SESSION_ISSUER = "horizon-journal";
const SESSION_AUDIENCE = "horizon-journal:google-session";
const SESSION_TTL_SEC = 60 * 60 * 24 * 30; // 30 days

export interface SessionPayload {
  sub: string; // user id
  email: string;
  name: string;
}

export function configuredAuthSecret() {
  const value = process.env.AUTH_SECRET;
  if (!value) return null;
  const normalized = value.trim();
  return normalized.length >= 32 && !normalized.startsWith("change-me") ? value : null;
}

function secret(): Uint8Array {
  const value = configuredAuthSecret();
  if (!value) throw new Error("AUTH_SECRET is missing or invalid");
  return new TextEncoder().encode(value);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email, name: payload.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SEC}s`)
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: ["HS256"], issuer: SESSION_ISSUER, audience: SESSION_AUDIENCE, requiredClaims: ["exp"],
    });
    if (!payload.sub || typeof payload.email !== "string") return null;
    return {
      sub: payload.sub,
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : "",
    };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_SEC,
};
