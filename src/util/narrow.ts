/** Keep in sync with `--dc-margin-width` in styles.css. */
export const MARGIN_WIDTH_PX = 320;

/** How much slack beyond the readable text width counts as "still comfortable
 *  enough to reserve the column." Deliberately much smaller than
 *  MARGIN_WIDTH_PX — the margin only needs to fit *when a card is revealed*
 *  (floating over the text), not be fully reserved to switch modes, so this
 *  should trip late (only once things are genuinely tight), not the moment the
 *  full 320px column stops fitting. */
const NARROW_SLACK_PX = 96;

/** Reads Obsidian's `--file-line-width` (the readable line width) off `el`, in
 *  pixels. Themes/settings can set it as a bare number (legacy, already px), or
 *  with `px`/`rem` units — handle all three. Falls back to a sane default (the
 *  same 700px area Obsidian ships) if the variable is unset or unparseable. */
const readLineWidthPx = (el: HTMLElement): number => {
	const fallback = 700;
	const raw = getComputedStyle(el).getPropertyValue("--file-line-width").trim();
	if (!raw) return fallback;
	const num = parseFloat(raw);
	if (Number.isNaN(num)) return fallback;
	if (raw.endsWith("rem") || raw.endsWith("em")) {
		const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
		return num * remPx;
	}
	return num; // "px" suffix or bare legacy number — both already pixels
};

/** True once `container` is genuinely tight — not merely "too narrow for the
 *  full 320px column," but too narrow for the text plus a much smaller margin
 *  of breathing room. Below this, the margin stops being reserved and its
 *  cards hide until hovered. */
export const isNarrowForMargin = (container: HTMLElement): boolean => {
	return container.clientWidth < readLineWidthPx(container) + NARROW_SLACK_PX;
};
