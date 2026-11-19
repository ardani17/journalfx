import { createHash } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";
import * as oidc from "openid-client";
import { z } from "zod";
import { configuredAuthSecret } from "@/lib/session";
import { getAppOrigin } from "@/lib/app-origin";

export const GOOGLE_FLOW_COOKIE = "horizon_google_flow";
export const GOOGLE_FLOW_MAX_AGE = 600;
export const authHeaders = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

const GOOGLE_ISSUER = "https://accounts.google.com";
const CALLBACK_PATH = "/api/auth/google/callback";
const FLOW_ISSUER = "horizon-journal:google-flow";
const randomValue = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/);
const flowSchema = z.object({ state: randomValue, nonce: randomValue, verifier: randomValue });
const identitySchema = z.object({
  sub: z.string().min(1).max(255),
  email: z.email().max(254),
  email_verified: z.literal(true),
  name: z.string().trim().optional(),
});

type GoogleFlow = z.infer<typeof flowSchema>;

interface GoogleConfig {
  origin: URL;
  callback: URL;
  clientId: string;
  clientSecret: string;
  flowKey: Uint8Array;
}

export function getGoogleConfig(): GoogleConfig | null {
  const origin = getAppOrigin();
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const secret = configuredAuthSecret();
  if (!origin || !clientId || !clientSecret || !secret) return null;
  return {
    origin, clientId, clientSecret,
    callback: new URL(CALLBACK_PATH, origin),
    flowKey: createHash("sha256").update(FLOW_ISSUER).update("\0").update(secret).digest(),
  };
}

export function googleFlowCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || getAppOrigin()?.protocol === "https:",
    sameSite: "lax" as const,
    path: "/api/auth/google",
    maxAge: GOOGLE_FLOW_MAX_AGE,
  };
}

let discovery: Promise<oidc.Configuration> | undefined;

function provider(config: GoogleConfig) {
  discovery ??= oidc.discovery(
    new URL(GOOGLE_ISSUER), config.clientId, { id_token_signed_response_alg: "RS256" },
    oidc.ClientSecretPost(config.clientSecret),
    {
      timeout: 5,
      execute: [oidc.enableNonRepudiationChecks],
      [oidc.customFetch]: (url, options) => fetch(url, {
        ...options,
        body: options.body instanceof Uint8Array ? Uint8Array.from(options.body).buffer : options.body,
        cache: "no-store",
      }),
    },
  ).catch((error: unknown) => {
    discovery = undefined;
    throw error;
  });
  return discovery;
}

export async function startGoogleFlow(config: GoogleConfig) {
  const flow: GoogleFlow = {
    state: oidc.randomState(),
    nonce: oidc.randomNonce(),
    verifier: oidc.randomPKCECodeVerifier(),
  };
  const connection = await provider(config);
  const authorizationUrl = oidc.buildAuthorizationUrl(connection, {
    response_type: "code",
    scope: "openid email profile",
    redirect_uri: config.callback.href,
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: await oidc.calculatePKCECodeChallenge(flow.verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  const cookie = await new EncryptJWT(flow)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuer(FLOW_ISSUER)
    .setAudience(config.clientId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + GOOGLE_FLOW_MAX_AGE)
    .encrypt(config.flowKey);
  return { authorizationUrl: authorizationUrl.href, cookie };
}

export async function readGoogleFlow(config: GoogleConfig, cookie: string | undefined) {
  if (!cookie) return null;
  try {
    const { payload } = await jwtDecrypt(cookie, config.flowKey, {
      issuer: FLOW_ISSUER, audience: config.clientId, requiredClaims: ["exp", "iat"],
      keyManagementAlgorithms: ["dir"], contentEncryptionAlgorithms: ["A256GCM"],
    });
    return flowSchema.parse(payload);
  } catch {
    return null;
  }
}

export async function exchangeGoogleCode(config: GoogleConfig, query: URLSearchParams, flow: GoogleFlow) {
  const callback = new URL(config.callback);
  callback.search = query.toString();
  const tokens = await oidc.authorizationCodeGrant(await provider(config), callback, {
    pkceCodeVerifier: flow.verifier, expectedState: flow.state, expectedNonce: flow.nonce, idTokenExpected: true,
  });
  const { sub, email, name } = identitySchema.parse(tokens.claims());
  return { subject: sub, email, name: (name || email.split("@")[0] || "Pengguna").slice(0, 80) };
}
