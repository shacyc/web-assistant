import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { listBotActions, botToken, ApiError, type ActionMeta } from '@/lib/apiClient';
import { HStack, VStack } from '@astryxdesign/core/Stack';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Spinner } from '@astryxdesign/core/Spinner';
import { Icon } from '@astryxdesign/core/Icon';
import { PageBody } from '@/components/layout/PageBody';
import { ActionCard } from './ActionCard';

export function BotConsolePage({ onLocked }: { onLocked: () => void }) {
    const [actions, setActions] = useState<ActionMeta[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        listBotActions()
            .then(({ actions }) => setActions(actions))
            .catch((err) => {
                // Token hết hạn giữa chừng thì đá về cổng, đừng để bot nhìn màn hình trống.
                if (err instanceof ApiError && err.status === 401) {
                    botToken.clear();
                    onLocked();
                    return;
                }
                setError(err instanceof ApiError ? err.message : 'Không tải được danh sách action');
            });
    }, [onLocked]);

    function lock() {
        botToken.clear();
        onLocked();
    }

    return (
        <PageBody width={760}>
            <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
                <VStack gap={0}>
                    <Heading level={1}>Bot execute</Heading>
                    <Text type="supporting" color="secondary">
                        Chọn một action, điền form nếu có, rồi ấn Thực thi.
                    </Text>
                </VStack>
                <Button
                    label="Khoá lại"
                    variant="secondary"
                    size="sm"
                    data-action="bot.lock"
                    onClick={lock}
                    icon={<Icon icon={Lock} size="sm" />}
                />
            </HStack>

            {error && <Banner status="error" title={error} container="section" />}
            {actions === null && !error && <Spinner label="Đang tải…" />}
            {actions?.length === 0 && (
                <Text type="body" color="secondary">
                    Chưa có action nào.
                </Text>
            )}

            <VStack gap={4}>
                {actions?.map((a) => (
                    <ActionCard key={a.id} action={a} />
                ))}
            </VStack>
        </PageBody>
    );
}
