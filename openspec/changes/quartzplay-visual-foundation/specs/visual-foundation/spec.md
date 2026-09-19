# Visual Foundation Specification

## Purpose

The brand lives in one place, every screen reads it from there, and both themes
stay readable.

## Requirements

### Requirement: One Source Of Colour And Type

The palette and the typography MUST be declared once and imported by every
screen, under the key names the screens already use.

#### Scenario: A screen needs a colour

- WHEN a screen renders anything that carries a brand colour
- THEN it reads it from the theme module, and declares no palette of its own

#### Scenario: The brand changes

- WHEN a colour of the brand changes
- THEN it is edited in the theme module only, and every screen follows

#### Scenario: A palette reappears

- WHEN a screen file declares its own palette object again
- THEN the test suite fails and names the file

### Requirement: Every Existing Key Keeps Working

The theme MUST export every key the screens reference today, in both themes, so
that adopting it changes no call site and no layout.

#### Scenario: Existing reference

- WHEN a screen reads any palette key it read before this change
- THEN the key exists in both themes and carries the brand value mapped for it

#### Scenario: A key present in only one theme

- WHEN a key exists in one theme and not the other
- THEN the test suite fails and names the key

#### Scenario: Layout untouched

- WHEN a screen is rendered after adopting the theme
- THEN its structure, spacing and behaviour are the ones it had before; only
  colour and typeface differ

### Requirement: The Player Keeps Choosing The Theme

The light and dark switch MUST keep working exactly as it does today, including
the stored choice.

#### Scenario: A stored preference

- WHEN a player who chose light mode opens the product again
- THEN it opens in light mode, as before this change

#### Scenario: Switching

- WHEN the theme is switched
- THEN every screen that honoured the switch before still honours it

### Requirement: Both Themes Are Readable

No foreground value may be used on a background it cannot be read against.

#### Scenario: The brand accent on white

- WHEN a value that carries text or a number is used in light mode
- THEN it has enough contrast against that theme's surfaces to be read

#### Scenario: A bright accent as a background

- WHEN a bright brand value is used as a background rather than as text
- THEN the text on it is the dark ink the brand pairs with it

### Requirement: The Brand Typeface Ships With The App

The product MUST render with the brand typeface on a device that does not have
it installed, without fetching it from a third party at runtime.

#### Scenario: Unknown device

- WHEN the app opens on a device with none of the brand fonts installed
- THEN the typeface loads from the app's own files

#### Scenario: Offline or slow network

- WHEN the typeface has not loaded yet
- THEN text renders in the system fallback and reflows once, never invisible
