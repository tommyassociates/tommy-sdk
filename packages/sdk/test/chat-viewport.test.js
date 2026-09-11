import { describe, expect, it, vi } from 'vitest';
import { visibleChatMessageIds } from '../src/chat-viewport.js';

const bounds = { top: 0, left: 0, bottom: 600, right: 400 };
const options = { active: true, viewport: bounds, windowBounds: bounds };
const row = (id, top, bottom, extra = {}) => ({
  dataset: { chatMessageId: String(id) },
  getBoundingClientRect: vi.fn(() => ({ top, bottom, left: 0, right: 400 })),
  ...extra,
});

describe('shared local chat viewport selection', () => {
  it('observes only rendered rows at least half inside the actual viewport', () => {
    expect(visibleChatMessageIds([row(1, -100, -1), row(2, -40, 20), row(3, -20, 20), row(4, 20, 90), row(5, 590, 620)], options)).toEqual(['3', '4']);
  });
  it('allows tall messages and clips an offscreen container to the window', () => {
    expect(visibleChatMessageIds([row(1, -50, 1200)], options)).toEqual(['1']);
    expect(visibleChatMessageIds([row(2, 650, 700)], { ...options, viewport: { ...bounds, bottom: 1000 } })).toEqual([]);
  });
  it('does no layout work for an inactive or malformed surface', () => {
    const element = row(1, 0, 30);
    expect(visibleChatMessageIds([element], { ...options, active: false })).toEqual([]);
    expect(visibleChatMessageIds([element], { ...options, viewport: null })).toEqual([]);
    expect(element.getBoundingClientRect).not.toHaveBeenCalled();
  });
  it('never accepts optimistic IDs, disconnected or zero-sized rows', () => {
    expect(visibleChatMessageIds([row('draft-1', 0, 30), row(0, 0, 30), row(1, 0, 0), row(2, 0, 30, { isConnected: false }), row('9007199254740992', 0, 30)], options)).toEqual([]);
  });
  it('deduplicates IDs and bounds layout reads to the 200-row render budget', () => {
    const rows = Array.from({ length: 210 }, (_, i) => row(i + 1, 0, 30));
    expect(visibleChatMessageIds(rows, options)).toHaveLength(200);
    expect(rows[200].getBoundingClientRect).not.toHaveBeenCalled();
    expect(visibleChatMessageIds([row(1, 0, 30), row(1, 30, 60)], options)).toEqual(['1']);
  });
});
