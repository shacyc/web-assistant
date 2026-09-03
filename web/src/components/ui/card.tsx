import * as React from 'react';
import { cn } from '@/lib/utils';

type Div = React.HTMLAttributes<HTMLDivElement>;

export const Card = ({ className, ...p }: Div) => (
    <div className={cn('bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm', className)} {...p} />
);
export const CardHeader = ({ className, ...p }: Div) => <div className={cn('flex flex-col gap-1.5 px-6', className)} {...p} />;
// leading-tight, không leading-none: dấu chồng tiếng Việt (ầ, ế, ợ, ị) tràn khỏi
// line-box 1.0 và bị bó sát/đè xuống dòng mô tả bên dưới.
export const CardTitle = ({ className, ...p }: Div) => <div className={cn('font-semibold leading-tight', className)} {...p} />;
export const CardDescription = ({ className, ...p }: Div) => (
    <div className={cn('text-muted-foreground text-sm', className)} {...p} />
);
export const CardContent = ({ className, ...p }: Div) => <div className={cn('px-6', className)} {...p} />;
export const CardFooter = ({ className, ...p }: Div) => <div className={cn('flex items-center px-6', className)} {...p} />;
