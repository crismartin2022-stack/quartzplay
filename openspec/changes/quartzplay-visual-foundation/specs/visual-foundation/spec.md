# Visual Foundation Specification

## Purpose

The brand lives in one place, and every screen reads it from there.

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

The theme MUST export every key the screens reference today, so that adopting
it changes no call site and no layout.

#### Scenario: Existing reference

- WHEN a screen reads any palette key it read before this change
- THEN the key exists and carries the brand value mapped for it

#### Scenario: Layout untouched

- WHEN a screen is rendered after adopting the theme
- THEN its structure, spacing and behaviour are the ones it had before; only
  colour and typeface differ

### Requirement: The Brand Typeface Ships With The App

The product MUST render with the brand typeface on a device that does not have
it installed, without fetching it from a third party at runtime.

#### Scenario: Unknown device

- WHEN the app opens on a device with none of the brand fonts installed
- THEN the typeface loads from the app's own files

#### Scenario: Offline or slow network

- WHEN the typeface has not loaded yet
- THEN text renders in the system fallback and reflows once, never invisible
