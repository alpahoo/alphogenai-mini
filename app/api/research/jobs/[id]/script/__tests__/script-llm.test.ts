import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callLLMForScript } from '@/lib/research/script-llm';

describe('Script LLM gateway adapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.RESEARCH_LLM_GATEWAY_URL;
    delete process.env.RESEARCH_LLM_SERVICE_TOKEN;
    delete process.env.RESEARCH_LLM_MODEL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should require the LiteLLM gateway env vars', async () => {
    const result = await callLLMForScript('prompt');

    expect(result).toEqual({
      content: '',
      tokensUsed: null,
      modelUsed: null,
      error: 'LLM gateway not configured',
    });
  });

  it('should call the OpenAI-compatible LiteLLM endpoint', async () => {
    process.env.RESEARCH_LLM_GATEWAY_URL = 'https://research-gw.example.com';
    process.env.RESEARCH_LLM_SERVICE_TOKEN = 'service-token';
    process.env.RESEARCH_LLM_MODEL = 'research-basic';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"script":"ok","scenes":[]}' } }],
        usage: { total_tokens: 42 },
        model: 'research-basic',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await callLLMForScript('prompt');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://research-gw.example.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer service-token',
        }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.model).toBe('research-basic');
    expect(body.messages[0].role).toBe('system');
    expect(result).toMatchObject({
      content: '{"script":"ok","scenes":[]}',
      tokensUsed: 42,
      modelUsed: 'research-basic',
    });
  });
});
