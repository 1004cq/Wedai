// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAssistantDetail: vi.fn().mockResolvedValue({ identifier: 'demo-agent' }),
  getGroupAgentDetail: vi.fn().mockResolvedValue({ group: { identifier: 'demo-group' } }),
  getMcpDetail: vi.fn().mockResolvedValue({ identifier: 'demo-mcp' }),
  getModelDetail: vi.fn().mockResolvedValue({ identifier: 'demo-model' }),
  getPluginDetail: vi.fn().mockResolvedValue({ identifier: 'demo-plugin' }),
  getProviderDetail: vi.fn().mockResolvedValue({ identifier: 'demo-provider' }),
  getSkillDetail: vi.fn().mockResolvedValue({ identifier: 'demo-skill' }),
}));

vi.mock('@/libs/trpc/client', () => ({
  lambdaClient: {
    market: {
      getAssistantDetail: { query: mocks.getAssistantDetail },
      getGroupAgentDetail: { query: mocks.getGroupAgentDetail },
      getMcpDetail: { query: mocks.getMcpDetail },
      getModelDetail: { query: mocks.getModelDetail },
      getPluginDetail: { query: mocks.getPluginDetail },
      getProviderDetail: { query: mocks.getProviderDetail },
      skill: {
        getSkillDetail: { query: mocks.getSkillDetail },
      },
    },
  },
}));

vi.mock('@/store/global/helpers', () => ({
  globalHelpers: {
    getCurrentLanguage: () => 'zh-CN',
  },
}));

vi.mock('@/store/user', () => ({
  useUserStore: {
    getState: () => ({}),
  },
}));

vi.mock('@/store/user/selectors', () => ({
  userGeneralSettingsSelectors: {
    telemetry: () => false,
  },
}));

describe('DiscoverService market detail auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('injects the market M2M token before fetching assistant detail', async () => {
    const { discoverService } = await import('./discover');
    const injectSpy = vi.spyOn(discoverService, 'safeInjectMPToken').mockResolvedValue(undefined);

    await discoverService.getAssistantDetail({ identifier: 'demo-agent' });

    expect(injectSpy).toHaveBeenCalledTimes(1);
    expect(mocks.getAssistantDetail).toHaveBeenCalledWith({
      identifier: 'demo-agent',
      locale: 'zh-CN',
      source: undefined,
      version: undefined,
    });
    expect(injectSpy.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getAssistantDetail.mock.invocationCallOrder[0],
    );
  });

  it('injects the market M2M token before other market detail fetches', async () => {
    const { discoverService } = await import('./discover');
    const injectSpy = vi.spyOn(discoverService, 'safeInjectMPToken').mockResolvedValue(undefined);

    await Promise.all([
      discoverService.getMcpDetail({ identifier: 'demo-mcp' }),
      discoverService.getModelDetail({ identifier: 'demo-model' }),
      discoverService.getPluginDetail({ identifier: 'demo-plugin' }),
      discoverService.getProviderDetail({ identifier: 'demo-provider' }),
      discoverService.getSkillDetail({ identifier: 'demo-skill' }),
      discoverService.getGroupAgentDetail({ identifier: 'demo-group' }),
    ]);

    expect(injectSpy).toHaveBeenCalledTimes(6);
    expect(mocks.getMcpDetail).toHaveBeenCalled();
    expect(mocks.getModelDetail).toHaveBeenCalled();
    expect(mocks.getPluginDetail).toHaveBeenCalled();
    expect(mocks.getProviderDetail).toHaveBeenCalled();
    expect(mocks.getSkillDetail).toHaveBeenCalled();
    expect(mocks.getGroupAgentDetail).toHaveBeenCalled();
  });
});
