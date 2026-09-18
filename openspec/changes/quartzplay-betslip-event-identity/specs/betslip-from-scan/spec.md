# Ticket Event Identity Specification

## Purpose

A ticket built from a scan must be verifiable against the live feed.

## Requirements

### Requirement: Resolved Event Travels With The Ticket

When our own search resolved the event, the payload MUST carry its names and, when known, the event and sport identifiers.

#### Scenario: Event resolved by the search

- GIVEN a scanned pick whose event was resolved
- WHEN the ticket payload is built
- THEN it carries the resolved names and identifiers instead of the scanned spelling

#### Scenario: Event not resolved

- GIVEN a scanned pick with no resolved event
- WHEN the ticket payload is built
- THEN it carries the scanned names and no identifiers
