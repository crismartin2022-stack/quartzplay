# Frontend Environment Configuration Specification

## Purpose

Define how the frontend selects its environment and validates destinations, in the build preflight and in browser runtime configuration, so production and staging each build correctly and never mix destinations.

## Requirements

### Requirement: Explicit Coherent Environment

The frontend MUST require `APP_ENV` and `REACT_APP_ENV` to be present, equal, and either `staging` or `production`. The build preflight and runtime configuration MUST fail when they are not, naming the variable without printing values.

#### Scenario: Coherent staging environment

- GIVEN `APP_ENV` and `REACT_APP_ENV` are both `staging` with valid staging destinations
- WHEN the preflight and runtime configuration run
- THEN both succeed

#### Scenario: Coherent production environment

- GIVEN `APP_ENV` and `REACT_APP_ENV` are both `production` with valid production destinations
- WHEN the preflight and runtime configuration run
- THEN both succeed

#### Scenario: Mismatched environments

- GIVEN `APP_ENV` is `production` and `REACT_APP_ENV` is `staging`
- WHEN the preflight runs
- THEN it fails naming `APP_ENV`

#### Scenario: Unknown environment

- GIVEN `APP_ENV` and `REACT_APP_ENV` are both `development`
- WHEN runtime configuration resolves
- THEN it fails naming `APP_ENV`

### Requirement: Destinations Match the Declared Environment

API, IAQP, and app-origin destinations MUST be `https` root URLs. In staging their hosts MUST NOT be production hosts; in production their hosts MUST be production hosts. Casino hosts follow the same rule. `juego.iaqp.lat` is a production host. Failures MUST name the variable and MUST NOT print the value.

#### Scenario: Staging with a production destination

- GIVEN a staging environment whose API destination is a production host
- WHEN runtime configuration resolves
- THEN it fails naming `REACT_APP_API_URL`

#### Scenario: Production with a staging destination

- GIVEN a production environment whose API destination is not a production host
- WHEN runtime configuration resolves
- THEN it fails naming `REACT_APP_API_URL`

#### Scenario: Production destinations resolve normalized

- GIVEN a production environment with production destinations and casino hosts
- WHEN runtime configuration resolves
- THEN it returns normalized `https` origins and deduplicated casino hosts

#### Scenario: Newly listed production host in staging

- GIVEN a staging environment whose app origin host is `juego.iaqp.lat`
- WHEN runtime configuration resolves
- THEN it fails naming `REACT_APP_APP_ORIGIN`

### Requirement: Bot Identity per Environment

Staging MUST reject the production bot username. Production MUST accept only the production bot username.

#### Scenario: Staging with the production bot

- GIVEN a staging environment whose bot username is the production bot
- WHEN runtime configuration resolves
- THEN it fails naming `REACT_APP_BOT_USERNAME`

#### Scenario: Production with the production bot

- GIVEN a production environment whose bot username is the production bot
- WHEN runtime configuration resolves
- THEN it succeeds

#### Scenario: Production with a non-production bot

- GIVEN a production environment whose bot username is a staging bot
- WHEN runtime configuration resolves
- THEN it fails naming `REACT_APP_BOT_USERNAME`

### Requirement: Destinations Come Only from Environment Variables

User-interface source files MUST NOT hardcode production destinations or the production bot link; destinations MUST come from environment variables through runtime configuration.

#### Scenario: Source files stay free of production destinations

- GIVEN the frontend user-interface source files
- WHEN they are scanned for production destinations
- THEN none is found
