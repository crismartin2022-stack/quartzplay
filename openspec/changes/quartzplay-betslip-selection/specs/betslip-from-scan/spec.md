# Ticket From Scan Specification

## Purpose

A visitor who scanned a ticket must be able to generate a play.

## Requirements

### Requirement: Selection Reaches The Ticket

The payload MUST carry the selection read from the ticket or the one chosen while correcting, and MUST NOT send it empty for a pick it keeps.

#### Scenario: Selection read by the scanner

- GIVEN a pick whose selection comes from the scan
- WHEN the ticket payload is built
- THEN its selection field carries that value

#### Scenario: Selection corrected by the visitor

- GIVEN a pick whose selection was corrected
- WHEN the ticket payload is built
- THEN its selection field carries the corrected value

### Requirement: Only Playable Picks Travel

Picks without a final odd MUST be excluded.

#### Scenario: Pick without a final odd

- WHEN the ticket payload is built
- THEN that pick is not included
