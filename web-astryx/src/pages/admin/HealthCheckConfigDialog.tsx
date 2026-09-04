import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { HealthCheckConfigForm } from './HealthCheckConfigForm';

interface Props {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * Cấu hình health-check ngay trong màn Health check — cùng form với màn Cấu hình.
 * Layout/LayoutContent để phần thân cuộn được, không tràn khỏi dialog.
 */
export function HealthCheckConfigDialog({ isOpen, onOpenChange }: Props) {
    return (
        <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={600}>
            <Layout
                header={<DialogHeader title="Cấu hình gửi health-check" onOpenChange={onOpenChange} />}
                content={
                    <LayoutContent padding={6}>
                        {/* Chỉ mount form khi mở: mỗi lần mở là nạp lại config mới nhất. */}
                        {isOpen && <HealthCheckConfigForm autoFocus onSaved={() => onOpenChange(false)} />}
                    </LayoutContent>
                }
            />
        </Dialog>
    );
}
