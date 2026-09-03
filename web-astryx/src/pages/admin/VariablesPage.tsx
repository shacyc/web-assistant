import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Plus, Pencil, Trash2, Save, X, Download, Upload } from 'lucide-react';
import {
    listVariables,
    putVariable,
    deleteVariable,
    importVariables,
    ApiError,
    type Variable,
    type ImportMode,
} from '@/lib/apiClient';
import { HStack, VStack } from '@astryxdesign/core/Stack';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@astryxdesign/core/Icon';
import { Spinner } from '@astryxdesign/core/Spinner';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Dialog } from '@astryxdesign/core/Dialog';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Table, proportional, pixel } from '@astryxdesign/core/Table';
import type { TableColumn } from '@astryxdesign/core/Table';
import { PageBody } from '@/components/layout/PageBody';
import { FeedbackError, FeedbackNotice } from '@/components/Feedback';
import { DialogTitleBar } from '@/components/DialogTitleBar';

// Table<T> đòi `T extends Record<string, unknown>` — bọc lại thay vì đụng apiClient.ts.
interface VariableRow extends Variable {
    [key: string]: unknown;
}

/** File export: object phẳng { key: value } cho người đọc và sửa tay được. */
function toExportObject(rows: Variable[]): Record<string, string> {
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** Chấp nhận đúng shape { [key: string]: string } — số/bool/null trong file là từ chối. */
function parseImportFile(text: string): Record<string, string> {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('File phải là object JSON { "key": "value" }');
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
        if (typeof v !== 'string') throw new Error(`Giá trị của "${k}" phải là chuỗi`);
        out[k] = v;
    }
    return out;
}

export function VariablesPage() {
    const [rows, setRows] = useState<Variable[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    // Dialog thêm/sửa. editingKey != null → ô key khoá lại, Lưu ghi vào đúng key đó.
    const [formOpen, setFormOpen] = useState(false);
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [keyInput, setKeyInput] = useState('');
    const [valueInput, setValueInput] = useState('');
    const [busy, setBusy] = useState(false);

    // Dialog import (export tải thẳng, không cần chọn gì).
    const [importOpen, setImportOpen] = useState(false);
    const [importMode, setImportMode] = useState<ImportMode>('merge');
    const fileRef = useRef<HTMLInputElement>(null);

    function reload() {
        listVariables()
            .then(({ variables }) => setRows(variables))
            .catch((err) => setError(err instanceof ApiError ? err.message : 'Không tải được dữ liệu'));
    }

    useEffect(reload, []);

    function openCreate() {
        setEditingKey(null);
        setKeyInput('');
        setValueInput('');
        setError(null);
        setNotice(null);
        setFormOpen(true);
    }

    function openEdit(row: Variable) {
        setEditingKey(row.key);
        setKeyInput(row.key);
        setValueInput(row.value);
        setError(null);
        setNotice(null);
        setFormOpen(true);
    }

    async function submitForm(e: FormEvent) {
        e.preventDefault();
        const key = keyInput.trim();
        if (!key) {
            setError('Nhập key');
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await putVariable(key, valueInput);
            setNotice(editingKey ? `Đã lưu "${key}"` : `Đã thêm "${key}"`);
            setFormOpen(false);
            reload();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Lưu thất bại');
        } finally {
            setBusy(false);
        }
    }

    async function remove(row: Variable) {
        if (!confirm(`Xoá key "${row.key}"?`)) return;
        setError(null);
        setNotice(null);
        try {
            await deleteVariable(row.key);
            reload();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Xoá thất bại');
        }
    }

    function exportJson() {
        if (!rows) return;
        const blob = new Blob([JSON.stringify(toExportObject(rows), null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'variables.json';
        a.click();
        URL.revokeObjectURL(url);
        setError(null);
        setNotice(`Đã export ${rows.length} dòng ra variables.json`);
    }

    async function onImportFile(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = ''; // cho phép chọn lại cùng file lần nữa
        if (!file) return;

        setError(null);
        setNotice(null);
        let data: Record<string, string>;
        try {
            data = parseImportFile(await file.text());
        } catch (err) {
            setError(err instanceof Error ? err.message : 'File không hợp lệ');
            return;
        }

        const n = Object.keys(data).length;
        const question =
            importMode === 'replace'
                ? `Import kiểu THAY TOÀN BỘ: xoá sạch ${rows?.length ?? 0} dòng hiện có rồi nạp ${n} dòng từ file. Tiếp tục?`
                : `Import kiểu GỘP: thêm/ghi đè ${n} dòng từ file, giữ nguyên các key khác. Tiếp tục?`;
        if (!confirm(question)) return;

        setBusy(true);
        try {
            const res = await importVariables(importMode, data);
            setNotice(`Import xong (${res.mode}): ${res.count} dòng`);
            setImportOpen(false);
            reload();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Import thất bại');
        } finally {
            setBusy(false);
        }
    }

    const columns: TableColumn<VariableRow>[] = [
        {
            key: 'key',
            header: 'Key',
            width: proportional(2),
            renderCell: (row) => (
                <Text type="body" weight="medium" wordBreak="break-all">
                    {row.key}
                </Text>
            ),
        },
        {
            key: 'value',
            header: 'Value',
            width: proportional(3),
            renderCell: (row) =>
                row.value ? (
                    <Text type="code" size="sm" color="secondary" wordBreak="break-all">
                        {row.value}
                    </Text>
                ) : (
                    <Text type="supporting" color="placeholder">
                        (rỗng)
                    </Text>
                ),
        },
        {
            key: 'actions',
            header: '',
            width: pixel(170),
            align: 'end',
            renderCell: (row) => (
                <HStack gap={1} hAlign="end">
                    <Button
                        label="Sửa"
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(row)}
                        icon={<Icon icon={Pencil} size="sm" />}
                    />
                    <Button
                        label="Xoá"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(row)}
                        icon={<Icon icon={Trash2} size="sm" color="error" />}
                    />
                </HStack>
            ),
        },
    ];

    return (
        <PageBody>
            <HStack gap={3} vAlign="start" hAlign="between" wrap="wrap">
                <VStack gap={0}>
                    <Heading level={1}>Variables</Heading>
                    <Text type="supporting" color="secondary">
                        Kho key-value dùng chung.
                    </Text>
                </VStack>
                <HStack gap={2} wrap="wrap">
                    <Button
                        label="Export"
                        variant="secondary"
                        size="sm"
                        onClick={exportJson}
                        isDisabled={!rows || rows.length === 0}
                        icon={<Icon icon={Download} size="sm" />}
                    />
                    <Button
                        label="Import"
                        variant="secondary"
                        size="sm"
                        onClick={() => setImportOpen(true)}
                        icon={<Icon icon={Upload} size="sm" />}
                    />
                    <Button
                        label="Thêm key"
                        variant="primary"
                        size="sm"
                        onClick={openCreate}
                        icon={<Icon icon={Plus} size="sm" />}
                    />
                </HStack>
            </HStack>

            {error && !formOpen && !importOpen && <FeedbackError>{error}</FeedbackError>}
            {notice && <FeedbackNotice>{notice}</FeedbackNotice>}

            {rows === null && <Spinner label="Đang tải…" />}
            {rows?.length === 0 && <EmptyState title="Chưa có key nào" />}

            {rows && rows.length > 0 && (
                <Table<VariableRow>
                    data={rows as VariableRow[]}
                    columns={columns}
                    idKey="key"
                    density="balanced"
                    dividers="rows"
                    hasHover
                />
            )}

            {/* ---------- Dialog thêm / sửa ---------- */}
            <Dialog isOpen={formOpen} onOpenChange={setFormOpen} purpose="form" width={480} padding={6}>
                <form onSubmit={submitForm}>
                    <VStack gap={4}>
                        <DialogTitleBar
                            title={editingKey ? `Sửa "${editingKey}"` : 'Thêm key'}
                            onClose={() => setFormOpen(false)}
                        />

                        <TextInput
                            label="Key"
                            value={keyInput}
                            onChange={setKeyInput}
                            isReadOnly={editingKey !== null}
                            placeholder="secretary telegram chat id"
                            hasAutoFocus={editingKey === null}
                        />
                        <TextInput
                            label="Value"
                            value={valueInput}
                            onChange={setValueInput}
                            placeholder="-1004353153138"
                            hasAutoFocus={editingKey !== null}
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
                                onClick={() => setFormOpen(false)}
                                icon={<Icon icon={X} size="sm" />}
                            />
                        </HStack>
                    </VStack>
                </form>
            </Dialog>

            {/* ---------- Dialog import ---------- */}
            <Dialog isOpen={importOpen} onOpenChange={setImportOpen} purpose="form" width={520} padding={6}>
                <VStack gap={5}>
                    <DialogTitleBar title="Import từ file JSON" onClose={() => setImportOpen(false)} />

                    <RadioList
                        label="Kiểu import"
                        value={importMode}
                        onChange={(v) => setImportMode(v as ImportMode)}
                    >
                        <RadioListItem
                            value="merge"
                            label="Gộp"
                            description="Thêm/ghi đè key trong file, giữ key khác."
                        />
                        <RadioListItem
                            value="replace"
                            label="Thay toàn bộ"
                            description="Xoá sạch rồi nạp lại đúng nội dung file."
                        />
                    </RadioList>

                    <input
                        ref={fileRef}
                        type="file"
                        accept="application/json,.json"
                        style={{ display: 'none' }}
                        onChange={onImportFile}
                    />
                    <Button
                        type="button"
                        label="Chọn file và import"
                        variant="secondary"
                        isDisabled={busy}
                        onClick={() => fileRef.current?.click()}
                        icon={<Icon icon={Upload} size="sm" />}
                    />

                    {error && <FeedbackError>{error}</FeedbackError>}
                </VStack>
            </Dialog>
        </PageBody>
    );
}
