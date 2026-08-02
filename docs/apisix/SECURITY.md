# APISIX production security checklist

- Replace every example Admin Key and deliver the real value through a secret manager.
- Bind port 9180 to a private management network; never expose it to the public Internet.
- Restrict `allow_admin` to explicit operations CIDRs instead of broad Docker networks.
- Terminate TLS with managed certificates and redirect plaintext traffic.
- Forward a trusted correlation ID, but overwrite untrusted client-provided identity headers.
- Apply body-size, timeout, rate-limit, and connection-limit policies per route.
- Scrub authorization headers, cookies, prompts, model output, and payment data from access logs.
- Export gateway metrics and alert on 401/403/429/5xx spikes and upstream saturation.
- Back up etcd before route/plugin changes and document a tested rollback.
- Keep APISIX and plugins patched; validate configuration in staging before production rollout.
