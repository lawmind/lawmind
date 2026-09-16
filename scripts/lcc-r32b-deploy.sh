#!/usr/bin/env bash
# LCC R32B — deploy an exact, pushed commit to the Gate-C hosts.
#
#   lcc-r32b-deploy.sh <sha> [--restart-api]
#
# Refuses a SHA that origin/main does not contain: a working tree is never
# deployed. Ships only what the API, migrations and release tooling import,
# installs the API's dependency closure, flips /opt/lawmind/current, and with
# --restart-api points the service's release identity and model cache at the new
# directory and restarts it.
set -euo pipefail
cd "$(dirname "$0")/.."
SHA=$(git rev-parse --short=8 "$1")
FULL=$(git rev-parse "$1")
git fetch -q origin
git merge-base --is-ancestor "$FULL" origin/main || { echo "refusing: $FULL is not on origin/main"; exit 2; }
K="$HOME/.lawmind-gatec/lawmind-gatec-202609161754"
O=(-i "$K" -o UserKnownHostsFile="$HOME/.lawmind-gatec/known_hosts" -o BatchMode=yes)
TAR=$(mktemp)
git archive --format=tar "$FULL" -- package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json .nvmrc \
  packages services/api services/embed/src services/embed/package.json services/ingest/src \
  services/ingest/package.json services/ingest/tsconfig.json scripts/lib ':(glob)scripts/lcc-*' \
  scripts/resource-gate.mjs apps/admin/package.json apps/mobile/package.json \
  services/cron/package.json services/harness/package.json > "$TAR"
for h in 178.128.209.91 157.245.156.133; do
  ssh "${O[@]}" "deploy@$h" "mkdir -p /opt/lawmind/$SHA && tar -x -C /opt/lawmind/$SHA && echo $FULL > /opt/lawmind/$SHA/RELEASE_SHA && cd /opt/lawmind/$SHA && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=1 pnpm install --frozen-lockfile --filter @lawmind/api... --filter @lawmind/db 2>&1 | tail -1 && ln -sfn /opt/lawmind/$SHA /opt/lawmind/current && echo \"$h -> $SHA\"" < "$TAR" &
done
wait
rm -f "$TAR"
if [ "${2:-}" = "--restart-api" ]; then
  ssh "${O[@]}" deploy@178.128.209.91 "sudo install -d -o lawmind -g lawmind /opt/lawmind/$SHA/.models && sudo sed -i 's#/opt/lawmind/[0-9a-f]*/.models#/opt/lawmind/$SHA/.models#' /etc/systemd/system/lawmind-api.service && sudo sed -i 's#^LAWMIND_RELEASE_ID=.*#LAWMIND_RELEASE_ID=$FULL#; s#^GIT_SHA=.*#GIT_SHA=$FULL#' /etc/lawmind/api.env && sudo systemctl daemon-reload && sudo systemctl restart lawmind-api && sleep 25 && systemctl is-active lawmind-api && curl -s localhost:3000/version"
  echo
fi
