import { supabaseAdmin } from './supabase';

/**
 * Checks if the user has exceeded their daily token budget (10k tokens).
 * If exceeded, returns isBlocked: true and a message.
 */
export async function checkTokenBudget(userId: string, userText: string = '', endpoint: string = '/api/chat') {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartStr = todayStart.toISOString();
  
  let totalTokensToday = 0;
  try {
    const { data: usageData, error: usageError } = await supabaseAdmin
      .from('api_usage')
      .select('tokens_input, tokens_output')
      .eq('user_id', userId)
      .gte('created_at', todayStartStr);

    if (usageError) throw usageError;
    if (usageData) {
      for (const row of usageData) {
        totalTokensToday += (row.tokens_input || 0) + (row.tokens_output || 0);
      }
    }
  } catch (err) {
    console.error(`[Budget] Error checking token budget for user ${userId}:`, err);
  }

  // Daily limit: 10,000 tokens
  if (totalTokensToday >= 10000) {
    const blockMsg = "Dzienny limit tokenów (10k) został wyczerpany. Wróć jutro!";
    
    // Log the block event in message_logs (specifically for endpoint /api/chat)
    if (endpoint === '/api/chat') {
      try {
        await supabaseAdmin.from('message_logs').insert({
          user_id: userId,
          message_length: userText.length,
          blocked: true,
          message: userText.slice(0, 1000),
          reason: 'token_budget_limit'
        });
      } catch (logErr) {
        console.error("[Budget] Error logging token budget block to message_logs:", logErr);
      }
    }

    return {
      isBlocked: true,
      blockMsg,
      totalTokensToday
    };
  }

  return {
    isBlocked: false,
    totalTokensToday
  };
}

/**
 * Logs token usage for a user.
 */
export async function logTokenUsage(
  userId: string,
  tokensInput: number,
  tokensOutput: number,
  model: string,
  endpoint: string
) {
  if (tokensInput <= 0 && tokensOutput <= 0) return;
  
  try {
    const { error } = await supabaseAdmin.from('api_usage').insert({
      user_id: userId,
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      model,
      endpoint
    });
    if (error) throw error;
    console.log(`[Usage Log] Logged ${tokensInput} input and ${tokensOutput} output tokens for model ${model} in ${endpoint}`);
  } catch (dbErr) {
    console.error("[Budget] Error inserting to api_usage:", dbErr);
  }
}
