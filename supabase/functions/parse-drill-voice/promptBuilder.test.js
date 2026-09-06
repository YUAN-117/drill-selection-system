import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildParseRequest, VOICE_INPUT_TOOL_NAME } from './promptBuilder.js';

test('sends the transcript as the user message', () => {
  const req = buildParseRequest('8mm 不鏽鋼');
  assert.equal(req.messages.length, 1);
  assert.equal(req.messages[0].role, 'user');
  assert.equal(req.messages[0].content, '8mm 不鏽鋼');
});

test('forces the tool call so the response is always structured', () => {
  const req = buildParseRequest('8mm 不鏽鋼');
  assert.deepEqual(req.tool_choice, { type: 'tool', name: VOICE_INPUT_TOOL_NAME });
  assert.equal(req.tools.length, 1);
  assert.equal(req.tools[0].name, VOICE_INPUT_TOOL_NAME);
});

test('restricts the material field to the eight known material:subtype keys', () => {
  const req = buildParseRequest('8mm 不鏽鋼');
  assert.deepEqual(req.tools[0].input_schema.properties.material.enum, [
    'aluminum:6061',
    'aluminum:7075',
    'aluminum:a380',
    'copper:brass',
    'stainless:standard',
    'peek:standard',
    'pc:standard',
    'pom:standard'
  ]);
});

test('the schema property is named material, not alloy', () => {
  const req = buildParseRequest('8mm 不鏽鋼');
  assert.ok(req.tools[0].input_schema.properties.material);
  assert.ok(!req.tools[0].input_schema.properties.alloy);
});

test('uses the Haiku model with a small max_tokens cap', () => {
  const req = buildParseRequest('8mm 不鏽鋼');
  assert.equal(req.model, 'claude-haiku-4-5');
  assert.ok(req.max_tokens <= 1000);
});
