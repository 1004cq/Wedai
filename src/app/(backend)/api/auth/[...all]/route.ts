import { toNextJsHandler } from 'better-auth/next-js';
import type { NextRequest } from 'next/server';

import { auth } from '@/auth';
import { checkFixedWindowRateLimit } from '@/libs/rateLimit';

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
  // NextRequest.ip is only available in some runtimes/configs; fall back to headers.
  const nextIp = request.ip;
  if (nextIp) return nextIp;

  const forwardedFor = request.headers.get('x-forwarded-for');
  const headerIp = forwardedFor?.split(',')[0]?.trim();
  if (headerIp) return headerIp;

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  return undefined;
};

const AUTH_RL_WINDOW_SECONDS = Number.parseInt(
  process.env.RATE_LIMIT_AUTH_WINDOW_SECONDS ?? '60',
  10,
);
const AUTH_RL_LOGIN_PER_MINUTE = Number.parseInt(
  process.env.RATE_LIMIT_LOGIN_PER_MINUTE ?? '10',
  10,
);
const AUTH_RL_REGISTER_PER_MINUTE = Number.parseInt(
  process.env.RATE_LIMIT_REGISTER_PER_MINUTE ?? '5',
  10,
);

const rateLimitAuthRequest = async (request: NextRequest): Promise<Response | null> => {
  const ip = getClientIp(request) ?? 'unknown';

  const pathname = request.nextUrl?.pathname ?? new URL(request.url).pathname;
  const isLogin = pathname.includes('sign-in') || pathname.includes('login');
  const isRegister = pathname.includes('sign-up') || pathname.includes('register');

  const limit = isLogin
    ? AUTH_RL_LOGIN_PER_MINUTE
    : isRegister
      ? AUTH_RL_REGISTER_PER_MINUTE
      : AUTH_RL_LOGIN_PER_MINUTE;
  const namespace = isRegister ? 'auth:register' : isLogin ? 'auth:login' : 'auth';

  const decision = await checkFixedWindowRateLimit({
    namespace,
    identifier: ip,
    limit,
    windowSeconds: AUTH_RL_WINDOW_SECONDS,
  });

  if (decision.allowed) return null;

  return Response.json(
    { code: 'TOO_MANY_REQUESTS', message: 'Too many requests. Please try again later.' },
    {
      status: 429,
      headers:
        decision.retryAfterSeconds > 0
          ? { 'Retry-After': String(decision.retryAfterSeconds) }
          : undefined,
    },
  );
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
