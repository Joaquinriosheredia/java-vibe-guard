#!/usr/bin/env bash
# Runs the pre-registered reactor-block REPLICATION (replication/PREREGISTRATION.md): A1, A3
# and B at λ = 10, 50, 400, 5 repetitions; fresh JVMs (downstream, app, generator), same app,
# generator and harness as ../run-experiment.sh (from ..). Per-run harness timeout: a run
# that hangs is killed, recorded as TIMEOUT and the batch continues. Raw data per run in
# $RAW, one status line per run in $RAW/runs.jsonl, then evaluate.py writes the summary.
#
# Smoke runs (harness validation only, never evidence) override the defaults, e.g.:
#   RAW=smoke/raw REPS=1 LAMBDAS="50" VARIANTS="A3 B" WINDOW=10 EVALUATE=no ./run-experiment.sh
set -uo pipefail
cd "$(dirname "$0")/.."
REPS="${REPS:-5}"
LAMBDAS="${LAMBDAS:-10 50 400}"
VARIANTS="${VARIANTS:-A1 A3 B}"
WARMUP="${WARMUP:-10}"
WINDOW="${WINDOW:-60}"
PROBE_RATE=5
GEN_LIMIT_S="${GEN_LIMIT_S:-150}"  # hard limit per run for the generator (expected ~82 s); lowered only to test the timeout in smoke runs
STOP_GRACE_S=10       # SIGTERM, then SIGKILL after this
READY_LIMIT_S=60
RAW="${RAW:-replication/results/raw}"
EVALUATE="${EVALUATE:-yes}"
rm -rf "$RAW" && mkdir -p "$RAW"

(cd app && mvn -q -B -DskipTests package) || exit 1
JAR=app/target/reactor-block-experiment-1.0.0.jar
(cd generator && javac -d . LoadGenerator.java) || exit 1

# Pools fixed for every variant (PREREGISTRATION.md, Setup).
APP_PROPS=(
  -Dreactor.netty.ioWorkerCount=4
  -Dreactor.schedulers.defaultPoolSize=4
  -Dreactor.schedulers.defaultBoundedElasticSize=40
  -Dreactor.schedulers.defaultBoundedElasticQueueSize=100000
  -Dreactor.netty.pool.maxConnections=500
)

lib() { unzip -l "$JAR" | grep -oE "$1-[0-9][^ ]*\.jar" | head -1; }
{
  echo "date_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "commit=$(git rev-parse HEAD)"
  echo "worktree_dirty=$( [ -n "$(git status --porcelain --untracked-files=no -- . ':(exclude)results' ':(exclude)smoke' ':(exclude)replication/results' ':(exclude)replication/smoke')" ] && echo yes || echo no)"
  echo "os=$(. /etc/os-release && echo "$PRETTY_NAME") $(uname -sr)"
  echo "cpu=$(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | sed 's/^ //')"
  echo "cpus=$(nproc)"
  echo "mem_total=$(free -h | awk '/^Mem:/{print $2}')"
  echo "java=$(java -version 2>&1 | head -1) | $(java -version 2>&1 | sed -n 2p)"
  echo "spring_boot=3.2.5 $(lib spring-webflux) $(lib reactor-core) $(lib reactor-netty-core) $(lib reactor-netty-http) $(lib netty-transport-native-epoll) $(lib tomcat-embed-core)"
  echo "app_props=${APP_PROPS[*]} server.tomcat.threads.max=200 heap=512m"
  echo "replication_of=../PREREGISTRATION.md (c934bd7)"
  echo "reps=$REPS lambdas=$LAMBDAS variants=$VARIANTS warmup_s=$WARMUP window_s=$WINDOW probe_rate=$PROBE_RATE gen_limit_s=$GEN_LIMIT_S"
} > "$RAW/env.txt"

# Instrument change 4: clock preflight, informational (decides nothing).
java replication/ClockProbe.java 60 >> "$RAW/env.txt"

# Precondition (0): what the CLI flags as reactor-block in the app's sources.
node ../../bin/cli.js --json --rule reactor-block app/src/main/java > "$RAW/precondition.json" 2>/dev/null || true

path_of() { case "$1" in A1) echo /a1 ;; A2) echo /a2 ;; A3) echo /a3 ;; A4) echo /a4 ;; B) echo /b ;; C) echo /c ;; esac; }
web_of() { [ "$1" = C ] && echo servlet || echo reactive; }

port_free() { ! (exec 3<>/dev/tcp/127.0.0.1/"$1") 2>/dev/null; }

wait_ready() {  # url
  local end=$((SECONDS + READY_LIMIT_S))
  while [ $SECONDS -lt $end ]; do
    [ "$(curl -s -o /dev/null -m 2 -w '%{http_code}' "$1")" = 200 ] && return 0
    sleep 0.5
  done
  return 1
}

# Not called inside $(...): only this shell can reap its children, and an unreaped
# child still answers kill -0. The outcome goes to STOPPED (term | kill | gone).
alive() { kill -0 "$1" 2>/dev/null && [ "$(ps -o stat= -p "$1" 2>/dev/null | cut -c1)" != Z ]; }
stop() {  # pid
  local pid=$1
  if ! alive "$pid"; then wait "$pid" 2>/dev/null; STOPPED=gone; return; fi
  kill -TERM "$pid" 2>/dev/null
  for _ in $(seq 1 $((STOP_GRACE_S * 10))); do
    if ! alive "$pid"; then wait "$pid" 2>/dev/null; STOPPED=term; return; fi
    sleep 0.1
  done
  kill -KILL "$pid" 2>/dev/null; wait "$pid" 2>/dev/null; STOPPED=kill
}

run() {  # variant lambda rep
  local v=$1 l=$2 r=$3 id="$1-l$2-r$3" status=OK rc=0 responsive=no
  local start_utc; start_utc=$(date -u +%H:%M:%S)
  for p in 8080 8081; do
    for _ in $(seq 1 100); do port_free $p && break; sleep 0.1; done
  done

  java -Xms256m -Xmx512m -jar "$JAR" --spring.profiles.active=downstream \
    --spring.main.web-application-type=reactive --server.port=8081 > "$RAW/$id.downstream.log" 2>&1 &
  local ds=$!
  java -Xms512m -Xmx512m "${APP_PROPS[@]}" -jar "$JAR" \
    --spring.main.web-application-type="$(web_of "$v")" \
    --experiment.output="$RAW/$id.app.jsonl" > "$RAW/$id.app.log" 2>&1 &
  local app=$!

  if ! wait_ready http://localhost:8081/ready || ! wait_ready http://localhost:8080/ping; then
    status=STARTUP_FAILED
  else
    timeout -k 5 "$GEN_LIMIT_S" java -Xmx1g -cp generator LoadGenerator http://localhost:8080 "$(path_of "$v")" \
      "$l" "$WARMUP" "$WINDOW" "$PROBE_RATE" "$RAW/$id.gen.json" > "$RAW/$id.gen.log" 2>&1
    rc=$?
    if [ $rc -eq 124 ] || [ $rc -eq 137 ]; then status=TIMEOUT
    elif [ $rc -ne 0 ]; then status=GENERATOR_ERROR
    fi
    [ "$(curl -s -o /dev/null -m 2 -w '%{http_code}' http://localhost:8080/ping)" = 200 ] && responsive=yes
    curl -s -m 10 http://localhost:8081/stats > "$RAW/$id.downstream.json" || true
  fi

  local app_exit ds_exit
  stop "$app"; app_exit=$STOPPED
  stop "$ds"; ds_exit=$STOPPED
  gzip -f "$RAW/$id".*.json "$RAW/$id".*.jsonl "$RAW/$id".*.log 2>/dev/null
  printf '{"id":"%s","variant":"%s","lambda":%s,"rep":%s,"status":"%s","gen_rc":%s,"app_responsive_after":"%s","app_exit":"%s","downstream_exit":"%s","start_utc":"%s","end_utc":"%s"}\n' \
    "$id" "$v" "$l" "$r" "$status" "$rc" "$responsive" "$app_exit" "$ds_exit" "$start_utc" "$(date -u +%H:%M:%S)" >> "$RAW/runs.jsonl"
  echo "$(date -u +%H:%M:%S) $id $status responsive_after=$responsive app_exit=$app_exit"
}

for rep in $(seq 1 "$REPS"); do
  for l in $LAMBDAS; do
    for v in $VARIANTS; do run "$v" "$l" "$rep"; done
  done
done

[ "$EVALUATE" = yes ] && python3 replication/evaluate_replication.py
exit 0
