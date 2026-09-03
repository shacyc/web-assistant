import { useEffect, useRef, useState, type FormEvent } from 'react';
import { IconDeviceFloppy, IconTrash, IconPencil, IconX, IconPlus, IconDownload, IconUpload } from '@tabler/icons-react';
import {
    listVariables,
    putVariable,
    deleteVariable,
    importVariables,
    ApiError,
    type Variable,
    type ImportMode,
} from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Modal } from '@/components/ui/modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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

    // Modal thêm/sửa. editingKey != null → ô key khoá lại, Lưu ghi vào đúng key đó.
    const [formOpen, setFormOpen] = useState(false);
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [keyInput, setKeyInput] = useState('');
    const [valueInput, setValueInput] = useState('');
    const [busy, setBusy] = useState(false);

    // Modal import (export tải thẳng, không cần chọn gì).
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

    async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
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

    return (
        <div className="mx-auto max-w-4xl px-4 py-8">
            <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold">Variables</h1>
                    <p className="text-muted-foreground text-sm">Kho key-value dùng chung.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={exportJson}
                        disabled={!rows || rows.length === 0}
                    >
                        <IconDownload stroke={2} />
                        Export
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                        <IconUpload stroke={2} />
                        Import
                    </Button>
                    <Button size="sm" onClick={openCreate}>
                        <IconPlus stroke={2} />
                        Thêm key
                    </Button>
                </div>
            </header>

            {error && !formOpen && !importOpen && (
                <Alert variant="destructive" className="mb-4">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            {notice && (
                <Alert className="mb-4">
                    <AlertDescription>{notice}</AlertDescription>
                </Alert>
            )}

            {rows === null && (
                <p role="status" className="text-muted-foreground text-sm">
                    Đang tải…
                </p>
            )}
            {rows?.length === 0 && <p className="text-muted-foreground text-sm">Chưa có key nào.</p>}

            {rows && rows.length > 0 && (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Key</TableHead>
                            <TableHead>Value</TableHead>
                            <TableHead>
                                <span className="sr-only">Hành động</span>
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((row) => (
                            <TableRow key={row.key}>
                                <TableCell className="font-medium break-all">{row.key}</TableCell>
                                <TableCell className="text-muted-foreground max-w-xs break-all font-mono text-xs">
                                    {row.value || <span className="italic">(rỗng)</span>}
                                </TableCell>
                                <TableCell className="text-right whitespace-nowrap">
                                    <div className="flex items-center justify-end gap-1">
                                        <Button variant="ghost" size="sm" className="h-9" onClick={() => openEdit(row)}>
                                            <IconPencil stroke={2} />
                                            Sửa
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => remove(row)}
                                            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9"
                                        >
                                            <IconTrash stroke={2} />
                                            Xoá
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}

            {/* ---------- Modal thêm / sửa ---------- */}
            <Modal
                open={formOpen}
                onClose={() => setFormOpen(false)}
                title={editingKey ? `Sửa "${editingKey}"` : 'Thêm key'}
            >
                <form onSubmit={submitForm} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="var-key">Key</Label>
                        <Input
                            id="var-key"
                            name="key"
                            value={keyInput}
                            onChange={(e) => setKeyInput(e.target.value)}
                            readOnly={editingKey !== null}
                            aria-readonly={editingKey !== null}
                            className={editingKey !== null ? 'text-muted-foreground' : undefined}
                            maxLength={200}
                            required
                            autoFocus={editingKey === null}
                            placeholder="secretary telegram chat id"
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="var-value">Value</Label>
                        <Input
                            id="var-value"
                            name="value"
                            value={valueInput}
                            onChange={(e) => setValueInput(e.target.value)}
                            maxLength={4096}
                            autoFocus={editingKey !== null}
                            placeholder="-1004353153138"
                        />
                    </div>

                    {error && (
                        <Alert variant="destructive">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    <div className="border-border mt-1 flex gap-2 border-t pt-4">
                        <Button type="submit" disabled={busy}>
                            <IconDeviceFloppy stroke={2} />
                            {busy ? 'Đang lưu…' : 'Lưu'}
                        </Button>
                        <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                            <IconX stroke={2} />
                            Huỷ
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* ---------- Modal import ---------- */}
            <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Import từ file JSON">
                <div className="flex flex-col gap-5">
                    <div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="imp-merge" className="cursor-pointer font-normal">
                                <input
                                    id="imp-merge"
                                    type="radio"
                                    name="importMode"
                                    className="accent-primary size-4 cursor-pointer"
                                    checked={importMode === 'merge'}
                                    onChange={() => setImportMode('merge')}
                                />
                                <span>
                                    Gộp{' '}
                                    <span className="text-muted-foreground">— thêm/ghi đè key trong file, giữ key khác</span>
                                </span>
                            </Label>
                            <Label htmlFor="imp-replace" className="cursor-pointer font-normal">
                                <input
                                    id="imp-replace"
                                    type="radio"
                                    name="importMode"
                                    className="accent-primary size-4 cursor-pointer"
                                    checked={importMode === 'replace'}
                                    onChange={() => setImportMode('replace')}
                                />
                                <span>
                                    Thay toàn bộ{' '}
                                    <span className="text-muted-foreground">— xoá sạch rồi nạp lại đúng nội dung file</span>
                                </span>
                            </Label>
                        </div>
                        <input
                            ref={fileRef}
                            type="file"
                            accept="application/json,.json"
                            className="hidden"
                            onChange={onImportFile}
                        />
                        <Button
                            type="button"
                            variant="outline"
                            className="mt-3"
                            disabled={busy}
                            onClick={() => fileRef.current?.click()}
                        >
                            <IconUpload stroke={2} />
                            Chọn file và import
                        </Button>
                    </div>

                    {error && (
                        <Alert variant="destructive">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                </div>
            </Modal>
        </div>
    );
}
