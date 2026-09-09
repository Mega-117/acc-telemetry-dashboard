# Develop frontend publishing (PIP-402)

Generate manually in `nuxt` with `npm run generate`, then commit the source changes and generated `docs` before pushing develop. CI never runs generate. An old docs directory is still an old frontend even when source tests pass.

Push develop publishes to Cloudflare only after both CI prerequisites succeed. Push main publishes to GitHub Pages only. Other events do not publish either frontend. The same generated files use `/acc-telemetry-dashboard/docs/` on both hosts.

Cloudflare setup: Pages Direct Upload project `racercore-develop`, production branch `develop`. Repository Actions variables: `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_PROJECT_NAME`. Repository secret: `CLOUDFLARE_API_TOKEN` with Pages Edit in the selected account. Never commit the token. The Codex plugin login does not authenticate Actions.

The packaging command is `node nuxt/scripts/cloudflare-package.mjs docs <fresh-output-directory>`, run from the repository root. Its output parent must exist. It copies public assets without rebuilding and refuses existing output directories, links and unexpected file types. The output directory must be outside docs. These checks do not prove freshness against all source code or replace checking what is generated.

After preview testing and explicit acceptance, integrate the task branch into develop and push. Promote accepted develop to main only through `git merge --ff-only develop` from a clean main checkout, then explicitly push main and return to develop. Stop on divergence; never force-push.

The stable address is `https://racercore-develop.pages.dev/acc-telemetry-dashboard/docs/`. Do not point testers there until deployment and Electron login/dashboard/overlay checks pass. Then change only `FRONTEND_TARGET=docs` and `FRONTEND_URL_DOCS` in the agreed develop installation; keep update manifests and localhost configuration. Firebase data remains shared.

Task worktrees and temporary preview deployments remain until verified integration. Afterwards remove only task-owned resources and merged temporary branches, retaining test results, commit hashes and the stable deployment in Linear/wiki.
