// Vitest setup — polyfills CodeMirror 6 needs that jsdom does not provide.
// Without these, @uiw/react-codemirror crashes on mount in the jsdom
// environment (ResizeObserver is used by @codemirror/view's measuring logic).

// Minimal ResizeObserver stub — CodeMirror only observes, never reads entries
class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}
const globalScope = globalThis as Record<string, unknown>;
if (!globalScope.ResizeObserver) {
    globalScope.ResizeObserver = ResizeObserverStub;
}

// jsdom has no layout engine — CodeMirror measures via getBoundingClientRect /
// getClientRects, so return zeroed rects instead of throwing
if (typeof Element !== 'undefined' && !Element.prototype.getBoundingClientRect) {
    Element.prototype.getBoundingClientRect = function () {
        return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) } as DOMRect;
    };
}
if (typeof Element !== 'undefined' && !Element.prototype.getClientRects) {
    Element.prototype.getClientRects = function () {
        return [] as DOMRectList;
    };
}
