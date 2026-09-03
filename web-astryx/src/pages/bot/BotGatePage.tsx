import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LockOpen } from 'lucide-react';
import { openBotSession, ApiError } from '@/lib/apiClient';
import { Card } from '@astryxdesign/core/Card';
import { Center } from '@astryxdesign/core/Center';
import { VStack } from '@astryxdesign/core/Stack';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Icon } from '@astryxdesign/core/Icon';

/**
 * Cổng vào trang bot. Trang này public — ai cũng tải được HTML — nhưng không API nào trả
 * dữ liệu trước khi đổi được secret lấy token.
 *
 * `id`/`name` ở đây là HỢP ĐỒNG với AI bot, không phải chi tiết trình bày. Dùng control
 * native để giữ id ổn định (Astryx TextInput tự sinh id). Xem bot.css + CLAUDE.md.
 */
export function BotGatePage({ onUnlocked }: { onUnlocked: () => void }) {
    const [secret, setSecret] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const errorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (error) errorRef.current?.focus();
    }, [error]);

    async function submit(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await openBotSession(secret);
            onUnlocked();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Không kết nối được máy chủ');
        } finally {
            setBusy(false);
        }
    }

    return (
        <Center axis="both" padding={6} style={{ minHeight: '100dvh' }}>
            <VStack gap={4} width="100%" style={{ maxWidth: 400 }}>
                <Card padding={8} width="100%">
                    <form onSubmit={submit}>
                        <VStack gap={4}>
                            <VStack gap={1}>
                                <Heading level={2}>Bot execute</Heading>
                                <Text type="supporting" color="secondary">
                                    Nhập secret key để mở bảng điều khiển.
                                </Text>
                            </VStack>

                            <div className="bot-field">
                                <label htmlFor="secret">Secret key</label>
                                <input
                                    id="secret"
                                    name="secret"
                                    className="bot-input"
                                    type="password"
                                    autoComplete="off"
                                    value={secret}
                                    onChange={(e) => setSecret(e.target.value)}
                                    required
                                />
                            </div>

                            {error && (
                                <div ref={errorRef} tabIndex={-1} data-testid="gate-error" style={{ outline: 'none' }}>
                                    <Banner status="error" title={error} container="section" />
                                </div>
                            )}

                            <Button
                                type="submit"
                                data-action="bot.unlock"
                                label={busy ? 'Đang kiểm tra…' : 'Mở khoá'}
                                variant="primary"
                                isLoading={busy}
                                isDisabled={!secret}
                                icon={<Icon icon={LockOpen} size="sm" />}
                            />
                        </VStack>
                    </form>
                </Card>
            </VStack>
        </Center>
    );
}
