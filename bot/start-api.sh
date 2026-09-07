#!/usr/bin/env bash
set -eu

exec uvicorn casino_api:app --host 0.0.0.0 --port "${PORT:?PORT is required}"
