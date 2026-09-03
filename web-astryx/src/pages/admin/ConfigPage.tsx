import { useEffect, useState, type FormEvent } from 'react';
import { Save, TriangleAlert } from 'lucide-react';
import { listVariables, getCountdownConfig, putCountdownConfig, ApiError, type Variable } from '@/lib/apiClient';
import { Card } from '@astryxdesign/core/Card';
import { HStack, VStack } from '@astryxdesign/core/Stack';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { Selector } from '@astryxdesign/core/Selector';
import type { SelectorOptionType } from '@astryxdesign/core/Selector';
import { Button } from '@astryxdesign/core/Button';
import { Spinner } from '@astryxdesign/core/Spinner';
import { Icon } from '@astryxdesign/core/Icon';
import { PageBody } from '@/components/layout/PageBody';
import { FeedbackError, FeedbackNotice } from '@/components/Feedback';

/** Options = key hiện có. Nếu config đang trỏ tới key đã bị xoá, vẫn hiện nó ra kèm nhãn
 *  cảnh báo để không âm thầm mất lựa chọn. */
function optionsFor(keys: string[], selected: string): SelectorOptionType[] {
    const all = selected && !keys.includes(selected) ? [selected, ...keys] : keys;
    return all.map((k) => ({ value: k, label: keys.includes(k) ? k : `${k} (đã xoá)` }));
}

export function ConfigPage() {
    const [vars, setVars] = useState<Variable[] | null>(null);
    const [chatIdKey, setChatIdKey] = useState('');
    const [topicIdKey, setTopicIdKey] = useState('');
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
            await putCountdownConfig({ chatIdKey: chatIdKey || null, topicIdKey: topicIdKey || null });
            setNotice('Đã lưu cấu hình countdown');
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Lưu thất bại');
        } finally {
            setBusy(false);
        }
    }

    if (loading) return <PageBody><Spinner label="Đang tải…" /></PageBody>;

    const chatPreview = preview(chatIdKey);
    const topicPreview = topicIdKey ? preview(topicIdKey) : null;

    return (
        <PageBody width={640}>
            <VStack gap={1}>
                <Heading level={1}>Cấu hình</Heading>
                <Text type="supporting" color="secondary">
                    Chọn key trong <Link href="/admin/variables">Variables</Link> để mỗi tính năng lấy cấu hình.
                </Text>
            </VStack>

            {error && <FeedbackError>{error}</FeedbackError>}
            {notice && <FeedbackNotice>{notice}</FeedbackNotice>}

            <Card padding={8}>
                <VStack gap={5}>
                    <Heading level={2}>Countdown</Heading>

                    {keys.length === 0 ? (
                        <Text type="body" color="secondary">
                            Chưa có key nào. Thêm ở màn <Link href="/admin/variables">Variables</Link> trước.
                        </Text>
                    ) : (
                        <form onSubmit={submit}>
                            <VStack gap={5}>
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
                    )}
                </VStack>
            </Card>
        </PageBody>
    );
}
