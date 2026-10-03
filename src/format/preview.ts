import type { ParsedComment } from "./types";

/** Whether hover previews lead with the author's name. Plugin-wide, set from
 *  the "Show author names" setting (see DocCommentsPlugin.applyAuthorVisibility). */
let showAuthor = true;
export const setPreviewShowsAuthor = (show: boolean): void => {
	showAuthor = show;
};

export const commentPreview = (comment: ParsedComment): string | null => {
	const first = comment.thread[0];
	if (!first) return null;
	const text = first.text.trim().replace(/\s+/g, " ");
	if (!text) return null;
	if (!showAuthor) return text;
	const author = first.author || comment.author || "Comment";
	return `${author}: ${text}`;
};
