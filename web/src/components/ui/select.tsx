import * as React from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { cn } from '@/lib/utils';

/**
 * `<select>` gốc được tô lại cho khớp <Input>, KHÔNG phải shadcn/@radix-ui/react-select.
 * Cả app chỉ cần vài select đơn giản; đổi lấy một dependency nữa (radix) chưa đáng —
 * xem quy ước "thêm dependency phải cân nhắc" trong CLAUDE.md. Nếu sau này cần popup có
 * style riêng / search / nhóm option thì nâng lên radix.
 *
 * `appearance-none` bỏ mũi tên mặc định của OS (nguồn gốc "trông tệ"), thay bằng
 * IconChevronDown canh phải như trigger của shadcn.
 */
export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <div className="relative">
            <select
                className={cn(
                    // Giống <Input>: text-base trên mobile (Safari iOS zoom nếu < 16px), 14px từ md.
                    'flex h-9 w-full min-w-0 appearance-none rounded-md border border-input bg-transparent py-1 pr-9 pl-3 text-base shadow-xs outline-none md:text-sm dark:bg-input/30',
                    'focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    // Firefox/Linux: cho danh sách option dùng nền theme thay vì trắng phẳng.
                    '[&>option]:bg-popover [&>option]:text-popover-foreground',
                    className,
                )}
                {...props}
            >
                {children}
            </select>
            <IconChevronDown
                aria-hidden="true"
                className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
                stroke={2}
            />
        </div>
    );
}
