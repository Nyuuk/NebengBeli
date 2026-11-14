// Local-only browser fixture: real consumers, API responses supplied by Playwright.
// Not imported by the production entry point or exposed as an application route.
import { createRoot } from 'react-dom/client';
import { CssBaseline } from '@mui/material';
import { App } from '../../App';
import { RekapTextModal } from '../../components/RekapTextModal';

const recap = new URLSearchParams(location.search).has('recap');
createRoot(document.getElementById('root')!).render(
  recap ? <><CssBaseline /><RekapTextModal open wallet={{
    id: 'local-wallet', name: 'Local layout fixture', creator_id: 'local-admin',
    creator_username: 'local_admin', balance: 0, entry_count: 0,
    is_archived: false, created_at: '2026-01-01T00:00:00Z',
  }} entries={[]} onClose={() => {}} /></> : <App />
);
