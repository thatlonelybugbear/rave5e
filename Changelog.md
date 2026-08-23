## v14.533.5
* Added per-activity condition evaluation for `activities[<type>]` enchantment changes, making `activity.*` paths available during normal item preparation.
* Refreshed attack, damage, and save labels after conditional activity changes while preserving enchanted base-damage parts.

## v14.533.4
* Fixed persisted Rave changes not invoking the registered change handler during actor preparation.
* Fixed unarmored conditions by resolving equipped armor and shields before dnd5e prepares Armor Class.
* Preserved formula-field values until dnd5e resolves derived roll data such as ability modifiers.
* Fixed `exists: false` editor round-tripping and hid the unused Compare field for presence checks.

## v14.533.3
* First public release of Rave 5e.
* Updated Active Effect integration for Foundry VTT 14.365 and later.
* Hardened D&D 5e activity, attack, damage, enchantment, attribution, status, and rider-condition wrappers.
* Moved the conditional editor interface into a Handlebars template.
* Added automatic repair for deleted or unassigned Rave 5e compendium folders.
* Added the new proprietary license permitting personal, non-commercial use.

## v14.533.2
* Added a Module Support settings menu with README, issue tracker, Discord, Ko-Fi, and Patreon links.
* Added Runtime support for Rave item changes so activity-use data such as scaling can be evaluated during use.
* Added an inline Runtime checkbox in the conditional editor; enable it when a change needs activity-use roll data such as `@scaling`, `@scaling.increase`, or the current activity.
* Added formula-style value support, allowing entries like `@scaling * 5` instead of JSON math DSL (`{"mul":[{"path":"scaling"},5]}`).
* Added `gridDistance` to Rave roll data for formula values such as `@scaling * @gridDistance`.
* Added conditional condition immunity support for normal statuses and dnd5e rider statuses.
  * Rechecked conditional condition immunity at runtime after world load so pre-existing status effects are suppressed without toggling an effect first.
  * Conditional condition immunity currently targets `system.traits.ci.value`; semicolon-separated custom trait text such as `system.traits.ci.custom` is intentionally deferred for a later module release.
* Added Rave handling for `system.damage.types` to update item base damage and compatible activity damage parts.
* Added spell school autocomplete data and kept `item.system` available behind the scenes without surfacing it in autocomplete.
* Improved the conditional editor layout, added an inline Runtime checkbox, added local README access from the attribute key help, and made large condition lists scroll inside the editor.
* Updated dnd5e compatibility metadata to cap at 6.0.0 for testing purposes.

## v14.533.1
* Initial release of Rave 5e for Foundry VTT 14.x.
