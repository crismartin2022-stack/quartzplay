# Proposal: Clean Scanner Panel On The Public Site

## Intent

The owner demonstrates the product in a browser. There the scanner was presented inside a chat bubble, so it read as a Telegram bot instead of a product screen.

## Scope

- The public site scanner becomes a self-contained panel titled "Escanear y mejorar", with the same explanation and two clean options: "Cámara" and "Archivo".
- "Cámara" opens the in-app camera; "Archivo" chooses files and becomes "Agregar más" once an image is loaded.
- The player app inside Telegram keeps its conversational presentation, where a bubble belongs.

Out of scope: the admin scanner, analysis, and the rest of the flow.

## Rollback

Revert the PR.
