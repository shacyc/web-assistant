import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { AdminGate } from '@/pages/admin/AdminGate';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { CountdownListPage } from '@/pages/admin/CountdownListPage';
import { VariablesPage } from '@/pages/admin/VariablesPage';
import { ConfigPage } from '@/pages/admin/ConfigPage';
import { LogsPage } from '@/pages/admin/LogsPage';
import { BotPage } from '@/pages/bot/BotPage';

// Một file route, không lazy — cả app chỉ có vài màn hình.
const router = createBrowserRouter([
    { path: '/', element: <Navigate to="/admin" replace /> },

    // AdminGate chỉ là lớp trải nghiệm — cổng thật là requireAdmin() trên worker.
    {
        path: '/admin',
        element: (
            <AdminGate>
                <AdminLayout />
            </AdminGate>
        ),
        children: [
            // Tạo/sửa countdown là modal trong CountdownListPage — không có route riêng.
            // Bookmark cũ tới /admin/countdowns/* rơi về danh sách thay vì màn 404.
            { index: true, element: <CountdownListPage /> },
            { path: 'countdowns/*', element: <Navigate to="/admin" replace /> },
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
