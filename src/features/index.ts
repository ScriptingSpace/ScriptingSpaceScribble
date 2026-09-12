// Each feature self-registers as a plugin on import (plug-and-play).
// Adding a new feature = create the folder + register a plugin + add one line here.
// Registration ORDER matters: the sidebar plugin fills the LEFT column slot,
// the text-reader plugin contributes the content tabs on the right.
export * from './sidebar';
export * from './textReader';
