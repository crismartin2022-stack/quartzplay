# Site Scanner Specification

## Purpose

In a browser the scanner must look like a product screen, not like a chat with a bot.

## Requirements

### Requirement: Self-Contained Panel

The public site scanner MUST render as its own panel with a title and MUST NOT use the conversational bubble.

#### Scenario: Visitor opens the scanner

- WHEN a visitor opens the scanner from the public site
- THEN a panel titled "Escanear y mejorar" is shown without a chat bubble

### Requirement: Two Clean Options

The panel MUST offer exactly two capture options: "Cámara", which opens the in-app camera, and "Archivo", which chooses files and reads "Agregar más" once an image is loaded.

#### Scenario: Camera option

- WHEN the visitor chooses "Cámara"
- THEN the in-app camera opens

#### Scenario: File option after a first image

- WHEN one image is already loaded
- THEN the file option reads "Agregar más"
