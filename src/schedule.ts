import type { Mode, StageKey, Unit } from "./types";

export const STAGES: StageKey[] = ["d1", "d3", "thuFlow", "thuFull"];

export const STAGE_MODE: Record<StageKey, Mode> = {
	d1: "flow",
	d3: "full",
	thuFlow: "flow",
	thuFull: "full",
};

export const STAGE_LABEL: Record<StageKey, string> = {
	d1: "다음 날",
	d3: "3일 후",
	thuFlow: "복습일 · 이번주",
	thuFull: "복습일 · 전주",
};

/** 합칠 때 대표 단계 우선순위 (전체 인출 > 흐름 인출) */
const MERGE_PRIORITY: StageKey[] = ["thuFull", "d3", "thuFlow", "d1"];
/** 화면 표시 순서 */
export const GROUP_ORDER: StageKey[] = ["thuFull", "thuFlow", "d3", "d1"];

// ---- 날짜 유틸 (YYYY-MM-DD 문자열, UTC 기준으로 계산해 시간대 영향 없음) ----

function toUTC(date: string): Date {
	const [y, m, d] = date.split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, d));
}

function fromUTC(dt: Date): string {
	return dt.toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
	const dt = toUTC(date);
	dt.setUTCDate(dt.getUTCDate() + n);
	return fromUTC(dt);
}

export function weekday(date: string): number {
	return toUTC(date).getUTCDay();
}

/** date 이후(당일 제외) 처음 오는 wd 요일 */
export function nextWeekdayAfter(date: string, wd: number): string {
	let diff = (wd - weekday(date) + 7) % 7;
	if (diff === 0) diff = 7;
	return addDays(date, diff);
}

/** 공부한 날짜로부터 각 단계의 예정일 */
export function dueDates(date: string, reviewWeekday: number): Record<StageKey, string> {
	const flow = nextWeekdayAfter(date, reviewWeekday);
	return {
		d1: addDays(date, 1),
		d3: addDays(date, 3),
		thuFlow: flow,
		thuFull: addDays(flow, 7),
	};
}

// ---- 복습 목록 ----

export interface ReviewItem {
	unit: Unit;
	/** 이 항목이 대표하는 단계들 (합치기 꺼짐이면 항상 1개) */
	stages: StageKey[];
	/** 표시 그룹 (대표 단계) */
	group: StageKey;
	mode: Mode;
	due: string;
	overdue: boolean;
	done: boolean;
}

export interface ItemOptions {
	reviewWeekday: number;
	merge: boolean;
	includeOverdue: boolean;
	startDate: string;
}

function makeItems(unit: Unit, stages: StageKey[], due: string, overdue: boolean, merge: boolean): ReviewItem[] {
	if (stages.length === 0) return [];
	const build = (ss: StageKey[]): ReviewItem => {
		const group = MERGE_PRIORITY.find((s) => ss.includes(s)) as StageKey;
		return {
			unit,
			stages: ss,
			group,
			mode: STAGE_MODE[group],
			due,
			overdue,
			done: ss.every((s) => unit.done.includes(s)),
		};
	};
	return merge ? [build(stages)] : stages.map((s) => build([s]));
}

export function isTracked(unit: Unit, startDate: string): boolean {
	return !unit.ignored && !unit.missing && (!startDate || unit.date >= startDate);
}

/** 특정 날짜에 보여줄 복습 항목. includeOverdue면 그 날짜 이전에 끝나지 않은 단계도 포함 */
export function itemsForDate(units: Unit[], date: string, opts: ItemOptions): ReviewItem[] {
	const items: ReviewItem[] = [];
	for (const unit of units) {
		if (!isTracked(unit, opts.startDate)) continue;
		const dues = dueDates(unit.date, opts.reviewWeekday);

		const today = STAGES.filter((s) => dues[s] === date);
		items.push(...makeItems(unit, today, date, false, opts.merge));

		if (opts.includeOverdue) {
			const byDue = new Map<string, StageKey[]>();
			for (const s of STAGES) {
				if (dues[s] < date && !unit.done.includes(s)) {
					byDue.set(dues[s], [...(byDue.get(dues[s]) ?? []), s]);
				}
			}
			for (const [due, ss] of byDue) items.push(...makeItems(unit, ss, due, true, opts.merge));
		}
	}
	return items.sort(compareItems);
}

function compareItems(a: ReviewItem, b: ReviewItem): number {
	if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
	if (a.overdue && a.due !== b.due) return a.due < b.due ? -1 : 1;
	const ga = GROUP_ORDER.indexOf(a.group);
	const gb = GROUP_ORDER.indexOf(b.group);
	if (ga !== gb) return ga - gb;
	if (a.unit.date !== b.unit.date) return a.unit.date < b.unit.date ? -1 : 1;
	return a.unit.order - b.unit.order;
}

export function isFullyDone(unit: Unit): boolean {
	return STAGES.every((s) => unit.done.includes(s));
}
