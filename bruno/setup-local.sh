#!/usr/bin/env bash
# Local-only fixtures for the Bruno collection, used by CI and by developers.
#
#   bash bruno/setup-local.sh users      create the two local test users
#   bash bruno/setup-local.sh fixtures   create one transaction and print the two
#                                        ids that the "reclassify" request needs
#
# It talks only to a local Supabase stack and a local API, and refuses to run
# against anything else. It signs users up through the public sign-up endpoint
# with the publishable key; it never uses an admin key. The credentials below
# are the example ones that the collection already uses in its sign-in requests;
# they exist only inside the local stack.
set -euo pipefail

: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY is required}"
API_URL="${API_URL:-http://127.0.0.1:3000/v1}"

case "$SUPABASE_URL" in
  http://127.0.0.1:* | http://localhost:*) ;;
  *) echo "Refusing to run: SUPABASE_URL is not a local address." >&2; exit 1 ;;
esac
case "$API_URL" in
  http://127.0.0.1:* | http://localhost:*) ;;
  *) echo "Refusing to run: API_URL is not a local address." >&2; exit 1 ;;
esac

EMAIL_A="demo@example.com"
PASSWORD_A="demo1234"
EMAIL_B="demo-b@example.com"
PASSWORD_B="demo4321"

json_credentials() {
  jq -n --arg email "$1" --arg password "$2" '{email: $email, password: $password}'
}

signup() {
  # An already registered user is not an error: the sign-in check below decides.
  json_credentials "$1" "$2" | curl --silent --show-error \
    --output /dev/null \
    --request POST "${SUPABASE_URL}/auth/v1/signup" \
    --header "apikey: ${SUPABASE_ANON_KEY}" \
    --header 'Content-Type: application/json' \
    --data @- || true
}

access_token() {
  json_credentials "$1" "$2" | curl --fail --silent --show-error \
    --request POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
    --header "apikey: ${SUPABASE_ANON_KEY}" \
    --header 'Content-Type: application/json' \
    --data @- | jq -r '.access_token'
}

case "${1:-}" in
  users)
    signup "$EMAIL_A" "$PASSWORD_A"
    signup "$EMAIL_B" "$PASSWORD_B"
    for pair in "$EMAIL_A:$PASSWORD_A" "$EMAIL_B:$PASSWORD_B"; do
      token="$(access_token "${pair%%:*}" "${pair#*:}")"
      [ -n "$token" ] && [ "$token" != "null" ] || { echo "Could not sign in a local user." >&2; exit 1; }
    done
    echo "Local users ready."
    ;;
  fixtures)
    token="$(access_token "$EMAIL_A" "$PASSWORD_A")"
    created="$(curl --fail --silent --show-error \
      --request POST "${API_URL}/transactions" \
      --header "Authorization: Bearer ${token}" \
      --header 'Content-Type: application/json' \
      --data '{"description":"Fixture transaction","amount":10,"type":"expense"}')"
    transaction_id="$(printf '%s' "$created" | jq -r '.id')"
    current_category_id="$(printf '%s' "$created" | jq -r '.category_id')"
    # The reclassify request must change the category: the database marks a
    # transaction as manual only when the category changes. The fake classifier
    # files this transaction under "Otros", so the target is any other category
    # that applies to an expense.
    category_id="$(curl --fail --silent --show-error --get \
      "${SUPABASE_URL}/rest/v1/categories" \
      --data-urlencode 'select=id' \
      --data-urlencode 'applies_to=in.(expense,both)' \
      --data-urlencode "id=neq.${current_category_id}" \
      --data-urlencode 'order=name.asc' \
      --data-urlencode 'limit=1' \
      --header "apikey: ${SUPABASE_ANON_KEY}" \
      --header "Authorization: Bearer ${token}" | jq -r '.[0].id')"
    for value in "$transaction_id" "$current_category_id" "$category_id"; do
      [ -n "$value" ] && [ "$value" != "null" ] || { echo "Could not create the fixtures." >&2; exit 1; }
    done
    [ "$category_id" != "$current_category_id" ] || { echo "The fixtures need a different category." >&2; exit 1; }
    printf 'SELECT_TRANSACTION_ID=%s\nMANUAL_CATEGORY_ID=%s\n' "$transaction_id" "$category_id"
    ;;
  *)
    echo "Usage: bash bruno/setup-local.sh users|fixtures" >&2
    exit 2
    ;;
esac
