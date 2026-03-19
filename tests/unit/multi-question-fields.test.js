/**
 * Unit tests for HEA-175: Multi-question subcard fields
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

var wizSrc = readFileSync(resolve(__dirname, '../../inspector-wizard-v2.html'), 'utf8');
var wbSrc = readFileSync(resolve(__dirname, '../../wizard-builder.html'), 'utf8');
var getReportSrc = readFileSync(resolve(__dirname, '../../functions/get-report.js'), 'utf8');
var reportSrc = readFileSync(resolve(__dirname, '../../report.html'), 'utf8');

// 1. New functions exist
describe('HEA-175 — New Netlify functions', () => {
  it('save-field-questions.js exists', () => {
    expect(existsSync(resolve(__dirname, '../../functions/save-field-questions.js'))).toBe(true);
  });

  it('save-field-answer.js accepts question_id', () => {
    var src = readFileSync(resolve(__dirname, '../../functions/save-field-answer.js'), 'utf8');
    expect(src).toContain('question_id');
  });
});

// 2. get-report.js returns field questions
describe('HEA-175 — get-report.js', () => {
  it('fetches wizard_field_questions', () => {
    expect(getReportSrc).toContain("from('wizard_field_questions')");
  });

  it('returns v2_field_questions', () => {
    expect(getReportSrc).toContain('v2_field_questions');
  });

  it('nests field answers by field_id then question_id', () => {
    expect(getReportSrc).toContain("a.question_id || 'field'");
  });
});

// 3. Wizard V2 — Tier 3 rendering
describe('HEA-175 — Wizard V2 Tier 3', () => {
  it('has v2FieldQuestions state variable', () => {
    expect(wizSrc).toContain('var v2FieldQuestions');
  });

  it('has v2QuestionOptions state variable', () => {
    expect(wizSrc).toContain('var v2QuestionOptions');
  });

  it('loads wizard_field_questions from Supabase', () => {
    expect(wizSrc).toContain("from('wizard_field_questions')");
  });

  it('separates Tier 2 and Tier 3 options', () => {
    expect(wizSrc).toContain('o.question_id');
    expect(wizSrc).toContain('v2QuestionOptions[o.question_id]');
  });

  it('detects Tier 3 in v2BuildSubcard', () => {
    var subIdx = wizSrc.indexOf('function v2BuildSubcard');
    var subEnd = wizSrc.indexOf('function v2BuildPhotoRow');
    var block = wizSrc.substring(subIdx, subEnd);
    expect(block).toContain('fieldQuestions.length');
    expect(block).toContain('v2SaveQuestionAnswer');
  });

  it('has v2SaveQuestionAnswer function', () => {
    expect(wizSrc).toContain('v2SaveQuestionAnswer');
  });

  it('has v2SaveQuestionTextAnswer function', () => {
    expect(wizSrc).toContain('v2SaveQuestionTextAnswer');
  });

  it('sends question_id in save payload', () => {
    var fnIdx = wizSrc.indexOf('window.v2SaveQuestionAnswer = async');
    var fnEnd = wizSrc.indexOf('window.v2SaveQuestionTextAnswer');
    var fnBlock = wizSrc.substring(fnIdx, fnEnd);
    expect(fnBlock).toContain('question_id: questionId');
  });
});

// 4. Wizard Builder — Questions section
describe('HEA-175 — Wizard Builder questions', () => {
  it('has fieldQuestionsContainer', () => {
    expect(wbSrc).toContain('id="fieldQuestionsContainer"');
  });

  it('has Add Question button', () => {
    expect(wbSrc).toContain('wbAddQuestionRow');
    expect(wbSrc).toContain('+ Add Question');
  });

  it('has mutual exclusivity note', () => {
    expect(wbSrc).toContain('Use Dropdown Options OR Questions');
  });

  it('loads existing questions on modal open', () => {
    var fnIdx = wbSrc.indexOf('async function wbOpenFieldModal');
    var fnEnd = wbSrc.indexOf('async function wbSaveField');
    var block = wbSrc.substring(fnIdx, fnEnd);
    expect(block).toContain("from('wizard_field_questions')");
    expect(block).toContain('wbRenderQuestionRows');
  });

  it('saves questions via save-field-questions on field save', () => {
    var fnIdx = wbSrc.indexOf('async function wbSaveField');
    var fnEnd = wbSrc.indexOf('function wbRenderOptionRows');
    var block = wbSrc.substring(fnIdx, fnEnd);
    expect(block).toContain('save-field-questions');
    expect(block).toContain('wbGetQuestionRows');
  });

  it('has wbGetQuestionRows function', () => {
    expect(wbSrc).toContain('function wbGetQuestionRows()');
  });
});

// 5. Report renders answers
describe('HEA-175 — Report answer rendering', () => {
  it('loads fieldAnswers and fieldQuestions', () => {
    expect(reportSrc).toContain('v2Data.fieldAnswers');
    expect(reportSrc).toContain('v2Data.fieldQuestions');
  });

  it('renders answer pairs with separator', () => {
    expect(reportSrc).toContain('answerPairs');
    expect(reportSrc).toContain('·');
  });
});

// 6. Tiers coexist
describe('HEA-175 — Tier coexistence', () => {
  it('Tier 2 still renders when no questions exist', () => {
    var subIdx = wizSrc.indexOf('function v2BuildSubcard');
    var subEnd = wizSrc.indexOf('function v2BuildPhotoRow');
    var block = wizSrc.substring(subIdx, subEnd);
    expect(block).toContain('} else if (fieldOpts.length)');
  });
});
