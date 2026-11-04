# D0 runbook: one-time Google Cloud setup for the API

Status: **draft for audit.** Nothing here has been executed. The repository
owner runs every step with their own account; no credentials, key values or
Google Cloud access are ever shared with the author of this file.

This runbook creates everything the API needs on Cloud Run before the first
real deployment: APIs, image registry, two service accounts, two secrets,
keyless GitHub deployment (Workload Identity Federation), the initial service
and its public invoker binding, and the cost controls. `service.yaml` and
`deploy.yml` (later steps) use the names fixed in section 1 exactly.

## 0. Rules for whoever runs this

- Run commands in your own terminal or Cloud Shell. Do not paste key values,
  tokens or connection strings into the chat, into a commit, into an issue or
  into a GitHub Actions secret.
- Secret values are typed into a hidden prompt and piped to Secret Manager
  (step 6). They never go through Railway, the repository or any file.
- Only identifiers may be committed (project id, project number, service
  account e-mails, the WIF provider resource, secret names and version
  numbers). Never a key, a token or a service-account JSON file.
- If a command is denied by an organization policy or a missing permission,
  stop and report the exact message. Do not work around it.

## 1. Canonical names

Every later file uses these names without variation.

| Item | Name |
| --- | --- |
| Project | "AI Provider Portafolio" (`PROJECT_ID`, `PROJECT_NUMBER`: record both) |
| Region | `southamerica-east1` |
| Cloud Run service | `ai-finance-api` |
| Artifact Registry repository (Docker) | `ai-finance` |
| Runtime service account | `ai-finance-run` |
| Deploy service account | `ai-finance-deploy` |
| Workload Identity pool | `github-actions` |
| Workload Identity provider | `github-nestjs-ai-provider-finance` |
| Secret: Gemini key | `gemini-api-key-cloudrun` |
| Secret: Supabase publishable key | `supabase-publishable-key-cloudrun` |
| Deploy workflow file | `.github/workflows/deploy.yml` |

Shell variables used below (set them once per session):

```bash
export PROJECT_ID="<project id>"
export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
export REGION="southamerica-east1"
export SERVICE="ai-finance-api"
export AR_REPO="ai-finance"
export RUN_SA="ai-finance-run@${PROJECT_ID}.iam.gserviceaccount.com"
export DEPLOY_SA="ai-finance-deploy@${PROJECT_ID}.iam.gserviceaccount.com"
export POOL="github-actions"
export PROVIDER="github-nestjs-ai-provider-finance"
export GH_REPO="ArkonysDevJ/nestjs-ai-provider-finance"
export GH_OWNER_ID="73614503"
export GH_REPO_ID="$(gh api "repos/${GH_REPO}" --jq .id)"
gcloud config set project "$PROJECT_ID"
```

`GH_OWNER_ID` is the numeric id of the `ArkonysDevJ` account; confirm it with
`gh api users/ArkonysDevJ --jq .id` before continuing.

## 2. Before you start (checks, no changes)

1. Supabase: confirm in the dashboard that the project allows **more than one
   publishable key**. The plan to give each consumer its own key depends on it.
   If it allows only one, stop and tell the author: the key rotation plan
   changes (a single rotation for all consumers after Railway is retired).
2. Organization policy: confirm nothing blocks granting `allUsers` the invoker
   role (domain-restricted sharing). The billing account has no organization,
   so this is unlikely. Check in the console under IAM and Admin, Organization
   Policies.
3. Confirm the existing USD 5 account budget and its alerts (50, 90, 100 and
   150 percent) are still in place. They are kept.

## 3. Enable the APIs

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iamcredentials.googleapis.com \
  iam.googleapis.com \
  sts.googleapis.com
```

`sts.googleapis.com` and `iam.googleapis.com` are needed by Workload Identity
Federation. Secret Manager is currently disabled in this project.

## 4. Artifact Registry repository

```bash
gcloud artifacts repositories create "$AR_REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --description="API images for ai-finance-api"
```

## 5. Service accounts

```bash
gcloud iam service-accounts create ai-finance-run \
  --display-name="ai-finance-api runtime"

gcloud iam service-accounts create ai-finance-deploy \
  --display-name="ai-finance-api deployer (GitHub Actions via WIF)"
```

The runtime account is dedicated: the default Compute Engine account is not
used. It receives no project-level role. Its only permission is secret access,
granted per secret in step 6.

## 6. Secrets (Secret Manager)

Create the two secret containers first, then load the values yourself.

```bash
gcloud secrets create gemini-api-key-cloudrun \
  --replication-policy=user-managed --locations="$REGION"

gcloud secrets create supabase-publishable-key-cloudrun \
  --replication-policy=user-managed --locations="$REGION"
```

### 6.1 Create the keys

- **Gemini key.** Create a new API key for this project (name it for example
  `ai-finance-cloudrun`) and restrict it to the **Generative Language API**
  only. This is a new key; the current one (used by Railway) is not reused and
  is deleted during the Railway retirement.
- **Supabase key.** In the Supabase dashboard create a new **publishable** key
  (for example `ai-finance-api-cloudrun`) for the Cloud Run API only. The web
  app and the Bruno collection get their own keys later.

### 6.2 Load the values (hidden prompt, nothing is echoed)

```bash
read -rs -p "Gemini key: " V; echo
printf %s "$V" | gcloud secrets versions add gemini-api-key-cloudrun --data-file=-
unset V

read -rs -p "Supabase publishable key: " V; echo
printf %s "$V" | gcloud secrets versions add supabase-publishable-key-cloudrun --data-file=-
unset V
```

Record the **version number** of each secret (the first one is `1`). The
deployment pins versions; `latest` is never used.

```bash
gcloud secrets versions list gemini-api-key-cloudrun
gcloud secrets versions list supabase-publishable-key-cloudrun
```

### 6.3 Grant access per secret (not per project)

```bash
for S in gemini-api-key-cloudrun supabase-publishable-key-cloudrun; do
  gcloud secrets add-iam-policy-binding "$S" \
    --member="serviceAccount:${RUN_SA}" \
    --role="roles/secretmanager.secretAccessor"
done
```

## 7. Create the service (placeholder image)

Cloud Run needs an existing service so the URL is reserved and the deploy
account can be scoped to it. Use Google's public sample image; the real image
arrives with the first deployment.

```bash
gcloud run deploy "$SERVICE" \
  --image=us-docker.pkg.dev/cloudrun/container/hello \
  --region="$REGION" \
  --service-account="$RUN_SA" \
  --max-instances=2 \
  --min-instances=0

gcloud run services describe "$SERVICE" --region="$REGION" \
  --format='value(status.url)'
```

Record the URL. The monitor, the keep-alive workflow and the web app point to
it. Later, `gcloud run services replace` updates this same service, so the URL
should not change. Confirm that after the first real deployment.

### 7.1 Public invoker

The app enforces access itself (JWT guard and rate limiting), so the service
is publicly invokable.

```bash
gcloud run services add-iam-policy-binding "$SERVICE" \
  --region="$REGION" \
  --member="allUsers" \
  --role="roles/run.invoker"
```

`gcloud run services replace` does not change the IAM policy of a service, so
this binding stays in place across deployments. If an organization policy
blocks this command, stop and report it.

## 8. Deploy account permissions (least privilege)

```bash
# Update only this service.
gcloud run services add-iam-policy-binding "$SERVICE" \
  --region="$REGION" \
  --member="serviceAccount:${DEPLOY_SA}" \
  --role="roles/run.developer"

# Act as the runtime account, and only that account.
gcloud iam service-accounts add-iam-policy-binding "$RUN_SA" \
  --member="serviceAccount:${DEPLOY_SA}" \
  --role="roles/iam.serviceAccountUser"

# Write images to this repository only.
gcloud artifacts repositories add-iam-policy-binding "$AR_REPO" \
  --location="$REGION" \
  --member="serviceAccount:${DEPLOY_SA}" \
  --role="roles/artifactregistry.writer"
```

The deploy account has no secret access and no project-level role.

## 9. Workload Identity Federation (no service-account keys)

```bash
gcloud iam workload-identity-pools create "$POOL" \
  --location=global \
  --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
  --location=global \
  --workload-identity-pool="$POOL" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref,attribute.job_workflow_ref=assertion.job_workflow_ref" \
  --attribute-condition="assertion.repository_id == '${GH_REPO_ID}' && assertion.repository_owner_id == '${GH_OWNER_ID}' && assertion.ref == 'refs/heads/main' && assertion.job_workflow_ref == '${GH_REPO}/.github/workflows/deploy.yml@refs/heads/main'"
```

The condition requires all four at once: numeric repository id, numeric owner
id, the `main` ref and the deploy workflow file. Numeric ids are used because a
repository name can be re-registered after a rename or deletion.

Allow the deploy account to be impersonated, filtered by repository id (not the
whole pool):

```bash
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository_id/${GH_REPO_ID}"
```

Record the provider resource name (an identifier, safe to commit):

```bash
gcloud iam workload-identity-pools providers describe "$PROVIDER" \
  --location=global --workload-identity-pool="$POOL" \
  --format='value(name)'
```

The event filter (only a push to `main`, after CI is green for the same SHA)
lives in the job condition of `deploy.yml`, not here.

## 10. Cost controls

1. **Daily quota for Gemini.** Set a daily cap on `GenerateContent` requests of
   the Generative Language API for this project, with the value chosen by the
   owner. Console path: IAM and Admin, Quotas and System Limits, filter by
   "Generative Language API". Record the value set and the exact quota name
   used. *Not verified:* whether a quota override applies to a key issued from
   AI Studio in this project. Test it after setting it and note the result.
2. **Project spending cap.** In the console (Billing, Budgets and alerts, or the
   caps feature shown under "Budgets and caps"), create a cap at project level
   with the threshold chosen by the owner. Because Cloud Run and the Gemini key
   share this project, reaching the cap may pause both and take the demo down.
   That risk is accepted, but the behavior must be recorded here:
   - what exactly the cap pauses (Cloud Run, Gemini calls, everything);
   - how it is lifted, and by whom;
   - what "resets at the start of each month" means in practice.
   If the mechanism turns out to be incompatible with the demo, stop and report.
3. The existing USD 5 account budget stays as it is.

## 11. Verification (no secret values are printed)

```bash
# The service answers (placeholder image) and the URL is recorded.
curl -s -o /dev/null -w '%{http_code}\n' "$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')"

# The runtime account is the one in use and it is not the default one.
gcloud run services describe "$SERVICE" --region="$REGION" \
  --format='value(spec.template.spec.serviceAccountName)'

# Secret access is per secret; list who can read each one.
gcloud secrets get-iam-policy gemini-api-key-cloudrun
gcloud secrets get-iam-policy supabase-publishable-key-cloudrun

# The deploy account can impersonate only through the filtered principalSet.
gcloud iam service-accounts get-iam-policy "$DEPLOY_SA"

# The deploy account acts as the runtime account only.
gcloud iam service-accounts get-iam-policy "$RUN_SA"
```

## 12. What to hand back to the author

Identifiers only, never values:

- `PROJECT_ID` and `PROJECT_NUMBER`
- the Cloud Run service URL
- the **version number** of each of the two secrets
- `GH_REPO_ID` (numeric)
- the WIF provider resource name from step 9
- confirmation of each step, and the results recorded in section 10

With these, `service.yaml` (version-pinned secrets, runtime account) and
`deploy.yml` (provider and deploy account) are completed.

## 13. Open items (not verified)

| Item | What must be confirmed |
| --- | --- |
| Project cap | What it pauses, how it is lifted (section 10.2) |
| Gemini daily quota | Where it is set for an AI Studio key, and that it works (section 10.1) |
| Organization policy | That `allUsers` can be granted the invoker role (section 7.1) |
| Service URL | That it is unchanged after the first `services replace` |
| Image pull | That Cloud Run can pull from the `ai-finance` repository in this project with its default service agent; if the first deployment reports a pull error, report it before adding any role |
| Several publishable keys | That Supabase allows more than one (section 2) |
