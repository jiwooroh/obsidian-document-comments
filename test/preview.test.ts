import { afterEach, describe, expect, test } from "vitest";
import { commentPreview, setPreviewShowsAuthor } from "../src/format/preview";
import type { ParsedComment } from "../src/format/types";

const comment = {
	id: "a1",
	open: null,
	close: null,
	body: null,
	status: "open",
	thread: [{ author: "lucy", text: "note  on\nalpha" }],
	reactions: [],
} as ParsedComment;

describe("hover preview", () => {
	afterEach(() => setPreviewShowsAuthor(true));

	test("leads with the author by default", () => {
		expect(commentPreview(comment)).toBe("lucy: note on alpha");
	});

	test("drops the author when author names are hidden", () => {
		setPreviewShowsAuthor(false);
		expect(commentPreview(comment)).toBe("note on alpha");
	});
});
