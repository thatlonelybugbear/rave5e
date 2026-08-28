const MODULE_ID = 'rave5e';
const CHANGE_TYPE = 'rave5e';
const CHANGE_ROWS_FLAG = 'changeRows';
const STORAGE_KEY_PREFIX = `flags.${MODULE_ID}.changes`;
const OPERATION_OPTIONS = [
	['add', 'RAVE5E.Editor.Operation.Add', 'RAVE5E.Editor.Operation.AddHint'],
	['subtract', 'RAVE5E.Editor.Operation.Subtract', 'RAVE5E.Editor.Operation.SubtractHint'],
	['override', 'RAVE5E.Editor.Operation.Override', 'RAVE5E.Editor.Operation.OverrideHint'],
	['upgrade', 'RAVE5E.Editor.Operation.Upgrade', 'RAVE5E.Editor.Operation.UpgradeHint'],
	['downgrade', 'RAVE5E.Editor.Operation.Downgrade', 'RAVE5E.Editor.Operation.DowngradeHint'],
	['multiply', 'RAVE5E.Editor.Operation.Multiply', 'RAVE5E.Editor.Operation.MultiplyHint'],
	['toggle', 'RAVE5E.Editor.Operation.Toggle', 'RAVE5E.Editor.Operation.ToggleHint'],
].map(([value, label, hint]) => ({ value, label, hint }));
const OPS = new Set(OPERATION_OPTIONS.map(({ value }) => value));
const CONDITION_OPERATOR_OPTIONS = [
	['truthy', 'RAVE5E.Editor.Operator.Truthy', 'RAVE5E.Editor.Operator.TruthyHint'],
	['exists', 'RAVE5E.Editor.Operator.Exists', 'RAVE5E.Editor.Operator.ExistsHint'],
	['eq', 'RAVE5E.Editor.Operator.Equals', 'RAVE5E.Editor.Operator.EqualsHint'],
	['ne', 'RAVE5E.Editor.Operator.NotEquals', 'RAVE5E.Editor.Operator.NotEqualsHint'],
	['gt', 'RAVE5E.Editor.Operator.GreaterThan', 'RAVE5E.Editor.Operator.GreaterThanHint'],
	['gte', 'RAVE5E.Editor.Operator.GreaterThanEqual', 'RAVE5E.Editor.Operator.GreaterThanEqualHint'],
	['lt', 'RAVE5E.Editor.Operator.LessThan', 'RAVE5E.Editor.Operator.LessThanHint'],
	['lte', 'RAVE5E.Editor.Operator.LessThanEqual', 'RAVE5E.Editor.Operator.LessThanEqualHint'],
	['in', 'RAVE5E.Editor.Operator.In', 'RAVE5E.Editor.Operator.InHint'],
	['includes', 'RAVE5E.Editor.Operator.Includes', 'RAVE5E.Editor.Operator.IncludesHint'],
].map(([value, label, hint]) => ({ value, label, hint }));
const CONDITION_OPERATORS = CONDITION_OPERATOR_OPTIONS.map(({ value }) => value);
const DEFAULT_CONDITION_ROW = { path: '', operator: 'truthy', compare: '', negate: false };
const DND5E_ACTIVE_EFFECT_WIKI = 'https://github.com/foundryvtt/dnd5e/wiki/Active-Effect-Guide';
const README_PACK = `${MODULE_ID}.rave5e-readme`;
const RAVE_HANDLING_LABEL = '*';
const MAX_DEPTH = 24;
const actorContexts = new WeakMap();
let generatedJsonExpanded = false;
const conditionalEditorApps = new Map();

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class Rave5eLinksMenu extends HandlebarsApplicationMixin(ApplicationV2) {
	static LINKS = [
		{ label: 'README', icon: 'fa-brands fa-github', url: 'https://github.com/thatlonelybugbear/rave5e/blob/main/README.md' },
		{ label: 'Issues', icon: 'fa-solid fa-circle-exclamation', url: 'https://github.com/thatlonelybugbear/rave5e/issues' },
		{ label: 'Discord', icon: 'fa-brands fa-discord', url: 'https://discord.gg/twsvWuJJEN' },
		{ label: 'Ko-Fi', icon: 'fa-solid fa-mug-hot', url: 'https://ko-fi.com/thatlonelybugbear' },
		{ label: 'Patreon', icon: 'fa-brands fa-patreon', url: 'https://www.patreon.com/thatlonelybugbear' },
	];

	static DEFAULT_OPTIONS = {
		id: 'rave5e-links-menu',
		classes: ['rave5e-links-menu'],
		window: {
			title: 'RAVE5E.LinksMenu.Title',
			icon: 'fa-solid fa-link',
			resizable: false,
		},
		actions: {
			openLink: Rave5eLinksMenu.#onOpenLink,
		},
		position: {
			width: 420,
			height: 'auto',
		},
	};

	static PARTS = {
		body: {
			template: 'modules/rave5e/templates/apps/rave5e-links-menu.hbs',
		},
	};

	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		context.primaryLinks = this.constructor.LINKS.slice(0, 2);
		context.secondaryLinks = this.constructor.LINKS.slice(2, 3);
		context.tertiaryLinks = this.constructor.LINKS.slice(3);
		return context;
	}

	static #onOpenLink(_event, target) {
		const url = target?.dataset?.url;
		if (!url) return;
		globalThis.open(url, '_blank', 'noopener,noreferrer');
	}
}

registerChangeType();

Hooks.once('init', () => {
	registerSettings();
	patchDnd5eItemPrepareFinalAttributes();
	patchDnd5eActivityUsageScaling();
	patchActorApplyActiveEffects();
	patchDnd5eRiderConditions();
	patchDnd5eAttackConfig();
	patchDnd5eDamageConfig();
	patchDnd5eActiveEffectAttributions();
	registerReadmeTooltipLink();
});

function patchDnd5eActiveEffectAttributions() {
	const cls = CONFIG.Actor.documentClass;
	if (!cls?.prototype._prepareActiveEffectAttributions || cls.prototype._rave5eAttributionsPatched) return;
	const wrapper = function (wrapped, ...args) {
		const target = args[0];
		const attributions = wrapped(...args);
		if (target !== 'system.attributes.ac.bonus') return attributions;

		const value = Array.from(getActorOwnedEffects(this)).reduce((total, effect) => {
			if (effect.disabled || effect.isSuppressed) return total;
			return (
				total +
				effect.changes.reduce((n, change) => {
					const resolvedChange = resolveRaveChange(change, effect);
					if (resolvedChange.key !== target || !isRaveChange(resolvedChange) || resolvedChange.mode !== CONST.ACTIVE_EFFECT_MODES.CUSTOM) return n;
					const spec = parseSpec(resolvedChange);
					if (!spec || spec.runtimeOnly || spec.op !== 'add') return n;
					const rollData = buildContext(this);
					if (spec.when && !evaluateCondition(spec.when, rollData)) return n;
					const value = Number(evaluateValue(spec.value, rollData));
					return Number.isFinite(value) ? n + value : n;
				}, 0)
			);
		}, 0);
		if (value) attributions.push({ value, label: game.i18n.localize('RAVE5E.ChangeTypes.conditional'), document: this, mode: CONST.ACTIVE_EFFECT_MODES.ADD });
		return attributions;
	};
	if (globalThis.libWrapper?.register) {
		globalThis.libWrapper.register(MODULE_ID, 'CONFIG.Actor.documentClass.prototype._prepareActiveEffectAttributions', wrapper, 'WRAPPER');
		cls.prototype._rave5eAttributionsPatched = true;
		return;
	}
	const prepareAttributions = cls.prototype._prepareActiveEffectAttributions;
	cls.prototype._prepareActiveEffectAttributions = function (...args) {
		return wrapper.call(this, prepareAttributions.bind(this), ...args);
	};
	cls.prototype._rave5eAttributionsPatched = true;
}

Hooks.once('ready', async () => {
	await migrateCompendiumFolders();
	await migrateRaveStorageKeys();
	queueMicrotask(() => {
		for (const actor of game.actors ?? []) filterConditionallySuppressedStatuses(actor);
	});
});

function registerChangeType() {
	const config = {
		label: 'RAVE5E.ChangeTypes.conditional',
		defaultPriority: 20,
		handler: applyConditionalChange,
		render: null,
	};
	CONFIG.ActiveEffect.changeTypes[CHANGE_TYPE] = config;
}

function registerSettings() {
	game.settings.register(MODULE_ID, 'compendiumFoldersMigrated', {
		scope: 'world',
		config: false,
		type: new foundry.data.fields.BooleanField({ initial: false }),
	});

	game.settings.registerMenu(MODULE_ID, 'linksMenu', {
		name: 'RAVE5E.LinksMenu.Name',
		label: 'RAVE5E.LinksMenu.Label',
		hint: 'RAVE5E.LinksMenu.Hint',
		icon: 'fa-solid fa-link',
		type: Rave5eLinksMenu,
		restricted: false,
	});
}

async function migrateCompendiumFolders() {
	if (!game.user.isActiveGM) return;
	const configuration = foundry.utils.deepClone(game.settings.get('core', 'compendiumConfiguration'));
	const modulePacks = [...game.packs].filter((pack) => pack.metadata.packageName === MODULE_ID);
	const folder = game.folders.find((entry) => entry.type === 'Compendium' && entry.name === 'Rave 5e');
	const isUnassigned = (pack) => {
		const folderId = configuration[pack.collection]?.folder;
		return folderId == null || !game.folders.has(folderId);
	};
	const repairDeletedFolder = game.settings.get(MODULE_ID, 'compendiumFoldersMigrated')
		&& !folder
		&& modulePacks.length
		&& modulePacks.every(isUnassigned);
	if (!game.settings.get(MODULE_ID, 'compendiumFoldersMigrated') || repairDeletedFolder) {
		const packs = modulePacks.filter(isUnassigned);
		if (packs.length) {
			const targetFolder = folder ?? await Folder.create({ name: 'Rave 5e', type: 'Compendium', color: '#348f2d', sorting: 'm' });
			for (const pack of packs) {
				configuration[pack.collection] ??= {};
				configuration[pack.collection].folder = targetFolder.id;
			}
			await game.settings.set('core', 'compendiumConfiguration', configuration);
		}
	}
	await game.settings.set(MODULE_ID, 'compendiumFoldersMigrated', true);
}

function patchDnd5eItemPrepareFinalAttributes() {
	const cls = CONFIG.Item.documentClass;
	if (!cls?.prototype.prepareFinalAttributes || cls.prototype._rave5eConditionalEnchantmentsPatched) return;
	const wrapper = function (wrapped, ...args) {
		const result = wrapped(...args);
		applyConditionallyAppliedEnchantments(this);
		this._prepareLabels?.();
		return result;
	};
	if (globalThis.libWrapper?.register) {
		globalThis.libWrapper.register(MODULE_ID, 'CONFIG.Item.documentClass.prototype.prepareFinalAttributes', wrapper, 'WRAPPER');
		cls.prototype._rave5eConditionalEnchantmentsPatched = true;
		return;
	}
	const prepareFinalAttributes = cls.prototype.prepareFinalAttributes;
	cls.prototype.prepareFinalAttributes = function (...args) {
		return wrapper.call(this, prepareFinalAttributes.bind(this), ...args);
	};
	cls.prototype._rave5eConditionalEnchantmentsPatched = true;
}

function applyConditionallyAppliedEnchantments(item, options) {
	const overrides = {};
	const changedActivities = new Set();
	for (const change of getConditionallyAppliedEnchantments(item, options)) {
		if (change._rave5eSkipApply) continue;
		const applied = change.effect.constructor.applyChange(item, change, { replacementData: buildContext(item.actor, { effect: change.effect, item, activity: options?.activity }), modifyTarget: true });
		Object.assign(overrides, applied);
		const activityId = change.key.match(/^system\.activities\.([^.]+)\./)?.[1];
		if (activityId) changedActivities.add(item.system.activities?.get(activityId));
	}
	foundry.utils.mergeObject(item.overrides, foundry.utils.expandObject(overrides));
	for (const activity of changedActivities) refreshActivityLabels(activity);
}

function refreshActivityLabels(activity) {
	if (!activity?.prepareFinalData) return;
	const parts = activity.damage?.parts;
	const baseParts = Array.isArray(parts) ? parts.filter((part) => part.base) : [];
	if (baseParts.length) parts.splice(0, parts.length, ...parts.filter((part) => !part.base));
	const rollData = activity.getRollData({ deterministic: true });
	activity.prepareFinalData(rollData);
	if (!baseParts.length) return;
	const preparedParts = activity.damage?.parts;
	preparedParts.splice(0, preparedParts.length, ...baseParts, ...preparedParts.filter((part) => !part.base));
	activity.prepareDamageLabel?.(rollData);
}

function patchDnd5eActivityUsageScaling() {
	const classes = new Map();
	for (const [type, config] of Object.entries(CONFIG.DND5E?.activityTypes ?? {})) {
		if (config?.documentClass && !classes.has(config.documentClass)) classes.set(config.documentClass, type);
	}
	for (const [cls, type] of classes) {
		if (!cls.prototype?._prepareUsageScaling || Object.hasOwn(cls.prototype, '_rave5eRuntimeEnchantmentsPatched')) continue;
		const wrapper = async function (wrapped, ...args) {
			const item = args[2];
			const result = await wrapped(...args);
			if (item) {
				applyConditionallyAppliedEnchantments(item, { runtimeOnly: true, activity: item.system.activities?.get(this.id) });
				item._prepareLabels?.();
			}
			return result;
		};
		if (globalThis.libWrapper?.register) {
			globalThis.libWrapper.register(MODULE_ID, `CONFIG.DND5E.activityTypes.${type}.documentClass.prototype._prepareUsageScaling`, wrapper, 'WRAPPER');
			cls.prototype._rave5eRuntimeEnchantmentsPatched = true;
			continue;
		}
		const prepareUsageScaling = cls.prototype._prepareUsageScaling;
		cls.prototype._prepareUsageScaling = function (...args) {
			return wrapper.call(this, prepareUsageScaling.bind(this), ...args);
		};
		cls.prototype._rave5eRuntimeEnchantmentsPatched = true;
	}
}

function patchActorApplyActiveEffects() {
	const cls = CONFIG.Actor.documentClass;
	if (!cls?.prototype.applyActiveEffects || cls.prototype._rave5eConditionalStatusPatched) return;
	const wrapper = function (wrapped, ...args) {
		const phase = args[0];
		const restored = [];
		for (const effect of this.allApplicableEffects?.() ?? []) {
			for (const change of effect.changes ?? []) {
				if (!isRaveChange(change)) continue;
				const resolved = resolveRaveChange(change, effect);
				restored.push([change, change.key, change.type]);
				change.key = resolved.key;
				change.type = CHANGE_TYPE;
			}
		}
		try {
			const result = wrapped(...args);
			if (phase === 'initial') filterConditionallySuppressedStatuses(this);
			return result;
		} finally {
			for (const [change, key, type] of restored) {
				change.key = key;
				change.type = type;
			}
		}
	};
	if (globalThis.libWrapper?.register) {
		globalThis.libWrapper.register(MODULE_ID, 'CONFIG.Actor.documentClass.prototype.applyActiveEffects', wrapper, 'WRAPPER');
		cls.prototype._rave5eConditionalStatusPatched = true;
		return;
	}
	const applyActiveEffects = cls.prototype.applyActiveEffects;
	cls.prototype.applyActiveEffects = function (...args) {
		return wrapper.call(this, applyActiveEffects.bind(this), ...args);
	};
	cls.prototype._rave5eConditionalStatusPatched = true;
}

function patchDnd5eRiderConditions() {
	const cls = CONFIG.ActiveEffect.documentClass;
	if (!cls?.prototype.createRiderConditions || cls.prototype._rave5eConditionalRidersPatched) return;
	const wrapper = async function (wrapped, ...args) {
		const created = await wrapped(...args);
		if (!Array.isArray(created)) return created;
		if (!(this.parent instanceof CONFIG.Actor.documentClass)) return created;
		const suppressed = created.filter((effect) => Array.from(effect.statuses ?? []).some((status) => isConditionallyImmuneToStatus(this.parent, status, this)));
		if (suppressed.length) await this.parent.deleteEmbeddedDocuments('ActiveEffect', suppressed.map((effect) => effect.id));
		return created.filter((effect) => !suppressed.includes(effect));
	};
	if (globalThis.libWrapper?.register) {
		globalThis.libWrapper.register(MODULE_ID, 'CONFIG.ActiveEffect.documentClass.prototype.createRiderConditions', wrapper, 'WRAPPER');
		cls.prototype._rave5eConditionalRidersPatched = true;
		return;
	}
	const createRiderConditions = cls.prototype.createRiderConditions;
	cls.prototype.createRiderConditions = function (...args) {
		return wrapper.call(this, createRiderConditions.bind(this), ...args);
	};
	cls.prototype._rave5eConditionalRidersPatched = true;
}

function filterConditionallySuppressedStatuses(actor) {
	for (const status of Array.from(actor.statuses ?? [])) {
		const providers = Array.from(actor.allApplicableEffects?.() ?? []).filter((effect) => effect.active && effect.statuses?.has(status));
		if (providers.length && providers.every((effect) => isConditionallyImmuneToStatus(actor, status, effect))) actor.statuses.delete(status);
	}
}

function isConditionallyImmuneToStatus(actor, status, originEffect) {
	for (const effect of getActorOwnedEffects(actor)) {
		if (effect.disabled || effect.isSuppressed) continue;
		for (const change of effect.changes) {
			const preparedChange = resolveRaveChange(change, effect);
			if (preparedChange.key !== 'system.traits.ci.value' || !isRaveChange(preparedChange)) continue;
			const spec = parseSpec(preparedChange);
			if (!spec || spec.runtimeOnly || !['add', 'override', 'toggle'].includes(spec.op)) continue;
			const rollData = buildContext(actor, { effect: originEffect, item: getEffectContextItem(originEffect), activity: getEffectContextActivity(originEffect) });
			if (spec.when && !evaluateCondition(spec.when, rollData)) continue;
			if (matchesStatus(evaluateValue(spec.value, rollData), status)) return true;
		}
	}
	return false;
}

function* getConditionallyAppliedEnchantments(item, { runtimeOnly = false, activity } = {}) {
	const actor = item.actor;
	if (!actor) return;
	for (const effect of getActorOwnedEffects(actor)) {
		if (effect.disabled || effect.isSuppressed) continue;
		for (const change of effect.changes) {
			const preparedChange = resolveRaveChange(change, effect);
			if (!isRaveChange(preparedChange)) continue;
			if (!isEnchantmentChangeKey(preparedChange.key)) continue;
			const spec = parseSpec(preparedChange);
			if (!spec) continue;
			if (Boolean(spec.runtimeOnly) !== runtimeOnly) continue;
			for (const [targetChange, targetActivity] of getEnchantmentChangeTargets(item, preparedChange, activity)) {
				const rollData = buildContext(actor, { effect, item, activity: targetActivity });
				if (spec.when && !evaluateCondition(spec.when, rollData)) continue;
				let value = evaluateValue(spec.value, rollData);
				if (value === undefined) continue;
				if (targetChange.key === 'system.damage.types') {
					yield* getDamageTypeEnchantmentChanges(item, targetChange, spec.op, value);
					continue;
				}
				const normalized = normalizeConditionallyAppliedEnchantmentChange(targetChange.key, spec.op, value, targetActivity);
				yield { ...targetChange, count: 1, type: normalized.op, value: normalized.value };
			}
		}
	}
}

function getEnchantmentChangeTargets(item, change, activity) {
	const match = change.key.match(/^activities\[([^\]]+)]\.(.+)$/);
	if (match) {
		const activities = activity ? (activity.type === match[1] ? [activity] : []) : (item.system.activities?.getByType(match[1]) ?? []);
		return activities.map((entry) => [{ ...change, key: `system.activities.${entry.id}.${match[2]}` }, entry]);
	}
	if (change.key.startsWith('system.activities.')) {
		const id = change.key.split('.')[2];
		return [[change, item.system.activities?.get(id) ?? activity]];
	}
	return [[change, activity]];
}

function* getDamageTypeEnchantmentChanges(item, change, op, value) {
	const values = [value].flat().filter(Boolean).map((entry) => `${entry}`);
	if (item.system.damage?.base) {
		applyDamageTypes(item.system.damage.base.types, op, values);
	}
	for (const activity of item.system.activities?.getByTypes?.('attack', 'damage', 'save') ?? []) {
		for (const part of activity.damage.parts) applyDamageTypes(part.types, op, values);
	}
	yield { ...change, _rave5eSkipApply: true };
}

function applyDamageTypes(current, op, values) {
	if (!['Set', 'Array'].includes(foundry.utils.getType(current))) return;
	const result = op === 'override' ? new Set() : new Set(current);
	for (const value of values) {
		if (op === 'add') result.add(value);
		else if (op === 'subtract') result.delete(value);
		else if (op === 'override') result.add(value);
	}
	if (foundry.utils.getType(current) === 'Set') {
		current.clear();
		for (const value of result) current.add(value);
	} else {
		current.splice(0, current.length, ...result);
	}
}

function normalizeConditionallyAppliedEnchantmentChange(key, op, value, activity) {
	if (activity) {
		const activityKey = key.startsWith('system.activities.') ? key.split('.').slice(3).join('.') : key.match(/^activities\[[^\]]+]\.(.+)$/)?.[1];
		if (isActivityFormulaAddKey(activityKey) && ['add', 'subtract', 'multiply'].includes(op)) {
			const current = Number(foundry.utils.getProperty(activity, activityKey));
			const delta = Number(value);
			if (Number.isFinite(current) && Number.isFinite(delta)) {
				const next =
					op === 'add' ? current + delta
					: op === 'subtract' ? current - delta
					: current * delta;
				return { op: 'override', value: next };
			}
		}
	}
	return { op, value: normalizeConditionallyAppliedEnchantmentValue(key, op, value) };
}

function isActivityFormulaAddKey(key) {
	return /^(target\.template\.(count|size|width|height)|target\.affects\.count|range\.value|duration\.value)$/.test(key ?? '');
}

function normalizeConditionallyAppliedEnchantmentValue(key, op, value) {
	if (!/^(?:activities\[[^\]]+]|system\.activities\.[^.]+)\.damage\.parts$/.test(key)) return value;
	if (op === 'add' && Array.isArray(value) && typeof value[0] === 'string') return damagePartValue(value);
	if (op === 'override' && Array.isArray(value)) return value.map((part) => (Array.isArray(part) ? damagePartValue(part) : part));
	return value;
}

function damagePartValue([formula, type]) {
	const data = {
		number: null,
		denomination: null,
		bonus: '',
		types: type ? [type] : [],
		custom: { enabled: false, formula: '' },
		scaling: { mode: '', number: null, formula: '' },
		enchantment: true,
		locked: true,
	};
	const parsed = `${formula ?? ''}`.match(/^\s*(\d+)d(\d+)(?:\s*([+|-])\s*(@?[\w\d.-]+))?\s*$/i);
	if (parsed) {
		data.number = Number(parsed[1]);
		data.denomination = Number(parsed[2]);
		if (parsed[4]) data.bonus = parsed[3] === '-' ? `-${parsed[4]}` : parsed[4];
	} else if (formula) {
		data.custom.enabled = true;
		data.custom.formula = formula;
	}
	return data;
}

function* getActorOwnedEffects(actor) {
	yield* actor.effects ?? [];
	for (const item of actor.items ?? []) yield* item.effects ?? [];
}

function isEnchantmentChangeKey(key) {
	if (isActivityBonusKey(key)) return false;
	return ['name', 'img'].includes(key) || key.startsWith('system.') || key.startsWith('activities[') || key.startsWith('system.activities.');
}

Hooks.on('renderActiveEffectConfig', (app, html) => {
	const root = normalizeElement(html);
	if (!root) return;
	moveConditionalChangeTypeOptionsToBottom(root);
	restoreRaveAuthoredRows(app, root);
	initializeConditionalKeyAutocomplete(app, root);
	initializeConditionalButtonSync(app, root);
	refreshConditionalButtons(app, root);
});

Hooks.on('preCreateActiveEffect', (effect, data) => normalizeRaveActiveEffectChangeTypes(effect, data, { updateSource: true }));
Hooks.on('preUpdateActiveEffect', (effect, changes) => normalizeRaveActiveEffectChangeTypes(effect, changes));
Hooks.on('dnd5e.preRollSavingThrow', (config, _dialog, message) => {
	console.log('[Rave5e] save roll hook', JSON.stringify({ ability: config?.ability, configRollCount: config?.rolls?.length, hasMessageConfig: !!message }));
	applyConditionalSaveResistance(config, message);
});

function applyConditionalSaveResistance(config, messageConfig) {
	const actor = config?.subject;
	const ability = config?.ability;
	const message = getOriginatingUsageMessage(config, messageConfig);
	console.log('[Rave5e] save origin', JSON.stringify({ ability, actor: actor?.name, found: !!message }));
	if (!actor || !ability || !message) return;
	const item = message.getAssociatedItem?.();
	const activity = message.getAssociatedActivity?.();
	const effects = (message.system?.effects ?? [])
		.map((uuid) => (uuid.length === 16 ? item?.effects.get(uuid) : fromUuidSync(uuid, { relative: item, strict: false })))
		.filter(Boolean);
	if (!effects.length) effects.push(...(activity?.applicableEffects ?? []));
	const riderStatuses = {};
	for (const effect of effects) {
		for (const status of effect.statuses ?? []) riderStatuses[status] = true;
		for (const status of effect.flags?.dnd5e?.riders?.statuses ?? []) riderStatuses[status] = true;
	}
	console.log('[Rave5e] rider statuses', JSON.stringify({ effects: effects.map((effect) => ({ name: effect.name, id: effect.id })), riderStatuses }));

	const target = `system.abilities.${ability}.save.roll.mode`;
	const rollOptions = config.rolls?.[0]?.options;
	console.log('[Rave5e] save roll options', JSON.stringify({ fromConfig: !!rollOptions, options: { advantage: rollOptions?.advantage, disadvantage: rollOptions?.disadvantage, mode: rollOptions?.mode } }));
	if (!rollOptions) return;
	const counts = {
		advantages: Number(rollOptions.advantage),
		disadvantages: Number(rollOptions.disadvantage),
		suppressAdvantages: false,
		suppressDisadvantages: false,
		override: null,
	};
	for (const effect of getActorOwnedEffects(actor)) {
		if (effect.disabled || effect.isSuppressed) continue;
		for (const change of effect.changes) {
			const preparedChange = resolveRaveChange(change, effect);
			if (preparedChange.key !== target || !isRaveChange(preparedChange)) continue;
			const spec = parseSpec(preparedChange);
			if (!spec?.runtimeOnly) continue;
			const rollData = buildContext(actor, { effect, item, activity });
			foundry.utils.setProperty(rollData, 'riderStatuses', riderStatuses);
			if (spec.when && !evaluateCondition(spec.when, rollData)) continue;
			applyConditionalAdvantageMode(counts, spec.op, Number(evaluateValue(spec.value, rollData)));
		}
	}
	if (counts.override !== null) {
		rollOptions.advantage = counts.override === 1;
		rollOptions.disadvantage = counts.override === -1;
	} else {
		rollOptions.advantage = !counts.suppressAdvantages && counts.advantages > 0;
		rollOptions.disadvantage = !counts.suppressDisadvantages && counts.disadvantages > 0;
	}
	config.advantage = rollOptions.advantage;
	config.disadvantage = rollOptions.disadvantage;
	config.advantageMode = rollOptions.advantage && !rollOptions.disadvantage ? 1 : !rollOptions.advantage && rollOptions.disadvantage ? -1 : 0;
	rollOptions.advantageMode = config.advantageMode;
	console.log('[Rave5e] save roll options updated', JSON.stringify({ options: { advantage: rollOptions.advantage, disadvantage: rollOptions.disadvantage, advantageMode: rollOptions.advantageMode }, counts }));
}

function getOriginatingUsageMessage(config, messageConfig) {
	const targets = [config?.event?.currentTarget, config?.event?.target].filter(Boolean);
	const messageId = messageConfig?.data?.flags?.dnd5e?.originatingMessage ?? targets.map((target) => target?.dataset?.messageId ?? target?.closest?.('[data-message-id]')?.dataset?.messageId).find(Boolean);
	console.log('[Rave5e] originating message lookup', JSON.stringify({ messageId, targetCount: targets.length }));
	return messageId ? game.messages.get(messageId) : null;
}

function applyConditionalAdvantageMode(counts, op, value) {
	if (![1, 0, -1].includes(value)) return;
	if (op === 'add') {
		if (value === 1) counts.advantages++;
		else if (value === -1) counts.disadvantages++;
	} else if (op === 'override') counts.override = value;
	else if (op === 'upgrade') {
		counts.suppressDisadvantages = true;
		if (value === 1) counts.advantages++;
	} else if (op === 'downgrade') {
		counts.suppressAdvantages = true;
		if (value === -1) counts.disadvantages++;
	}
}

function isActivityBonusKey(key) {
	return /^system\.bonuses\.[^.]+\.(attack|damage)$/.test(key);
}

function patchDnd5eAttackConfig() {
	const cls = CONFIG.DND5E?.activityTypes?.attack?.documentClass;
	if (!cls?.prototype.getAttackData || cls.prototype._rave5eAttackConfigPatched) return;
	const wrapper = function (wrapped, ...args) {
		const config = args[0] ?? {};
		const attackData = wrapped(...args);
		const bonus = getActivityBonus(this, config.attackMode, 'attack');
		if (bonus && Array.isArray(attackData?.parts)) attackData.parts.push(bonus);
		return attackData;
	};
	if (globalThis.libWrapper?.register) {
		globalThis.libWrapper.register(MODULE_ID, 'CONFIG.DND5E.activityTypes.attack.documentClass.prototype.getAttackData', wrapper, 'WRAPPER');
		cls.prototype._rave5eAttackConfigPatched = true;
		return;
	}
	const getAttackData = cls.prototype.getAttackData;
	cls.prototype.getAttackData = function (...args) {
		return wrapper.call(this, getAttackData.bind(this), ...args);
	};
	cls.prototype._rave5eAttackConfigPatched = true;
}

function patchDnd5eDamageConfig() {
	const cls = CONFIG.DND5E?.activityTypes?.attack?.documentClass;
	if (!cls?.prototype.getDamageConfig || cls.prototype._rave5eDamageConfigPatched) return;
	const wrapper = function (wrapped, ...args) {
		const config = args[0] ?? {};
		const rollConfig = wrapped(...args);
		const bonus = getActivityBonus(this, config.attackMode ?? rollConfig?.attackMode, 'damage');
		if (bonus && rollConfig.rolls?.[0]?.parts) rollConfig.rolls[0].parts.push(bonus);
		return rollConfig;
	};
	if (globalThis.libWrapper?.register) {
		globalThis.libWrapper.register(MODULE_ID, 'CONFIG.DND5E.activityTypes.attack.documentClass.prototype.getDamageConfig', wrapper, 'WRAPPER');
		cls.prototype._rave5eDamageConfigPatched = true;
		return;
	}
	const getDamageConfig = cls.prototype.getDamageConfig;
	cls.prototype.getDamageConfig = function (...args) {
		return wrapper.call(this, getDamageConfig.bind(this), ...args);
	};
	cls.prototype._rave5eDamageConfigPatched = true;
}

function getActivityBonus(activity, actionType, bonusType) {
	const actor = activity.actor;
	if (!actor) return '';
	const target = `system.bonuses.${activity.getActionType?.(actionType) ?? actionType ?? activity.type}.${bonusType}`;
	const parts = [];
	let rollData;
	for (const effect of getActorOwnedEffects(actor)) {
		if (effect.disabled || effect.isSuppressed) continue;
		for (const change of effect.changes) {
			const preparedChange = resolveRaveChange(change, effect);
			if (preparedChange.key !== target || !isRaveChange(preparedChange)) continue;
			const spec = parseSpec(preparedChange);
			if (!spec || spec.op !== 'add') continue;
			if (spec.runtimeOnly) continue;
			if (!specUsesRuntimeRollContext(spec)) continue;
			rollData ??= buildContext(actor, { effect, item: activity.item, activity });
			if (spec.when && !evaluateCondition(spec.when, rollData)) continue;
			const value = evaluateValue(spec.value, rollData);
			if (value && typeof value === 'object') continue;
			if (value !== undefined && value !== null && value !== '') parts.push(String(value));
		}
	}
	return parts.join(' + ');
}

function moveConditionalChangeTypeOptionsToBottom(root) {
	for (const select of root.querySelectorAll(`select[name$=".type"]`)) {
		const option = select.querySelector(`option[value="${CHANGE_TYPE}"]`);
		if (option) select.append(option);
	}
}

function isRaveChangeType(type) {
	return type === CHANGE_TYPE;
}

function isRaveChange(change) {
	return isRaveChangeType(change?.type) || isFlaggedRaveChange(change) || isRaveSpecChange(change);
}

function isFlaggedRaveChange(change) {
	if (change?.type !== 'custom' || change.mode !== CONST.ACTIVE_EFFECT_MODES.CUSTOM) return false;
	const index = getEffectChangeIndex(change.effect, change);
	if (index === null) return false;
	return !!getRaveChangeRows(change.effect)[index];
}

function isRaveSpecChange(change) {
	if (change?.type !== 'custom') return false;
	const value = typeof change.value === 'string' ? parseJSON(change.value) : change.value;
	return isObject(value) && OPS.has(value.op) && Object.hasOwn(value, 'value');
}

function parseJSON(value) {
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

function getRaveChangeRows(effect) {
	return effect?.getFlag?.(MODULE_ID, CHANGE_ROWS_FLAG) ?? foundry.utils.getProperty(effect ?? {}, `flags.${MODULE_ID}.${CHANGE_ROWS_FLAG}`) ?? {};
}

function getRaveStorageKey(index) {
	return `${STORAGE_KEY_PREFIX}.${index}`;
}

function isRaveStorageKey(key) {
	return typeof key === 'string' && key.startsWith(`${STORAGE_KEY_PREFIX}.`);
}

function resolveRaveChange(change, effect = change?.effect) {
	const index = getRaveStorageKeyIndex(change?.key) ?? getEffectChangeIndex(effect, change);
	const storedKey = index === null ? undefined : getRaveChangeRows(effect)[index];
	const key = index === null ? change?.key : (typeof storedKey === 'string' ? storedKey : storedKey?.key ?? change?.key);
	return { ...change, effect, key };
}

function getRaveStorageKeyIndex(key) {
	const match = typeof key === 'string' ? key.match(new RegExp(`^${STORAGE_KEY_PREFIX.replaceAll('.', '\\.')}\\.(\\d+)$`)) : null;
	return match ? match[1] : null;
}

async function migrateRaveStorageKeys() {
	const updates = [];
	for (const effect of getWorldEffects()) {
		const rows = getRaveChangeRows(effect);
		if (!rows || typeof rows !== 'object' || !Object.keys(rows).length) continue;
		const changes = foundry.utils.duplicate(getEffectChanges(effect));
		let changed = false;
		for (const index of Object.keys(rows)) {
			if (!changes[index] || changes[index].key === getRaveStorageKey(index)) continue;
			changes[index].key = getRaveStorageKey(index);
			changes[index].type = 'custom';
			changes[index].mode = CONST.ACTIVE_EFFECT_MODES.CUSTOM;
			changed = true;
		}
		if (changed) updates.push(effect.update({ 'system.changes': changes }));
	}
	await Promise.allSettled(updates);
}

function* getWorldEffects() {
	for (const actor of game.actors ?? []) {
		yield* actor.effects ?? [];
		for (const item of actor.items ?? []) yield* item.effects ?? [];
	}
	for (const item of game.items ?? []) yield* item.effects ?? [];
}

function getEffectChangeIndex(effect, change) {
	const changes = Array.from(effect?.changes ?? []);
	let index = changes.indexOf(change);
	if (index < 0) index = changes.findIndex((entry) => entry.key === change.key && entry.value === change.value && entry.type === change.type);
	return index >= 0 ? index : null;
}

function normalizeRaveActiveEffectChangeTypes(effect, data, { updateSource = false } = {}) {
	const rows = syncRaveChangeRowsFlag(effect, data);
	normalizeRaveChangeTypeData(data, rows);
	if (!updateSource) return true;
	if (rows) effect.updateSource({ [`flags.${MODULE_ID}.${CHANGE_ROWS_FLAG}`]: rows });
	const sourceChanges = getEffectChanges(effect);
	const normalized = normalizeRaveChangeTypeCollection(sourceChanges);
	if (normalized.changed) effect.updateSource({ 'system.changes': normalized.changes });
	return true;
}

function normalizeRaveChangeTypeData(data, rows = {}) {
	if (!data || typeof data !== 'object') return false;
	let changed = false;
	const direct = normalizeRaveChangeTypeCollection(data.changes);
	if (direct.changed) {
		data.changes = direct.changes;
		changed = true;
	}
	const system = normalizeRaveChangeTypeCollection(data.system?.changes);
	if (system.changed) {
		data.system ??= {};
		data.system.changes = system.changes;
		changed = true;
	}
	for (const [key, value] of Object.entries(data)) {
		if (!/^(?:system\.)?changes\.[^.]+\.type$/.test(key)) continue;
		if (!isRaveChangeType(`${value ?? ''}`.trim().toLowerCase())) continue;
		data[key] = 'custom';
		const keyPath = key.replace(/\.type$/, '.key');
		if (keyPath in data) data[keyPath] = getRaveStorageKey(key.match(/changes\.(\d+)\.type$/)?.[1] ?? 0);
		changed = true;
	}
	for (const [key, value] of Object.entries(data)) {
		const match = key.match(/^(?:system\.)?changes\.(\d+)\.key$/);
		if (!match || !Object.hasOwn(rows ?? {}, match[1]) || isRaveStorageKey(value)) continue;
		data[key] = getRaveStorageKey(match[1]);
		changed = true;
	}
	return changed;
}

function normalizeRaveChangeTypeCollection(changes) {
	if (!changes || typeof changes !== 'object') return { changed: false, changes };
	const duplicate = foundry.utils.duplicate(changes);
	let changed = false;
	const entries = Array.isArray(duplicate) ? duplicate.entries() : Object.entries(duplicate);
	for (const [index, change] of entries) {
		if (!change || typeof change !== 'object') continue;
		if (!isRaveChangeType(`${change.type ?? ''}`.trim().toLowerCase())) continue;
		change.type = 'custom';
		change.mode = CONST.ACTIVE_EFFECT_MODES.CUSTOM;
		change.key = getRaveStorageKey(index);
		changed = true;
	}
	return { changed, changes: duplicate };
}

function syncRaveChangeRowsFlag(effect, data) {
	if (!data || typeof data !== 'object') return;
	const existingChanges = getEffectChanges(effect);
	const collected = collectRaveChangeRows(data, existingChanges, getRaveChangeRows(effect));
	if (!collected.hasChangeData) return;
	foundry.utils.setProperty(data, `flags.${MODULE_ID}.${CHANGE_ROWS_FLAG}`, collected.rows);
	return collected.rows;
}

function collectRaveChangeRows(data, existingChanges = [], existingRows = {}) {
	const rows = { ...existingRows };
	let hasChangeData = false;
	const collect = (changes) => {
		if (!changes || typeof changes !== 'object') return;
		hasChangeData = true;
		const entries = Array.isArray(changes) ? changes.entries() : Object.entries(changes);
		for (const [index, change] of entries) {
			if (!change || typeof change !== 'object') continue;
			const type = `${change.type ?? ''}`.trim().toLowerCase();
			if (!isRaveChangeType(type)) {
				if (type && type !== 'custom') delete rows[index];
				continue;
			}
			const key = `${change.key ?? ''}`.trim();
			if (key && !isRaveStorageKey(key)) rows[index] = key;
		}
	};
	collect(data.changes); // re-evaluate the need do this after v6
	collect(data.system?.changes);
	for (const [path, value] of Object.entries(data)) {
		const match = path.match(/^(?:system\.)?changes\.(\d+)\.type$/);
		if (!match) continue;
		hasChangeData = true;
		if (!isRaveChangeType(`${value ?? ''}`.trim().toLowerCase())) continue;
		const index = match[1];
		const key = `${data[`system.changes.${index}.key`] ?? data[`changes.${index}.key`] ?? existingChanges[index]?.key ?? ''}`.trim();
		if (key && !isRaveStorageKey(key)) rows[index] = key;
	}
	for (const [path, value] of Object.entries(data)) {
		const match = path.match(/^(?:system\.)?changes\.(\d+)\.key$/);
		if (!match || !Object.hasOwn(rows, match[1]) || isRaveStorageKey(value)) continue;
		rows[match[1]] = `${value ?? ''}`.trim();
	}
	return { hasChangeData, rows };
}

function getEffectChanges(effect) {
	return (
		foundry.utils.getProperty(effect, 'system.changes') ??
		foundry.utils.getProperty(effect, '_source.system.changes') ??
		foundry.utils.getProperty(effect, 'changes') ?? // shouldn't be needed anymore, but just in case
		foundry.utils.getProperty(effect, '_source.changes') ?? // shouldn't be needed anymore, but just in case
		[]
	);
}

function restoreRaveAuthoredRows(app, root) {
	const rows = getRaveChangeRows(app.document);
	if (!rows || typeof rows !== 'object') return;
	for (const select of root.querySelectorAll(`select[name$=".type"]`)) {
		if (`${select.value ?? ''}`.trim().toLowerCase() !== 'custom') continue;
		const row = findChangeRow(select);
		const index = getChangeIndex(row, select);
		if (index == null || !Object.hasOwn(rows, index)) continue;
		const keyInput = findKeyInput(row, select);
		const key = `${keyInput?.value ?? ''}`.trim();
		const savedKey = `${rows[index] ?? ''}`.trim();
		if (!savedKey || (key !== savedKey && !isRaveStorageKey(key))) continue;
		select.value = CHANGE_TYPE;
		if (keyInput) keyInput.value = savedKey;
	}
}

function initializeConditionalKeyAutocomplete(app, root) {
	const Autocomplete = foundry.applications?.ux?.Autocomplete?.implementation;
	if (!Autocomplete) return;

	for (const keyInput of root.querySelectorAll(`input[name$=".key"], textarea[name$=".key"]`)) {
		if (keyInput.dataset.rave5eKeyAutocompleteReady) continue;
		keyInput.dataset.rave5eKeyAutocompleteReady = 'true';
		const autocomplete = new Autocomplete({
			onSelect: (identifier) => {
				keyInput.blur();
				keyInput.value = identifier;
				keyInput.dispatchEvent(new Event('input', { bubbles: true }));
				keyInput.dispatchEvent(new Event('change', { bubbles: true }));
				refreshConditionalButtons(app, root);
			},
		});
		const activateAutocomplete = () => {
			const row = findChangeRow(keyInput);
			if (!isConditionalRow(row)) return autocomplete.dismiss();
			const entries = buildActorPathAutocompleteEntries(getEffectActor(app.document));
			const prefix = getAutocompletePrefix(keyInput);
			const normalizedPrefix = prefix.toLowerCase();
			const filteredEntries = (prefix ? entries.filter((entry) => entry.identifier.toLowerCase().includes(normalizedPrefix)) : entries).slice(0, 40);
			if (!filteredEntries.length) return autocomplete.dismiss();
			autocomplete.activate(keyInput, filteredEntries, { prefix });
			configureAutocompleteMenu(autocomplete, filteredEntries);
		};
		keyInput.addEventListener('focus', activateAutocomplete);
		keyInput.addEventListener('input', activateAutocomplete);
		keyInput.addEventListener('blur', () => window.setTimeout(() => autocomplete.dismiss(), 100));
		app.addEventListener?.('close', () => autocomplete.dismiss(), { once: true });
	}
}

function initializeConditionalButtonSync(app, root) {
	for (const input of root.querySelectorAll(`input[name$=".key"], textarea[name$=".key"], select[name$=".type"]`)) {
		if (input.dataset.rave5eEditorButtonSyncReady) continue;
		input.dataset.rave5eEditorButtonSyncReady = 'true';
		input.addEventListener('input', () => refreshConditionalButtons(app, root));
		input.addEventListener('change', () => refreshConditionalButtons(app, root));
	}
}

function refreshConditionalButtons(app, root) {
	for (const valueInput of root.querySelectorAll(`input[name$=".value"], textarea[name$=".value"]`)) {
		const row = findChangeRow(valueInput);
		if (!row) continue;
		const existingButton = row.querySelector('.rave5e-effect-value-editor-button');
		if (!isConditionalRow(row)) {
			existingButton?.remove();
			cleanupValueEditorWrapper(valueInput);
			continue;
		}
		if (existingButton) continue;
		addEditorButton({ app, row, valueInput });
	}
}

function addEditorButton({ app, row, valueInput }) {
	const wrapper = ensureValueEditorWrapper(valueInput);
	const keyInput = row.querySelector(`input[name$=".key"], textarea[name$=".key"]`);
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'rave5e-effect-value-editor-button icon fa-solid fa-wand-magic-sparkles';
	button.style.flex = '0 0 28px';
	button.style.height = '28px';
	button.style.margin = '0';
	button.style.padding = '0';
	button.style.width = '28px';
	button.dataset.tooltip = localize('RAVE5E.Editor.Title');
	button.setAttribute('aria-label', localize('RAVE5E.Editor.Title'));
	button.addEventListener('click', (event) => {
		event.preventDefault();
		openConditionalEditor({ app, valueInput, keyInput, row });
	});
	wrapper.append(button);
}

function openConditionalEditor({ app, valueInput, keyInput, row }) {
	const editorKey = getConditionalEditorKey({ app, valueInput, row });
	const existing = conditionalEditorApps.get(editorKey);
	if (existing) {
		existing.updateContext({ app, valueInput, keyInput, row });
		existing.render({ force: true });
		existing.bringToTop?.();
		return;
	}

	const editor = new ConditionalEditorApp({ app, valueInput, keyInput, row, editorKey });
	conditionalEditorApps.set(editorKey, editor);
	editor.render({ force: true });
}

function getConditionalEditorKey({ app, valueInput, row }) {
	const documentKey = app.document?.uuid ?? app.document?.id ?? app.id ?? 'active-effect';
	const changeIndex = getChangeIndex(row, valueInput);
	return `${documentKey}.${changeIndex}`;
}

function getConditionalEditorId(editorKey) {
	return `rave5e-conditional-editor-${editorKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

class ConditionalEditorApp extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		classes: ['rave5e-conditional-editor'],
		tag: 'form',
		window: { title: 'RAVE5E.Editor.Title', resizable: true },
		position: { width: 680, height: 'auto' },
		actions: {
			addCondition: ConditionalEditorApp.#addCondition,
			deleteCondition: ConditionalEditorApp.#deleteCondition,
			expandField: ConditionalEditorApp.#expandField,
			apply: ConditionalEditorApp.#apply,
			applyClose: ConditionalEditorApp.#applyClose,
			reset: ConditionalEditorApp.#reset,
			cancel: ConditionalEditorApp.#cancel,
		},
	};

	static PARTS = {
		body: {
			template: 'modules/rave5e/templates/apps/rave5e-conditional-editor.hbs',
		},
	};

	constructor({ app, valueInput, keyInput, row, editorKey }, options = {}) {
		super({ ...options, id: getConditionalEditorId(editorKey) });
		this.editorKey = editorKey;
		this.updateContext({ app, valueInput, keyInput, row });
		this.savedValue = valueInput.value;
	}

	updateContext({ app, valueInput, keyInput, row }) {
		this.activeEffectApp = app;
		this.valueInput = valueInput;
		this.keyInput = keyInput;
		this.changeIndex = getChangeIndex(row, valueInput);
	}

	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const draft = parseEditorDraft(this._draftValue ?? this.valueInput.value);
		const header = this.getHeaderData();
		return foundry.utils.mergeObject(context, {
			...draft,
			...header,
			changeLabel: Number.isInteger(header.changeIndex) ? game.i18n.format('RAVE5E.Editor.ChangeIndex', { index: header.changeIndex }) : null,
			attributeKeyHint: game.i18n.format('RAVE5E.Editor.AttributeKeyHint', { url: DND5E_ACTIVE_EFFECT_WIKI }),
			operationOptions: OPERATION_OPTIONS.map((option) => ({ ...option, selected: option.value === draft.op })),
			groupSingle: draft.group === 'single',
			groupAll: draft.group === 'all',
			groupAny: draft.group === 'any',
			conditionRows: new Handlebars.SafeString(draft.conditions.map((condition, index) => renderConditionRow(condition, index)).join('')),
			operationHint: new Handlebars.SafeString(info('RAVE5E.Editor.Operation.Hint')),
			valueHint: new Handlebars.SafeString(info('RAVE5E.Editor.Value.Hint')),
			valueExpandButton: new Handlebars.SafeString(expandButton('RAVE5E.Editor.Value.Label')),
			runtimeHint: new Handlebars.SafeString(info('RAVE5E.Editor.Runtime.Hint')),
			matchHint: new Handlebars.SafeString(info('RAVE5E.Editor.Match.Hint')),
			generatedJsonHint: new Handlebars.SafeString(info('RAVE5E.Editor.GeneratedJSON.Hint')),
			generatedJsonExpanded,
		}, { inplace: false });
	}

	_onRender(...args) {
		super._onRender(...args);
		initializeEditorAutocomplete(this.activeEffectApp, this.element);
	}

	async close(options = {}) {
		conditionalEditorApps.delete(this.editorKey);
		return super.close(options);
	}

	static #addCondition(event, target) {
		event.preventDefault();
		const form = target.closest('form');
		const list = form.querySelector('.rave5e-condition-list');
		list?.insertAdjacentHTML('beforeend', renderConditionRow());
		list?.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
		initializeEditorAutocomplete(this.activeEffectApp, this.element);
		updateConditionRemoveButtons(form);
		syncEditorAdvancedJson(this.element);
	}

	static #deleteCondition(event, target) {
		event.preventDefault();
		const form = target.closest('form');
		target.closest('.rave5e-condition-row')?.remove();
		if (!form.querySelector('.rave5e-condition-row')) form.querySelector('.rave5e-condition-list')?.insertAdjacentHTML('beforeend', renderConditionRow());
		initializeEditorAutocomplete(this.activeEffectApp, this.element);
		updateConditionRemoveButtons(form);
		syncEditorAdvancedJson(this.element);
	}

	static #expandField(event, target) {
		event.preventDefault();
		const input = target.closest('.rave5e-inline-field')?.querySelector('input, textarea');
		if (!input) return;
		openStringEditor({
			label: target.dataset.expandLabel ?? input.name,
			value: input.value,
			submit: (value) => {
				input.value = value;
				input.dispatchEvent(new Event('input', { bubbles: true }));
				input.dispatchEvent(new Event('change', { bubbles: true }));
				syncEditorAdvancedJson(this.element);
			},
		});
	}

	static async #apply(event, target) {
		event.preventDefault();
		const form = target.closest('form');
		const wasNested = isNestedConditionalEditor(form);
		const result = this.#save(form);
		if (!result) return;
		if (wasNested !== hasNestedConditionGroup(result.when)) await this.render({ force: true });
	}

	static #applyClose(event, target) {
		event.preventDefault();
		const result = this.#save(target.closest('form'));
		if (result) this.close();
	}

	static async #reset(event) {
		event.preventDefault();
		this._draftValue = this.savedValue;
		try {
			await this.render({ force: true });
		} finally {
			this._draftValue = null;
		}
	}

	#save(form) {
		const result = collectEditorDraft(form);
		if (!isObject(result)) return;
		this.savedValue = JSON.stringify(result);
		this.valueInput.value = this.savedValue;
		this.valueInput.dispatchEvent(new Event('input', { bubbles: true }));
		this.valueInput.dispatchEvent(new Event('change', { bubbles: true }));
		return result;
	}

	getHeaderData() {
		return {
			effectName: this.activeEffectApp.document?.name ?? 'Active Effect',
			changeIndex: this.changeIndex,
			key: this.keyInput?.value ?? '',
		};
	}

	static #cancel(event) {
		event.preventDefault();
		this.close();
	}
}

function parseEditorDraft(value) {
	let spec = { op: 'add', value: 0, when: { path: '' } };
	try {
		const parsed = value ? JSON.parse(value) : null;
		if (isObject(parsed)) spec = { ...spec, ...parsed };
	} catch (_err) {}

	return {
		op: OPS.has(spec.op) ? spec.op : 'add',
		value: stringifyEditorValue(spec.value ?? 0),
		runtimeOnly: !!spec.runtimeOnly,
		group: getConditionGroup(spec.when),
		conditions: getConditionRows(spec.when),
		nestedConditional: hasNestedConditionGroup(spec.when),
		advanced: JSON.stringify(spec),
	};
}

function hasNestedConditionGroup(condition, nested = false) {
	if (!isObject(condition)) return false;
	const children = Array.isArray(condition.all) ? condition.all : Array.isArray(condition.any) ? condition.any : null;
	if (children) return nested || children.some((child) => hasNestedConditionGroup(child, true));
	return isObject(condition.not) && hasNestedConditionGroup(condition.not, true);
}

// TODO: Revisit rendering condition rows as a Handlebars template part.
function renderConditionRow(condition = DEFAULT_CONDITION_ROW, index = 0) {
	return `
    <fieldset class="rave5e-condition-row">
      <legend>
        <span>${localize('RAVE5E.Editor.Condition.Label')}</span>
        <button type="button" class="unbutton control-button rave5e-condition-add" data-action="addCondition" data-tooltip="${escapeHTML(localize('RAVE5E.Editor.Condition.Add'))}" aria-label="${escapeHTML(localize('RAVE5E.Editor.Condition.Add'))}">
          <i class="fas fa-plus" inert></i>
        </button>
      </legend>
      <section class="rave5e-condition-grid rave5e-condition-grid-condition">
        <div class="form-group">
          <label>${localize('RAVE5E.Editor.Path.Label')} ${info('RAVE5E.Editor.Path.Hint')}</label>
          <div class="form-fields rave5e-inline-field">
            <input type="text" class="rave5e-condition-path" name="condition-path" value="${escapeHTML(condition.path)}">
            ${expandButton('RAVE5E.Editor.Path.Label')}
          </div>
        </div>
        <div class="form-group">
          <label>${localize('RAVE5E.Editor.Operator.Label')} ${info('RAVE5E.Editor.Operator.Hint')}</label>
          <div class="form-fields">
            <select name="condition-operator">${CONDITION_OPERATOR_OPTIONS.map((op) => `<option value="${op.value}" title="${escapeHTML(localize(op.hint))}"${op.value === condition.operator ? ' selected' : ''}>${localize(op.label)}</option>`).join('')}</select>
          </div>
        </div>
		<div class="form-group rave5e-condition-compare-group"${['truthy', 'exists'].includes(condition.operator) ? ' hidden' : ''}>
          <label>${localize('RAVE5E.Editor.Compare.Label')} ${info('RAVE5E.Editor.Compare.Hint')}</label>
          <div class="form-fields rave5e-inline-field">
            <input type="text" name="condition-compare" value="${escapeHTML(condition.compare)}" placeholder="${escapeHTML(getConditionComparePlaceholder(condition.operator))}">
            ${expandButton('RAVE5E.Editor.Compare.Label')}
          </div>
        </div>
        <div class="rave5e-condition-toggle-row">
          <label class="rave5e-conditional-editor-toggle" data-tooltip="${escapeHTML(localize('RAVE5E.Editor.Not.Hint'))}">
            <input type="checkbox" name="condition-negate"${condition.negate ? ' checked' : ''}> ${localize('RAVE5E.Editor.Not.Label')} ${info('RAVE5E.Editor.Not.Hint')}
          </label>
          <button type="button" class="unbutton control-button rave5e-condition-remove" data-action="deleteCondition" data-tooltip="${escapeHTML(localize('RAVE5E.Editor.Condition.Remove'))}" aria-label="${escapeHTML(localize('RAVE5E.Editor.Condition.Remove'))}"${index === 0 ? ' disabled' : ''}>
            <i class="fa-solid fa-trash" inert></i>
          </button>
        </div>
      </section>
    </fieldset>
  `;
}

function expandButton(labelKey) {
	const label = localize(labelKey);
	return `<button type="button" class="rave5e-field-expand fa-solid fa-lambda fa-fw icon" data-action="expandField" data-expand-label="${escapeHTML(label)}" aria-label="${escapeHTML(game.i18n.format('RAVE5E.Editor.Actions.Expand', { label }))}"></button>`;
}

function openStringEditor({ label, value, submit }) {
	new foundry.applications.api.DialogV2({
		window: { title: game.i18n.format('RAVE5E.Editor.Actions.Edit', { label }) },
		classes: ['rave5e-string-editor'],
		content: `<textarea name="value" rows="8">${escapeHTML(value)}</textarea>`,
		buttons: [
			{
				action: 'apply',
				label: localize('RAVE5E.Editor.Actions.Save'),
				icon: 'fa-solid fa-check',
				default: true,
				callback: (_event, _button, dialog) => dialog.element.querySelector(`textarea[name="value"]`)?.value ?? value,
			},
		],
		submit: (result) => {
			if (typeof result === 'string') submit(result);
		},
	}).render({ force: true });
}

function registerReadmeTooltipLink() {
	if (document.body?.dataset.rave5eReadmeTooltipReady) return;
	if (document.body) document.body.dataset.rave5eReadmeTooltipReady = 'true';
	document.addEventListener('click', (event) => {
		if (!event.target?.closest?.('[data-rave5e-readme]')) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		openRaveReadme();
	}, true);
}

async function openRaveReadme() {
	const pack = game.packs.get(README_PACK);
	if (!pack) return ui.notifications.warn(game.i18n.format('RAVE5E.Editor.Readme.MissingPack', { pack: README_PACK }));
	const index = await pack.getIndex();
	const entries = Array.from(index.values?.() ?? index);
	const entry = entries[0];
	const document = entry?.uuid ? await foundry.utils.fromUuid(entry.uuid) : await pack.getDocument(entry?._id ?? entry?.id);
	if (!document) return ui.notifications.warn(game.i18n.localize('RAVE5E.Editor.Readme.MissingDocument'));
	return document.sheet?.render(true);
}

function collectEditorDraft(form) {
	const advancedInput = form.elements.advanced;
	const advanced = advancedInput.value.trim();
	if (advanced && isNestedConditionalEditor(form)) {
		try {
			const parsed = JSON.parse(advanced);
			if (isObject(parsed)) return parsed;
		} catch (_err) {}
	}
	if (advanced && advanced !== advancedInput.dataset.original) {
		try {
			const parsed = JSON.parse(advanced);
			if (isObject(parsed)) return parsed;
		} catch (_err) {}
		validateAdvancedJson(form);
		return null;
	}
	return collectEditorFields(form);
}

function collectEditorFields(form) {
	const conditions = Array.from(form.querySelectorAll('.rave5e-condition-row')).map((row) => {
		const condition = { path: row.querySelector(`[name="condition-path"]`)?.value.trim() ?? '' };
		const operator = row.querySelector(`[name="condition-operator"]`)?.value ?? 'truthy';
		if (operator === 'exists') condition.exists = true;
		else if (operator !== 'truthy') condition[operator] = parseEditorValue(row.querySelector(`[name="condition-compare"]`)?.value);
		return row.querySelector(`[name="condition-negate"]`)?.checked ? { not: condition } : condition;
	});
	const group = form.elements.group?.value ?? 'single';
	const when =
		group === 'all' ? { all: conditions }
		: group === 'any' ? { any: conditions }
		: conditions[0];
	const spec = {
		op: form.elements.op.value,
		value: parseEditorValue(form.elements.value.value),
		when,
	};
	if (form.elements.runtimeOnly?.checked) spec.runtimeOnly = true;
	return spec;
}

function initializeEditorAutocomplete(app, root) {
	root = normalizeElement(root);
	initializeEditorJsonSync(root);
	initializeConditionRowControls(app, root);
}

function initializeConditionPathAutocomplete(app, root, input) {
	const Autocomplete = foundry.applications?.ux?.Autocomplete?.implementation;
	if (!input || !Autocomplete) return;
	if (input.dataset.rave5eConditionAutocompleteReady) return;
	input.dataset.rave5eConditionAutocompleteReady = 'true';
	const autocomplete = new Autocomplete({
		onSelect: (identifier) => {
			input.blur();
			input.value = identifier;
			input.dispatchEvent(new Event('input', { bubbles: true }));
			input.dispatchEvent(new Event('change', { bubbles: true }));
			syncEditorAdvancedJson(root);
		},
	});
	const activateAutocomplete = () => {
		const entries = buildActorPathAutocompleteEntries(getEffectActor(app.document));
		const prefix = getAutocompletePrefix(input);
		const normalizedPrefix = prefix.toLowerCase();
		const filteredEntries = (prefix ? entries.filter((entry) => entry.identifier.toLowerCase().includes(normalizedPrefix)) : entries).slice(0, 40);
		if (!filteredEntries.length) return autocomplete.dismiss();
		autocomplete.activate(input, filteredEntries, { prefix });
		configureAutocompleteMenu(autocomplete, filteredEntries);
	};
	input.addEventListener('focus', activateAutocomplete);
	input.addEventListener('input', activateAutocomplete);
	input.addEventListener('blur', () => window.setTimeout(() => autocomplete.dismiss(), 100));
}

function initializeConditionRowControls(app, root) {
	const form = getEditorForm(root);
	if (!form) return;
	form.querySelectorAll('.rave5e-condition-path').forEach((input) => initializeConditionPathAutocomplete(app, root, input));
	if (form.dataset.rave5eConditionRowsReady) return;
	form.dataset.rave5eConditionRowsReady = 'true';
	form.querySelector(`[name="group"]`)?.addEventListener('change', () => {
		normalizeConditionRowsForGroup(form);
		updateConditionRemoveButtons(form);
		syncEditorAdvancedJson(root);
	});
	normalizeConditionRowsForGroup(form);
	updateConditionRemoveButtons(form);
}

function updateConditionRemoveButtons(form) {
	const rows = Array.from(form.querySelectorAll('.rave5e-condition-row'));
	const single = form.elements.group?.value === 'single';
	form.querySelectorAll('.rave5e-condition-add').forEach((button) => (button.hidden = single));
	rows.forEach((row) => {
		const remove = row.querySelector('.rave5e-condition-remove');
		if (remove) {
			remove.hidden = single;
			remove.disabled = single || rows.length <= 1;
		}
	});
}

function normalizeConditionRowsForGroup(form) {
	if (form.elements.group?.value !== 'single') return;
	const rows = Array.from(form.querySelectorAll('.rave5e-condition-row'));
	for (const row of rows.slice(1)) row.remove();
}

function initializeEditorJsonSync(root) {
	const form = getEditorForm(root);
	if (!form || form.dataset.rave5eJsonSyncReady) return;
	form.dataset.rave5eJsonSyncReady = 'true';
	form.querySelector('.rave5e-generated-json')?.addEventListener('toggle', (event) => {
		generatedJsonExpanded = event.currentTarget.open;
	});
	const sync = (event) => {
		if (event.target?.name === 'advanced') return validateAdvancedJson(root);
		updateConditionCompareVisibility(form);
		syncEditorAdvancedJson(root);
	};
	form.addEventListener('input', sync);
	form.addEventListener('change', sync);
	form.addEventListener('focusout', sync);
	updateConditionCompareVisibility(form);
	if (!isNestedConditionalEditor(form)) syncEditorAdvancedJson(root);
	validateAdvancedJson(root);
}

function updateConditionCompareVisibility(form) {
	form.querySelectorAll('.rave5e-condition-row').forEach((row) => {
		const operator = row.querySelector(`[name="condition-operator"]`)?.value;
		const group = row.querySelector('.rave5e-condition-compare-group');
		const input = row.querySelector(`[name="condition-compare"]`);
		if (!input) return;
		const disabled = ['truthy', 'exists'].includes(operator);
		if (group) group.hidden = disabled;
		input.disabled = disabled;
		input.placeholder = getConditionComparePlaceholder(operator);
		const expand = row.querySelector('.rave5e-condition-compare-group .rave5e-field-expand');
		if (expand) expand.disabled = disabled;
	});
}

function getConditionComparePlaceholder(operator) {
	switch (operator) {
		case 'gt':
		case 'gte':
		case 'lt':
		case 'lte':
			return 'Number';
		case 'in':
			return '["variable1", "variable2"]';
		case 'includes':
			return 'variable';
		case 'eq':
		case 'ne':
			return 'value';
		case 'truthy':
			return 'Value must be truthy';
		case 'exists':
			return 'Path must be present';
		default:
			return '';
	}
}

function syncEditorAdvancedJson(root) {
	const form = getEditorForm(root);
	const advanced = form?.elements?.advanced;
	if (!form || !advanced) return;
	if (isNestedConditionalEditor(form)) {
		try {
			const value = JSON.parse(advanced.value);
			value.op = form.elements.op.value;
			value.value = parseEditorValue(form.elements.value.value);
			if (form.elements.runtimeOnly?.checked) value.runtimeOnly = true;
			else delete value.runtimeOnly;
			advanced.value = JSON.stringify(value);
			advanced.dataset.original = advanced.value;
		} catch (_err) {}
		return validateAdvancedJson(root);
	}
	const value = JSON.stringify(collectEditorFields(form));
	advanced.value = value;
	advanced.dataset.original = value;
	validateAdvancedJson(root);
}

function isNestedConditionalEditor(form) {
	return form.elements.nestedConditional?.value === 'true';
}

function validateAdvancedJson(root) {
	const form = getEditorForm(root);
	const advanced = form?.elements?.advanced;
	const warning = form?.querySelector('.rave5e-editor-warning');
	const tooltip = form?.querySelector('.rave5e-editor-warning-tooltip');
	if (!advanced || !warning) return true;
	const value = advanced.value.trim();
	let message = '';
	if (value && value !== advanced.dataset.original) {
		try {
			if (!isObject(JSON.parse(value))) message = localize('RAVE5E.Editor.GeneratedJSON.ObjectWarning');
		} catch (err) {
			message = game.i18n.format('RAVE5E.Editor.GeneratedJSON.InvalidWarning', { message: err.message });
		}
	}
	warning.hidden = !message;
	if (tooltip) tooltip.innerHTML = message ? `<ul><li class="warning">${escapeHTML(message)}</li></ul>` : '';
	return !message;
}

function getEditorForm(root) {
	return root?.matches?.('form') ? root : root?.querySelector?.('form');
}

function getConditionOperator(condition) {
	for (const operator of CONDITION_OPERATORS) {
		if (operator !== 'truthy' && operator in condition) return operator;
	}
	return 'truthy';
}

function getConditionGroup(condition) {
	if (Array.isArray(condition?.any)) return 'any';
	if (Array.isArray(condition?.all)) return 'all';
	return 'single';
}

function getConditionRows(condition) {
	const source =
		Array.isArray(condition?.any) ? condition.any
		: Array.isArray(condition?.all) ? condition.all
		: [condition];
	const rows = source.map(getConditionRow).filter((row) => row.path || row.operator !== 'truthy' || row.compare);
	return rows.length ? rows : [{ ...DEFAULT_CONDITION_ROW }];
}

function getConditionRow(condition) {
	let negate = false;
	let row = isObject(condition) ? condition : {};
	if (isObject(row.not)) {
		negate = true;
		row = row.not;
	}
	const operator = getConditionOperator(row);
	if (operator === 'exists' && row.exists === false) negate = !negate;
	return {
		path: typeof row.path === 'string' ? row.path : '',
		operator,
		compare: operator === 'exists' ? '' : stringifyEditorValue(row[operator]),
		negate,
	};
}

function stringifyEditorValue(value) {
	if (value === undefined) return '';
	if (typeof value === 'string') return value;
	return JSON.stringify(value);
}

function parseEditorValue(value) {
	const trimmed = `${value ?? ''}`.trim();
	if (!trimmed) return '';
	try {
		return JSON.parse(trimmed);
	} catch (_err) {
		return trimmed;
	}
}

function escapeHTML(value) {
	return foundry.utils.escapeHTML(`${value ?? ''}`);
}

function info(text) {
	return `<i class="fa-solid fa-circle-info rave5e-editor-info" data-tooltip="${escapeHTML(localize(text))}" data-tooltip-direction="UP"></i>`;
}

function localize(key) {
	return game.i18n.localize(key);
}

function cleanupValueEditorWrapper(valueInput) {
	const wrapper = valueInput.parentElement;
	if (!wrapper?.classList.contains('rave5e-effect-value-editor-control')) return;
	if (wrapper.querySelector('.rave5e-effect-value-editor-button')) return;
	wrapper.replaceWith(valueInput);
}

function ensureValueEditorWrapper(valueInput) {
	if (valueInput.parentElement?.classList.contains('rave5e-effect-value-editor-control')) return valueInput.parentElement;
	const wrapper = document.createElement('div');
	wrapper.className = 'rave5e-effect-value-editor-control';
	wrapper.style.alignItems = 'center';
	wrapper.style.display = 'flex';
	wrapper.style.gap = '4px';
	wrapper.style.minWidth = '0';
	wrapper.style.width = '100%';
	valueInput.insertAdjacentElement('beforebegin', wrapper);
	valueInput.style.flex = '1 1 auto';
	valueInput.style.minWidth = '0';
	wrapper.append(valueInput);
	return wrapper;
}

function isConditionalRow(row) {
	return isRaveChangeType(row?.querySelector(`select[name$=".type"]`)?.value);
}

function findKeyInput(row, input) {
	const keyName = input.name?.replace(/\.(?:type|value)$/, '.key');
	const escapedKeyName = keyName ? (globalThis.CSS?.escape?.(keyName) ?? keyName.replaceAll('"', '\\"')) : null;
	return row?.querySelector(`input[name$=".key"], textarea[name$=".key"]`) ?? (escapedKeyName ? input.ownerDocument.querySelector(`[name="${escapedKeyName}"]`) : null);
}

function findChangeRow(input) {
	return input.closest('li, .form-group, tr, fieldset') ?? input.parentElement;
}

function getChangeIndex(row, input) {
	const rowIndex = Number(row?.dataset?.index);
	if (Number.isInteger(rowIndex)) return rowIndex;
	const name = input?.name ?? '';
	const match = name.match(/(?:^|\.)changes\.(\d+)\.(?:key|type|value)$/);
	if (match) return Number(match[1]);
	const rows = Array.from(row?.parentElement?.children ?? []).filter((element) => element.querySelector?.(`input[name$=".value"], textarea[name$=".value"]`));
	const index = rows.indexOf(row);
	return index >= 0 ? index : null;
}

function buildActorPathAutocompleteEntries(actor) {
	const entries = new Map();
	addPathEntries(entries, actor?.getRollData?.() ?? {}, localize('RAVE5E.Editor.Autocomplete.ActorRollData'));
	for (const path of [
		'attributes.encumbrance.pct',
		'attributes.hd.pct',
		'attributes.hp.pct',
		'effects.names',
		'items.names',
		'equippedItems.names',
		'equippedItems.identifiers',
		'movementLastSegment',
		'movementTurn',
	])
		addRaveAutocompleteEntry(entries, path);
	addEffectAutocompleteEntries(entries, actor);
	addItemAutocompleteEntries(entries, actor);
	addItemTypeAutocompleteEntries(entries, actor);
	for (const status of CONFIG.statusEffects ?? []) addAutocompleteEntry(entries, `riderStatuses.${status.id}`, localize('RAVE5E.Editor.Autocomplete.CommonActorPath'));
	if (actor?.flags) addRavePathEntries(entries, actor.flags, 'flags');
	for (const path of [
		'activity.name',
		'activity.id',
		'activity.type',
		'activity.uuid',
		'attributes.ac.equippedArmor',
		'attributes.ac.equippedArmor.type.value',
		'attributes.ac.equippedArmor.system.type.value',
		'attributes.ac.equippedShield',
		'attributes.ac.equippedShield.type.value',
		'attributes.ac.equippedShield.system.type.value',
		'gridDistance',
		'item.name',
		'item.identifier',
		'item.id',
		'item.type',
		'item.uuid',
		'item.systemType',
		'item.identified',
		'item.uses',
		'item.equipped',
		'item.properties',
		'item.mastery',
		'item.magicalBonus',
		'item.rarity',
		'item.attuned',
	])
		addAutocompleteEntry(entries, path, localize('RAVE5E.Editor.Autocomplete.CommonActorPath'));
	return Array.from(entries.values()).sort((a, b) => a.identifier.localeCompare(b.identifier));
}

function getEffectActor(effect) {
	return effect?.actor ?? (effect?.parent?.documentName === 'Actor' ? effect.parent : null);
}

function getEffectItem(effect) {
	return effect?.parent?.documentName === 'Item' ? effect.parent : null;
}

function getEffectContextItem(effect) {
	const origin = getEffectOriginDocument(effect);
	if (origin?.documentName === 'Item') return origin;
	if (origin?.parent?.documentName === 'Item') return origin.parent;
	return getEffectItem(effect);
}

function getEffectContextActivity(effect) {
	const origin = getEffectOriginDocument(effect);
	if (origin?.documentName === 'Activity') return origin;
	if (origin?.parent?.documentName === 'Activity') return origin.parent;
	return null;
}

function getEffectOriginDocument(effect) {
	for (const uuid of [effect?.origin, effect?.flags?.dnd5e?.dependentOn]) {
		if (!uuid) continue;
		const itemUuid = uuid.match(/^(.*\.Item\.[^.]+)/)?.[1];
		if (itemUuid) {
			const item = fromUuidSync(itemUuid, { relative: effect, strict: false });
			if (item) return item;
		}
		const document = fromUuidSync(uuid, { relative: effect, strict: false });
		if (document) return document;
	}
	return null;
}

function addPathEntries(entries, value, source, root = '', depth = 0, seen = new WeakSet()) {
	if (depth > 7 || !value || typeof value !== 'object' || seen.has(value)) return;
	seen.add(value);
	if (Array.isArray(value)) {
		if (value.length) addPathEntries(entries, value[0], source, root ? `${root}.0` : '0', depth + 1, seen);
		return;
	}
	if (!foundry.utils.isPlainObject(value)) return;
	for (const key of Object.keys(value)) {
		if (!isSafePathKey(key)) continue;
		const path = root ? `${root}.${key}` : key;
		addAutocompleteEntry(entries, path, source);
		addPathEntries(entries, value[key], source, path, depth + 1, seen);
	}
}

function addRavePathEntries(entries, value, root = '', depth = 0, seen = new WeakSet()) {
	if (depth > 7 || !value || typeof value !== 'object' || seen.has(value)) return;
	seen.add(value);
	if (Array.isArray(value)) {
		if (value.length) addRavePathEntries(entries, value[0], root ? `${root}.0` : '0', depth + 1, seen);
		return;
	}
	if (!foundry.utils.isPlainObject(value)) return;
	for (const key of Object.keys(value)) {
		if (!isSafePathKey(key)) continue;
		const path = root ? `${root}.${key}` : key;
		addRaveAutocompleteEntry(entries, path);
		addRavePathEntries(entries, value[key], path, depth + 1, seen);
	}
}

function addAutocompleteEntry(entries, identifier, source) {
	if (!identifier || entries.has(identifier)) return;
	entries.set(identifier, { identifier, label: `${identifier} - ${source}`, source });
}

function addRaveAutocompleteEntry(entries, identifier) {
	if (!identifier) return;
	entries.set(identifier, { identifier, label: identifier, source: MODULE_ID, detail: RAVE_HANDLING_LABEL });
}

function addNamedRaveAutocompleteEntry(entries, identifier, name) {
	if (!identifier) return;
	entries.set(identifier, { identifier, label: identifier, source: MODULE_ID, detail: `${RAVE_HANDLING_LABEL} ${name}` });
}

function addEffectAutocompleteEntries(entries, actor) {
	for (const effect of actor?.appliedEffects ?? []) {
		for (const path of ['name', 'uuid', 'id', 'disabled', 'suppressed']) {
			addNamedRaveAutocompleteEntry(entries, `effect.${effect.id}.${path}`, effect.name);
		}
	}
}

function addItemAutocompleteEntries(entries, actor) {
	for (const item of actor?.items ?? []) {
		for (const path of ['name', 'uuid', 'id', 'identifier', 'type', 'systemType', 'uses', 'equipped', 'properties', 'mastery', 'magicalBonus', 'rarity', 'school', 'attuned']) {
			addNamedRaveAutocompleteEntry(entries, `items.${item.id}.${path}`, item.name);
		}
	}
}

function addItemTypeAutocompleteEntries(entries, actor) {
	const itemTypes = dedupe([
		...(Array.isArray(game?.system?.documentTypes?.Item) ? game.system.documentTypes.Item : []),
		...Object.keys(CONFIG?.Item?.typeLabels ?? {}),
		...Array.from(actor?.items ?? [], (item) => item.type),
	]);
	for (const type of itemTypes) addRaveAutocompleteEntry(entries, `items.${type}.names`);
}

function dedupe(values) {
	return [...new Set(values.map((value) => `${value ?? ''}`.trim()).filter(Boolean))];
}

function getAutocompletePrefix(input) {
	const cursor = input.selectionStart ?? input.value.length;
	const beforeCursor = input.value.slice(0, cursor);
	return beforeCursor.match(/[A-Za-z_$][\w$-]*(?:\.(?:[A-Za-z_$][\w$-]*|\d+))*\.?$/)?.[0] ?? '';
}

function configureAutocompleteMenu(autocomplete, entries = []) {
	const menu = autocomplete?.element;
	if (!(menu instanceof HTMLElement)) return;
	menu.classList.add('rave5e-autocomplete-menu');
	menu.tabIndex = -1;
	const byIdentifier = new Map(entries.map((entry) => [entry.identifier, entry]));
	for (const item of menu.querySelectorAll('li')) {
		const entry = byIdentifier.get(item.dataset.identifier);
		if (!entry?.detail) continue;
		item.replaceChildren();
		item.insertAdjacentHTML('beforeend', `<span class="rave5e-autocomplete-path">${escapeHTML(entry.identifier)}</span><span class="rave5e-autocomplete-detail">${escapeHTML(entry.detail)}</span>`);
	}
}

function isSafePathKey(key) {
	return /^[A-Za-z_$][\w$]*$/.test(key) || /^\d+$/.test(key);
}

function normalizeElement(element) {
	if (element instanceof HTMLElement) return element;
	if (element?.element instanceof HTMLElement) return element.element;
	if (element?.[0] instanceof HTMLElement) return element[0];
	return null;
}

function applyConditionalChange(actor, change, { field, replacementData, modifyTarget = true, applyChange } = {}) {
	if (actor?.documentName !== 'Actor') return;
	if (getEffectActor(change.effect) !== actor) return;
	change = resolveRaveChange(change);
	applyChange ??= change.effect.constructor.applyChange.bind(change.effect.constructor);

	const rollData = buildContext(actor, { replacementData, effect: change.effect });

	const spec = parseSpec(change);
	if (!spec) return;
	if (spec.runtimeOnly) return;
	if (isActivityBonusKey(change.key) && specUsesRuntimeRollContext(spec)) return;
	if (spec.when && !evaluateCondition(spec.when, rollData)) {
		return;
	}

	const isFormulaField = field instanceof game.dnd5e.dataModels.fields.FormulaField;
	const value = isFormulaField && typeof spec.value === 'string' ? spec.value : evaluateValue(spec.value, rollData);
	if (value === undefined) return;
	if (isActivityBonusKey(change.key) && value && typeof value === 'object') return warn(change, 'activity bonus values must resolve to a number or formula string');

	const toggle = spec.op === 'toggle' ? resolveToggleChange(actor, change, value) : null;
	if (spec.op === 'toggle' && !toggle) return;

	const applied = {
		...change,
		count: 1,
		_rave5eResolved: true,
		type: toggle?.type ?? spec.op,
		value: toggle?.value ?? value,
	};

	return applyChange(actor, applied, { replacementData: rollData, modifyTarget });
}

function resolveToggleChange(actor, change, value) {
	const current = foundry.utils.getProperty(actor, change.key);
	const type = foundry.utils.getType(current);
	if (['Set', 'Array'].includes(type)) return { type: hasValue(current, value) ? 'subtract' : 'add', value };
	if (type === 'boolean') return { type: current ? 'subtract' : 'add', value: true };
	return warn(change, `toggle is only supported for Set, Array, and boolean targets`);
}

function hasValue(collection, value) {
	if (typeof collection === 'string') return collection.includes(value);
	if (!['Set', 'Array'].includes(foundry.utils.getType(collection))) return false;
	for (const entry of collection) {
		if (foundry.utils.equals(entry, value)) return true;
	}
	return false;
}

function matchesStatus(value, status) {
	status = normalizeStatus(status);
	const values = Array.isArray(value) || value instanceof Set ? Array.from(value) : [value];
	return values.some((entry) => normalizeStatus(entry) === status);
}

function normalizeStatus(value) {
	const id = `${value ?? ''}`.trim();
	if (!id) return '';
	const status = CONFIG.statusEffects.find((effect) => {
		const label = effect.name ? game.i18n.localize(effect.name) : '';
		return [effect.id, effect._id, effect.name, label].some((candidate) => `${candidate ?? ''}`.toLowerCase() === id.toLowerCase());
	});
	return status?.id ?? id;
}

function parseSpec(change) {
	let spec;
	try {
		spec = typeof change.value === 'string' ? JSON.parse(change.value) : change.value;
	} catch (err) {
		warn(change, `invalid JSON: ${err.message}`);
		return null;
	}
	if (!isObject(spec)) return warn(change, 'value must be a JSON object');
	if (!OPS.has(spec.op)) return warn(change, `unsupported op "${spec.op}"`);
	if (spec.when && !isObject(spec.when)) return warn(change, 'when must be an object');
	return spec;
}

function specUsesRuntimeRollContext(spec) {
	return objectHasPathRoot(spec, new Set(['item', 'activity']));
}

function objectHasPathRoot(value, roots, depth = 0) {
	if (depth > MAX_DEPTH || !isObject(value)) return false;
	if (typeof value.path === 'string' && roots.has(value.path.split('.')[0])) return true;
	for (const entry of Object.values(value)) {
		if (Array.isArray(entry)) {
			if (entry.some((item) => objectHasPathRoot(item, roots, depth + 1))) return true;
		} else if (objectHasPathRoot(entry, roots, depth + 1)) return true;
	}
	return false;
}

function evaluateCondition(condition, data, depth = 0) {
	if (depth > MAX_DEPTH || !isObject(condition)) return false;

	if (Array.isArray(condition.all)) return condition.all.every((c) => evaluateCondition(c, data, depth + 1));
	if (Array.isArray(condition.any)) return condition.any.some((c) => evaluateCondition(c, data, depth + 1));
	if (condition.not !== undefined) {
		if (isObject(condition.not) && typeof condition.not.path === 'string' && !('exists' in condition.not)) {
			if (readPath(data, condition.not.path) === undefined) return false;
		}
		return !evaluateCondition(condition.not, data, depth + 1);
	}
	if (typeof condition.path !== 'string') return false;

	const value = readPath(data, condition.path);
	if ('exists' in condition) return pathExists(data, condition.path) === Boolean(condition.exists);
	if (value === undefined) return false;

	if ('eq' in condition) return value === condition.eq;
	if ('ne' in condition) return value !== condition.ne;
	if ('gt' in condition) return compare(value, condition.gt, (a, b) => a > b);
	if ('gte' in condition) return compare(value, condition.gte, (a, b) => a >= b);
	if ('lt' in condition) return compare(value, condition.lt, (a, b) => a < b);
	if ('lte' in condition) return compare(value, condition.lte, (a, b) => a <= b);
	if (Array.isArray(condition.in)) return condition.in.includes(value);
	if ('includes' in condition) return hasValue(value, condition.includes);

	return Boolean(value);
}

function evaluateValue(expression, data, depth = 0) {
	if (depth > MAX_DEPTH) return undefined;
	if (expression === null) return null;
	if (typeof expression === 'string') return evaluateStringValue(expression, data);
	if (['number', 'boolean'].includes(typeof expression)) return expression;
	if (Array.isArray(expression)) return expression.map((value) => evaluateValue(value, data, depth + 1));
	if (!isObject(expression)) return undefined;

	if (typeof expression.path === 'string') return readPath(data, expression.path);
	if ('floor' in expression) return unary(expression.floor, data, depth, Math.floor);
	if ('ceil' in expression) return unary(expression.ceil, data, depth, Math.ceil);
	if ('round' in expression) return unary(expression.round, data, depth, Math.round);
	if ('abs' in expression) return unary(expression.abs, data, depth, Math.abs);
	if (Array.isArray(expression.add)) return numericList(expression.add, data, depth, (...values) => values.reduce((a, b) => a + b, 0));
	if (Array.isArray(expression.mul)) return numericList(expression.mul, data, depth, (...values) => values.reduce((a, b) => a * b, 1));
	if (Array.isArray(expression.min)) return numericList(expression.min, data, depth, Math.min);
	if (Array.isArray(expression.max)) return numericList(expression.max, data, depth, Math.max);
	if (Array.isArray(expression.sub) && expression.sub.length === 2) return binary(expression.sub, data, depth, (a, b) => a - b);
	if (Array.isArray(expression.div) && expression.div.length === 2) {
		return binary(expression.div, data, depth, (a, b) => (b === 0 ? undefined : a / b));
	}

	return undefined;
}

function evaluateStringValue(value, data) {
	const trimmed = value.trim();
	if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
		try {
			return JSON.parse(trimmed);
		} catch (_err) {
			return trimmed.slice(1, -1).split(',').map((part) => part.trim()).filter(Boolean);
		}
	}
	return evaluateFormulaString(value, data);
}

function evaluateFormulaString(value, data) {
	if (!/[+\-*/@()]/.test(value)) return value;
	try {
		const formula = Roll.defaultImplementation.replaceFormulaData(value, data, { recursive: true });
		const roll = Roll.create(formula);
		return roll.isDeterministic ? roll.evaluateSync().total : value;
	} catch (_err) {
		return value;
	}
}

function unary(expression, data, depth, fn) {
	const value = Number(evaluateValue(expression, data, depth + 1));
	return Number.isFinite(value) ? fn(value) : undefined;
}

function binary(expressions, data, depth, fn) {
	const values = expressions.map((e) => Number(evaluateValue(e, data, depth + 1)));
	if (values.some((v) => !Number.isFinite(v))) return undefined;
	return fn(values[0], values[1]);
}

function numericList(expressions, data, depth, fn) {
	const values = expressions.map((e) => Number(evaluateValue(e, data, depth + 1)));
	if (values.some((v) => !Number.isFinite(v))) return undefined;
	return fn(...values);
}

function compare(left, right, fn) {
	const a = Number(left);
	const b = Number(right);
	return Number.isFinite(a) && Number.isFinite(b) && fn(a, b);
}

function readPath(data, path) {
	if (path.startsWith('__') || path.includes('.__')) return undefined;
	const value = foundry.utils.getProperty(data, path);
	if (value !== undefined) return value;
	if (path.startsWith('attributes.ac.equipped')) {
		const actor = actorContexts.get(data);
		for (const [root, item] of Object.entries(getEquippedArmor(actor))) {
			if (path === root) return item;
			if (path.startsWith(`${root}.`)) return foundry.utils.getProperty(item, path.slice(root.length + 1));
		}
	}
	if (path === 'attributes.hp.pct') return computeHitPointPercentage(foundry.utils.getProperty(data, 'attributes.hp'));
	if (path === 'attributes.hd.pct') return computePercentage(foundry.utils.getProperty(data, 'attributes.hd.value'), foundry.utils.getProperty(data, 'attributes.hd.max'));
	if (path === 'attributes.encumbrance.pct') return computePercentage(foundry.utils.getProperty(data, 'attributes.encumbrance.value'), foundry.utils.getProperty(data, 'attributes.encumbrance.max'));
	return undefined;
}

function pathExists(data, path) {
	if (path.startsWith('__') || path.includes('.__')) return false;
	if (foundry.utils.hasProperty(data, path)) return true;
	return readPath(data, path) !== undefined;
}

function computeHitPointPercentage(hp) {
	if (!hp || typeof hp !== 'object') return undefined;
	const max = Number(hp.effectiveMax ?? Math.max((hp.max ?? 0) + (hp.tempmax ?? 0), 0));
	const value = Number(hp.value ?? 0);
	return computePercentage(value, max);
}

function computePercentage(value, max) {
	value = Number(value ?? 0);
	max = Number(max ?? 0);
	return Number.isFinite(max) && Number.isFinite(value) ? Math.clamp(max ? (value / max) * 100 : 0, 0, 100) : undefined;
}

function buildContext(actor, { replacementData, effect, item, activity } = {}) {
	const data = replacementData ?? activity?.getRollData?.() ?? item?.getRollData?.() ?? actor.getRollData();
	actorContexts.set(data, actor);
	foundry.utils.setProperty(data, 'flags', actor.flags ?? {});
	foundry.utils.setProperty(data, 'gridDistance', canvas?.grid?.distance);
	addItemContext(data, item ?? getEffectContextItem(effect));
	addActorEffectsContext(data, actor);
	defineLazyActorRollDataViews(data, actor);
	return data;
}

function getEquippedArmor(actor) {
	let equippedArmor;
	let equippedShield;
	for (const item of actor?.itemTypes?.equipment ?? []) {
		if (!item.system?.equipped || !(item.system.type?.value in (CONFIG.DND5E?.armorTypes ?? {}))) continue;
		if (item.system.type.value === 'shield') equippedShield ??= item;
		else equippedArmor ??= item;
	}
	return {
		'attributes.ac.equippedArmor': equippedArmor,
		'attributes.ac.equippedShield': equippedShield,
	};
}

function addItemContext(data, item) {
	if (!item) return;
	const system = item.system.toObject();
	foundry.utils.setProperty(data, 'item', {
		name: item.name,
		identifier: item.identifier,
		id: item.id,
		uuid: item.uuid,
		system: item.system,
		...system,
		type: item.type,
		systemType: system.type,
	});
}

function addActorEffectsContext(data, actor) {
	const effect = {};
	const entries = Array.from(getActorOwnedEffects(actor)).filter((e) => !e.disabled && !e.isSuppressed).map((e) => {
		const entry = {
			name: e.name,
			uuid: e.uuid,
			id: e.id,
			disabled: e.disabled,
			suppressed: e.isSuppressed,
		};
		effect[e.id] = entry;
		return entry;
	});
	foundry.utils.setProperty(data, 'effect', effect);
	foundry.utils.setProperty(data, 'effects', {
		names: entries.map((effect) => effect.name),
		entries,
	});
}

function isObject(value) {
	return foundry.utils.isPlainObject(value);
}

function warn(change, message) {
	console.warn(`${MODULE_ID} | ${change.effect?.uuid ?? 'ActiveEffect'} ${change.key}: ${message}`);
	return null;
}

function defineLazyActorRollDataViews(actorData, actor) {
	let itemViewsCache;
	const defineCachedValue = (key, resolver) => {
		if (Object.hasOwn(actorData, key)) return;
		Object.defineProperty(actorData, key, {
			configurable: true,
			enumerable: true,
			get() {
				const value = resolver();
				Object.defineProperty(actorData, key, {
					value,
					configurable: true,
					enumerable: true,
					writable: true,
				});
				return value;
			},
		});
	};
	const getItemViews = () => {
		if (itemViewsCache) return itemViewsCache;
		const items = { names: [], entries: [] };
		const equippedItems = { names: [], identifiers: [] };
		for (const item of actor.items ?? []) {
			const identifier = item.identifier;
			const equipped = !!item.system?.equipped;
			if (equipped) {
				equippedItems.names.push(item.name);
				equippedItems.identifiers.push(identifier);
			}
			const itemProperties = item.system?.properties instanceof Set ? new Set(item.system.properties) : new Set();
			const properties = {};
			for (const prop of itemProperties) properties[prop] = true;
			const mastery = {};
			if (item.system?.mastery) mastery[item.system.mastery] = true;
			const itemView = {
				name: item.name,
				uuid: item.uuid,
				id: item.id,
				identified: item.system?.identified,
				identifier,
				type: item.type,
				systemType: item.system?.type,
				uses: item.system?.uses || {},
				equipped,
				properties,
				mastery,
				magicalBonus: item.system?.magicalBonus,
				rarity: item.system?.rarity,
				school: item.system?.school,
				attuned: !!item.system?.attuned,
			};
			items.names.push(item.name);
			items.entries.push(itemView);
			items[item.id] = itemView;
			items[item.type] ??= { names: [], entries: [] };
			items[item.type].names.push(item.name);
			items[item.type].entries.push(itemView);
		}
		itemViewsCache = { items, equippedItems };
		return itemViewsCache;
	};

	defineCachedValue('items', () => getItemViews().items);
	defineCachedValue('equippedItems', () => getItemViews().equippedItems);
	const active = game.combat?.active;
	const token = getActorTokenDocument(actor);
	if (!active || !token) return;
	defineCachedValue('movementLastSegment', () => {
		const history = token.movementHistory ?? [];
		const movementId = history?.at(-1)?.movementId;
		if (!movementId) return false;
		return history.filter((entry) => entry.movementId === movementId).reduce((acc, entry) => (acc += entry.cost ?? 0), 0);
	});
	defineCachedValue('movementTurn', () => {
		return (token.movementHistory ?? []).reduce((acc, entry) => (acc += entry.cost ?? 0), 0);
	});
	// defineCachedValue('lightLevel', () => (token ? { [_getLightLevel(token)]: true } : {}));
}

function getActorTokenDocument(actor) {
	const token = actor.token ?? actor.getActiveTokens()?.[0];
	if (token instanceof TokenDocument) return token;
	if (token?.document instanceof TokenDocument) return token.document;
	return null;
}
