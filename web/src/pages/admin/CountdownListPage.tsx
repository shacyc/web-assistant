import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconPlus, IconPencil, IconTrash } from '@tabler/icons-react';
import { listCountdowns, deleteCountdown, ApiError, type CountdownEvent } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

/** Cùng cách tính "hôm nay" với backend, để admin nhìn thấy đúng thứ bot sẽ gửi. */
const todayVN = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' })
        .format(new Date());

function phaseOf(row: CountdownEvent, today: string) {
    if (!row.enabled) return { label: 'Tắt', variant: 'outline' as const };
    if (today < row.startDate) return { label: 'Chưa tới', variant: 'secondary' as const };
    if (today > row.endDate) return { label: 'Đã xong', variant: 'outline' as const };
    return { label: 'Đang chạy', variant: 'default' as const };
}

export function CountdownListPage() {
    const [rows, setRows] = useState<CountdownEvent[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const today = todayVN();

    function reload() {
        listCountdowns()
            .then(({ countdowns }) => setRows(countdowns))
            .catch((err) => setError(err instanceof ApiError ? err.message : 'Không tải được dữ liệu'));
    }

    useEffect(reload, []);

    async function remove(row: CountdownEvent) {
        if (!confirm(`Xoá "${row.event}"?`)) return;
        try {
            await deleteCountdown(row.id);
            reload();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Xoá thất bại');
        }
    }

    return (
        <div className="mx-auto max-w-4xl px-4 py-8">
            <header className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold">Countdown</h1>
                    <p className="text-muted-foreground text-sm">Hôm nay: {today}</p>
                </div>
                <Link to="/admin/countdowns/new">
                    <Button size="sm">
                        <IconPlus stroke={2} />
                        Thêm sự kiện
                    </Button>
                </Link>
            </header>

            {error && (
                <Alert variant="destructive" className="mb-4">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {rows === null && (
                <p role="status" className="text-muted-foreground text-sm">
                    Đang tải…
                </p>
            )}
            {rows?.length === 0 && <p className="text-muted-foreground text-sm">Chưa có sự kiện nào.</p>}

            {rows && rows.length > 0 && (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Sự kiện</TableHead>
                            <TableHead>Bắt đầu</TableHead>
                            <TableHead>Kết thúc</TableHead>
                            <TableHead>Trạng thái</TableHead>
                            <TableHead>
                                <span className="sr-only">Hành động</span>
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((row) => {
                            const phase = phaseOf(row, today);
                            return (
                                <TableRow key={row.id}>
                                    <TableCell>
                                        <div className="font-medium">{row.event}</div>
                                        {row.description && (
                                            <div className="text-muted-foreground text-xs">{row.description}</div>
                                        )}
                                    </TableCell>
                                    <TableCell className="tabular-nums">{row.startDate}</TableCell>
                                    <TableCell className="tabular-nums">{row.endDate}</TableCell>
                                    <TableCell>
                                        <Badge variant={phase.variant}>{phase.label}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right whitespace-nowrap">
                                        {/* gap-1 + viền tách nút Xoá (đỏ) khỏi Sửa để tránh
                                           bấm nhầm; h-9 cho vùng chạm rộng hơn h-8 mặc định của size sm. */}
                                        <div className="flex items-center justify-end gap-1">
                                            <Link to={`/admin/countdowns/${row.id}`}>
                                                <Button variant="ghost" size="sm" className="h-9">
                                                    <IconPencil stroke={2} />
                                                    Sửa
                                                </Button>
                                            </Link>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => remove(row)}
                                                className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9"
                                            >
                                                <IconTrash stroke={2} />
                                                Xoá
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            )}
        </div>
    );
}
