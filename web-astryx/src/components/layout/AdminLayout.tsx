import { Outlet, useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { AppShell } from '@astryxdesign/core/AppShell';
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav';
import { adminLogout } from '@/lib/apiClient';
import { adminNav } from './adminNav';

// Khung chung cho mọi màn admin: AppShell + SideNav cố định, nội dung đổi theo route
// (<Outlet/>). SideNavItem dùng href → LinkProvider định tuyến phía client.
export function AdminLayout() {
    const { pathname } = useLocation();

    // Không điều hướng bằng router sau logout: cookie session vừa bị xoá, nạp lại trang
    // là cách chắc chắn nhất để mọi state phía client sạch.
    const logout = () => adminLogout().then(() => location.reload());

    const isActive = (to: string, end?: boolean) =>
        end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);

    return (
        <AppShell
            contentPadding={0}
            sideNav={
                <SideNav
                    header={<SideNavHeading heading="web-assistant" subheading="astryx" />}
                    footer={
                        <SideNavSection title="Phiên" isHeaderHidden>
                            {/* SideNavItem (không href) thay vì Button: text canh trái, đồng bộ
                                với các mục menu bên trên. */}
                            <SideNavItem label="Đăng xuất" icon={LogOut} onClick={logout} />
                        </SideNavSection>
                    }
                >
                    <SideNavSection title="Menu" isHeaderHidden>
                        {adminNav.map((item) => (
                            <SideNavItem
                                key={item.to}
                                label={item.label}
                                href={item.to}
                                icon={item.icon}
                                isSelected={isActive(item.to, item.end)}
                            />
                        ))}
                    </SideNavSection>
                </SideNav>
            }
        >
            <Outlet />
        </AppShell>
    );
}
