# 将官方 LobeHub 源码导入 Wedai

当前仓库仅有文档与配置骨架，**尚未包含**官方 LobeHub 源码。
请按以下步骤在本地完成导入。

## 推荐命令（完整覆盖导入）

```bash
# 1. 克隆官方仓库
git clone --depth 1 -b canary https://github.com/lobehub/lobehub.git Wedai-temp
cd Wedai-temp

# 2. 指向本仓库
git remote set-url origin https://github.com/1004cq/Wedai.git

# 3. 可选：备份本仓库已有文档（README、docs、apisix 等）
# 若远程已有提交，可先单独 clone Wedai 备份 docs/

# 4. 推送到 Wedai（覆盖现有 main）
git push -u origin canary:main --force

# 5. 添加 upstream 方便后续同步官方
git remote add upstream https://github.com/lobehub/lobehub.git
git fetch upstream
```

## 导入后必须做的事

1. 把本仓库原有的 `docs/`、`apisix/`、`docker-compose.apisix.yml` 等文件重新加回（若被覆盖）。
2. 合并/保留商业化 README 说明。
3. 按 `docs/` 下的架构与计费方案，创建独立商业化目录：
   - `packages/billing/`
   - `src/features/billing/`
   - `src/features/admin/`
4. 不要大面积修改官方 `packages/model-runtime`、`packages/agent-runtime` 核心逻辑，计费用中间件切入。

## License 提醒

二次开发并商业化需关注 LobeHub Community License，正式对外售卖前联系：hello@lobehub.com

## 本次实际导入结果（2026-08-02）

- 官方基线：`lobehub/lobehub@5287fe849f7273ee57f9aa01d8fa3c17281c511e`（`canary`）。
- Wedai 工作分支：`main`。
- 已配置 `upstream=https://github.com/lobehub/lobehub.git`。
- 官方源码采用浅抓取完成工作树导入；如需完整历史，可执行 `git fetch --unshallow upstream`。
- 商业化文件通过独立提交叠加，未修改 `packages/agent-runtime`、`packages/model-runtime` 或 `LICENSE`。
- 后续同步建议在独立分支合并 `upstream/canary`，验证后再进入 `main`。
