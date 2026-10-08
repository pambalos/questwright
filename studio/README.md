# Questwright Studio

The character creator for Questwright, in Unreal Engine 5.5. It shows a character from the book wearing what the story gave them, in one of three art styles:

- **Painted**: a 2D painting (Kuwahara brush strokes, ink lines, paper)
- **Stylized**: bold colour, banded light and a strong rim light, in the manner of WoW
- **Realistic**: soft global light, gloss and shallow focus, in the manner of Black Desert

This is a prototype: bodies are Epic's Manny and Quinn mannequins and gear is built from engine shapes. Art-quality modular characters on the UE5 skeleton (from Fab) are the next step.

## Setup (Windows)

Needs Unreal Engine 5.5 (Epic launcher) and Visual Studio 2022 with C++.

```bash
powershell -File Scripts/setup.ps1
```

This copies the mannequins from the engine's Third Person template into `Content/Characters`, builds the C++ module, and builds the materials and map with `Scripts/setup_content.py`. `Content/` is generated, so it is not in git.

## Run

```bash
powershell -File Scripts/run.ps1
```

Options: `-Character <file.json>` (reloads when the file changes), `-Style painted|stylized|realistic`, `-Shots <folder>` (renders every style to PNGs, then quits).

From the Questwright desktop app, **Open in Studio** on a character card writes the character file and starts the studio. While it runs, changes in the book update it live.

## Character file

Written by `apps/web/src/figure/studio.ts`, read by `Source/QuestwrightStudio/QWSpec.cpp`:

```json
{
  "name": "Russ", "description": "Qi Warden", "frame": "masculine",
  "height": 1.0, "build": 1.0,
  "skin": "#c99a78", "hairColor": "#2b2118", "cloth": "#7a5a2a", "accent": "#d6a443",
  "gear": [{ "type": "helm", "slot": "Head", "item": "Obsidian helmet", "material": "obsidian", "rarity": "common" }]
}
```
