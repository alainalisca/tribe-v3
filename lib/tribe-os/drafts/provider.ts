import { AI_FEATURES } from '@/lib/ai/config';
import { renderDraft, type Draft, type DraftContext } from './templates';

export interface DraftProvider {
  draft(ctx: DraftContext): Promise<Draft>;
}

class TemplateDraftProvider implements DraftProvider {
  async draft(ctx: DraftContext): Promise<Draft> {
    return renderDraft(ctx);
  }
}

class LLMDraftProvider implements DraftProvider {
  async draft(_ctx: DraftContext): Promise<Draft> {
    throw new Error('LLM message drafter is not enabled');
  }
}

let _provider: DraftProvider | null = null;

export function getDraftProvider(): DraftProvider {
  if (!_provider) {
    _provider = AI_FEATURES.MESSAGE_DRAFTER.enabled ? new LLMDraftProvider() : new TemplateDraftProvider();
  }
  return _provider;
}
