import type { Question } from "@/chat/adapter";
import { asObject, asString } from "@/chat/transcribed";

/**
 * The questions in a list of `{question, header, options: [{label, description}]}` objects, the
 * shape that Claude Code and Codex use. A question with no options has nothing to show as a choice
 * and is left out. `multiSelectField` names the field that marks a question with several answers.
 */
export function toQuestions(list: unknown, multiSelectField?: string): Question[] {
  const questions: Question[] = [];
  for (const value of Array.isArray(list) ? list : []) {
    const { question, header, options, ...rest } = asObject(value);
    const choices = (Array.isArray(options) ? options : []).map(asObject).filter((option) => asString(option.label) !== "");
    if (asString(question) === "" || choices.length === 0) continue;
    questions.push({
      text: asString(question),
      header: asString(header) || undefined,
      isMultiSelect: multiSelectField !== undefined && rest[multiSelectField] === true,
      options: choices.map((option) => ({ label: asString(option.label), description: asString(option.description) || undefined })),
    });
  }
  return questions;
}
