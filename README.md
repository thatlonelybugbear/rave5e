# Rules-Aware Variable Effects for 5e

A premium Foundry VTT module for creating Active Effects with user-defined conditional logic in D&D 5e.

Rave 5e is currently available through Vanguard-tier and higher membership on [Patreon](<https://www.patreon.com/thatlonelybugbear>).

## Release Status

Rave 5e is currently an early beta release. The core conditional Active Effect workflow is usable, but test it on a copy of a world before using it in a long-running game.

Known early-release limits:

- Built for Foundry VTT v14 and dnd5e 5.3.3+.
- Conditions are actor-local. They do not inspect targets, enemies, templates, chat cards, or roll dialog choices.
- If a condition checks a path that is not available, the effect does not apply. Use `exists` when you want to check whether a path is present or missing.
- Rave 5e changes are saved on the Active Effect. If the module is disabled, those changes stay there, but they only become Rave-editable and affect behavior again when the module is re-enabled.

# How to Use

Create or edit an Active Effect and add a new change row. Use change type `Rave 5e` for any of the usual system effect attribute keys, then click the Rave 5e Editor button.

Each Rave 5e change uses a small JSON value. `op` says what to do, `value` is what to apply, and `when` says when the change should apply. Conditions usually compare a `path` against a value with operators like `eq`, `gt`, `includes`, or `exists`.

Inline example:

```json
{"op":"add","value":2,"when":{"path":"attributes.ac.equippedArmor","exists":false}}
```
This means: add 2 when the actor has no equipped armor.

Conditions can check normal dnd5e actor data, plus extra Rave 5e paths for items, owned effects, and movement.

## Examples

### Unarmored Defense (Monk)

While you aren't wearing armor or wielding a Shield, your base Armor Class equals 10 plus your Dexterity and Wisdom modifiers.

Active Effect change:

| Key | Type | Value |
| --- | --- | --- |
| `system.attributes.ac.calc` | `Rave 5e` | `{"op":"override","value":"custom","when":{"all":[{"path":"attributes.ac.equippedArmor","exists":false},{"path":"attributes.ac.equippedShield","exists":false}]}}` |
| `system.attributes.ac.formula` | `Rave 5e` | `{"op":"override","value":"10 + @abilities.dex.mod + @abilities.wis.mod","when":{"all":[{"path":"attributes.ac.equippedArmor","exists":false},{"path":"attributes.ac.equippedShield","exists":false}]}}` |

### Unarmored Movement (Monk)

While you aren't wearing armor or wielding a Shield, your speed increases by your Monk movement scale value.

Active Effect change:

| Key | Type | Value |
| --- | --- | --- |
| `system.attributes.movement.walk` | `Rave 5e` | `{"op":"add","value":"@scale.monk.unarmored-movement","when":{"all":[{"path":"attributes.ac.equippedArmor","exists":false},{"path":"attributes.ac.equippedShield","exists":false}]}}` |

### Unarmored Defense (Barbarian)

While you aren't wearing any armor, your base Armor Class equals 10 plus your Dexterity and Constitution modifiers. You can use a Shield and still gain this benefit.

Active Effect change:

| Key | Type | Value |
| --- | --- | --- |
| `system.attributes.ac.calc` | `Rave 5e` | `{"op":"override","value":"custom","when":{"path":"attributes.ac.equippedArmor","exists":false}}` |
| `system.attributes.ac.formula` | `Rave 5e` | `{"op":"override","value":"10 + @abilities.dex.mod + @abilities.con.mod","when":{"path":"attributes.ac.equippedArmor","exists":false}}` |

### Scimitar Attack Bonus

Add +2 to attack rolls made with an item named Scimitar.

Active Effect change:

| Key | Type | Value |
| --- | --- | --- |
| `system.bonuses.mwak.attack` | `Rave 5e` | `{"op":"add","value":"2","when":{"path":"item.name","eq":"Scimitar"}}` |

### Scimitar Fire Damage

Add 2d6 fire damage to damage rolls made with an item named Scimitar.

Active Effect change:

| Key | Type | Value |
| --- | --- | --- |
| `system.bonuses.mwak.damage` | `Rave 5e` | `{"op":"add","value":"2d6[fire]","when":{"path":"item.name","eq":"Scimitar"}}` |

## Item-aware Changes

Rave 5e can make changes depend on the item being prepared or rolled in two ways.

### Actor Bonus Keys

Use keys such as `system.bonuses.mwak.attack` and `system.bonuses.mwak.damage` when you want to add an attack or damage bonus for matching items. For example, you can add cold damage only when the item is named Dagger or Staff.

Example:

| Key | Type | Value |
| --- | --- | --- |
| `system.bonuses.mwak.damage` | `Rave 5e` | `{"op":"add","value":"2d8[cold]","when":{"path":"item.name","in":["Dagger","Staff"]}}` |

### Direct Item Preparation Keys

Use item keys such as `activities[attack].damage.parts`, `system.damage.types`, `name`, or `img` when you want the owned item itself to temporarily change. This can work like a conditional enchantment without permanently editing the item.

Example:

| Key | Type | Value |
| --- | --- | --- |
| `activities[attack].damage.parts` | `Rave 5e` | `{"op":"add","value":["2d6","fire"],"when":{"path":"item.type","eq":"weapon"}}` |

Add fire to the available damage types for matching item damage parts:

| Key | Type | Value |
| --- | --- | --- |
| `system.damage.types` | `Rave 5e` | `{"op":"add","value":"[fire]","when":{"path":"item.name","includes":"Dagger"}}` |

### Runtime Item Changes

Enable Runtime when an item change needs activity-use data such as scaling choices. Runtime changes are evaluated during activity use instead of normal item preparation.

In the Rave 5e Editor, the inline Runtime checkbox adds `"runtimeOnly":true` to the generated JSON. Use it when the value or condition needs data that only exists while an activity is being used, such as `@scaling`, `@scaling.increase`, or the current `activity`.

Example: set a spherical save template size from the chosen scaling value and the scene grid distance.

| Key | Type | Value |
| --- | --- | --- |
| `activities[save].target.template.size` | `Rave 5e` | `{"op":"override","value":"@scaling * @gridDistance","when":{"all":[{"path":"activity.target.template.type","eq":"sphere"},{"path":"scaling.increase","gt":0}]},"runtimeOnly":true}` |

### Conditional Condition Immunity

Condition immunity can be conditional too. This also applies when dnd5e creates condition effects from normal statuses or rider statuses.

Example: gain immunity to poisoned only when the origin item name contains Elf Poison.

| Key | Type | Value |
| --- | --- | --- |
| `system.traits.ci.value` | `Rave 5e` | `{"op":"add","value":"poisoned","when":{"path":"item.name","includes":"Elf Poison"}}` |

Custom condition immunity names are stored by dnd5e as a semicolon-separated string. Conditional handling for custom trait text such as `system.traits.ci.custom` is intentionally deferred for a later pass.

## Paths You Can Check

| Path | Meaning |
| --- | --- |
| `item.name` | The item's name, when Rave is checking a specific item. |
| `item.identifier` | The item's identifier, when available. |
| `item.id` | The item's id, when available. |
| `item.type` | The item's type, such as `weapon`, `spell`, or `equipment`. |
| `item.uuid` | The item's UUID, when available. |
| `activity.name` | The rolling activity's name, when available. |
| `activity.id` | The rolling activity's id, when available. |
| `activity.type` | The rolling activity's type, when available. |
| `activity.uuid` | The rolling activity's UUID, when available. |
| `gridDistance` | The current scene grid distance. Use `@gridDistance` inside formula-style values. |
| `attributes.hp.pct` | Current hit points as a percentage of maximum hit points. |
| `attributes.hd.pct` | Current hit dice as a percentage of maximum hit dice. |
| `attributes.encumbrance.pct` | Current encumbrance as a percentage of maximum encumbrance. |
| `items.names` | Actor item names. |
| `items.<id>.*` | Actor item data by item id, including `name`, `uuid`, `id`, `identifier`, `type`, `systemType`, `uses`, `equipped`, `properties`, `mastery`, `magicalBonus`, `rarity`, and `attuned`. |
| `items.<type>.names` | Actor item names grouped by item type. |
| `equippedItems.names` | Equipped actor item names. |
| `equippedItems.identifiers` | Equipped actor item identifiers. |
| `effects.names` | Enabled actor and owned-item effect names visible to Rave. |
| `effect.<id>.*` | Enabled actor or owned-item effect data by effect id, including `name`, `uuid`, `id`, `disabled`, and `suppressed`. |
| `flags.*` | Actor flags that currently exist on the actor. |
| `movementLastSegment` | Combat movement cost for the actor token's most recent movement segment. |
| `movementTurn` | Combat movement cost for the actor token this turn. |

## Change Operations

`op` controls what happens when the condition passes.

| op | Effect |
| --- | --- |
| `add` | Adds the value to the target. |
| `subtract` | Subtracts the value from the target. |
| `override` | Replaces the target with the value. |
| `upgrade` | Replaces the target only if the value is higher. |
| `downgrade` | Replaces the target only if the value is lower. |
| `multiply` | Multiplies the target by the value. |
| `toggle` | Adds or removes the value from Set and array targets, or flips a boolean target. |

## Conditions

Conditions check actor data and Rave 5e's added paths. If a path is missing, the condition does not pass unless you are using `exists` to check for that.

| Condition | Example |
| --- | --- |
| path has a value | `{"path":"attributes.ac.equippedArmor"}` |
| path exists | `{"path":"attributes.ac.equippedArmor","exists":true}` |
| path missing | `{"path":"attributes.ac.equippedArmor","exists":false}` |
| equals | `{"path":"abilities.dex.mod","eq":3}` |
| not equals | `{"path":"details.type.value","ne":"undead"}` |
| greater than | `{"path":"attributes.hp.value","gt":0}` |
| greater or equal | `{"path":"abilities.str.value","gte":13}` |
| less than | `{"path":"attributes.hp.value","lt":10}` |
| less or equal | `{"path":"attributes.exhaustion","lte":2}` |
| actor value is one of these values | `{"path":"details.type.value","in":["humanoid","fiend"]}` |
| actor array or Set contains this value | `{"path":"traits.languages.value","includes":"elvish"}` |
| all pass | `{"all":[{"path":"attributes.hp.pct","gt":50},{"path":"attributes.ac.equippedArmor","exists":false}]}` |
| any passes | `{"any":[{"path":"traits.di.value","includes":"fire"},{"path":"traits.dr.value","includes":"fire"}]}` |
| not | `{"not":{"path":"attributes.ac.equippedArmor"}}` |

## Values

`value` can be a literal or a small numeric expression.

| Value | Example |
| --- | --- |
| literal number | `2` |
| literal string | `"elvish"` |
| actor path | `{"path":"abilities.dex.mod"}` |
| add | `{"add":[1,{"path":"abilities.dex.mod"}]}` |
| subtract | `{"sub":[{"path":"attributes.hp.max"},{"path":"attributes.hp.value"}]}` |
| multiply | `{"mul":[2,{"path":"prof"}]}` |
| divide | `{"div":[{"path":"attributes.hp.max"},2]}` |
| floor | `{"floor":{"div":[{"path":"attributes.hp.max"},2]}}` |
| ceil | `{"ceil":{"div":[{"path":"attributes.hp.max"},2]}}` |
| round | `{"round":{"div":[{"path":"attributes.hp.max"},2]}}` |
| absolute | `{"abs":-2}` |
| minimum | `{"min":[1,2,3]}` |
| maximum | `{"max":[1,2,3]}` |

Formula-style strings can also use roll-data references directly:

| Value | Example |
| --- | --- |
| actor formula | `"10 + @abilities.dex.mod + @abilities.wis.mod"` |
| runtime scaling formula | `"@scaling * @gridDistance"` |

Use the `@` prefix for roll-data references in formula-style strings.
## Showcase

[System Trait keys](https://github.com/user-attachments/assets/3ba4357d-bb4d-4c51-bc75-c12c57260cad)

[System bonuses mwak keys](https://github.com/user-attachments/assets/23d08b18-608a-4224-9b1f-157184038928)
