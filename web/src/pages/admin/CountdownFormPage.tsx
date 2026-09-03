import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { IconDeviceFloppy, IconX } from '@tabler/icons-react';
import {
    createCountdown,
    updateCountdown,
    listCountdowns,
    ApiError,
    type CountdownInput,
} from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/DatePicker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

const empty: CountdownInput = { event: '', description: null, startDate: '', endDate: '', enabled: true };

// Dấu bắt buộc. aria-hidden: <input required> đã báo cho screen reader; ô ngày dùng
// DatePicker (<button>) không có required native nên đây chỉ là gợi ý thị giác.
const Req = () => (
    <span aria-hidden="true" className="text-destructive">
        {' '}
        *
    </span>
);

export function CountdownFormPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const editing = Boolean(id);

    const [form, setForm] = useState<CountdownInput>(empty);
    const [loading, setLoading] = useState(editing);
    const [error, setError] = useState<string | null>(null);
    // Lỗi ngày tách riêng: hiển thị ngay dưới cụm DatePicker và gắn vào field bằng
    // aria-describedby, không dồn hết vào Alert cuối form.
    const [dateError, setDateError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const errorRef = useRef<HTMLDivElement>(null);

    // Submit hỏng ở cuối form dài — kéo focus về Alert để người dùng thấy ngay.
    useEffect(() => {
        if (error) errorRef.current?.focus();
    }, [error]);

    useEffect(() => {
        if (!editing) return;
        // Không có endpoint GET một dòng — với vài chục bản ghi thì lọc từ danh sách rẻ
        // hơn là thêm một route nữa. Khi nào dữ liệu lớn lên thì thêm.
        listCountdowns()
            .then(({ countdowns }) => {
                const row = countdowns.find((c) => c.id === id);
                if (!row) {
                    setError('Không tìm thấy sự kiện này');
                    return;
                }
                setForm({
                    event: row.event,
                    description: row.description,
                    startDate: row.startDate,
                    endDate: row.endDate,
                    enabled: row.enabled,
                });
            })
            .catch(() => setError('Không tải được dữ liệu'))
            .finally(() => setLoading(false));
    }, [id, editing]);

    async function submit(e: FormEvent) {
        e.preventDefault();
        // DatePicker là <button>, không có validation `required` của trình duyệt như
        // <input type="date"> cũ — chặn tay ở đây trước khi gọi API.
        if (!form.startDate || !form.endDate) {
            setDateError('Chọn đủ ngày bắt đầu và kết thúc');
            document.getElementById(form.startDate ? 'endDate' : 'startDate')?.focus();
            return;
        }
        setBusy(true);
        setError(null);
        setDateError(null);
        try {
            if (editing) await updateCountdown(id!, form);
            else await createCountdown(form);
            navigate('/admin');
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Lưu thất bại');
        } finally {
            setBusy(false);
        }
    }

    if (loading)
        return (
            <p role="status" className="text-muted-foreground p-8 text-sm">
                Đang tải…
            </p>
        );

    return (
        <div className="mx-auto max-w-xl px-4 py-8">
            <Card>
                <CardHeader>
                    <CardTitle>{editing ? 'Sửa sự kiện' : 'Sự kiện mới'}</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={submit} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="event">
                                <span>
                                    Tên sự kiện
                                    <Req />
                                </span>
                            </Label>
                            <Input
                                id="event"
                                name="event"
                                value={form.event}
                                onChange={(e) => setForm({ ...form, event: e.target.value })}
                                required
                                maxLength={200}
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <Label htmlFor="description">Mô tả</Label>
                            <Textarea
                                id="description"
                                name="description"
                                value={form.description ?? ''}
                                onChange={(e) => setForm({ ...form, description: e.target.value || null })}
                                maxLength={1000}
                            />
                        </div>

                        <div>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="startDate">
                                        <span>
                                            Ngày bắt đầu
                                            <Req />
                                        </span>
                                    </Label>
                                    <DatePicker
                                        id="startDate"
                                        value={form.startDate}
                                        onChange={(v) => {
                                            setForm({ ...form, startDate: v });
                                            setDateError(null);
                                        }}
                                        aria-invalid={Boolean(dateError) && !form.startDate}
                                        aria-describedby={dateError ? 'date-error' : undefined}
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="endDate">
                                        <span>
                                            Ngày kết thúc
                                            <Req />
                                        </span>
                                    </Label>
                                    <DatePicker
                                        id="endDate"
                                        value={form.endDate}
                                        min={form.startDate || undefined}
                                        onChange={(v) => {
                                            setForm({ ...form, endDate: v });
                                            setDateError(null);
                                        }}
                                        aria-invalid={Boolean(dateError) && !form.endDate}
                                        aria-describedby={dateError ? 'date-error' : undefined}
                                    />
                                </div>
                            </div>
                            {dateError && (
                                <p id="date-error" role="alert" className="text-destructive mt-2 text-sm">
                                    {dateError}
                                </p>
                            )}
                        </div>

                        {/* Bọc trong ô có viền như các field khác để hàng checkbox không bị
                           lạc lõng giữa form. */}
                        <Label
                            htmlFor="enabled"
                            className="border-input cursor-pointer rounded-md border px-3 py-2.5 font-normal dark:bg-input/30"
                        >
                            <input
                                id="enabled"
                                name="enabled"
                                type="checkbox"
                                className="size-4 shrink-0 cursor-pointer accent-primary"
                                checked={form.enabled}
                                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                            />
                            <span>
                                Đang bật <span className="text-muted-foreground">— bot sẽ tính sự kiện này</span>
                            </span>
                        </Label>

                        {error && (
                            <Alert ref={errorRef} tabIndex={-1} variant="destructive">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        <div className="border-border mt-1 flex gap-2 border-t pt-4">
                            <Button type="submit" disabled={busy}>
                                <IconDeviceFloppy stroke={2} />
                                {busy ? 'Đang lưu…' : 'Lưu'}
                            </Button>
                            <Button type="button" variant="outline" onClick={() => navigate('/admin')}>
                                <IconX stroke={2} />
                                Huỷ
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
