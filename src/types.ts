/** 복습 단계 id (StageDef.id) */
export type StageKey = string;
/** 흐름 인출(다시 읽기) / 전체 인출(검은펜·빨간펜) */
export type Mode = "flow" | "full";

/** 추적 중인 공부 단위 하나 (과목 헤더 아래의 목록 항목 하나, 목록이 없으면 과목 헤더) */
export interface Unit {
	id: string;
	/** 데일리 노트 경로 */
	path: string;
	/** 과목 (예: 한국사) */
	category: string;
	/** 항목 텍스트 (예: 최태성 심화강의 14, 15, 16강) */
	text: string;
	kind: "heading" | "item";
	/** 마지막으로 파싱된 줄 번호 (이동용) */
	line: number;
	/** 노트 안에서의 순서 */
	order: number;
	/** 공부한 날짜 YYYY-MM-DD (노트 날짜) */
	date: string;
	/** 완료한 단계 */
	done: StageKey[];
	/** 추적 금지 */
	ignored: boolean;
	/** 노트에서 헤더가 사라짐 (다시 나타나면 복구) */
	missing: boolean;
}

/** 복습 단계 하나: "N일 후" 또는 "N번째 복습일" */
export interface StageDef {
	id: StageKey;
	/** days: 공부한 날로부터 value일 후 / review: 공부한 날 이후 value번째 복습일 */
	type: "days" | "review";
	value: number;
	mode: Mode;
}

/** 기본값: 다음 날(흐름) / 3일 후(전체) / 복습일·이번주(흐름) / 복습일·전주(전체) */
export const DEFAULT_STAGES: StageDef[] = [
	{ id: "d1", type: "days", value: 1, mode: "flow" },
	{ id: "d3", type: "days", value: 3, mode: "full" },
	{ id: "thuFlow", type: "review", value: 1, mode: "flow" },
	{ id: "thuFull", type: "review", value: 2, mode: "full" },
];

export interface Settings {
	/** 이 날짜 이후의 데일리 노트만 추적 (YYYY-MM-DD) */
	startDate: string;
	/** 비우면 코어 데일리 노트 설정을 따름 */
	dailyFolder: string;
	dailyFormat: string;
	/** 공부 단위들의 부모 헤더 (예: "## 공부") */
	parentHeading: string;
	/** 복습일 요일 (0=일 ... 4=목) */
	reviewWeekday: number;
	/** 복습 주기 목록 */
	stages: StageDef[];
	/** 같은 날 겹치는 단계를 하나로 합치기 */
	mergeSameDay: boolean;
	/** 밀린 복습 표시 */
	showOverdue: boolean;
	/** 체크하면 공부한 날 노트의 항목 끝에 ✅ 표시 (완료한 단계 수만큼) */
	markInNote: boolean;
	enableSidebar: boolean;
	enableCodeblock: boolean;
	/** 코드블록을 자동으로 넣을 헤더 (예: "## 복습") */
	codeblockHeading: string;
}

export const DEFAULT_SETTINGS: Settings = {
	startDate: "",
	dailyFolder: "",
	dailyFormat: "",
	parentHeading: "## 학습",
	reviewWeekday: 4,
	stages: DEFAULT_STAGES.map((st) => ({ ...st })),
	mergeSameDay: false,
	showOverdue: true,
	markInNote: true,
	enableSidebar: true,
	enableCodeblock: true,
	codeblockHeading: "## 복습",
};

export interface PluginData {
	settings: Settings;
	units: Unit[];
}
