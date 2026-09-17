# Camera Capture Specification

## Purpose

Let a visitor photograph a betting slip from inside the application, on phones and in in-app browsers, without silent failures.

## Requirements

### Requirement: Camera Preview On Demand

Choosing to take a photo MUST request the rear camera and show a live preview with a shutter control and a way to cancel.

#### Scenario: Camera available

- WHEN the visitor chooses to take a photo and the camera is granted
- THEN a live preview appears with shutter and cancel controls

#### Scenario: Cancel

- WHEN the visitor cancels the preview
- THEN every camera track is stopped and no image is added

### Requirement: Captured Frame Enters The Scan Pipeline

Pressing the shutter MUST produce a JPEG image, added exactly like a chosen file, and MUST stop the camera afterwards.

#### Scenario: Shutter

- WHEN the visitor presses the shutter
- THEN a JPEG base64 image is added to the pending images and the camera stops

### Requirement: Visible Failure And Fallback

When the camera cannot be used, the interface MUST show a readable reason and offer choosing a file instead; it MUST NOT leave a blank area.

#### Scenario: Permission denied

- WHEN the camera permission is denied
- THEN a message explains that the camera permission is blocked and the file option stays available

#### Scenario: Camera unsupported

- WHEN the browser exposes no camera interface
- THEN a message explains it and the file option stays available
