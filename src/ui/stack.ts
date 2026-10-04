export type Placement = {
	top: number;
	height: number;
};

/**
 * Stack margin cards top-down without overlap: honor anchor order (by `top`),
 * and push each card past the previous one plus a gap. Returns the resolved top
 * for each input in its ORIGINAL order.
 *
 * The first card's floor is -Infinity, so a card whose anchor has scrolled above
 * the viewport keeps a negative top and slides off the top edge instead of
 * sticking there in view.
 */
export const stackTops = (placements: Placement[], gap: number): number[] => {
	const order = placements.map((p, index) => ({ ...p, index })).sort((a, b) => a.top - b.top);
	const tops = Array.from<number>({ length: placements.length });
	let cursor = Number.NEGATIVE_INFINITY;
	for (const p of order) {
		const y = Math.max(p.top, cursor);
		tops[p.index] = y;
		cursor = y + p.height + gap;
	}
	return tops;
};

export type FoldCandidate = {
	/** The anchor's vertical middle — where the card centers. */
	mid: number;
	/** Card height with its thread shown in full / folded. */
	full: number;
	folded: number;
};

/**
 * Which cards would crowd a neighbor if shown in full. A card is crowded when,
 * centered on its anchor at full height, it would overlap the next or previous
 * card (by anchor order) sitting at its folded height plus the gap. Cards with
 * room to spare stay full; only the tight spots fold. Returns flags in the
 * input's original order.
 */
export const crowdedCards = (cards: FoldCandidate[], gap: number): boolean[] => {
	const order = cards.map((c, index) => ({ ...c, index })).sort((a, b) => a.mid - b.mid);
	const crowded = Array.from<boolean>({ length: cards.length }).fill(false);
	order.forEach((c, i) => {
		const clash = (n: (typeof order)[number] | undefined): boolean =>
			!!n && Math.abs(n.mid - c.mid) < c.full / 2 + n.folded / 2 + gap;
		crowded[c.index] = clash(order[i - 1]) || clash(order[i + 1]);
	});
	return crowded;
};
