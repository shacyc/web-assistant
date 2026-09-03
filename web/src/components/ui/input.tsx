import * as React from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, type, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input
            type={type}
            className={cn(
                // text-base (16px) trên mobile: Safari iOS phóng to viewport khi focus input
                // có font < 16px. md trở lên kéo về 14px cho gọn.
                // border-input (token dành riêng, đậm hơn --border) + nền mờ dark:bg-input/30
                // để ô tách khỏi mặt Card thay vì chỉ dựa vào viền 12% gần như vô hình.
                'flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none md:text-sm dark:bg-input/30',
                'file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium',
                'placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
                className,
            )}
            {...props}
        />
    );
}
