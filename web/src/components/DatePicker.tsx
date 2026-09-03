import { useState } from 'react';
import { IconCalendar } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// Công thức "Date Picker" của shadcn: Popover + Button + Calendar. shadcn không phát ra
// file riêng cho nó — đây là chỗ ráp lại, và bọc thêm phần đổi chuỗi yyyy-mm-dd <-> Date.

// Luôn theo giờ địa phương: `new Date('2026-09-03')` bị hiểu là UTC, ở múi giờ lệch âm sẽ
// lùi một ngày. Tách chuỗi thủ công để né hẳn đường vòng qua UTC.
function parse(s: string): Date | undefined {
    if (!s) return undefined;
    const [y, m, day] = s.split('-').map(Number);
    if (!y || !m || !day) return undefined;
    return new Date(y, m - 1, day);
}
function toISODate(date: Date): string {
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${m}-${day}`;
}

const label = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

interface DatePickerProps {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    /** Chặn chọn ngày trước mốc này (yyyy-mm-dd). */
    min?: string;
    /** DatePicker là <button>, không có validation native — form tự gắn khi thiếu ngày. */
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
}

export function DatePicker({
    id,
    value,
    onChange,
    min,
    'aria-invalid': ariaInvalid,
    'aria-describedby': ariaDescribedby,
}: DatePickerProps) {
    const [open, setOpen] = useState(false);
    const selected = parse(value);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    id={id}
                    aria-invalid={ariaInvalid}
                    aria-describedby={ariaDescribedby}
                    variant="outline"
                    // Kéo cho khớp <Input>: canh trái, chữ thường, cùng shadow-xs. Nền/viền
                    // đã do variant="outline" lo (border-input + dark:bg-input/30).
                    className={cn(
                        'w-full justify-start px-3 font-normal shadow-xs',
                        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
                        !selected && 'text-muted-foreground',
                    )}
                >
                    <IconCalendar stroke={2} />
                    {selected ? label.format(selected) : 'Chọn ngày'}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                    mode="single"
                    selected={selected}
                    // Chưa chọn gì thì mở ở tháng của `min` (vd ngày kết thúc mở đúng
                    // tháng ngày bắt đầu) thay vì tháng hiện tại.
                    defaultMonth={selected ?? (min ? parse(min) : undefined)}
                    disabled={min ? { before: parse(min)! } : undefined}
                    onSelect={(date) => {
                        if (date) onChange(toISODate(date));
                        setOpen(false);
                    }}
                />
            </PopoverContent>
        </Popover>
    );
}
