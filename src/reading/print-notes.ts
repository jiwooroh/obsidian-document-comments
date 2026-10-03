import { App, Component, MarkdownPostProcessorContext, MarkdownRenderer } from "obsidian";
import { ParsedComment, TextRange } from "../format/types";
import { anchorRange, parseComments } from "../format/parse";
import { isCodeComment, resolveCodeAnchor } from "../format/code-anchor";
import { wrapFirstMatch } from "./highlight";
import { layoutMarginNotes } from "./print-layout";

export type PrintNotesDeps = {
	app: App;
	/** Owns the child components MarkdownRenderer attaches to rendered comment text. */
	component: Component;
	/** "Show comments in PDF export". */
	printComments: () => boolean;
	showResolved: () => boolean;
	/** Light-theme custom color overrides — export always prints in the light theme. */
	lightColors: () => Record<string, string>;
};

/**
 * Obsidian's "Export to PDF" renders the whole note into `div.print >
 * div.markdown-preview-view` in a hidden popup window, and runs post-processors
 * once over that container with `getSectionInfo()` returning null — so the
 * section-based highlightPostProcessor can't place anything there.
 */
const isPdfExport = (el: HTMLElement): boolean => el.parentElement?.classList.contains("print") ?? false;

/** The source range a comment's anchor covers, for code and prose comments alike. */
const commentRange = (text: string, c: ParsedComment): TextRange | null =>
	isCodeComment(c) ? resolveCodeAnchor(text, c) : anchorRange(c);

/**
 * PDF-export post-processor: highlights each comment's text, puts a footnote
 * number after it, and floats the comment thread into a right margin column
 * beside it (Word-style).
 * Returns a promise — export awaits post-processor promises before printing.
 */
export const printNotesPostProcessor = async (
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext,
	deps: PrintNotesDeps,
): Promise<void> => {
	if (!isPdfExport(el) || !deps.printComments()) return;
	const file = deps.app.vault.getFileByPath(ctx.sourcePath);
	if (!file) return;
	const text = await deps.app.vault.cachedRead(file);
	useLightCustomColors(el, deps.lightColors());

	// Number comments in document order. An empty comment (a bare highlight) has
	// nothing to print, so it gets a highlight but no number.
	const ordered = parseComments(text)
		.map((c) => ({ c, range: commentRange(text, c) }))
		.filter((x): x is { c: ParsedComment; range: TextRange } => x.range !== null)
		.filter(({ c }) => deps.showResolved() || c.status !== "resolved")
		.sort((a, b) => a.range.from - b.range.from);

	const renders: Promise<void>[] = [];
	let unplaced: HTMLElement | null = null;
	let n = 0;
	for (const { c, range } of ordered) {
		const resolved = c.status === "resolved";
		const anchored = text.slice(range.from, range.to);
		// A code comment's lines each sit in their own text node; prose is one match.
		const needles = isCodeComment(c) ? anchored.split("\n").filter((l) => l.trim()) : [anchored];
		for (const needle of needles) wrapFirstMatch(el, needle, c.id, resolved, null, c.color, c.style);
		if (c.thread.length === 0) continue;

		n++;
		const resolvedCls = resolved ? " is-resolved" : "";
		const spans = el.querySelectorAll<HTMLElement>(`.doc-comment-span[data-cid="${CSS.escape(c.id)}"]`);
		const last = spans[spans.length - 1];
		if (last) last.insertAdjacentElement("afterend", createRef(el, n, resolvedCls));

		// The note floats into the right margin, starting on the highlight's line.
		// If the text couldn't be found (e.g. it spans formatting), list the thread
		// at the end with its quote so the export doesn't silently drop it.
		let note: HTMLElement;
		if (last) {
			const colorCls = c.color ? ` dc-color-${c.color}` : "";
			note = el.createDiv({ cls: `dc-print-note dc-print-note--margin${colorCls}${resolvedCls}` });
			note.dataset.cid = c.id;
			marginAnchor(last).insertAdjacentElement("beforebegin", note);
		} else {
			unplaced ??= el.createDiv({ cls: "dc-print-notes" });
			note = unplaced.createDiv({ cls: `dc-print-note${resolvedCls}` });
		}
		note.createSpan({ cls: "dc-print-note__num", text: `${n}` });
		const body = note.createDiv({ cls: "dc-print-note__body" });
		if (c.quote && !last) body.createDiv({ cls: "dc-print-note__quote", text: `“${c.quote}”` });
		for (const entry of c.thread) {
			const textEl = body.createDiv({ cls: "dc-print-note__text" });
			renders.push(MarkdownRenderer.render(deps.app, entry.text, textEl, ctx.sourcePath, deps.component));
		}
	}
	// Reserve the margin column only when something floats into it.
	if (el.querySelector(".dc-print-note--margin")) el.classList.add("dc-print-has-notes");
	await Promise.all(renders);

	// Chromium switches to print media at the real page width right before
	// printing; place the notes precisely then (see print-layout.ts).
	const win = el.ownerDocument.defaultView;
	win?.matchMedia("print").addEventListener("change", (e) => {
		if (e.matches) layoutMarginNotes(el);
	});
};

/**
 * Export copies the main window's stylesheets, body classes, and inline
 * variables into its popup (so highlight color, intensity, and underline style
 * carry over), but then forces the light theme. Custom colors are picked per
 * theme, so swap in the light-theme ones in case the app is in dark mode.
 */
const useLightCustomColors = (el: HTMLElement, lightColors: Record<string, string>): void => {
	const body = el.ownerDocument.body;
	const stale = Array.from({ length: body.style.length }, (_, i) => body.style.item(i));
	for (const prop of stale) if (prop.startsWith("--dc-hl-")) body.style.removeProperty(prop);
	for (const [id, hex] of Object.entries(lightColors)) body.style.setProperty(`--dc-hl-${id}`, hex);
};

/**
 * Where to insert a highlight's margin note. A float placed right before the
 * highlight lines up with its line — except inside a code block or table,
 * which clip floats (their own scroll/cell box), and callouts likewise —
 * so go before those instead.
 */
const marginAnchor = (span: HTMLElement): HTMLElement => span.closest<HTMLElement>("pre, table, .callout") ?? span;

const createRef = (el: HTMLElement, n: number, extraCls: string): HTMLElement => {
	const ref = el.createEl("sup", { cls: `dc-print-ref${extraCls}`, text: `${n}` });
	ref.detach();
	return ref;
};
