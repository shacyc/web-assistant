import type { ComponentType, SVGProps } from 'react';
import { Hourglass, Activity, CalendarClock, SlidersHorizontal, Variable, History } from 'lucide-react';

// Sidebar dựng từ mảng này — thêm một màn admin = thêm một dòng ở đây, không đụng
// AdminLayout. Cùng tinh thần với registry action của trang /bot.
export interface AdminNavItem {
    to: string;
    label: string;
    icon: ComponentType<SVGProps<SVGSVGElement>>;
    // `end`: chỉ khớp path chính xác — cần cho mục "/admin" để nó không sáng khi ở "/admin/logs".
    end?: boolean;
}

export const adminNav: AdminNavItem[] = [
    { to: '/admin', label: 'Countdown', icon: Hourglass, end: true },
    { to: '/admin/healthchecks', label: 'Health check', icon: Activity },
    { to: '/admin/schedules', label: 'Lịch chạy', icon: CalendarClock },
    { to: '/admin/config', label: 'Cấu hình', icon: SlidersHorizontal },
    { to: '/admin/variables', label: 'Variables', icon: Variable },
    { to: '/admin/logs', label: 'Nhật ký', icon: History },
];

/** Mục nav ứng với path hiện tại — dùng chung cho `isSelected` của sidebar và tiêu đề
 *  thanh bar trên mobile. */
export function matchNav(pathname: string): AdminNavItem | undefined {
    return adminNav.find((i) =>
        i.end ? pathname === i.to : pathname === i.to || pathname.startsWith(`${i.to}/`),
    );
}
