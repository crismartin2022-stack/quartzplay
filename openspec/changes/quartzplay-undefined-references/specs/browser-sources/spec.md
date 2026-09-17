# Browser Sources Specification

## Purpose

A rendering path must never reference a variable that does not exist, because such an error unmounts the application and leaves a blank screen.

## Requirements

### Requirement: No Undefined References

Every browser source MUST be free of undefined references.

#### Scenario: A source introduces one

- WHEN a browser source references a variable that is not declared or imported
- THEN the suite fails and names the file and line

### Requirement: Site Scanner Opens

Opening the scanner from the public site MUST render it, with or without a referral code in the link.

#### Scenario: Visitor opens the scanner

- WHEN a visitor opens the scanner tab on the public site
- THEN the scanner renders with its photo and gallery controls

### Requirement: Admin Bonuses Tab Loads And Refreshes

The admin bonuses tab MUST load its list when it opens and refresh it after saving, activating, or deleting.

#### Scenario: Bonus saved

- WHEN an administrator saves a bonus
- THEN the list is reloaded and the screen stays usable
