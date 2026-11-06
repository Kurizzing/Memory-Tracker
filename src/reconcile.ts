import type { ParsedHeading } from "./parser";
import type { Unit } from "./types";

export function newId(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * 한 데일리 노트의 최신 헤더 목록을 저장된 단위들과 맞춘다.
 * - 같은 이름 → 그대로 유지 (사라졌던 단위면 복구)
 * - 사라진 단위 1개 + 새 헤더 1개 → 이름이 바뀐 것으로 보고 기록을 이어받음
 * - 나머지 사라진 단위는 missing 처리 (삭제하지 않음 → 다시 나타나면 복구)
 * 변경이 있었으면 true
 */
export function reconcileFile(units: Unit[], path: string, date: string, headings: ParsedHeading[]): boolean {
	let changed = false;
	const existing = units.filter((u) => u.path === path);
	const used = new Set<Unit>();
	const unmatched: ParsedHeading[] = [];

	const update = (u: Unit, h: ParsedHeading) => {
		if (u.line !== h.line || u.order !== h.order || u.date !== date || u.missing || u.heading !== h.text) changed = true;
		u.line = h.line;
		u.order = h.order;
		u.date = date;
		u.missing = false;
		u.heading = h.text;
		used.add(u);
	};

	for (const h of headings) {
		// 살아있는 단위를 먼저, 없으면 사라졌던 단위를 찾는다
		const u =
			existing.find((x) => !used.has(x) && !x.missing && x.heading === h.text) ??
			existing.find((x) => !used.has(x) && x.missing && x.heading === h.text);
		if (u) update(u, h);
		else unmatched.push(h);
	}

	const lost = existing.filter((u) => !used.has(u) && !u.missing);
	if (unmatched.length === 1 && lost.length === 1) {
		update(lost[0], unmatched[0]);
		unmatched.length = 0;
		lost.length = 0;
	}

	for (const u of lost) {
		u.missing = true;
		changed = true;
	}
	for (const h of unmatched) {
		units.push({
			id: newId(),
			path,
			heading: h.text,
			line: h.line,
			order: h.order,
			date,
			done: [],
			ignored: false,
			missing: false,
		});
		changed = true;
	}
	return changed;
}
