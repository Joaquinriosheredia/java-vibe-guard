#!/usr/bin/env bash
# Runs the pre-registered blocking experiment (PREREGISTRATION.md): variants A-D at
# 20/36/60/120 tasks/s, 5 repetitions, a fresh JVM per run; plus the exploratory B0
# at 60/120. Raw JSON per run in results/raw/, then evaluate.py writes the summary.
set -euo pipefail
cd "$(dirname "$0")"
REPS="${REPS:-5}"
RATES="${RATES:-20 36 60 120}"
RAW=results/raw
rm -rf "$RAW" && mkdir -p "$RAW"

(cd app && mvn -q -B -DskipTests package)
JAR=app/target/blocking-experiment-1.0.0.jar

{
  echo "date_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "commit=$(git rev-parse HEAD)"
  echo "worktree_dirty=$( [ -n "$(git status --porcelain --untracked-files=no -- . ':(exclude)results')" ] && echo yes || echo no)"
  echo "os=$(uname -sr)"
  echo "cpu=$(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | sed 's/^ //')"
  echo "cpus=$(nproc)"
  echo "mem_total=$(free -h | awk '/^Mem:/{print $2}')"
  echo "java=$(java -version 2>&1 | head -1)"
  echo "spring_boot=3.2.5"
  echo "reps=$REPS rates=$RATES warmup_s=5 window_s=30"
} > "$RAW/env.txt"

props() {
  case "$1" in
    A|B|B0) echo "--spring.threads.virtual.enabled=false" ;;
    C) echo "--spring.threads.virtual.enabled=false --spring.task.execution.pool.core-size=16" ;;
    D) echo "--spring.threads.virtual.enabled=true" ;;
  esac
}

run() {  # variant rate rep
  java -jar "$JAR" --experiment.variant="$1" --experiment.rate="$2" \
    --experiment.output="$RAW/$1-$2-r$3.json" $(props "$1")
  echo "$(date -u +%H:%M:%S) $1 rate=$2 rep=$3 done"
}

# Repetitions outermost and variants interleaved, so drift affects every variant alike.
for rep in $(seq 1 "$REPS"); do
  for rate in $RATES; do
    for v in A B C D; do run "$v" "$rate" "$rep"; done
  done
  for rate in 60 120; do run B0 "$rate" "$rep"; done
done

python3 evaluate.py
