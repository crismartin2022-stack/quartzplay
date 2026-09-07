#!/usr/bin/env bash
set -u

bash start-api.sh &
API_PID=$!
bash start-poller.sh &
POLLER_PID=$!

cleanup() {
  kill "$API_PID" "$POLLER_PID" 2>/dev/null || true
}

trap 'cleanup; exit 143' INT TERM
wait "$POLLER_PID"
STATUS=$?
cleanup
wait "$API_PID" "$POLLER_PID" 2>/dev/null || true
exit $STATUS
