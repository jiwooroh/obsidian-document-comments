import { MarkdownView } from "obsidian";
import { setIconSafe } from "./text-format";
import type DocCommentsPlugin from "../main";

export class FloatingButtonManager {
	private currentButton: HTMLElement | null = null;

	constructor(private plugin: DocCommentsPlugin) {
		this.registerEvents();
	}

	private registerEvents(): void {
		const app = this.plugin.app;

		// Main window event listeners
		this.plugin.registerDomEvent(window, "mouseup", (e) => this.onSelectionChange(e, window));
		this.plugin.registerDomEvent(window, "keyup", (e) => this.onSelectionChange(e, window));
		this.plugin.registerDomEvent(window, "touchend", (e) => this.onSelectionChange(e, window));
		this.plugin.registerDomEvent(window, "mousedown", () => this.hide());
		this.plugin.registerDomEvent(window, "scroll", () => this.hide(), true);

		// Popout windows event listeners
		this.plugin.registerEvent(
			app.workspace.on("window-open", (winInfo, win) => {
				this.plugin.registerDomEvent(win, "mouseup", (e) => this.onSelectionChange(e, win));
				this.plugin.registerDomEvent(win, "keyup", (e) => this.onSelectionChange(e, win));
				this.plugin.registerDomEvent(win, "touchend", (e) => this.onSelectionChange(e, win));
				this.plugin.registerDomEvent(win, "mousedown", () => this.hide());
				this.plugin.registerDomEvent(win, "scroll", () => this.hide(), true);
			}),
		);

		// Hide button on active leaf change
		this.plugin.registerEvent(app.workspace.on("active-leaf-change", () => this.hide()));
	}

	private onSelectionChange(e: Event, win: Window): void {
		if (!this.plugin.settings.showFloatingButton) {
			this.hide();
			return;
		}

		// Wait a small delay for selection to finalize
		win.setTimeout(() => {
			const selection = win.getSelection();
			if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
				this.hide();
				return;
			}

			const selectedText = selection.toString().trim();
			if (!selectedText) {
				this.hide();
				return;
			}

			// Validate if selection anchor is within Markdown content area (editing or reading)
			const anchorNode = selection.anchorNode;
			if (!anchorNode) {
				this.hide();
				return;
			}

			const element = anchorNode.nodeType === 1 ? (anchorNode as Element) : anchorNode.parentElement;
			if (!element) {
				this.hide();
				return;
			}

			const isInsideEditor = element.closest(".cm-content") !== null;
			const isInsideReading = element.closest(".markdown-reading-view") !== null;

			if (!isInsideEditor && !isInsideReading) {
				this.hide();
				return;
			}

			// Show and position the floating button
			const range = selection.getRangeAt(0);
			const rects = range.getClientRects();
			const lastRect = (rects.length > 0 ? rects[rects.length - 1] : null) ?? range.getBoundingClientRect();

			const button = this.getOrCreateButton(win);
			this.currentButton = button;

			const buttonWidth = 28;
			const buttonHeight = 28;
			const margin = 10;

			let left = lastRect.right - buttonWidth / 2;
			let top = lastRect.bottom + 8;

			// Boundary checks
			const viewWidth = win.innerWidth;
			const viewHeight = win.innerHeight;

			if (left + buttonWidth + margin > viewWidth) {
				left = viewWidth - buttonWidth - margin;
			}
			if (left < margin) {
				left = margin;
			}

			if (top + buttonHeight + margin > viewHeight) {
				// Position above selection if it overflows the bottom viewport
				top = lastRect.top - buttonHeight - 8;
			}
			if (top < margin) {
				top = margin;
			}

			button.setCssStyles({
				left: `${left}px`,
				top: `${top}px`,
			});

			button.classList.add("is-visible");
		}, 50);
	}

	private getOrCreateButton(win: Window): HTMLElement {
		let button = win.document.getElementById("dc-floating-comment-button");
		if (!button) {
			button = win.document.body.createEl("button", {
				cls: "dc-floating-button",
				attr: { id: "dc-floating-comment-button" },
			});
			setIconSafe(button, "message-square", "💬");

			// Prevent losing selection on clicking the button
			button.addEventListener("mousedown", (e) => {
				e.preventDefault();
				e.stopPropagation();
			});
			button.addEventListener("mouseup", (e) => {
				e.preventDefault();
				e.stopPropagation();
			});
			button.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.triggerCommentAction();
			});
		}
		return button;
	}

	private triggerCommentAction(): void {
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;

		this.hide();

		if (view.getMode() === "source") {
			// Trigger editor flow
			const editor = view.editor;
			this.plugin.startAddComment(editor);
		} else if (view.getMode() === "preview") {
			// Trigger reading view flow
			this.plugin.startAddCommentReading(view);
		}
	}

	private hide(): void {
		if (this.currentButton) {
			this.currentButton.classList.remove("is-visible");
			this.currentButton = null;
		}

		// Fail-safe to hide any button in any window
		this.plugin.app.workspace.iterateAllLeaves((leaf) => {
			const win = leaf.view.containerEl.win || window;
			const btn = win.document.getElementById("dc-floating-comment-button");
			if (btn) {
				btn.classList.remove("is-visible");
			}
		});
	}

	public destroy(): void {
		this.hide();

		// Remove button element from all window bodies
		this.plugin.app.workspace.iterateAllLeaves((leaf) => {
			const win = leaf.view.containerEl.win || window;
			const btn = win.document.getElementById("dc-floating-comment-button");
			if (btn) {
				btn.remove();
			}
		});
	}
}
