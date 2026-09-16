# OpenSpec Governance Specification

## Purpose

Define where QuartzPlay SDD change state lives and how OpenSpec records stay truthful.

## Requirements

### Requirement: Canonical SDD State Location

QuartzPlay SDD change state MUST live only in `app/openspec` and MUST be committed before any later gate relies on it. Secondary checkouts MUST NOT hold change trackers that are absent from, or diverge from, the canonical location.

#### Scenario: Active change reported once

- GIVEN an active QuartzPlay change
- WHEN native SDD status runs in `app/`
- THEN it reports the change exactly once with its committed task progress

#### Scenario: Tracker found only in a secondary checkout

- GIVEN a worktree holds a change directory that is not committed in `app/openspec`
- WHEN consolidation runs
- THEN the tracker is archived, recorded as superseded, or migrated into `app/openspec`
- AND the worktree copy is discarded

#### Scenario: Uncommitted artifacts

- GIVEN OpenSpec artifacts exist only in a working tree
- WHEN a later phase needs them as evidence
- THEN that phase MUST NOT proceed until the artifacts are committed

### Requirement: Records Match Attested Live State

OpenSpec records MUST describe remote staging resources only from sanitized, attested evidence, and MUST record any divergence between records and live state.

#### Scenario: Live state ahead of records

- GIVEN a sanitized inventory shows a resource that records describe as blocked or absent
- WHEN reconciliation runs
- THEN the record is annotated with the dated inventory evidence
- AND no task is marked complete without its own acceptance evidence

#### Scenario: Records ahead of live state

- GIVEN a record claims a resource the inventory cannot find
- WHEN reconciliation runs
- THEN the related task returns to open with the discrepancy noted

#### Scenario: Sanitized evidence only

- GIVEN inventory evidence is recorded
- WHEN a reviewer reads it
- THEN it contains no identifiers, URLs, domains, keys, variable values, or rows

### Requirement: Merged and Superseded Trackers

A change whose outcome is already on `main` MUST be archived, and a tracker whose outcome shipped through other work MUST be recorded as superseded instead of continued.

#### Scenario: Merged but unarchived

- GIVEN a change whose implementation is reachable from `origin/main`
- WHEN consolidation runs
- THEN an archive record exists under `openspec/changes/archive/YYYY-MM-DD-{change-name}/` stating it was archived retroactively

#### Scenario: Superseded tracker

- GIVEN a tracker whose intended outcome shipped under different merged work
- WHEN consolidation runs
- THEN it is recorded as superseded with pointers to the merged code
- AND no task from it is continued
