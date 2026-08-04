# 用户自配 API（BYOK）

## 1. 定义

**BYOK（Bring Your Own Key）**：用户在设置中填写自己的模型服务商 API Key / Base URL，对话时优先使用用户密钥，费用由用户与模型商结算。

## 2. 上游能力（已存在，勿重复造轮子）

| 能力 | 路径 |
|------|------|
| Provider 配置页 | `src/routes/(main)/settings/provider/**` |
| 密钥存储字段 | `keyVaults`（`apiKey`、`baseURL` 等） |
| 加密密钥 | 环境变量 `KEY_VAULTS_SECRET` |
| 请求头注入 | `src/services/_header.ts`、`_auth.ts` |
| 权限 | `manage_provider_key` |
| 平台托管渠道 | 如 `lobehub` Provider：禁止用户改 API Key / Base URL |

## 3. 与平台计费的规则（产品约定）

1. **已配置且启用用户 Key 的 Provider** → 走 BYOK；**不扣**平台余额（或仅收可选网关费）。
2. **未配置用户 Key** → 走平台渠道；按 `model_prices` **预占 / 结算**。
3. **平台托管 Provider** → 强制平台渠道 + 扣费；UI 不展示可编辑 Key。
4. Admin 可配置全局开关：是否允许 BYOK、哪些模型强制平台。

### 调用前判断（伪代码）

```text
if provider 为平台托管:
    必须平台计费
else if 用户 keyVaults 中该 provider 有有效凭证:
    BYOK，跳过余额预占（或只记用量不计费）
else:
    平台计费：检查余额 → 预占 → 调用 → 按 usage 结算
```

## 4. UX 建议

- 输入区或模型选择旁展示当前模式：「平台 · 扣积分」/「自有 API · 不扣积分」
- 余额不足仅拦截平台模式；BYOK 不受平台余额限制
- 设置页明确：密钥仅服务端加密存储，前端不回显明文

## 5. 安全

- 密钥经 `KEY_VAULTS_SECRET` 加密落库
- 日志、错误响应、前端包禁止出现完整 API Key
- 管理后台调阅用户时脱敏（仅显示是否已配置）

## 6. 验收要点

- [ ] 用户配置 OpenAI Key 后，该 Provider 对话不扣平台积分
- [ ] 清除 Key 后同一模型改为平台扣费
- [ ] 平台托管 Provider 无法通过 UI/API 写入用户 Key
- [ ] 密钥更新后旧 Key 不可再用于请求
