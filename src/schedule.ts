import type { Mode, StageDef, StageKey, Unit } from "./types";

export const MODE_LABEL: Record<Mode, string> = { flow: "흐름 인출", full: "전체 인출" };
export const MODE_ICON: Record<Mode, string> = { flow: "📗", full: "📘" };

/** 단계 이름: "1일 후", "3일 후", "복습일 · 이번주", "복습일 · 전주", "복습일 · 2주 전" */
export function stageLabel(st: StageDef): string {
	if (st.type === "days") return st.value === 1 ? "다음 날" : `${st.value}일 후`;
	if (st.value <= 1) return "복습일 · 이번주";
	if (st.value === 2) return "복습일 · 전주";
	return `복습일 · ${st.value - 1}주 전`;
}

/** 합칠 때 대표 단계 / 표시 순서: 전체 인출 > 흐름 인출, 복습일 > 일수, 값이 큰 것 먼저 */
function rank(st: StageDef): number {
	return (st.mode === "full" ? 0 : 2) * 1e6 + (st.type === "review" ? 0 : 1) * 1e5 - st.value;
}

/** 화면 그룹 순서: 복습일(전주 → 이번주) 먼저, 그다음 일수 단계(큰 값 먼저) */
function displayRank(st: StageDef): number {
	return (st.type === "review" ? 0 : 1) * 1e5 - st.value;
}

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

/** 공부한 날짜로부터 단계 하나의 예정일 */
export function dueDate(date: string, st: StageDef, reviewWeekday: number): string {
	if (st.type === "days") return addDays(date, st.value);
	return addDays(nextWeekdayAfter(date, reviewWeekday), 7 * (Math.max(1, st.value) - 1));
}

/** 공부한 날짜로부터 각 단계의 예정일 */
export function dueDates(date: string, stages: StageDef[], reviewWeekday: number): Record<StageKey, string> {
	const out: Record<StageKey, string> = {};
	for (const st of stages) out[st.id] = dueDate(date, st, reviewWeekday);
	return out;
}

// ---- 복습 목록 ----

export interface ReviewItem {
	unit: Unit;
	/** 이 항목이 대표하는 단계들 (합치기 꺼짐이면 항상 1개) */
	stages: StageDef[];
	/** 표시 그룹 (대표 단계) */
	group: StageDef;
	mode: Mode;
	due: string;
	overdue: boolean;
	done: boolean;
}

export interface ItemOptions {
	stages: StageDef[];
	reviewWeekday: number;
	merge: boolean;
	includeOverdue: boolean;
	startDate: string;
}

function makeItems(unit: Unit, stages: StageDef[], due: string, overdue: boolean, merge: boolean): ReviewItem[] {
	if (stages.length === 0) return [];
	const build = (ss: StageDef[]): ReviewItem => {
		const group = [...ss].sort((a, b) => rank(a) - rank(b))[0];
		return {
			unit,
			stages: ss,
			group,
			mode: group.mode,
			due,
			overdue,
			done: ss.every((s) => unit.done.includes(s.id)),
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
		const dues = dueDates(unit.date, opts.stages, opts.reviewWeekday);

		const today = opts.stages.filter((s) => dues[s.id] === date);
		items.push(...makeItems(unit, today, date, false, opts.merge));

		if (opts.includeOverdue) {
			const byDue = new Map<string, StageDef[]>();
			for (const s of opts.stages) {
				const d = dues[s.id];
				if (d < date && !unit.done.includes(s.id)) byDue.set(d, [...(byDue.get(d) ?? []), s]);
			}
			for (const [due, ss] of byDue) items.push(...makeItems(unit, ss, due, true, opts.merge));
		}
	}
	return items.sort(compareItems);
}

/** 화면 그룹 순서로 정렬된 단계 목록 */
export function groupOrder(stages: StageDef[]): StageDef[] {
	return [...stages].sort((a, b) => displayRank(a) - displayRank(b));
}

function compareItems(a: ReviewItem, b: ReviewItem): number {
	if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
	if (a.overdue && a.due !== b.due) return a.due < b.due ? -1 : 1;
	const ga = displayRank(a.group);
	const gb = displayRank(b.group);
	if (ga !== gb) return ga - gb;
	if (a.unit.date !== b.unit.date) return a.unit.date < b.unit.date ? -1 : 1;
	return a.unit.order - b.unit.order;
}

/** 현재 설정된 단계 중 완료한 수 (삭제된 단계의 기록은 제외) */
export function doneCount(unit: Unit, stages: StageDef[]): number {
	return stages.filter((s) => unit.done.includes(s.id)).length;
}
