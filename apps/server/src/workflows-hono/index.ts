/**
 * Wedai commercial billing workflows.
 *
 * Upstream workflow routes live under `router-hono/workflows`. This module only
 * exposes the billing sub-app so it can be mounted there without pulling a
 * duplicate copy of every upstream workflow tree.
 */
export { default } from './billing';
