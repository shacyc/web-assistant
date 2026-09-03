import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { AdminGate } from '@/pages/admin/AdminGate';
import { CountdownListPage } from '@/pages/admin/CountdownListPage';
import { CountdownFormPage } from '@/pages/admin/CountdownFormPage';
import { LogsPage } from '@/pages/admin/LogsPage';
import { BotPage } from '@/pages/bot/BotPage';

// Một file route, không lazy — cả app chỉ có năm màn hình.
const router = createBrowserRouter([
    { path: '/', element: <Navigate to="/admin" replace /> },

    // AdminGate chỉ là lớp trải nghiệm. Cổng thật là requireAdmin() trên worker.
    { path: '/admin', element: <AdminGate><CountdownListPage /></AdminGate> },
    { path: '/admin/countdowns/new', element: <AdminGate><CountdownFormPage /></AdminGate> },
    { path: '/admin/countdowns/:id', element: <AdminGate><CountdownFormPage /></AdminGate> },
    { path: '/admin/logs', element: <AdminGate><LogsPage /></AdminGate> },

    { path: '/bot', element: <BotPage /> },
]);

export function App() {
    return <RouterProvider router={router} />;
}
