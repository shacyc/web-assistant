import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { CountdownConfigForm } from './CountdownConfigForm';

interface Props {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * Cấu hình countdown ngay trong màn Countdown — cùng form với màn Cấu hình.
 * Dùng Layout/LayoutContent để phần thân cuộn được (form khá cao), không tràn khỏi dialog.
 */
export function CountdownConfigDialog({ isOpen, onOpenChange }: Props) {
    return (
        <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={600}>
            <Layout
                header={<DialogHeader title="Cấu hình gửi countdown" onOpenChange={onOpenChange} />}
                content={
                    <LayoutContent padding={6}>
                        {/* Chỉ mount form khi mở: mỗi lần mở là nạp lại config mới nhất, và
                            không fetch thừa mỗi lần vào màn Countdown. Lưu xong đóng dialog. */}
                        {isOpen && <CountdownConfigForm autoFocus onSaved={() => onOpenChange(false)} />}
                    </LayoutContent>
                }
            />
        </Dialog>
    );
}
