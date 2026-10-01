import { describe, it, expect } from "vitest";
import { computeInlineColorEdit, computeInlineWrapEdit } from "../src/ui/textarea-format";

describe("computeInlineColorEdit", () => {
	it("returns null when nothing is selected", () => {
		expect(computeInlineColorEdit("hello world", 3, 3, "text", "red")).toBeNull();
	});

	it("wraps the selection in a text-color span", () => {
		const result = computeInlineColorEdit("hello world", 0, 5, "text", "red")!;
		expect(result.text).toBe('<span class="dc-fg-red">hello</span> world');
		expect(result.text.slice(result.selectionStart, result.selectionEnd)).toBe(
			'<span class="dc-fg-red">hello</span>',
		);
	});

	it("wraps the selection in a highlight mark", () => {
		const result = computeInlineColorEdit("hello world", 6, 11, "highlight", "yellow")!;
		expect(result.text).toBe('hello <mark class="dc-mark-yellow">world</mark>');
	});

	it("switches color without nesting when the selection is already colored", () => {
		const text = '<span class="dc-fg-red">hello</span> world';
		const result = computeInlineColorEdit(text, 0, text.indexOf(" world"), "text", "blue")!;
		expect(result.text).toBe('<span class="dc-fg-blue">hello</span> world');
	});

	it("clears an existing text color when colorId is undefined", () => {
		const text = '<span class="dc-fg-red">hello</span> world';
		const result = computeInlineColorEdit(text, 0, text.indexOf(" world"), "text", undefined)!;
		expect(result.text).toBe("hello world");
	});

	it("clears an existing highlight when colorId is undefined", () => {
		const text = 'hello <mark class="dc-mark-yellow">world</mark>';
		const result = computeInlineColorEdit(text, "hello ".length, text.length, "highlight", undefined)!;
		expect(result.text).toBe("hello world");
	});

	it("switching kind on an existing wrap replaces it rather than double-wrapping", () => {
		const text = '<span class="dc-fg-red">hello</span> world';
		const result = computeInlineColorEdit(text, 0, text.indexOf(" world"), "highlight", "green")!;
		expect(result.text).toBe('<mark class="dc-mark-green">hello</mark> world');
	});
});

describe("computeInlineWrapEdit", () => {
	it("returns null when nothing is selected", () => {
		expect(computeInlineWrapEdit("hello world", 3, 3, "**")).toBeNull();
	});

	it("wraps the selection with matching prefix/suffix", () => {
		const result = computeInlineWrapEdit("hello world", 0, 5, "**")!;
		expect(result.text).toBe("**hello** world");
		expect(result.text.slice(result.selectionStart, result.selectionEnd)).toBe("**hello**");
	});

	it("unwraps an already-wrapped selection (toggle off)", () => {
		const result = computeInlineWrapEdit("**hello** world", 0, "**hello**".length, "**")!;
		expect(result.text).toBe("hello world");
	});

	it("supports distinct prefix/suffix (underline)", () => {
		const result = computeInlineWrapEdit("hello world", 0, 5, "<u>", "</u>")!;
		expect(result.text).toBe("<u>hello</u> world");
	});

	it("toggles distinct prefix/suffix off", () => {
		const text = "<u>hello</u> world";
		const result = computeInlineWrapEdit(text, 0, "<u>hello</u>".length, "<u>", "</u>")!;
		expect(result.text).toBe("hello world");
	});
});
