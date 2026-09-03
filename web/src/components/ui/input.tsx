import * as React from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, type, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input
            type={type}
            className={cn(
                'flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none',
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
