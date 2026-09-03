import * as React from 'react';
import { cn } from '@/lib/utils';

type Div = React.HTMLAttributes<HTMLDivElement>;

// forwardRef: form cần focus() vào alert sau khi submit hỏng (xem CountdownFormPage).
// Kèm tabIndex={-1} + outline-none ở call site để focus không vẽ thêm ring.
export const Alert = React.forwardRef<HTMLDivElement, Div & { variant?: 'default' | 'destructive' }>(
    ({ className, variant = 'default', ...p }, ref) => (
        <div
            ref={ref}
            role="alert"
            className={cn(
                'relative w-full rounded-lg border px-4 py-3 text-sm outline-none',
                variant === 'destructive' && 'text-destructive border-destructive/50',
                className,
            )}
            {...p}
        />
    ),
);
Alert.displayName = 'Alert';
export const AlertTitle = ({ className, ...p }: Div) => <div className={cn('font-medium', className)} {...p} />;
export const AlertDescription = ({ className, ...p }: Div) => (
    <div className={cn('text-muted-foreground text-sm', className)} {...p} />
);
