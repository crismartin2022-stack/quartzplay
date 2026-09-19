# Scan Gate Specification

## Purpose

Scanning is for people we know.

## Requirements

### Requirement: No Identity, No Scan

In the browser, the scanner's entry controls MUST NOT act for someone without
an identity.

#### Scenario: The camera, with no identity

- WHEN the camera is chosen and there is no identity
- THEN the modal opens, the camera does not, and no image is read

#### Scenario: The file picker, with no identity

- WHEN a file is chosen and there is no identity
- THEN the modal opens, the file is not read, and no request is sent

#### Scenario: An open session

- WHEN there is an open browser session
- THEN both controls act as they did before

#### Scenario: Opened from inside Telegram

- WHEN the site is opened inside Telegram and the player is identified there
- THEN both controls act, without asking for a browser session

### Requirement: The Missing Account Is The First Thing Said

A person without an identity MUST learn that before being asked for anything
else.

#### Scenario: Betting with no identity and no amount

- WHEN the bet is confirmed with no identity and no amount typed
- THEN the modal opens, rather than a message asking for an amount

### Requirement: The Screen Does Not Promise Otherwise

Copy MUST NOT tell a visitor that no account is needed.

#### Scenario: The invitation to scan

- WHEN the scanner is presented to a visitor
- THEN nothing on that screen says an account is unnecessary
