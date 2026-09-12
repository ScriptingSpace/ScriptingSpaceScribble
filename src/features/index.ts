// Each feature self-registers as a plugin on import (plug-and-play).
// Adding a new feature = create the folder + register a plugin + add one
// line here. Registration ORDER is the fallback tab order: text-reader
// first, json-viewer second — so non-matching files render [Editor][Json].
// Matching files (e.g. .json) are reordered by the dashboard's `matches`
// hook to [Json][Editor].
export * from './sidebar';
export * from './textReader';
export * from './jsonViewer';
