# D0 runbook: one-time Google Cloud setup for the API

Status: **draft for audit.** Nothing here has been executed. The repository
owner runs every step with their own account; no credentials, key values or
Google Cloud access are ever shared with the author of this file.

**Where to run it:** in Cloud Shell (bash with `gcloud` already signed in to
the project). The owner works on Windows, so commands are written for bash and
are not meant to be run in PowerShell or `cmd`.

This runbook creates everything the API needs on Cloud Run before the first
real deployment: APIs, image registry, two service accounts, two secrets,
keyless GitHub deployment (Workload Identity Federation), the initial service
and its public invoker binding, and the cost controls. `service.yaml` and
`deploy.yml` (later steps) use the names fixed in section 1 exactly.

## 0. Rules for whoever runs this

- Run commands in Cloud Shell. Do not paste key values, tokens or connection
  strings into the chat, into a commit, into an issue or into a GitHub Actions
  secret.
- Secret values are typed into a hidden prompt and piped to Secret Manager
  (section 6). They never go through Railway, the repository or any file.
- Only identifiers may be committed (project id, project number, service
  account e-mails, the WIF provider resource, secret names and version
  numbers). Never a key, a token or a service-account JSON file.
- If a command is denied by an organization policy or a missing permission,
  stop and report the exact message. Do not work around it.

## 1. Canonical names and values

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

Set these once per shell. None of them is a credential.

```bash
export PROJECT_ID="<project id of 'AI Provider Portafolio'>"
export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
export REGION="southamerica-east1"

export SERVICE="ai-finance-api"
export AR_REPO="ai-finance"
export RUNTIME_SA="ai-finance-run"
export DEPLOY_SA="ai-finance-deploy"
export RUNTIME_SA_EMAIL="$RUNTIME_SA@$PROJECT_ID.iam.gserviceaccount.com"
export DEPLOY_SA_EMAIL="$DEPLOY_SA@$PROJECT_ID.iam.gserviceaccount.com"
export SECRET_GEMINI="gemini-api-key-cloudrun"
export SECRET_SUPABASE="supabase-publishable-key-cloudrun"

export WIF_POOL="github-actions"
export WIF_PROVIDER="github-nestjs-ai-provider-finance"

export GH_REPO="ArkonysDevJ/nestjs-ai-provider-finance"
export GH_DEPLOY_WORKFLOW=".github/workflows/deploy.yml"

gcloud config set project "$PROJECT_ID"
```

The numeric GitHub identifiers come from the public GitHub API (no `gh`
needed). Numeric ids survive a rename or re-creation of the repository; a name
does not.

```bash
export GH_REPO_ID="$(curl -s "https://api.github.com/repos/$GH_REPO" | jq -r '.id')"
export GH_OWNER_ID="$(curl -s "https://api.github.com/repos/$GH_REPO" | jq -r '.owner.id')"
echo "repository id: $GH_REPO_ID   owner id: $GH_OWNER_ID"
```

Both must be plain numbers. If either prints `null` or is empty (for example
because of an API rate limit), stop and retry before going on.

## 2. Preconditions (checks, no changes)

1. **Billing.** The billing account linked to the project has a valid payment
   method or active credits.

   ```bash
   gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled,billingAccountName)'
   ```

   Expected: `True` and a billing account name.

2. **Organization policy on public access.** Section 8 grants `allUsers` the
   invoker role. If a policy blocks it (for example Domain Restricted Sharing,
   `iam.allowedPolicyMemberDomains`), stop there and report; do not work around
   it.

   ```bash
   gcloud resource-manager org-policies describe iam.allowedPolicyMemberDomains --project="$PROJECT_ID" --effective 2>&1 | head
   ```

   `--effective` shows the policy that applies to the project, including what it
   inherits from the organization or a folder. Without it the command shows only
   what is defined on the project itself, and an inherited restriction would
   look like "not set".

   Whether the project belongs to an organization:

   ```bash
   gcloud projects describe "$PROJECT_ID" --format='value(parent.type,parent.id)'
   ```

   If this prints nothing, the project has no organization and no organization
   policy can restrict it. The billing account has no organization either, so a
   restriction is unlikely.

   Expected: "not set" or a policy that does not list the project as restricted.
   (The first command may need `roles/orgpolicy.policyViewer`; if it is denied,
   note it and rely on the result of section 8.)

3. **Supabase.** Confirm in the dashboard that the project allows **more than
   one publishable key**. The plan to give each consumer its own key depends on
   it. If it allows only one, stop and tell the author: the key rotation plan
   changes (a single rotation for all consumers after Railway is retired).

4. **Account budget.** The existing USD 5 account budget and its alerts (50, 90,
   100 and 150 percent) are still in place. They are kept.

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

`iam.googleapis.com` and `sts.googleapis.com` are needed for the service
accounts and for Workload Identity Federation (the token exchange). Secret
Manager is currently disabled in this project.

Check: this lists all six.

```bash
gcloud services list --enabled --filter="name:(run OR artifactregistry OR secretmanager OR iamcredentials OR iam OR sts)" --format='value(name)'
```

## 4. Artifact Registry repository

```bash
gcloud artifacts repositories create "$AR_REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --description="API images for ai-finance-api"
```

Images will live at `$REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPO/<name>`.

## 5. Service accounts

Two accounts, neither of them the default Compute Engine account.

```bash
gcloud iam service-accounts create "$RUNTIME_SA" \
  --display-name="ai-finance-api runtime"

gcloud iam service-accounts create "$DEPLOY_SA" \
  --display-name="ai-finance-api deployer (GitHub Actions via WIF)"
```

The runtime account has no project-level role. Its only permission is secret
access, granted per secret in section 6.

## 6. Secrets (Secret Manager)

Create the two secret containers first, then load the values yourself.

```bash
gcloud secrets create "$SECRET_GEMINI" \
  --replication-policy=user-managed --locations="$REGION"

gcloud secrets create "$SECRET_SUPABASE" \
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
printf %s "$V" | gcloud secrets versions add "$SECRET_GEMINI" --data-file=-
unset V

read -rs -p "Supabase publishable key: " V; echo
printf %s "$V" | gcloud secrets versions add "$SECRET_SUPABASE" --data-file=-
unset V
```

### 6.3 Let the runtime account read these two secrets and nothing else

```bash
for S in "$SECRET_GEMINI" "$SECRET_SUPABASE"; do
  gcloud secrets add-iam-policy-binding "$S" \
    --member="serviceAccount:$RUNTIME_SA_EMAIL" \
    --role="roles/secretmanager.secretAccessor"
done
```

### 6.4 Record the version numbers

`service.yaml` pins them (never `latest`), so rotating a key is an explicit,
reversible deployment.

```bash
gcloud secrets versions list "$SECRET_GEMINI" --format='table(name,state,createTime)'
gcloud secrets versions list "$SECRET_SUPABASE" --format='table(name,state,createTime)'
```

Report the version number of each (for example `1`). Do not report a value.

Check: `gcloud secrets get-iam-policy <secret>` lists only the runtime account
for each secret (plus the project owners' inherited access, which is not a
binding on the secret).

## 7. Create the service with the public sample image

This creates the resource that holds the URL and the IAM policy. The image is
Google's public sample, not the application; the deployment workflow replaces
it. The service uses the runtime account from the start, and it is created
**without** public access: exposure is a separate, checked step (section 8).

```bash
gcloud run deploy "$SERVICE" \
  --image="us-docker.pkg.dev/cloudrun/container/hello" \
  --region="$REGION" \
  --service-account="$RUNTIME_SA_EMAIL" \
  --ingress=all \
  --min-instances=0 \
  --max-instances=2 \
  --no-allow-unauthenticated
```

`--max-instances=2` is provisional until `service.yaml` fixes the value.

Record the URL. The monitor, the keep-alive workflow and the web app point to
it:

```bash
gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)'
```

Later, `gcloud run services replace` updates this same service, so the URL
should not change. Confirm that after the first real deployment.

Check that the service runs as the runtime account:

```bash
gcloud run services describe "$SERVICE" --region="$REGION" --format='value(spec.template.spec.serviceAccountName)'
```

Expected: `$RUNTIME_SA_EMAIL`, not `...-compute@developer.gserviceaccount.com`.

## 8. Public invocation

The app enforces access itself (JWT guard and rate limiting), so the service is
publicly invokable.

```bash
gcloud run services add-iam-policy-binding "$SERVICE" \
  --region="$REGION" \
  --member="allUsers" \
  --role="roles/run.invoker"
```

If this is rejected by an organization policy, stop and report the exact error.

Check, with the sample image still running:

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')"
```

Expected: `200`.

`gcloud run services replace` does not change the IAM policy of a service, so
this binding stays in place across deployments.

## 9. Deploy account permissions (least privilege)

Three bindings, each on a single resource, none at project level.

```bash
# Update this one service. This role cannot change the service's IAM policy,
# so the public-access binding from section 8 survives every deployment.
gcloud run services add-iam-policy-binding "$SERVICE" \
  --region="$REGION" \
  --member="serviceAccount:$DEPLOY_SA_EMAIL" \
  --role="roles/run.developer"

# Allow it to deploy revisions that run as the runtime account, and only that one.
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA_EMAIL" \
  --member="serviceAccount:$DEPLOY_SA_EMAIL" \
  --role="roles/iam.serviceAccountUser"

# Push images to this repository only.
gcloud artifacts repositories add-iam-policy-binding "$AR_REPO" \
  --location="$REGION" \
  --member="serviceAccount:$DEPLOY_SA_EMAIL" \
  --role="roles/artifactregistry.writer"
```

The deploy account has no Secret Manager role and no project-level role.

Check each binding with `get-iam-policy` on the same resource. Then check that
neither service account appears in the project policy:

```bash
gcloud projects get-iam-policy "$PROJECT_ID" | grep -c -e "$DEPLOY_SA_EMAIL" -e "$RUNTIME_SA_EMAIL"
```

Expected: `0`. (`grep -c` exits with status 1 when the count is zero; that is
the expected outcome, not an error.)

## 10. Workload Identity Federation (no service-account keys)

GitHub Actions exchanges its OIDC token for a short-lived Google token. No JSON
key exists anywhere.

```bash
gcloud iam workload-identity-pools create "$WIF_POOL" \
  --location=global \
  --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc "$WIF_PROVIDER" \
  --location=global \
  --workload-identity-pool="$WIF_POOL" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref,attribute.job_workflow_ref=assertion.job_workflow_ref" \
  --attribute-condition="assertion.repository_id=='$GH_REPO_ID' && assertion.repository_owner_id=='$GH_OWNER_ID' && assertion.ref=='refs/heads/main' && assertion.job_workflow_ref=='$GH_REPO/$GH_DEPLOY_WORKFLOW@refs/heads/main'"
```

The condition requires all of these at once:

- the repository, by numeric `repository_id` and `repository_owner_id`, not by
  name alone;
- the reference `refs/heads/main`;
- the workflow file that is running, through the `job_workflow_ref` claim, whose
  value has the form `<owner>/<repo>/<path to the workflow file>@<ref>`.

A token that fails any of them is refused by Google before it reaches the
service account.

The token also carries `event_name`, but for a workflow started with
`workflow_run` it is always `workflow_run`, so it cannot tell a push from a pull
request. The event filter (only a push to `main`, after CI is green for the same
SHA) therefore lives in the job condition of `deploy.yml`, evaluated before
authentication, not here.

Allow the federated identity to act as the deploy account, restricted to the
repository attribute, not to the whole pool:

```bash
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA_EMAIL" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$WIF_POOL/attribute.repository_id/$GH_REPO_ID"
```

Check that the binding names a filtered `principalSet`, not the whole pool:

```bash
gcloud iam service-accounts get-iam-policy "$DEPLOY_SA_EMAIL"
```

Record the provider resource name (an identifier, safe to commit):

```bash
gcloud iam workload-identity-pools providers describe "$WIF_PROVIDER" \
  --location=global --workload-identity-pool="$WIF_POOL" --format='value(name)'
```

It has the form
`projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/<pool>/providers/<provider>`.

## 11. Cost controls

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

## 12. What to report back

Identifiers only; none of these is a secret. Never report a key value or a
token.

| Value | Where it is used |
| --- | --- |
| Project id and project number | `service.yaml`, deploy workflow |
| Service URL (section 7) | keep-alive workflow, monitor, web app API URL |
| Runtime account e-mail | `service.yaml` |
| Deploy account e-mail | deploy workflow |
| WIF provider resource name (section 10) | deploy workflow |
| Artifact Registry path (section 4) | deploy workflow |
| Secret names and the pinned version number of each (section 6.4) | `service.yaml` |
| Repository id and owner id (section 1) | for the audit record |
| Whether section 8 (public invocation) succeeded, with the `200` check | go / no-go |
| Results recorded in section 11 (quota, cap) | for the audit record |

## 13. Verification summary

- [ ] Billing enabled; organization policy checked with `--effective`.
- [ ] Six APIs enabled.
- [ ] Docker repository in `southamerica-east1`.
- [ ] Runtime account has `secretAccessor` on the two secrets and no project role.
- [ ] Deploy account has the three single-resource bindings and does not appear in the project policy.
- [ ] The service runs as the runtime account and answers `200` to the public sample.
- [ ] `allUsers` holds `roles/run.invoker` on the service only.
- [ ] The provider condition holds the repository ids, the branch and the workflow file.
- [ ] The `workloadIdentityUser` binding is on a `principalSet` filtered by `repository_id`.
- [ ] Both secrets have a version, and both version numbers are recorded.
- [ ] Quota and project cap recorded (section 11).

## 14. Undo

Everything in this runbook is reversible without touching Supabase:

```bash
gcloud run services delete "$SERVICE" --region="$REGION"
gcloud artifacts repositories delete "$AR_REPO" --location="$REGION"
gcloud secrets delete "$SECRET_GEMINI"
gcloud secrets delete "$SECRET_SUPABASE"
gcloud iam workload-identity-pools delete "$WIF_POOL" --location=global
gcloud iam service-accounts delete "$DEPLOY_SA_EMAIL"
gcloud iam service-accounts delete "$RUNTIME_SA_EMAIL"
```

The two new keys are revoked separately, outside `gcloud`:

- the new **Gemini** key (for example `ai-finance-cloudrun`), in the Google
  Cloud console under APIs and Services, Credentials, or in AI Studio;
- the new **Supabase publishable** key (for example `ai-finance-api-cloudrun`),
  in the Supabase dashboard.

Deleted workload identity pools and service accounts stay in soft-delete for
about 30 days, and during that time their ID cannot be reused. To run the setup
again after an undo, use different names or restore them with `undelete`.

## Points for the auditor

Precedent, verified in a previous deployment of the same design
(`nestjs-rls-multitenant-bookings`, 2 November 2026):

1. The deploy account needs **no Secret Manager role**. Deploying a revision that
   references a secret needs only that the runtime account can read it. The
   first deployment there succeeded with no Secret Manager role on the deploy
   account.
2. `job_workflow_ref` for a workflow started by `workflow_run` names the deploy
   workflow file on the default branch. Google accepted the token under the
   provider condition of section 10, which includes that claim.

Open in this runbook, not covered by that precedent:

3. **Two secrets.** The precedent had one secret. Here there are two (the Gemini
   key and the Supabase publishable key), each with its own per-secret
   `secretAccessor` binding and its own pinned version. Confirm the bindings in
   section 6.3 are enough and that nothing needs a role on the deploy account.
4. **Daily quota for Gemini** (section 11.1). Whether a quota override applies
   to a key issued from AI Studio in this project, and the exact quota name,
   are not verified.
5. **Project spending cap** (section 11.2). What it pauses, how it is lifted and
   what the monthly reset means are not verified. Cloud Run and Gemini share the
   project, so a pause may take the demo down; that risk is accepted.
6. **Image pull.** Whether Cloud Run can pull from the `ai-finance` repository
   in this project using its default service agent is not verified. If the first
   deployment reports a pull error, it is reported before any role is added.
