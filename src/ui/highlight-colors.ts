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
 *  --dc-highlight-intensity in styles.css. 0 = Notion's exact fill color. */
export const DEFAULT_HIGHLIGHT_INTENSITY = 0;

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

/** Notion's palette per theme: `bg` is the highlight fill, `fg` the deeper tone
 *  (underline, hover, colored comment text). Mirrors the --dc-hl-<id>-pale /
 *  -border values in styles.css — keep the two in sync. Used to show each
 *  color's default in the settings color pickers. */
const PALETTE: Record<string, Record<"light" | "dark", { bg: string; fg: string }>> = {
	gray: { light: { bg: "#F1F1EF", fg: "#787774" }, dark: { bg: "#3C4144", fg: "#9FA4A8" } },
	brown: { light: { bg: "#F4EEEE", fg: "#9E6B53" }, dark: { bg: "#4C3E35", fg: "#D49675" } },
	orange: { light: { bg: "#FBEDE7", fg: "#C86F21" }, dark: { bg: "#553B29", fg: "#E98D36" } },
	yellow: { light: { bg: "#F4F1E5", fg: "#B57E33" }, dark: { bg: "#4A3E2C", fg: "#C99D46" } },
	green: { light: { bg: "#EDF3EB", fg: "#458262" }, dark: { bg: "#2F443A", fg: "#72B183" } },
	blue: { light: { bg: "#E7F3F8", fg: "#347EA9" }, dark: { bg: "#2D4156", fg: "#66AADA" } },
	purple: { light: { bg: "#F4F0F7", fg: "#9165B0" }, dark: { bg: "#453A5B", fg: "#B098D8" } },
	pink: { light: { bg: "#F9EEF3", fg: "#C14C8A" }, dark: { bg: "#51384D", fg: "#DE84D1" } },
	red: { light: { bg: "#FDEBEC", fg: "#D34C47" }, dark: { bg: "#5E3436", fg: "#EA878C" } },
};

/** The highlight color a palette id gets by default in one theme at a given
 *  intensity — the same `color-mix(in srgb, bg, fg <intensity>%)` styles.css
 *  computes, as a hex for a color picker. */
export const defaultHighlightHex = (id: string, theme: "light" | "dark", intensity: number): string => {
	const entry = PALETTE[id]?.[theme];
	if (!entry) return "#000000";
	const t = Math.min(Math.max(intensity, 0), 100) / 100;
	const channels = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
	const from = channels(entry.bg);
	const to = channels(entry.fg);
	return (
		"#" +
		from
			.map((c, i) => Math.round(c + ((to[i] ?? c) - c) * t))
			.map((c) => c.toString(16).padStart(2, "0"))
			.join("")
	);
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
 *  default), just a quiet underline with no fill — for people who find a page
 *  full of colored blocks distracting — or both together. */
export type AnnotationStyleDef = {
	id: string;
	label: string;
};

export const ANNOTATION_STYLES: AnnotationStyleDef[] = [
	{ id: "highlight", label: "Highlight" },
	{ id: "underline", label: "Underline" },
	{ id: "both", label: "Highlight + underline" },
];

export const DEFAULT_ANNOTATION_STYLE = "highlight";

/** Sets the plugin-wide anchor style with a body class (see styles.css's
 *  `body.dc-annotation-*` rules): no class means fill only, `underline` drops
 *  the fill and shows the underline, `both` shows both. Hovering an anchor
 *  still shows its momentary active color in every mode. */
export const applyAnnotationStyle = (style: string): void => {
	document.body.classList.toggle("dc-annotation-underline", style === "underline");
	document.body.classList.toggle("dc-annotation-both", style === "both");
};
