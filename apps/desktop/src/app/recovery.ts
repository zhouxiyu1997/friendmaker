import { moveCommand } from "../protocol/commands.js";
import { serializeCommand } from "../protocol/serializer.js";
import type { ResumePlan, ResumeSegment } from "../types.js";

export interface ResumeProgressSnapshot {
  completedCommands: number;
  lastCompletedSegmentIndex: number | null;
  nextResumeSegmentIndex: number | null;
  nextResumeLabel: string | null;
}

export interface RecoveryExecutionPlan {
  commands: string[];
  progressMap: number[];
  resumeSegment: ResumeSegment;
  resumedFromCompletedCommands: number;
}

function clampCompletedCommands(value: number, totalCommands: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(totalCommands, Math.floor(value)));
}

export function deriveResumeProgress(
  resumePlan: ResumePlan,
  completedCommands: number,
  totalCommands: number,
): ResumeProgressSnapshot {
  const normalizedCompletedCommands = clampCompletedCommands(completedCommands, totalCommands);
  let lastCompletedSegmentIndex: number | null = null;
  let nextResumeSegment: ResumeSegment | null = null;

  for (const segment of resumePlan.segments) {
    if (normalizedCompletedCommands >= segment.commandEndExclusive) {
      lastCompletedSegmentIndex = segment.segmentIndex;
      continue;
    }

    nextResumeSegment = segment;
    break;
  }

  return {
    completedCommands: normalizedCompletedCommands,
    lastCompletedSegmentIndex,
    nextResumeSegmentIndex: nextResumeSegment?.segmentIndex ?? null,
    nextResumeLabel: nextResumeSegment?.label ?? null,
  };
}

export function getResumeSegmentByIndex(
  resumePlan: ResumePlan,
  segmentIndex: number | null,
): ResumeSegment | null {
  if (segmentIndex === null) {
    return null;
  }

  return resumePlan.segments.find((segment) => segment.segmentIndex === segmentIndex) ?? null;
}

export function getNextResumeSegment(
  resumePlan: ResumePlan,
  completedCommands: number,
  totalCommands: number,
): ResumeSegment | null {
  const progress = deriveResumeProgress(resumePlan, completedCommands, totalCommands);
  return getResumeSegmentByIndex(resumePlan, progress.nextResumeSegmentIndex);
}

export function getLastCompletedResumeSegmentIndex(
  resumePlan: ResumePlan,
  completedCommands: number,
  totalCommands: number,
): number | null {
  return deriveResumeProgress(resumePlan, completedCommands, totalCommands).lastCompletedSegmentIndex;
}

export function buildRecoveryExecutionPlan(input: {
  commands: string[];
  resumePlan: ResumePlan;
  completedCommands: number;
}): RecoveryExecutionPlan {
  const { commands, resumePlan } = input;
  const progress = deriveResumeProgress(resumePlan, input.completedCommands, commands.length);
  const resumeSegment = getResumeSegmentByIndex(resumePlan, progress.nextResumeSegmentIndex);

  if (!resumeSegment) {
    throw new Error("No recoverable drawing segment remains.");
  }

  const resumedFromCompletedCommands =
    progress.lastCompletedSegmentIndex === null
      ? 0
      : (resumePlan.segments[progress.lastCompletedSegmentIndex]?.commandEndExclusive ?? 0);
  const firstTailCommandIndex = resumeSegment.bodyStartCommandIndex;
  const prefixCommands = [
    resumePlan.inputConfigCommand,
    ...resumeSegment.resumePrefixCommands,
  ];
  const dx = resumeSegment.firstCanvasPosition.x - resumePlan.initialCursor.x;
  const dy = resumeSegment.firstCanvasPosition.y - resumePlan.initialCursor.y;

  if (dx !== 0 || dy !== 0) {
    prefixCommands.push(serializeCommand(moveCommand(dx, dy)));
  }

  const originalTail = commands.slice(firstTailCommandIndex);
  const progressMap = [
    ...Array.from({ length: prefixCommands.length }, () => resumedFromCompletedCommands),
    ...originalTail.map((_, index) => firstTailCommandIndex + index + 1),
  ];

  return {
    commands: [...prefixCommands, ...originalTail],
    progressMap,
    resumeSegment,
    resumedFromCompletedCommands,
  };
}
