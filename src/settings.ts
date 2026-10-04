import {
	App,
	type ColorComponent,
	type TextComponent,
	PluginSettingTab,
	Setting,
	type SettingDefinitionItem,
	type SettingGroupItem,
} from "obsidian";
import type DocCommentsPlugin from "./main";
import { cssUrl, ImageFileModal, resolvePhotoUrl } from "./ui/profile";
import {
	ANNOTATION_STYLES,
	CUSTOMIZABLE_HIGHLIGHT_COLORS,
	DEFAULT_ANNOTATION_STYLE,
	DEFAULT_HIGHLIGHT_COLOR,
	DEFAULT_HIGHLIGHT_INTENSITY,
	defaultHighlightHex,
	HIGHLIGHT_COLORS,
} from "./ui/highlight-colors";

export type DocCommentsSettings = {
	/** Author handle attached to comments you create. Empty falls back to "me". */
	author: string;
	/** Master toggle for the margin column. */
	showComments: boolean;
	/** Show resolved comments in the margin. */
	showResolved: boolean;
	/** Allow a blank comment to persist with an empty comment card. */
	allowEmptyComments: boolean;
	/** Your profile photo: a vault image path or a web URL. Empty = none. */
	profilePhoto: string;
	/** Show your name and photo on your own comments. */
	showMyProfile: boolean;
	/** Show who wrote each comment and reply. */
	showAuthor: boolean;
	/** Include comments as numbered footnotes when exporting a note to PDF. */
	printComments: boolean;
	/** Palette id (see highlight-colors.ts) for the in-text comment highlight. */
	highlightColor: string;
	/** % of each color's own tone mixed into its pale base — shared by all 9. */
	highlightIntensity: number;
	/** Hand-picked hex overrides keyed by color id, replacing the
	 *  intensity-derived default for that one color. Separate per theme. */
	highlightColorsLight: Record<string, string>;
	highlightColorsDark: Record<string, string>;
	/** How a comment's anchor is marked in the text: "highlight" (fill only),
	 *  "underline" (no fill), or "both". See ui/highlight-colors.ts. */
	annotationStyle: string;
};

export const DEFAULT_SETTINGS: DocCommentsSettings = {
	author: "",
	showComments: true,
	showResolved: false,
	allowEmptyComments: false,
	profilePhoto: "",
	showMyProfile: true,
	showAuthor: true,
	printComments: true,
	highlightColor: DEFAULT_HIGHLIGHT_COLOR,
	highlightIntensity: DEFAULT_HIGHLIGHT_INTENSITY,
	highlightColorsLight: {},
	highlightColorsDark: {},
	annotationStyle: DEFAULT_ANNOTATION_STYLE,
};

type DocCommentsSettingKey = keyof DocCommentsSettings;
/** Excludes the two `Record<string, string>` settings (custom color maps,
 *  handled separately via buildColorRow) — SETTING_META's generic text/
 *  dropdown/slider/toggle rendering only ever stringifies string/number/
 *  boolean values, and this keeps the type checker able to confirm that
 *  instead of silently risking "[object Object]". */
type StringSettingKey = Exclude<DocCommentsSettingKey, "highlightColorsLight" | "highlightColorsDark" | "profilePhoto">;

type TextControl = { type: "text"; placeholder: string };
type ToggleControl = { type: "toggle" };
type DropdownControl = { type: "dropdown"; options: Record<string, string> };
type SliderControl = { type: "slider"; min: number; max: number; step: number };

const HIGHLIGHT_COLOR_OPTIONS: Record<string, string> = Object.fromEntries(
	HIGHLIGHT_COLORS.map((c) => [c.id, c.label]),
);
const ANNOTATION_STYLE_OPTIONS: Record<string, string> = Object.fromEntries(
	ANNOTATION_STYLES.map((s) => [s.id, s.label]),
);

/** Single source of truth for each setting's copy and control. Both the
 *  declarative `getSettingDefinitions()` API (newer Obsidian) and the imperative
 *  `display()` fallback (older Obsidian) render from this, so their labels and
 *  defaults can't drift apart. */
const SETTING_META: ReadonlyArray<{
	key: StringSettingKey;
	name: string;
	desc: string;
	aliases: string[];
	control: TextControl | ToggleControl | DropdownControl | SliderControl;
}> = [
	{
		key: "author",
		name: "Author",
		desc: 'Name attached to comments you create. Defaults to "me".',
		aliases: ["comment author", "display name"],
		control: { type: "text", placeholder: "Me" },
	},
	{
		key: "showComments",
		name: "Show comments",
		desc: "Show the comment column. You can also toggle this from the ribbon or the command palette.",
		aliases: ["comment column", "margin comments"],
		control: { type: "toggle" },
	},
	{
		key: "showMyProfile",
		name: "Show my profile",
		desc: "Show your name and profile photo on your own comments and replies.",
		aliases: ["profile", "avatar", "my name", "photo"],
		control: { type: "toggle" },
	},
	{
		key: "showAuthor",
		name: "Show author names",
		desc: "Show who wrote each comment and reply on comment cards and in highlight hover previews.",
		aliases: ["author", "name", "commenter"],
		control: { type: "toggle" },
	},
	{
		key: "showResolved",
		name: "Show resolved comments",
		desc: "Keep resolved comments visible in the margin.",
		aliases: ["resolved comments"],
		control: { type: "toggle" },
	},
	{
		key: "allowEmptyComments",
		name: "Allow empty comments",
		desc: "Allow new comments without text. Existing empty comments remain available when this setting is off.",
		aliases: ["empty comments", "comment-free highlights"],
		control: { type: "toggle" },
	},
	{
		key: "printComments",
		name: "Show comments in PDF export",
		desc: "Include comments as numbered footnotes under each paragraph when you export a note to PDF. Resolved comments are included only when Show resolved comments is on.",
		aliases: ["pdf", "export", "print", "footnotes"],
		control: { type: "toggle" },
	},
	{
		key: "annotationStyle",
		name: "Annotation style",
		desc: 'How commented text is marked: "Highlight" (fill only), "Underline" (no fill), or "Highlight + underline". Any single comment can override this from its "..." menu → Change style.',
		aliases: ["annotation", "underline", "highlight style", "comment marker"],
		control: { type: "dropdown", options: ANNOTATION_STYLE_OPTIONS },
	},
	{
		key: "highlightColor",
		name: "Highlight color",
		desc: "Color used to highlight commented text in your notes.",
		aliases: ["comment color", "highlight", "comment highlight color"],
		control: { type: "dropdown", options: HIGHLIGHT_COLOR_OPTIONS },
	},
	{
		key: "highlightIntensity",
		name: "Highlight intensity",
		desc: "How strongly each highlight color's own tone shows through its pale base — higher is bolder/more saturated.",
		aliases: ["highlight opacity", "highlight strength", "highlight saturation"],
		control: { type: "slider", min: 0, max: 40, step: 1 },
	},
];

export class DocCommentsSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: DocCommentsPlugin,
	) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem<DocCommentsSettingKey>[] {
		const items: SettingDefinitionItem<DocCommentsSettingKey>[] = SETTING_META.map((meta) => {
			if (meta.control.type === "text") {
				return {
					name: meta.name,
					desc: meta.desc,
					aliases: meta.aliases,
					control: {
						type: "text",
						key: meta.key,
						defaultValue: DEFAULT_SETTINGS[meta.key] as string,
						placeholder: meta.control.placeholder,
					},
				};
			}
			if (meta.control.type === "dropdown") {
				return {
					name: meta.name,
					desc: meta.desc,
					aliases: meta.aliases,
					control: {
						type: "dropdown",
						key: meta.key,
						defaultValue: DEFAULT_SETTINGS[meta.key] as string,
						options: meta.control.options,
					},
				};
			}
			if (meta.control.type === "slider") {
				return {
					name: meta.name,
					desc: meta.desc,
					aliases: meta.aliases,
					control: {
						type: "slider",
						key: meta.key,
						defaultValue: DEFAULT_SETTINGS[meta.key] as number,
						min: meta.control.min,
						max: meta.control.max,
						step: meta.control.step,
					},
				};
			}
			return {
				name: meta.name,
				desc: meta.desc,
				aliases: meta.aliases,
				control: { type: "toggle", key: meta.key, defaultValue: DEFAULT_SETTINGS[meta.key] as boolean },
			};
		});
		// The photo picker sits right after Author — the same "your profile" topic.
		const authorIndex = SETTING_META.findIndex((m) => m.key === "author");
		items.splice(authorIndex + 1, 0, {
			name: "Profile photo",
			render: (setting) => this.buildPhotoRow(setting),
		});
		// One SettingDefinitionRender item per color: its `render(setting)` callback
		// decorates the ONE row Obsidian already created for that item — the
		// documented usage. (An earlier version tried to dynamically add MORE
		// settings via the render callback's `group` param — that silently
		// produced nothing but the item's own heading, so don't do that again.)
		const colorRow = (
			theme: "light" | "dark",
			c: { id: string; label: string },
		): SettingGroupItem<DocCommentsSettingKey> => ({
			name: c.label,
			render: (setting) => this.buildColorRow(setting, theme, c),
		});
		// SettingGroupItem doesn't allow a nested group inside another group's
		// `items` (only definitions/pages) — so "Custom highlight colors" as one
		// wrapping group containing "Light"/"Dark" sub-groups isn't representable.
		// Two flat top-level groups instead.
		items.push({
			type: "group",
			heading: "Custom highlight colors — light theme",
			items: CUSTOMIZABLE_HIGHLIGHT_COLORS.map((c) => colorRow("light", c)),
		});
		items.push({
			type: "group",
			heading: "Custom highlight colors — dark theme",
			items: CUSTOMIZABLE_HIGHLIGHT_COLORS.map((c) => colorRow("dark", c)),
		});
		return items;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		await this.applySetting(key as StringSettingKey, value);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		for (const meta of SETTING_META) {
			if (meta.key === "showComments") this.buildPhotoRow(new Setting(containerEl));
			const setting = new Setting(containerEl).setName(meta.name).setDesc(meta.desc);
			if (meta.control.type === "text") {
				const placeholder = meta.control.placeholder;
				setting.addText((text) =>
					text
						.setPlaceholder(placeholder)
						.setValue(String(this.plugin.settings[meta.key]))
						.onChange((value) => void this.applySetting(meta.key, value)),
				);
			} else if (meta.control.type === "dropdown") {
				const options = meta.control.options;
				setting.addDropdown((dropdown) =>
					dropdown
						.addOptions(options)
						.setValue(String(this.plugin.settings[meta.key]))
						.onChange((value) => void this.applySetting(meta.key, value)),
				);
			} else if (meta.control.type === "slider") {
				const { min, max, step } = meta.control;
				setting.addSlider((slider) =>
					slider
						.setLimits(min, max, step)
						.setValue(Number(this.plugin.settings[meta.key]))
						.setDynamicTooltip()
						.onChange((value) => void this.applySetting(meta.key, value)),
				);
			} else {
				setting.addToggle((toggle) =>
					toggle
						.setValue(Boolean(this.plugin.settings[meta.key]))
						.onChange((value) => void this.applySetting(meta.key, value)),
				);
			}
		}

		new Setting(containerEl)
			.setName("Custom highlight colors")
			.setDesc(
				"Override any color's exact hex value, separately for light and dark mode. Reset a color to go back to the intensity-derived default.",
			)
			.setHeading();
		new Setting(containerEl).setName("Light theme").setHeading();
		for (const c of CUSTOMIZABLE_HIGHLIGHT_COLORS) this.buildColorRow(new Setting(containerEl), "light", c);
		new Setting(containerEl).setName("Dark theme").setHeading();
		for (const c of CUSTOMIZABLE_HIGHLIGHT_COLORS) this.buildColorRow(new Setting(containerEl), "dark", c);
	}

	/** Profile photo: a small preview, the vault path or URL as text, a vault
	 *  image picker, and a clear button. Shared by both settings paths. */
	private buildPhotoRow(setting: Setting): void {
		setting
			.setName("Profile photo")
			.setDesc(
				"Shown small next to your name on your own comments. Pick an image from your vault, or paste an image link.",
			);
		const preview = setting.controlEl.createDiv({ cls: "dc-avatar dc-avatar--preview" });
		const showPreview = () => {
			const url = resolvePhotoUrl(this.app, this.plugin.settings.profilePhoto);
			preview.toggleClass("is-empty", !url);
			preview.setCssStyles({ backgroundImage: url ? cssUrl(url) : "" });
		};
		let input: TextComponent | null = null;
		setting.addText((text) => {
			input = text;
			text.setPlaceholder("attachments/me.png or https://…")
				.setValue(this.plugin.settings.profilePhoto)
				.onChange(async (value) => {
					await this.setProfilePhoto(value.trim());
					showPreview();
				});
		});
		setting.addButton((btn) =>
			btn.setButtonText("Choose…").onClick(() => {
				new ImageFileModal(this.app, (file) => {
					void this.setProfilePhoto(file.path).then(() => {
						input?.setValue(file.path);
						showPreview();
					});
				}).open();
			}),
		);
		setting.addExtraButton((btn) =>
			btn
				.setIcon("x")
				.setTooltip("Remove photo")
				.onClick(async () => {
					await this.setProfilePhoto("");
					input?.setValue("");
					showPreview();
				}),
		);
		showPreview();
	}

	private async setProfilePhoto(value: string): Promise<void> {
		this.plugin.settings.profilePhoto = value;
		await this.plugin.saveSettings();
		this.plugin.applyProfile();
	}

	/** One color-picker + reset row, shared by both the declarative render item
	 *  and the imperative display() path so they can't drift apart. */
	private buildColorRow(setting: Setting, theme: "light" | "dark", c: { id: string; label: string }): void {
		const key = theme === "light" ? "highlightColorsLight" : "highlightColorsDark";
		const current = this.plugin.settings[key][c.id];
		// An uncustomized color shows its own theme's default, so the light and
		// dark rows each preview the palette they actually use.
		const fallback = (): string => defaultHighlightHex(c.id, theme, this.plugin.settings.highlightIntensity);
		setting.setName(c.label);
		let picker: ColorComponent | null = null;
		setting.addColorPicker((p) => {
			picker = p;
			p.setValue(current ?? fallback());
			p.onChange((value) => void this.setCustomColor(key, c.id, value));
		});
		setting.addExtraButton((btn) =>
			btn
				.setIcon("rotate-ccw")
				.setTooltip("Reset to default")
				.onClick(async () => {
					await this.setCustomColor(key, c.id, undefined);
					picker?.setValue(fallback());
				}),
		);
	}

	private async setCustomColor(
		key: "highlightColorsLight" | "highlightColorsDark",
		id: string,
		value: string | undefined,
	): Promise<void> {
		const next = { ...this.plugin.settings[key] };
		if (value) next[id] = value;
		else delete next[id];
		this.plugin.settings[key] = next;
		await this.plugin.saveSettings();
		this.plugin.refreshHighlightColor();
	}

	/** Persist one setting and run its side effects (editor refresh, ribbon sync).
	 *  Shared by both the declarative and imperative settings paths. */
	private async applySetting(key: StringSettingKey, value: unknown): Promise<void> {
		if (key === "author") this.plugin.settings.author = String(value);
		else if (key === "showComments") this.plugin.settings.showComments = Boolean(value);
		else if (key === "showResolved") this.plugin.settings.showResolved = Boolean(value);
		else if (key === "allowEmptyComments") this.plugin.settings.allowEmptyComments = Boolean(value);
		else if (key === "printComments") this.plugin.settings.printComments = Boolean(value);
		else if (key === "showAuthor") this.plugin.settings.showAuthor = Boolean(value);
		else if (key === "showMyProfile") this.plugin.settings.showMyProfile = Boolean(value);
		else if (key === "highlightColor") this.plugin.settings.highlightColor = String(value);
		else if (key === "highlightIntensity") this.plugin.settings.highlightIntensity = Number(value);
		else if (key === "annotationStyle") this.plugin.settings.annotationStyle = String(value);
		await this.plugin.saveSettings();
		const colorKeys: StringSettingKey[] = ["highlightColor", "highlightIntensity", "annotationStyle"];
		if (colorKeys.includes(key)) this.plugin.refreshHighlightColor();
		if (key !== "author" && !colorKeys.includes(key)) this.plugin.refreshEditors();
		if (key === "showComments") this.plugin.updateRibbon();
		if (key === "showAuthor") this.plugin.applyAuthorVisibility();
		if (key === "showMyProfile") this.plugin.applyProfile();
	}
}
