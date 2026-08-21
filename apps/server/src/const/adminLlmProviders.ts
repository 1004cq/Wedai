/** Curated platform LLM env keys shown in admin (configured flags only). */
export const LLM_PROVIDER_STATUS = [
  { envKey: 'OPENAI_API_KEY', id: 'openai', label: 'OpenAI' },
  { envKey: 'ANTHROPIC_API_KEY', id: 'anthropic', label: 'Anthropic' },
  { envKey: 'GOOGLE_API_KEY', id: 'google', label: 'Google' },
  { envKey: 'AZURE_API_KEY', id: 'azure', label: 'Azure OpenAI' },
  { envKey: 'DEEPSEEK_API_KEY', id: 'deepseek', label: 'DeepSeek' },
  { envKey: 'ZHIPU_API_KEY', id: 'zhipu', label: '智谱 Zhipu' },
  { envKey: 'MOONSHOT_API_KEY', id: 'moonshot', label: 'Moonshot / Kimi' },
  { envKey: 'QWEN_API_KEY', id: 'qwen', label: '通义千问 Qwen' },
  { envKey: 'VOLCENGINE_API_KEY', id: 'volcengine', label: '火山引擎' },
  { envKey: 'MINIMAX_API_KEY', id: 'minimax', label: 'MiniMax' },
  { envKey: 'OPENROUTER_API_KEY', id: 'openrouter', label: 'OpenRouter' },
  { envKey: 'GROQ_API_KEY', id: 'groq', label: 'Groq' },
  { envKey: 'MISTRAL_API_KEY', id: 'mistral', label: 'Mistral' },
  { envKey: 'PERPLEXITY_API_KEY', id: 'perplexity', label: 'Perplexity' },
  { envKey: 'AWS_ACCESS_KEY_ID', id: 'bedrock', label: 'AWS Bedrock' },
] as const;

export type AdminLlmProviderId = (typeof LLM_PROVIDER_STATUS)[number]['id'];
