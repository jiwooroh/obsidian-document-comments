/**
 * Notion's highlight palette. Ids match the `--dc-hl-<id>` / `-border` / `-active`
 * custom properties defined in styles.css (light default on `:root`, dark override
 * under `body.theme-dark`) — this file only carries the ids/labels needed to build
 * the settings dropdown and to point `--dc-highlight-*` at the chosen one.
 */
export type HighlightColorDef = {
	id: string;
	label: string;
};

export const HIGHLIGHT_COLORS: HighlightColorDef[] = [
	{ id: "theme", label: "Theme default" },
	{ id: "yellow", label: "Yellow" },
	{ id: "green", label: "Green" },
	{ id: "blue", label: "Blue" },
	{ id: "purple", label: "Purple" },
	{ id: "pink", label: "Pink" },
	{ id: "red", label: "Red" },
	{ id: "orange", label: "Orange" },
	{ id: "brown", label: "Brown" },
	{ id: "gray", label: "Gray" },
];

export const DEFAULT_HIGHLIGHT_COLOR = "theme";

/** Default % of each color's own tone mixed into its pale base — see
 *  --dc-highlight-intensity in styles.css. 0 = the plain Notion pale wash. */
export const DEFAULT_HIGHLIGHT_INTENSITY = 5;

/** The 9 named colors (excludes "theme", which has no pale/border pair of its
 *  own to customize — it derives entirely from the vault's theme instead). */
export const CUSTOMIZABLE_HIGHLIGHT_COLORS: HighlightColorDef[] = HIGHLIGHT_COLORS.filter((c) => c.id !== "theme");

/** Points the `--dc-highlight-*` variables at the chosen palette id's custom
 *  properties. Kept as a string reference (not a resolved hex), so it stays
 *  theme-aware automatically — `--dc-hl-<id>` itself already flips value under
 *  `body.theme-dark`, with no JS re-run needed on theme change. */
export const applyHighlightColor = (colorId: string): void => {
	const id = HIGHLIGHT_COLORS.some((c) => c.id === colorId) ? colorId : DEFAULT_HIGHLIGHT_COLOR;
	document.body.style.setProperty("--dc-highlight-bg", `var(--dc-hl-${id})`);
	document.body.style.setProperty("--dc-highlight-bg-active", `var(--dc-hl-${id}-active)`);
	document.body.style.setProperty("--dc-highlight-border", `var(--dc-hl-${id}-border)`);
};

/** Sets how strongly each of the 9 colors' own tone mixes into its pale base
 *  (see --dc-highlight-intensity in styles.css) — the "opacity" slider in
 *  settings. Affects every color at once, since it's one shared mix ratio. */
export const applyHighlightIntensity = (percent: number): void => {
	document.body.style.setProperty("--dc-highlight-intensity", `${percent}%`);
};

/** Applies (or clears) a hand-picked hex override for individual colors, on
 *  top of the intensity-derived default — same override-on-<body> pattern the
 *  sibling Notion Selection Toolbar plugin uses for its own highlight colors.
 *  Picks the light or dark map by the theme currently on <body>. */
export const applyCustomHighlightColors = (light: Record<string, string>, dark: Record<string, string>): void => {
	const active = document.body.classList.contains("theme-dark") ? dark : light;
	for (const c of CUSTOMIZABLE_HIGHLIGHT_COLORS) {
		const custom = active[c.id];
		if (custom) document.body.style.setProperty(`--dc-hl-${c.id}`, custom);
		else document.body.style.removeProperty(`--dc-hl-${c.id}`);
	}
};

/** How a comment's anchor is marked in the text: a filled highlight (the
 *  default, always has been), or just the quiet underline with no background
 *  fill — for people who find a page full of colored blocks distracting. */
export type AnnotationStyleDef = {
	id: string;
	label: string;
};

export const ANNOTATION_STYLES: AnnotationStyleDef[] = [
	{ id: "highlight", label: "Highlight" },
	{ id: "underline", label: "Underline" },
];

export const DEFAULT_ANNOTATION_STYLE = "highlight";

/** Toggles the background fill on/off for every comment anchor at once — a
 *  plain class rather than a CSS variable, since both the property name and
 *  the "off" value are fixed, not computed (see styles.css's
 *  `body.dc-annotation-underline` rule). The underline (border-bottom) itself
 *  is unaffected either way, and hovering a highlight still shows its
 *  momentary active-color regardless of mode. */
export const applyAnnotationStyle = (style: string): void => {
	document.body.classList.toggle("dc-annotation-underline", style === "underline");
};
