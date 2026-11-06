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

/** 공부 단위 헤더 이름 바꾸기. 바뀐 게 없으면 null */
export function renameStudyHeading(content: string, parentLine: string, oldText: string, newText: string): string | null {
	const target = findStudyHeadings(content, parentLine).find((h) => h.text === oldText);
	if (!target) return null;
	const { lines, eol } = splitLines(content);
	lines[target.line] = `${"#".repeat(target.level)} ${newText}`;
	return lines.join(eol);
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
