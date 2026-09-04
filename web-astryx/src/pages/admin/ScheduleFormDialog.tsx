import { useEffect, useState, type FormEvent } from 'react';
import { Save, X } from 'lucide-react';
import {
    createSchedule,
    updateSchedule,
    ApiError,
    type Schedule,
    type ScheduleKind,
    type ScheduleInput,
    type ActionMeta,
    type ActionField,
} from '@/lib/apiClient';
import { HStack, VStack } from '@astryxdesign/core/Stack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TimeInput } from '@astryxdesign/core/TimeInput';
import { DateInput } from '@astryxdesign/core/DateInput';
import { Selector } from '@astryxdesign/core/Selector';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { createISOTimeString } from '@astryxdesign/core/utils';
import type { ISODateString } from '@astryxdesign/core/utils';
import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@astryxdesign/core/Icon';
import { Dialog } from '@astryxdesign/core/Dialog';
import { FeedbackError } from '@/components/Feedback';
import { DialogTitleBar } from '@/components/DialogTitleBar';

interface Props {
    isOpen: boolean;
    editing: Schedule | null;
    actions: ActionMeta[];
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}

const KIND_OPTIONS: { value: ScheduleKind; label: string }[] = [
    { value: 'daily', label: 'Hằng ngày' },
    { value: 'weekly', label: 'Hằng tuần' },
    { value: 'monthly', label: 'Hằng tháng' },
    { value: 'interval', label: 'Mỗi N ngày' },
    { value: 'every', label: 'Mỗi khoảng thời gian' },
    { value: 'cron', label: 'Biểu thức cron' },
];

// Kiểu không dùng "giờ trong ngày".
const NO_TIME_OF_DAY: ScheduleKind[] = ['cron', 'every'];

function splitSeconds(total: number): { h: string; m: string; s: string } {
    return {
        h: String(Math.floor(total / 3600)),
        m: String(Math.floor((total % 3600) / 60)),
        s: String(total % 60),
    };
}

// 1 = Thứ Hai … 7 = Chủ Nhật (ISO).
const WEEKDAYS: [number, string][] = [
    [1, 'T2'],
    [2, 'T3'],
    [3, 'T4'],
    [4, 'T5'],
    [5, 'T6'],
    [6, 'T7'],
    [7, 'CN'],
];

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const asISODate = (s: string): ISODateString | undefined => (s ? (s as ISODateString) : undefined);
const todayVN = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

function defaultsFor(action: ActionMeta | undefined): Record<string, unknown> {
    if (!action) return {};
    return Object.fromEntries(
        action.fields.map((f) => [f.name, f.default ?? (f.type === 'boolean' ? false : '')]),
    );
}

function parsePayload(raw: string): Record<string, unknown> {
    try {
        const v: unknown = JSON.parse(raw);
        return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}

export function ScheduleFormDialog({ isOpen, editing, actions, onOpenChange, onSaved }: Props) {
    const [actionId, setActionId] = useState('');
    const [values, setValues] = useState<Record<string, unknown>>({});
    const [enabled, setEnabled] = useState(true);

    const [kind, setKind] = useState<ScheduleKind>('daily');
    const [timeOfDay, setTimeOfDay] = useState(''); // 'HH:MM'
    const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
    const [dayOfMonth, setDayOfMonth] = useState('1');
    const [intervalDays, setIntervalDays] = useState('2');
    const [anchorDate, setAnchorDate] = useState('');
    const [cron, setCron] = useState('');
    const [everyH, setEveryH] = useState('0');
    const [everyM, setEveryM] = useState('30');
    const [everyS, setEveryS] = useState('0');

    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const selected = actions.find((a) => a.id === actionId);

    useEffect(() => {
        if (!isOpen) return;
        if (editing) {
            setActionId(editing.actionId);
            setEnabled(editing.enabled);
            setValues({ ...defaultsFor(actions.find((a) => a.id === editing.actionId)), ...parsePayload(editing.payload) });
            setKind(editing.kind);
            setTimeOfDay(NO_TIME_OF_DAY.includes(editing.kind) ? '' : editing.timeOfDay);
            setDaysOfWeek((editing.daysOfWeek ?? '').split(',').filter(Boolean).map(Number));
            setDayOfMonth(String(editing.dayOfMonth ?? '1'));
            setIntervalDays(String(editing.intervalDays ?? '2'));
            setAnchorDate(editing.anchorDate ?? todayVN());
            setCron(editing.cron ?? '');
            const e = splitSeconds(editing.intervalSeconds ?? 1800);
            setEveryH(e.h);
            setEveryM(e.m);
            setEveryS(e.s);
        } else {
            const first = actions[0];
            setActionId(first?.id ?? '');
            setEnabled(true);
            setValues(defaultsFor(first));
            setKind('daily');
            setTimeOfDay('');
            setDaysOfWeek([]);
            setDayOfMonth('1');
            setIntervalDays('2');
            setAnchorDate(todayVN());
            setCron('');
            setEveryH('0');
            setEveryM('30');
            setEveryS('0');
        }
        setError(null);
        setBusy(false);
    }, [isOpen, editing, actions]);

    function pickAction(id: string) {
        setActionId(id);
        if (!editing || editing.actionId !== id) setValues(defaultsFor(actions.find((a) => a.id === id)));
    }

    function setField(f: ActionField, raw: unknown) {
        setValues((v) => ({ ...v, [f.name]: raw }));
    }

    function toggleDay(n: number, on: boolean) {
        setDaysOfWeek((ds) => (on ? [...ds, n] : ds.filter((d) => d !== n)).sort((a, b) => a - b));
    }

    /** Ghép ScheduleInput theo kind, kèm kiểm sơ bộ. Trả null + set error nếu thiếu. */
    function build(): ScheduleInput | null {
        if (!actionId) {
            setError('Chọn việc cần chạy');
            return null;
        }
        const payload = Object.fromEntries(
            (selected?.fields ?? []).map((f) => [
                f.name,
                f.type === 'number' ? Number(values[f.name]) : values[f.name],
            ]),
        );
        const base = { actionId, kind, payload, enabled };

        if (kind === 'cron') {
            if (!cron.trim()) {
                setError('Nhập biểu thức cron');
                return null;
            }
            return { ...base, cron: cron.trim() };
        }

        if (kind === 'every') {
            const secs = Number(everyH) * 3600 + Number(everyM) * 60 + Number(everyS);
            if (!Number.isInteger(secs) || secs < 60) {
                setError('Khoảng thời gian phải ít nhất 1 phút');
                return null;
            }
            if (secs > 7 * 24 * 3600) {
                setError('Khoảng thời gian tối đa 7 ngày');
                return null;
            }
            return { ...base, intervalSeconds: secs };
        }

        const time = timeOfDay.slice(0, 5);
        if (!HHMM_RE.test(time)) {
            setError('Chọn giờ chạy (HH:MM)');
            return null;
        }
        const input: ScheduleInput = { ...base, timeOfDay: time };

        if (kind === 'weekly') {
            if (daysOfWeek.length === 0) {
                setError('Chọn ít nhất một thứ trong tuần');
                return null;
            }
            input.daysOfWeek = daysOfWeek;
        } else if (kind === 'monthly') {
            const d = Number(dayOfMonth);
            if (!Number.isInteger(d) || d < 1 || d > 31) {
                setError('Ngày trong tháng phải từ 1 đến 31');
                return null;
            }
            input.dayOfMonth = d;
        } else if (kind === 'interval') {
            const n = Number(intervalDays);
            if (!Number.isInteger(n) || n < 1) {
                setError('Số ngày lặp phải là số nguyên ≥ 1');
                return null;
            }
            if (!anchorDate) {
                setError('Chọn ngày bắt đầu tính');
                return null;
            }
            input.intervalDays = n;
            input.anchorDate = anchorDate;
        }
        return input;
    }

    async function submit(e: FormEvent) {
        e.preventDefault();
        const input = build();
        if (!input) return;

        setBusy(true);
        setError(null);
        try {
            if (editing) await updateSchedule(editing.id, input);
            else await createSchedule(input);
            onSaved();
            onOpenChange(false);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Lưu thất bại');
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={520} padding={6}>
            <form onSubmit={submit}>
                <VStack gap={5}>
                    <DialogTitleBar
                        title={editing ? 'Sửa lịch' : 'Lịch mới'}
                        onClose={() => onOpenChange(false)}
                    />

                    <Selector
                        label="Việc cần chạy"
                        placeholder="— chọn việc —"
                        options={actions.map((a) => ({ value: a.id, label: a.label }))}
                        value={actionId}
                        onChange={(v) => pickAction(v ?? '')}
                    />
                    {selected && (
                        <Text type="supporting" color="secondary">
                            {selected.description}
                        </Text>
                    )}

                    <Selector
                        label="Kiểu lặp"
                        options={KIND_OPTIONS}
                        value={kind}
                        onChange={(v) => setKind((v as ScheduleKind) ?? 'daily')}
                    />

                    {!NO_TIME_OF_DAY.includes(kind) && (
                        <TimeInput
                            label="Giờ chạy (giờ VN)"
                            isRequired
                            hourFormat="24h"
                            value={createISOTimeString(timeOfDay) ?? undefined}
                            onChange={(v) => setTimeOfDay((v ?? '').slice(0, 5))}
                        />
                    )}

                    {kind === 'every' && (
                        <VStack gap={1}>
                            <Text type="supporting" weight="medium">
                                Chạy lại sau mỗi
                            </Text>
                            <HStack gap={3}>
                                <TextInput label="Giờ" width={76} value={everyH} onChange={setEveryH} />
                                <TextInput label="Phút" width={76} value={everyM} onChange={setEveryM} />
                                <TextInput label="Giây" width={76} value={everyS} onChange={setEveryS} />
                            </HStack>
                            <Text type="supporting" color="secondary">
                                Đếm từ lần chạy trước. Trigger chạy mỗi 5 phút — khoảng nhỏ hơn 5 phút sẽ thành “mỗi
                                5 phút”, và có sai số tới 5 phút.
                            </Text>
                        </VStack>
                    )}

                    {kind === 'weekly' && (
                        <VStack gap={2}>
                            <Text type="supporting" weight="medium">
                                Chạy vào các thứ
                            </Text>
                            <HStack gap={3} wrap="wrap">
                                {WEEKDAYS.map(([n, label]) => (
                                    <CheckboxInput
                                        key={n}
                                        label={label}
                                        value={daysOfWeek.includes(n)}
                                        onChange={(on) => toggleDay(n, on)}
                                    />
                                ))}
                            </HStack>
                        </VStack>
                    )}

                    {kind === 'monthly' && (
                        <VStack gap={1}>
                            <TextInput
                                label="Ngày trong tháng"
                                isRequired
                                value={dayOfMonth}
                                onChange={setDayOfMonth}
                            />
                            <Text type="supporting" color="secondary">
                                1–31. Tháng ngắn hơn thì chạy vào ngày cuối cùng.
                            </Text>
                        </VStack>
                    )}

                    {kind === 'interval' && (
                        <Grid columns={2} gap={4}>
                            <TextInput
                                label="Lặp lại mỗi (ngày)"
                                isRequired
                                width="100%"
                                value={intervalDays}
                                onChange={setIntervalDays}
                            />
                            <DateInput
                                label="Tính từ ngày"
                                isRequired
                                width="100%"
                                value={asISODate(anchorDate)}
                                onChange={(v) => setAnchorDate(v ?? '')}
                            />
                        </Grid>
                    )}

                    {kind === 'cron' && (
                        <VStack gap={1}>
                            <TextInput
                                label="Biểu thức cron (giờ VN)"
                                isRequired
                                placeholder="*/15 9-17 * * 1-5"
                                value={cron}
                                onChange={setCron}
                            />
                            <Text type="supporting" color="secondary">
                                5 trường: phút giờ ngày tháng thứ (0/7 = Chủ Nhật). VD: <code>30 4 * * 1-5</code> = 4:30
                                các ngày trong tuần. Trigger bắn mỗi 5 phút — dùng bội số 5 cho phút, giá trị khác sẽ
                                bị bỏ lỡ.
                            </Text>
                        </VStack>
                    )}

                    {selected && selected.fields.length > 0 && (
                        <VStack gap={4}>
                            {selected.fields.map((f) =>
                                f.type === 'boolean' ? (
                                    <CheckboxInput
                                        key={f.name}
                                        label={f.label}
                                        description={f.help}
                                        value={Boolean(values[f.name])}
                                        onChange={(checked) => setField(f, checked)}
                                    />
                                ) : (
                                    <TextInput
                                        key={f.name}
                                        label={f.label}
                                        description={f.help}
                                        isRequired={f.required}
                                        value={String(values[f.name] ?? '')}
                                        onChange={(v) => setField(f, v)}
                                    />
                                ),
                            )}
                        </VStack>
                    )}

                    <CheckboxInput
                        label="Đang bật"
                        description="Tắt để tạm dừng job này mà không xoá."
                        value={enabled}
                        onChange={setEnabled}
                    />

                    {error && <FeedbackError>{error}</FeedbackError>}

                    <HStack gap={2}>
                        <Button
                            type="submit"
                            label={busy ? 'Đang lưu…' : 'Lưu'}
                            variant="primary"
                            isLoading={busy}
                            icon={<Icon icon={Save} size="sm" />}
                        />
                        <Button
                            type="button"
                            label="Huỷ"
                            variant="secondary"
                            onClick={() => onOpenChange(false)}
                            icon={<Icon icon={X} size="sm" />}
                        />
                    </HStack>
                </VStack>
            </form>
        </Dialog>
    );
}
