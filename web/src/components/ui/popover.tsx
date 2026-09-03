import * as React from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { cn } from '@/lib/utils';

// Popover chuẩn shadcn, bản Base UI (`@base-ui/react` — primitive mặc định của shadcn từ
// 07/2026). Bỏ hết class animation/transition cho hợp quy ước "không animation" của dự án;
// phần className còn lại giữ nguyên như shadcn phát ra.
//
// Khác Radix: KHÔNG có `asChild`. Muốn nút mở popover là component khác thì truyền qua
// prop `render` của Trigger — vd `<PopoverTrigger render={<Button />} />`, xem DatePicker.tsx.
// Và content tách làm ba lớp: Portal → Positioner (định vị) → Popup (khung nội dung),
// nên `align` / `sideOffset` giờ nằm ở Positioner chứ không phải ở chính Popup.
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

type PopoverContentProps = React.ComponentProps<typeof PopoverPrimitive.Popup> & {
    align?: 'start' | 'center' | 'end';
    side?: 'top' | 'right' | 'bottom' | 'left';
    sideOffset?: number;
};

export function PopoverContent({ className, align = 'center', side, sideOffset = 4, ...props }: PopoverContentProps) {
    return (
        <PopoverPrimitive.Portal>
            <PopoverPrimitive.Positioner align={align} side={side} sideOffset={sideOffset}>
                <PopoverPrimitive.Popup
                    className={cn(
                        'bg-popover text-popover-foreground z-50 w-72 rounded-md border p-4 shadow-md outline-none',
                        className,
                    )}
                    {...props}
                />
            </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
    );
}
