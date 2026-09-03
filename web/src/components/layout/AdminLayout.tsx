import { NavLink, Outlet } from 'react-router-dom';
import { IconLogout } from '@tabler/icons-react';
import { adminLogout } from '@/lib/apiClient';
import { cn } from '@/lib/utils';
import { adminNav } from './adminNav';

// Khung chung cho mọi màn admin: sidebar cố định + vùng nội dung đổi theo route
// (<Outlet/>). Các trang con chỉ lo phần thân của mình, không tự vẽ nav/đăng xuất nữa.
export function AdminLayout() {
    // Không gọi apiClient.adminLogout() rồi điều hướng bằng router: cookie session vừa bị
    // xoá, cách chắc chắn nhất để mọi state phía client sạch là nạp lại trang.
    const logout = () => adminLogout().then(() => location.reload());

    return (
        <div className="flex min-h-dvh flex-col md:flex-row">
            <aside className="bg-card flex shrink-0 flex-col gap-1 border-b p-3 md:w-56 md:border-r md:border-b-0">
                <div className="px-3 py-2">
                    <span className="text-sm font-semibold">web-assistant</span>
                </div>

                {/* md trở lên: cột dọc. Mobile: hàng ngang cuộn được cho gọn. */}
                <nav className="flex flex-row gap-1 overflow-x-auto md:flex-col md:overflow-visible">
                    {adminNav.map(({ to, label, icon: Icon, end }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={end}
                            className={({ isActive }) =>
                                cn(
                                    // min-h-11 (44px) trên mobile cho đủ vùng chạm; desktop về mặc định.
                                    'flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap md:min-h-0',
                                    isActive
                                        ? 'bg-secondary text-secondary-foreground font-medium'
                                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                                )
                            }
                        >
                            <Icon className="size-4 shrink-0" stroke={2} />
                            {label}
                        </NavLink>
                    ))}
                </nav>

                <button
                    type="button"
                    onClick={logout}
                    className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm md:mt-auto md:min-h-0"
                >
                    <IconLogout className="size-4 shrink-0" stroke={2} />
                    Đăng xuất
                </button>
            </aside>

            <main className="min-w-0 flex-1">
                <Outlet />
            </main>
        </div>
    );
}
