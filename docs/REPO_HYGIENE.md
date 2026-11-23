# Wedai 仓库治理（分支 / CI / 密钥）

面向个人 / 小团队维护。完整工程分析见历史讨论；本文是**可执行约定**。

## 1. 分支模型：GitHub Flow

| 分支 | 用途 |
|------|------|
| `main` | 唯一长期分支；生产镜像与 cq.je 由此发布 |
| `feat/<area>-<slug>` / `fix/<area>-<slug>` | 短生命周期功能 / 修复 |
| `sync/upstream-YYYYMM` | 从 LobeHub `canary` 同步 |
| `cursor/<slug>` | Agent 临时分支；**PR 合并后必须删除** |

禁止长期保留已合并的 `cursor/*`。本仓**不使用**上游的 `canary` 双主干。

### GitHub 设置（需仓库 Owner 在 UI 勾选）

1. **Settings → General → Pull Requests → Automatically delete head branches** = ON  
2. **Settings → Branches → Add rule for `main`**：Require a pull request；Require status checks（至少 `Test CI`）  
3. **Settings → Code security → Secret scanning + Push protection** = ON  

（Cloud Agent token 无法代改这些设置。）

### 清理已合并远端分支

```bash
git fetch origin --prune
OPEN=$(gh pr list --state open --json headRefName -q '.[].headRefName')
git ls-remote --heads origin | while read sha ref; do
  b=${ref#refs/heads/}
  [ "$b" = "main" ] && continue
  echo "$OPEN" | grep -qx "$b" && continue
  if git merge-base --is-ancestor "$sha" origin/main; then
    echo "DELETE $b"
    # git push origin --delete "$b"
  fi
done
```

历史大分支可打 `archive/*` tag 后再删（示例：`archive/phase1-commercial-billing`）。

## 2. CI 精简

仅保留 `.github/workflows/` 下 4 个文件；其余上游 workflow 在 `.github/workflows.disabled/`。

生产链路：`Test CI` → `Publish Wedai Image` → `Deploy cq.je`。

## 3. 商业环境变量（必查）

| 变量 | 说明 |
|------|------|
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | 充值闭环 |
| `SIGNUP_CREDIT_GRANT` | 注册赠送积分 |
| `BYOK_ALLOWED` / `BYOK_GATEWAY_FEE_ENABLED` | 自备 Key 策略 |
| **`AGENT_BILLING_STRICT=true`** | **生产必开**：Agent 多步 LLM 计费 fail-closed |

示例文件：根目录 `.env.example`、`deploy/.env.commercial.example`。Schema：`packages/env/src/payment.ts`。

## 4. 上游同步

见 [IMPORT_LOBEHUB.md](./IMPORT_LOBEHUB.md)。同步后检查是否又冒出上游 workflow，按需移回 `workflows.disabled/`。

## 5. Open PR 纪律

- Draft 超过 2 周且 behind `main` > 20 commits：rebase 或关闭后从 `main` 新开。  
- 合并后确认 head 分支已删除（依赖第 1 节自动删除设置）。
