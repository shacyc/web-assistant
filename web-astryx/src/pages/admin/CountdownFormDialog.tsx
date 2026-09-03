import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Save, X } from 'lucide-react';
import {
    createCountdown,
    updateCountdown,
    ApiError,
    type CountdownEvent,
    type CountdownInput,
} from '@/lib/apiClient';
import { HStack, VStack } from '@astryxdesign/core/Stack';
import { Grid } from '@astryxdesign/core/Grid';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { DateInput } from '@astryxdesign/core/DateInput';
import type { ISODateString } from '@astryxdesign/core/utils';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@astryxdesign/core/Icon';
import { Dialog } from '@astryxdesign/core/Dialog';
import { FeedbackError } from '@/components/Feedback';
import { DialogTitleBar } from '@/components/DialogTitleBar';

const empty: CountdownInput = { event: '', description: null, startDate: '', endDate: '', enabled: true };

// State giữ ngày dạng chuỗi thường (khớp kiểu API). DateInput đòi kiểu template-literal
// `ISODateString`; đổi ở đúng ranh giới này thay vì nhuộm kiểu đó khắp form.
const asISO = (s: string): ISODateString | undefined => (s ? (s as ISODateString) : undefined);

interface Props {
    isOpen: boolean;
    // null → tạo mới; có giá trị → sửa dòng đó. Danh sách đã tải sẵn nên truyền
    // thẳng row vào, khỏi GET lại một dòng (backend cũng không có endpoint đó).
    editing: CountdownEvent | null;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}

export function CountdownFormDialog({ isOpen, editing, onOpenChange, onSaved }: Props) {
    const [form, setForm] = useState<CountdownInput>(empty);
    const [error, setError] = useState<string | null>(null);
    // Lỗi ngày tách riêng: DateInput là control tuỳ biến, không có validation `required`
    // native — chặn tay và gắn status vào đúng ô còn trống.
    const [dateError, setDateError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const errorRef = useRef<HTMLDivElement>(null);

    // Mỗi lần mở lại: nạp dữ liệu dòng đang sửa (hoặc form rỗng) và xoá trạng thái cũ.
    useEffect(() => {
        if (!isOpen) return;
        setForm(
            editing
                ? {
                      event: editing.event,
                      description: editing.description,
                      startDate: editing.startDate,
                      endDate: editing.endDate,
                      enabled: editing.enabled,
                  }
                : empty,
        );
        setError(null);
        setDateError(null);
        setBusy(false);
    }, [isOpen, editing]);

    useEffect(() => {
        if (error) errorRef.current?.focus();
    }, [error]);

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (!form.startDate || !form.endDate) {
            setDateError('Chọn đủ ngày bắt đầu và kết thúc');
            return;
        }
        setBusy(true);
        setError(null);
        setDateError(null);
        try {
            if (editing) await updateCountdown(editing.id, form);
            else await createCountdown(form);
            onSaved();
            onOpenChange(false);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Lưu thất bại');
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={560} padding={6}>
            <form onSubmit={submit}>
                <VStack gap={5}>
                    <DialogTitleBar
                        title={editing ? 'Sửa sự kiện' : 'Sự kiện mới'}
                        onClose={() => onOpenChange(false)}
                    />

                    <TextInput
                        label="Tên sự kiện"
                        isRequired
                        value={form.event}
                        onChange={(v) => setForm({ ...form, event: v })}
                        hasAutoFocus
                    />

                    <TextArea
                        label="Mô tả"
                        value={form.description ?? ''}
                        onChange={(v) => setForm({ ...form, description: v || null })}
                        rows={3}
                        maxLength={1000}
                    />

                    <Grid columns={2} gap={4}>
                        <DateInput
                            label="Ngày bắt đầu"
                            isRequired
                            value={asISO(form.startDate)}
                            onChange={(v) => {
                                setForm({ ...form, startDate: v ?? '' });
                                setDateError(null);
                            }}
                            status={
                                dateError && !form.startDate ? { type: 'error', message: dateError } : undefined
                            }
                        />
                        <DateInput
                            label="Ngày kết thúc"
                            isRequired
                            value={asISO(form.endDate)}
                            min={asISO(form.startDate)}
                            onChange={(v) => {
                                setForm({ ...form, endDate: v ?? '' });
                                setDateError(null);
                            }}
                            status={
                                dateError && !form.endDate ? { type: 'error', message: dateError } : undefined
                            }
                        />
                    </Grid>

                    <CheckboxInput
                        label="Đang bật"
                        description="Bot sẽ tính sự kiện này khi chạy countdown."
                        value={form.enabled}
                        onChange={(checked) => setForm({ ...form, enabled: checked })}
                    />

                    {error && <FeedbackError ref={errorRef}>{error}</FeedbackError>}

                    <HStack gap={2}>
                        <Button
                            type="submit"
                            label={busy ? 'Đang lưu…' : 'Lưu'}
                            variant="primary"
                            isLoading={busy}
                            icon={<Icon icon={Save} size="sm" />}
                        />
                        <Button
                            type="button"
                            label="Huỷ"
                            variant="secondary"
                            onClick={() => onOpenChange(false)}
                            icon={<Icon icon={X} size="sm" />}
                        />
                    </HStack>
                </VStack>
            </form>
        </Dialog>
    );
}
