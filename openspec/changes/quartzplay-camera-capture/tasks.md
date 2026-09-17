# Tasks: In-App Camera Capture

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 260–360 (tests about 40 percent) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR into `staging` |
| Delivery strategy | auto-chain |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

## Phase 1: RED

- [x] 1.1 Tests for the capture module: requests the rear camera, maps denial and unsupported cases to readable reasons, stops tracks on cancel and after capture, and returns a JPEG base64 frame.
- [x] 1.2 Tests for the shared component: shows preview and controls, adds the captured image, shows the reason and keeps the file fallback when the camera fails.

## Phase 2: GREEN

- [x] 2.1 Add the capture module and the shared component.
- [x] 2.2 Use the component in the public site and in the player app, keeping the gallery control.
- [x] 2.3 Run the frontend suite green and build.

## Phase 3: Delivery

- [ ] 3.1 Open the PR into `staging`; verify on a phone in the in-app browser; release with owner approval.
