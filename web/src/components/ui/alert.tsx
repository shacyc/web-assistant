import * as React from 'react';
import { cn } from '@/lib/utils';

type Div = React.HTMLAttributes<HTMLDivElement>;

export const Alert = ({ className, variant = 'default', ...p }: Div & { variant?: 'default' | 'destructive' }) => (
    <div
        role="alert"
        className={cn(
            'relative w-full rounded-lg border px-4 py-3 text-sm',
            variant === 'destructive' && 'text-destructive border-destructive/50',
            className,
        )}
        {...p}
    />
);
export const AlertTitle = ({ className, ...p }: Div) => <div className={cn('font-medium', className)} {...p} />;
export const AlertDescription = ({ className, ...p }: Div) => (
    <div className={cn('text-muted-foreground text-sm', className)} {...p} />
);
