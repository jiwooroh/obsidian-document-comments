import { HIGHLIGHT_COLORS } from "./highlight-colors";
import { setIconSafe } from "./text-format";
import { applyInlineColor, applyInlineWrap, InlineColorKind } from "./textarea-format";

type WrapGlyph = { text: string; cls: string };

const TEXTAREA_SELECTOR = "textarea.dc-field__input";

/**
 * A stripped-down version of the Notion Selection Toolbar plugin's floating
 * toolbar, scoped to comment composer/editor textareas: select text while
 * writing or editing a comment and a small toolbar (bold / italic / underline
 * / strikethrough / text color / highlight) appears above it. One instance
 * owned by the plugin for its whole lifetime (see main.ts), matching how that
 * sibling plugin's SelectionToolbar is a single long-lived instance too.
 *
 * Simplification vs. the sibling plugin: positioned relative to the
 * textarea's own bounding box, not the exact selected substring — a plain
 * <textarea> exposes no per-character geometry without a mirror-div
 * measurement hack, and for a small comment box the difference is minor.
 *
 * The whole toolbar is deliberately icon-free — plain styled text glyphs
 * (B/I/U/S, "A" for color, "A" with a bar for highlight, like Notion's own
 * format menu) instead of SVG icons, so there's no icon-name lookup that can
 * silently render empty.
 */
export class TextFormatToolbar {
	private rootEl: HTMLElement;
	private panelEl: HTMLElement | null = null;
	private activeTextarea: HTMLTextAreaElement | null = null;
	private debounceTimer = 0;

	constructor(private doc: Document = document) {
		this.rootEl = this.doc.body.createDiv({ cls: "dc-text-toolbar" });
		this.rootEl.addEventListener("mousedown", (e) => e.preventDefault());

		this.makeWrapButton({ text: "B", cls: "dc-text-toolbar__bold" }, "Bold", "**", "**");
		this.makeWrapButton({ text: "I", cls: "dc-text-toolbar__italic" }, "Italic", "*", "*");
		this.makeWrapButton({ text: "U", cls: "dc-text-toolbar__underline" }, "Underline", "<u>", "</u>");
		this.makeWrapButton({ text: "S", cls: "dc-text-toolbar__strike" }, "Strikethrough", "~~", "~~");

		this.rootEl.createDiv({ cls: "dc-text-toolbar__sep" });

		const textBtn = this.rootEl.createEl("button", {
			cls: "dc-text-toolbar__btn dc-text-toolbar__a",
			attr: { type: "button", "aria-label": "Text color", title: "Text color" },
		});
		textBtn.setText("A");
		textBtn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.openPanel("text", textBtn);
		});

		const highlightBtn = this.rootEl.createEl("button", {
			cls: "dc-text-toolbar__btn dc-text-toolbar__a dc-text-toolbar__highlight",
			attr: { type: "button", "aria-label": "Highlight color", title: "Highlight color" },
		});
		highlightBtn.setText("A");
		highlightBtn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.openPanel("highlight", highlightBtn);
		});

		this.doc.addEventListener("selectionchange", this.scheduleEvaluate);
		this.doc.defaultView?.addEventListener("resize", this.hide);
	}

	destroy(): void {
		this.doc.removeEventListener("selectionchange", this.scheduleEvaluate);
		this.doc.defaultView?.removeEventListener("resize", this.hide);
		window.clearTimeout(this.debounceTimer);
		this.closePanel();
		this.rootEl.remove();
	}

	private makeWrapButton(glyph: WrapGlyph, label: string, prefix: string, suffix: string): void {
		const btn = this.rootEl.createEl("button", {
			cls: `dc-text-toolbar__btn ${glyph.cls}`,
			attr: { type: "button", "aria-label": label, title: label },
		});
		btn.setText(glyph.text);
		btn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (this.activeTextarea) applyInlineWrap(this.activeTextarea, prefix, suffix);
		});
	}

	private scheduleEvaluate = (): void => {
		window.clearTimeout(this.debounceTimer);
		this.debounceTimer = window.setTimeout(() => this.evaluate(), 120);
	};

	private evaluate(): void {
		const active = this.doc.activeElement;
		if (
			!(active instanceof HTMLTextAreaElement) ||
			!active.isConnected ||
			!active.matches(TEXTAREA_SELECTOR) ||
			active.selectionStart === active.selectionEnd
		) {
			this.hide();
			return;
		}
		this.activeTextarea = active;
		this.position(active);
	}

	private position(ta: HTMLTextAreaElement): void {
		const rect = ta.getBoundingClientRect();
		this.rootEl.classList.add("is-measuring", "is-visible");
		const toolbarRect = this.rootEl.getBoundingClientRect();

		let top = rect.top - toolbarRect.height - 6;
		if (top < 4) top = Math.min(rect.top + 4, window.innerHeight - toolbarRect.height - 4);
		let left = rect.left + rect.width / 2 - toolbarRect.width / 2;
		left = Math.max(4, Math.min(left, window.innerWidth - toolbarRect.width - 4));

		this.rootEl.setCssStyles({ left: `${left}px`, top: `${top}px` });
		this.rootEl.classList.remove("is-measuring");
	}

	private hide = (): void => {
		this.rootEl.classList.remove("is-visible", "is-measuring");
		this.closePanel();
		this.activeTextarea = null;
	};

	private openPanel(kind: InlineColorKind, anchor: HTMLElement): void {
		this.closePanel();
		const panel = this.doc.body.createDiv({ cls: "dc-pop dc-pop--colors" });
		this.panelEl = panel;
		panel.addEventListener("mousedown", (e) => e.preventDefault());

		const defaultBtn = panel.createEl("button", {
			cls: "dc-color-swatch dc-color-swatch--default",
			attr: { type: "button", "aria-label": "Default", title: "Default (no color)" },
		});
		setIconSafe(defaultBtn, "slash", "–");
		defaultBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.pick(kind, undefined);
		});

		for (const c of HIGHLIGHT_COLORS) {
			if (c.id === "theme") continue; // no per-swatch "theme" concept for inline text color
			const swatch = panel.createEl("button", {
				cls: "dc-color-swatch",
				attr: { type: "button", "aria-label": c.label, title: c.label },
			});
			if (kind === "highlight") {
				swatch.style.backgroundColor = `var(--dc-hl-${c.id})`;
			} else {
				swatch.addClass("dc-color-swatch--text");
				swatch.setText("A");
				swatch.style.color = `var(--dc-hl-${c.id}-border)`;
			}
			swatch.addEventListener("click", (e) => {
				e.stopPropagation();
				this.pick(kind, c.id);
			});
		}

		const rect = anchor.getBoundingClientRect();
		const left = Math.max(8, rect.right - panel.offsetWidth);
		panel.setCssStyles({ top: `${rect.bottom + 4}px`, left: `${left}px` });

		const close = (ev: MouseEvent): void => {
			const target = ev.target as Node;
			if (panel.contains(target) || this.rootEl.contains(target)) return;
			panel.remove();
			if (this.panelEl === panel) this.panelEl = null;
			this.doc.removeEventListener("mousedown", close, true);
		};
		window.setTimeout(() => this.doc.addEventListener("mousedown", close, true), 0);
	}

	private pick(kind: InlineColorKind, colorId: string | undefined): void {
		if (this.activeTextarea) applyInlineColor(this.activeTextarea, kind, colorId);
		this.closePanel();
	}

	private closePanel(): void {
		this.panelEl?.remove();
		this.panelEl = null;
	}
}
