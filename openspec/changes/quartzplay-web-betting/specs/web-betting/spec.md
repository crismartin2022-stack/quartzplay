# Web Betting Specification

## Purpose

The same player bets with the same rules from Telegram or from a browser.

## Requirements

### Requirement: Two Accepted Identities

The bet endpoint MUST accept the Telegram identity or a valid web client session, and MUST resolve the player from whichever is present, preferring the Telegram identity when both are.

#### Scenario: Telegram identity

- WHEN a bet arrives with a valid Telegram identity
- THEN it is placed for that player, as today

#### Scenario: Web client session

- WHEN a bet arrives with a valid client session token and no Telegram identity
- THEN it is placed for the player who owns that session

#### Scenario: Session of another kind

- WHEN the token belongs to an agency session
- THEN the request is refused

### Requirement: Identifiable Refusal When Not Signed In

A request without a usable identity MUST answer 401 with a stable reason code the interface can act on, without leaking whether a player exists.

#### Scenario: No identity

- WHEN neither identity is present
- THEN the answer is 401 with reason `login_required`

#### Scenario: Expired session

- WHEN the session token is unknown or expired
- THEN the answer is 401 with reason `login_required`

### Requirement: Identical Rules For Both Channels

Stake limits, balance and bonus handling, pick validation and influencer attribution MUST behave the same for both identities.

#### Scenario: Insufficient balance from the browser

- WHEN a web session bets more than its balance
- THEN it is refused exactly as the same bet from Telegram
