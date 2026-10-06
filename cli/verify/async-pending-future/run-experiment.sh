#!/usr/bin/env bash
# Runs the pre-registered async-returns-pending-future (B0) experiment (PREREGISTRATION.md):
# P, K, N, V, P16 and PN at 20/36/60/120 tasks/s, plus PN at 10, 5 repetitions, a fresh JVM
# per run. Each run is bounded by an external timeout (a deadlock must not hang the batch)
# and recorded in $RAW/runs.jsonl with its status; raw JSON per run in $RAW, then
# evaluate.py writes the summary.
#
# Smoke runs (harness only, never evidence), e.g.:
#   RAW=smoke/raw1 REPS=1 RATES="60" VARIANTS="P PN" EVALUATE=no ./run-experiment.sh
set -uo pipefail
cd "$(dirname "$0")"
REPS="${REPS:-5}"
RATES="${RATES:-20 36 60 120}"
VARIANTS="${VARIANTS:-P K N V P16 PN}"
PN_EXTRA_RATE="${PN_EXTRA_RATE:-10}"
WARMUP="${WARMUP:-5}"
WINDOW="${WINDOW:-30}"
RUN_LIMIT_S="${RUN_LIMIT_S:-120}"
RAW="${RAW:-results/raw}"
EVALUATE="${EVALUATE:-yes}"
rm -rf "$RAW" && mkdir -p "$RAW"

(cd app && mvn -q -B -DskipTests package) || exit 1
JAR=app/target/async-pending-future-experiment-1.0.0.jar
lib() { unzip -l "$JAR" | grep -oE "$1-[0-9][^ ]*\.jar" | head -1; }
{
  echo "date_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "commit=$(git rev-parse HEAD)"
  echo "worktree_dirty=$( [ -n "$(git status --porcelain --untracked-files=no -- . ':(exclude)results' ':(exclude)smoke')" ] && echo yes || echo no)"
  echo "os=$(. /etc/os-release && echo "$PRETTY_NAME") $(uname -sr)"
  echo "cpu=$(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | sed 's/^ //')"
  echo "cpus=$(nproc)"
  echo "java=$(java -version 2>&1 | head -1) | $(java -version 2>&1 | sed -n 2p)"
  echo "spring_boot=3.2.5 $(lib spring-aop) $(lib spring-context) $(lib spring-core)"
  echo "reps=$REPS rates=$RATES pn_extra_rate=$PN_EXTRA_RATE variants=$VARIANTS warmup_s=$WARMUP window_s=$WINDOW run_limit_s=$RUN_LIMIT_S"
} > "$RAW/env.txt"
# Clock preflight (template rule 6), informational.
java ../reactor-block/replication/ClockProbe.java 60 >> "$RAW/env.txt"

# Precondition (0), informational: what CLI 2.2.0 reports on the methods under test.
for r in blocking reactor-block; do
  node ../../bin/cli.js --json --rule "$r" app/src/main/java > "$RAW/precondition-$r.json" 2>/dev/null || true
done

props() {
  case "$1" in
    V) echo "--spring.threads.virtual.enabled=true" ;;
    P16) echo "--spring.threads.virtual.enabled=false --spring.task.execution.pool.core-size=16" ;;
    *) echo "--spring.threads.virtual.enabled=false" ;;
  esac
}

run() {  # variant rate rep
  local id="$1-$2-r$3" status=OK rc start
  start=$(date -u +%H:%M:%S)
  timeout -k 5 "$RUN_LIMIT_S" java -jar "$JAR" --experiment.variant="$1" --experiment.rate="$2" \
    --experiment.warmup-seconds="$WARMUP" --experiment.window-seconds="$WINDOW" \
    --experiment.output="$RAW/$id.json" $(props "$1") > "$RAW/$id.log" 2>&1
  rc=$?
  if [ $rc -eq 124 ] || [ $rc -eq 137 ]; then status=TIMEOUT
  elif [ $rc -ne 0 ] || [ ! -s "$RAW/$id.json" ]; then status=ERROR
  fi
  printf '{"id":"%s","variant":"%s","rate":%s,"rep":%s,"status":"%s","rc":%s,"start_utc":"%s","end_utc":"%s"}\n' \
    "$id" "$1" "$2" "$3" "$status" "$rc" "$start" "$(date -u +%H:%M:%S)" >> "$RAW/runs.jsonl"
  gzip -f "$RAW/$id.json" "$RAW/$id.log" 2>/dev/null
  echo "$(date -u +%H:%M:%S) $id $status"
}

# Repetitions outermost, then the rate, then the variants (PN alone at its extra rate).
for rep in $(seq 1 "$REPS"); do
  if [[ " $VARIANTS " == *" PN "* ]] && [ -n "$PN_EXTRA_RATE" ]; then run PN "$PN_EXTRA_RATE" "$rep"; fi
  for rate in $RATES; do
    for v in $VARIANTS; do run "$v" "$rate" "$rep"; done
  done
done

[ "$EVALUATE" = yes ] && python3 evaluate.py
exit 0
