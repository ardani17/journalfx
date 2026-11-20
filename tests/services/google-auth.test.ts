import { NextRequest } from "next/server";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { calculatePKCECodeChallenge } from "openid-client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as start } from "@/app/api/auth/google/start/route";
import { GET as callback } from "@/app/api/auth/google/callback/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GOOGLE_FLOW_COOKIE, GOOGLE_FLOW_MAX_AGE } from "@/server/google-oauth";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { findOrCreateGoogleUser } from "@/server/services/users";

vi.mock("@/server/services/users", () => ({ findOrCreateGoogleUser: vi.fn() }));

const origin = "http://localhost:3000";
const issuer = "https://accounts.google.com";
const clientId = "fixture.apps.googleusercontent.com";
const authSecret = "fixture-auth-secret-for-tests-only";
const callbackPath = "/api/auth/google/callback";
const siteverifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const turnstileSecret = "fixture-turnstile-server-secret";
const fakeUser = { id: "journal-owner-id", email: "trader@example.com", name: "Trader" };

describe("Google-only authentication", () => {
  let signer: CryptoKey;
  let otherSigner: CryptoKey;
  let jwk: Awaited<ReturnType<typeof exportJWK>>;
  let state: string;
  let nonce: string;
  let challenge: string;
  let codeAccepted: boolean;
  let emailVerified: boolean;
  let tokenNonce: string | undefined;
  let tokenAudience: string;
  let tokenSigner: CryptoKey;
  let tokenRequests: number;
  let siteverify: ReturnType<typeof vi.fn<() => Response | Promise<Response>>>;

  beforeAll(async () => {
    const keys = await generateKeyPair("RS256");
    signer = keys.privateKey;
    jwk = await exportJWK(keys.publicKey);
    otherSigner = (await generateKeyPair("RS256")).privateKey;
  });

  beforeEach(() => {
    vi.stubEnv("APP_ORIGIN", origin);
    vi.stubEnv("GOOGLE_CLIENT_ID", clientId);
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "fixture-google-secret");
    vi.stubEnv("AUTH_SECRET", authSecret);
    vi.stubEnv("TURNSTILE_SITE_KEY", "fixture-turnstile-site-key");
    vi.stubEnv("TURNSTILE_SECRET_KEY", turnstileSecret);
    siteverify = vi.fn(() => Response.json({ success: true, hostname: "localhost", action: "google_login" }));
    vi.mocked(findOrCreateGoogleUser).mockReset().mockResolvedValue(fakeUser);
    codeAccepted = false;
    emailVerified = true;
    tokenNonce = undefined;
    tokenAudience = clientId;
    tokenSigner = signer;
    tokenRequests = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string, options?: RequestInit) => {
      const url = String(input);
      if (url === siteverifyUrl) {
        expect(options).toMatchObject({ method: "POST", cache: "no-store", redirect: "error" });
        const body = new URLSearchParams(String(options?.body));
        expect(body.get("secret")).toBe(turnstileSecret);
        expect(body.get("response")).toBe("fixture-turnstile-token");
        expect(options?.signal).toBeInstanceOf(AbortSignal);
        return siteverify();
      }
      if (url === `${issuer}/.well-known/openid-configuration`) {
        return Response.json({
          issuer, authorization_endpoint: `${issuer}/o/oauth2/v2/auth`,
          token_endpoint: "https://oauth2.googleapis.com/token", jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
          response_types_supported: ["code"], subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"], code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["client_secret_post"], authorization_response_iss_parameter_supported: true,
        });
      }
      if (url === "https://www.googleapis.com/oauth2/v3/certs") {
        return Response.json({ keys: [{ ...jwk, kid: "fixture", alg: "RS256", use: "sig" }] });
      }
      if (url !== "https://oauth2.googleapis.com/token") throw new Error("Unexpected provider request");
      tokenRequests++;
      const body = new URLSearchParams(String(options?.body));
      if (codeAccepted || body.get("code") !== "fixture-code") {
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      }
      expect(body.get("redirect_uri")).toBe(`${origin}${callbackPath}`);
      expect(body.get("client_secret")).toBe("fixture-google-secret");
      expect(await calculatePKCECodeChallenge(body.get("code_verifier") ?? "")).toBe(challenge);
      codeAccepted = true;
      const idToken = await new SignJWT({ email: fakeUser.email, email_verified: emailVerified, nonce: tokenNonce ?? nonce, name: fakeUser.name })
        .setProtectedHeader({ alg: "RS256", kid: "fixture" })
        .setIssuer(issuer).setAudience(tokenAudience).setSubject("google-subject-1").setIssuedAt().setExpirationTime("5m")
        .sign(tokenSigner);
      return Response.json({ token_type: "Bearer", access_token: "fixture-unused-access-token", id_token: idToken });
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function requestLogin(body: string | undefined = JSON.stringify({ turnstileToken: "fixture-turnstile-token" }), requestOrigin = origin) {
    return start(new Request(`${origin}/api/auth/google/start`, {
      method: "POST", headers: { origin: requestOrigin, "content-type": "application/json" }, body,
    }));
  }

  async function expectRejected(response: Response, status: number) {
    expect(response.status).toBe(status);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({ ok: false, error: expect.any(String) });
    expect(body.error).not.toContain(turnstileSecret);
  }

  async function begin() {
    const response = await requestLogin();
    expect(response.status).toBe(200);
    expect(siteverify).toHaveBeenCalledTimes(1);
    const url = new URL((await response.json()).data.authorizationUrl);
    expect(url.origin).toBe(issuer);
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    state = url.searchParams.get("state") ?? "";
    nonce = url.searchParams.get("nonce") ?? "";
    challenge = url.searchParams.get("code_challenge") ?? "";
    const cookie = response.cookies.get(GOOGLE_FLOW_COOKIE);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.maxAge).toBe(GOOGLE_FLOW_MAX_AGE);
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.value).not.toContain(nonce);
    return cookie!.value;
  }

  function respond(cookie?: string, query = { code: "fixture-code", state, iss: issuer } as Record<string, string>) {
    const url = new URL(callbackPath, origin);
    url.search = new URLSearchParams(query).toString();
    const headers = cookie ? { cookie: `${GOOGLE_FLOW_COOKIE}=${cookie}` } : undefined;
    return callback(new NextRequest(url, { headers }));
  }

  it("signs in through Google with PKCE and rejects replay of the same code", async () => {
    const cookie = await begin();
    const result = await respond(cookie);
    expect(result.headers.get("location")).toBe("/dashboard");
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(result.cookies.get(GOOGLE_FLOW_COOKIE)?.maxAge).toBe(0);
    const session = result.cookies.get(SESSION_COOKIE);
    expect(session?.httpOnly).toBe(true);
    expect(await verifySession(session!.value)).toEqual({ sub: fakeUser.id, email: fakeUser.email, name: fakeUser.name });
    expect(findOrCreateGoogleUser).toHaveBeenCalledExactlyOnceWith({ subject: "google-subject-1", email: fakeUser.email, name: fakeUser.name });

    const replay = await respond(cookie);
    expect(replay.headers.get("location")).toBe("/login?error=invalid");
    expect(replay.cookies.get(SESSION_COOKIE)).toBeUndefined();
    expect(findOrCreateGoogleUser).toHaveBeenCalledTimes(1);
  });

  it("rejects cross-origin login and expired or mismatched browser flows", async () => {
    await expectRejected(await requestLogin(undefined, "https://other.example"), 403);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    vi.useFakeTimers({ toFake: ["Date"] });
    const cookie = await begin();
    expect((await respond()).headers.get("location")).toBe("/login?error=expired");
    expect((await respond(cookie, { code: "fixture-code", state: "wrong" })).headers.get("location")).toBe("/login?error=invalid");
    expect((await respond(cookie, { error: "access_denied", state })).headers.get("location")).toBe("/login?error=cancelled");
    vi.setSystemTime(Date.now() + (GOOGLE_FLOW_MAX_AGE + 1) * 1000);
    expect((await respond(cookie)).headers.get("location")).toBe("/login?error=expired");
    expect(tokenRequests).toBe(0);
  });

  it.each([
    { name: "empty body", body: "" },
    { name: "missing token", body: "{}" },
    { name: "malformed JSON", body: "{broken" },
    { name: "blank token", body: '{"turnstileToken":" "}' },
    { name: "non-string token", body: '{"turnstileToken":123}' },
    { name: "oversize token", body: JSON.stringify({ turnstileToken: "a".repeat(2049) }) },
  ])("rejects $name before contacting a provider", async ({ body }) => {
    await expectRejected(await requestLogin(body), 400);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("stops reading a login body over 16 KiB before contacting a provider", async () => {
    await expectRejected(await requestLogin(JSON.stringify({ turnstileToken: "é".repeat(8192) })), 413);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it.each(["invalid-input-response", "timeout-or-duplicate"])("rejects a Turnstile %s token", async (code) => {
    siteverify.mockImplementationOnce(() => Response.json({ success: false, "error-codes": [code] }));
    await expectRejected(await requestLogin(), 403);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it.each([{ hostname: "other.example", action: "google_login" }, { hostname: "localhost", action: "other_action" }])(
    "rejects a successful token for another hostname or action (%j)", async (claims) => {
      siteverify.mockImplementationOnce(() => Response.json({ success: true, ...claims }));
      await expectRejected(await requestLogin(), 403);
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"])("requires %s to start OAuth", async (key) => {
    vi.stubEnv(key, "");
    await expectRejected(await requestLogin(), 503);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it.each([
    () => { throw new DOMException("The operation timed out", "TimeoutError"); },
    () => new Response(null, { status: 502 }),
    () => new Response("not JSON"),
    () => Response.json({ success: false, "error-codes": ["internal-error"] }),
  ])("fails closed when Turnstile is unavailable (%#)", async (verify) => {
    siteverify.mockImplementationOnce(verify);
    await expectRejected(await requestLogin(), 503);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it.each(["unverified email", "wrong audience", "wrong nonce", "wrong signature"])("rejects %s before creating a session", async (issue) => {
    const cookie = await begin();
    if (issue === "unverified email") emailVerified = false;
    if (issue === "wrong audience") tokenAudience = "other-client";
    if (issue === "wrong nonce") tokenNonce = "other-nonce";
    if (issue === "wrong signature") tokenSigner = otherSigner;
    const result = await respond(cookie);
    expect(result.headers.get("location")).toBe("/login?error=invalid");
    expect(result.cookies.get(SESSION_COOKIE)).toBeUndefined();
    expect(findOrCreateGoogleUser).not.toHaveBeenCalled();
  });

  it("clears the session on same-origin logout and rejects legacy sessions", async () => {
    const oldSession = await new SignJWT({ email: fakeUser.email }).setProtectedHeader({ alg: "HS256" })
      .setSubject(fakeUser.id).setExpirationTime("5m").sign(new TextEncoder().encode(authSecret));
    expect(await verifySession(oldSession)).toBeNull();
    const result = await logout(new Request(`${origin}/api/auth/logout`, { method: "POST", headers: { origin } }));
    expect(result.cookies.get(SESSION_COOKIE)?.maxAge).toBe(0);
    expect(result.cookies.get(GOOGLE_FLOW_COOKIE)?.maxAge).toBe(0);
  });
});
