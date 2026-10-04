import { App, FuzzySuggestModal, TFile } from "obsidian";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"];

/** Turn the "Profile photo" setting — a vault path or a web URL — into
 *  something an image can load. Null when empty or the vault file is gone. */
export const resolvePhotoUrl = (app: App, photo: string): string | null => {
	const value = photo.trim();
	if (!value) return null;
	if (/^(https?:|data:|app:)/i.test(value)) return value;
	const file = app.vault.getFileByPath(value);
	return file ? app.vault.getResourcePath(file) : null;
};

/** A CSS `url(...)` for an image address, quoted and escaped. */
export const cssUrl = (url: string): string => `url("${url.replace(/["\\]/g, "\\$&")}")`;

/**
 * Your profile on your own comment entries: the photo goes on <body> as a CSS
 * variable that every `.dc-entry.is-mine .dc-avatar` paints (see styles.css),
 * plus classes for "has a photo" and "hide my profile". Kept on the body rather
 * than baked into each card, so changing either setting updates every open
 * card at once with no re-render.
 */
export const applyProfile = (app: App, photo: string, show: boolean): void => {
	const body = activeDocument.body;
	const url = resolvePhotoUrl(app, photo);
	if (url) body.style.setProperty("--dc-my-avatar", cssUrl(url));
	else body.style.removeProperty("--dc-my-avatar");
	body.toggleClass("dc-has-avatar", !!url);
	body.toggleClass("dc-hide-my-profile", !show);
};

export const clearProfile = (): void => {
	const body = activeDocument.body;
	body.style.removeProperty("--dc-my-avatar");
	body.removeClass("dc-has-avatar", "dc-hide-my-profile");
};

/** Pick an image from the vault for the profile photo. */
export class ImageFileModal extends FuzzySuggestModal<TFile> {
	constructor(
		app: App,
		private onChoose: (file: TFile) => void,
	) {
		super(app);
		this.setPlaceholder("Choose an image from your vault");
	}

	getItems(): TFile[] {
		return this.app.vault.getFiles().filter((f) => IMAGE_EXTENSIONS.includes(f.extension.toLowerCase()));
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		this.onChoose(file);
	}
}
