import { ConnectedFileSidebar } from '../../components';
import { registerScribblePlugin } from '../../functions';

// SIDEBAR PLUGIN — assigns the file list into the dashboard's LEFT sidebar
// slot. The ConnectedFileSidebar reads the shared file session itself via
// scribbleFileStore() (src/functions/fileStore.ts), so the dashboard shell
// needs no prop wiring for it. It renders no file content (no renderFile),
// so it never contributes a content tab. Pattern mirrors the Formatter's
// sidebar plugin (cross-reference:
// distribution/ScriptingSpaceFormatter/src/plugins/sidebar/SidebarPlugin.tsx).
registerScribblePlugin({
    id: 'sidebar',
    slots: {
        sidebar: <ConnectedFileSidebar />,
    },
});
