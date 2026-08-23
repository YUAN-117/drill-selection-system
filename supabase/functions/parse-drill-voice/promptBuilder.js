export const VOICE_INPUT_TOOL_NAME = 'record_drill_voice_input';

const ALLOWED_ALLOY_KEYS = ['6061', '7075', 'a380'];

export function buildParseRequest(transcript) {
  return {
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    system:
      '你是鑽孔工藝顧問,專精鋁合金鑽孔的鑽頭選用邏輯。使用者會用中文說出一段話,內容通常包含鑽頭直徑(公制,單位 mm)與鋁合金材質。' +
      '請從這段話中萃取出直徑與材質,呼叫 record_drill_voice_input 工具回報結果。' +
      '直徑必須是 1 到 32 之間的數字(mm)。材質只能是 "6061"、"7075"、"a380" 三種鍵值之一(A380 壓鑄鋁也算 a380)。' +
      '如果這段話沒有明確提到直徑或材質,或是你無法判斷,對應欄位直接省略,絕對不要用猜測值。',
    tools: [
      {
        name: VOICE_INPUT_TOOL_NAME,
        description:
          '回報從語音文字中解析出的鑽頭直徑與鋁合金材質,任一欄位無法判斷時省略該欄位,不猜測。',
        input_schema: {
          type: 'object',
          properties: {
            diameter: {
              type: 'number',
              description: '鑽頭直徑,單位 mm,例如 8。無法判斷時不要包含這個欄位。'
            },
            alloy: {
              type: 'string',
              enum: ALLOWED_ALLOY_KEYS,
              description: '鋁合金材質鍵值。無法判斷時不要包含這個欄位。'
            }
          }
        }
      }
    ],
    tool_choice: { type: 'tool', name: VOICE_INPUT_TOOL_NAME },
    messages: [{ role: 'user', content: transcript }]
  };
}
