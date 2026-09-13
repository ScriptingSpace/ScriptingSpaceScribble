// Each feature self-registers as a plugin on import (plug-and-play).
// Adding a new feature = create the folder + register a plugin + add one
// line here. Registration ORDER is the fallback tab order: text-reader
// first, json-viewer second — so non-matching files render [Editor][Json].
// Matching files (e.g. .json) are reordered by the dashboard's `matches`
// hook to [Json][Editor].
//
// openapi-viewer registers AFTER yaml-viewer deliberately: both match
// .yaml/.yml files, and yaml-viewer must keep its registration-order slot
// for generic YAML. Genuine OpenAPI/Swagger docs are pulled to the FRONT by
// the dashboard's matches-first ordering (openapi-viewer's matches returns
// true there), so the OpenAPI tab wins for spec files without disturbing
// generic YAML ordering (cross-reference:
// src/dashboards/ScribbleDashboard.tsx — matched/unmatched partition).
export * from './sidebar';
export * from './textReader';
export * from './jsonViewer';
export * from './markdownViewer';
export * from './yamlViewer';
export * from './openApiViewer';
export * from './imageViewer';
export * from './pdfViewer';
export * from './settings';
