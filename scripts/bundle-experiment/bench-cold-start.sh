#!/usr/bin/env bash
# Cold-start benchmark for npx-vended CLIs.
# Usage: bench-cold-start.sh <npm-spec-or-tarball> [runs] [args...]
# Times `npx --yes <spec> <args>` with a fresh npm cache per run (true cold start),
# then one warm run (same cache) to isolate module-load/boot time from install time.
set -euo pipefail

SPEC="$1"
RUNS="${2:-3}"
shift 2 || true
ARGS=("${@:---help}")

BASE="$(mktemp -d "${TMPDIR:-/tmp}/cli-bench.XXXXXX")"
trap 'rm -rf "$BASE"' EXIT

now_ms() { node -e 'process.stdout.write(String(Date.now()))'; }

run_npx() {
  local cache="$1"; shift
  if [[ "$SPEC" == *.tgz ]]; then
    npm_config_cache="$cache" npx --yes -p "$SPEC" sanity "$@"
  else
    npm_config_cache="$cache" npx --yes "$SPEC" "$@"
  fi
}

echo "spec: $SPEC | args: ${ARGS[*]} | runs: $RUNS"
echo "workdir: $BASE"

cold_times=()
for i in $(seq 1 "$RUNS"); do
  CACHE="$BASE/cache-$i"
  mkdir -p "$CACHE"
  t0=$(now_ms)
  if ! run_npx "$CACHE" "${ARGS[@]}" >"$BASE/out-$i.log" 2>&1; then
    echo "RUN $i FAILED — output:"
    tail -20 "$BASE/out-$i.log"
    exit 1
  fi
  t1=$(now_ms)
  ms=$((t1 - t0))
  cold_times+=("$ms")
  # footprint: what npx actually materialized on disk
  npx_dir="$CACHE/_npx"
  if [ -d "$npx_dir" ]; then
    size=$(du -sk "$npx_dir" | cut -f1)
    pkgs=$(find "$npx_dir" -name package.json -not -path '*/node_modules/*/node_modules/*' | wc -l | tr -d ' ')
    deep_pkgs=$(find "$npx_dir" -name package.json -path '*/node_modules/*' -not -path '*/__tests__/*' | grep -c 'node_modules/[^/]*/package.json$\|node_modules/@[^/]*/[^/]*/package.json$' || true)
  else
    size=0; pkgs=0; deep_pkgs=0
  fi
  echo "cold run $i: ${ms}ms | installed: $((size / 1024))MB | top-level pkg jsons: $deep_pkgs"

  # warm run reusing this run's cache (only after first run, once)
  if [ "$i" = "1" ]; then
    w0=$(now_ms)
    run_npx "$CACHE" "${ARGS[@]}" >/dev/null 2>&1
    w1=$(now_ms)
    echo "warm run  : $((w1 - w0))ms (install cached; measures npx overhead + boot)"
  fi
done

# median
median=$(printf '%s\n' "${cold_times[@]}" | sort -n | awk '{a[NR]=$1} END {print (NR%2) ? a[(NR+1)/2] : int((a[NR/2]+a[NR/2+1])/2)}')
echo "RESULT spec=$SPEC cold_median_ms=$median installed_mb=$((size / 1024))"
