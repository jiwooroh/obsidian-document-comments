import { describe, expect, test } from "vitest";
import { stackNotes } from "../src/reading/print-layout";

describe("margin note stacking", () => {
	test("keeps notes at their highlights when they don't collide", () => {
		expect(
			stackNotes([
				{ desired: 0, height: 20 },
				{ desired: 100, height: 20 },
			]),
		).toEqual([0, 100]);
	});

	test("centers a crowded run on its highlights instead of piling up below", () => {
		// Both want y=100; stacked they need 20 + 8 + 20. Centering moves the
		// first up and the second down by the same amount.
		expect(
			stackNotes([
				{ desired: 100, height: 20 },
				{ desired: 100, height: 20 },
			]),
		).toEqual([86, 114]);
	});

	test("never moves above the page top or into the previous cluster", () => {
		expect(
			stackNotes([
				{ desired: 0, height: 40 },
				{ desired: 0, height: 40 },
			]),
		).toEqual([0, 48]);
		const tops = stackNotes([
			{ desired: 0, height: 100 },
			{ desired: 110, height: 20 },
			{ desired: 110, height: 20 },
		]);
		expect(tops[1]).toBeGreaterThanOrEqual(108);
		expect(tops[2]).toBe((tops[1] ?? 0) + 28);
	});
});
