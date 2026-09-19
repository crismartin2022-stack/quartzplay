# Icon System Specification

## Purpose

The product draws its own icons.

## Requirements

### Requirement: One Icon Component

Every icon MUST come from one component, by name, with no network dependency.

#### Scenario: An icon is rendered

- WHEN a screen shows an icon
- THEN it names it and the component draws it from the product's own files

#### Scenario: An unknown name

- WHEN a name that does not exist is asked for
- THEN nothing is drawn and the layout does not break

### Requirement: Icons Take Their Colour And Size From The Caller

An icon MUST sit in the layout it was put in without forcing it to change.

#### Scenario: Colour

- WHEN an icon is placed beside text
- THEN it takes the colour it is given, defaulting to the current text colour

#### Scenario: Size

- WHEN an icon is placed in a control
- THEN its size is set by the caller and it does not overflow its line

### Requirement: Icons Are Read Correctly Or Not At All

An icon MUST be announced when it carries meaning and silent when it does not.

#### Scenario: An icon that carries meaning

- WHEN an icon is the only content of a control
- THEN it carries a name that a screen reader announces

#### Scenario: A decorative icon

- WHEN an icon sits beside a label that already says the same thing
- THEN it is hidden from assistive technology, so the label is not read twice

### Requirement: The Inventory Is Complete And Honest

The migration MUST be driven by a written inventory rather than judged case by
case while editing.

#### Scenario: An emoji used as an icon

- WHEN an emoji stands in for an icon
- THEN the inventory names the icon that replaces it

#### Scenario: An emoji with no equivalent

- WHEN the icon set has nothing for it
- THEN the inventory says so plainly instead of choosing an approximation

#### Scenario: An emoji that is not an icon

- WHEN an emoji is punctuation or tone inside a sentence of copy
- THEN the inventory marks it as copy, and it is not replaced by an icon
