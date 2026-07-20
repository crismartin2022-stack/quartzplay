#!/bin/bash
uvicorn casino_api:app --host 0.0.0.0 --port $PORT &
API_PID=$!
echo "API started PID $API_PID"
python server.py &
BOT_PID=$!
echo "Bot started PID $BOT_PID"
wait $API_PID $BOT_PID
