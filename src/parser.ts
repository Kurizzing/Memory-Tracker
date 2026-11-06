export interface HeadingInfo {
	level: number;
	text: string;
}

export interface ParsedHeading extends HeadingInfo {
	line: number;
	order: number;
}

const HEADING_RE = /^(#{1,6})[ \t]+(.+?)[ \t]*$/;
const FENCE_RE = /^\s*(```+|~~~+)/;

export function parseHeadingLine(line: string): HeadingInfo | null {
	const m = HEADING_RE.exec(line.trim());
	if (!m) return null;
	return { level: m[1].length, text: m[2] };
}

function splitLines(content: string): { lines: string[]; eol: string } {
	return { lines: content.split(/\r?\n/), eol: content.includes("\r\n") ? "\r\n" : "\n" };
}

/** 프론트매터와 코드블록을 제외한 헤더 줄들 */
function scanHeadings(lines: string[]): Array<HeadingInfo & { line: number }> {
	const out: Array<HeadingInfo & { line: number }> = [];
	let i = 0;
	if (lines[0]?.trim() === "---") {
		for (i = 1; i < lines.length; i++) {
			if (lines[i].trim() === "---") {
				i++;
				break;
			}
		}
	}
	let fence: string | null = null;
	for (; i < lines.length; i++) {
		const fm = FENCE_RE.exec(lines[i]);
		if (fm) {
			const mark = fm[1][0];
			if (fence === null) fence = mark;
			else if (mark === fence) fence = null;
			continue;
		}
		if (fence) continue;
		const m = HEADING_RE.exec(lines[i]);
		if (m) out.push({ line: i, level: m[1].length, text: m[2] });
	}
	return out;
}

function sameHeading(a: HeadingInfo, b: HeadingInfo): boolean {
	return a.level === b.level && a.text === b.text;
}

/** 부모 헤더 바로 아래 단계의 헤더들 = 공부 단위 */
export function findStudyHeadings(content: string, parentLine: string): ParsedHeading[] {
	const parent = parseHeadingLine(parentLine);
	if (!parent) return [];
	const out: ParsedHeading[] = [];
	let inside = false;
	for (const h of scanHeadings(splitLines(content).lines)) {
		if (inside && h.level <= parent.level) inside = false;
		if (!inside && sameHeading(h, parent)) {
			inside = true;
			continue;
		}
		if (inside && h.level === parent.level + 1) out.push({ ...h, order: out.length });
	}
	return out;
}

/** 공부 항목: 과목 헤더 아래의 최상위 목록 하나 (목록이 없으면 과목 헤더 자체) */
export interface StudyItem {
	/** 과목 (부모 바로 아래 헤더 텍스트) */
	category: string;
	/** 항목 텍스트 (kind가 heading이면 과목명과 같음) */
	text: string;
	kind: "heading" | "item";
	line: number;
	order: number;
}

/** 들여쓰기 없는 목록 줄: 마커, 체크박스(선택), 텍스트 */
const ITEM_RE = /^([*+-]|\d+[.)])([ \t]+)(\[.\][ \t]+)?(.*?)[ \t]*$/;

export function findStudyItems(content: string, parentLine: string): StudyItem[] {
	const parent = parseHeadingLine(parentLine);
	if (!parent) return [];
	const { lines } = splitLines(content);
	const headings = scanHeadings(lines);
	const subjects = findStudyHeadings(content, parentLine);
	const out: StudyItem[] = [];

	for (const s of subjects) {
		const next = headings.find((h) => h.line > s.line && h.level <= s.level);
		const end = next ? next.line : lines.length;
		const items: StudyItem[] = [];
		let fence: string | null = null;
		for (let i = s.line + 1; i < end; i++) {
			const fm = FENCE_RE.exec(lines[i]);
			if (fm) {
				const mark = fm[1][0];
				if (fence === null) fence = mark;
				else if (mark === fence) fence = null;
				continue;
			}
			if (fence) continue;
			const m = ITEM_RE.exec(lines[i]);
			const text = m ? stripMarks(m[4]) : "";
			if (text) items.push({ category: stripMarks(s.text), text, kind: "item", line: i, order: 0 });
		}
		if (items.length) out.push(...items);
		else {
			const name = stripMarks(s.text);
			out.push({ category: name, text: name, kind: "heading", line: s.line, order: 0 });
		}
	}
	out.forEach((it, i) => (it.order = i));
	return out;
}

// ---- 복습 완료 표시 (항목 끝의 ✅, 완료한 단계 수만큼) ----

export const DONE_MARK = "✅";
const MARKS_RE = /(?:[ \t]*✅)+$/u;

/** 텍스트 끝의 ✅ 표시를 떼어낸 본문 */
export function stripMarks(s: string): string {
	return s.replace(MARKS_RE, "").trimEnd();
}

export function countMarks(s: string): number {
	const m = MARKS_RE.exec(s);
	return m ? (m[0].match(/✅/gu) ?? []).length : 0;
}

function withMarks(base: string, n: number): string {
	return n > 0 ? `${base} ${DONE_MARK.repeat(n)}` : base;
}

type ItemTarget = { category: string; text: string; kind: "heading" | "item" };

/** 대상 항목 줄을 (본문, ✅ 개수) 단위로 고친다. 대상이 없거나 그대로면 null */
function editItemLine(
	content: string,
	parentLine: string,
	target: ItemTarget,
	edit: (base: string, marks: number) => [string, number],
): string | null {
	const found = findStudyItems(content, parentLine).find(
		(it) => it.category === target.category && it.text === target.text && it.kind === target.kind,
	);
	if (!found) return null;
	const { lines, eol } = splitLines(content);
	let prefix: string;
	let body: string;
	if (found.kind === "heading") {
		const h = parseHeadingLine(lines[found.line]);
		if (!h) return null;
		prefix = `${"#".repeat(h.level)} `;
		body = h.text;
	} else {
		const m = ITEM_RE.exec(lines[found.line]);
		if (!m) return null;
		prefix = `${m[1]}${m[2]}${m[3] ?? ""}`;
		body = m[4];
	}
	const [base, marks] = edit(stripMarks(body), countMarks(body));
	const next = prefix + withMarks(base, marks);
	if (next === lines[found.line]) return null;
	lines[found.line] = next;
	return lines.join(eol);
}

/** 공부 항목 텍스트 바꾸기 (목록 마커/체크박스, 헤더 레벨, ✅ 표시 유지). 바뀐 게 없으면 null */
export function renameStudyItem(content: string, parentLine: string, target: ItemTarget, newText: string): string | null {
	return editItemLine(content, parentLine, target, (_, marks) => [newText, marks]);
}

/** 항목 끝의 ✅ 개수를 count로 맞춘다. 바뀐 게 없으면 null */
export function setDoneMarks(content: string, parentLine: string, target: ItemTarget, count: number): string | null {
	return editItemLine(content, parentLine, target, (base) => [base, count]);
}

/** 부모 헤더 줄을 새 이름으로 교체. 바뀐 게 없으면 null */
export function renameHeadingLines(content: string, oldLine: string, newLine: string): string | null {
	const oldH = parseHeadingLine(oldLine);
	const newH = parseHeadingLine(newLine);
	if (!oldH || !newH || sameHeading(oldH, newH)) return null;
	const { lines, eol } = splitLines(content);
	let changed = false;
	for (const h of scanHeadings(lines)) {
		if (sameHeading(h, oldH)) {
			lines[h.line] = `${"#".repeat(newH.level)} ${newH.text}`;
			changed = true;
		}
	}
	return changed ? lines.join(eol) : null;
}

/** 지정 헤더 바로 아래에 코드블록 삽입. 헤더가 없거나 이미 블록이 있으면 null */
export function insertCodeblock(content: string, headingLine: string, lang: string): string | null {
	const target = parseHeadingLine(headingLine);
	if (!target) return null;
	const { lines, eol } = splitLines(content);
	const headings = scanHeadings(lines);
	const idx = headings.findIndex((h) => sameHeading(h, target));
	if (idx < 0) return null;
	const start = headings[idx].line;
	const next = headings.slice(idx + 1).find((h) => h.level <= target.level);
	const end = next ? next.line : lines.length;
	const blockRe = new RegExp("^\\s*(```+|~~~+)\\s*" + lang + "\\s*$");
	for (let i = start + 1; i < end; i++) if (blockRe.test(lines[i])) return null;
	lines.splice(start + 1, 0, "```" + lang, "```");
	return lines.join(eol);
}
