import { useState } from 'react';
import { botToken } from '@/lib/apiClient';
import { BotGatePage } from './BotGatePage';
import { BotConsolePage } from './BotConsolePage';
import './bot.css';

export function BotPage() {
    const [unlocked, setUnlocked] = useState(() => Boolean(botToken.get()));
    return unlocked ? (
        <BotConsolePage onLocked={() => setUnlocked(false)} />
    ) : (
        <BotGatePage onUnlocked={() => setUnlocked(true)} />
    );
}
