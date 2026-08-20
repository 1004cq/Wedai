import { toNextJsHandler } from 'better-auth/next-js';
import type { NextRequest } from 'next/server';

import { auth } from '@/auth';
import { checkFixedWindowRateLimit } from '@/libs/rateLimit';
import { getRateLimitConfig } from '@/libs/rateLimit/config';

const jsonContentTypeRegex = /^application\/(?:[a-z0-9.+-]*\+)?json/i;

const handler = toNextJsHandler(auth);

const malformedJsonResponse = () =>
  Response.json({ code: 'INVALID_JSON', message: 'Malformed JSON request body' }, { status: 400 });

/**
 * better-call currently treats Request.json() SyntaxError as a server error.
 * Validate JSON bodies at the route boundary so malformed client payloads stay 400s.
 */
const validateJsonBody = async (request: Request) => {
  const contentType = request.headers.get('content-type') || '';
  if (!request.body || !jsonContentTypeRegex.test(contentType)) return;

  try {
    await request.clone().json();
  } catch (error) {
    if (error instanceof SyntaxError) return malformedJsonResponse();
    throw error;
  }
};

const getClientIp = (request: NextRequest): string | undefined => {
  const nextIp = request.ip;
  if (nextIp) return nextIp;

  const forwardedFor = request.headers.get('x-forwarded-for');
  const headerIp = forwardedFor?.split(',')[0]?.trim();
  if (headerIp) return headerIp;

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  return undefined;
};

const parseAuthEmailFromBody = async (request: NextRequest): Promise<string | undefined> => {
  try {
    const body = (await request.clone().json()) as Record<string, unknown>;
    const email = body.email ?? body.identifier;
    return typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Rate-limit only sign-in / sign-up mutations — skip get-session and other auth routes.
 * Webhooks are not routed here.
 */
const rateLimitAuthRequest = async (request: NextRequest): Promise<Response | null> => {
  const cfg = getRateLimitConfig();
  if (!cfg.enabled) return null;

  const pathname = request.nextUrl?.pathname ?? new URL(request.url).pathname;
  const isLogin =
    pathname.includes('sign-in') ||
    pathname.includes('login') ||
    pathname.includes('phone-number/send-otp');
  const isRegister =
    pathname.includes('sign-up') ||
    pathname.includes('register') ||
    pathname.includes('phone-number/send-otp');

  if (!isLogin && !isRegister) return null;

  const ip = getClientIp(request) ?? 'unknown';
  const email = request.method === 'POST' ? await parseAuthEmailFromBody(request) : undefined;

  const policy = isRegister ? cfg.authRegister : cfg.authLogin;
  const namespace = isRegister ? 'auth:register' : 'auth:login';

  const ipDecision = await checkFixedWindowRateLimit({
    namespace,
    identifier: `ip:${ip}`,
    limit: policy.limit,
    windowSeconds: policy.windowSeconds,
  });

  if (!ipDecision.allowed) {
    return Response.json(
      { code: 'TOO_MANY_REQUESTS', message: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers:
          ipDecision.retryAfterSeconds > 0
            ? { 'Retry-After': String(ipDecision.retryAfterSeconds) }
            : undefined,
      },
    );
  }

  if (email) {
    const emailDecision = await checkFixedWindowRateLimit({
      namespace,
      identifier: `email:${email}`,
      limit: policy.limit,
      windowSeconds: policy.windowSeconds,
    });

    if (!emailDecision.allowed) {
      return Response.json(
        { code: 'TOO_MANY_REQUESTS', message: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers:
            emailDecision.retryAfterSeconds > 0
              ? { 'Retry-After': String(emailDecision.retryAfterSeconds) }
              : undefined,
        },
      );
    }
  }

  return null;
};

export const GET = async (request: NextRequest) => {
  const limited = await rateLimitAuthRequest(request);
  if (limited) return limited;
  return handler.GET(request);
};

export const POST = async (request: NextRequest) => {
  const invalidJsonResponse = await validateJsonBody(request);
  if (invalidJsonResponse) return invalidJsonResponse;

  const limited = await rateLimitAuthRequest(request);
  if (limited) return limited;

  return handler.POST(request);
};
