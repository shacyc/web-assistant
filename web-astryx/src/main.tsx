import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Theme } from '@astryxdesign/core/theme';
import { LinkProvider } from '@astryxdesign/core/Link';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { App } from './App';
import { RouterLink } from './lib/router';
import './index.css';

// mode="dark" cố định: bản shadcn cũ cũng ép .dark cứng trên <html>. Đổi sang "system"
// nếu sau này muốn theo OS.
createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <Theme theme={neutralTheme} mode="dark">
            <LinkProvider component={RouterLink}>
                <App />
            </LinkProvider>
        </Theme>
    </StrictMode>,
);
