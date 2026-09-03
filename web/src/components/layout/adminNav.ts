import { type Icon, IconHourglass, IconHistory, IconAdjustments, IconVariable } from '@tabler/icons-react';

// Sidebar dựng từ mảng này — thêm một màn admin = thêm một dòng ở đây, không đụng
// AdminLayout. Cùng tinh thần với registry action của trang /bot: layout không hardcode
// tính năng nào.
export interface AdminNavItem {
    to: string;
    label: string;
    icon: Icon;
    // NavLink mặc định coi là "active" cho cả path con. `end` bắt khớp path chính xác —
    // cần cho mục trỏ tới "/admin" để nó không sáng khi đang ở "/admin/logs".
    end?: boolean;
}

export const adminNav: AdminNavItem[] = [
    { to: '/admin', label: 'Countdown', icon: IconHourglass, end: true },
    { to: '/admin/config', label: 'Cấu hình', icon: IconAdjustments },
    { to: '/admin/variables', label: 'Variables', icon: IconVariable },
    { to: '/admin/logs', label: 'Nhật ký', icon: IconHistory },
];
