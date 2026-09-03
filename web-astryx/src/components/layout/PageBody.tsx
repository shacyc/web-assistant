import type { ReactNode } from 'react';
import { VStack } from '@astryxdesign/core/Stack';

// Khung thân chung cho mọi màn admin: cột dọc, canh giữa, bề ngang có trần. AppShell lo
// nav; trang con chỉ lo nội dung của mình.
export function PageBody({ children, width = 880 }: { children: ReactNode; width?: number }) {
    return (
        <VStack gap={6} padding={6} width="100%" maxWidth={width} style={{ marginInline: 'auto' }}>
            {children}
        </VStack>
    );
}
