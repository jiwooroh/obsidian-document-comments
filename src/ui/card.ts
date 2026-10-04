import { App, Component, MarkdownRenderer } from "obsidian";
import type { Result } from "better-result";
import { ParsedComment } from "../format/types";
import { CardEntry, cardEntries, cardSignature, formatRelativeTime } from "./card-format";
import { autogrowTextarea, setIconSafe } from "./text-format";
import { ANNOTATION_STYLES, HIGHLIGHT_COLORS } from "./highlight-colors";

const QUICK_EMOJI = ["👍", "❤️", "😄", "🎉", "😮", "👀", "🙏"];

// A margin card whose thread is taller than this can fold to a "more" preview
// (Notion-style) — when the user folds it, or when it would crowd the next card
// (see setCrowded); with room to spare it shows in full. Sized to roughly the entry header (~26px) plus 6 lines of comment
// text (--font-ui-small at line-height 1.25 ≈ 16.25px/line ≈ 98px), plus a small
// buffer. Keep in sync with the .dc-card-clip max-height in styles.css.
const CLAMP_HEIGHT = 125;

/** Clicking within this many px of a clamped card's bottom edge expands it
 *  ("more"), same as clicking the "more" label itself but with a much
 *  easier-to-hit target — roughly the height of the faded-out zone. */
const EXPAND_HIT_ZONE = 40;

export type CardCallbacks = {
	getAuthor: () => string;
	onHover: (id: string, active: boolean) => void;
	onClickAnchor: (id: string) => void;
	/** The card changed height (open/close, edit, react, expand) — re-run stacking. */
	onResize: () => void;
	/** Like onResize, but for an animated height change: track the grow/shrink for a
	 *  few frames so neighbors follow it smoothly. Falls back to onResize when absent. */
	animateLayout?: () => void;
	reply: (id: string, text: string) => Result<void, string> | Promise<Result<void, string>>;
	setResolved: (id: string, resolved: boolean) => void;
	/** Set (colorId) or clear (undefined) this comment's highlight color override. */
	setColor: (id: string, colorId: string | undefined) => void;
	/** Set (styleId) or clear (undefined) this comment's annotation-style override
	 *  ("highlight", "underline", or "both" — see ui/highlight-colors.ts). */
	setStyle: (id: string, styleId: string | undefined) => void;
	remove: (id: string) => void;
	editEntry: (id: string, index: number, text: string) => void;
	deleteEntry: (id: string, index: number) => void;
	toggleReaction: (id: string, emoji: string) => void;
	/** Bring a just-opened reply composer fully into view (the margin scrolls the
	 *  editor minimally; the sidebar scrolls its own list). */
	revealComposer?: (id: string) => void;
	/** Reveal this thread in the comments sidebar — the escape for a card too tall to
	 *  fit the margin even when expanded. Absent for cards already in the sidebar. */
	openInSidebar?: (id: string) => void;
};

/** Per-view context a card needs to render comment text as Markdown. */
export type CardView = {
	/** App handle for MarkdownRenderer; absent in unit tests → plain-text fallback. */
	app?: App;
	/** Source note path, for resolving links/embeds in rendered comment text. */
	sourcePath: () => string;
	/** Collapse a tall card to a "Show more" preview. Margin only — the sidebar
	 *  scrolls its list, so sidebar cards stay full height. */
	collapsible?: boolean;
};

/** A single margin comment card with the full Notion-style interaction set. */
export class Card {
	readonly el: HTMLElement;
	private comment: ParsedComment;
	private open = false;
	/** The user's explicit fold choice for a long thread: "auto" folds only when
	 *  the card is crowded (or too tall for the column); "folded" / "unfolded"
	 *  are set by the "less" / "more" links and stick until clicked again.
	 *  Independent of `open` — unfolding to read must NOT open the composer. */
	private fold: "auto" | "folded" | "unfolded" = "auto";
	/** Set by the margin layout: showing this thread in full would run into a
	 *  neighboring card, so "auto" folds it. */
	private crowded = false;
	/** Whether onDocMouseDown is currently registered — active while the reply
	 *  composer is open, torn down when it closes. */
	private outsideClickBound = false;
	private editingIndex = -1;
	private addingFirstEntry = false;
	/** In-progress text of the entry editor, so an external update mid-edit
	 *  (a synced reply, a reaction toggled elsewhere) doesn't discard it. */
	private editDraft = "";
	private draft = "";
	private savingFirstEntry = false;
	private savingReply = false;
	/** Measured: the thread exceeds the clamp height / the whole column. */
	private overflows = false;
	private tooTall = false;
	private clipEl: HTMLElement | null = null;
	private threadEl: HTMLElement | null = null;
	private footEl: HTMLElement | null = null;
	/** Owns the child components MarkdownRenderer attaches (link/embed handlers). */
	private md = new Component();
	/** Re-measures overflow when the (async-rendered) content settles or changes. */
	private ro = new ResizeObserver(() => this.measure());

	constructor(
		comment: ParsedComment,
		private cb: CardCallbacks,
		private view: CardView,
	) {
		this.comment = comment;
		this.md.load();
		this.el = createDiv("doc-comment-card");
		this.el.addEventListener("mouseenter", () => this.cb.onHover(this.id, true));
		this.el.addEventListener("mouseleave", () => this.cb.onHover(this.id, false));
		this.el.addEventListener("mousedown", (e) => {
			const target = e.target as HTMLElement;
			// .dc-card-foot (not just .dc-foot-btn) — the overlay "more" footer's own
			// padding gives it a hit area taller than the visible text; a click that
			// lands on that padding rather than precisely on the span must still not
			// fall through to opening the reply composer.
			if (target.closest("button, textarea, a, .dc-card-foot, .dc-reaction, .dc-pop")) return;
			// Clicking the bottom strip of a clamped, overflowing card expands it —
			// same affordance as clicking "more" itself, just a far bigger target
			// than that small span. Excludes the too-tall case: that click still goes
			// to "open in sidebar" below, matching its own footer button.
			if (this.isClamped() && !this.tooTall && this.clipEl) {
				const clipRect = this.clipEl.getBoundingClientRect();
				if (e.clientY >= clipRect.bottom - EXPAND_HIT_ZONE) {
					this.cb.onClickAnchor(this.id);
					this.setFold("unfolded");
					return;
				}
			}
			this.cb.onClickAnchor(this.id);
			if (this.comment.thread.length === 0) {
				this.startEdit(0);
				return;
			}
			// A thread too tall for the margin opens in the sidebar instead of expanding
			// into a full-height card whose bottom you can't scroll to.
			if (this.tooTall && this.cb.openInSidebar) this.cb.openInSidebar(this.id);
			else this.setOpen(true);
		});
		this.render();
	}

	get id(): string {
		return this.comment.id;
	}

	get signature(): string {
		return cardSignature(this.comment);
	}

	update(comment: ParsedComment): void {
		this.comment = comment;
		// Keep an open entry editor across external updates; commit/cancel clear
		// editingIndex first, so a landed edit still collapses the editor. Only drop
		// it if the edited entry no longer exists (e.g. deleted elsewhere).
		const editingEmpty = this.editingIndex === 0 && comment.thread.length === 0;
		if (!editingEmpty && this.editingIndex >= comment.thread.length) {
			this.editingIndex = -1;
			this.addingFirstEntry = false;
			this.editDraft = "";
		}
		this.render();
	}

	/** Release the markdown-render component (its link/embed child handlers) and any
	 *  document-level listener when the card is dropped from the margin or sidebar. */
	destroy(): void {
		this.ro.disconnect();
		this.md.unload();
		if (this.outsideClickBound) this.el.ownerDocument.removeEventListener("mousedown", this.onDocMouseDown, true);
	}

	setActive(active: boolean): void {
		this.el.toggleClass("is-active", active);
	}

	/** Opens/closes the reply composer. Clicking outside the card closes it
	 *  (see onDocMouseDown); there's no dedicated close button. */
	private setOpen(open: boolean): void {
		if (this.open === open) return;
		const fromHeight = this.clipEl?.offsetHeight ?? 0;
		this.open = open;
		this.render();
		this.animateClip(fromHeight);
		(this.cb.animateLayout ?? this.cb.onResize)();
		this.syncOutsideClickListener();
		if (open) {
			this.cb.revealComposer?.(this.id);
			this.focusComposer();
		}
	}

	/** The Reply button: open the card if it isn't already, otherwise just
	 *  focus the composer that's already there. */
	private openReply(): void {
		if (!this.open) this.setOpen(true);
		else this.focusComposer();
	}

	/** The "more" / "less" links: the user's explicit fold choice, kept until
	 *  they click the other one. */
	private setFold(fold: "folded" | "unfolded"): void {
		if (this.fold === fold) return;
		const fromHeight = this.clipEl?.offsetHeight ?? 0;
		this.fold = fold;
		this.applyClampState();
		this.animateClip(fromHeight);
		(this.cb.animateLayout ?? this.cb.onResize)();
	}

	/** Margin layout: whether showing this thread in full would crowd a
	 *  neighboring card. Returns true when that changed the card's height, so
	 *  the caller re-measures before stacking. */
	setCrowded(crowded: boolean): boolean {
		if (this.crowded === crowded) return false;
		const before = this.isClamped();
		this.crowded = crowded;
		if (this.isClamped() === before) return false;
		this.applyClampState();
		return true;
	}

	/** Card height with the thread shown in full / folded to the clamp. */
	heights(): { full: number; folded: number } {
		const thread = this.threadEl?.offsetHeight ?? 0;
		const chrome = this.el.offsetHeight - (this.clipEl?.offsetHeight ?? 0);
		return { full: chrome + thread, folded: chrome + Math.min(thread, CLAMP_HEIGHT) };
	}

	/** Whether the thread is currently cut to the clamp height. */
	private isClamped(): boolean {
		if (!this.view.collapsible || !this.overflows || this.open) return false;
		if (this.fold === "folded") return true;
		if (this.fold === "unfolded") return false;
		return this.crowded || this.tooTall;
	}

	/** Outside click / Escape: close the reply composer. A fold choice stays. */
	private collapse(): void {
		if (!this.open) return;
		this.setOpen(false);
	}

	/** Registers/unregisters onDocMouseDown to track whether the reply composer
	 *  is open — avoids double-adding or leaking the listener across the call
	 *  sites that can change it. */
	private syncOutsideClickListener(): void {
		const shouldListen = this.open;
		if (shouldListen && !this.outsideClickBound) {
			this.el.ownerDocument.addEventListener("mousedown", this.onDocMouseDown, true);
			this.outsideClickBound = true;
		} else if (!shouldListen && this.outsideClickBound) {
			this.el.ownerDocument.removeEventListener("mousedown", this.onDocMouseDown, true);
			this.outsideClickBound = false;
		}
	}

	private onDocMouseDown = (e: MouseEvent): void => {
		if (!this.el.contains(e.target as Node)) this.collapse();
	};

	/** Quick, smooth grow/shrink of the body on open/close: animate the clip from its
	 *  previous height to the new target, then drop the inline overrides so it's free
	 *  to resize naturally again. */
	private animateClip(fromHeight: number): void {
		const clip = this.clipEl;
		if (!clip || !this.view.collapsible) return;
		const toHeight = this.isClamped() ? CLAMP_HEIGHT : clip.scrollHeight;
		if (Math.abs(fromHeight - toHeight) < 2) return;
		clip.setCssStyles({ overflow: "hidden", transition: "none", maxHeight: `${fromHeight}px` });
		void clip.offsetHeight; // reflow so the start height is committed before transitioning
		clip.setCssStyles({ transition: "max-height 150ms ease", maxHeight: `${toHeight}px` });
		const cleanup = (): void => {
			clip.setCssStyles({ maxHeight: "", overflow: "", transition: "" });
			clip.removeEventListener("transitionend", cleanup);
			window.clearTimeout(timer);
		};
		const timer = window.setTimeout(cleanup, 260); // fallback if transitionend never fires
		clip.addEventListener("transitionend", cleanup);
	}

	private render(): void {
		const c = this.comment;
		this.el.empty();
		this.el.toggleClass("is-resolved", c.status === "resolved");
		this.el.toggleClass("is-open", this.open);

		// A margin card floats right next to its highlighted text, so the anchor
		// is always visible right there. A sidebar card has no such link (cb has
		// no openInSidebar — that's exactly the signal a card IS already hosted
		// in the sidebar) — show the originally-selected text so the comment
		// still makes sense out of context, the way Notion's "All comments"
		// panel always quotes the anchor.
		if (!this.cb.openInSidebar && c.quote) {
			this.el.createDiv({ cls: "dc-card-quote", text: c.quote });
		}

		// The thread lives in a clip wrapper that gets a max-height when a tall card is
		// collapsed; the footer (Show more / Open in sidebar) sits outside the clip.
		const clip = this.el.createDiv("dc-card-clip");
		this.clipEl = clip;
		const thread = clip.createDiv("dc-thread");
		this.threadEl = thread;
		cardEntries(c).forEach((entry, i) => this.renderEntry(thread, entry, i));
		if (this.open && this.editingIndex < 0) this.renderComposer(clip);

		this.footEl = this.el.createDiv("dc-card-foot");
		this.applyClampState();

		// Re-measure once the (async Markdown) content settles, and on later changes.
		// The card may not be in the DOM yet during construction; the observer fires
		// when it attaches and is sized.
		if (this.view.collapsible) {
			this.ro.disconnect();
			this.ro.observe(thread);
		}
	}

	/** Recompute whether the thread overflows the clamp / the whole column, and
	 *  reflect it. Cheap; driven by the ResizeObserver as content settles or changes. */
	private measure(): void {
		if (!this.threadEl || !this.view.collapsible) return;
		const content = this.threadEl.offsetHeight;
		const overflows = content > CLAMP_HEIGHT;
		const viewport = this.el.parentElement?.clientHeight ?? 0;
		const tooTall = viewport > 0 && content > viewport - 24;
		if (overflows === this.overflows && tooTall === this.tooTall) return;
		this.overflows = overflows;
		this.tooTall = tooTall;
		this.applyClampState();
		this.cb.onResize(); // clamping changes the card height → restack
	}

	/** Apply the fold state to the DOM: clamp the body when it should fold, and
	 *  render the footer — "more" on a folded thread, "less" on a long one shown
	 *  in full, or "Open in sidebar" when it's too tall for the column. */
	private applyClampState(): void {
		const clamped = this.isClamped();
		this.clipEl?.toggleClass("dc-clamped", clamped);
		const foot = this.footEl;
		if (!foot) return;
		foot.empty();
		if (this.view.collapsible && this.overflows && !this.open) {
			if (this.tooTall && this.cb.openInSidebar) {
				// Too tall to read in the margin at all (unfolding gives an unreachable
				// full-height card), so the affordance is "open in sidebar" directly.
				this.footButton(foot, "Open in sidebar →", "", () => this.cb.openInSidebar?.(this.id));
			} else if (clamped) {
				// "more" only unfolds the text — it must NOT also open the reply composer.
				this.footButton(foot, "more", "", () => this.setFold("unfolded"));
			} else {
				this.footButton(foot, "less", "", () => this.setFold("folded"));
			}
		}
		// "more" sits inline at the bottom-right corner, over the faded-out end of
		// the clamped text (Notion-style) rather than as a standalone row below it;
		// "less" and "Open in sidebar" are a normal footer row.
		foot.toggleClass("dc-foot-overlay", clamped);
		foot.toggleClass("dc-foot-end", !clamped && foot.textContent === "less");
		foot.toggleClass("is-empty", foot.childElementCount === 0);
	}

	/** A subtle, Notion-style text affordance. A <span> (not an Obsidian <button>) so
	 *  no theme can give it chip chrome; role+tabindex keep it keyboard-accessible. */
	private footButton(parent: HTMLElement, text: string, extraClass: string, onClick: () => void): void {
		const btn = parent.createSpan({
			cls: extraClass ? `dc-foot-btn ${extraClass}` : "dc-foot-btn",
			text,
			attr: { role: "button", tabindex: "0" },
		});
		const fire = (e: Event) => {
			e.stopPropagation();
			onClick();
		};
		btn.addEventListener("click", fire);
		btn.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				fire(e);
			}
		});
	}

	private renderEntry(parent: HTMLElement, entry: CardEntry, i: number): void {
		const row = parent.createDiv("dc-entry");
		// Your own entries get your profile photo (painted from a body-level CSS
		// variable — see ui/profile.ts) and follow the "Show my profile" switch.
		row.toggleClass("is-mine", !!entry.author && entry.author === this.cb.getAuthor());

		// Author/time on the left, action icons on the right — one row, like Notion's
		// comments panel. (Margin cards still hide the icons until hover via CSS;
		// the sidebar keeps them visible since there's room to spare.)
		const head = row.createDiv("dc-entry__head");
		const meta = head.createDiv("dc-entry__meta");
		meta.createSpan({ cls: "dc-avatar" });
		meta.createSpan({ cls: "dc-entry__author", text: entry.author || "—" });
		const time = formatRelativeTime(entry.timestamp ?? (i === 0 ? this.comment.createdAt : undefined));
		if (time) meta.createSpan({ cls: "dc-entry__time", text: time });

		const bar = head.createDiv("dc-entry__bar");
		this.iconButton(
			bar,
			"smile-plus",
			"React",
			(e) => this.openReactionPicker(e.currentTarget as HTMLElement),
			"",
			"☺",
		);
		if (i === 0) {
			const resolved = this.comment.status === "resolved";
			this.iconButton(
				bar,
				resolved ? "rotate-ccw" : "check",
				resolved ? "Reopen" : "Resolve",
				() => this.cb.setResolved(this.id, !resolved),
				"",
				resolved ? "↺" : "✓",
			);
			this.iconButton(bar, "reply", "Reply", () => this.openReply(), "", "↩");
		}
		this.iconButton(
			bar,
			"more-horizontal",
			"More",
			(e) => this.openMoreMenu(e.currentTarget as HTMLElement, i),
			"",
			"⋯",
		);
		if (this.editingIndex === i) {
			this.renderEditor(row, i);
		} else if (entry.empty) {
			const placeholder = row.createSpan({
				cls: "dc-entry__text dc-entry__text--empty",
				text: entry.text,
				attr: { "aria-label": "Edit empty comment", role: "button", tabindex: "0" },
			});
			const edit = (event: Event) => {
				event.stopPropagation();
				this.startEdit(i);
			};
			placeholder.addEventListener("click", edit);
			placeholder.addEventListener("keydown", (event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					edit(event);
				}
			});
		} else {
			// No more-menu, so clicking your own comment text is the edit affordance
			// (Notion-style) — but not a click on a link inside it, which should navigate.
			const textEl = row.createDiv({
				cls: "dc-entry__text",
				attr: { "aria-label": "Edit comment", role: "button", tabindex: "0" },
			});
			this.renderText(textEl, entry.text);
			const edit = (event: Event) => {
				if (event.target instanceof HTMLElement && event.target.closest("a")) return;
				event.stopPropagation();
				this.startEdit(i);
			};
			textEl.addEventListener("click", edit);
			textEl.addEventListener("keydown", (event) => {
				if (event.key === "Enter" || event.key === " ") {
					if (event.target instanceof HTMLElement && event.target.closest("a")) return;
					event.preventDefault();
					edit(event);
				}
			});
		}

		if (i === 0 && this.comment.reactions.length > 0) this.renderReactions(row);
	}

	/** Render comment text as Markdown (code spans, links, lists, …). Falls back to
	 *  plain text when no App is available (unit tests). */
	private renderText(el: HTMLElement, text: string): void {
		if (this.view.app) {
			void MarkdownRenderer.render(this.view.app, text, el, this.view.sourcePath(), this.md);
		} else {
			el.setText(text);
		}
	}

	private renderReactions(parent: HTMLElement): void {
		const me = this.cb.getAuthor();
		const wrap = parent.createDiv("dc-entry__reactions");
		for (const r of this.comment.reactions) {
			const chip = wrap.createEl("button", { cls: "dc-reaction" });
			chip.toggleClass("is-mine", r.authors.includes(me));
			chip.createSpan({ cls: "dc-reaction__emoji", text: r.emoji });
			chip.createSpan({ cls: "dc-reaction__count", text: String(r.authors.length) });
			chip.setAttribute("aria-label", r.authors.join(", "));
			chip.addEventListener("click", (e) => {
				e.stopPropagation();
				this.cb.toggleReaction(this.id, r.emoji);
			});
		}
	}

	private renderEditor(row: HTMLElement, index: number): void {
		const box = row.createDiv("dc-field dc-field--edit");
		const ta = box.createEl("textarea", { cls: "dc-field__input" });
		ta.value = this.editDraft;
		autogrowTextarea(ta);
		ta.addEventListener("input", () => {
			this.editDraft = ta.value;
			autogrowTextarea(ta);
		});
		ta.addEventListener("keydown", (e) => {
			if (e.key === "Escape") this.cancelEdit();
			else if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				void this.commitEdit(index, ta.value);
			}
		});
		const actions = box.createDiv("dc-field__actions");
		this.roundButton(actions, "x", "Cancel", "dc-round--cancel", () => this.cancelEdit(), "✕");
		this.roundButton(
			actions,
			"check",
			"Save",
			"dc-round--confirm",
			() => void this.commitEdit(index, ta.value),
			"✓",
		);
		this.setFieldSaving(box, this.savingFirstEntry);
		if (!this.savingFirstEntry) {
			window.setTimeout(() => {
				ta.focus();
				ta.setSelectionRange(ta.value.length, ta.value.length);
			}, 0);
		}
	}

	private roundButton(
		parent: HTMLElement,
		icon: string,
		label: string,
		variant: string,
		onClick: () => void,
		fallbackText = "•",
	): void {
		const btn = parent.createEl("button", { cls: `dc-round ${variant}`, attr: { "aria-label": label } });
		setIconSafe(btn, icon, fallbackText);
		btn.addEventListener("click", (e) => {
			e.stopPropagation();
			onClick();
		});
	}

	private renderComposer(parent: HTMLElement): void {
		const box = parent.createDiv("dc-field dc-field--composer");
		const ta = box.createEl("textarea", {
			cls: "dc-field__input",
			attr: { placeholder: this.comment.thread.length === 0 ? "Comment…" : "Reply…", rows: "1" },
		});
		ta.value = this.draft;
		autogrowTextarea(ta);
		ta.addEventListener("input", () => {
			this.draft = ta.value;
			autogrowTextarea(ta);
		});
		ta.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				void this.submitReply();
			} else if (e.key === "Escape") {
				// Keyboard equivalent of clicking outside the card.
				e.preventDefault();
				this.collapse();
			}
		});
		const actions = box.createDiv("dc-field__actions");
		this.roundButton(actions, "arrow-up", "Send", "dc-round--confirm", () => void this.submitReply(), "↑");
		this.setFieldSaving(box, this.savingReply);
	}

	private async submitReply(): Promise<void> {
		if (this.savingReply) return;
		const ta = this.el.querySelector(".dc-field--composer .dc-field__input");
		if (!(ta instanceof HTMLTextAreaElement)) return;
		const text = ta.value.trim();
		if (!text) return;
		this.draft = ta.value;
		this.savingReply = true;
		this.setFieldSaving(ta.closest(".dc-field"), true);
		const result = await this.cb.reply(this.id, text);
		this.savingReply = false;
		if (result.isErr()) {
			this.setFieldSaving(this.el.querySelector(".dc-field--composer"), false);
			this.focusComposer();
			return;
		}
		this.draft = "";
		this.render();
		this.cb.onResize();
	}

	private async commitEdit(index: number, value: string): Promise<void> {
		const text = value.trim();
		if (!text) {
			this.cancelEdit();
			return;
		}
		const addsFirstEntry = this.addingFirstEntry;
		if (addsFirstEntry) {
			if (this.savingFirstEntry) return;
			this.editDraft = value;
			this.savingFirstEntry = true;
			this.setFieldSaving(this.el.querySelector(".dc-field--edit"), true);
			const result = await this.cb.reply(this.id, text);
			this.savingFirstEntry = false;
			if (result.isErr()) {
				this.setFieldSaving(this.el.querySelector(".dc-field--edit"), false);
				this.focusEditor();
				return;
			}
			this.finishEdit();
			return;
		}
		// Collapse the editor before the write lands so the incoming external
		// update() doesn't reopen it (and doesn't clobber a concurrent edit elsewhere).
		this.finishEdit();
		this.cb.editEntry(this.id, index, text);
	}

	private finishEdit(): void {
		this.editingIndex = -1;
		this.addingFirstEntry = false;
		this.editDraft = "";
		this.render();
		this.cb.onResize();
	}

	private cancelEdit(): void {
		this.editingIndex = -1;
		this.addingFirstEntry = false;
		this.editDraft = "";
		this.render();
		this.cb.onResize();
	}

	private startEdit(index: number): void {
		this.editingIndex = index;
		this.addingFirstEntry = index === 0 && this.comment.thread.length === 0;
		this.editDraft = this.comment.thread[index]?.text ?? "";
		this.render();
		this.cb.onResize();
	}

	/** The three-dot "More" menu: change color (root entry only) and delete. */
	private openMoreMenu(anchor: HTMLElement, index: number): void {
		const doc = this.el.ownerDocument;
		doc.querySelectorAll(".dc-pop, .dc-menu").forEach((p) => p.remove());
		const menu = doc.body.createDiv("dc-menu");
		const close = (ev: MouseEvent) => {
			if (!menu.contains(ev.target as Node)) {
				menu.remove();
				doc.removeEventListener("mousedown", close, true);
			}
		};
		const teardown = () => {
			menu.remove();
			doc.removeEventListener("mousedown", close, true);
		};
		const addItem = (icon: string, label: string, onClick: () => void, danger = false): void => {
			const item = menu.createDiv({ cls: danger ? "dc-menu-item dc-menu-item--danger" : "dc-menu-item" });
			setIconSafe(item.createSpan(), icon, "•");
			item.createSpan({ text: label });
			item.addEventListener("click", (ev) => {
				ev.stopPropagation();
				teardown();
				onClick();
			});
		};
		// A reply's own color follows the thread's anchor (entry 0) — only the root
		// entry's menu offers changing it.
		if (index === 0) {
			addItem("palette", "Change color", () => this.openColorPicker(anchor));
			addItem("underline", "Change style", () => this.openStylePicker(anchor));
		}
		addItem(
			"trash",
			index === 0 ? "Delete comment" : "Delete reply",
			() => (index === 0 ? this.cb.remove(this.id) : this.cb.deleteEntry(this.id, index)),
			true,
		);

		const rect = anchor.getBoundingClientRect();
		const left = Math.max(8, rect.right - menu.offsetWidth);
		menu.setCssStyles({ top: `${rect.bottom + 4}px`, left: `${left}px` });
		window.setTimeout(() => doc.addEventListener("mousedown", close, true), 0);
	}

	/** Swatch popover for the highlight color of this comment's anchor text. */
	private openColorPicker(anchor: HTMLElement): void {
		const doc = this.el.ownerDocument;
		doc.querySelectorAll(".dc-pop, .dc-menu").forEach((p) => p.remove());
		const pop = doc.body.createDiv("dc-pop dc-pop--colors");
		const close = (ev: MouseEvent) => {
			if (!pop.contains(ev.target as Node)) {
				pop.remove();
				doc.removeEventListener("mousedown", close, true);
			}
		};
		const current = this.comment.color;
		const pick = (colorId: string | undefined) => {
			pop.remove();
			doc.removeEventListener("mousedown", close, true);
			this.cb.setColor(this.id, colorId);
		};

		const defaultBtn = pop.createEl("button", {
			cls: "dc-color-swatch dc-color-swatch--default",
			attr: { type: "button", "aria-label": "Default", title: "Default (plugin setting)" },
		});
		defaultBtn.toggleClass("is-selected", !current);
		setIconSafe(defaultBtn, "slash", "–");
		defaultBtn.addEventListener("click", (ev) => {
			ev.stopPropagation();
			pick(undefined);
		});

		for (const c of HIGHLIGHT_COLORS) {
			const btn = pop.createEl("button", {
				cls: "dc-color-swatch",
				attr: { type: "button", "aria-label": c.label, title: c.label },
			});
			btn.style.backgroundColor = `var(--dc-hl-${c.id})`;
			btn.toggleClass("is-selected", current === c.id);
			btn.addEventListener("click", (ev) => {
				ev.stopPropagation();
				pick(c.id);
			});
		}

		const rect = anchor.getBoundingClientRect();
		const left = Math.max(8, rect.right - pop.offsetWidth);
		pop.setCssStyles({ top: `${rect.bottom + 4}px`, left: `${left}px` });
		window.setTimeout(() => doc.addEventListener("mousedown", close, true), 0);
	}

	/** Dropdown for the annotation-style override of this comment's anchor: follow
	 *  the plugin-wide default, or force this one comment to a highlight,
	 *  underline, or both regardless of it. Reuses the .dc-menu shell (text options) rather
	 *  than openColorPicker()'s swatches, since these are named styles, not colors. */
	private openStylePicker(anchor: HTMLElement): void {
		const doc = this.el.ownerDocument;
		doc.querySelectorAll(".dc-pop, .dc-menu").forEach((p) => p.remove());
		const menu = doc.body.createDiv("dc-menu");
		const close = (ev: MouseEvent) => {
			if (!menu.contains(ev.target as Node)) {
				menu.remove();
				doc.removeEventListener("mousedown", close, true);
			}
		};
		const current = this.comment.style;
		const pick = (styleId: string | undefined) => {
			menu.remove();
			doc.removeEventListener("mousedown", close, true);
			this.cb.setStyle(this.id, styleId);
		};
		const addOption = (styleId: string | undefined, label: string): void => {
			const item = menu.createDiv({ cls: "dc-menu-item" });
			item.toggleClass("is-selected", current === styleId);
			item.createSpan({ text: label });
			item.addEventListener("click", (ev) => {
				ev.stopPropagation();
				pick(styleId);
			});
		};
		addOption(undefined, "Default (plugin setting)");
		for (const s of ANNOTATION_STYLES) addOption(s.id, s.label);

		const rect = anchor.getBoundingClientRect();
		const left = Math.max(8, rect.right - menu.offsetWidth);
		menu.setCssStyles({ top: `${rect.bottom + 4}px`, left: `${left}px` });
		window.setTimeout(() => doc.addEventListener("mousedown", close, true), 0);
	}

	private openReactionPicker(anchor: HTMLElement): void {
		const doc = this.el.ownerDocument;
		doc.querySelectorAll(".dc-pop, .dc-menu").forEach((p) => p.remove());
		const pop = doc.body.createDiv("dc-pop");
		// Self-removing outside-click handler. Picking an emoji tears it down too, so
		// the document listener never outlives the popover.
		const close = (ev: MouseEvent) => {
			if (!pop.contains(ev.target as Node)) {
				pop.remove();
				doc.removeEventListener("mousedown", close, true);
			}
		};
		const pick = (emoji: string) => {
			pop.remove();
			doc.removeEventListener("mousedown", close, true);
			this.cb.toggleReaction(this.id, emoji);
		};
		for (const emoji of QUICK_EMOJI) {
			const btn = pop.createEl("button", { cls: "dc-pop__emoji", text: emoji });
			btn.addEventListener("click", (ev) => {
				ev.stopPropagation();
				pick(emoji);
			});
		}
		// Right-align the popover with the button so it grows left, not off-page.
		const rect = anchor.getBoundingClientRect();
		const left = Math.max(8, rect.right - pop.offsetWidth);
		pop.setCssStyles({ top: `${rect.bottom + 4}px`, left: `${left}px` });
		window.setTimeout(() => doc.addEventListener("mousedown", close, true), 0);
	}

	private iconButton(
		parent: HTMLElement,
		icon: string,
		label: string,
		onClick: (e: MouseEvent) => void,
		extraClass = "",
		fallbackText = "•",
	): void {
		const btn = parent.createEl("button", {
			cls: extraClass ? `dc-act ${extraClass}` : "dc-act",
			attr: { "aria-label": label },
		});
		setIconSafe(btn, icon, fallbackText);
		btn.addEventListener("click", (e) => {
			e.stopPropagation();
			onClick(e);
		});
	}

	private focusComposer(): void {
		window.setTimeout(() => {
			const ta = this.el.querySelector(".dc-field--composer .dc-field__input");
			if (ta instanceof HTMLTextAreaElement) ta.focus({ preventScroll: true });
		}, 0);
	}

	private focusEditor(): void {
		window.setTimeout(() => {
			const ta = this.el.querySelector(".dc-field--edit .dc-field__input");
			if (ta instanceof HTMLTextAreaElement) ta.focus({ preventScroll: true });
		}, 0);
	}

	private setFieldSaving(field: Element | null, saving: boolean): void {
		field
			?.querySelectorAll<HTMLTextAreaElement | HTMLButtonElement>("textarea, button")
			.forEach((control) => (control.disabled = saving));
	}
}
