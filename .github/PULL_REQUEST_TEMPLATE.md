<!-- Brief and heads-up. Target branch: main (Wedai has no canary). -->

<!-- If this PR includes UI changes, please provide screenshots or videos. -->

| Before | After |
| ------ | ----- |
| ...    | ...   |

#### Commercial impact (Wedai)

- [ ] No billing / payment / admin / auth change
- [ ] Touches credits, Stripe, webhook, or ledger — describe idempotency impact
- [ ] Adds / changes DB migration (`packages/database/migrations/`)
- [ ] Adds / changes env vars (update `.env.example` + `deploy/.env.commercial.example`)
- [ ] Production needs `AGENT_BILLING_STRICT=true` (Agent LLM path)

#### Test

- [ ] Tested locally
- [ ] Added/updated tests
- [ ] No tests needed
- [ ] Ran `docs/qa/LOCAL_P0_RUNBOOK.md` steps if billing-related

#### 🔗 Related Issue

<!-- Fixes #xxx / Closes #xxx / Related to #xxx -->
