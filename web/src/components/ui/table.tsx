import * as React from 'react';
import { cn } from '@/lib/utils';

export const Table = ({ className, ...p }: React.TableHTMLAttributes<HTMLTableElement>) => (
    <div className="relative w-full overflow-x-auto">
        <table className={cn('w-full caption-bottom text-sm', className)} {...p} />
    </div>
);
export const TableHeader = (p: React.HTMLAttributes<HTMLTableSectionElement>) => <thead className="[&_tr]:border-b" {...p} />;
export const TableBody = (p: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <tbody className="[&_tr:last-child]:border-0" {...p} />
);
export const TableRow = ({ className, ...p }: React.HTMLAttributes<HTMLTableRowElement>) => (
    <tr className={cn('hover:bg-muted/50 border-b', className)} {...p} />
);
export const TableHead = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
    <th className={cn('text-muted-foreground h-10 px-2 text-left align-middle font-medium', className)} {...p} />
);
export const TableCell = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
    <td className={cn('p-2 align-middle', className)} {...p} />
);
