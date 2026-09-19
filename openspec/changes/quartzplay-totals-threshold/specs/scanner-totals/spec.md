# Scanner Totals Specification

## Purpose

An over/under answer is about the line the ticket names, or it says which line
it is about instead.

## Requirements

### Requirement: The Threshold Is Read From The Selection

An over/under selection MUST be matched against the threshold it names.

#### Scenario: The threshold is carried

- WHEN the ticket names a threshold we carry
- THEN the price quoted is our price for that exact line

#### Scenario: A different threshold

- WHEN the ticket names a threshold we do not carry
- THEN the price quoted is our price for the nearest line we do carry, and the
  pick is marked as being about a different line

#### Scenario: No total at all

- WHEN we carry no over/under market for that event
- THEN the pick is refused as today, with no price

#### Scenario: A threshold that cannot be read

- WHEN the selection names no readable threshold
- THEN the pick is treated as a different line rather than matched by position

### Requirement: A Substituted Line Is Never Improved

A price quoted for a line other than the one the ticket names MUST be our own
price, untouched.

#### Scenario: Our price is lower

- WHEN the nearest line we carry prices lower than the ticket's odd
- THEN it is quoted as it is, and no improvement is applied to it

#### Scenario: Our price is higher

- WHEN the nearest line we carry prices higher than the ticket's odd
- THEN it is quoted as it is, and it is not presented as having beaten the
  rival's price

### Requirement: The Player Sees Which Line Is Quoted

The screen MUST say when the quote is about a different line than the ticket's.

#### Scenario: A substituted line on screen

- WHEN a pick was quoted against a different threshold
- THEN the screen names the line being quoted and marks it apart from the
  picks that were matched or improved

#### Scenario: The ticket built from a substituted line

- WHEN a bet or a code is generated from such a pick
- THEN it carries the line we quoted, never the one the ticket named
