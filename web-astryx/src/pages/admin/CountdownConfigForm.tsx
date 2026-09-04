import { useEffect, useState, type FormEvent } from 'react';
import { Save, TriangleAlert, Copy, Check } from 'lucide-react';
import { listVariables, getCountdownConfig, putCountdownConfig, ApiError, type Variable } from '@/lib/apiClient';
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

type Placeholder = { token: string; desc: string };

// Dùng trong `header` / `footer` — ghép một lần, chỉ có thông tin toàn cục.
const ONCE_PLACEHOLDERS: Placeholder[] = [
    { token: '{today}', desc: 'Hôm nay, dd/MM/yyyy' },
    { token: '{count}', desc: 'Số sự kiện đang chạy' },
];

// Dùng trong mẫu nội dung — thay theo từng sự kiện đang chạy; chữ còn lại giữ nguyên.
const BODY_PLACEHOLDERS: Placeholder[] = [
    { token: '{eventName}', desc: 'Tên sự kiện' },
    { token: '{startDate}', desc: 'Ngày bắt đầu, dd/MM/yyyy' },
    { token: '{endDate}', desc: 'Ngày kết thúc, dd/MM/yyyy' },
    { token: '{totalDays}', desc: 'Tổng số ngày của chặng' },
    { token: '{totalWeeks}', desc: 'Tổng số tuần của chặng (2 số lẻ)' },
    { token: '{passedDays}', desc: 'Số ngày đã qua' },
    { token: '{passedWeeks}', desc: 'Số tuần đã qua (2 số lẻ)' },
    { token: '{remainDays}', desc: 'Số ngày còn lại' },
    { token: '{remainWeeks}', desc: 'Số tuần còn lại (2 số lẻ)' },
    { token: '{remainDaysPercent}', desc: 'Phần trăm chặng còn lại (2 số lẻ)' },
    { token: '{remainWeeksPercent}', desc: 'Như trên, tính theo tuần' },
    { token: '{dailyPercent}', desc: 'Mỗi ngày trôi qua mất bao nhiêu % (2 số lẻ)' },
    { token: '{progress}', desc: 'Thanh tiến độ ▓▓░░' },
    { token: '{today}', desc: 'Hôm nay, dd/MM/yyyy' },
];

const HEADER_EXAMPLE = '📅 Countdown {today} — {count} sự kiện';
const BODY_EXAMPLE = '*{eventName}*\nCòn {remainDays} ngày ({remainWeeksPercent}%)\n{progress}';
const FOOTER_EXAMPLE = '_Cập nhật tự động_';

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
 * Form cấu hình countdown: key chat/topic + ba mảnh mẫu tin nhắn. Tự nạp dữ liệu, tự
 * lưu. Dùng chung cho màn Cấu hình (nhúng thẳng) và dialog trong màn Countdown.
 */
export function CountdownConfigForm({ onSaved, autoFocus }: Props) {
    const [vars, setVars] = useState<Variable[] | null>(null);
    const [chatIdKey, setChatIdKey] = useState('');
    const [topicIdKey, setTopicIdKey] = useState('');
    const [header, setHeader] = useState('');
    const [template, setTemplate] = useState('');
    const [footer, setFooter] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([listVariables(), getCountdownConfig()])
            .then(([{ variables }, cfg]) => {
                setVars(variables);
                setChatIdKey(cfg.chatIdKey ?? '');
                setTopicIdKey(cfg.topicIdKey ?? '');
                setHeader(cfg.header ?? '');
                setTemplate(cfg.template ?? '');
                setFooter(cfg.footer ?? '');
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
            await putCountdownConfig({
                chatIdKey: chatIdKey || null,
                topicIdKey: topicIdKey || null,
                header: header.trim() || null,
                template: template.trim() || null,
                footer: footer.trim() || null,
            });
            setNotice('Đã lưu cấu hình countdown');
            onSaved?.();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Lưu thất bại');
        } finally {
            setBusy(false);
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

                <VStack gap={2}>
                    <Text type="label" color="primary">Mẫu tin nhắn</Text>
                    <Text type="supporting" color="secondary">
                        Cả ba để trống = dùng mẫu mặc định. Mảnh nào để trống thì không ghép vào tin nhắn.
                        Ấn vào tên tham số để copy.
                    </Text>

                    <TextArea
                        label="Tiêu đề (header)"
                        description="Ghép một lần ở đầu tin nhắn."
                        placeholder={HEADER_EXAMPLE}
                        value={header}
                        onChange={setHeader}
                        rows={2}
                        maxLength={TEMPLATE_MAX}
                        hasSpellCheck={false}
                        hasAutoFocus={autoFocus}
                    />
                    <TokenList items={ONCE_PLACEHOLDERS} />

                    <TextArea
                        label="Nội dung mỗi sự kiện (body)"
                        description="Render một lần cho mỗi sự kiện đang chạy."
                        placeholder={BODY_EXAMPLE}
                        value={template}
                        onChange={setTemplate}
                        rows={6}
                        maxLength={TEMPLATE_MAX}
                        hasSpellCheck={false}
                    />
                    <TokenList items={BODY_PLACEHOLDERS} />

                    <TextArea
                        label="Chân (footer)"
                        description="Ghép một lần ở cuối tin nhắn."
                        placeholder={FOOTER_EXAMPLE}
                        value={footer}
                        onChange={setFooter}
                        rows={2}
                        maxLength={TEMPLATE_MAX}
                        hasSpellCheck={false}
                    />
                    <TokenList items={ONCE_PLACEHOLDERS} />
                </VStack>

                {!chatIdKey && (
                    <HStack gap={2} vAlign="center">
                        <Icon icon={TriangleAlert} size="sm" color="warning" />
                        <Text type="supporting" color="secondary">
                            Chưa chọn key chat ID — countdown.notify sẽ báo lỗi thay vì gửi.
                        </Text>
                    </HStack>
                )}

                <Button
                    type="submit"
                    label={busy ? 'Đang lưu…' : 'Lưu'}
                    variant="primary"
                    isLoading={busy}
                    icon={<Icon icon={Save} size="sm" />}
                />
            </VStack>
        </form>
    );
}
