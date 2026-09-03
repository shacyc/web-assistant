import { forwardRef, type ReactNode } from 'react';
import { Banner } from '@astryxdesign/core/Banner';

/**
 * Bọc Banner lỗi trong một node focus được (tabIndex=-1) để form dài kéo focus về chỗ
 * lỗi sau khi submit hỏng — giữ đúng hành vi của bản shadcn cũ (Alert + errorRef.focus()).
 */
export const FeedbackError = forwardRef<HTMLDivElement, { children: ReactNode }>(function FeedbackError(
    { children },
    ref,
) {
    return (
        <div ref={ref} tabIndex={-1} style={{ outline: 'none' }}>
            <Banner status="error" title={children} container="section" />
        </div>
    );
});

export function FeedbackNotice({ children }: { children: ReactNode }) {
    return <Banner status="success" title={children} container="section" />;
}
