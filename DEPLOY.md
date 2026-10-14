# Deploy Qwirkle Analyzer to Fly.io

## Cost and configuration

Fly.io currently has **no ongoing free tier for new accounts**. Its [free trial](https://fly.io/docs/about/free-trial/) ends after **2 total VM hours or 7 days**, whichever happens first. Adding a payment method ends the trial and starts usage billing. See [cost management](https://fly.io/docs/about/cost-management/) and [current pricing](https://fly.io/docs/about/pricing/). Legacy allowances depend on your account; configuration cannot guarantee a $0 bill.

The checked-in `fly.toml` uses one shared CPU with 256 MB RAM in Dallas (`dfw`), HTTPS, automatic stop when idle, and automatic start on a request. The commands below use `--ha=false` to avoid an additional standby Machine. They allocate a shared IPv4 and a public IPv6, not a paid dedicated IPv4. There is no database, volume, secret, or paid add-on to configure.

Idle shutdown saves compute, but root filesystem storage, bandwidth, and remote builds can still incur charges under Fly's current pricing. It is not a spending cap. The first visitor after idle shutdown may wait briefly for startup, and a single Machine can have brief downtime during deployments. The search runs on visitors' devices, so it does not consume server CPU.

## First deployment

The Fly CLI is already installed on this computer. On a different Mac, install it with `brew install flyctl` if needed. Run the following commands yourself in Terminal, from this checkout. Stop if a command reports an error.

1. Sign in and choose a globally unique app name. Change the example below if it is taken. Keep this Terminal session open so `QWIRKLE_APP` remains defined.

   ```sh
   cd /Users/gary/Documents/QwirkleAnalyzer
   fly auth login
   export QWIRKLE_APP="qwirkle-analyzer"
   npm test
   ```

2. Create the app and public addresses. Choose your intended organization if prompted. These commands are for a new app; do not rerun them for routine updates.

   ```sh
   fly apps create "$QWIRKLE_APP"
   fly ips allocate-v4 --shared --app "$QWIRKLE_APP"
   fly ips allocate-v6 --app "$QWIRKLE_APP"
   ```

3. Deploy the checked-in Dockerfile and configuration. The remote builder means you do not need Docker running locally. You do not need `fly launch`, which could generate different settings. The app name is intentionally supplied with `--app`, so no placeholder edit in `fly.toml` is required.

   ```sh
   fly deploy --app "$QWIRKLE_APP" --remote-only --ha=false
   ```

4. Verify and open the public site.

   ```sh
   fly status --app "$QWIRKLE_APP"
   fly checks list --app "$QWIRKLE_APP"
   fly machine list --app "$QWIRKLE_APP"
   curl --fail --show-error "https://${QWIRKLE_APP}.fly.dev/healthz"
   fly apps open --app "$QWIRKLE_APP"
   ```

   The health endpoint should print `ok`. The Machine list should contain one app Machine. The public URL will be `https://YOUR-APP-NAME.fly.dev`, for example `https://qwirkle-analyzer.fly.dev` if you chose that name. Anyone can use the app without an account. Fly provides HTTPS for the `fly.dev` hostname; no custom domain setup is needed.

   Load the example and click **Find best move** to verify that the browser worker and tile artwork also load. Each visitor's board and rack are saved only in that browser; your localhost data is not automatically copied to the public site.

## Enable automatic deployment from GitHub

`.github/workflows/fly-deploy.yml` deploys every push to `main` after `npm test` passes. It also offers a manual **Run workflow** action for `main`. Other branches cannot deploy production through this workflow. Deployments are serialized, use one Machine (`--ha=false`), and check the public health endpoint after deployment.

Complete the one-time credential setup in your own Terminal. Use your actual existing Fly app name; do not create a new app. `gh` must be logged into a GitHub account with admin access to this repository (`gh auth login` if needed), and `fly` must be signed in (`fly auth login` if needed).

```sh
export QWIRKLE_APP="qwirkle-analyzer" # Replace if you chose a different name.
gh variable set FLY_APP_NAME --body "$QWIRKLE_APP" --repo gary-vladimir/Qwirkle-Analyzer

# Capture the token in memory and send it directly to GitHub's encrypted secret.
# This subshell stops if token creation fails, and does not print or save the token.
(
  set -euo pipefail
  QWIRKLE_DEPLOY_TOKEN="$(fly tokens create deploy --app "$QWIRKLE_APP" --name "GitHub Actions production" --expiry 8760h)"
  test -n "$QWIRKLE_DEPLOY_TOKEN"
  printf '%s' "$QWIRKLE_DEPLOY_TOKEN" | gh secret set FLY_API_TOKEN --repo gary-vladimir/Qwirkle-Analyzer
)
```

The token is scoped to this Fly app and expires after one year. Repeat the token command before expiry to renew the GitHub secret. Never commit the token or paste it into an issue or chat. This follows [Fly's GitHub Actions deployment workflow](https://fly.io/docs/launch/continuous-deployment-with-github-actions/) and [app-scoped token guidance](https://fly.io/docs/security/tokens/).

Commit and push the workflow **and** the Dockerfile, `fly.toml`, `.dockerignore`, server changes, and tests. Those files must exist in GitHub for the runner to build the deployed app. A local commit alone does not trigger GitHub Actions; `git push origin main` does. Merging a pull request into `main` also triggers deployment.

Watch the first run at [GitHub Actions](https://github.com/gary-vladimir/Qwirkle-Analyzer/actions), or use:

```sh
gh run list --workflow fly-deploy.yml --repo gary-vladimir/Qwirkle-Analyzer --limit 5
```

If an initial run fails because credentials were missing, add the variable/secret and rerun that failed run from the Actions page. If Actions is disabled in repository settings, enable GitHub Actions first.

## Manual deployment fallback

Normal updates deploy automatically after a push to `main` once the setup above is complete. To deploy directly from a local checkout instead:

```sh
cd /Users/gary/Documents/QwirkleAnalyzer
export QWIRKLE_APP="qwirkle-analyzer" # Use the name you actually created.
npm test
fly deploy --app "$QWIRKLE_APP" --remote-only --ha=false
```

## Troubleshooting

```sh
fly logs --app "$QWIRKLE_APP"
fly checks list --app "$QWIRKLE_APP"
fly ips list --app "$QWIRKLE_APP"
```

- **Name unavailable:** choose another `QWIRKLE_APP` value before creating the app.
- **Trial exhausted / billing required:** use the Fly dashboard to review the account's trial and billing status. Continued service after the trial requires billing; this code cannot extend the trial.
- **Health check fails:** logs should show the server listening on `0.0.0.0:8080`, matching `internal_port` in `fly.toml`. Look for container startup errors.
- **Unexpected extra Machines:** for this stateless app, `fly scale count 1 --app "$QWIRKLE_APP"` reduces the app to one Machine. Keep `--ha=false` on deployments.
- **Unexpected IP charge:** `fly ips list` should show a shared IPv4. Do not allocate a dedicated IPv4 for this app.
- **Region unavailable:** change `primary_region` in `fly.toml` to an available nearby region and retry the initial deploy.

## Optional local container check

With Docker running:

```sh
docker build -t qwirkle-analyzer .
docker run --rm --name qwirkle-analyzer-preview -p 127.0.0.1:8080:8080 qwirkle-analyzer
```

Open `http://127.0.0.1:8080`. Ctrl+C stops the temporary container. This local check does not publish the app.
