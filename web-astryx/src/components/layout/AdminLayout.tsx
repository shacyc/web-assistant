import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { LogOut, Bot } from 'lucide-react';
import { AppShell, useAppShellMobile } from '@astryxdesign/core/AppShell';
import {
    SideNav,
    SideNavCollapseButton,
    SideNavHeading,
    SideNavItem,
    SideNavSection,
} from '@astryxdesign/core/SideNav';
import { Icon } from '@astryxdesign/core/Icon';
import { adminLogout } from '@/lib/apiClient';
import { adminNav, matchNav } from './adminNav';

// Nhớ trạng thái thu gọn qua lần refresh — dev không có HMR nên refresh liên tục,
// mỗi lần lại bung sidebar thì phiền. Hỏng localStorage (chế độ riêng tư) thì thôi.
const COLLAPSE_KEY = 'admin.sidebar.collapsed';
const readCollapsed = () => {
    try {
        return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
        return false;
    }
};

type CollapseToggle = { isCollapsed: boolean; onCollapsedChange: (v: boolean) => void };

// Header của SideNav. Tách ra thành component riêng để đọc được context mobile của
// AppShell (chỉ có bên trong cây AppShell).
// - Mở (desktop): icon robot + nút thu gọn ở mép phải hàng heading.
// - Thu gọn (desktop): ô icon đổi thành nút bung; text heading bị ẩn ở rail hẹp.
// - Mobile: luôn là icon robot — drawer luôn full width, không có khái niệm thu gọn.
function AdminSideNavHeader({ toggle }: { toggle: CollapseToggle }) {
    const { isMobile } = useAppShellMobile();
    const collapsed = toggle.isCollapsed && !isMobile;

    return (
        <SideNavHeading
            heading="Secretary"
            icon={collapsed ? <SideNavCollapseButton collapsible={toggle} /> : <Icon icon={Bot} />}
            headerEndContent={
                collapsed || isMobile ? undefined : <SideNavCollapseButton collapsible={toggle} />
            }
        />
    );
}

// Khung chung cho mọi màn admin: AppShell + SideNav, nội dung đổi theo route (<Outlet/>).
// - Desktop: sidebar thu gọn/bung được — nút toggle nằm ngay ở header (xem AdminSideNavHeader).
// - <= md (768px): AppShell tự chuyển SideNav thành thanh bar + drawer hamburger, và tự
//   đóng drawer sau khi điều hướng — không phải tự dựng gì thêm.
export function AdminLayout() {
    const { pathname } = useLocation();
    const [collapsed, setCollapsed] = useState(readCollapsed);

    useEffect(() => {
        try {
            localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
        } catch {
            /* bỏ qua: chỉ mất việc nhớ trạng thái */
        }
    }, [collapsed]);

    // Không điều hướng bằng router sau logout: cookie session vừa bị xoá, nạp lại trang
    // là cách chắc chắn nhất để mọi state phía client sạch.
    const logout = () => adminLogout().then(() => location.reload());

    const activeTo = matchNav(pathname)?.to;

    // Nút collapse/expand chia sẻ đúng state này (không dùng nút mặc định của SideNav).
    const collapseToggle: CollapseToggle = { isCollapsed: collapsed, onCollapsedChange: setCollapsed };

    return (
        <AppShell
            contentPadding={0}
            mobileNav={{ breakpoint: 'md' }}
            sideNav={
                <SideNav
                    collapsible={{ ...collapseToggle, hasButton: false }}
                    header={<AdminSideNavHeader toggle={collapseToggle} />}
                    footer={
                        <SideNavSection title="Phiên" isHeaderHidden>
                            {/* SideNavItem (không href) thay vì Button: text canh trái, đồng bộ
                                với các mục menu bên trên, và tự thu về icon khi collapse. */}
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
                                isSelected={activeTo === item.to}
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
