# Proposal: In-App Camera Capture For The Ticket Scanner

## Intent

The scanner is the feature the owner demonstrates to prospective clients, and today it does not open the camera.

## Evidence

- The "Sacar foto" control is a file input whose only camera hint is the `capture` attribute (present in the production bundle).
- In-app browsers (Telegram) and desktop browsers ignore that hint, so the control opens the file picker instead of the camera.
- When an environment does honor it and the camera cannot start, the user sees a black rectangle with no explanation.

## Scope

- A shared camera capture surface: live preview, shutter, cancel, and rear-camera preference, used by both the public site and the player app.
- The captured frame enters the existing scan pipeline unchanged (base64 JPEG).
- Fail visible: when the camera is unavailable or denied, show a readable reason and fall back to choosing a file, never a black screen.
- Keep the gallery control as it is.

Out of scope: image analysis, scanner backend, the panel.

## Rollback

Revert the PR; the controls return to the current file inputs.
