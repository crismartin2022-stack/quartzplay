```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:4bdeb97da67737a43d9ec641d86e429f8f0a8687732aea75fc3bfb55e63e1526
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 4/4
scenarios: 11/11
test_command: cd bot && python -m pytest tests/ -q
test_exit_code: 0
test_output_hash: sha256:8bd90f41e9c9daddd739692ae6d08675c17260026cec46dcf2370980b3e72a3e
build_command: cd bot && python -m compileall -q psp_webhook_auth.py config.py casino_api.py
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

# Verify Report: PSP Webhook Authentication

Verified on `staging` at commit `cb92d79` on 2026-09-16.

## Execution Evidence

| Check | Result |
|---|---|
| Bot suite | `137 passed` (101 existing, 36 new) |
| Compilation | Clean |
| Staging runtime | `staging-api`, `staging-worker`, `staging-frontend` deployed `cb92d79` SUCCESS; `readyz` 200 |

## Requirement Coverage

All four requirements and eleven scenarios are covered by `bot/tests/test_psp_webhook_auth.py` and `bot/tests/test_runtime_config.py`.

## Warnings

- The change stays active: delivery task 4.2 and the Production Release Gate (G.1 to G.5) are open because the PSP API key is not available (issue #35).
- Not yet released to `main`; production behavior is unchanged because the PSP is disabled there.
