# Disabled upstream workflows (Wedai)

These GitHub Actions were inherited from [lobehub/lobehub](https://github.com/lobehub/lobehub) and are **not used** by Wedai.

Active workflows live in `../workflows/` and should stay limited to:

| Workflow | Purpose |
|----------|---------|
| `test.yml` | Unit / package tests (includes `@lobechat/billing`) |
| `e2e.yml` | E2E |
| `publish-wedai-image.yml` | Build & push `ghcr.io/1004cq/wedai` |
| `deploy-cq-je.yml` | Deploy production host |

## Why move instead of delete?

Keeping the YAML here preserves history and makes upstream sync conflicts easier to resolve: when `git merge upstream/canary` re-adds a workflow under `workflows/`, move it back here (or drop the upstream copy) instead of re-enabling LobeHub-only automation (Docker Hub `lobehub/lobehub`, Claude bots, desktop releases, canary sync, etc.).

## After an upstream sync

```bash
# If merge restored noisy workflows:
ls .github/workflows/
# Move anything that is not in the keep-list above into this directory.
git mv .github/workflows/<noise>.yml .github/workflows.disabled/
```

See also [docs/REPO_HYGIENE.md](../../docs/REPO_HYGIENE.md).
