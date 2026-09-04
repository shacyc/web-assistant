import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Save, X } from 'lucide-react';
import {
    createHealthCheck,
    updateHealthCheck,
    ApiError,
    type HealthCheck,
    type HealthCheckInput,
} from '@/lib/apiClient';
import { HStack, VStack } from '@astryxdesign/core/Stack';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@astryxdesign/core/Icon';
import { Text } from '@astryxdesign/core/Text';
import { Dialog } from '@astryxdesign/core/Dialog';
import { FeedbackError } from '@/components/Feedback';
import { DialogTitleBar } from '@/components/DialogTitleBar';

const empty: HealthCheckInput = { label: '', url: '', enabled: true, checkScript: null };

const SCRIPT_MAX = 4000;

const SCRIPT_EXAMPLE = `// Nhận "probe" (chỉ dữ liệu), return chuỗi trạng thái.
// "up" = khoẻ; chuỗi khác (vd "down") = coi là sập.
const j = JSON.parse(probe.body || "{}");
return probe.status === 200 && j.status === "ok" ? "up" : "down";`;

interface Props {
    isOpen: boolean;
    editing: HealthCheck | null;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}

export function HealthCheckFormDialog({ isOpen, editing, onOpenChange, onSaved }: Props) {
    const [form, setForm] = useState<HealthCheckInput>(empty);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const errorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        setForm(
            editing
                ? {
                      label: editing.label,
                      url: editing.url,
                      enabled: editing.enabled,
                      checkScript: editing.checkScript,
                  }
                : empty,
        );
        setError(null);
        setBusy(false);
    }, [isOpen, editing]);

    useEffect(() => {
        if (error) errorRef.current?.focus();
    }, [error]);

    async function submit(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const payload: HealthCheckInput = { ...form, checkScript: form.checkScript?.trim() || null };
            if (editing) await updateHealthCheck(editing.id, payload);
            else await createHealthCheck(payload);
            onSaved();
            onOpenChange(false);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Lưu thất bại');
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={620} padding={6}>
            <form onSubmit={submit}>
                <VStack gap={5}>
                    <DialogTitleBar
                        title={editing ? 'Sửa site' : 'Site mới'}
                        onClose={() => onOpenChange(false)}
                    />

                    <TextInput
                        label="Tên"
                        isRequired
                        value={form.label}
                        onChange={(v) => setForm({ ...form, label: v })}
                        hasAutoFocus
                    />

                    <TextInput
                        label="URL"
                        isRequired
                        placeholder="https://…"
                        value={form.url}
                        onChange={(v) => setForm({ ...form, url: v })}
                    />

                    <VStack gap={1}>
                        <TextArea
                            label="Hàm kiểm (không bắt buộc)"
                            description="Để trống = luật mặc định: lỗi mạng / timeout / HTTP ≥ 400 → sập."
                            placeholder={SCRIPT_EXAMPLE}
                            value={form.checkScript ?? ''}
                            onChange={(v) => setForm({ ...form, checkScript: v || null })}
                            rows={8}
                            maxLength={SCRIPT_MAX}
                            hasSpellCheck={false}
                        />
                        <Text type="supporting" color="secondary">
                            Thân một hàm JS. Đọc được: <code>probe.url</code>, <code>probe.status</code> (số hoặc null),{' '}
                            <code>probe.ok</code>, <code>probe.statusText</code>, <code>probe.body</code> (chuỗi),{' '}
                            <code>probe.durationMs</code>, <code>probe.error</code> (chuỗi hoặc null).{' '}
                            <code>return</code> một chuỗi — <code>"up"</code> là khoẻ, chuỗi khác coi là sập.
                        </Text>
                    </VStack>

                    <CheckboxInput
                        label="Đang bật"
                        description="Cron chỉ kiểm những site đang bật."
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
