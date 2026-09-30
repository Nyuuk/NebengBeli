# Release dispatch credential contract

The release workflow publishes immutable `sha-<full commit SHA>` images and then sends one `repository_dispatch` event to `Nyuuk/kube-config` for `apps/nebengbeli`.

Before enabling releases, configure the repository secret named `KUBECONFIG_DISPATCH_TOKEN`. It must be either:

- a fine-grained personal access token, or
- a GitHub App installation token

The token must be authorized for the `Nyuuk/kube-config` repository with the minimum repository `Contents: read and write` permission required by GitHub's `repository_dispatch` API. Do not use `GITHUB_TOKEN`: it is intentionally not used for this cross-repository dispatch.

The workflow fails before the dispatch API call when this secret is absent. Never print, commit, or share the token. Rotating or provisioning the secret is an operator action outside this repository.
