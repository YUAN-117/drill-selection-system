// @ts-nocheck
// Deno runtime (Supabase Edge Functions) — not run by the repo's Node test suite.
import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';
import { validateTranscript } from './validateInput.js';
import { isRateLimited, HOURLY_REQUEST_LIMIT } from './rateLimit.js';
import { buildParseRequest, VOICE_INPUT_TOOL_NAME } from './promptBuilder.js';
import { parseVoiceToolInput } from './parseAiResponse.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');

  const supabaseAuth = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse({ ok: false, code: 'NOT_AUTHENTICATED' }, 401);
  }
  const userId = userData.user.id;

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, code: 'INVALID_BODY' }, 400);
  }

  const validation = validateTranscript(body?.transcript);
  if (!validation.valid) {
    return jsonResponse({ ok: false, code: validation.reason }, 400);
  }
  const transcript = body.transcript.trim();

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabaseAdmin
    .from('ai_usage')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', oneHourAgo);

  if (countError) {
    return jsonResponse({ ok: false, code: 'SERVER_ERROR' }, 500);
  }
  if (isRateLimited(count ?? 0)) {
    return jsonResponse({ ok: false, code: 'RATE_LIMITED', limit: HOURLY_REQUEST_LIMIT }, 429);
  }

  const anthropic = new Anthropic({ apiKey: anthropicApiKey });
  let aiResponse;
  try {
    aiResponse = await anthropic.messages.create(buildParseRequest(transcript));
  } catch {
    return jsonResponse({ ok: false, code: 'AI_UNAVAILABLE' }, 502);
  }

  // Every request that reaches this point already cost a real AI call, so it
  // counts toward the hourly limit whether or not parsing succeeds.
  await supabaseAdmin.from('ai_usage').insert({ user_id: userId });

  const toolUseBlock = aiResponse.content.find(
    (block) => block.type === 'tool_use' && block.name === VOICE_INPUT_TOOL_NAME
  );
  const parsed = toolUseBlock ? parseVoiceToolInput(toolUseBlock.input) : null;

  if (!parsed) {
    return jsonResponse({ ok: false, code: 'PARSE_FAILED' }, 200);
  }

  return jsonResponse({ ok: true, diameter: parsed.diameter, alloy: parsed.alloy }, 200);
});
