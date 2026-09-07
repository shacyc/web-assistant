import { useEffect, useState, type FormEvent } from 'react';
import { Save, Send, TriangleAlert, Copy, Check } from 'lucide-react';
import {
    listVariables,
    getHealthCheckConfig,
    putHealthCheckConfig,
    testHealthCheckConfig,
    ApiError,
    type Variable,
    type HealthCheckNotifyMode,
} from '@/lib/apiClient';
import { HStack, VStack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { Selector } from '@astryxdesign/core/Selector';
import type { SelectorOptionType } from '@astryxdesign/core/Selector';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Button } from '@astryxdesign/core/Button';
import { Spinner } from '@astryxdesign/core/Spinner';
import { Icon } from '@astryxdesign/core/Icon';
import { useClipboard } from '@astryxdesign/core/hooks';
import { FeedbackError, FeedbackNotice } from '@/components/Feedback';

/** Options = key hiện có. Nếu config đang trỏ tới key đã bị xoá, vẫn hiện nó ra kèm nhãn
 *  cảnh báo để không âm thầm mất lựa chọn. */
function optionsFor(keys: string[], selected: string): SelectorOptionType[] {
    const all = selected && !keys.includes(selected) ? [selected, ...keys] : keys;
    return all.map((k) => ({ value: k, label: keys.includes(k) ? k : `${k} (đã xoá)` }));
}

const TEMPLATE_MAX = 4096;

const NOTIFY_MODE_OPTIONS: { value: HealthCheckNotifyMode; label: string; hint: string }[] = [
    {
        value: 'always',
        label: 'Luôn gửi',
        hint: 'Mỗi lần cron kiểm là gửi báo cáo cho mọi site, bất kể trạng thái. Lịch 5 phút = rất nhiều tin nhắn.',
    },
    {
        value: 'on_change',
        label: 'Chỉ khi có thay đổi',
        hint: 'Gửi khi một site đổi trạng thái — cả sập lẫn phục hồi.',
    },
    {
        value: 'on_down',
        label: 'Chỉ khi sập',
        hint: 'Chỉ gửi khi một site chuyển sang sập. Phục hồi không báo.',
    },
];

type Placeholder = { token: string; desc: string };

// Thay theo từng lần state đổi; chữ còn lại trong mẫu giữ nguyên.
const PLACEHOLDERS: Placeholder[] = [
    { token: '{label}', desc: 'Tên site' },
    { token: '{url}', desc: 'URL' },
    { token: '{state}', desc: "Trạng thái mới ('up' / 'down' / chuỗi của checkScript)" },
    { token: '{previousState}', desc: 'Trạng thái trước đó' },
    { token: '{transition}', desc: "'up → down', hoặc chỉ 'up' khi không đổi (chế độ Luôn gửi)" },
    { token: '{stateEmoji}', desc: '🟢 nếu state mới = up, 🔴 nếu khác' },
    { token: '{statusCode}', desc: "Mã HTTP, hoặc '—' nếu lỗi mạng" },
    { token: '{statusLine}', desc: "'HTTP 503' hoặc 'Lỗi: <câu lỗi mạng>'" },
    { token: '{error}', desc: "Câu lỗi mạng/timeout, hoặc '—'" },
    { token: '{durationMs}', desc: 'Thời gian phản hồi (ms)' },
    { token: '{checkedAt}', desc: 'Lúc kiểm, DD/MM/YYYY HH:MM' },
];

const TEMPLATE_EXAMPLE = '{stateEmoji} *{label}*\n{url}\n{transition} · {statusLine}\n{checkedAt}';

/** Danh sách tham số — ấn vào tên để copy, rê chuột để xem mô tả. */
function TokenList({ items }: { items: Placeholder[] }) {
    const { copy, isCopied } = useClipboard({ announce: 'Đã copy' });
    const [copied, setCopied] = useState<string | null>(null);
    return (
        <HStack gap={1} wrap="wrap" vAlign="center">
            {items.map((p) => {
                const done = isCopied && copied === p.token;
                return (
                    <Button
                        key={p.token}
                        variant="ghost"
                        size="sm"
                        label={p.token}
                        tooltip={done ? 'Đã copy' : p.desc}
                        icon={<Icon icon={done ? Check : Copy} size="sm" />}
                        onClick={() => {
                            setCopied(p.token);
                            void copy(p.token);
                        }}
                    />
                );
            })}
        </HStack>
    );
}

interface Props {
    /** Gọi sau khi lưu thành công — nơi dùng trong dialog truyền hàm đóng dialog vào đây. */
    onSaved?: () => void;
    autoFocus?: boolean;
}

/**
 * Form cấu hình health-check: key chat/topic + mẫu tin nhắn. Tự nạp, tự lưu. Dùng chung
 * cho màn Cấu hình (nhúng thẳng) và dialog trong màn Health check.
 */
export function HealthCheckConfigForm({ onSaved, autoFocus }: Props) {
    const [vars, setVars] = useState<Variable[] | null>(null);
    const [chatIdKey, setChatIdKey] = useState('');
    const [topicIdKey, setTopicIdKey] = useState('');
    const [template, setTemplate] = useState('');
    const [notifyMode, setNotifyMode] = useState<HealthCheckNotifyMode>('on_change');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [testing, setTesting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([listVariables(), getHealthCheckConfig()])
            .then(([{ variables }, cfg]) => {
                setVars(variables);
                setChatIdKey(cfg.chatIdKey ?? '');
                setTopicIdKey(cfg.topicIdKey ?? '');
                setTemplate(cfg.template ?? '');
                setNotifyMode(cfg.notifyMode ?? 'on_change');
            })
            .catch((err) => setError(err instanceof ApiError ? err.message : 'Không tải được cấu hình'))
            .finally(() => setLoading(false));
    }, []);

    const keys = vars?.map((v) => v.key) ?? [];
    const valueOf = (key: string) => vars?.find((v) => v.key === key)?.value;

    function preview(key: string): { text: string; warn: boolean } {
        if (!key) return { text: 'Chưa chọn', warn: true };
        if (!keys.includes(key)) return { text: `Key "${key}" không còn trong Variables`, warn: true };
        const v = valueOf(key);
        if (!v) return { text: 'Key này đang rỗng', warn: true };
        return { text: `→ ${v}`, warn: false };
    }

    async function submit(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
            await putHealthCheckConfig({
                chatIdKey: chatIdKey || null,
                topicIdKey: topicIdKey || null,
                template: template.trim() || null,
                notifyMode,
            });
            setNotice('Đã lưu cấu hình health-check');
            onSaved?.();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Lưu thất bại');
        } finally {
            setBusy(false);
        }
    }

    // Chạy thử NGAY bằng cấu hình đang LƯU (không phải nội dung đang gõ dở). `summary`
    // mô tả kết quả: đã gửi mấy thông báo / không có gì đổi / lỗi.
    async function runTest() {
        setTesting(true);
        setError(null);
        setNotice(null);
        try {
            const res = await testHealthCheckConfig();
            if (res.ok) setNotice(res.summary);
            else setError(res.summary);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Chạy thử thất bại');
        } finally {
            setTesting(false);
        }
    }

    if (loading) return <Spinner label="Đang tải…" />;

    if (keys.length === 0) {
        return (
            <VStack gap={3}>
                {error && <FeedbackError>{error}</FeedbackError>}
                <Text type="body" color="secondary">
                    Chưa có key nào. Thêm ở màn <Link href="/admin/variables">Variables</Link> trước.
                </Text>
            </VStack>
        );
    }

    const chatPreview = preview(chatIdKey);
    const topicPreview = topicIdKey ? preview(topicIdKey) : null;

    return (
        <form onSubmit={submit}>
            <VStack gap={5}>
                {error && <FeedbackError>{error}</FeedbackError>}
                {notice && <FeedbackNotice>{notice}</FeedbackNotice>}

                <VStack gap={1}>
                    <Selector
                        label="Key chứa Telegram chat ID"
                        placeholder="— chọn key —"
                        options={optionsFor(keys, chatIdKey)}
                        value={chatIdKey}
                        onChange={(v) => setChatIdKey(v ?? '')}
                    />
                    <Text type="supporting" color={chatPreview.warn ? 'accent' : 'secondary'}>
                        {chatPreview.text}
                    </Text>
                </VStack>

                <VStack gap={1}>
                    <Selector
                        label="Key chứa Topic ID"
                        placeholder="— không dùng (gửi vào General) —"
                        hasClear
                        options={optionsFor(keys, topicIdKey)}
                        value={topicIdKey}
                        onChange={(v) => setTopicIdKey(v ?? '')}
                    />
                    {topicPreview && (
                        <Text type="supporting" color={topicPreview.warn ? 'accent' : 'secondary'}>
                            {topicPreview.text}
                        </Text>
                    )}
                </VStack>

                <VStack gap={1}>
                    <Selector
                        label="Tần suất gửi"
                        options={NOTIFY_MODE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                        value={notifyMode}
                        onChange={(v) => setNotifyMode((v as HealthCheckNotifyMode) || 'on_change')}
                    />
                    <Text
                        type="supporting"
                        color={notifyMode === 'always' ? 'accent' : 'secondary'}
                    >
                        {NOTIFY_MODE_OPTIONS.find((o) => o.value === notifyMode)?.hint}
                    </Text>
                </VStack>

                <VStack gap={2}>
                    <Text type="label" color="primary">Mẫu tin nhắn</Text>
                    <Text type="supporting" color="secondary">
                        Để trống = dùng mẫu mặc định. Render một lần cho mỗi thông báo (mỗi site một tin).
                        Ấn vào tên tham số để copy.
                    </Text>

                    <TextArea
                        label="Nội dung"
                        description="Một tin cho mỗi site được gửi, theo tần suất ở trên."
                        placeholder={TEMPLATE_EXAMPLE}
                        value={template}
                        onChange={setTemplate}
                        rows={6}
                        maxLength={TEMPLATE_MAX}
                        hasSpellCheck={false}
                        hasAutoFocus={autoFocus}
                    />
                    <TokenList items={PLACEHOLDERS} />
                </VStack>

                {!chatIdKey && (
                    <HStack gap={2} vAlign="center">
                        <Icon icon={TriangleAlert} size="sm" color="warning" />
                        <Text type="supporting" color="secondary">
                            Chưa chọn key chat ID — healthcheck.run sẽ báo lỗi thay vì gửi.
                        </Text>
                    </HStack>
                )}

                <HStack gap={2} wrap="wrap">
                    <Button
                        type="submit"
                        label={busy ? 'Đang lưu…' : 'Lưu'}
                        variant="primary"
                        isLoading={busy}
                        isDisabled={testing}
                        icon={<Icon icon={Save} size="sm" />}
                    />
                    <Button
                        type="button"
                        label={testing ? 'Đang chạy…' : 'Chạy thử'}
                        variant="secondary"
                        onClick={runTest}
                        isLoading={testing}
                        isDisabled={busy}
                        icon={<Icon icon={Send} size="sm" />}
                    />
                </HStack>
            </VStack>
        </form>
    );
}
