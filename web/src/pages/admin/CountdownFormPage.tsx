import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

const empty: CountdownInput = { event: '', description: null, startDate: '', endDate: '', enabled: true };

export function CountdownFormPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const editing = Boolean(id);

    const [form, setForm] = useState<CountdownInput>(empty);
    const [loading, setLoading] = useState(editing);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

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
        setBusy(true);
        setError(null);
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

    if (loading) return <p className="text-muted-foreground p-8 text-sm">Đang tải…</p>;

    return (
        <div className="mx-auto max-w-xl px-4 py-8">
            <Card>
                <CardHeader>
                    <CardTitle>{editing ? 'Sửa sự kiện' : 'Sự kiện mới'}</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={submit} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="event">Tên sự kiện</Label>
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

                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="startDate">Ngày bắt đầu</Label>
                                <Input
                                    id="startDate"
                                    name="startDate"
                                    type="date"
                                    value={form.startDate}
                                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="endDate">Ngày kết thúc</Label>
                                <Input
                                    id="endDate"
                                    name="endDate"
                                    type="date"
                                    value={form.endDate}
                                    min={form.startDate || undefined}
                                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                                    required
                                />
                            </div>
                        </div>

                        <Label htmlFor="enabled">
                            <input
                                id="enabled"
                                name="enabled"
                                type="checkbox"
                                className="size-4"
                                checked={form.enabled}
                                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                            />
                            Đang bật (bot sẽ tính sự kiện này)
                        </Label>

                        {error && (
                            <Alert variant="destructive">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        <div className="flex gap-2">
                            <Button type="submit" disabled={busy}>
                                {busy ? 'Đang lưu…' : 'Lưu'}
                            </Button>
                            <Button type="button" variant="outline" onClick={() => navigate('/admin')}>
                                Huỷ
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
