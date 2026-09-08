import os
from pathlib import Path
import subprocess

import pytest

from config import ConfigError, parse_poller_runtime_settings, poller_settings


ROOT = Path(__file__).resolve().parents[1]


def test_polling_is_disabled_without_an_explicit_enablement():
    assert poller_settings({}).enabled is False
    assert poller_settings({"POLLING_ENABLED": "false"}).worker_id is None

    with pytest.raises(ConfigError, match="polling_enabled.invalid"):
        poller_settings({"POLLING_ENABLED": "yes"})


def test_enabled_polling_requires_a_safe_worker_identity():
    with pytest.raises(ConfigError, match="worker_id.missing"):
        poller_settings({"POLLING_ENABLED": "true"})

    with pytest.raises(ConfigError, match="worker_id.invalid"):
        poller_settings({"POLLING_ENABLED": "true", "WORKER_ID": "bad id"})

    result = poller_settings({"POLLING_ENABLED": "true", "WORKER_ID": "staging-poller-1"})

    assert result.enabled is True
    assert result.worker_id == "staging-poller-1"


def test_enabled_poller_configuration_does_not_require_api_callback_settings():
    result = parse_poller_runtime_settings({
        "APP_ENV": "production",
        "DATABASE_URL": "postgresql://user:pass@prod-db.example.test/quartzplay",
        "TELEGRAM_TOKEN": "123456:production-token-value",
        "TELEGRAM_BOT_USER": "QuartzPlayBot",
        "ADMIN_IDS": "1001,1002",
        "PRODUCTION_DATABASE_HOSTS": "prod-db.example.test",
        "STAGING_DATABASE_HOSTS": "staging-db.example.test",
        "PRODUCTION_TELEGRAM_BOT_IDS": "123456",
        "STAGING_TELEGRAM_BOT_IDS": "987654",
        "PRODUCTION_TELEGRAM_USERNAMES": "QuartzPlayBot",
        "STAGING_TELEGRAM_USERNAMES": "QuartzPlayStagingBot",
        "PRODUCTION_ADMIN_IDS": "1001,1002",
        "STAGING_ADMIN_IDS": "2001,2002",
    })

    assert result.database_host == "prod-db.example.test"
    assert result.telegram.username == "quartzplaybot"


def test_procfile_runs_api_and_poller_as_independent_foreground_processes():
    procfile = (ROOT / "Procfile").read_text()
    api_script = (ROOT / "start-api.sh").read_text()
    poller_script = (ROOT / "start-poller.sh").read_text()

    assert "web: bash start-api.sh" in procfile
    assert "worker: bash start-poller.sh" in procfile
    assert "exec uvicorn casino_api:app" in api_script
    assert '"${PORT:?PORT is required}"' in api_script
    assert "exec python server.py" in poller_script


def test_api_start_script_passes_railway_port_to_uvicorn(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    args_file = tmp_path / "uvicorn-args"
    uvicorn = bin_dir / "uvicorn"
    uvicorn.write_text(f"#!/usr/bin/env bash\nprintf '%s\\n' \"$@\" > {args_file}\n")
    uvicorn.chmod(0o755)

    result = subprocess.run(
        ["bash", "start-api.sh"],
        cwd=ROOT,
        env={**os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}", "PORT": "45123"},
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0
    assert args_file.read_text().splitlines() == ["casino_api:app", "--host", "0.0.0.0", "--port", "45123"]


def test_api_readiness_routes_do_not_import_or_gate_on_worker_lifecycle():
    api = (ROOT / "casino_api.py").read_text()
    worker = (ROOT / "server.py").read_text()

    assert "@app.get(\"/livez\")" in api
    assert "@app.get(\"/readyz\")" in api
    assert "run_poller" not in api
    assert "run_poller" in worker


def test_supervisor_waits_for_real_poller_exit_then_cleans_up_api():
    supervisor = (ROOT / "start.sh").read_text()

    assert 'wait "$POLLER_PID"' in supervisor
    assert 'kill "$API_PID" "$POLLER_PID"' in supervisor
    assert "exit $STATUS" in supervisor


def test_supervisor_returns_poller_failure_and_terminates_api(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    uvicorn = bin_dir / "uvicorn"
    python = bin_dir / "python"
    uvicorn.write_text("#!/usr/bin/env bash\nexec sleep 30\n")
    python.write_text("#!/usr/bin/env bash\nexit 17\n")
    uvicorn.chmod(0o755)
    python.chmod(0o755)

    result = subprocess.run(
        ["bash", "start.sh"],
        cwd=ROOT,
        env={**os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}", "PORT": "8000"},
        capture_output=True,
        text=True,
        timeout=5,
    )

    assert result.returncode == 17


def test_poller_startup_failure_shuts_down_started_resources():
    from server import run_poller

    events = []

    class Updater:
        running = False

        async def start_polling(self, **_kwargs):
            events.append("polling")
            self.running = True

        async def stop(self):
            events.append("polling-stop")
            self.running = False

    class Application:
        running = False
        updater = Updater()

        async def initialize(self):
            events.append("initialize")

        async def start(self):
            events.append("start")
            self.running = True

        async def stop(self):
            events.append("stop")
            self.running = False

        async def shutdown(self):
            events.append("shutdown")

    async def fail_after_start():
        raise RuntimeError("poller terminated")

    with pytest.raises(RuntimeError, match="poller terminated"):
        __import__("asyncio").run(run_poller(Application(), fail_after_start))

    assert events == ["initialize", "polling", "start", "polling-stop", "stop", "shutdown"]


def test_poller_bootstrap_failure_still_shuts_down_application():
    from server import run_poller

    events = []

    class Application:
        running = False

        class updater:
            running = False

            @staticmethod
            async def start_polling(**_kwargs):
                events.append("polling")
                raise RuntimeError("bootstrap failed")

        async def initialize(self):
            events.append("initialize")

        async def shutdown(self):
            events.append("shutdown")

    async def never_wait():
        raise AssertionError("wait must not run")

    with pytest.raises(RuntimeError, match="bootstrap failed"):
        __import__("asyncio").run(run_poller(Application(), never_wait))

    assert events == ["initialize", "polling", "shutdown"]
