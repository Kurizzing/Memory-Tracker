import type { StudyItem } from "./parser";
import type { Unit } from "./types";

export function newId(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 화면 표시용 이름 */
export function unitLabel(u: Unit): string {
	return u.kind === "heading" ? u.text : `${u.category} · ${u.text}`;
}

/**
 * 한 데일리 노트의 최신 공부 항목 목록을 저장된 단위들과 맞춘다.
 * 1. 과목+텍스트가 같으면 그대로 유지 (사라졌던 단위면 복구)
 * 2. 텍스트만 같으면 과목 이름이 바뀐 것으로 보고 이어받음
 * 3. 사라진 단위 1개 + 새 항목 1개 → 이름이 바뀐 것으로 보고 이어받음
 * 4. 나머지 사라진 단위는 missing 처리 (삭제하지 않음 → 다시 나타나면 복구)
 * 변경이 있었으면 true
 */
export function reconcileFile(units: Unit[], path: string, date: string, items: StudyItem[]): boolean {
	let changed = false;
	const existing = units.filter((u) => u.path === path);
	const used = new Set<Unit>();

	const update = (u: Unit, it: StudyItem) => {
		if (
			u.line !== it.line ||
			u.order !== it.order ||
			u.date !== date ||
			u.missing ||
			u.text !== it.text ||
			u.category !== it.category ||
			u.kind !== it.kind
		)
			changed = true;
		u.line = it.line;
		u.order = it.order;
		u.date = date;
		u.missing = false;
		u.text = it.text;
		u.category = it.category;
		u.kind = it.kind;
		used.add(u);
	};

	// 살아있는 단위를 먼저, 없으면 사라졌던 단위에서 찾는다
	const find = (pred: (u: Unit) => boolean) =>
		existing.find((u) => !used.has(u) && !u.missing && pred(u)) ?? existing.find((u) => !used.has(u) && u.missing && pred(u));

	let pending: StudyItem[] = [];
	for (const it of items) {
		const u = find((u) => u.kind === it.kind && u.category === it.category && u.text === it.text);
		if (u) update(u, it);
		else pending.push(it);
	}

	const rest: StudyItem[] = [];
	for (const it of pending) {
		const u = it.kind === "item" ? find((u) => u.kind === "item" && u.text === it.text) : undefined;
		if (u) update(u, it);
		else rest.push(it);
	}
	pending = rest;

	const lost = existing.filter((u) => !used.has(u) && !u.missing);
	if (pending.length === 1 && lost.length === 1) {
		update(lost[0], pending[0]);
		pending = [];
		lost.length = 0;
	}

	for (const u of lost) {
		u.missing = true;
		changed = true;
	}
	for (const it of pending) {
		units.push({
			id: newId(),
			path,
			category: it.category,
			text: it.text,
			kind: it.kind,
			line: it.line,
			order: it.order,
			date,
			done: [],
			ignored: false,
			missing: false,
		});
		changed = true;
	}
	return changed;
}
