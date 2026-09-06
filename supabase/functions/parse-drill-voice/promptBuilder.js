export const VOICE_INPUT_TOOL_NAME = 'record_drill_voice_input';

const ALLOWED_MATERIAL_KEYS = [
  'aluminum:6061',
  'aluminum:7075',
  'aluminum:a380',
  'copper:brass',
  'stainless:standard',
  'peek:standard',
  'pc:standard',
  'pom:standard'
];

export function buildParseRequest(transcript) {
  return {
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    system:
      '你是鑽孔工藝顧問,專精鋁合金、銅合金、不鏽鋼與工程塑膠(PEEK/PC/POM)的鑽孔鑽頭選用邏輯。使用者會用中文說出一段話,內容通常包含鑽頭直徑(公制,單位 mm)與工件材料。' +
      '請從這段話中萃取出直徑與材料,呼叫 record_drill_voice_input 工具回報結果。' +
      '直徑必須是 1 到 32 之間的數字(mm)。材料只能是以下鍵值之一:' +
      '"aluminum:6061"(鋁合金 6061)、"aluminum:7075"(鋁合金 7075)、"aluminum:a380"(鋁合金 A380 壓鑄鋁)、' +
      '"copper:brass"(黃銅/銅合金)、"stainless:standard"(不鏽鋼)、"peek:standard"(PEEK)、"pc:standard"(PC/聚碳酸酯)、"pom:standard"(POM/Delrin/賽鋼)。' +
      '如果這段話沒有明確提到直徑或材料,或是你無法判斷對應哪個鍵值,對應欄位直接省略,絕對不要用猜測值。',
    tools: [
      {
        name: VOICE_INPUT_TOOL_NAME,
        description:
          '回報從語音文字中解析出的鑽頭直徑與工件材料,任一欄位無法判斷時省略該欄位,不猜測。',
        input_schema: {
          type: 'object',
          properties: {
            diameter: {
              type: 'number',
              description: '鑽頭直徑,單位 mm,例如 8。無法判斷時不要包含這個欄位。'
            },
            material: {
              type: 'string',
              enum: ALLOWED_MATERIAL_KEYS,
              description: '工件材料鍵值,格式為「大類:子項」,例如 "stainless:standard"。無法判斷時不要包含這個欄位。'
            }
          }
        }
      }
    ],
    tool_choice: { type: 'tool', name: VOICE_INPUT_TOOL_NAME },
    messages: [{ role: 'user', content: transcript }]
  };
}
