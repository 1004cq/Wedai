// @vitest-environment node
import { REQUEST_TOPIC_ID_HEADER } from '@lobechat/const';
import { type LobeRuntimeAI } from '@lobechat/model-runtime';
import { AgentRuntimeErrorType, ModelEmptyError, ModelRuntime } from '@lobechat/model-runtime';
import { ChatErrorType } from '@lobechat/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { auth } from '@/auth';

import { POST } from './route';

vi.mock('@/app/(backend)/middleware/auth/utils', () => ({
  checkAuthMethod: vi.fn(),
}));

vi.mock('@/server/modules/ModelRuntime', () => ({
  createTraceOptions: vi.fn().mockReturnValue({}),
}));

const initModelRuntimeForRequest = vi.hoisted(() => vi.fn());
vi.mock('@/server/modules/AgentRuntime/llmRelay/oneShot', () => ({
  initModelRuntimeForRequest,
}));

const resolveProviderRelay = vi.hoisted(() => vi.fn());
vi.mock('@/server/modules/AgentRuntime/llmRelay/resolveLlmExecutionSite', () => ({
  resolveProviderRelay,
}));
vi.mock('@/server/modules/AgentRuntime/redis', () => ({ getAgentRuntimeRedisClient: () => ({}) }));
vi.mock('@/server/modules/AgentRuntime/factory', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createStreamEventManager: () => ({ openLlmRelayChannel: vi.fn(), sendLlmExecute: vi.fn() }),
}));

const chargeBeforeChat = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ billingAccountId: 'bac', holdId: 'hold', isByok: false }),
);
const chargeAfterChat = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/business/server/chat-billing', () => ({
  InsufficientBalanceError: class InsufficientBalanceError extends Error {},
  chargeAfterChat,
  chargeBeforeChat,
}));

const selectBanned = vi.hoisted(() => vi.fn().mockResolvedValue([{ banned: false }]));
vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn(async () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: selectBanned,
        }),
      }),
    }),
  })),
}));

vi.mock('../../_utils/workspace', () => ({
  resolveValidWorkspaceIdFromRequest: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
  },
}));

let request: Request;
beforeEach(() => {
  request = new Request(new URL('https://test.com'), {
    method: 'POST',
    body: JSON.stringify({ model: 'test-model' }),
  });

  vi.mocked(auth.api.getSession).mockResolvedValue({
    session: {} as any,
    user: { id: 'test-user-id' } as any,
  });
  selectBanned.mockResolvedValue([{ banned: false }]);
  chargeBeforeChat.mockResolvedValue({ billingAccountId: 'bac', holdId: 'hold', isByok: false });
});

afterEach(() => {
  vi.clearAllMocks();
  resolveProviderRelay.mockResolvedValue(undefined);
});

describe('POST handler', () => {
  describe('one-shot relay', () => {
    it('answers ClientLlmExecutorUnavailable for a device-only provider with no tab attached', async () => {
      // oneShot resolves relay inside initModelRuntimeForRequest; without a
      // request-scoped tab it throws ClientLlmExecutorUnavailable up front.
      initModelRuntimeForRequest.mockRejectedValue({
        error: { context: 'no_client_request', reason: 'no_executor' },
        errorType: 'ClientLlmExecutorUnavailable',
        provider: 'ollama',
      });

      const response = await POST(request, { params: Promise.resolve({ provider: 'ollama' }) });

      expect(initModelRuntimeForRequest).toHaveBeenCalled();
      expect(await response.json()).toMatchObject({
        body: {
          error: { context: 'no_client_request', reason: 'no_executor' },
          provider: 'ollama',
        },
        errorType: 'ClientLlmExecutorUnavailable',
      });
    });
  });

  describe('init chat model', () => {
    it('should initialize ModelRuntime correctly with valid session', async () => {
      const mockParams = Promise.resolve({ provider: 'test-provider' });

      const mockChatResponse = new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
      const mockRuntime: LobeRuntimeAI = {
        baseURL: 'abc',
        chat: vi.fn().mockResolvedValue(mockChatResponse),
      };

      initModelRuntimeForRequest.mockResolvedValue(new ModelRuntime(mockRuntime));

      await POST(request as unknown as Request, { params: mockParams });

      expect(initModelRuntimeForRequest).toHaveBeenCalledWith(
        expect.anything(),
        'test-user-id',
        'test-provider',
        { workspaceId: undefined },
      );
      expect(chargeBeforeChat).toHaveBeenCalled();
    });

    it('should return Unauthorized error when no session exists', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(null);

      const mockParams = Promise.resolve({ provider: 'test-provider' });

      const response = await POST(request, { params: mockParams });

      expect(response.status).toBe(401);
    });

    it('should reject banned accounts before calling the provider', async () => {
      selectBanned.mockResolvedValue([{ banned: true }]);
      const response = await POST(request, {
        params: Promise.resolve({ provider: 'test-provider' }),
      });

      expect(response.status).toBe(403);
      expect(initModelRuntimeForRequest).not.toHaveBeenCalled();
      expect(chargeBeforeChat).not.toHaveBeenCalled();
    });
  });

  describe('chat', () => {
    it.each([undefined, 'topic-123'])(
      'should pass topic %s to chat runtime metadata',
      async (topicId) => {
        const mockParams = Promise.resolve({ provider: 'test-provider' });
        const mockChatPayload = { model: 'test-model', message: 'Hello, world!' };
        request = new Request(new URL('https://test.com'), {
          method: 'POST',
          headers: topicId ? { [REQUEST_TOPIC_ID_HEADER]: topicId } : {},
          body: JSON.stringify(mockChatPayload),
        });

        const mockChatResponse = new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
        const mockRuntime: LobeRuntimeAI = {
          baseURL: 'abc',
          chat: vi.fn().mockResolvedValue(mockChatResponse),
        };

        initModelRuntimeForRequest.mockResolvedValue(new ModelRuntime(mockRuntime));

        await POST(request as unknown as Request, { params: mockParams });

        expect(mockRuntime.chat).toHaveBeenCalledWith(
          mockChatPayload,
          expect.objectContaining({
            metadata: { topicId },
            user: 'test-user-id',
            signal: expect.anything(),
          }),
        );
        expect(chargeAfterChat).toHaveBeenCalled();
      },
    );

    it('should return an error response when chat completion fails', async () => {
      const mockParams = Promise.resolve({ provider: 'test-provider' });
      const mockChatPayload = { model: 'test-model', message: 'Hello, world!' };
      request = new Request(new URL('https://test.com'), {
        method: 'POST',
        body: JSON.stringify(mockChatPayload),
      });

      const mockErrorResponse = {
        errorType: ChatErrorType.InternalServerError,
        error: { errorMessage: 'Something went wrong', errorType: 500 },
        errorMessage: 'Something went wrong',
      };

      const mockRuntime: LobeRuntimeAI = {
        baseURL: 'abc',
        chat: vi.fn().mockRejectedValue(mockErrorResponse),
      };

      initModelRuntimeForRequest.mockResolvedValue(new ModelRuntime(mockRuntime));

      const response = await POST(request, { params: mockParams });

      expect(response.status).toBe(500);
      expect(chargeAfterChat).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('answers a structured error when the response body fails before its first byte', async () => {
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.error(new ModelEmptyError(undefined, { finishReason: 'MAX_TOKENS' }));
        },
      });
      const mockRuntime: LobeRuntimeAI = {
        baseURL: 'abc',
        chat: vi.fn().mockResolvedValue(new Response(body)),
      };
      initModelRuntimeForRequest.mockResolvedValue(new ModelRuntime(mockRuntime));

      const response = await POST(request, {
        params: Promise.resolve({ provider: 'test-provider' }),
      });

      expect(response.status).toBe(471);
      expect(await response.json()).toMatchObject({
        body: { provider: 'test-provider' },
        errorType: AgentRuntimeErrorType.ModelEmptyCompletion,
      });
    });

    it('streams a response whose body yields bytes', async () => {
      const mockRuntime: LobeRuntimeAI = {
        baseURL: 'abc',
        chat: vi.fn().mockResolvedValue(new Response('event: text\ndata: "OK"\n\n')),
      };
      initModelRuntimeForRequest.mockResolvedValue(new ModelRuntime(mockRuntime));

      const response = await POST(request, {
        params: Promise.resolve({ provider: 'test-provider' }),
      });

      expect(response.status).toBe(200);
      expect(await response.text()).toBe('event: text\ndata: "OK"\n\n');
    });
  });
});
