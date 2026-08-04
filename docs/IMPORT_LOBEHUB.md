# 与官方 LobeHub 同步

## 当前状态（2026-08-02 起）

- 官方基线已导入：`lobehub/lobehub` `canary`
- 工作分支：`main`
- 建议配置：`upstream = https://github.com/lobehub/lobehub.git`
- 商业文件以独立提交叠加；**不要改** `packages/agent-runtime`、`packages/model-runtime` 与 `LICENSE` 主体

目录归属见 [REPO_LAYOUT.md](./REPO_LAYOUT.md)。

## 日常同步建议

```bash
git fetch upstream
git checkout -b sync/upstream-canary
git merge upstream/canary
# 解决冲突：优先保留 deploy/、docs/commercial|qa|architecture、src/features/admin|billing|user-center
# 验证构建与关键流程后再合并回 main
```

冲突多发区：

- 根 `README.md`（Wedai 已重写，勿被上游整文件覆盖）
- `docs/` 下 Wedai 子目录
- `deploy/`

## 历史：首次导入命令（已完成，仅备查）

```bash
git clone --depth 1 -b canary https://github.com/lobehub/lobehub.git Wedai-temp
cd Wedai-temp
git remote set-url origin https://github.com/1004cq/Wedai.git
# 推送前备份本仓库 docs/ deploy/ apisix/
git push -u origin canary:main
git remote add upstream https://github.com/lobehub/lobehub.git
```

## License

二次开发并对外商业化需遵守 LobeHub Community License，正式售卖前联系：hello@lobehub.com
