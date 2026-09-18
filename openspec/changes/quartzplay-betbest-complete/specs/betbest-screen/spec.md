# Improved-Bet Screen Specification

## Purpose

An improved combination can be played two ways — with balance, or as a code —
and the screen always says what happened.

## Requirements

### Requirement: Playable Picks Decide What The Screen Offers

The screen MUST derive the playable picks from the picks that carry a final
odd, and MUST decide from that single derivation both what it offers and what
it sends.

#### Scenario: Every pick was matched

- WHEN every scanned pick carries a final odd
- THEN the screen offers the stake field, the confirm button and the code button

#### Scenario: Some picks were not matched

- WHEN only part of the picks carry a final odd
- THEN the screen offers the same actions for the matched ones and states how
  many were left out

#### Scenario: No pick was matched

- WHEN no pick carries a final odd
- THEN the screen offers no bet and no code, and states that nothing could be
  matched and that the scan can be repeated

### Requirement: No Silent Action

Every action on this screen MUST end in a visible outcome: a result, or a
message naming what is missing.

#### Scenario: Code requested with nothing playable

- WHEN the code is requested and no pick carries a final odd
- THEN the screen shows why it cannot be generated and no request is sent

#### Scenario: Bet requested without a stake

- WHEN the bet is confirmed with an empty, zero or non-numeric stake
- THEN the screen asks for an amount and no request is sent

### Requirement: Bet The Improved Combination With Balance

A confirmed bet MUST be sent to the bet endpoint with the playable picks, the
stake, and mode `saldo`, carrying the identity of the channel it was placed
from.

#### Scenario: From the Telegram app

- WHEN the bet is confirmed inside Telegram
- THEN it is sent with the Telegram identity

#### Scenario: From a browser session

- WHEN the bet is confirmed in a browser with an open session
- THEN it is sent with that session as a bearer token

#### Scenario: Picks keep their identity

- WHEN picks are sent to the bet endpoint
- THEN each carries the resolved teams, the selection, the final odd and, when
  known, the event and sport identifiers, exactly as the code path sends them

### Requirement: Signing In Is Offered, Never Demanded Silently

An action attempted without a usable identity MUST open a modal offering a way
to sign in and a way to create an account.

#### Scenario: No session in the browser

- WHEN a bet is confirmed in a browser with no open session
- THEN a modal offers signing in and creating an account, and no request is sent

#### Scenario: Session expired on the server

- WHEN the bet endpoint refuses with reason `login_required`
- THEN the same modal opens and the refusal message is shown as text, never as
  an object

#### Scenario: Account creation link

- WHEN the modal offers creating an account
- THEN the link opens the configured Telegram bot, carrying the referral code
  when the visit came from one

### Requirement: A Placed Bet Closes The Scan

A bet placed from the scanner MUST report the result and leave the screen in a
state the player can act on.

#### Scenario: Bet accepted

- WHEN the bet is accepted
- THEN the screen confirms it with the stake and the total odd, and the scan is
  no longer offered for betting again

#### Scenario: Bet refused

- WHEN the bet is refused, for insufficient balance or any other rule
- THEN the reason is shown and the scan stays as it was, so it can be retried
  or turned into a code
