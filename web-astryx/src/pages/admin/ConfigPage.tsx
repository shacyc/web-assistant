import { Card } from '@astryxdesign/core/Card';
import { VStack } from '@astryxdesign/core/Stack';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { PageBody } from '@/components/layout/PageBody';
import { CountdownConfigForm } from './CountdownConfigForm';

export function ConfigPage() {
    return (
        <PageBody width={640}>
            <VStack gap={1}>
                <Heading level={1}>Cấu hình</Heading>
                <Text type="supporting" color="secondary">
                    Chọn key trong <Link href="/admin/variables">Variables</Link> để mỗi tính năng lấy cấu hình.
                </Text>
            </VStack>

            <Card padding={8}>
                <VStack gap={5}>
                    <Heading level={2}>Countdown</Heading>
                    <CountdownConfigForm />
                </VStack>
            </Card>
        </PageBody>
    );
}
