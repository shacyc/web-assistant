import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { LogIn } from 'lucide-react';
import { adminLogin, adminMe, ApiError } from '@/lib/apiClient';
import { Card } from '@astryxdesign/core/Card';
import { Center } from '@astryxdesign/core/Center';
import { VStack } from '@astryxdesign/core/Stack';
import { Heading, Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@astryxdesign/core/Button';
import { Spinner } from '@astryxdesign/core/Spinner';
import { Icon } from '@astryxdesign/core/Icon';
import { FeedbackError } from '@/components/Feedback';

/**
 * Chỉ là lớp trải nghiệm — cổng thật nằm ở `requireAdmin()` trên worker. Đừng bao giờ
 * coi việc render được component con là bằng chứng đã xác thực.
 */
export function AdminGate({ children }: { children: ReactNode }) {
    const [state, setState] = useState<'checking' | 'in' | 'out'>('checking');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const errorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        adminMe()
            .then(() => setState('in'))
            .catch(() => setState('out'));
    }, []);

    useEffect(() => {
        if (error) errorRef.current?.focus();
    }, [error]);

    async function submit(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await adminLogin(password);
            setState('in');
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Không kết nối được máy chủ');
        } finally {
            setBusy(false);
        }
    }

    if (state === 'checking') {
        return (
            <Center axis="both" style={{ minHeight: '100dvh' }}>
                <Spinner label="Đang kiểm tra phiên…" />
            </Center>
        );
    }
    if (state === 'in') return <>{children}</>;

    return (
        <Center axis="both" padding={6} style={{ minHeight: '100dvh' }}>
            <VStack gap={4} width="100%" style={{ maxWidth: 400 }}>
                <Card padding={8} width="100%">
                    <form onSubmit={submit}>
                        <VStack gap={4}>
                            <VStack gap={1}>
                                <Heading level={2}>Admin</Heading>
                                <Text type="supporting" color="secondary">
                                    Đăng nhập để quản lý dữ liệu.
                                </Text>
                            </VStack>

                            <TextInput
                                label="Mật khẩu"
                                type="password"
                                size="lg"
                                value={password}
                                onChange={setPassword}
                                hasAutoFocus
                            />

                            {error && (
                                <FeedbackError ref={errorRef}>{error}</FeedbackError>
                            )}

                            <Button
                                type="submit"
                                label={busy ? 'Đang vào…' : 'Đăng nhập'}
                                variant="primary"
                                size="lg"
                                isLoading={busy}
                                isDisabled={!password}
                                icon={<Icon icon={LogIn} size="sm" />}
                            />
                        </VStack>
                    </form>
                </Card>
            </VStack>
        </Center>
    );
}
