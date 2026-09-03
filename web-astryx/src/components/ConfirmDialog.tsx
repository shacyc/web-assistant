import type { ReactNode } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Dialog } from '@astryxdesign/core/Dialog';
import { DialogTitleBar } from './DialogTitleBar';

interface Props {
    isOpen: boolean;
    title: string;
    message: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    // 'destructive' cho các hành động xoá; 'primary' cho phần còn lại.
    tone?: 'primary' | 'destructive';
    isBusy?: boolean;
    onConfirm: () => void;
    onOpenChange: (open: boolean) => void;
}

// `window.confirm()` bị nuốt trong nhiều môi trường (webview, iframe sandbox không có
// allow-modals) — trả về false ngay, không hiện gì, nên nút "xoá" trông như chết. Dùng
// dialog thật của Astryx thay cho confirm() ở mọi chỗ cần xác nhận.
export function ConfirmDialog({
    isOpen,
    title,
    message,
    confirmLabel = 'Xác nhận',
    cancelLabel = 'Huỷ',
    tone = 'primary',
    isBusy = false,
    onConfirm,
    onOpenChange,
}: Props) {
    return (
        <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="required" width={420} padding={6}>
            <VStack gap={5}>
                <DialogTitleBar title={title} onClose={() => onOpenChange(false)} />
                <Text type="body" color="secondary">
                    {message}
                </Text>
                <HStack gap={2}>
                    <Button label={confirmLabel} variant={tone} isLoading={isBusy} onClick={onConfirm} />
                    <Button
                        label={cancelLabel}
                        variant="secondary"
                        isDisabled={isBusy}
                        onClick={() => onOpenChange(false)}
                    />
                </HStack>
            </VStack>
        </Dialog>
    );
}
