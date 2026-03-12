/**
 * Chat system prompts for research ideation assistant.
 * Supports both English and Chinese.
 */

const CHAT_SYSTEM_PROMPT_EN = [
  'You are a research ideation assistant helping researchers explore and develop novel research ideas.',
  'You engage in thoughtful, conversational dialogue to help the user brainstorm, refine, and deepen research directions.',
  'Draw on the provided papers context to ground your suggestions in concrete evidence.',
  'Ask clarifying questions, suggest connections between ideas, and help the user think through feasibility and novelty.',
  'Be concise but substantive. Respond in English.',
].join(' ');

const CHAT_SYSTEM_PROMPT_ZH = [
  '你是一位研究创意助手，帮助研究人员探索和发展新颖的研究想法。',
  '你通过深思熟虑的对话，帮助用户进行头脑风暴、完善和深化研究方向。',
  '利用提供的论文上下文，为你的建议提供具体的证据支持。',
  '提出澄清性问题，建议想法之间的联系，并帮助用户思考可行性和新颖性。',
  '简洁但有深度。用中文回复。',
].join('');

const CHAT_CONTEXT_INTRO_EN = 'I will discuss research ideas with you. Please be ready.';
const CHAT_CONTEXT_INTRO_ZH = '我将与你讨论研究想法。请准备好。';

const CHAT_CONTEXT_RESPONSE_EN =
  "I understand the project context and the provided materials. I'm ready to help you explore and develop research ideas. What would you like to discuss?";
const CHAT_CONTEXT_RESPONSE_ZH =
  '我理解了项目上下文和提供的材料。我准备好帮助你探索和发展研究想法了。你想讨论什么？';

/**
 * Get the system prompt for the chat assistant based on language.
 * @param language - 'en' or 'zh'
 */
export function getChatSystemPrompt(language: 'en' | 'zh' = 'en'): string {
  return language === 'zh' ? CHAT_SYSTEM_PROMPT_ZH : CHAT_SYSTEM_PROMPT_EN;
}

/**
 * Get the context introduction message based on language.
 * This is the user message that introduces the paper context.
 */
export function getChatContextIntro(language: 'en' | 'zh' = 'en'): string {
  return language === 'zh' ? CHAT_CONTEXT_INTRO_ZH : CHAT_CONTEXT_INTRO_EN;
}

/**
 * Get the assistant's response to the context introduction.
 */
export function getChatContextResponse(language: 'en' | 'zh' = 'en'): string {
  return language === 'zh' ? CHAT_CONTEXT_RESPONSE_ZH : CHAT_CONTEXT_RESPONSE_EN;
}
