import { setIcon } from "obsidian";

/**
 * setIcon(), but bulletproof: falls back to a plain text glyph if the icon
 * wasn't found or didn't render, so the button is never left visually empty.
 * Checks for an actual populated <svg> (has child nodes), not just the tag's
 * presence — an unknown icon name can still leave behind an empty <svg>
 * shell, which `querySelector("svg")` alone would wrongly count as success.
 */
export const setIconSafe = (btn: HTMLElement, icon: string, fallbackText: string): void => {
	setIcon(btn, icon);
	const svg = btn.querySelector("svg");
	if (!svg || svg.childElementCount === 0) {
		btn.textContent = fallbackText;
	}
};

/**
 * Grows a comment textarea's height to fit its content as the user types.
 * Resetting to "auto" first lets it shrink back down too (e.g. after deleting
 * a line), not just grow.
 */
export const autogrowTextarea = (ta: HTMLTextAreaElement): void => {
	ta.setCssStyles({ height: "auto" });
	ta.setCssStyles({ height: `${ta.scrollHeight}px` });
};
