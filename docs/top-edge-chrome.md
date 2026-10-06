# Temporary top-edge colour

Host API 6 adds `tommy.ui.setTopEdge({ color, content })` and `tommy.ui.resetTopEdge()`. Declare `minHostApi: 6` when an MP depends on these methods. Colours are six-digit hex values; `content` is `auto` (default), `light` or `dark` for the status-bar icons. The capability covers the web safe-area strip, Android status bar and iOS window/WebView background. Updated iOS native builds must include the `TommyAppearance.setTopEdgeBackground` bridge.

```js
await tommy.ui.setTopEdge({ color: '#1c1c1e', content: 'light' });
// On leaving the view:
await tommy.ui.resetTopEdge();
```

The override belongs to the SDK instance, not to the user's saved theme. Reset when your view is hidden or closed; host instance disposal and account switching also release it. The latest active instance wins. Resetting one instance cannot clear another's colour. Call screens take precedence, then restore the underlying view override or current app theme when dismissed.

Host-owned web views use the shared core `setTopEdgeChrome(owner, options)` service. Keep a stable private owner per view, and call the returned release function during view cleanup. MPs use the SDK methods and never call native plugins directly.
