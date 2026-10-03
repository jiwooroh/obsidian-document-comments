/** Vertical gap between stacked margin notes, in px. */
const GAP = 8;

export type NoteBox = {
	/** Where the note wants to start: its highlight's top. */
	desired: number;
	height: number;
};

/**
 * Place margin notes as close to their highlights as possible without
 * overlapping. Notes that would collide form a cluster, and the cluster is
 * centered on its members' highlights (each member's desired top minus its
 * offset inside the cluster) — so a crowded run spreads both up and down
 * instead of everything piling up below the first note. Clusters never move
 * above 0 or into the previous cluster. Input is in document order.
 */
export const stackNotes = (boxes: NoteBox[]): number[] => {
	type Cluster = { first: number; last: number; top: number; height: number };
	const clusters: Cluster[] = [];

	/** Lay out a cluster's members back to back and center them on their
	 *  highlights; returns that ideal top, before any floor is applied. */
	const ideal = (c: Cluster): number => {
		let sum = 0;
		let offset = 0;
		for (let i = c.first; i <= c.last; i++) {
			sum += (boxes[i]?.desired ?? 0) - offset;
			offset += (boxes[i]?.height ?? 0) + GAP;
		}
		c.height = offset - GAP;
		return sum / (c.last - c.first + 1);
	};

	boxes.forEach((_, i) => {
		const cur: Cluster = { first: i, last: i, top: 0, height: 0 };
		let want = ideal(cur);
		// Merge backwards while the cluster's ideal spot collides with the one before.
		for (;;) {
			const prev = clusters[clusters.length - 1];
			if (!prev || prev.top + prev.height + GAP <= want) break;
			clusters.pop();
			cur.first = prev.first;
			want = ideal(cur);
		}
		const prev = clusters[clusters.length - 1];
		cur.top = Math.max(want, prev ? prev.top + prev.height + GAP : 0, 0);
		clusters.push(cur);
	});

	const tops: number[] = [];
	for (const c of clusters) {
		let y = c.top;
		for (let i = c.first; i <= c.last; i++) {
			tops.push(y);
			y += (boxes[i]?.height ?? 0) + GAP;
		}
	}
	return tops;
};

/**
 * Re-lay the margin notes of an export container at the current layout width.
 * Run when the window switches to print media, i.e. at the PDF page width — the
 * export popup's on-screen width differs, so measuring earlier would misplace
 * them. Notes move out of the text flow into absolute positions in the margin;
 * until this runs they stay CSS floats (a reasonable fallback on their own).
 */
export const layoutMarginNotes = (root: HTMLElement): void => {
	const notes = Array.from(root.querySelectorAll<HTMLElement>(".dc-print-note--margin"));
	if (notes.length === 0) return;
	root.classList.add("dc-print-laid-out");
	for (const note of notes) root.appendChild(note);

	const rootTop = root.getBoundingClientRect().top;
	const boxes = notes.map((note) => {
		const id = note.dataset.cid ?? "";
		const anchor = root.querySelector(`.doc-comment-span[data-cid="${CSS.escape(id)}"]`);
		const top = anchor ? anchor.getBoundingClientRect().top - rootTop : 0;
		return { desired: top, height: note.getBoundingClientRect().height };
	});
	const tops = stackNotes(boxes);
	let bottom = 0;
	notes.forEach((note, i) => {
		const top = tops[i] ?? 0;
		note.style.top = `${top}px`;
		bottom = Math.max(bottom, top + (boxes[i]?.height ?? 0));
	});
	// Keep the last notes inside the container (they no longer take up flow space).
	root.style.minHeight = `${bottom}px`;
};
