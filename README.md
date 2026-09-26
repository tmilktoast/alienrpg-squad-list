# Alien RPG Squad List

A Foundry VTT module for the [Alien RPG system](https://github.com/pwatson100/alienrpg) (`alienrpg` 4.x, Foundry v13–v14).
It opens a single window with one column per marine, showing:

- **Vitals** — health (current / max, with a bar), stress (with 10 pips), and resolve when the
  system's *Evolved* rules are on
- **Attributes** — effective Strength, Agility, Wits and Empathy; values changed by talents,
  gear or effects are highlighted, and the tooltip shows base → effective
- **Skills** — grouped by attribute, shown as `ranks / dice pool`

## Usage

- Click **Squad List** at the top of the Actors directory, or run
  `game.modules.get("alienrpg-squad-list").api.open()` from a macro.
- GM: drag characters (or a whole folder of actors) from the Actors directory onto the window to
  add them. Hover a marine's column and click × to remove them, or use the broom to clear the list.
- Click a portrait or name to open that character's sheet.
- The list updates live when health, stress, items or effects change.

The squad is stored as a world setting, so every user sees the same list. Players only see the
marines they have at least Observer permission on.

## Local development

A local Foundry (Node.js build) runs from `~/foundryvtt` with its data in `~/foundrydata`. This
folder is symlinked into its modules directory, so edits go live on a browser refresh:

```sh
ln -s "$PWD" ~/foundrydata/Data/modules/alienrpg-squad-list   # once
node ~/foundryvtt/main.js --dataPath=$HOME/foundrydata         # then open http://localhost:30000
```

Changes to `module.json` need a return to Setup; everything else only needs F5.

## Manual install on a server

`./build.sh` packages the last commit as `dist/alienrpg-squad-list-<version>.zip`. Unzip it into
the server's `Data/modules/`, restart Foundry, and enable **Alien RPG Squad List** in an Alien RPG
world.
