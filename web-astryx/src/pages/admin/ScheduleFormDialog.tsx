import { useEffect, useState, type FormEvent } from 'react';
import { Save, X } from 'lucide-react';
import {
    createSchedule,
    updateSchedule,
    ApiError,
    type Schedule,
    type ActionMeta,
    type ActionField,
} from '@/lib/apiClient';
import { HStack, VStack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TimeInput } from '@astryxdesign/core/TimeInput';
import { Selector } from '@astryxdesign/core/Selector';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { createISOTimeString } from '@astryxdesign/core/utils';
import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@astryxdesign/core/Icon';
import { Dialog } from '@astryxdesign/core/Dialog';
import { FeedbackError } from '@/components/Feedback';
import { DialogTitleBar } from '@/components/DialogTitleBar';

interface Props {
    isOpen: boolean;
    // null → tạo mới; có giá trị → sửa dòng đó.
    editing: Schedule | null;
    // Metadata action từ GET /admin/schedules — dựng ô payload + danh sách chọn việc.
    actions: ActionMeta[];
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}

// Giá trị mặc định cho các field của một action (giống ActionCard của trang /bot).
function defaultsFor(action: ActionMeta | undefined): Record<string, unknown> {
    if (!action) return {};
    return Object.fromEntries(
        action.fields.map((f) => [f.name, f.default ?? (f.type === 'boolean' ? false : '')]),
    );
}

function parsePayload(raw: string): Record<string, unknown> {
    try {
        const v: unknown = JSON.parse(raw);
        return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}

export function ScheduleFormDialog({ isOpen, editing, actions, onOpenChange, onSaved }: Props) {
    const [actionId, setActionId] = useState('');
    const [timeOfDay, setTimeOfDay] = useState(''); // 'HH:MM'
    const [values, setValues] = useState<Record<string, unknown>>({});
    const [enabled, setEnabled] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const selected = actions.find((a) => a.id === actionId);

    // Mỗi lần mở lại: nạp dòng đang sửa (hoặc mặc định) và xoá trạng thái cũ.
    useEffect(() => {
        if (!isOpen) return;
        if (editing) {
            setActionId(editing.actionId);
            setTimeOfDay(editing.timeOfDay);
            setEnabled(editing.enabled);
            const act = actions.find((a) => a.id === editing.actionId);
            // Bắt đầu từ default của action rồi phủ payload đã lưu — field mới thêm vào
            // action sau đó vẫn có giá trị, không phải undefined.
            setValues({ ...defaultsFor(act), ...parsePayload(editing.payload) });
        } else {
            const first = actions[0];
            setActionId(first?.id ?? '');
            setTimeOfDay('');
            setEnabled(true);
            setValues(defaultsFor(first));
        }
        setError(null);
        setBusy(false);
    }, [isOpen, editing, actions]);

    // Đổi việc → nạp lại default của việc mới (trừ khi đang sửa đúng việc cũ).
    function pickAction(id: string) {
        setActionId(id);
        if (!editing || editing.actionId !== id) setValues(defaultsFor(actions.find((a) => a.id === id)));
    }

    function setField(f: ActionField, raw: unknown) {
        setValues((v) => ({ ...v, [f.name]: raw }));
    }

    async function submit(e: FormEvent) {
        e.preventDefault();
        // TimeInput có thể trả 'HH:MM:SS'; backend chỉ nhận 'HH:MM'.
        const time = timeOfDay.slice(0, 5);
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
            setError('Chọn giờ chạy (HH:MM)');
            return;
        }
        if (!actionId) {
            setError('Chọn việc cần chạy');
            return;
        }

        // Số phải là number thật — backend cố ý không ép kiểu (giống trang /bot).
        const payload = Object.fromEntries(
            (selected?.fields ?? []).map((f) => [
                f.name,
                f.type === 'number' ? Number(values[f.name]) : values[f.name],
            ]),
        );

        setBusy(true);
        setError(null);
        try {
            if (editing) await updateSchedule(editing.id, { actionId, timeOfDay: time, payload, enabled });
            else await createSchedule({ actionId, timeOfDay: time, payload, enabled });
            onSaved();
            onOpenChange(false);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Lưu thất bại');
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={520} padding={6}>
            <form onSubmit={submit}>
                <VStack gap={5}>
                    <DialogTitleBar
                        title={editing ? 'Sửa lịch' : 'Lịch mới'}
                        onClose={() => onOpenChange(false)}
                    />

                    <Selector
                        label="Việc cần chạy"
                        placeholder="— chọn việc —"
                        options={actions.map((a) => ({ value: a.id, label: a.label }))}
                        value={actionId}
                        onChange={(v) => pickAction(v ?? '')}
                    />
                    {selected && (
                        <Text type="supporting" color="secondary">
                            {selected.description}
                        </Text>
                    )}

                    <TimeInput
                        label="Giờ chạy (giờ VN)"
                        isRequired
                        hourFormat="24h"
                        value={createISOTimeString(timeOfDay) ?? undefined}
                        onChange={(v) => setTimeOfDay((v ?? '').slice(0, 5))}
                    />
                    <Text type="supporting" color="secondary">
                        Cron quét mỗi 5 phút, nên giờ chạy làm tròn tới mốc 5 phút kế tiếp. Mỗi ngày chạy một lần.
                    </Text>

                    {selected && selected.fields.length > 0 && (
                        <VStack gap={4}>
                            {selected.fields.map((f) =>
                                f.type === 'boolean' ? (
                                    <CheckboxInput
                                        key={f.name}
                                        label={f.label}
                                        description={f.help}
                                        value={Boolean(values[f.name])}
                                        onChange={(checked) => setField(f, checked)}
                                    />
                                ) : (
                                    <TextInput
                                        key={f.name}
                                        label={f.label}
                                        description={f.help}
                                        isRequired={f.required}
                                        value={String(values[f.name] ?? '')}
                                        onChange={(v) => setField(f, v)}
                                    />
                                ),
                            )}
                        </VStack>
                    )}

                    <CheckboxInput
                        label="Đang bật"
                        description="Tắt để tạm dừng job này mà không xoá."
                        value={enabled}
                        onChange={setEnabled}
                    />

                    {error && <FeedbackError>{error}</FeedbackError>}

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
