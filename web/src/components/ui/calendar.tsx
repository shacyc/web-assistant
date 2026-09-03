import { DayPicker, getDefaultClassNames, type DayPickerProps } from 'react-day-picker';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

// Calendar chuẩn shadcn (new-york) cho react-day-picker v9: gộp lên `getDefaultClassNames()`
// rồi đè bằng token Tailwind. Chevron đổi sang tabler cho khớp phần còn lại của app;
// không nạp `react-day-picker/style.css` — toàn bộ style đến từ `classNames` dưới đây.
export function Calendar({ className, classNames, showOutsideDays = true, ...props }: DayPickerProps) {
    const d = getDefaultClassNames();
    return (
        <DayPicker
            showOutsideDays={showOutsideDays}
            className={cn('p-3', className)}
            classNames={{
                months: cn(d.months, 'relative flex flex-col gap-4'),
                month: cn(d.month, 'flex flex-col gap-4'),
                month_caption: cn(d.month_caption, 'flex h-9 items-center justify-center px-9'),
                caption_label: cn(d.caption_label, 'text-sm font-medium'),
                nav: cn(d.nav, 'absolute inset-x-0 top-0 flex items-center justify-between'),
                button_previous: cn(buttonVariants({ variant: 'outline' }), 'size-9 p-0'),
                button_next: cn(buttonVariants({ variant: 'outline' }), 'size-9 p-0'),
                month_grid: 'w-full border-collapse',
                weekdays: cn(d.weekdays, 'flex'),
                weekday: cn(d.weekday, 'text-muted-foreground w-9 text-[0.8rem] font-normal'),
                week: cn(d.week, 'mt-2 flex w-full'),
                day: cn(d.day, 'size-9 p-0 text-center text-sm'),
                day_button: cn(
                    buttonVariants({ variant: 'ghost' }),
                    'size-9 p-0 font-normal',
                    'aria-selected:bg-primary aria-selected:text-primary-foreground',
                    'aria-selected:hover:bg-primary aria-selected:hover:text-primary-foreground',
                ),
                today: cn(d.today, 'bg-accent text-accent-foreground rounded-md'),
                outside: cn(d.outside, 'text-muted-foreground opacity-50'),
                disabled: cn(d.disabled, 'text-muted-foreground opacity-50'),
                hidden: cn(d.hidden, 'invisible'),
                ...classNames,
            }}
            components={{
                Chevron: ({ orientation, className: cls }) =>
                    orientation === 'left' ? (
                        <IconChevronLeft className={cn('size-4', cls)} stroke={2} />
                    ) : (
                        <IconChevronRight className={cn('size-4', cls)} stroke={2} />
                    ),
            }}
            {...props}
        />
    );
}
