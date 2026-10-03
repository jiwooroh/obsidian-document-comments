// @vitest-environment happy-dom
//
// PDF export renders the whole note into `div.print > div` and runs
// post-processors once on it with no section info. The print post-processor
// highlights each comment there, numbers it, and lists its thread under its block. Comment text goes through MarkdownRenderer (a no-op
// in the mock), so these check structure, authors, numbering, and the settings.
import { describe, expect, test } from "vitest";
import { App, Component, type MarkdownPostProcessorContext } from "obsidian";
import { printNotesPostProcessor, type PrintNotesDeps } from "../src/reading/print-notes";

type ElOpts = { cls?: string; text?: string; attr?: Record<string, string> };
const make = (parent: Node, tag: string, o?: string | ElOpts): HTMLElement => {
	const el = document.createElement(tag);
	if (typeof o === "string") el.className = o;
	else if (o) {
		if (o.cls) el.className = o.cls;
		if (o.text) el.textContent = o.text;
		for (const [key, value] of Object.entries(o.attr ?? {})) el.setAttribute(key, value);
	}
	parent.appendChild(el);
	return el;
};
Node.prototype.createSpan ??= function (o?: string | ElOpts) {
	return make(this, "span", o) as HTMLSpanElement;
};
Node.prototype.createDiv ??= function (o?: string | ElOpts) {
	return make(this, "div", o) as HTMLDivElement;
};
Node.prototype.createEl ??= function (tag: string, o?: string | ElOpts) {
	return make(this, tag, o);
} as typeof Node.prototype.createEl;
Node.prototype.detach ??= function () {
	this.parentNode?.removeChild(this);
};

// Like export: no section info, and the note's file read through the vault.
const ctx = { getSectionInfo: () => null, sourcePath: "note.md" } as unknown as MarkdownPostProcessorContext;

const DOC = [
	"First <!--c:a1-->alpha<!--/c:a1--> line.",
	'<!--co:a1 by:lucy at:2026-01-01T00:00:00.000Z status:open quote:"alpha"',
	"lucy (2026-01-01T00:00:00.000Z): note on alpha",
	"sam (2026-01-01T00:01:00.000Z): reply",
	"-->",
	"",
	"Second <!--c:b2-->beta<!--/c:b2--> and <!--c:c3-->gamma<!--/c:c3-->.",
	'<!--co:b2 by:lucy at:2026-01-01T00:00:00.000Z status:resolved quote:"beta"',
	"lucy (2026-01-01T00:00:00.000Z): done",
	"-->",
	'<!--co:c3 by:lucy at:2026-01-01T00:00:00.000Z status:open quote:"gamma"',
	"lucy (2026-01-01T00:00:00.000Z): on gamma",
	"-->",
	"",
].join("\n");

const deps = (over: Partial<PrintNotesDeps> = {}): PrintNotesDeps => ({
	app: { vault: { getFileByPath: () => ({}), cachedRead: async () => DOC } } as unknown as App,
	component: new Component(),
	printComments: () => true,
	showResolved: () => false,
	lightColors: () => ({}),
	...over,
});

/** Build the export DOM: `div.print > div` with one wrapper div per block. */
const exportRoot = (): { root: HTMLElement; first: HTMLElement; second: HTMLElement } => {
	const print = document.createElement("div");
	print.className = "print";
	const root = make(print, "div", "markdown-preview-view");
	const first = make(root, "div");
	make(first, "p", { text: "First alpha line." });
	const second = make(root, "div");
	make(second, "p", { text: "Second beta and gamma." });
	return { root, first, second };
};

const ref = (root: HTMLElement, id: string): string | null =>
	root.querySelector(`.doc-comment-span[data-cid='${id}'] + .dc-print-ref`)?.textContent ?? null;

describe("PDF export notes", () => {
	test("highlights, numbers, and floats each thread beside its highlight", async () => {
		const { root, first, second } = exportRoot();
		await printNotesPostProcessor(root, ctx, deps());
		expect(ref(root, "a1")).toBe("1");
		expect(ref(root, "c3")).toBe("2");
		// One text row per thread entry (original + reply), no author names.
		expect(first.querySelectorAll(".dc-print-note__text")).toHaveLength(2);
		expect(first.querySelector(".dc-print-note__author")).toBeNull();
		// Floated beside the highlight, inside its paragraph.
		expect(first.querySelector("p > .dc-print-note--margin + .doc-comment-span[data-cid='a1']")).not.toBeNull();
		expect(root.classList.contains("dc-print-has-notes")).toBe(true);
		expect(second.querySelectorAll(".dc-print-note")).toHaveLength(1);
	});

	test("leaves resolved comments out by default", async () => {
		const { root } = exportRoot();
		await printNotesPostProcessor(root, ctx, deps());
		expect(root.querySelector(".doc-comment-span[data-cid='b2']")).toBeNull();
	});

	test("includes resolved comments when Show resolved comments is on", async () => {
		const { root } = exportRoot();
		await printNotesPostProcessor(root, ctx, deps({ showResolved: () => true }));
		expect(ref(root, "b2")).toBe("2");
		expect(ref(root, "c3")).toBe("3");
		expect(root.querySelectorAll(".dc-print-note.is-resolved")).toHaveLength(1);
	});

	test("adds nothing when the setting is off", async () => {
		const { root } = exportRoot();
		await printNotesPostProcessor(root, ctx, deps({ printComments: () => false }));
		expect(root.querySelector(".doc-comment-span, .dc-print-ref, .dc-print-notes")).toBeNull();
	});

	test("adds nothing outside PDF export", async () => {
		const el = document.createElement("div");
		make(el, "p", { text: "First alpha line." });
		await printNotesPostProcessor(el, ctx, deps());
		expect(el.querySelector(".dc-print-ref, .dc-print-notes")).toBeNull();
	});
});
