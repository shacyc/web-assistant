import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { AdminGate } from '@/pages/admin/AdminGate';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { CountdownListPage } from '@/pages/admin/CountdownListPage';
import { CountdownFormPage } from '@/pages/admin/CountdownFormPage';
import { VariablesPage } from '@/pages/admin/VariablesPage';
import { ConfigPage } from '@/pages/admin/ConfigPage';
import { LogsPage } from '@/pages/admin/LogsPage';
import { BotPage } from '@/pages/bot/BotPage';

// Một file route, không lazy — cả app chỉ có vài màn hình.
const router = createBrowserRouter([
    { path: '/', element: <Navigate to="/admin" replace /> },

    // AdminGate chỉ là lớp trải nghiệm — cổng thật là requireAdmin() trên worker.
    // AdminLayout dựng sidebar + <Outlet/>; mỗi màn admin là một route con bên dưới.
    {
        path: '/admin',
        element: (
            <AdminGate>
                <AdminLayout />
            </AdminGate>
        ),
        children: [
            { index: true, element: <CountdownListPage /> },
            { path: 'countdowns/new', element: <CountdownFormPage /> },
            { path: 'countdowns/:id', element: <CountdownFormPage /> },
            { path: 'config', element: <ConfigPage /> },
            { path: 'variables', element: <VariablesPage /> },
            { path: 'logs', element: <LogsPage /> },
        ],
    },

    { path: '/bot', element: <BotPage /> },
]);

export function App() {
    return <RouterProvider router={router} />;
}
