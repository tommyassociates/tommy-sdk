/** Shared local presentation helper. Visibility never grants server access. */
function visibleChatIds(elements, idKey, { active = false, viewport, windowBounds } = {}) {
  if (active !== true || !viewport || !windowBounds) return [];
  const finite = (rect) => ['top', 'left', 'bottom', 'right'].every((key) => Number.isFinite(rect?.[key]));
  if (!finite(viewport) || !finite(windowBounds)) return [];
  const visible = {
    top: Math.max(viewport.top, windowBounds.top),
    left: Math.max(viewport.left, windowBounds.left),
    bottom: Math.min(viewport.bottom, windowBounds.bottom),
    right: Math.min(viewport.right, windowBounds.right),
  };
  if (visible.bottom <= visible.top || visible.right <= visible.left) return [];
  const ids = new Set();
  let inspected = 0;
  for (const element of elements || []) {
    if (inspected >= 200) break;
    inspected += 1;
    const id = element?.dataset?.[idKey];
    if (element.isConnected === false || !/^[1-9][0-9]*$/.test(id || '') || !Number.isSafeInteger(Number(id))) continue;
    const rect = element.getBoundingClientRect?.();
    if (!finite(rect) || rect.bottom <= rect.top || rect.right <= rect.left) continue;
    const height = Math.min(rect.bottom, visible.bottom) - Math.max(rect.top, visible.top);
    const width = Math.min(rect.right, visible.right) - Math.max(rect.left, visible.left);
    // A tall message can be observed without requiring it to fit on the screen.
    if (width > 0 && height >= Math.min(rect.bottom - rect.top, visible.bottom - visible.top) / 2) ids.add(String(id));
  }
  return [...ids];
}

export function visibleChatMessageIds(elements, options) {
  return visibleChatIds(elements, 'chatMessageId', options);
}

export function visibleChatConversationIds(elements, options) {
  return visibleChatIds(elements, 'conversationId', options);
}
