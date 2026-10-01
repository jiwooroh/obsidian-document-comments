export type InlineColorKind = "text" | "highlight";

export type InlineColorEdit = {
	text: string;
	selectionStart: number;
	selectionEnd: number;
};

// Matches the markup this module itself writes, so re-picking a color (or
// clearing it) on an already-colored selection unwraps first instead of nesting.
const SPAN_RE = /^<span class="dc-fg-([a-z]+)">([\s\S]*)<\/span>$/;
const MARK_RE = /^<mark class="dc-mark-([a-z]+)">([\s\S]*)<\/mark>$/;

/**
 * Pure string transform for coloring/highlighting the selected text of a
 * comment's textarea. No DOM here — see applyInlineColor() for the
 * textarea-facing wrapper. Mirrors applyColor() in the Notion Selection
 * Toolbar plugin's textCommands.ts, adapted from an Obsidian Editor to plain
 * string offsets since a comment composer is a bare <textarea>.
 *
 * `colorId: undefined` clears any existing color/highlight on the selection.
 * Returns null when nothing is selected (start === end) — nothing to color.
 */
export const computeInlineColorEdit = (
	text: string,
	start: number,
	end: number,
	kind: InlineColorKind,
	colorId: string | undefined,
): InlineColorEdit | null => {
	if (start === end) return null;
	const before = text.slice(0, start);
	const selected = text.slice(start, end);
	const after = text.slice(end);

	let inner = selected;
	const spanMatch = SPAN_RE.exec(selected);
	const markMatch = MARK_RE.exec(selected);
	if (spanMatch?.[2] !== undefined) inner = spanMatch[2];
	else if (markMatch?.[2] !== undefined) inner = markMatch[2];

	const replacement =
		colorId === undefined
			? inner
			: kind === "text"
				? `<span class="dc-fg-${colorId}">${inner}</span>`
				: `<mark class="dc-mark-${colorId}">${inner}</mark>`;

	return {
		text: before + replacement + after,
		selectionStart: start,
		selectionEnd: start + replacement.length,
	};
};

/**
 * Applies computeInlineColorEdit() to a live textarea. Setting `.value`
 * programmatically fires no native "input" event, but card.ts/draft-composer.ts
 * track their draft state off exactly that event (autogrow, the in-memory
 * draft string) — so this dispatches one manually rather than leaving those
 * listeners out of sync with the textarea's new content.
 */
export const applyInlineColor = (ta: HTMLTextAreaElement, kind: InlineColorKind, colorId: string | undefined): void => {
	const result = computeInlineColorEdit(ta.value, ta.selectionStart, ta.selectionEnd, kind, colorId);
	if (!result) return;
	ta.value = result.text;
	ta.setSelectionRange(result.selectionStart, result.selectionEnd);
	ta.dispatchEvent(new Event("input", { bubbles: true }));
	ta.focus();
};

/**
 * Toggle-wraps the selection with prefix/suffix (bold **, italic *, strike
 * ~~, underline <u></u>), undoing the wrap if the selection already has it.
 * Simpler than the Notion Selection Toolbar's editor-facing toggleInlineWrap:
 * that one special-cases wrapping an existing color <span>/<mark> because
 * Obsidian's Live Preview can fail to render emphasis marks wrapped AROUND a
 * raw HTML tag. Comments render through MarkdownRenderer.render() — the same
 * full markdown-it engine as Reading View — which doesn't have that
 * limitation, so a plain wrap/unwrap is sufficient here.
 */
export const computeInlineWrapEdit = (
	text: string,
	start: number,
	end: number,
	prefix: string,
	suffix: string = prefix,
): InlineColorEdit | null => {
	if (start === end) return null;
	const before = text.slice(0, start);
	const selected = text.slice(start, end);
	const after = text.slice(end);

	const result =
		selected.length >= prefix.length + suffix.length && selected.startsWith(prefix) && selected.endsWith(suffix)
			? selected.slice(prefix.length, selected.length - suffix.length)
			: prefix + selected + suffix;

	return {
		text: before + result + after,
		selectionStart: start,
		selectionEnd: start + result.length,
	};
};

/** Applies computeInlineWrapEdit() to a live textarea — see applyInlineColor()
 *  for why the "input" event must be dispatched manually. */
export const applyInlineWrap = (ta: HTMLTextAreaElement, prefix: string, suffix: string = prefix): void => {
	const result = computeInlineWrapEdit(ta.value, ta.selectionStart, ta.selectionEnd, prefix, suffix);
	if (!result) return;
	ta.value = result.text;
	ta.setSelectionRange(result.selectionStart, result.selectionEnd);
	ta.dispatchEvent(new Event("input", { bubbles: true }));
	ta.focus();
};
