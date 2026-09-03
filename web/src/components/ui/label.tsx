import * as React from 'react';
import { cn } from '@/lib/utils';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
    return (
        <label
            // leading-tight thay leading-none: chừa chỗ cho dấu chồng tiếng Việt.
            className={cn('flex items-center gap-2 text-sm leading-tight font-medium select-none', className)}
            {...props}
        />
    );
}
