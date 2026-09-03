import { X } from 'lucide-react';
import { HStack } from '@astryxdesign/core/Stack';
import { Heading } from '@astryxdesign/core/Text';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';

interface Props {
    title: string;
    onClose: () => void;
}

// DialogHeader/LayoutHeader của Astryx tự thêm padding riêng (nó vốn để nằm ở slot
// header của <Layout>, sát mép dialog). Lồng nó trong <Dialog padding> làm padding
// chồng đôi và tiêu đề lệch so với các field bên dưới. Ở đây chỉ cần tiêu đề + nút
// đóng, canh đúng mép nội dung — nên tự dựng bằng HStack.
export function DialogTitleBar({ title, onClose }: Props) {
    return (
        <HStack hAlign="between" vAlign="center" gap={3}>
            <Heading level={2}>{title}</Heading>
            <IconButton
                label="Đóng"
                variant="ghost"
                size="sm"
                onClick={onClose}
                icon={<Icon icon={X} size="sm" />}
            />
        </HStack>
    );
}
