import { describe, expect, test } from "vitest";
import { defaultHighlightHex } from "../src/ui/highlight-colors";

describe("default highlight colors", () => {
	test("each theme has its own Notion fill at 0% intensity", () => {
		expect(defaultHighlightHex("yellow", "light", 0)).toBe("#faf3de");
		expect(defaultHighlightHex("yellow", "dark", 0)).toBe("#53442c");
	});

	test("intensity mixes toward the color's tone, like the CSS color-mix", () => {
		expect(defaultHighlightHex("red", "light", 100)).toBe("#c4554d");
		expect(defaultHighlightHex("gray", "light", 50)).toBe("#b5b4b2");
	});
});
