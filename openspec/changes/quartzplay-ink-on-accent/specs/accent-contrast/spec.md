# Accent Contrast Specification

## Purpose

Text on a brand accent can be read.

## Requirements

### Requirement: An Accent Background Carries Dark Ink

Where a brand accent is the background of a control, its text and its icons
MUST use the ink the brand pairs with accents, not white.

#### Scenario: A filled button

- WHEN a control's background is an accent, alone or in a gradient
- THEN its label and its icons are drawn in the accent ink

#### Scenario: A selected tab

- WHEN a tab is selected and takes an accent background
- THEN its label and its icon are drawn in the accent ink, and both are legible

#### Scenario: White on an accent

- WHEN white is placed on an accent background
- THEN the test suite fails and names the file

### Requirement: Both Themes Are Checked Against Their Own Accents

The contrast check MUST cover accents used as backgrounds, not only surfaces.

#### Scenario: Every accent

- WHEN any accent is used as a background
- THEN the ink on it reads at the threshold the suite defines for text

#### Scenario: A new accent

- WHEN an accent is added to the theme
- THEN it is covered by the same check without the check being edited

### Requirement: The Accents Themselves Do Not Move

Repairing the contrast MUST NOT change the accent values.

#### Scenario: An accent read as text

- WHEN an accent is used as a foreground on a surface
- THEN it carries the value the brand defines, unchanged by this work
