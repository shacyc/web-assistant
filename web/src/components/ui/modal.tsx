import * as React from 'react';
import { IconX } from '@tabler/icons-react';
import { cn } from '@/lib/utils';

interface ModalProps {
    open: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    className?: string;
}

/**
 * Hộp thoại tối giản, không kéo thêm @radix-ui/react-dialog: cả app chỉ cần đóng/mở +
 * Esc + bấm nền để thoát. Không animation theo quy ước dự án.
 *
 * Đủ a11y cho một trang admin nội bộ: role/aria-modal, khoá cuộn nền, kéo focus vào
 * panel khi mở. Không làm focus-trap vòng — nếu sau này có form dài dễ lạc Tab thì thêm.
 */
export function Modal({ open, onClose, title, children, className }: ModalProps) {
    const panelRef = React.useRef<HTMLDivElement>(null);
    const titleId = React.useId();

    React.useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        // Khoá cuộn nền để không "trôi" trang phía sau khi lăn chuột trong modal.
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        // Kéo focus vào panel để Esc/screen reader hoạt động — trừ khi một ô bên trong
        // đã tự lấy focus (autoFocus), lúc đó đừng giật lại.
        if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus();
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
            // Chỉ đóng khi bấm đúng lớp nền. mousedown (không phải click) để kéo-thả chọn
            // text trong modal rồi thả chuột ra ngoài không vô tình đóng.
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                ref={panelRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className={cn(
                    'bg-card text-card-foreground my-8 w-full max-w-lg rounded-xl border p-6 shadow-lg outline-none',
                    className,
                )}
            >
                <div className="mb-4 flex items-start justify-between gap-4">
                    <h2 id={titleId} className="text-lg leading-tight font-semibold">
                        {title}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Đóng"
                        className="text-muted-foreground hover:text-foreground -m-1 shrink-0 cursor-pointer p-1"
                    >
                        <IconX className="size-5" stroke={2} />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}
