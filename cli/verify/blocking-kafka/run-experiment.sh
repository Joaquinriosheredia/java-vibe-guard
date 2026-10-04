#!/usr/bin/env bash
# Runs the pre-registered blocking-kafka experiment (PREREGISTRATION.md): variants A, B,
# C, D, E-, E+, 5 repetitions, a fresh JVM and a fresh broker per run. Raw JSON and the
# broker log per run in results/raw/, then evaluate.py writes the summary.
set -euo pipefail
cd "$(dirname "$0")"
REPS="${REPS:-5}"
RAW=results/raw
rm -rf "$RAW" && mkdir -p "$RAW"

(cd app && mvn -q -B -DskipTests package)
JAR=app/target/blocking-kafka-experiment-1.0.0.jar

{
  echo "date_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "commit=$(git rev-parse HEAD)"
  echo "worktree_dirty=$( [ -n "$(git status --porcelain --untracked-files=no -- . ':(exclude)results')" ] && echo yes || echo no)"
  echo "os=$(uname -sr)"
  echo "cpu=$(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | sed 's/^ //')"
  echo "cpus=$(nproc)"
  echo "mem_total=$(free -h | awk '/^Mem:/{print $2}')"
  echo "java=$(java -version 2>&1 | head -1)"
  echo "docker=$(docker version --format '{{.Server.Version}}')"
  echo "spring_boot=3.2.5 spring_kafka=$(unzip -l "$JAR" | grep -o 'spring-kafka-[0-9.]*\.jar' | head -1) kafka_clients=$(unzip -l "$JAR" | grep -o 'kafka-clients-[0-9.]*\.jar' | head -1)"
  echo "broker_image=confluentinc/cp-kafka:7.6.0"
  echo "reps=$REPS warmup_s=20 window_s=120"
} > "$RAW/env.txt"

# Precondition (0): the CLI flags the listener's .join() as blocking-kafka.
node ../../bin/cli.js --json --rule blocking-kafka app/src/main/java > "$RAW/precondition.json" || true

props() {  # b (ms), max.poll.records, max.poll.interval.ms
  case "$1" in
    A)  echo "1500 10 10000" ;;
    B)  echo "500 10 10000" ;;
    C)  echo "1500 1 10000" ;;
    D)  echo "1500 10 30000" ;;
    E-) echo "900 10 10000" ;;
    E+) echo "1100 10 10000" ;;
  esac
}

run() {  # variant rep
  read -r b r m <<< "$(props "$1")"
  java -jar "$JAR" --experiment.variant="$1" --experiment.block-ms="$b" \
    --spring.kafka.consumer.max-poll-records="$r" \
    --spring.kafka.consumer.properties.max.poll.interval.ms="$m" \
    --experiment.output="$RAW/$1-r$2.json" > "$RAW/$1-r$2.log" 2>&1
  echo "$(date -u +%H:%M:%S) $1 rep=$2 done"
}

# Repetitions outermost and variants interleaved, so drift affects every variant alike.
for rep in $(seq 1 "$REPS"); do
  for v in A B C D E- E+; do run "$v" "$rep"; done
done

python3 evaluate.py
